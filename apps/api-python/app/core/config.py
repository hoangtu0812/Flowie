from __future__ import annotations

from dataclasses import dataclass
from os import getenv
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def _origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in value.split(',') if origin.strip())


def _async_database_url(value: str) -> str:
    """Convert Prisma's PostgreSQL URL into SQLAlchemy's asyncpg URL."""

    parsed = urlsplit(value)
    scheme = 'postgresql+asyncpg' if parsed.scheme == 'postgresql' else parsed.scheme
    query = urlencode([(key, item) for key, item in parse_qsl(parsed.query) if key != 'schema'])
    return urlunsplit((scheme, parsed.netloc, parsed.path, query, parsed.fragment))


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
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    s3_region: str
    database_url: str
    auth_jwt_secret: str
    auth_access_token_ttl_seconds: int
    auth_refresh_token_ttl_days: int
    auth_cookie_secure: bool

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
            s3_endpoint=getenv('S3_ENDPOINT', 'http://minio:9000'),
            s3_access_key=getenv('S3_ACCESS_KEY', 'minioadmin'),
            s3_secret_key=getenv('S3_SECRET_KEY', 'minioadmin123'),
            s3_bucket=getenv('S3_BUCKET', 'flowie'),
            s3_region=getenv('S3_REGION', 'us-east-1'),
            database_url=_async_database_url(getenv('DATABASE_URL', 'postgresql://circle:circle@postgres:5432/circle')),
            auth_jwt_secret=getenv('AUTH_JWT_SECRET', 'development-only-change-me'),
            auth_access_token_ttl_seconds=int(getenv('AUTH_ACCESS_TOKEN_TTL_SECONDS', '900')),
            auth_refresh_token_ttl_days=int(getenv('AUTH_REFRESH_TOKEN_TTL_DAYS', '30')),
            auth_cookie_secure=getenv('AUTH_COOKIE_SECURE', 'false').lower() == 'true',
        )
