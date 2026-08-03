# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- ASTRYX:START -->
Astryx v0.2.0 · 154 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any style={{…}}, raw <div>/<span> layout, imported .css/@apply, or hardcoded/arbitrary value (e.g. bg-[#fff], p-[13px]) with the component or a token-backed utility. If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   154 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

## Flowie — trạng thái áp dụng Astryx

Phần này viết tay, nằm ngoài vùng `ASTRYX:START/END` nên `astryx upgrade` không ghi đè.

### Foundation đã dựng

- `src/app/astryx.css` — nạp `core/astryx.css` + `theme-neutral/theme.css`.
  Import trong `layout.tsx` **sau** `globals.css`.
- `src/components/providers/AstryxProvider.tsx` — bọc app trong `<Theme>`,
  đọc lựa chọn theme từ `localStorage["flowie:theme"]` (nguồn sự thật của
  `ThemeToggle`) để hai hệ theme không lệch nhau.

### Hai thứ CỐ TÌNH chưa bật — đọc trước khi đụng vào

1. **`@astryxdesign/core/reset.css` — chưa nạp.**
   Reset của Astryx normalize toàn bộ element HTML thô và sẽ chồng lên Tailwind
   preflight, làm đổi hình các trang chưa migrate. Component Astryx tự mang
   class `.xds-*` nên vẫn render đúng mà không cần reset.
   → Bật khi tất cả trang đã dùng component Astryx.

2. **`@astryxdesign/core/tailwind-theme.css` — chưa nạp.**
   Bridge này *yêu cầu Tailwind v4*; dự án đang ở `tailwindcss@3.4.19`.
   Hệ quả: các utility token-backed mà AGENTS.md nhắc tới (`bg-surface`,
   `text-primary`, `rounded-lg`) **chưa dùng được**.
   → Trong khi chờ nâng v4, thứ tự ưu tiên khi cần style:
      1. prop của component (`padding`, `gap`, `variant`, `elevation`…)
      2. `xstyle` + `stylex.create()` (StyleX 0.19 đã có sẵn)
      3. class Tailwind v3 hiện có — chấp nhận tạm, không thêm mới

### Tiến độ migrate

| Trang | Trạng thái |
|---|---|
| `src/app/login/page.tsx` | ✅ đã chuyển — dùng làm bản mẫu tham chiếu |
| 24 trang còn lại trong `src/app/**` | ⬜ chưa chuyển (Tailwind v3 + div thô) |
| `src/components/**` | ⬜ chưa chuyển |

Khi migrate một trang: chạy `npx astryx build "<mô tả trang>"` trước để lấy
template/block gợi ý, đừng tự đoán component.

### Archetype của Flowie

Theo bảng App Archetypes (`npx astryx docs layout`), Flowie là
**Tracker / work tool** → `AppShell` + `SideNav`, inspector `LayoutPanel` khi
chọn dòng, **rows only, không Card**. Dense data (task, sprint, worklog) phải là
`Table` hoặc `List`/`Item` edge-to-edge — không bọc mỗi record trong một Card.
Card chỉ dành cho KPI tile, chart panel, nhóm settings.
