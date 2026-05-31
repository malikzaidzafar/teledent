"""
services/image_preprocessing_service.py — OpenCV-based image preprocessing.

Removes noise and grain from dental scan images before AI analysis.
Applied automatically in the AI pipeline after the image is downloaded
and before it is passed to YOLO / Gemini.

Techniques used (tuned for dental X-rays and intraoral photos):
  1. Non-local Means Denoising  — best quality, removes random noise/grain.
  2. Bilateral Filter           — edge-preserving smoothing for grainy photos.
  3. Gaussian Blur              — lightweight fallback (never used alone here).
  4. CLAHE                      — contrast-limited adaptive histogram equalization
                                  to sharpen low-contrast X-ray details.
"""

import io
import logging
from enum import Enum

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class PreprocessMode(str, Enum):
    """
    fast  — bilateral filter + CLAHE   (low CPU, good for real-time)
    quality — non-local means + CLAHE   (slower, best for X-rays)
    none  — skip denoising entirely
    """
    fast = "fast"
    quality = "quality"
    none = "none"


# ── Default tuning ────────────────────────────────────────────────────────────
DEFAULT_MODE = PreprocessMode.quality

# Non-local Means params
NLM_H = 6           # filter strength (luminance). 6 preserves fine dental detail (root canals, cracks).
NLM_H_COLOR = 6     # filter strength (colour channels).
NLM_TEMPLATE = 7    # template-patch size (must be odd)
NLM_SEARCH = 21     # search-window size (must be odd)

# Bilateral filter params
BILATERAL_D = 9         # neighbourhood diameter
BILATERAL_SIGMA_COLOR = 75
BILATERAL_SIGMA_SPACE = 75

# CLAHE params
CLAHE_CLIP = 2.0        # contrast limit — raise for low-contrast X-rays
CLAHE_TILE = (8, 8)     # tile grid size


# ── Public API ────────────────────────────────────────────────────────────────

def preprocess_image(
    image_bytes: bytes,
    mode: PreprocessMode = DEFAULT_MODE,
) -> bytes:
    """
    Accepts raw image bytes (JPEG / PNG / WEBP …), denoises, and returns
    processed JPEG bytes ready for YOLO / Gemini.

    Parameters
    ----------
    image_bytes : bytes
        Raw bytes of the uploaded image.
    mode : PreprocessMode
        Denoising strategy to use. Defaults to ``quality``.

    Returns
    -------
    bytes
        Processed image encoded as JPEG (quality = 95).
    """
    if mode == PreprocessMode.none:
        return image_bytes

    try:
        # Decode bytes → OpenCV BGR array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            logger.warning("OpenCV could not decode image — returning original bytes.")
            return image_bytes

        # Choose denoising strategy
        if mode == PreprocessMode.quality:
            denoised = _denoise_nlm(img)
        else:  # fast
            denoised = _denoise_bilateral(img)

        # Enhance contrast with CLAHE (applied to luminance channel only)
        enhanced = _apply_clahe(denoised)

        # Encode back to JPEG bytes
        success, buffer = cv2.imencode(
            ".jpg", enhanced, [cv2.IMWRITE_JPEG_QUALITY, 92]
        )
        if not success:
            logger.warning("OpenCV JPEG encode failed — returning original bytes.")
            return image_bytes

        logger.info(
            f"Image preprocessing complete | mode={mode} | "
            f"original={len(image_bytes):,}B → processed={len(buffer.tobytes()):,}B"
        )
        return buffer.tobytes()

    except Exception as exc:
        # Never crash the pipeline — log and pass original bytes through
        logger.error(f"Image preprocessing failed: {exc}", exc_info=True)
        return image_bytes


# ── Private helpers ───────────────────────────────────────────────────────────

def _denoise_nlm(img: np.ndarray) -> np.ndarray:
    """
    Non-local Means denoising — preserves fine dental detail while aggressively
    removing sensor noise and JPEG grain.
    """
    return cv2.fastNlMeansDenoisingColored(
        img,
        None,
        NLM_H,
        NLM_H_COLOR,
        NLM_TEMPLATE,
        NLM_SEARCH,
    )


def _denoise_bilateral(img: np.ndarray) -> np.ndarray:
    """
    Bilateral filter — fast edge-preserving smoother. Good for real-time use.
    """
    return cv2.bilateralFilter(
        img,
        BILATERAL_D,
        BILATERAL_SIGMA_COLOR,
        BILATERAL_SIGMA_SPACE,
    )


def _apply_clahe(img: np.ndarray) -> np.ndarray:
    """
    CLAHE (Contrast Limited Adaptive Histogram Equalization) applied to the
    L channel of LAB colour space so colour saturation is unchanged.
    """
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP, tileGridSize=CLAHE_TILE)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l_eq = clahe.apply(l)
    lab_eq = cv2.merge([l_eq, a, b])
    return cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
