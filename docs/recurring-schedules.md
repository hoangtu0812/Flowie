# Recurring issues

Settings → Recurring schedules supports daily, weekly and monthly rules, an IANA
time zone and a task/bug template. Team settings links to the same feature. Active
workspace members read schedules/history for their own teams; owners and admins
configure schedules only for teams they belong to. Each schedule runs as its
original creator and rechecks their active account, workspace/team membership and
all task references before creating an issue. Changing configuration does not
transfer ownership. If the creator leaves, pause the old schedule and create a
replacement under the intended owner.

Apply `20261015110000_recurring_issues` and `20261015110100_recurring_pending_index`
before API startup. `tzdata==2026.2` supplies
IANA data on platforms without a system database, including Windows, following
the [Python zoneinfo data-source contract](https://docs.python.org/3/library/zoneinfo.html#data-sources).
The API supervisor monitors the `recurring-issues` worker every five seconds.

## Calendar contract

- Local time is HH:MM. Preview returns the next five occurrences in UTC before
  saving. Start date is inclusive; newly created, edited and resumed schedules
  select their first occurrence strictly after the current instant.
- Daily intervals are elapsed calendar dates from start date (1–365 days).
  Weekly intervals (1–52 weeks) align to the Monday of the start-date week and
  use selected weekdays, without emitting a date before start date. Monthly
  intervals (1–12 months) align to the start-date month. Day 31 uses the final day
  in shorter months, including leap years.
- DST overlaps select fold 0 once. A nonexistent local minute advances to the
  first valid minute; e.g. 02:30 in a 02:00–03:00 spring gap runs at 03:00. The
  bounded resolver also handles a skipped date at a date-line transition.
- When a worker is delayed, it creates one task for the pending occurrence and
  advances to the next future occurrence. It does not backfill every missed task.
  A successful manual run is an additional task, independent of the regular due
  occurrence, and does not move the regular schedule.

An optional due-after value is elapsed minutes from actual issue creation; it
does not use business hours. Leaving it blank uses the current matching SLA.
Templates support title, description, priority, status, project, assignee and bug
details. Reference choices follow current access. If a referenced project becomes
unavailable, its ID is redacted in reads and the editor warns before clearing or
replacing it. Run history also hides identifiers of tasks moved outside access.

## Persistence, concurrency and operations

Create requests and manual runs use idempotency keys. Configuration/pause/resume
commands require the expected schedule version. Manual requests freeze a template
revision when accepted; later edits affect future automatic occurrences. One
manual request may be queued per schedule. Pause cancels queued manual requests
and preserves tasks already created. Resume selects the next future occurrence.

Workers lock one schedule using `FOR UPDATE SKIP LOCKED`. Automatic occurrence
keys, task creation, domain notifications/activity, history result and next due
time commit in the same database transaction. The lock is held only over local
database work; no external network operation runs inside it. A lost connection
releases the lock and rolls back the entire transaction. Workers can retry after
restart without duplicating the task. Unexpected domain failures roll back their
savepoint and record only a bounded error code. Three consecutive failed runs
pause the schedule; inspect history and restore access/references before resume.

The workspace limit is 100 schedules, including paused schedules. Reuse/edit a
paused schedule when appropriate. Run history is retained without automatic
purge and paged with signed account/workspace/schedule cursors, 50 by default and
100 maximum. Pausing keeps history; destructive schedule deletion is not exposed.
Configuration and manual commands share a limit of 60 per account/hour. The
scheduler only creates issues; it cannot create schedules or recursively invoke
rules. DONE in run history means the worker created the issue, not that the
issue's workflow is complete.
