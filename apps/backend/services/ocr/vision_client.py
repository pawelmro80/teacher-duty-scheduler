from openai import AsyncOpenAI
import os
import json
from typing import List, Optional
from services.ocr.preprocessor import ImagePreprocessor
from models.schemas import LessonSlot, TeacherSchedule

class VisionClient:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            # For development, we might not have a key yet. 
            # In production this should raise or handle gracefully.
            print("WARNING: OPENAI_API_KEY not found")
            self.client = None
        else:
            self.client = AsyncOpenAI(api_key=self.api_key)
        
        self.preprocessor = ImagePreprocessor()

    async def analyze_schedule(self, image_bytes: bytes, teacher_code: str = "UNKNOWN") -> TeacherSchedule:
        if not self.client:
            raise ValueError("OpenAI API Key provided")

        # Encode image to base64 for API
        import base64
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        prompt = """
        ACT AS A PRECISION OPTICAL CHARACTER RECOGNITION ENGINE FOR SCHOOL SCHEDULES.
        
        ### 1. IMAGE STRUCTURE & LANGUAGE
        - The document is a Polish school timetable.
        - **COLUMNS (Header row)** represent DAYS. Look for Polish abbreviations:
          - "Pn", "Pon", "Poniedziałek" -> Monday (Mon)
          - "Wt", "Wtorek" -> Tuesday (Tue)
          - "Śr", "Sr", "Środa" -> Wednesday (Wed)
          - "Cz", "Czw", "Czwartek" -> Thursday (Thu)
          - "Pt", "Pią", "Piątek" -> Friday (Fri)
        - **ROWS (Leftmost column)** represent LESSON PERIODS (Indices 1 to 9, or hours like 8:00-8:45).
        
        ### 2. GEOMETRY & ALIGNMENT RULES (CRITICAL)
        - Trace vertical lines from the Day Header down. **Do not strict drift into adjacent columns.**
        - Trace horizontal lines from the Lesson Number across.
        - A text block belongs to a specific slot ONLY if it falls within the intersection of that Day Column and Lesson Row.
        - WARNING: Columns may have uneven widths. Trust the vertical alignment with the header.

        ### 3. NOISE FILTERING
        - **IGNORE** colored symbols like red minuses (-), blue pluses (+), lines, or stamps.
        - **IGNORE** handwritten corrections unless they clearly replace printed text.
        - Extract ONLY: Class Code (e.g. 1a, 4T), Room Number (e.g. 12, AULA), and Subject (e.g. Matematyka, WF).

        ### 4. OUTPUT FORMAT (JSON ONLY)
        Return a single JSON object.
        {
          "teacher_code": "Extract 2-3 letter initials (e.g. 'BS', 'Kow') from the title area. If ambiguous, return null.",
          "schedule": [
            {
              "day": "Mon",           // Must be one of: Mon, Tue, Wed, Thu, Fri
              "lesson_index": 1,      // Integer 1-9 corresponding to the row number
              "group_code": "4A",     // Top of cell
              "room_code": "12",      // Middle/Bottom of cell
              "subject": "Mat"        // Contextual guess based on text
            }
          ]
        }
        """

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise data extraction assistant. You only output JSON."
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            # Cleanup markdown block if present
            if "```json" in content:
                content = content.replace("```json", "").replace("```", "")
            
            data = json.loads(content)
            
            extracted_teacher = data.get("teacher_code", teacher_code)
            final_teacher = extracted_teacher if extracted_teacher else teacher_code

            slots = []
            for item in data.get("schedule", []):
                # Validate enum for day
                day_map = {
                    "Pn": "Mon", "Wt": "Tue", "Śr": "Wed", "Cz": "Thu", "Pt": "Fri",
                    "Mon": "Mon", "Tue": "Tue", "Wed": "Wed", "Thu": "Thu", "Fri": "Fri",
                    "Poniedziałek": "Mon", "Wtorek": "Tue", "Środa": "Wed", "Czwartek": "Thu", "Piątek": "Fri"
                }
                day_str = item.get("day")
                # Normalize day string
                normalized_day = day_map.get(day_str, day_map.get(day_str.capitalize()))
                
                if normalized_day:
                    slots.append(LessonSlot(
                        day=normalized_day,
                        lesson_index=item.get("lesson_index"),
                        group_code=item.get("group_code"),
                        room_code=item.get("room_code"),
                        subject=item.get("subject"),
                        is_empty=False
                    ))
            
            return TeacherSchedule(
                teacher_code=final_teacher,
                teacher_name=final_teacher, 
                schedule=slots
            )

        except Exception as e:
            print(f"Error calling OpenAI: {e}")
            raise e
