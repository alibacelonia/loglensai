from rest_framework import serializers

from zoneinfo import ZoneInfo

from rest_framework.exceptions import ValidationError

from analyses.models import (
    AIInsight,
    AnalysisRun,
    Incident,
    IntegrationConfig,
    LogCluster,
    LogEvent,
    ReportRun,
    ReportSchedule,
    WorkspacePreference,
)


class AIInsightSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = AIInsight
        fields = [
            "executive_summary",
            "overall_confidence",
            "evidence_references",
            "updated_at",
        ]
        read_only_fields = fields


class AnalysisRunSerializer(serializers.ModelSerializer):
    source_id = serializers.IntegerField(source="source.id", read_only=True)
    ai_insight = AIInsightSummarySerializer(read_only=True)

    class Meta:
        model = AnalysisRun
        fields = [
            "id",
            "source_id",
            "status",
            "started_at",
            "finished_at",
            "stats",
            "error_message",
            "created_at",
            "updated_at",
            "ai_insight",
        ]
        read_only_fields = fields


class LogClusterSerializer(serializers.ModelSerializer):
    analysis_id = serializers.IntegerField(source="analysis_run.id", read_only=True)

    class Meta:
        model = LogCluster
        fields = [
            "id",
            "analysis_id",
            "fingerprint",
            "title",
            "count",
            "first_seen",
            "last_seen",
            "sample_events",
            "affected_services",
        ]
        read_only_fields = fields


class LogEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = LogEvent
        fields = [
            "id",
            "analysis_run_id",
            "line_no",
            "timestamp",
            "level",
            "service",
            "message",
            "trace_id",
            "request_id",
        ]
        read_only_fields = fields


class IncidentSerializer(serializers.ModelSerializer):
    analysis_id = serializers.IntegerField(source="analysis_run_id", read_only=True)
    source_name = serializers.CharField(source="analysis_run.source.name", read_only=True)
    owner_display = serializers.CharField(source="assigned_owner", read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id",
            "title",
            "summary",
            "status",
            "severity",
            "owner_display",
            "analysis_id",
            "source_name",
            "remediation_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReportRunSerializer(serializers.ModelSerializer):
    analysis_id = serializers.IntegerField(source="analysis_run_id", read_only=True)

    class Meta:
        model = ReportRun
        fields = [
            "id",
            "analysis_id",
            "format",
            "status",
            "report_scope",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReportScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportSchedule
        fields = [
            "id",
            "frequency",
            "recipients",
            "webhook_target",
            "report_scope",
            "enabled",
            "last_run_at",
            "next_run_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "last_run_at",
            "next_run_at",
            "created_at",
            "updated_at",
        ]


class IntegrationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationConfig
        fields = [
            "llm_provider",
            "llm_api_url",
            "alert_webhook_url",
            "issue_tracker_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class WorkspacePreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspacePreference
        fields = [
            "retention_days",
            "default_level_filter",
            "timezone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_retention_days(self, value: int):
        if value < 1 or value > 3650:
            raise ValidationError("retention_days must be between 1 and 3650.")
        return value

    def validate_timezone(self, value: str):
        normalized = (value or "").strip()
        if not normalized:
            raise ValidationError("timezone is required.")
        try:
            ZoneInfo(normalized)
        except Exception as error:  # noqa: BLE001
            raise ValidationError("Unsupported timezone value.") from error
        return normalized
