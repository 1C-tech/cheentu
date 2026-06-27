# -*- coding: utf-8 -*-
"""
Multi-user JWT authentication module.

Provides:
- JWT token creation/verification
- bcrypt password hashing
- User registration/login/logout
- FastAPI dependency: get_current_user
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple

import bcrypt
import jwt

from src.storage import DatabaseManager, User, UserConfig
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
MIN_PASSWORD_LEN = 6
MIN_USERNAME_LEN = 2
MAX_USERNAME_LEN = 32

_jwt_secret: Optional[bytes] = None


def _get_data_dir() -> Path:
    db_path = os.getenv("DATABASE_PATH", "./data/stock_analysis.db")
    return Path(db_path).resolve().parent


def _get_jwt_secret_path() -> Path:
    return _get_data_dir() / ".jwt_secret"


def get_jwt_secret() -> bytes:
    global _jwt_secret
    if _jwt_secret is not None:
        return _jwt_secret

    data_dir = _get_data_dir()
    secret_path = _get_jwt_secret_path()
    data_dir.mkdir(parents=True, exist_ok=True)

    try:
        if secret_path.exists():
            _jwt_secret = secret_path.read_bytes()
            if len(_jwt_secret) >= 32:
                return _jwt_secret

        _jwt_secret = secrets.token_bytes(32)
        with open(secret_path, "wb") as f:
            f.write(_jwt_secret)
        secret_path.chmod(0o600)
        return _jwt_secret
    except OSError as e:
        logger.error("Failed to load/create JWT secret: %s", e)
        _jwt_secret = secrets.token_bytes(32)
        return _jwt_secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password_hash(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_jwt_token(user_id: int, username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.debug("JWT token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid JWT token: %s", e)
        return None


def register_user(
    db: Session, username: str, email: str, password: str
) -> Tuple[Optional[User], Optional[str]]:
    """Register a new user. Returns (user, error_message)."""
    username = username.strip().lower()
    email = email.strip().lower()

    if len(username) < MIN_USERNAME_LEN:
        return None, f"Username must be at least {MIN_USERNAME_LEN} characters"
    if len(username) > MAX_USERNAME_LEN:
        return None, f"Username must be at most {MAX_USERNAME_LEN} characters"
    if not username.replace("_", "").replace("-", "").isalnum():
        return None, "Username can only contain letters, numbers, underscores, and hyphens"
    if len(password) < MIN_PASSWORD_LEN:
        return None, f"Password must be at least {MIN_PASSWORD_LEN} characters"

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return None, "Username already taken"

    try:
        user = User(
            username=username,
            password_hash=hash_password(password),
            email=email,
            is_active=True,
        )
        db.add(user)
        db.flush()

        config = UserConfig(user_id=user.id, stock_list="[]", language="zh")
        db.add(config)
        db.commit()

        logger.info("User registered: %s (id=%s)", username, user.id)
        return user, None
    except Exception as e:
        db.rollback()
        logger.error("Failed to register user: %s", e)
        return None, "Registration failed due to a server error"


def authenticate_user(db: Session, username: str, password: str) -> Tuple[Optional[User], Optional[str]]:
    """Authenticate user by username/password. Returns (user, error_message)."""
    username = username.strip().lower()

    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None, "Invalid username or password"
    if not user.is_active:
        return None, "Account is disabled"

    if not verify_password_hash(password, user.password_hash):
        return None, "Invalid username or password"

    return user, None


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()


def get_user_config(db: Session, user_id: int) -> Optional[UserConfig]:
    return db.query(UserConfig).filter(UserConfig.user_id == user_id).first()


def update_user_config(db: Session, user_id: int, updates: dict) -> Tuple[Optional[UserConfig], Optional[str]]:
    """Update user config fields. Returns (config, error)."""
    config = get_user_config(db, user_id)
    if not config:
        return None, "User config not found"

    if "stock_list" in updates:
        config.stock_list = json.dumps(updates["stock_list"])
    if "language" in updates:
        config.language = updates["language"]

    db.commit()
    db.refresh(config)
    return config, None


def update_user_llm(db: Session, user_id: int, updates: dict) -> Tuple[Optional[User], Optional[str]]:
    """Update user LLM settings. Returns (user, error)."""
    user = get_user_by_id(db, user_id)
    if not user:
        return None, "User not found"

    if "deepseek_api_key" in updates:
        user.deepseek_api_key = updates["deepseek_api_key"]
    if "deepseek_base_url" in updates:
        user.deepseek_base_url = updates["deepseek_base_url"]
    if "llm_model" in updates:
        user.llm_model = updates["llm_model"]

    db.commit()
    db.refresh(user)
    return user, None




def update_user_notification(db, user_id, notification_channels):
    user = get_user_by_id(db, user_id)
    if not user:
        return None, 'User not found'
    user.notification_channels = json.dumps(notification_channels)
    db.commit()
    db.refresh(user)
    return user, None

def count_users(db: Session) -> int:
    return db.query(User).count()


def seed_admin_user(db: Session, admin_password_hash: Optional[str] = None) -> Optional[User]:
    """Create default admin user on first run if no users exist."""
    if count_users(db) > 0:
        return None

    try:
        if admin_password_hash:
            # Migrate from old single-admin password
            password_hash = admin_password_hash
        else:
            password_hash = hash_password("admin123")

        user = User(
            username="admin",
            password_hash=password_hash,
            email="admin@cheentu.com",
            is_active=True,
        )
        db.add(user)
        db.flush()

        config = UserConfig(user_id=user.id, stock_list="[]", language="zh")
        db.add(config)
        db.commit()

        logger.info("Default admin user created")
        return user
    except Exception as e:
        db.rollback()
        logger.error("Failed to create admin user: %s", e)
        return None
