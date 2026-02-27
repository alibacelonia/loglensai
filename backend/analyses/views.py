import logging
import json
import math
import time
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from django.conf import settings
from django.core.paginator import EmptyPage, Paginator
from django.db import transaction
from django.db.models import Count, Max, Min, Sum
from django.http import HttpResponse
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from auditlog.models import AuditLogEvent
from auditlog.service import safe_log_audit_event
from analyses.models import (
    AnalysisRun,
    AnomalyReviewState,
    Incident,
    IntegrationConfig,
    LogCluster,
    LogEvent,
    ReportRun,
    ReportSchedule,
    WorkspacePreference,
)
from analyses.redaction import redact_text
from analyses.serializers import (
    AnalysisRunSerializer,
    IncidentSerializer,
    IntegrationConfigSerializer,
    LogClusterSerializer,
    LogEventSerializer,
    ReportRunSerializer,
    ReportScheduleSerializer,
    WorkspacePreferenceSerializer,
)
from analyses.tasks import analyze_source
from analyses.throttles import AnalyzeRequestUserThrottle
from sources.models import Source

ALLOWED_EVENT_LEVELS = {"debug", "info", "warn", "error", "fatal", "unknown"}
ALLOWED_DASHBOARD_WINDOWS = {
    "24h": timezone.timedelta(hours=24),
    "7d": timezone.timedelta(days=7),
    "30d": timezone.timedelta(days=30),
}
DEFAULT_EVENT_QUERY_LIMIT = 100
MAX_EVENT_QUERY_LIMIT = 200
logger = logging.getLogger(__name__)


def _escape_markdown_cell(value: str) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


class SourceAnalysisListCreateView(APIView):
    throttle_classes = [AnalyzeRequestUserThrottle]

    def get_throttles(self):
        if self.request.method.upper() == "POST":
            return [throttle() for throttle in self.throttle_classes]
        return []

    def _get_owned_source(self, user, source_id: int) -> Source:
        source = Source.objects.filter(id=source_id, owner=user).first()
        if source is None:
            raise NotFound("Source not found.")
        return source

    def get(self, request, source_id: int):
        source = self._get_owned_source(request.user, source_id)
        analyses = source.analyses.select_related("ai_insight").all().order_by("-created_at")
        return Response(AnalysisRunSerializer(analyses, many=True).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, source_id: int):
        source = self._get_owned_source(request.user, source_id)
        active = (
            AnalysisRun.objects.select_for_update()
            .filter(source=source, status__in=[AnalysisRun.Status.QUEUED, AnalysisRun.Status.RUNNING])
            .order_by("-created_at")
            .first()
        )
        if active is not None:
            data = AnalysisRunSerializer(active).data
            return Response(data, status=status.HTTP_200_OK)

        analysis = AnalysisRun.objects.create(source=source, status=AnalysisRun.Status.QUEUED)
        safe_log_audit_event(
            owner_id=source.owner_id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.ANALYZE_START,
            source_id=source.id,
            analysis_id=analysis.id,
            metadata={"status": AnalysisRun.Status.QUEUED},
        )

        def enqueue_analysis_task():
            try:
                analyze_source.delay(analysis.id)
            except Exception:
                logger.exception("failed to enqueue analysis task analysis_id=%s", analysis.id)
                AnalysisRun.objects.filter(id=analysis.id).update(
                    status=AnalysisRun.Status.FAILED,
                    error_message="Failed to enqueue analysis task.",
                    finished_at=timezone.now(),
                    updated_at=timezone.now(),
                )

        transaction.on_commit(enqueue_analysis_task)

        data = AnalysisRunSerializer(analysis).data
        return Response(data, status=status.HTTP_202_ACCEPTED)


class AnalysisRunStatusView(APIView):
    def get(self, request, analysis_id: int):
        analysis = (
            AnalysisRun.objects.select_related("source", "ai_insight")
            .filter(id=analysis_id, source__owner=request.user)
            .first()
        )
        if analysis is None:
            raise NotFound("Analysis not found.")

        return Response(AnalysisRunSerializer(analysis).data, status=status.HTTP_200_OK)


class DashboardSummaryView(APIView):
    def get(self, request):
        requested_window = request.query_params.get("window", "24h").strip().lower() or "24h"
        if requested_window not in ALLOWED_DASHBOARD_WINDOWS:
            raise ValidationError(
                {
                    "window": (
                        f"Unsupported window '{requested_window}'. "
                        f"Allowed: {', '.join(sorted(ALLOWED_DASHBOARD_WINDOWS))}."
                    )
                }
            )

        now = timezone.now()
        window_start = now - ALLOWED_DASHBOARD_WINDOWS[requested_window]

        owned_analyses = AnalysisRun.objects.filter(
            source__owner=request.user,
            created_at__gte=window_start,
        ).select_related("source")

        sources_ingested = Source.objects.filter(
            owner=request.user,
            created_at__gte=window_start,
        ).count()
        analyses_total = owned_analyses.count()
        analyses_completed = owned_analyses.filter(status=AnalysisRun.Status.COMPLETED).count()
        analyses_failed = owned_analyses.filter(status=AnalysisRun.Status.FAILED).count()

        completed_stats = owned_analyses.filter(status=AnalysisRun.Status.COMPLETED).values_list("stats", flat=True)
        ingested_lines = 0
        error_lines = 0
        for stats_payload in completed_stats:
            if not isinstance(stats_payload, dict):
                continue
            ingested_lines += int(stats_payload.get("total_lines", 0) or 0)
            error_lines += int(stats_payload.get("error_count", 0) or 0)

        success_rate = round((analyses_completed / analyses_total) * 100, 2) if analyses_total else 0.0
        failure_rate = round((analyses_failed / analyses_total) * 100, 2) if analyses_total else 0.0

        top_clusters_queryset = (
            LogCluster.objects.filter(
                analysis_run__source__owner=request.user,
                analysis_run__created_at__gte=window_start,
            )
            .values("fingerprint", "title")
            .annotate(
                total_events=Sum("count"),
                analyses=Count("analysis_run", distinct=True),
                last_seen=Max("last_seen"),
            )
            .order_by("-total_events", "-last_seen")[:5]
        )
        top_clusters = list(top_clusters_queryset)

        recent_jobs = []
        for analysis in owned_analyses.order_by("-created_at")[:8]:
            stats_payload = analysis.stats if isinstance(analysis.stats, dict) else {}
            recent_jobs.append(
                {
                    "id": analysis.id,
                    "source_id": analysis.source_id,
                    "source_name": analysis.source.name,
                    "status": analysis.status,
                    "created_at": analysis.created_at,
                    "started_at": analysis.started_at,
                    "finished_at": analysis.finished_at,
                    "error_message": analysis.error_message,
                    "total_lines": int(stats_payload.get("total_lines", 0) or 0),
                    "error_count": int(stats_payload.get("error_count", 0) or 0),
                    "cluster_count": int(stats_payload.get("cluster_count", 0) or 0),
                }
            )

        if requested_window == "24h":
            bucket_count = 24
            bucket_duration = timezone.timedelta(hours=1)
            bucket_label_format = "%H:00"
        elif requested_window == "7d":
            bucket_count = 7
            bucket_duration = timezone.timedelta(days=1)
            bucket_label_format = "%b %d"
        else:
            bucket_count = 30
            bucket_duration = timezone.timedelta(days=1)
            bucket_label_format = "%b %d"

        trend_buckets = []
        for index in range(bucket_count):
            bucket_start = window_start + (bucket_duration * index)
            label = timezone.localtime(bucket_start).strftime(bucket_label_format)
            trend_buckets.append(
                {
                    "label": label,
                    "total": 0,
                    "completed": 0,
                    "failed": 0,
                }
            )

        for analysis in owned_analyses:
            if not analysis.created_at:
                continue
            elapsed = analysis.created_at - window_start
            if elapsed.total_seconds() < 0:
                continue
            bucket_offset = int(elapsed.total_seconds() // bucket_duration.total_seconds())
            if bucket_offset < 0 or bucket_offset >= bucket_count:
                continue
            bucket = trend_buckets[bucket_offset]
            bucket["total"] += 1
            if analysis.status == AnalysisRun.Status.COMPLETED:
                bucket["completed"] += 1
            elif analysis.status == AnalysisRun.Status.FAILED:
                bucket["failed"] += 1

        level_distribution_rows = (
            LogEvent.objects.filter(
                analysis_run__source__owner=request.user,
                analysis_run__created_at__gte=window_start,
            )
            .values("level")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        level_distribution = [
            {
                "level": row.get("level") or "unknown",
                "count": int(row.get("count") or 0),
            }
            for row in level_distribution_rows
        ]

        payload = {
            "window": requested_window,
            "window_start": window_start,
            "generated_at": now,
            "kpis": {
                "sources_ingested": sources_ingested,
                "analyses_total": analyses_total,
                "analyses_completed": analyses_completed,
                "analyses_failed": analyses_failed,
                "success_rate": success_rate,
                "failure_rate": failure_rate,
                "ingested_lines": ingested_lines,
                "error_lines": error_lines,
            },
            "top_clusters": top_clusters,
            "recent_jobs": recent_jobs,
            "analysis_trend": trend_buckets,
            "level_distribution": level_distribution,
        }
        return Response(payload, status=status.HTTP_200_OK)


class LiveTailStreamView(APIView):
    poll_interval_seconds = 1.5
    keepalive_every = 6
    initial_batch_limit = 100
    stream_batch_limit = 50
    max_query_length = 200

    def _validate_filters(self, request):
        level = request.query_params.get("level", "").strip().lower()
        if level and level not in ALLOWED_EVENT_LEVELS:
            raise ValidationError(
                {"level": f"Unsupported level '{level}'. Allowed: {', '.join(sorted(ALLOWED_EVENT_LEVELS))}."}
            )

        search_query = request.query_params.get("q", "").strip()
        if len(search_query) > self.max_query_length:
            raise ValidationError({"q": f"Search query exceeds {self.max_query_length} characters."})

        analysis_id_param = request.query_params.get("analysis_id", "").strip()
        analysis_id = None
        if analysis_id_param:
            try:
                analysis_id = int(analysis_id_param)
            except ValueError as error:
                raise ValidationError({"analysis_id": "analysis_id must be an integer."}) from error
            owned_analysis = AnalysisRun.objects.filter(
                id=analysis_id,
                source__owner=request.user,
            ).exists()
            if not owned_analysis:
                raise NotFound("Analysis not found.")

        return level, search_query, analysis_id

    def _fetch_events(
        self,
        *,
        owner_id: int,
        level: str,
        search_query: str,
        analysis_id: int | None,
        cursor_id: int | None,
        batch_limit: int,
    ):
        queryset = LogEvent.objects.filter(analysis_run__source__owner_id=owner_id).select_related(
            "analysis_run",
            "analysis_run__source",
        )
        if analysis_id is not None:
            queryset = queryset.filter(analysis_run_id=analysis_id)
        if level:
            queryset = queryset.filter(level=level)
        if search_query:
            queryset = queryset.filter(message__icontains=search_query)

        if cursor_id is None:
            rows = list(queryset.order_by("-id")[:batch_limit])
            rows.reverse()
        else:
            rows = list(queryset.filter(id__gt=cursor_id).order_by("id")[:batch_limit])

        events = []
        newest_cursor = cursor_id or 0
        for event in rows:
            redacted_message, _, _ = redact_text(event.message or "")
            redacted_service, _, _ = redact_text(event.service or "")
            events.append(
                {
                    "id": event.id,
                    "analysis_id": event.analysis_run_id,
                    "source_id": event.analysis_run.source_id,
                    "source_name": event.analysis_run.source.name,
                    "line_no": event.line_no,
                    "timestamp": event.timestamp,
                    "level": event.level,
                    "service": redacted_service,
                    "message": redacted_message,
                    "created_at": event.created_at,
                }
            )
            newest_cursor = max(newest_cursor, event.id)

        return events, newest_cursor if newest_cursor > 0 else cursor_id

    def get(self, request):
        level, search_query, analysis_id = self._validate_filters(request)
        owner_id = request.user.id

        def event_stream():
            yield "retry: 5000\n\n"
            cursor_id = None
            events, cursor_id = self._fetch_events(
                owner_id=owner_id,
                level=level,
                search_query=search_query,
                analysis_id=analysis_id,
                cursor_id=cursor_id,
                batch_limit=self.initial_batch_limit,
            )
            payload = {
                "events": events,
                "cursor": cursor_id,
                "snapshot": True,
            }
            yield f"data: {json.dumps(payload, default=str)}\n\n"

            idle_cycles = 0
            while True:
                events, cursor_id = self._fetch_events(
                    owner_id=owner_id,
                    level=level,
                    search_query=search_query,
                    analysis_id=analysis_id,
                    cursor_id=cursor_id,
                    batch_limit=self.stream_batch_limit,
                )
                if events:
                    payload = {
                        "events": events,
                        "cursor": cursor_id,
                        "snapshot": False,
                    }
                    yield f"data: {json.dumps(payload, default=str)}\n\n"
                    idle_cycles = 0
                else:
                    idle_cycles += 1
                    if idle_cycles >= self.keepalive_every:
                        yield ": keepalive\n\n"
                        idle_cycles = 0

                time.sleep(self.poll_interval_seconds)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


ANOMALY_MAX_GROUPS = 100
ANOMALY_MAX_EVIDENCE_EVENTS = 40


def _normalize_anomaly_service(service_value: str) -> str:
    normalized = (service_value or "").strip()
    if normalized.lower() == "unknown":
        return ""
    return normalized


def _validate_anomaly_fingerprint(fingerprint: str) -> str:
    normalized = (fingerprint or "").strip().lower()
    if len(normalized) < 32 or len(normalized) > 64 or any(ch not in "0123456789abcdef" for ch in normalized):
        raise ValidationError({"fingerprint": "fingerprint must be a 32-64 character lowercase hex string."})
    return normalized


def _build_anomaly_status(now, *, total_events: int, last_seen, reviewed: bool) -> str:
    if reviewed:
        return AnomalyReviewState.Status.REVIEWED
    if last_seen and now - last_seen <= timezone.timedelta(hours=1):
        return "active"
    if total_events >= 40:
        return "investigating"
    return "new"


def _build_anomaly_score(*, total_events: int, analyses: int) -> float:
    return min(
        100.0,
        round((math.log10(total_events + 1) * 28.0) + (analyses * 7.5), 2),
    )


class AnomalyGroupListView(APIView):
    def get(self, request):
        now = timezone.now()
        grouped = list(
            LogEvent.objects.filter(analysis_run__source__owner=request.user)
            .exclude(level__in=["debug", "info"])
            .values("fingerprint", "service")
            .annotate(
                total_events=Count("id"),
                analyses=Count("analysis_run", distinct=True),
                first_seen=Min("timestamp"),
                last_seen=Max("timestamp"),
                first_ingested=Min("created_at"),
                last_ingested=Max("created_at"),
            )
            .order_by("-total_events", "-last_ingested")[:ANOMALY_MAX_GROUPS]
        )
        review_states = {
            (review.fingerprint, review.service): review
            for review in AnomalyReviewState.objects.filter(owner=request.user)
        }

        payload = []
        for group in grouped:
            total_events = int(group.get("total_events") or 0)
            analyses = int(group.get("analyses") or 0)
            service_key = _normalize_anomaly_service(group.get("service") or "")
            review_state = review_states.get((group.get("fingerprint") or "", service_key))
            last_seen = group.get("last_seen") or group.get("last_ingested")
            first_seen = group.get("first_seen") or group.get("first_ingested")

            payload.append(
                {
                    "fingerprint": group.get("fingerprint"),
                    "service": service_key or "unknown",
                    "score": _build_anomaly_score(total_events=total_events, analyses=analyses),
                    "total_events": total_events,
                    "analyses": analyses,
                    "first_seen": first_seen,
                    "last_seen": last_seen,
                    "status": _build_anomaly_status(
                        now,
                        total_events=total_events,
                        last_seen=last_seen,
                        reviewed=bool(
                            review_state and review_state.status == AnomalyReviewState.Status.REVIEWED
                        ),
                    ),
                    "reviewed_at": review_state.reviewed_at if review_state else None,
                }
            )

        payload.sort(
            key=lambda item: (
                item["score"],
                (item["last_seen"] or item["first_seen"]).isoformat()
                if item["last_seen"] or item["first_seen"]
                else "",
            ),
            reverse=True,
        )
        return Response(payload, status=status.HTTP_200_OK)


class AnomalyGroupDetailView(APIView):
    def get(self, request, fingerprint: str):
        normalized_fingerprint = _validate_anomaly_fingerprint(fingerprint)
        service = request.query_params.get("service", "")
        if len(service) > 128:
            raise ValidationError({"service": "service exceeds 128 characters."})
        service_key = _normalize_anomaly_service(service)

        event_queryset = LogEvent.objects.filter(
            analysis_run__source__owner=request.user,
            fingerprint=normalized_fingerprint,
        )
        if service_key:
            event_queryset = event_queryset.filter(service=service_key)
        else:
            event_queryset = event_queryset.filter(service="")

        if not event_queryset.exists():
            raise NotFound("Anomaly group not found.")

        aggregates = event_queryset.aggregate(
            total_events=Count("id"),
            analyses=Count("analysis_run", distinct=True),
            first_seen=Min("timestamp"),
            last_seen=Max("timestamp"),
            first_ingested=Min("created_at"),
            last_ingested=Max("created_at"),
        )
        first_seen = aggregates["first_seen"] or aggregates["first_ingested"]
        last_seen = aggregates["last_seen"] or aggregates["last_ingested"]
        total_events = int(aggregates["total_events"] or 0)
        analyses = int(aggregates["analyses"] or 0)

        review_state = AnomalyReviewState.objects.filter(
            owner=request.user,
            fingerprint=normalized_fingerprint,
            service=service_key,
        ).first()
        status_value = _build_anomaly_status(
            timezone.now(),
            total_events=total_events,
            last_seen=last_seen,
            reviewed=bool(review_state and review_state.status == AnomalyReviewState.Status.REVIEWED),
        )

        evidence_events = []
        for event in event_queryset.select_related("analysis_run", "analysis_run__source").order_by("-created_at")[
            :ANOMALY_MAX_EVIDENCE_EVENTS
        ]:
            redacted_message, _, _ = redact_text(event.message or "")
            redacted_service, _, _ = redact_text(event.service or "")
            evidence_events.append(
                {
                    "id": event.id,
                    "analysis_id": event.analysis_run_id,
                    "source_id": event.analysis_run.source_id,
                    "source_name": event.analysis_run.source.name,
                    "timestamp": event.timestamp,
                    "level": event.level,
                    "service": redacted_service or "unknown",
                    "message": redacted_message,
                    "line_no": event.line_no,
                }
            )

        payload = {
            "fingerprint": normalized_fingerprint,
            "service": service_key or "unknown",
            "score": _build_anomaly_score(total_events=total_events, analyses=analyses),
            "total_events": total_events,
            "analyses": analyses,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "status": status_value,
            "reviewed_at": review_state.reviewed_at if review_state else None,
            "evidence_events": evidence_events,
        }
        return Response(payload, status=status.HTTP_200_OK)


class AnomalyGroupReviewView(APIView):
    def post(self, request, fingerprint: str):
        normalized_fingerprint = _validate_anomaly_fingerprint(fingerprint)
        service = request.data.get("service", "")
        if not isinstance(service, str):
            raise ValidationError({"service": "service must be a string."})
        if len(service) > 128:
            raise ValidationError({"service": "service exceeds 128 characters."})
        service_key = _normalize_anomaly_service(service)

        requested_status = request.data.get("status", AnomalyReviewState.Status.REVIEWED)
        if requested_status not in {
            AnomalyReviewState.Status.OPEN,
            AnomalyReviewState.Status.REVIEWED,
        }:
            raise ValidationError(
                {
                    "status": "status must be 'open' or 'reviewed'.",
                }
            )

        event_exists = LogEvent.objects.filter(
            analysis_run__source__owner=request.user,
            fingerprint=normalized_fingerprint,
            service=service_key,
        ).exists()
        if not event_exists:
            raise NotFound("Anomaly group not found.")

        review_state, _ = AnomalyReviewState.objects.update_or_create(
            owner=request.user,
            fingerprint=normalized_fingerprint,
            service=service_key,
            defaults={
                "status": requested_status,
                "reviewed_at": (
                    timezone.now() if requested_status == AnomalyReviewState.Status.REVIEWED else None
                ),
            },
        )
        return Response(
            {
                "fingerprint": normalized_fingerprint,
                "service": service_key or "unknown",
                "status": review_state.status,
                "reviewed_at": review_state.reviewed_at,
            },
            status=status.HTTP_200_OK,
        )


class IncidentListView(APIView):
    default_page_size = 20
    max_page_size = 100

    def get(self, request):
        status_filter = request.query_params.get("status", "").strip().lower()
        severity_filter = request.query_params.get("severity", "").strip().lower()
        owner_filter = request.query_params.get("owner", "").strip()

        valid_statuses = {choice for choice, _ in Incident.Status.choices}
        if status_filter and status_filter not in valid_statuses:
            raise ValidationError({"status": f"Unsupported status '{status_filter}'."})

        valid_severities = {choice for choice, _ in Incident.Severity.choices}
        if severity_filter and severity_filter not in valid_severities:
            raise ValidationError({"severity": f"Unsupported severity '{severity_filter}'."})

        page_param = request.query_params.get("page", "1").strip()
        page_size_param = request.query_params.get("page_size", str(self.default_page_size)).strip()
        try:
            page = int(page_param)
            page_size = int(page_size_param)
        except ValueError as error:
            raise ValidationError({"page": "page and page_size must be integers."}) from error
        if page < 1:
            raise ValidationError({"page": "page must be >= 1."})
        if page_size < 1 or page_size > self.max_page_size:
            raise ValidationError({"page_size": f"page_size must be between 1 and {self.max_page_size}."})

        queryset = Incident.objects.filter(owner=request.user).select_related("analysis_run", "analysis_run__source")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if severity_filter:
            queryset = queryset.filter(severity=severity_filter)
        if owner_filter:
            queryset = queryset.filter(assigned_owner__icontains=owner_filter)

        paginator = Paginator(queryset.order_by("-created_at"), page_size)
        try:
            page_obj = paginator.page(page)
        except EmptyPage as error:
            raise ValidationError({"page": "Requested page is out of range."}) from error

        return Response(
            {
                "count": paginator.count,
                "page": page_obj.number,
                "page_size": page_size,
                "results": IncidentSerializer(page_obj.object_list, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class IncidentDetailView(APIView):
    def get(self, request, incident_id: int):
        incident = (
            Incident.objects.select_related("analysis_run", "analysis_run__source")
            .filter(id=incident_id, owner=request.user)
            .first()
        )
        if incident is None:
            raise NotFound("Incident not found.")

        payload = IncidentSerializer(incident).data

        timeline = [
            {
                "label": "Incident created",
                "timestamp": incident.created_at,
                "detail": incident.title,
            }
        ]
        linked_clusters = []
        if incident.analysis_run_id:
            if incident.analysis_run.started_at:
                timeline.append(
                    {
                        "label": "Analysis started",
                        "timestamp": incident.analysis_run.started_at,
                        "detail": f"Analysis #{incident.analysis_run_id}",
                    }
                )
            if incident.analysis_run.finished_at:
                timeline.append(
                    {
                        "label": "Analysis finished",
                        "timestamp": incident.analysis_run.finished_at,
                        "detail": f"Status: {incident.analysis_run.status}",
                    }
                )
            cluster_queryset = LogCluster.objects.filter(analysis_run_id=incident.analysis_run_id).order_by("-count")[:5]
            for cluster in cluster_queryset:
                linked_clusters.append(
                    {
                        "id": cluster.id,
                        "fingerprint": cluster.fingerprint,
                        "title": cluster.title,
                        "count": cluster.count,
                        "first_seen": cluster.first_seen,
                        "last_seen": cluster.last_seen,
                    }
                )
                if cluster.last_seen:
                    timeline.append(
                        {
                            "label": "Cluster seen",
                            "timestamp": cluster.last_seen,
                            "detail": cluster.title,
                        }
                    )

        timeline.sort(
            key=lambda entry: entry["timestamp"].isoformat() if entry["timestamp"] else "",
        )

        payload["timeline"] = timeline
        payload["linked_clusters"] = linked_clusters
        return Response(payload, status=status.HTTP_200_OK)


class ReportRunListCreateView(APIView):
    def get(self, request):
        history = ReportRun.objects.filter(owner=request.user).select_related("analysis_run")[:100]
        schedules = ReportSchedule.objects.filter(owner=request.user)
        return Response(
            {
                "history": ReportRunSerializer(history, many=True).data,
                "schedules": ReportScheduleSerializer(schedules, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        analysis_id = request.data.get("analysis_id")
        report_format = (request.data.get("format") or "").strip().lower()
        if report_format not in {ReportRun.Format.JSON, ReportRun.Format.MARKDOWN}:
            raise ValidationError({"format": "format must be json or markdown."})
        try:
            analysis_id = int(analysis_id)
        except (TypeError, ValueError) as error:
            raise ValidationError({"analysis_id": "analysis_id must be an integer."}) from error

        analysis = AnalysisRun.objects.filter(id=analysis_id, source__owner=request.user).first()
        if analysis is None:
            raise NotFound("Analysis not found.")

        report_run = ReportRun.objects.create(
            owner=request.user,
            analysis_run=analysis,
            format=report_format,
            status=ReportRun.Status.COMPLETED,
            report_scope={"analysis_id": analysis.id},
        )
        download_path = (
            f"/api/analyses/{analysis.id}/export.json"
            if report_format == ReportRun.Format.JSON
            else f"/api/analyses/{analysis.id}/export.md"
        )
        return Response(
            {
                "report": ReportRunSerializer(report_run).data,
                "download_path": download_path,
            },
            status=status.HTTP_201_CREATED,
        )


class ReportRunRegenerateView(APIView):
    def post(self, request, report_id: int):
        report = ReportRun.objects.filter(id=report_id, owner=request.user).select_related("analysis_run").first()
        if report is None:
            raise NotFound("Report not found.")
        if report.analysis_run is None:
            raise ValidationError({"report": "Report is not linked to an analysis."})

        new_report = ReportRun.objects.create(
            owner=request.user,
            analysis_run=report.analysis_run,
            format=report.format,
            status=ReportRun.Status.COMPLETED,
            report_scope=report.report_scope,
        )
        download_path = (
            f"/api/analyses/{report.analysis_run.id}/export.json"
            if report.format == ReportRun.Format.JSON
            else f"/api/analyses/{report.analysis_run.id}/export.md"
        )
        return Response(
            {
                "report": ReportRunSerializer(new_report).data,
                "download_path": download_path,
            },
            status=status.HTTP_201_CREATED,
        )


class ReportScheduleListCreateView(APIView):
    def get(self, request):
        schedules = ReportSchedule.objects.filter(owner=request.user)
        return Response(ReportScheduleSerializer(schedules, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ReportScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save(owner=request.user)
        return Response(ReportScheduleSerializer(schedule).data, status=status.HTTP_201_CREATED)


class ReportScheduleDetailView(APIView):
    def patch(self, request, schedule_id: int):
        schedule = ReportSchedule.objects.filter(id=schedule_id, owner=request.user).first()
        if schedule is None:
            raise NotFound("Report schedule not found.")
        serializer = ReportScheduleSerializer(instance=schedule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(ReportScheduleSerializer(updated).data, status=status.HTTP_200_OK)


class IntegrationConfigView(APIView):
    def get(self, request):
        config, _ = IntegrationConfig.objects.get_or_create(owner=request.user)
        return Response(IntegrationConfigSerializer(config).data, status=status.HTTP_200_OK)

    def put(self, request):
        config, _ = IntegrationConfig.objects.get_or_create(owner=request.user)
        serializer = IntegrationConfigSerializer(instance=config, data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.SETTINGS_UPDATE,
            metadata={"area": "integrations", "llm_provider": updated.llm_provider},
        )
        return Response(IntegrationConfigSerializer(updated).data, status=status.HTTP_200_OK)


class IntegrationConnectionTestView(APIView):
    request_timeout_seconds = 5

    def _extract_host(self, raw_url: str) -> str:
        parsed = urlparse.urlsplit(raw_url or "")
        return parsed.netloc or ""

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        target = (payload.get("target") or "").strip().lower()
        if target not in {"llm", "webhook", "issue_tracker"}:
            raise ValidationError({"target": "target must be one of: llm, webhook, issue_tracker."})

        config, _ = IntegrationConfig.objects.get_or_create(owner=request.user)
        url_value = ""
        if target == "llm":
            if config.llm_provider == IntegrationConfig.LLMProvider.MOCK:
                safe_log_audit_event(
                    owner_id=request.user.id,
                    actor_id=request.user.id,
                    event_type=AuditLogEvent.EventType.INTEGRATION_TEST,
                    metadata={"target": target, "provider": config.llm_provider, "result": "ok"},
                )
                return Response(
                    {
                        "target": target,
                        "ok": True,
                        "message": "Mock provider enabled; external connectivity test not required.",
                    },
                    status=status.HTTP_200_OK,
                )
            url_value = config.llm_api_url or settings.LLM_API_URL
        elif target == "webhook":
            url_value = config.alert_webhook_url
        else:
            url_value = config.issue_tracker_url

        if not url_value:
            raise ValidationError({"detail": f"{target} endpoint is not configured."})

        host = self._extract_host(url_value)
        ok = False
        status_code = None
        message = "Connection test failed."
        try:
            req = urlrequest.Request(url_value, method="GET")
            with urlrequest.urlopen(req, timeout=self.request_timeout_seconds) as response:
                status_code = getattr(response, "status", None)
            ok = status_code is not None and int(status_code) < 500
            message = "Connection successful." if ok else "Endpoint reachable but returned server error."
        except urlerror.HTTPError as error:
            status_code = error.code
            ok = int(error.code) < 500
            message = (
                f"Endpoint responded with HTTP {error.code}."
                if ok
                else f"Endpoint responded with HTTP {error.code} (server error)."
            )
        except Exception:
            ok = False
            message = "Unable to reach endpoint."

        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.INTEGRATION_TEST,
            metadata={
                "target": target,
                "host": host,
                "http_status": status_code,
                "result": "ok" if ok else "failed",
            },
        )

        return Response(
            {
                "target": target,
                "ok": ok,
                "http_status": status_code,
                "message": message,
            },
            status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST,
        )


class WorkspacePreferenceView(APIView):
    def get(self, request):
        prefs, _ = WorkspacePreference.objects.get_or_create(owner=request.user)
        return Response(WorkspacePreferenceSerializer(prefs).data, status=status.HTTP_200_OK)

    def put(self, request):
        prefs, _ = WorkspacePreference.objects.get_or_create(owner=request.user)
        serializer = WorkspacePreferenceSerializer(instance=prefs, data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.SETTINGS_UPDATE,
            metadata={
                "area": "workspace",
                "retention_days": updated.retention_days,
                "default_level_filter": updated.default_level_filter,
                "timezone": updated.timezone,
            },
        )
        return Response(WorkspacePreferenceSerializer(updated).data, status=status.HTTP_200_OK)


class AnalysisClusterListView(APIView):
    def get(self, request, analysis_id: int):
        analysis = (
            AnalysisRun.objects.select_related("source")
            .filter(id=analysis_id, source__owner=request.user)
            .first()
        )
        if analysis is None:
            raise NotFound("Analysis not found.")

        clusters = analysis.clusters.all().order_by("-count", "fingerprint")
        return Response(LogClusterSerializer(clusters, many=True).data, status=status.HTTP_200_OK)


class AnalysisEventListView(APIView):
    def get(self, request, analysis_id: int):
        analysis = (
            AnalysisRun.objects.select_related("source")
            .filter(id=analysis_id, source__owner=request.user)
            .first()
        )
        if analysis is None:
            raise NotFound("Analysis not found.")

        events = LogEvent.objects.filter(analysis_run=analysis)
        search_query = request.query_params.get("q", "").strip()
        if len(search_query) > 300:
            raise ValidationError({"q": "Search query exceeds 300 characters."})

        level = request.query_params.get("level", "").strip().lower()
        if level:
            if level not in ALLOWED_EVENT_LEVELS:
                raise ValidationError(
                    {"level": f"Unsupported level '{level}'. Allowed: {', '.join(sorted(ALLOWED_EVENT_LEVELS))}."}
                )
            events = events.filter(level=level)

        service = request.query_params.get("service", "").strip()
        if len(service) > 128:
            raise ValidationError({"service": "Service filter exceeds 128 characters."})
        if service:
            events = events.filter(service__icontains=service)

        if search_query:
            events = events.filter(message__icontains=search_query)

        line_from_param = request.query_params.get("line_from", "").strip()
        line_to_param = request.query_params.get("line_to", "").strip()
        if line_from_param:
            try:
                line_from = int(line_from_param)
            except ValueError as error:
                raise ValidationError({"line_from": "line_from must be an integer."}) from error
            if line_from < 1:
                raise ValidationError({"line_from": "line_from must be greater than or equal to 1."})
            events = events.filter(line_no__gte=line_from)
        else:
            line_from = None

        if line_to_param:
            try:
                line_to = int(line_to_param)
            except ValueError as error:
                raise ValidationError({"line_to": "line_to must be an integer."}) from error
            if line_to < 1:
                raise ValidationError({"line_to": "line_to must be greater than or equal to 1."})
            events = events.filter(line_no__lte=line_to)
        else:
            line_to = None

        if line_from is not None and line_to is not None and line_from > line_to:
            raise ValidationError({"line_to": "line_to must be greater than or equal to line_from."})

        limit_param = request.query_params.get("limit", "").strip()
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError as error:
                raise ValidationError({"limit": "limit must be an integer."}) from error
        else:
            limit = DEFAULT_EVENT_QUERY_LIMIT

        if limit < 1 or limit > MAX_EVENT_QUERY_LIMIT:
            raise ValidationError({"limit": f"limit must be between 1 and {MAX_EVENT_QUERY_LIMIT}."})

        payload = LogEventSerializer(events.order_by("line_no")[:limit], many=True).data
        return Response(payload, status=status.HTTP_200_OK)


class AnalysisExportJSONView(APIView):
    def get(self, request, analysis_id: int):
        analysis = (
            AnalysisRun.objects.select_related("source", "ai_insight")
            .filter(id=analysis_id, source__owner=request.user)
            .first()
        )
        if analysis is None:
            raise NotFound("Analysis not found.")

        total_events = LogEvent.objects.filter(analysis_run=analysis).count()
        event_limit = settings.EXPORT_MAX_EVENTS
        events_qs = LogEvent.objects.filter(analysis_run=analysis).order_by("line_no")
        export_truncated = total_events > event_limit
        if export_truncated:
            events_qs = events_qs[:event_limit]

        events_payload = []
        for event in events_qs.values(
            "id",
            "line_no",
            "timestamp",
            "level",
            "service",
            "message",
            "trace_id",
            "request_id",
            "tags",
        ):
            redacted_message, _, _ = redact_text(event.get("message") or "")
            redacted_service, _, _ = redact_text(event.get("service") or "")
            redacted_trace_id, _, _ = redact_text(event.get("trace_id") or "")
            redacted_request_id, _, _ = redact_text(event.get("request_id") or "")
            events_payload.append(
                {
                    **event,
                    "service": redacted_service,
                    "message": redacted_message,
                    "trace_id": redacted_trace_id or None,
                    "request_id": redacted_request_id or None,
                }
            )

        ai_insight_payload = None
        if hasattr(analysis, "ai_insight") and analysis.ai_insight is not None:
            ai_insight_payload = {
                "executive_summary": analysis.ai_insight.executive_summary,
                "root_causes": analysis.ai_insight.root_causes,
                "overall_confidence": analysis.ai_insight.overall_confidence,
                "evidence_references": analysis.ai_insight.evidence_references,
                "remediation": analysis.ai_insight.remediation,
                "runbook": analysis.ai_insight.runbook,
                "updated_at": analysis.ai_insight.updated_at,
            }

        payload = {
            "exported_at": timezone.now(),
            "analysis": {
                "id": analysis.id,
                "status": analysis.status,
                "started_at": analysis.started_at,
                "finished_at": analysis.finished_at,
                "stats": analysis.stats,
                "error_message": analysis.error_message,
                "created_at": analysis.created_at,
                "updated_at": analysis.updated_at,
            },
            "source": {
                "id": analysis.source.id,
                "name": analysis.source.name,
                "type": analysis.source.type,
                "created_at": analysis.source.created_at,
            },
            "clusters": LogClusterSerializer(
                analysis.clusters.all().order_by("-count", "fingerprint"),
                many=True,
            ).data,
            "events": events_payload,
            "events_count_total": total_events,
            "events_count_exported": len(events_payload),
            "events_truncated": export_truncated,
            "ai_insight": ai_insight_payload,
        }

        response = Response(payload, status=status.HTTP_200_OK)
        response["Content-Disposition"] = f'attachment; filename=\"analysis-{analysis.id}-export.json\"'
        safe_log_audit_event(
            owner_id=analysis.source.owner_id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.EXPORT,
            source_id=analysis.source_id,
            analysis_id=analysis.id,
            metadata={"format": "json", "events_exported": len(events_payload)},
        )
        return response


class AnalysisExportMarkdownView(APIView):
    def get(self, request, analysis_id: int):
        analysis = (
            AnalysisRun.objects.select_related("source", "ai_insight")
            .filter(id=analysis_id, source__owner=request.user)
            .first()
        )
        if analysis is None:
            raise NotFound("Analysis not found.")

        markdown_cluster_limit = max(1, int(settings.EXPORT_MARKDOWN_MAX_CLUSTERS))
        markdown_event_limit = max(1, int(settings.EXPORT_MARKDOWN_MAX_EVENTS))

        clusters = list(
            analysis.clusters.all().order_by("-count", "fingerprint")[:markdown_cluster_limit]
        )
        events = list(
            LogEvent.objects.filter(analysis_run=analysis)
            .order_by("line_no")
            .values("line_no", "timestamp", "level", "service", "message")[:markdown_event_limit]
        )

        def redact_value(value: str | None) -> str:
            redacted, _, _ = redact_text(value or "")
            return redacted

        lines: list[str] = [
            "# LogLens Incident Report",
            "",
            f"- Generated at: {timezone.now().isoformat()}",
            f"- Analysis ID: {analysis.id}",
            f"- Source: {analysis.source.name} ({analysis.source.type})",
            f"- Status: {analysis.status}",
            "",
            "## Summary",
        ]

        executive_summary = ""
        if hasattr(analysis, "ai_insight") and analysis.ai_insight is not None:
            executive_summary = redact_value(analysis.ai_insight.executive_summary)

        if executive_summary:
            lines.append(executive_summary)
        else:
            total_lines = analysis.stats.get("total_lines", 0)
            error_count = analysis.stats.get("error_count", 0)
            lines.append(
                f"Processed {total_lines} log lines with {error_count} error/fatal events. "
                "No AI executive summary is available."
            )

        lines.extend(
            [
                "",
                "## Key Stats",
                "",
                f"- Total lines: {analysis.stats.get('total_lines', 0)}",
                f"- Error count: {analysis.stats.get('error_count', 0)}",
                f"- Services: {', '.join(analysis.stats.get('services', [])) or 'n/a'}",
                "",
                "## Top Clusters",
                "",
            ]
        )

        if clusters:
            lines.extend(
                [
                    "| Cluster ID | Count | Title | Services | Window |",
                    "| --- | ---: | --- | --- | --- |",
                ]
            )
            for cluster in clusters:
                lines.append(
                    "| "
                    f"{cluster.id} | "
                    f"{cluster.count} | "
                    f"{_escape_markdown_cell(redact_value(cluster.title))} | "
                    f"{_escape_markdown_cell(', '.join(cluster.affected_services or []) or 'n/a')} | "
                    f"{cluster.first_seen or 'n/a'} to {cluster.last_seen or 'n/a'} |"
                )
        else:
            lines.append("No clusters available.")

        lines.extend(["", "## Root Cause Hypotheses", ""])
        root_causes = []
        remediation = ""
        runbook = ""
        if hasattr(analysis, "ai_insight") and analysis.ai_insight is not None:
            root_causes = analysis.ai_insight.root_causes or []
            remediation = redact_value(analysis.ai_insight.remediation)
            runbook = redact_value(analysis.ai_insight.runbook)

        if root_causes:
            for index, root_cause in enumerate(root_causes, start=1):
                title = redact_value(str(root_cause.get("title") or "Untitled root cause"))
                rationale = redact_value(str(root_cause.get("rationale") or ""))
                confidence = root_cause.get("confidence")
                evidence = root_cause.get("evidence_cluster_ids") or []
                confidence_text = f" (confidence: {confidence})" if confidence is not None else ""
                evidence_text = f" | evidence clusters: {', '.join(map(str, evidence))}" if evidence else ""
                lines.append(f"{index}. **{title}**{confidence_text}{evidence_text}")
                if rationale:
                    lines.append(f"   - {rationale}")
        else:
            lines.append("No AI root cause hypotheses available.")

        lines.extend(["", "## Remediation", ""])
        lines.append(remediation or "No remediation guidance available.")

        lines.extend(["", "## Runbook", ""])
        lines.append(runbook or "No runbook guidance available.")

        lines.extend(["", "## Event Excerpts", ""])
        if events:
            for event in events:
                message = redact_value(event.get("message") or "")
                service = redact_value(event.get("service") or "")
                lines.append(
                    f"- line {event.get('line_no')} [{event.get('level')}] "
                    f"{service or 'n/a'}: {message}"
                )
        else:
            lines.append("No events available for this analysis.")

        report = "\n".join(lines).strip() + "\n"
        response = HttpResponse(report, content_type="text/markdown; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename=\"analysis-{analysis.id}-report.md\"'
        safe_log_audit_event(
            owner_id=analysis.source.owner_id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.EXPORT,
            source_id=analysis.source_id,
            analysis_id=analysis.id,
            metadata={"format": "markdown", "clusters_included": len(clusters), "events_included": len(events)},
        )
        return response


class ClusterDetailView(APIView):
    def get(self, request, cluster_id: int):
        cluster = (
            LogCluster.objects.select_related("analysis_run", "analysis_run__source")
            .filter(id=cluster_id, analysis_run__source__owner=request.user)
            .first()
        )
        if cluster is None:
            raise NotFound("Cluster not found.")

        sample_line_numbers = cluster.sample_events or []
        sample_events = list(
            LogEvent.objects.filter(
                analysis_run=cluster.analysis_run,
                line_no__in=sample_line_numbers,
            )
            .order_by("line_no")
            .values("line_no", "level", "service", "message")
        )
        payload = LogClusterSerializer(cluster).data
        payload["sample_log_events"] = sample_events
        return Response(payload, status=status.HTTP_200_OK)
