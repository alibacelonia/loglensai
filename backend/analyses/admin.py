from django.contrib import admin

from analyses.models import AnalysisRun


@admin.register(AnalysisRun)
class AnalysisRunAdmin(admin.ModelAdmin):
    list_display = ("id", "source", "status", "created_at", "started_at", "finished_at")
    list_filter = ("status", "created_at")
    search_fields = ("source__name", "source__owner__username")
