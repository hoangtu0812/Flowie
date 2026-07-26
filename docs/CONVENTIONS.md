# Quy ước code Flowie

Tài liệu này mô tả **quy ước đang thực sự áp dụng trong repo**, không phải lý
thuyết chung. Mọi ví dụ đều trích từ code thật — nếu bạn thấy code lệch với tài
liệu này, code sai chứ không phải tài liệu.

Mục tiêu: người mới đọc xong biết **đặt file ở đâu, đặt tên thế nào, và lần theo
dấu vết ra sao khi có bug**.

---

## 0. Nguyên tắc bao trùm

1. **Đọc code xung quanh trước khi viết.** Code mới phải trông như code cũ: cùng
   mật độ comment, cùng cách đặt tên, cùng idiom.
2. **Comment giải thích *tại sao*, không phải *cái gì*.** Code đã nói nó làm gì.
   Comment tốt: `// Dates live on the update path; apply them here so the client
   needs one call.` Comment vô ích: `// Set the start date`.
3. **Build xanh không chứng minh tính năng dùng được.** Xem §7.
4. **Không sửa file migration đã chạy.** Xem §3.4.

---

## 1. Bố cục thư mục

```
Flowie/
├── backend/
│   ├── cmd/api/            # entrypoint HTTP server
│   ├── cmd/devtoken/       # tool phụ trợ
│   └── internal/
│       ├── auth/           # JWT, session, Azure AD, TOTP
│       ├── config/         # đọc biến môi trường
│       ├── db/migrations/  # file SQL đánh số
│       ├── domain/         # struct thuần, không phụ thuộc DB/HTTP
│       ├── handlers/       # tầng HTTP
│       ├── httpx/          # helper JSON/Error/Decode
│       ├── realtime/       # SSE hub
│       ├── server/         # router + middleware
│       ├── storage/        # tích hợp ngoài (SharePoint)
│       └── store/          # truy cập dữ liệu (pgx)
├── frontend/
│   ├── e2e/                # Playwright
│   ├── tests/              # unit test (node --test)
│   └── src/
│       ├── app/            # route Next.js App Router
│       ├── components/     # React component chia theo miền
│       ├── lib/            # logic không phải UI
│       └── types/models.ts # nguồn sự thật cho kiểu dữ liệu
└── docs/
```

### 1.1 Luồng phụ thuộc — một chiều, không được vi phạm

```
Backend:   router → handlers → store → Postgres
                       ↓
                    domain  (không import ngược lên)

Frontend:  app/ (page) → components/ → lib/api/ → backend
                              ↓
                       types/models.ts
```

- `domain/` **không được** import `store/` hay `handlers/`. Nó là struct thuần.
- `store/` **không được** biết gì về HTTP (không `http.ResponseWriter`).
- `handlers/` **không được** viết SQL trực tiếp — mọi truy vấn nằm trong `store/`.
- `lib/api/` **không được** import React. Nó chỉ là HTTP client.

---

## 2. Quy ước đặt tên

### 2.1 Backend (Go)

| Đối tượng | Quy ước | Ví dụ thật |
|-----------|---------|-----------|
| File handler | `<miền>_handler.go` (snake_case) | `sprint_handler.go`, `webhook_handler.go` |
| File store | `<số nhiều>.go`, không hậu tố | `sprints.go`, `webhooks.go`, `tasks.go` |
| File test | `<file>_test.go` cạnh file gốc | `webhook_handler_test.go` |
| Struct store | `<Danh từ số ít>Store` | `SprintStore`, `WebhookStore`, `APIKeyStore` |
| Hàm handler | Động từ + danh từ, exported | `CreateSprint`, `ListWebhooks`, `SetTaskSprint` |
| Guard truy cập | `require<X>Access` / `require<X>` | `requireProjectAccess`, `requireAdmin` |
| Request body | `<hànhđộng><Miền>Request`, **không export** | `createSprintRequest`, `updateSprintRequest` |
| Hằng cột SQL | `<miền>Columns` | `sprintColumns`, `webhookColumns` |
| Hàm scan | `scan<Miền>` | `scanSprint`, `scanWebhook` |
| Struct update | `<Miền>UpdateFields` | `SprintUpdateFields` |
| Sentinel error | `Err<Điều kiện>` ở `store.go` | `ErrNotFound`, `ErrInviteEmailMismatch` |

Viết tắt giữ nguyên chữ hoa theo chuẩn Go: `APIKeyStore`, `URL`, `ID`, `SCM` —
**không** `ApiKeyStore`, `Url`, `Id`.

### 2.2 Frontend (TypeScript/React)

| Đối tượng | Quy ước | Ví dụ thật |
|-----------|---------|-----------|
| Component | `PascalCase.tsx`, export default | `TaskDrawer.tsx`, `NewProjectDialog.tsx` |
| Component tab | `<Tên>Tab.tsx` | `AnalyticsTab.tsx`, `AuditLogTab.tsx` |
| Hộp thoại tạo mới | `New<Miền>Dialog.tsx` | `NewProjectDialog.tsx`, `NewTaskDialog.tsx` |
| Module lib | `camelCase.ts` | `useWorkspace.ts`, `taskFilters.ts` |
| Hook | `use<Tên>` | `useWorkspace`, `useProjectEvents`, `useActiveTimer` |
| Module API | `lib/api/<miền>.ts`, export `<miền>Api` | `sprints.ts` → `sprintsApi` |
| Hàm API | Động từ + danh từ, camelCase | `createSprint`, `listWebhooks`, `setTaskSprint` |
| Kiểu dữ liệu | `interface PascalCase` ở `types/models.ts` | `Sprint`, `ScheduledReport`, `DriveItem` |
| Route | thư mục kebab-case dưới `app/` | `app/projects/[id]/sprints/page.tsx` |

**Tên hàm API phải khớp tên handler backend.** `CreateSprint` (Go) ↔
`createSprint` (TS). Nhờ vậy tìm từ đầu này sang đầu kia chỉ cần một lần grep.

### 2.3 Ngôn ngữ hiển thị

- **Chuỗi cho người dùng: tiếng Việt.** `"Sprint mới"`, `"Chưa có dự án nào"`.
- **Định danh, comment, log, mã lỗi: tiếng Anh.** `createSprint`, `not_found`.
- **Không hard-code tiếng Việt trong logic.** Rẽ nhánh theo mã máy
  (`err.code === "no_folder"`), không so chuỗi thông báo — thông báo sẽ đổi.

---

## 3. Quy ước backend

### 3.1 Khung một handler

Mọi handler đi theo đúng thứ tự này. Sai thứ tự là lỗ hổng bảo mật:

```go
func (h *Handlers) CreateSprint(w http.ResponseWriter, r *http.Request) {
    // 1. Danh tính
    userID, _ := auth.UserID(r.Context())

    // 2. Quyền truy cập tài nguyên (trả về sớm nếu hỏng)
    proj, role, ok := h.requireProjectAccess(w, r, userID)
    if !ok {
        return
    }

    // 3. Quyền theo vai trò
    if role == domain.WorkspaceRoleGuest || role == domain.WorkspaceRoleBilling {
        httpx.Error(w, http.StatusForbidden, "forbidden", "insufficient role")
        return
    }

    // 4. Giải mã body
    var req createSprintRequest
    if err := httpx.Decode(r, &req); err != nil {
        httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
        return
    }

    // 5. Kiểm tra dữ liệu
    req.Name = strings.TrimSpace(req.Name)
    if req.Name == "" {
        httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
        return
    }

    // 6. Gọi store
    sp, err := h.Store.Sprints.Create(r.Context(), proj.ID, req.Name, req.Goal)
    if err != nil {
        httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
        return
    }

    // 7. Trả kết quả
    httpx.JSON(w, http.StatusCreated, sp)
}
```

Quy tắc rút ra:

- **Guard trả `(giá trị, ok bool)` và tự ghi lỗi.** Handler chỉ cần `if !ok { return }`.
- **Không lộ sự tồn tại của tài nguyên.** Không phải thành viên ⇒ trả **404
  `not_found`**, không phải 403. Xem `requireSprintAccess`.
- **`httpx.Decode` bật `DisallowUnknownFields`.** Gửi field lạ sẽ lỗi 400 — cố ý,
  để bắt sai chính tả sớm. Đây là lý do `{"slug": ...}` bị từ chối ở
  `AdminCreateWorkspace`.
- **Không bao giờ trả lỗi Postgres thô cho client.** Kiểm tra đầu vào trước, để
  lỗi DB thật sự là chuyện bất ngờ chứ không phải input xấu.

### 3.2 Mã lỗi

Envelope cố định: `{"error": "<code>", "message": "<mô tả>"}`.

Dùng lại mã đã có, đừng bịa mã mới:

| Code | HTTP | Khi nào |
|------|------|---------|
| `validation` | 400 | Body đúng dạng nhưng giá trị sai |
| `invalid_body` | 400 | JSON hỏng / field lạ |
| `invalid_id` | 400 | Tham số URL không phải UUID |
| `unauthenticated` | 401 | Chưa đăng nhập |
| `forbidden` | 403 | Đã đăng nhập, không đủ vai trò |
| `not_found` | 404 | Không tồn tại **hoặc** không được phép thấy |
| `list_failed` / `create_failed` / `update_failed` / `delete_failed` | 500 | Store lỗi |

Mã đặc thù (`no_folder`, `no_timer`, `file_too_large`, `mfa_required`) dùng khi
frontend cần **rẽ nhánh giao diện**, không chỉ hiện thông báo.

### 3.3 Khung một store

```go
type WebhookStore struct{ pool *pgxpool.Pool }

// Một hằng cột dùng chung cho mọi truy vấn ⇒ thêm cột chỉ sửa một chỗ.
const webhookColumns = `id, project_id, url, events, secret, active, ...`

// Một hàm scan dùng chung ⇒ thứ tự cột không bao giờ lệch.
func scanWebhook(row interface{ Scan(...any) error }) (*domain.Webhook, error)
```

- Method nhận `ctx context.Context` là tham số đầu.
- Trả `*domain.X` hoặc `[]domain.X`, **không** trả `pgx.Rows` ra ngoài package.
- Slice trả về **khởi tạo rỗng** (`out := []domain.X{}`), không để `nil` — để JSON
  ra `[]` chứ không phải `null`.
- Nhiều lệnh ghi liên quan ⇒ bọc transaction với `defer tx.Rollback(ctx)`.
- Cập nhật một phần: dùng struct `*string` + cờ `Set<Field> bool` để phân biệt
  "không đổi" với "xoá về NULL" (xem `SprintUpdateFields`).

### 3.4 Migration

- Tên: `NNNN_mo_ta_ngan.sql`, số tăng dần, snake_case. Ví dụ `0027_invites.sql`.
- **File đã chạy là bất biến.** Muốn đổi schema ⇒ tạo file mới.
- Runner khoá theo **tên file đầy đủ**, chạy theo thứ tự lexical. Trùng số vẫn
  chạy được (repo đang có 2 file `0011_*`) nhưng **tránh** vì gây khó đọc.

### 3.5 Router

`internal/server/router.go` lồng theo tài nguyên, tham số URL dạng `{tênIDCamel}`:

```go
r.Route("/projects/{projectID}", func(r chi.Router) {
    r.Get("/sprints", h.ListSprints)
    r.Post("/sprints", h.CreateSprint)
    r.Delete("/webhooks/{webhookID}", h.DeleteWebhook)
})
```

Route mới đặt cạnh nhóm cùng tài nguyên, không thêm vào cuối file.

⚠️ **Endpoint streaming (SSE) phải nằm ngoài `middleware.Timeout`** — dùng
`timeoutExcept`. Timeout toàn cục từng giết kết nối `/events` sau 30 giây.

---

## 4. Quy ước frontend

### 4.1 Đặt component ở đâu

| Thư mục | Chứa gì | Kiểm tra |
|---------|---------|----------|
| `components/ui/` | Không biết gì về miền nghiệp vụ | Copy sang app khác vẫn chạy? → `ui/` |
| `components/layout/` | Khung ứng dụng | Sidebar, TopBar, AppShell, tab bar |
| `components/<miền>/` | Gắn với một miền | `task/`, `project/`, `reports/` |
| `app/**/page.tsx` | Điều phối + lấy dữ liệu | Dùng ở đúng một route |

**Dùng ở ≥2 trang ⇒ tách khỏi `page.tsx`.** Form tạo dự án từng bị chôn trong
`app/workspaces/[id]/page.tsx`, nên dashboard và trang Dự án không có cách nào
tạo mới — đó là lý do tồn tại `components/project/NewProjectDialog.tsx`.

### 4.2 Tầng API

Mỗi miền một file trong `lib/api/`, gộp lại ở `index.ts`:

```ts
// lib/api/sprints.ts
export const sprintsApi = {
  listSprints: (projectId: string) =>
    request<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`)
      .then((r) => r.sprints),   // bóc envelope ngay tại đây
};
```

- **Bóc envelope trong tầng API**, không để component tự `.sprints`.
- **Kiểu dữ liệu chỉ khai báo ở `types/models.ts`**, không định nghĩa cục bộ.
- Component luôn import từ `@/lib/api`, **không** từ `@/lib/api/sprints`.
- `ApiError` mang `status` và `code` — rẽ nhánh theo `code`.

### 4.3 Khung một page

```tsx
"use client";

export default function XPage() {
  const { workspaceId, loading } = useWorkspace();   // 1. lấy ngữ cảnh
  const [data, setData] = useState<T | null>(null);  // 2. state
  const load = useCallback(() => { ... }, [deps]);   // 3. loader
  useEffect(() => { load(); }, [load]);              // 4. gọi

  const actions = (<button className="btn-primary">…</button>);  // 5. nút header

  return (
    <AppShell title="…" actions={actions}>
      {loading && <p>Đang tải…</p>}
      {!loading && !data && <EmptyState />}     {/* 6. rỗng có hướng dẫn */}
      {!loading && data && <Content />}
    </AppShell>
  );
}
```

- **Không đọc `localStorage.activeWorkspaceId` trực tiếp.** Dùng `useWorkspace()`.
  Đọc thẳng từng làm trang Dự án trắng trơn với người chưa bấm workspace switcher.
- **Trạng thái rỗng phải chỉ đường**, không chỉ báo "không có dữ liệu". So sánh:
  ✅ "Chưa có sprint nào. Mọi công việc đang nằm ở backlog. Tạo sprint đầu tiên
  rồi kéo việc vào." + nút hành động.
- **Trang con của dự án phải render `<ProjectTabs projectId={id} />`** — không có
  ngoại lệ. Board từng thiếu và cắt đứt đường tới Sprints/Timeline/Reports.

### 4.4 Style

- Tailwind + token trong `tailwind.config.ts`; class tiện ích chung
  (`.card`, `.btn-primary`, `.btn-ghost`, `.field`, `.chip`) ở `globals.css`.
- Ưu tiên token ngữ nghĩa (`text-on-surface`, `bg-surface-container`) hơn màu thô
  (`text-gray-900`) — token có sẵn dark mode.
- Dark mode ghi đè utility dưới `.dark` trong `globals.css`, vì palette là hex
  cố định nên biến thể `dark:` không remap được. **Thêm màu nền mới ⇒ phải thêm
  ghi đè `.dark` tương ứng**, nếu không sẽ có ô trắng lồi trên nền tối.

---

## 5. Test

| Loại | Nơi đặt | Chạy bằng | Kiểm cái gì |
|------|---------|-----------|-------------|
| Go unit | `internal/**/*_test.go` | `go test ./...` | Logic thuần, thuật toán |
| Go integration | `store/integration_test.go` | cần `TEST_DATABASE_URL` | SQL thật |
| FE unit | `frontend/tests/*.test.mjs` | `npm test` | Lọc, sắp xếp, format |
| E2E | `frontend/e2e/*.spec.ts` | `npm run e2e` | **Đường đi tới tính năng** |

FE unit test chạy `node --experimental-strip-types` trực tiếp trên file `.ts`
gốc — **không chép lại logic vào file test**.

### 5.1 Quy tắc E2E

- Khẳng định **link/nút dẫn tới tính năng tồn tại**, không chỉ khẳng định trang
  đích render khi vào thẳng bằng URL.
- **Chọn phần tử bằng `href` hoặc `data-testid`**, không bằng chữ hiển thị:
  - Accessible name có kèm ligature icon: `"view_kanban Board"`, không phải `"Board"`.
  - Tên ngắn chồng nhau: `/Board/i` khớp cả `"Dashboard"`.
  - Dấu tiếng Việt gây lỗi selector khó đoán.
- Test cần dữ liệu ⇒ `test.skip` khi backend không chạy.

---

## 6. Quy trình đọc code để sửa bug

Đây là quy trình dùng thật cho các bug trong repo này.

### Bước 1 — Tái hiện, ghi lại triệu chứng chính xác

Viết ra **một câu**: cái gì, ở đâu, khác kỳ vọng thế nào.
> "Bấm vào dự án, không thấy Sprint ở đâu."

Chưa đoán nguyên nhân. Đoán sớm dẫn tới sửa nhầm chỗ.

### Bước 2 — Xác định tầng hỏng bằng 2 phép thử

Chạy đúng 2 lệnh trước khi đọc bất kỳ file nào:

```bash
# a) API có trả đúng dữ liệu không?
curl -s -b cookie.txt "http://localhost:8080/api/v1/projects/$PID/sprints"

# b) DB có dữ liệu đó không?
docker exec flowie-db psql -U flowie -d flowie -c "select * from sprints;"
```

| a) đúng | b) đúng | ⇒ Hỏng ở |
|---------|---------|----------|
| ✅ | ✅ | **Frontend** (render / điều hướng / state) |
| ❌ | ✅ | **Handler hoặc store** |
| ❌ | ❌ | **Ghi dữ liệu** hoặc migration |

Bước này cắt khoảng 80% khối lượng code phải đọc.

### Bước 3 — Lần theo dấu vết, đúng một hướng

**Nếu ở backend** — đi ngược từ route:

1. `internal/server/router.go` → grep đường dẫn ⇒ tên handler
2. `internal/handlers/<miền>_handler.go` → đọc handler đó
3. Đi lần lượt 7 bước ở §3.1, hỏi từng bước: *bước này có return sớm không?*
4. Nếu tới được store: `internal/store/<miền>.go` → đọc SQL

**Nếu ở frontend** — đi xuôi từ URL:

1. URL ⇒ `src/app/<đường dẫn>/page.tsx`
2. Page gọi API nào? ⇒ `src/lib/api/<miền>.ts` ⇒ khớp với route backend
3. Dữ liệu về rồi có được **render** không? ⇒ đọc JSX
4. **Prop có thật sự được dùng không?** ⇒ grep tên prop trong chính file đó

Bước 4 chính là chỗ `TopBar` hỏng: `title` và `actions` được destructure nhưng
không hề xuất hiện trong JSX, khiến **mọi nút cấp trang của cả app** vô hình.
Bài học: prop nhận vào không đảm bảo prop được dùng.

```bash
# Mẹo bắt lỗi loại này:
grep -c "actions" src/components/layout/TopBar.tsx
# đếm = 2 (khai báo + kiểu) ⇒ prop nhận mà không dùng ⇒ nghi ngờ
```

### Bước 4 — Sửa nguyên nhân gốc, không sửa triệu chứng

Hỏi: *"Chỗ nào khác cũng dính lỗi này?"*

- Board thiếu `ProjectTabs` ⇒ kiểm tra **cả 9** trang dự án, không chỉ Board.
- `TopBar` nuốt `actions` ⇒ ảnh hưởng **mọi** trang, không riêng Sprint.

```bash
# Đối chiếu toàn bộ, đừng sửa từng cái một:
grep -rln "ProjectTabs" src/app/projects/
```

### Bước 5 — Xác minh ở tầng người dùng thật

Build xanh **không phải** bằng chứng. Thứ tự kiểm chứng:

```bash
# 1. Biên dịch
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npx tsc --noEmit && npm test

# 2. Hành vi thật (API) — dùng cổng RIÊNG, không đụng server của người dùng
cd backend && APP_PORT=8081 go run ./cmd/api
curl -s -X POST localhost:8081/api/v1/... # ca đúng
curl -s -X POST localhost:8081/api/v1/... # ca sai — phải bị từ chối

# 3. Hành vi thật (trình duyệt)
cd frontend && npm run e2e
```

Luôn thử **cả ca hỏng**. Tạo sprint thành công chưa chứng minh gì; từ chối được
`endDate < startDate` mới chứng minh validate hoạt động.

### Bước 6 — Dọn dẹp và chặn tái diễn

- **Xoá sạch dữ liệu thử.** Tạo workspace tạm để test rồi xoá, đừng để rác trong
  workspace thật. Kiểm chứng lại bằng `psql` sau khi dọn.
- **Không tắt tiến trình của người khác.** `pkill -f api` quá rộng — dùng cổng
  riêng và tắt đúng PID theo cổng.
- **Thêm test chặn tái diễn**, đặt tên theo triệu chứng người dùng gặp:
  `"project board shows the tab bar so Sprints is reachable"`.
- Comment lại **lý do**, không phải cách sửa:
  ```tsx
  {/* The board is the project's landing page, but it was the only project
      page without the tab bar — so Sprints/Timeline/Reports were
      unreachable once you clicked into a project. */}
  ```

---

## 7. Danh sách kiểm trước khi báo "xong"

Đánh ✅ chỉ khi **tất cả** đều đúng:

- [ ] `go build ./... && go vet ./... && go test ./...` xanh
- [ ] `gofmt -l ./internal` không in ra gì
- [ ] `npx tsc --noEmit` sạch
- [ ] `npm test` và `npm run build` xanh
- [ ] `npm run e2e` xanh
- [ ] **Đã tự bấm thử đường đi từ sidebar tới tính năng** — hoặc có e2e khẳng
      định đường đi đó
- [ ] Đã thử **ca hỏng**, không chỉ ca đúng
- [ ] Dữ liệu thử đã xoá, đã xác minh bằng `psql`
- [ ] Chuỗi hiển thị bằng tiếng Việt; mã lỗi/định danh bằng tiếng Anh
- [ ] Nền/màu mới có ghi đè `.dark` tương ứng

> **Lý do có mục 6:** đã từng có lượt báo "hoàn thành" với build xanh, typecheck
> sạch và 8/8 e2e pass, trong khi người dùng **không hề thấy được nút nào** vì
> `TopBar` không render `actions`. Trình biên dịch không kiểm tra được điều đó.

---

## 8. Bẫy đã gặp trong repo này

| Bẫy | Dấu hiệu | Cách tránh |
|-----|----------|-----------|
| Prop nhận mà không render | Nút "có trong code" nhưng không hiện | Grep tên prop trong JSX của chính file |
| Trang thiếu tab bar | Vào rồi cụt đường | `grep -rln ProjectTabs src/app/projects/` |
| Đọc `localStorage` trực tiếp | Trang trắng với user mới | Dùng `useWorkspace()` |
| `DisallowUnknownFields` | 400 `invalid_body` khó hiểu | Đối chiếu tên field với struct request |
| Lỗi Postgres thô lọt ra client | `SQLSTATE 23503` trong response | Validate trước khi gọi store |
| Timeout giết SSE | `/events` đứt sau 30s | Giữ streaming ngoài `middleware.Timeout` |
| Selector e2e theo chữ hiển thị | Test đỏ thất thường | Dùng `href` / `data-testid` |
| Avatar base64 trong list API | Payload phình vài trăm KB | Trả chữ cái đầu, không trả `avatarUrl` |
| `pkill` quá rộng | Tắt nhầm server người khác | Tắt theo PID của cổng cụ thể |
