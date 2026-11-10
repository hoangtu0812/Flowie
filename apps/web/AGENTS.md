# AGENTS.md

Project-specific guidance for AI coding agents.

## Where code goes

- `features/<domain>/`: everything that belongs to one business domain
  (issues, projects, cycles, views, members, reviews, …): pages' feature
  components, domain hooks such as `use-live-*`, dialogs, panels, domain
  helpers and messages. Create the folder when a domain has none yet.
- `features/shared/`: cross-domain helpers with no UI of a domain (i18n,
  dates, pagination, keyboard, error reporting).
- `components/ui/`: primitives that know nothing about the business (shadcn).
- `components/layout/`: the application frame (sidebar, headers, command
  palette, main layout).
- `components/common/`: only UI shared by several domains and owned by none
  (query/loading states, image viewer, sandboxed HTML frame, timeline/gantt,
  markdown editor and preview). Never add a `components/common/<domain>/`
  folder; domain code goes under `features/<domain>/`.
- `components/brand/` (logo) and `components/data-table-filter/` (vendored
  bazza/ui filter, lint-exempted) are the only other `components/` folders.
- `features/settings/` holds the settings pages, including integrations and
  MCP (`mcp/`).
- Moving code between folders keeps file names, `data-testid` values and
  roles, so e2e selectors stay valid.

<!-- ASTRYX:START -->

Astryx v0.5.0 · 163 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:

1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:

- No <div> — components do all layout/spacing, page frame included.
- Frame first: read `astryx docs layout` before writing any page or screen — page frame, region widths, breakpoint behavior.
- Dense data = rows (Table, List/Item), never Card-wrapped list items; Card is for standalone widgets. Status = StatusDot/Token; Badge = counts only.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent belongs in the theme (`astryx theme list` / `theme add <slug>`, or `astryx theme template` for a custom one) — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any style={{…}}, raw <div>/<span> layout, imported .css/@apply, or hardcoded/arbitrary value (e.g. bg-[#fff], p-[13px]) with the component or a token-backed utility. If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
search "<query>" find any component / hook / doc / template / block
component --list 163 components by category
template --list page + block recipes
docs <topic> browser-support, cli-integrations, color, elevation, getting-started, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling-libraries, styling, theme, tokens, typography, working-with-ai
swizzle <Name> eject component source for deep customization
upgrade --apply run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
