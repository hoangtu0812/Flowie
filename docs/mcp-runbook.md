# Flowie MCP runbook

## Scope supported

The server provides scoped-token access over Streamable HTTP at `/mcp/`.
Reference SDK integration tests cover `2025-11-25` and `2026-07-28`. OAuth and
specific desktop clients are not declared supported until their own connection
tests pass. The selected deployment scope is local Codex/Cursor/Claude clients
with scoped tokens; OAuth is deferred. No authorization-server metadata endpoint
is advertised.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_ENABLED` | `false` | Mount the MCP transport and run its SDK lifespan |
| `MCP_WRITES_ENABLED` | `false` | Expose/call mutation tools and enable event dispatcher |
| `MCP_ALLOWED_HOSTS` | `localhost:*,127.0.0.1:*,[::1]:*` | SDK Host allowlist; use host names/ports, not URLs |
| `MCP_RATE_LIMIT` | `60` | Requests per connection per fixed minute window |
| `MCP_TOOL_TIMEOUT_SECONDS` | `30` | Maximum execution time per tool transaction |
| `MCP_MAX_RESULT_BYTES` | `262144` | Maximum serialized structured result size |
| `MCP_MAX_IDEMPOTENCY_KEYS` | `10000` | Maximum saved mutation keys per connection; identical retries do not consume a new key |
| `API_PUBLIC_URL` | `http://localhost:4000/api/v1` | Public REST API base (Compose uses `NEXT_PUBLIC_API_URL`); `create_attachment_upload` returns upload URLs under it, so agents must reach it |

Configure the actual API host before enabling remote access, for example:

```dotenv
MCP_ENABLED=true
MCP_WRITES_ENABLED=false
MCP_ALLOWED_HOSTS=api.example.internal,localhost:*,127.0.0.1:*
```

Use HTTPS for remote connections. `API_CORS_ORIGIN` must include the actual Web
origin. Preserve forwarded Host and MCP request headers in the reverse proxy.
Runtime switches take effect after restarting the API with the new environment.
Do not use a wildcard host allowlist in production.

## Create and verify a connection

1. Open **Settings → Integrations → AI connections (MCP)**.
2. Name the connection, choose its expiry, select scopes and optional team/project
   restrictions. Empty restrictions mean the user's existing access applies.
3. Create the credential and copy the one-time token into the client's secret
   configuration. Do not put it in a committed file or issue description.
4. Configure a client that can send `Authorization: Bearer <token>` on every MCP
   request, using the displayed server URL ending in `/mcp/`.
5. Discover tools, call `get_my_access`, then read one permitted project/issue.
6. Verify that an issue from another scope is unavailable. Enable write scopes
   only when the corresponding write functionality has been verified.

The CLI reference client uses the same SDK as the integration tests:

```powershell
# Set FLOWIE_MCP_TOKEN through the local shell or secret store.
.\.venv\Scripts\python.exe scripts/mcp-client.py --url http://localhost:4000/mcp/ list
.\.venv\Scripts\python.exe scripts/mcp-client.py --url http://localhost:4000/mcp/ call get_my_access
.\.venv\Scripts\python.exe scripts/mcp-client.py --url http://localhost:4000/mcp/ call search_issues --arguments query.json
```

Example `query.json`:

```json
{"projectId":"<project-id>","category":"STARTED","limit":25}
```

Token secrets are read from the environment, not command-line arguments. The
client intentionally prints tool results; use it only in an appropriate local
terminal and do not attach sensitive output to public tickets.

## Local AI client configuration

Use one expiring connection per client, bound to the selected project/team. Begin
with `context:read`, `projects:read`, `issues:read`, `comments:read` and
`documents:read`. Grant `activities:read` or `reviews:read` only if needed. Add
write scopes separately for the intended workflow. The MCP token grants Flowie
access; repository editing and SCM credentials belong to the coding client.

Set `FLOWIE_MCP_TOKEN` in the client's process environment through a local secret
store or a private shell session. Restart the client after changing it. Replace
the template URL with the URL displayed by Flowie, retaining `/mcp/`. Use
`http://localhost:4000/mcp/` only when the API actually runs on the same machine.

### Codex

Merge [codex.toml](mcp-clients/codex.toml) into the user's `~/.codex/config.toml`,
or register the server through the CLI:

```powershell
codex mcp add flowie --url https://api.example.internal/mcp/ --bearer-token-env-var FLOWIE_MCP_TOKEN
codex mcp list
```

Codex supports bearer tokens from an environment variable for Streamable HTTP.
This configuration is shared by local Codex clients on the same host. Start a
new session and request `flowie.get_my_access`, then an allowed issue. Listing
configuration alone does not prove that a tool call succeeds. See
[official OpenAI documentation](https://developers.openai.com/codex/mcp/).

### Cursor

Merge [cursor.json](mcp-clients/cursor.json) into `~/.cursor/mcp.json` or the
project's `.cursor/mcp.json`. Its `Authorization` header uses
`${env:FLOWIE_MCP_TOKEN}` interpolation. Restart Cursor and check the server's
tools in Customize before requesting `get_my_access`. See
[Cursor MCP documentation](https://cursor.com/docs/mcp).

### Claude Code

Merge [claude-code.json](mcp-clients/claude-code.json) into the project's
`.mcp.json`. The HTTP entry requires `type: "http"`; its header uses
`${FLOWIE_MCP_TOKEN}` interpolation. Start Claude Code with the variable set,
approve the project MCP configuration, and inspect `/mcp` before requesting
`get_my_access`. This template targets Claude Code; Claude Desktop requires its
own connection verification. See
[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Client acceptance record

Run these checks against an isolated test workspace before using real work:

| Check | Required evidence |
| --- | --- |
| Initialize and discover | Client/version, API commit, connection ID and visible tool names |
| Authorized reads | `get_my_access`, project issue search, context and document read succeed |
| Scope boundary | An issue/document outside the grant is unavailable; hidden tools cannot be called |
| Writes, if granted | Comment/document/status mutation succeeds with current version and a unique key |
| Replay and conflict | Identical retry creates no duplicate; stale version is rejected |
| Revocation | The same client cannot read/call tools after token revocation |

Record sanitized results with MCP-17/19. Current templates have been checked
against official configuration documentation, but an SDK test or a template
parse is not a desktop-client acceptance result. Do not include tokens in the
record. Keep test artifacts inside the test workspace.

## Agent instructions

At MCP `initialize` every client receives a fixed safety line followed by the
workspace's task workflow. Owners and Admins edit or reset the workflow in
Integrations → AI connections (MCP) → Agent instructions
(`GET`/`PUT /api/v1/mcp/instructions`); a workspace without one uses the
built-in workflow from `apps/api-python/app/modules/mcp/instructions.py`.
Clients only read instructions at `initialize`, so restart or reload the MCP
server in the client after a change.

## Writing safely

- Use `list_issue_options` before creating or assigning work.
- Obtain the current `version` before update/transition/document restore.
- Generate a unique `idempotencyKey` for a logical mutation. Retry that same
  mutation with identical arguments and the same key after a timeout/network
  error. A new mutation needs a new key.
- An update conflict requires re-reading and reconciling the data; do not silently
  retry stale content with the newly read version.
- `transition_issue` also requires `comments:write` because it records the reason
  in a comment. Status cannot be changed through `update_issue`.
- `update_issue` moves an issue under another issue with `parentIssueId` (id or
  identifier; `null` removes the parent). The parent must be in the connection's
  scope, in the same team, unarchived and not a descendant of the issue.
- `create_document` uses an existing team folder. Create a team folder in Flowie
  first if that team has no folder. A project-limited connection must link its
  new document to an allowed project or issue.
- `update_document` replaces the specified content/title. Revision history is
  preserved; `restore_document` creates a new revision rather than removing old
  ones. `get_document_revision` and `get_document_diff` support review before restoring.
  Current and historical reads expose character offsets for bounded text pages.
  `update_document` also takes exact-text `edits`. Document writes return the
  new version, length and a level 1-2 outline, not the text, unless
  `includeContent` is true.
- `get_document` with `outline` returns the headings with line, offset and
  section length and no text; with `section` (a heading title) it returns that
  part, with `offset`/`limit` counted inside it. Without either it returns the
  full text page as before.
- `get_feature_docs` returns the FDS/TDS linked to an issue with their version
  and outline (text only with `includeContent` or for one `section`),
  the project's `module / feature` folders with their FDS/TDS, and a `warning`
  while the issue has none. `upsert_feature_doc` creates missing project,
  module and feature folders, creates or updates the feature's FDS or TDS (a new
  revision), appends a change-log row naming the issue and `changeSummary`, and
  links the document to the issue. It needs `documents:write` with
  `documents:read` and `issues:read`, and the issue must belong to a project.

Write tools also require their corresponding read scopes so an update response
cannot bypass a read restriction. Comment writes require issue and comment reads.
Discovery omits a tool when any of its required scopes is missing.

Idempotency records persist while the credential is active, followed by a
seven-day grace period after expiration or revocation. Hourly maintenance removes
inactive replay records and successful notification/event rows older than seven
days, in bounded batches. Failed queue rows remain available for recovery.
Per-workspace and per-tool aggregate budgets remain follow-up work.

## External coding agent workflow

1. A workspace manager configures the selected project's credential-free HTTPS
   repository URL, base branch and test command argument arrays in Integrations.
2. The coding client reads the issue with `get_issue_context` and the
   repositories with `get_project_repositories`, then follows the workflow in
   the MCP instructions: `start_issue`, feature documents, code and a pull
   request in its own authorized environment, then `finish_issue`.
3. Review CI and the acceptance criteria before moving the issue to Done.

Agent runs (`claim_issue`, `heartbeat_run`, `report_run_result` and the related
tools) and label automations were removed in DTD-544.

## Troubleshooting

| Result | Action |
| --- | --- |
| 401 | Check token, expiration/revocation, account status and active membership |
| 403 | Check scopes, global write switch and ownership requirements |
| 404 | Verify IDs and allowed workspace/team/project; unrelated IDs intentionally look absent |
| 409 | Re-read version or run ownership; for idempotency, use identical arguments or a new logical key |
| 413 | Reduce query size or document/context content |
| 421/Origin rejection | Check actual Host and configured origins; preserve proxy headers |
| 429 | Honor `Retry-After`; reduce request frequency |
| 503 | Check migration and PostgreSQL availability |
| 504 | Narrow the operation; retry writes with the same key |

Inspect connection audit in Integrations or `GET /api/v1/mcp/audit`. Logs include
tool, connection, status and duration without tokens or provider credentials.
Notification/agent queues stop retrying after eight processing failures. Inspect
failed rows through authorized operational database access and correct the cause
before resetting their retry state. CI failure or unavailable dependency must not
be addressed by bypassing the Compose migration dependency.

## Verification and CT107 rollout

```powershell
$env:DATABASE_URL = '<isolated-test-database-url>'
$env:MCP_TEST_DATABASE_URL = $env:DATABASE_URL
pnpm --filter @flowie/database exec prisma validate --schema prisma/schema.prisma
pnpm --filter @flowie/database exec prisma migrate deploy --schema prisma/schema.prisma
.\.venv\Scripts\python.exe -m pytest apps/api-python/tests -q
pnpm --filter @flowie/web build
docker compose --profile app config --quiet
```

Use a dedicated test database. The migration upgrade test recreates the previous
schema inside a transaction-local test schema, seeds an existing document and
checks backfill/version/revisions before rolling back.

The production workflow requires the verification workflow first. Both MCP
migrations must be committed and applied by `migrate` before API/worker starts.
Begin CT107 with MCP disabled or read-only, verify the actual client and access
boundaries, then enable tested write scopes. Record workflow URL, exact SHA,
migration output, `/readyz` and MCP smoke-test evidence in the implementation
plan. Tag/release only after that exact commit is verified in production.

Rollback starts by disabling MCP/writes and restoring a schema-compatible image.
Retain the additive tables/columns and committed migration history. Do not remove
triggers or revert applied schema ad hoc; restore data from a verified backup
only through an explicit operational recovery procedure.
