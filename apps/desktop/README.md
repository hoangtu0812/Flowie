# Flowie Desktop

Cargo workspace cho ứng dụng desktop dùng chung Windows và macOS. Thiết kế và
lộ trình nằm ở [kế hoạch desktop](../../docs/desktop-companion-plan.md); công
việc được theo dõi ở DTD-487.

Hiện tại đây mới là khung: các crate chưa có hành vi.

## Cấu trúc

| Thư mục | Nội dung | Task |
| --- | --- | --- |
| `crates/flowie-core` | Cấu hình, state machine của run, journal | DTD-498 |
| `crates/flowie-mcp` | Client MCP và hợp đồng tool Flowie | DTD-494 |
| `crates/flowie-agent` | Adapter Claude/Codex, vòng đời tiến trình | DTD-496 |
| `crates/flowie-repository` | Git, worktree, test đã duyệt | DTD-495 |
| `crates/flowie-platform` | Credential, autostart, khác biệt theo OS | DTD-496, DTD-488, DTD-489 |
| `src-tauri` | Vỏ ứng dụng Tauri 2: tray và cửa sổ cấu hình | DTD-501 |
| `ui` | Giao diện cấu hình cục bộ | DTD-501 |

## Build

```bash
cd apps/desktop
cargo build --workspace
cargo test --workspace
```

Toolchain ghim trong `rust-toolchain.toml`; không nêu phiên bản ở nơi khác.

## Chạy thử trên Windows

Lấy bản cần thử theo một trong ba cách, từ lần chạy CI `Verify Flowie Desktop`
của commit cần thử:

- **Bộ cài**: artifact `flowie-desktop-windows-installer`, một file
  `Flowie Desktop_<phiên bản>_x64-setup.exe`. Cài theo từng người dùng nên không
  cần quyền quản trị.
- **Chỉ file chạy**: artifact `flowie-desktop-windows`.
- **Tự build**: `cd apps/desktop && cargo build --release -p flowie-desktop`, file
  nằm ở `target/release/flowie-desktop.exe`. Muốn cả bộ cài thì
  `cargo install tauri-cli --version "^2" --locked` rồi `cargo tauri bundle` trong
  `apps/desktop/src-tauri`.

Cài xong, hoặc chạy thẳng file exe. Ứng dụng nằm ở khay hệ thống, **không mở cửa sổ nào**; bấm icon
tray rồi chọn **Mở cấu hình**.

Trong cửa sổ cấu hình:

1. Sửa phần **Cấu hình** (đã điền sẵn một ví dụ). `project_id` lấy từ Flowie,
   `path` là checkout có thật trên máy này, và `approved_tests` là **những lệnh
   duy nhất** được phép chạy với tư cách test.
2. Bấm **Lưu cấu hình**. Sai ở đâu sẽ báo ngay tại chỗ.
3. Dán token Flowie rồi bấm **Lưu token**. Token vào kho credential của hệ điều
   hành, không bao giờ nằm trong file cấu hình.
4. Dòng **Trạng thái** sẽ chuyển sang `Sẵn sàng` khi kết nối dùng được. Nếu
   thiếu quyền, nó nêu đúng tên scope còn thiếu.

Sau đó giao một task cho connection này trong Flowie. Companion nhận việc trong
vòng một chu kỳ poll, và dòng trên tray đổi thành tên task.

Hai điều cần biết:

- **Máy này phải có `claude` hoặc `codex` trên PATH** và đã đăng nhập. Thiếu
  thì trạng thái nói rõ phải cài, cập nhật, hay đăng nhập.
- **Thoát ứng dụng sẽ trả task lại**, không giết giữa chừng; run dừng ở bước kế
  tiếp. Chờ vài giây là bình thường.

Bản build này **chưa ký số**. Windows SmartScreen sẽ cảnh báo ở lần chạy đầu, với
cả bộ cài lẫn file exe. Ký số cần chứng chỉ của tổ chức và thuộc `DTD-488`; chưa ký
thì đây là bản để tự thử, chưa phải thứ đem phát cho người khác.

## Kiểm tra mã macOS từ máy Windows

Mã trong nhánh `cfg(unix)` không được biên dịch trên Windows, nên lỗi của nó
chỉ lộ ra ở CI. Kiểm chéo trước khi đẩy:

```bash
rustup target add aarch64-apple-darwin
cd apps/desktop
cargo clippy --target aarch64-apple-darwin   -p flowie-core -p flowie-agent -p flowie-repository -p flowie-platform -p flowie-workspace   --all-targets -- -D warnings
```

Không kiểm được `flowie-mcp`, `flowie-connection` và `src-tauri` theo cách này:
`ring` và các crate Apple của Tauri cần một C compiler cho macOS. Ba crate đó chỉ
có CI xác nhận.

## Hạn chế đã biết của bản hiện tại

- Mở bản thứ hai trên cùng một tài khoản thì nó **thoát im lặng**. Thông báo
  được ghi ra stderr, nhưng bản release dùng `windows_subsystem = "windows"`
  nên không có console để đọc. Người dùng bấm icon và thấy như không có gì xảy
  ra. Hành vi đúng là đưa cửa sổ của bản đang chạy lên trước; việc này cần
  plugin single-instance của Tauri và được theo dõi trong DTD-501.
- Nội dung menu tray chưa được kiểm bằng mắt người; CI chỉ build chứ không
  chạy giao diện.

## Ràng buộc đã biết

- **Windows**: `src-tauri/icons/icon.ico` bắt buộc phải có, nếu không `tauri-build`
  dừng khi sinh file resource. Nạp icon tray từ PNG cần feature `image-png`.
- **Windows, đường dẫn dài**: `link.exe` báo `LNK1104` khi đường dẫn tới thư mục
  `target` chạm giới hạn của nó. Checkout sâu thì đặt `CARGO_TARGET_DIR` tới một
  thư mục ngắn, ví dụ `%TEMP%td`.
- **Sửa mã bằng PowerShell**: `Set-Content` và `-replace` đọc file theo codepage
  ANSI của hệ thống rồi ghi lại bằng UTF-8, biến toàn bộ chữ tiếng Việt thành
  mojibake. `cargo clippy` chỉ chặn được những byte trở thành ký tự vô hình, còn
  phần hỏng lại lọt qua CI. Sửa file nguồn bằng công cụ giữ nguyên UTF-8.
- Thư mục này không nằm trong image server nào. Trước đây có `deploy-scope.sh`
  miễn trừ nó khỏi pipeline deploy production; pipeline đó đã bị bỏ, mọi server
  nay được deploy tay, nên không còn quy tắc miễn trừ nào để giữ.
- CI của desktop là `.github/workflows/desktop.yml`, chạy trên `windows-latest`
  và `macos-latest`. Build xanh ở một nền tảng không phải bằng chứng cho nền
  tảng còn lại.
