from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from analyses.models import AnalysisRun, LogCluster, LogEvent
from analyses.redaction import redact_text
from analyses.serializers import AnalysisRunSerializer, LogClusterSerializer, LogEventSerializer
from analyses.tasks import analyze_source
from sources.models import Source

ALLOWED_EVENT_LEVELS = {"debug", "info", "warn", "error", "fatal", "unknown"}
DEFAULT_EVENT_QUERY_LIMIT = 100
MAX_EVENT_QUERY_LIMIT = 200


class SourceAnalysisListCreateView(APIView):
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
        try:
            analyze_source.delay(analysis.id)
        except Exception as error:
            analysis.status = AnalysisRun.Status.FAILED
            analysis.error_message = "Failed to enqueue analysis task."
            analysis.finished_at = timezone.now()
            analysis.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
            raise APIException("Failed to enqueue analysis task.") from error

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
