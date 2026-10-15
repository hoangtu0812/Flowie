from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, error: str) -> None:
        self.status_code = status_code
        self.message = message
        self.error = error


async def api_error_handler(request: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={'message': error.message, 'error': error.error, 'statusCode': error.status_code, 'requestId':getattr(request.state,'request_id',None)},
        headers=_auth_headers(request),
    )


async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    first = error.errors()[0] if error.errors() else {}
    message = str(first.get('msg', 'Validation failed.'))
    return JSONResponse(
        status_code=400,
        content={'message': message, 'error': 'Bad Request', 'statusCode': 400},
        headers=_auth_headers(request),
    )


def _auth_headers(request):
    return {'Cache-Control': 'private, no-store'} if request.url.path.startswith(('/api/v1/auth/', '/api/v1/account-security')) else None
