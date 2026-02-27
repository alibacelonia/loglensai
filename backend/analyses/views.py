from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from analyses.models import AnalysisRun
from analyses.serializers import AnalysisRunSerializer
from analyses.tasks import analyze_source
from sources.models import Source


class SourceAnalysisListCreateView(APIView):
    def _get_owned_source(self, user, source_id: int) -> Source:
        source = Source.objects.filter(id=source_id, owner=user).first()
        if source is None:
            raise NotFound("Source not found.")
        return source

    def get(self, request, source_id: int):
        source = self._get_owned_source(request.user, source_id)
        analyses = source.analyses.all().order_by("-created_at")
        return Response(AnalysisRunSerializer(analyses, many=True).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, source_id: int):
        source = self._get_owned_source(request.user, source_id)
        active = (
            AnalysisRun.objects.select_for_update()
            .filter(source=source, status__in=[AnalysisRun.Status.QUEUED, AnalysisRun.Status.RUNNING])
            .order_by("-created_at")
            .first()
        )
        if active is not None:
            data = AnalysisRunSerializer(active).data
            return Response(data, status=status.HTTP_200_OK)

        analysis = AnalysisRun.objects.create(source=source, status=AnalysisRun.Status.QUEUED)
        try:
            analyze_source.delay(analysis.id)
        except Exception as error:
            analysis.status = AnalysisRun.Status.FAILED
            analysis.error_message = "Failed to enqueue analysis task."
            analysis.finished_at = timezone.now()
            analysis.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
            raise APIException("Failed to enqueue analysis task.") from error

        data = AnalysisRunSerializer(analysis).data
        return Response(data, status=status.HTTP_202_ACCEPTED)
