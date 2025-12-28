
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
            pdfmetrics.registerFont(TTFont('FreeSans', SYSTEM_FONT_PATH))
            
            # Try bold
            if os.path.exists(SYSTEM_FONT_BOLD_PATH):
                pdfmetrics.registerFont(TTFont(f"{FONT_NAME}-Bold", SYSTEM_FONT_BOLD_PATH))
            else:
                # Fallback bold to regular
                pdfmetrics.registerFont(TTFont('FreeSansBold', 'FreeSansBold.ttf'))
                
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

def generate_teacher_pdf(teacher_name: str, teacher_code: str, schedule: list, duties: list):
    """
    Generates a PDF for a single teacher: Lessons + Duties interwoven.
    """
    has_unicode = _ensure_fonts()
    current_font = FONT_NAME if has_unicode else FALLBACK_FONT
    current_font_bold = f"{FONT_NAME}-Bold" if has_unicode else FALLBACK_FONT_BOLD
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=20, leftMargin=20, topMargin=20, bottomMargin=20)
    
    elements = []
    
    styles = getSampleStyleSheet()
    style_title = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontName=current_font_bold, alignment=1, fontSize=16)
    
    # Title
    t_name_san = _sanitize_for_pdf(teacher_name, has_unicode)
    title_text = f"Plan Dyżurow: {t_name_san} ({teacher_code})"
    elements.append(Paragraph(title_text, style_title))
    elements.append(Spacer(1, 15))
    
    # Grid Config
    days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    day_labels = {
        "Mon": "Poniedziałek", "Tue": "Wtorek", "Wed": "Środa", "Thu": "Czwartek", "Fri": "Piątek"
    }
    
    # Headers
    headers = ["Lekcja"] 
    for d in days:
        headers.append(_sanitize_for_pdf(day_labels[d], has_unicode))
        
    data = []
    
    # Styles
    style_header = ParagraphStyle('Header', parent=styles['Normal'], fontName=current_font_bold, fontSize=11, textColor=colors.whitesmoke)
    style_lesson = ParagraphStyle('Lesson', parent=styles['Normal'], fontName=current_font_bold, fontSize=10, leading=12)
    style_room = ParagraphStyle('Room', parent=styles['Normal'], fontName=current_font, fontSize=8, textColor=colors.grey)
    style_duty = ParagraphStyle('Duty', parent=styles['Normal'], fontName=current_font_bold, fontSize=9, textColor=colors.darkgreen, alignment=1)
    
    header_row = [Paragraph(h, style_header) for h in headers]
    data.append(header_row)
    
    # Rows: 1 to 9 (User requested skip 0)
    for i in range(1, 10):
        # 1. Lesson Row
        row_lesson = [Paragraph(f"<b>{i}</b>", style_lesson)]
        for d in days:
            # Find Lesson
            lesson = next((l for l in schedule if l['day'] == d and str(l['lesson_index']) == str(i)), None)
            cell = []
            if lesson:
                s = _sanitize_for_pdf(lesson.get('subject', ''), has_unicode)
                g = _sanitize_for_pdf(lesson.get('group_code', ''), has_unicode)
                r = _sanitize_for_pdf(lesson.get('room_code', ''), has_unicode)
                
                # Combine Group + Subject
                full_subject = f"<b>{g}</b> {s}" if g else s
                
                cell.append(Paragraph(full_subject, style_lesson))
                if r: cell.append(Paragraph(r, style_room))
            row_lesson.append(cell)
        data.append(row_lesson)
        
        # 2. Duty Row (After Lesson i)
        # Check if any duty exists effectively in this slot across days to decide if we show row (or just show always for consistency)
        # Show always for grid consistency, or compact? Compact is better.
        # But Duties are "After Lesson" -> breaks.
        # Let's check if there is ANY duty for break_index == i
        has_any_duty = any(duty for duty in duties if str(duty.get('break_index')) == str(i))
        
        if has_any_duty:
           row_duty = [Paragraph("Przerwa", style_room)]
           for d in days:
               duty = next((du for du in duties if du['day'] == d and str(du.get('break_index')) == str(i)), None)
               if duty:
                   z = _sanitize_for_pdf(duty.get('zone_name', ''), has_unicode)
                   row_duty.append(Paragraph(f"DYŻUR: {z}", style_duty))
               else:
                   row_duty.append("")
           data.append(row_duty)
        else:
           # Optional: visual separator if no duty?
           pass

    # Table Style
    col_widths = [50] + [140] * 5
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue), # Header
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), current_font_bold),
        
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    
    elements.append(t)
    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_schedule_by_zone_pdf(schedule_data: list, zones_order: list = None):
    """
    Generates a Zone-centric view of the schedule (Sectors PDF).
    
    Structure:
    - Pages: One per Day.
    - Rows: Zones (Sectors).
    - Columns: Breaks (Time Slots).
    - Cells: List of teachers assigned to that zone/time.
    
    Used for printing the "Dyżury na korytarzach" summary.
    """
    has_unicode = _ensure_fonts()
    current_font = FONT_NAME if has_unicode else FALLBACK_FONT
    current_font_bold = f"{FONT_NAME}-Bold" if has_unicode else FALLBACK_FONT_BOLD
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=20, leftMargin=20, topMargin=20, bottomMargin=20)
    
    elements = []
    styles = getSampleStyleSheet()
    
    style_day_header = ParagraphStyle('DayHeader', parent=styles['Heading1'], fontName=current_font_bold, alignment=1, fontSize=14, spaceAfter=10)
    style_th = ParagraphStyle('TH', parent=styles['Normal'], fontName=current_font_bold, fontSize=9, textColor=colors.white, alignment=1)
    style_td = ParagraphStyle('TD', parent=styles['Normal'], fontName=current_font, fontSize=8, alignment=1)
    style_td_zone = ParagraphStyle('TD_Zone', parent=styles['Normal'], fontName=current_font_bold, fontSize=9, alignment=0) 

    days_map = {
        "Mon": "Poniedziałek", "Tue": "Wtorek", "Wed": "Środa", "Thu": "Czwartek", "Fri": "Piątek"
    }
    ordered_days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    
    all_breaks = sorted(list(set(d['break_index'] for d in schedule_data)))
    
    if zones_order:
        all_zones = zones_order
    else:
        all_zones = sorted(list(set(d['zone_name'] for d in schedule_data)))

    default_labels = {
        1: "Po 1.", 2: "Po 2.", 3: "Po 3.", 4: "Po 4.", 
        5: "Po 5.", 6: "Po 6.", 7: "Po 7.", 8: "Po 8.", 9: "Po 9."
    }

    first_page = True

    from reportlab.platypus import PageBreak

    for day_code in ordered_days:
        if not first_page:
            elements.append(PageBreak())
        
        first_page = False
        
        day_name = days_map.get(day_code, day_code)
        elements.append(Paragraph(f"Plan Dyżurów - {day_name}", style_day_header))
        
        headers = ["Sektor"] + [default_labels.get(b, f"{b}") for b in all_breaks]
        headers = [_sanitize_for_pdf(h, has_unicode) for h in headers]
        
        data = [[Paragraph(h, style_th) for h in headers]]
        
        for zone in all_zones:
            sanitized_zone = _sanitize_for_pdf(zone, has_unicode)
            row = [Paragraph(sanitized_zone, style_td_zone)]
            
            for b_idx in all_breaks:
                duties = [d for d in schedule_data if d['day'] == day_code and d['zone_name'] == zone and d['break_index'] == b_idx]
                
                cell_text = ""
                if duties:
                    codes = [d['teacher_code'] for d in duties]
                    cell_text = ", ".join(codes)
                
                row.append(Paragraph(_sanitize_for_pdf(cell_text, has_unicode), style_td))
            
            data.append(row)
            
        page_width = 800
        zone_col_width = 100
        rest_width = page_width - zone_col_width
        break_col_width = rest_width / len(all_breaks) if all_breaks else 50
        
        col_widths = [zone_col_width] + [break_col_width] * len(all_breaks)
        
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue), 
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), current_font_bold),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        
        elements.append(t)
        
    doc.build(elements)
    buffer.seek(0)
    return buffer

