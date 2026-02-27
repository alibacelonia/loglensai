import logging

from celery import shared_task
from django.conf import settings
from django.db.models import Count, Max, Min
from django.db import transaction
from django.utils import timezone

from analyses.line_reader import (
    LineReaderTruncatedByBytes,
    LineReaderTruncatedByLines,
    SourceLineReaderError,
    iter_source_lines,
)
from analyses.ai import generate_ai_insight
from analyses.parsers import (
    parse_json_log_line,
    parse_nginx_log_line,
    parse_timestamp_level_text_line,
)
from analyses.clustering import merge_clusters_tfidf
from analyses.models import AIInsight, AnalysisRun, LogCluster, LogEvent
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
        "guardrails": {
            "max_lines": settings.ANALYSIS_TASK_MAX_LINES,
            "max_bytes": settings.ANALYSIS_READER_MAX_BYTES,
            "task_soft_time_limit_seconds": settings.ANALYSIS_TASK_SOFT_TIME_LIMIT_SECONDS,
            "task_time_limit_seconds": settings.ANALYSIS_TASK_TIME_LIMIT_SECONDS,
        },
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


def _build_baseline_clusters(analysis_id: int) -> list[dict]:
    grouped = (
        LogEvent.objects.filter(analysis_run_id=analysis_id)
        .values("fingerprint")
        .annotate(
            count=Count("id"),
            first_line=Min("line_no"),
            last_line=Max("line_no"),
        )
        .order_by("-count", "fingerprint")
    )

    clusters = []
    for group in grouped:
        sample = (
            LogEvent.objects.filter(
                analysis_run_id=analysis_id, fingerprint=group["fingerprint"]
            )
            .order_by("line_no")
            .first()
        )
        clusters.append(
            {
                "fingerprint": group["fingerprint"],
                "count": group["count"],
                "first_line": group["first_line"],
                "last_line": group["last_line"],
                "sample_message": sample.message if sample else "",
                "level": sample.level if sample else "unknown",
                "service": sample.service if sample else "",
            }
        )

    return clusters


def _persist_log_clusters(analysis_id: int, baseline_clusters: list[dict]) -> None:
    LogCluster.objects.filter(analysis_run_id=analysis_id).delete()

    clusters_to_create = []
    for cluster in baseline_clusters:
        events_qs = LogEvent.objects.filter(
            analysis_run_id=analysis_id,
            fingerprint=cluster["fingerprint"],
        ).order_by("line_no")
        sample_lines = list(events_qs.values_list("line_no", flat=True)[:5])
        timestamped = events_qs.exclude(timestamp__isnull=True)
        first_seen = timestamped.order_by("timestamp").values_list("timestamp", flat=True).first()
        last_seen = timestamped.order_by("-timestamp").values_list("timestamp", flat=True).first()
        affected_services = sorted(
            set(
                events_qs.exclude(service="")
                .values_list("service", flat=True)
            )
        )
        title = (cluster.get("sample_message") or cluster["fingerprint"])[:255]
        clusters_to_create.append(
            LogCluster(
                analysis_run_id=analysis_id,
                fingerprint=cluster["fingerprint"],
                title=title,
                count=cluster["count"],
                first_seen=first_seen,
                last_seen=last_seen,
                sample_events=sample_lines,
                affected_services=affected_services,
            )
        )

    if clusters_to_create:
        LogCluster.objects.bulk_create(clusters_to_create, batch_size=200)


def _build_cluster_context(analysis_id: int) -> list[dict]:
    return list(
        LogCluster.objects.filter(analysis_run_id=analysis_id)
        .order_by("-count", "fingerprint")
        .values("id", "fingerprint", "title", "count", "first_seen", "last_seen")[
            : settings.LLM_MAX_CLUSTER_CONTEXT
        ]
    )


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
        baseline_clusters = _build_baseline_clusters(analysis.id)
        _persist_log_clusters(analysis.id, baseline_clusters)
        computed_stats["clusters_baseline"] = baseline_clusters
        if settings.CLUSTER_TFIDF_ENABLED:
            computed_stats["clusters_tfidf"] = merge_clusters_tfidf(
                baseline_clusters,
                settings.CLUSTER_TFIDF_SIMILARITY_THRESHOLD,
            )
        else:
            computed_stats["clusters_tfidf"] = baseline_clusters

        ai_insight_payload = None
        ai_status = "skipped"
        if settings.LLM_ENABLED:
            try:
                cluster_context = _build_cluster_context(analysis.id)
                ai_insight_payload = generate_ai_insight(computed_stats, cluster_context)
                ai_status = "completed"
            except Exception:
                logger.exception("ai insight generation failed analysis_id=%s", analysis_id)
                ai_status = "failed"
        computed_stats["ai_status"] = ai_status

        with transaction.atomic():
            analysis = AnalysisRun.objects.select_for_update().get(id=analysis_id)
            analysis.status = AnalysisRun.Status.COMPLETED
            analysis.stats = computed_stats
            analysis.finished_at = timezone.now()
            analysis.save(update_fields=["status", "stats", "finished_at", "updated_at"])
            if ai_insight_payload is not None:
                AIInsight.objects.update_or_create(
                    analysis_run=analysis,
                    defaults=ai_insight_payload,
                )

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
