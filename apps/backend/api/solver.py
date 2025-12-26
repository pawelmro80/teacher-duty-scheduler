from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, DutyConfigDB
from services.solver.engine import DutySolver

router = APIRouter(prefix="/solver", tags=["Solver"])

@router.post("/generate")
async def generate_duties(db: Session = Depends(get_db)):
    """
    Triggers the optimization engine.
    Returns the generated duty roster.
    Also persists successful generation to DB.
    """
    try:
        engine = DutySolver(db)
        result = engine.solve()
        
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
from services.pdf_service import generate_schedule_pdf
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
