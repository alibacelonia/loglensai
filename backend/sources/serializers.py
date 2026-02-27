from pathlib import Path
from uuid import uuid4

from django.conf import settings
from rest_framework import serializers

from sources.models import Source


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
        safe_filename = Path(uploaded_file.name).name
        file_object_key = f"pending/{request.user.id}/{uuid4()}-{safe_filename}"

        return Source.objects.create(
            owner=request.user,
            name=source_name,
            type=Source.SourceType.UPLOAD,
            file_object_key=file_object_key,
        )
