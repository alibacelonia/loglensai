from django.contrib import admin

from analyses.models import AIInsight, AnalysisRun, LogCluster, LogEvent


@admin.register(AnalysisRun)
class AnalysisRunAdmin(admin.ModelAdmin):
    list_display = ("id", "source", "status", "created_at", "started_at", "finished_at")
    list_filter = ("status", "created_at")
    search_fields = ("source__name", "source__owner__username")


@admin.register(LogEvent)
class LogEventAdmin(admin.ModelAdmin):
    list_display = ("id", "analysis_run", "line_no", "level", "service")
    list_filter = ("level", "service")
    search_fields = ("message", "trace_id", "request_id", "fingerprint")


@admin.register(LogCluster)
class LogClusterAdmin(admin.ModelAdmin):
    list_display = ("id", "analysis_run", "fingerprint", "count", "first_seen", "last_seen")
    list_filter = ("created_at",)
    search_fields = ("fingerprint", "title")


@admin.register(AIInsight)
class AIInsightAdmin(admin.ModelAdmin):
    list_display = ("id", "analysis_run", "updated_at")
    search_fields = ("analysis_run__id", "executive_summary", "remediation")
