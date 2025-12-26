from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from api import ocr, schedule, config, solver
from database import init_db

load_dotenv() # Load env vars from .env

app = FastAPI(title="Teacher Duty Scheduler API")

@app.on_event("startup")
def on_startup():
    init_db()

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
    