"""
services/yolo_service.py — YOLOv8 dental condition detection using best.pt.
Loads the trained model, runs inference, draws bounding boxes on the image,
uploads the annotated image to Cloudinary, and returns structured detections.
"""
import io
import os
import logging
from pathlib import Path

from PIL import Image, ImageDraw
import cloudinary
import cloudinary.uploader

from app.config import settings

logger = logging.getLogger(__name__)

# Colour palette per class label (hex)
CLASS_COLOURS: dict[str, str] = {
    "Caries":              "#dc2626",
    "Calculus":            "#d97706",
    "Gingivitis":          "#7c3aed",
    "Mouth Ulcer":         "#db2777",
    "Tooth Discoloration": "#0891b2",
    "Hypodontia":          "#059669",
}
DEFAULT_COLOUR = "#1d6fec"

_yolo_model = None  # module-level singleton


def _hex_to_rgb(hex_colour: str) -> tuple[int, int, int]:
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _get_model():
    global _yolo_model
    if _yolo_model is None:
        # Resolve model path: explicit env var > config > auto-discovery
        model_path = settings.YOLO_MODEL_PATH or os.getenv("YOLO_MODEL_PATH", "")
        if not model_path:
            # Check /app/best.pt first (Docker/HF Space deployment)
            if Path("/app/best.pt").exists():
                model_path = "/app/best.pt"
            else:
                # Walk up from this file: Backend/app/services/ → project root → teledent_3class_models/
                model_path = str(
                    Path(__file__).parent.parent.parent.parent
                    / "teledent_3class_models"
                    / "best.pt"
                )
        if not Path(model_path).exists():
            raise FileNotFoundError(f"YOLO model not found at: {model_path}")
        from ultralytics import YOLO
        _yolo_model = YOLO(model_path)
        logger.info(f"YOLOv8 model loaded from: {model_path}")
    return _yolo_model


def run_detection(image_bytes: bytes) -> dict:
    """
    Run YOLOv8 inference on raw image bytes.

    Returns:
        {
            success: bool,
            detections: [{class, confidence, bbox: {x1,y1,x2,y2,norm_x,norm_y,norm_w,norm_h}}],
            annotated_image_url: str | None,
            detection_count: int,
            error: str  (only when success=False)
        }
    """
    try:
        model = _get_model()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        iw, ih = image.size

        results = model(image, verbose=False)
        result = results[0]

        detections: list[dict] = []
        for box in result.boxes:
            cls_idx = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            class_name = (
                model.names[cls_idx] if cls_idx < len(model.names) else f"Class_{cls_idx}"
            )
            detections.append({
                "class": class_name,
                "confidence": round(conf, 4),
                "bbox": {
                    "x1": round(x1), "y1": round(y1),
                    "x2": round(x2), "y2": round(y2),
                    "norm_x": round(x1 / iw, 4),
                    "norm_y": round(y1 / ih, 4),
                    "norm_w": round((x2 - x1) / iw, 4),
                    "norm_h": round((y2 - y1) / ih, 4),
                },
            })

        # ── Draw bounding boxes ────────────────────────────────────────────
        annotated = image.copy()
        draw = ImageDraw.Draw(annotated)

        for det in detections:
            b = det["bbox"]
            colour_hex = CLASS_COLOURS.get(det["class"], DEFAULT_COLOUR)
            colour_rgb = _hex_to_rgb(colour_hex)

            # Box outline (3 px)
            draw.rectangle(
                [b["x1"], b["y1"], b["x2"], b["y2"]],
                outline=colour_rgb,
                width=3,
            )
            # Label background + text
            label = f"{det['class']} {round(det['confidence'] * 100)}%"
            char_w, char_h = 7, 14
            lx = b["x1"]
            ly = max(b["y1"] - char_h - 4, 0)
            label_w = len(label) * char_w + 6
            draw.rectangle([lx, ly, lx + label_w, ly + char_h + 4], fill=colour_rgb)
            draw.text((lx + 3, ly + 2), label, fill=(255, 255, 255))

        # ── Upload annotated image to Cloudinary ──────────────────────────
        buf = io.BytesIO()
        annotated.save(buf, format="JPEG", quality=90)
        annotated_url = _upload_annotated(buf.getvalue())

        logger.info(f"YOLO detection complete — {len(detections)} findings")
        return {
            "success": True,
            "detections": detections,
            "annotated_image_url": annotated_url,
            "detection_count": len(detections),
        }

    except FileNotFoundError as e:
        logger.warning(f"YOLO model missing, skipping detection: {e}")
        return {
            "success": False,
            "detections": [],
            "annotated_image_url": None,
            "detection_count": 0,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"YOLO detection failed: {e}", exc_info=True)
        return {
            "success": False,
            "detections": [],
            "annotated_image_url": None,
            "detection_count": 0,
            "error": str(e),
        }


def _upload_annotated(image_bytes: bytes) -> str | None:
    """Upload the annotated JPEG to Cloudinary and return the secure URL."""
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(image_bytes),
            resource_type="image",
            folder="teledent/scans/annotated",
        )
        return result["secure_url"]
    except Exception as e:
        logger.error(f"Failed to upload annotated image to Cloudinary: {e}")
        return None
