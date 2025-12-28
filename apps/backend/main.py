from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from api import ocr, schedule, config, solver
from database import init_db, SessionLocal, DutyConfigDB
load_dotenv() # Load env vars from .env

app = FastAPI(title="Teacher Duty Scheduler API")

@app.on_event("startup")
def on_startup():
    init_db()
    seed_data()

def seed_data():
    db = SessionLocal()
    try:
        key = "duty_rules"
        if not db.query(DutyConfigDB).filter(DutyConfigDB.key == key).first():
            print("Seeding default duty configuration...")
            default_config = {
                "zones": [
                    {"id": "S1", "name": "Boisko"},
                    {"id": "S2", "name": "Parter (Gimn.)"},
                    {"id": "S3", "name": "Parter (41-42)"},
                    {"id": "S4", "name": "Piwnica"},
                    {"id": "S5", "name": "Parter (13-14)"},
                    {"id": "S6", "name": "I Piętro"},
                    {"id": "S7", "name": "II Piętro"}
                ],
                "breaks": [
                    {"id": "b1", "name": "Po 1. lekcji", "afterLesson": 1, "duration": 10},
                    {"id": "b2", "name": "Po 2. lekcji", "afterLesson": 2, "duration": 10},
                    {"id": "b3", "name": "Po 3. lekcji", "afterLesson": 3, "duration": 10},
                    {"id": "b4", "name": "Po 4. lekcji", "afterLesson": 4, "duration": 20},
                    {"id": "b5", "name": "Po 5. lekcji", "afterLesson": 5, "duration": 10},
                    {"id": "b6", "name": "Po 6. lekcji", "afterLesson": 6, "duration": 10},
                    {"id": "b7", "name": "Po 7. lekcji", "afterLesson": 7, "duration": 5}
                ],
                "requirements": {}, # Can be filled via UI
                "rules": {
                    "max_duties_per_day": 2,
                    "max_weekly_edge_duties": 2
                }
            }
            db.add(DutyConfigDB(key=key, value_json=default_config))
            db.commit()
    finally:
        db.close()

# Configure CORS for Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(solver.router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
    