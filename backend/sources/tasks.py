from celery import shared_task

from sources.retention import purge_expired_upload_sources


@shared_task
def run_retention_cleanup(*, dry_run: bool = False, limit: int | None = None):
    return purge_expired_upload_sources(dry_run=dry_run, limit=limit)
