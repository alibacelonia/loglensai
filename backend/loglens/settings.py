import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


DEBUG = _env_bool("DJANGO_DEBUG", default=False)
DEFAULT_DEV_SECRET = "insecure-dev-secret-key-not-for-production-000"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", DEFAULT_DEV_SECRET)

if not DEBUG and SECRET_KEY == DEFAULT_DEV_SECRET:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=false")

if not DEBUG and len(SECRET_KEY) < 32:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be at least 32 characters when DJANGO_DEBUG=false"
    )

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0"
    ).split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "core",
    "auditlog",
    "authn",
    "sources",
    "analyses",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "loglens.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "loglens.wsgi.application"
ASGI_APPLICATION = "loglens.asgi.application"

if os.getenv("DB_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": os.getenv("DB_HOST", "postgres"),
            "PORT": os.getenv("DB_PORT", "5432"),
            "NAME": os.getenv("DB_NAME", "loglens"),
            "USER": os.getenv("DB_USER", "loglens"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "analyze": os.getenv("ANALYZE_RATE_LIMIT", "10/min"),
    },
}

REDIS_HOST = os.getenv("REDIS_HOST", "")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
HEALTHCHECK_TIMEOUT_SECONDS = float(os.getenv("HEALTHCHECK_TIMEOUT_SECONDS", "1.5"))
AUDIT_LOG_ENABLED = _env_bool("AUDIT_LOG_ENABLED", default=True)
SOURCE_UPLOAD_MAX_BYTES = int(os.getenv("SOURCE_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
SOURCE_UPLOAD_ALLOWED_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv(
        "SOURCE_UPLOAD_ALLOWED_EXTENSIONS", ".log,.txt,.jsonl,.gz"
    ).split(",")
    if ext.strip()
}
SOURCE_UPLOAD_ALLOWED_CONTENT_TYPES = {
    content_type.strip().lower()
    for content_type in os.getenv(
        "SOURCE_UPLOAD_ALLOWED_CONTENT_TYPES",
        "text/plain,application/json,application/gzip,application/x-gzip,application/octet-stream",
    ).split(",")
    if content_type.strip()
}
SOURCE_STORAGE_BACKEND = os.getenv("SOURCE_STORAGE_BACKEND", "local").strip().lower()
SOURCE_S3_BUCKET = os.getenv("SOURCE_S3_BUCKET", "").strip()
SOURCE_S3_ENDPOINT_URL = os.getenv("SOURCE_S3_ENDPOINT_URL", "").strip()
SOURCE_S3_REGION = os.getenv("SOURCE_S3_REGION", "us-east-1").strip()
SOURCE_RETENTION_ENABLED = _env_bool("SOURCE_RETENTION_ENABLED", default=True)
SOURCE_RETENTION_DAYS = int(os.getenv("SOURCE_RETENTION_DAYS", "30"))
SOURCE_RETENTION_BATCH_SIZE = int(os.getenv("SOURCE_RETENTION_BATCH_SIZE", "500"))
ANALYSIS_TASK_MAX_LINES = int(os.getenv("ANALYSIS_TASK_MAX_LINES", "50000"))
ANALYSIS_READER_MAX_BYTES = int(os.getenv("ANALYSIS_READER_MAX_BYTES", str(20 * 1024 * 1024)))
ANALYSIS_TASK_SOFT_TIME_LIMIT_SECONDS = int(
    os.getenv("ANALYSIS_TASK_SOFT_TIME_LIMIT_SECONDS", "120")
)
ANALYSIS_TASK_TIME_LIMIT_SECONDS = int(
    os.getenv("ANALYSIS_TASK_TIME_LIMIT_SECONDS", "180")
)
EXPORT_MAX_EVENTS = int(os.getenv("EXPORT_MAX_EVENTS", "10000"))
EXPORT_MARKDOWN_MAX_CLUSTERS = int(os.getenv("EXPORT_MARKDOWN_MAX_CLUSTERS", "20"))
EXPORT_MARKDOWN_MAX_EVENTS = int(os.getenv("EXPORT_MARKDOWN_MAX_EVENTS", "100"))
CLUSTER_TFIDF_ENABLED = _env_bool("CLUSTER_TFIDF_ENABLED", default=True)
CLUSTER_TFIDF_SIMILARITY_THRESHOLD = float(
    os.getenv("CLUSTER_TFIDF_SIMILARITY_THRESHOLD", "0.72")
)
REDACTION_ENABLED = _env_bool("REDACTION_ENABLED", default=True)
REDACTION_MASK_EMAILS = _env_bool("REDACTION_MASK_EMAILS", default=True)
REDACTION_MASK_PHONE_NUMBERS = _env_bool("REDACTION_MASK_PHONE_NUMBERS", default=True)
REDACTION_MASK_IP_ADDRESSES = _env_bool("REDACTION_MASK_IP_ADDRESSES", default=True)
REDACTION_MASK_JWTS = _env_bool("REDACTION_MASK_JWTS", default=True)
REDACTION_MASK_API_KEYS = _env_bool("REDACTION_MASK_API_KEYS", default=True)
LLM_ENABLED = _env_bool("LLM_ENABLED", default=True)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").strip().lower()
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
LLM_API_URL = os.getenv("LLM_API_URL", "https://api.openai.com/v1/chat/completions").strip()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_REQUEST_TIMEOUT_SECONDS = int(os.getenv("LLM_REQUEST_TIMEOUT_SECONDS", "20"))
LLM_MAX_CLUSTER_CONTEXT = int(os.getenv("LLM_MAX_CLUSTER_CONTEXT", "20"))

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1")
CELERY_TASK_TRACK_STARTED = True

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "15"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": _env_bool("JWT_ROTATE_REFRESH_TOKENS", default=True),
    "BLACKLIST_AFTER_ROTATION": _env_bool("JWT_BLACKLIST_AFTER_ROTATION", default=False),
    "UPDATE_LAST_LOGIN": True,
}
