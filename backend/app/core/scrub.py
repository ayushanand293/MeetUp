"""Security log scrubber to prevent sensitive data leakage (PII, Tokens)."""

import re

# Regex patterns for sensitive data
PATTERNS = {
    # JWT tokens (rough regex for header.payload.signature)
    "jwt": re.compile(r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"),
    # Coordinates (redact specific lat/lon details if they appear in logs)
    "coords": re.compile(r"(lat|lon|latitude|longitude)[:=]\s*[-+]?\d*\.\d+|\b\d{1,3}\.\d{4,}\b"),
    # General secrets
    "secrets": re.compile(r"(token|secret|credential|key|password|bearer)[:=]\s*[\w.-]+", re.IGNORECASE),
    # E.164-like phone numbers
    "phone": re.compile(r"\+[1-9]\d{7,14}"),
}


def _mask_phone(raw: str) -> str:
    digits = raw[1:]
    if len(digits) <= 4:
        return "+" + "*" * len(digits)
    return "+" + "*" * (len(digits) - 4) + digits[-4:]

def scrub_sensitive(message: str) -> str:
    """
    Scrub sensitive information from the message string.
    """
    if not isinstance(message, str):
        message = str(message)
        
    scrubbed = message
    
    # Redact JWTs
    scrubbed = PATTERNS["jwt"].sub("[REDACTED_JWT]", scrubbed)
    
    # Redact Secrets
    scrubbed = PATTERNS["secrets"].sub(r"\1=[REDACTED]", scrubbed)

    # Redact phone numbers
    scrubbed = PATTERNS["phone"].sub(lambda m: _mask_phone(m.group(0)), scrubbed)
    
    # Redact precise coordinates
    # Note: We want to preserve that it IS a coordinate log but hide the exact location
    scrubbed = PATTERNS["coords"].sub(r"\1=[REDACTED_LOC]", scrubbed)
    
    return scrubbed
