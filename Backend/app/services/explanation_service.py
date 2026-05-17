from langchain_google_genai import ChatGoogleGenerativeAI
import os
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

class ExplanationService:
    def __init__(self):
        api_key = os.getenv("gemini")
        if not api_key:
            logger.warning("Gemini API key not found")
            self.llm = None
        else:
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                google_api_key=api_key,
                temperature=0.3,
                convert_system_message_to_human=True
            )
    
    def generate_explanation(self, prediction: str, confidence: float, all_probabilities: dict):
        """Generate AI explanation using Gemini"""
        
        confidence_pct = round(confidence * 100, 1)
        
        sorted_findings = sorted(
            all_probabilities.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:3]
        
        top_findings_text = ", ".join([
            f"{f[0]} ({round(f[1]*100,1)}%)" 
            for f in sorted_findings
        ])
        
        all_probs_text = ", ".join([
            f"{k}: {round(v*100,1)}%" 
            for k, v in all_probabilities.items()
        ])
        
        if confidence > 0.8:
            risk = "high"
            urgency = "See a dentist within a week"
        elif confidence > 0.5:
            risk = "medium"
            urgency = "Schedule a dental appointment soon"
        else:
            risk = "low"
            urgency = "Monitor and discuss at next regular checkup"
        
        if not self.llm:
            return self._get_template_explanation(prediction, confidence_pct, risk, urgency)
        
        try:
            prompt = f"""
You are a dental AI assistant explaining analysis results to a patient.

Analysis Results:
- Primary finding: {prediction} with {confidence_pct}% confidence
- All findings: {all_probs_text}
- Top 3 possibilities: {top_findings_text}

Provide a helpful, empathetic explanation including:
1. What this condition means in simple terms
2. How confident we are and why
3. Recommended next steps (as bullet points)
4. When to see a dentist

Keep it clear and concise.
"""
            
            response = self.llm.invoke(prompt)
            explanation_text = response.content if hasattr(response, 'content') else str(response)
            
            return {
                "condition": prediction,
                "confidence_percentage": confidence_pct,
                "risk_level": risk,
                "urgency": urgency,
                "ai_generated": True,
                "explanation": explanation_text,
                "differential": [
                    {"condition": f[0], "confidence": round(f[1]*100, 1)} 
                    for f in sorted_findings if f[0] != prediction
                ]
            }
        except Exception as e:
            logger.error(f"Gemini error: {e}")
            return self._get_template_explanation(prediction, confidence_pct, risk, urgency)
    
    def _get_template_explanation(self, prediction, confidence_pct, risk, urgency):
        """Fallback template explanations"""
        explanations = {
            "Calculus": {
                "explanation": f"Based on the analysis with {confidence_pct}% confidence, we detected calculus (tartar) on your teeth. This is hardened plaque that can only be removed by professional cleaning.",
                "recommendations": [
                    "Schedule a professional dental cleaning",
                    "Use an electric toothbrush",
                    "Floss daily",
                    "Consider antimicrobial mouthwash"
                ]
            },
            "Caries": {
                "explanation": f"Our AI analysis suggests possible tooth decay (caries) with {confidence_pct}% confidence. This indicates areas where enamel may be demineralizing.",
                "recommendations": [
                    "Visit dentist for examination",
                    "Reduce sugar intake",
                    "Use fluoride toothpaste",
                    "Consider dental filling if confirmed"
                ]
            },
            "Gingivitis": {
                "explanation": f"We detected signs of gum inflammation (gingivitis) with {confidence_pct}% confidence. This is the earliest stage of gum disease and is reversible.",
                "recommendations": [
                    "Professional cleaning recommended",
                    "Improve brushing at gumline",
                    "Floss daily",
                    "Salt water rinses"
                ]
            },
            "Mouth Ulcer": {
                "explanation": f"The analysis shows a mouth ulcer with {confidence_pct}% confidence. These are common and usually heal within 1-2 weeks.",
                "recommendations": [
                    "Avoid spicy/acidic foods",
                    "Use topical oral gel",
                    "Salt water rinses",
                    "See dentist if persists >2 weeks"
                ]
            },
            "Tooth Discoloration": {
                "explanation": f"Tooth discoloration detected with {confidence_pct}% confidence. This can be from surface stains or internal factors.",
                "recommendations": [
                    "Professional cleaning",
                    "Consider whitening options",
                    "Reduce staining foods/drinks",
                    "Good oral hygiene"
                ]
            },
            "Hypodontia": {
                "explanation": f"Our analysis suggests hypodontia (congenitally missing teeth) with {confidence_pct}% confidence.",
                "recommendations": [
                    "Orthodontic consultation",
                    "Discuss replacement options",
                    "Monitor adjacent teeth",
                    "Consider space management"
                ]
            }
        }
        
        base = explanations.get(prediction, explanations["Caries"])
        
        return {
            "condition": prediction,
            "confidence_percentage": confidence_pct,
            "risk_level": risk,
            "urgency": urgency,
            "ai_generated": False,
            "explanation": base["explanation"],
            "recommendations": base["recommendations"],
            "differential": []
        }