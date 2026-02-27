import hashlib
import re
from datetime import datetime, timezone

from django.utils.dateparse import parse_datetime


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
    level = str(parsed.get("level") or "unknown").lower()
    service = str(parsed.get("service") or "").strip()
    message = str(parsed.get("message") or raw_line)
    timestamp = parse_timestamp_value(parsed.get("timestamp"))
    trace_id = parsed.get("trace_id")
    request_id = parsed.get("request_id")

    return {
        "timestamp": timestamp,
        "level": level,
        "service": service,
        "message": message,
        "raw": raw_line,
        "fingerprint": compute_fingerprint(level, service, message),
        "trace_id": str(trace_id) if trace_id else None,
        "request_id": str(request_id) if request_id else None,
        "line_no": line_no,
        "tags": {"parser": parser_name},
    }
