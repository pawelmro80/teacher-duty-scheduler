from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from api import ocr, schedule, config, solver, auth
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

# --- License Middleware ---
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from services.licensing import LicenseVerifier

# Load Public Key (Fail softly if missing for dev, or hard for prod)
PUBLIC_KEY = None
if os.path.exists("public_key.pem"):
    with open("public_key.pem", "rb") as f:
        PUBLIC_KEY = f.read()

@app.middleware("http")
async def check_license(request: Request, call_next):
    # whitelist
    if request.url.path.startswith("/api/auth") or \
       request.url.path.startswith("/health") or \
       request.url.path.startswith("/docs") or \
       request.url.path.startswith("/openapi.json"):
        return await call_next(request)

    # If public key is missing -> Block usage (Safety)
    if not PUBLIC_KEY:
         return JSONResponse(status_code=503, content={"detail": "System Integrity Error: Missing Public Key."})

    # Check License File
    if not os.path.exists("license.key"):
         return JSONResponse(status_code=402, content={"detail": "License Missing. Please activate."})
    
    try:
        with open("license.key", "r") as f:
            token = f.read().strip()
            
        verifier = LicenseVerifier(PUBLIC_KEY)
        verifier.verify_license(token)
        # License OK
    except Exception as e:
        return JSONResponse(status_code=402, content={"detail": f"License Invalid: {str(e)}"})
        
    response = await call_next(request)
    return response

app.include_router(ocr.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(solver.router, prefix="/api")
app.include_router(auth.router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
    