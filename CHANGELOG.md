# Changelog

All notable changes to Flowie are documented here.

Each released section is headed by its version and the moment it went to
production: `## [x.y.z] — YYYY-MM-DD HH:MM +07`. The Help menu in the app reads
this file at build time, so the topmost released section is exactly what users
see under "What's new" — a release that is not written down here is a release
nobody can identify. Work that has not shipped yet stays under Unreleased.

## Unreleased

## [0.4.0] — 2026-09-01 10:59 +07

### Changed

- The Admin Panel now uses the same responsive sidebar, compact header,
  dashboard cards, tables, spacing, theme controls, and navigation behavior as
  the rest of the Flowie workspace instead of a separate control-center UI.
- The login screen now offers Microsoft sign-in when Entra is configured,
  environment administrators can open the Admin Panel from the workspace
  switcher, and Microsoft-managed profiles clearly disable name and avatar
  editing while keeping personal title and username fields available.
- Reviews webhook processing now renews expiring GitHub installation and Azure
  workload tokens during long synchronizations, uses reclaimable processing
  leases, and clears raw provider payloads after processing or terminal
  failure. A production runbook documents least-privilege provider setup,
  identity and team boundaries, recovery, and the CT107 deployment checklist.
- Page-level loading states now use the animated Flowie mark and an accessible
  indeterminate progress bar instead of a text label paired with a generic
  spinner. The shared treatment covers workspace navigation, issue, project,
  initiative, cycle, team, view, and dashboard loading screens.

### Added

- A Microsoft Entra login runbook now documents the single-tenant app
  registration, least-privilege Graph permission, CT107 environment values,
  identity/profile invariants, secret rotation, and production verification.
- Users can now sign in with a single-tenant Microsoft Entra ID application.
  Flowie uses the authorization-code flow with PKCE, identifies accounts by
  immutable tenant and object IDs, synchronizes display names and profile
  photos from Microsoft Graph, and treats those profile fields as
  organization-managed. Platform administrator access is now sourced from
  the case-insensitive `ADMIN_EMAIL` production setting.
- The Reviews sidebar is now active and presents GitHub and Azure DevOps work
  together on one screen with provider filters, assigned/created views,
  revision unread markers, reviewer decisions, external-provider handoff, and
  same-team Issue linking. Workspace Code & reviews settings now manages both
  provider connections, repository-to-team access mapping, synchronization,
  and provider identity mapping without exposing saved credentials.
- Reviews now exposes one provider-neutral API for assigned, created, and
  team-visible reviews from both GitHub and Azure DevOps. It includes revision
  unread state, reviewer decisions, Flowie-to-provider identity mapping,
  same-team Issue links, and in-app notifications for new assignments and
  revisions. Review access is constrained to active workspace administrators
  or members of the repository's explicitly mapped Flowie team.
- Workspace administrators can now configure GitHub App installations and
  Azure DevOps Microsoft Entra identities side by side, discover repositories,
  map each enabled repository to a Flowie team, and run read-only review sync.
  Provider credentials are encrypted, webhook deliveries are authenticated and
  deduplicated, and failed deliveries retry from a durable PostgreSQL queue.
  Production requires `SCM_SECRETS_ENCRYPTION_KEY`; GitHub additionally
  requires its App ID, private key, and webhook secret.
- Reviews now has a provider-neutral persistence and API contract foundation
  for connecting GitHub and Azure DevOps organizations to the same workspace.
  The schema keeps repository, external review, revision, reviewer, Issue-link,
  user-view, and webhook-delivery identities isolated by connection. This is
  an expand-only foundation: Reviews remains unavailable until read-only
  provider synchronization and access checks are enabled in a later change.
- Project Issues now includes AI scheduling. It sends open issue titles,
  descriptions, estimates, parent-child structure, and the project schedule to
  the enabled workspace provider, then presents validated start, target, and
  due dates for explicit review before any issue is changed.
- Members now display each user's current online state, a relative last-seen
  time, and the current display names of their teams. Presence is refreshed by
  an authenticated browser heartbeat; deployment requires the committed Prisma
  migration `20260828020000_user_presence` to complete before the API starts.
- Agent delivery insight tools now identify delayed and at-risk projects and
  initiatives from target dates and health, and list open issues inactive for
  at least 14 days. The tools are installed for existing and new workspaces,
  while workspace administrators can still remove them in Agent settings.

### Fixed

- Project Issue lists now respect the shared Show sub-issues display option,
  so a project's child issues are no longer silently omitted from that tab.
- Issue lists now retain aligned title and metadata columns when a project side
  panel narrows the viewport; wide column selections scroll horizontally rather
  than collapsing the title cell into adjacent headers.
- Agent now asks focused follow-up questions for bare project or issue creation
  requests and safely recovers when a provider wraps a valid plan in Markdown
  or otherwise returns an invalid plan format, instead of showing a raw error.

## [0.3.3] — 2026-08-28 00:18 +07

### Added

- The workspace Dashboard provides an interactive overview of accessible work
  across all projects or a selected project. It supports custom date ranges
  and one-week, month, quarter, and year presets; daily created/done trends,
  status, project throughput, workload in mandays, and focused issue drill-ins
  respond to its filters.
- Issues now record estimated and actual effort in fractional mandays. Both
  values are editable from the issue properties panel, shown as dedicated
  columns beside the planned issue window in lists, and preserved when the database
  migration promotes existing whole-day estimates.
- Issues now support independent Start date and Target end date schedule
  boundaries in addition to their existing Due date. The issue detail sidebar
  provides a two-date editor for the work window and a separate clickable due
  date; deployment requires the committed Prisma migration
  `20260827230000_issue_schedule_dates` to finish before the API starts.
- The web application now includes the Astryx Design core, neutral theme,
  StyleX, and CLI foundations. Its generated agent conventions are committed
  with the application to guide future Astryx-based UI work.
- `Write with Agent` on the project Activity composer drafts an update or a
  comment from the project's own record — status, health, lead, target date,
  issue progress, open issues, milestones, and the last few updates. Anything
  already typed is used as the angle to write from. The draft is placed in the
  composer for the author to edit; nothing is posted automatically. Requires an
  enabled OpenAI or Google provider in Agent personalization.
- Descriptions and issue comments accept an image pasted from the clipboard.
  The screenshot is uploaded as an issue attachment and embedded where the
  caret was; embedded images are fetched with the session so private
  attachments stay private. The `Show sub-issues` display option now takes
  effect on the issue lists instead of being inert.
- Issue details now expose an editable due date and a Cycle selector. Cycles
  are intentional team-scoped planning containers; adding an issue to one is
  always a user action and is never assigned automatically.
- Users can create, edit, and remove personal Agent skills with their own
  default instructions. Skills follow the user between workspaces; shared
  workspace tools remain separately managed by workspace owners and admins.
- Agent personalization now exposes workspace-scoped analytical tools and
  personal skills. Workspace owners and administrators can install or remove
  supported tools; each user can install the Issue defaults skill to apply a
  preferred priority and due-date offset to their own proposed issues.
- Agent can answer counts of accessible issues, issue status and assignee
  breakdowns, plus project and cycle progress when the corresponding workspace
  tool is installed.
- Agent now streams concrete workflow progress in chat, including source-file
  reading, workspace and insight queries, provider calls, validation, and
  conversation saving. Completed steps stack under the active `thinking-orbs`
  indicator; no plan is created while it is running.
- Agent can answer the first read-only workspace insight: the current count of
  overdue issues, scoped to teams the requester can access. Insight queries do
  not create a proposal or require approval, and their capability registry is
  designed for additional reports.
- Local account registration requires a time-limited Discord OTP before a user
  and workspace are created. The private registration channel is provisioned by
  the configured Flowie bot and OTP material is stored only as a hash.
- The Agent workspace is available again as a UI preview so its conversation,
  skills, example prompts, and chat-history presentation can be reviewed before
  agent workflows are planned.
- Workspace owners and administrators can configure one active OpenAI or Google
  provider for Agent, including its endpoint and model. Agent now persists
  conversations, reads Markdown, DOCX, and XLSX source files, drafts project
  and issue plans, and creates those records only after the proposal is
  explicitly accepted.

### Changed

- Project and initiative timelines now open at Week zoom, centered on today;
  the Year, Quarter, and Month zoom controls remain available.
- Cycle status now reconciles from its Start and End dates whenever a team
  cycle view is loaded: a started cycle is Current, a future cycle is Upcoming,
  and a passed end date is Completed. Each cycle row now exposes an editor for
  its schedule, so correcting dates immediately corrects its computed state.
- Issue lists now present Start date, Target end date, estimated effort, and
  actual effort as four separately configurable columns instead of combining
  dates and manday values into two cells.
- Agent capability and help questions now receive a normal reply in the
  requester's language instead of an empty proposal that cannot be accepted.
  Proposal cards appear only when Agent has drafted at least one project or
  issue for review.
- Initiative list rows now let workspace managers change an initiative's
  priority or owner directly, using the same persisted API update path as the
  initiative detail view. The list refreshes after a successful change and
  leaves the owner unassigned when selected explicitly.
- The application sidebar now follows the shell-side-nav layout with a wider
  header, separated navigation sections, footer boundary, and side rail while
  preserving Flowie workspace and team navigation.
- Priority icons carry their own colour — urgent red, high orange, medium
  amber, low blue — so a priority is read at a glance instead of by counting
  bars. "No priority" stays neutral and inherits the surrounding text colour.
- Project status, priority, lead and team dropdowns show the same icon or
  avatar the rest of the app uses for those values, as do the issue and
  destination-team pickers in the issue action dialog and the initiative owner
  picker in workspace settings.
- Personal Agent skills now expose a detail dialog before installation, showing
  their scope, behavior, and custom instructions when present.
- Timeline bars now show their label over status color; project bars also fill
  by their calculated completion percentage.
- Project timelines reserve the sub-issue expand column on every parent row,
  keeping issue identifiers and titles aligned when only some rows have child
  issues.
- Clicking an issue bar in either Project timeline now opens an in-place detail
  panel. Dated issue bars use their actual created-to-due span with a small
  readable minimum, rather than a project-sized minimum width.
- Sub-issues remain linked to their parent and are excluded from normal issue
  lists. Project timelines show only parent issues initially and reveal child
  issues from an expand control on the parent row.
- Agent planning runs as a LangGraph workflow with the active workspace
  provider. Follow-up messages revise the same proposal conversation; proposals
  requiring clarification cannot be accepted.
- A failed Agent provider request no longer becomes conversation context. A
  retry now drafts only from successful turns after the last accepted plan, so
  hidden failed prompts cannot be combined into duplicate issues.
- Production deployment now builds and runs a one-shot Prisma migration service
  before starting the FastAPI or worker containers. A migration failure blocks
  the new release instead of serving an API against an outdated schema.
- Repository operating and release rules now define CT107 as the single
  production environment, require a changelog entry in every commit, and
  require a verified deployment before a version tag is published.
- Issue lists retain their column header and show a loading indicator while the
  issue request is pending. Rows show one primary label and a compact count for
  any remaining labels.
- Failed production migrations now emit the migration container log directly in
  the deployment workflow, rather than only reporting a generic dependency
  exit status.
- The Prisma migration image installs OpenSSL explicitly so Prisma selects the
  supported engine instead of relying on an unavailable compatibility library.

### Security

- Workspace AI provider keys are encrypted before storage, excluded from all
  API responses, and require `AGENT_SECRETS_ENCRYPTION_KEY` on the API service.

### Fixed

- Docker application containers now resolve PostgreSQL, Redis, and MinIO
  through their configured `circle-*` container hostnames, preventing
  migrations and API dependencies from failing DNS lookups during startup.
- Returning to a tab left open for a long time no longer shows empty screens
  until a reload. Refresh tokens are single-use, and every request that met an
  expired access cookie spent the same one: the first succeeded and the rest
  were rejected against the session it had just revoked. A burst now shares one
  refresh attempt.
- Moving between sidebar destinations no longer rebuilds the whole interface.
  The workspace shell — sidebar, command palette, dialogs — was rendered by
  each page rather than by a route layout, so every navigation unmounted it and
  re-ran its workspace, team, and notification queries. It is now a `[orgId]`
  layout and stays mounted across navigation.
- Sub-issues are no longer missing from every issue list. The issue list query
  excluded any issue that had a parent, so a sub-issue never appeared under its
  team and opening it by identifier reported `Issue not found` — the detail
  page resolves an issue from that same list.
- The issue properties panel labels its dates and shows the created date next
  to the due date; a single unlabelled date field read as either one.
- A page that stops responding to clicks after a dialog closes recovers by
  itself. Overlapping modal layers can leave pointer events disabled on the
  document body, which previously required a reload; the next click or
  keypress now restores interaction when no modal is open.

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
