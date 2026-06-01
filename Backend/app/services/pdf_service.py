"""
services/pdf_service.py — WeasyPrint-based PDF generation for diagnosis reports.
WeasyPrint is a pure-Python HTML/CSS → PDF converter; no browser installation required.
"""
from jinja2 import Environment, FileSystemLoader
from pathlib import Path
from app.config import settings

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


def _render_html(template_name: str, context: dict) -> str:
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    return env.get_template(template_name).render(**context)


def generate_report_pdf(report_data: dict) -> bytes:
    """Render the Jinja2 report template and convert to PDF with WeasyPrint.
    This is a synchronous function — safe to call from a ThreadPoolExecutor.
    """
    html = _render_html("report.html", report_data)
    from weasyprint import HTML
    pdf_bytes = HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf()
    return pdf_bytes


def upload_pdf_to_cloudinary(pdf_bytes: bytes, report_id: str) -> str:
    import cloudinary, cloudinary.uploader, io
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
    )
    result = cloudinary.uploader.upload(
        io.BytesIO(pdf_bytes),
        resource_type="raw",
        public_id=f"teledent/reports/report_{report_id}",
        format="pdf",
    )
    return result["secure_url"]