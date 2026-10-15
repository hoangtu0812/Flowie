# Notification entity access

Notification ownership alone is not authorization to read its task/project data.
Producers filter candidates through current active account/workspace membership
and entity access. Inbox list/read, snooze and delivery-status metadata use the
same predicate. Unsupported or missing entity references are excluded. Retained
records can become visible again after access is restored; underlying records
are not silently deleted when membership changes.

Tasks require their current team membership. Projects and documents allow active
workspace members for shared records and current membership for team records.
Archived records/teams and deleted comments are excluded. Review notifications
follow the existing SCM review policy, including its explicit workspace manager
access; they do not introduce a new bypass for project/task notifications.

The durable outbox checks each retained notification ID, owner and workspace
before publishing its queued realtime record. Database authorization failure
fails closed and uses the existing bounded outbox retry path. Snooze wake events
contain only record IDs/read state, not private content. Private email remains a
generic Inbox link and does not include task titles or bodies. Existing configured
workspace Discord integrations are a separate delivery policy; this change does
not claim to establish Discord channel membership from application team roles.

Shared assignee notifications use this producer, which also provides the access
dependency for SLA alerts being implemented. Tests cover an administrator outside
a private team, membership grant/revocation, previously retained Inbox records,
and revocation after staging but before queued realtime delivery.
