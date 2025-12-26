
import os
import io
import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Use System Font (Arial) which supports PL chars
SYSTEM_FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"
SYSTEM_FONT_BOLD_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

FONT_NAME = "Arial"
FALLBACK_FONT = "Helvetica" 
FALLBACK_FONT_BOLD = "Helvetica-Bold"

def _ensure_fonts():
    """Ensures that Unicode fonts are available. Returns success bool."""
    try:
        # Check system font directly
        if os.path.exists(SYSTEM_FONT_PATH):
            print(f"DEBUG: Using System Font: {SYSTEM_FONT_PATH}")
            pdfmetrics.registerFont(TTFont(FONT_NAME, SYSTEM_FONT_PATH))
            
            # Try bold
            if os.path.exists(SYSTEM_FONT_BOLD_PATH):
                pdfmetrics.registerFont(TTFont(f"{FONT_NAME}-Bold", SYSTEM_FONT_BOLD_PATH))
            else:
                # Fallback bold to regular
                pdfmetrics.registerFont(TTFont(f"{FONT_NAME}-Bold", SYSTEM_FONT_PATH))
                
            print("DEBUG: Fonts registered successfully!")
            return True
        else:
            print(f"ERROR: System font not found at {SYSTEM_FONT_PATH}")
            return False

    except Exception as e:
        print(f"CRITICAL FONT ERROR: {e}")
        return False

def _sanitize_for_pdf(text, use_unicode):
    """If unicode font is not available, transliterate PL chars to ASCII."""
    if not text: return ""
    if use_unicode: return text
    
    # Simple map
    replacements = {
        'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
        'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text

def generate_schedule_pdf(schedule_data: dict, zones_order: list = None, break_labels_override: dict = None):
    """
    Generates a PDF file from the schedule data.
    """
    has_unicode = _ensure_fonts()
    current_font = FONT_NAME if has_unicode else FALLBACK_FONT
    current_font_bold = f"{FONT_NAME}-Bold" if has_unicode else FALLBACK_FONT_BOLD
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=20, leftMargin=20, topMargin=20, bottomMargin=20)
    
    elements = []
    
    # Styles
    styles = getSampleStyleSheet()
    style_title = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontName=current_font_bold, alignment=1, fontSize=16)
    style_header = ParagraphStyle('CustomHeader', parent=styles['Normal'], fontName=current_font_bold, fontSize=10, textColor=colors.white)
    style_cell = ParagraphStyle('CustomCell', parent=styles['Normal'], fontName=current_font, fontSize=9)
    
    # Title
    title_text = _sanitize_for_pdf("Harmonogram Dyżurów Nauczycielskich", has_unicode)
    elements.append(Paragraph(title_text, style_title))
    elements.append(Spacer(1, 15))
    
    # Data Processing
    all_breaks_indices = set()
    for item in schedule_data:
        all_breaks_indices.add(item['break_index'])
    
    sorted_break_indices = sorted(list(all_breaks_indices))
    
    # Default labels
    default_labels = {
        0: "Po 1. lekcji", 1: "Po 2. lekcji", 2: "Po 3. lekcji", 
        3: "Po 4. lekcji", 4: "Po 5. lekcji", 5: "Po 6. lekcji",
        6: "Po 7. lekcji", 7: "Po 8. lekcji", 8: "Po 9. lekcji"
    }

    # Table Header
    headers = ["Dzien"] if not has_unicode else ["Dzień"]
    
    for i in sorted_break_indices:
        # Try override first (keys might be strings from JSON)
        label = None
        if break_labels_override:
            label = break_labels_override.get(str(i)) or break_labels_override.get(i)
        
        if not label:
            label = default_labels.get(i, f"Przerwa {i}")
            
        headers.append(_sanitize_for_pdf(label, has_unicode))
    
    # Table Content
    # We allow both full names (Monday) and short names (Mon)
    # Target display order: Mon -> Fri
    days_order = [
         ("Monday", "Mon", "Poniedziałek"),
         ("Tuesday", "Tue", "Wtorek"),
         ("Wednesday", "Wed", "Środa"),
         ("Thursday", "Thu", "Czwartek"),
         ("Friday", "Fri", "Piątek")
    ]
    
    data = []
    # Header Row
    header_row = [Paragraph(h, style_header) for h in headers]
    data.append(header_row)
    
    for full_name, short_name, pl_name in days_order:
        row = [Paragraph(f"<b>{_sanitize_for_pdf(pl_name, has_unicode)}</b>", style_cell)]
        
        for b_idx in sorted_break_indices:
            # Match either full or short name
            duties = [d for d in schedule_data if (d['day'] == full_name or d['day'] == short_name) and d.get('break_index') == b_idx]
            
            if zones_order:
                duties.sort(key=lambda x: zones_order.index(x['zone_name']) if x['zone_name'] in zones_order else 999)
            else:
                duties.sort(key=lambda x: x['zone_name'])
                
            cell_content = []
            for d in duties:
                c_zone = _sanitize_for_pdf(d['zone_name'], has_unicode)
                c_teacher = _sanitize_for_pdf(d['teacher_code'], has_unicode)
                cell_content.append(f"<b>{c_zone}</b>: {c_teacher}")
            
            text = "<br/>".join(cell_content)
            if not text: text = "-"
            row.append(Paragraph(text, style_cell))
        
        data.append(row)

    # Table Styling
    if len(headers) > 1: # Avoid div by zero
        col_width = 800 / len(headers)
    else:
        col_width = 800

    col_widths_list = [60] + [col_width] * len(sorted_break_indices)
    
    t = Table(data, colWidths=col_widths_list)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue), # Header bg
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (-1, 0), current_font_bold),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.lightgrey]),
    ]))
    
    elements.append(t)
    doc.build(elements)
    
    buffer.seek(0)
    return buffer

