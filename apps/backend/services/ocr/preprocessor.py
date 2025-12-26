import cv2
import numpy as np
from fastapi import UploadFile

class ImagePreprocessor:
    def __init__(self):
        pass

    async def preprocess(self, file: UploadFile) -> np.ndarray:
        """
        Reads image from upload, applies noise reduction and thresholding.
        Returns: processed image ready for OCR (or generic vision API)
        """
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # 1. Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 2. Noise Reduction (Gaussian Blur)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # 3. Adaptive Thresholding (if needed for Tesseract, less critical for GPT-4V)
        # For GPT-4V, usually sending the clear original/enhanced color image is better.
        # We might just want to sharpen or adjust contrast.
        
        # Simple contrast adjustment (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Convert back to BGR for consistent encoding if needed, or keep grayscale
        enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        
        return enhanced_bgr

    def encode_image(self, img: np.ndarray) -> bytes:
        """Encodes numpy array back to JPEG bytes"""
        _, buffer = cv2.imencode('.jpg', img)
        return buffer.tobytes()
