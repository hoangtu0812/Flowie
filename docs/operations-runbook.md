# Flowie operations

## Deployment prerequisites

- Prisma owns schema changes. Apply `20261015040000_operational_observability`
  through the Compose migrate dependency before API/worker startup.
- Provision `S3_BUCKET` with the configured storage credential. `/readyz`
  requires signed HEAD access to this bucket; a missing bucket is degraded.
  This probe does not create buckets or objects. Validate write/read behavior
  separately when changing storage credentials.
- The production workflow sets `FLOWIE_DEPLOY_SHA`. Compose passes this to the
  API as `FLOWIE_REVISION` and to the Web build as `FLOWIE_REVISION`; Help shows
  the embedded `NEXT_PUBLIC_BUILD_REVISION`. Release version remains a separate
  CHANGELOG identity. Local runs show `local`.

## Probes and diagnosis

- `/livez`: API process responds; does not depend on PostgreSQL, Redis or S3.
- `/readyz`: bounded SELECT 1, Redis PING/PONG and signed bucket HEAD. Returns
  503 if any fails. TCP connectivity alone cannot make the API ready.
- `x-request-id` is bounded and validated. Error responses include a reference;
  API logs use route templates, status and duration rather than query strings,
  request payloads or arbitrary exception messages. Production disables raw
  Uvicorn access logging.
- Workspace managers open Settings → Operations for delivery pending/failed
  counts and queue lag. These queue counts are scoped to the current workspace.
- Background task identity is an opaque process instance plus a static job name.
  Heartbeats show liveness every 15 seconds; no heartbeat for 60 seconds is stale.
  Progress is the last completed scan, not proof that every domain item succeeded.
  Delivery failures remain visible in queue state. Digest/maintenance scans can
  legitimately have long intervals between progress records.
  The list prioritizes live instances and the most recent state per job; older
  stopped/stale instances cannot crowd new jobs out after repeated restarts.
  An explicit truncation notice covers more than 100 matching live/latest rows.
- Browser diagnostics accept only category, static route kind and a bounded
  digest; arbitrary message, stack, URL and payload fields are rejected. Reports
  require workspace access and are capped at 60 per account/hour. First-party
  clients also deduplicate per route kind/minute. No task/document content is sent.
- Client reports expire after 30 days; obsolete heartbeat instances after seven
  days, in bounded maintenance batches. This does not change MCP audit retention.

## Recovery acceptance

Dependency failure must degrade readiness while liveness remains responsive.
Stopping a job/process must surface a failed/stopped/stale heartbeat. Manager
access must be checked by the API independently of navigation visibility.
Before declaring CT107 operational, verify its exact revision, migration result,
readiness and the application path being changed. Synthetic local tests and
mail transport fixtures do not establish live mailbox or off-host backup status.

Backup configuration and restore rehearsals are tracked separately in the
product-completeness plan. Do not substitute a local copy for off-host storage.
