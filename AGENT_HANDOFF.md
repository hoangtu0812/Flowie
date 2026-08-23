# Flowie — Agent Handoff

Last updated: 2026-08-23

## Immutable objective

Build Flowie from the original Circle frontend UI. Preserve its navigation, page hierarchy, visual layout, and interaction patterns. Replace mock data with real backend/API data and implement missing backend behavior gradually. Do **not** redesign a page merely to make implementation easier.

The product is a general project-management system, not a code-review product. Code reviews, Slack, desktop/mobile notifications, and email delivery are intentionally not active. Discord is the supported outbound notification integration.

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

## Remaining implementation backlog

Prioritize by backend readiness and preserve original UI in every group.

1. **Settings** — complete the remaining audit. Issue labels are live; project templates/statuses, preferences, and generic placeholders must either use matching API data or be explicitly unavailable. Do not reintroduce invented rows/dates/devices/API keys.
2. **Command palette/sidebar utilities** — remove remaining mock team/project/user imports, using live loaders already present (`team-types.ts`, issue store, workspace members).
3. **Attachments/comments/issue activity** — API endpoints exist; finish original issue detail composer/activity/attachment interactions. Add a visible subscribe/unsubscribe control in the original issue detail UI when that screen is converted from its remaining mock detail payload.
4. **Initiative related enhancements** — resource links, labels, and granular activity only after their schema/API contract is designed and migrated.
5. **Final audit** — `rg -l "@/mock-data|mock-data/" apps/web --glob '*.{ts,tsx}'` currently reports roughly 83 direct imports. Classify each result as presentation-only metadata, obsolete UI, or data still requiring API work. Do not claim mocks are eliminated until this is audited screen by screen.

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

## Handoff protocol

1. Read this file and inspect `git status --short` first.
2. Continue from the first remaining backlog item; all work listed in the verified-progress table is committed and pushed.
3. Send concise Vietnamese commentary before tool work and at least every 60 seconds during lengthy builds.
4. Use `apply_patch` for edits; never write source files via shell redirection.
5. Build and run Docker only at a coherent feature milestone. Commit/push only after verification.
6. Keep the active objective unchanged: **original UI + real backend implementation, progressively removing mock data**.
