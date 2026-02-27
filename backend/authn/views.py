from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.views import TokenObtainPairView

from auditlog.models import AuditLogEvent
from auditlog.service import safe_log_audit_event
from authn.serializers import LoginSerializer, RegisterSerializer, UserSerializer


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        response_body = {
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        return Response(response_body, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    serializer_class = LoginSerializer


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        old_password = str(request.data.get("old_password") or "")
        new_password = str(request.data.get("new_password") or "")
        confirm_password = str(request.data.get("new_password_confirm") or "")

        if not old_password or not new_password or not confirm_password:
            raise ValidationError({"detail": "old_password, new_password, and new_password_confirm are required."})
        if new_password != confirm_password:
            raise ValidationError({"new_password_confirm": "Passwords do not match."})
        if not request.user.check_password(old_password):
            raise ValidationError({"old_password": "Current password is incorrect."})

        validate_password(new_password, request.user)
        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])

        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.ACCOUNT_SECURITY,
            metadata={"action": "change_password"},
        )
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


class SessionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        blacklisted_ids = set(
            BlacklistedToken.objects.filter(token__user=request.user).values_list("token_id", flat=True)
        )
        sessions = []
        for token in OutstandingToken.objects.filter(user=request.user).order_by("-created_at")[:50]:
            sessions.append(
                {
                    "id": str(token.jti),
                    "created_at": token.created_at,
                    "expires_at": token.expires_at,
                    "is_active": token.id not in blacklisted_ids and token.expires_at > timezone.now(),
                }
            )
        return Response({"sessions": sessions}, status=status.HTTP_200_OK)


class SessionRevokeAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        count = 0
        for token in OutstandingToken.objects.filter(user=request.user):
            _, created = BlacklistedToken.objects.get_or_create(token=token)
            if created:
                count += 1

        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.ACCOUNT_SECURITY,
            metadata={"action": "sign_out_all_sessions", "revoked_count": count},
        )
        return Response({"detail": "All sessions revoked.", "revoked_count": count}, status=status.HTTP_200_OK)
