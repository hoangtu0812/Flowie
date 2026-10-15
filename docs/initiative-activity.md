# Initiative Activity

Initiative Activity uses the centered content width and update-card rhythm of
Project Activity. Owners and administrators can post an update with health
from the inline composer; ordinary members can read updates and change history.
The API continues to enforce membership and administrator access on every write.

The Updates / Change history controls select independently paged endpoints.
The `history` query parameter preserves the chosen feed on reload. Dates and
month/year headings use the account locale and timezone; the same month in
different years stays separate. System events use readable action labels and
author avatars, and update text keeps line breaks and the shared inline formatting.

A failed post keeps the draft and health selection. A successful post clears
only the accepted draft, refreshes history and updates the local Overview cache
without unmounting the composer. Switching feed types preserves the draft.
Ctrl+Enter or Cmd+Enter submits through the same in-flight guard as the button.
Overview's See all control now opens Activity.

The implementation lives under `apps/web/features/initiatives/activity` with
separate composer, timeline, health presentation, date grouping and message
catalog modules. The initiative data hook supplies role visibility and accepted
update cache reconciliation. There are no schema, API or deployment configuration
changes, and no new comment, attachment or AI drafting endpoints in this change.

Browser regression coverage checks failed-post recovery, persisted updates,
Overview reconciliation, feed switching/reload, readonly membership, real cursor
pagination and mobile layout. A unit check covers month/year grouping across
UTC boundaries and account timezones.
