# Changelog

All notable changes to Flowie are documented here.

Each released section is headed by its version and the moment it went to
production: `## [x.y.z] — YYYY-MM-DD HH:MM +07`. The Help menu in the app reads
this file at build time, so the topmost released section is exactly what users
see under "What's new" — a release that is not written down here is a release
nobody can identify. Work that has not shipped yet stays under Unreleased.

## Unreleased

## [0.3.2] — 2026-08-26 23:59 +07

### Added

- A project row on the Projects timeline opens to show its issues on the same
  scale: click the arrow and each issue appears as a bar from the day it was
  opened to the day it is due, indented under the project. Issues are fetched
  the first time a project is opened and kept afterwards.

### Changed

- The Project timeline is drawn with the same scale rendering as the Projects
  and Initiative timelines: month names over a row of date ticks rather than
  both crammed into one band, month grid lines behind the rows, the today pill
  pinned to the scale above a full-height marker, and the issue list overlaying
  the grid instead of sitting in a column beside it.

## [0.3.1] — 2026-08-26 23:41 +07

### Added

- The deploy reclaims disk once the release is verified: dangling images go,
  and the build cache is capped so it cannot grow without bound while keeping
  the Python wheel cache that makes a rebuild fast. Volumes are never touched.

### Fixed

- Container networks declare an MTU (default 1400) instead of assuming 1500.
  The uplink's path MTU is 1492, so full-size packets were dropped and large
  transfers stalled — package downloads crawling at a few kB/s and TLS reads
  timing out. A daemon-wide setting does not reach a Compose network, so it is
  declared in the compose file too.
- The deploy no longer contacts GitHub twice for the same commit: `git pull`
  followed a `git fetch` that had already brought the ref down, and on this
  host's slow link the second round trip is what failed the release with an SSL
  timeout. The fetch is retried, gives up on a stalled transfer in a minute
  rather than five, and the checkout is now a local fast-forward.
- "Add sub-issues" on the issue page does something: the button had no handler
  and the list beneath it was built from the interface template's mock data.
  The component that creates and lists sub-issues against the API already
  existed — it was never mounted.

### Changed

- The workspace mark in the sidebar no longer paints a fixed orange square: a
  workspace icon sits on the same neutral tile as every other icon in the app,
  and initials take a colour derived from the workspace id so two workspaces
  are told apart.

## [0.3.0] — 2026-08-26 22:00 +07

### Added

- A Timeline tab on the Project screen: every issue as a bar from the day it
  was opened to the day it is due, grouped by status, on the same month scale
  the Projects timeline uses.
- A navigation progress bar, and a moving indicator on the screens that wait
  for their own data, so a slow request no longer reads as a frozen page.

### Removed

- The NestJS compatibility service is switched off. Every API path is served by
  the Python API, so the proxy that forwarded unported paths, its client, the
  readiness probe against it and the `api-legacy` container are all gone.

### Changed

- The members directory (`GET /users`, `GET /users/:id`) is served by Python,
  which was the last path the web still reached through the proxy.
- Four more API groups are served by Python instead of being proxied to the
  Node facade: the project issue list, reading a single issue, issue emoji
  reactions, notification preferences and the whole platform admin console.
  Nine legacy endpoints remain, none of which the web calls today.
- Discord notifications are embeds instead of one grey line: who acted, the
  issue code and title, a link straight to the item, the values that moved
  (`Todo → In Progress`), and the comment or project update itself. The link
  needs `APP_URL` on the API container, now wired through docker-compose.
- Issue property edits (title, priority, project, due date, estimate,
  description) are reported as `issue.updated`; a status change carries the
  rest of the same save, so one edit is one notification.
- An issue can be filed into a project from its detail panel; the Project
  section used to appear only once the issue already had one.
- Creating an issue from a project screen files it in that project by default.
- The issue breadcrumb returns to the team's issue list rather than the team
  overview.

### Fixed

- Issue rows on the Project screens showed the same priority icon for every
  issue: the API answers with the enum casing (`NONE`, `HIGH`) while the icon
  table is keyed in lower case, so every lookup missed and fell back.
- Adding an emoji reaction never worked: the interface posts the emoji in the
  path, which the Node service did not route. The Python API implements what
  the interface calls.
- A slow PyPI read no longer fails the whole production deploy: the Python
  image keeps a wheel cache between builds and gives pip a longer timeout with
  retries, and the deploy retries the image build before giving up.
- Discord notifications stopped arriving once they became embeds: the actor's
  avatar is stored as an app-relative path, and Discord rejects an entire embed
  whose `icon_url` or `url` is not absolute — answering 4xx, which was
  swallowed. Non-absolute links are dropped, the title, author and field values
  are cut to Discord's limits, and a refused delivery is logged instead of
  vanishing. The Discord "Send test" button reports what Discord answered.
- Editing any issue property announced a status change to Discord even when
  the status had not moved: the notification batch was built regardless of the
  condition and only the Inbox rows were skipped.
- The Project detail tabs refresh when an issue is created or edited elsewhere
  — the command palette, a context menu, an inline status picker — instead of
  showing a stale list until the page is reloaded by hand.

## [0.2.1] — 2026-08-26 20:05 +07

### Changed

- The create-issue dialog names the team the issue will actually be filed
  under, and lets it be picked, instead of printing a fixed `CORE` badge left
  over from the interface template.

### Added

- The Help menu states the running release and links to it: version, release
  time and the first entries of the current section, all read from this file at
  build time.

### Fixed

- The root URL opens the signed-in user's own workspace instead of redirecting
  to a workspace and team that only exist in the interface template.
- Opening the due date or reminder picker from an issue's context menu left the
  page unresponsive — the browser's own menu on right click, no clicks landing
  anywhere. Both dialogs were rendered inside the context menu, so the two modal
  layers fought over `document.body` when the menu unmounted underneath them.
  They now use the shared issue action dialog, which lives outside the menu.

## [0.2.0] — 2026-08-26 19:41 +07

### Added

- Durable Inbox events for issue creation, assignment, status changes,
  comments, project property changes and project updates.
- Authenticated WebSocket delivery for real-time Inbox updates and sidebar
  unread counts.
- Discord webhook delivery for supported workspace events and optional
  Flowie bot channel broadcasting.
- Flowie-branded Help links to the product, project repository and changelog.
- Team settings can rename the issue prefix; existing issues of the team are
  renumbered to the new code and Inbox links follow them.
- Initiative properties are editable from the inline row, not only from the
  aside that hides on narrow windows.

### Changed

- Discord integration configuration is now served by the Python/FastAPI API.
- The issue page header carries a working actions menu (rename, due date, move,
  subscribe, copy link, delete) and a favourite toggle; deleting an issue was
  previously only reachable by right-clicking a list row.
- The issues list view has a column header, and each row lays its properties
  out in fixed columns: Created and Due date are now separate labelled columns
  instead of one unlabelled date.
- The issue assignee picker lists live workspace members and persists the
  choice; it no longer offers a mock roster.
- The issue description is the stored one and is editable in place.
- Issue labels are editable from the issue detail panel, and the context-menu
  due date opens a date picker instead of jumping seven days ahead.
- Initiative dialogs render status, priority, owner, label, project and health
  options with their icons.

### Fixed

- Opening an issue URL directly — a refresh, an Inbox entry, a Discord link —
  loads the issue instead of reporting it as not found, and shows a loading
  state while it arrives.
- The legacy API container now receives the shared `AUTH_JWT_SECRET`, so the
  paths the Python API still proxies (such as the project issue list) accept the
  session cookie instead of answering 401.
- Project detail pages name the request that failed instead of reporting a
  single generic "Could not load project details." message.

## [0.1.0] — 2026-08-25 00:00 +07

### Added

- Native Python APIs for workspaces, teams, documents, cycles, projects,
  initiatives, issues and profile management.
- Docker deployment and GitHub Actions deployment workflow for the self-hosted
  production environment.
