# Circle — AI Guide

> This document is written for AI assistants (and humans) working on this codebase.
> It explains how the project is structured, where every kind of logic lives, how to
> plug a real API behind the UI, and how to extract a single feature into another project.

Flowie's web client started from the Circle template, a **Linear-inspired project
management interface**: issues, projects, teams, cycles, members, documents and
notifications. Data now comes from the Flowie API; the template's fake data folder
(`mock-data/`) has been removed.

## Tech stack

| Concern     | Choice                           | Notes                                                                            |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Framework   | Next.js 15 (App Router)          | `app/` directory, React 19, Turbopack in dev                                     |
| Language    | TypeScript (strict)              | Path alias `@/*` → repo root (see `tsconfig.json`)                               |
| Styling     | Tailwind CSS v4                  | Theme tokens in `app/globals.css` (`--background`, `--container`, …)             |
| UI kit      | shadcn/ui (Radix primitives)     | Generated components in `components/ui/` — treat as vendored                     |
| State       | Zustand 5 + nuqs                 | UI state in Zustand (`store/`), filters/sorting synced to the URL via nuqs hooks |
| Charts      | Recharts                         | Burn-up chart + insights bar chart                                               |
| Drag & drop | react-dnd (HTML5 backend)        | Board view, drop = change status                                                 |
| Animation   | motion (Framer Motion)           | Layout animations on issue lines/cards                                           |
| Dates       | date-fns                         | Formatting only                                                                  |
| Ordering    | LexoRank (`@kayron013/lexorank`) | Issue `rank` field, re-exported from `lib/utils.ts`                              |
| Icons       | lucide-react, @remixicon/react   | Plus hand-written SVGs for statuses/priorities                                   |
| Toasts      | sonner                           | `<Toaster />` mounted in `app/layout.tsx`                                        |
| URL state   | nuqs 2                           | `NuqsAdapter` wraps the app in `app/layout.tsx`; filter "stores" are nuqs hooks  |

Formatting: Prettier with **3-space indentation**, single quotes, 100-col width
(`.prettierrc`). Husky + lint-staged run Prettier/ESLint on commit.

## Repository map

```
app/                          # Next.js routes (thin wrappers around components)
  layout.tsx                  # Root layout: fonts, ThemeProvider (dark default), Toaster
  page.tsx                    # Redirects to /lndev-ui/team/CORE/all
  [orgId]/                    # Workspace slug segment
    inbox/  projects/  teams/  members/  settings/
    agent/                                    # Agent planning page (workspace API-backed)
    issue/[issueId]/                          # Issue detail page (issueId = identifier, e.g. LNUI-703)
    profiles/[memberId]/                      # Member profile (memberId = User.id, e.g. "mason")
    project/[projectId]/
      overview/  activity/  issues/           # Project detail tabs
    team/[teamId]/
      all/       active/      backlog/          # Issue views (tabs)
      cycle/active/  cycle/upcoming/            # Current / upcoming cycle issues
      cycles/                                   # Cycles timeline + burn-up chart
      overview/  documents/  members/           # Team Home tabs
components/
  common/                     # UI shared by several domains (markdown, timeline, states, viewers)
  brand/                      # Flowie logo
  data-table-filter/          # Vendored bazza/ui filter (lint-exempted)
  layout/
    main-layout.tsx           # Sidebar + rounded content shell used by every page
    sidebar/                  # App sidebar (nav, org switcher, create-issue modal)
    headers/                  # Per-page headers (nav row + options row)
  ui/                         # shadcn/ui primitives (button, dialog, table, …)
features/<domain>/            # Everything that belongs to one business domain (see AGENTS.md)
  projects/details/           # Project detail tabs (overview / activity / issues) + properties panel
types/                        # UI domain types mapped from the API (Issue, User, Project, …)
store/                        # Zustand stores (state + mutations + filtering)
lib/                          # cn(), LexoRank re-export, status/notification helpers
hooks/                        # use-mobile.ts (responsive breakpoint hook)
```

### Page pattern

Every route follows the same composition — copy it when adding a page:

```tsx
// app/[orgId]/team/[teamId]/example/page.tsx
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/example/header';
import Example from '@/features/example/example';

export default function ExamplePage() {
   return (
      <MainLayout header={<Header />}>
         {' '}
         {/* headersNumber={1|2} = header row count */}
         <Example />
      </MainLayout>
   );
}
```

`MainLayout` renders the sidebar, the `CreateIssueModalProvider` and a scrollable
content area whose height depends on `headersNumber` (1 or 2 header rows of 40px).

## Data model (`types/` and `lib/*-presentations`)

Records come from the Flowie API (`/api/v1`) and are mapped to UI shapes. There is no
fake data in the app: the template's `mock-data/` folder was removed, and ESLint
(`no-restricted-imports` in `eslint.config.mjs`) rejects any import of `mock-data` or
`e2e/**` from `app/`, `features/`, `components/`, `lib/` and `store/`.

| File | Contents |
| --- | --- |
| `types/issues.ts` | `Issue` plus `groupIssuesByStatus`, `sortIssuesByPriority` (augmented by `store/issues-store.ts`) |
| `types/users.ts` | `User` |
| `types/projects.ts` | `Project`, `Health` |
| `types/labels.ts` | `LabelInterface` |
| `types/cycles.ts` | `Cycle`, `CycleStatus`, `formatCycleDateRange`, `cycleStatusLabel` |
| `types/project-details.ts` | `ProjectDetail`, `ProjectUpdate`, milestones, resources |
| `lib/status-presentations.tsx` | `Status`, `StatusCategory`, status icons and ordering helpers |
| `lib/priority-presentations.tsx` | `Priority`, priority icons and colours |
| `lib/project-presentations.ts` | project `health` levels |
| `@circle/contracts` | `ContentBlock` and other types shared with the API |

## State management (`store/`)

Two flavors live side by side and expose hook-shaped APIs:

- **Zustand stores** (in-memory, some persisted to localStorage)
- **nuqs hooks** (state lives in the URL query string) — they kept the historical
  `useXxxStore()` names so consumers didn't change when they were migrated

| Store                                                                         | Kind                | Role                                                                                                                                                                                                                                                                                                                                   | Mutates data?             |
| ----------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `issues-store.ts`                                                             | Zustand             | Holds the issues array + `issuesByStatus`; CRUD (`addIssue`, `updateIssue`, `deleteIssue`, `updateIssueStatus/Priority/Assignee/Project`, label add/remove); read filters (`filterByStatus/Priority/Assignee/Label/Project/Cycle`, `searchIssues`, `filterIssues` — supports status/assignee/priority/labels/project/cycle/statusType) | ✅ the main mutable store |
| `notifications-store.ts`                                                      | Zustand             | Inbox items, selection, read/unread                                                                                                                                                                                                                                                                                                    | ✅                        |
| `filter-store.ts`                                                             | **nuqs**            | Issue filters in the URL under a single `?filters=` param — the state is bazza/ui's `FiltersState` (`{ columnId, type, operator, values }[]`), so operators like _is not_ / _exclude_ survive in shareable URLs                                                                                                                        | URL state                 |
| `projects-filter-store.ts`, `team-filter-store.ts`, `members-filter-store.ts` | **nuqs**            | Per-page filters + sorting in the URL (`?sort=…`)                                                                                                                                                                                                                                                                                      | URL state                 |
| `display-settings-store.ts`                                                   | Zustand (persisted) | Linear-style "Display" options: grouping (status/assignee/priority/project/none), ordering (priority/created/title), completed-issue visibility, show empty groups, per-row display properties (ID, status, priority, labels, project, due date, created, assignee, cycle)                                                             | UI state                  |
| `agent-chat-store.ts`                                                         | Zustand             | Active Agent conversation id and sidebar history summaries. Messages and proposals are persisted by `/api/v1/agent`; this store is not the source of record data.                                                                                                                                                                      | UI state                  |
| `view-store.ts`                                                               | Zustand (persisted) | List vs Board                                                                                                                                                                                                                                                                                                                          | UI state                  |
| `search-store.ts`                                                             | Zustand             | Search open/query                                                                                                                                                                                                                                                                                                                      | UI state                  |
| `create-issue-store.ts`                                                       | Zustand             | Create-issue modal open state + default status                                                                                                                                                                                                                                                                                         | UI state                  |
| `right-panel-store.ts`                                                        | Zustand             | Right side panel on issue/cycle pages (`'insights'` \| `'cycle-details'` \| null)                                                                                                                                                                                                                                                      | UI state                  |

⚠️ Truly mutable state: **issues**, **notifications**, **project updates** and
**agent chats**. The Projects, Teams and Members tables read directly from
the API and apply their filter stores in `useMemo` — there is no
projects/teams/members store to mutate yet.

## Feature inventory (what to grab if you only want one part)

Each feature is self-contained under `features/<feature>` + its header under
`components/layout/headers/<feature>`. Dependencies below are in addition to
`components/ui/*`, `lib/utils.ts` and Tailwind.

- **Filter bar** (`features/issues/issue-filter-bar.tsx` + `issue-filter-columns.tsx`
   - vendored `components/data-table-filter/`) — Linear-style filter chips
     (subject / operator / values / remove) built on [bazza/ui data-table-filter]
     (vendored, Radix + shadcn, lint-exempted in `eslint.config.mjs`). Column configs are
     built from the loaded issues via `createColumnConfigHelper<Issue>()`; `applyIssueFilters()`
     applies a `FiltersState` to any issue list using bazza's filter functions.
     To add a filterable field: add one entry in `issue-filter-columns.tsx`.
     The entry point is `issue-filter-trigger.tsx` (the "Filter" button in the header
     toolbars); the chips row (`issue-filter-bar.tsx`) only renders once a filter is
     active. `use-panel-filter.ts` powers the exclusive click-to-filter of the right-side
     panels (one panel filter at a time, re-click clears). When filters hide issues,
     `grouped-issues-view.tsx` shows a "hidden by filters" footer and, on the board,
     collapses emptied columns into a "Hidden columns" section (`0 / total`).
- **Issues views** (`features/issues/`) — `all-issues.tsx` (accepts
  `categories?: StatusCategory[]` for the Active/Backlog tabs), `grouped-issues-view.tsx`
  (grouping/ordering-aware list/board + DnD), `group-issues.tsx` (generic
  `IssueGroupDescriptor` — a group is a status, an assignee, a priority or a project),
  `issue-line.tsx`, `issue-grid.tsx` (both honor `display-settings-store` display
  properties and link to the issue page), selectors (status/priority/assignee),
  `issue-context-menu.tsx`, `search-issues.tsx`, `insights-panel.tsx`. Needs:
  `issues-store`, `filter-store`, `view-store`, `display-settings-store`,
  `search-store`, `right-panel-store`, `types/*` and `lib/{status,priority}-presentations`.
- **Issue detail page** (`features/issues/details/` + `app/[orgId]/issue/[issueId]/`)
  — `issue-details.tsx` (composition), `content-blocks.tsx` (renders `ContentBlock[]`
  with inline \`code\`/**bold** parsing, image & video placeholders, issue refs),
  `activity-feed.tsx` (events + comments + local composer),
  `issue-properties-panel.tsx` (editable status/priority/assignee, labels, project,
  milestone, blocked-by/related, PR links), header with prev/next navigation
  (`components/layout/headers/issue/`). Needs the issues feature.
- **Cycles** (`features/cycles/`) — `cycles.tsx` (timeline),
  `cycle-line.tsx`, `cycle-burnup-chart.tsx` (+ `CycleProgressLegend`),
  `capacity-ring.tsx`, `cycle-details-panel.tsx`. `cycle-issues.tsx` (in
  `features/issues/`) renders a cycle-scoped issue view. Needs:
  `types/cycles.ts`, recharts, the issues feature.
- **Team Home** (`features/teams/team-{overview,documents,members}.tsx`
   - `components/layout/headers/team/`) — loads the team through `teams/use-live-team.ts`.
- **Inbox** (`features/inbox/`) — resizable two-pane notifications (single-pane
  with back navigation on mobile). Notifications reference REAL issues by identifier
  (`InboxItem extends Issue`) and the preview pane renders the actual issue (live store
  data + rich description + properties column). Needs `notifications-store`,
  `features/inbox/notification-data.ts`, `react-resizable-panels`, the issue-details renderer.
- **Projects / Teams / Members tables** (`features/{projects,teams,members}/`)
  — plain sorted/filtered tables + their filter stores.
- **Member profile** (`features/members/member-profile.tsx` +
  `components/layout/headers/profile/` + `app/[orgId]/profiles/[memberId]/`) —
  Assigned/Created tabs (nuqs `?tab=`), issues grouped by status, right panel with
  identity (email, client-computed local time from `User.timezone`, joined, teams,
  projects) and Labels/Priority/Projects/Teams breakdowns. Member rows in the Members
  tables link here. Needs the issues feature.
- **Project detail pages** (`features/projects/details/` +
  `components/layout/headers/project/` + `app/[orgId]/project/[projectId]/`) —
  `project-overview.tsx` (rich `ContentBlock` description, inline properties,
  initiatives/labels/resources), `project-activity.tsx` (update composer with health
  picker — **Post update actually writes** through `project-updates-store` — plus a
  monthly timeline of updates), `project-issues.tsx` (project-scoped grouped issues),
  `project-properties-panel.tsx` (properties, milestones, progress breakdowns by
  assignee/label/cycle, activity feed). Types in `types/project-details.ts`.
- **Projects page** (`features/projects/`) — `projects.tsx` orchestrates two
  URL-synced views (`?view=`): the **All projects** table (`project-line.tsx` — health,
  priority, lead, target date, live issue count, status %) and the **Active projects
  timeline** (`projects-timeline.tsx` — month scale, team groups, date-positioned bars,
  client-only Today marker). `projects-insights-panel.tsx` adds Health/Teams/Leads
  counters; clicking a Health row toggles the corresponding URL filter.
- **Agent page** (`app/[orgId]/agent/`) — workspace API-backed planning only. It
  drafts proposals through the active OpenAI or Google provider and must never
  create a project or issue until the user explicitly accepts the proposal.
  Source files are Markdown, DOCX, or XLSX and must not be persisted in the
  conversation payload. Provider API keys are server-side secrets and must
  never be returned to the browser.
- **Settings** (`features/settings/` + `app/[orgId]/settings/`) — Linear-style
  settings area. The app sidebar swaps to a settings nav (`sidebar/nav-settings.tsx`,
  groups Personal / Issues / Projects / Features, plus `nav-teams-settings.tsx`) whenever
  the pathname contains `/settings`. Shared primitives live in `settings/shared.tsx`
  (`SettingsShell`, `SettingsSection`, `SettingsCard`, `SettingsRow`, `SelectMenu`).
  Pages: `notifications`, `code-and-reviews` (with a fake diff preview), `security`,
  `connected-accounts`, `agent-personalization`, `ai`, `issue-labels` (counts computed
  from the issues API), `issue-templates`, `project-statuses` (project counts grouped
  by status category), `teams/[teamId]` (per-team settings incl. danger zone) and
  `teams/new`. Toggles are uncontrolled `ui/switch`; selects are local-state dropdowns.
  `integrations` is a full directory page (search, "Enabled" carousel, categorized cards)
  driven by `settings/integrations-data.ts`. Sections without a dedicated UI yet (`slas`,
  `project-labels`, `project-templates`, `project-updates`, `initiatives`, `documents`,
  `customer-requests`, `releases`, `pulse`, `asks`, `emojis`) render the generic
  `settings/settings-placeholder.tsx` empty state configured by
  `settings/placeholder-sections.ts`.
- **Theme system** (`store/theme-store.ts` + `components/layout/theme-applier.tsx` +
  `features/settings/theme-preferences.tsx`) — Linear-style themes: next-themes
  keeps resolving light/dark/system, the persisted store adds named variants
  (Pure Light, Magic Blue, Classic Dark — CSS under `[data-app-theme=…]` in
  `app/globals.css`) and a fully custom theme (accent/background/contrast per surface,
  optional custom sidebar) whose CSS variables are generated at runtime by
  `ThemeApplier` (mounted in `theme-provider.tsx`). Custom themes can be copied to /
  imported from the clipboard as JSON.
- **Initiatives** (`features/initiatives/` + `app/[orgId]/initiatives/` +
  `app/[orgId]/initiative/[initiativeId]/`) — Linear-style initiatives: list with
  Active/Planned/All tabs, URL-backed filters (`store/initiatives-filter-store.ts`, nuqs),
  display options (`store/initiatives-display-store.ts`: grouping/ordering/columns) and an
  Owner/Team/Health side panel; detail page with Overview (properties, progress area chart,
  Health/Status/Teams/Leads breakdowns, projects table), Activity and Projects (reuses
  `ProjectsTimeline`) tabs. Data from the initiatives API.
- **Views** (`features/views/` + `app/[orgId]/views/` + `app/[orgId]/view/[viewId]/`)
  — saved views: list with Issues/Projects tabs and display options
  (`store/views-display-store.ts`); detail page applies the view's declarative filter
  (saved on the server) and reuses
  `GroupedIssuesView` + `InsightsPanel` (issue views) or `ProjectsList` (project views).
  Views can carry a `teamId`; the team sidebar "Views"/"Projects" entries open the
  team-scoped pages `/{orgId}/team/{teamId}/views` (same `Views` component with a
  `teamId` prop) and `/{orgId}/team/{teamId}/projects` (`teams/team-projects.tsx`).
- **Reviews** (`app/[orgId]/reviews/` +
  `app/[orgId]/review/[reviewId]/{,review,changes}`) — intentionally unavailable because
  Flowie manages general projects and has no code-review backend. Fixture-backed review
  components and seeded diffs were removed.
- **My issues** (`features/my-issues/my-issues.tsx` + `app/[orgId]/my-issues/`)
  — personal issue hub with Assigned / Created / Subscribed / Activity tabs (nuqs).
  Assigned groups by cycle (name + date range via `types/cycles.ts`) then
  Backlog/Completed; Created/Subscribed are flat `IssueLine` lists derived from
  `users[0]` assignment and the deterministic `issueCreatorIndex`; Activity reuses
  `GroupedIssuesView` in board mode. Right side: the shared `InsightsPanel`
  (right-panel-store, open by default) or a Labels/Priority/Projects/Teams
  breakdown panel on the Created tab.
- **Customize sidebar** (`components/layout/sidebar/customize-sidebar-dialog.tsx` +
  `store/sidebar-prefs-store.ts`) — functional modal (badge style Count/Dot, per-item
  visibility Always/On badge/Never, drag & drop reordering via the grip handles —
  persisted `order` per section) opened from the sidebar "More" menu and from
  Preferences; `nav-inbox`/`nav-workspace` respect the persisted prefs and hidden
  workspace items fall back into the "More" dropdown.
- **Integration logos** (`features/settings/integration-logos.tsx`) — brand SVG
  icons (sourced from logos.lndev.me) used by the integrations directory and connected
  accounts; unknown brands fall back to colored initial chips.
- **Create issue modal** (`components/layout/sidebar/create-new-issue/`) — dialog with
  status/priority/assignee/project/label selectors; writes through `issues-store.addIssue`.
- **App shell** (`components/layout/main-layout.tsx` + `sidebar/`) — everything else
  plugs into it.

Routing conventions: URLs are `/{orgId}/…` with `orgId` the workspace slug, and
`teamId` the team identifier or id. Detail pages:
`/{orgId}/issue/{identifier}`, `/{orgId}/profiles/{userId}`,
`/{orgId}/project/{projectId}/{overview|activity|issues}` and `/{orgId}/agent`.

## Data source

Flowie serves every record from its API (`/api/v1`, see `apps/api-python`). Stores and
feature hooks fetch it and map it to the shapes in `types/`. Issue mutations go through
`store/issues-store.ts` actions, which call the API and roll back on failure. Never add
demo records to shipped code; Playwright data belongs to the e2e tests.

## Statuses & workflow logic

- A status belongs to a `StatusCategory`; views are category-driven:
   - **Active tab** (`/team/[teamId]/active`) → categories `unstarted` + `started`
   - **Backlog tab** (`/team/[teamId]/backlog`) → categories `backlog` + `triage`
   - **All issues** (`/team/[teamId]/all`) → everything
- Board/list groups render in `displayOrderedStatus` order and **skip empty groups**.
- The insights panel table uses `workflowOrderedStatus` order.
- Cycle progress (`completed` stats, details-panel breakdowns) counts issues whose
  `status.category === 'completed'`.
- To add a status: add one entry to `status` in `lib/status-presentations.tsx` (append at the
  end — don't reorder the first six), pick an icon builder (`StatusPieIcon(color,
fraction)`, `StatusGearIcon`, `StatusCheckIcon`, `StatusXIcon`, …) and a category.
  Everything else (views, filters, selectors, insights) picks it up automatically.

## Conventions & gotchas

- `'use client'` on every component that touches a store, DnD, or browser APIs.
  Route `page.tsx` files stay server components.
- Use the `cn()` helper (`lib/utils.ts`) to merge Tailwind classes.
- Background surfaces: `bg-container` (custom token), hover rows: `hover:bg-sidebar/50`.
- Right side panels are 420px `<aside>`s hidden below `lg`, toggled via
  `right-panel-store` from the header option buttons.
- Filters/sorting belong in the URL: use a nuqs hook (see `store/filter-store.ts`
  as the template) instead of a new Zustand store when adding one.
- Issue detail content is data, not markup: extend the `ContentBlock` union in
  `@circle/contracts` + one case in `content-blocks.tsx` to add a block type.
- Charts must be deterministic across SSR/CSR — never use `Math.random()`/`Date.now()`
  when generating chart data.
- ⚠️ Never pass objects that contain **component functions** (`Project.icon`,
  `Status.icon`, priority icons…) from a server `page.tsx` to a client component —
  they don't serialize across the RSC boundary. Pass the **id** and resolve
  client-side (`getProjectById`, `users.find`…), as the project/profile pages do.
- Wall-clock-dependent values (member local time, "joined x years ago", the timeline
  Today marker) are computed in `useEffect` after mount so SSR output stays
  deterministic.
- `next/font` fetches Geist from Google Fonts at build time — offline builds must stub
  it or set up a local font.

## Commands

```bash
pnpm install       # install deps
pnpm dev           # dev server (Turbopack) on http://localhost:3000
pnpm build         # production build (type-checks + lints)
pnpm lint          # ESLint
pnpm format        # Prettier
```
