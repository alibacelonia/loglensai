import json
import logging
from typing import Any
from urllib import error, request

from django.conf import settings


logger = logging.getLogger(__name__)

_MAX_SUMMARY_CHARS = 4000
_MAX_REMEDIATION_CHARS = 6000
_MAX_RUNBOOK_CHARS = 6000
_MAX_ROOT_CAUSES = 5


def _truncate(value: str, max_chars: int) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip()


def _extract_json_from_content(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        raise ValueError("LLM response content is empty.")

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM response does not contain a JSON object.")

    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM response JSON must be an object.")
    return parsed


def _sanitize_ai_payload(payload: dict[str, Any]) -> dict[str, Any]:
    executive_summary = _truncate(str(payload.get("executive_summary") or ""), _MAX_SUMMARY_CHARS)
    remediation = _truncate(str(payload.get("remediation") or ""), _MAX_REMEDIATION_CHARS)
    runbook = _truncate(str(payload.get("runbook") or ""), _MAX_RUNBOOK_CHARS)

    root_causes_raw = payload.get("root_causes")
    root_causes: list[dict[str, str]] = []
    if isinstance(root_causes_raw, list):
        for item in root_causes_raw[:_MAX_ROOT_CAUSES]:
            if not isinstance(item, dict):
                continue
            title = _truncate(str(item.get("title") or ""), 200)
            rationale = _truncate(str(item.get("rationale") or ""), 1000)
            if not title:
                continue
            root_causes.append({"title": title, "rationale": rationale})

    return {
        "executive_summary": executive_summary,
        "root_causes": root_causes,
        "remediation": remediation,
        "runbook": runbook,
    }


def _build_user_prompt(stats: dict[str, Any], baseline_clusters: list[dict[str, Any]]) -> str:
    top_clusters = baseline_clusters[: settings.LLM_MAX_CLUSTER_CONTEXT]
    prompt_payload = {
        "stats": {
            "total_lines": stats.get("total_lines", 0),
            "error_count": stats.get("error_count", 0),
            "services": stats.get("services", []),
            "level_counts": stats.get("level_counts", {}),
            "truncated": stats.get("truncated", False),
        },
        "clusters": [
            {
                "fingerprint": cluster.get("fingerprint", ""),
                "count": cluster.get("count", 0),
                "first_line": cluster.get("first_line"),
                "last_line": cluster.get("last_line"),
                "sample_message": cluster.get("sample_message", ""),
                "level": cluster.get("level", ""),
                "service": cluster.get("service", ""),
            }
            for cluster in top_clusters
        ],
    }
    return (
        "Analyze the redacted log summary below and produce concise incident guidance.\n"
        "Return strict JSON with keys: executive_summary (string), "
        "root_causes (array of objects with title and rationale), remediation (string), "
        "runbook (string).\n"
        "Do not include markdown fences.\n"
        f"Input:\n{json.dumps(prompt_payload, ensure_ascii=True)}"
    )


def _call_openai_compatible(user_prompt: str) -> dict[str, Any]:
    if not settings.LLM_API_KEY:
        raise ValueError("LLM_API_KEY is required for non-mock providers.")

    body = {
        "model": settings.LLM_MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an SRE assistant. The input is already redacted. "
                    "Provide careful, non-speculative output."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
    }
    req = request.Request(
        settings.LLM_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.LLM_REQUEST_TIMEOUT_SECONDS) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except error.URLError as exc:
        raise RuntimeError(f"LLM request failed: {exc}") from exc

    content = (
        response_payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed_content = _extract_json_from_content(content)
    return _sanitize_ai_payload(parsed_content)


def _call_mock(stats: dict[str, Any], baseline_clusters: list[dict[str, Any]]) -> dict[str, Any]:
    top_cluster = baseline_clusters[0] if baseline_clusters else {}
    top_cluster_message = str(top_cluster.get("sample_message") or "No dominant cluster detected.")
    top_cluster_count = int(top_cluster.get("count") or 0)
    error_count = int(stats.get("error_count") or 0)

    payload = {
        "executive_summary": (
            f"Detected {error_count} high-severity events. "
            f"Top cluster count is {top_cluster_count}: {top_cluster_message}"
        ),
        "root_causes": [
            {
                "title": "Repeated failure signature",
                "rationale": "A dominant fingerprint cluster indicates recurring execution failure.",
            }
        ],
        "remediation": (
            "Mitigate impact by rate-limiting failing paths and validating upstream dependency health. "
            "Then deploy a fix and monitor cluster frequency decline."
        ),
        "runbook": (
            "1) Identify impacted service owners.\n"
            "2) Validate dependency status and rollbacks.\n"
            "3) Apply mitigation and confirm error trend reduction."
        ),
    }
    return _sanitize_ai_payload(payload)


def generate_ai_insight(stats: dict[str, Any], baseline_clusters: list[dict[str, Any]]) -> dict[str, Any]:
    if not settings.LLM_ENABLED:
        return {
            "executive_summary": "",
            "root_causes": [],
            "remediation": "",
            "runbook": "",
        }

    provider = settings.LLM_PROVIDER.strip().lower()
    if provider == "mock":
        return _call_mock(stats, baseline_clusters)

    user_prompt = _build_user_prompt(stats, baseline_clusters)
    return _call_openai_compatible(user_prompt)
