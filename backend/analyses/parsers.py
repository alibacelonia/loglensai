import json
from typing import Any


_LEVEL_MAP = {
    "debug": "debug",
    "info": "info",
    "notice": "info",
    "warn": "warn",
    "warning": "warn",
    "error": "error",
    "err": "error",
    "fatal": "fatal",
    "critical": "fatal",
}


def _pick(payload: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


def _normalize_level(value: Any) -> str:
    if value is None:
        return "unknown"
    normalized = str(value).strip().lower()
    return _LEVEL_MAP.get(normalized, "unknown")


def parse_json_log_line(line: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, dict):
        return None

    timestamp = _pick(parsed, ("timestamp", "time", "ts", "datetime"))
    level = _normalize_level(_pick(parsed, ("level", "severity", "log_level")))
    service = _pick(parsed, ("service", "component", "logger", "app"))
    message = _pick(parsed, ("message", "msg", "event"))
    trace_id = _pick(parsed, ("trace_id", "traceId", "correlation_id"))
    request_id = _pick(parsed, ("request_id", "requestId"))

    return {
        "timestamp": str(timestamp) if timestamp is not None else None,
        "level": level,
        "service": str(service) if service is not None else None,
        "message": str(message) if message is not None else "",
        "trace_id": str(trace_id) if trace_id is not None else None,
        "request_id": str(request_id) if request_id is not None else None,
        "raw": parsed,
    }
