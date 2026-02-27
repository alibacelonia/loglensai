import gzip
from pathlib import Path
from typing import Iterator

from django.core.files.storage import default_storage

from sources.models import Source


class SourceLineReaderError(Exception):
    pass


class LineReaderTruncatedByLines(Exception):
    pass


class LineReaderTruncatedByBytes(Exception):
    pass


def _is_gzip(object_key: str, file_obj) -> bool:
    if Path(object_key).suffix.lower() == ".gz":
        return True

    header = file_obj.read(2)
    file_obj.seek(0)
    return header == b"\x1f\x8b"


def _iter_upload_lines(source: Source) -> Iterator[bytes]:
    if not source.file_object_key:
        raise SourceLineReaderError("Source upload key is missing.")
    if not default_storage.exists(source.file_object_key):
        raise SourceLineReaderError("Source upload does not exist.")

    with default_storage.open(source.file_object_key, "rb") as file_obj:
        if _is_gzip(source.file_object_key, file_obj):
            try:
                with gzip.GzipFile(fileobj=file_obj, mode="rb") as gzip_file:
                    for raw_line in gzip_file:
                        yield raw_line
            except OSError as error:
                raise SourceLineReaderError("Invalid gzip stream.") from error
        else:
            for raw_line in file_obj:
                yield raw_line


def _iter_paste_lines(source: Source) -> Iterator[bytes]:
    content = source.content_text or ""
    if not content:
        return

    for line in content.splitlines():
        yield line.encode("utf-8", errors="replace") + b"\n"


def iter_source_lines(
    source: Source, *, max_lines: int, max_bytes: int
) -> Iterator[str]:
    line_count = 0
    bytes_processed = 0

    if source.type == Source.SourceType.PASTE:
        iterator = _iter_paste_lines(source)
    else:
        iterator = _iter_upload_lines(source)

    for raw_line in iterator:
        bytes_processed += len(raw_line)
        if bytes_processed > max_bytes:
            raise LineReaderTruncatedByBytes

        line_count += 1
        if line_count > max_lines:
            raise LineReaderTruncatedByLines

        yield raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
