from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx
import msal


GRAPH_SCOPES = ['User.Read']


@dataclass(frozen=True, slots=True)
class MicrosoftProfile:
    object_id: str
    tenant_id: str
    email: str
    name: str


@dataclass(frozen=True, slots=True)
class MicrosoftPhoto:
    body: bytes
    content_type: str
    extension: str


class MicrosoftIdentityClient:
    """Run the Entra authorization-code flow and read the signed-in profile."""

    def __init__(
        self,
        *,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> None:
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    @property
    def enabled(self) -> bool:
        return bool(
            self.tenant_id and self.client_id and self.client_secret and self.redirect_uri
        )

    def _application(self) -> msal.ConfidentialClientApplication:
        return msal.ConfidentialClientApplication(
            self.client_id,
            authority=f'https://login.microsoftonline.com/{self.tenant_id}',
            client_credential=self.client_secret,
        )

    async def initiate_flow(self) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError('Microsoft Entra sign-in is not configured.')

        def initiate() -> dict[str, Any]:
            return self._application().initiate_auth_code_flow(
                scopes=GRAPH_SCOPES, redirect_uri=self.redirect_uri
            )

        return await asyncio.to_thread(initiate)

    async def complete_flow(
        self, flow: dict[str, Any], callback_parameters: dict[str, str]
    ) -> tuple[MicrosoftProfile, str]:
        if not self.enabled:
            raise RuntimeError('Microsoft Entra sign-in is not configured.')
        def complete() -> dict[str, Any]:
            return self._application().acquire_token_by_auth_code_flow(
                flow, callback_parameters
            )

        result = await asyncio.to_thread(complete)
        access_token = result.get('access_token')
        claims = result.get('id_token_claims') or {}
        if not isinstance(access_token, str):
            description = str(result.get('error_description') or 'Microsoft sign-in failed.')
            raise ValueError(description[:300])
        tenant_id = str(claims.get('tid') or '')
        object_id = str(claims.get('oid') or '')
        if tenant_id.lower() != self.tenant_id.lower() or not object_id:
            raise ValueError('The Microsoft account does not belong to the configured tenant.')

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                'https://graph.microsoft.com/v1.0/me',
                params={'$select': 'id,displayName,mail,userPrincipalName'},
                headers={'Authorization': f'Bearer {access_token}'},
            )
        response.raise_for_status()
        graph = response.json()
        graph_id = str(graph.get('id') or '')
        if graph_id.lower() != object_id.lower():
            raise ValueError('Microsoft Graph returned a different user identity.')
        email = str(graph.get('mail') or graph.get('userPrincipalName') or '').strip().lower()
        name = str(graph.get('displayName') or claims.get('name') or '').strip()
        if '@' not in email or not 2 <= len(name) <= 120:
            raise ValueError('Microsoft did not return a usable name and email address.')
        return MicrosoftProfile(object_id, tenant_id, email, name), access_token

    async def download_photo(self, access_token: str) -> MicrosoftPhoto | None:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                'https://graph.microsoft.com/v1.0/me/photos/240x240/$value',
                headers={'Authorization': f'Bearer {access_token}'},
            )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        body = response.content
        if len(body) > 5 * 1024 * 1024:
            raise ValueError('The Microsoft profile picture is too large.')
        if body.startswith(b'\xff\xd8\xff'):
            return MicrosoftPhoto(body, 'image/jpeg', 'jpg')
        if body.startswith(b'\x89PNG\r\n\x1a\n'):
            return MicrosoftPhoto(body, 'image/png', 'png')
        raise ValueError('Microsoft returned an unsupported profile picture format.')
