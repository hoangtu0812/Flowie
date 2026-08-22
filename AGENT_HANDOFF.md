# Flowie — Agent Handoff

Last updated: 2026-08-22

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

## In progress — do not discard

The worktree currently contains the **Initiatives** implementation, not committed yet:

- New migration: `packages/database/prisma/migrations/20260822130000_initiative_properties/migration.sql`
- Schema adds Initiative `ownerId`, `priority`, `health`, and `icon` plus safe owner relation.
- API DTO/service includes these fields, validates owner membership, and returns owner/project details.
- Frontend changes in:
  - `apps/web/components/common/initiatives/use-live-initiatives.ts`
  - `apps/web/components/common/initiatives/initiatives.tsx`
  - `apps/web/components/common/initiatives/initiative-details.tsx`
  - `apps/web/components/layout/headers/initiative/header.tsx`
- List, creation, detail tabs, and linking existing projects are wired to API.
- Prisma generation and API build have passed. Frontend build had compiled and passed type validation; run a full Docker build/recreate before committing to verify migration and runtime.

Recommended next commands after resuming (when 5G is permitted):

```powershell
pnpm --filter @circle/database generate
pnpm --filter @circle/api build
pnpm --filter @circle/web build
git diff --check
docker compose --profile app build api web
docker compose --profile app up -d --no-build --pull never --force-recreate api web
```

Then check `/api/v1/health`, the API logs for successful migration, web HTTP 200, commit as e.g. `feat: connect initiatives to live data`, and push.

## Remaining implementation backlog

Prioritize by backend readiness and preserve original UI in every group.

1. **Finish Initiatives** — complete verification/commit of in-progress work. Consider adding a real Initiative activity relation only if the original Activity tab needs field-level event history; never generate fake events.
2. **Inbox and notifications** — API notification model exists. Replace inbox mock previews, mark-read/archive actions, and notification store with API data.
3. **My issues** — use live issue store data for breakdowns, filters, and user-scoped list; remove remaining mock project/team/user derivations.
4. **Settings** — labels/statuses/templates/security/preferences pages need an audit. Retain only actually supported settings; implement matching endpoints for pages still showing placeholder data.
5. **Command palette/sidebar utilities** — remove remaining mock team/project/user imports, using live loaders already present (`team-types.ts`, issue store, workspace members).
6. **Attachments/comments/issue activity** — API endpoints exist; finish original issue detail composer/activity/attachment interactions.
7. **Initiative related enhancements** — resource links, labels, and granular activity only after their schema/API contract is designed and migrated.
8. **Final audit** — `rg -l "@/mock-data|mock-data/" apps/web --glob '*.{ts,tsx}'` currently reports roughly 83 direct imports. Classify each result as presentation-only metadata, obsolete UI, or data still requiring API work. Do not claim mocks are eliminated until this is audited screen by screen.

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

## Handoff protocol

1. Read this file and inspect `git status --short` first.
2. Preserve uncommitted Initiatives work; finish/verify it before switching feature area.
3. Send concise Vietnamese commentary before tool work and at least every 60 seconds during lengthy builds.
4. Use `apply_patch` for edits; never write source files via shell redirection.
5. Build and run Docker only at a coherent feature milestone. Commit/push only after verification.
6. Keep the active objective unchanged: **original UI + real backend implementation, progressively removing mock data**.
