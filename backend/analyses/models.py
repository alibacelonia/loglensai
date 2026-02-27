from django.conf import settings
from django.db import models
from django.db.models import Q

from sources.models import Source


class AnalysisRun(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="analyses")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    stats = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["source", "-created_at"], name="analysis_source_created_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                name="analysis_finished_after_started",
                check=Q(finished_at__isnull=True)
                | Q(started_at__isnull=True)
                | Q(finished_at__gte=models.F("started_at")),
            ),
            models.UniqueConstraint(
                fields=["source"],
                condition=Q(status__in=["queued", "running"]),
                name="analysis_single_active_per_source",
            ),
        ]

    def __str__(self) -> str:
        return f"Analysis {self.id} ({self.status})"


class LogEvent(models.Model):
    analysis_run = models.ForeignKey(
        AnalysisRun,
        on_delete=models.CASCADE,
        related_name="log_events",
    )
    timestamp = models.DateTimeField(null=True, blank=True)
    level = models.CharField(max_length=16, default="unknown", db_index=True)
    service = models.CharField(max_length=128, blank=True, default="")
    message = models.TextField()
    raw = models.TextField()
    fingerprint = models.CharField(max_length=64, db_index=True)
    trace_id = models.CharField(max_length=128, null=True, blank=True)
    request_id = models.CharField(max_length=128, null=True, blank=True)
    line_no = models.PositiveIntegerField()
    tags = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["line_no"]
        constraints = [
            models.UniqueConstraint(
                fields=["analysis_run", "line_no"],
                name="logevent_unique_line_per_analysis",
            ),
        ]
        indexes = [
            models.Index(fields=["analysis_run", "line_no"], name="logevent_analysis_line_idx"),
            models.Index(fields=["analysis_run", "level"], name="logevent_analysis_level_idx"),
            models.Index(fields=["analysis_run", "fingerprint"], name="logevent_analysis_fp_idx"),
        ]

    def __str__(self) -> str:
        return f"LogEvent {self.analysis_run_id}:{self.line_no}"


class LogCluster(models.Model):
    analysis_run = models.ForeignKey(
        AnalysisRun,
        on_delete=models.CASCADE,
        related_name="clusters",
    )
    fingerprint = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=255)
    count = models.PositiveIntegerField()
    first_seen = models.DateTimeField(null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    sample_events = models.JSONField(default=list, blank=True)
    affected_services = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-count", "fingerprint"]
        constraints = [
            models.UniqueConstraint(
                fields=["analysis_run", "fingerprint"],
                name="logcluster_unique_fingerprint_per_analysis",
            ),
        ]
        indexes = [
            models.Index(fields=["analysis_run", "-count"], name="logcluster_analysis_count_idx"),
        ]

    def __str__(self) -> str:
        return f"LogCluster {self.analysis_run_id}:{self.fingerprint[:8]}"


class AIInsight(models.Model):
    analysis_run = models.OneToOneField(
        AnalysisRun,
        on_delete=models.CASCADE,
        related_name="ai_insight",
    )
    executive_summary = models.TextField(blank=True, default="")
    root_causes = models.JSONField(default=list, blank=True)
    overall_confidence = models.FloatField(null=True, blank=True)
    evidence_references = models.JSONField(default=list, blank=True)
    remediation = models.TextField(blank=True, default="")
    runbook = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"AIInsight analysis={self.analysis_run_id}"


class AnomalyReviewState(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        REVIEWED = "reviewed", "Reviewed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="anomaly_review_states",
    )
    fingerprint = models.CharField(max_length=64, db_index=True)
    service = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "fingerprint", "service"],
                name="anomaly_review_unique_owner_fp_service",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "status"], name="anom_rev_owner_status_idx"),
        ]

    def __str__(self) -> str:
        return f"anomaly-review:{self.owner_id}:{self.fingerprint[:8]}:{self.service or 'unknown'}"


class Incident(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        INVESTIGATING = "investigating", "Investigating"
        RESOLVED = "resolved", "Resolved"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="incidents",
    )
    analysis_run = models.ForeignKey(
        AnalysisRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incidents",
    )
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True, default="")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.OPEN, db_index=True)
    severity = models.CharField(max_length=24, choices=Severity.choices, default=Severity.MEDIUM, db_index=True)
    assigned_owner = models.CharField(max_length=128, blank=True, default="", db_index=True)
    remediation_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"], name="incident_owner_status_idx"),
            models.Index(fields=["owner", "severity"], name="incident_owner_sev_idx"),
        ]

    def __str__(self) -> str:
        return f"incident:{self.id}:{self.status}:{self.severity}"


class ReportRun(models.Model):
    class Format(models.TextChoices):
        JSON = "json", "JSON"
        MARKDOWN = "markdown", "Markdown"

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="report_runs",
    )
    analysis_run = models.ForeignKey(
        AnalysisRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="report_runs",
    )
    format = models.CharField(max_length=24, choices=Format.choices, default=Format.MARKDOWN)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.COMPLETED)
    report_scope = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "-created_at"], name="report_run_owner_created_idx"),
        ]


class ReportSchedule(models.Model):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="report_schedules",
    )
    frequency = models.CharField(max_length=24, choices=Frequency.choices, default=Frequency.WEEKLY)
    recipients = models.TextField(blank=True, default="")
    webhook_target = models.URLField(blank=True, default="")
    report_scope = models.JSONField(default=dict, blank=True)
    enabled = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "enabled"], name="report_sched_owner_enabled_idx"),
        ]


class IntegrationConfig(models.Model):
    class LLMProvider(models.TextChoices):
        MOCK = "mock", "Mock"
        OPENAI = "openai", "OpenAI Compatible"

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="integration_config",
    )
    llm_provider = models.CharField(max_length=32, choices=LLMProvider.choices, default=LLMProvider.MOCK)
    llm_api_url = models.URLField(blank=True, default="")
    alert_webhook_url = models.URLField(blank=True, default="")
    issue_tracker_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class WorkspacePreference(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_preference",
    )
    retention_days = models.PositiveIntegerField(default=30)
    default_level_filter = models.CharField(max_length=16, default="error")
    timezone = models.CharField(max_length=64, default="UTC")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
