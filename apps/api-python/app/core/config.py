from __future__ import annotations

from dataclasses import dataclass
from os import getenv


def _origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in value.split(',') if origin.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings for the public Python facade.

    The legacy target is deliberately configured as a fixed base URL.  A
    request can only supply a relative API path, never a host to proxy to.
    """

    api_port: int
    legacy_api_url: str
    legacy_timeout_seconds: float
    cors_origins: tuple[str, ...]
    postgres_host: str
    postgres_port: int
    redis_host: str
    redis_port: int
    minio_host: str
    minio_port: int

    @classmethod
    def from_environment(cls) -> 'Settings':
        return cls(
            api_port=int(getenv('API_PORT', '4000')),
            legacy_api_url=getenv('LEGACY_API_URL', 'http://api-legacy:4001').rstrip('/'),
            legacy_timeout_seconds=float(getenv('LEGACY_API_TIMEOUT_SECONDS', '30')),
            cors_origins=_origins(getenv('API_CORS_ORIGIN', 'http://localhost:3000')),
            postgres_host=getenv('POSTGRES_HOST', 'postgres'),
            postgres_port=int(getenv('POSTGRES_PORT_INTERNAL', '5432')),
            redis_host=getenv('REDIS_HOST', 'redis'),
            redis_port=int(getenv('REDIS_PORT_INTERNAL', '6379')),
            minio_host=getenv('MINIO_HOST', 'minio'),
            minio_port=int(getenv('MINIO_PORT_INTERNAL', '9000')),
        )
