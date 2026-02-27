from django.contrib import admin

from sources.models import Source


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner", "type", "created_at")
    list_filter = ("type", "created_at")
    search_fields = ("name", "owner__username", "owner__email")
