from django.contrib import admin
from django.urls import include, path

from authn.views import MeView
from analyses.views import SourceAnalysisListCreateView
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
]
