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
from analyses.parsers import (
    parse_json_log_line,
    parse_nginx_log_line,
    parse_timestamp_level_text_line,
)
from analyses.models import AnalysisRun, LogEvent
from analyses.normalization import normalize_event_fields

logger = logging.getLogger(__name__)


def _parse_line(raw_line: str) -> tuple[dict, str]:
    parsed_json = parse_json_log_line(raw_line)
    if parsed_json is not None:
        return parsed_json, "json"

    parsed_text = parse_timestamp_level_text_line(raw_line)
    if parsed_text is not None:
        return parsed_text, "text"

    parsed_nginx = parse_nginx_log_line(raw_line)
    if parsed_nginx is not None:
        return parsed_nginx, "nginx"

    return {
        "timestamp": None,
        "level": "unknown",
        "service": None,
        "message": raw_line,
        "trace_id": None,
        "request_id": None,
        "raw": raw_line,
    }, "raw"


def _process_source_lines(source, analysis_id: int) -> dict:
    stats = {
        "total_lines": 0,
        "truncated": False,
        "json_lines": 0,
        "text_lines": 0,
        "nginx_lines": 0,
        "unparsed_lines": 0,
        "error_count": 0,
        "level_counts": {},
        "service_counts": {},
        "services": [],
    }
    event_batch = []

    LogEvent.objects.filter(analysis_run_id=analysis_id).delete()

    try:
        for line_no, raw_line in enumerate(
            iter_source_lines(
                source,
                max_lines=settings.ANALYSIS_TASK_MAX_LINES,
                max_bytes=settings.ANALYSIS_READER_MAX_BYTES,
            ),
            start=1,
        ):
            stats["total_lines"] += 1
            parsed, parser_name = _parse_line(raw_line)
            if parser_name == "json":
                stats["json_lines"] += 1
            elif parser_name == "text":
                stats["text_lines"] += 1
            elif parser_name == "nginx":
                stats["nginx_lines"] += 1
            else:
                stats["unparsed_lines"] += 1

            normalized = normalize_event_fields(
                line_no=line_no,
                raw_line=raw_line,
                parsed=parsed,
                parser_name=parser_name,
            )
            level = normalized["level"]
            stats["level_counts"][level] = stats["level_counts"].get(level, 0) + 1
            if level in {"error", "fatal"}:
                stats["error_count"] += 1

            if normalized["service"]:
                service = normalized["service"]
                stats["service_counts"][service] = stats["service_counts"].get(service, 0) + 1

            event_batch.append(
                LogEvent(
                    analysis_run_id=analysis_id,
                    **normalized,
                )
            )
            if len(event_batch) >= 500:
                LogEvent.objects.bulk_create(event_batch, batch_size=500)
                event_batch = []

        if event_batch:
            LogEvent.objects.bulk_create(event_batch, batch_size=500)
    except LineReaderTruncatedByLines:
        if event_batch:
            LogEvent.objects.bulk_create(event_batch, batch_size=500)
        stats["truncated"] = True
        stats["truncated_by"] = "line_limit"
    except LineReaderTruncatedByBytes:
        if event_batch:
            LogEvent.objects.bulk_create(event_batch, batch_size=500)
        stats["truncated"] = True
        stats["truncated_by"] = "byte_limit"
    except SourceLineReaderError:
        if event_batch:
            LogEvent.objects.bulk_create(event_batch, batch_size=500)
        stats["reader_error"] = "unreadable_source"

    stats["services"] = sorted(stats["service_counts"].keys())
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
        computed_stats = _process_source_lines(analysis.source, analysis.id)

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
