# Authenticator MFA

Opt-in TOTP and one-use recovery codes protect both password and Microsoft
browser sign-ins. Apply `20261015150000_account_mfa` before API/worker startup.
Accounts are not enrolled by migration. This feature does not add passkeys,
mandate an organization-wide IdP policy or change autonomous MCP grant scopes.

## Operator configuration

Configure `AUTH_MFA_ENCRYPTION_KEYS` outside Git as comma-separated Fernet keys,
newest first. Use an independent random key, not `AUTH_JWT_SECRET`. Missing or
malformed keys disable new enrollment. Enabled factors fail closed if their
secret cannot be decrypted; unused recovery codes remain usable. No plaintext
fallback exists. Keep these keys in the protected configuration backup and
verify them in an isolated restore before removing any older backup/key.

The first key encrypts new enrollments; all listed keys can decrypt. Adding a
new key does not rewrite existing factors. Keep old keys until every affected
factor has been explicitly re-enrolled or an audited re-encryption procedure
has been completed. Never remove a key merely because a deployment succeeded.

Use HTTPS and secure cookies on CT107. The isolated loopback E2E harness creates
an ephemeral test-only key; this is not production configuration.

## Proof and session behavior

Enrollment requires the account password when local sign-in is available, or a
Microsoft authentication within five minutes for SSO-only accounts and whenever
Entra sign-in is enabled, followed by a valid pending TOTP. Explicit
Microsoft reauthentication requests `prompt=login` and `max_age=0`; only the
validated ID token's `auth_time` can provide that proof. Token issuance,
background refresh and a new local browser session do not count as fresh SSO.
If the provider omits `auth_time`, enrollment requires reauthentication rather
than fabricating proof. Live tenant configuration remains a production gate.

Pending setup expires in ten minutes. Enabling revokes previous browser sessions
and atomically issues a factor-verified session. Security settings display ten
random 128-bit recovery codes once; only account-bound hashes are stored.
Discarding the setup view removes its secret from page memory; a discarded
pending factor is not enabled and can be replaced by a new verified setup.

First-factor login to an enabled account sets only an HttpOnly five-minute
challenge cookie. Challenges bind the account version/method/proof and validated
relative return path. Verification allows five failed attempts per challenge,
20 attempts per account/hour and 100 per request peer/hour. Failures persist
across request rollback; encrypted-key unavailability also spends an attempt.
TOTP uses SHA-1, six digits and 30-second counters with a +/- one-counter window.
An accepted counter cannot be reused, including across concurrent challenges.
Recovery hashes are consumed once under the same account lock as session creation.

Disable and recovery-code replacement require renewed first-factor proof and an
existing second factor, revoke other browser sessions and invalidate outstanding
challenges. Password reset retains the enabled factor and invalidates old
challenges through the account authentication version. A lost authenticator and
all lost recovery codes have no password-only self-service bypass.

Session HTTP and WebSocket authentication also checks factor verification against
the enabled instant. Refresh preserves proof and cannot upgrade an unverified
session. Security changes close local sockets; periodic checks cover other API
processes. Read/write responses are private/no-store. Logs and history contain
event kinds and bounded request metadata, never OTP URLs, codes or secret values.
Expired challenges and abandoned pending setups are removed by bounded maintenance.

## Verification

Local tests cover RFC 6238 SHA-1 vectors, skew/replay, encryption key ordering and
account binding, enrollment, old-session rejection, password and Microsoft
callback gating, challenge attempt/expiry/version guards, simultaneous TOTP and
recovery use, transactional rollback, missing keys, recovery replacement, disable
and password-reset interaction. Microsoft network/provider behavior is mocked at
that boundary; no live Entra acceptance is implied. Browser and CT107 results are
recorded separately in the product implementation tracker.
