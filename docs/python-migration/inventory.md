# Python migration inventory — P0 checkpoint

This document is the migration inventory for the Python backend transition. It describes the
current NestJS application as a behavior reference; it is not a license to change the Circle UI.

## Checkpoint and rollback

| Item | Value |
| --- | --- |
| Source checkpoint | `38cca0b` on `codex/foundation` |
| Implementation branch | `codex/python-rebuild` |
| UI baseline | Circle `778598503e680b4c658d694dd9f65351ee48b3d3` |
| Legacy API public prefix | `/api/v1` |
| Legacy API runtime port | `4000` before facade split |
| Database migration owner | Prisma until final Python cutover |

Rollback rule: do not delete or alter `apps/api`, `apps/worker`, or Prisma migrations while a
domain is still routed to legacy NestJS. A failed Python domain is routed back to its legacy
endpoint through the facade; Git rollback remains available through `38cca0b`.

## Schema fingerprints

The following are structure-only fingerprints. They contain no application data.

| Source | Fingerprint | Captured |
| --- | --- | --- |
| `schema.prisma` | `3B2E17B746A5A5AF7E21B2B521F291FBDFEBCC348A5B57AE72A4ABD51C6C6E54` | 2026-08-25 |
| 61 Prisma migration files manifest | `F6B06E2FFDE2BED02F9B6425E27C3FFFE53DBC41CD7BC1A89ABE2837DE297D93` | 2026-08-25 |
| Running PostgreSQL `pg_dump --schema-only` | `89b8dfa03bd6fd9e43c9b6324c1581814a06897148bb41ec60733c854e1263ac` | 2026-08-25 |

Recalculate the source fingerprints without network access:

```powershell
.\scripts\get-python-migration-fingerprint.ps1
```

Use `-Detailed` only when the individual migration hashes are needed.

The database structure fingerprint may be reproduced while PostgreSQL is running:

```powershell
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" --schema-only "$POSTGRES_DB" | sha256sum'
```

Any fingerprint drift before Prisma ownership is frozen must be explained by a committed Prisma
migration. Do not use Alembic against this database until P9.

## API domain migration map

The FastAPI facade remains the only public `/api/v1` entry point. A row is migrated only after its
listed contract family, authorization behavior, and persistence behavior pass parity tests.

| Domain | Legacy contract families | NestJS source | Python phase | UI/domain consumers |
| --- | --- | --- | --- | --- |
| Health | `GET /health` | `health` | P2 | Docker/readiness |
| Auth | `/auth/register`, `/login`, `/refresh`, `/logout`, sessions, API keys | `auth` | P3 | login, security settings |
| Users/Profile | `/users/me`, users list/detail, profile update | `users` | P3 | profile, member pickers |
| Workspace | `/workspaces/me`, invitations, members, display defaults | `workspace` | P3 | org switcher, settings |
| Teams | team CRUD, archive/restore, join/leave, members | `teams` | P4 | teams, sidebar |
| Projects | CRUD, labels/statuses/templates/custom fields, updates, resources, members, milestones, personal state, issues | `projects` | P5 | project list/detail/peek/settings |
| Issues | CRUD, options/templates, relations, sub-issues, reactions, personal state, move/classification | `issues` | P6 | team issues, My issues, project issues |
| Comments | CRUD and reactions | `comments` | P6 | issue/project activity |
| Attachments | list/create/download | `attachments`, `storage` | P6 | issue/project documents |
| Cycles | CRUD, issue links, document links | `cycles` | P6 | team cycles |
| Activities | activity list | `activities` | P6 | activity tabs/inbox |
| Initiatives | initiatives, project links, updates, resources | `portfolio` | P7 | initiatives/project links |
| Views | saved-view list/create/delete | `portfolio` | P7 | workspace/team views |
| Labels | issue labels and label groups | `labels` | P7 | issues/settings |
| Documents | documents and folders | `documents` | P8 | documents |
| Notifications | inbox, read state, preferences | `notifications` | P8 | inbox/settings |
| Discord | get/save/test webhook | `integrations`, `jobs` | P8 | integrations/notifications |
| Admin | overview, users, workspaces, audit | `admin`, `audit` | P8 | admin |
| Releases | release CRUD | `releases` | P8 | releases |
| Customer requests | request CRUD | `customer-requests` | P8 | customer requests |
| SLA | policy CRUD | `slas` | P8 | SLA settings |
| Asks | ask CRUD and conversion | `asks` | P8 | asks/customer work |
| Pulse | read-only pulse | `pulse` | P8 | pulse |
| Emojis | workspace emoji CRUD/image | `emojis` | P8 | editor/pickers |

The runtime OpenAPI reference is exposed by legacy NestJS at `/api/docs` while it remains running.
Before moving an individual route, add it to `docs/python-migration/contract-differences.md` only
if Python must intentionally differ in a frontend-visible way.

## Data model ownership map

| Domain | Existing Prisma models |
| --- | --- |
| Identity and access | `User`, `Session`, `PersonalApiKey`, `PasswordResetToken`, `EmailVerificationToken`, `UserIdentity` |
| Organization/workspace | `Organization`, `Workspace`, `WorkspaceMember`, `DiscordWebhook`, `AuditLog`, `Notification`, `NotificationPreference`, `WorkspaceEmoji` |
| Teams | `Team`, `TeamMember`, `IssueStatus`, `IssueTemplate`, `DocumentFolder` |
| Projects | `Project`, `ProjectMember`, `ProjectCustomField`, `ProjectCustomFieldValue`, `ProjectMilestone`, `ProjectSubscription`, `ProjectFavorite`, `ProjectUpdate`, `ProjectResource`, `ProjectTemplate`, `ProjectStatus`, `ProjectLabel`, `ProjectLabelLink` |
| Portfolio | `SavedView`, `Initiative`, `InitiativeProject`, `InitiativeUpdate`, `InitiativeResource` |
| Issues | `Issue`, `IssueRelation`, `IssueSubscription`, `IssueFavorite`, `IssueReminder`, `IssueReaction`, `IssueCycle`, `IssueRelease`, `IssueLabel`, `Label`, `LabelGroup` |
| Cycles | `Cycle`, `CycleDocument` |
| Documents/comments | `Document`, `Comment`, `CommentReaction`, `Activity`, `Attachment` |
| Delivery/customer | `Release`, `ReleaseProject`, `CustomerRequest`, `SlaPolicy`, `Ask` |

Important enums to map exactly: user/member roles and statuses, team join policy, issue status
category/priority/resolution/relation type, project type/custom-field type, and cycle status.

## Worker and asynchronous behavior inventory

| Job or schedule | Producer | Consumer behavior | Migration rule |
| --- | --- | --- | --- |
| `discord-webhook` | `JobsService`, notification/integration services | Posts enabled workspace webhook; retry 5 exponential attempts | Keep Node worker until Python producer/consumer parity is tested |
| `issue-reminder` | Issues personal-state service | Creates notification and marks reminder delivered; retry 3 exponential attempts | Keep legacy producer/worker together until ported |
| `team-policy-scan` | Worker scheduler | Auto-closes/archives issues and generates/activates/completes cycles | Move last; preserve idempotency, cadence and audit activity |

Queue name is `flowie-jobs`. Do not let a Python worker and the BullMQ worker consume the same job
name in production. P9 must include a cutover rehearsal on a database clone.

## Infrastructure and external dependency inventory

| Dependency | Current use | Python migration constraint |
| --- | --- | --- |
| PostgreSQL 16 | persistent business data | Reuse schema; Prisma owns migrations until P9 |
| Redis 7 | BullMQ queue and scheduled work | Do not assume BullMQ protocol compatibility from Python |
| MinIO/S3 | attachment storage | Preserve authorization and object-key behavior |
| Discord webhook | outbound notification | Mask secret URL, enforce manager RBAC, queue delivery |
| Cookies/session | auth session flow | Forward `Cookie` and `Set-Cookie` exactly through facade until P3 is native |
| Docker Compose | local offline runtime | Images must be built while on 5G; normal start uses `--pull never` |

## P0 completion evidence

- [x] Clean source checkpoint verified before branch creation.
- [x] `codex/python-rebuild` created from `38cca0b`.
- [x] API/domain, schema/model, worker and infrastructure inventory recorded.
- [x] Source and running-database structure fingerprints captured without data export.
- [x] Rollback and migration-ownership rule recorded.
- [x] Pushed implementation branch and P0 commit `5916b50`.
