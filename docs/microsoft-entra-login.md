# Microsoft Entra ID login runbook

Flowie supports a single Microsoft Entra tenant through the OAuth 2.0
authorization-code flow with PKCE. Microsoft supplies the identity and managed
profile fields; Flowie continues to issue its own short-lived access cookie and
rotating refresh session after the callback succeeds.

## App registration

Create a single-tenant app registration in the Microsoft Entra admin center.
Under **Authentication**, add this as a **Web** redirect URI:

```text
https://<public-api-host>/api/v1/auth/microsoft/callback
```

Create a client secret with an operational expiry and record its expiry in the
deployment secret-management process. Under Microsoft Graph delegated
permissions, grant `User.Read`; no application permission is required. Flowie
uses it to read `/me` and the signed-in user's 240 px profile photo.

Microsoft documents the underlying security requirements in its
[authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference),
and [profile photo API](https://learn.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0).

## CT107 environment

Set these server-side values before deployment:

```dotenv
APP_URL=https://<public-web-host>
AUTH_COOKIE_SECURE=true
ADMIN_EMAIL=<existing Flowie user email>
AZURE_AD_TENANT_ID=<tenant GUID>
AZURE_AD_CLIENT_ID=<application/client GUID>
AZURE_AD_CLIENT_SECRET=<client secret value>
AZURE_AD_REDIRECT_URI=https://<public-api-host>/api/v1/auth/microsoft/callback
```

Never expose the client secret through a `NEXT_PUBLIC_*` variable or commit it.
The redirect URI must exactly match the Web redirect URI in the app
registration. `APP_URL` is the trusted destination used after the API callback.

`ADMIN_EMAIL` is case-insensitive and is evaluated on every authenticated API
request. It is the only source of platform administrator access; the Admin
Panel cannot promote another account. Keep it set to an active account and
change the environment value to transfer platform administration.

## Identity and profile behavior

- Flowie validates the configured tenant and stores the immutable Entra tenant
  ID plus object ID as the provider account key.
- On the first login, an existing Flowie account with the same normalized
  email is linked; otherwise Flowie creates the user and a default
  workspace. Later logins resolve only through the immutable provider key.
- Display name is refreshed from Microsoft Graph on every Entra login.
- The Microsoft profile photo is copied into Flowie's object storage. A
  temporary photo download/storage failure keeps the last successful photo;
  an authoritative Graph 404 clears it.
- Microsoft-managed users cannot change their name or profile photo through UI
  or API. Title, username, and timezone remain personal Flowie fields.
- Suspended or disabled Flowie users cannot regain access by signing in through
  Microsoft.

## Production verification

Before pushing to `main`:

1. Back up PostgreSQL and configure the environment values above.
2. Verify the client secret has sufficient lifetime and the redirect URI uses
   the production API host.
3. Build the API and web production images and confirm the Compose `migrate`
   dependency still completes before API and worker startup.

After deployment:

1. Confirm `/readyz` and `GET /api/v1/auth/providers` report a healthy API and
   enabled Microsoft provider.
2. Sign in with a non-admin tenant account and verify workspace access, name,
   avatar, and profile-field locks.
3. Sign in with the exact `ADMIN_EMAIL`, open the workspace switcher, and enter
   the Admin Panel. Verify a different user receives HTTP 403 for admin APIs.
4. Verify local password login and refresh-token rotation still work.
5. Tag the release only after that exact commit is verified on CT107.
