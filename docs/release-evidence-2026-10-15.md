# Flowie — Đối chiếu code, triển khai và nghiệm thu

Kiểm tra lại GitHub ngày 2026-10-15 (+07), bằng API chỉ đọc. Các checkpoint
local trong kế hoạch cũ là hồ sơ tại thời điểm viết, không phải trạng thái triển
khai hiện hành. Không tạo tag hoặc GitHub release trong đợt đối chiếu này.

## Các nhánh trước đã merge

| Phạm vi code | PR | Merge SHA | Workflow production |
| --- | --- | --- | --- |
| MCP và điều phối agent | [PR 1](https://github.com/hoangtu0812/Flowie/pull/1) | `68a7f324d2b6738b896758cda0b33b89b54b38fc` | [38524564916](https://github.com/hoangtu0812/Flowie/actions/runs/38524564916), success |
| 17 lỗi UX và 6 tính năng | [PR 2](https://github.com/hoangtu0812/Flowie/pull/2) | `6a231be54002605732259835cac93ad809670d0f` | [38555900872](https://github.com/hoangtu0812/Flowie/actions/runs/38555900872), success |
| Hoàn thiện luồng công việc | [PR 3](https://github.com/hoangtu0812/Flowie/pull/3) | `98b502dd7573012e5504dc7ddfd8478aedc1ff2c` | [38593586650](https://github.com/hoangtu0812/Flowie/actions/runs/38593586650), success |
| Sửa provider initiative và timeline | [PR 4](https://github.com/hoangtu0812/Flowie/pull/4) | `f3ae6aec83123948c02dd2841a5e6872f5fdd4e7` | [38600324113](https://github.com/hoangtu0812/Flowie/actions/runs/38600324113), success |

`origin/main` tại lần kiểm tra là `f3ae6ae`. PR 4 merge lúc 23:42:11 +07 ngày
2026-10-14. Workflow đúng SHA có các bước clean migration, backend/MCP,
MinIO/SMTP, web/Compose, browser verification, Update source and deploy và Verify
API readiness đều success. Đây là bằng chứng triển khai của **code đã merge**;
không thay thế nghiệm thu mailbox thật, off-host backup hoặc AI xử lý bug đến PR.

Sau khi được cho phép, nhánh mới đã push và tạo [PR nháp 5](https://github.com/hoangtu0812/Flowie/pull/5).
Tại head `adba73d`, [push CI](https://github.com/hoangtu0812/Flowie/actions/runs/38739725443)
success; [PR CI](https://github.com/hoangtu0812/Flowie/actions/runs/38739794356)
E2E 130/132, lỗi thời điểm SLA save/history và workspace navigation đã được ghi
ở tracker để sửa trên cùng nhánh. Không lấy push CI success để bỏ qua PR CI failure.

## Nhánh hoàn thiện sản phẩm hiện tại

`codex/product-completeness` bắt đầu từ `f3ae6ae`; bằng chứng theo từng AUD/NEXT
nằm trong [tracker](product-completeness-implementation-plan.md). Code ở nhánh
này chưa được workflow trên xác minh hoặc triển khai. Không lấy kết quả CI của
`main`/PR cũ để gán cho nhánh mới.

- Backend mới nhất: 165 passed, 2 optional storage/rehearsal skips, 10 subtests.
  Các nghiệm thu storage/restic thật đã có hồ sơ riêng; skipped không được tính pass.
- Web: 23 unit passed, production build/lint/types passed. Ma trận 132 ca đạt
  125 ở lần chạy toàn bộ; 9/9 ca chạy lại bao gồm bảy ca lỗi selector/hydration
  đã được sửa. Sau chỉnh trạng thái MFA, build lại và 3/3 luồng MFA đạt. Không
  gộp thành một lần chạy 132/132; phạm vi/ảnh mobile được ghi tại tracker.
- Prisma: 101 migrations đã áp dụng trên DB synthetic, validate/generate và
  schema diff đạt; có 13 migration mới so với 88 migration của base main.
  Worker build và Compose app config đạt. Production vẫn cần chạy toàn bộ migration đã commit qua
  Compose `migrate` trước API/worker. Không áp dụng DDL trực tiếp lên CT107.
- Backup ngoài CT107: đã có công cụ/rehearsal và đề xuất B2, chưa có account,
  bucket/key thực hoặc timer đã kích hoạt. Xem [quyết định](offsite-backup-decision.md).
- Codex thật: đã tự chọn bug `GEN-9` trên fixture loopback và gọi CLI thật;
  run `c1jlsc2cb5of2l2chpalc2sga` FAILED vì quyền hiệu lực read-only, không có
  diff/commit/PR. Connection thử đã thu hồi. Bản sửa locale trong nhánh mới là
  công việc triển khai trực tiếp, không được gán thành AI acceptance thành công.
- MFA: opt-in; key mã hóa độc lập phải cấu hình ngoài Git trước enrollment.
  Callback Microsoft có kiểm thử tại boundary giả lập; tenant thật chưa nghiệm thu.

## Cổng phát hành CT107

1. Review toàn bộ diff, CI đúng head nhánh và kết quả nâng cấp schema. Chốt
   credential/config ngoài Git, khả năng storage/readiness và tương thích client
   mới với API. Đặc biệt SLA dùng policy revision và session có MFA gate.
2. Kiểm tra backup hiện hành và khả năng khôi phục trước khi đưa schema mới lên
   production; không tuyên bố off-host backup đã bật từ rehearsal local.
3. Theo quy tắc release trong `AGENTS.md`, chuẩn bị release commit trên `main`,
   tăng semver, chuyển Unreleased vào đúng timestamp +07 và để mục Unreleased mới.
   Push main chính là triển khai production; không có staging hay preview.
4. Đợi workflow đúng SHA hoàn tất, xác minh migration result, readiness/build
   identity, worker heartbeat và smoke task/bug/document/comment/quyền/restore.
   Kiểm tra kết nối MCP và cookie cũ nâng cấp; chỉ bật lịch nghiệp vụ đã cấu hình.
5. Chỉ sau khi commit đó triển khai đạt mới tạo annotated tag và GitHub release
   có notes trùng mục CHANGELOG. Nếu lỗi, giữ bản ghi lỗi và chọn phương án phục
   hồi tương thích schema; không giả định checkout mã cũ sẽ tự đảo migration.
