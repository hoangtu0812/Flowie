type Copy = readonly [en: string, vi: string];
type HelpTopic = { id: string; title: Copy; meaning: Copy; steps: Copy; path: string };

export const helpTopics: HelpTopic[] = [
   {
      id: 'workspace',
      title: ['Workspaces & default workspace', 'Workspace & workspace mặc định'],
      meaning: [
         'A workspace groups your teams, projects and members. Your default is the workspace opened when you return to Flowie.',
         'Workspace tập hợp các nhóm, dự án và thành viên. Workspace mặc định là nơi mở khi bạn quay lại Flowie.',
      ],
      steps: [
         'Open the workspace menu at the top left → Switch Workspace. In your preferred workspace, choose Set as default workspace. The star marks your saved choice across devices. Direct links still open their original destination.',
         'Mở menu workspace ở góc trái trên → Switch Workspace. Tại workspace mong muốn, chọn Đặt làm workspace mặc định. Dấu sao đánh dấu lựa chọn đã lưu trên các thiết bị. Liên kết trực tiếp vẫn mở đúng nơi được chia sẻ.',
      ],
      path: '/settings/preferences',
   },
   {
      id: 'inbox',
      title: ['Inbox & notifications', 'Hộp thư & thông báo'],
      meaning: [
         'Inbox collects updates that need your attention, including mentions and task changes.',
         'Hộp thư tập hợp cập nhật cần chú ý, gồm lượt nhắc tên và thay đổi công việc.',
      ],
      steps: [
         'Open a notification to inspect its task. Mark it read or snooze it for later. Choose email and desktop delivery in Settings → Notifications.',
         'Mở thông báo để xem công việc liên quan. Đánh dấu đã đọc hoặc tạm ẩn để xử lý sau. Chọn gửi qua email và máy tính tại Settings → Notifications.',
      ],
      path: '/inbox',
   },
   {
      id: 'issues',
      title: ['Tasks, bugs & My issues', 'Công việc, lỗi & việc của tôi'],
      meaning: [
         'Tasks describe work to do; bugs capture a defect. My issues helps you follow work assigned to you.',
         'Task mô tả việc cần làm; Bug ghi nhận lỗi. My issues giúp theo dõi việc được giao cho bạn.',
      ],
      steps: [
         'Use the create button beside the workspace name. Select a team, title, status, priority and assignee. For bugs, add severity, environment and reproduction steps. Open the saved issue to edit details, dates, effort and sub-issues.',
         'Dùng nút tạo bên cạnh tên workspace. Chọn nhóm, tiêu đề, trạng thái, mức ưu tiên và người phụ trách. Với Bug, thêm mức nghiêm trọng, môi trường và bước tái hiện. Mở công việc đã lưu để sửa chi tiết, ngày, công sức và việc con.',
      ],
      path: '/my-issues',
   },
   {
      id: 'views',
      title: ['Views, filters & bulk changes', 'Chế độ xem, bộ lọc & sửa hàng loạt'],
      meaning: [
         'Views save a useful selection of work. Filters narrow the results by properties such as status, assignee or project.',
         'Views lưu cách xem công việc thường dùng. Bộ lọc thu hẹp kết quả theo trạng thái, người phụ trách hoặc dự án.',
      ],
      steps: [
         'Choose filters in an issue list, then save a view to reuse them. Select tasks for bulk changes, review the preview and confirm. Check the operation results for tasks that could not be changed.',
         'Chọn bộ lọc trong danh sách việc, rồi lưu thành View để dùng lại. Chọn nhiều việc để sửa hàng loạt, kiểm tra bản xem trước và xác nhận. Xem kết quả để biết việc nào chưa thay đổi được.',
      ],
      path: '/views',
   },
   {
      id: 'projects',
      title: ['Projects & timeline', 'Dự án & dòng thời gian'],
      meaning: [
         'A project groups related tasks around a shared outcome. Its timeline shows planned dates.',
         'Dự án nhóm các công việc cùng mục tiêu. Dòng thời gian thể hiện lịch dự kiến.',
      ],
      steps: [
         'Open Projects → select a project. Use Overview for scope and documents, Issues for tasks, and Activity for updates. In the project timeline, use Y / Q / M / W to switch year, quarter, month or week while outside text fields.',
         'Mở Projects → chọn dự án. Dùng Overview để xem phạm vi và tài liệu, Issues để quản lý việc, Activity để xem cập nhật. Trong dòng thời gian dự án, nhấn Y / Q / M / W để đổi năm, quý, tháng hoặc tuần khi không nhập văn bản.',
      ],
      path: '/projects',
   },
   {
      id: 'initiatives',
      title: ['Initiatives', 'Sáng kiến'],
      meaning: [
         'Initiatives connect multiple projects to a larger goal.',
         'Sáng kiến kết nối nhiều dự án với một mục tiêu lớn hơn.',
      ],
      steps: [
         'Open an initiative, link its projects and review overall progress. Use Activity to post updates and discuss changes with the team.',
         'Mở một sáng kiến, liên kết các dự án và xem tiến độ tổng thể. Dùng Activity để đăng cập nhật và trao đổi với nhóm.',
      ],
      path: '/initiatives',
   },
   {
      id: 'teams',
      title: ['Teams, members & cycles', 'Nhóm, thành viên & chu kỳ'],
      meaning: [
         'Teams organize ownership and access. Cycles are timeboxed periods for planning a team’s tasks.',
         'Nhóm tổ chức trách nhiệm và quyền truy cập. Chu kỳ là khoảng thời gian cố định để lên kế hoạch công việc của nhóm.',
      ],
      steps: [
         'Open Teams and select a team. Its sidebar provides Issues, Cycles, Projects and Views. Add tasks to the current or upcoming cycle; manage membership through Members. Available actions depend on your role.',
         'Mở Teams và chọn nhóm. Thanh bên có Issues, Cycles, Projects và Views. Thêm việc vào chu kỳ hiện tại hoặc sắp tới; quản lý thành viên tại Members. Thao tác khả dụng phụ thuộc vai trò của bạn.',
      ],
      path: '/teams',
   },
   {
      id: 'dashboard',
      title: ['Dashboard & advanced reports', 'Bảng điều khiển & báo cáo nâng cao'],
      meaning: [
         'The dashboard gives an overview. Advanced reports explain delivery time, status age, daily activity and planned workload.',
         'Bảng điều khiển cho cái nhìn tổng quan. Báo cáo nâng cao phân tích thời gian hoàn thành, tuổi trạng thái, hoạt động từng ngày và tải công việc dự kiến.',
      ],
      steps: [
         'Choose dates and a team, expand More filters for project, status, timezone and week start, then Apply report filters. Click a chart day or Show daily values to inspect events. Current totals describe matching tasks now; period metrics describe events within the selected dates.',
         'Chọn ngày và nhóm, mở Bộ lọc bổ sung để chọn dự án, trạng thái, múi giờ và ngày đầu tuần, rồi Áp dụng bộ lọc. Bấm ngày trên biểu đồ hoặc Hiện giá trị từng ngày để xem sự kiện. Tổng hiện tại mô tả việc đang có; chỉ số theo kỳ mô tả sự kiện trong khoảng ngày đã chọn.',
      ],
      path: '/reports',
   },
   {
      id: 'metrics',
      title: ['Report metric glossary', 'Ý nghĩa chỉ số báo cáo'],
      meaning: [
         'WIP means work in progress. Lead time measures creation or reopening to completion; cycle time starts when work enters Started.',
         'WIP là công việc đang thực hiện. Lead time tính từ lúc tạo hoặc mở lại đến hoàn tất; Cycle time bắt đầu khi việc chuyển sang Started.',
      ],
      steps: [
         'Mean is the average; median (P50) is the middle duration; P85 is the duration within which 85% of observed samples finish. Unknown means history is missing, not zero. Effort is recorded mandays, not time logs. Weekly workload counts each task’s estimate in its planned start week, not remaining capacity.',
         'Mean là trung bình; Median (P50) là trung vị; P85 là thời gian mà 85% mẫu ghi nhận đã hoàn tất. Unknown là thiếu lịch sử, không phải bằng 0. Effort là ngày công đã nhập, không phải nhật ký giờ làm. Tải theo tuần tính công ước lượng vào tuần bắt đầu dự kiến, không phải năng lực còn trống.',
      ],
      path: '/reports',
   },
   {
      id: 'documents',
      title: ['Documents & revision history', 'Tài liệu & lịch sử phiên bản'],
      meaning: [
         'Documents store shared knowledge for a team or project. Revision history records saved versions.',
         'Tài liệu lưu kiến thức chung của nhóm hoặc dự án. Lịch sử phiên bản ghi lại các bản đã lưu.',
      ],
      steps: [
         'Open a document from a team or project. Edit its content and wait for Saved; Done and Close wait for pending saves. If a conflict appears, compare versions and reconcile your draft. Use revision history to inspect or restore a reviewed version.',
         'Mở tài liệu từ nhóm hoặc dự án. Chỉnh nội dung và chờ Đã lưu; Done và Close chờ lưu xong. Nếu có xung đột, so sánh các bản và hợp nhất bản nháp. Dùng lịch sử để xem hoặc khôi phục phiên bản đã kiểm tra.',
      ],
      path: '/teams',
   },
   {
      id: 'project-docs',
      title: [
         'Project Docs: FDS, TDS & document tree',
         'Tài liệu dự án (Docs): FDS, TDS & cây tài liệu',
      ],
      meaning: [
         'The Docs tab keeps a project’s documents in one tree: project → module → feature → bugs & changes. Each document has a type (FDS functional spec, TDS technical design, ADR decision, RCA root cause, GUIDE, OTHER) and a review status (Draft, In review, Approved).',
         'Tab Docs gom tài liệu của dự án vào một cây: dự án → module → tính năng → bugs & thay đổi. Mỗi tài liệu có loại (FDS đặc tả chức năng, TDS thiết kế kỹ thuật, ADR quyết định, RCA nguyên nhân lỗi, GUIDE hướng dẫn, OTHER) và trạng thái duyệt (Nháp, Đang duyệt, Đã duyệt).',
      ],
      steps: [
         'Open Projects → a project → Docs, or Docs in the sidebar and pick a project at the top. The first time, choose Standard structure (or Create standard structure on an empty tab): it adds the project folder with 00 · Tổng quan and 99 · Vận hành, and is safe to run again. Select a folder in the tree, then New folder: name it and pick Module, Feature or Bugs & changes (for example Module "Documents" → Feature "Tree"). Select the feature and choose New document: FDS and TDS start from a template with sections and a Mermaid diagram; other types start blank. Click a document to preview it on the right, then Edit to change it. To store a PDF, select a folder and choose Upload PDF (up to 10 MB); click the file to read it on the right, open it in a new tab or download it. In the editor, write Markdown with live preview, set the type and status at the top, and use the table of contents for long documents; ```mermaid code blocks render as diagrams. Use the search box (title and content, accents optional) and the type filter to find documents. Documents linked to the project but filed elsewhere appear under Linked to this project, and a task shows its linked documents under Related documents.',
         'Mở Projects → chọn dự án → Docs, hoặc bấm Tài liệu trên sidebar rồi chọn dự án ở phía trên. Lần đầu, bấm Khung chuẩn (hoặc Tạo khung thư mục chuẩn khi tab còn trống): hệ thống tạo thư mục dự án kèm 00 · Tổng quan và 99 · Vận hành; bấm lại không tạo trùng. Chọn một thư mục trong cây, rồi bấm Thư mục mới: đặt tên và chọn loại Module, Tính năng hoặc Bugs & thay đổi (ví dụ Module "Tài liệu" → Tính năng "Cây thư mục"). Chọn tính năng và bấm Tài liệu mới: FDS và TDS có sẵn mẫu với các mục và sơ đồ Mermaid; loại khác bắt đầu trống. Bấm vào tài liệu để xem trước ở bên phải, rồi bấm Sửa để chỉnh. Để lưu file PDF, chọn thư mục và bấm Tải PDF lên (tối đa 10 MB); bấm vào file để đọc ở bên phải, mở tab mới hoặc tải xuống. Trong editor, viết Markdown và xem trước song song, đổi loại và trạng thái ở phía trên, dùng Mục lục cho tài liệu dài; code block ```mermaid hiển thị thành sơ đồ. Dùng ô tìm kiếm (theo tiêu đề và nội dung, không cần gõ dấu) và bộ lọc loại để tìm tài liệu. Tài liệu liên kết với dự án nhưng nằm ở nơi khác hiện trong mục Liên kết với dự án; trang công việc liệt kê tài liệu liên kết trong mục Tài liệu liên quan.',
      ],
      path: '/projects',
   },
   {
      id: 'sharepoint',
      title: ['Publish documents to SharePoint', 'Phát hành tài liệu lên SharePoint'],
      meaning: [
         'Flowie stays the place where documents are written. When a document in a project’s Docs tree is Approved, Flowie uploads it as a .md file to the project’s SharePoint folder, keeping the module/feature folders, and uploads it again for every new version. Nothing is read back from SharePoint.',
         'Flowie vẫn là nơi soạn tài liệu. Khi tài liệu trong cây Docs của dự án được Đã duyệt, Flowie tải nó lên thư mục SharePoint của dự án dưới dạng file .md, giữ cấu trúc thư mục module/tính năng, và tải lại mỗi khi có version mới. Không đọc ngược dữ liệu từ SharePoint.',
      ],
      steps: [
         '1) IT: in Microsoft Entra ID, register an app, add the Microsoft Graph application permission Sites.Selected, grant admin consent, create a client secret, and grant the app write access on the SharePoint site (see docs/sharepoint-publishing.md). 2) A workspace admin opens Settings → Integrations → SharePoint and enters the tenant ID, client ID and secret. 3) In each project, open Docs → SharePoint, paste the URL of the target folder (open it in SharePoint and copy the address bar), choose Test, then Save. 4) Set a document’s status to Approved; within about a minute its preview shows Published vN with a link, or the error to fix. Errors are retried automatically.',
         '1) IT: trên Microsoft Entra ID, đăng ký một app, thêm quyền application Microsoft Graph Sites.Selected, cấp admin consent, tạo client secret, và cấp cho app quyền ghi trên site SharePoint (xem docs/sharepoint-publishing.md). 2) Quản trị viên workspace mở Settings → Integrations → SharePoint, nhập tenant ID, client ID và secret. 3) Ở mỗi dự án, mở Docs → SharePoint, dán URL thư mục đích (mở thư mục trên SharePoint và sao chép thanh địa chỉ), bấm Kiểm tra rồi Lưu. 4) Đổi trạng thái tài liệu sang Đã duyệt; khoảng một phút sau, khung xem trước hiện Đã phát hành vN kèm link, hoặc lỗi cần xử lý. Lỗi được tự động thử lại.',
      ],
      path: '/settings/integrations',
   },
   {
      id: 'comments',
      title: ['Comments & collaboration', 'Bình luận & cộng tác'],
      meaning: [
         'Comments keep decisions and discussion beside the work they concern.',
         'Bình luận giữ quyết định và trao đổi ngay cạnh công việc liên quan.',
      ],
      steps: [
         'Open a task, reply to a top-level comment and select members to notify. Edit your own comments or inspect their history. Add attachments to saved comments. Change the comment submission key in Settings → Preferences.',
         'Mở công việc, trả lời bình luận gốc và chọn người cần thông báo. Sửa bình luận của bạn hoặc xem lịch sử. Đính kèm tệp vào bình luận đã lưu. Đổi phím gửi tại Settings → Preferences.',
      ],
      path: '/my-issues',
   },
   {
      id: 'reviews',
      title: ['Reviews', 'Đánh giá'],
      meaning: [
         'Reviews collect proposed changes for inspection and discussion.',
         'Reviews tập hợp các thay đổi đề xuất để kiểm tra và trao đổi.',
      ],
      steps: [
         'Open Reviews, select a review and inspect its changes and discussion before using the available review actions.',
         'Mở Reviews, chọn bản đánh giá và kiểm tra thay đổi cùng trao đổi trước khi dùng các thao tác đánh giá khả dụng.',
      ],
      path: '/reviews',
   },
   {
      id: 'search',
      title: ['Search & command palette', 'Tìm kiếm & bảng lệnh'],
      meaning: [
         'Search finds workspace content. The command palette provides navigation and actions for the current task.',
         'Tìm kiếm giúp tìm nội dung workspace. Bảng lệnh cung cấp điều hướng và thao tác cho công việc đang mở.',
      ],
      steps: [
         'Open Search to find accessible content. Press Ctrl+K (⌘K on Mac), type an action, use arrow keys and Enter to select. When a task is open, its available actions appear in context.',
         'Mở Search để tìm nội dung có quyền truy cập. Nhấn Ctrl+K (⌘K trên Mac), nhập thao tác, dùng phím mũi tên và Enter để chọn. Khi mở công việc, bảng lệnh có các thao tác tương ứng.',
      ],
      path: '/search',
   },
   {
      id: 'agent',
      title: ['Agent & integrations', 'Trợ lý AI & tích hợp'],
      meaning: [
         'Agent helps with workspace work. Integrations connect external clients within granted scope.',
         'Agent hỗ trợ công việc trong workspace. Tích hợp kết nối ứng dụng bên ngoài trong phạm vi được cấp quyền.',
      ],
      steps: [
         'Open Agent for its available workflows. To connect an AI client, create a project grant in Settings → Integrations, copy the configuration and set its token locally. Verify the permitted project and tools before using the connection.',
         'Mở Agent để xem quy trình khả dụng. Để kết nối ứng dụng AI, tạo quyền dự án tại Settings → Integrations, sao chép cấu hình và đặt token cục bộ. Kiểm tra dự án và công cụ được phép trước khi sử dụng.',
      ],
      path: '/agent',
   },
   {
      id: 'recurring',
      title: ['Recurring tasks & SLA', 'Việc định kỳ & SLA'],
      meaning: [
         'Recurring schedules create tasks automatically. SLA policies define service deadlines using a working calendar.',
         'Lịch định kỳ tự động tạo công việc. SLA quy định hạn xử lý theo lịch làm việc.',
      ],
      steps: [
         'In Settings → Recurring, configure a template, timezone and recurrence, then review upcoming runs. In Settings → SLAs, configure working hours, holidays and thresholds. Inspect each task’s clock and history to understand pauses and deadlines.',
         'Tại Settings → Recurring, chọn mẫu, múi giờ và lịch lặp, rồi kiểm tra các lần chạy sắp tới. Tại Settings → SLAs, thiết lập giờ làm việc, ngày nghỉ và ngưỡng. Xem đồng hồ và lịch sử của từng việc để hiểu thời gian tạm dừng và hạn xử lý.',
      ],
      path: '/settings/recurring',
   },
   {
      id: 'exchange',
      title: ['Import, export & archive', 'Nhập, xuất & lưu trữ'],
      meaning: [
         'Data exchange moves work in or out. Archive hides inactive items while keeping recovery available.',
         'Nhập/xuất giúp chuyển dữ liệu vào hoặc ra. Lưu trữ ẩn mục không còn hoạt động và vẫn cho phép khôi phục.',
      ],
      steps: [
         'Use Settings → Data exchange to map CSV columns, preview validation and confirm an import. Export a filtered task list or selected documents. Use Settings → Archive to preview dependencies and restore archived work.',
         'Dùng Settings → Data exchange để ánh xạ cột CSV, xem kiểm tra dữ liệu và xác nhận nhập. Xuất danh sách việc đã lọc hoặc tài liệu đã chọn. Dùng Settings → Archive để xem phụ thuộc và khôi phục mục đã lưu trữ.',
      ],
      path: '/settings/data-exchange',
   },
   {
      id: 'security',
      title: ['Account, preferences & security', 'Tài khoản, tùy chọn & bảo mật'],
      meaning: [
         'Preferences control your language, calendar and display. Security manages sign-in protection and devices.',
         'Tùy chọn điều khiển ngôn ngữ, lịch và hiển thị. Bảo mật quản lý bảo vệ đăng nhập và thiết bị.',
      ],
      steps: [
         'Open Settings → Preferences to choose language, timezone, week start, home view and comment keys. In Security, enroll an authenticator, store recovery codes safely and review signed-in devices. Use Forgot password on the login screen if needed.',
         'Mở Settings → Preferences để chọn ngôn ngữ, múi giờ, đầu tuần, trang đầu và phím gửi bình luận. Trong Security, đăng ký ứng dụng xác thực, cất mã khôi phục và xem thiết bị đăng nhập. Dùng Quên mật khẩu trên trang đăng nhập khi cần.',
      ],
      path: '/settings/preferences',
   },
   {
      id: 'admin',
      title: ['Workspace administration', 'Quản trị workspace'],
      meaning: [
         'Workspace settings configure shared workflows; some actions require an owner or administrator.',
         'Thiết lập workspace cấu hình quy trình dùng chung; một số thao tác cần quyền chủ sở hữu hoặc quản trị viên.',
      ],
      steps: [
         'Use Settings to manage statuses, labels, templates, releases and members. Administrators can inspect Audit for recorded changes and Operations for job failures. Team access controls which work members can see.',
         'Dùng Settings để quản lý trạng thái, nhãn, mẫu, bản phát hành và thành viên. Quản trị viên xem Audit để kiểm tra thay đổi đã ghi nhận và Operations để xem tác vụ lỗi. Quyền nhóm quyết định công việc thành viên được xem.',
      ],
      path: '/settings',
   },
];

export const helpShortcuts: { keys: string; title: Copy; context: Copy }[] = [
   {
      keys: 'mod+k',
      title: ['Command palette', 'Mở bảng lệnh'],
      context: [
         'Navigate or find actions for the current task.',
         'Điều hướng hoặc tìm thao tác cho công việc đang mở.',
      ],
   },
   {
      keys: 'mod+b',
      title: ['Toggle sidebar', 'Ẩn/hiện thanh bên'],
      context: ['Show or hide workspace navigation.', 'Hiện hoặc ẩn điều hướng workspace.'],
   },
   {
      keys: 'mod+/',
      title: ['Open Help', 'Mở trợ giúp'],
      context: [
         'Outside text fields and editors.',
         'Khi không nhập trong ô văn bản hoặc trình soạn thảo.',
      ],
   },
   {
      keys: 'mod+enter',
      title: ['Save description / send comment', 'Lưu mô tả / gửi bình luận'],
      context: [
         'In the issue description editor, or comments with the default submission setting.',
         'Trong trình sửa mô tả công việc, hoặc bình luận dùng thiết lập gửi mặc định.',
      ],
   },
   {
      keys: 'enter',
      title: ['Send comment (optional)', 'Gửi bình luận (tùy chọn)'],
      context: [
         'Only when Enter submission is selected in Preferences.',
         'Chỉ khi chọn gửi bằng Enter trong Tùy chọn.',
      ],
   },
   {
      keys: 'shift+enter',
      title: ['New comment line', 'Xuống dòng trong bình luận'],
      context: ['With Enter submission enabled.', 'Khi đang bật gửi bằng Enter.'],
   },
   {
      keys: 'escape',
      title: ['Close / cancel', 'Đóng / hủy'],
      context: [
         'Close a dialog or preview; cancel issue description editing.',
         'Đóng hộp thoại hoặc bản xem trước; hủy sửa mô tả công việc.',
      ],
   },
   ...(
      [
         ['Y', 'Year view', 'Xem theo năm'],
         ['Q', 'Quarter view', 'Xem theo quý'],
         ['M', 'Month view', 'Xem theo tháng'],
         ['W', 'Week view', 'Xem theo tuần'],
      ] as const
   ).map(([key, en, vi]) => ({
      keys: key,
      title: [en, vi] as Copy,
      context: [
         'Project timeline only, outside text fields.',
         'Chỉ trong dòng thời gian dự án, khi không nhập văn bản.',
      ] as Copy,
   })),
];
