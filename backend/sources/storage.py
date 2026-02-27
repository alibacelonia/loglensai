from pathlib import Path
from typing import Protocol
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.exceptions import ImproperlyConfigured


class SourceUploadStorage(Protocol):
    def save_upload(self, owner_id: int, uploaded_file) -> str: ...


class LocalSourceUploadStorage:
    def save_upload(self, owner_id: int, uploaded_file) -> str:
        safe_filename = Path(uploaded_file.name).name
        extension = Path(safe_filename).suffix.lower()
        object_key = f"sources/{owner_id}/{uuid4()}{extension}"
        saved_path = default_storage.save(object_key, uploaded_file)
        return str(saved_path)


class S3CompatibleSourceUploadStorage:
    def save_upload(self, owner_id: int, uploaded_file) -> str:  # noqa: ARG002
        if not settings.SOURCE_S3_BUCKET:
            raise ImproperlyConfigured(
                "SOURCE_S3_BUCKET is required when SOURCE_STORAGE_BACKEND=s3"
            )
        raise NotImplementedError(
            "S3/MinIO upload adapter is not implemented yet. "
            "Use SOURCE_STORAGE_BACKEND=local for development."
        )


def get_source_upload_storage() -> SourceUploadStorage:
    backend = settings.SOURCE_STORAGE_BACKEND
    if backend == "local":
        return LocalSourceUploadStorage()
    if backend == "s3":
        return S3CompatibleSourceUploadStorage()
    raise ImproperlyConfigured(
        "Unsupported SOURCE_STORAGE_BACKEND. Use one of: local, s3."
    )
