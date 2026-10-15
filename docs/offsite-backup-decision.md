# Đề xuất đích sao lưu ngoài CT107

Ngày kiểm tra: 2026-10-15 (+07). Trạng thái: **PROPOSED / WAITING_CONFIGURATION**.
Chưa tạo tài khoản, mua dịch vụ, tạo bucket hoặc bật timer trên CT107.

Đề xuất mặc định **Backblaze B2, bucket private riêng cho Flowie, truy cập qua
S3-compatible API và mã hóa bằng restic**. Đây là đích độc lập máy chủ CT107;
không cần mua NAS mới. NAS hiện có có thể làm bản thứ hai nếu ở máy/vị trí độc
lập, nhưng không thay thế bản ngoài máy chủ bằng một container khác trên cùng host.
Provider có [hướng dẫn restic qua S3](https://www.backblaze.com/docs/cloud-storage-integrate-restic-with-backblaze-b2);
[restic cũng khuyến nghị S3 thay cho backend B2 native](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#backblaze-b2).

[Bảng giá chính thức](https://www.backblaze.com/cloud-storage/pricing) tại ngày
kiểm tra niêm yết từ 6,95 USD/TB/tháng, miễn phí 10 GB đầu và tải xuống trong
hạn mức 3 lần dung lượng lưu trung bình. Đây là giá tham khảo của nhà cung cấp,
không phải chi phí Flowie đã đo: cần tính cả snapshot còn giữ, phiên bản object
bị ẩn, lượng khôi phục và thuế. Bật cảnh báo chi phí trong tài khoản trước pilot.

## Cấu hình đề xuất

- Bucket private chuyên dụng; dùng endpoint/region thực tế từ tài khoản, không
  dùng bucket MinIO của ứng dụng làm đích backup. Template nằm tại
  `infrastructure/backup/credentials.backblaze.example`; thay placeholder ngoài Git.
- Application key chỉ vào bucket/prefix này, đủ quyền đọc/ghi và dọn repository
  locks. Giữ quyền quản trị tài khoản độc lập; tách credential bảo trì/prune khi
  chính sách provider cho phép. Mật khẩu restic và khóa mã hóa MFA phải có bản
  dự phòng trong password vault ngoài CT107.
- Chạy capture lúc 02:00 +07 theo timer đã chuẩn bị. Capture có thời gian dừng
  writer ngắn; đo thực tế trước khi bật lịch. Mục tiêu RPO 24 giờ, cảnh báo khi
  28 giờ chưa có bản thành công. RTO chỉ công bố sau diễn tập restore off-host.
- Giữ 7 daily / 4 weekly / 6 monthly snapshots. Chỉ áp dụng forget/prune sau khi
  kiểm tra một bản restore; chưa tự bật lịch xóa.
- Không đặt lifecycle tự hết hạn các object hiện hành của restic: nhiều snapshot
  dùng chung packs. B2 có thể giữ phiên bản đã ẩn sau prune; theo dõi dung lượng
  và thử chính sách dọn phiên bản ẩn trên repository thử trước khi áp dụng. Không
  coi giữ nhiều phiên bản hoặc mã hóa là bằng chứng backup bất biến. Default
  Object Lock có thể cản xóa locks/prune; chưa tự bật retention lock cho repository.

## Điều kiện để kích hoạt

Operator cần tài khoản B2/bucket/endpoint và key được cấu hình ngoài Git; không
gửi secret vào chat hoặc commit. Tiếp đó kiểm kê writer/volume/config CT107,
capture một snapshot, chạy check, restore lên host cô lập, đối chiếu DB/migration
và attachment hash, đo thời gian và xác nhận readiness/heartbeat sau capture.
Chỉ bật timer sau các bước đó. Chi tiết và lệnh có sẵn trong
[runbook](backup-restore-runbook.md).

Diễn tập MinIO/restic cục bộ đã đạt trước đó chứng minh công cụ hoạt động; chưa
chứng minh tài khoản B2, đường truyền CT107 hoặc bản sao ngoài máy chủ đã sẵn sàng.
