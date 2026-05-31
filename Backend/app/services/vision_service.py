"""
services/vision_service.py — Gemini Vision dental image analysis.
Uses Google Gemini 2.5 Flash to classify dental conditions from images.
"""
import io
import time
import json
import logging
import os
from PIL import Image
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DENTAL_CONDITIONS = [
    "Calculus",
    "Caries",
    "Gingivitis",
    "Mouth Ulcer",
    "Tooth Discoloration",
    "Hypodontia",
]

ANALYSIS_PROMPT = """You are an expert dental AI assistant. Analyze this dental image and classify the conditions present.

Respond with ONLY a valid JSON object — no markdown, no extra text:
{
  "top_condition": "<exact condition name from list below>",
  "confidence": <float 0.0-1.0>,
  "all_probabilities": {
    "Calculus": <float>,
    "Caries": <float>,
    "Gingivitis": <float>,
    "Mouth Ulcer": <float>,
    "Tooth Discoloration": <float>,
    "Hypodontia": <float>
  },
  "image_quality": "<good|fair|poor>",
  "notes": "<one sentence clinical observation>"
}

Condition definitions:
- Calculus: Hardened plaque/tartar deposits visible on teeth surfaces
- Caries: Tooth decay, cavities, dark spots or holes in enamel
- Gingivitis: Red, swollen, bleeding or inflamed gum tissue
- Mouth Ulcer: Open sores or lesions on soft oral tissues
- Tooth Discoloration: Yellowing, brown stains or uneven coloring
- Hypodontia: Congenitally missing permanent teeth

All probabilities must sum to 1.0. Be precise and clinically accurate."""


class DentalVisionService:
    def __init__(self):
        from google import genai
        from google.genai import types as genai_types
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "Gemini API key not found. Add 'GEMINI_API_KEY=your_key' to Backend/.env"
            )
        self.client = genai.Client(api_key=api_key)
        self._types = genai_types
        self.model_name = "gemini-2.5-flash"
        logger.info("Gemini Vision dental model ready.")

    def analyze(self, image_bytes: bytes) -> dict:
        start = time.time()

        # Normalise image to JPEG for Gemini
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        jpeg_bytes = buf.getvalue()

        image_part = self._types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[ANALYSIS_PROMPT, image_part],
                config=self._types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            raw = response.text.strip()
            # Strip accidental markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            result = json.loads(raw)

            all_probs = result.get("all_probabilities", {})
            # Ensure every condition is represented
            for cond in DENTAL_CONDITIONS:
                all_probs.setdefault(cond, 0.0)

            top_condition = result.get(
                "top_condition", max(all_probs, key=all_probs.get)
            )
            confidence = float(result.get("confidence", all_probs.get(top_condition, 0.0)))

            return {
                "success": True,
                "top_prediction": {
                    "class": top_condition,
                    "confidence": confidence,
                },
                "all_probabilities": {k: float(v) for k, v in all_probs.items()},
                "image_quality": result.get("image_quality", "unknown"),
                "notes": result.get("notes", ""),
                "processing_time_ms": round((time.time() - start) * 1000, 2),
            }

        except json.JSONDecodeError as e:
            logger.error(f"Gemini returned non-JSON response: {e}")
            uniform = round(1.0 / len(DENTAL_CONDITIONS), 4)
            return {
                "success": False,
                "top_prediction": {"class": "Caries", "confidence": uniform},
                "all_probabilities": {c: uniform for c in DENTAL_CONDITIONS},
                "image_quality": "poor",
                "notes": "Analysis inconclusive — could not parse model response.",
                "processing_time_ms": round((time.time() - start) * 1000, 2),
            }
        except Exception as e:
            logger.error(f"Gemini Vision analysis error: {e}")
            raise

    def analyze_with_yolo_context(self, image_bytes: bytes, yolo_result: dict) -> dict:
        """
        Run Gemini enrichment using YOLO detections as authoritative grounding.
        Returns enriched clinical data including per-finding explanations,
        patient_summary, overall_risk, and clinical_notes.
        """
        start = time.time()

        # Normalise image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        image_part = self._types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg")

        detections = yolo_result.get("detections", [])

        # Build YOLO context string
        if detections:
            det_lines = "\n".join(
                f"  - {d['class']} (confidence: {round(d['confidence'] * 100, 1)}%)"
                for d in detections
            )
            yolo_context = f"YOLOv8 object-detection model found {len(detections)} dental finding(s):\n{det_lines}"
        else:
            yolo_context = "YOLOv8 object-detection model found NO significant dental findings in this image."

        prompt = f"""You are an expert dental AI assistant. A YOLOv8 model has already analysed the dental image.
Your job is to enrich those findings with clinical context and patient-friendly language.

{yolo_context}

Using the image and the YOLO findings above, respond with ONLY a valid JSON object:
{{
  "overall_risk": "<none|low|moderate|high>",
  "patient_summary": "<2-3 sentence plain-language summary for the patient>",
  "clinical_notes": "<1-2 sentence clinical observation for a dentist>",
  "urgency": "<monitor|schedule_soon|see_dentist_this_week|urgent>",
  "findings_enriched": [
    {{
      "condition": "<condition name matching YOLO>",
      "severity": "<low|moderate|high>",
      "gemini_explanation": "<one sentence plain-language explanation>",
      "recommendation": "<specific actionable recommendation>"
    }}
  ],
  "image_quality": "<good|fair|poor>"
}}

Rules:
- findings_enriched must have one entry per YOLO detection (same order).
- If YOLO found nothing, findings_enriched must be an empty array and overall_risk must be "none".
- Be concise, accurate, and compassionate in patient_summary.
- Do NOT add markdown or extra text outside the JSON."""

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt, image_part],
                config=self._types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            result = json.loads(raw)
            result.setdefault("findings_enriched", [])
            result.setdefault("overall_risk", "none" if not detections else "low")
            result.setdefault("patient_summary", "Analysis complete.")
            result.setdefault("clinical_notes", "")
            result.setdefault("urgency", "monitor")
            result.setdefault("image_quality", "unknown")
            result["processing_time_ms"] = round((time.time() - start) * 1000, 2)
            return {"success": True, **result}

        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Gemini enrichment failed: {e}")
            # Graceful fallback — build from YOLO data alone
            risk_map = {"high": "high", "moderate": "moderate", "low": "low"}
            enriched = []
            for d in detections:
                conf = d["confidence"]
                sev = "high" if conf > 0.7 else "moderate" if conf > 0.4 else "low"
                enriched.append({
                    "condition": d["class"],
                    "severity": sev,
                    "gemini_explanation": f"Detected by AI model with {round(conf * 100)}% confidence.",
                    "recommendation": f"Consult your dentist about {d['class']}.",
                })
            overall = "high" if any(e["severity"] == "high" for e in enriched) else "moderate" if enriched else "none"
            return {
                "success": False,
                "overall_risk": overall,
                "patient_summary": (
                    f"Our AI detected {len(detections)} finding(s) in your scan. Please consult a dentist for a professional evaluation."
                    if detections else "No significant findings were detected in your scan."
                ),
                "clinical_notes": "AI-only analysis; Gemini enrichment unavailable.",
                "urgency": "schedule_soon" if detections else "monitor",
                "findings_enriched": enriched,
                "image_quality": "unknown",
                "processing_time_ms": round((time.time() - start) * 1000, 2),
            }