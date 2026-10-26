# MCP module architecture

The FastAPI application is the composition root. MCP uses the official Python
SDK 2.3.0 with stateless Streamable HTTP and JSON responses. HTTP authentication
is scoped-token authentication; OAuth is not advertised by this implementation.

## Module boundaries

```text
app/
  core/
    clock.py                 UTC-naive timestamps compatible with Prisma
    dates.py                 ISO date parsing
    identifiers.py           identifiers and token hashing
  db/
    mutations.py             HTTP transaction boundary
  modules/
    access/                  shared workspace/team authorization
    work_items/
      contracts.py           existing domain DTOs, re-exported by legacy routes
      issues.py              issue creation and update application services
      issue_rules.py         references, schedules and workflow catalog invariants
      issue_queries.py       issue projections and related lookups
      issue_activity.py      activity persistence and change rendering
      issue_relations.py     relation compatibility service
      deadlines.py           deadline resolution
      comments.py            comment mutation application services
      comment_repository.py  comment projections and rich-text conversion
      documents.py           document mutation application services
      document_repository.py document access, projections, folders and sources
    notifications/
      outbox.py              transactionally staged, retryable delivery
    mcp/
      api.py                 cookie-authenticated connection management
      domain.py              immutable principal and scope vocabulary
      contracts.py           strict tool and connection input schemas
      connections.py         credential lifecycle and current access checks
      policy.py              membership and resource-binding predicates
      pagination.py          query-bound signed cursors
      registry.py            typed tool catalog and scope-dependent discovery
      queries.py             bounded, permission-scoped query services
      commands.py            mutation orchestration and destination checks
      application.py         timeout, transaction, audit and idempotency boundary
      transport.py           SDK adapter and pure ASGI authentication
      maintenance.py         bounded retention cleanup after credential expiry
    agent_runs/
      api.py                 trusted repository and automation management
      contracts.py           lease, result and configuration schemas
      service.py             atomic claims, fencing and reported evidence
      dispatcher.py          durable event consumption and bounded enqueueing
```

The existing `domains/native_*` routes retain their public function names and
DTO exports for compatibility with Web and the built-in Agent. Selected
mutations delegate to shared services. Services stage database writes and
notification outbox records; HTTP commits through `db/mutations.py`, and MCP
commits through `ToolApplication`. Application services do not call HTTP routes.
The legacy relation compatibility helper keeps its existing transaction behavior;
it is not exposed as a new MCP mutation.

Frontend code uses `lib/mcp.ts` and `lib/agent-runs.ts` for typed API access.
Connection state is in `use-mcp-settings.ts`; connection, coordination and trusted
configuration views are separate components under `components/settings/mcp/`.
The new controls follow the repository's Astryx component guidance.

## Permission and consistency invariants

- Each credential authorizes exactly one workspace, optional team/project
  bindings, explicit scopes and at most 90 days of use. Only its hash is stored.
- The user must remain active and retain workspace and team access. Client
  parameters and issue/document text never grant permission.
- Discovery reflects scopes and the global write switch. Every call repeats
  authorization, including independently checking related context sections.
- Management APIs accept the existing browser session. An MCP token cannot
  create another credential or manage workspace policy through those APIs.
- Version triggers cover Web, MCP and other database writers. MCP locks the
  authorized row and checks `expectedVersion` before writing.
- Mutation result, audit, idempotency record and notification intent commit
  together. Retries with identical arguments return the saved result; changing
  arguments under the same key is a conflict.
- Pending/RUNNING runs are unique per issue. Five-minute leases and increasing
  fencing tokens prevent a displaced agent from reporting results. A heartbeat
  does not extend a run beyond its two-hour budget.
- Reported test and PR evidence is explicitly agent-reported. The API does not
  claim independent CI verification, merge a PR or mark an issue complete.
- Repository instructions and test argument arrays are maintained by a workspace
  manager. External coding agents execute in their own authorized environments;
  the production API never executes those commands.
- AI mutations set a transaction-local marker. The issue event trigger excludes
  those mutations, preventing recursive automation enqueueing.

## Delivery and operations

Notification rows remain the durable Inbox source. The outbox coordinates live
fan-out and Discord delivery after commit, with an expiring lease and eight
attempts. External delivery is at least once: a provider can accept a request
whose response times out. Successful outbox payloads are cleared; records are
workspace-bound and removed when that workspace is deleted.

Issue events use row locks with `SKIP LOCKED`, retry/backoff and a terminal failed
state. Rules are disabled by default and use only an active connection belonging
to the authorizing user. The daily budget is serialized per connection. Events
created before a rule are not replayed into new work automatically.

The dispatcher creates pending runs. It does not launch an LLM or a coding
process. An external client polls `list_runs`, claims an issue, heartbeats and
reports results. A pending or running run is directed at exactly one connection
and only that connection may claim or reclaim it, including after its lease
expires; `list_runs` exposes `assignedToThisConnection` so a client polls its own
queue. Issues without a pending or running run form the shared pool that any
connection with `runs:write` and issue access may claim, and canceling a directed
run is the only way to return its issue to that pool. Provider-specific PR
creation and independent CI reconciliation remain separate integrations to
verify against the selected repository/client.

Prisma owns both migrations, including database triggers and partial indexes
that cannot be represented fully in the Prisma model. Startup continues to
require successful `migrate` completion before API or worker starts. The
production workflow now requires the verification workflow before deployment.
