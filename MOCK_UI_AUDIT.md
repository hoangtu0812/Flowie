# Flowie mock-data and UI fidelity audit

Last updated: 2026-08-24  
Baseline: `upstream/master` (`ln-dev7/circle`)  
Implementation: `apps/web`

## Rules

1. The matching file in `upstream/master` is the visual/interaction baseline.
2. Entity records, dates, users, teams, projects, issues, and successful mutations must come from Flowie APIs/database.
3. Stable icons, colors, enum labels, and TypeScript shapes may temporarily remain presentation-only.
4. Loading, error, empty, permission, and unavailable states may be added with the smallest possible UI change.
5. A backend migration must not replace an original layout with a new page/component.

## Current audit

| Source group | Runtime use | Classification | Required action |
| --- | --- | --- | --- |
| Issue records (`mock-data/issues`) | Active screens import `Issue` plus `sortIssuesByPriority`/`groupIssuesByStatus`; records themselves are loaded by `useIssuesStore` from API | `migrated` + `type/presentation-only` | Move shared types/helpers out of `mock-data` later; do not alter the original Issue layout |
| Issue statuses (`mock-data/status`) | API statuses are mapped into Circle's `Status` shape; icons/colors are presentation | `migrated` + `presentation-only` | Keep API IDs/names/categories; match Circle icons by API name/category and never enumerate mock records as data |
| Priorities (`mock-data/priorities`) | Static priority enum labels/icons used by Issue and Project controls | `presentation-only` | Keep until moved to a domain presentation module; mutations already use API |
| Labels (`mock-data/labels`) | Type shape only | `migrated` + `type-only` | Move type later; labels come from API |
| Users (`mock-data/users`) | Mostly type shape; canned users remain only in inactive Agent source | `migrated` / `inactive mock source` | Active selectors must use workspace members; remove canned Agent dependency when that source is retired or implemented |
| Teams (`mock-data/teams`) | Canned records remain only in unreferenced tooltip source | `inactive mock source` | Do not render; Initiative/Team UI must use API team relations |
| Cycles (`mock-data/cycles`) | Type and date/status formatting helpers; records come from Cycle/Issue APIs | `migrated` + `type/presentation-only` | Move type/helpers later without changing Cycle UI |
| Projects (`mock-data/projects`) | `Project` type plus health presentation list; records come from Projects API | `migrated` + `type/presentation-only` | Labels/statuses/templates are persisted; Project updates settings now shows the real workspace update feed |
| Initiatives (`mock-data/initiatives`) | List/detail, owner/team/health breakdowns, project progress and mutations use Portfolio/Project APIs; priority/health/status metadata is presentation-only | `migrated` | Preserve the restored upstream layout; progress history stays explicitly empty until persisted snapshots exist |
| Views | Saved Views and filters use API/store records | `migrated` | Preserve upstream View layout; no mock status list |
| Inbox | Active Inbox uses Notifications API | `migrated` | Keep snooze unavailable until scheduler/state exists |
| Agent (`mock-data/agent`, canned users, `agent-chat-store`) | Direct Agent page is unavailable; old chat source is not rendered | `unavailable` + `inactive mock source` | Never re-enable until an AI backend exists; remove/isolated source must not affect current UI |
| Reviews (`mock-data/reviews`) | Direct Reviews/Review routes are unavailable; old review components are not rendered | `unavailable` + `inactive mock source` | Never show canned reviews; retain original navigation placement only |
| Sidebar navigation (`mock-data/side-bar-nav`) | Static menu definitions, not entity records | `presentation/navigation-only` | Preserve upstream order, labels, spacing and disabled state |
| `status-utils.tsx` | No active caller after API status selector migration | `dead presentation helper` | Remove after production build confirms no caller |
| Legacy member/team tooltip files | No active caller | `dead mock-shaped source` | Do not reintroduce; replace with live relation props if upstream UI requires them |

## UI fidelity findings

- `AllIssues`, `GroupedIssuesView`, `IssueLine`, `MainLayout`, and the active sidebar structure are still derived from their matching upstream Circle components.
- The sidebar advertising/footer block was intentionally removed by user request and must stay removed.
- The light screenshot is consistent with the persisted `system/light` theme; theme logic and CSS variables match upstream except for additive Flowie preference/loading rules.
- The Issue status visuals did drift: API statuses used generic Lucide icons and the original ID lookup could not match database CUIDs. The adapter must preserve API records while selecting Circle's presentation icon by API name/category.
- Initiative list/detail and both right-side panels have been restored from the upstream component structure. Create/edit/archive/link/unlink use API data; the former deterministic fake progress series has been removed.
- Every future migration must include a direct `upstream/master:<path>` versus `apps/web/<path>` comparison before editing.

## Execution order

1. Close active record-mock leaks and UI-fidelity defects found above.
2. Initiative: restore/audit original components, connect only to Portfolio/Project APIs.
3. Project settings: implement persisted contracts or show unavailable; preserve original settings layout.
4. Run the audit again and update this file after each coherent slice.
