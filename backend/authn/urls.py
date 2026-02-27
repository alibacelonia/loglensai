from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from authn.views import ChangePasswordView, LoginView, RegisterView, SessionListView, SessionRevokeAllView

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", TokenRefreshView.as_view(), name="auth-refresh"),
    path("change-password", ChangePasswordView.as_view(), name="auth-change-password"),
    path("sessions", SessionListView.as_view(), name="auth-sessions"),
    path("sessions/revoke-all", SessionRevokeAllView.as_view(), name="auth-sessions-revoke-all"),
]
