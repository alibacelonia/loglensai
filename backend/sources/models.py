from django.conf import settings
from django.db import models
from django.db.models import Q


class Source(models.Model):
    class SourceType(models.TextChoices):
        UPLOAD = "upload", "Upload"
        PASTE = "paste", "Paste"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sources",
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=16, choices=SourceType.choices, db_index=True)
    file_object_key = models.CharField(max_length=1024, null=True, blank=True)
    content_text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "-created_at"], name="source_owner_created_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                name="source_upload_requires_file_object",
                check=~Q(type="upload") | Q(file_object_key__isnull=False),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.type})"
