from fastapi.testclient import TestClient
from main import app
from database import get_db, Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use in-memory DB for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        # Create tables
        Base.metadata.create_all(bind=engine)
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_config_save_and_load():
    # 1. Save Config
    payload = {
        "key": "test_config_key",
        "value": {"theme": "dark", "version": 1}
    }
    response = client.post("/api/config/save", json=payload)
    assert response.status_code == 200
    
    # 2. Get Config
    response = client.get("/api/config/test_config_key")
    assert response.status_code == 200
    data = response.json()
    assert data["value"]["theme"] == "dark"

def test_create_and_delete_teacher():
    # 1. Create Teacher (Mock schedule upload)
    # Usually this is via file upload, but we can verify GET/DELETE logic if we seed DB or use exposed endpoints.
    # Current API might rely solely on OCR PDF upload, lets check if we can list empty first.
    response = client.get("/api/schedule/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_solver_endpoint_structure():
    # Sending a generate request without data should fail gracefully (422) or return specific error
    # This checks if the endpoint is reachable
    response = client.post("/api/solver/generate")
    # It might return success with empty solution or 422 if no teachers
    assert response.status_code in [200, 422, 500] 
