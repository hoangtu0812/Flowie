import re

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


def compatible_hash(value):
    """Preserve legacy Node hashes with a nonstandard Argon2 parameter order."""
    return re.sub(r"m=(\d+),p=(\d+),t=(\d+)", r"m=\1,t=\3,p=\2", value, count=1)


def verify_password(encoded, password):
    try:
        return PasswordHasher().verify(compatible_hash(encoded), password)
    except (InvalidHashError, VerificationError):
        return False
