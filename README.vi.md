<p align="center">
  <img src="./apps/web/public/flowie-icon.svg" width="116" height="116" alt="Flowie logo" />
</p>

<h1 align="center">Flowie</h1>

<p align="center"><strong>Nền tảng mã nguồn mở quản lý dự án và cộng tác đội nhóm</strong></p>

<p align="center">
  <strong>🇻🇳 Tiếng Việt</strong> · <a href="./README.md">🇬🇧 English</a>
</p>

---

## 📌 Tổng quan

Flowie là workspace tự host để lập kế hoạch, theo dõi và hoàn thành công việc cùng đội nhóm. Dự án giữ giao diện Circle gốc, đồng thời thay từng đường đọc/ghi mock bằng backend Python/FastAPI và PostgreSQL có dữ liệu bền vững.

Flowie không chỉ dành cho phần mềm: có thể quản lý sản phẩm, vận hành, nghiên cứu, marketing, chương trình nội bộ và các loại dự án khác trong cùng workspace.

## ✨ Các chức năng đã có backend thật

- Đăng ký, đăng nhập, refresh session, workspace, vai trò, lời mời và hồ sơ/avatar.
- Team, thành viên, icon/cài đặt Team và Team documents.
- Issue: workflow/status, priority, assignee, label, deadline, comment, relation, template, reminder và Cycle.
- Cycle Active/Upcoming, gán Issue và tiến độ/burn-up có persistence.
- Project, milestone, custom property, template, label, update và Initiative.
- Documents, resources, activity/audit, attachment và cấu hình Discord.

Danh mục implementation, các phần còn mock và thứ tự tiếp tục nằm tại [implement_plan.md](./implement_plan.md).

## 🧱 Kiến trúc

| Lớp | Công nghệ | Trách nhiệm |
| --- | --- | --- |
| Web | Next.js 15, React 19, TypeScript, Tailwind | UI Circle gốc và adapter dữ liệu thật |
| API | Python 3.12, FastAPI, SQLAlchemy | Xác thực, RBAC và business logic native |
| Dữ liệu | PostgreSQL 16 | Dữ liệu workspace/team/issue/project bền vững |
| Dịch vụ | Redis, MinIO | Điều phối background và object storage |
| Runtime | Docker Compose | Chạy local/mạng nội bộ có thể tái lập |

## 🚀 Chạy dự án

### Mạng nội bộ — không build, không pull, không cài package

```powershell
.\scripts\start-local.ps1
```

Mở [http://localhost:3000](http://localhost:3000). FastAPI readiness: [http://localhost:4000/readyz](http://localhost:4000/readyz).

### Build hoặc cập nhật dependency — dùng 5G/mạng được phép tải

```powershell
.\scripts\build-and-test.ps1 -AllowNetwork
```

Script sẽ build image, start Docker và kiểm tra Login/FastAPI. Khi hoàn tất, quay lại mạng nội bộ và dùng `start-local.ps1` cho các lần chạy bình thường.

Mỗi lần chạy Docker, service một lần `migrate` sẽ áp dụng toàn bộ Prisma
migration đã commit trước khi API FastAPI hoặc worker được khởi động. Migration
thất bại sẽ chặn deployment; không khởi động riêng API để bỏ qua bước này.

## 🗺️ Quy ước phát triển

1. Giữ nguyên cấu trúc, spacing và tương tác của Circle UI gốc.
2. Chỉ thay mock bằng API Python/PostgreSQL hoặc bổ sung tính năng đã được duyệt.
3. Kiểm tra persistence sau refresh và workspace/RBAC isolation.
4. Mỗi lát hoàn chỉnh phải cập nhật [implement_plan.md](./implement_plan.md), commit và push.
5. Tuân thủ [AGENTS.md](./AGENTS.md) và [quy trình release](./docs/release-process.md):
   `main` deploy trực tiếp lên môi trường production duy nhất, và mọi commit
   phải có mục tương ứng trong `CHANGELOG.md`.

## 🙏 Ghi nhận & giấy phép

Flowie phát triển trên nền UI [ln-dev7/circle](https://github.com/ln-dev7/circle). Xem [LICENSE.md](./LICENSE.md) để biết điều khoản MIT và ghi nhận nguồn.
