# SLA behavior and implementation design

NEXT-03 is implemented on the product-completeness branch. This document defines
its invariants; local evidence and production status are recorded separately in
the implementation tracker. The branch has not been deployed to CT107.

## Time and policy rules

- `calendar = null` preserves existing 24×7 elapsed budgets. A business calendar
  specifies an IANA zone, non-overlapping weekday windows and explicit holiday
  dates. Overnight windows are split at midnight; 24:00 is an allowed end.
- Windows are continuous UTC intervals whose local boundaries use the shared
  first-fold/gap resolver. Budgets count actual seconds in those intervals,
  exclude holidays/closed hours and preserve fractional remaining seconds across
  pauses. Enforce a ten-year calculation horizon at policy save and runtime.
- Policies carry a version and immutable revision snapshot. Existing policies
  become version 1 with an explicit observation baseline. Edits affect new issues
  or an explicit Use current SLA action; an existing issue retains its accepted
  snapshot on reopen. Past cycle results keep that same accepted revision.
- Team and priority specificity follow the current shared deadline precedence.
  A manager still needs membership in a private policy team. Workspace-wide
  policies may reference only shared statuses; team policies may also use that
  team's statuses. Terminal statuses cannot be pause statuses.
- Warning threshold is optional and less than the SLA budget. Escalation target
  must be an active workspace member, and execution must independently verify
  their current access to the issue team. A target losing access is skipped and
  recorded, never assigned or sent private issue content.

## Lifecycle and history

Use `issue_lifecycle_events` to consume every actual status/team/deadline/archive
transition in version order. Shared issue creation/update should drain their
events before commit, so UI sees the resulting deadline immediately. The worker
drains events from legacy/direct writers as well. Every issue uses the same lock
order: lock issue first, then cycle/events, avoiding worker/update deadlocks.
SLA-owned deadline writes use `managed_due`; their generated event is marked as
maintenance and must not be interpreted as a user override or recursively create
more changes. Always mark processed events transactionally.

Track one record per SLA cycle with policy snapshot/version, initial budget,
remaining seconds, last start, current due/warning instant, state and terminal
timestamps. States distinguish ACTIVE, PAUSED, COMPLETED, CANCELED and OVERRIDDEN;
breach is a separately preserved timestamp. A completed cycle is immutable for
historical compliance. Reopening starts a new cycle under that issue's accepted
revision, so a delayed consumer cannot infer which revision was effective from
application timestamps. Moving teams closes the old obligation and evaluates the
destination's current policy at binding time without exposing old private policy
metadata. Defer destination binding until pending transitions are drained; if a
legacy/direct writer moved and completed an issue before processing, do not invent
an intermediate destination obligation. A new active destination clock starts at
actual binding time. Shared move handling drains before commit to keep that gap
minimal; historical workflow timestamps remain the database capture instants.

Existing issues have BASELINE events and keep legacy deadlines without
retroactively asserted SLA coverage. New issues with an explicit deadline opt out
of the automatic clock. A manual deadline change stops an active automatic clock
as OVERRIDDEN; clearing a manual deadline must not silently reapply SLA. Track an
issue opt-out flag and provide an explicit **Use current SLA** action to start a
new cycle. Updating a manual deadline after completion must preserve the earlier
completed result. Archive/cancel closes the active cycle without a false success;
restore/reopen is evaluated explicitly, preserving previous history.

At pause/completion, consume only actual business time elapsed since last resume.
Completion exactly at the deadline is on time. A previously recorded breach is
never erased by pause, completion or policy editing. Paused, unbreached clocks
have no active deadline; resume computes a new due time from remaining work.
Issue UI must show PAUSED/managed/overridden status rather than an unexplained
missing due date.

## Alerts, escalation and reporting

Persist warning/breach delivery markers in the same transaction as Inbox rows
and notification outbox. Retry/restart must not duplicate notifications. Use a
system actor and independently filter creator, assignee and subscribers against
current active account/workspace/team access. Stage notifications only; no SMTP,
Discord or external request belongs inside a domain transaction. Respect existing
channel preferences through the notification delivery layer.

Escalation rechecks the policy actor's current permission and target access,
locks/version-checks the issue and stages a standard shared assignee update.
It runs at most once per breach/cycle; failure or skipped access has a bounded
code in cycle history and must not expose a raw exception. Heartbeat/progress
tracks the worker and lag, independently of whether every business action succeeds.

Server reports reuse `issue_scope` so counts cover all current matches, independent
of loaded pages. Show managed coverage, legacy/unmanaged and overridden counts,
active/paused/breached clocks and completed-cycle on-time rates. Exclude canceled
and overridden cycles from successful-completion denominators. Do not infer
historical status-entry time or compliance from a legacy due date. Policy history,
issue cycle history and settings/report routes use scoped bounded pagination.

## Verification gates

Calendar cases: weekends/holidays, split windows, DST, boundary equality, fractional
pauses and invalid/horizon cases. DB cases: Web/MCP/CSV/bulk/recurring creation,
pause/resume, same-status no-op, completion/reopen, manual override and explicit
reapply, archive/restore/team move/direct SQL, policy revision isolation, revoked
actor/target, duplicate workers, savepoint rollback and alert/outbox idempotency.
Report fixtures exceed 100 rows with private teams. Browser checks cover create/
edit policy, calendar preview, task SLA status, history/report filtering, error
recovery and 390px action bounds on all three engines. Prisma owns every schema
change; apply migrations before API/worker startup and verify no schema drift.

## Operations and API compatibility

The API lifespan supervises `sla-clocks`. `issue_sla_jobs` schedules pending
events, warnings and breaches using issue-row locks with SKIP LOCKED. It keeps
dormant rows to preserve monotonic generations: an older failed attempt cannot
poison a newer user edit or manual retry. Backoff stops after eight failures;
error codes contain exception classes, never raw exception text. The Operations
page reports SLA due-queue lag and failures only for accessible issue teams.

Policy reads use signed cursor pagination. Writes use POST to create, PUT with
all policy values plus `expectedVersion` to edit, and versioned POST archive or
restore commands. The previous partial PATCH and unversioned DELETE interface
is replaced; deploy the updated web client with this API. Policy revisions use
bounded `before` pagination. Calendar preview requires a UTC-offset start in
2020–2100; its result does not reserve a task deadline.

Issue clock reads and history require current issue access and additionally hide
cycles whose historical team scopes are no longer readable. Explicit apply
requires the observed issue version and latest cycle number; duplicate or stale
requests conflict. Retry requires the observed failed-job generation. GET never
starts or rewrites a clock. Compliance reports cover the latest visible cycle
per currently matching task and show pending events rather than inventing a
fully processed result. Canceled, overridden and untracked cycles do not count
as on-time completions. An earlier completed result remains valid after a later
manual deadline change.

Alert processing markers mean that the intent was handled, not that SMTP or a
desktop notification was received. `alertResults` records queued, suppressed or
no-authorized-recipient outcomes. Historical superseded cycles do not spam the
Inbox; a late completion may report its recorded breach but cannot be reassigned.
Escalation is attempted once per cycle, including recorded access/paused skips.
Discord is not enabled for SLA alerts. Existing channel opt-ins still apply.
