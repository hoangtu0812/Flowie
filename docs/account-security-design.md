# Account security implementation — in progress

NEXT-07 remains in progress until its API, browser and upgrade gates pass. No
production MFA policy, key or account enrollment has been changed.

## Session and credential decisions

- Bind browser access JWTs to a database session ID, an explicit access-token
  purpose, issuer and audience. Every HTTP and WebSocket authentication checks
  current account/version, session owner, expiry and revocation. Old access JWTs
  without binding are rejected; existing valid refresh cookies can transparently
  obtain the new format. MCP token authentication remains its separate scoped
  grant model.
- Rotate refresh secrets under locks while retaining the device session ID and
  original first-factor authentication instant/method. Refresh must not invent
  a recent password/SSO authentication. Lock accounts before sessions so account
  reset, refresh and security-setting changes cannot recreate a revoked session
  through a race. A consumed refresh secret cannot be spent concurrently twice.
- Add paged active sessions, individual/other-device revocation, bounded personal
  login/security history and a unified own-credential inventory. Revoke owned MCP
  connections even after workspace membership is lost, without revealing lost
  workspace/project metadata. Do not expose credential hashes or raw secrets.
- The current Python API never authenticates the legacy personal API keys it can
  issue. Stop issuing those unusable keys, retain inventory/revocation, and direct
  integrations to scoped MCP connections rather than adding another broad token
  authentication path.
- Realtime sockets revalidate bound sessions periodically as well as at connect;
  local revocation closes relevant connections promptly. HTTP revocation is
  effective on the next request. No claim of immediate cross-process socket
  termination is made without a shared push channel.

## MFA decisions

Implement opt-in authenticator TOTP plus one-use recovery codes. Enforce it after
both password and Microsoft first-factor login, before issuing browser cookies.
No passkey support or organization-wide IdP enforcement is claimed.

Use a randomly generated account-specific secret with the RFC 6238 30-second
counter, a narrow clock-skew window, constant-time comparison and a persisted
last accepted counter to reject reuse across challenges. Store secrets only in
authenticated encrypted payloads bound to the account ID, using independent
operator-provided Fernet key(s); no JWT-secret-derived or plaintext fallback.
Keys stay outside Git and must be included in protected backup/recovery plans.
Missing/decryption-invalid keys fail closed for enabled factors; recovery codes
remain an independent recovery path.

Enrollment requires the password for password-capable accounts, or a genuinely
recent Microsoft first-factor authentication for SSO-only accounts, and a valid
code from the pending secret. Pending enrollment expires and does not enforce
MFA until verified. Enabling MFA revokes previous browser sessions and creates
a verified session atomically. Existing MCP credentials remain explicit grants
and are inventoried separately; MFA does not pretend to add an interactive
second factor to every autonomous MCP call.

First-factor login creates only a short-lived, hashed, single-use challenge when
MFA is enabled. The raw challenge stays in an HttpOnly cookie; the database binds
it to the account authentication version and login method. Failed verification
attempts persist, are bounded/rate-limited and cannot create cookies. A successful
verification consumes both the challenge and a TOTP counter or recovery code in
the same transaction as the new session. Recovery codes are random, account-bound
hashes; plaintext codes are returned once and kept only in page memory.

Disabling or replacing recovery material requires renewed first-factor proof
and an existing second factor, records a personal security event and revokes
other browser sessions. Password recovery does not silently remove MFA. Avoid
logging passwords, codes, secrets, challenge cookies, raw tokens or OTP URLs.

## Evidence gates and references

Session replay/rotation, revoke-before-expiry, cross-account ownership, old-cookie
upgrade and active socket revocation; RFC test vectors, setup/expiry, code replay,
parallel challenges, recovery replay, failures surviving rollback, Microsoft
gating, key loss, disable/regeneration and password-reset interactions; paged
history/inventory and three-engine mobile browser checks. Prisma migration and
production environment requirements must pass before merging a release.

Primary references checked during design:
[RFC 6238](https://www.rfc-editor.org/rfc/rfc6238),
[JWT best current practices](https://www.rfc-editor.org/rfc/rfc8725),
[OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html),
[cryptography Fernet](https://cryptography.io/en/latest/fernet/).
