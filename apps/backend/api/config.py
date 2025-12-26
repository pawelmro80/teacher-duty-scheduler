from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, DutyConfigDB
from pydantic import BaseModel
from typing import List, Dict, Any

router = APIRouter(prefix="/config", tags=["Config"])

class ConfigItem(BaseModel):
    key: str
    value: Any

@router.get("/{key}")
async def get_config(key: str, db: Session = Depends(get_db)):
    item = db.query(DutyConfigDB).filter(DutyConfigDB.key == key).first()
    if not item:
        return {"key": key, "value": None}
    return {"key": item.key, "value": item.value_json}

@router.post("/save")
async def save_config(item: ConfigItem, db: Session = Depends(get_db)):
    db_item = db.query(DutyConfigDB).filter(DutyConfigDB.key == item.key).first()
    if db_item:
        db_item.value_json = item.value
    else:
        db_item = DutyConfigDB(key=item.key, value_json=item.value)
        db.add(db_item)
    
    db.commit()
    return {"status": "saved", "key": item.key}
