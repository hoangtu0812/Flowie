from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from functools import wraps
import inspect
from typing import Any, get_type_hints

from fastapi import APIRouter
from fastapi.routing import APIRoute
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response


def utc_response_value(value: Any) -> Any:
    """UTC-naive database instants gain an offset only at the response boundary."""
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    if isinstance(value, Response):
        return value
    if isinstance(value, BaseModel):
        return value.model_copy(update={key: utc_response_value(getattr(value, key)) for key in type(value).model_fields})
    if isinstance(value, Mapping):
        return {key: utc_response_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [utc_response_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(utc_response_value(item) for item in value)
    return value


def _utc_endpoint(endpoint: Callable) -> Callable:
    if getattr(endpoint, "_flowie_utc_response", False):
        return endpoint

    @wraps(endpoint)
    async def operation(*args, **kwargs):
        result = await endpoint(*args, **kwargs) if inspect.iscoroutinefunction(endpoint) else await run_in_threadpool(endpoint, *args, **kwargs)
        return utc_response_value(result)

    # Evaluated annotations preserve dependency injection across module namespaces.
    hints = get_type_hints(endpoint, include_extras=True)
    signature = inspect.signature(endpoint)
    operation.__signature__ = signature.replace(
        parameters=[parameter.replace(annotation=hints.get(name, parameter.annotation)) for name, parameter in signature.parameters.items()],
        return_annotation=hints.get("return", signature.return_annotation),
    )
    operation.__annotations__ = hints
    operation._flowie_utc_response = True
    return operation


class UtcAPIRoute(APIRoute):
    def __init__(self, path: str, endpoint: Callable, **kwargs):
        super().__init__(path, _utc_endpoint(endpoint), **kwargs)


class UtcAPIRouter(APIRouter):
    def __init__(self, **kwargs):
        kwargs.setdefault("route_class", UtcAPIRoute)
        super().__init__(**kwargs)
