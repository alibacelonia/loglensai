from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from rest_framework import serializers
from rest_framework.exceptions import APIException

from sources.models import Source
from sources.storage import get_source_upload_storage


class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = [
            "id",
            "name",
            "type",
            "file_object_key",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SourceUploadSerializer(serializers.Serializer):
    file = serializers.FileField(write_only=True)
    name = serializers.CharField(required=False, max_length=255, allow_blank=False)

    def validate_file(self, uploaded_file):
        if uploaded_file.size > settings.SOURCE_UPLOAD_MAX_BYTES:
            raise serializers.ValidationError(
                f"File size exceeds limit of {settings.SOURCE_UPLOAD_MAX_BYTES} bytes."
            )

        suffix = Path(uploaded_file.name).suffix.lower()
        if suffix not in settings.SOURCE_UPLOAD_ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"Unsupported file extension '{suffix}'. Allowed: "
                f"{', '.join(sorted(settings.SOURCE_UPLOAD_ALLOWED_EXTENSIONS))}."
            )

        content_type = (uploaded_file.content_type or "").lower()
        if (
            content_type
            and content_type not in settings.SOURCE_UPLOAD_ALLOWED_CONTENT_TYPES
        ):
            raise serializers.ValidationError(
                f"Unsupported content type '{content_type}'."
            )

        return uploaded_file

    def create(self, validated_data):
        request = self.context["request"]
        uploaded_file = validated_data["file"]
        source_name = validated_data.get("name", Path(uploaded_file.name).name)
        try:
            file_object_key = get_source_upload_storage().save_upload(
                owner_id=request.user.id,
                uploaded_file=uploaded_file,
            )
        except (ImproperlyConfigured, NotImplementedError) as error:
            raise APIException(str(error)) from error

        return Source.objects.create(
            owner=request.user,
            name=source_name,
            type=Source.SourceType.UPLOAD,
            file_object_key=file_object_key,
        )
