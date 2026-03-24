"""
Authentication & License Management API.

Endpoints:
- POST /api/auth/setup-admin: Create initial admin user.
- POST /api/auth/login: JSON login.
- POST /api/auth/token: OAuth2 form login.
- GET  /api/auth/me: Current user info.
- POST /api/auth/activate: Save license key.
- GET  /api/auth/status: Check license validity.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
import jwt  # PyJWT
import bcrypt
import os

from database import get_db, User
from models.auth_schemas import UserCreate, Token, TokenData

# CONFIG
SECRET_KEY = os.environ.get("JWT_SECRET", "CHANGE_ME_IN_PROD_TO_SOMETHING_VERY_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 Day

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


# --- Helpers ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# --- Dependencies ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user


# --- Endpoints ---

@router.post("/setup-admin", response_model=Token)
async def setup_admin(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Creates the FIRST user (Admin).
    Fails if any user already exists.
    """
    if db.query(User).first():
        raise HTTPException(status_code=400, detail="Admin already exists. Use login.")

    hashed = get_password_hash(user_data.password)
    new_user = User(username=user_data.username, hashed_password=hashed, is_admin=True)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Auto-login
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
async def login_json(user_data: UserCreate, db: Session = Depends(get_db)):
    """JSON body login (used by frontend)."""
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "is_admin": current_user.is_admin}


# --- License Management ---
from pydantic import BaseModel


class LicenseActivationPayload(BaseModel):
    license_key: str


@router.post("/activate")
async def activate_license(payload: LicenseActivationPayload):
    """Saves the license key to the server file system."""
    try:
        with open("license.key", "w") as f:
            f.write(payload.license_key)
        return {"status": "success", "message": "License saved."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def license_status():
    """Checks if a valid license file exists and is unexpired."""
    if not os.path.exists("license.key"):
        return {"licensed": False, "message": "No license key found."}

    if not os.path.exists("public_key.pem"):
        return {"licensed": False, "message": "System integrity error (Public Key missing)."}

    try:
        with open("public_key.pem", "rb") as f:
            pub_key = f.read()
        with open("license.key", "r") as f:
            token = f.read().strip()

        from services.licensing import LicenseVerifier
        verifier = LicenseVerifier(pub_key)
        claims = verifier.verify_license(token)

        return {"licensed": True, "claims": claims}
    except Exception as e:
        return {"licensed": False, "message": str(e)}
