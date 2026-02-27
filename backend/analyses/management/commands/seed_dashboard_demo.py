import hashlib
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from analyses.models import AnalysisRun, Incident, LogCluster, LogEvent, ReportRun
from sources.models import Source

User = get_user_model()

CLUSTER_TEMPLATES = [
    ("checkout timeout spike", "checkout"),
    ("payment gateway retries", "payments"),
    ("database connection reset", "database"),
    ("api latency threshold breach", "api"),
]

LEVEL_WEIGHTS = [
    ("info", 48),
    ("warn", 28),
    ("error", 19),
    ("fatal", 3),
    ("debug", 2),
]


class Command(BaseCommand):
    help = "Seed realistic demo data for dashboard and analytics pages."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="demo", help="Demo username")
        parser.add_argument("--email", default="demo@loglens.local", help="Demo email")
        parser.add_argument("--password", default="DemoPass123!", help="Demo password")
        parser.add_argument("--runs", type=int, default=24, help="Number of analysis runs to generate")
        parser.add_argument("--window-days", type=int, default=30, help="How far back to spread generated runs")
        parser.add_argument(
            "--no-reset",
            action="store_true",
            help="Append data to existing demo-user records instead of clearing them first",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        username = options["username"].strip()
        email = options["email"].strip().lower()
        password = options["password"]
        runs = max(1, int(options["runs"]))
        window_days = max(1, int(options["window_days"]))
        reset = not bool(options["no_reset"])

        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email},
        )
        if user.email != email:
            user.email = email
            user.save(update_fields=["email"])
        user.set_password(password)
        user.save(update_fields=["password"])

        if reset:
            Source.objects.filter(owner=user).delete()

        rng = random.Random(42)
        now = timezone.now()
        created_sources = 0
        created_runs = 0
        created_events = 0
        created_clusters = 0

        for index in range(runs):
            age_seconds = rng.randint(0, window_days * 24 * 3600)
            created_at = now - timedelta(seconds=age_seconds)
            source = Source.objects.create(
                owner=user,
                name=f"Demo source {index + 1:02d}",
                type=Source.SourceType.PASTE,
                content_text=(
                    "Synthetic demo data for dashboard visualizations. "
                    f"Run {index + 1} seeded at {created_at.isoformat()}."
                ),
            )
            Source.objects.filter(id=source.id).update(created_at=created_at, updated_at=created_at)
            created_sources += 1

            status = AnalysisRun.Status.COMPLETED if rng.random() < 0.82 else AnalysisRun.Status.FAILED
            started_at = created_at + timedelta(minutes=rng.randint(1, 4))
            finished_at = started_at + timedelta(minutes=rng.randint(2, 12))
            total_lines = rng.randint(400, 2600)
            error_lines = rng.randint(10, 220) if status == AnalysisRun.Status.COMPLETED else rng.randint(120, 500)
            cluster_count = rng.randint(2, 6) if status == AnalysisRun.Status.COMPLETED else rng.randint(1, 3)
            cluster_count = min(cluster_count, len(CLUSTER_TEMPLATES))

            analysis = AnalysisRun.objects.create(
                source=source,
                status=status,
                started_at=started_at,
                finished_at=finished_at,
                stats={
                    "total_lines": total_lines,
                    "error_count": error_lines,
                    "cluster_count": cluster_count,
                },
                error_message=("Parsing pipeline timeout." if status == AnalysisRun.Status.FAILED else ""),
            )
            AnalysisRun.objects.filter(id=analysis.id).update(
                created_at=created_at,
                updated_at=finished_at,
            )
            created_runs += 1

            if status == AnalysisRun.Status.FAILED and rng.random() < 0.45:
                incident = Incident.objects.create(
                    owner=user,
                    analysis_run=analysis,
                    title="Automated incident: repeated failures",
                    summary="Seeded demo incident from failed analysis run.",
                    status=Incident.Status.INVESTIGATING,
                    severity=Incident.Severity.HIGH,
                    assigned_owner="oncall",
                    remediation_notes="Inspect worker logs and retry with scoped filters.",
                )
                Incident.objects.filter(id=incident.id).update(created_at=finished_at, updated_at=finished_at)

            if status != AnalysisRun.Status.COMPLETED:
                continue

            line_no = 1
            for title, service in rng.sample(CLUSTER_TEMPLATES, k=cluster_count):
                count = rng.randint(8, 48)
                fingerprint = hashlib.md5(f"{service}:{title}".encode("utf-8")).hexdigest()
                first_seen = started_at + timedelta(minutes=rng.randint(0, 3))
                last_seen = first_seen + timedelta(minutes=rng.randint(1, 20))
                cluster = LogCluster.objects.create(
                    analysis_run=analysis,
                    fingerprint=fingerprint,
                    title=title,
                    count=count,
                    first_seen=first_seen,
                    last_seen=last_seen,
                    sample_events=[
                        {
                            "line_no": line_no,
                            "level": "error",
                            "service": service,
                            "message": f"{title} observed in {service}",
                        }
                    ],
                    affected_services=[service],
                )
                LogCluster.objects.filter(id=cluster.id).update(created_at=created_at)
                created_clusters += 1

                sample_event_count = min(12, count)
                for _ in range(sample_event_count):
                    level = rng.choices(
                        [item[0] for item in LEVEL_WEIGHTS],
                        weights=[item[1] for item in LEVEL_WEIGHTS],
                        k=1,
                    )[0]
                    timestamp = first_seen + timedelta(seconds=rng.randint(0, 900))
                    event = LogEvent.objects.create(
                        analysis_run=analysis,
                        timestamp=timestamp,
                        level=level,
                        service=service,
                        message=f"{title} line {line_no}",
                        raw=f"{timestamp.isoformat()} {level.upper()} {service} {title} line {line_no}",
                        fingerprint=fingerprint,
                        line_no=line_no,
                        tags={"seeded": True},
                    )
                    LogEvent.objects.filter(id=event.id).update(created_at=timestamp)
                    line_no += 1
                    created_events += 1

            if rng.random() < 0.4:
                report = ReportRun.objects.create(
                    owner=user,
                    analysis_run=analysis,
                    format=rng.choice([ReportRun.Format.JSON, ReportRun.Format.MARKDOWN]),
                    status=ReportRun.Status.COMPLETED,
                    report_scope={"analysis_id": analysis.id, "seeded": True},
                )
                ReportRun.objects.filter(id=report.id).update(created_at=finished_at, updated_at=finished_at)

        self.stdout.write(
            self.style.SUCCESS(
                "Seed complete: "
                f"user={user.username} created={created} reset={reset} "
                f"sources={created_sources} runs={created_runs} clusters={created_clusters} events={created_events}"
            )
        )
        self.stdout.write(
            f"Credentials -> username: {username} | password: {password} | email: {email}"
        )
