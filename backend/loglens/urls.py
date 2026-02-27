from django.contrib import admin
from django.urls import include, path

from authn.views import MeView
from analyses.views import (
    AnalysisClusterListView,
    AnomalyGroupDetailView,
    AnomalyGroupListView,
    AnomalyGroupReviewView,
    DashboardSummaryView,
    IncidentDetailView,
    IncidentListView,
    IntegrationConfigView,
    IntegrationConnectionTestView,
    LiveTailStreamView,
    ReportRunListCreateView,
    ReportRunRegenerateView,
    ReportScheduleDetailView,
    ReportScheduleListCreateView,
    WorkspacePreferenceView,
    AnalysisEventListView,
    AnalysisExportJSONView,
    AnalysisExportMarkdownView,
    AnalysisRunStatusView,
    ClusterDetailView,
    SourceAnalysisListCreateView,
)
from core.views import HealthCheckView
from sources.views import SourceDetailView, SourceListCreateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz", HealthCheckView.as_view(), name="healthz"),
    path("api/auth/", include("authn.urls")),
    path("api/me", MeView.as_view(), name="me"),
    path("api/sources", SourceListCreateView.as_view(), name="sources-list-create"),
    path("api/sources/<int:source_id>", SourceDetailView.as_view(), name="sources-detail"),
    path(
        "api/sources/<int:source_id>/analyses",
        SourceAnalysisListCreateView.as_view(),
        name="source-analysis-list-create",
    ),
    path(
        "api/sources/<int:source_id>/analyze",
        SourceAnalysisListCreateView.as_view(),
        name="source-analyze-create",
    ),
    path("api/analyses/<int:analysis_id>", AnalysisRunStatusView.as_view(), name="analysis-status"),
    path(
        "api/dashboard/summary",
        DashboardSummaryView.as_view(),
        name="dashboard-summary",
    ),
    path(
        "api/live-tail/stream",
        LiveTailStreamView.as_view(),
        name="live-tail-stream",
    ),
    path(
        "api/anomalies",
        AnomalyGroupListView.as_view(),
        name="anomaly-group-list",
    ),
    path(
        "api/anomalies/<str:fingerprint>",
        AnomalyGroupDetailView.as_view(),
        name="anomaly-group-detail",
    ),
    path(
        "api/anomalies/<str:fingerprint>/review",
        AnomalyGroupReviewView.as_view(),
        name="anomaly-group-review",
    ),
    path(
        "api/incidents",
        IncidentListView.as_view(),
        name="incident-list",
    ),
    path(
        "api/incidents/<int:incident_id>",
        IncidentDetailView.as_view(),
        name="incident-detail",
    ),
    path(
        "api/reports",
        ReportRunListCreateView.as_view(),
        name="report-run-list-create",
    ),
    path(
        "api/reports/<int:report_id>/regenerate",
        ReportRunRegenerateView.as_view(),
        name="report-run-regenerate",
    ),
    path(
        "api/report-schedules",
        ReportScheduleListCreateView.as_view(),
        name="report-schedule-list-create",
    ),
    path(
        "api/report-schedules/<int:schedule_id>",
        ReportScheduleDetailView.as_view(),
        name="report-schedule-detail",
    ),
    path(
        "api/integrations",
        IntegrationConfigView.as_view(),
        name="integrations-config",
    ),
    path(
        "api/integrations/test",
        IntegrationConnectionTestView.as_view(),
        name="integrations-test",
    ),
    path(
        "api/settings/workspace",
        WorkspacePreferenceView.as_view(),
        name="workspace-settings",
    ),
    path(
        "api/analyses/<int:analysis_id>/clusters",
        AnalysisClusterListView.as_view(),
        name="analysis-cluster-list",
    ),
    path(
        "api/analyses/<int:analysis_id>/events",
        AnalysisEventListView.as_view(),
        name="analysis-event-list",
    ),
    path(
        "api/analyses/<int:analysis_id>/export.json",
        AnalysisExportJSONView.as_view(),
        name="analysis-export-json",
    ),
    path(
        "api/analyses/<int:analysis_id>/export.md",
        AnalysisExportMarkdownView.as_view(),
        name="analysis-export-markdown",
    ),
    path("api/clusters/<int:cluster_id>", ClusterDetailView.as_view(), name="cluster-detail"),
]
