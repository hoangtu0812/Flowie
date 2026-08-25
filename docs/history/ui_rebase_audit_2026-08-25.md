# Kế hoạch khôi phục UI gốc và đấu nối backend Flowie

> Baseline bắt buộc: `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle`
> (`ln-dev7/circle`, commit `778598503e680b4c658d694dd9f65351ee48b3d3`).

## 1. Kết luận audit

Có thể dùng UI gốc làm frontend chính và nối vào backend Flowie hiện tại.

- UI gốc và `apps/web` đều dùng Next.js `15.2.8`, React 19 và cùng bộ dependency UI.
- Flowie Web chỉ có thêm dependency workspace `@circle/contracts`; không có xung đột thư viện.
- Backend Flowie đã có các domain API cần cho Project, Issue, Team, Cycle, Initiative, View,
  Document, Member, Notification và phần lớn Settings.
- Cách sửa frontend trước đây không còn phù hợp để chứng minh parity: trong 221 component gốc,
  chỉ 64 file còn giống byte-for-byte, 144 file đã thay đổi và 13 file bị thiếu. Riêng thư mục
  Project hiện lệch hơn 3.200 dòng so với baseline.
- Vì vậy không tiếp tục sửa parity từng điểm trên frontend hiện tại. UI gốc là source of truth;
  phần backend được đưa vào qua container/hook/adapter riêng.

Checkpoint trước khi đổi chiến lược: `3329f5b` trên `origin/codex/foundation`.

## 2. Quy tắc triển khai mới

1. JSX, `className`, thứ tự DOM, panel, popover, icon, kích thước và responsive behavior lấy từ
   baseline `7785985`.
2. Không đặt `fetch`, DTO API hoặc mapper lớn trong component trình bày.
3. Mỗi domain có lớp riêng:
   - `features/<domain>/api.ts`: request/response API.
   - `features/<domain>/adapters.ts`: map API record sang đúng UI shape gốc.
   - `features/<domain>/hooks.ts`: loading, mutation và refresh.
   - component UI gốc chỉ nhận data/callback qua props hoặc context.
4. Không copy thư mục `mock-data` vào production. Chỉ giữ type/presentation catalog cần cho UI;
   record phải đến từ PostgreSQL qua API.
5. Auth, middleware, trang `/auth`, `/admin`, `/invitations` và workspace guard của Flowie được giữ
   lại vì UI gốc không có backend/auth.
6. Agent và Code Reviews không được mang dữ liệu giả trở lại. Slack/email/desktop vẫn excluded;
   Discord là integration thật.
7. Mỗi lát phải có source diff với baseline, test/build, screenshot light/dark, Docker smoke test,
   commit và push riêng.

## 3. Ma trận chuyển đổi

| Thứ tự | Lát chạy thử | UI lấy từ baseline | Backend hiện có | Việc cần làm |
| --- | --- | --- | --- | --- |
| P0.1 | Shell ứng dụng | `globals.css`, MainLayout, sidebar/header dùng cho Project | Auth, workspace, teams, notifications | Khôi phục DOM/CSS gốc; đưa workspace/auth data qua provider; chỉ giữ các khác biệt excluded đã được duyệt. |
| P0.2 | Project list | Projects list/board/timeline/insights/filter/display | Project CRUD, members, labels, statuses, teams, display defaults | Copy presentation gốc; tách mapper/fetch khỏi `projects.tsx`; nối selector/mutation qua callbacks gốc. |
| P0.3 | Project detail | Overview/Activity/Issues/Peek và header | Detail, issues, updates, attachments, resources, milestones, members, initiatives, favorite, custom fields | Copy component gốc; map API vào `Project`/`ProjectDetail`; chỉ mở dialog từ affordance gốc. |
| P0.4 | Project Settings | labels/statuses/templates/properties/updates | CRUD tương ứng đã có | Khôi phục list/card/dialog gốc rồi nối service; không thêm dashboard/settings mới. |
| P1 | Teams + Issues + Cycles | toàn bộ route và sidebar team gốc | API chính đã có | Chuyển theo cùng pattern adapter; không mang fixture trở lại. |
| P2 | Initiatives + Views + Members + Documents | component/route gốc | API chính đã có | Thay data source và callback, giữ presentation. |
| P3 | Settings còn lại | shell/card gốc | Profile, Security, Discord, notification, releases, SLA, asks... | Nối phần có backend; phần excluded hiển thị unavailable hoặc ẩn theo quyết định sản phẩm. |

## 4. Backend Project đã sẵn sàng để nối

- `GET/POST /api/v1/projects`
- `GET/PATCH/DELETE /api/v1/projects/:projectId`
- issues, updates, attachments, resources, subscription, favorite
- members, milestones, labels, statuses, templates, custom fields
- workspace members, teams, initiatives và display defaults liên quan

Backend chưa cần viết lại để bắt đầu rebase UI. Việc đầu tiên là chuẩn hóa adapter và contract;
chỉ bổ sung API khi một affordance có thật trong UI gốc nhưng matrix contract chứng minh còn thiếu.

## 5. Cách thay frontend an toàn

1. Giữ checkpoint `3329f5b`; không xóa backend/package/database/Docker.
2. Chuyển từng lát P0, không copy đè toàn bộ `apps/web` trong một commit.
3. Với mỗi lát, copy file UI tương ứng từ baseline, sau đó thêm container/adapter ở file mới.
4. Build ngay sau mỗi lát để phát hiện dependency chéo.
5. Chỉ xóa implementation frontend cũ khi lát UI gốc tương ứng đã render và gọi API thành công.
6. Nếu lát không đạt parity hoặc API test, revert đúng commit lát đó; backend và lát trước không bị
   ảnh hưởng.

## 6. Tiêu chí nghiệm thu mỗi lát

- Không có import `@/mock-data` hoặc record fixture trong production.
- Dữ liệu tạo/sửa/xóa vẫn đúng sau refresh và restart Docker.
- API kiểm tra workspace/RBAC; không dùng localStorage làm nguồn dữ liệu nghiệp vụ.
- Production build, lint và test liên quan đều passed.
- So sánh cùng viewport giữa UI gốc chạy ở `localhost:3001` và Flowie ở `localhost:3000`:
  - desktop light;
  - desktop dark;
  - trạng thái list có data;
  - empty state;
  - popover/dialog quan trọng.
- Mọi khác biệt nhìn thấy phải nằm trong danh sách ngoại lệ được duyệt (auth/admin, dữ liệu thật,
  hoặc feature excluded), không được là thiết kế tùy ý.

## 7. Thứ tự thực hiện ngay

1. P0.1 Shell Project.
2. P0.2 Project list để người dùng chạy thử sớm.
3. P0.3 Project detail.
4. P0.4 Project Settings.
5. Chỉ sau khi Project được nghiệm thu mới chuyển sang P1/P2/P3.

