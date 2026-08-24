# Flowie — Mục tiêu, tiến độ và kế hoạch tiếp quản

> **Tài liệu bắt đầu dành cho agent tiếp theo.** Đọc tài liệu này trước, sau đó đọc `AGENT_HANDOFF.md` để có lịch sử commit và hướng dẫn kỹ thuật chi tiết. `implement_plan.md` là kế hoạch kiến trúc ban đầu; không phản ánh đầy đủ trạng thái đã hoàn thành.

Last updated: 2026-08-24
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
- PostgreSQL host port mặc định: `5433` (container nội bộ vẫn là `5432`, có thể override bằng `POSTGRES_PORT`).

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

Tất cả commit bên dưới đã được push. Commit tính năng gần nhất là `adf1cc8`; tài liệu này được cập nhật cùng từng lát cắt hoàn chỉnh.

| Nhóm chức năng          | Trạng thái thực tế                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/Docker/database | Hoạt động; API và web mới nhất đã rebuild/recreate, health API và login route đều HTTP 200. PostgreSQL host port mặc định là 5433 để không đụng project khác.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Auth và workspace       | Login/session/workspace resolution thật; OAuth, reset password, email verification, SSO chưa làm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Teams và members        | Màn Teams, team overview/members/documents và workspace members dùng API; các tạo mới đã có trên màn đã migrate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Projects                | Danh sách, tạo project, issue progress, header, Overview/Issues/Activity dùng API. Tại Project list gốc, lead/priority/status/target date và Project label nay lưu qua `PATCH /projects/:id`, lead lấy thành viên workspace thật và activity được ghi. Settings Project labels có CRUD riêng, không lẫn Issue labels; list/board hiển thị label đã lưu và list có selector gán/bỏ gán. Timeline peek hiển thị Project/Issue/Milestone/Initiative từ API; Saved View không có mutation Project được disable thay vì giả lưu. Health popover nay lưu Subscribe/Unsubscribe và New update vào PostgreSQL, hiển thị update gần nhất, ghi Activity, gửi Inbox cho subscriber và enqueue Discord khi webhook có cấu hình.                                                                                                                                                                                                                                                                                                                       |
| Issues & cycles         | Danh sách Issues, tạo/sửa trường cơ bản, filter options, My issues, labels CRUD, cycles, saved views, subscriptions, due dates, archive và command palette dùng dữ liệu thật. Cycle detail gốc đã link/unlink Document bằng migration/API thật; chỉ Document workspace dùng chung hoặc cùng team mới được phép gán. Issue “Add link…” và phần Related issues giờ lưu quan hệ Issue–Issue thật, yêu cầu quyền với cả hai Issue, ghi Activity trên cả hai và chống self/duplicate link. Label selector trong Issue properties đã gán/bỏ Label qua API thật. Sub-issues hiện là hierarchy parent/child persisted, chỉ trong cùng team, list/create từ Issue detail gốc và ghi parent Activity. Issue detail, properties, assignee, status/priority, comments/activity/subscribe, Issue attachment và context-menu actions đã live trong Docker. Status/priority/assignee/label/project chỉ đổi UI sau API success; khi thiếu workspace hoặc API lỗi không tạo local-only state. Thao tác authenticated end-to-end còn cần xác minh thủ công. |
| Initiatives & documents | Initiative list/detail/create/link project; team documents đã live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Inbox & Discord         | Inbox read/delete/unread badge lưu thật; cấu hình Discord workspace đã có.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Sidebar navigation      | Inbox badge và Settings “Your teams” dùng API thật. Reviews/Agent giữ UI gốc nhưng unavailable, không đi vào mock workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Settings                | Profile, Team settings, issue labels, project labels, project statuses, project templates và preference browser-local đã được audit/nối phù hợp. AI & Agents/Slack không có backend trong phạm vi Flowie nên hiển thị unavailable, không còn trạng thái Enabled hay click rỗng. Các option không có backend khác cũng disable minh bạch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Admin/RBAC/audit        | Chưa hoàn thiện; không được quảng bá là chức năng production-ready.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Các commit mốc quan trọng:

- `8e7da47`: khôi phục giao diện workspace Circle gốc, bỏ thẻ quảng cáo.
- `498afe9`: Issues UI, option, create/update và sidebar teams dùng API.
- `cf16225`: Initiatives thật, kèm migration properties.
- `a3461d4`: Inbox hai pane dùng notification API.
- `83ef453`: My issues và subscription/activity thật.
- `7aa709a`: Issue labels CRUD thật.
- `54252b7`: Issue comments/activity/subscribe thật.
- `dfd0496`: Issue detail và properties/assignee/header lấy dữ liệu API.
- `8c6bbd8` đến `c5d2d73`: Attachment, due date, context menu, command palette, sidebar, Team settings và cycle badge đã nằm trong image API/web đã rebuild; Docker API health và web login route đều HTTP 200. Xác minh mutation khi đã đăng nhập vẫn chưa thực hiện.
- `0c8ca1c`: Docker PostgreSQL host port mặc định chuyển sang `5433`, tránh xung đột cổng `5432` với project khác.
- `098d5f8`: Project list gốc persist lead/priority/status/target date qua API thật; DTO validate target date, lead phải là active workspace member, mỗi update ghi project activity. API tests 4 suites/8 tests, API build, TypeScript web và Docker rebuild/recreate với API/login route HTTP 200 đều pass. Acceptance mutation qua browser đăng nhập còn chờ xác minh.
- `cf59ca6`: Issue store/context menu/command palette/selectors/board drag-drop chờ Issue API success trước khi cập nhật state status/priority/assignee/label/project; error không còn để lại thay đổi local giả. TypeScript web, API tests 4 suites/8 tests, Docker web production build/recreate cùng API/login route HTTP 200 đều pass. Acceptance mutation qua browser đăng nhập còn chờ xác minh.
- `37d7b67`: Timeline Project peek bỏ `mock-data` cho Project/detail/team; dùng Project, Issue, Milestone, Initiative API thật, có loading/error/empty state. Các control không có contract (favorite, Slack, project labels, custom properties) unavailable rõ ràng. TypeScript web, API build/tests 4 suites/8 tests, Docker API/web production rebuild/recreate cùng health/login route HTTP 200 đều pass. Browser automation xác nhận chưa có session login, nên acceptance mutation vẫn chờ user đăng nhập.
- `3a0a8f8`: Xoá Project update store và ba Project side-panel/outline component không được import bởi route/UI nào, nên không còn giữ luồng mock có thể được gọi nhầm. Health popover giữ layout gốc nhưng Subscribe/New update disabled rõ ràng vì chưa có contract backend. TypeScript web và Docker frontend production rebuild/recreate pass; API health và login route HTTP 200.
- `a4ce762`: Bổ sung migration `project_updates`/`project_subscriptions`, API list/create update và subscribe/unsubscribe có workspace/team authorization. Health popover gốc được nối API, không optimistic-write; tạo update tự subscribe người tạo, ghi Activity và chỉ Inbox subscriber khác, đồng thời enqueue Discord. API test 5 suites/11 tests, API build, TypeScript web, Docker API/web production rebuild/recreate, migration PostgreSQL, health/login route đều pass. Acceptance trong browser đã đăng nhập còn chờ xác minh.
- `8eae2d4`: Bổ sung migration `project_labels`/`project_label_links`, Project label CRUD tại Settings và gán/bỏ gán qua `PATCH /projects/:id`. Project labels tách biệt hoàn toàn Issue labels; list/board nhận labels từ API, selector giữ state cũ và báo lỗi nếu PATCH fail. API test 6 suites/15 tests, API build, TypeScript web, Docker API/web production rebuild/recreate, migration PostgreSQL, health/login route đều pass. Acceptance trong browser đã đăng nhập còn chờ xác minh.
- `b82e8fb`: AI & Agents/Slack Settings không còn hiển thị Enabled hoặc handler rỗng; tất cả service không có backend bị unavailable rõ ràng. Cycle “Add document or link” cũng bị disable vì chưa có Cycle–Document/Link contract. TypeScript web, Docker frontend production build/recreate, API health và login route HTTP 200 pass.
- `575e4d9`: Bổ sung migration `20260824120000_cycle_documents`, API protected list/link/unlink Document cho Cycle và dialog/list thao tác trong Cycle details panel gốc. API chỉ nhận Document shared-workspace hoặc cùng team Cycle; giao diện chỉ đổi sau API success. Docker API/web production build pass, migration đã có trong PostgreSQL, health API và login route HTTP 200. Acceptance đã đăng nhập còn chờ xác minh.
- `83eede8`: Bổ sung migration `20260824130000_issue_relations`, API list/link/unlink quan hệ Issue–Issue có authorization cho cả source/target, Activity cho cả hai Issue, đồng thời mở lại “Add link…” và Related issues trong UI Circle gốc. Link tự thân bị từ chối; link đảo chiều/trùng lặp idempotent. Docker API/web production build pass, migration đã có trong PostgreSQL, health API và login route HTTP 200. Acceptance đã đăng nhập còn chờ xác minh.
- `adcc84f`: Nối selector Labels trong Issue details panel gốc vào Issue API đang có. Label options là record workspace thật; gán/bỏ chỉ phản ánh sau API success, không còn chỉ xem Label ở trang chi tiết. Web production image rebuild/recreate và login route HTTP 200 pass. Acceptance đã đăng nhập còn chờ xác minh.
- `adf1cc8`: Bổ sung migration `20260824140000_issue_sub_issues`, quan hệ Issue cha–con persisted và endpoint list Sub-issues. Tạo Sub-issue tại Issue detail gốc luôn dùng workspace/team của parent; backend từ chối parent sai team, ghi Activity parent và UI chỉ reload sau API success. Docker API/web production build pass; migration/cột và route API đã xác minh; health API/login route HTTP 200. Acceptance đã đăng nhập còn chờ xác minh.

Lịch sử đầy đủ và kiểm chứng từng commit nằm trong `AGENT_HANDOFF.md`.

## 5. Điểm bắt đầu chính xác

### Việc cần làm trước khi tiếp tục: authenticated acceptance verification Project list, Attachment, Issue relation, Cycle Document link, Due date, Context menu, Command palette, Sidebar và Team settings

UI đích: `apps/web/components/common/issues/details/issue-details.tsx`.

Project list tại `098d5f8` đã nối lead/priority/status/target date vào `PATCH /projects/:id`; `8eae2d4` nối Project label settings/list selector vào Project API/Migration thật; `cf59ca6` đảm bảo status/priority/assignee/label/project ở Issue chỉ đổi state sau API success; `37d7b67` nối timeline Project peek vào Project/Issue/Milestone/Initiative API; `a4ce762` nối Subscribe/Unsubscribe/New update trong Health popover vào Project API/Migration thật; Paperclip ở Issue detail đã được nối vào Attachment API tại `8c6bbd8`, due date đã được nối vào `PATCH /issues` tại `603c994`, context menu đã nối subscription/archive tại `ca19039`, command palette đã nối API workspace/cycle tại `74e21c7`, sidebar đã bỏ mock records tại `f7994e1`, và Team settings đã bỏ mock data/click rỗng tại `398a432`. Image `api`/`web` đã rebuild/recreate ngày 2026-08-24; `GET /health` và `/auth/login` đều HTTP 200. Browser automation xác nhận local app đang ở Login và không có session sẵn; agent không tự tạo/đăng nhập account. Agent tiếp theo cần xác minh các mutation trong một browser đã đăng nhập:

1. Vào Project list/Health popover/Issue detail/command palette đã đăng nhập (chỉ rebuild lại khi source/image đã thay đổi và người dùng xác nhận 5G).
2. Đổi lead/priority/status/target date của một Project thử nghiệm, refresh từng lần và xác nhận Activity ghi lại thay đổi; thử lead ngoài workspace nếu có để xác nhận API từ chối.
3. Tạo/sửa/xoá Project label trong Settings, refresh mỗi lần; trong Project list gán/bỏ gán label bằng selector và refresh để xác nhận chip/list/board persist. Thử một label ngoài workspace qua API nếu có để xác nhận API từ chối.
4. Trong Health popover của Project thử nghiệm, subscribe/unsubscribe và refresh để xác nhận persistence; tạo một New update, refresh để thấy record/author/timestamp, kiểm tra Activity và Inbox của một subscriber khác nếu có. Không claim delivery Discord nếu workspace chưa cấu hình webhook thật.
5. Upload file nhỏ từ Paperclip, refresh trang để xác nhận persistence, tải file xuống, và thử file lớn hơn 10 MB để xác nhận feedback client.
6. Đặt và xoá due date trong command palette, refresh để xác nhận hai mutation đều persisted.
7. Trong context menu, subscribe/unsubscribe rồi refresh; archive một Issue thử nghiệm sau confirm và xác nhận item biến mất khỏi danh sách thật.
8. Trong command palette, kiểm tra assignee/status/label/project đều là record của workspace thật; chuyển Issue sang cycle rồi xoá cycle, refresh sau từng thao tác.
9. Mở Cycle detail, link một Document existing shared-workspace/cùng team, refresh rồi unlink và refresh; Document thuộc team khác không được xuất hiện hoặc gán được.
10.   Từ context menu Issue, dùng Add link chọn Issue khác được phép, refresh cả hai Issue để xác nhận Related issues và Activity; unlink rồi refresh. Self-link và Issue của team không được truy cập phải bị API từ chối.
11.   Tạo một Sub-issue tại Issue detail, refresh parent để xác minh child xuất hiện, mở child và kiểm tra parent Activity; parent khác team phải bị API từ chối.
12.   Kiểm tra badge Inbox và Settings “Your teams” phản ánh API; Reviews/Agent vẫn unavailable.
13.   Mở một Team settings thật và xác minh team/member/status/cycle cùng các link real; settings chưa có API phải unavailable.
14.   Ghi rõ kết quả runtime vào hai tài liệu này rồi commit/push documentation.
15.   Không mở rộng sang comment attachment hay reaction trong lần xác minh này.

## 6. Backlog theo thứ tự ưu tiên

Chỉ làm **một vertical slice** rồi xác minh/commit/push trước khi sang mục tiếp theo.

1. **Xác minh runtime Issue attachments** — mô tả chính xác ở phần 5.
2. **Issue detail còn lại** — reactions chỉ làm khi có schema/API/permission đầy đủ. Nếu chưa có thì giữ unavailable.
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
- Issue reactions, comment attachments, PR links.
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
