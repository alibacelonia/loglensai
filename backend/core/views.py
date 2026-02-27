import socket

from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    authentication_classes = []
    permission_classes = []

    def _db_check(self) -> bool:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            return True
        except Exception:
            return False

    def _redis_check(self) -> str:
        if not settings.REDIS_HOST:
            return "skipped"

        try:
            with socket.create_connection(
                (settings.REDIS_HOST, settings.REDIS_PORT),
                timeout=settings.HEALTHCHECK_TIMEOUT_SECONDS,
            ):
                return "ok"
        except OSError:
            return "fail"

    def get(self, request):  # noqa: ARG002
        db_ok = self._db_check()
        redis_state = self._redis_check()

        checks = {
            "database": "ok" if db_ok else "fail",
            "redis": redis_state,
        }
        is_healthy = db_ok and redis_state in {"ok", "skipped"}
        payload = {
            "status": "ok" if is_healthy else "degraded",
            "service": "backend",
            "checks": checks,
        }

        return Response(
            payload,
            status=status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
