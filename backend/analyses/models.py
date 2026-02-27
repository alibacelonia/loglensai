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
