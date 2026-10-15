# Workflow reporting and dashboard

The dashboard reads server aggregates across all matching accessible tasks. Its
filters use the shared issue query contract: team, project, current status,
search and sub-issues. API callers can also use the contract's assignee, creator,
cycle, personal scope and supported issue filters. Local dates use an IANA zone;
the range is inclusive and limited to 366 days in 2020–2100. Weekly planning
supports a configured first weekday. Apply filters explicitly before calculating.

## Meaning of the numbers

- Current task, open, Started/WIP, completed, canceled and overdue counts are a
  snapshot now. The date filter does not pretend that today's issue fields are
  their values at the historical period end. Scope excludes currently archived
  tasks/teams and follows the reader's current access.
- Created counts use persisted creation instants. Completion and reopen counts
  use actual lifecycle transitions, not a last-completed timestamp. A task can
  contribute multiple completions after reopening. Completed-to-active transitions
  count as reopened; the bug subset uses today's task type, not an invented
  historical classification.
- Each episode starts at captured creation, or a captured terminal-to-active
  reopen/active restoration. Lead time ends at that episode's completion; cycle
  time starts at its first captured entry into Started. Both use elapsed hours,
  separately from SLA business time. Mean, median, P85 and sample counts are
  calculated on known episodes. A legacy BASELINE is neither creation nor
  completion and cannot establish a complete episode. Unknown or inaccessible
  historical segments are excluded from duration samples.
- Age measures open tasks' current status from its actual captured entry or
  restoration. A baseline does not establish entry time; those tasks remain in
  the unknown-age bucket until a real transition establishes it.
- Daily WIP uses the captured status/archive state immediately before each local
  day end. Today's row is partial; future rows have no WIP value. Unknown state
  coverage is a separate series. Archived tasks excluded by today's cohort are
  not retroactively included in historical WIP: this is the current cohort's
  observed history, not a historical full-workspace inventory.
- Workload counts each open task's complete estimate once in its planned start
  week, including missing-estimate counts. Start dates are planning calendar
  dates; unscheduled work has its own group. Estimates are not apportioned over
  multiple weeks, and no remaining effort or capacity forecast is inferred.
- Project progress groups tasks by their current accessible project; private or
  unavailable project metadata merges into a neutral group. Estimated/actual
  task effort totals are not weekly time entries and are not assigned guessed
  dates based on task creation or target date.

Historical team visibility is checked on both sides of a captured transition.
A visible completion may count as observed throughput while its incomplete or
restricted earlier episode contributes no duration sample. No private project
name is revealed through a readable task's report grouping.

## API and pagination

POST `/api/v1/reports/workflow` takes `workspaceId` plus a body containing
`fromDate`, `toDate`, `timezone`, `weekStart` and `selection`. It returns the
summary, flow samples, aging, reopen counts, daily series and current status
distribution. Status groups are bounded at 1000; a larger result asks the caller
to narrow filters, rather than truncating the report silently.

POST `/reports/workload`, `/reports/projects` and `/reports/changes` use the same
body with bounded `limit` and signed `cursor` query parameters. Cursors bind the
actor, workspace, operation and all report filters. Day drilldown uses a one-day
range and pages created/completed/reopened events with current task links.
Reads are live across requests; refreshing or changing filters resets paging.
The dashboard never downloads only the first task page and treats it as a total.

## Local evidence and deployment

Controlled PostgreSQL fixtures cover 153 readable tasks, 150 inaccessible tasks,
baseline completions, real reopen episodes, missing status age, 105 workload
groups and 151 project groups. Tests verify known elapsed durations, historical
team revocation, private project redaction, cursor binding and day boundaries
across daylight saving time. Browser evidence is recorded separately in the
implementation tracker. This module uses the committed lifecycle migration and
requires no direct production DDL. It has not been deployed to CT107.
