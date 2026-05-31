"""
services/pdf_service.py — Playwright-based PDF generation for diagnosis reports.
Run inside a Celery task (NOT in the request/response cycle).
"""
from jinja2 import Environment, FileSystemLoader
from pathlib import Path
from app.config import settings

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


def _render_html(template_name: str, context: dict) -> str:
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    return env.get_template(template_name).render(**context)


async def generate_report_pdf(report_data: dict) -> bytes:
    html = _render_html("report.html", report_data)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html, wait_until="networkidle")
        pdf_bytes = await page.pdf(format="A4", print_background=True)
        await browser.close()
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