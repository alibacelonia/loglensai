import logging

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from analyses.line_reader import (
    LineReaderTruncatedByBytes,
    LineReaderTruncatedByLines,
    SourceLineReaderError,
    iter_source_lines,
)
from analyses.parsers import parse_json_log_line
from analyses.models import AnalysisRun

logger = logging.getLogger(__name__)


def _count_lines_for_source(source) -> dict:
    stats = {
        "total_lines": 0,
        "truncated": False,
        "json_lines": 0,
        "error_count": 0,
        "level_counts": {},
    }
    try:
        for _line in iter_source_lines(
            source,
            max_lines=settings.ANALYSIS_TASK_MAX_LINES,
            max_bytes=settings.ANALYSIS_READER_MAX_BYTES,
        ):
            stats["total_lines"] += 1
            parsed_json = parse_json_log_line(_line)
            if parsed_json is not None:
                stats["json_lines"] += 1
                level = parsed_json["level"]
                stats["level_counts"][level] = stats["level_counts"].get(level, 0) + 1
                if level in {"error", "fatal"}:
                    stats["error_count"] += 1
    except LineReaderTruncatedByLines:
        stats["truncated"] = True
        stats["truncated_by"] = "line_limit"
    except LineReaderTruncatedByBytes:
        stats["truncated"] = True
        stats["truncated_by"] = "byte_limit"
    except SourceLineReaderError:
        stats["reader_error"] = "unreadable_source"
    return stats


@shared_task(
    bind=True,
    soft_time_limit=settings.ANALYSIS_TASK_SOFT_TIME_LIMIT_SECONDS,
    time_limit=settings.ANALYSIS_TASK_TIME_LIMIT_SECONDS,
)
def analyze_source(self, analysis_id: int):  # noqa: ARG001
    with transaction.atomic():
        analysis = (
            AnalysisRun.objects.select_for_update()
            .select_related("source")
            .filter(id=analysis_id)
            .first()
        )
        if analysis is None:
            logger.warning("analysis task received unknown analysis_id=%s", analysis_id)
            return {"analysis_id": analysis_id, "status": "missing"}

        if analysis.status == AnalysisRun.Status.COMPLETED:
            return {"analysis_id": analysis_id, "status": analysis.status}

        if analysis.status == AnalysisRun.Status.RUNNING:
            return {"analysis_id": analysis_id, "status": analysis.status}

        analysis.status = AnalysisRun.Status.RUNNING
        analysis.started_at = analysis.started_at or timezone.now()
        analysis.finished_at = None
        analysis.error_message = ""
        analysis.save(update_fields=["status", "started_at", "finished_at", "error_message", "updated_at"])

    try:
        computed_stats = _count_lines_for_source(analysis.source)
        computed_stats.setdefault("services", [])

        with transaction.atomic():
            analysis = AnalysisRun.objects.select_for_update().get(id=analysis_id)
            analysis.status = AnalysisRun.Status.COMPLETED
            analysis.stats = computed_stats
            analysis.finished_at = timezone.now()
            analysis.save(update_fields=["status", "stats", "finished_at", "updated_at"])

        logger.info("analysis task completed analysis_id=%s", analysis_id)
        return {"analysis_id": analysis_id, "status": AnalysisRun.Status.COMPLETED}
    except Exception:
        logger.exception("analysis task failed analysis_id=%s", analysis_id)
        with transaction.atomic():
            analysis = AnalysisRun.objects.select_for_update().get(id=analysis_id)
            analysis.status = AnalysisRun.Status.FAILED
            analysis.error_message = "Analysis execution failed."
            analysis.finished_at = timezone.now()
            analysis.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
        raise
