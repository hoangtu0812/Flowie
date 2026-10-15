# Issue lifecycle history foundation

Prisma migration `20261015120000_issue_lifecycle_history` adds an atomic database
trigger for issue creation and actual changes to status, team, due date or archive
state. It records before/after IDs/categories and the issue version, so shared
Python, MCP and other database writers cannot silently omit a status transition.
Unrelated title/label updates and reapplying the same status produce no lifecycle
event. Reapplying a status also preserves completed/canceled timestamps.

Existing issues receive a BASELINE at migration observation time with unknown
previous category. Their original creation time is not used as an invented
status-entry time. CREATED records after migration are distinguishable from
BASELINE. Reporting must use that distinction when disclosing coverage and
computing lead/cycle time or current-status aging.

Shared mutations set transaction-local actor/transport context. MCP pins AI even
when invoked without HTTP middleware. Writers without trusted context remain
UNKNOWN, rather than being attributed to Web by assumption. Context clears at
transaction rollback/commit. Events and domain writes roll back together; there
is one event per relevant issue version. An SLA-managed deadline flag distinguishes
business-clock maintenance from an explicit user deadline override.

`sla_processed_at` is reserved for the SLA lifecycle consumer. Baselines are
already observed and do not create retroactive SLA obligations. The foundation
does not yet expose reporting UI or activate SLA warnings; those remain separate
tracked features. Histories are scoped by current issue access when read, not by
past team membership. No automatic event purge is configured.

The trigger uses PostgreSQL 16's built-in
[`gen_random_uuid()`](https://www.postgresql.org/docs/16/functions-uuid.html)
and requires no additional extension. Upgrade acceptance first applies all
pre-MCP migrations, inserts existing document/issue records, then applies every
later migration in chronological order. It checks document revisions and an
honest issue baseline, complementing a clean Prisma migration/schema-diff check.
