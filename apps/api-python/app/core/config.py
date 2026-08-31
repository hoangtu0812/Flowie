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
    """Runtime settings for the API."""

    api_port: int
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
    app_url: str
    auth_jwt_secret: str
    auth_access_token_ttl_seconds: int
    auth_refresh_token_ttl_days: int
    auth_cookie_secure: bool
    admin_email: str
    azure_ad_tenant_id: str
    azure_ad_client_id: str
    azure_ad_client_secret: str
    azure_ad_redirect_uri: str
    discord_bot_token: str
    discord_bot_channel_id: str
    discord_bot_guild_id: str
    discord_registration_channel_id: str
    discord_registration_channel_role_id: str
    registration_otp_ttl_seconds: int
    agent_secrets_encryption_key: str
    scm_secrets_encryption_key: str
    scm_github_app_id: str
    scm_github_app_private_key: str
    scm_github_webhook_secret: str

    @classmethod
    def from_environment(cls) -> 'Settings':
        return cls(
            api_port=int(getenv('API_PORT', '4000')),
            cors_origins=_origins(getenv('API_CORS_ORIGIN', 'http://localhost:3000')),
            postgres_host=getenv('POSTGRES_HOST', 'circle-postgres'),
            postgres_port=int(getenv('POSTGRES_PORT_INTERNAL', '5432')),
            redis_host=getenv('REDIS_HOST', 'circle-redis'),
            redis_port=int(getenv('REDIS_PORT_INTERNAL', '6379')),
            minio_host=getenv('MINIO_HOST', 'circle-minio'),
            minio_port=int(getenv('MINIO_PORT_INTERNAL', '9000')),
            s3_endpoint=getenv('S3_ENDPOINT', 'http://circle-minio:9000'),
            s3_access_key=getenv('S3_ACCESS_KEY', 'minioadmin'),
            s3_secret_key=getenv('S3_SECRET_KEY', 'minioadmin123'),
            s3_bucket=getenv('S3_BUCKET', 'flowie'),
            s3_region=getenv('S3_REGION', 'us-east-1'),
            database_url=_async_database_url(getenv('DATABASE_URL', 'postgresql://circle:circle@circle-postgres:5432/circle')),
            app_url=getenv('APP_URL', 'http://localhost:3000').rstrip('/'),
            auth_jwt_secret=getenv('AUTH_JWT_SECRET', 'development-only-change-me'),
            auth_access_token_ttl_seconds=int(getenv('AUTH_ACCESS_TOKEN_TTL_SECONDS', '900')),
            auth_refresh_token_ttl_days=int(getenv('AUTH_REFRESH_TOKEN_TTL_DAYS', '30')),
            auth_cookie_secure=getenv('AUTH_COOKIE_SECURE', 'false').lower() == 'true',
            admin_email=getenv('ADMIN_EMAIL', '').strip().lower(),
            azure_ad_tenant_id=getenv('AZURE_AD_TENANT_ID', '').strip(),
            azure_ad_client_id=getenv('AZURE_AD_CLIENT_ID', '').strip(),
            azure_ad_client_secret=getenv('AZURE_AD_CLIENT_SECRET', '').strip(),
            azure_ad_redirect_uri=getenv(
                'AZURE_AD_REDIRECT_URI',
                'http://localhost:4000/api/v1/auth/microsoft/callback',
            ).strip(),
            discord_bot_token=getenv('DISCORD_BOT_TOKEN', '').strip(),
            discord_bot_channel_id=getenv('DISCORD_BOT_CHANNEL_ID', '').strip(),
            discord_bot_guild_id=getenv('DISCORD_BOT_GUILD_ID', '').strip(),
            discord_registration_channel_id=getenv('DISCORD_REGISTRATION_CHANNEL_ID', '').strip(),
            discord_registration_channel_role_id=getenv('DISCORD_REGISTRATION_CHANNEL_ROLE_ID', '').strip(),
            registration_otp_ttl_seconds=int(getenv('REGISTRATION_OTP_TTL_SECONDS', '600')),
            agent_secrets_encryption_key=getenv('AGENT_SECRETS_ENCRYPTION_KEY', '').strip(),
            scm_secrets_encryption_key=getenv('SCM_SECRETS_ENCRYPTION_KEY', '').strip(),
            scm_github_app_id=getenv('SCM_GITHUB_APP_ID', '').strip(),
            scm_github_app_private_key=getenv('SCM_GITHUB_APP_PRIVATE_KEY', '').replace('\\n', '\n').strip(),
            scm_github_webhook_secret=getenv('SCM_GITHUB_WEBHOOK_SECRET', '').strip(),
        )
