# Flowie — Mục tiêu, tiến độ và kế hoạch tiếp quản

> **Tài liệu bắt đầu dành cho agent tiếp theo.** Đọc tài liệu này trước, sau đó đọc `AGENT_HANDOFF.md` để có lịch sử commit và hướng dẫn kỹ thuật chi tiết. `implement_plan.md` là kế hoạch kiến trúc ban đầu; không phản ánh đầy đủ trạng thái đã hoàn thành.

Last updated: 2026-08-23  
Branch: `codex/foundation`  
Remote: `https://github.com/hoangtu0812/Flowie.git`

## 1. Mục tiêu hiện tại

Biến frontend gốc từ `ln-dev7/circle` thành Flowie — ứng dụng quản lý nhiều loại dự án, tự host được — bằng cách **giữ nguyên UI Circle** và nối dần từng màn hình vào NestJS API, PostgreSQL và các dịch vụ hiện có.

Mục tiêu không phải là viết lại giao diện. Chỉ được bổ sung UI nhỏ nhất cần thiết để một thao tác có backend thật hoạt động. Không được thay đổi navigation, bố cục, ngôn ngữ thị giác, hoặc thay danh sách/bảng gốc bằng thiết kế mới.

## 2. Nguyên tắc bắt buộc

- Dữ liệu hoặc thao tác nào chưa có backend phải hiển thị rõ là không khả dụng; không dùng mock, không giả vờ đã lưu.
- Đây là sản phẩm quản lý dự án tổng quát, không phải công cụ code review.
- Code review/PR, Slack, email, desktop/mobile notification và các màn hình session/passkey/API key/connected account giả **không được bật**. Discord là tích hợp outbound hiện được hỗ trợ.
- Mỗi lát cắt hoàn chỉnh phải được kiểm tra, commit và push lên `origin/codex/foundation`.
- Startup nội bộ phải offline: `./scripts/start-local.ps1` chỉ chạy image hiện có, không install/pull/build.
- Trước khi cài dependency, pull image hoặc chủ động rebuild Docker, phải báo người dùng chuyển sang 5G.
- Không dùng `git reset --hard`, `git checkout --` hay xoá thay đổi chưa xác định của người dùng.

## 3. Kiến trúc và cách chạy

- Frontend: Next.js 15 (`apps/web`)
- Backend: NestJS (`apps/api`)
- Persistence: Prisma/PostgreSQL; Redis, MinIO và worker qua Docker Compose
- UI: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Health: `http://localhost:4000/api/v1/health`

Chạy offline:

```powershell
.\scripts\start-local.ps1
```

Khi người dùng xác nhận đang dùng 5G, rebuild có chủ đích:

```powershell
pnpm docker:build
docker compose --profile app up -d --no-build --pull never --force-recreate api web
```

## 4. Tiến độ đã xác minh

Tất cả commit bên dưới đã được push. Commit tài liệu gần nhất là `0097207`; commit tính năng gần nhất là `8c6bbd8`.

| Nhóm chức năng | Trạng thái thực tế |
| --- | --- |
| Runtime/Docker/database | Hoạt động; các image hiện có khởi chạy offline bằng script. |
| Auth và workspace | Login/session/workspace resolution thật; OAuth, reset password, email verification, SSO chưa làm. |
| Teams và members | Màn Teams, team overview/members/documents và workspace members dùng API; các tạo mới đã có trên màn đã migrate. |
| Projects | Danh sách, tạo project, lead, issue progress, header, Overview/Issues/Activity dùng API. |
| Issues | Danh sách, tạo/sửa trường cơ bản, filter options, My issues, labels CRUD, cycles, saved views và subscriptions dùng dữ liệu thật. Issue detail, properties, assignee, status/priority, comments/activity/subscribe và Issue attachment đã live trong source. Docker runtime verification cho attachment đang chờ 5G. |
| Initiatives & documents | Initiative list/detail/create/link project; team documents đã live. |
| Inbox & Discord | Inbox read/delete/unread badge lưu thật; cấu hình Discord workspace đã có. |
| Settings | Profile, issue labels, project statuses, project templates và preference browser-local đã được audit/nối phù hợp. Các option không có backend đã được disable minh bạch. |
| Admin/RBAC/audit | Chưa hoàn thiện; không được quảng bá là chức năng production-ready. |

Các commit mốc quan trọng:

- `8e7da47`: khôi phục giao diện workspace Circle gốc, bỏ thẻ quảng cáo.
- `498afe9`: Issues UI, option, create/update và sidebar teams dùng API.
- `cf16225`: Initiatives thật, kèm migration properties.
- `a3461d4`: Inbox hai pane dùng notification API.
- `83ef453`: My issues và subscription/activity thật.
- `7aa709a`: Issue labels CRUD thật.
- `54252b7`: Issue comments/activity/subscribe thật.
- `dfd0496`: Issue detail và properties/assignee/header lấy dữ liệu API.
- `8c6bbd8`: Paperclip UI gốc upload/list/download Issue attachment qua API thật; production web build đã pass, Docker verification đang chờ 5G.

Lịch sử đầy đủ và kiểm chứng từng commit nằm trong `AGENT_HANDOFF.md`.

## 5. Điểm bắt đầu chính xác

### Việc cần làm trước khi tiếp tục: runtime verification Attachment của Issue detail

UI đích: `apps/web/components/common/issues/details/issue-details.tsx`.

Paperclip ở Issue detail đã được nối vào Attachment API tại `8c6bbd8`. Mã nguồn và production web build đã được xác minh, nhưng container `web` đang chạy chưa chứa thay đổi vì chưa được phép rebuild Docker. Agent tiếp theo cần:

1. Chỉ khi người dùng xác nhận 5G: rebuild `web`, recreate với `--no-build --pull never`, và vào Issue detail đã đăng nhập.
2. Upload file nhỏ từ Paperclip, refresh trang để xác nhận persistence, tải file xuống, và thử file lớn hơn 10 MB để xác nhận feedback client.
3. Ghi rõ kết quả runtime vào hai tài liệu này rồi commit/push documentation.
4. Không mở rộng sang comment attachment, reaction, sub-issue hay relation trong lần xác minh này.

## 6. Backlog theo thứ tự ưu tiên

Chỉ làm **một vertical slice** rồi xác minh/commit/push trước khi sang mục tiếp theo.

1. **Xác minh runtime Issue attachments** — mô tả chính xác ở phần 5.
2. **Issue detail còn lại** — label editing nếu API hỗ trợ; sub-issues, reactions, relations chỉ làm khi có schema/API/permission đầy đủ. Nếu chưa có thì giữ unavailable.
3. **Command palette, sidebar, search** — audit mọi mock team/project/user; dùng live loaders hoặc ghi unavailable. Chỉ thiết kế server search khi cần thật.
4. **Audit toàn bộ mock data** — chạy:

   ```powershell
   rg -l "@/mock-data|mock-data/" apps/web --glob '*.{ts,tsx}'
   ```

   Phân loại từng kết quả: `migrated`, `presentation-only`, `unavailable`, hoặc `deferred`. Không tuyên bố mock-free chỉ dựa vào số import.
5. **Nâng chuẩn production sau core migration** — admin/RBAC/audit log, auth hardening, export/import, webhook/automation, analytics, AI. Mỗi mục cần thiết kế và API contract riêng, không tự mở rộng scope.

## 7. Những phần cố ý chưa triển khai

Không coi đây là lỗi UI:

- Delivery qua email/Slack/desktop/mobile; code review/PR.
- Fake sessions, passkeys, personal API keys, connected social accounts.
- Issue reactions, comment attachments, sub-issues, issue relations/PR links.
- SLA/project-label/project-update/customer-request/release/pulse/ask/emoji settings khi chưa có schema/API.
- Project template edit/apply (API hiện chỉ list/create).
- Inbox snooze (chưa có state/scheduler).
- External OAuth/SSO, advanced RBAC/audit, webhooks, automation, analytics và AI.

Màn hình tương ứng phải giữ layout gốc và thể hiện unavailable, không dùng bản ghi minh hoạ.

## 8. Quy trình tiếp quản và bàn giao

Trước khi code:

1. Đọc `CONTINUATION.md`, `AGENT_HANDOFF.md`, rồi chạy `git status --short`.
2. Xem git log gần nhất; thay đổi chưa commit là của người dùng cho đến khi xác minh ngược lại.
3. Xem component UI gốc, controller/service và Prisma schema trước khi sửa.
4. Chỉ bắt đầu khi biết mutation có endpoint thật hoặc sẽ bổ sung đầy đủ migration/service/controller/permission trong cùng lát cắt.

Khi kết thúc lát cắt:

1. Chạy kiểm tra liên quan (`pnpm --filter @circle/web build` cho UI; API test khi backend đổi).
2. Chỉ rebuild Docker khi người dùng đang 5G và đã báo trước.
3. `git diff --check`, kiểm tra `git status --short`.
4. Commit/push feature lên `origin/codex/foundation`.
5. Cập nhật hai tài liệu bàn giao với: hash, hành vi thật, kiểm chứng, limitation và mục tiếp theo; commit/push tài liệu riêng nếu thực tế.

## 9. Quy ước kỹ thuật không được phá vỡ

- API base: `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'`.
- Fetch có xác thực phải dùng `credentials: 'include'`.
- Lấy workspace qua `GET /workspaces/me`; không hard-code ID.
- URL sidebar dùng team `identifier`, còn mutation thường cần database `id`; phải resolve đúng trước khi gọi API.
- API chỉ select các trường user an toàn, không dùng Prisma `user: true` vào response.
- Mọi UI migrated phải có loading/empty/error và mutation survive refresh.
- Dùng `apply_patch` để sửa mã nguồn.

## 10. Rủi ro/khoản nợ đã biết

- `pnpm` lint hiện fail do lỗi có sẵn `react/display-name` ở `apps/web/store/issues-store.ts` (khoảng dòng 128). Không nói lint pass cho đến khi xử lý riêng.
- Docker frontend đôi khi báo `socket hang up` khi Next retry dữ liệu browser-list; cached build vẫn hoàn thành. Không biến startup thường ngày thành thao tác cần network.
- Một số file mock còn phục vụ presentation metadata (icon/màu/type) lẫn records; cần audit thay vì xoá mù quáng.

---

**Tiêu chí hoàn thành của pass hiện tại:** user quản lý được dữ liệu core bằng UI Circle gốc, mọi phần đã migrate lưu thật và không còn fake data/action trong các module đó. Đây không phải tiêu chí để tuyên bố toàn bộ sản phẩm hay các hạng mục enterprise đã hoàn thành.
