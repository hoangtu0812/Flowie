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
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_username: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    smtp_use_ssl: bool = False
    mcp_enabled: bool = False
    mcp_writes_enabled: bool = False
    mcp_allowed_hosts: tuple[str, ...] = ('localhost:*', '127.0.0.1:*', '[::1]:*')
    mcp_rate_limit: int = 60
    mcp_tool_timeout_seconds: int = 30
    mcp_max_result_bytes: int = 262144
    mcp_max_idempotency_keys: int = 10000
    # Public base of the REST API (".../api/v1") as agents reach it; MCP upload URLs start here.
    # VI: Gốc public của REST API (".../api/v1") mà agent truy cập được; URL upload MCP bắt đầu từ đây.
    api_public_url: str = 'http://localhost:4000/api/v1'
    auth_login_account_limit: int = 20
    auth_login_ip_limit: int = 300
    auth_mfa_encryption_keys: str = ''
    # Seconds between periodic source-control syncs for servers that webhooks cannot reach.
    # 0 disables it; positive values are raised to at least 60 to protect provider rate limits.
    # VI: Số giây giữa các lần đồng bộ source-control định kỳ cho server webhook không tới được.
    # 0 là tắt; giá trị dương tối thiểu 60 để bảo vệ giới hạn tần suất của provider.
    scm_sync_interval_seconds: int = 0
    # Seconds between team retention and cycle cadence scans; minimum 60.
    # VI: Số giây giữa các lượt quét chính sách lưu giữ và nhịp cycle của team; tối thiểu 60.
    team_policy_scan_interval_seconds: int = 3600
    # The scan cancels and archives people's issues on its own. It is the only implementation
    # since the BullMQ worker was removed, so it writes by default; TEAM_POLICY_WRITES_ENABLED=false
    # is the emergency switch that leaves it logging what it would do and writing nothing.
    # VI: Lượt quét tự huỷ và tự lưu trữ issue của người dùng. Từ khi worker BullMQ bị gỡ, đây là
    # bản cài đặt duy nhất nên mặc định nó ghi; TEAM_POLICY_WRITES_ENABLED=false là công tắc khẩn
    # cấp để nó chỉ log việc định làm và không ghi gì.
    team_policy_writes_enabled: bool = True
    # Level for the application's own loggers. Uvicorn configures only its own
    # `uvicorn.*` loggers and leaves the root logger at WARNING with no handler, so
    # without this every `logger.info` in `app/` is discarded — which is why a job
    # reporting what it would do produced no output at all. INFO by default because
    # the job logs are written to be read, and each one only speaks when it did
    # something.
    # VI: Mức log cho chính các logger của ứng dụng. Uvicorn chỉ cấu hình các logger
    # `uvicorn.*` của nó và để root ở mức WARNING không có handler, nên thiếu thiết lập
    # này thì mọi `logger.info` trong `app/` đều bị bỏ đi — đó chính là lý do một job
    # báo cáo việc nó định làm lại không in ra gì cả. Mặc định INFO vì các log của job
    # được viết ra để có người đọc, và mỗi log chỉ lên tiếng khi nó đã làm việc gì đó.
    log_level: str = 'INFO'
    # Lowercase `host` or `host:port` entries for self-hosted, OpenAI-compatible AI endpoints
    # (for example a LiteLLM gateway on the internal network). Workspace administrators may save
    # a provider URL on these hosts over HTTP or HTTPS; every other host must be the provider's
    # official HTTPS API. Empty keeps the official-host-only SSRF protection.
    # VI: Danh sách `host` hoặc `host:port` (chữ thường) cho endpoint AI nội bộ tương thích OpenAI
    # (ví dụ gateway LiteLLM trong mạng nội bộ). Quản trị workspace chỉ được lưu URL provider trên các
    # host này qua HTTP hoặc HTTPS; mọi host khác phải là API HTTPS chính thức của provider.
    # Để trống thì giữ nguyên bảo vệ SSRF chỉ cho phép host chính thức.
    agent_provider_allowed_hosts: tuple[str, ...] = ()

    @classmethod
    def from_environment(cls) -> Settings:
        return cls(
            api_port=int(getenv('API_PORT', '4000')),
            cors_origins=_origins(getenv('API_CORS_ORIGIN', 'http://localhost:3000')),
            postgres_host=getenv('POSTGRES_HOST', 'circle-postgres'),
            postgres_port=int(getenv('POSTGRES_PORT_INTERNAL', '5432')),
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
            auth_mfa_encryption_keys=getenv('AUTH_MFA_ENCRYPTION_KEYS', ''),
            auth_login_account_limit=max(1,int(getenv('AUTH_LOGIN_ACCOUNT_LIMIT','20'))),
            auth_login_ip_limit=max(1,int(getenv('AUTH_LOGIN_IP_LIMIT','300'))),
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
            agent_provider_allowed_hosts=_origins(getenv('AGENT_PROVIDER_ALLOWED_HOSTS', '').lower()),
            scm_secrets_encryption_key=getenv('SCM_SECRETS_ENCRYPTION_KEY', '').strip(),
            scm_github_app_id=getenv('SCM_GITHUB_APP_ID', '').strip(),
            scm_github_app_private_key=getenv('SCM_GITHUB_APP_PRIVATE_KEY', '').replace('\\n', '\n').strip(),
            scm_github_webhook_secret=getenv('SCM_GITHUB_WEBHOOK_SECRET', '').strip(),
            scm_sync_interval_seconds=_sync_interval(int(getenv('SCM_SYNC_INTERVAL_SECONDS', '0'))),
            team_policy_scan_interval_seconds=max(60, int(getenv('TEAM_POLICY_SCAN_INTERVAL_SECONDS', '3600'))),
            team_policy_writes_enabled=getenv('TEAM_POLICY_WRITES_ENABLED', 'true').lower() != 'false',
            log_level=getenv('LOG_LEVEL', 'INFO').strip().upper() or 'INFO',
            smtp_host=getenv('SMTP_HOST', '').strip(),
            smtp_port=int(getenv('SMTP_PORT', '587')),
            smtp_username=getenv('SMTP_USERNAME', '').strip(),
            smtp_password=getenv('SMTP_PASSWORD', ''),
            smtp_from=getenv('SMTP_FROM', '').strip(),
            smtp_use_ssl=getenv('SMTP_USE_SSL', 'false').lower() == 'true',
            mcp_enabled=getenv('MCP_ENABLED', 'false').lower() == 'true',
            mcp_writes_enabled=getenv('MCP_WRITES_ENABLED', 'false').lower() == 'true',
            mcp_allowed_hosts=_origins(getenv('MCP_ALLOWED_HOSTS', 'localhost:*,127.0.0.1:*,[::1]:*')),
            mcp_rate_limit=max(1, min(10000, int(getenv('MCP_RATE_LIMIT', '60')))),
            mcp_tool_timeout_seconds=max(1, min(120, int(getenv('MCP_TOOL_TIMEOUT_SECONDS', '30')))),
            mcp_max_result_bytes=max(1024, min(1048576, int(getenv('MCP_MAX_RESULT_BYTES', '262144')))),
            mcp_max_idempotency_keys=max(100,min(100000,int(getenv('MCP_MAX_IDEMPOTENCY_KEYS','10000')))),
            api_public_url=getenv('API_PUBLIC_URL', 'http://localhost:4000/api/v1').rstrip('/'),
        )


def _sync_interval(seconds: int) -> int:
    return 0 if seconds <= 0 else max(60, seconds)
