# -*- coding: utf-8 -*-
"""Authentication endpoints - Multi-user JWT + legacy admin support."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_db
from src.auth_multi import (
    update_user_notification,
    authenticate_user,
    count_users,
    create_jwt_token,
    decode_jwt_token,
    get_user_by_id,
    get_user_config,
    register_user,
    seed_admin_user,
    update_user_config,
    update_user_llm,
)
from src.auth import (
    COOKIE_NAME,
    change_password,
    check_rate_limit,
    clear_rate_limit,
    create_session,
    get_client_ip,
    has_stored_password,
    is_auth_enabled,
    is_password_changeable,
    is_password_set,
    record_login_failure,
    set_initial_password,
    verify_password,
    verify_session,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------- Request Schemas ----------

class LoginRequest(BaseModel):
    username: str = Field(default="", description="Username (multi-user) or empty (legacy admin)")
    password: str = Field(default="", description="Password")
    password_confirm: str | None = Field(default=None, alias="passwordConfirm")


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=32)
    email: str = Field(default="")
    password: str = Field(..., min_length=6)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(default="", alias="currentPassword")
    new_password: str = Field(default="", alias="newPassword")
    new_password_confirm: str = Field(default="", alias="newPasswordConfirm")


class UserConfigUpdate(BaseModel):
    stock_list: list[str] | None = None
    language: str | None = None
    deepseek_api_key: str | None = None
    deepseek_base_url: str | None = None
    llm_model: str | None = None
    notification_channels: dict | None = None


# ---------- Status ----------

@router.get("/status", summary="Auth status")
async def auth_status(request: Request, db: Session = Depends(get_db)):
    """Return current auth state including multi-user info."""
    multi_user = count_users(db) > 0

    # Check JWT token
    token = _extract_bearer_token(request)
    current_user = None
    if token:
        payload = decode_jwt_token(token)
        if payload:
            current_user = get_user_by_id(db, int(payload["sub"]))

    response = {
        "authEnabled": True,  # Always enabled in multi-user mode
        "loggedIn": current_user is not None or (
            is_auth_enabled() and verify_session(request.cookies.get(COOKIE_NAME))
        ) if not multi_user else current_user is not None,
        "passwordSet": multi_user or is_password_set(),
        "passwordChangeable": is_password_changeable() if not multi_user else False,
        "setupState": "enabled" if (multi_user or is_password_set()) else "no_password",
        "multiUser": multi_user,
        "username": current_user.username if current_user else None,
    }
    return response


# ---------- Register ----------

@router.post("/register", summary="Register new user")
async def auth_register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account. Returns JWT token on success."""
    user, error = register_user(db, body.username, body.email, body.password)
    if error:
        return JSONResponse(status_code=400, content={"error": "registration_failed", "message": error})

    token = create_jwt_token(user.id, user.username)
    return {"token": token, "username": user.username}


# ---------- Login ----------

@router.post("/login", summary="Login (multi-user or admin)")
async def auth_login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """Multi-user JWT login, with legacy admin cookie fallback."""
    multi_user = count_users(db) > 0
    ip = get_client_ip(request)

    if not check_rate_limit(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "message": "Too many failed attempts. Please try again later."},
        )

    username = (body.username or "").strip().lower()
    password = (body.password or "").strip()

    # Multi-user JWT login
    if multi_user and username:
        user, error = authenticate_user(db, username, password)
        if error:
            record_login_failure(ip)
            return JSONResponse(status_code=401, content={"error": "invalid_credentials", "message": error})

        clear_rate_limit(ip)
        token = create_jwt_token(user.id, user.username)
        return {"token": token, "username": user.username}

    # Legacy admin first-time setup (no users yet)
    if not multi_user and not is_password_set():
        confirm = (body.password_confirm or "").strip()
        if password != confirm:
            record_login_failure(ip)
            return JSONResponse(status_code=400, content={"error": "password_mismatch", "message": "Passwords do not match"})

        err = set_initial_password(password)
        if err:
            record_login_failure(ip)
            return JSONResponse(status_code=400, content={"error": "invalid_password", "message": err})

        # After setting admin password, seed the admin user
        admin_user, _ = seed_admin_user(db)
        if admin_user:
            token = create_jwt_token(admin_user.id, admin_user.username)
            return {"token": token, "username": "admin"}

        # Fallback: old cookie method
        session_val = create_session()
        resp = JSONResponse(content={"ok": True})
        _set_session_cookie(resp, session_val, request)
        return resp

    # Legacy admin login (has users but using old admin password)
    if not multi_user and is_password_set():
        if not verify_password(password):
            record_login_failure(ip)
            return JSONResponse(status_code=401, content={"error": "invalid_password", "message": "Invalid password"})

        clear_rate_limit(ip)
        session_val = create_session()
        resp = JSONResponse(content={"ok": True})
        _set_session_cookie(resp, session_val, request)
        return resp

    return JSONResponse(status_code=400, content={"error": "bad_request", "message": "Invalid login request"})


# ---------- Logout ----------

@router.post("/logout", summary="Logout")
async def auth_logout(request: Request):
    """Clear all auth state."""
    resp = Response(status_code=204)
    resp.delete_cookie(key=COOKIE_NAME, path="/")
    return resp


# ---------- Change Password (legacy admin) ----------

@router.post("/change-password", summary="Change password")
async def auth_change_password(body: ChangePasswordRequest):
    """Change admin password (legacy)."""
    if not is_password_changeable():
        return JSONResponse(status_code=400, content={"error": "not_changeable", "message": "Password cannot be changed"})

    current = (body.current_password or "").strip()
    new_pwd = (body.new_password or "").strip()
    new_confirm = (body.new_password_confirm or "").strip()

    if not current:
        return JSONResponse(status_code=400, content={"error": "current_required", "message": "Current password required"})
    if new_pwd != new_confirm:
        return JSONResponse(status_code=400, content={"error": "password_mismatch", "message": "New passwords don't match"})

    err = change_password(current, new_pwd)
    if err:
        return JSONResponse(status_code=400, content={"error": "invalid_password", "message": err})
    return Response(status_code=204)


# ---------- User Profile ----------

@router.get("/me", summary="Get current user")
async def get_me(request: Request, db: Session = Depends(get_db)):
    """Return current user info and config."""
    user = _get_current_user_from_request(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "unauthorized", "message": "Not authenticated"})

    config = get_user_config(db, user.id)
    return {
        "user": user.to_dict(),
        "config": {
            "stock_list": json.loads(config.stock_list or "[]") if config else [],
            "language": config.language if config else "zh",
            "notification_channels": json.loads(user.notification_channels or "{}"),
            "deepseek_api_key": bool(user.deepseek_api_key),
            "deepseek_base_url": user.deepseek_base_url or "",
            "llm_model": user.llm_model or "",
        },
    }


@router.put("/config", summary="Update user config")
async def update_my_config(request: Request, body: UserConfigUpdate, db: Session = Depends(get_db)):
    """Update current user's config."""
    user = _get_current_user_from_request(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "unauthorized", "message": "Not authenticated"})

    # Update stock_list and language
    uc_updates = {}
    if body.stock_list is not None:
        uc_updates["stock_list"] = body.stock_list
    if body.language is not None:
        uc_updates["language"] = body.language
    if uc_updates:
        _, error = update_user_config(db, user.id, uc_updates)
        if error:
            return JSONResponse(status_code=500, content={"error": "update_failed", "message": error})

    # Update notification_channels
    if body.notification_channels is not None:
        _, error = update_user_notification(db, user.id, body.notification_channels)
        if error:
            return JSONResponse(status_code=500, content={"error": "update_failed", "message": error})

    # Update LLM settings
    llm_updates = {}
    if body.deepseek_api_key is not None:
        llm_updates["deepseek_api_key"] = body.deepseek_api_key
    if body.deepseek_base_url is not None:
        llm_updates["deepseek_base_url"] = body.deepseek_base_url
    if body.llm_model is not None:
        llm_updates["llm_model"] = body.llm_model
    if llm_updates:
        _, error = update_user_llm(db, user.id, llm_updates)
        if error:
            return JSONResponse(status_code=500, content={"error": "update_failed", "message": error})

    return {"ok": True}


# ---------- Helpers ----------

def _extract_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _get_current_user_from_request(request: Request, db: Session):
    token = _extract_bearer_token(request)
    if not token:
        return None
    payload = decode_jwt_token(token)
    if not payload:
        return None
    return get_user_by_id(db, int(payload["sub"]))


def _set_session_cookie(response: Response, session_value: str, request: Request) -> None:
    """Attach legacy admin session cookie."""
    import os
    from src.auth import COOKIE_NAME as CN, SESSION_MAX_AGE_HOURS_DEFAULT

    secure = False
    if os.getenv("TRUST_X_FORWARDED_FOR", "false").lower() == "true":
        proto = request.headers.get("X-Forwarded-Proto", "").lower()
        secure = proto == "https"
    else:
        secure = request.url.scheme == "https"

    try:
        max_age_hours = int(os.getenv("ADMIN_SESSION_MAX_AGE_HOURS", str(SESSION_MAX_AGE_HOURS_DEFAULT)))
    except ValueError:
        max_age_hours = SESSION_MAX_AGE_HOURS_DEFAULT

    response.set_cookie(
        key=CN,
        value=session_value,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
        max_age=max_age_hours * 3600,
    )
