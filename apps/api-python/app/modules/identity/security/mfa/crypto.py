import base64
import hashlib
import hmac
import json
import re
import secrets
import struct
from datetime import timezone
from urllib.parse import quote, urlencode

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
import segno

from .....core.errors import ApiError


def keyring(settings):
    try:
        keys = [
            Fernet(key.strip().encode())
            for key in settings.auth_mfa_encryption_keys.split(",")
            if key.strip()
        ]
        return MultiFernet(keys) if keys else None
    except (ValueError, TypeError):
        return None


def encrypt_secret(settings, user, secret):
    ring = keyring(settings)
    if ring is None:
        raise ApiError(
            503, "Authenticator enrollment is not configured.", "Service Unavailable"
        )
    return ring.encrypt(json.dumps({"user": user, "secret": secret}).encode()).decode()


def decrypt_secret(settings, user, cipher):
    ring = keyring(settings)
    try:
        if ring is None:
            raise InvalidToken()
        data = json.loads(ring.decrypt(cipher.encode()))
        if data["user"] != user:
            raise InvalidToken()
        return data["secret"]
    except (InvalidToken, ValueError, KeyError, TypeError):
        raise ApiError(
            503,
            "Authenticator verification is unavailable. Use a recovery code or contact the operator.",
            "Service Unavailable",
        ) from None


def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp(secret, counter, digits=6):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10**digits)).zfill(digits)


def matching_counter(secret, code, now, last=None):
    if not re.fullmatch(r"[0-9]{6}", code):
        return None
    counter = int(now.replace(tzinfo=timezone.utc).timestamp()) // 30
    matches = [
        candidate
        for candidate in range(max(0, counter - 1), counter + 2)
        if hmac.compare_digest(totp(secret, candidate), code)
    ]
    accepted = [candidate for candidate in matches if last is None or candidate > last]
    return max(accepted) if accepted else None


def recovery_hash(user, value):
    canonical = value.replace("-", "").replace(" ", "").lower()
    return hashlib.sha256(f"{user}:{canonical}".encode()).hexdigest()


def new_recovery(user):
    raw = [secrets.token_hex(16) for _ in range(10)]
    return ["-".join(value[i : i + 8] for i in range(0, 32, 8)) for value in raw], [
        recovery_hash(user, value) for value in raw
    ]


def enrollment_image(email, secret):
    uri = (
        "otpauth://totp/"
        + quote("Flowie:" + email, safe="")
        + "?"
        + urlencode(
            {
                "secret": secret,
                "issuer": "Flowie",
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
            }
        )
    )
    return uri, segno.make_qr(uri).svg_data_uri(scale=5, light="white", dark="black")
