from pydantic import BaseModel
from typing import List, Optional
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

class TeacherSchedule(BaseModel):
    teacher_code: str
    teacher_name: str
    schedule: List[LessonSlot]

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
