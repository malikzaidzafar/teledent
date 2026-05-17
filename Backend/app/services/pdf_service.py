from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import re
import os

from sqlalchemy import table

class PDFReportService:
    def _render_explanation(self, text: str, styles) -> list:
        """Convert markdown-style LLM text to ReportLab elements."""
        elements = []

        bullet_style = ParagraphStyle(
            'BulletItem',
            parent=styles['Normal'],
            leftIndent=20,
            spaceAfter=4,
        )
        numbered_style = ParagraphStyle(
            'NumberedItem',
            parent=styles['Normal'],
            leftIndent=10,
            spaceBefore=10,
            spaceAfter=4,
        )

        def md_to_html(line: str) -> str:
            # Convert **text** to <b>text</b>
            return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', line)

        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                elements.append(Spacer(1, 6))
            elif re.match(r'^\* ', line):  # bullet point
                content = md_to_html(line[2:])
                elements.append(Paragraph(f'• {content}', bullet_style))
            elif re.match(r'^\d+\.', line):  # numbered item
                content = md_to_html(line)
                elements.append(Paragraph(content, numbered_style))
            else:
                content = md_to_html(line)
                elements.append(Paragraph(content, styles['Normal']))
                elements.append(Spacer(1, 4))

        return elements

    def generate_report(self, patient_name: str, analysis_data: dict, filename: str):
    
        doc = SimpleDocTemplate(filename, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []
    
        title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#2c3e50'),
        alignment=TA_CENTER,
        spaceAfter=30
        )
    
        heading_style = ParagraphStyle(
        'Heading2',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#34495e'),
        spaceAfter=12,
        spaceBefore=20
        )
    
        elements.append(Paragraph("Welcome to Teledent AI", title_style))
        elements.append(Paragraph(f"Patient: {patient_name}", styles['Normal']))
        elements.append(Paragraph(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
        elements.append(Spacer(1, 30))
    
    # Analysis Results
        elements.append(Paragraph("Analysis Results", heading_style))
    
    # Primary finding
        primary = analysis_data['primary_finding']
        elements.append(Paragraph(
        f"<b>Primary Finding:</b> {primary['condition']} "
        f"(Confidence: {primary['confidence_percentage']}% - {primary['level']})",
        styles['Normal']
        ))
        elements.append(Spacer(1, 20))
    
    # All diseases table
        elements.append(Paragraph("Detailed Analysis", heading_style))
    
    # Table data
        table_data = [['Disease', 'Confidence', 'Risk Level']]
        for finding in analysis_data['all_findings']:
            table_data.append([
                 finding['condition'],
                 f"{finding['confidence_percentage']}%",
                 finding['level']
            ])
    
        table = Table(table_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
    
        elements.append(table)
        elements.append(Spacer(1, 30))
    
    # Recommendations - USE THE ONES FROM EXPLANATION
        elements.append(Paragraph("Recommendations", heading_style))
    
        # Get recommendations from explanation
        explanation = analysis_data.get('explanation', {})
        recommendations = explanation.get('recommendations', [])
    
        if recommendations:
            for rec in recommendations:
                elements.append(Paragraph(f"• {rec}", styles['Normal']))
                elements.append(Spacer(1, 6))
        else:
        # Fallback recommendations based on risk level
            risk = analysis_data['primary_finding']['level']
            if risk == 'High':
                elements.append(Paragraph("• Visit dentist within 1 week", styles['Normal']))
                elements.append(Paragraph("• Avoid chewing on affected side", styles['Normal']))
                elements.append(Paragraph("• Maintain oral hygiene", styles['Normal']))
            elif risk == 'Medium':
                elements.append(Paragraph("• Schedule dental appointment soon", styles['Normal']))
                elements.append(Paragraph("• Monitor for any pain or sensitivity", styles['Normal']))
                elements.append(Paragraph("• Brush twice daily with fluoride toothpaste", styles['Normal']))
            else:
                elements.append(Paragraph("• Discuss at next regular checkup", styles['Normal']))
                elements.append(Paragraph("• Continue good oral hygiene", styles['Normal']))
                elements.append(Paragraph("• Limit sugary foods and drinks", styles['Normal']))
    
        elements.append(Spacer(1, 30))
    
        if explanation and explanation.get('explanation'):
            elements.append(Paragraph("AI Analysis Summary", heading_style))
            elements.extend(self._render_explanation(explanation['explanation'], styles))
            elements.append(Spacer(1, 20))
    
    # Footer
            elements.append(Paragraph(
            "Thank you for choosing Teledent AI for your dental health analysis.",
            styles['Italic']
            ))
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(
        "This report is AI-generated and should be reviewed by a dental professional.",
        styles['Italic']
        ))
    
    # Build PDF
        doc.build(elements)
        return filename
    