from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from analyses.models import AnalysisRun
from analyses.serializers import AnalysisRunSerializer
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
        data = AnalysisRunSerializer(analysis).data
        return Response(data, status=status.HTTP_202_ACCEPTED)
