# PHÂN TÍCH CHUYÊN SÂU CHỨC NĂNG ỨNG DỤNG QUẢN LÝ DỰ ÁN

Tài liệu này cung cấp một bản phân tích cực kỳ chi tiết về kiến trúc chức năng (Functional Architecture) của một ứng dụng quản trị dự án hiện đại cấp độ Enterprise. Hệ thống được chia thành các Module cốt lõi để đảm bảo tính mở rộng và khả năng đáp ứng cho nhiều loại hình doanh nghiệp.

---

## MODULE 1: QUẢN LÝ TÀI KHOẢN VÀ PHÂN QUYỀN (IAM - Identity & Access Management)
Đây là lớp nền tảng bảo vệ và phân luồng truy cập của hệ thống.

*   **1.1. Quản lý Authentication (Xác thực):**
    *   Đăng nhập/Đăng ký qua Email, Số điện thoại.
    *   Hỗ trợ Single Sign-On (SSO) qua Google, Microsoft, Apple, hoặc SAML/OAuth2 cho doanh nghiệp.
    *   Xác thực 2 yếu tố (2FA/MFA) qua SMS, Authenticator App.
    *   Quản lý phiên đăng nhập (Session management): Log out từ xa, xem thiết bị đang đăng nhập.

*   **1.2. Role-Based Access Control (RBAC) - Phân quyền chi tiết:**
    *   **Cấp Workspace (Tổ chức):** Owner (Chủ sở hữu), Admin (Quản trị viên), Billing (Kế toán), Member (Nhân viên), Guest/Client (Khách).
    *   **Cấp Project (Dự án):** Project Manager, Contributor, Viewer.
    *   **Custom Roles (Vai trò tùy chỉnh):** Cho phép Admin định nghĩa một Role mới (Ví dụ: "QA Tester") và tick chọn từng quyền nhỏ nhặt (Quyền tạo task, quyền xóa comment, quyền xem ngân sách...).

*   **1.3. Quản lý Đội nhóm (Team/Department Management):**
    *   Nhóm người dùng theo Phòng ban (Marketing, Dev, HR).
    *   Assign (Giao việc) hoặc Mention (Nhắc đến) cả một phòng ban thay vì từng cá nhân.

---

## MODULE 2: QUẢN LÝ KHÔNG GIAN LÀM VIỆC & DỰ ÁN (Workspace & Project)
Cấu trúc phân cấp dữ liệu giúp hệ thống có tổ chức rõ ràng.

*   **2.1. Phân cấp dữ liệu:** `Workspace (Tổ chức) -> Portfolio (Danh mục dự án) -> Project (Dự án) -> Task/Sub-task (Công việc)`.
*   **2.2. Khởi tạo Dự án:**
    *   Tạo dự án mới từ trang trắng (Blank) hoặc từ các Templates có sẵn (Agile Scrum, Marketing Campaign, CRM, Bug Tracking).
    *   Thiết lập thông tin dự án: Tên, Mô tả, Khách hàng, Ngân sách, Ngày bắt đầu, Ngày kết thúc kỳ vọng.
*   **2.3. Project Settings (Cài đặt dự án):**
    *   Bật/tắt các Module trong dự án (Ví dụ: Ẩn tính năng Tài chính với dự án nội bộ).
    *   Lưu trữ (Archive) dự án khi hoàn thành, khôi phục lại khi cần.

---

## MODULE 3: QUẢN LÝ CÔNG VIỆC CỐT LÕI (Core Task Management)
Đây là "trái tim" nơi người dùng tương tác nhiều nhất.

*   **3.1. Tạo và Cấu trúc Task:**
    *   **Trường dữ liệu cơ bản:** Title, Description (Rich-text editor hỗ trợ markdown), Assignee(s), Due date, Start date.
    *   **Phân cấp công việc:** Epic -> Task -> Sub-task -> Checklist.
    *   **Trạng thái (Workflow/Status):** Hệ thống trạng thái linh hoạt (To Do, In Progress, In Review, QA, Done). Cho phép tạo các Custom Status.

*   **3.2. Quản lý Backlog và Sprints (Khung làm việc Agile/Scrum):**
    *   **Product Backlog:** Nơi lưu trữ tập trung toàn bộ các yêu cầu, tính năng (features), ý tưởng, hoặc lỗi (bugs) chưa được đưa vào kế hoạch thực hiện. Hỗ trợ sắp xếp độ ưu tiên (Prioritization) bằng các phương pháp như MoSCoW, RICE.
    *   **Sprint Planning (Lập kế hoạch Sprint):** Cho phép kéo thả (Drag & Drop) công việc từ Backlog vào các Sprint (các chu kỳ làm việc ngắn, thường là 2-4 tuần).
    *   **Story Points / Estimation:** Định lượng độ khó/độ phức tạp của từng công việc thay vì chỉ dùng thời gian. Tính toán dung lượng của đội ngũ (Sprint Capacity) để không nhồi nhét quá sức.

*   **3.3. Quản lý Worklog (Ghi nhận nỗ lực làm việc):**
    *   **Time Tracking (Đồng hồ bấm giờ):** Cung cấp nút Start/Stop trực tiếp trên từng Task để tự động tính thời gian làm việc.
    *   **Manual Worklog (Nhập thủ công):** Cho phép nhân sự tự điền số giờ đã làm cho một task vào cuối ngày (Ví dụ: log 4 giờ để fix bug). Có thể kèm theo ghi chú chi tiết về việc đã làm trong khoảng thời gian đó.
    *   **Timesheet (Bảng chấm công):** Hiển thị tổng quan số giờ đã log của toàn bộ nhân sự theo ngày/tuần/tháng. Hỗ trợ tính năng trình duyệt (Submit for Approval) để Quản lý dự án duyệt số giờ làm (rất quan trọng cho các công ty Outsourcing thanh toán theo giờ).

*   **3.4. Thuộc tính Nâng cao của Task:**
    *   **Custom Fields (Trường tùy chỉnh):** Cho phép thêm các cột dữ liệu riêng như Text, Dropdown, Number, URL, Phone, Formula (Công thức).
    *   **Dependencies (Sự phụ thuộc):** Cảnh báo "Block/Blocked by" (Ví dụ: Task B chỉ được bắt đầu khi Task A hoàn thành).

*   **3.5. Tương tác trong Task:**
    *   Comment có hỗ trợ nhắc tên (@mention), đính kèm file, ghi âm giọng nói.
    *   Activity Log: Ghi lại toàn bộ lịch sử thay đổi của Task (Ai đã đổi trạng thái, ai đã sửa deadline vào lúc nào).

---

## MODULE 4: HỆ THỐNG HIỂN THỊ VÀ TRỰC QUAN HÓA (Views)
Cùng một bộ dữ liệu nhưng cần hiển thị dưới nhiều góc độ.

*   **4.1. List View (Dạng danh sách):** Hiển thị dạng bảng tính, nhóm (Group by), lọc (Filter), sắp xếp (Sort). Phù hợp cho quản lý Backlog số lượng lớn.
*   **4.2. Kanban Board (Dạng bảng):** Các cột đại diện cho Trạng thái. Hỗ trợ kéo thả mượt mà, thiết lập giới hạn công việc tối đa (WIP Limit).
*   **4.3. Gantt Chart / Timeline:** Biểu đồ dòng thời gian. Hiển thị rõ các Dependencies và Critical Path (Đường găng dự án).
*   **4.4. Calendar View (Dạng lịch):** Xem công việc trên lịch.
*   **4.5. Workload View (Quản lý tải tài nguyên):** Dựa vào Worklog và Estimation để vẽ biểu đồ đo lường sức chứa của nhân sự. Hiển thị cảnh báo nếu một người bị gán quá 8h/ngày, cho phép kéo thả task sang người rảnh rỗi hơn.

---

## MODULE 5: BÁO CÁO & DASHBOARD TÙY CHỈNH (Reporting & Analytics)
*   **5.1. Custom Dashboards (Bảng điều khiển cá nhân hóa):**
    *   **Các loại Widget:** Biểu đồ tròn (Task theo trạng thái), Biểu đồ cột (Task theo người thực hiện), Biểu đồ đường (Tiến độ dự án).
    *   **Agile Reports:** Cung cấp biểu đồ Burndown Chart, Velocity Chart để đo lường sức mạnh của team Scrum.
*   **5.2. Báo cáo tự động hóa:**
    *   Tự động tổng hợp báo cáo (Daily, Weekly) gửi qua Email hoặc Slack.
    *   Đo lường hiệu suất: Tỉ lệ hoàn thành task, tỉ lệ số giờ Estimate vs Worklog thực tế.
*   **5.3. Báo cáo Tài chính dự án:**
    *   Tính toán chi phí (Cost) tự động thông qua số giờ trong Worklog nhân (x) với Rate lương theo giờ của từng nhân viên.

---

## MODULE 6: TỰ ĐỘNG HÓA VÀ TÍCH HỢP (Automation & Integrations)
*   **6.1. Tự động hóa (Rule-based Automations):**
    *   Hoạt động theo cơ chế **Trigger -> Condition -> Action**.
    *   *Ví dụ:* Khi task chuyển sang "QA", tự động gán cho QA Tester và @mention.
*   **6.2. Webhooks & API:** Mở RESTful API để đồng bộ với ERP nội bộ.
*   **6.3. Tích hợp Native:** Slack, MS Teams, GitHub, GitLab, Google Drive, Figma.

---

## MODULE 7: GIAO TIẾP VÀ CẢNH BÁO (Communications & Notifications)
*   **7.1. Inbox / Notification Center:**
    *   Gom nhóm thông báo, lọc thông báo "Được nhắc đến" hoặc "Quá hạn".
*   **7.2. Chat:** Tính năng chat nhóm trực tiếp trên ứng dụng.

---

## 8. CÁC YÊU CẦU PHI CHỨC NĂNG (Non-Functional Requirements)
*   **Hiệu năng (Performance):** Tải dữ liệu bảng Kanban/Backlog khổng lồ mượt mà (Virtualization), cập nhật dữ liệu Real-time (WebSockets).
*   **Khả năng sử dụng (Usability):** Giao diện Dark/Light mode, Phím tắt (Keyboard shortcuts) cho power-user.
*   **Bảo mật & Compliance:** Mã hóa dữ liệu truyền tải và lưu trữ. Tuân thủ tiêu chuẩn bảo mật (GDPR, SOC2).
*   **Đa nền tảng:** Web App, Desktop App (Electron), Mobile App.
