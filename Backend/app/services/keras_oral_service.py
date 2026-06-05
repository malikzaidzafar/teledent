"""
services/keras_oral_service.py — VGG16-based oral image classification.

Classifies intraoral dental photos into 4 categories using the fine-tuned
VGG16 Keras model (vgg16_final_best.keras, ~98% validation accuracy).

Class labels in training index order:
  0 → cavity
  1 → gingivitis
  2 → discoloration
  3 → ulcer

Input:  224 × 224 RGB image (VGG16 mean-subtraction preprocessing applied).
Output: top class + confidence + all 4 class probabilities.
"""
import io
import logging

import numpy as np
from pathlib import Path
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Class names in training index order (must match the order used during training)
CLASS_NAMES = ["cavity", "gingivitis", "discoloration", "ulcer"]

# Human-readable display names used in findings / UI
CLASS_DISPLAY_NAMES: dict[str, str] = {
    "cavity":        "Cavity",
    "gingivitis":    "Gingivitis",
    "discoloration": "Tooth Discoloration",
    "ulcer":         "Mouth Ulcer",
}

_keras_model = None  # singleton — loaded once per process


def _get_model():
    """Load the VGG16 oral classification model (vgg16_final_best.keras)."""
    global _keras_model
    if _keras_model is None:
        import tensorflow as tf

        model_path = getattr(settings, "KERAS_ORAL_MODEL_PATH", "") or ""
        if not model_path:
            # Check /app/ first (Docker deployment — COPY . . places it there)
            if Path("/app/vgg16_final_best.keras").exists():
                model_path = "/app/vgg16_final_best.keras"
            else:
                # Local dev: walk up Backend/app/services/ → Backend/
                model_path = str(
                    Path(__file__).parent.parent.parent
                    / "vgg16_final_best.keras"
                )
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Keras oral model not found at: {model_path}")
        _keras_model = tf.keras.models.load_model(model_path)
        logger.info(f"VGG16 oral model loaded from: {model_path}")
    return _keras_model


def run_keras_classification(image_bytes: bytes) -> dict:
    """
    Run VGG16 inference on raw image bytes.

    Returns:
        {
            success: bool,
            top_class: str,           # raw label, e.g. "cavity"
            top_display: str,         # display label, e.g. "Cavity"
            top_confidence: float,
            all_probabilities: {class_name: float, ...},
            error: str  (only when success=False)
        }
    """
    try:
        import tensorflow as tf  # noqa: F401 — ensures backend is initialised
        from tensorflow.keras.applications.vgg16 import preprocess_input

        model = _get_model()

        # Resize to 224×224 and apply VGG16 BGR mean-subtraction preprocessing
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        arr = np.array(image, dtype=np.float32)
        arr = np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)
        arr = preprocess_input(arr)

        preds = model.predict(arr, verbose=0)[0]  # shape: (4,)
        top_idx = int(np.argmax(preds))
        top_class = CLASS_NAMES[top_idx]
        top_conf = float(preds[top_idx])

        all_probs = {
            CLASS_NAMES[i]: round(float(preds[i]), 4)
            for i in range(len(CLASS_NAMES))
        }

        logger.info(
            f"VGG16 oral classification: {top_class} ({round(top_conf * 100, 1)}%)"
        )
        return {
            "success": True,
            "top_class": top_class,
            "top_display": CLASS_DISPLAY_NAMES[top_class],
            "top_confidence": round(top_conf, 4),
            "all_probabilities": all_probs,
        }

    except FileNotFoundError as e:
        logger.warning(f"Keras oral model missing, skipping classification: {e}")
        return {
            "success": False,
            "top_class": "cavity",
            "top_display": "Cavity",
            "top_confidence": 0.0,
            "all_probabilities": {},
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"VGG16 oral classification failed: {e}", exc_info=True)
        return {
            "success": False,
            "top_class": "cavity",
            "top_display": "Cavity",
            "top_confidence": 0.0,
            "all_probabilities": {},
            "error": str(e),
        }
