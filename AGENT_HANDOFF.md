# Flowie — Agent Handoff

Last updated: 2026-08-23

## Immutable objective

Build Flowie from the original Circle frontend UI. Preserve its navigation, page hierarchy, visual layout, and interaction patterns. Replace mock data with real backend/API data and implement missing backend behavior gradually. Do **not** redesign a page merely to make implementation easier.

The product is a general project-management system, not a code-review product. Code reviews, Slack, desktop/mobile notifications, and email delivery are intentionally not active. Discord is the supported outbound notification integration.

## Scope and success criteria

### Current product objective (authoritative)

Turn the original `ln-dev7/circle` frontend into a self-hosted Flowie project-management application. The primary work is to connect the existing Circle screens to a real API and database, progressively replacing mock records without changing the original product's visual identity.

The application must support real authenticated users, workspaces, teams, projects, issues, cycles, documents, initiatives, notifications, and Discord integration. It must work from the existing Docker images on an internal network without downloading anything at each startup.

### Explicitly out of scope for the current implementation pass

- Code review / pull-request workflow.
- Slack, email, desktop, and mobile notification delivery.
- Fake desktop or mobile clients, fake sessions, passkeys, API keys, connected accounts, or status records.
- A UI redesign or replacing Circle navigation/layout with new pages.
- External SSO, webhooks, automation, AI, advanced analytics, and enterprise security features until the core screens use real data.

### Definition of success for the current pass

1. A user can use the original UI to create and manage the core project-management data persisted in PostgreSQL.
2. Every migrated screen has real loading, empty, and error states; mutations survive refresh and do not pretend to work locally.
3. A screen whose backend has not been implemented stays in its original location but clearly says that the capability is unavailable; it must not show fabricated records.
4. Production UI code has no imports of mock *records* for a migrated module. Presentation-only icon/color mappings may remain temporarily, documented in the mock audit.
5. Each completed vertical slice is verified, committed, pushed, and recorded here.

## Non-negotiable user requirements

- Preserve the original UI; only add UI where a missing real action needs a control.
- Never present a mock action as if it saves real data.
- Commit and push each coherent completed feature group to the user repository.
- Normal internal-network startup must never install packages, pull images, or build images.
- Before any dependency download, image pull, or intentional rebuild, tell the user to switch to 5G.
- Do not use destructive Git recovery commands (`reset --hard`, `checkout --`, etc.). The worktree can contain user changes.

## Repository and runtime

- Workspace: `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\Flowie`
- Branch: `codex/foundation`
- Remote: `https://github.com/hoangtu0812/Flowie.git`
- Stack: Next.js 15 frontend, NestJS API, Prisma/PostgreSQL, Redis, MinIO, worker.
- API prefix: `http://localhost:4000/api/v1`
- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/v1/health`

### Safe local startup (no network / no install)

```powershell
.\scripts\start-local.ps1
```

This only starts existing images with `docker compose --no-build --pull never`.

### Intentional rebuild (requires 5G permission)

```powershell
pnpm docker:build
docker compose --profile app up -d --no-build --pull never --force-recreate api web
```

The API image runs `prisma migrate deploy` on startup, so committed migrations are applied automatically after the API image is rebuilt.

## Current verified progress

The following commits are pushed to `origin/codex/foundation` and their relevant Docker images have been built/run successfully unless noted otherwise.

| Commit | Delivered group |
| --- | --- |
| `8e7da47` | Restored original Circle workspace interface and removed promotional sidebar card. |
| `3a037d2` | Original Teams index connected to API. |
| `2cfa826` | Profile settings uses API. |
| `6908e01` | Real project leads and issue progress. |
| `972277d` | Discord workspace notification integration. |
| `f4aeb7b` | Unsupported code/review and account integrations honestly disabled. |
| `8248e74` / `1eb6285` | Original project list and project creation connected to API. |
| `498afe9` | Original Issues UI, issue options, create/update fields, sidebar teams connected to API. |
| `d6a2d70` / `9d42210` | Cycle timeline, cycle views, and headers use live API data. |
| `930ab52` / `d025049` / `23b9de2` / `26431bf` | Project header, Overview, Issues, and Activity tabs use live data. |
| `04ba864` | Team Overview/Members/Documents use API; create team member and document actions are real. Team API now selects safe user fields only. |
| `7f3c694` | Members and Profile use workspace member API; profile Assigned/Created uses real issue assignee/creator. |
| `f64147b` | Saved Views use API, create action persists, and issue/project filtering runs against live stores. |
| `cf16225` | Initiatives use live API for list, creation, detail, owner/properties, and linking existing projects. Prisma migration `20260822130000_initiative_properties` was applied successfully; API and web health checks return HTTP 200. |
| `a3461d4` | Original two-pane Inbox uses live notification API and unread badge; mark-read and all three existing delete actions persist through the backend. New notification payloads record the actor safely. Docker API/web build and runtime verification passed. |
| `83ef453` | My issues tabs use the authenticated user and live issue data. Assigned/Created, Subscribed, and Activity now use real assignee/creator, subscription, and activity records. Migration `20260823010000_issue_subscriptions` was applied successfully; subscription endpoints are available and creators/assignees are subscribed automatically. |
| `4e1c9a7` | Shared issue filter UI uses statuses, members, labels, projects, and cycles returned by `GET /issues/options`; no filter option records come from mock data. Docker API/web build and runtime route verification passed. |
| `7aa709a` | Original Issue labels table uses Labels API for live records, counts, descriptions, dates, filter, and create/edit/delete dialogs. Label groups remain visibly disabled because there is no group schema/API. Frontend Docker runtime verification passed. |
| `40b8239` | Notifications, Security & access, and Issue templates no longer show invented enabled channels, sessions, API keys, devices, or templates. Only inbox/Discord capabilities are represented as active; unavailable services are explicitly disabled. Frontend Docker verification passed. |
| `33fbdc2` | Original Project statuses settings now loads real projects through the workspace and Projects APIs, groups/counts actual persisted status values, and has loading/error states. The original add-status affordances stay visibly disabled because no project-status configuration API exists. Frontend build and Docker route verification passed. |
| `6cce1ff` | Original Project templates settings page now lists, filters, and creates persisted templates through the Project Templates API while retaining the original Settings title/filter/empty-state structure. The redundant non-original template component was removed. Frontend build and Docker route verification passed. |
| `a96a42b` | Preferences now persists and applies default home view, font size, pointer cursors, and link underlining in the browser. Existing theme/sidebar settings remain functional. Unsupported display/date/comment/desktop/automation controls are visibly unavailable instead of fake switches. Frontend build and Docker route verification passed. |
| `d6524a4` | All remaining shared Settings placeholders retain their original layout but now disable filter/create actions and identify missing configuration services instead of presenting fake writes. The unused Project templates placeholder config was removed. Frontend build and Docker checks of SLA/Documents Settings routes passed. |
| `54252b7` | Original Issue detail Activity now loads persisted comments/events, creates comments through the API, and subscribes/unsubscribes through real endpoints. Comment-created activity events are de-duplicated against the comment card. Composer attachments/reactions are not simulated. Frontend build, Docker route/API-auth checks, and the existing API test suite (2/2) passed. |
| `dfd0496` | Original Issue detail, right properties panel, assignee picker, and issue header now derive their data from the live Issues store/API. Persisted status/priority/assignee selectors remain available; mock description, team, cycle, milestone, relation, PR, and sub-issue records were removed. Reactions, sub-issues, and the original-layout attachment action are explicitly unavailable until their contracts are implemented. Frontend build and Docker route verification passed. |

### Capability status at the handoff point

| Area | Status | Practical state |
| --- | --- | --- |
| Runtime, Docker, DB | Implemented | Existing images run offline through `scripts/start-local.ps1`; PostgreSQL, Redis, MinIO, API, web, and worker are composed together. |
| Authentication and workspace access | Implemented baseline | Login/session/workspace resolution are real. OAuth, email verification, password reset, and enterprise SSO are deferred. |
| Teams and members | Implemented baseline | Original Teams, team overview, team members, and workspace members use API data; team/member creation actions covered by the migrated screens persist. |
| Projects | Implemented baseline | Original project list, creation, lead, issue progress, overview, issues, activity, and project header use API data. Project settings still need their final audit. |
| Issues, labels, cycles, saved views | Implemented baseline | Original issues list/filter options, My issues scopes, labels CRUD, cycles/timeline, subscriptions, and saved views use API data. Original Issue detail, Activity/Comments/Subscribe, properties and assignee changes are live. Attachments, label editing, sub-issues, reactions, and relations remain deferred. |
| Initiatives and documents | Implemented baseline | Initiative list/detail/create/linking and team documents are live. Advanced relationships/workflows remain deferred. |
| Inbox and Discord | Implemented baseline | Inbox persists notifications/read/delete and workspace Discord integration exists. No fake delivery channels are enabled. |
| Settings | Audited baseline | Profile, issue labels, project statuses, project templates, and actionable browser-local preferences are live. Unsupported Notification, Security, Issue templates, desktop and issue-automation preferences are truthful. Generic configuration placeholders are visibly unavailable. Template application/editing is deferred because the API currently provides list/create only. |
| Admin / RBAC / audit | Partial or deferred | Do not advertise as complete. Any current admin controls require a separate permissions, audit, and UX audit before production claims. |

## Exact restart point

The next agent should start with **Core issue collaboration → original issue attachments**. The backend Attachment API is implemented (upload/list/download), but the original Issue detail Paperclip action is deliberately disabled until it has a live original-layout implementation:

`apps/web/components/common/issues/details/issue-details.tsx`

Preferred next vertical slice:

1. Inspect `attachments.controller.ts` / `attachments.service.ts` and preserve their workspace/entity authorization contract.
2. Turn the existing Paperclip affordance into a file picker/upload action in the original layout; render a concise list of persisted attachment records beneath the description or activity without redesigning the page.
3. Support download through the existing protected endpoint. Include upload/loading/error/empty states and the 10 MB server limit in client feedback.
4. Do not add comment attachment support or fake reactions; those require a distinct entity/contract decision.
5. Add appropriate API tests for tenant isolation/mutations when backend behavior changes.
6. Build and, only with the user on 5G, rebuild/recreate the API/web image(s), verify routes, commit/push, and record the remaining detail blocks.

This is a backend/API integration priority, not a UI redesign task.

## Execution plan from this handoff

Work only one coherent vertical slice at a time. Preserve the original UI and close the corresponding mock imports before advancing.

### Phase A — Make every existing settings page truthful (current priority)

1. **Project statuses** — live project-derived groups; no imaginary configuration actions.
2. **Project templates** — use existing template API only after adapting it into the original settings layout; otherwise mark unavailable.
3. **Preferences** — retain real client preferences; disable desktop-only and server-side preferences that cannot persist. Do not display defaults as account settings if they are only mock state.
4. **Remaining settings placeholders** — inspect one screen at a time. Wire a ready API or show an explicit unavailable state. Never add demo content.

Exit criteria: every Settings menu item is either connected to a real persisted capability, an honest read-only capability, or explicitly unavailable.

### Phase B — Core issue collaboration

1. Finish the original issue-detail data source and convert the remaining mock payload to API data.
2. Connect comment composer, edit/delete where API support exists, mentions if the contract supports them, and attachments.
3. Render server-created activity, add visible subscribe/unsubscribe action, and ensure all mutation/error/empty states are real.
4. Add/extend backend tests around authorization and tenant isolation before declaring the collaboration slice complete.

Exit criteria: the core issue workflow can be performed without mock records or browser-only fake mutations.

### Phase C — Navigation, command palette, and shared utilities

1. Audit command palette/sidebar/search imports of team/project/user mock data.
2. Reuse existing live loaders (`team-types.ts`, issue store, workspace members) rather than creating a parallel mocked store.
3. Add server search only when the existing UI requires real cross-entity search; otherwise show an honest unavailable state.

Exit criteria: navigation utilities no longer enumerate fictional entities.

### Phase D — Systematic mock-data audit

Run:

```powershell
rg -l "@/mock-data|mock-data/" apps/web --glob '*.{ts,tsx}'
```

For every match, add it to a short audit table in this document with one of:

- `migrated`: replace record imports with API/store data;
- `presentation-only`: retain temporary icon/color/type mapping, with no entities/dates/users;
- `unavailable`: keep the original screen and explicitly disable it;
- `deferred`: describe missing API/schema and the next vertical slice.

Do not call the product “mock-free” based on the raw import count. It is mock-free only after every record source has been classified and migrated or removed.

#### Settings-placeholder classification (2026-08-23)

| Route group | Classification | Reason / follow-up |
| --- | --- | --- |
| SLAs | `unavailable` | No SLA schema or configuration API. |
| Project labels | `unavailable` | No project-label schema/API (Issue labels are live separately). |
| Project updates | `unavailable` | No project-update configuration service. |
| Customer requests | `unavailable` | No customer-request schema/API. |
| Releases | `unavailable` | No release schema/API. |
| Pulse | `unavailable` | No pulse feed/settings model. |
| Asks | `unavailable` | No Ask schema/API. |
| Emojis | `unavailable` | No custom emoji storage/upload API. |
| Documents settings | `unavailable` | Documents content API exists, but no workspace document-configuration contract. |
| Initiatives settings | `unavailable` | Initiatives content API exists, but no workspace initiative-configuration contract. |

The shared placeholder has disabled filter/action controls and an explicit unavailable message. These routes must be reclassified to `migrated` only after their configuration-specific backend contract is implemented.

### Later phases (not current blocking work)

1. Admin/RBAC/audit log: design permissions enforced in the API before exposing administrative promises.
2. Auth hardening: session management, reset/verification flow, OAuth/OIDC only after product requirements and mail provider decisions exist.
3. Export/import, webhook, automation, analytics, then AI: each needs a discrete approved design and backend contract.

## Technical conventions established

- Frontend API base: `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'`.
- Every authenticated browser fetch uses `credentials: 'include'`.
- Resolve the current workspace through `GET /workspaces/me`; do not hardcode workspace IDs.
- Sidebar team URLs use `identifier`, whereas most API mutation routes need database `id`. Live hooks resolve either form before calling API.
- Keep API user selections explicit (`id`, `name`, `email` only where needed, `avatarUrl`, etc.); never include Prisma `user: true` in a response.
- Avoid repeated “mock-shaped” values. A UI fallback such as an icon for an entity type is acceptable presentation; fake records, fake dates, fake owners, and fake write operations are not.

## Existing known limitations

- Frontend lint fails at a pre-existing unrelated rule in `apps/web/store/issues-store.ts` (`react/display-name`, around line 128). Builds have passed type checking. Fix separately rather than hiding it.
- The frontend Docker build occasionally prints `socket hang up` while Next.js retries its browser-list data request. It has completed successfully from cached dependencies; do not add a network-dependent install to normal startup.
- Some original UI modules still import mock files for stable display metadata (icons/status color maps) mixed with mock records. The audit above must separate these before removing types or presentation mappings.
- The original Inbox's snoozed filter is disabled because no snooze state or scheduling model exists yet. It deliberately does not simulate a local-only feature.

## Agent operating checklist

### Before writing code

1. Read this file, `implement_plan.md`, and run `git status --short`.
2. Treat uncommitted changes as user work until proven otherwise; do not discard them.
3. Inspect both the original UI component and its existing API/schema before choosing the slice.
4. Confirm whether the desired action is already supported by a real endpoint. If not, choose between an API/migration vertical slice or an explicitly unavailable state; never fabricate a client-only save.

### While implementing

1. Keep the original component/layout; make the smallest possible visual addition for a real missing action.
2. Resolve workspace/user from the live API—never hardcode IDs or mock identities.
3. Include loading, empty, error, and authorization handling in the same slice.
4. Use `apply_patch` for source edits. Do not overwrite files through shell redirection.
5. Tell the user in Vietnamese before any lengthy operation. Before an intentional package/image download or Docker build, ask them to switch to 5G.

### Before handoff / ending a slice

1. Run the relevant unit/build checks. Current minimum is the web build for UI work, plus API tests when API behavior changes.
2. For a Docker rebuild, rebuild only the changed service(s), recreate with `--no-build --pull never`, and verify health/routes. Normal startup must remain offline.
3. Run `git diff --check` and inspect `git status --short`.
4. Commit and push the coherent feature group to `origin/codex/foundation`.
5. Update this document: commit hash, user-visible behavior, verification, known limitation, and exact next step. Commit/push documentation separately when practical.

### Claims that require evidence

- “Live” means a real API/database read or write has been verified, not just an endpoint being present.
- “Complete” means the module meets the current definition of success and has no known fake data/actions in its migrated UI.
- “Docker verified” means the relevant image was rebuilt/recreated and a health or route check was performed.
- Do not claim lint passes: the known unrelated lint failure remains until explicitly fixed.

## Handoff protocol

1. Read this file and inspect `git status --short` first.
2. Continue from the first remaining backlog item; all work listed in the verified-progress table is committed and pushed.
3. Send concise Vietnamese commentary before tool work and at least every 60 seconds during lengthy builds.
4. Use `apply_patch` for edits; never write source files via shell redirection.
5. Build and run Docker only at a coherent feature milestone. Commit/push only after verification.
6. Keep the active objective unchanged: **original UI + real backend implementation, progressively removing mock data**.
