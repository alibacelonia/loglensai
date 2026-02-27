from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("sources", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AnalysisRun",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("queued", "Queued"), ("running", "Running"), ("completed", "Completed"), ("failed", "Failed")], db_index=True, default="queued", max_length=16)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("stats", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("source", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="analyses", to="sources.source")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["source", "-created_at"], name="analysis_source_created_idx"),
                ],
                "constraints": [
                    models.CheckConstraint(
                        check=models.Q(("finished_at__isnull", True))
                        | models.Q(("started_at__isnull", True))
                        | models.Q(("finished_at__gte", models.F("started_at"))),
                        name="analysis_finished_after_started",
                    ),
                    models.UniqueConstraint(
                        condition=models.Q(("status__in", ["queued", "running"])),
                        fields=("source",),
                        name="analysis_single_active_per_source",
                    ),
                ],
            },
        ),
    ]
