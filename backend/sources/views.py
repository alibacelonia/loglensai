from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from sources.serializers import SourceSerializer, SourceUploadSerializer


class SourceUploadCreateView(generics.GenericAPIView):
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = SourceUploadSerializer

    def post(self, request, *args, **kwargs):  # noqa: ARG002
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source = serializer.save()
        return Response(SourceSerializer(source).data, status=status.HTTP_201_CREATED)
