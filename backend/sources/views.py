from django.core.exceptions import ImproperlyConfigured
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from sources.serializers import SourceSerializer, SourceUploadSerializer
from sources.models import Source
from sources.storage import get_source_upload_storage


class SourceListCreateView(generics.GenericAPIView):
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = SourceUploadSerializer
    queryset = Source.objects.none()

    def get_queryset(self):
        return Source.objects.filter(owner=self.request.user).order_by("-created_at")

    def get(self, request, *args, **kwargs):  # noqa: ARG002
        sources = self.get_queryset()
        return Response(SourceSerializer(sources, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):  # noqa: ARG002
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source = serializer.save()
        return Response(SourceSerializer(source).data, status=status.HTTP_201_CREATED)


class SourceDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = SourceSerializer
    lookup_url_kwarg = "source_id"

    def get_queryset(self):
        return Source.objects.filter(owner=self.request.user)

    def perform_destroy(self, instance):
        storage = get_source_upload_storage()
        if instance.type == Source.SourceType.UPLOAD and instance.file_object_key:
            try:
                storage.delete_upload(instance.file_object_key)
            except (ImproperlyConfigured, NotImplementedError):
                # File deletion is best-effort for non-local storage placeholders.
                pass

        instance.delete()
