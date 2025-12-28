from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, DutyConfigDB
from services.solver.engine import DutySolver
from pydantic import BaseModel
from typing import List, Any

router = APIRouter(prefix="/solver", tags=["Solver"])

class GenerateRequest(BaseModel):
    pinned_assignments: List[dict] = []

class CandidateRequest(BaseModel):
    day: str
    break_index: int
    zone_name: str

@router.post("/candidates")
async def get_candidates(req: CandidateRequest, db: Session = Depends(get_db)):
    """
    Returns list of eligible teachers for a specific slot.
    """
    engine = DutySolver(db)
    # Ensure config loaded
    if not engine.teachers: 
        raise HTTPException(status_code=400, detail="Configuration not loaded")
        
    results = engine.search_candidates(req.day, req.break_index, req.zone_name)
    return results

@router.post("/generate")
async def generate_duties(req: GenerateRequest = GenerateRequest(), db: Session = Depends(get_db)):
    """
    Triggers the optimization engine.
    Returns the generated duty roster.
    Also persists successful generation to DB.
    """
    try:
        engine = DutySolver(db)
        
        # --- FETCH MANUAL DUTIES (PINNED) ---
        # Query all teachers to get their manual duties
        from database import TeacherScheduleDB
        from models.schemas import ManualDuty
        import json
        
        teachers_db = db.query(TeacherScheduleDB).all()
        # Dictionary to deduplicate pins by (Teacher, Day, Break)
        # Priority: Database (Manual Duties) > Request (Frontend DnD)
        pins_map = {}

        # 1. Add request-level pins (Frontend state)
        if req.pinned_assignments:
            for p in req.pinned_assignments:
                # Normalize key: break_index as int
                try: b_idx = int(p.get('break_index'))
                except: b_idx = p.get('break_index') # Fallback
                
                key = (p.get('teacher_code'), p.get('day'), b_idx)
                pins_map[key] = p

        # 2. Add/Overwrite with database-level pins (Saved Manual Duties)
        print(f"DEBUG: Processing DB Pins for {len(teachers_db)} teachers...")
        for t in teachers_db:
            if t.manual_duties_json:
                duties = t.manual_duties_json
                if isinstance(duties, str):
                    try: duties = json.loads(duties)
                    except: duties = []
                    
                for d in duties:
                    # Construct pin object from DB data
                    pin_obj = {
                        "teacher_code": t.teacher_code,
                        "day": d.get('day'),
                        "break_index": d.get('break_index'),
                        "zone_id": d.get('zone_id')
                    }
                    # Helper for key (make sure break_index is consistent type/value for hashing)
                    # We assume break_index is int or string that converts to same int
                    try: b_idx = int(d.get('break_index'))
                    except: b_idx = d.get('break_index')
                    
                    # Store in map (OVERWRITES existing pin from frontend)
                    key = (t.teacher_code, d.get('day'), b_idx)
                    
                    if key in pins_map:
                        print(f"DEBUG: Overwriting Frontend Pin for {key} with DB Pin {pin_obj}")
                    else:
                        pass # print(f"DEBUG: Adding DB Pin {pin_obj}")

                    pins_map[key] = pin_obj

        aggregated_pins = list(pins_map.values())
        print(f"DEBUG: Final Aggregated Pins count: {len(aggregated_pins)}")
        # Check specific trace for RW
        for p in aggregated_pins:
            if p.get('teacher_code') == 'RW' and p.get('day') == 'Tue':
                print(f"DEBUG: RW Tue Pin resolved to: {p}")
        
        print(f"DEBUG: Solver running with {len(aggregated_pins)} pinned duties.")
        
        result = engine.solve(pinned_assignments=aggregated_pins)
        
        if result['status'] == 'failed':
            # 422 Unprocessable Entity
            raise HTTPException(status_code=422, detail=result['message'])
        
        # PERSIST RESULTS
        if result['status'] == 'success':
            key = 'last_generated_schedule'
            db_item = db.query(DutyConfigDB).filter(DutyConfigDB.key == key).first()
            if db_item:
                db_item.value_json = result
            else:
                db_item = DutyConfigDB(key=key, value_json=result)
                db.add(db_item)
            db.commit()

        return result
        
    except Exception as e:
        print(f"Solver Error: {e}")
        # Return 500 but try not to crash client totally
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import StreamingResponse
from services.pdf_service import generate_schedule_pdf, generate_schedule_by_zone_pdf
from pydantic import BaseModel
from typing import List, Any

class ExportRequest(BaseModel):
    assignments: List[dict]
    zones: List[str] = []
    break_labels: dict = {} # index (str) -> label

@router.post("/export/pdf")
async def export_pdf(req: ExportRequest):
    """
    Generates PDF from the provided assignment list.
    """
    try:
        # Generate PDF in memory
        pdf_buffer = generate_schedule_pdf(req.assignments, req.zones, req.break_labels)
        
        # Return as downloadable file
        headers = {
            'Content-Disposition': 'attachment; filename="dyzury.pdf"'
        }
        return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)
    except Exception as e:
        print(f"PDF Error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")

@router.post("/export/pdf-zone")
async def export_pdf_zone(req: ExportRequest):
    """
    Generates PDF grouped by Zone.
    """
    try:
        # Generate PDF in memory
        pdf_buffer = generate_schedule_by_zone_pdf(req.assignments, req.zones)
        
        # Return as downloadable file
        headers = {
            'Content-Disposition': 'attachment; filename="dyzury_sektory.pdf"'
        }
        return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)
    except Exception as e:
        print(f"PDF Zone Error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")
