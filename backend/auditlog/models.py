from django.conf import settings
from django.db import models


class AuditLogEvent(models.Model):
    class EventType(models.TextChoices):
        UPLOAD = "upload", "Upload"
        ANALYZE_START = "analyze_start", "Analyze Start"
        ANALYZE_FINISH = "analyze_finish", "Analyze Finish"
        ANALYZE_FAIL = "analyze_fail", "Analyze Fail"
        EXPORT = "export", "Export"
        DELETE = "delete", "Delete"
        INTEGRATION_TEST = "integration_test", "Integration Test"
        SETTINGS_UPDATE = "settings_update", "Settings Update"
        ACCOUNT_SECURITY = "account_security", "Account Security"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="audit_log_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_actions",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices, db_index=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    analysis_id = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "-created_at"], name="audit_owner_created_idx"),
            models.Index(fields=["owner", "event_type"], name="audit_owner_event_idx"),
        ]

    def __str__(self) -> str:
        return f"audit:{self.event_type}:{self.owner_id}:{self.created_at.isoformat()}"
