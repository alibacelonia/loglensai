from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
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


def _escape_markdown_cell(value: str) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


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
