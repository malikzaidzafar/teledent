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
      "recommendation": "<specific actionable recommendation — see rules below>"
    }}
  ],
  "image_quality": "<good|fair|poor>"
}}

Rules:
- findings_enriched must have one entry per YOLO detection (same order).
- If YOLO found nothing, findings_enriched must be an empty array and overall_risk must be "none".
- Be concise, accurate, and compassionate in patient_summary.
- Do NOT add markdown or extra text outside the JSON.
- RECOMMENDATION RULES (most important): Each recommendation must be specific, practical, and varied across findings.
  * For LOW severity findings: give a home-care tip — e.g. brushing technique, fluoride toothpaste, oil pulling with coconut oil, clove oil application, saltwater rinses, dietary changes (reduce sugar/acidic drinks), or chewing xylitol gum.
  * For MODERATE severity findings: combine a home remedy with a soft nudge to schedule a checkup — e.g. "Apply diluted clove oil to the area for temporary relief and book a dental checkup within 4-6 weeks."
  * For HIGH severity findings: recommend seeing a dentist, but also give one immediate home-care action — e.g. "Avoid cold/sweet foods that trigger pain and see a dentist this week for cavity treatment."
  * NEVER give the same generic "see a dentist" text across all findings. Each recommendation must be uniquely tailored to that specific condition and confidence level.
  * Incorporate well-known natural remedies where appropriate: clove oil (analgesic), saltwater rinse (anti-inflammatory), turmeric paste (antiseptic), neem twigs/paste (antibacterial), oil pulling (plaque), aloe vera gel (gum inflammation).
  * Mention specific brushing or flossing advice when relevant (e.g. soft-bristle brush, Bass technique, interdental brushes).
  * Mention dietary advice when relevant (reduce sugary snacks, limit acidic drinks, increase calcium-rich foods)."""

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
            _fallback_tips = {
                "cavity": {
                    "low": "Rinse with a fluoride mouthwash twice daily and cut back on sugary snacks and drinks to slow early decay.",
                    "moderate": "Apply a small amount of clove oil to the area for temporary relief and schedule a dental appointment within the next few weeks.",
                    "high": "Avoid cold, sweet, or acidic foods that trigger sensitivity and see a dentist this week — the cavity needs prompt treatment.",
                },
                "caries": {
                    "low": "Brush with fluoride toothpaste using a soft-bristle brush twice a day, and add daily flossing to remove plaque between teeth.",
                    "moderate": "Try a saltwater rinse (½ tsp salt in warm water) after meals to reduce bacteria, and book a dental checkup soon.",
                    "high": "Minimise sugar intake and book a dental visit this week; early treatment prevents the decay from spreading to the tooth root.",
                },
                "calculus": {
                    "low": "Try oil pulling with a tablespoon of coconut oil for 10 minutes each morning to reduce plaque buildup.",
                    "moderate": "Use a tartar-control toothpaste and an electric toothbrush, and schedule a professional cleaning within 4–6 weeks.",
                    "high": "Tartar at this level cannot be removed at home — book a professional dental cleaning soon to prevent gum damage.",
                },
                "gingivitis": {
                    "low": "Rinse with a warm saltwater solution twice daily and use the Bass brushing technique along the gumline to reduce inflammation.",
                    "moderate": "Apply diluted aloe vera gel to inflamed gums for relief, and focus on flossing daily — gum disease is reversible at this stage.",
                    "high": "Use an antiseptic chlorhexidine mouthwash and book a dental cleaning; untreated gingivitis can progress to bone loss.",
                },
                "mouth ulcer": {
                    "low": "Dab a little honey or aloe vera gel on the ulcer 2–3 times a day — both have natural healing and antibacterial properties.",
                    "moderate": "Avoid spicy and acidic foods, rinse with saltwater after meals, and use an over-the-counter topical anaesthetic gel for pain relief.",
                    "high": "If the ulcer hasn't healed in 2 weeks or is very painful, see a dentist — it may need prescription treatment.",
                },
                "tooth discoloration": {
                    "low": "Brush with a whitening toothpaste and reduce staining drinks like coffee, tea, and cola — rinse your mouth with water after consuming them.",
                    "moderate": "Try oil pulling with coconut oil daily and consider a professional clean to remove surface stains.",
                    "high": "Surface staining at this level benefits from professional polishing; ask your dentist about safe whitening options during your next visit.",
                },
            }
            enriched = []
            for d in detections:
                conf = d["confidence"]
                sev = "high" if conf > 0.7 else "moderate" if conf > 0.4 else "low"
                cond_key = d["class"].lower().replace(" ", "_")
                tips = _fallback_tips.get(cond_key) or _fallback_tips.get(d["class"].lower())
                if tips:
                    rec = tips.get(sev, tips.get("moderate", f"Maintain good oral hygiene and consult a dentist about {d['class']}."))
                else:
                    rec = (
                        f"Avoid foods that aggravate the area and see a dentist soon about {d['class']}." if sev == "high"
                        else f"Brush and floss regularly, and discuss {d['class']} with your dentist at your next checkup."
                    )
                enriched.append({
                    "condition": d["class"],
                    "severity": sev,
                    "gemini_explanation": f"Detected by AI model with {round(conf * 100)}% confidence.",
                    "recommendation": rec,
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