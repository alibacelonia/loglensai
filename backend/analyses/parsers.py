import json
import re
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

_TIMESTAMP_LEVEL_PATTERN = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+"
    r"(?P<level>DEBUG|INFO|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL)\s+"
    r"(?P<rest>.+)$",
    flags=re.IGNORECASE,
)

_BRACKETED_PATTERN = re.compile(
    r"^\[(?P<timestamp>[^\]]+)\]\s+\[(?P<level>[A-Z]+)\]\s+(?P<rest>.+)$",
    flags=re.IGNORECASE,
)

_NGINX_ACCESS_PATTERN = re.compile(
    r"^(?P<remote_addr>\S+)\s+\S+\s+\S+\s+\[(?P<timestamp>[^\]]+)\]\s+"
    r'"(?P<method>[A-Z]+)\s+(?P<path>[^"]+?)\s+HTTP/(?P<http_version>[^"]+)"\s+'
    r"(?P<status>\d{3})\s+(?P<body_bytes_sent>\d+|-)\s+"
    r'"(?P<referer>[^"]*)"\s+"(?P<user_agent>[^"]*)"'
)

_NGINX_ERROR_PATTERN = re.compile(
    r"^(?P<timestamp>\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(?P<level>\w+)\]\s+(?P<message>.+)$",
    flags=re.IGNORECASE,
)


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


def parse_timestamp_level_text_line(line: str) -> dict[str, Any] | None:
    match = _TIMESTAMP_LEVEL_PATTERN.match(line) or _BRACKETED_PATTERN.match(line)
    if not match:
        return None

    timestamp = match.group("timestamp")
    level = _normalize_level(match.group("level"))
    rest = match.group("rest").strip()

    service = None
    message = rest
    if " - " in rest:
        service_candidate, message_candidate = rest.split(" - ", 1)
        if service_candidate and " " not in service_candidate:
            service = service_candidate
            message = message_candidate

    return {
        "timestamp": timestamp,
        "level": level,
        "service": service,
        "message": message,
        "trace_id": None,
        "request_id": None,
        "raw": line,
    }


def parse_nginx_log_line(line: str) -> dict[str, Any] | None:
    access_match = _NGINX_ACCESS_PATTERN.match(line)
    if access_match:
        status_code = int(access_match.group("status"))
        if status_code >= 500:
            level = "error"
        elif status_code >= 400:
            level = "warn"
        else:
            level = "info"

        method = access_match.group("method")
        path = access_match.group("path")
        message = f"{method} {path} -> {status_code}"

        return {
            "timestamp": access_match.group("timestamp"),
            "level": level,
            "service": "nginx",
            "message": message,
            "trace_id": None,
            "request_id": None,
            "raw": line,
        }

    error_match = _NGINX_ERROR_PATTERN.match(line)
    if error_match:
        return {
            "timestamp": error_match.group("timestamp"),
            "level": _normalize_level(error_match.group("level")),
            "service": "nginx",
            "message": error_match.group("message"),
            "trace_id": None,
            "request_id": None,
            "raw": line,
        }

    return None
