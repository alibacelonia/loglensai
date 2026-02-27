import logging
from typing import Any

from django.conf import settings

from auditlog.models import AuditLogEvent

logger = logging.getLogger(__name__)


def log_audit_event(
    *,
    owner_id: int,
    event_type: str,
    actor_id: int | None = None,
    source_id: int | None = None,
    analysis_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    if not settings.AUDIT_LOG_ENABLED:
        return

    AuditLogEvent.objects.create(
        owner_id=owner_id,
        actor_id=actor_id,
        event_type=event_type,
        source_id=source_id,
        analysis_id=analysis_id,
        metadata=metadata or {},
    )


def safe_log_audit_event(**kwargs) -> None:
    try:
        log_audit_event(**kwargs)
    except Exception:
        logger.exception("audit log write failed event_type=%s", kwargs.get("event_type"))
