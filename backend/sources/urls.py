from django.urls import path

from sources.views import SourceUploadCreateView

urlpatterns = [
    path("", SourceUploadCreateView.as_view(), name="sources-upload"),
]
