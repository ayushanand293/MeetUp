import hashlib
import hmac
import re

from app.core.config import settings

PHONE_E164_REGEX = re.compile(r"^\+[1-9]\d{7,14}$")
EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def normalize_phone_e164(phone: str) -> str:
    value = (phone or "").strip()
    if value.startswith("00"):
        value = f"+{value[2:]}"
    if not value:
        return ""

    if value.startswith("+"):
        value = "+" + re.sub(r"\D", "", value[1:])
    else:
        return ""

    if not PHONE_E164_REGEX.fullmatch(value):
        return ""
    return value


def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    candidate = email.strip().lower()
    if not candidate:
        return None
    if not EMAIL_REGEX.fullmatch(candidate):
        return ""
    return candidate


def phone_hash(phone_e164: str) -> str:
    pepper = settings.PHONE_HASH_PEPPER.encode("utf-8")
    return hmac.new(pepper, phone_e164.encode("utf-8"), hashlib.sha256).hexdigest()


def phone_digest(version: int, phone_e164: str) -> str:
    return hashlib.sha256(f"v{version}:{phone_e164}".encode("utf-8")).hexdigest()


def otp_hash(phone_hash_value: str, otp_code: str) -> str:
    return hashlib.sha256(f"{phone_hash_value}:{otp_code}".encode("utf-8")).hexdigest()


def mask_phone(phone_e164: str) -> str:
    normalized = normalize_phone_e164(phone_e164)
    if not normalized:
        return "[invalid_phone]"
    digits = normalized[1:]
    if len(digits) <= 4:
        return f"+{'*' * len(digits)}"
    return f"+{'*' * (len(digits) - 4)}{digits[-4:]}"


def phone_last4(phone_e164: str | None) -> str:
    normalized = normalize_phone_e164(phone_e164 or "")
    if not normalized:
        return ""
    return normalized[-4:]
