from sqlalchemy import create_engine, Column, Integer, String, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = "sqlite:///./teacher_scheduler_v2.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class TeacherScheduleDB(Base):
    __tablename__ = "teacher_schedules"

    id = Column(Integer, primary_key=True, index=True)
    teacher_code = Column(String, unique=True, index=True)
    teacher_name = Column(String)
    is_verified = Column(Boolean, default=False)
    schedule_json = Column(JSON) # Storing full schedule as JSON blob for simplicity in Sprint 0

class DutyConfigDB(Base):
    __tablename__ = "duty_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True) # e.g. "zones", "time_slots"
    value_json = Column(JSON)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
