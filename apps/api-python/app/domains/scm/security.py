from __future__ import annotations

import base64
import json
from hashlib import sha256
from hmac import compare_digest, new as new_hmac
from secrets import token_urlsafe
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from ...core.config import Settings
from ...core.errors import ApiError


def _cipher(settings: Settings) -> Fernet:
    value = settings.scm_secrets_encryption_key
    if not value:
        raise ApiError(
            503,
            'SCM_SECRETS_ENCRYPTION_KEY must be configured before connecting a source-control provider.',
            'Service Unavailable',
        )
    try:
        return Fernet(value.encode('ascii'))
    except (TypeError, ValueError) as error:
        raise ApiError(503, 'SCM_SECRETS_ENCRYPTION_KEY is not a valid Fernet key.', 'Service Unavailable') from error


def encrypt_secret_bundle(settings: Settings, bundle: dict[str, str]) -> str:
    encoded = json.dumps(bundle, separators=(',', ':'), sort_keys=True).encode('utf-8')
    return _cipher(settings).encrypt(encoded).decode('ascii')


def decrypt_secret_bundle(settings: Settings, encrypted: str | None) -> dict[str, str]:
    if not encrypted:
        return {}
    try:
        decoded = _cipher(settings).decrypt(encrypted.encode('ascii')).decode('utf-8')
        value = json.loads(decoded)
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ApiError(503, 'The source-control credential cannot be decrypted with this server key.', 'Service Unavailable') from error
    if not isinstance(value, dict) or not all(isinstance(key, str) and isinstance(item, str) for key, item in value.items()):
        raise ApiError(503, 'The saved source-control credential is invalid.', 'Service Unavailable')
    return value


def new_webhook_secret() -> str:
    return token_urlsafe(32)


def payload_hash(payload: bytes) -> str:
    return sha256(payload).hexdigest()


def verify_github_signature(secret: str, payload: bytes, signature: str | None) -> bool:
    if not secret or not signature or not signature.startswith('sha256='):
        return False
    expected = 'sha256=' + new_hmac(secret.encode('utf-8'), payload, sha256).hexdigest()
    return compare_digest(expected, signature)


def verify_azure_basic_auth(secret: str, authorization: str | None) -> bool:
    if not secret or not authorization or not authorization.startswith('Basic '):
        return False
    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode('utf-8')
        username, password = decoded.split(':', 1)
    except (ValueError, UnicodeDecodeError):
        return False
    return compare_digest(username, 'flowie') and compare_digest(password, secret)


def public_secret_status(bundle: dict[str, Any]) -> dict[str, bool]:
    return {
        'credentialConfigured': bool(bundle.get('clientSecret')),
        'webhookConfigured': bool(bundle.get('webhookSecret')),
    }
