import json

from django.core.management.base import BaseCommand

from sources.retention import purge_expired_upload_sources


class Command(BaseCommand):
    help = "Delete expired upload sources according to retention settings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report candidates without deleting records.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Override batch limit for this run.",
        )

    def handle(self, *args, **options):
        result = purge_expired_upload_sources(
            dry_run=bool(options["dry_run"]),
            limit=options["limit"],
        )
        self.stdout.write(json.dumps(result, indent=2, sort_keys=True))
