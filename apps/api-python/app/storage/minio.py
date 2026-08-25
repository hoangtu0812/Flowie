from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import hmac
from urllib.parse import quote, urlsplit

import httpx

from ..core.config import Settings
from ..core.errors import ApiError


class MinioStorage:
    def __init__(self, settings: Settings) -> None:
        self.endpoint = urlsplit(settings.s3_endpoint)
        self.access_key = settings.s3_access_key
        self.secret_key = settings.s3_secret_key
        self.bucket = settings.s3_bucket
        self.region = settings.s3_region
        self._bucket_ready = False

    async def put(self, key: str, body: bytes, content_type: str) -> None:
        await self._ensure_bucket()
        response = await self._request('PUT', f'/{self.bucket}/{self._escape_key(key)}', body, content_type)
        if not response.is_success:
            raise ApiError(502, 'Could not store attachment.', 'Bad Gateway')

    async def get(self, key: str) -> bytes:
        response = await self._request('GET', f'/{self.bucket}/{self._escape_key(key)}')
        if not response.is_success:
            raise ApiError(502, 'Could not read attachment.', 'Bad Gateway')
        return response.content

    async def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        response = await self._request('PUT', f'/{self.bucket}')
        if not response.is_success and response.status_code != 409:
            raise ApiError(502, 'Could not prepare attachment storage.', 'Bad Gateway')
        self._bucket_ready = True

    async def _request(self, method: str, path: str, body: bytes = b'', content_type: str | None = None) -> httpx.Response:
        now = datetime.now(timezone.utc)
        amz_date = now.strftime('%Y%m%dT%H%M%SZ')
        day = now.strftime('%Y%m%d')
        payload_hash = sha256(body).hexdigest()
        canonical_headers = f'host:{self.endpoint.netloc}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n'
        signed_headers = 'host;x-amz-content-sha256;x-amz-date'
        canonical_request = f'{method}\n{path}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
        scope = f'{day}/{self.region}/s3/aws4_request'
        string_to_sign = f'AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{sha256(canonical_request.encode()).hexdigest()}'
        key = self._signing_key(day)
        signature = hmac.new(key, string_to_sign.encode(), sha256).hexdigest()
        headers = {
            'authorization': f'AWS4-HMAC-SHA256 Credential={self.access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}',
            'x-amz-content-sha256': payload_hash,
            'x-amz-date': amz_date,
        }
        if content_type:
            headers['content-type'] = content_type
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.request(method, f'{self.endpoint.scheme}://{self.endpoint.netloc}{path}', content=body or None, headers=headers)

    def _signing_key(self, day: str) -> bytes:
        date_key = hmac.new(f'AWS4{self.secret_key}'.encode(), day.encode(), sha256).digest()
        region_key = hmac.new(date_key, self.region.encode(), sha256).digest()
        service_key = hmac.new(region_key, b's3', sha256).digest()
        return hmac.new(service_key, b'aws4_request', sha256).digest()

    @staticmethod
    def _escape_key(key: str) -> str:
        return '/'.join(quote(part, safe='') for part in key.split('/'))
