"""services/keras_xray_service.py — CNN-based dental X-ray classification.

Classifies X-ray images (panoramic / periapical / bitewing) into 3 categories
using the fine-tuned CNN Keras model (best_xray_3class.keras).

Class labels in training index order:
  0 → caries           (merged: interproximal_cavity + deep_caries)
  1 → impacted_tooth
  2 → periapical_lesion

Training distribution:
  caries 2,621 | impacted_tooth 552 | periapical_lesion 260 (train)

Input:  224 × 224 RGB, rescaled to [0, 1].
Output: top class + confidence + all 3 class probabilities + multi-finding list.

X-ray routing (which scan types use this service) is controlled by XRAY_SCAN_TYPES.
"""
import io
import logging

import numpy as np
from pathlib import Path
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Scan types that should use the X-ray CNN model
XRAY_SCAN_TYPES = {"panoramic", "periapical", "bitewing", "xray", "x-ray"}

# Class names in training index order (must match training label order)
CLASS_NAMES = ["caries", "impacted_tooth", "periapical_lesion"]

# Human-readable display names used in findings / UI
CLASS_DISPLAY_NAMES: dict[str, str] = {
    "caries":            "Dental Caries",
    "impacted_tooth":    "Impacted Tooth",
    "periapical_lesion": "Periapical Lesion",
}

# Classes above this threshold are included as secondary findings alongside the top class
SECONDARY_THRESHOLD = 0.25

_keras_xray_model = None  # singleton — loaded once per process


def _get_model():
    """Load the CNN X-ray classification model (best_xray_3class.keras)."""
    global _keras_xray_model
    if _keras_xray_model is None:
        import tensorflow as tf

        model_path = getattr(settings, "KERAS_XRAY_MODEL_PATH", "") or ""
        if not model_path:
            # Check /app/ first (Docker deployment)
            if Path("/app/best_xray_3class.keras").exists():
                model_path = "/app/best_xray_3class.keras"
            else:
                # Local dev: walk up Backend/app/services/ → Backend/
                model_path = str(
                    Path(__file__).parent.parent.parent
                    / "best_xray_3class.keras"
                )
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Keras X-ray model not found at: {model_path}")
        _keras_xray_model = tf.keras.models.load_model(model_path)
        logger.info(f"CNN X-ray model (3-class) loaded from: {model_path}")
    return _keras_xray_model


def run_keras_xray_classification(image_bytes: bytes) -> dict:
    """
    Run CNN inference on raw X-ray image bytes.

    Returns:
        {
            success: bool,
            top_class: str,           # raw label, e.g. "caries"
            top_display: str,         # display label, e.g. "Dental Caries"
            top_confidence: float,
            all_probabilities: {class_name: float, ...},
            findings: [               # top class + any class above SECONDARY_THRESHOLD
                {class: str, display: str, confidence: float},
                ...
            ],
            error: str  (only when success=False)
        }
    """
    try:
        model = _get_model()

        # Resize to 224×224, rescale to [0, 1]
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        arr = np.array(image, dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)

        preds = model.predict(arr, verbose=0)[0]  # shape: (3,)
        top_idx = int(np.argmax(preds))
        top_class = CLASS_NAMES[top_idx]
        top_conf = float(preds[top_idx])

        all_probs = {
            CLASS_NAMES[i]: round(float(preds[i]), 4)
            for i in range(len(CLASS_NAMES))
        }

        # Build findings: top class always included + secondary classes above threshold
        findings: list[dict] = []
        for cls, conf in sorted(all_probs.items(), key=lambda x: x[1], reverse=True):
            if cls == top_class or conf >= SECONDARY_THRESHOLD:
                findings.append({
                    "class":      cls,
                    "display":    CLASS_DISPLAY_NAMES[cls],
                    "confidence": round(conf, 4),
                })

        logger.info(
            f"CNN X-ray classification: {top_class} ({round(top_conf * 100, 1)}%) "
            f"| {len(findings)} finding(s) above threshold"
        )
        return {
            "success":          True,
            "top_class":        top_class,
            "top_display":      CLASS_DISPLAY_NAMES[top_class],
            "top_confidence":   round(top_conf, 4),
            "all_probabilities": all_probs,
            "findings":         findings,
        }

    except FileNotFoundError as e:
        logger.warning(f"Keras X-ray model missing, skipping classification: {e}")
        return {
            "success":          False,
            "top_class":        "caries",
            "top_display":      "Dental Caries",
            "top_confidence":   0.0,
            "all_probabilities": {},
            "findings":         [],
            "error":            str(e),
        }
    except Exception as e:
        logger.error(f"CNN X-ray classification failed: {e}", exc_info=True)
        return {
            "success":          False,
            "top_class":        "caries",
            "top_display":      "Dental Caries",
            "top_confidence":   0.0,
            "all_probabilities": {},
            "findings":         [],
            "error":            str(e),
        }
