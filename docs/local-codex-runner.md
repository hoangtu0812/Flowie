# Local agent runner cho Flowie (Codex / Claude Code)

Runner dùng Codex CLI hoặc Claude Code đã đăng nhập trên máy (chọn bằng `provider`, mặc định `codex`), kết nối Flowie qua token giới hạn project/quyền. Không có agent chạy trên CT107. Các module nằm trong `scripts/flowie_runner`: config, transport, repository, process, prompt, codex, claude và orchestrator.

## Chuẩn bị

1. Quản trị workspace khai báo repository của project trong AI settings và cấp connection có các scope `context:read`, `projects:read`, `issues:read`, `comments:read`, `documents:read`, `activities:read`, `reviews:read`, `runs:read`, `runs:write`, `comments:write`. Chọn đúng project; backend phải bật MCP và MCP writes.
2. Clone repository về máy. `origin` phải khớp URL đã duyệt. Mỗi lượt chạy tự `git fetch` base từ `origin` và làm việc trong worktree riêng, nên checkout dùng chung không cần sạch và không bị runner sửa; `baseRef` luôn được hiểu là nhánh trên `origin` (`main` và `origin/main` là một).
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
  "worktreeRoot": "C:/work/REPOSITORY.flowie-worktrees",
  "tests": [["python", "-m", "pytest", "-q"]],
  "codex": "codex",
  "commandTimeout": 900
}
```

`worktreeRoot` là nơi chứa worktree của từng lượt chạy; bỏ trống thì runner dùng `<repositoryPath>.flowie-worktrees` cạnh checkout. Đường dẫn phải tuyệt đối và nằm ngoài `repositoryPath`.

Trong PowerShell, từ thư mục Flowie, đặt `PYTHONPATH=scripts` (giữ đường dẫn API nếu máy cần), và đặt `FLOWIE_MCP_TOKEN` trong môi trường của tiến trình cha từ kho bí mật của bạn. Không ghi token vào shell history, prompt, log hay commit.

```powershell
$env:PYTHONPATH = 'scripts'
python -m flowie_runner --config C:/private/flowie-runner.json doctor
python -m flowie_runner --config C:/private/flowie-runner.json inspect --issue REPLACE_ISSUE_ID
python -m flowie_runner --config C:/private/flowie-runner.json run --issue REPLACE_ISSUE_ID
```

`doctor` chỉ kiểm tra repo và CLI, và in ra `baseBranch` cùng `worktreeRoot` đang dùng. `inspect` đọc context nhưng không claim run. `run` claim bug 5 phút, fetch base từ `origin`, tạo worktree riêng cho lượt chạy trên nhánh `codex/flowie-RUN_ID`, gọi Codex trong sandbox ở worktree đó, chạy test local đã duyệt, kiểm tra changelog, tạo commit và báo `AWAITING_REVIEW`. Bug không tự chuyển Done. Ctrl+C, timeout, test lỗi hoặc heartbeat bị từ chối sẽ dừng process con; lỗi ghi FAILED nếu lease còn hợp lệ, hủy chạy cố release; mã đang có được giữ lại. Nếu connection bị thu hồi, lease còn lại tự hết hạn. Không tự reset, xóa nhánh hoặc bỏ qua lỗi.

Để đẩy nhánh và tạo PR nháp sau test, người chạy cấp quyền SCM thông qua Git credential helper và `gh auth login`, rồi chủ động thêm `--publish` vào lệnh `run`. Runner không nhận token SCM trong JSON và không chuyển biến `FLOWIE_MCP_TOKEN`, `GH_TOKEN`, `DATABASE_URL` vào Codex/test. Auth Codex vẫn đọc từ home hiện có; cấu hình MCP/hook của CLI không được tải từ user config. Repository cần chứa mã có thể gửi tới Codex theo quyền của người chạy.

## Claude Code provider

Đặt `"provider": "claude"` trong JSON; `claude` là đường dẫn binary (mặc định `claude`). Các field còn lại giữ nguyên; field `codex` bị bỏ qua.

```json
{
  "endpoint": "https://flowie.dtd.bsr.com.vn/mcp/",
  "projectId": "REPLACE_PROJECT_ID",
  "repositoryId": "REPLACE_FLOWIE_REPOSITORY_ID",
  "repositoryUrl": "https://github.com/OWNER/REPOSITORY.git",
  "repositoryPath": "/Users/me/work/REPOSITORY",
  "baseRef": "main",
  "tests": [["python", "-m", "pytest", "-q"]],
  "provider": "claude",
  "claude": "claude",
  "commandTimeout": 900
}
```

```bash
export PYTHONPATH=scripts
python -m flowie_runner --config ~/private/flowie-runner.json doctor
python -m flowie_runner --config ~/private/flowie-runner.json inspect --issue REPLACE_ISSUE_ID
python -m flowie_runner --config ~/private/flowie-runner.json run --issue REPLACE_ISSUE_ID
```

Runner gọi `claude --print --output-format json --json-schema … --permission-mode acceptEdits --permission-prompts none --tools Read,Edit,Write,Glob,Grep --restricted --strict-mcp-config --session-id <uuid> --name "Flowie <mã issue>"` trong `repositoryPath`, prompt qua stdin và đọc `structured_output.summary` (tối đa 10.000 ký tự).

- Chỉ có tool đọc/ghi file; không có Bash, WebFetch hay MCP. Test, commit, push và gọi Flowie vẫn do runner cha làm.
- `--restricted` bỏ qua settings user/project/local, giới hạn tool file trong checkout và từ chối `bypassPermissions`; `--permission-prompts none` tự từ chối mọi thao tác cần hỏi (ví dụ ghi ngoài checkout). Không dùng `--dangerously-skip-permissions`.
- Process con chỉ nhận biến môi trường trong allowlist (thêm `USER`/`LOGNAME` để Claude Code đọc login từ macOS keychain, và `CLAUDE_CONFIG_DIR`); `FLOWIE_MCP_TOKEN`, `GH_TOKEN`, `DATABASE_URL` không được chuyển. Đăng nhập bằng `claude auth login` trước; login qua biến `ANTHROPIC_API_KEY` không được chuyển vào process con.
- `doctor` kiểm tra `claude --help` có đủ các flag trên và `claude auth status --json` báo `loggedIn: true`; CLI thiếu, cũ hoặc chưa đăng nhập đều bị từ chối. Đã kiểm tra với Claude Code 2.1.296.
- Nhánh vẫn đặt tên `codex/flowie-RUN_ID` cho cả hai provider.
- Theo dõi phiên: khi bắt đầu, runner in ra stderr dòng `Claude Code session <id>: claude --resume <id> in <đường dẫn worktree của lượt chạy>`. Trong lúc chạy, xem transcript bằng `tail -f ~/.claude/projects/*/<id>.jsonl`. Chạy `claude --resume <id>` trong đường dẫn đó để đọc lại hoặc tiếp tục hội thoại (phiên tiếp tục này dùng quyền bình thường của bạn, không còn các giới hạn của runner); lượt chạy thành công đã xoá worktree, nên hãy resume từ checkout dùng chung sau khi `git switch` sang nhánh của lượt đó. Transcript chứa nội dung issue và được lưu cục bộ trong `~/.claude/projects`.

## Chạy định kỳ cho hàng đợi automation

Event automation (project + label + connection) chỉ tạo run `PENDING`; server không tự gọi provider. `pending` gọi `list_runs` với `state=PENDING`, `projectId` trong config và `assignedToThisConnection=true`, trả `{"issueIds": [...]}` (tối đa 100 mỗi lần). `run --issue` claim lại đúng run `PENDING` của issue đó. Production phải bật MCP writes (`MCP_WRITES_ENABLED=true`) thì `run` mới claim được.

Một run `PENDING` hoặc `RUNNING` được giao đích danh cho đúng một connection: automation xếp run cho connection của rule, còn claim trực tiếp tạo run cho chính connection gọi. Connection khác claim run đó sẽ nhận lỗi 409, kể cả khi lease đã hết hạn — hết lease không phải cửa sổ để agent khác chiếm việc. Vì vậy mỗi máy chạy runner phải dùng connection của chính nó; nhiều máy dùng chung một connection vẫn tranh nhau cùng hàng đợi.

Hàng đợi chung là các issue chưa có run `PENDING`/`RUNNING` nào: mọi connection có `runs:write` và quyền đọc issue đều claim được. Muốn trả một việc đã giao về hàng đợi chung thì phải cancel run đó (chủ connection, hoặc quản trị workspace trong AI operations); khi run sang `CANCELED`, issue mở lại cho connection khác.

```bash
#!/bin/sh
# flowie-poll.sh: FLOWIE_MCP_TOKEN phải được nạp từ kho bí mật trước khi chạy.
cd /path/to/Flowie && export PYTHONPATH=scripts
CONFIG=~/private/flowie-runner.json
python -m flowie_runner --config "$CONFIG" pending \
  | python -c 'import json,sys; print("\n".join(json.load(sys.stdin)["issueIds"]))' \
  | while read -r issue; do
      python -m flowie_runner --config "$CONFIG" run --issue "$issue" || break
    done
```

Chạy bằng cron/launchd (ví dụ mỗi 10 phút). Mỗi lượt chạy có worktree riêng nên một lượt lỗi không còn làm bẩn checkout dùng chung và không chặn các vòng sau; vẫn nên dùng khoá (`flock` hoặc launchd không chồng lần chạy) để giới hạn số lượt chạy song song trên một máy.

## Cô lập mỗi lượt chạy

- Trước mỗi lượt, runner `git fetch --no-tags --prune origin` đúng nhánh base rồi tạo `git worktree` tại `<worktreeRoot>/<RUN_ID>` từ `refs/remotes/origin/<base>`. Không lượt nào xây trên ref local cũ hay trên thay đổi của lượt trước.
- Provider và test local chạy trong worktree đó, không phải trong checkout dùng chung. `git add --all` khi commit vì vậy chỉ thấy thay đổi của chính lượt đó.
- Lượt chạy lại cùng `RUN_ID` (sau khi reclaim lease) dùng `git worktree add -B`, nên nhánh được đặt lại về base hiện tại thay vì lỗi vì nhánh cũ còn đó.
- Thành công: worktree bị xoá sau khi báo kết quả. Commit vẫn nằm trên nhánh `codex/flowie-RUN_ID` trong checkout dùng chung, nên người review `git switch` sang nhánh đó là thấy.
- Thất bại: worktree được giữ lại nếu còn thay đổi chưa commit, và đường dẫn được in ra stderr (`Run worktree preserved for inspection: ...`). Nếu không còn gì để xem, worktree bị xoá luôn. Đường dẫn local không được gửi vào báo cáo trên server.
- Dọn tay khi cần: `git worktree remove --force <đường dẫn>` rồi `git worktree prune`, chạy trong checkout dùng chung.

## Nghiệm thu bug thật

- Người dùng chỉ định project/bug, local clone, approved test commands và quyền tạo PR.
- Chạy `doctor`, `inspect`; xác nhận context đúng issue/project/repo. Chạy `run`, kiểm tra nhánh, diff, test và commit.
- Nếu publish được cho phép: kiểm tra PR nháp và run hiển thị `AWAITING_REVIEW`. Quản trị dùng AI operations → Verify current PR and CI với GitHub App đã cấu hình, repository enabled và SHA đầy đủ.
- Provider verification chỉ xác minh các check đang quan sát tại thời điểm đó. `NO_CHECKS`, `PENDING`, `FAILED`, `MISMATCH` và giới hạn quá 100 check không được xem là PASS; branch protection và review riêng.
- Reviewer quyết định trạng thái bug; merge/main sẽ đi vào CT107 production theo AGENTS.md.

Nguồn CLI: [OpenAI non-interactive mode](https://developers.openai.com/codex/noninteractive/), [OpenAI CLI reference](https://developers.openai.com/codex/cli/reference/). Không dùng chế độ bỏ sandbox hay bỏ policy.

## Kiểm tra thực tế 2026-10-15

Người dùng đã cho phép tự chọn project/bug. Một run với Codex CLI thật đã đọc
bug locale Archived qua MCP local có token giới hạn một project/team, tạo run
và gọi model. CLI 0.154.0 trên máy báo sandbox hiệu lực `read-only` dù runner
truyền `--sandbox workspace-write`; probe dùng profile workspace cũng vẫn chỉ đọc.
Source không đổi, run `c1jlsc2cb5of2l2chpalc2sga` ghi `FAILED`, connection thử đã
revoke. Các test chạy trên source không đổi không chứng minh bug được sửa.

Đây chưa phải nghiệm thu đến PR và không phải nghiệm thu CT107. `doctor` kiểm
tra repository, cờ CLI và login; nó chưa chứng minh policy hiệu lực cho phép ghi.
Cần người quản lý cấu hình CLI cho phép ghi trong checkout trước khi chạy lại;
không đổi sang full access hoặc tắt sandbox để vượt qua giới hạn. Phiên Flowie
production hiện ở màn hình đăng nhập và môi trường chưa có token MCP thật.

Đối chiếu [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
và [permission profiles](https://learn.chatgpt.com/docs/permissions): cấu hình
managed vẫn có thể giới hạn quyền hiệu lực. Giữ riêng bằng chứng fixture, gọi
model thật, thay đổi mã, PR/CI và production acceptance.
