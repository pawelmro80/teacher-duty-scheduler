from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, TeacherScheduleDB
from models.schemas import TeacherSchedule
import json

router = APIRouter(prefix="/schedule", tags=["Schedule"])

@router.post("/save")
async def save_schedule(schedule: TeacherSchedule, db: Session = Depends(get_db)):
    # Check if exists
    db_item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == schedule.teacher_code).first()
    
    # Serialize schedule list to JSON
    slots_json = [s.dict() for s in schedule.schedule]

    if db_item:
        # Update
        db_item.teacher_name = schedule.teacher_name
        db_item.schedule_json = slots_json
        db_item.is_verified = True # Explicitly verify on save
    else:
        # Create
        db_item = TeacherScheduleDB(
            teacher_code=schedule.teacher_code,
            teacher_name=schedule.teacher_name,
            schedule_json=slots_json,
            is_verified=True
        )
        db.add(db_item)
    
    db.commit()
    db.refresh(db_item)
    return {"status": "success", "id": db_item.id}

@router.get("/")
async def list_schedules_root(db: Session = Depends(get_db)):
    return await list_schedules(db)

@router.get("/list")
async def list_schedules(db: Session = Depends(get_db)):
    items = db.query(TeacherScheduleDB).all()
    return [
        {
            "teacher_code": i.teacher_code,
            "teacher_name": i.teacher_name,
            "is_verified": i.is_verified,
            "slots_count": len(i.schedule_json) if i.schedule_json else 0
        } 
        for i in items
    ]

@router.get("/{teacher_code}")
async def get_schedule(teacher_code: str, db: Session = Depends(get_db)):
    item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == teacher_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Transform back to Expected JSON format
    return {
        "teacher_code": item.teacher_code,
        "teacher_name": item.teacher_name,
        "is_verified": item.is_verified,
        "schedule": item.schedule_json
    }

@router.delete("/{teacher_code}")
async def delete_schedule(teacher_code: str, db: Session = Depends(get_db)):
    item = db.query(TeacherScheduleDB).filter(TeacherScheduleDB.teacher_code == teacher_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    db.delete(item)
    db.commit()
    return {"status": "deleted", "teacher_code": teacher_code}
