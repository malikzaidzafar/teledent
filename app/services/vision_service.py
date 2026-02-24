from transformers import AutoImageProcessor, SiglipForImageClassification
from PIL import Image
import torch
import io
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DentalVisionService:
    def __init__(self):
        self.model_name = "prithivMLmods/tooth-agenesis-siglip2"
        self.class_names = [
            'Calculus', 'Caries', 'Gingivitis', 
            'Mouth Ulcer', 'Tooth Discoloration', 'Hypodontia'
        ]
        
        logger.info("Loading dental AI model...")
        self.processor = AutoImageProcessor.from_pretrained(self.model_name)
        self.model = SiglipForImageClassification.from_pretrained(self.model_name)
        self.model.eval()
        logger.info("Model loaded successfully!")
    
    def analyze(self, image_bytes: bytes):
        start = time.time()
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Prepare for model
        inputs = self.processor(images=image, return_tensors="pt")
        
        # Run inference
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        # Get results
        predicted = torch.argmax(probs, dim=-1).item()
        confidence = probs[0][predicted].item()
        
        # All probabilities
        all_probs = {
            name: float(probs[0][i]) 
            for i, name in enumerate(self.class_names)
        }
        
        return {
            "success": True,
            "top_prediction": {
                "class": self.class_names[predicted],
                "confidence": confidence
            },
            "all_probabilities": all_probs,
            "processing_time_ms": round((time.time() - start) * 1000, 2)
        }