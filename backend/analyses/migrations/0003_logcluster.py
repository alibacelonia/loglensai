from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("analyses", "0002_logevent"),
    ]

    operations = [
        migrations.CreateModel(
            name="LogCluster",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("fingerprint", models.CharField(db_index=True, max_length=64)),
                ("title", models.CharField(max_length=255)),
                ("count", models.PositiveIntegerField()),
                ("first_seen", models.DateTimeField(blank=True, null=True)),
                ("last_seen", models.DateTimeField(blank=True, null=True)),
                ("sample_events", models.JSONField(blank=True, default=list)),
                ("affected_services", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("analysis_run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="clusters", to="analyses.analysisrun")),
            ],
            options={
                "ordering": ["-count", "fingerprint"],
                "indexes": [
                    models.Index(fields=["analysis_run", "-count"], name="logcluster_analysis_count_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("analysis_run", "fingerprint"), name="logcluster_unique_fingerprint_per_analysis"),
                ],
            },
        ),
    ]
