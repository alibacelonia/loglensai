import re
from typing import Callable

from django.conf import settings


_EMAIL_PATTERN = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    flags=re.IGNORECASE,
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[.\-\s]?)?(?:\(?\d{3}\)?[.\-\s]?)\d{3}[.\-\s]?\d{4}(?!\w)"
)
_IPV4_PATTERN = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"
)
_JWT_PATTERN = re.compile(
    r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
)
_BEARER_TOKEN_PATTERN = re.compile(
    r"\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b",
    flags=re.IGNORECASE,
)
_AWS_KEY_PATTERN = re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")
_STRIPE_KEY_PATTERN = re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b")
_QUERY_SECRET_PATTERN = re.compile(
    r"(?i)([?&](?:api[_-]?key|token|password|passwd|secret)=)([^&\s]+)"
)
_KEY_VALUE_SECRET_PATTERN = re.compile(
    r"(?i)\b(?P<key>api[_-]?key|token|password|passwd|secret|authorization)\b"
    r"(?P<sep>\s*[:=]\s*)(?P<value>[^\s,;\"']+)"
)


def _redact_query_secret(match: re.Match[str]) -> str:
    return f"{match.group(1)}[REDACTED_SECRET]"


def _redact_key_value_secret(match: re.Match[str]) -> str:
    return f"{match.group('key')}{match.group('sep')}[REDACTED_SECRET]"


def redact_text(value: str | None) -> tuple[str, int, list[str]]:
    if value is None:
        return "", 0, []

    text = str(value)
    if not settings.REDACTION_ENABLED:
        return text, 0, []

    total_count = 0
    redaction_types: set[str] = set()

    rules: list[tuple[str, re.Pattern[str], str | Callable[[re.Match[str]], str]]] = []
    if settings.REDACTION_MASK_EMAILS:
        rules.append(("email", _EMAIL_PATTERN, "[REDACTED_EMAIL]"))
    if settings.REDACTION_MASK_PHONE_NUMBERS:
        rules.append(("phone", _PHONE_PATTERN, "[REDACTED_PHONE]"))
    if settings.REDACTION_MASK_IP_ADDRESSES:
        rules.append(("ip", _IPV4_PATTERN, "[REDACTED_IP]"))
    if settings.REDACTION_MASK_JWTS:
        rules.append(("jwt", _JWT_PATTERN, "[REDACTED_JWT]"))
    if settings.REDACTION_MASK_API_KEYS:
        rules.extend(
            [
                ("bearer_token", _BEARER_TOKEN_PATTERN, "Bearer [REDACTED_TOKEN]"),
                ("aws_access_key", _AWS_KEY_PATTERN, "[REDACTED_AWS_KEY]"),
                ("stripe_key", _STRIPE_KEY_PATTERN, "[REDACTED_API_KEY]"),
                ("query_secret", _QUERY_SECRET_PATTERN, _redact_query_secret),
                ("key_value_secret", _KEY_VALUE_SECRET_PATTERN, _redact_key_value_secret),
            ]
        )

    for rule_name, pattern, replacement in rules:
        text, count = pattern.subn(replacement, text)
        if count > 0:
            total_count += count
            redaction_types.add(rule_name)

    return text, total_count, sorted(redaction_types)
