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
