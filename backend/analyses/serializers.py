from rest_framework import serializers

from analyses.models import AnalysisRun, LogCluster


class AnalysisRunSerializer(serializers.ModelSerializer):
    source_id = serializers.IntegerField(source="source.id", read_only=True)

    class Meta:
        model = AnalysisRun
        fields = [
            "id",
            "source_id",
            "status",
            "started_at",
            "finished_at",
            "stats",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class LogClusterSerializer(serializers.ModelSerializer):
    analysis_id = serializers.IntegerField(source="analysis_run.id", read_only=True)

    class Meta:
        model = LogCluster
        fields = [
            "id",
            "analysis_id",
            "fingerprint",
            "title",
            "count",
            "first_seen",
            "last_seen",
            "sample_events",
            "affected_services",
        ]
        read_only_fields = fields
