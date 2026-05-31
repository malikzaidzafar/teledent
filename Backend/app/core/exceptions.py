"""
core/exceptions.py — RFC 7807 Problem Details error format + custom exception classes.
Registered on the FastAPI app in main.py.
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


class AppException(Exception):
    def __init__(self, status_code: int, title: str, detail: str, instance: str = ""):
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.instance = instance


class NotFoundException(AppException):
    def __init__(self, resource: str, resource_id: str = ""):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Resource Not Found",
            detail=f"{resource} '{resource_id}' does not exist." if resource_id else f"{resource} not found.",
        )


class ForbiddenException(AppException):
    def __init__(self, detail: str = "Insufficient permissions."):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, title="Forbidden", detail=detail)


class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Authentication required."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, title="Unauthorized", detail=detail)


class ConflictException(AppException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_409_CONFLICT, title="Conflict", detail=detail)


class BadRequestException(AppException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, title="Bad Request", detail=detail)


# ---------------------------------------------------------------------------
# Handlers (registered in main.py)
# ---------------------------------------------------------------------------

def _problem(status_code: int, title: str, detail: str, instance: str = "") -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "type": f"https://api.teledent.ai/errors/{title.lower().replace(' ', '-')}",
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": instance,
        },
        headers={"Content-Type": "application/problem+json"},
    )


async def app_exception_handler(request: Request, exc: AppException):
    return _problem(exc.status_code, exc.title, exc.detail, exc.instance or str(request.url.path))


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = "; ".join(f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors())
    return _problem(422, "Validation Error", errors, str(request.url.path))


async def generic_exception_handler(request: Request, exc: Exception):
    return _problem(500, "Internal Server Error", "An unexpected error occurred.", str(request.url.path))
