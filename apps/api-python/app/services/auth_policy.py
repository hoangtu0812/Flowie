from ..core.errors import ApiError


def microsoft_sign_in_enabled(settings) -> bool:
    return all(
        getattr(settings, field, "")
        for field in (
            "azure_ad_tenant_id",
            "azure_ad_client_id",
            "azure_ad_client_secret",
            "azure_ad_redirect_uri",
        )
    )


def require_password_sign_in(settings) -> None:
    if microsoft_sign_in_enabled(settings):
        raise ApiError(
            403,
            "Sign in with Microsoft. Email and password sign-in is disabled.",
            "Forbidden",
        )
