from rest_framework.throttling import UserRateThrottle


class AnalyzeRequestUserThrottle(UserRateThrottle):
    scope = "analyze"
