from django.contrib import admin
from django.urls import include, path

from authn.views import MeView
from core.views import HealthCheckView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz", HealthCheckView.as_view(), name="healthz"),
    path("api/auth/", include("authn.urls")),
    path("api/me", MeView.as_view(), name="me"),
    path("api/sources", include("sources.urls")),
]
