from django.core.exceptions import ImproperlyConfigured
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from auditlog.models import AuditLogEvent
from auditlog.service import safe_log_audit_event
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
        safe_log_audit_event(
            owner_id=request.user.id,
            actor_id=request.user.id,
            event_type=AuditLogEvent.EventType.UPLOAD,
            source_id=source.id,
            metadata={"source_type": source.type, "source_name": source.name},
        )
        return Response(SourceSerializer(source).data, status=status.HTTP_201_CREATED)


class SourceDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = SourceSerializer
    lookup_url_kwarg = "source_id"

    def get_queryset(self):
        return Source.objects.filter(owner=self.request.user)

    def perform_destroy(self, instance):
        owner_id = instance.owner_id
        source_id = instance.id
        source_type = instance.type
        source_name = instance.name

        storage = get_source_upload_storage()
        if instance.type == Source.SourceType.UPLOAD and instance.file_object_key:
            try:
                storage.delete_upload(instance.file_object_key)
            except (ImproperlyConfigured, NotImplementedError):
                # File deletion is best-effort for non-local storage placeholders.
                pass

        instance.delete()
        safe_log_audit_event(
            owner_id=owner_id,
            actor_id=self.request.user.id if self.request.user.is_authenticated else None,
            event_type=AuditLogEvent.EventType.DELETE,
            source_id=source_id,
            metadata={"source_type": source_type, "source_name": source_name},
        )
