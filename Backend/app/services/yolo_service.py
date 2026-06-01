"""
services/yolo_service.py — YOLOv8 dental condition detection.
Supports two models:
  - Teeth-image model (best.pt): for intraoral photos (caries, calculus, etc.)
  - X-ray model (xray_best.pt): for panoramic/periapical/bitewing X-rays
                                 (interproximal_cavity, deep_caries, periapical_lesion, impacted_tooth)
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

# Colour palette per class label (hex
# ) — teeth-image model
CLASS_COLOURS: dict[str, str] = {
    "Caries":              "#dc2626",
    "Calculus":            "#d97706",
    "Gingivitis":          "#7c3aed",
    "Mouth Ulcer":         "#db2777",
    "Tooth Discoloration": "#0891b2",
    "Hypodontia":          "#059669",
    # X-ray model classes
    "interproximal_cavity": "#dc2626",
    "deep_caries":          "#b91c1c",
    "periapical_lesion":    "#7c3aed",
    "impacted_tooth":       "#0891b2",
}
DEFAULT_COLOUR = "#1d6fec"

# Scan types that should use the X-ray model
XRAY_SCAN_TYPES = {"panoramic", "periapical", "bitewing", "xray", "x-ray"}

_yolo_model = None       # teeth-image model singleton
_xray_yolo_model = None  # x-ray model singleton


def _hex_to_rgb(hex_colour: str) -> tuple[int, int, int]:
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _get_model():
    """Load the teeth-image YOLO model (best.pt)."""
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
        logger.info(f"YOLOv8 teeth-image model loaded from: {model_path}")
    return _yolo_model


def _get_xray_model():
    """Load the X-ray YOLO model (xray_best.pt)."""
    global _xray_yolo_model
    if _xray_yolo_model is None:
        xray_model_path = getattr(settings, "XRAY_YOLO_MODEL_PATH", "") or os.getenv("XRAY_YOLO_MODEL_PATH", "")
        if not xray_model_path:
            # Check /app/xray_best.pt first (Docker deployment)
            if Path("/app/xray_best.pt").exists():
                xray_model_path = "/app/xray_best.pt"
            else:
                # Walk up from Backend/app/services/ → project root → xray_best.pt
                xray_model_path = str(
                    Path(__file__).parent.parent.parent.parent
                    / "xray_best.pt"
                )
        if not Path(xray_model_path).exists():
            raise FileNotFoundError(f"X-ray YOLO model not found at: {xray_model_path}")
        from ultralytics import YOLO
        _xray_yolo_model = YOLO(xray_model_path)
        logger.info(f"YOLOv8 x-ray model loaded from: {xray_model_path}")
    return _xray_yolo_model


def run_detection(image_bytes: bytes, scan_type: str = "") -> dict:
    """
    Run YOLOv8 inference on raw image bytes.

    Args:
        image_bytes: Raw image data.
        scan_type: Scan type string (e.g. 'panoramic', 'periapical', 'bitewing').
                   When the type is an X-ray variant, the dedicated X-ray model is used.

    Returns:
        {
            success: bool,
            detections: [{class, confidence, bbox: {x1,y1,x2,y2,norm_x,norm_y,norm_w,norm_h}}],
            annotated_image_url: str | None,
            detection_count: int,
            model_used: str,
            error: str  (only when success=False)
        }
    """
    is_xray = scan_type.lower().strip() in XRAY_SCAN_TYPES
    try:
        model = _get_xray_model() if is_xray else _get_model()
        model_label = "xray" if is_xray else "teeth-image"
        logger.info(f"Using {'X-ray' if is_xray else 'teeth-image'} YOLO model for scan_type={scan_type!r}")
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

        logger.info(f"YOLO detection complete — {len(detections)} findings (model: {model_label})")
        return {
            "success": True,
            "detections": detections,
            "annotated_image_url": annotated_url,
            "detection_count": len(detections),
            "model_used": model_label,
        }

    except FileNotFoundError as e:
        logger.warning(f"YOLO model missing, skipping detection: {e}")
        return {
            "success": False,
            "detections": [],
            "annotated_image_url": None,
            "detection_count": 0,
            "model_used": "unknown",
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"YOLO detection failed: {e}", exc_info=True)
        return {
            "success": False,
            "detections": [],
            "annotated_image_url": None,
            "detection_count": 0,
            "model_used": "unknown",
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
