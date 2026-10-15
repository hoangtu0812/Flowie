# Browser sessions, personal history and credential inventory

This is the implemented session foundation for NEXT-07. Authenticator MFA is a
separate remaining gate in `account-security-design.md`; this change does not
enroll accounts or claim that MFA is active in production.

## Session behavior and upgrade

Access JWTs include `sid`, account authentication version, an access-only purpose,
issuer `flowie` and audience `flowie-web`. Protected HTTP requests query the
session/account binding, active account status, expiry and revocation. JWT
signature/expiry alone cannot keep a revoked device signed in. Logout also
revokes a valid access-cookie session if its refresh cookie is absent.

Refresh rotates the secret under account-then-session row locks and keeps the
device ID, original creation time and authentication proof. Concurrent uses of
one secret have one winner. Fresh password sessions record their actual proof
instant; legacy and Microsoft sessions without a verified provider authentication
instant retain unknown proof time. A refresh never makes unknown/old proof fresh.

Apply `20261015140000_account_security_history` before API startup. It adds history
and session metadata without inventing authentication times for existing rows.
Old unbound access JWTs are rejected; a valid pre-upgrade refresh cookie can
obtain the new token format through the existing browser refresh-and-retry flow.
Clients that keep only an old access token must sign in again. No database-wide
authentication-version bump or direct production DDL is used.

Idle notification sockets recheck token expiry, session/account status and
workspace access within 15 seconds. Local sign-out/revocation closes that user's
local sockets; unaffected devices reconnect. Periodic checks cover other API
processes. Socket messages are bounded so heartbeat flooding cannot turn every
message into a database authorization query. HTTP revocation is effective on the
next request; already authorized in-flight domain operations are not canceled.

## Management APIs and retention

`/api/v1/account-security/sessions`, `/events` and `/credentials` page the current
account's records with actor/filter-bound signed cursors. Responses are private
and no-store, never return token/hash values, and do not require ownership of a
workspace merely to manage one's own account. Event history covers the last
30 days; no pre-upgrade login history is reconstructed. IP addresses describe
the server-observed request peer and user-agent values are bounded client
reports, not a verified physical-device identity.

Existing `/auth/sessions/{id}` and `/auth/sessions` revocation endpoints now use
the shared bound-session service. A device cannot revoke another account's
session or revoke its own current session through the other-device action.
Sign out handles the current device. Revocations produce personal security events.

Credential inventory combines owned scoped MCP connections and retired personal
API keys. Workspace names/IDs are hidden after membership loss, while the owner
can still revoke the credential and prevent access returning on a later grant.
MCP token scopes and current per-tool/entity authorization remain unchanged.

The current Python API has never authenticated legacy personal API keys. New
issuance now returns 410 and directs callers to scoped AI connections. Existing
key records remain visible/revocable rather than pretending to create another
usable authentication scheme. Token rotation, workspace grants and browser
sessions are separate controls; revoking a browser does not revoke every MCP
credential automatically.

Bounded maintenance deletes security events after 30 days and sessions more
than 30 days beyond expiry/revocation. Password sign-in records success/failure
for known accounts and applies hourly limits: `AUTH_LOGIN_ACCOUNT_LIMIT=20`,
`AUTH_LOGIN_IP_LIMIT=300`. Review the IP limit for shared corporate networks.
The isolated loopback UI harness raises its own synthetic-test limits; production
does not inherit that override. Use secure cookies and HTTPS on CT107.

## Local checks

Integration tests verify live-token revocation, ownership, concurrent refresh,
legacy-cookie upgrade, preservation of unknown proof times, access-only logout,
idle-socket revocation, 107-entry history/credential pagination, cross-account
metadata isolation and lost-workspace revocation. Upgrade tests seed a session
before migrations and retain its LEGACY/unknown proof state. Browser evidence
and actual production deployment are tracked separately.
