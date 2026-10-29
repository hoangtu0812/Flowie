# Changelog

All notable changes to Flowie are documented here.

Each released section is headed by its version and the moment it went to
production: `## [x.y.z] — YYYY-MM-DD HH:MM +07`. The Help menu in the app reads
this file at build time, so the topmost released section is exactly what users
see under "What's new" — a release that is not written down here is a release
nobody can identify. Work that has not shipped yet stays under Unreleased.

Each entry is written in English with an indented `VI:` Vietnamese line, and
ends with its pull request number and, once released, its merge commit, for
example `(#19, 431edd6)`. Entries written before this rule stay as they are.

## Unreleased

### Added

- Agents keep each feature's FDS and TDS current: the MCP tools `get_feature_docs` and `upsert_feature_doc` read a task's feature documents and create or update them in the project's Docs tree, adding a change-log row and linking them to the task. The local runner drafts FDS/TDS in its review step and saves them before coding, and a task without FDS/TDS shows a warning under Related documents; nothing is blocked yet. Runner connections need the `documents:write` scope to save documents. (DTD-19, #48)
  VI: Agent giữ FDS và TDS của từng tính năng luôn cập nhật: tool MCP `get_feature_docs` và `upsert_feature_doc` đọc tài liệu tính năng của task và tạo hoặc cập nhật chúng trong cây Docs của dự án, thêm một dòng lịch sử thay đổi và liên kết với task. Runner local soạn FDS/TDS ở bước review và lưu trước khi code, và task chưa có FDS/TDS hiện cảnh báo trong mục Tài liệu liên quan; chưa chặn gì. Kết nối của runner cần scope `documents:write` để lưu tài liệu. (DTD-19)

- The Docs tab shows the document tree on the left and a preview on the right: clicking a document renders it read-only with its table of contents and Mermaid diagrams, and Edit opens the editor. Folders accept PDF uploads (up to 10 MB), which preview in the browser's PDF viewer and can be opened in a new tab or downloaded. A Docs entry in the sidebar opens the same view for any project chosen at the top. Deploy the API with the web build: an older API rejects folder uploads. (DTD-19, #47)
  VI: Tab Docs hiển thị cây tài liệu bên trái và khung xem trước bên phải: bấm vào tài liệu để xem chỉ đọc kèm mục lục và sơ đồ Mermaid, nút Sửa mở editor. Thư mục nhận file PDF tải lên (tối đa 10 MB), xem bằng trình xem PDF của trình duyệt, mở tab mới hoặc tải xuống được. Mục Tài liệu trên sidebar mở cùng giao diện cho dự án chọn ở phía trên. Deploy API cùng bản web: API cũ từ chối tải file vào thư mục. (DTD-19)

- Help → Feature guide has a "Project Docs" topic: how to create the standard structure, module and feature folders, FDS/TDS documents from templates, document types and review statuses, Mermaid diagrams, search and linked documents. (DTD-19, #46)
  VI: Trợ giúp → Hướng dẫn chức năng có mục "Tài liệu dự án (Docs)": cách tạo khung chuẩn, thư mục module và tính năng, tài liệu FDS/TDS từ mẫu, loại và trạng thái duyệt tài liệu, sơ đồ Mermaid, tìm kiếm và tài liệu liên kết. (DTD-19)

- Projects have a Docs tab with a document tree (project → module → feature → bugs & changes): search by title or content, filter by type, create folders and FDS/TDS documents from templates, and a one-click standard structure. Documents have a type (FDS, TDS, ADR, RCA, GUIDE, OTHER) and a review status, Mermaid diagrams render in previews, long documents get a table of contents, and an issue lists its linked documents. Adds `document_folders.parent_id`, `project_id`, `kind` and `documents.doc_type`, `status` through a Prisma migration; existing folders become roots. (DTD-19, #44)
  VI: Dự án có tab Docs với cây tài liệu (dự án → module → tính năng → bugs & thay đổi): tìm theo tiêu đề hoặc nội dung, lọc theo loại, tạo thư mục và tài liệu FDS/TDS từ mẫu, và tạo khung chuẩn bằng một nút. Tài liệu có loại (FDS, TDS, ADR, RCA, GUIDE, OTHER) và trạng thái duyệt, sơ đồ Mermaid hiển thị trong preview, tài liệu dài có mục lục, và issue liệt kê tài liệu liên kết. Thêm `document_folders.parent_id`, `project_id`, `kind` và `documents.doc_type`, `status` qua migration Prisma; thư mục hiện có trở thành thư mục gốc. (DTD-19)

- A task worked on by the local runner shows an "Agent run" card with the run state, the agent's current step (for example "Editing apps/web/lib/time.ts" or "Running approved test 1/2") updated every few seconds, the pull request once there is one, and a cancel button for the run's owner. Claude Code runs report each file step; Codex runs report the runner's phases. Adds `agent_runs.progress` and `progress_at` through a Prisma migration. Deploy the API before updating the runner checkout: an older API rejects the new heartbeat field and the run fails. (#39)
  VI: Task do runner local xử lý hiển thị thẻ "Agent run" gồm trạng thái run, bước agent đang làm (ví dụ "Editing apps/web/lib/time.ts" hoặc "Running approved test 1/2") cập nhật vài giây một lần, pull request khi đã có, và nút hủy cho chủ run. Run Claude Code báo từng bước với file; run Codex báo theo giai đoạn của runner. Thêm cột `agent_runs.progress` và `progress_at` qua migration Prisma. Deploy API trước khi cập nhật checkout của runner: API cũ từ chối trường heartbeat mới và run sẽ thất bại.

- Clicking an image in a task's description or comments opens a full-screen viewer: ← / → move through the task's images, + / − / 0 zoom and reset, a button downloads the original, and Esc, the close button or a click on the backdrop closes it. The sidebar no longer shows a horizontal scrollbar. (DTD-16, #38)
  VI: Click vào ảnh trong mô tả hoặc comment của task sẽ mở trình xem toàn màn hình: ← / → chuyển giữa các ảnh của task, + / − / 0 để phóng to, thu nhỏ và đặt lại, có nút tải ảnh gốc, và đóng bằng Esc, nút đóng hoặc click ra nền. Sidebar không còn thanh cuộn ngang. (DTD-16)

- Statuses can be marked "Required before start": once a workspace or team has one, an issue enters a Started status only from such a status and with a target end date. Moves between Started statuses stay free, and workspaces without a marked status are unchanged. Adds the `issue_statuses.required_before_start` column through a Prisma migration. (#33)
  VI: Status có thể bật "Bắt buộc trước khi làm": khi workspace hoặc team có status như vậy, issue chỉ được vào nhóm Đang thực hiện từ status đó và phải có ngày kết thúc dự kiến. Chuyển giữa các status Đang thực hiện vẫn tự do; workspace chưa bật status nào giữ nguyên hành vi. Thêm cột `issue_statuses.required_before_start` qua migration Prisma.

- The local Claude Code and Codex runner reviews each issue read-only first, records the plan as a comment and the estimated target end date on the issue, and only then implements it with that plan. The MCP `update_issue` tool accepts `targetDate`. (#33)
  VI: Runner Claude Code và Codex chạy local giờ review issue ở chế độ chỉ đọc trước, ghi kế hoạch thành comment và ngày kết thúc dự kiến vào issue, rồi mới thực hiện theo kế hoạch đó. Tool MCP `update_issue` nhận thêm `targetDate`.

- Flowie can run under a path of another site, for example `https://poc-dtd.bsr.com.vn/flowie`: set `NEXT_PUBLIC_BASE_PATH=/flowie`, add the same prefix to `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` and `AZURE_AD_REDIRECT_URI`, rebuild `web`, and add the proxy locations in `docs/sub-path-deployment.md`. Left empty, Flowie stays at the domain root. (#30)
  VI: Flowie có thể chạy dưới một đường dẫn của site khác, ví dụ `https://poc-dtd.bsr.com.vn/flowie`: đặt `NEXT_PUBLIC_BASE_PATH=/flowie`, thêm cùng tiền tố vào `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` và `AZURE_AD_REDIRECT_URI`, build lại `web`, rồi thêm các location proxy theo `docs/sub-path-deployment.md`. Để trống thì Flowie vẫn chạy ở gốc domain.

- Agent can use an internal, OpenAI-compatible AI server (for example `http://192.168.98.100:4000/v1`): list its host in `AGENT_PROVIDER_ALLOWED_HOSTS`, recreate the `api` service, then save the URL, model and key under Agent personalization → OpenAI connection. Other hosts still require the official HTTPS API. (#29)
  VI: Agent có thể dùng máy chủ AI nội bộ tương thích OpenAI (ví dụ `http://192.168.98.100:4000/v1`): khai báo host trong `AGENT_PROVIDER_ALLOWED_HOSTS`, tạo lại service `api`, rồi lưu URL, model và key tại Agent personalization → OpenAI connection. Các host khác vẫn phải dùng API HTTPS chính thức.

- Pasting a single web link into an issue description or comment turns it into a link titled with the page's title. (#28)
  VI: Dán một link web vào mô tả hoặc bình luận issue sẽ tự đổi thành link mang tiêu đề của trang.

- Agent runs that finish, fail or are canceled now send an Inbox notification to the agent connection's owner and the issue assignee. (#27)
  VI: Run của agent khi hoàn thành, thất bại hoặc bị hủy sẽ gửi thông báo Inbox cho chủ kết nối agent và người được giao issue.

- Pull requests and their task links can stay current without webhooks: set `SCM_SYNC_INTERVAL_SECONDS` (off by default, minimum 60) and the API syncs every active or failed GitHub/Azure DevOps connection once per interval, as the Sync button does. Only one sync of a connection runs at a time; pressing Sync while one is running returns "already synchronizing". Recreate the `api` service after setting it. (#26)
  VI: Pull request và liên kết task có thể luôn cập nhật mà không cần webhook: đặt `SCM_SYNC_INTERVAL_SECONDS` (mặc định tắt, tối thiểu 60) thì API đồng bộ mỗi kết nối GitHub/Azure DevOps đang hoạt động hoặc bị lỗi một lần mỗi chu kỳ, giống nút Sync. Mỗi kết nối chỉ chạy một lượt đồng bộ tại một thời điểm; bấm Sync khi đang đồng bộ sẽ báo "already synchronizing". Tạo lại service `api` sau khi đặt biến.

### Fixed

- Load-error screens show a centred icon, the message and a small Retry button instead of a Retry bar stretched across the page. (DTD-19, #46)
  VI: Màn hình lỗi tải dữ liệu hiển thị icon, thông báo và nút Thử lại nhỏ ở giữa, thay cho nút Thử lại kéo dài hết trang. (DTD-19)

- Creating a document for a team with no document folders, including through the MCP `create_document` tool, now creates a "General" folder instead of failing with "Document folder not found". (DTD-19, #44)
  VI: Tạo tài liệu cho team chưa có thư mục tài liệu, kể cả qua tool MCP `create_document`, giờ tự tạo thư mục "General" thay vì lỗi "Document folder not found". (DTD-19)

- Issue bars on the Projects, Initiatives and project timelines follow the issue's schedule: they start at the target start and end at the target end, falling back to the creation day and the due date only when the schedule is missing. (DTD-26, #43)
  VI: Thanh issue trên timeline Projects, Initiatives và timeline của dự án theo schedule của issue: bắt đầu ở ngày bắt đầu dự kiến và kết thúc ở ngày kết thúc dự kiến, chỉ dùng ngày tạo và due date khi chưa có schedule. (DTD-26)

- Issue bars on a project's Timeline match the Initiatives timeline: an outline in the status colour over the page background instead of a solid fill, readable text in both themes, and the same compact rows; hovering a bar now highlights it on both timelines. (DTD-25, #42)
  VI: Thanh issue trên Timeline của dự án giống timeline Initiatives: viền theo màu trạng thái trên nền trang thay vì tô đặc, chữ đọc rõ ở cả hai theme và các dòng gọn như nhau; rê chuột lên thanh giờ làm nổi thanh ở cả hai timeline. (DTD-25)

- A project's Issues tab follows the same list/board choice as All issues and has the Display menu (layout, grouping, ordering, properties); board mode no longer shows the list's column header. (DTD-17, #40)
  VI: Tab Issues của dự án dùng chung lựa chọn list/board với All issues và có menu Display (bố cục, nhóm, sắp xếp, thuộc tính); dạng board không còn thanh tiêu đề cột của list. (DTD-17)

- Work an MCP agent does with your token (comments, status changes, mentions) now reaches your own Inbox, labelled with the agent's name, for example "Pham Hoang Tu · flowie-mcp-desktop". Actions you take yourself still do not notify you. (#37)
  VI: Việc agent MCP làm bằng token của bạn (comment, đổi trạng thái, mention) giờ được gửi vào Inbox của chính bạn, kèm tên agent, ví dụ "Pham Hoang Tu · flowie-mcp-desktop". Hành động bạn tự làm vẫn không tạo thông báo cho bạn.

- Comment mentions are easier to spot: the `@` suggestion list shows member avatars, and each `@Name` a comment notified is highlighted. Mentions inside code or link text stay plain. (#36)
  VI: Mention trong comment dễ nhận ra hơn: danh sách gợi ý khi gõ `@` hiển thị avatar thành viên, và mỗi `@Tên` đã được comment thông báo được highlight. Mention trong code hoặc nhãn link vẫn là chữ thường.

- Screenshots in issue descriptions and comments load again after Flowie moves to another domain or sub-path: links saved with the old host, such as `https://flowie.dtd.bsr.com.vn/api/v1/attachments/…/preview`, are now fetched from the current API by attachment id. Rebuild the `web` service to apply it. (#35)
  VI: Ảnh chụp màn hình trong mô tả và comment hiển thị lại sau khi Flowie chuyển sang domain hoặc sub-path khác: link lưu với host cũ, ví dụ `https://flowie.dtd.bsr.com.vn/api/v1/attachments/…/preview`, giờ được tải từ API hiện tại theo id đính kèm. Build lại service `web` để áp dụng.

- An issue opened from a project's page now shows the project in its breadcrumb, and that crumb returns to the project's issue list instead of the team's. Previous / next, reloads and copied links keep it; issues opened elsewhere still show the team. (#34)
  VI: Issue mở từ trang dự án giờ hiển thị dự án trên breadcrumb, và bấm vào đó quay về danh sách issue của dự án thay vì của team. Nút trước / sau, tải lại trang và link sao chép vẫn giữ breadcrumb này; issue mở từ nơi khác vẫn hiển thị team.

- Signing in under a path such as `/flowie` no longer lands on "Page not found" at `/flowie/flowie`: the web container now applies `NEXT_PUBLIC_BASE_PATH` at runtime as well as at build. Rebuild the `web` service to apply it. (#32)
  VI: Đăng nhập khi chạy dưới đường dẫn như `/flowie` không còn rơi vào trang "Page not found" tại `/flowie/flowie`: container web giờ áp dụng `NEXT_PUBLIC_BASE_PATH` cả lúc chạy lẫn lúc build. Build lại service `web` để áp dụng.

- Microsoft sign-in no longer fails with "The Microsoft sign-in request has expired." when Flowie runs under a path such as `/flowie`. The sign-in cookie now follows the path of `AZURE_AD_REDIRECT_URI`; rebuild the `api` service to apply it. (#31)
  VI: Đăng nhập Microsoft không còn báo "The Microsoft sign-in request has expired." khi Flowie chạy dưới đường dẫn như `/flowie`. Cookie đăng nhập giờ theo đường dẫn của `AZURE_AD_REDIRECT_URI`; build lại service `api` để áp dụng.

- Connecting a GitHub or Azure DevOps account in Settings → Code & reviews no longer fails with "The request could not be completed." The connection was saved but its response could not be encoded; an account added before this fix already exists and appears after reloading the page. (#25)
  VI: Kết nối tài khoản GitHub hoặc Azure DevOps trong Settings → Code & reviews không còn báo lỗi "The request could not be completed." Kết nối đã được lưu nhưng phản hồi không mã hoá được; tài khoản thêm trước bản sửa này đã tồn tại và hiện ra sau khi tải lại trang.

- The local runner resolves a configured provider binary through a PATHEXT-aware PATH lookup before starting it. On Windows npm installs Claude Code and Codex as a `.CMD` shim, which `CreateProcess` never finds from a bare name, so the documented `"claude": "claude"` configuration could not start the provider at all; a binary missing from PATH is now rejected with a clear error instead of a bare file-not-found.

### Changed

- Scrollbars across the app are thin with a neutral thumb that follows the light, dark and color themes and darkens on hover; arrow buttons are gone. The sidebar uses an overlay scrollbar that appears on hover or while scrolling and never scrolls sideways. Native controls follow the app theme instead of the OS theme. Scrolling behavior is unchanged, and browsers without scrollbar styling keep their default. (DTD-32, #45)
  VI: Thanh cuộn trong toàn app mỏng, thumb màu trung tính theo theme sáng, tối và các theme màu, đậm hơn khi hover; bỏ nút mũi tên. Sidebar dùng thanh cuộn nổi chỉ hiện khi hover hoặc đang cuộn, không cuộn ngang. Control native theo theme của app thay vì theme của hệ điều hành. Cách cuộn không đổi; trình duyệt không hỗ trợ tùy biến giữ thanh cuộn mặc định. (DTD-32)

- Every settings page shares one layout: a title with a short description, the same centered width and padding, and its own scroll area. Pages that had no description now have one; navigation and page behavior are unchanged. (DTD-18, #41)
  VI: Mọi trang cài đặt dùng chung một bố cục: tiêu đề kèm mô tả ngắn, cùng độ rộng căn giữa và padding, và vùng cuộn riêng. Các trang trước đây chưa có mô tả nay đã có; điều hướng và hành vi của trang không đổi. (DTD-18)

- Settings navigation is regrouped as Account, Workspace, Issues, Projects, Features, and AI & integrations; Project properties and AI operations are now listed, and the settings header shows "Settings › group › page". (DTD-18, #40)
  VI: Điều hướng Settings được gom lại thành Tài khoản, Workspace, Issues, Projects, Tính năng, và AI & tích hợp; Project properties và Vận hành AI giờ có trong danh sách, và header settings hiển thị "Settings › nhóm › trang". (DTD-18)

- The Inbox shows comment text in each row and a header with Mark as read and Open actions in the preview, closer to the Circle layout. (#28)
  VI: Inbox hiển thị nội dung bình luận ở từng dòng và thanh tiêu đề có thao tác Đánh dấu đã đọc và Mở trong khung xem trước, gần với bố cục Circle.

- The task detail sidebar lists linked pull requests under Diffs, one line each with a colored state icon, PR number, title and an Open/Draft/Merged/Closed badge, and shows the hint for linking a PR when there is none; the main column keeps the detailed PR cards only when PRs exist. Blocked-by and related tasks moved to the sidebar and show their title even when the task was opened directly. Activity rows show their time inline, comment actions appear on hover or keyboard focus (always on touch screens), and removing a pasted image uses an icon button. No API or schema change. (#24)
  VI: Sidebar chi tiết task liệt kê pull request liên kết trong mục Diffs, mỗi PR một dòng gồm icon trạng thái có màu, số PR, tiêu đề và nhãn Open/Draft/Merged/Closed, và hiện hướng dẫn liên kết PR khi chưa có; cột chính chỉ giữ thẻ PR chi tiết khi có PR. Task bị chặn bởi và task liên quan chuyển sang sidebar và hiện tiêu đề cả khi task được mở trực tiếp. Dòng hoạt động hiện thời gian ngay sau nội dung, thao tác bình luận hiện khi rê chuột hoặc focus bàn phím (luôn hiện trên màn hình cảm ứng), và nút xoá ảnh đã dán là nút icon. Không thay đổi API hay schema.

- Contribution rules require bilingual English and Vietnamese source comments that explain in detail what the code handles, and bilingual changelog entries that reference their pull request and, after release, their merge commit. Change history stays in the changelog instead of source comments. Existing comments and entries are unchanged. (#19)
  VI: Quy tắc đóng góp yêu cầu comment mã nguồn song ngữ Anh – Việt, giải thích chi tiết đoạn mã xử lý gì, và mục changelog song ngữ ghi số pull request, sau khi release thì thêm commit merge. Lịch sử thay đổi được ghi trong changelog thay vì trong comment mã nguồn. Comment và mục changelog hiện có giữ nguyên.

- Agent runs must now report auditable test evidence. Each reported check carries its command, exit code, verdict, duration and a bounded log tail (stdout and stderr merged, last 2000 characters), and a verdict that contradicts its exit code is rejected. A result awaiting review must report at least one check and may not report a failed one; a failed result still may, which is how a failure is recorded. The local runner captures this for every approved command and records a command stopped at `commandTimeout` as a failed check with exit code 124 instead of dropping it. The issue comment lists each check with its exit code, duration and command, and shows a log only for a failed one; the full evidence stays on the run record. Approved test commands must not print secrets, because their arguments and log tail reach Flowie. Clients reporting the previous free-form `tests` shape are rejected with 400. No schema migration is required.

- Each local runner run now works in its own `git worktree` instead of the shared checkout. The run fetches its base branch from `origin` first, so a run never builds on a stale local ref, and `baseRef` now always names a branch on `origin` (`main` and `origin/main` are equivalent). The shared checkout is never modified and no longer has to be clean before a run, so one failed run cannot block the next. A successful run removes its worktree and leaves the reviewable commit on branch `codex/flowie-RUN_ID`; a failed run keeps its worktree only while it still holds uncommitted work and prints that path locally, never to the server. The optional `worktreeRoot` field chooses where run worktrees live and must be an absolute path outside `repositoryPath`; it defaults to `<repositoryPath>.flowie-worktrees`. Local tooling only; nothing changes on CT107.

- A push to `main` that changes only documentation (Markdown files, `docs/`, `llms.txt`) and Unreleased changelog entries no longer runs verification or redeploys CT107. Any other file, a new or changed release heading in `CHANGELOG.md`, a new branch, a force push or a manual workflow run still deploys. (#20)
  VI: Push lên `main` chỉ đổi tài liệu (file Markdown, `docs/`, `llms.txt`) và mục changelog Unreleased sẽ không chạy kiểm thử và không deploy lại CT107. Đổi bất kỳ file nào khác, thêm hoặc sửa tiêu đề release trong `CHANGELOG.md`, branch mới, force push hoặc chạy workflow thủ công thì vẫn deploy.

- Task detail shows linked pull requests synced from GitHub or Azure DevOps: state, number, repository, source and target branch, head commit, added and deleted lines with a diff bar, changed files, and reviewer decisions, with links to the in-app review and the provider. Edit, save, SLA, attach, subscribe, mention and comment actions are icon buttons with tooltips. `GET /reviews` accepts `issueId` to list the reviews linked to one task. No schema change. (#21)
  VI: Chi tiết task hiển thị pull request liên kết được đồng bộ từ GitHub hoặc Azure DevOps: trạng thái, số PR, repository, branch nguồn và đích, commit mới nhất, số dòng thêm/xoá kèm thanh diff, số file thay đổi và quyết định của reviewer, có liên kết đến trang review trong ứng dụng và trang của nhà cung cấp. Các thao tác sửa, lưu, SLA, đính kèm, theo dõi, nhắc tên và bình luận chuyển thành nút icon có tooltip. `GET /reviews` nhận tham số `issueId` để liệt kê review liên kết với một task. Không thay đổi schema.

- Task activity names who changed what: status, assignee, title, priority, project, dates and effort show as `before → after`, and older updates list the changed fields. Comments and activity written through an MCP connection carry a violet `<connection name> · AI` badge next to the person whose token was used; agent comments from before this release show `AI agent`. Typing `@` in a comment suggests team members (accent-insensitive, arrow keys and Enter/Tab to choose), inserts `@Name`, and drops the mention when that text is removed. Save, cancel and delete-confirmation buttons in task detail are icon buttons. No schema change. (#22)
  VI: Hoạt động của task nêu rõ ai thay đổi gì: trạng thái, người thực hiện, tiêu đề, độ ưu tiên, dự án, ngày và công hiển thị dạng `trước → sau`, còn các cập nhật cũ liệt kê trường đã đổi. Comment và hoạt động ghi qua MCP connection có nhãn tím `<tên connection> · AI` cạnh người sở hữu token; comment của agent trước bản này hiển thị `AI agent`. Gõ `@` trong comment sẽ gợi ý thành viên nhóm (không phân biệt dấu, chọn bằng phím mũi tên và Enter/Tab), chèn `@Tên` và bỏ mention khi xoá đoạn đó. Các nút lưu, huỷ và xác nhận xoá trong chi tiết task là nút icon. Không thay đổi schema.

- Synced pull requests link themselves to tasks whose key (for example `DTD-6`, in any case) appears in the branch name, title or description, limited to the repository's mapped team; existing reviews pick up links on their next sync or webhook. The task's Pull requests section now stays visible and explains how to link one when it is empty. A new MCP tool `read_attachment_image` returns authorized PNG, JPEG, GIF or WebP attachments up to 5 MiB as image content, so agents can read screenshots referenced in descriptions and comments. No schema change. (#23)
  VI: Pull request được đồng bộ tự liên kết với task có mã (ví dụ `DTD-6`, viết hoa hay thường đều được) xuất hiện trong tên branch, tiêu đề hoặc mô tả, giới hạn trong team được gán cho repository; review đã có sẽ được liên kết ở lần đồng bộ hoặc webhook kế tiếp. Phần Pull requests của task luôn hiển thị và hướng dẫn cách liên kết khi còn trống. Tool MCP mới `read_attachment_image` trả về ảnh đính kèm PNG, JPEG, GIF hoặc WebP tối đa 5 MiB mà connection có quyền đọc, dưới dạng nội dung ảnh, để agent đọc được ảnh chụp trong mô tả và comment. Không thay đổi schema.

### Security

- A queued or running agent run is now directed at exactly one MCP connection. Automation routes a run to its rule's connection and a direct claim creates a run for the calling connection; any other connection claiming that issue is rejected with 409, including after the lease expires, so an expired lease is no longer a takeover window for a different agent. Returning an issue to the shared pool requires canceling its run. `list_runs` returns `assignedToThisConnection` and accepts it as a filter, and the local runner's `pending` command lists only runs directed at its own connection. Each runner host must therefore use its own connection. No schema migration is required.

### Added

- `.env.example` documents the seven MCP variables the API reads, which were previously visible only in `docker-compose.yml`. The endpoint is mounted at `/mcp/` only while `MCP_ENABLED=true` and a reverse proxy in front of the API must route `/mcp/` to it; mutation tools and the agent run dispatcher stay unavailable while `MCP_WRITES_ENABLED=false`; and `MCP_ALLOWED_HOSTS` must name every public hostname the endpoint is reached through, because DNS-rebinding protection compares the request Host against that list and its default covers loopback only. Documentation only: no runtime behaviour, configuration default, or schema changes.

- The local Flowie agent runner can use Claude Code instead of Codex (`"provider": "claude"` in the runner JSON; Codex stays the default). Claude Code runs non-interactively in the checkout with file tools only, restricted settings, no MCP servers and no Flowie/SCM/database tokens; `doctor` rejects a missing, outdated or signed-out CLI. Each Claude session is saved locally, named after the issue (for example `Flowie DTD-3`), and its id is printed when the run starts so it can be followed and later opened with `claude --resume`. A new `pending` command lists issues with queued automation runs so the runner can be polled periodically. Local tooling only; nothing changes on CT107.

- Workspace owners can permanently delete a workspace from Workspace settings after typing its exact name. The API verifies active ownership and confirmation, removes workspace data atomically, and clears saved default-workspace preferences while preserving accounts and other workspaces.

- Workspace URLs now use the existing immutable workspace ID, independent of Vietnamese names. Existing slug links redirect to the equivalent ID-based page with query parameters and anchors preserved; workspace navigation and notification links use the stable ID. No additional migration is required for workspace URLs or deletion.

- Workspace All issues includes Active, Backlog, Bugs, No team, and No project views with the existing search, filters, export, and bulk actions. Issues and bugs can be created without a team or project, default to workspace Backlog, and can later move into a team or back to the workspace. Workspace issues use `WS_` identifiers and remain visible only to active workspace members; team issues retain team access rules. Apply migration `20261026120000_workspace_issues` before starting the API or worker.

- Workspace owners and admins can browse existing active Flowie users and search by name or email when inviting members. Results exclude current members and pending invitations, with bounded results and retry support.

- Microsoft Teams notifications: workspace administrators can connect a Teams channel next to Discord in Settings → Integrations, and project leads or administrators can connect a per-project channel from the project's properties ("MS Teams" below Slack). Issue and project events are posted as Adaptive Cards through Teams Workflows webhooks (`*.logic.azure.com` / `*.api.powerplatform.com` only). The feature is hidden and rejected by the API unless Microsoft Entra sign-in (`AZURE_AD_*`) is configured. Requires the `teams_channels` migration; daily digests and dispatcher reports remain Discord-only.

- Accounts can set or remove a default workspace from the workspace menu. Returning to Flowie and signing in (including Microsoft and MFA) honor that choice after checking current membership; direct links keep their destination. The preference syncs across devices through the existing versioned preference store; no schema migration is required.
- Help includes searchable English/Vietnamese feature guides, report metric explanations, contextual keyboard shortcuts and direct links to features.

- A scoped dashboard report endpoint provides complete overview totals, dated recorded effort, missing-date coverage and top project charts without first-page truncation. Restricted project metadata remains hidden, current status colors are returned, and no schema migration is required.

- Product acceptance records distinguish verified local features, historical merged/deployed code, the proposed off-site backup configuration and the failed read-only Codex trial. Release checks require the exact new CI/deployment revision, committed migrations and readiness before tagging.

- Browser regressions verify Vietnamese workflow routes and document editing at mobile width without translating saved content. Authenticator state updates with successful security changes, and sign-in regressions wait for workspace hydration before navigating so canceled requests are not hidden.

- The off-site backup proposal includes a private Backblaze B2 destination through S3, a credential template and provider-specific recovery/retention considerations. Account, bucket, credentials, CT107 inventory and an actual off-site restore remain activation prerequisites; no paid service or production timer is enabled by these files.

- English/Vietnamese copy is organized into typed feature catalogs, with account-language Astryx labels and checks that translations preserve interpolation values. Shared formatting keeps calendar dates stable across timezones and distinguishes future/past relative times in Vietnamese.

- Preferences provide timezone/week-start controls used by calendars and workflow reports, plus optional eligible self-assignment in the task/bug create dialog. The dialog now has one owner across the workspace, preventing duplicate focus traps; users can clear the default assignee before saving.

- Account security includes authenticator enrollment, one-time recovery-code display and confirmed disable/replacement controls. Password sign-in and Microsoft callbacks lead to the dedicated MFA verification page before any browser session is issued; mobile layouts keep recovery material readable without persistent browser storage.

- Opt-in authenticator MFA protects password and Microsoft browser sign-ins, with one-use recovery codes, proof-checked enrollment/security changes, replay protection and session invalidation. Apply the account-MFA migration and configure independent `AUTH_MFA_ENCRYPTION_KEYS` outside Git before enrollment; missing keys never permit a password-only fallback for enabled accounts.

- Account security has separate mobile tabs for signed-in devices, personal login/security history and owned integration credentials, with paged results, individual revocation confirmation and recoverable load errors.

- The dashboard provides timezone/date/team/project/status filters, captured daily charts and day drilldown, paged workload/project progress, explicit missing-history coverage and retry recovery. Mobile layouts preserve full duration/sample details and no longer treat the first task page as the complete workspace.

- Workflow reports calculate current scope totals, observed throughput, lead/cycle-time distributions, status age and reopen counts across all matching tasks. Daily WIP shows unknown history separately; weekly workload and project progress use scoped cursor pagination and real captured events, with no reconstructed baseline completions.

- SLA settings provide working-hour and holiday editing, deadline previews, scoped policy history and team compliance reports. Task details show paused/manual/managed clocks, actual cycle history and explicit policy reapply or failed-job retry, with mobile controls and reload recovery.

- SLA policies support versioned business calendars, holidays, paused statuses, warning thresholds and a one-time reassignment after breach. Task clocks retain their accepted policy on reopen, preserve manual deadlines, record actual cycles and stage authorized alerts atomically with durable retry. Apply all business-SLA migrations before API startup; legacy tasks keep untracked deadlines until explicitly enrolled.

- Issue lifecycle history captures real creation/status/team/deadline/archive transitions atomically for all database writers, with explicit observation baselines for existing issues. It provides the event foundation for SLA and flow reports without inventing historical status-entry dates. Apply the lifecycle-history migration before API startup.

- Teams have recurring task/bug schedules with timezone-aware previews, daily/weekly/monthly rules, editable templates, explicit extra runs, pause/resume and paged history. Occurrence creation commits atomically, rechecks the creator's access and pauses after three failures. Delayed workers coalesce missed occurrences; apply the recurring-issues migration and timezone-data dependency before API startup.

- CSV task/bug imports support column mapping, validation previews, per-row errors, explicit confirmation, persistent progress and external-ID duplicate handling. Scoped issue exports honor the applied list filters, and selected documents can be exported as Markdown ZIPs with a manifest and optional bounded stored attachments. Apply the data-exchange migration before API startup; previews expire after 15 minutes and result details are kept for 30 days. Sensitive downloads use private no-store responses.

- Workspace administrators can filter and page accessible audit events by actor, entity, UTC period and Web/AI/system source, and export up to 10,000 events or 10 MB. Unknown historical scopes are excluded; exports omit document bodies and arbitrary metadata. Document creation, editing and archival now record transactional audit events for both Web and AI operations.

- Archived tasks, projects, documents and initiatives have a scoped recovery center with restore previews, dependency checks, conflict detection and audit records. Restoring a project leaves archived tasks available for individual restoration; automatic permanent deletion remains disabled.

- Operators can capture consistent PostgreSQL, MinIO and configuration backups into an encrypted restic repository, verify file manifests, rehearse isolated recovery and inspect backup age. Off-host storage and credentials must be configured before enabling the supplied timers; capture briefly stops application writers and shares a lock with production deployment. Retention defaults to a dry run.

- Issue lists support previewed bulk changes to priority, status, assignee, project, cycle and replacement labels. Explicit all-results selection freezes up to 1000 accessible issues; durable jobs recheck access and versions, expose per-issue results, resume after reload and support cancellation. Apply the bulk-operations migration before API startup.

- Workspace managers can inspect job heartbeats/progress, failed delivery queues and browser-error counts. Browser reporting accepts only bounded category/digest metadata. Apply the operational-observability migration before starting API or worker.

- A product-completeness review and implementation tracker cover access consistency, recoverable workflows, operational readiness and productivity features with separate local and production acceptance gates.

- Browser regressions cover Inbox snooze, account locale and AI budgets across Chromium, Firefox and WebKit. Isolated SMTP/TLS and real MinIO signing acceptance complement UI fixtures; CI provisions its own storage and retains failure traces.

- A modular local Codex runner binds work to an approved project/repository, keeps Flowie tokens out of child processes, renews leases, stops on lease loss and records locally executed test results. Inspect is read-only; publishing requires an explicit local option and existing SCM credentials.

- Workspace administrators can review AI tool errors, latency and run leases, and set atomic workspace/tool minute budgets across connections. Apply the operations migration before API startup. GitHub App verification checks the current PR head and observed CI separately from agent-reported evidence; it does not complete issues or replace review.

- Inbox snooze and notification channel controls persist through the API, show real SMTP availability and request desktop permission only after a user action. Inbox, workspace search and collaboration controls honor English/Vietnamese account preferences.

- Notifications support persistent snooze with wake-up events and opt-in private email through a leased retry queue and scoped delivery status. Apply the channel/snooze and UTC-queue migrations before API startup; email requires verified recipients and configured SMTP/TLS.

- Language, home view, comment shortcut and readable UI preferences synchronize
  by account with version checks across devices. Apply the account-preferences
  migration before starting the API; conflicts require an explicit reload.

- Workspace search reads accessible issues, document contents, projects and
  member names from the server with signed cursors and Vietnamese search.
  Ctrl+K can open search, and documents have direct URLs using the shared editor.

- A second implementation plan tracks Inbox fixes, exact-commit deployment,
  bounded collaboration feeds, global search, notification delivery, account
  preferences and local Codex/AI operations, with explicit acceptance gates.

- The UI/UX implementation plan tracks all 17 fixes and six features with module
  boundaries, regression evidence, before/after images and CT107 release gates.
  SMTP delivery, real object storage and installed AI clients have explicit
  acceptance steps before being declared operational in production.

- Isolated browser regressions cover autosave, revision reconciliation/restore,
  comment editing/replies and retry, notification persistence, bug forms, file
  attachments, mobile properties, settings, Help/AI setup and accessibility. CI
  verifies Prisma schema drift and applies real migrations; the UI harness uses
  synthetic accounts and separate storage, with failure traces retained for seven
  days.

- AI connection setup now provides project-bound read-only/coding presets,
  token-free local client configuration, clipboard feedback and a live MCP
  initialize/discovery/grant check while the newly issued token is available.
  AI settings show configured capabilities, and accessible agent runs expose
  reported evidence and cancellation for owners or workspace managers.

- Password recovery uses private SMTP delivery, hashed single-use tokens with a
  15-minute expiry, database rate limits and identical request messages for unknown
  accounts. Reset revokes sessions and API/MCP tokens immediately. Configure SMTP
  and apply the auth-version migration before enabling the deployed feature.

- Activity now offers author edit/delete, reply threads, searchable mentions,
  comment revision history and attachment pickers. Web comment retries reuse a
  request key to avoid duplicate posts after a lost response; apply the committed
  deduplication migration before starting the updated API.

- Comment contracts now support one-level replies and access-checked mentions,
  preserve edit revisions and reject stale author edits. Mention notifications
  are staged durably. The comment history/thread Prisma migration is required.

- Users can file and edit structured bugs from the issue UI, and filter issue
  views by type and severity. An access-scoped server report groups all bugs by
  severity/status; bug details remain separate from task priority.

- Issue and MCP contracts now support Task/Bug type, severity, environment,
  reproduction steps and expected/actual results. Existing issues remain Tasks;
  the structured-bug Prisma migration must run before the updated API starts.

- Web document editing now checks saved versions, retains conflicting drafts and
  lets users compare/reconcile the latest content. Revision history and guarded
  restore share the existing MCP history and create a new revision on restore.

- An application UI/UX review now records reproducible editing, navigation,
  mobile and settings issues, with evidence, priorities and acceptance criteria
  for follow-up improvements.
- Local AI client setup now includes token-free Codex, Cursor and Claude Code
  configuration templates and a scoped-access acceptance checklist. Each client
  still requires connection verification before being declared supported.
- A detailed MCP implementation roadmap covering AI access to project work,
  comments and documents, with tracked milestones, acceptance criteria and
  CT107 production rollout requirements.
- AI clients can connect through scoped, expiring MCP credentials to read project
  work, write issues/comments/documents, restore document revisions and report
  agent-run evidence. MCP and its write tools remain disabled by default; both
  committed Prisma migrations must complete before the API and worker start.
- Workspace managers can configure repository instructions and label-based queues
  for external coding agents, monitor runs and cancel work. Queued work requires
  an external agent to claim it; the production API does not execute repository
  commands or create pull requests.

### Changed

- Settings → Integrations → AI connections (MCP) is more compact: connections are listed first with an active/inactive status dot, expiry, permission and project counts, and the creation form opens from a New connection button. Copy, revoke, dismiss, refresh, evidence, cancel and disable actions are icon buttons with tooltips, and revoking a connection asks for an inline confirmation. Creating or revoking a connection, saving a repository, creating an automation, cancelling a run, disabling an automation and copying values report the result in a toast, and successful creates and saves show an animated check mark. No API or schema change.

- Bug severity uses a compact icon dropdown in creation and editing forms, with the same Unspecified, Low, Medium, High and Critical values and localized labels.

- Issue creation has a compact header and Task/Bug selector, a clearer writing area, labeled property controls and a fixed action footer for long bug forms. Existing creation, team selection, defaults and create-more behavior are preserved; selected native statuses remain visible in the picker.

- Projects lists and timelines use lighter bars, compact group headers and clearer progress indicators. Issue details have a centered reading column, a distinct properties sidebar, clearer Markdown typography and compact activity with author avatars. Existing filters, editing, comments, attachments and navigation remain unchanged; no schema or configuration changes are required.

- Configuring Microsoft Entra sign-in makes it the only sign-in method: password login, local registration, password recovery and pending password MFA challenges are disabled. The first verified Microsoft sign-in links a matching local email without changing user IDs, work or memberships, removes the local password and revokes its existing browser sessions. Subsequent sign-ins synchronize name, email and photo through the immutable tenant/object identity; conflicting identities are rejected. No schema migration is required; production must have working Entra credentials and redirect configuration before deployment.

- Advanced reports use responsive metric tiles, aligned filters with expandable calendar settings, paired analysis sections and compact actions. Missing history and empty results remain explicit.
- The compact Help menu again shows release highlights and the published version/date, with a dedicated in-app release-notes view sourced from the built changelog.
- Report and Help surfaces correctly adopt the saved light theme after hydration, and Help remains available when mobile navigation is closed.

- Account-security/MFA controls and workflow analytics use feature-localized text and account-aware dates. Report week boundaries correctly map Monday, Sunday and Saturday calendar preferences to the reporting convention.

- Archived-record recovery, CSV/ZIP exchange, recurring schedules and business-SLA screens follow the account language, including previews and enum labels. New schedule/calendar forms start with the account timezone; archived records keep readable dates and restore actions on mobile.

- Core task/bug forms, workflow controls, comment actions, document editing/history and navigation follow the account language. User-authored titles, status names, descriptions and Markdown remain unchanged; bug drafts stay isolated when switching the selected issue.

- Account preferences accept a validated timezone, week start and optional self-assignment. Versioned writes preserve fields omitted by older clients, and an explicit account timezone takes precedence over browser timezone during sign-in. Existing preference storage needs no new migration.

- Local Codex acceptance records distinguish a successful model call from a reviewable code change and production acceptance. The observed managed read-only CLI run remains failed, with its test connection revoked; deployment and PR acceptance are still pending.

- Project and initiative lists use cursor pages and batched read models with server-side issue summaries; screens expose loading more records and the scope of local filters. Project/initiative update history is pageable, and temporary portfolio failures offer recovery. Issue summaries and workspace project updates exclude teams outside the reader's access.

- API readiness executes a database query, Redis PING and signed bucket access check; liveness is available separately. Provision the configured storage bucket before deployment. API diagnostics use request references and omit raw request URLs, payloads and exception messages; deployed API and Help expose the workflow commit SHA.

- Comment and activity APIs return bounded cursor pages with batched reactions
  and files. Web loads older pages and long reply threads on demand; concurrent
  page responses preserve newly posted comments and newer edits.

- Web issue views now load server-filtered cursor pages, retain query scope on
  retry/mutation and offer Load more with visible loaded/total counts. Detail
  reads one issue by key; account identity partitions issue snapshots.

- Issue listing now returns bounded cursor pages with server-side scope, search
  and filter matching; relationships hydrate in batches. Detail URLs can resolve
  one issue directly. Apply the pagination index migration before deployment;
  list clients must read pagination metadata rather than assume all issues loaded.

- Browser preferences now control the home view, typography, link/cursor behavior
  and comment shortcut. English is the default, with an English/Vietnamese catalog
  for authentication and shared feedback. Help supports topic search and real
  platform shortcuts; missing pages show an explicit recovery screen.

- Production deployment now requires backend/MCP integration checks, clean-database
  migrations and the web build to pass in CI before CT107 deployment begins.
- Issue/comment/document writes detect stale MCP versions and stage durable
  notification delivery, so retries do not duplicate saved mutations.

### Security

- Only active workspace owners can add team members or join teams, including teams previously configured as Open. Members, team leads, and workspace admins cannot self-join or add others through the API. Team access screens hide unauthorized join/add actions and show owner-managed membership; administrators creating teams no longer gain automatic membership. Existing memberships are preserved; no migration is required.

- Browser access tokens are bound to revocable database sessions with explicit issuer, audience and purpose. Refresh secrets rotate once while retaining the device identity; logout and individual-device revocation block still-unexpired access tokens, and sockets revalidate within 15 seconds. Apply the account-security-history migration first; valid older refresh cookies can upgrade, while access-only legacy clients must sign in again.

- Account security exposes paged personal login history and owned credential inventory, permits revoking an MCP connection after workspace access is lost, and retires issuance of personal keys unsupported by the current API. Password sign-in is rate-limited by account and request peer; review AUTH_LOGIN_IP_LIMIT for corporate networks. This is the session foundation; MFA enrollment is a separate gate.

- Inbox notification creation, reads, snooze/delivery metadata and queued realtime records recheck the recipient's current access to the referenced entity. Workspace administrators do not gain private project/task access through notification bodies; revoking team membership hides retained records and prevents queued realtime payloads from being published to that recipient.

- Archiving a shared project requires access to every active task affected by its cascade; project-reference validation holds a read lock to coordinate with archival.

- Project lists now filter inaccessible teams before hydration, and initiative links, progress counts and project activity exclude restricted projects. Search and MCP project reads share the same membership predicate while MCP retains its additional token grants.

### Fixed

- Screenshots pasted into an issue description or a comment are shown as pictures instead of a broken image: embedded attachment URLs are fetched with the session the private attachment route requires, and a tall screenshot is bounded so it no longer fills the description. While editing a description or writing a comment, every image the text references is listed as a thumbnail with its own Remove control, so the `![name](url)` markup no longer has to be read or deleted by hand. No schema or deployment change.

- Production deployment builds the worker again after issues became allowed without a team: the auto-close SLA check accepts team-less issues, which match only workspace-wide SLA policies. No schema change beyond the existing `workspace_issues` migration.

- Microsoft Teams "Save", "Disconnect" and "Send test" (workspace Integrations and project channel) now show a progress state and report success or the API/provider error in a toast on every attempt, instead of silently repeating the previous message; a network failure no longer leaves Save stuck.

- Archive issue and destructive Settings confirmation buttons keep their labels readable against the red background in light and dark themes.

- Dashboard project/date filters use consistent control heights and labels, with centered range summaries and actions. Narrow screens wrap filters without changing their values or behavior.

- Browser regression checks support an isolated web port through `FLOWIE_E2E_WEB_PORT`, preventing another local development server from serving the wrong app during verification.

- Production verification gives browser dependency installation and test execution separate bounded time budgets within a 60-minute job, allowing slow Ubuntu package downloads without cutting off healthy regression tests. All three browser suites still gate deployment, with a 20-minute test limit and early stop after five failures.
- Default-workspace browser verification waits for the destination Inbox after root redirects, so WebKit does not mistake a successful client redirect for an interrupted page load.
- Inbox recovery verification waits for initial sidebar and page loads to settle before restoring the network, avoiding a false failure when automatic recovery removes Retry before the test clicks it.
- Password and MFA sign-in discard anonymous navigation caches before opening the saved workspace or requested direct link, preventing successful sign-ins from returning to the login page. Browser verification stops after five failures and attempts to retain traces on cancellation so shared regressions remain diagnosable before deployment.
- Help search verification follows the feature-guide menu and checks the current password-recovery instructions, keeping the production gate aligned with the redesigned Help navigation.
- Emoji upload waits for workspace loading to finish before opening the form, preventing a misleading missing-image error when uploads are started immediately after navigation.

- Initiative Activity, restored dashboard reports and compact issue toolbars retain their shared translations, pagination and change records when combined for production verification; no schema or configuration changes are required.

- Initiative recovery checks follow the current Activity controls while continuing to verify temporary-outage recovery and both pages of persisted update history. Dashboard and Initiative change records are retained together when integrating main.

- Initiative Activity regressions verify failed-draft recovery, accepted updates, Overview navigation, readonly visibility and real cursor pagination on three browser engines; month grouping also separates years at account-timezone boundaries.

- Initiative Activity matches the centered project update layout with an inline health/update composer, author avatars, month/year groups and a compact change-history toggle. Posting preserves failed drafts and updates Overview without resetting the composer, and Overview’s See all opens Activity; cursor pagination, read-only membership and recoverable history errors remain explicit. No migration or API change is required.

- Report and bulk forms open after the toolbar menu closes and focus their title region, avoiding an automatically focused close-button tooltip that can consume Escape on Firefox. Pagination acceptance waits for each real cursor response and its settled count, so loading labels and footer removal cannot be mistaken for completed pages.

- Browser regressions cover compact issue actions on desktop/mobile, keyboard focus after report/bulk dialogs, report recovery, real cursor pagination and the relocated bulk/CSV commands across Chromium, Firefox and WebKit.

- Issue lists keep bulk changes, CSV export and team bug reports in a compact toolbar menu instead of permanent action strips. Reports open on demand, pagination appears at the bottom only when needed, and project AI scheduling shares the existing toolbar. Filters, export scope and resumable bulk previews remain available; no migration is required.

- The workspace dashboard restores its compact five-metric overview, throughput/status chart row and effort/project charts. Advanced workflow reports now have a separate `/reports` page with links in both directions. The restored layout retains complete scoped server data, language/time preferences and recoverable errors; deploy API and Web together for the dashboard report endpoint.

- Recurring-run browser acceptance waits for durable job completion before verifying the refreshed history, avoiding false CI failures from a temporarily empty list while retaining the original completion deadline and one-task assertion.

- SLA policy history waits until editing and list refresh complete, preventing a just-saved revision from disappearing behind a stale history view. Browser regressions verify committed revisions and workspace hydration before navigation.

- Authenticator QR codes retain a white quiet zone in dark themes, successful MFA sign-ins update account activity timestamps, and authentication/security error responses are explicitly private and non-cacheable.

- Operations keeps live worker instances and each job's latest state visible after many application restarts, instead of letting older stopped instances fill the result limit. An explicit flag reports an unusually large live result.

- Updating an issue with its existing status preserves its original completed/canceled timestamp.

- Updating an issue validates project, assignee and label references even when its status stays unchanged; relation-only edits advance its version without producing an invalid SQL update.

- Saved Views open with their required project provider, synchronize header/body retry and expose failures separately from missing views. Issue Insights and saved-view totals use the full server-filtered scope rather than the currently loaded page; application error boundaries provide recovery actions.

- Issue status settings now support version-checked administration, prevent deleting statuses in use or the last category status, and preserve customized workflows when issue options reload.

- Initiative Projects tabs open without a client-side exception, including
  direct links and reloads. Shared timelines refresh the owning page after
  project edits, keeping initiative and workspace project dates current.

- Storage acceptance builds pinned official MinIO source and runs a loopback
  fixture on clean CI runners without depending on unavailable public community
  images. Production's cached-image policy remains intact.

- Notification channel toggles respond immediately while saving, roll back on failure and preserve the user gesture required to request browser permission.

- Inbox opens the current issue by ID, with shared Markdown, properties,
  comments and attachments even when the issue is outside the cached page.
  Notification ordering uses original instants; failed loads keep their scoped
  snapshot and offer Retry, with accessible keyboard selection.

- Production checks out the exact commit verified by its workflow and rejects
  dirty tracked source before deployment. Later merges can no longer change the
  revision selected by an earlier queued deployment; readiness also checks SHA.

- Browser checks now wait for persisted comment rows and completed theme menu
  transitions; regressions also cover recovery of locally backed-up document
  drafts and accessibility in both light and dark appearance.

- Switching tasks during description saves or pasted-image uploads no longer
  changes the new task's draft or upload state. Repeated image paste is serialized
  per task, including when returning to an earlier task before a response arrives.
  The comment composer waits for its authorized activity context before accepting
  input; pending comment responses also stay bound to their original task.

- Document updates reject explicit null values for required saved fields with a
  validation response, while empty content and clearing nullable links remain
  supported. Invalid patches no longer reach database constraint failures.

- Prisma now records the defaults and presence index already installed by the
  committed migrations, including UTC comment revision timestamps. Schema checks
  no longer propose dropping existing defaults or the presence index.

- Cycle views distinguish an empty schedule from a failed request and offer retry.
  Switching issues no longer applies an earlier attachment response to the new
  task. Failed document saves can close only after explicitly confirming a local
  draft backup; clean or still-loading readers can close immediately.

- CSS reset layers now preserve existing utility-based layouts, preventing
  overlapping toolbar text and missing Markdown list/border styles. Issue
  property pickers have explicit names; preference toggles update immediately
  while saving and roll back on failure.

- The root and successful password sign-in now honor the stored home preference;
  a temporary workspace failure offers Retry instead of sending users to sign-in.
  Root navigation tests run in the same Node 20-compatible unit suite as other
  regression checks.

- Document and issue previews now render CommonMark/GFM code blocks, tables and
  ordered/task lists without raw HTML. Description editing has a named field,
  guarded saves and platform-aware shortcuts; mobile browser zoom is enabled.

- Inbox notification preferences now save to the workspace preference API, show
  failures and survive reload. Integration configuration opens its settings;
  unsupported snoozing is clearly disabled.

- Issue properties are now available on narrow screens, file attachment and
  reaction controls perform real actions, and project badges open the selected
  project. Issue assignees use current presence instead of a fixed offline state.
- API timestamps now carry their UTC offset, and document/activity/member
  displays interpret legacy UTC timestamps consistently instead of showing
  newly created records as hours old.
- Member profiles now load real workspace members and count created issues by
  their persisted author. Issue search keeps the active view and filters;
  failed issue loads expose Retry instead of showing a misleading empty list.
- SLAs, releases, customer requests, Asks and emoji settings now open their
  persisted management interfaces instead of inert placeholder pages.
- Issue comments now prevent duplicate submissions, retain drafts after network
  errors and show pending/error states. Activity subscriptions use persisted
  issue preferences, and failed activity loads offer an explicit retry.
- Markdown document edits now flush before Done or Close, serialize pending
  saves and retain account-specific local drafts when saving fails or navigation
  interrupts editing.
- Workspace document listings now exclude documents belonging to teams the
  requester cannot access, including when no team filter is supplied.
- Shared team access checks also require active workspace membership, preventing
  writes through lingering team memberships after workspace access is removed.
- Team membership updates and removals now use the request's database session
  instead of failing before the membership change can be saved.

## [0.12.0] — 2026-09-10 10:26 +07

### Added

- Daily digest and dispatcher Discord messages now link issue identifiers and
  project names straight to the app, falling back to plain text when no
  public URL is configured.

## [0.11.0] — 2026-09-10 09:28 +07

### Added

- Timeline peek panels refresh the timeline behind them: project edits move
  the project bar via a project-list refresh, issue edits redraw the issue
  bar by refetching its project.
- Issue peeks now show and edit schedule (start/end dates) and effort
  (estimated/actual mandays) alongside the existing fields.

## [0.10.1] — 2026-09-10 09:10 +07

### Fixed

- Peek panels no longer break the production build: removed an unused import
  and stabilized the members memo.

## [0.10.0] — 2026-09-10 00:55 +07

### Added

- Timeline peek panels now edit in place: issue peeks change status,
  priority, due date, assignee and labels, while project peeks change status,
  priority, lead, members, dates and labels without leaving the timeline.

## [0.9.2] — 2026-09-10 00:35 +07

### Fixed

- Bind DATE columns with `date` objects instead of ISO strings, fixing the
  dispatcher overdue query rejected by asyncpg.

## [0.9.1] — 2026-09-10 00:26 +07

### Fixed

- Dispatcher and digest cutoffs now use naive UTC datetimes matching the
  `timestamp without time zone` columns, fixing the failed manual and
  scheduled runs rejected by asyncpg.

## [0.9.0] — 2026-09-10 00:12 +07

### Added

- Auto dispatcher: each team can opt in to autonomous daily runs that assign
  unassigned open issues within a configurable budget and send one in-app
  nudge per overdue issue, starting in dry-run mode and reporting every run
  to Discord with a full audit trail.

## [0.8.0] — 2026-09-09 23:56 +07

### Added

- Agent answers workload questions with a deterministic per-team overview
  (most loaded member, average score, unassigned issues) and drafts
  assignment proposals with one-line explanations; each row is applied or
  skipped individually and nothing changes until approved.

## [0.7.1] — 2026-09-09 23:33 +07

### Added

- Discord settings gained a "Run digest now" button that builds and posts
  today's progress digest on demand instead of waiting for the 08:00 run.

## [0.7.0] — 2026-09-09 23:19 +07

### Added

- Team workload insights: each team members page now shows a deterministic
  load score per member (open effort, priority pressure, overdue items against
  demonstrated velocity) with rule-based assignment suggestions for unassigned
  issues that can be applied in one click.
- Daily Discord digest: workspaces can opt in to a per-project progress report
  posted every day at 08:00 (GMT+7), covering on-track, needs-attention and
  overdue work plus recommended actions.

## [0.6.0] — 2026-09-09 19:52 +07

### Added

- The workspace dashboard now shows an effort trend chart comparing estimated
  and actual mandays over time, bucketed by day, week, or month depending on
  the selected range and following the project filter.

## [0.5.0] — 2026-09-09 19:28 +07

### Added

- The issues list now supports quick editing directly on each row for start,
  end, due dates and estimated/actual effort, alongside the existing assignee
  picker, without opening the issue detail panel.

## [0.4.0] — 2026-09-01 10:59 +07

### Changed

- The Admin Panel now uses the same responsive sidebar, compact header,
  dashboard cards, tables, spacing, theme controls, and navigation behavior as
  the rest of the Flowie workspace instead of a separate control-center UI.
- The login screen now offers Microsoft sign-in when Entra is configured,
  environment administrators can open the Admin Panel from the workspace
  switcher, and Microsoft-managed profiles clearly disable name and avatar
  editing while keeping personal title and username fields available.
- Reviews webhook processing now renews expiring GitHub installation and Azure
  workload tokens during long synchronizations, uses reclaimable processing
  leases, and clears raw provider payloads after processing or terminal
  failure. A production runbook documents least-privilege provider setup,
  identity and team boundaries, recovery, and the CT107 deployment checklist.
- Page-level loading states now use the animated Flowie mark and an accessible
  indeterminate progress bar instead of a text label paired with a generic
  spinner. The shared treatment covers workspace navigation, issue, project,
  initiative, cycle, team, view, and dashboard loading screens.

### Added

- A Microsoft Entra login runbook now documents the single-tenant app
  registration, least-privilege Graph permission, CT107 environment values,
  identity/profile invariants, secret rotation, and production verification.
- Users can now sign in with a single-tenant Microsoft Entra ID application.
  Flowie uses the authorization-code flow with PKCE, identifies accounts by
  immutable tenant and object IDs, synchronizes display names and profile
  photos from Microsoft Graph, and treats those profile fields as
  organization-managed. Platform administrator access is now sourced from
  the case-insensitive `ADMIN_EMAIL` production setting.
- The Reviews sidebar is now active and presents GitHub and Azure DevOps work
  together on one screen with provider filters, assigned/created views,
  revision unread markers, reviewer decisions, external-provider handoff, and
  same-team Issue linking. Workspace Code & reviews settings now manages both
  provider connections, repository-to-team access mapping, synchronization,
  and provider identity mapping without exposing saved credentials.
- Reviews now exposes one provider-neutral API for assigned, created, and
  team-visible reviews from both GitHub and Azure DevOps. It includes revision
  unread state, reviewer decisions, Flowie-to-provider identity mapping,
  same-team Issue links, and in-app notifications for new assignments and
  revisions. Review access is constrained to active workspace administrators
  or members of the repository's explicitly mapped Flowie team.
- Workspace administrators can now configure GitHub App installations and
  Azure DevOps Microsoft Entra identities side by side, discover repositories,
  map each enabled repository to a Flowie team, and run read-only review sync.
  Provider credentials are encrypted, webhook deliveries are authenticated and
  deduplicated, and failed deliveries retry from a durable PostgreSQL queue.
  Production requires `SCM_SECRETS_ENCRYPTION_KEY`; GitHub additionally
  requires its App ID, private key, and webhook secret.
- Reviews now has a provider-neutral persistence and API contract foundation
  for connecting GitHub and Azure DevOps organizations to the same workspace.
  The schema keeps repository, external review, revision, reviewer, Issue-link,
  user-view, and webhook-delivery identities isolated by connection. This is
  an expand-only foundation: Reviews remains unavailable until read-only
  provider synchronization and access checks are enabled in a later change.
- Project Issues now includes AI scheduling. It sends open issue titles,
  descriptions, estimates, parent-child structure, and the project schedule to
  the enabled workspace provider, then presents validated start, target, and
  due dates for explicit review before any issue is changed.
- Members now display each user's current online state, a relative last-seen
  time, and the current display names of their teams. Presence is refreshed by
  an authenticated browser heartbeat; deployment requires the committed Prisma
  migration `20260828020000_user_presence` to complete before the API starts.
- Agent delivery insight tools now identify delayed and at-risk projects and
  initiatives from target dates and health, and list open issues inactive for
  at least 14 days. The tools are installed for existing and new workspaces,
  while workspace administrators can still remove them in Agent settings.

### Fixed

- Project Issue lists now respect the shared Show sub-issues display option,
  so a project's child issues are no longer silently omitted from that tab.
- Issue lists now retain aligned title and metadata columns when a project side
  panel narrows the viewport; wide column selections scroll horizontally rather
  than collapsing the title cell into adjacent headers.
- Agent now asks focused follow-up questions for bare project or issue creation
  requests and safely recovers when a provider wraps a valid plan in Markdown
  or otherwise returns an invalid plan format, instead of showing a raw error.

## [0.3.3] — 2026-08-28 00:18 +07

### Added

- The workspace Dashboard provides an interactive overview of accessible work
  across all projects or a selected project. It supports custom date ranges
  and one-week, month, quarter, and year presets; daily created/done trends,
  status, project throughput, workload in mandays, and focused issue drill-ins
  respond to its filters.
- Issues now record estimated and actual effort in fractional mandays. Both
  values are editable from the issue properties panel, shown as dedicated
  columns beside the planned issue window in lists, and preserved when the database
  migration promotes existing whole-day estimates.
- Issues now support independent Start date and Target end date schedule
  boundaries in addition to their existing Due date. The issue detail sidebar
  provides a two-date editor for the work window and a separate clickable due
  date; deployment requires the committed Prisma migration
  `20260827230000_issue_schedule_dates` to finish before the API starts.
- The web application now includes the Astryx Design core, neutral theme,
  StyleX, and CLI foundations. Its generated agent conventions are committed
  with the application to guide future Astryx-based UI work.
- `Write with Agent` on the project Activity composer drafts an update or a
  comment from the project's own record — status, health, lead, target date,
  issue progress, open issues, milestones, and the last few updates. Anything
  already typed is used as the angle to write from. The draft is placed in the
  composer for the author to edit; nothing is posted automatically. Requires an
  enabled OpenAI or Google provider in Agent personalization.
- Descriptions and issue comments accept an image pasted from the clipboard.
  The screenshot is uploaded as an issue attachment and embedded where the
  caret was; embedded images are fetched with the session so private
  attachments stay private. The `Show sub-issues` display option now takes
  effect on the issue lists instead of being inert.
- Issue details now expose an editable due date and a Cycle selector. Cycles
  are intentional team-scoped planning containers; adding an issue to one is
  always a user action and is never assigned automatically.
- Users can create, edit, and remove personal Agent skills with their own
  default instructions. Skills follow the user between workspaces; shared
  workspace tools remain separately managed by workspace owners and admins.
- Agent personalization now exposes workspace-scoped analytical tools and
  personal skills. Workspace owners and administrators can install or remove
  supported tools; each user can install the Issue defaults skill to apply a
  preferred priority and due-date offset to their own proposed issues.
- Agent can answer counts of accessible issues, issue status and assignee
  breakdowns, plus project and cycle progress when the corresponding workspace
  tool is installed.
- Agent now streams concrete workflow progress in chat, including source-file
  reading, workspace and insight queries, provider calls, validation, and
  conversation saving. Completed steps stack under the active `thinking-orbs`
  indicator; no plan is created while it is running.
- Agent can answer the first read-only workspace insight: the current count of
  overdue issues, scoped to teams the requester can access. Insight queries do
  not create a proposal or require approval, and their capability registry is
  designed for additional reports.
- Local account registration requires a time-limited Discord OTP before a user
  and workspace are created. The private registration channel is provisioned by
  the configured Flowie bot and OTP material is stored only as a hash.
- The Agent workspace is available again as a UI preview so its conversation,
  skills, example prompts, and chat-history presentation can be reviewed before
  agent workflows are planned.
- Workspace owners and administrators can configure one active OpenAI or Google
  provider for Agent, including its endpoint and model. Agent now persists
  conversations, reads Markdown, DOCX, and XLSX source files, drafts project
  and issue plans, and creates those records only after the proposal is
  explicitly accepted.

### Changed

- Project and initiative timelines now open at Week zoom, centered on today;
  the Year, Quarter, and Month zoom controls remain available.
- Cycle status now reconciles from its Start and End dates whenever a team
  cycle view is loaded: a started cycle is Current, a future cycle is Upcoming,
  and a passed end date is Completed. Each cycle row now exposes an editor for
  its schedule, so correcting dates immediately corrects its computed state.
- Issue lists now present Start date, Target end date, estimated effort, and
  actual effort as four separately configurable columns instead of combining
  dates and manday values into two cells.
- Agent capability and help questions now receive a normal reply in the
  requester's language instead of an empty proposal that cannot be accepted.
  Proposal cards appear only when Agent has drafted at least one project or
  issue for review.
- Initiative list rows now let workspace managers change an initiative's
  priority or owner directly, using the same persisted API update path as the
  initiative detail view. The list refreshes after a successful change and
  leaves the owner unassigned when selected explicitly.
- The application sidebar now follows the shell-side-nav layout with a wider
  header, separated navigation sections, footer boundary, and side rail while
  preserving Flowie workspace and team navigation.
- Priority icons carry their own colour — urgent red, high orange, medium
  amber, low blue — so a priority is read at a glance instead of by counting
  bars. "No priority" stays neutral and inherits the surrounding text colour.
- Project status, priority, lead and team dropdowns show the same icon or
  avatar the rest of the app uses for those values, as do the issue and
  destination-team pickers in the issue action dialog and the initiative owner
  picker in workspace settings.
- Personal Agent skills now expose a detail dialog before installation, showing
  their scope, behavior, and custom instructions when present.
- Timeline bars now show their label over status color; project bars also fill
  by their calculated completion percentage.
- Project timelines reserve the sub-issue expand column on every parent row,
  keeping issue identifiers and titles aligned when only some rows have child
  issues.
- Clicking an issue bar in either Project timeline now opens an in-place detail
  panel. Dated issue bars use their actual created-to-due span with a small
  readable minimum, rather than a project-sized minimum width.
- Sub-issues remain linked to their parent and are excluded from normal issue
  lists. Project timelines show only parent issues initially and reveal child
  issues from an expand control on the parent row.
- Agent planning runs as a LangGraph workflow with the active workspace
  provider. Follow-up messages revise the same proposal conversation; proposals
  requiring clarification cannot be accepted.
- A failed Agent provider request no longer becomes conversation context. A
  retry now drafts only from successful turns after the last accepted plan, so
  hidden failed prompts cannot be combined into duplicate issues.
- Production deployment now builds and runs a one-shot Prisma migration service
  before starting the FastAPI or worker containers. A migration failure blocks
  the new release instead of serving an API against an outdated schema.
- Repository operating and release rules now define CT107 as the single
  production environment, require a changelog entry in every commit, and
  require a verified deployment before a version tag is published.
- Issue lists retain their column header and show a loading indicator while the
  issue request is pending. Rows show one primary label and a compact count for
  any remaining labels.
- Failed production migrations now emit the migration container log directly in
  the deployment workflow, rather than only reporting a generic dependency
  exit status.
- The Prisma migration image installs OpenSSL explicitly so Prisma selects the
  supported engine instead of relying on an unavailable compatibility library.

### Security

- Workspace AI provider keys are encrypted before storage, excluded from all
  API responses, and require `AGENT_SECRETS_ENCRYPTION_KEY` on the API service.

### Fixed

- Docker application containers now resolve PostgreSQL, Redis, and MinIO
  through their configured `circle-*` container hostnames, preventing
  migrations and API dependencies from failing DNS lookups during startup.
- Returning to a tab left open for a long time no longer shows empty screens
  until a reload. Refresh tokens are single-use, and every request that met an
  expired access cookie spent the same one: the first succeeded and the rest
  were rejected against the session it had just revoked. A burst now shares one
  refresh attempt.
- Moving between sidebar destinations no longer rebuilds the whole interface.
  The workspace shell — sidebar, command palette, dialogs — was rendered by
  each page rather than by a route layout, so every navigation unmounted it and
  re-ran its workspace, team, and notification queries. It is now a `[orgId]`
  layout and stays mounted across navigation.
- Sub-issues are no longer missing from every issue list. The issue list query
  excluded any issue that had a parent, so a sub-issue never appeared under its
  team and opening it by identifier reported `Issue not found` — the detail
  page resolves an issue from that same list.
- The issue properties panel labels its dates and shows the created date next
  to the due date; a single unlabelled date field read as either one.
- A page that stops responding to clicks after a dialog closes recovers by
  itself. Overlapping modal layers can leave pointer events disabled on the
  document body, which previously required a reload; the next click or
  keypress now restores interaction when no modal is open.

## [0.3.2] — 2026-08-26 23:59 +07

### Added

- A project row on the Projects timeline opens to show its issues on the same
  scale: click the arrow and each issue appears as a bar from the day it was
  opened to the day it is due, indented under the project. Issues are fetched
  the first time a project is opened and kept afterwards.

### Changed

- The Project timeline is drawn with the same scale rendering as the Projects
  and Initiative timelines: month names over a row of date ticks rather than
  both crammed into one band, month grid lines behind the rows, the today pill
  pinned to the scale above a full-height marker, and the issue list overlaying
  the grid instead of sitting in a column beside it.

## [0.3.1] — 2026-08-26 23:41 +07

### Added

- The deploy reclaims disk once the release is verified: dangling images go,
  and the build cache is capped so it cannot grow without bound while keeping
  the Python wheel cache that makes a rebuild fast. Volumes are never touched.

### Fixed

- Container networks declare an MTU (default 1400) instead of assuming 1500.
  The uplink's path MTU is 1492, so full-size packets were dropped and large
  transfers stalled — package downloads crawling at a few kB/s and TLS reads
  timing out. A daemon-wide setting does not reach a Compose network, so it is
  declared in the compose file too.
- The deploy no longer contacts GitHub twice for the same commit: `git pull`
  followed a `git fetch` that had already brought the ref down, and on this
  host's slow link the second round trip is what failed the release with an SSL
  timeout. The fetch is retried, gives up on a stalled transfer in a minute
  rather than five, and the checkout is now a local fast-forward.
- "Add sub-issues" on the issue page does something: the button had no handler
  and the list beneath it was built from the interface template's mock data.
  The component that creates and lists sub-issues against the API already
  existed — it was never mounted.

### Changed

- The workspace mark in the sidebar no longer paints a fixed orange square: a
  workspace icon sits on the same neutral tile as every other icon in the app,
  and initials take a colour derived from the workspace id so two workspaces
  are told apart.

## [0.3.0] — 2026-08-26 22:00 +07

### Added

- A Timeline tab on the Project screen: every issue as a bar from the day it
  was opened to the day it is due, grouped by status, on the same month scale
  the Projects timeline uses.
- A navigation progress bar, and a moving indicator on the screens that wait
  for their own data, so a slow request no longer reads as a frozen page.

### Removed

- The NestJS compatibility service is switched off. Every API path is served by
  the Python API, so the proxy that forwarded unported paths, its client, the
  readiness probe against it and the `api-legacy` container are all gone.

### Changed

- The members directory (`GET /users`, `GET /users/:id`) is served by Python,
  which was the last path the web still reached through the proxy.
- Four more API groups are served by Python instead of being proxied to the
  Node facade: the project issue list, reading a single issue, issue emoji
  reactions, notification preferences and the whole platform admin console.
  Nine legacy endpoints remain, none of which the web calls today.
- Discord notifications are embeds instead of one grey line: who acted, the
  issue code and title, a link straight to the item, the values that moved
  (`Todo → In Progress`), and the comment or project update itself. The link
  needs `APP_URL` on the API container, now wired through docker-compose.
- Issue property edits (title, priority, project, due date, estimate,
  description) are reported as `issue.updated`; a status change carries the
  rest of the same save, so one edit is one notification.
- An issue can be filed into a project from its detail panel; the Project
  section used to appear only once the issue already had one.
- Creating an issue from a project screen files it in that project by default.
- The issue breadcrumb returns to the team's issue list rather than the team
  overview.

### Fixed

- Issue rows on the Project screens showed the same priority icon for every
  issue: the API answers with the enum casing (`NONE`, `HIGH`) while the icon
  table is keyed in lower case, so every lookup missed and fell back.
- Adding an emoji reaction never worked: the interface posts the emoji in the
  path, which the Node service did not route. The Python API implements what
  the interface calls.
- A slow PyPI read no longer fails the whole production deploy: the Python
  image keeps a wheel cache between builds and gives pip a longer timeout with
  retries, and the deploy retries the image build before giving up.
- Discord notifications stopped arriving once they became embeds: the actor's
  avatar is stored as an app-relative path, and Discord rejects an entire embed
  whose `icon_url` or `url` is not absolute — answering 4xx, which was
  swallowed. Non-absolute links are dropped, the title, author and field values
  are cut to Discord's limits, and a refused delivery is logged instead of
  vanishing. The Discord "Send test" button reports what Discord answered.
- Editing any issue property announced a status change to Discord even when
  the status had not moved: the notification batch was built regardless of the
  condition and only the Inbox rows were skipped.
- The Project detail tabs refresh when an issue is created or edited elsewhere
  — the command palette, a context menu, an inline status picker — instead of
  showing a stale list until the page is reloaded by hand.

## [0.2.1] — 2026-08-26 20:05 +07

### Changed

- The create-issue dialog names the team the issue will actually be filed
  under, and lets it be picked, instead of printing a fixed `CORE` badge left
  over from the interface template.

### Added

- The Help menu states the running release and links to it: version, release
  time and the first entries of the current section, all read from this file at
  build time.

### Fixed

- The root URL opens the signed-in user's own workspace instead of redirecting
  to a workspace and team that only exist in the interface template.
- Opening the due date or reminder picker from an issue's context menu left the
  page unresponsive — the browser's own menu on right click, no clicks landing
  anywhere. Both dialogs were rendered inside the context menu, so the two modal
  layers fought over `document.body` when the menu unmounted underneath them.
  They now use the shared issue action dialog, which lives outside the menu.

## [0.2.0] — 2026-08-26 19:41 +07

### Added

- Durable Inbox events for issue creation, assignment, status changes,
  comments, project property changes and project updates.
- Authenticated WebSocket delivery for real-time Inbox updates and sidebar
  unread counts.
- Discord webhook delivery for supported workspace events and optional
  Flowie bot channel broadcasting.
- Flowie-branded Help links to the product, project repository and changelog.
- Team settings can rename the issue prefix; existing issues of the team are
  renumbered to the new code and Inbox links follow them.
- Initiative properties are editable from the inline row, not only from the
  aside that hides on narrow windows.

### Changed

- Discord integration configuration is now served by the Python/FastAPI API.
- The issue page header carries a working actions menu (rename, due date, move,
  subscribe, copy link, delete) and a favourite toggle; deleting an issue was
  previously only reachable by right-clicking a list row.
- The issues list view has a column header, and each row lays its properties
  out in fixed columns: Created and Due date are now separate labelled columns
  instead of one unlabelled date.
- The issue assignee picker lists live workspace members and persists the
  choice; it no longer offers a mock roster.
- The issue description is the stored one and is editable in place.
- Issue labels are editable from the issue detail panel, and the context-menu
  due date opens a date picker instead of jumping seven days ahead.
- Initiative dialogs render status, priority, owner, label, project and health
  options with their icons.

### Fixed

- Opening an issue URL directly — a refresh, an Inbox entry, a Discord link —
  loads the issue instead of reporting it as not found, and shows a loading
  state while it arrives.
- The legacy API container now receives the shared `AUTH_JWT_SECRET`, so the
  paths the Python API still proxies (such as the project issue list) accept the
  session cookie instead of answering 401.
- Project detail pages name the request that failed instead of reporting a
  single generic "Could not load project details." message.

## [0.1.0] — 2026-08-25 00:00 +07

### Added

- Native Python APIs for workspaces, teams, documents, cycles, projects,
  initiatives, issues and profile management.
- Docker deployment and GitHub Actions deployment workflow for the self-hosted
  production environment.
