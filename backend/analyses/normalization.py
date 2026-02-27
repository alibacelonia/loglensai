import hashlib
import re
from datetime import datetime, timezone

from django.utils.dateparse import parse_datetime

from analyses.redaction import redact_text


_NUMBER_PATTERN = re.compile(r"\d+")
_EXCEPTION_PATTERN = re.compile(
    r"\b([A-Z][A-Za-z0-9_]*(?:Exception|Error|Fault))\b"
)


def _normalize_message_for_fingerprint(message: str) -> str:
    lowered = message.strip().lower()
    return _NUMBER_PATTERN.sub("<num>", lowered)


def extract_exception_type(message: str) -> str:
    match = _EXCEPTION_PATTERN.search(message)
    if not match:
        return "none"
    return match.group(1)


def compute_fingerprint(level: str, service: str, message: str) -> str:
    exception_type = extract_exception_type(message)
    normalized_message = _normalize_message_for_fingerprint(message)
    base = f"{exception_type}|{normalized_message}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


def parse_timestamp_value(value: str | None):
    if not value:
        return None

    candidate = str(value).strip()
    parsed = parse_datetime(candidate)
    if parsed is not None:
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%d/%b/%Y:%H:%M:%S %z",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(candidate, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue

    return None


def normalize_event_fields(
    *,
    line_no: int,
    raw_line: str,
    parsed: dict,
    parser_name: str,
) -> dict:
    def _redact_optional(value: str | None) -> tuple[str | None, int, set[str]]:
        if not value:
            return None, 0, set()

        redacted_value, redaction_count, redaction_types = redact_text(str(value))
        return redacted_value or None, redaction_count, set(redaction_types)

    level = str(parsed.get("level") or "unknown").lower()
    service = str(parsed.get("service") or "").strip()
    message = str(parsed.get("message") or raw_line)
    timestamp = parse_timestamp_value(parsed.get("timestamp"))
    trace_id = parsed.get("trace_id")
    request_id = parsed.get("request_id")
    redacted_message, message_redaction_count, message_redaction_types = redact_text(message)
    redacted_raw, raw_redaction_count, raw_redaction_types = redact_text(raw_line)
    redacted_trace_id, trace_redaction_count, trace_redaction_types = _redact_optional(
        str(trace_id) if trace_id else None
    )
    redacted_request_id, request_redaction_count, request_redaction_types = _redact_optional(
        str(request_id) if request_id else None
    )

    total_redactions = (
        message_redaction_count
        + raw_redaction_count
        + trace_redaction_count
        + request_redaction_count
    )
    redaction_types = sorted(
        set(message_redaction_types)
        | set(raw_redaction_types)
        | trace_redaction_types
        | request_redaction_types
    )
    tags = {"parser": parser_name}
    if total_redactions > 0:
        tags["redaction_count"] = total_redactions
        tags["redaction_types"] = redaction_types

    return {
        "timestamp": timestamp,
        "level": level,
        "service": service,
        "message": redacted_message,
        "raw": redacted_raw,
        "fingerprint": compute_fingerprint(level, service, redacted_message),
        "trace_id": redacted_trace_id,
        "request_id": redacted_request_id,
        "line_no": line_no,
        "tags": tags,
    }
