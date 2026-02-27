from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Source",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("type", models.CharField(choices=[("upload", "Upload"), ("paste", "Paste")], db_index=True, max_length=16)),
                ("file_object_key", models.CharField(blank=True, max_length=1024, null=True)),
                ("content_text", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sources",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["owner", "-created_at"], name="source_owner_created_idx"),
                ],
                "constraints": [
                    models.CheckConstraint(
                        check=models.Q(("type", "upload"), _negated=True)
                        | models.Q(("file_object_key__isnull", False)),
                        name="source_upload_requires_file_object",
                    )
                ],
            },
        ),
    ]
