"""Isolated API harness for UI tests with deterministic, process-local file storage."""
import os
import sys
from dataclasses import replace
from pathlib import Path
from urllib.parse import urlsplit

url = urlsplit(os.environ['FLOWIE_E2E_DATABASE_URL'])
if url.hostname not in {'localhost', '127.0.0.1', '::1'} or url.username != 'flowie_test' or not url.path.startswith('/flowie_'):
    raise RuntimeError('UI harness requires an isolated loopback test database.')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/api-python'))
from app.main import create_app
from app.core.config import Settings
from app.domains import native_attachments, native_emojis
from app.modules.data_exchange import api as data_exchange_api
from cryptography.fernet import Fernet


class FixtureStorage:
    objects: dict[str, bytes] = {}

    def __init__(self, _settings):
        pass

    async def put(self, key, body, _content_type):
        self.objects[key] = body

    async def get(self, key, *, maximum_bytes=None):
        body=self.objects[key]
        if maximum_bytes is not None and len(body)>maximum_bytes:
            raise RuntimeError('Fixture export exceeds its bound')
        return body


# This adapter exists only in the test harness; production keeps its S3 adapter.
native_attachments.MinioStorage = FixtureStorage
native_emojis.MinioStorage = FixtureStorage
data_exchange_api.MinioStorage = FixtureStorage
app = create_app(replace(Settings.from_environment(),auth_login_account_limit=10000,auth_login_ip_limit=10000,auth_mfa_encryption_keys=Fernet.generate_key().decode()))
