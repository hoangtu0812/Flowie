# Flowie — Rà soát mức độ hoàn thiện sản phẩm

- Ngày: 2026-10-15 (+07).
- Đây là baseline trước triển khai. Trạng thái thực hiện hiện tại nằm trong [tracker](product-completeness-implementation-plan.md); đối chiếu code đã merge và workflow nằm trong [hồ sơ release](release-evidence-2026-10-15.md).
- Baseline: `main`, `f3ae6aec83123948c02dd2841a5e6872f5fdd4e7`.
- Phạm vi: mã Web/API/worker, schema Prisma, E2E, workflow và tài liệu hiện có.
- Đây là báo cáo đánh giá, chưa phải đợt triển khai. Không thay đổi mã ứng dụng hoặc dữ liệu production.
- Bằng chứng: đọc luồng mã; kiểm chứng hai vấn đề quyền bằng các public handler trên PostgreSQL thử cục bộ, dữ liệu tổng hợp trong transaction được rollback. Chưa chạy lại giao diện production bằng tài khoản người dùng trong lần rà soát này.
- P1: sửa trước đợt mở rộng chức năng. P2: đợt hoàn thiện kế tiếp. P3: theo nhu cầu sử dụng thực tế.

## 1. Kết luận

Flowie đã có nền tảng quản lý task/bug, dự án, initiative, tài liệu có lịch sử, comment/reply/mention, tìm kiếm, thông báo, review SCM, MCP và local AI runner. Không cần xây lại các phần này.

Ưu tiên tiếp theo là tính nhất quán của quyền truy cập và các luồng đang có: đã phát hiện hai vấn đề quyền tái hiện được, một trang còn thiếu provider, một liên kết settings không có route, và thống kê chưa bao phủ toàn bộ dữ liệu phân trang. Sau đó mới bổ sung thao tác hàng loạt, công việc định kỳ và phục hồi dữ liệu.

## 2. Lỗi và khoảng trống cần xử lý

| ID | Ưu tiên | Hiện trạng / bằng chứng | Việc cần làm và tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| AUD-01 | P1 — quyền truy cập | Thành viên workspace không thuộc team bị từ chối đọc project trực tiếp (403), nhưng API initiatives vẫn trả project của team đó trong `projectLinks`. Đã tái hiện bằng handler public và DB thử. `_project` của initiative không nhận actor/workspace để kiểm tra quyền. | Dùng chính sách đọc project thống nhất cho list/detail/initiative/search/MCP; lọc trước khi hydrate và tính count/progress. Thành viên ngoài team không nhận metadata dự án, lead, ID/trạng thái issue hoặc aggregate của dự án bị hạn chế. |
| AUD-02 | P1 — luồng Projects | API danh sách lấy mọi project của workspace rồi gọi `_project` từng bản ghi. Khi gặp project của team người dùng không tham gia, toàn bộ list bị 403. DB thử có project được phép đọc nhưng list vẫn thất bại. | Áp dụng điều kiện quyền ngay tại truy vấn danh sách; trả các project được phép đọc. Test workspace có nhiều team, project không có team, member/admin và thu hồi membership. Không nuốt lỗi quyền bằng cách trả list rỗng giả. |
| AUD-03 | P1 — Saved Views | Header của `/[orgId]/view/[viewId]` gọi `useProjectsData` vô điều kiện; page và các layout không có `ProjectsDataProvider`. Project view body cũng cần context này. Đây là cùng nguyên nhân crash đã sửa cho initiative, xác định từ mã nguồn. | Đặt provider đúng phạm vi hoặc tách dữ liệu/header theo loại view. E2E mở issue view và project view bằng URL trực tiếp, reload, chuyển workspace và trường hợp view không tồn tại. |
| AUD-04 | P1 — điều hướng settings | Team settings dẫn đến `settings/issue-statuses`, nhưng không có page/redirect tương ứng trong app hiện tại. | Cung cấp trang quản lý trạng thái thật hoặc dẫn đến nơi quản lý đúng. Kiểm thử toàn bộ liên kết settings; vẫn kiểm tra quyền quản lý ở API. |
| AUD-05 | P1 — độ đúng của báo cáo | Issue query tải 100 bản ghi/lượt. Header Saved View tính số lượng bằng `issues.filter`, Insights nhận mảng issue đã tải. Tổng và biểu đồ có thể thiếu, thay đổi khi bấm tải thêm; header còn lặp một phần logic filter riêng. | Tổng/aggregate phía server dùng cùng bộ lọc và ACL với danh sách. Test >100 issue, label/priority/assignee/team, so sánh trước/sau Load more; không thay đổi số liệu vì tải thêm trang. |
| AUD-06 | P1 — phục hồi lỗi UI | Có `loading.tsx`, `not-found.tsx`, nhưng chưa có `error.tsx`/`global-error.tsx`. Một số hook gộp lỗi tải thành “not found” hoặc chỉ toast. | Error boundary theo khu vực, Retry, quay lại workspace, mã lỗi hỗ trợ; phân biệt 403/404/offline/server error. Giữ draft khi có thể; không tự lặp mutation khi Retry. |
| AUD-07 | P2 — tải lớn | List project/initiative chưa phân trang; hydrate nhiều truy vấn cho từng project, initiative và project liên kết. Lịch sử project/initiative có chỗ cắt ở 100 mà chưa có cursor. | Repository đọc theo batch, DTO danh sách gọn, cursor và tải chi tiết khi cần. Benchmark trên fixture lớn; số query không tăng tuyến tính theo số phần tử trong một page; lịch sử cũ vẫn truy cập được. |
| AUD-08 | P1 — quan sát vận hành | Readiness hiện kiểm tra mở cổng TCP của PostgreSQL/Redis/MinIO. Audit/correlation cho MCP đã có; chưa thấy hệ thống thu lỗi frontend và theo dõi worker toàn ứng dụng trong repo. | Tách liveness/readiness; kiểm tra DB query, Redis và storage với timeout phù hợp; theo dõi heartbeat, queue lag và số retry thất bại. Log có request ID, phiên bản/SHA; lọc token, nội dung riêng tư trước khi gửi telemetry. |
| AUD-09 | P1 — phục hồi vận hành | Tài liệu nhắc backup nhưng chưa thấy lịch backup, retention và bằng chứng diễn tập restore trong repo. Không kết luận CT107 không có backup ngoài repo. | Kiểm kê cấu hình thực tế, backup nhất quán DB/object storage, lưu bản ngoài máy chủ, cảnh báo backup lỗi và diễn tập restore vào môi trường phục hồi cô lập. Ghi RPO/RTO đo được và cách rollback ứng dụng tương thích schema. Đây không phải môi trường staging triển khai. |
| AUD-10 | P1 — chống tái phát | 69 E2E đã đạt ở đợt sửa trước, nhưng chưa bao phủ các Saved View/multi-team permission vừa phát hiện. Test thành công không đồng nghĩa mọi route đều được kiểm chứng. | Bổ sung ma trận route × vai trò × dữ liệu rỗng/lớn/lỗi, đặc biệt URL trực tiếp, refresh, chuyển account/workspace, danh sách có cả dữ liệu được phép và bị hạn chế. |
| AUD-11 | P2 — nghiệm thu AI thật | Local runner, token scope, lease, CI evidence, cancel và run state đã có. Luồng Codex xử lý bug thật đến PR vẫn chờ project/bug do người dùng chỉ định. | Nghiệm thu một bug thật, bao gồm test thất bại, cancel, token hết hạn, mất lease, PR evidence và review. Chỉ đánh dấu đạt khi có bằng chứng chạy thật; giữ quyền merge độc lập với quyền AI sửa code. |
| AUD-12 | P2 — phiên bản và tài liệu | Kế hoạch cũ còn ghi `IN_REVIEW`/chưa deploy dù PR đã merge. Build mặc định đọc release đã đánh số đầu tiên trong CHANGELOG; các thay đổi mới vẫn ở Unreleased nên chưa được phản ánh trong release notes mặc định. Có env override nên chưa kết luận UI production đang hiển thị phiên bản nào. | Cập nhật trạng thái kế hoạch bằng evidence, phân biệt deploy SHA với version release. Chuẩn bị release theo AGENTS: commit version/changelog → deploy đúng commit → verify → annotated tag/GitHub release. Không gắn tag lại vào commit chưa được xác minh. |

### Bằng chứng kiểm thử quyền

Fixture có một member hoạt động trong workspace, một project không có team mà member được xem, một project thuộc team khác mà member không tham gia, và initiative liên kết project bị hạn chế.

```text
accessible_project_detail: 200
restricted_project_detail: 403
workspace_project_list: 403
initiative_exposes_restricted_project: true
fixture_transaction: rolled back
```

Đây là kết quả gọi public handler trên DB cục bộ, chưa phải kiểm thử HTTP qua proxy hoặc xác nhận có sự cố truy cập dữ liệu thực tế trên production.

### Điểm đối chiếu trong mã nguồn

- AUD-01: `apps/api-python/app/domains/native_initiatives.py:94`, `:145`, `:210`.
- AUD-02/07: `apps/api-python/app/domains/native_projects.py:624`, `:652`, `:1110`.
- Chính sách team hiện tại: `apps/api-python/app/modules/access/projects.py`.
- AUD-03: `apps/web/app/[orgId]/view/[viewId]/page.tsx`; `apps/web/components/layout/headers/view/header.tsx:20`; `apps/web/components/common/views/view-details.tsx:86`.
- AUD-04: `apps/web/components/common/settings/team-settings.tsx:214`.
- AUD-05: `apps/web/features/issues/issue-query.ts:27`; header view `:23`; view details `:77`; `components/common/issues/insights-panel.tsx`.
- AUD-08: `apps/api-python/app/core/readiness.py:21`; background jobs trong `app/main.py`.
- AUD-12: `apps/web/next.config.ts`; `CHANGELOG.md`; `docs/workflow-completion-plan.md`.

## 3. Tính năng nên bổ sung hoặc mở rộng

Các mục dưới đây là đề xuất sản phẩm; chưa triển khai trong lần rà soát này.

| ID | Ưu tiên | Tính năng | Giá trị và phạm vi đề xuất |
| --- | --- | --- | --- |
| NEXT-01 | P2 | Thao tác task/bug hàng loạt | Chọn nhiều issue để đổi assignee/status/priority/label/cycle/project. Hiển thị preview, số mục được phép và lỗi từng mục; chống ghi đè version mới. Phân biệt chọn trang hiện tại với chọn toàn bộ kết quả tìm kiếm. Chưa thấy luồng bulk hoàn chỉnh trong UI/API đã rà soát. |
| NEXT-02 | P2 | Công việc định kỳ và mở rộng automation | Team settings hiện có dòng Recurring issues nhưng chưa có thao tác cấu hình. Bổ sung lịch/timezone, mẫu issue, assignee, hạn xử lý, pause và lịch sử chạy. Tận dụng automation/dispatcher đã có; chống tạo trùng và vòng lặp rule. |
| NEXT-03 | P2 | SLA theo giờ làm việc và escalation | SLA hiện đã gán deadline bằng số phút. Mở rộng lịch làm việc/ngày nghỉ/timezone, tạm dừng khi chờ phản hồi, cảnh báo sắp trễ/quá hạn và đổi người chịu trách nhiệm. Báo cáo SLA phải dùng dữ liệu server, có lịch sử thay đổi policy. |
| NEXT-04 | P2 | Trung tâm lưu trữ và khôi phục | Hiện đã có archive nhiều entity, restore team và revision tài liệu; thiếu luồng phục hồi thống nhất cho người dùng. Bổ sung khu vực Archived/Trash, xem ảnh hưởng, khôi phục theo quyền và thời hạn. Việc purge attachment phải có chính sách riêng và bằng chứng backup. |
| NEXT-05 | P2 | Import/export dữ liệu nghiệp vụ | CSV task/bug có mapping cột, preview, validation, xử lý trùng và báo lỗi từng dòng; export theo filter và quyền. Export tài liệu kèm liên kết/attachment có phạm vi rõ. Không coi export là thay thế backup vận hành. |
| NEXT-06 | P2 | Báo cáo tiến độ và tải công việc | Mở rộng dashboard/insights hiện có: cycle time, lead time, aging, WIP, lỗi mở lại, quá hạn và tải theo người/tuần. Cần lịch sử trạng thái/snapshot phù hợp; thể hiện rõ dữ liệu thiếu, không dựng biểu đồ giả. |
| NEXT-07 | P2 | Bảo mật tài khoản và quản lý credential thống nhất | Passkeys hiện bị disable; sessions hiện chỉ có revoke-all. Bổ sung MFA/passkey hoặc yêu cầu MFA qua IdP, thu hồi từng thiết bị, lịch sử đăng nhập. Làm rõ personal API key và token AI/MCP đã có để tránh hai hệ quyền chồng chéo. |
| NEXT-08 | P2 | Audit log cho quản trị workspace | Audit backend đã có; endpoint platform admin lấy 200 dòng gần nhất. Bổ sung màn hình theo workspace, lọc actor/entity/time/source Web/AI, phân trang và export có kiểm soát. Owner workspace chỉ xem dữ liệu thuộc quyền của mình. |
| NEXT-09 | P3 | Hoàn thiện ngôn ngữ, mobile và preferences | Locale mới phủ một phần; UI ghi rõ một số preference chưa hỗ trợ. Ưu tiên dịch các luồng chính, week-start/timezone, tự nhận việc nếu phù hợp, keyboard/focus và mobile cho bảng/timeline. Đo với người dùng trước khi ưu tiên deep link/commit signing. |

## 4. Thứ tự thực hiện đề xuất

1. **Đợt ổn định và quyền:** AUD-01–06, thêm E2E theo AUD-10. Ưu tiên kiểm tra metadata/aggregate bị lộ và danh sách bị chặn trước, rồi Saved Views và link settings.
2. **Đợt vận hành:** AUD-07–09 và AUD-12. Hoàn thiện phân trang/batch, quan sát job, backup/restore và định danh bản chạy. Xác minh riêng SMTP/mailbox, browser notification và object storage trên CT107.
3. **Đợt năng suất:** NEXT-01–05, NEXT-08. Chọn bulk, recurring và restore trước vì hỗ trợ công việc hằng ngày; sau đó import/export và SLA nâng cao.
4. **Đợt hoàn thiện có dữ liệu sử dụng:** AUD-11, NEXT-06–07 và NEXT-09. Nghiệm thu AI thật ngay khi có project/bug; ưu tiên MFA cao hơn nếu mở rộng ra ngoài nhóm nội bộ.

## 5. Nguyên tắc kiến trúc cho đợt tiếp theo

- Dùng chung access policy và query scope giữa Web, API, MCP; không viết bộ lọc quyền riêng trong từng adapter.
- Tách repository đọc danh sách, service nghiệp vụ và API contract. Mở rộng `modules/access`, `work_items`, `notifications`, `agent_runs`; tránh tiếp tục phình các file `native_*`.
- UI theo feature module, shared query/error/empty state; truyền dependency rõ ràng cho component dùng ở nhiều route. Theo Astryx đối với giao diện mới.
- Aggregate, pagination và export dùng cùng query contract. Không tính tổng nghiệp vụ từ mảng đang hiển thị.
- Scheduler/job phải có lease/idempotency, retry có giới hạn, log và lịch sử chạy để kiểm tra.
- Mỗi thay đổi code/schema/CI/docs khi commit phải có CHANGELOG. Mọi merge main là production-bound; Prisma migrate phải hoàn tất trước API/worker.
- Bằng chứng test, trạng thái triển khai và nghiệm thu thực tế phải được ghi riêng; không dùng số test để suy ra mọi chức năng đã hoàn thiện.
