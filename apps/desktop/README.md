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
- Thư mục này **không** kích hoạt deploy server. `scripts/deploy-scope.sh` miễn
  trừ `apps/desktop/*`, và `scripts/tests/deploy-scope.test.sh` bảo vệ quy tắc
  đó. Một commit chạm cả desktop lẫn server thì vẫn deploy server.
- CI của desktop là `.github/workflows/desktop.yml`, chạy trên `windows-latest`
  và `macos-latest`. Build xanh ở một nền tảng không phải bằng chứng cho nền
  tảng còn lại.
