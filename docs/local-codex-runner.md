# Codex local runner cho Flowie

Runner dùng Codex CLI đã đăng nhập trên máy, kết nối Flowie qua token giới hạn project/quyền. Không có agent chạy trên CT107. Các module nằm trong `scripts/flowie_runner`: config, transport, repository, process, codex và orchestrator.

## Chuẩn bị

1. Quản trị workspace khai báo repository của project trong AI settings và cấp connection có các scope `context:read`, `projects:read`, `issues:read`, `comments:read`, `documents:read`, `activities:read`, `reviews:read`, `runs:read`, `runs:write`, `comments:write`. Chọn đúng project; backend phải bật MCP và MCP writes.
2. Clone repository về máy; giữ cây làm việc sạch. `origin` phải khớp URL đã duyệt. Base ref phải có trong clone; runner không tự fetch hay ghi đè thay đổi đang có.
3. Cài dependency Python theo `apps/api-python/requirements.txt`; kiểm tra `codex exec --help`. Runner yêu cầu sandbox `workspace-write`, `--ephemeral`, `--ignore-user-config`, `--output-schema` và `--output-last-message`. CLI cũ thiếu flag sẽ bị từ chối.
4. Tạo file JSON **ngoài Git**, duyệt các test command local dưới dạng argv. Command từ cấu hình server không tự được thực thi. Không đặt token/password trong JSON hay argv test.

```json
{
  "endpoint": "https://flowie.loopstudio.io.vn/mcp/",
  "projectId": "REPLACE_PROJECT_ID",
  "repositoryId": "REPLACE_FLOWIE_REPOSITORY_ID",
  "repositoryUrl": "https://github.com/OWNER/REPOSITORY.git",
  "repositoryPath": "C:/work/REPOSITORY",
  "baseRef": "main",
  "tests": [["python", "-m", "pytest", "-q"]],
  "codex": "codex",
  "commandTimeout": 900
}
```

Trong PowerShell, từ thư mục Flowie, đặt `PYTHONPATH=scripts` (giữ đường dẫn API nếu máy cần), và đặt `FLOWIE_MCP_TOKEN` trong môi trường của tiến trình cha từ kho bí mật của bạn. Không ghi token vào shell history, prompt, log hay commit.

```powershell
$env:PYTHONPATH = 'scripts'
python -m flowie_runner --config C:/private/flowie-runner.json doctor
python -m flowie_runner --config C:/private/flowie-runner.json inspect --issue REPLACE_ISSUE_ID
python -m flowie_runner --config C:/private/flowie-runner.json run --issue REPLACE_ISSUE_ID
```

`doctor` chỉ kiểm tra repo và CLI. `inspect` đọc context nhưng không claim run. `run` claim bug 5 phút, tạo nhánh `codex/flowie-RUN_ID`, gọi Codex trong sandbox, chạy test local đã duyệt, kiểm tra changelog, tạo commit và báo `AWAITING_REVIEW`. Bug không tự chuyển Done. Ctrl+C, timeout, test lỗi hoặc heartbeat bị từ chối sẽ dừng process con; lỗi ghi FAILED nếu lease còn hợp lệ, hủy chạy cố release; mã đang có được giữ lại. Nếu connection bị thu hồi, lease còn lại tự hết hạn. Không tự reset, xóa nhánh hoặc bỏ qua lỗi.

Để đẩy nhánh và tạo PR nháp sau test, người chạy cấp quyền SCM thông qua Git credential helper và `gh auth login`, rồi chủ động thêm `--publish` vào lệnh `run`. Runner không nhận token SCM trong JSON và không chuyển biến `FLOWIE_MCP_TOKEN`, `GH_TOKEN`, `DATABASE_URL` vào Codex/test. Auth Codex vẫn đọc từ home hiện có; cấu hình MCP/hook của CLI không được tải từ user config. Repository cần chứa mã có thể gửi tới Codex theo quyền của người chạy.

## Nghiệm thu bug thật

- Người dùng chỉ định project/bug, local clone, approved test commands và quyền tạo PR.
- Chạy `doctor`, `inspect`; xác nhận context đúng issue/project/repo. Chạy `run`, kiểm tra nhánh, diff, test và commit.
- Nếu publish được cho phép: kiểm tra PR nháp và run hiển thị `AWAITING_REVIEW`. Quản trị dùng AI operations → Verify current PR and CI với GitHub App đã cấu hình, repository enabled và SHA đầy đủ.
- Provider verification chỉ xác minh các check đang quan sát tại thời điểm đó. `NO_CHECKS`, `PENDING`, `FAILED`, `MISMATCH` và giới hạn quá 100 check không được xem là PASS; branch protection và review riêng.
- Reviewer quyết định trạng thái bug; merge/main sẽ đi vào CT107 production theo AGENTS.md.

Nguồn CLI: [OpenAI non-interactive mode](https://developers.openai.com/codex/noninteractive/), [OpenAI CLI reference](https://developers.openai.com/codex/cli/reference/). Không dùng chế độ bỏ sandbox hay bỏ policy.

Hiện chỉ nghiệm thu bằng provider/SCM fixture và repository Git tạm. Một bug thật đang chờ project/bug do người dùng chỉ định; không được ghi DONE từ kết quả fixture.
