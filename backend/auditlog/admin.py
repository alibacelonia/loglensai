from django.contrib import admin

from auditlog.models import AuditLogEvent


@admin.register(AuditLogEvent)
class AuditLogEventAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "owner", "actor", "event_type", "source_id", "analysis_id")
    list_filter = ("event_type", "created_at")
    search_fields = ("owner__username", "actor__username", "source_id", "analysis_id")
