# -*- coding: utf-8 -*-
"""
Auth middleware: protect /api/v1/* with JWT Bearer or cookie session.
"""

from __future__ import annotations

import logging
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from src.auth import COOKIE_NAME, is_auth_enabled, verify_session
from src.auth_multi import count_users, decode_jwt_token, get_user_by_id
from api.deps import get_db

logger = logging.getLogger(__name__)

EXEMPT_PATHS = frozenset({
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/status",
    "/api/v1/auth/logout",
    "/api/health",
    "/api/v1/health",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
})


def _path_exempt(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return normalized in EXEMPT_PATHS


class AuthMiddleware(BaseHTTPMiddleware):
    """Require valid JWT or cookie session for /api/v1/* routes."""

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        if _path_exempt(path):
            return await call_next(request)

        if not path.startswith("/api/v1/"):
            return await call_next(request)

        # Check JWT Bearer token first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_jwt_token(token)
            if payload:
                # Store user_id in request state for downstream use
                request.state.user_id = int(payload["sub"])
                request.state.username = payload.get("username", "")
                return await call_next(request)

        # Fallback: legacy cookie session
        if is_auth_enabled():
            cookie_val = request.cookies.get(COOKIE_NAME)
            if cookie_val and verify_session(cookie_val):
                return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "message": "Login required"},
        )


def add_auth_middleware(app):
    app.add_middleware(AuthMiddleware)


# FastAPI dependency for route-level auth
async def get_current_user(request: Request):
    """FastAPI dependency: extract current user from JWT token."""
    from fastapi import HTTPException
    from sqlalchemy.orm import Session

    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Access DB via app state or direct
    db_manager = request.app.state.db_manager if hasattr(request.app.state, "db_manager") else None
    if db_manager:
        db = db_manager.get_session()
        try:
            user = get_user_by_id(db, user_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user
        finally:
            db.close()

    raise HTTPException(status_code=500, detail="Database not available")
