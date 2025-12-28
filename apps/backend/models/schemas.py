from pydantic import BaseModel
from typing import List, Optional, Dict
from enum import Enum

class DayOfWeek(str, Enum):
    MON = "Mon"
    TUE = "Tue"
    WED = "Wed"
    THU = "Thu"
    FRI = "Fri"

class LessonSlot(BaseModel):
    day: DayOfWeek
    lesson_index: int  # 1-9
    group_code: Optional[str] = None
    room_code: Optional[str] = None
    subject: Optional[str] = None
    is_empty: bool = True

class ManualDuty(BaseModel):
    day: DayOfWeek
    break_index: int # 1 means "After Lesson 1"
    zone_id: str
    zone_name: Optional[str] = None # Helper for display if needed

class TeacherSchedule(BaseModel):
    teacher_code: str
    teacher_name: str
    schedule: List[LessonSlot]
    manual_duties: Optional[List[ManualDuty]] = []
    preferences: Optional[Dict] = {} # e.g. { "preferred_zones": ["z1"] }

class DutyAssignment(BaseModel):
    id: Optional[int] = None
    teacher_code: str
    day: DayOfWeek
    break_slot: int
    sector: str
    is_pinned: bool = False

class DutyPlan(BaseModel):
    assignments: List[DutyAssignment]
    conflicts: List[str] = []
