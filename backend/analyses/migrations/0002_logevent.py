from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("analyses", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LogEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("timestamp", models.DateTimeField(blank=True, null=True)),
                ("level", models.CharField(db_index=True, default="unknown", max_length=16)),
                ("service", models.CharField(blank=True, default="", max_length=128)),
                ("message", models.TextField()),
                ("raw", models.TextField()),
                ("fingerprint", models.CharField(db_index=True, max_length=64)),
                ("trace_id", models.CharField(blank=True, max_length=128, null=True)),
                ("request_id", models.CharField(blank=True, max_length=128, null=True)),
                ("line_no", models.PositiveIntegerField()),
                ("tags", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("analysis_run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="log_events", to="analyses.analysisrun")),
            ],
            options={
                "ordering": ["line_no"],
                "indexes": [
                    models.Index(fields=["analysis_run", "line_no"], name="logevent_analysis_line_idx"),
                    models.Index(fields=["analysis_run", "level"], name="logevent_analysis_level_idx"),
                    models.Index(fields=["analysis_run", "fingerprint"], name="logevent_analysis_fp_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("analysis_run", "line_no"), name="logevent_unique_line_per_analysis"),
                ],
            },
        ),
    ]
