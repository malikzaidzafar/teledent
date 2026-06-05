"""
TC-7   AI Caries Detection           (>85% confidence, CNN X-ray model)
TC-8   AI Periapical Lesion Detection (>80% confidence, CNN X-ray model)
TC-9   AI Healthy Image               (No Conditions)
TC-10  PDF Report Generation
"""
import time
import uuid
import pytest
from unittest.mock import patch
from tests.conftest import register_and_login, auth_headers


# ── shared helper ─────────────────────────────────────────────────────────────

def _create_scan_and_wait(app_client, token: str, poll_max: int = 20) -> dict:
    """
    Upload a scan and poll until the AI pipeline finishes (status != queued/processing).
    Returns the final analysis dict.
    """
    resp = app_client.post(
        "/scans",
        json={
            "cloudinary_public_id": f"teledent/scans/{uuid.uuid4().hex}",
            "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            "scan_type": "panoramic",
            "scan_date": "2026-06-01",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 202, resp.text
    scan_id = resp.json()["scan_id"]

    # Poll analysis status (background task runs synchronously in TestClient)
    for _ in range(poll_max):
        status_resp = app_client.get(f"/scans/{scan_id}/analysis/status", headers=auth_headers(token))
        if status_resp.json().get("status") in ("complete", "failed"):
            break
        time.sleep(0.3)

    analysis_resp = app_client.get(f"/scans/{scan_id}/analysis", headers=auth_headers(token))
    assert analysis_resp.status_code == 200, analysis_resp.text
    return analysis_resp.json()


# ── TC-7: AI Cavity (Caries) Detection ───────────────────────────────────────
class TestTC7_CavityDetection:
    """TC-7: Verify AI correctly detects a cavity with >85% confidence."""

    def test_cavity_detected_with_high_confidence(self, app_client):
        """
        The conftest fixture mocks the CNN X-ray Keras model to return a
        'Dental Caries' detection at 91% confidence, validating the full pipeline.
        """
        data = register_and_login(
            app_client, f"cavity_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])

        assert analysis["status"] == "complete", f"Pipeline did not complete: {analysis}"
        findings = analysis["findings"]
        assert len(findings) > 0, "No findings returned by AI pipeline"

        # Find the Caries finding
        caries = next((f for f in findings if f["condition"].lower() in ("caries", "cavity")), None)
        assert caries is not None, f"No Caries finding in: {findings}"
        assert caries["confidence"] > 0.85, (
            f"Caries confidence {caries['confidence']:.2f} is below 85% threshold"
        )

    def test_cavity_finding_bounding_box_is_none(self, app_client):
        """CNN classifiers have no bounding boxes; bounding_box must be None."""
        data = register_and_login(
            app_client, f"bbox_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        caries = next((f for f in analysis["findings"] if f["condition"].lower() in ("dental caries", "caries", "cavity")), None)
        assert caries is not None
        assert caries["bounding_box"] is None, (
            "CNN classifier should not produce bounding boxes"
        )

    def test_cavity_annotated_image_url_is_none(self, app_client):
        """CNN classifier produces no annotated image; annotated_image_url must be None."""
        data = register_and_login(
            app_client, f"annot_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        assert analysis.get("ai_explanation", {}).get("annotated_image_url") is None


# ── TC-8: AI Periapical Lesion Detection ──────────────────────────────────────
class TestTC8_PeriapicalDetection:
    """TC-8: Verify AI correctly detects a periapical lesion with >80% confidence."""

    def test_periapical_detected_with_sufficient_confidence(self, app_client):
        """
        Override the CNN X-ray mock to return a periapical_lesion detection at 88%.
        """
        periapical_keras = {
            "success": True,
            "top_class": "periapical_lesion",
            "top_display": "Periapical Lesion",
            "top_confidence": 0.88,
            "all_probabilities": {
                "caries": 0.07,
                "impacted_tooth": 0.05,
                "periapical_lesion": 0.88,
            },
            "findings": [
                {"class": "periapical_lesion", "display": "Periapical Lesion", "confidence": 0.88},
            ],
        }
        periapical_gemini = {
            "findings_enriched": [
                {
                    "severity": "high",
                    "gemini_explanation": "Periapical lesion detected at root apex.",
                    "recommendation": "Root canal treatment may be required.",
                }
            ],
            "patient_summary": "A periapical lesion was detected. Consult your dentist promptly.",
            "clinical_notes": "Periapical radiolucency present.",
            "overall_risk": "high",
            "urgency": "soon",
            "image_quality": "good",
        }

        with patch(
                "app.services.keras_xray_service.run_keras_xray_classification",
                return_value=periapical_keras,
             ), \
             patch(
                 "app.services.vision_service.DentalVisionService.analyze_with_keras_xray_context",
                 return_value=periapical_gemini,
             ):
            data = register_and_login(
                app_client, f"periapical_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
            )
            analysis = _create_scan_and_wait(app_client, data["access_token"])

        assert analysis["status"] == "complete", analysis
        findings = analysis["findings"]
        lesion = next(
            (f for f in findings if "periapical" in f["condition"].lower()),
            None,
        )
        assert lesion is not None, f"No periapical finding in: {findings}"
        assert lesion["confidence"] > 0.80, (
            f"Periapical confidence {lesion['confidence']:.2f} is below 80% threshold"
        )

    def test_periapical_finding_has_recommendation(self, app_client):
        periapical_keras = {
            "success": True,
            "top_class": "periapical_lesion",
            "top_display": "Periapical Lesion",
            "top_confidence": 0.83,
            "all_probabilities": {"caries": 0.10, "impacted_tooth": 0.07, "periapical_lesion": 0.83},
            "findings": [{"class": "periapical_lesion", "display": "Periapical Lesion", "confidence": 0.83}],
        }
        periapical_gemini = {
            "findings_enriched": [{"severity": "high", "gemini_explanation": "Root apex lesion.", "recommendation": "See endodontist."}],
            "patient_summary": "Lesion detected.", "clinical_notes": "Radiolucency at apex.",
            "overall_risk": "high", "urgency": "soon", "image_quality": "good",
        }
        with patch("app.services.keras_xray_service.run_keras_xray_classification", return_value=periapical_keras), \
             patch("app.services.vision_service.DentalVisionService.analyze_with_keras_xray_context", return_value=periapical_gemini):
            data = register_and_login(app_client, f"prec_{uuid.uuid4().hex[:8]}@test.com", "Pass99!")
            analysis = _create_scan_and_wait(app_client, data["access_token"])
        lesion = next((f for f in analysis["findings"] if "periapical" in f["condition"].lower()), None)
        assert lesion is not None
        assert lesion.get("recommendation"), "Missing recommendation in periapical finding"


# ── TC-9: AI Healthy Image (No Conditions) ───────────────────────────────────
class TestTC9_HealthyImage:
    """TC-9: Verify AI correctly identifies healthy teeth with no conditions."""

    def test_no_findings_for_healthy_scan(self, app_client):
        """Mock CNN X-ray model to return empty findings → pipeline should return empty findings."""
        healthy_keras = {
            "success": True,
            "top_class": "caries",
            "top_display": "Dental Caries",
            "top_confidence": 0.12,
            "all_probabilities": {"caries": 0.12, "impacted_tooth": 0.08, "periapical_lesion": 0.06},
            "findings": [],  # empty — all classes below SECONDARY_THRESHOLD
        }
        healthy_gemini = {
            "findings_enriched": [],
            "patient_summary": "Your teeth look healthy! No issues detected.",
            "clinical_notes": "No pathology detected.",
            "overall_risk": "none",
            "urgency": "none",
            "image_quality": "good",
        }

        with patch(
                "app.services.keras_xray_service.run_keras_xray_classification",
                return_value=healthy_keras,
             ), \
             patch(
                 "app.services.vision_service.DentalVisionService.analyze_with_keras_xray_context",
                 return_value=healthy_gemini,
             ):
            data = register_and_login(
                app_client, f"healthy_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
            )
            analysis = _create_scan_and_wait(app_client, data["access_token"])

        assert analysis["status"] == "complete", analysis
        assert analysis["findings"] == [], f"Expected no findings, got: {analysis['findings']}"
        assert analysis["ai_explanation"]["overall_risk"] == "none"

    def test_healthy_scan_confidence_score_is_zero(self, app_client):
        healthy_keras = {
            "success": True, "top_class": "caries", "top_display": "Dental Caries",
            "top_confidence": 0.10,
            "all_probabilities": {"caries": 0.10, "impacted_tooth": 0.05, "periapical_lesion": 0.03},
            "findings": [],
        }
        healthy_gemini = {
            "findings_enriched": [], "patient_summary": "Healthy",
            "clinical_notes": "None", "overall_risk": "none", "urgency": "none", "image_quality": "good",
        }
        with patch("app.services.keras_xray_service.run_keras_xray_classification", return_value=healthy_keras), \
             patch("app.services.vision_service.DentalVisionService.analyze_with_keras_xray_context", return_value=healthy_gemini):
            data = register_and_login(app_client, f"hc0_{uuid.uuid4().hex[:8]}@test.com", "Pass99!")
            analysis = _create_scan_and_wait(app_client, data["access_token"])
        assert analysis["confidence_score"] == 0.0


# ── TC-10: PDF Report Generation ─────────────────────────────────────────────
class TestTC10_PDFReportGeneration:
    """TC-10: Verify PDF report is generated correctly after AI analysis."""

    def test_report_created_after_scan_analysis(self, app_client):
        """After AI pipeline completes, a report_id must be present in the analysis response."""
        data = register_and_login(
            app_client, f"pdfrep_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        assert analysis["status"] == "complete", analysis
        assert analysis.get("report_id") is not None, "No report_id after completed analysis"

    def test_report_endpoint_returns_report_data(self, app_client):
        data = register_and_login(
            app_client, f"pdfget_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        report_id = analysis["report_id"]
        assert report_id is not None

        token = data["access_token"]
        resp = app_client.get(f"/reports/{report_id}", headers=auth_headers(token))
        assert resp.status_code == 200, resp.text
        report = resp.json()
        assert "final_diagnosis" in report
        assert report["final_diagnosis"] is not None

    def test_pdf_download_endpoint_exists(self, app_client):
        """
        GET /reports/{id}/pdf should redirect (302) to the Cloudinary PDF URL.
        If pdf_url is not set yet, a 404 is acceptable;
        the endpoint must not return 500.
        """
        data = register_and_login(
            app_client, f"pdfurl_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        report_id = analysis["report_id"]
        assert report_id is not None

        token = data["access_token"]
        resp = app_client.get(
            f"/reports/{report_id}/pdf",
            headers=auth_headers(token),
            follow_redirects=False,
        )
        # 302 redirect to Cloudinary PDF URL, or 404 if PDF wasn't stored yet
        assert resp.status_code in (302, 404), (
            f"Unexpected status {resp.status_code}: {resp.text}"
        )

    def test_report_contains_recommended_actions(self, app_client):
        data = register_and_login(
            app_client, f"pdfact_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        analysis = _create_scan_and_wait(app_client, data["access_token"])
        token = data["access_token"]
        resp = app_client.get(f"/reports/{analysis['report_id']}", headers=auth_headers(token))
        report = resp.json()
        assert isinstance(report.get("recommended_actions"), list)
