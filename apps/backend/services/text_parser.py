import re
from typing import List, Dict, Optional
from pydantic import BaseModel

class ParsedLesson(BaseModel):
    day: str
    lesson_index: int
    teacher_code: str
    subject: str
    group: Optional[str] = None
    room: Optional[str] = None
    class_name: Optional[str] = None

class TextScheduleParser:
    """
    Parser for raw text schedules (e.g., copied from PDF or Excel).
    
    Heuristics:
    - Identifies rows by leading digits (lesson indices).
    - Splits columns by tabs or wide spaces.
    - Extracts lesson details (Subject, Room, Group) from cell text.
    """
    def parse(self, text: str, default_room: Optional[str] = None, default_class: Optional[str] = None) -> List[ParsedLesson]:
        """
        Parses copied schedule text.
        Expected format:
        Rows: Lesson periods (1, 2, 3...)
        Cols: Days (Mon, Tue, Wed, Thu, Fri)
        Cell: "JZ 1I-1/2 informatyka" (Teacher, Class, Subject)
        """
        lines = text.strip().split('\n')
        
        # 1. Pre-process: Merge split lines into logical rows
        # A new logical row starts when a line begins with a Digit followed by Space/Tab
        logical_rows = []
        current_row_buffer = []
        
        for line in lines:
            # IMPORTANT: Do NOT strip leading whitespace as it might be indentation/tabs representing empty cells
            stripped = line.rstrip()
            if not stripped: continue
            
            # Use regex to check for Start of Lesson Row (e.g., "1 ", "1\t", "2 ")
            # Allow leading whitespace just in case, but usually index is at start
            is_start = re.match(r'^\s*\d+\s', stripped) or re.match(r'^\s*\d+$', stripped)
            
            if is_start:
                # Flush previous buffer
                if current_row_buffer:
                    logical_rows.append("\t".join(current_row_buffer))
                current_row_buffer = [stripped]
            else:
                # Append to current buffer (continuation)
                # If buffer is empty, it might be header or metadata, just keep it separate
                if current_row_buffer:
                    current_row_buffer.append(stripped)
                # else ignore header noise
                
        # Flush last buffer
        if current_row_buffer:
            logical_rows.append("\t".join(current_row_buffer))

        lessons = []
        
        # Days mapping (0=Mon, 1=Tue...)
        days_map = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri'}
        
        for row_text in logical_rows:
            # Now split by Tab (or maybe Tab regex if copy-paste uses spaces?)
            # Usually browser copy uses Tabs. But if user copied from formatted text, maybe spaces?
            # Let's assume tabs were preserved OR we just joined them with tabs.
            parts = row_text.split('\t')
            
            # Filter empty parts - NO! Don't filter, we need to preserve indices for days
            parts = [p.strip() for p in parts]
            
            if len(parts) < 2:
                continue

            # Identify Lesson Index
            first_col = parts[0]
            lesson_idx = self._extract_lesson_index(first_col)
            
            if lesson_idx is None:
                continue
                
            # Column Mapping Strategy
            # Format: [Index] [Time] [Mon] [Tue] [Wed] [Thu] [Fri]
            # Time column is optional/variable. 
            # We need to map remaining parts to days.
            
            # Remove metadata columns (Index, Time)
            # Find index of first part that looks like a Lesson (Teacher Code)
            # Or just assume Fixed Offset.
            
            # Robust Strategy: 
            # If we have 7 parts: Index, Time, Mon, Tue, Wed, Thu, Fri
            # If we have 6 parts: Index, Mon, Tue, Wed, Thu, Fri
            # If we have < 6 parts: Some days are empty? 
            # But "split('\t')" preserves empty strings if consecutive tabs...
            # Wait, line merging `"\t".join` inserts tabs between lines.
            
            # If the user's copy had "empty lines" for empty cells, we are good.
            # If the user's copy completely skipped empty cells, we can't align.
            # BUT user example: "RW 2A... [Next Line] RW 4B..." (Tue)
            # Implies strict ordering: Mon part, Tue part...
            
            # Let's try to parse EVERY part after metadata as a potential lesson.
            # BUT we need to know WHICH DAY it is.
            
            # Let's map strict indices if possible.
            # parts[0] = Index
            # parts[1] = Time (likely) -> verify regex?
            
            start_idx = 1
            if re.search(r'\d{1,2}:\d{2}', parts[1]): # Check for Time format e.g. 7:45
                start_idx = 2
            
            # Remaining parts are days.
            # Issue: If Wed is empty, is it missing from parts list?
            # In text copy, empty cells usually appear as just a tab or nothing if skipped?
            # User example showing " " for Wed -> implies explicit empty part
            
            day_parts = parts[start_idx:]
            
            # Assign explicitly to Mon..Fri
            # Assign explicitly to Mon..Fri
            for i, cell_text in enumerate(day_parts):
                if i > 4: break # Only 5 days
                
                parsed = self._parse_cell(cell_text)
                
                if parsed:
                    lessons.append(ParsedLesson(
                        day=days_map[i],  # Use 'i' which is 0..4
                        lesson_index=lesson_idx,
                        teacher_code=parsed['teacher'],
                        subject=parsed['subject'],
                        group=parsed['group'], 
                        class_name=default_class or parsed['class'],
                        room=default_room 
                    ))
                    
        return lessons

    def _extract_lesson_index(self, text: str) -> Optional[int]:
        match = re.search(r'^(\d+)', text)
        if match:
            return int(match.group(1))
        return None

    def _parse_cell(self, text: str) -> Optional[Dict[str, str]]:
        # Pattern: [Teacher] [Class]-[Group] [Subject]
        # Example: "JZ 1I-1/2 informatyka"
        # Teacher: 2-3 uppercase letters?
        # Class: Digit + Uppercase? "1I"
        
        # Regex strategy:
        # ^([A-Z]{2,3})\s+([0-9][A-Z]+)(?:-(.+))?$ 
        # But subject might be anything.
        
        # Let's try split by space.
        parts = text.split(maxsplit=2)
        if len(parts) < 2:
            return None
            
        teacher_code = parts[0]
        # Basic validation for teacher code (2-4 chars, usually upper)
        if not re.match(r'^[A-ZŁŚŻŹĆŃ]{2,4}$', teacher_code, re.IGNORECASE):
             # Maybe text doesn't start with teacher? 
             # For now assume strict format per user request features.
             pass
             
        # Second part is usually class often with group extension
        class_part = parts[1]
        
        # Subject is the rest
        subject = parts[2] if len(parts) > 2 else "Lekcja"
        
        # Extract class base name from "1I-1/2" -> "1I"
        class_clean = class_part.split('-')[0]
        
        return {
            'teacher': teacher_code,
            'class': class_clean,
            'group': class_part,
            'subject': subject
        }
