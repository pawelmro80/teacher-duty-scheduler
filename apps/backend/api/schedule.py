from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db, TeacherScheduleDB, DutyConfigDB
from models.schemas import TeacherSchedule, LessonSlot
from services.pdf_service import generate_teacher_pdf
from services.text_parser import TextScheduleParser
from pydantic import BaseModel
import json

class RoomImportRequest(BaseModel):
    text: str
    room_code: str

router = APIRouter(prefix="/schedule", tags=["Schedule"])

@router.post("/save")
async def save_schedule(schedule: TeacherSchedule, db: Session = Depends(get_db)):
    """
    Creates or updates a teacher's schedule.
    
    Processing:
    - Serializes schedule slots to JSON.
    - Updates verification status to True.
    - Preserves existing manual duties if not provided.
    
    Args:
        schedule (TeacherSchedule): Pydantic model with teacher details and slots.
    """
    # Check if exists
    db_item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == schedule.teacher_code).first()
    
    # Serialize schedule list to JSON
    slots_json = [s.dict() for s in schedule.schedule]

    if db_item:
        # Update
        db_item.teacher_name = schedule.teacher_name
        db_item.schedule_json = slots_json
        db_item.is_verified = True # Explicitly verify on save
        if schedule.preferences:
             db_item.preferences_json = schedule.preferences
        # Always update manual duties (default to empty list if None)
        db_item.manual_duties_json = [d.dict() for d in (schedule.manual_duties or [])]
    else:
        # Create
        db_item = TeacherScheduleDB(
            teacher_code=schedule.teacher_code,
            teacher_name=schedule.teacher_name,
            schedule_json=slots_json,
            is_verified=True,
            preferences_json=schedule.preferences or {},
            manual_duties_json=[d.dict() for d in (schedule.manual_duties or [])]
        )
        db.add(db_item)
    
    db.commit()
    db.refresh(db_item)
    return {"status": "success", "id": db_item.id}

@router.post("/import-room")
async def import_room_schedule(payload: RoomImportRequest, db: Session = Depends(get_db)):
    """
    Parses a raw text schedule for a specific room and merges it into teacher schedules.
    
    Useful for importing data when Teacher-centric export is unavailable.
    
    Args:
        payload (RoomImportRequest): Contains raw text and room code.
        
    Returns:
        dict: Stats on imported lessons and updated teachers.
    """
    parser = TextScheduleParser()
    lessons = parser.parse(payload.text, default_room=payload.room_code)
    
    count = 0
    teachers_affected = set()
    
    for lesson in lessons:
        if not lesson.teacher_code: continue
        
        # 1. Find or Create Teacher
        teacher = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == lesson.teacher_code).first()
        if not teacher:
            teacher = TeacherScheduleDB(
                teacher_code=lesson.teacher_code,
                teacher_name=lesson.teacher_code, # Default name is code
                schedule_json=[],
                is_verified=False
            )
            db.add(teacher)
            db.flush() # Ensure it's tracked
            
        # 2. Update Schedule
        # Deep copy existing schedule
        current_schedule = list(teacher.schedule_json or [])
        
        # Remove any existing lesson for this Day+Index (Overwrite philosophy)
        # Note: dict representation of LessonSlot
        current_schedule = [s for s in current_schedule if not (s.get('day') == lesson.day and s.get('lesson_index') == lesson.lesson_index)]
        
        # Create new slot
        new_slot = {
            "day": lesson.day,
            "lesson_index": lesson.lesson_index,
            "subject": lesson.subject,
            "group_code": lesson.group or lesson.class_name,
            "room_code": lesson.room,
            "is_empty": False
        }
        
        current_schedule.append(new_slot)
        
        # Update DB object
        teacher.schedule_json = current_schedule
        teachers_affected.add(teacher.teacher_code)
        count += 1
        
    db.commit()
    
    return {
        "status": "success",
        "imported_lessons": count,
        "teachers_updated": len(teachers_affected)
    }

@router.get("/rooms")
async def get_all_rooms(db: Session = Depends(get_db)):
    teachers = db.query(TeacherScheduleDB).all()
    rooms = set()
    for t in teachers:
        if not t.schedule_json: continue
        for slot in t.schedule_json:
            r = slot.get('room_code')
            if r:
                rooms.add(str(r).strip())
    return {"rooms": sorted(list(rooms))}

@router.get("/")
async def list_schedules_root(db: Session = Depends(get_db)):
    return await list_schedules(db)

@router.get("/list")
async def list_schedules(db: Session = Depends(get_db)):
    """
    Lists all teachers with their statistics.
    
    Calculates:
    - Total teaching hours (Load).
    - Target duty slots (Fair share based on load).
    - Actual assigned duties (from last generation).
    
    Returns:
        list: List of teacher summaries including load stats and verification status.
    """
    teachers = db.query(TeacherScheduleDB).all()
    
    # 1. Fetch Configuration for Target Calculation
    duty_config = db.query(DutyConfigDB).filter(DutyConfigDB.key == 'duty_rules').first()
    config_data = duty_config.value_json if duty_config else {}
    
    zones = config_data.get('zones', [])
    breaks = config_data.get('breaks', [])
    reqs = config_data.get('requirements', {})
    
    # Calculate Total Demand (Slots needed)
    daily_slots_needed = 0
    # Requirement structure: {zoneId: {breakId: count}}
    # Safe iteration
    for z in zones:
        z_reqs = reqs.get(z['id'], {})
        for b in breaks:
            daily_slots_needed += int(z_reqs.get(b['id'], 0))
            
    # Weekly Total (Mon-Fri)
    total_slots_needed = daily_slots_needed * 5
            
    # Calculate Total Supply (Total Lessons)
    total_lessons = 0
    teacher_lessons = {}
    for t in teachers:
        # Filter valid lessons (ignore phantom slots)
        count = len([s for s in t.schedule_json if s.get("subject")]) if t.schedule_json else 0
        teacher_lessons[t.teacher_code] = count
        total_lessons += count
        
    # 2. Fetch Actual Assignments (Last Generated)
    last_gen = db.query(DutyConfigDB).filter(DutyConfigDB.key == 'last_generated_schedule').first()
    gen_data = last_gen.value_json if last_gen else {}
    
    actual_counts = {}
    if gen_data and gen_data.get('status') == 'success':
        solution = gen_data.get('solution', [])
        for assignment in solution:
            tc = assignment.get('teacher_code')
            actual_counts[tc] = actual_counts.get(tc, 0) + 1

    return [
        {
            "teacher_code": i.teacher_code,
            "teacher_name": i.teacher_name,
            "is_verified": i.is_verified,
            "slots_count": teacher_lessons.get(i.teacher_code, 0),
            "target_duties": round((teacher_lessons.get(i.teacher_code, 0) / total_lessons * total_slots_needed)) if total_lessons > 0 else 0,
            "actual_duties": actual_counts.get(i.teacher_code, 0),
            "preferences": i.preferences_json,
            "manual_duties": i.manual_duties_json or []
        } 
        for i in teachers
    ]

@router.get("/{teacher_code}")
async def get_schedule(teacher_code: str, db: Session = Depends(get_db)):
    item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == teacher_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Teacher not found")
    # Transform back to Expected JSON format
    
    # Fetch Duties
    duty_config = db.query(DutyConfigDB).filter(DutyConfigDB.key == 'last_generated_schedule').first()
    duties = []
    if duty_config and duty_config.value_json:
        all_duties = duty_config.value_json.get('solution', [])
        duties = [d for d in all_duties if d.get('teacher_code') == teacher_code]

    return {
        "teacher_code": item.teacher_code,
        "teacher_name": item.teacher_name,
        "is_verified": item.is_verified,
        "schedule": item.schedule_json,
        "duties": duties,
        "manual_duties": item.manual_duties_json or [],
        "preferences": item.preferences_json or {}
    }

@router.get("/{teacher_code}/pdf")
async def get_schedule_pdf(teacher_code: str, db: Session = Depends(get_db)):
    # Reuse logic to fetch data
    item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == teacher_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    duty_config = db.query(DutyConfigDB).filter(DutyConfigDB.key == 'last_generated_schedule').first()
    duties = []
    if duty_config and duty_config.value_json:
        all_duties = duty_config.value_json.get('solution', [])
        duties = [d for d in all_duties if d.get('teacher_code') == teacher_code]
        
    pdf_buffer = generate_teacher_pdf(
        teacher_name=item.teacher_name,
        teacher_code=item.teacher_code,
        schedule=item.schedule_json,
        duties=duties
    )
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=Plan_{teacher_code}.pdf"}
    )

@router.delete("/{teacher_code}")
async def delete_schedule(teacher_code: str, db: Session = Depends(get_db)):
    item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == teacher_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    db.delete(item)
    db.commit()
    return {"status": "deleted", "teacher_code": teacher_code}

class ManualDutyRequest(BaseModel):
    teacher_code: str
    day: str
    break_index: int
    zone_id: str
    action: str # 'add' or 'remove'

@router.post("/manual-duty")
async def set_manual_duty(req: ManualDutyRequest, db: Session = Depends(get_db)):
    """
    Atomic operation to manualy Add or Remove a duty assignment.
    
    Used by the Interactive Generator Grid (Pin/Unpin).
    - 'add': Upserts a manual duty for (Day, Break).
    - 'remove': Deletes manual duty for (Day, Break).
    
    Updates the 'manual_duties_json' field in TeacherScheduleDB.
    """
    teacher = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == req.teacher_code).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    current_duties = teacher.manual_duties_json or []
    if isinstance(current_duties, str):
        try: current_duties = json.loads(current_duties)
        except: current_duties = []
        
    # Remove existing for this slot (to avoid duplicates or update)
    current_duties = [d for d in current_duties if not (
        d.get('day') == req.day and 
        int(d.get('break_index')) == int(req.break_index)
    )]
    
    if req.action == 'add':
        current_duties.append({
            "day": req.day,
            "break_index": req.break_index,
            "zone_id": req.zone_id
        })
        
    teacher.manual_duties_json = current_duties
    # Force verification flag update if needed? Maybe not.
    db.commit()
    
    return {"status": "success", "manual_duties": current_duties}
