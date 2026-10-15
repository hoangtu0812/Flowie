# Account time and creation preferences

Account UI preferences now include an optional IANA timezone, week start
(Monday, Sunday or Saturday) and optional self-assignment for the create dialog.
The existing JSON preferences/version schema supports these additions without
another migration. Writes merge only explicitly supplied fields under the
existing version check, so an older cached client does not reset new settings.

An explicit timezone updates the account's operational timezone and takes
precedence over browser-reported timezone on subsequent password/Microsoft
sign-ins. Clearing it selects the current browser timezone for UI formatting;
the last recorded operational timezone remains until a later browser sign-in
supplies a new one. Aliases such as Asia/Saigon normalize to Asia/Ho_Chi_Minh.
Invalid zones are rejected before saving.

Shared calendars use the chosen week start and account language. The workflow
dashboard initializes its date range and workload week grouping from these
preferences; explicit report filters still apply to the current report. An
account preference update resets the report's initial scope rather than silently
mixing a newly displayed timezone with data calculated in the old one.

Self-assignment is a browser create-dialog default, off by default. It selects
the signed-in user only if the current team options include that member. The
current identity is fetched independently of cached preferences. Clearing or
choosing another assignee is preserved until submission. Team changes check the
new team's eligible members; Create more applies the default to the next fresh
form. MCP, recurring templates and duplicate/copy operations keep their explicit
assignee semantics.

The create dialog has one workspace-level owner. Sidebar and group controls
open that owner rather than mounting another dialog/focus trap. The assignee
selector and group creation buttons have explicit accessible names.

Formatting helpers distinguish calendar dates from instants: a date-only value
never moves to the previous day because of timezone conversion. Feature language
catalogs interpolate user content as values; user titles, names, descriptions,
comments, persisted status names and external error diagnostics remain original.
Browser and server regression results are recorded in the implementation tracker.
