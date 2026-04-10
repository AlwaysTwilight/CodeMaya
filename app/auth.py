import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from pymongo.errors import DuplicateKeyError

from app.db import ensure_indexes, get_db, now_utc


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "").strip()
    if not secret:
        raise ValueError("Missing JWT_SECRET")
    return secret


def _jwt_expires_in() -> timedelta:
    raw = os.getenv("JWT_EXPIRES_IN", "7d").strip().lower()
    if raw.endswith("d"):
        return timedelta(days=int(raw[:-1] or "7"))
    if raw.endswith("h"):
        return timedelta(hours=int(raw[:-1] or "24"))
    if raw.endswith("m"):
        return timedelta(minutes=int(raw[:-1] or "60"))
    # fallback: seconds
    return timedelta(seconds=int(raw or "604800"))


def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))


def verify_password(password: str, password_hash: bytes) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash)
    except Exception:
        return False


def register_user(email: str, password: str) -> str:
    ensure_indexes()
    db = get_db()
    email_norm = email.strip().lower()
    if not email_norm or "@" not in email_norm:
        raise ValueError("Invalid email")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")

    doc = {
        "email": email_norm,
        "passwordHash": hash_password(password),
        "createdAt": now_utc(),
    }
    try:
        res = db.users.insert_one(doc)
    except DuplicateKeyError:
        raise ValueError("Email already registered")
    return str(res.inserted_id)


def login_user(email: str, password: str) -> str:
    ensure_indexes()
    db = get_db()
    email_norm = email.strip().lower()
    user = db.users.find_one({"email": email_norm})
    if not user:
        raise ValueError("Invalid email or password")
    if not verify_password(password, user.get("passwordHash", b"")):
        raise ValueError("Invalid email or password")
    return issue_jwt(user_id=str(user["_id"]), email=user["email"])


def issue_jwt(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + _jwt_expires_in()
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def verify_jwt(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ValueError("Session expired. Please login again.")
    except Exception:
        raise ValueError("Invalid token. Please login again.")


def get_user_from_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    payload = verify_jwt(token)
    return {"userId": payload.get("sub"), "email": payload.get("email")}

