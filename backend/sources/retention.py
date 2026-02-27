import logging
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone

from sources.models import Source
from sources.storage import get_source_upload_storage

logger = logging.getLogger(__name__)


def purge_expired_upload_sources(*, dry_run: bool = False, limit: int | None = None) -> dict:
    if not settings.SOURCE_RETENTION_ENABLED:
        return {
            "retention_enabled": False,
            "dry_run": dry_run,
            "candidate_count": 0,
            "deleted_count": 0,
            "storage_delete_failures": 0,
        }

    retention_days = max(1, int(settings.SOURCE_RETENTION_DAYS))
    batch_limit = max(1, int(limit or settings.SOURCE_RETENTION_BATCH_SIZE))
    cutoff = timezone.now() - timedelta(days=retention_days)
    candidates = list(
        Source.objects.filter(
            type=Source.SourceType.UPLOAD,
            created_at__lt=cutoff,
        )
        .order_by("created_at", "id")[:batch_limit]
    )

    deleted_count = 0
    storage_delete_failures = 0
    storage = get_source_upload_storage()
    for source in candidates:
        if source.file_object_key:
            try:
                storage.delete_upload(source.file_object_key)
            except (ImproperlyConfigured, NotImplementedError):
                storage_delete_failures += 1
            except Exception:
                storage_delete_failures += 1
                logger.exception("retention cleanup storage delete failed source_id=%s", source.id)

        if not dry_run:
            source.delete()
            deleted_count += 1

    return {
        "retention_enabled": True,
        "dry_run": dry_run,
        "cutoff": cutoff.isoformat(),
        "retention_days": retention_days,
        "batch_limit": batch_limit,
        "candidate_count": len(candidates),
        "deleted_count": deleted_count,
        "storage_delete_failures": storage_delete_failures,
    }
