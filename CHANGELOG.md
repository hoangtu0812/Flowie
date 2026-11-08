# Changelog

All notable changes to Flowie are documented here.

Each released section is headed by its version and the moment it went to
production: `## [x.y.z] — YYYY-MM-DD HH:MM +07`. The app reads this file at
build time, so the topmost released section is exactly what users see under
"What's new" and in the dialog that announces a new release — a release that is
not written down here is a release nobody can identify. Work that has not
shipped yet stays under Unreleased, and is shown to nobody until a release
commit promotes it.

Each entry is written in English with an indented `VI:` Vietnamese line, and
ends with its pull request number and, once released, its merge commit, for
example `(#19, 431edd6)`. Entries written before this rule stay as they are.
Write both halves for people, not for the repository: the app shows each entry
in the language the reader's account is set to, and hides the trailing task,
pull request and commit references, which are for us.

## Unreleased

### Added

- The desktop companion now says what the agent is actually doing, both on the tray and on the task in Flowie: “Editing apps/web/page.tsx” rather than “Implementing the plan”, which is true of every run and so says nothing about this one. Without it a task sat unchanged for twenty minutes and nobody could tell a working agent from a stuck one. File names are shown relative to the copy the agent is working in, so the folder layout of someone’s own machine never reaches the server. When the agent says nothing, the step keeps describing itself rather than going blank. (DTD-501)
  VI: Companion desktop nay nói rõ agent đang thực sự làm gì, cả trên tray lẫn trên task trong Flowie: “Editing apps/web/page.tsx” thay vì “Implementing the plan”, câu đúng với mọi run nên chẳng nói lên điều gì về run này. Thiếu nó thì một task nằm im suốt hai mươi phút và không ai phân biệt được agent đang chạy với agent đang kẹt. Tên file hiển thị tương đối so với bản sao mà agent đang làm việc, nên cách sắp xếp thư mục trên máy của ai đó không bao giờ tới server. Khi agent không nói gì, bước đang chạy vẫn tự mô tả chứ không để trống. (DTD-501)

### Fixed

- The download offered for the desktop companion is the one that was just built, and only that one. A build kept the installer from an earlier version beside the new one, so the download held two and nothing said which was which. Anyone who picked the wrong one installed a version older than the release they got it from. (DTD-488, #215)
  VI: Bản tải về cho companion desktop nay là đúng bản vừa được build, và chỉ có bản đó. Trước đây mỗi lần build giữ lại cả bộ cài của phiên bản trước bên cạnh bản mới, nên bản tải về có hai file mà không gì chỉ ra file nào là file nào. Ai chọn nhầm sẽ cài một phiên bản cũ hơn chính bản phát hành họ tải nó về. (DTD-488)

### Removed

- The old NestJS backend has been deleted. It was replaced by the Python API some time ago and has not run anywhere since: no container was built from it, no check ever compiled or tested it, and the app has not spoken to it. It nonetheless stayed in the commands everyone uses, so `pnpm dev` started a second API that was not the real one and `pnpm build` spent its time compiling fourteen thousand lines nobody runs — a newcomer could reasonably have believed that was the backend. Nothing a user can see changes, and no database or deployment change comes with it. The migration notes that told people not to delete it now record why that rule no longer applies. (DTD-518, #211)
  VI: Backend NestJS cũ đã bị xóa. Nó được thay bằng API Python từ lâu và từ đó không chạy ở đâu cả: không container nào được dựng từ nó, không bước kiểm tra nào từng biên dịch hay chạy test cho nó, và ứng dụng cũng không nói chuyện với nó. Dù vậy nó vẫn nằm trong các lệnh mọi người dùng hằng ngày, nên `pnpm dev` khởi động thêm một API không phải API thật, còn `pnpm build` thì mất thời gian biên dịch mười bốn nghìn dòng không ai chạy — một người mới hoàn toàn có thể tin đó mới là backend. Không có gì người dùng thấy được thay đổi, và không kèm thay đổi database hay triển khai nào. Ghi chú migration vốn dặn không được xóa nó nay ghi rõ vì sao quy tắc đó không còn áp dụng. (DTD-518)

## [0.16.0] — 2026-11-08 21:05 +07

### Added

- Flowie Desktop now carries the Flowie mark instead of a blank placeholder, in the tray, the window, the installer and the taskbar. It also installs the browser runtime it needs when a machine does not already have it, so a fresh Windows 11 machine no longer ends up with an application that starts and shows nothing. And it can be told to start when you sign in, which is off until you turn it on: a program that picks up work at sign-in without being asked is deciding something that belongs to whoever owns the machine. The setting is read back from the system rather than from the file, so a registration that did not take is visible instead of silently ignored. (DTD-488, #212, 91f7640)
  VI: Flowie Desktop nay mang biểu tượng Flowie thay cho ô trống, ở tray, cửa sổ, bộ cài và thanh tác vụ. Nó cũng tự cài runtime trình duyệt mà nó cần khi máy chưa có, nên một máy Windows 11 mới tinh không còn rơi vào cảnh ứng dụng khởi động lên rồi không hiện gì. Và nó có thể được đặt để khởi động cùng lúc bạn đăng nhập, mặc định tắt cho tới khi bạn bật: một chương trình tự nhận việc lúc đăng nhập mà không ai yêu cầu là đang tự quyết một việc thuộc về chủ máy. Thiết lập này được đọc lại từ hệ thống chứ không từ file, nên một lần đăng ký không ăn sẽ hiện ra chứ không bị bỏ qua âm thầm. (DTD-488)


- Flowie Desktop now has a Windows installer. Every build produces one, it installs for the person who runs it so no administrator is needed, and it carries the same version number as the release it came from rather than one of its own. It is not signed yet, so Windows warns the first time it runs: that makes it something to try on your own machine, not something to hand to other people. (DTD-488, #210, 19c9378)
  VI: Flowie Desktop nay có bộ cài Windows. Mỗi lần build đều sinh ra một bộ, cài theo người chạy nó nên không cần quyền quản trị, và mang đúng số hiệu của bản phát hành sinh ra nó chứ không phải một số riêng. Nó chưa được ký số nên Windows cảnh báo ở lần chạy đầu: vì vậy đây là bản để tự thử trên máy mình, chưa phải thứ đem đưa cho người khác. (DTD-488)

### Changed

- A release must now carry the desktop installer as a download, not only describe the companion in its notes. CI artifacts expire and are buried inside workflow runs; a release asset stays. (DTD-488, #212, 91f7640)
  VI: Một bản phát hành nay phải mang theo bộ cài desktop dưới dạng file tải về, chứ không chỉ mô tả companion trong ghi chú. Artifact của CI hết hạn và bị chôn trong các lần chạy workflow; asset của release thì ở lại. (DTD-488)


- The Flowie Desktop plan no longer describes a production deployment pipeline that was removed. It had said a desktop change could trigger a server deploy and that a green pipeline run proved the build reached a machine; both stopped being true when the automated deployment was dropped, and a plan that describes machinery nobody has is a plan that sends someone looking for it. Documentation only. (DTD-501, #209, 3764dfb)
  VI: Kế hoạch Flowie Desktop không còn mô tả một pipeline deploy production đã bị gỡ bỏ. Nó từng nói một thay đổi desktop có thể kích hoạt deploy server, và một lần chạy pipeline xanh chứng minh bản build đã tới một máy; cả hai đều hết đúng khi deploy tự động bị bỏ, và một kế hoạch mô tả bộ máy không ai có là kế hoạch đẩy người ta đi tìm nó. Chỉ là tài liệu. (DTD-501)

### Removed

- The automated production deployment is gone. Pushing to `main` no longer builds or deploys anything, because every server that runs Flowie is deployed by hand from its own checkout and the pipeline was deploying a machine nobody was using as their Flowie. Pull requests are still checked exactly as before. The rule that decided whether a push was worth deploying, and the tests guarding it, go with it. Releases now run the pull-request check on the release commit by hand before tagging, since nothing else looks at `main`; `AGENTS.md` and `docs/release-process.md` describe the new sequence. No rebuild needed for this change itself. (DTD-514, #186, 1c68c82)
  VI: Phần tự động deploy production đã bị bỏ. Push lên `main` không còn build hay deploy gì nữa, vì mọi server chạy Flowie đều được deploy tay từ checkout riêng và pipeline chỉ đang deploy một máy không ai dùng làm Flowie của mình. Pull request vẫn được kiểm đúng như trước. Quy tắc quyết định một lần push có đáng deploy hay không, cùng các test bảo vệ nó, cũng bị bỏ theo. Quy trình phát hành nay chạy tay pipeline kiểm tra trên chính commit release trước khi tạo tag, vì không còn gì ngó tới `main`; `AGENTS.md` và `docs/release-process.md` mô tả trình tự mới. Bản thân thay đổi này không cần build lại gì. (DTD-514)

### Fixed

- The what's new dialog scrolls, so a release with more entries than fit on a screen can be read to the end. It previously grew to the height of the window and clipped whatever was left, with no way to reach it: 0.14.0 announced eleven changes and nothing below the fifth could be seen. The header and its close button now stay in place while the entries scroll under them. Rebuild `web`. (DTD-513, #184, 40e8928)
  VI: Hộp thoại "Có gì mới" cuộn được, nên một bản phát hành nhiều mục hơn một màn hình vẫn đọc được tới cuối. Trước đó nó giãn tới chiều cao cửa sổ rồi cắt cụt phần còn lại mà không có cách nào xem tiếp: bản 0.14.0 thông báo mười một thay đổi và không ai nhìn thấy gì từ mục thứ năm trở xuống. Tiêu đề và nút đóng nay đứng yên trong khi các mục cuộn bên dưới. Build lại `web`. (DTD-513)

## [0.15.0] — 2026-11-08 19:30 +07

### Added

- Every build of the desktop companion now leaves behind a Windows program anyone can download and run, and the repository explains how to try it: where to get the file, what to put in the setup window, and what has to be on the machine first. Until now the only way to try a change was to build it yourself, which let “it compiles” keep standing in for “it works”. The build is not signed yet, so Windows warns about it the first time, and there is still no installer. (DTD-501, #207, 44854a1)
  VI: Mỗi lần build companion desktop nay để lại một chương trình Windows ai cũng tải về chạy được, và repository hướng dẫn cách thử: lấy file ở đâu, điền gì vào màn hình thiết lập, và máy cần có sẵn những gì. Trước đây cách duy nhất để thử một thay đổi là tự build, và điều đó khiến “nó biên dịch được” cứ bị dùng thay cho “nó chạy được”. Bản build chưa được ký số nên Windows sẽ cảnh báo ở lần chạy đầu, và vẫn chưa có bộ cài. (DTD-501)

- Flowie Desktop now has a setup window, so a machine can be prepared without editing files by hand. It shows what the companion is doing right now and what is stopping it, takes the connection token and puts it straight into the operating system's credential store without it ever touching the configuration file, and starts a new machine from a filled-in example rather than an empty box. A setting the window accepts is one the companion accepts, because both go through the same checks: a mistake is refused on the spot with the reason, instead of being saved and discovered later. The window never shows the token back, and clears the field the moment it is stored, so it cannot end up in a screenshot. There is still no installer. (DTD-501, #206, 27ea009)
  VI: Flowie Desktop nay có màn hình thiết lập, nên chuẩn bị một máy không còn phải sửa file bằng tay. Nó hiển thị companion đang làm gì ngay lúc này và điều gì đang cản nó, nhận token kết nối rồi đưa thẳng vào kho credential của hệ điều hành mà token không bao giờ chạm tới file cấu hình, và bắt đầu một máy mới từ một ví dụ điền sẵn chứ không phải một ô trống. Một thiết lập cửa sổ chấp nhận cũng là thiết lập companion chấp nhận, vì cả hai đi qua cùng một bước kiểm: sai thì bị từ chối ngay kèm lý do, thay vì được lưu lại rồi sau mới phát hiện. Cửa sổ không bao giờ hiển lại token, và xóa ô nhập ngay khi đã lưu, nên token không thể lọt vào một ảnh chụp màn hình. Vẫn chưa có bộ cài. (DTD-501)

- Flowie Desktop now actually works on its own. It asks the server for a task routed to this machine, takes it, runs the agent on a separate copy of the repository, runs the approved tests, commits, and reports the result, then goes back to waiting. The tray shows what it is doing: the task in hand while it works, and otherwise what is stopping it from working. Pausing takes effect without restarting. Cancelling the run in progress asks it to stop at its next step and hands the task back so another machine can take it, rather than killing it and leaving the task held until it times out; quitting the application does the same thing. One task at a time per machine, which is this companion's own limit because the server does not impose one. Still no installer and no setup screen, so a machine has to be configured by hand to try it. (DTD-501, #205, 24bc5a4)
  VI: Flowie Desktop nay tự làm việc được. Nó hỏi server xem có task nào định tuyến tới máy này không, nhận task, chạy agent trên một bản sao riêng của repository, chạy các bài test đã duyệt, commit, báo kết quả, rồi quay lại chờ. Tray hiển thị nó đang làm gì: task đang cầm trong lúc làm, còn không thì hiện điều gì đang cản nó làm việc. Tạm dừng có hiệu lực ngay mà không cần khởi động lại. Hủy lượt đang chạy sẽ yêu cầu nó dừng ở bước kế tiếp và trả task lại để máy khác nhận được, thay vì giết nó rồi để task bị giữ tới khi hết hạn; thoát ứng dụng cũng làm đúng như vậy. Mỗi máy một task tại một thời điểm, đây là giới hạn của chính companion vì server không áp giới hạn nào. Vẫn chưa có bộ cài và chưa có màn hình thiết lập, nên muốn thử thì phải cấu hình máy bằng tay. (DTD-501)

- The desktop companion now reads everything about a task and hands it to the agent unchanged: the task itself, its wider context, and the feature documents that already exist for it. The agent has file tools only and cannot ask the server anything, so whatever is read has to reach it or the agent works on a task nobody described to it. A project with no repository instructions and no existing documents is ordinary rather than a failure, so a missing one is passed over instead of stopping work that could have been done. No screen, API or deployment changes. (DTD-501, #204, fe764b8)
  VI: Companion desktop nay đọc mọi thứ về một task và trao lại cho agent nguyên vẹn: bản thân task, phần context rộng hơn, và các tài liệu tính năng đã có sẵn cho nó. Agent chỉ có công cụ thao tác file và không hỏi server được gì, nên thứ đã đọc phải tới được tay nó, nếu không agent sẽ làm một task không ai mô tả cho nó. Một project không có hướng dẫn repository và chưa có tài liệu nào là chuyện bình thường chứ không phải lỗi, nên thiếu thì bỏ qua thay vì chặn một công việc vốn làm được. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now ask the Flowie server what work has been routed to this machine and is still waiting to start. It asks the server to narrow the list rather than fetching everything and sorting it out locally, so a machine can never try to take a task meant for a different one. A task whose entry is incomplete is passed over instead of spoiling the whole check, and finding no work is the ordinary quiet answer rather than something going wrong. No screen, API or deployment changes. (DTD-501, #202, c051788)
  VI: Companion desktop nay hỏi được server Flowie xem có việc nào đã được định tuyến tới máy này và vẫn đang chờ bắt đầu. Nó để server thu hẹp danh sách thay vì lấy hết rồi tự lọc, nên một máy không bao giờ thử nhận một task dành cho máy khác. Một task có dữ liệu thiếu sẽ được bỏ qua thay vì làm hỏng cả lần kiểm tra, và không có việc nào là câu trả lời bình thường chứ không phải dấu hiệu có gì sai. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion now tells the agent which working copy to work in, instead of the two sides having to agree on it without the run ever saying so. The working copy is created for a task and then named explicitly when the agent is asked to review and to implement, so there is no way for an agent to end up editing the person's own checkout rather than the copy made for that task. No screen, API or deployment changes. (DTD-501, #201, bf70540)
  VI: Companion desktop nay nói rõ cho agent biết phải làm việc trong bản làm việc nào, thay vì để hai bên tự thống nhất với nhau mà run không hề nói ra. Bản làm việc được tạo cho một task rồi được nêu tên tường minh khi yêu cầu agent review và thực thi, nên không có cách nào để một agent cuối cùng lại đi sửa checkout của chính người dùng thay vì bản sao tạo ra cho task đó. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now do the work on a real checkout: it checks the folder really is the project's repository before it takes a task, cuts a separate working copy for each run on its own branch so the person's own work is never touched, runs exactly the test commands they approved and keeps the command, exit code, duration and the tail of the output as evidence, commits the result, and can push the branch and open a draft pull request when that is allowed. A folder that is not the configured repository, or a test command nobody approved, is refused before the task is taken rather than discovered after an agent has already written code. Publishing is only offered for GitHub.com and says so plainly instead of pushing a branch and then failing to open anything. A push or pull request that hangs is given up on rather than holding the task until its claim expires. No screen, API or deployment changes. (DTD-501, #200, 1c98f86)
  VI: Companion desktop nay làm việc được trên một checkout thật: nó kiểm thư mục đó đúng là repository của project trước khi nhận task, cắt một bản làm việc riêng cho mỗi lượt chạy trên nhánh riêng để không bao giờ đụng vào phần việc của chính người dùng, chạy đúng những lệnh test họ đã duyệt và giữ lại lệnh, exit code, thời lượng và phần đuôi output làm bằng chứng, commit kết quả, và push nhánh rồi mở pull request nháp khi được phép. Một thư mục không phải repository đã cấu hình, hay một lệnh test không ai duyệt, đều bị từ chối trước khi nhận task chứ không để phát hiện sau khi agent đã viết code. Việc publish chỉ hỗ trợ GitHub.com và nói thẳng ra như vậy, thay vì push nhánh lên rồi không mở được gì. Một lần push hay mở pull request bị treo sẽ bị bỏ cuộc chứ không giữ task tới khi quyền nhận hết hạn. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now actually run an agent for a task, both Claude Code and Codex CLI, through one path so the two cannot drift apart in how strictly they are held. The agent is handed the working copy and nothing else: its environment is cut back to a short list of permitted variables so nothing the companion holds leaks into it, the task text reaches it through standard input and never on a command line where a crafted task title could change what runs, and it starts in its own process group so a run that gets stuck can be ended in full rather than leaving pieces behind. When the agent cannot be run at all the companion says which of the three things to do about it — install it, update it, or sign in — and names the missing capability rather than reporting that the agent is unavailable. A turn that fails after the task has been taken is reported rather than passed over in silence, and the work is left on disk for someone to look at. No screen, API or deployment changes. (DTD-501, #199, d2c1956)
  VI: Companion desktop nay thực sự chạy được một agent cho một task, cả Claude Code lẫn Codex CLI, qua cùng một đường để hai bên không lệch nhau về mức độ bị ràng buộc. Agent chỉ được giao bản làm việc và không gì khác: môi trường của nó bị thu lại còn một danh sách ngắn các biến được phép để không thứ gì companion đang giữ lọt sang, nội dung task tới nó qua standard input chứ không bao giờ qua dòng lệnh, nơi một tiêu đề task dàn dựng có thể đổi thứ được chạy, và nó khởi động trong nhóm tiến trình riêng để một lượt chạy bị kẹt có thể bị kết thúc trọn vẹn chứ không bỏ lại mảnh vụn. Khi hoàn toàn không chạy được agent, companion nói rõ phải làm việc nào trong ba việc — cài đặt, cập nhật, hay đăng nhập — và nêu tên khả năng còn thiếu chứ không báo chung chung là không dùng được agent. Một lượt hỏng sau khi task đã bị nhận thì được báo chứ không bỏ qua trong im lặng, và phần việc được giữ lại trên đĩa để ai đó xem. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion now knows what to ask an agent and what to accept back. The instructions are carried over word for word from the runner that has been doing this against real tasks, including the restrictions that keep an unattended agent from committing, pushing, opening pull requests, reaching Flowie or starting other agents, and the instruction to treat task text as untrusted. Everything the agent answers is checked before any of it is written to the task: a plan that is empty or absurdly long, a target end date that is not a real day on the calendar, one already past, or one more than a year out all stop the run before a line of code is written. A date such as the 29th of February in a year that has no such day is refused, which a pattern check alone would let through. Documents are trimmed before they are measured, so a field of blank space counts as nothing rather than as content, and the failure names which of the two agents produced it. No screen, API or deployment changes. (DTD-501, #197, 3e23b3f)
  VI: Companion desktop nay biết phải yêu cầu agent điều gì và nhận lại những gì. Phần hướng dẫn được mang sang nguyên văn từ runner vốn đã làm việc này với task thật, kể cả những hạn chế ngăn một agent không người canh đi commit, push, mở pull request, gọi Flowie hay khởi động agent khác, và câu dặn coi nội dung task là dự liệu không đáng tin. Mọi thứ agent trả lời đều được kiểm trước khi ghi bất cứ phần nào lên task: một kế hoạch rỗng hoặc dài vô lý, một ngày kết thúc không phải ngày thật trên lịch, một ngày đã qua, hay một ngày xa hơn một năm đều làm run dừng trước khi viết một dòng code nào. Một ngày như 29 tháng Hai trong năm không có ngày đó sẽ bị từ chối, điều mà chỉ kiểm theo mẫu thì sẽ cho qua. Tài liệu được cắt khoảng trắng trước khi đo, nên một trường toàn khoảng trắng được tính là không có gì chứ không phải nội dung, và thông báo lỗi nêu rõ agent nào trong hai agent đã sinh ra nó. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now actually talk to a Flowie server while it runs a task: read the task, take it, keep its claim alive, save the feature documents, record the target end date, post the plan, and report the result or hand the task back. The claim it holds travels with every later call, so another machine cannot quietly take over mid-run, and the moment that claim is lost the companion stops being able to write to that task at all rather than overwriting someone else's work. A feature document that cannot be saved is reported as a note in the plan comment instead of throwing away a finished piece of work, which is the agreed level for missing documentation; losing the claim is the one thing that is never downgraded to a note. An ending the server does not record is refused rather than guessed at, so a task is never marked failed when it was merely handed back. No screen, API or deployment changes. (DTD-501, #196, 33ee821)
  VI: Companion desktop nay thực sự nói chuyện được với server Flowie trong lúc chạy một task: đọc task, nhận task, giữ cho quyền nhận đó còn hiệu lực, lưu tài liệu tính năng, ghi ngày kết thúc dự kiến, đăng kế hoạch, và báo kết quả hoặc trả task lại. Quyền nhận mà nó đang giữ đi kèm mọi lời gọi sau đó, nên một máy khác không thể âm thầm tiếp quản giữa chừng, và ngay khi mất quyền đó thì companion không còn ghi được gì lên task đó nữa chứ không đè lên công việc của người khác. Một tài liệu tính năng không lưu được sẽ được báo thành một ghi chú trong comment kế hoạch thay vì vứt bỏ một phần việc đã làm xong, đúng mức đã thống nhất cho việc thiếu tài liệu; mất quyền nhận là thứ duy nhất không bao giờ bị hạ xuống thành ghi chú. Một kết cục mà server không ghi nhận thì bị từ chối chứ không được đoán bừa, nên một task không bao giờ bị đánh dấu thất bại khi nó chỉ được trả lại. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion now carries the feature documents its review drafted through to the step that saves them, so the FDS and TDS of each feature a change touches are written to the task rather than quietly going nowhere. A draft the server would refuse is caught before anything is sent, naming the field at fault and which document it belongs to, instead of failing part way through a set and leaving some documents saved and some not. Lengths are measured in characters, so a document written in Vietnamese is not refused for being well inside the real limit. A change that alters no documented behaviour still records that decision rather than skipping the step. No screen, API or deployment changes. (DTD-501, #195, 2d7b3c3)
  VI: Companion desktop nay mang các tài liệu tính năng mà lượt review đã soạn tới bước lưu chúng, nên FDS và TDS của mọi tính năng mà một thay đổi chạm tới đều được ghi lên task chứ không âm thầm biến mất. Một bản nháp mà server sẽ từ chối bị chặn trước khi gửi bất cứ thứ gì, kèm tên trường sai và tài liệu nào chứa nó, thay vì hỏng khi đang lưu dở một bộ và để một phần được lưu còn một phần không. Độ dài được đo theo ký tự, nên một tài liệu viết bằng tiếng Việt không bị từ chối dù còn nằm sâu trong giới hạn thật. Một thay đổi không làm đổi hành vi nào đã tài liệu hoá vẫn ghi lại quyết định đó chứ không bỏ qua bước này. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now write to a task as well as read it: add a comment, change fields such as the target end date, and save a feature document. A change to a task always carries the version the companion read it at, so a run and a person editing the same task at the same moment cannot silently overwrite each other; the later write is refused instead of discarding the earlier one. Fields supplied by the caller can never replace the task being written, the version guarding the write or the key that makes a retry safe, and an attempt to do so is refused before anything is sent rather than resolved by whichever value happens to be applied last. No screen, API or deployment changes. (DTD-501, #194, 1d079d2)
  VI: Companion desktop nay ghi được lên task chứ không chỉ đọc: thêm comment, đổi các trường như ngày kết thúc dự kiến, và lưu một tài liệu tính năng. Một thay đổi lên task luôn mang theo version mà companion đã đọc, nên một lượt chạy và một người đang sửa cùng một task trong cùng một lúc không thể âm thầm đè lên nhau; lần ghi sau bị từ chối thay vì xóa bỏ lần ghi trước. Các trường do bên gọi cung cấp không bao giờ thay thế được task đang được ghi, version làm chốt cho lần ghi, hay key khiến lần thứ lại an toàn, và mọi nỗ lực làm vậy bị từ chối trước khi gửi đi bất cứ thứ gì chứ không để giá trị nào tình cờ áp sau quyết định. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- For every failure the Flowie server can report, the desktop companion now decides whether the task it is holding may still be touched, and exactly one of them makes it stop without a word: another machine having taken the task over. Everything else is reported, including a run that simply used up its time budget, so a person waiting on that task learns what happened instead of watching it sit unchanged forever. A momentary network failure is never mistaken for having lost the task, which would throw away work that was progressing fine. No screen, API or deployment changes. (DTD-501, #192, 755f5f0)
  VI: Với mọi thất bại mà server Flowie có thể báo về, companion desktop nay quyết định được liệu task nó đang giữ còn được đụng vào hay không, và đúng một trường hợp khiến nó dừng mà không nói gì: một máy khác đã lấy task đi. Mọi trường hợp còn lại đều được báo, kể cả một lượt chạy chỉ đơn giản là hết giờ, để người đang chờ task đó biết được chuyện gì đã xảy ra thay vì ngồi nhìn nó đứng yên mãi. Một lần mạng hỏng trong khoảnh khắc không bao giờ bị nhầm thành mất task, điều sẽ vứt bỏ một công việc vốn đang tiến triển bình thường. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now carry a task from start to finish in the right order, and more importantly it behaves correctly when something goes wrong. A machine that cannot do the work never takes the task away from other machines in the first place. A failing check stops the work before it is committed and before anyone is told it is ready. If the companion loses its hold on a task midway it stops and says nothing at all, rather than writing a result that could overwrite what another machine already recorded. Cancelling hands the task back instead of marking it failed, because nothing went wrong with it. Work that produced no change is not offered up for review. In every ending except a clean success the work stays on disk so a person can look at it. No screen, API or deployment changes. (DTD-501, #190, 3297480)
  VI: Companion desktop nay đưa được một task từ đầu tới cuối theo đúng thứ tự, và quan trọng hơn là nó hành xử đúng khi có sự cố. Một máy không làm được việc thì ngay từ đầu không lấy task khỏi tay các máy khác. Một bài kiểm tra hỏng sẽ dừng công việc trước khi nó được commit và trước khi báo với ai rằng nó đã sẵn sàng. Nếu companion mất quyền giữ task giữa chừng, nó dừng và không nói gì cả, thay vì ghi một kết quả có thể đè lên thứ một máy khác đã ghi. Hủy thì trả task lại chứ không đánh dấu thất bại, vì bản thân task không có gì sai. Công việc không tạo ra thay đổi nào thì không được đem đi review. Trong mọi kết cục trừ một lần thành công sạch sẽ, công việc ở lại trên đĩa để người ta xem được. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can now build the exact command that runs an agent, with every restriction the existing Python runner applies: the agent gets file tools only, never a shell, a browser or the network, and during the read-only review it cannot write at all, so the plan it produces describes work that has not happened yet. Questions it would normally stop to ask are refused rather than left hanging, because nobody is watching an unattended run. The task text is handed over on standard input and never placed on a command line, where a crafted task title could otherwise change what gets executed. A run that produces no result, reports an error, or returns something too large to be a summary is treated as unfinished rather than as success. No screen, API or deployment changes. (DTD-501, #189, 6b67932)
  VI: Companion desktop nay dựng được chính xác câu lệnh chạy agent, kèm mọi hạn chế mà runner Python hiện có đang áp: agent chỉ có công cụ thao tác file, không bao giờ có shell, trình duyệt hay mạng, và trong lượt review chỉ đọc thì nó hoàn toàn không ghi được, nên kế hoạch nó sinh ra mô tả việc chưa làm. Những câu hỏi nó thường dừng lại để hỏi bị từ chối thay vì treo đó, vì không ai ngồi canh một lượt chạy tự động. Nội dung task được đưa qua standard input và không bao giờ đặt lên dòng lệnh, nơi một tiêu đề task dàn dựng có thể đổi thứ được thực thi. Một lượt chạy không sinh ra kết quả, báo lỗi, hoặc trả về thứ quá lớn để là một bản tóm tắt đều bị coi là chưa hoàn thành chứ không phải thành công. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The Flowie Desktop companion now starts as a real application: it claims the machine for this account so a second copy cannot quietly take work alongside the first, reads what has been set up here, and shows that state in the tray instead of an icon that means nothing. Pausing and resuming from the tray is written down, so a machine told to hold still is still holding still after a restart — and if that cannot be saved, the menu goes back to what the file actually says rather than showing a pause that will be forgotten. Before contacting the server the tray says disconnected rather than ready, because nothing local can prove the connection works. Still no installer and nothing released; this is not yet something to hand to anyone. No screen, API or deployment changes. (DTD-501, #188, f4a2972)
  VI: Companion Flowie Desktop nay khởi động như một ứng dụng thật: nó giành quyền trên máy cho tài khoản này để bản thứ hai không âm thầm nhận việc song song với bản đầu, đọc những gì đã được thiết lập ở đây, và hiển thị trạng thái đó trên tray thay vì một icon vô nghĩa. Tạm dừng và tiếp tục từ tray được ghi lại, nên một máy đã được yêu cầu đứng yên thì sau khi khởi động lại vẫn đứng yên — và nếu không ghi được, menu quay về đúng những gì file đang nói thay vì hiển thị một lần tạm dừng sẽ bị quên. Trước khi liên hệ server, tray báo mất kết nối chứ không báo sẵn sàng, vì không có kiểm tra cục bộ nào chứng minh được kết nối hoạt động. Vẫn chưa có bộ cài và chưa phát hành gì; đây chưa phải thứ để đưa cho ai dùng. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion checks it can actually do the whole job before it accepts any work, and says precisely what is wrong when it cannot: not set up, needs signing in, missing a named permission, disconnected, or paused. Permission is checked against the work rather than assumed from a successful connection, so a token that can sign in but cannot write a comment is caught before a task is taken rather than after an agent has already edited a repository for a result it cannot report. Being offline is treated as something to wait out, not something to interrupt anyone about. It also spreads out when machines ask for work, so a group of them that all lost connection during an outage comes back staggered instead of arriving together at the moment the server is least able to take it. No screen, API or deployment changes. (DTD-501, #187, 605970e)
  VI: Companion desktop kiểm tra nó thật sự làm trọn được công việc trước khi nhận bất kỳ việc nào, và nói chính xác sai ở đâu khi không: chưa cấu hình, cần đăng nhập, thiếu một quyền cụ thể, mất kết nối, hoặc đang tạm dừng. Quyền được kiểm theo công việc thật chứ không suy ra từ việc kết nối thành công, nên một token đăng nhập được nhưng không ghi được comment sẽ bị phát hiện trước khi nhận việc, thay vì sau khi agent đã sửa repository cho một kết quả nó không báo được. Mất mạng được coi là thứ cần chờ qua, không phải thứ cần làm phiền ai. Nó cũng rải thời điểm các máy hỏi việc, để một nhóm máy cùng mất kết nối trong một lần sự cố quay lại so le thay vì ập tới cùng lúc đúng khi server yếu nhất. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion remembers how a machine was set up: which Flowie server, which project, which checkout on disk, which agent, and exactly which test commands a person approved. It reads that back on every start, so behaviour after a restart matches behaviour before one. The file refuses anything it would later choke on — a server address of the wrong shape, a checkout path that is not absolute, a repository address carrying a password, one project mapped to two folders — and says which, instead of starting and failing later against a setting nobody chose. A misspelled setting is reported rather than silently ignored, because being quietly ignored leaves someone believing they configured something they did not. The connection token is deliberately not in this file; it stays in the operating system's credential store. No screen, API or deployment changes. (DTD-501, #185, 0e06034)
  VI: Companion desktop nhớ được một máy đã thiết lập thế nào: server Flowie nào, project nào, checkout nào trên đĩa, agent nào, và chính xác những lệnh test nào một người đã duyệt. Nó đọc lại những thứ đó ở mỗi lần khởi động, nên hành vi sau khi khởi động lại giống hệt trước đó. File từ chối ngay những gì về sau sẽ gây lỗi — địa chỉ server sai dạng, đường dẫn checkout không tuyệt đối, địa chỉ repository mang theo mật khẩu, một project trỏ tới hai thư mục — và nói rõ cái nào, thay vì khởi động rồi hỏng về sau theo một thiết lập không ai chọn. Thiết lập gõ sai được báo chứ không bị âm thầm bỏ qua, vì bị bỏ qua lặng lẽ khiến người dùng tin rằng họ đã cấu hình thứ mà thực ra chưa. Token kết nối cố ý không nằm trong file này; nó ở lại kho credential của hệ điều hành. Không thay đổi màn hình, API hay triển khai. (DTD-501)

- The desktop companion can keep its Flowie token in the operating system's own credential store rather than in a file, and tells apart a machine that has not been set up yet from one whose credential store will not answer — a locked keychain is a different problem from a fresh installation, and sending someone to the wrong one wastes their time. It also refuses to run twice on the same machine for the same person, because the server does not limit how many tasks one connection may hold at once, so two copies would each pick up work and neither would know about the other. Quitting or crashing releases that claim immediately. Two people signed into one computer are unaffected. No screen, API or deployment changes. (DTD-501, #183, c0b1377)
  VI: Companion desktop giữ được token Flowie trong kho credential của chính hệ điều hành thay vì trong một file, và phân biệt được máy chưa thiết lập với máy có kho credential không trả lời — keychain bị khoá là vấn đề khác với bản cài mới, chỉ sai người dùng đi nhầm hướng là mất thời gian của họ. Nó cũng từ chối chạy hai lần trên cùng một máy cho cùng một người, vì server không giới hạn số việc một kết nối được giữ cùng lúc, nên hai bản sẽ mỗi bên nhận một việc mà không bên nào biết bên kia. Thoát hoặc crash đều nhả quyền đó ngay. Hai người đăng nhập cùng một máy tính không bị ảnh hưởng. Không thay đổi màn hình, API hay triển khai. (DTD-501)

### Fixed

- The time a reminder was set for is now recorded with its time zone, so it reads back as the same moment everywhere. A reminder notification keeps that time alongside the issue it belongs to, and it was being written without any marker saying it was UTC. Nothing on screen shows that stored time today, so nobody has seen a wrong hour because of it, but anything reading it later would have taken it for local time and been out by a whole time zone. The reminders that back this are also covered by an automated test for the first time: that it goes out once and only once when two copies of the service look at the same one, that an issue already archived does not produce one, and that one set for later stays quiet until its time comes. No screen, API or deployment changes. (DTD-517, #203, a638c5b)
  VI: Thời điểm hẹn của một lời nhắc nay được ghi kèm múi giờ, nên đọc lại ở đâu cũng ra đúng một thời điểm. Thông báo nhắc việc có giữ lại thời điểm đó cạnh công việc mà nó thuộc về, và nó đang được ghi mà không có dấu hiệu nào nói rằng đó là giờ UTC. Hiện chưa màn hình nào hiển thị thời điểm được lưu đó nên chưa ai thấy sai giờ vì chuyện này, nhưng bất cứ thứ gì đọc nó về sau đều sẽ hiểu nhầm thành giờ địa phương và lệch nguyên một múi giờ. Phần nhắc việc đứng sau tính năng này cũng lần đầu tiên có test tự động: rằng nó chỉ đi đúng một lần khi hai bản sao của dịch vụ cùng nhìn vào một lời nhắc, rằng một công việc đã lưu trữ thì không sinh ra lời nhắc, và rằng lời nhắc hẹn giờ sau vẫn im lặng cho tới đúng giờ. Không thay đổi màn hình, API hay triển khai. (DTD-517)

- A desktop companion run whose permission is withdrawn part way through now still reports what happened and still tidies up after itself. Until now any such failure was treated as proof that the task had never been taken, so a run that had already claimed a task would end without telling anyone and leave its working copy behind, with the task held until its claim timed out. The same applies to a step that finds the claim it needs is gone. A failure that really does happen before the task is taken still tells the server nothing, because there is nothing it is owed. Introduced and fixed while unreleased, so no published version behaved this way. (DTD-501, #198, 3e5b9d8)
  VI: Một lượt chạy của companion desktop bị rút quyền giữa chừng nay vẫn báo lại chuyện đã xảy ra và vẫn dọn dẹp sau mình. Trước đây mọi thất bại kiểu đó đều bị coi là bằng chứng rằng task chưa từng bị nhận, nên một lượt chạy đã nhận task rồi sẽ kết thúc mà không báo với ai và bỏ lại bản làm việc của nó, còn task thì bị giữ cho tới khi quyền nhận hết hạn. Điều tương tự cũng áp dụng cho một bước phát hiện quyền nhận nó cần đã không còn. Một thất bại thật sự xảy ra trước khi nhận task thì vẫn không báo gì với server, vì server không được nợ gì cả. Lỗi được tạo ra và sửa khi còn chưa phát hành, nên không bản nào đã phát hành từng hành xử như vậy. (DTD-501)

- The browser test suite no longer fails for reasons unrelated to the change under test. The suite shares one database and runs each browser in turn, and a test that ran out of time before deleting what it created left that behind for later tests — on the next browser too. Three tests then failed on data they never touched, and because the run stopped at the fifth failure, the rest of the suite went unreported. Tests now judge only the rows they created, the one that was running out of time has room to clean up, and a sign-in race that interrupted its own navigation waits for the redirect to finish. A run now reports every failure instead of the first five, and a single test may retry once on CI. A pinned tool the checks download from a third party is also kept between runs, and when that host cannot be reached at all the one rehearsal needing it is skipped with a warning instead of failing the job before any test has run — a download that arrives but does not match its pinned checksum still fails, because that is corruption rather than an outage. No user-visible change and nothing to rebuild. (DTD-506, #191, fd7beac)
  VI: Bộ test trình duyệt không còn hỏng vì những lý do không liên quan tới thay đổi đang kiểm. Bộ test dùng chung một database và chạy lần lượt từng trình duyệt, nên một test hết giờ trước khi kịp xoá thứ nó tạo ra sẽ bỏ lại dữ liệu đó cho các test sau — kể cả ở trình duyệt kế tiếp. Ba test vì thế hỏng vì dữ liệu chúng không hề đụng tới, và vì lần chạy dừng ở lỗi thứ năm nên phần còn lại của bộ test không được báo cáo. Nay mỗi test chỉ xét những dòng do chính nó tạo, test từng hết giờ đã có đủ thời gian dọn dẹp, và một lỗi đua lúc đăng nhập tự cắt ngang điều hướng của mình nay chờ redirect xong hẳn. Một lần chạy nay báo cáo mọi lỗi thay vì năm lỗi đầu, và một test đơn lẻ được thử lại một lần trên CI. Một công cụ được ghim mà các bước kiểm tra phải tải từ bên thứ ba nay cũng được giữ lại giữa các lần chạy, và khi hoàn toàn không với tới được host đó thì chỉ riêng phần diễn tập cần nó được bỏ qua kèm cảnh báo, thay vì làm hỏng job trước khi có test nào chạy — còn tệp tải về mà sai checksum đã ghim thì vẫn fail, vì đó là hỏng dữ liệu chứ không phải sự cố đường truyền. Không đổi gì với người dùng và không cần build lại. (DTD-506)


- A desktop companion run now hands over the commit it made, the address of what it published and the checks it executed along with its result, instead of the result alone. Without them the server refuses to record finished work as ready for review, so a run that had done everything correctly would have been turned down at the final step and then written down as a failure. A run stopped by a failing check also reports which check it was, since that is the most useful thing a person gets out of that ending, and a run that published nothing reports no address rather than inventing one. Introduced and fixed while unreleased, so no published version behaved this way. (DTD-501, #193, c1333f3)
  VI: Một lượt chạy của companion desktop nay trao lại commit nó đã tạo, địa chỉ của thứ nó đã publish và các bài kiểm tra nó đã chạy cùng với kết quả, thay vì chỉ riêng kết quả. Thiếu những thứ đó thì server từ chối ghi nhận công việc đã xong là sẵn sàng review, nên một lượt chạy đã làm đúng mọi thứ sẽ bị chặn ở bước cuối rồi bị ghi là thất bại. Một lượt chạy dừng vì kiểm tra hỏng cũng báo rõ đó là kiểm tra nào, vì đó là thứ hữu ích nhất một người nhận được từ kết cục đó, còn một lượt chạy không publish gì thì không báo địa chỉ nào thay vì bịa ra một địa chỉ. Lỗi được tạo ra và sửa khi còn chưa phát hành, nên không bản nào đã phát hành từng hành xử như vậy. (DTD-501)

- Vietnamese text in one of the desktop companion's source files had been mangled into unreadable characters by an editing mistake and is now restored, along with a note in the desktop README on the mistake that caused it so it is not repeated. Source comments only; no behaviour, screen, API or deployment changes. (DTD-501, #192, 755f5f0)
  VI: Chữ tiếng Việt trong một file nguồn của companion desktop đã bị một lần sửa file làm hỏng thành ký tự không đọc được, nay đã được phục hồi, kèm một ghi chú trong README của desktop về nguyên nhân để không mắc lại. Chỉ là comment trong mã nguồn; không thay đổi hành vi, màn hình, API hay triển khai. (DTD-501)

## [0.14.0] — 2026-11-08 06:58 +07

### Added

- The desktop companion now knows the order a run has to happen in and when it is no longer allowed to act. It renews its hold on a run often enough to survive a brief network problem, and the moment that hold becomes uncertain it stops before changing anything further, rather than risk overwriting what another machine has already recorded. A run approaching the server's time limit is wound up on purpose instead of being cut off mid-edit. If the application restarts, it can tell from its own notes whether the run it was working on already changed anything on the server, so a task is never silently done twice. Nothing is visible to anyone yet; no screen, API or deployment changes. (DTD-498, #180, 796ab744)
  VI: Companion desktop nay biết thứ tự bắt buộc của một run và biết khi nào nó không còn được phép hành động. Nó gia hạn quyền giữ một run đủ thường xuyên để vượt qua một sự cố mạng ngắn, và ngay khi quyền giữ đó trở nên không chắc chắn thì nó dừng trước khi thay đổi thêm bất cứ thứ gì, thay vì liều đè lên thứ một máy khác đã ghi. Một run sắp chạm giới hạn thời gian của server được kết thúc có chủ đích thay vì bị cắt giữa lúc đang sửa. Nếu ứng dụng khởi động lại, nó tự đọc ghi chép của mình để biết run đang dở đã thay đổi gì trên server hay chưa, nên một task không bao giờ âm thầm bị làm hai lần. Chưa có gì hiển thị với người dùng; không thay đổi màn hình, API hay triển khai. (DTD-498)

- The desktop companion can now tell whether a machine is actually able to run an agent, and say which of four things is wrong when it cannot: the tool is not installed, it is too old for the options Flowie depends on, nobody has signed into it, or it produced output that could not be used. It finds a tool the way the operating system really finds one, including the npm shim that a plain lookup on Windows misses, and it accepts an explicit path for the case where an application started from the desktop cannot see what a terminal sees. An agent it starts receives only the handful of environment variables it needs to find its own installation and login, never Flowie's connection token or any repository credential. Nothing is visible to anyone yet; no screen, API or deployment changes. (DTD-496, #179, 10b3ca8a)
  VI: Companion desktop nay biết được một máy có thật sự chạy được agent hay không, và nêu rõ hỏng ở chỗ nào trong bốn khả năng: công cụ chưa cài, công cụ quá cũ so với các tuỳ chọn Flowie cần, chưa ai đăng nhập, hoặc công cụ sinh ra output không dùng được. Nó tìm công cụ đúng cách hệ điều hành thật sự tìm, kể cả shim npm mà cách tra thông thường trên Windows bỏ sót, và chấp nhận một đường dẫn chỉ định rõ cho trường hợp ứng dụng khởi động từ desktop không nhìn thấy những gì terminal nhìn thấy. Agent do nó khởi động chỉ nhận đúng số ít biến môi trường cần để tìm bản cài đặt và thông tin đăng nhập của chính nó, không bao giờ nhận token kết nối Flowie hay credential của repository. Chưa có gì hiển thị với người dùng; không thay đổi màn hình, API hay triển khai. (DTD-496)

- The desktop companion can now work with a repository on its own: it checks that the folder really is the project's checkout and that the base branch exists before touching anything, gives each run a private worktree placed next to the checkout rather than inside it, runs only the test commands a person approved, and commits the result. A test that hangs is stopped at its deadline together with everything it started, instead of holding the run until the server takes it away. A worktree that still holds uncommitted work is never deleted, even after a run that otherwise succeeded. Nothing is visible to anyone yet; no screen, API or deployment changes. (DTD-495, #177, 33d1431e)
  VI: Companion desktop nay tự làm việc được với một repository: nó kiểm tra thư mục đúng là checkout của dự án và base branch có tồn tại trước khi đụng vào bất cứ thứ gì, cấp cho mỗi run một worktree riêng đặt cạnh checkout chứ không nằm trong checkout, chỉ chạy những lệnh test một người đã duyệt, và commit kết quả. Một test bị treo sẽ bị dừng đúng hạn cùng với mọi tiến trình nó đã khởi động, thay vì giữ run tới khi server thu hồi. Worktree còn thay đổi chưa commit thì không bao giờ bị xoá, kể cả sau một run thành công. Chưa có gì hiển thị với người dùng; không thay đổi màn hình, API hay triển khai. (DTD-495)
- The desktop companion can now talk to Flowie: `apps/desktop` gains the MCP client that opens a session, lists the tools a server offers and calls the fifteen the companion needs, including the whole run lifecycle. It tells apart a revoked credential, a missing scope, a server too old for a tool, a lost lease, a run that ran out of its budget and a network outage, so the companion can later show the right state instead of a generic failure. A result that would be rejected by the server is refused locally first. The connection token never reaches a log or an error message. Nothing is visible to anyone yet; no screen, API or deployment changes. (DTD-494, #176, 07fe5689)
  VI: Companion desktop nay nói chuyện được với Flowie: `apps/desktop` có thêm client MCP mở phiên, liệt kê tool server cung cấp và gọi mười lăm tool companion cần, gồm trọn vòng đời run. Nó phân biệt được credential bị thu hồi, thiếu scope, server quá cũ không có tool, mất lease, run hết thời gian cho phép và mất mạng, để sau này companion hiện đúng trạng thái thay vì một lỗi chung chung. Kết quả nào server sẽ từ chối thì bị chặn ngay tại máy. Token kết nối không bao giờ lọt vào log hay thông báo lỗi. Chưa có gì hiển thị với người dùng; không thay đổi màn hình, API hay triển khai. (DTD-494)

- The repository now holds `apps/desktop`, the Cargo workspace for the Flowie Desktop companion: five empty crates, a Tauri shell that opens a tray icon, and a pinned Rust toolchain. Nothing is released from it yet and no screen changes. A push that only touches this workspace no longer rebuilds or redeploys the server, while a push that also touches the server still does; that rule has its own test suite. The desktop workspace is verified by its own workflow on Windows and macOS runners, separately from the production pipeline. No migration and no rebuild. (DTD-493, #175, 110d4166)
  VI: Repository nay có `apps/desktop`, Cargo workspace của companion Flowie Desktop: năm crate rỗng, một vỏ Tauri mở được icon tray, và toolchain Rust đã ghim phiên bản. Chưa có gì được phát hành từ đó và không màn hình nào thay đổi. Push chỉ chạm workspace này không còn build lại hay deploy lại server, còn push chạm cả server thì vẫn deploy; quy tắc đó có bộ kiểm thử riêng. Workspace desktop được kiểm bằng workflow riêng trên runner Windows và macOS, tách khỏi pipeline production. Không có migration và không cần build lại. (DTD-493)

### Changed

- The desktop plan now opens with what has actually been built rather than what was proposed, and records four things measured since it was written that contradict its own first draft: a Windows Job Object does not end a process tree when it is attached after the process started, no third-party library is needed to speak to Flowie from the companion, Tauri will not build on Windows without an icon file the plan never mentioned, and code written for macOS is not checked at all by a Windows build. The section describing the desktop source layout no longer calls it a proposal, since it has existed in the repository since the workspace was created. Documentation only; no deployment or migration required. (DTD-487, #181, cc5df249, #182, aee6b424)
  VI: Tài liệu kế hoạch desktop nay mở đầu bằng những gì đã thật sự được xây dựng thay vì những gì từng đề xuất, và ghi lại bốn điều đo được kể từ lúc viết vốn mâu thuẫn với chính bản nháp đầu: Job Object trên Windows không kết thúc được cả cây tiến trình nếu gán sau khi tiến trình đã chạy, không cần thư viện bên thứ ba để nói chuyện với Flowie từ companion, Tauri không build được trên Windows nếu thiếu một file icon mà kế hoạch chưa từng nhắc tới, và mã viết cho macOS hoàn toàn không được bản build Windows kiểm tra. Mục mô tả cấu trúc mã nguồn desktop không còn gọi đó là đề xuất, vì nó đã tồn tại trong repository từ lúc workspace được tạo. Chỉ thay đổi tài liệu; không cần triển khai hay migration. (DTD-487)

- Flowie wears the new pixel-art identity. The logo, the loading animation and the app icon all come from the supplied Pixel Motion Kit: a 5.5-second loop where three ribbons slide in, the wordmark letters appear one at a time and the green dot pops, drawn separately for the light and dark themes. The animation is a self-contained SVG that runs no script and loads nothing from the network, and it settles on the finished logo by itself for anyone who asks for reduced motion. The artwork is kept pixel-sharp at every size instead of being smoothed. The browser tab, bookmark and installed-app icon change with it, so a browser may keep showing the old one until its cached copy expires. The loading animation is also about three times heavier than the one it replaces, which is paid only while a screen is loading. Rebuild `web`. (DTD-497, #172, aebfc8ed)
  VI: Flowie mang nhận diện pixel-art mới. Logo, animation lúc tải và icon ứng dụng đều lấy từ bộ Pixel Motion Kit được cung cấp: một vòng 5,5 giây trong đó ba dải màu trượt vào, các chữ của wordmark lần lượt hiện ra và chấm xanh bật lên, vẽ riêng cho theme sáng và theme tối. Animation là một SVG tự chứa, không chạy script và không tải gì từ mạng, và tự dừng ở logo hoàn chỉnh cho người chọn giảm chuyển động. Hình được giữ sắc nét theo từng điểm ảnh ở mọi kích thước thay vì bị làm mượt. Icon trên tab trình duyệt, trong bookmark và của ứng dụng đã cài cũng đổi theo, nên trình duyệt có thể còn hiện icon cũ cho tới khi bản lưu trong cache hết hạn. Animation lúc tải cũng nặng gấp khoảng ba lần bản cũ, và chỉ phải tải khi màn hình đang chờ dữ liệu. Build lại `web`. (DTD-497)

### Fixed

- Setting or removing the default workspace works again after a failed preference save. The release announcement records which version it showed you, and that bookkeeping was travelling with the preferences you change yourself: when it failed — and it runs on its own just from opening Flowie — the whole preference sync reported an error, and every screen that waits for a settled sync disabled its controls, the workspace menu's default-workspace action among them. It now saves through a request of its own, so a failure of it changes nothing except that the announcement returns on a later visit. The announcement also no longer leaves the release notes in the page while it is closed — every sentence of the running release was sitting invisibly in every workspace page, where find-in-page and screen readers could still reach it. Rebuild `web`. (DTD-505, #174, 6e18a9b2)
  VI: Thao tác đặt hoặc bỏ workspace mặc định hoạt động trở lại sau một lần lưu preferences thất bại. Thông báo bản cập nhật có ghi lại phiên bản nó đã hiển thị, và phần ghi chép đó lại đi chung đường với các preferences do chính người dùng đổi: khi nó hỏng — mà nó tự chạy chỉ vì người dùng mở Flowie — toàn bộ việc đồng bộ preferences báo lỗi, và mọi màn hình chờ trạng thái đồng bộ ổn định đều khoá control của mình, trong đó có thao tác workspace mặc định ở menu workspace. Nay phần ghi chép này lưu bằng một request riêng, nên khi hỏng nó không đổi gì ngoài việc thông báo sẽ quay lại ở lần truy cập sau. Thông báo cũng không còn để lại nội dung bản cập nhật trong trang khi đang đóng — trước đó mọi câu của bản đang chạy vẫn nằm vô hình trong mọi trang workspace, nơi chức năng tìm trong trang và trình đọc màn hình vẫn chạm tới được. Build lại `web`. (DTD-505)
- The desktop workspace compiles on macOS again. Its Unix-only code tripped the workspace's own rule against unsafe code and carried an import Windows did not need, neither of which a Windows build can see, so the macOS half of the desktop CI failed while Windows passed. The two places that genuinely need unsafe code, signalling a process group and calling setsid, now say why in the code instead of relaxing the rule everywhere. Affects the desktop workspace only; no screen, API or deployment changes. (DTD-495, #178, b35195e5)
  VI: Workspace desktop biên dịch lại được trên macOS. Phần mã chỉ dành cho Unix của nó vi phạm chính quy tắc cấm mã không an toàn của workspace và mang theo một import Windows không cần, cả hai đều là thứ bản build Windows không nhìn thấy, nên nửa macOS của CI desktop hỏng trong khi Windows vẫn xanh. Hai chỗ thật sự cần mã không an toàn, gửi tín hiệu cho process group và gọi setsid, nay nêu rõ lý do ngay trong mã thay vì nới quy tắc ở mọi nơi. Chỉ ảnh hưởng workspace desktop; không thay đổi màn hình, API hay triển khai. (DTD-495)

- The web container starts again. `next start` transpiles `next.config.ts` and loads it with plain Node, which resolves neither a `.ts` extension nor this app's path aliases, while the deployed image carries that config file and nothing else of the source. The import added to it alongside the release announcement below therefore resolved in every checkout and threw `MODULE_NOT_FOUND` in the container, which exited before answering a single request and left the proxy in front of it returning `502 Bad Gateway` for the whole site. The config is self-contained again, and a unit test fails if a local import reappears in it. Rebuild `web`. (DTD-504, #171, 3d427932, #173, 613d9c24)
  VI: Container web khởi động được trở lại. `next start` biên dịch `next.config.ts` rồi nạp bằng Node thuần, vốn không phân giải đuôi `.ts` lẫn path alias của app, trong khi image đã triển khai chỉ mang theo đúng tệp config đó và không có phần mã nguồn nào khác. Vì vậy import được thêm vào nó cùng mục thông báo bản cập nhật bên dưới vẫn phân giải được trong mọi bản checkout nhưng ném `MODULE_NOT_FOUND` trong container, khiến container thoát trước khi trả lời bất kỳ request nào và proxy đứng trước nó trả `502 Bad Gateway` cho toàn bộ trang. Config nay tự chứa trở lại, và một unit test sẽ fail nếu có import cục bộ xuất hiện lại trong đó. Build lại `web`. (DTD-504)

### Added

- Flowie now tells each person once when it reaches a new release. On the first visit after an update a dialog lists that release's changes, with its version, release time and a link to the full changelog. Closing it — the close button, Escape or a click outside — is remembered on the account rather than the browser, so it stays closed on another computer and after clearing the cache, and the next release shows it exactly once again. An account with no release recorded yet is never interrupted: it adopts the running version silently and starts seeing announcements from the release after it, so this release itself announces nothing. Help & feedback → "What's new" shows the same notes from the same source. Both now read each change in the language the account is set to, instead of one line carrying the English and Vietnamese sentences and the internal task, pull request and commit references together. Stored settings an older API does not recognise no longer break reading a person's preferences. No migration; rebuild `api` and `web` together, because the new bundle saves a setting an older API would reject. (DTD-491, #170, 1183fbdb)
  VI: Flowie nay thông báo cho mỗi người đúng một lần khi lên bản phát hành mới. Lần đầu vào Flowie sau khi cập nhật, một hộp thoại liệt kê các thay đổi của bản đó, kèm số phiên bản, thời điểm phát hành và liên kết tới lịch sử cập nhật đầy đủ. Việc đóng hộp thoại — bằng nút đóng, phím Escape hay bấm ra ngoài — được ghi nhớ theo tài khoản chứ không theo trình duyệt, nên vẫn đóng khi mở trên máy khác hoặc sau khi xoá cache, và bản phát hành kế tiếp lại hiện đúng một lần. Tài khoản chưa ghi nhận bản nào thì không bị chen ngang: hệ thống âm thầm nhận phiên bản đang chạy và chỉ thông báo từ bản sau, nên chính bản này không thông báo cho ai. Mục Help & feedback → "Có gì mới" hiển thị cùng nội dung từ cùng một nguồn. Cả hai nay đọc mỗi thay đổi theo ngôn ngữ của tài khoản, thay vì một dòng chứa lẫn câu tiếng Anh, câu tiếng Việt và các mã task, pull request, commit nội bộ. Thiết lập đã lưu mà API bản cũ không biết cũng không còn làm việc đọc preferences của người dùng bị lỗi. Không có migration; build lại `api` và `web` cùng nhau, vì bundle mới lưu một thiết lập mà API bản cũ sẽ từ chối. (DTD-491)

## [0.13.0] — 2026-11-07 21:10 +07

### Added

- A desktop planning guide defines a shared Rust/Tauri companion for Windows and macOS, platform-specific installers, and a path to reuse the Flowie web interface. It records the agent run contract the companion must honour (five-minute lease, fencing and idempotency, the two-hour run budget, result evidence rules), the alternatives weighed against a Rust rewrite, and the open decisions that block packaging. Documentation only; no deployment or migration required. (DTD-487, #169, b019c3f5)
  VI: Tài liệu kế hoạch desktop xác định companion Rust/Tauri dùng chung cho Windows và macOS, bộ cài riêng theo nền tảng và lộ trình tái sử dụng giao diện web Flowie. Tài liệu ghi lại hợp đồng agent run mà companion phải tuân theo (lease năm phút, fencing và idempotency, giới hạn hai giờ mỗi run, quy tắc bằng chứng kết quả), các phương án đã cân nhắc so với việc viết lại bằng Rust, và những quyết định còn mở đang chặn bước đóng gói. Chỉ thay đổi tài liệu; không cần triển khai hay migration. (DTD-487)

- Issue attachments in HTML, XLSX, CSV, DOCX, PDF and plain text open a preview instead of downloading. HTML is shown as written but can never run script or load anything from the network; spreadsheets show each sheet as a table (first 500 rows and 50 columns, raw values without number formats). PowerPoint and old `.xls` files still download; open them on SharePoint. No migration; rebuild `api` and `web`. (DTD-479, #165, 402a0b6c)
  VI: Tệp đính kèm của issue dạng HTML, XLSX, CSV, DOCX, PDF và văn bản thường mở bản xem trước thay vì tải về. HTML hiển thị đúng như viết nhưng không bao giờ chạy được script hay tải gì từ mạng; bảng tính hiện từng sheet thành bảng (500 dòng và 50 cột đầu, giá trị thô không áp định dạng số). File PowerPoint và `.xls` cũ vẫn tải về; hãy mở chúng trên SharePoint. Không có migration; build lại `api` và `web`. (DTD-479)

- Docs has five more document types: BRD (business requirements), SRS (software requirements), PROTOTYPE, TEST (test plan / UAT) and MINUTES (meeting minutes). Each has its own badge colour and appears in the Docs type filter and type pickers. A new document of these types starts from a template, titled `<TYPE> · <name>` like FDS/TDS. The REST API and MCP `create_document` / `update_document` accept the new types. The Service Desk assistant also answers from approved BRD documents. No migration; rebuild `api` and `web`. (DTD-478, #164, c5c21ac2)
  VI: Docs có thêm năm loại tài liệu: BRD (yêu cầu nghiệp vụ), SRS (đặc tả yêu cầu phần mềm), PROTOTYPE, TEST (kế hoạch kiểm thử / UAT) và MINUTES (biên bản họp). Mỗi loại có màu badge riêng và có trong bộ lọc loại của Docs và các ô chọn loại. Tài liệu mới thuộc các loại này bắt đầu từ mẫu, tiêu đề `<LOẠI> · <tên>` như FDS/TDS. API REST và MCP `create_document` / `update_document` chấp nhận các loại mới. Trợ lý Service Desk trả lời thêm từ tài liệu BRD đã duyệt. Không có migration; build lại `api` và `web`. (DTD-478)

- The document viewer shows the table of contents as a sidebar on the left of the text instead of a block above it. It stays in view while the text scrolls, highlights the section being read and jumps smoothly to a heading when clicked. A header button hides or shows it; it starts hidden on screens narrower than 1024px and floats over the text on phones. No migration; rebuild `web`. (DTD-382, #163, a66fef57)
  VI: Khung xem tài liệu hiển thị mục lục thành sidebar bên trái phần chữ thay cho khối nằm phía trên. Mục lục luôn nằm trong khung nhìn khi phần chữ cuộn, tô sáng mục đang đọc và cuộn mượt tới heading khi bấm. Nút trên thanh tiêu đề dùng để ẩn hoặc hiện mục lục; trên màn hình hẹp hơn 1024px mục lục mặc định ẩn, và trên điện thoại nó nổi trên phần chữ. Không có migration; build lại `web`. (DTD-382)

- Sub-issues in task detail have a Timeline mode next to the list: drag a bar to move a sub-issue or drag its edges to change the start or end date, snapped to whole days. The list shows Start and End columns instead of the due date, the first row is the open task itself with its dates, and a sub-issue that starts before or ends after the task gets an amber warning. The chosen sort is saved on the task, and the project Timeline now shows each task's sub-issues in that order (read only there) and lets members drag bars to change dates. A drag saves only if nobody changed the issue meanwhile; otherwise it reloads the latest dates. Read-only administrators cannot drag. Adds a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-441, #162, cd02a808)
  VI: Sub-issues trong chi tiết task có chế độ Timeline cạnh danh sách: kéo thanh để dời sub-issue hoặc kéo mép để đổi ngày bắt đầu, kết thúc, snap theo ngày. Danh sách hiện hai cột Start và End thay cho due date, dòng đầu là chính task đang mở kèm các ngày của nó, và sub-issue bắt đầu trước hoặc kết thúc sau task có cảnh báo màu cam. Sort đã chọn được lưu trên task, và Timeline project nay hiện sub-issue của từng task theo đúng thứ tự đó (ở đó chỉ xem) và cho thành viên kéo thanh để đổi ngày. Kéo chỉ được lưu khi không ai đổi issue trong lúc đó; nếu có thì tải lại ngày mới nhất. Quản trị chỉ đọc không kéo được. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-441)

- Service Desk has an assistant that answers questions about applications from their approved guides and FDS, with the sources it used. When the documents fall short, or the answer did not help, it offers to create a ticket and opens the ticket form already filled in with the project, a title and a description of the conversation; nothing is created until the person confirms. It appears on `/servicedesk` and under My tickets when the workspace has an AI provider and at least one project accepting tickets has approved GUIDE or FDS documents; otherwise Service Desk looks as before. On phones it opens from Ask the assistant. No migration; rebuild `web`. (DTD-440, #161, dbd66eb6)
  VI: Service Desk có trợ lý trả lời câu hỏi về các ứng dụng từ hướng dẫn và FDS đã duyệt, kèm nguồn đã dùng. Khi tài liệu không đủ, hoặc câu trả lời chưa giúp được, trợ lý đề nghị tạo ticket và mở form tạo ticket đã điền sẵn dự án, tiêu đề và mô tả từ hội thoại; không có gì được tạo cho tới khi người dùng xác nhận. Trợ lý hiện ở `/servicedesk` và tab Ticket của tôi khi workspace có provider AI và ít nhất một dự án nhận ticket có tài liệu GUIDE hoặc FDS đã duyệt; nếu không, Service Desk giữ nguyên như cũ. Trên điện thoại mở bằng nút Hỏi trợ lý. Không có migration; build lại `web`. (DTD-440)
- Service Desk assistant API: `POST /asks/assistant` answers a question only from approved GUIDE and FDS documents in scope, cites its sources, and returns a ticket draft (project, title, description; never a priority) for the person to confirm. `GET /asks/assistant/status` says whether the assistant is available. Questions with no matching document are answered without calling the AI provider. Each person can ask 30 questions per hour in a workspace. No screen uses it until DTD-440. No migration; rebuild `api`. (DTD-439, #160, 70132f9f)
  VI: API trợ lý Service Desk: `POST /asks/assistant` chỉ trả lời từ tài liệu GUIDE và FDS đã duyệt trong phạm vi, có trích dẫn nguồn, và trả bản nháp ticket (dự án, tiêu đề, mô tả; không có độ ưu tiên) để người dùng xác nhận. `GET /asks/assistant/status` cho biết trợ lý có dùng được không. Câu hỏi không khớp tài liệu nào được trả lời mà không gọi provider AI. Mỗi người hỏi tối đa 30 câu mỗi giờ trong một workspace. Chưa có màn hình nào dùng tới cho đến DTD-440. Không có migration; build lại `api`. (DTD-439)
- The API can now find answers for the upcoming Service Desk assistant in the latest approved release of GUIDE and FDS documents filed under projects that accept tickets. Questions match with or without Vietnamese accents. Drafts, edits waiting for approval, other document types, and archived documents, projects or teams are never used. Nothing is visible yet, because no screen or endpoint uses it until DTD-439. No migration. (DTD-438, #159, 9d207681)
  VI: API nay tìm được câu trả lời cho trợ lý Service Desk sắp ra mắt trong bản phát hành đã duyệt mới nhất của tài liệu GUIDE và FDS thuộc các dự án nhận ticket. Câu hỏi có dấu hay không dấu đều khớp. Bản nháp, nội dung sửa đang chờ duyệt, các loại tài liệu khác và tài liệu, dự án hoặc team đã lưu trữ không bao giờ được dùng. Chưa có gì hiển thị vì chưa có màn hình hay endpoint nào dùng tới cho đến DTD-439. Không có migration. (DTD-438)
- Editing a task's description in task detail now uses the same editor as Create issue: Rich Text by default, Markdown with Preview, and the last mode remembered. Descriptions are still saved as Markdown; Save, Cancel, Esc, Ctrl/⌘+Enter and pasted images work as before, and a pasted image shows at once while it uploads. No migration; rebuild `web`. (DTD-262, DTD-388, #158, 5a8c3f4b)
  VI: Sửa mô tả task trong trang chi tiết nay dùng cùng editor với Create issue: Rich Text mặc định, Markdown có Preview và nhớ chế độ đã chọn. Mô tả vẫn lưu dạng Markdown; Save, Cancel, Esc, Ctrl/⌘+Enter và dán ảnh hoạt động như trước, ảnh dán hiện ngay trong lúc tải lên. Không có migration; build lại `web`. (DTD-262, DTD-388)
- Agent answers questions about a specific issue by its identifier, such as "DTD-12 đang tới đâu rồi?", for up to 5 issues the asker may open. Agent personalization has a Test connection button that tries the saved provider and shows the reason when it fails. No migration; rebuild `api` and `web`. (DTD-331, #152, a1bfad19)
  VI: Agent trả lời câu hỏi về một issue theo mã, ví dụ "DTD-12 đang tới đâu rồi?", tối đa 5 issue người hỏi được mở. Agent personalization có nút Test connection để thử provider đã lưu và hiện lý do khi lỗi. Không có migration; build lại `api` và `web`. (DTD-331)
- Each person can make up to 60 AI calls per hour through Agent, Write with Agent and scheduling, so one account cannot run up the workspace's provider bill. Fixed reports and News are not counted. (DTD-331, #152, a1bfad19)
  VI: Mỗi người được gọi AI tối đa 60 lượt mỗi giờ qua Agent, Write with Agent và xếp lịch, để một tài khoản không thể đẩy chi phí provider của workspace lên cao. Báo cáo cố định và News không bị tính. (DTD-331)

- AI operations shows AI provider usage for the last 7 days by feature (calls, failed calls, input and output tokens, p95 time) and the 10 latest provider errors. Only usage and outcome are stored, never prompts or replies, and rows are kept for 90 days. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-322, #151, e6f35ae4)
  VI: AI operations hiển thị usage provider AI trong 7 ngày theo tính năng (số lần gọi, số lần lỗi, token vào và ra, thời gian p95) và 10 lỗi provider gần nhất. Chỉ lưu usage và kết quả, không lưu prompt hay câu trả lời, dữ liệu giữ 90 ngày. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-322)

- Owners and admins can let company accounts join a workspace by themselves: with the new setting on, staff in the company's Microsoft tenant join as members of no team when they sign in, and new accounts go straight to `/servicedesk` without a personal workspace. It is off for every workspace, and turning it on first shows how many projects, issues and documents with no team everyone would read. People removed from the workspace or who left stay out until invited again, and each change and each join is audited. People removed before this release left no record, so review them before turning it on. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-298, #149, ad75e4ed)
  VI: Owner và Admin nay cho phép tài khoản công ty tự vào workspace: khi bật cài đặt mới, nhân viên thuộc tenant Microsoft của công ty sẽ vào với vai trò member, không thuộc team nào khi đăng nhập, và tài khoản mới tới thẳng `/servicedesk` mà không có workspace cá nhân. Cài đặt đang tắt ở mọi workspace, và khi bật sẽ hiện trước số dự án, Issue và tài liệu không gắn team mà mọi người sẽ đọc được. Người bị xoá khỏi workspace hoặc đã tự rời sẽ ở ngoài cho tới khi được mời lại, và mỗi lần đổi cài đặt hay tự vào đều có audit. Người bị xoá trước bản này không để lại dấu vết, nên cần rà trước khi bật. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-298)
- A new Service Desk ticket now posts one card to its project's Teams channel, with the ticket code, title, requester, project and a button that opens it, so the team does not miss it. The ticket's description, messages and later changes stay out of Teams, the workspace channel is never used, and a project without a channel posts nothing. A Teams failure retries in the background and does not affect the ticket or the Inbox. Needs Microsoft sign-in enabled. No migration; rebuild `api`. (DTD-296, #148, 5e2e3a7d)
  VI: Ticket Service Desk mới nay gửi một card vào kênh Teams của dự án, gồm mã ticket, tiêu đề, người yêu cầu, dự án và nút mở ticket, để team không bỏ sót. Mô tả, tin nhắn và các thay đổi sau đó không được gửi lên Teams, kênh chung của workspace không được dùng, và dự án chưa có kênh thì không gửi. Teams lỗi được thử lại ở nền và không ảnh hưởng ticket hay Inbox. Cần bật đăng nhập Microsoft. Không có migration; build lại `api`. (DTD-296)
- Service Desk now updates by itself: when a ticket notification arrives, the list and the open ticket refresh without a reload and a draft reply stays in place. A dropped connection recovers on its own and data is read again when the tab regains focus, on the team page too. Team members who were not notified, such as when a ticket is assigned to a colleague, see changes when they return to the tab. Opening a ticket from the Inbox or a link now selects the Queue or My tickets tab that holds it. No migration; rebuild `web`. (DTD-297, #147, 96f446bb)
  VI: Service Desk nay tự cập nhật: khi có thông báo ticket, danh sách và ticket đang mở làm mới mà không cần tải lại trang, và bản nháp phản hồi vẫn còn. Mất kết nối thì tự phục hồi, và dữ liệu được đọc lại khi quay lại tab, kể cả ở trang team. Thành viên team không nhận thông báo, ví dụ khi ticket đã giao cho đồng nghiệp, thấy thay đổi khi quay lại tab. Mở ticket từ Inbox hoặc link nay tự chọn tab Hàng đợi hoặc Ticket của tôi chứa ticket đó. Không có migration; build lại `web`. (DTD-297)
- People who raise a Service Desk ticket now get email about it by default, with the ticket code, its title and a link that opens the ticket, in Vietnamese and English. Messages, decline reasons and file names stay in Flowie. They can turn these emails off on `/servicedesk` or in Settings → Notifications, and team members keep following their existing email setting, whose emails about tickets now use the same wording. Email about a ticket is dropped once the ticket is archived or the notification is over a day old, so turning SMTP on later does not send a backlog. Needs SMTP configured on the server. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-295, #146, 606db67d)
  VI: Người tạo ticket Service Desk nay mặc định nhận email về ticket đó, gồm mã ticket, tiêu đề và link mở ticket, bằng tiếng Việt và tiếng Anh. Tin nhắn, lý do từ chối và tên tệp ở lại trong Flowie. Họ tắt được email này trên `/servicedesk` hoặc trong Settings → Notifications, còn thành viên team vẫn theo cài đặt email hiện có, và email về ticket của họ cũng dùng nội dung này. Email về ticket bị bỏ khi ticket đã lưu trữ hoặc thông báo cũ hơn một ngày, nên bật SMTP sau này không gửi dồn email cũ. Cần cấu hình SMTP trên server. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-295)
- Every Service Desk ticket now has a code such as `SD-12`, numbered per workspace and shown in lists, in the ticket and in notifications; existing tickets are numbered in creation order. Each ticket has its own address on `/servicedesk` and on the team page, so a reload stays on it, its link can be shared with people allowed to read it, and Back returns to the list. Adding a file brings the ticket forward and notifies the same people as a message, once for files added in a row or sent with a new ticket. Includes a migration that numbers existing tickets: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-294, #145, 5198f4d0)
  VI: Mỗi ticket Service Desk nay có mã dạng `SD-12`, đánh số theo từng workspace và hiện ở danh sách, trong ticket và trong thông báo; ticket đã có được đánh số theo thứ tự tạo. Mỗi ticket có địa chỉ riêng trên `/servicedesk` và trang team, nên tải lại trang vẫn ở ticket đó, gửi được link cho người có quyền đọc, và Back quay về danh sách. Thêm file đưa ticket lên trước và báo cho cùng người nhận với tin nhắn, chỉ một lần khi thêm nhiều file liên tiếp hoặc gửi kèm ticket mới. Có migration đánh số ticket đã có: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-294)
- Service Desk tickets now have a full lifecycle: the team can mark a ticket resolved without an issue, a decline needs a reason the requester can read, requesters can cancel an open ticket and reopen one that is done or that they canceled, and the requester's page and My tickets filter by Open, Closed and All. Reopening a converted ticket leaves the issue alone and returns the ticket to the queue, where the team moves the issue back to work or marks the ticket resolved. Each decision reaches the other side once, at once. `POST /asks/{id}/transition` replaces changing `status` through `PATCH /asks/{id}`, and only the team can archive. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-293, #144, a15aaafe)
  VI: Ticket Service Desk nay có vòng đời đầy đủ: team đánh dấu đã giải quyết được mà không cần Issue, từ chối phải có lý do để người yêu cầu đọc, người yêu cầu huỷ được ticket đang mở và mở lại được ticket đã xong hoặc tự huỷ, đồng thời trang người yêu cầu và Ticket của tôi lọc được theo Đang mở, Đã đóng, Tất cả. Mở lại ticket đã chuyển Issue không đụng tới Issue mà đưa ticket về hàng đợi, để team chuyển Issue về đang làm hoặc đánh dấu đã giải quyết. Mỗi quyết định báo ngay một lần cho bên còn lại. `POST /asks/{id}/transition` thay cho việc đổi `status` qua `PATCH /asks/{id}`, và chỉ team được lưu trữ. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-293)
- Requesters get their own Service Desk page at `/servicedesk`, without the app sidebar: they raise tickets, follow them, see a dot on tickets with news and can still open the app from a link. Members in no team land there after sign-in, and their Inbox or email links open the ticket there; team members, owners and admins keep using the app. The `servicedesk` workspace slug is now reserved. This changes navigation only, data limits stay in the API. No migration; rebuild `api` and `web`. (DTD-292, #143, a1b01e92)
  VI: Người yêu cầu có trang Service Desk riêng tại `/servicedesk`, không có sidebar của app: họ tạo và theo dõi ticket, thấy chấm báo trên ticket có tin mới, và vẫn mở được app qua một liên kết. Thành viên không thuộc team nào được đưa tới trang này sau khi đăng nhập, và liên kết từ Inbox hoặc email mở ticket tại đây; thành viên team, owner và admin vẫn dùng app. Slug workspace `servicedesk` nay được giữ chỗ. Thay đổi này chỉ ảnh hưởng điều hướng, giới hạn dữ liệu vẫn nằm ở API. Không có migration; build lại `api` và `web`. (DTD-292)
- Service Desk tickets can be assigned to a team member, who is notified and whose name the requester sees. Once a ticket is assigned, its messages reach that person and the requester instead of the whole team, and converting the ticket assigns the issue to them. The Queue shows open tickets by default, with Closed and All filters, and an issue created from a ticket links back to it for the files and the conversation. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-291, #142, cf158006)
  VI: Ticket Service Desk có thể giao cho một thành viên team, người này được thông báo và người yêu cầu thấy tên họ. Sau khi giao, tin nhắn của ticket tới người đó và người yêu cầu thay vì cả team, và chuyển ticket thành Issue sẽ giao Issue cho họ. Hàng đợi mặc định hiện ticket đang mở, có bộ lọc Đã đóng và Tất cả, và Issue tạo từ ticket có liên kết về ticket để xem tệp và trao đổi. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-291)
- Team members get an Inbox notification when someone raises a Service Desk ticket for their project, so tickets no longer wait unnoticed in the queue. Asks created outside Service Desk stay quiet, and ticket content is not posted to Discord or Teams channels. No migration; rebuild `api`. (DTD-290, #141, d158b570)
  VI: Thành viên team nhận thông báo Inbox khi có người tạo ticket Service Desk cho dự án của họ, nên ticket không còn nằm im trong hàng đợi. Ask tạo ngoài Service Desk không báo, và nội dung ticket không được gửi lên kênh Discord hay Teams. Không có migration; build lại `api`. (DTD-290)
- Service Desk is now a page in the sidebar: anyone in the workspace can raise a ticket with attachments for a project that has Service Desk turned on in Project settings, follow its status and reply, while team members work from a Queue tab where they answer, decline, reopen or convert tickets to issues. Settings → Asks is replaced by this page and its old address redirects here; the page offers only enabled projects, so creating an Ask without a project now needs the API. No migration; rebuild `api` and `web`. (DTD-288, #140, dbfec5a3)
  VI: Service Desk nay là một trang ở sidebar: mọi người trong workspace tạo được ticket kèm tệp cho dự án đã bật Service Desk trong Project settings, theo dõi trạng thái và phản hồi, còn thành viên team làm việc ở tab Hàng đợi để trả lời, từ chối, mở lại hoặc chuyển ticket thành Issue. Trang này thay Settings → Asks và địa chỉ cũ tự chuyển sang đây; trang chỉ liệt kê dự án đã bật, nên tạo Ask không gắn dự án nay phải dùng API. Không có migration; build lại `api` và `web`. (DTD-288)
- Service Desk tickets have their own conversation: `GET` and `POST /asks/{id}/messages` are open to the requester, the team and workspace admins, and stay separate from issue comments, which requesters never see. New messages reach both sides in the Inbox, requesters are told within about a minute when their ticket status changes, whichever tool changed the linked issue, and `ticketStatus` gains `waiting_for_you`. Ticket content is not posted to Discord or Teams channels. Inbox links open `/service-desk/{id}`, which arrives with the Service Desk page. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-287, #139, b28ba724)
  VI: Ticket Service Desk có luồng trao đổi riêng: `GET` và `POST /asks/{id}/messages` mở cho người yêu cầu, team và admin workspace, tách khỏi comment của Issue mà người yêu cầu không bao giờ thấy. Tin nhắn mới báo vào Inbox cho cả hai phía, người yêu cầu được báo trong khoảng một phút khi trạng thái ticket đổi, bất kể công cụ nào đổi Issue liên kết, và `ticketStatus` có thêm `waiting_for_you`. Nội dung ticket không được gửi lên kênh Discord hay Teams. Liên kết trong Inbox mở `/service-desk/{id}`, trang này có cùng trang Service Desk. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-287)
- Projects can open a Service Desk through the API: with `serviceDeskEnabled` on, any workspace member can raise an Ask for that project without joining its team, list their own with `GET /asks?scope=mine`, and follow a `ticketStatus` taken from the linked issue without seeing the issue. Every team member can now edit, decline, convert or archive the team's Asks, while requesters outside the team can only reword or archive their own. The switch is off for all projects and has no screen yet. Includes a migration: rebuild `migrate`, `api` and `web`, and run `migrate` before `api`. (DTD-286, #138, 40230c7c)
  VI: Dự án có thể mở Service Desk qua API: khi bật `serviceDeskEnabled`, mọi thành viên workspace tạo được Ask cho dự án đó mà không cần vào team, xem Ask của mình bằng `GET /asks?scope=mine`, và theo dõi `ticketStatus` lấy từ Issue liên kết mà không thấy Issue. Mọi thành viên team nay sửa, từ chối, chuyển và lưu trữ được Ask của team, còn người yêu cầu ngoài team chỉ sửa nội dung hoặc lưu trữ Ask của mình. Công tắc đang tắt cho mọi dự án và chưa có màn hình. Có migration: build lại `migrate`, `api` và `web`, chạy `migrate` trước `api`. (DTD-286)
- Platform access can be managed from the Users page of the /admin console: super admins grant or revoke the Super admin and Admin view only roles, and view-only admins can read the console but change nothing. Every role change is audited. `ADMIN_EMAIL` stays the permanent super admin, and these roles do not open workspace data. Includes a migration: rebuild `migrate`, `api` and `web`. (DTD-283, #137, 7efbcbad)
  VI: Quyền hệ thống được quản lý ngay tại trang Users của console /admin: super admin cấp hoặc thu hồi vai trò Super admin và Admin view only, còn admin chỉ xem đọc được console nhưng không sửa được gì. Mọi thay đổi vai trò đều ghi audit log. `ADMIN_EMAIL` vẫn là super admin cố định, và các vai trò này không mở dữ liệu workspace. Có migration: build lại `migrate`, `api` và `web`. (DTD-283)

- The Approvals page in the sidebar gathers documents in one place: what waits for your decision, what you submitted and what you already handled, with the document and its review panel beside the list and a sidebar count of what waits for you. Rules and document access are unchanged. Deploy API and web together; no migration. (DTD-278, #136, 260af4ac)
  VI: Trang Phê duyệt ở sidebar gom tài liệu vào một chỗ: việc đang chờ bạn quyết định, tài liệu bạn đã gửi và những gì bạn đã xử lý, kèm tài liệu và panel duyệt ngay cạnh danh sách, cùng số việc đang chờ trên sidebar. Quy tắc duyệt và quyền truy cập tài liệu không đổi. Deploy API và web cùng bản; không có migration. (DTD-278)

- Starred projects appear under Projects in the sidebar for one-click access and update as soon as a project is starred or unstarred. `GET /projects` accepts `favorite=true`. Deploy API and web together; no migration. (DTD-279, #135, b8b20a03)
  VI: Dự án đã gắn sao hiển thị ngay dưới mục Projects ở sidebar để mở nhanh và cập nhật ngay khi gắn hoặc bỏ sao. `GET /projects` nhận `favorite=true`. Triển khai API/web cùng bản; không migration.

- Document media keeps its natural height as inline zoom grows the page, with local horizontal scrolling and document panning. Mermaid palettes stay readable in dark mode and browser-wide display settings persist without editing source. Web only; no migration. (DTD-266, #127, 9c6d6500)
  VI: Media tài liệu giữ chiều cao tự nhiên, zoom inline tăng chiều dài trang, cuộn ngang cục bộ và kéo cuộn tài liệu. Palette Mermaid đọc rõ trong dark mode, tùy chọn hiển thị toàn trình duyệt được nhớ mà không sửa nguồn. Chỉ web; không migration.

- Workspace owners and admins can save a display name in General settings; sidebar, switcher and tab titles refresh while URLs and aliases stay unchanged. Failed saves retain the draft. Deploy API and web together; no migration. (DTD-264, #125, 2551af54)
  VI: Owner và admin lưu được tên hiển thị trong General; sidebar, bộ chọn và title tab cập nhật trong khi URL và alias giữ nguyên. Lỗi lưu giữ bản nháp. Triển khai API/web cùng bản; không migration.

- Document readers apply safe Mermaid YAML front matter and expand diagrams, SVGs and raster images inline across the reading area with zoom, pan and collapse controls. Metadata stays out of prose; no migration or API change. (DTD-263, #124, be6c4ca1)
  VI: Trình đọc tài liệu áp dụng YAML front matter Mermaid an toàn và mở rộng sơ đồ, SVG, ảnh raster inline toàn vùng đọc với phóng/thu, kéo và thu gọn. Metadata không hiện trong nội dung; không migration hoặc đổi API.

- New issue descriptions support Rich Text with natural paragraphs and formatting tools, Markdown with Preview, remembered editor mode and source-preserving conversion. Clipboard images and resumable creation remain available. Web only; no migration. (DTD-262, #123, 49e99030)
  VI: Mô tả task mới hỗ trợ soạn trực quan với đoạn văn tự nhiên và công cụ định dạng, Markdown có Xem trước, nhớ chế độ và chuyển đổi giữ nguyên nguồn. Vẫn dán ảnh và tiếp tục lưu sau lỗi. Chỉ đổi web; không migration.

- Hovering or focusing a subtask progress badge opens a scrollable list of direct children with status and links, including loading/error recovery. No migration. (DTD-261, #122, 6732622e)
  VI: Rê chuột hoặc focus badge tiến độ task con mở danh sách con trực tiếp có cuộn, trạng thái và link, kèm tải/lỗi và thử lại. Không migration.

- MCP setup explains approved .crt/CA trust on macOS, Windows and Linux, Node.js PEM settings, restarts, token-free TLS checks and permission troubleshooting before installation. Existing tokens/configurations are unchanged; no migration. (DTD-225, #121, 6810bc87)
  VI: Cài MCP hướng dẫn tin cậy .crt/CA đã phê duyệt trên macOS, Windows, Linux, cấu hình PEM Node.js, khởi động lại, kiểm TLS không gửi token và xử lý lỗi quyền trước khi cài. Token/cấu hình hiện có giữ nguyên; không migration.

- Epic is an issue type for larger goals, independent of workflow status, with the existing subtask tree, filters, saved views, MCP, imports and recurring templates. Apply the Prisma enum migration before API/worker and deploy API/web together; existing Task/Bug records are unchanged. (DTD-253, #120, 08eb0332)
  VI: Epic là loại task cho mục tiêu lớn, độc lập trạng thái workflow, dùng cây task con, bộ lọc, saved view, MCP, import và mẫu lặp lại hiện có. Chạy migration enum Prisma trước API/worker và triển khai API/web cùng bản; Task/Bug cũ giữ nguyên.

- Issue column headers cycle ascending, descending and default order; Shift-click combines up to five criteria across server-paginated results. Long project names use ellipsis and full-name tooltips. API and web must deploy together; no migration. (DTD-256, #119, adff2bb7)
  VI: Header cột task chuyển tăng, giảm và mặc định; Shift+bấm kết hợp tối đa năm tiêu chí trên kết quả phân trang server. Tên dự án dài có dấu ba chấm và tooltip tên đầy đủ. API và web cần triển khai cùng bản; không có migration.

- Manual ordering uses dnd-kit sortable handles with keyboard controls, drag placeholders and motion; sub-issue trees can sort siblings by issue ID or workflow status in either direction. Removes per-row up/down buttons. React order stays synchronized with drag feedback to prevent duplicate rows. Switching sort modes keeps one accessible drag handle per row. No new migration. (DTD-239, #118, b0a1e8d9)
  VI: Thứ tự thủ công dùng handle dnd-kit sortable hỗ trợ bàn phím, placeholder và chuyển động; cây task con sắp xếp anh em theo mã hoặc trạng thái workflow tăng/giảm. Bỏ nút lên/xuống từng hàng. Thứ tự React đồng bộ với phản hồi kéo để tránh trùng hàng; đổi chế độ sort giữ đúng một handle trợ năng mỗi hàng. Không thêm migration.

- Issue search matches identifiers and titles only and retains the main list columns, row sizes, filters and scrolling across All issues, Cycle, My issues and member profiles; quick search also limits issue matches to identifiers/titles. No migration. (DTD-255, #117, f2c75ba0)
  VI: Tìm task chỉ khớp mã và tiêu đề, giữ cột, kích thước hàng, bộ lọc và cuộn của danh sách chính ở All issues, Cycle, My issues và hồ sơ thành viên; tìm nhanh cũng giới hạn task theo mã/tiêu đề. Không có migration.

- Issue rows show a branch icon after the identifier for subtasks, with a full parent-name tooltip on hover or keyboard focus and aligned columns. Web only; no migration. (DTD-259, #116, 6d02a193)
  VI: Dòng task con hiển thị icon nhánh sau mã, tooltip tên cha đầy đủ khi rê chuột hoặc focus bàn phím và giữ các cột thẳng hàng. Chỉ đổi web; không có migration.

- New issue dialogs accept pasted images and a parent issue; uploads attach only after creation, and retries finish the existing issue without creating another one. Web only; no migration. (DTD-254, #115, 59946763)
  VI: Popup tạo task nhận ảnh dán và task cha; chỉ tải ảnh sau khi task được tạo, retry hoàn tất trên task đó mà không tạo thêm task. Chỉ đổi web; không có migration.

- Parent issue pickers keep long names and search fields within the dialog on mobile and desktop, distinguish loading/errors from empty results, cancel stale searches, and retain keyboard selection and full-name tooltips. Web only; no migration. (DTD-257, #114, 332d3fec)
  VI: Hộp chọn task cha giữ tên dài và ô tìm kiếm gọn trong dialog trên mobile và desktop, phân biệt đang tải/lỗi với kết quả rỗng, hủy tìm kiếm cũ và giữ chọn bằng bàn phím cùng tooltip tên đầy đủ. Chỉ đổi web; không có migration.

- Old workspace slugs resolve to their own workspace before fallback selection, preserving the full destination, query and hash even when another membership is first. Web only; no migration. (DTD-260, #113, 69f56507)
  VI: Slug workspace cũ được phân giải về đúng workspace trước khi chọn workspace thay thế, giữ đầy đủ đích, query và hash kể cả khi membership khác đứng đầu. Chỉ đổi web; không có migration.

- Issue Views save reusable filters from workspace and team issue lists, support private/shared views, editing and deletion, and preserve team scope and existing view URLs. Conflicting edits require a reload instead of overwriting another session. Deploy `api` and `web` together; no schema migration. (DTD-250, #108, 16d0bd56)
  VI: Issue Views lưu bộ lọc dùng lại từ danh sách công việc của workspace và team, hỗ trợ riêng tư/chia sẻ, sửa và xóa, đồng thời giữ phạm vi team và URL view hiện có. Chỉnh sửa xung đột yêu cầu tải lại thay vì ghi đè phiên khác. Triển khai `api` và `web` cùng bản; không có migration schema. (DTD-250)

- CI allows 35 minutes for the complete three-browser regression suite, which outgrew the previous 20-minute step budget; all tests and per-test timeouts remain enabled. No runtime or schema change. (#107, 55009dde)
  VI: CI dành 35 phút cho toàn bộ bộ kiểm thử ba trình duyệt đã vượt ngân sách bước 20 phút trước đây; giữ đầy đủ test và thời gian tối đa của từng test. Không đổi hành vi ứng dụng hoặc schema.

- Browser regression checks activate native row dragging with intermediate pointer moves, clean up temporary sub-issues even after timeouts, and locate the current workspace search title. Test-only change; no schema or runtime change. (#107, 55009dde)
  VI: Kiểm thử trình duyệt kích hoạt kéo hàng native bằng các bước di chuyển con trỏ trung gian, dọn sub-issue tạm kể cả khi hết giờ và tìm đúng tiêu đề tìm kiếm workspace hiện tại. Chỉ đổi test; không đổi schema hoặc hành vi ứng dụng.

- Docs supports dragging a document, PDF or folder onto another folder in the same project, with hover expansion, edge scrolling, protected drop targets and a move dialog for conflicts or failed writes. Existing menu and keyboard actions remain available. Web only; no API or schema change. (DTD-226, #107, 55009dde)
  VI: Docs hỗ trợ kéo tài liệu, PDF hoặc thư mục vào thư mục khác trong cùng dự án, tự mở nhánh khi rê giữ, cuộn gần mép, bảo vệ đích thả và dùng hộp di chuyển khi xung đột hoặc lỗi ghi. Giữ các thao tác menu và bàn phím hiện có. Chỉ đổi web; không đổi API hoặc schema. (DTD-226)

- Projects and issues support a saved Manual order with drag handles and keyboard move controls; sub-issues reorder among siblings without changing their parent. Stale edits and affected pagination cursors require a reload. Includes a Prisma migration adding and backfilling manual positions: let migrate complete before api/worker, and deploy api/web together. (DTD-239, #111, 9cd6a9af)
  VI: Dự án và công việc hỗ trợ thứ tự Manual được lưu, có handle kéo-thả và nút di chuyển bằng bàn phím; sub-issue đổi thứ tự cùng cấp mà không đổi parent. Chỉnh sửa và cursor phân trang cũ bị ảnh hưởng yêu cầu tải lại. Có migration Prisma thêm và điền vị trí thủ công: migrate phải hoàn tất trước api/worker, triển khai api/web cùng bản. (DTD-239)

- Issue breadcrumbs show the linked project beside the team even when opened from All issues or a direct link; the project opens its issue list. Web only; no schema change. (DTD-249, #110, 080c4bab)
  VI: Breadcrumb task hiển thị dự án cạnh team kể cả mở từ All issues hoặc link trực tiếp; bấm dự án mở danh sách công việc của dự án. Chỉ đổi web; không đổi schema. (DTD-249)

- Long project lead names stay inside the Lead column, with the full name available on the selector, so Target date remains readable. Web only; no schema change. (DTD-227, #109, 37154a6c)
  VI: Tên Lead dài được giữ trong cột Lead, có thể xem tên đầy đủ trên nút chọn, giúp Target date luôn dễ đọc. Chỉ đổi web; không đổi schema. (DTD-227)

- Browser regression tests follow the current mobile Properties and Bug report flow, restore shared account preferences after failed tests, and wait for the Activity URL before testing reload. Test-only change; no deployment behavior or schema change. (DTD-252, #112, 55d6ae5c)
  VI: Kiểm thử trình duyệt dùng luồng Properties và Bug report mobile hiện tại, khôi phục tùy chọn tài khoản dùng chung sau test lỗi, và đợi URL Activity cập nhật trước khi kiểm tra reload. Chỉ thay test; không đổi hành vi triển khai hay schema. (DTD-252)

- Docs supports moving and deleting documents, PDFs and folders through right-click and accessible action menus. Moves stay inside the project and retain document history and links; deletion archives documents, protects project roots and refuses non-empty folders. Deploy `api` and `web` together; no schema migration. (DTD-224, #106, 1f256fb7)
  VI: Docs hỗ trợ di chuyển và xóa tài liệu, PDF và thư mục qua menu chuột phải và nút thao tác truy cập được bằng bàn phím. Di chuyển trong cùng dự án và giữ lịch sử/liên kết; xóa tài liệu bằng lưu trữ mềm, bảo vệ gốc dự án và từ chối thư mục không rỗng. Triển khai `api` và `web` cùng bản; không có migration schema. (DTD-224)

- MCP agents start and finish a task in one call each: `start_issue` posts the plan, sets the start, target and due dates and estimated effort and moves the task to In Progress; `finish_issue` posts the result, records the actual effort and moves it to Technical Review. Each call writes all of it or nothing, and the default agent workflow now uses them (five steps instead of eight). API only; no schema change; reconnect MCP clients. (DTD-219, #105, b72c94d7)
  VI: Agent MCP bắt đầu và kết thúc task mỗi việc một lời gọi: `start_issue` đăng kế hoạch, đặt ngày bắt đầu, ngày kết thúc, hạn và effort ước tính rồi chuyển task sang In Progress; `finish_issue` đăng kết quả, ghi effort thực tế và chuyển task sang Technical Review. Mỗi lời gọi ghi đủ hoặc không ghi gì, và quy trình agent mặc định nay dùng hai tool này (năm bước thay cho tám). Chỉ đổi API; không đổi schema; kết nối lại client MCP. (DTD-219)

- MCP agents plan a task before working on it: `create_issue` and `update_issue` accept start, target and due dates plus estimated and actual effort in man-days; issue writes return `planningWarnings` (no due date, work started without dates or an estimate, completed without actual effort, dates out of order, overdue) and `get_issue_context` adds a `planning` section. Warnings never block a write, and the default agent workflow now schedules the task first and reports actual against estimated effort. Workspaces with a custom workflow keep their own text. API only; no schema change; reconnect MCP clients to load the new tools and instructions. (DTD-218, #103, 49636d10)
  VI: Agent MCP lập kế hoạch trước khi làm task: `create_issue` và `update_issue` nhận ngày bắt đầu, ngày kết thúc, hạn cùng effort ước tính và thực tế theo man-day; thao tác ghi issue trả `planningWarnings` (thiếu hạn, đã bắt đầu mà thiếu ngày hoặc ước tính, đã xong mà thiếu effort thực tế, ngày sai thứ tự, quá hạn) và `get_issue_context` thêm mục `planning`. Cảnh báo không bao giờ chặn thao tác ghi, và quy trình agent mặc định nay lên lịch task trước rồi báo effort thực tế so với ước tính. Workspace có quy trình riêng giữ nguyên văn bản của mình. Chỉ đổi API; không đổi schema; kết nối lại client MCP để nhận tool và instruction mới. (DTD-218)

- Documents follow a review flow: submitting one notifies the team's leads (or workspace Owners/Admins in the team when it has no lead), a lead can assign team members as reviewers, each reviewer agrees or requests changes with a note (which returns the document to Draft), and only a lead approves once every assigned reviewer agreed; a lead who wrote the document needs another reviewer's agreement. Editing during review clears the agreements. The same rules apply to MCP agents, whose `get_document` now reports approvers and reviewer decisions. Deployment: new migration `document_reviewers`; rebuild `migrate`, `api` and `web`. (DTD-217, #102, c6333ef8)
  VI: Tài liệu có quy trình duyệt: gửi duyệt sẽ thông báo cho lead của team (hoặc Owner/Admin workspace trong team khi team không có lead), lead có thể phân công thành viên team làm reviewer, mỗi reviewer đồng ý hoặc yêu cầu sửa kèm nhận xét (đưa tài liệu về Nháp), và chỉ lead được duyệt khi mọi reviewer được giao đã đồng ý; lead là tác giả cần một reviewer khác đồng ý. Sửa trong lúc duyệt sẽ xoá các lượt đồng ý. Agent MCP theo cùng quy tắc, và `get_document` nay trả người duyệt cuối cùng quyết định của reviewer. Triển khai: migration mới `document_reviewers`; rebuild `migrate`, `api` và `web`. (DTD-217)

- The Related documents section on an issue's Overview has a Link document button for project tasks, opening the same document picker as the Attachments tab, so a task links its FDS/TDS right where the missing-spec warning appears. Unlinking stays in the Attachments tab. Web only; no API or schema change. (DTD-180, #98, 177df81b)
  VI: Mục Tài liệu liên quan ở tab Overview của issue có nút Liên kết tài liệu cho task thuộc dự án, mở cùng hộp chọn tài liệu như tab Attachments, để task liên kết FDS/TDS ngay tại chỗ hiện cảnh báo thiếu đặc tả. Gỡ liên kết vẫn ở tab Attachments. Chỉ đổi web; không đổi API hay schema. (DTD-180)

- MCP agents can attach a local file to an issue: the `create_attachment_upload` tool returns a one-time upload URL, valid for 10 minutes, that the agent posts the file to (for example with curl). The file becomes an issue attachment uploaded by the connection owner, with the same 10 MB limit as the web; access, scopes, the write switch and read-only roles are checked again at upload time. Deployment: set `API_PUBLIC_URL` to the API address agents reach (Compose uses `NEXT_PUBLIC_API_URL`), and allow 10 MB request bodies on that path in the reverse proxy; no schema change. (DTD-214, #97, bfd623e4)
  VI: Agent MCP đính kèm được file trên máy vào issue: tool `create_attachment_upload` trả về URL tải lên dùng một lần, hiệu lực 10 phút, để agent gửi file vào (ví dụ bằng curl). File thành đính kèm của issue với người tải lên là chủ kết nối, cùng giới hạn 10 MB như web; quyền, scope, công tắc ghi và role chỉ đọc được kiểm tra lại lúc tải lên. Triển khai: đặt `API_PUBLIC_URL` là địa chỉ API mà agent truy cập được (Compose lấy theo `NEXT_PUBLIC_API_URL`) và cho phép body 10 MB trên đường dẫn này ở reverse proxy; không đổi schema. (DTD-214)

- Browser tabs are named after the screen and what it shows instead of just "Flowie", for example "DTD-60 | Issue: <issue title> | Flowie", "Flowie - Overview | Flowie", "Backlog - <workspace> | Flowie" or "Audit log - Workspace settings - <workspace> | Flowie", across workspace, project, team, settings, sign-in and invitation pages. An object's name appears only once that page has loaded it, so a slow earlier page never renames the tab, and filters or `?from=project` do not change the title. Shared-link metadata stays "Flowie" so private names are never shown to readers that are not signed in. Web only; no API or schema change. (DTD-149, #95, 90927b9a)
  VI: Tab trình duyệt được đặt tên theo màn hình và nội dung đang hiển thị thay vì chỉ "Flowie", ví dụ "DTD-60 | Issue: <tên issue> | Flowie", "Flowie - Overview | Flowie", "Backlog - <workspace> | Flowie" hoặc "Audit log - Workspace settings - <workspace> | Flowie", trên các trang workspace, dự án, team, settings, đăng nhập và lời mời. Tên đối tượng chỉ hiện khi chính trang đó đã tải xong, nên trang trước tải chậm không bao giờ đổi tên tab, và bộ lọc hay `?from=project` không làm đổi title. Metadata khi chia sẻ link vẫn là "Flowie" để tên riêng tư không bao giờ hiện cho người chưa đăng nhập. Chỉ đổi web; không đổi API hay schema. (DTD-149)

- A read-only workspace admin role: owners and admins can invite a person as, or change a member to, "Admin (read-only)", who sees every admin page in Settings (audit log, operations, integrations, import and export…) but cannot create, change or delete anything in the workspace, through the web, the API or MCP; their own profile, preferences and inbox stay editable. Edit buttons on recurring schedules, SLAs and issue statuses show only to owners and admins. Includes a migration that adds the enum value: rebuild `migrate`, `api` and `web`. (DTD-190, #92, f110e0f4)
  VI: Role quản trị workspace chỉ đọc: owner và admin có thể mời một người với vai trò, hoặc đổi thành viên thành, "Admin (read-only)", người này xem được mọi trang quản trị trong Settings (audit log, operations, integrations, import và export…) nhưng không thể tạo, sửa hay xoá bất cứ thứ gì trong workspace, dù qua web, API hay MCP; hồ sơ, tuỳ chọn và hộp thư của chính họ vẫn sửa được. Nút sửa ở recurring schedule, SLA và trạng thái issue chỉ hiện cho owner và admin. Có migration thêm giá trị enum: build lại `migrate`, `api` và `web`. (DTD-190)

- Workspace URLs use the workspace slug: sign-in, invitations and the workspace switcher open `…/<workspace-slug>/…`, and links by id or by an earlier slug still open the workspace and switch the address bar to the current slug, keeping the path, query and hash. Owners and admins edit the slug in Settings → Workspace with a full URL preview; slugs follow the project slug rules, cannot use Flowie's reserved path names, are unique across all workspaces including earlier slugs, and a taken slug is refused with 409. Saving the icon no longer touches other workspace fields. Includes a migration: rebuild `migrate`, `api` and `web` and deploy `api` and `web` together. (DTD-203, #91, d4affecc)
  VI: URL workspace dùng slug của workspace: đăng nhập, lời mời và đổi workspace mở `…/<slug-workspace>/…`, và link theo id hoặc slug cũ vẫn mở đúng workspace rồi đổi thanh địa chỉ sang slug hiện tại, giữ nguyên path, query và hash. Owner và admin sửa slug trong Settings → Workspace kèm xem trước URL đầy đủ; slug theo cùng quy tắc với slug dự án, không được trùng tên path dành riêng của Flowie, duy nhất trên mọi workspace kể cả slug cũ, và slug đã có chủ bị từ chối với 409. Lưu icon không còn động tới các trường khác của workspace. Có migration: build lại `migrate`, `api` và `web`, deploy `api` và `web` cùng lúc. (DTD-203)

- Projects have readable URL slugs: project pages open at `…/project/<slug>/<tab>`, Project settings edits the slug with a full URL preview, and links by id or by an earlier slug still open the project and switch the address bar to the current slug, keeping the path, query and hash. Slugs use 1–63 characters of a-z, 0-9 and single hyphens, are unique per workspace including earlier slugs, and are never rewritten; a taken slug is refused with 409, also when two people save at once. Existing projects get a slug from their identifier (for example `FL` → `fl`). Includes a migration: rebuild `migrate`, `api` and `web` and deploy `api` and `web` together. Workspace URL slugs follow in a later phase. (DTD-140, #90, 113c4f43)
  VI: Dự án có slug URL dễ đọc: trang dự án mở bằng `…/project/<slug>/<tab>`, Project settings sửa được slug kèm xem trước URL đầy đủ, và link theo id hoặc slug cũ vẫn mở đúng dự án rồi đổi thanh địa chỉ sang slug hiện tại, giữ nguyên path, query và hash. Slug gồm 1–63 ký tự a-z, 0-9 và dấu gạch nối đơn, duy nhất trong workspace kể cả slug cũ, và không bao giờ bị tự sửa; slug đã có chủ bị từ chối với 409, kể cả khi hai người lưu cùng lúc. Dự án hiện có nhận slug từ identifier (ví dụ `FL` → `fl`). Có migration: build lại `migrate`, `api` và `web`, deploy `api` và `web` cùng lúc. Slug URL của workspace sẽ làm ở giai đoạn sau. (DTD-140)

- Tasks and Docs documents link both ways: a task's Attachments tab has Linked documents with Link document, which picks a Markdown document from the project's Docs by title, and each link can be removed; Overview's related documents update at once. A document's preview and page list the tasks it is linked to. A task links many documents and a document many tasks; both sides must be readable and a team's document links only to that team's tasks. Uses the existing link table, so there is no migration; deploy `api` and `web` together. (DTD-180, #89, 8cd8f9d8)
  VI: Task và tài liệu Docs liên kết hai chiều: tab Attachments của task có mục Tài liệu liên kết với nút Liên kết tài liệu, chọn một tài liệu Markdown trong Docs của dự án theo tiêu đề, và gỡ được từng liên kết; mục tài liệu liên quan ở Overview cập nhật ngay. Khung xem và trang tài liệu liệt kê các task đang liên kết. Một task liên kết nhiều tài liệu và một tài liệu nhiều task; phải đọc được cả hai phía và tài liệu của một team chỉ liên kết với task của team đó. Dùng bảng liên kết sẵn có nên không có migration; deploy `api` và `web` cùng lúc. (DTD-180)

- MCP logs has its own page under Settings → AI & integrations: a dashboard of MCP tool calls for the last 24 hours, 7 days or 30 days (calls, failed, denied, p95 time, by tool and by connection) above the call log, which filters by connection, tool and outcome. Opening a call shows who made it, through which connection, which tool, the status code, error and message, and for failed or denied calls the arguments sent, with credential fields, bearer tokens and URL paths masked and long values cut. Calls to unknown tools are logged too. Administrators see every connection, members only their own; tokens and Authorization headers are never logged, and a failed log write never changes the client's result. The AI connections page links to MCP logs in place of its Recent activity list. No schema change; rebuild `api` and `web`. (DTD-164, #87, cf3693ad)
  VI: MCP logs có trang riêng trong Settings → AI & integrations: dashboard lời gọi tool MCP trong 24 giờ, 7 ngày hoặc 30 ngày (số lời gọi, lỗi, bị từ chối, thời gian p95, theo tool và theo kết nối) phía trên danh sách log, lọc được theo kết nối, tool và kết quả. Mở một lời gọi thấy ai gọi, qua kết nối nào, tool gì, mã lỗi, loại lỗi và thông báo lỗi, và với lời gọi lỗi hoặc bị từ chối thì thấy tham số đã gửi, trong đó trường thông tin xác thực, bearer token và đường dẫn URL bị che, giá trị dài bị cắt. Lời gọi tới tool không tồn tại cũng được ghi. Quản trị viên thấy mọi kết nối, thành viên chỉ thấy kết nối của mình; token và header Authorization không bao giờ được ghi, và ghi log lỗi không bao giờ làm thay đổi kết quả trả cho client. Trang AI connections có link tới MCP logs thay cho danh sách Recent activity. Không đổi schema; build lại `api` và `web`. (DTD-164)

- Being assigned an issue or mentioned in a comment now also reaches Microsoft Teams: Flowie posts a card to the project's Teams channel (or the workspace channel when the project has none) that @mentions the person, identified by the Microsoft account they sign in with. Settings → Notifications has a Microsoft Teams switch, on by default; Inbox and email work as before. Editing a comment notifies only people newly mentioned, never people already mentioned. Nobody is notified about their own action, and people who cannot open the issue get nothing on any channel. Every issue also has a Reporter in Properties, the creator by default, which can be changed in the web app, REST and MCP (`reporterId`). A Prisma migration adds `issues.reporter_id` and `notification_preferences.teams_enabled`; rebuild `migrate`, `api` and `web` together. (DTD-171, #86, 0f386957)
  VI: Khi được giao issue hoặc được mention trong comment, người dùng giờ nhận thêm thông báo trên Microsoft Teams: Flowie đăng card lên kênh Teams của dự án (hoặc kênh của workspace nếu dự án không có kênh) và @mention người đó, nhận diện bằng tài khoản Microsoft họ dùng để đăng nhập. Settings → Notifications có công tắc Microsoft Teams, mặc định bật; Inbox và email giữ nguyên. Sửa comment chỉ báo cho người mới được mention, không báo lại người đã được mention. Không ai nhận thông báo về hành động của chính mình, và người không mở được issue không nhận gì ở bất kỳ kênh nào. Mỗi issue có thêm Reporter trong Properties, mặc định là người tạo, đổi được trên web, REST và MCP (`reporterId`). Migration Prisma thêm `issues.reporter_id` và `notification_preferences.teams_enabled`; build lại `migrate`, `api` và `web` cùng lúc. (DTD-171)

- News → Manage sources has a Test webhook button for every group with a saved Microsoft Teams webhook: it posts the same test card as Settings → Integrations to that stored webhook only and shows whether Teams accepted it. Owners and Admins only; no schema change. (DTD-143, #85, 44b2bcb9)
  VI: News → Manage sources có nút Gửi thử cho mỗi nhóm đã lưu webhook Microsoft Teams: nút gửi cùng thẻ thử như Settings → Integrations, chỉ tới webhook đã lưu đó, và cho biết Teams có nhận hay không. Chỉ Owner và Admin dùng được; không đổi schema. (DTD-143)

- News now ranks and summarises items with the workspace's AI provider (the one enabled in Agent personalization): after each fetch every new item gets a Critical, High, Medium or Low risk label with a 0-100 score and a one- or two-sentence Vietnamese summary, and each group gets a short Vietnamese digest of its latest items. The News page shows the digest, the risk badges and the AI summaries, sorts by Newest or Highest risk and filters by risk level; each group's Teams card opens with the digest and lists items by risk with their label and summary. Feed text is passed to the AI only as untrusted data, the AI gets no tools, and its output is checked and turned into plain text before it is stored or posted. Without a provider, or when the AI fails, News works as before and unlabelled items are retried on the next fetch. A Prisma migration adds nullable AI columns to `news_items` and `news_categories`; rebuild `migrate`, `api` and `web` together. (DTD-181, #84, 26754607)
  VI: News giờ dùng provider AI của workspace (provider đang bật ở Agent personalization) để xếp hạng và tóm tắt tin: sau mỗi lần lấy tin, mỗi tin mới được gán nhãn rủi ro Critical, High, Medium hoặc Low kèm điểm 0-100 và tóm tắt tiếng Việt một đến hai câu, mỗi nhóm có một bản tin ngắn tiếng Việt về các tin mới nhất. Trang News hiển thị bản tin, badge rủi ro và tóm tắt AI, sắp xếp theo Mới nhất hoặc Rủi ro cao nhất và lọc theo mức rủi ro; card Teams của mỗi nhóm mở đầu bằng bản tin và liệt kê tin theo rủi ro kèm nhãn và tóm tắt. Nội dung feed chỉ được đưa cho AI như dữ liệu không tin cậy, AI không có công cụ nào, kết quả được kiểm tra và chuyển thành văn bản thuần trước khi lưu hay gửi. Không có provider hoặc AI lỗi thì News chạy như cũ và tin chưa có nhãn được thử lại ở lần lấy tin sau. Migration Prisma thêm các cột AI (cho phép null) vào `news_items` và `news_categories`; build lại `migrate`, `api` và `web` cùng lúc. (DTD-181)

- News in the sidebar collects security news every day at 06:30 Vietnam time from RSS/Atom feeds and lists it by group (Security first) for every workspace member, newest first, linking to the original article. Owners and Admins add groups and feeds, give each group its own Microsoft Teams Workflows webhook so it receives one card of new items per run, and can press Fetch now. Feeds are read only over HTTPS from a fixed allowlist of news hosts (CISA, The Hacker News, BleepingComputer, Krebs on Security, SecurityWeek, Dark Reading), titles and summaries are stored as plain text, and each article is stored once. Existing workspaces start with a Security group and three feeds. A Prisma migration adds `news_categories`, `news_sources` and `news_items`, which the `migrate` service applies before `api` starts; rebuild `migrate`, `api` and `web` together. (DTD-143, #83, abbc3e5e)
  VI: Mục News trên sidebar tự tổng hợp tin bảo mật mỗi ngày lúc 06:30 giờ Việt Nam từ các feed RSS/Atom và hiển thị theo nhóm (ưu tiên Security) cho mọi thành viên workspace, tin mới nhất trước, có link tới bài gốc. Owner và Admin thêm nhóm và feed, đặt cho mỗi nhóm một webhook Microsoft Teams Workflows riêng để nhận một card tin mới mỗi lần chạy, và có nút Lấy tin ngay. Feed chỉ được đọc qua HTTPS từ danh sách host tin cố định (CISA, The Hacker News, BleepingComputer, Krebs on Security, SecurityWeek, Dark Reading), tiêu đề và tóm tắt được lưu dạng văn bản thuần, mỗi bài chỉ lưu một lần. Workspace hiện có được tạo sẵn nhóm Security với ba feed. Migration Prisma thêm bảng `news_categories`, `news_sources` và `news_items`, service `migrate` áp dụng trước khi `api` khởi động; build lại `migrate`, `api` và `web` cùng lúc. (DTD-143)

- The Sub-issues tree on an issue page changes a sub-issue's status in place: click the status icon of any row, at any level, and pick one of the team's statuses. It saves immediately, updates the parent row's progress, and records activity like a change made on the sub-issue itself; a parent's status never changes on its own. Web only; no API or schema change. (DTD-138, #82, 35a5f62b)
  VI: Cây Sub-issues trên trang issue đổi được trạng thái của sub-issue ngay tại chỗ: bấm icon trạng thái của bất kỳ hàng nào, ở mọi cấp, rồi chọn một trạng thái của team. Thay đổi được lưu ngay, cập nhật tiến độ của hàng cha và ghi activity như khi đổi trên chính sub-issue đó; trạng thái của issue cha không tự đổi theo. Chỉ thay đổi web; không đổi API hay schema. (DTD-138)

- SharePoint can also receive project attachments: with the new Copy attachments switch in Settings → Integrations → SharePoint (off by default), files attached to a project's issues, comments, project updates and Docs folders are copied one-way to the project's SharePoint folder, under `Attachments/<issue key> <issue title>/`, `Attachments/_Project/` or the numbered Docs folders. Existing files are copied too (about 20 per minute), each file is copied once, same-name files get ` (2)`, ` (3)`…, and nothing is ever deleted on SharePoint; the issue Attachments tab links each copy or shows the copy error. It reuses the existing app registration (Sites.Selected), so IT has nothing new to grant. Anyone who can open the SharePoint folder sees every attachment of that project. A Prisma migration adds `attachment_publications` and `sharepoint_connections.publish_attachments`, which the `migrate` service applies before `api` starts; rebuild `migrate`, `api` and `web` together. (DTD-137, #81, a7b4d1d7)
  VI: SharePoint nhận được cả file đính kèm của dự án: với công tắc mới Copy attachments ở Settings → Integrations → SharePoint (mặc định tắt), file đính kèm trong issue, bình luận, project update và thư mục Docs của dự án được sao chép một chiều lên thư mục SharePoint của dự án, vào `Attachments/<mã issue> <tiêu đề issue>/`, `Attachments/_Project/` hoặc các thư mục Docs có số. File cũ cũng được sao chép (khoảng 20 file mỗi phút), mỗi file chỉ sao chép một lần, file trùng tên được thêm ` (2)`, ` (3)`…, và không bao giờ xóa gì trên SharePoint; tab Attachments của issue có link tới bản sao hoặc hiện lỗi sao chép. Dùng lại app registration sẵn có (Sites.Selected), IT không phải cấp thêm quyền. Ai mở được thư mục SharePoint sẽ thấy mọi file đính kèm của dự án đó. Migration Prisma thêm bảng `attachment_publications` và cột `sharepoint_connections.publish_attachments`, service `migrate` áp dụng trước khi `api` khởi động; build lại `migrate`, `api` và `web` cùng lúc. (DTD-137)

- Settings → Integrations → AI connections (MCP) installs a client with one step: pick macOS or Windows and Claude Code, Codex, Cursor, VS Code or Antigravity, then copy one ready-to-run command (Claude Code, Codex) or click Add to Cursor / Add to VS Code. Right after a connection is created, the token is already filled in, so no environment variable or manual config editing is needed; running a command again replaces the old `flowie` server. Antigravity gets a ready config to paste. Commands and links are built in the browser; nothing is downloaded and no API or schema changes. Claude Desktop is not supported yet. (DTD-119, #79, a6f307cf)
  VI: Settings → Integrations → AI connections (MCP) cài client chỉ trong một bước: chọn macOS hoặc Windows và Claude Code, Codex, Cursor, VS Code hoặc Antigravity, rồi copy một lệnh chạy ngay (Claude Code, Codex) hoặc bấm Add to Cursor / Add to VS Code. Ngay sau khi tạo kết nối, token đã được điền sẵn, nên không cần đặt biến môi trường hay sửa file cấu hình bằng tay; chạy lại lệnh sẽ thay server `flowie` cũ. Antigravity có sẵn cấu hình để dán. Lệnh và link được tạo trên trình duyệt; không tải file nào về, không đổi API hay schema. Chưa hỗ trợ Claude Desktop. (DTD-119)

- Agent answers open questions about progress, workload and project status, and writes detailed leadership reports (Overview, Project status table, Overdue work, Workload, Risks, Recommendations), from the workspace data the asker can see; Agent replies now render as Markdown. Owners or Admins enable it by installing the new "Progress Q&A and reports" tool in Agent personalization; it needs an active AI provider. Fixed reports and issue/project planning are unchanged. Project Activity → Write with Agent now always states how many issues are overdue and ends updates with recommendations, using overdue, stale, unassigned and last-7-days completion data. No schema change. (DTD-136, #77, f92bde87)
  VI: Agent trả lời câu hỏi mở về tiến độ, workload và tình hình dự án, và viết báo cáo chi tiết cho lãnh đạo (Tổng quan, bảng Tình hình từng dự án, Công việc trễ hạn, Workload, Rủi ro, Khuyến nghị) từ dữ liệu workspace người hỏi được xem; tin nhắn Agent hiển thị Markdown. Owner hoặc Admin bật tính năng bằng cách cài tool mới "Progress Q&A and reports" trong Agent personalization; cần provider AI đang bật. Báo cáo cố định và luồng lập kế hoạch issue/dự án không đổi. Project Activity → Write with Agent luôn nêu số issue đang trễ và kết thúc bản cập nhật bằng khuyến nghị, dựa trên số liệu issue trễ, treo lâu, chưa gán và hoàn thành 7 ngày qua. Không đổi schema. (DTD-136)

- The workspace dashboard has an "Include sub-issues" checkbox next to the period buttons; unchecking it removes issues that have a parent from every card, chart and the day's activity at once, while their parent issues stay counted. It is checked by default, survives period and project changes, and Reset turns it back on. Web only; the API already accepted the filter. (DTD-133, #76, 0394f55b)
  VI: Dashboard workspace có ô "Include sub-issues" cạnh các nút chọn kỳ; bỏ chọn sẽ loại ngay các issue có issue cha khỏi mọi thẻ, biểu đồ và hoạt động trong ngày, issue cha vẫn được tính. Mặc định được chọn, giữ nguyên khi đổi kỳ hoặc dự án, nút Reset bật lại. Chỉ thay đổi web; API đã hỗ trợ bộ lọc này. (DTD-133)

- Workspace Owners and Admins can edit the task workflow that AI clients receive when they connect over MCP, under Settings → Integrations → AI connections (MCP) → Agent instructions, and reset it to the built-in default; clients pick up a change when they reconnect. The safety line telling agents to treat Flowie content as data is always sent first and cannot be edited; the workflow is plain text up to 20,000 characters, and each save or reset is audited (`mcp.instructions.updated` / `mcp.instructions.reset`). The API adds `GET`/`PUT /api/v1/mcp/instructions`; a Prisma migration adds the nullable `workspaces.mcp_instructions` column (existing workspaces keep the default), which the `migrate` service applies before `api` starts; deploy `api` and `web` together. (DTD-118, #73, 54b95813)
  VI: Owner và Admin của workspace sửa được quy trình xử lý task mà AI client nhận khi kết nối qua MCP, tại Settings → Integrations → AI connections (MCP) → Agent instructions, và đặt lại về bản mặc định có sẵn; client nhận thay đổi khi kết nối lại. Câu an toàn yêu cầu agent coi nội dung Flowie là dữ liệu luôn được gửi trước và không sửa được; quy trình là văn bản thuần tối đa 20.000 ký tự, mỗi lần lưu hoặc đặt lại đều được ghi audit (`mcp.instructions.updated` / `mcp.instructions.reset`). API thêm `GET`/`PUT /api/v1/mcp/instructions`; migration Prisma thêm cột `workspaces.mcp_instructions` cho phép NULL (workspace hiện có giữ bản mặc định), service `migrate` áp dụng trước khi `api` khởi động; deploy `api` và `web` cùng lúc. (DTD-118)

- Project Docs folders are numbered with a two-digit prefix ("00 · Tổng quan", "01 · Turn Around", …, "99 · Vận hành"), and SharePoint publishing uses the same numbered folder names. New folders in a project tree take the next free number, the New folder dialog has a Number field, and an Edit folder button renames or renumbers the selected folder (numbers are unique per parent). A Prisma migration adds `document_folders.number`, splits names typed as "NN · name", numbers the remaining project folders 01, 02 … in their current order, and queues every published document for one re-upload under the numbered path; the old unnumbered files stay on SharePoint and must be cleaned up by hand. The `migrate` service applies it before `api` starts; deploy `api` and `web` together. (DTD-67, #70, e96eb76a)
  VI: Thư mục trong Docs dự án được đánh số hai chữ số ("00 · Tổng quan", "01 · Turn Around", …, "99 · Vận hành"), và phát hành SharePoint dùng cùng tên thư mục có số. Thư mục mới trong cây dự án nhận số trống kế tiếp, hộp thoại New folder có ô Số, và nút Edit folder đổi tên hoặc số của thư mục đang chọn (số không trùng trong cùng thư mục cha). Migration Prisma thêm `document_folders.number`, tách các tên gõ dạng "NN · tên", đánh số 01, 02 … cho các thư mục dự án còn lại theo thứ tự hiện tại, và đưa mọi tài liệu đã phát hành vào hàng chờ tải lại một lần theo đường dẫn có số; các file cũ không số vẫn nằm trên SharePoint và cần dọn thủ công. Service `migrate` áp dụng trước khi `api` khởi động; deploy `api` và `web` cùng lúc. (DTD-67)

- The dashboard has an "Issues by member" chart that splits the filtered issues (for example one project) by assignee into To do, In progress and Done, with effort in the tooltip; it shows the top ten members plus Unassigned and counts only issues the viewer can read. Each team in the sidebar now has a Members item, and on the Teams page the name and members of a joined team link to its overview and Members page. `POST /reports/dashboard` adds `memberGroups` and `memberCount`; no schema change. (DTD-66, #69, de3393fb)
  VI: Dashboard có biểu đồ "Issues by member" chia các issue đang lọc (ví dụ một dự án) theo người được giao thành Chưa làm, Đang làm và Hoàn tất, tooltip hiện công sức; hiển thị mười thành viên nhiều việc nhất cùng nhóm Chưa giao và chỉ tính issue người xem đọc được. Mỗi team trong sidebar có thêm mục Members, và trên trang Teams tên cùng danh sách thành viên của team đã tham gia mở trang Overview và Members của team. `POST /reports/dashboard` thêm `memberGroups` và `memberCount`; không đổi schema. (DTD-66)

- A Search… box at the top of the sidebar opens the command palette (also ⌘K / Ctrl+K), which now lists matching issues (by ID or title), projects and Settings pages as you type and opens the one you pick; members do not see admin-only Settings pages, and "Search workspace" still opens the full server search. No API or schema change. (DTD-62, #68, 0da43c8e)
  VI: Ô Search… ở đầu sidebar mở command palette (hoặc ⌘K / Ctrl+K); palette nay hiện issue (theo mã hoặc tiêu đề), dự án và trang Settings khớp với chữ đang gõ và mở mục được chọn; thành viên không thấy trang Settings chỉ dành cho admin, và "Search workspace" vẫn mở trang tìm kiếm đầy đủ phía server. Không đổi API hay schema. (DTD-62)

- Sub-issues on the issue page show the whole tree: every level is indented with its own expand/collapse arrow (plus Expand all / Collapse all), each row shows status, completed/total direct sub-issues, due date and assignee, and the due date and assignee can be changed in place. Issue lists show a completed/total chip on issues that have sub-issues. Archiving an issue that has sub-issues offers an opt-in "also archive them" checkbox that archives every level in one step (they stay restorable from Archive). The API adds `descendants=true` to `GET /issues/{id}/sub-issues`, `includeSubIssues=true` to `DELETE /issues/{id}`, and `subIssueCount`/`completedSubIssueCount` on issues; no schema change. (DTD-48, #67, f31d0829)
  VI: Sub-issues ở trang issue hiển thị toàn bộ cây: mỗi cấp thụt lề với nút mở/thu riêng (kèm Expand all / Collapse all), mỗi hàng có trạng thái, số sub-issue trực tiếp hoàn thành/tổng, due date và assignee, và có thể đổi due date, assignee ngay tại chỗ. Danh sách issue hiện chip hoàn thành/tổng trên issue có sub-issue. Khi archive issue có sub-issue có ô chọn "archive luôn các sub-issue" (không bật sẵn) để archive mọi cấp trong một bước (vẫn khôi phục được ở Archive). API thêm `descendants=true` cho `GET /issues/{id}/sub-issues`, `includeSubIssues=true` cho `DELETE /issues/{id}`, và `subIssueCount`/`completedSubIssueCount` trên issue; không đổi schema. (DTD-48)

- Existing issues can be organised into sub-issue trees: "Add existing" under Sub-issues picks an issue by ID or title (and asks before moving one that already has another parent), the issue page shows "Sub-issue of …" with Set, Change and Remove parent, both timelines open A → B → C trees level by level and keep issues whose parent is outside the list, and the Sub-issues count now counts completed direct children. The API and MCP `update_issue` accept `parentIssueId` (null removes it) and reject self, descendant, other-team, archived or out-of-scope parents; moving an issue keeps its own sub-issues and records "Parent: old → new" in activity. Adds a Prisma migration with a trigger that blocks parent cycles; the `migrate` service applies it before `api` starts; deploy `api` and `web` together. (DTD-61, #66, 10380d9d)
  VI: Có thể sắp xếp issue có sẵn thành cây sub-issue: "Add existing" trong Sub-issues chọn issue theo mã hoặc tiêu đề (và hỏi trước khi chuyển issue đang có cha khác), trang issue hiển thị "Sub-issue of …" với Set, Change và Remove parent, hai timeline mở cây A → B → C theo từng cấp và vẫn hiện issue có cha nằm ngoài danh sách, và bộ đếm Sub-issues nay đếm đúng con trực tiếp đã hoàn thành. API và MCP `update_issue` nhận `parentIssueId` (null để gỡ) và từ chối cha là chính nó, hậu duệ, khác team, đã archive hoặc ngoài scope; chuyển cha giữ nguyên các sub-issue của issue đó và ghi "Parent: cũ → mới" vào activity. Thêm migration Prisma với trigger chặn chu trình cha–con; service `migrate` áp dụng trước khi `api` khởi động; deploy `api` và `web` cùng lúc. (DTD-61)

- Projects can be renamed and given an icon (emoji or short symbol) from the "…" menu → Project settings, or by clicking the name or icon on Overview; the new name and icon show in the header, Overview and project lists, an empty name is rejected, and success or failure shows a toast. Adds the nullable `projects.icon` column through a Prisma migration (existing projects keep the default folder icon); deploy `api` and `web` together. (DTD-33, #65, c7a5cbb3)
  VI: Dự án có thể đổi tên và đặt icon (emoji hoặc ký hiệu ngắn) từ menu "…" → Project settings, hoặc bấm vào tên hay icon ở Overview; tên và icon mới hiển thị ở header, Overview và danh sách dự án, tên rỗng bị từ chối, và có toast báo thành công hoặc thất bại. Thêm cột `projects.icon` (cho phép null) qua migration Prisma (dự án cũ giữ biểu tượng thư mục mặc định); deploy `api` và `web` cùng lúc. (DTD-33)

- Grouped issue lists (Display → grouping by project, assignee, status or priority) collapse and expand a group when you click anywhere on its header row, or press Enter/Space on it; the arrow shows the state and the "+" button still creates an issue in the group. Board view is unchanged and collapsed groups reopen on reload. (DTD-68, #62, df494f28)
  VI: Danh sách task theo nhóm (Display → nhóm theo dự án, người phụ trách, trạng thái hoặc độ ưu tiên) thu gọn và mở rộng một nhóm khi bấm vào bất kỳ đâu trên dòng tiêu đề nhóm, hoặc nhấn Enter/Space; mũi tên cho biết trạng thái và nút "+" vẫn tạo task trong nhóm. Chế độ Board không đổi và nhóm đã thu gọn sẽ mở lại khi tải lại trang. (DTD-68)

- Settings → Integrations → AI connections: an MCP connection's owner can edit its name, permissions, teams and projects (for example to add a new project) without a new token, and each edit is audited; Recent activity loads 20 events at a time with Load more, readable labels, the connection name, relative times and filters by connection and by outcome so failed or denied calls stand out; External coding agent configuration lists each project's repositories, supports several repositories per project, and lets admins edit or remove them. No schema change; deploy `api` and `web` together because the activity list reads a new API response. (DTD-64, #60, b19c3624)
  VI: Settings → Integrations → AI connections: chủ kết nối MCP sửa được tên, quyền, nhóm và dự án (ví dụ thêm dự án mới) mà không cần token mới, mỗi lần sửa đều ghi audit; Recent activity tải 20 sự kiện mỗi lần kèm Tải thêm, nhãn dễ đọc, tên kết nối, thời gian tương đối và bộ lọc theo kết nối và theo kết quả để lời gọi lỗi hoặc bị từ chối nổi bật; External coding agent configuration liệt kê repository của từng dự án, hỗ trợ nhiều repository cho một dự án và cho quản trị viên sửa hoặc xoá. Không đổi schema; deploy `api` và `web` cùng lúc vì danh sách hoạt động đọc response API mới. (DTD-64)

- The task Attachments tab shows files as cards (image thumbnails, type icons, size and date) and adds **New**, which opens a Markdown editor and saves the text as a `.md` attachment; clicking a `.md` card shows it rendered, with a download link. (DTD-55, #58, 3293dd8d)
  VI: Tab Tệp đính kèm của task hiển thị tệp dạng thẻ (thumbnail ảnh, icon theo loại, dung lượng và ngày) và có nút **Mới** mở trình soạn Markdown để lưu nội dung thành tệp `.md` đính kèm; bấm vào thẻ `.md` để xem nội dung đã hiển thị, kèm link tải xuống. (DTD-55)

- Project documents have approved releases (v1, v2 …): the Docs preview replaces the status picker with Submit for review, Return to draft and Approve (with a confirm naming the release), shows the latest release beside the title, and lets you read any earlier release as approved. Only Approve creates a release, editing an approved document returns it to Draft, and agents can no longer approve through MCP. SharePoint receives the approved text, not the draft: `<title>.md` holds the latest release and `_versions/<title>_vN.md` keeps each one, both with a front matter naming the version, approver and time. Adds `document_releases`, `document_publications.release` and two triggers through a Prisma migration; documents approved before this become v1 and are uploaded once more in the new layout. Deploy `api` and `web` together. (DTD-58, #54, fdd872a1)
  VI: Tài liệu dự án có phiên bản phát hành (v1, v2 …): khung xem trước Docs thay ô chọn trạng thái bằng các nút Gửi duyệt, Trả về nháp và Duyệt (có bước xác nhận ghi rõ phiên bản), hiện phiên bản mới nhất cạnh tiêu đề và cho đọc lại mọi phiên bản trước đúng như lúc duyệt. Chỉ Duyệt mới tạo phiên bản, sửa tài liệu đã duyệt sẽ đưa nó về Nháp, và agent không còn duyệt được qua MCP. SharePoint nhận nội dung đã duyệt, không phải bản nháp: `<tiêu đề>.md` là phiên bản mới nhất và `_versions/<tiêu đề>_vN.md` lưu từng phiên bản, cả hai có front matter ghi version, người duyệt và thời điểm. Thêm `document_releases`, `document_publications.release` và hai trigger qua migration Prisma; tài liệu đã duyệt trước đó trở thành v1 và được tải lại một lần theo cách lưu mới. Deploy `api` và `web` cùng lúc. (DTD-58)

- The Markdown document editor has a formatting toolbar (bold, italic, strikethrough, headings H1–H6, bulleted and numbered lists, inline code and code blocks, quote, link, image), a monospace source pane with line numbers, and Edit / Split / Preview modes. Toolbar edits apply to the selection, press again to remove, and undo with Ctrl/Cmd+Z. (DTD-54, #51, 78d8534e)
  VI: Trình soạn tài liệu Markdown có thanh công cụ định dạng (đậm, nghiêng, gạch ngang, heading H1–H6, danh sách và danh sách số, code inline và khối code, trích dẫn, liên kết, ảnh), ô soạn font monospace có số dòng, và ba chế độ Sửa / Chia đôi / Xem trước. Thao tác định dạng áp lên vùng đang chọn, bấm lại để bỏ, và hoàn tác được bằng Ctrl/Cmd+Z. (DTD-54)

- Approved project documents publish to SharePoint as Markdown (one-way): a workspace admin connects an Entra app with Sites.Selected in Settings → Integrations → SharePoint, each project sets its SharePoint folder in Docs → SharePoint (with a connection test), and every new approved version is uploaded to `<folder>/<module>/<feature>/<title>.md` within about a minute. The document preview shows the published version with a link or the last error, and failures retry with backoff. Help and `docs/sharepoint-publishing.md` describe the IT setup. Adds `projects.sharepoint_folder_url`, `sharepoint_connections` and `document_publications` through a Prisma migration; the server needs `SCM_SECRETS_ENCRYPTION_KEY` and HTTPS access to login.microsoftonline.com and graph.microsoft.com. (DTD-19, #49, 9710c673)
  VI: Tài liệu dự án đã duyệt được phát hành lên SharePoint dưới dạng Markdown (một chiều): quản trị viên workspace kết nối app Entra có quyền Sites.Selected tại Settings → Integrations → SharePoint, mỗi dự án gán thư mục SharePoint ở Docs → SharePoint (có nút kiểm tra kết nối), và mỗi version đã duyệt mới được tải lên `<thư mục>/<module>/<tính năng>/<tiêu đề>.md` trong khoảng một phút. Khung xem trước hiển thị version đã phát hành kèm link hoặc lỗi gần nhất, lỗi được tự thử lại với thời gian chờ tăng dần. Trợ giúp và `docs/sharepoint-publishing.md` hướng dẫn phần IT cần cấu hình. Thêm `projects.sharepoint_folder_url`, `sharepoint_connections` và `document_publications` qua migration Prisma; server cần `SCM_SECRETS_ENCRYPTION_KEY` và truy cập HTTPS tới login.microsoftonline.com và graph.microsoft.com. (DTD-19)

- Agents keep each feature's FDS and TDS current: the MCP tools `get_feature_docs` and `upsert_feature_doc` read a task's feature documents and create or update them in the project's Docs tree, adding a change-log row and linking them to the task. The local runner drafts FDS/TDS in its review step and saves them before coding, and a task without FDS/TDS shows a warning under Related documents; nothing is blocked yet. Runner connections need the `documents:write` scope to save documents. (DTD-19, #48, 82e5421e)
  VI: Agent giữ FDS và TDS của từng tính năng luôn cập nhật: tool MCP `get_feature_docs` và `upsert_feature_doc` đọc tài liệu tính năng của task và tạo hoặc cập nhật chúng trong cây Docs của dự án, thêm một dòng lịch sử thay đổi và liên kết với task. Runner local soạn FDS/TDS ở bước review và lưu trước khi code, và task chưa có FDS/TDS hiện cảnh báo trong mục Tài liệu liên quan; chưa chặn gì. Kết nối của runner cần scope `documents:write` để lưu tài liệu. (DTD-19)

- The Docs tab shows the document tree on the left and a preview on the right: clicking a document renders it read-only with its table of contents and Mermaid diagrams, and Edit opens the editor. Folders accept PDF uploads (up to 10 MB), which preview in the browser's PDF viewer and can be opened in a new tab or downloaded. A Docs entry in the sidebar opens the same view for any project chosen at the top. Deploy the API with the web build: an older API rejects folder uploads. (DTD-19, #47, bbd1a650)
  VI: Tab Docs hiển thị cây tài liệu bên trái và khung xem trước bên phải: bấm vào tài liệu để xem chỉ đọc kèm mục lục và sơ đồ Mermaid, nút Sửa mở editor. Thư mục nhận file PDF tải lên (tối đa 10 MB), xem bằng trình xem PDF của trình duyệt, mở tab mới hoặc tải xuống được. Mục Tài liệu trên sidebar mở cùng giao diện cho dự án chọn ở phía trên. Deploy API cùng bản web: API cũ từ chối tải file vào thư mục. (DTD-19)

- Help → Feature guide has a "Project Docs" topic: how to create the standard structure, module and feature folders, FDS/TDS documents from templates, document types and review statuses, Mermaid diagrams, search and linked documents. (DTD-19, #46, 497d61e2)
  VI: Trợ giúp → Hướng dẫn chức năng có mục "Tài liệu dự án (Docs)": cách tạo khung chuẩn, thư mục module và tính năng, tài liệu FDS/TDS từ mẫu, loại và trạng thái duyệt tài liệu, sơ đồ Mermaid, tìm kiếm và tài liệu liên kết. (DTD-19)

- Projects have a Docs tab with a document tree (project → module → feature → bugs & changes): search by title or content, filter by type, create folders and FDS/TDS documents from templates, and a one-click standard structure. Documents have a type (FDS, TDS, ADR, RCA, GUIDE, OTHER) and a review status, Mermaid diagrams render in previews, long documents get a table of contents, and an issue lists its linked documents. Adds `document_folders.parent_id`, `project_id`, `kind` and `documents.doc_type`, `status` through a Prisma migration; existing folders become roots. (DTD-19, #44, 7b66f412)
  VI: Dự án có tab Docs với cây tài liệu (dự án → module → tính năng → bugs & thay đổi): tìm theo tiêu đề hoặc nội dung, lọc theo loại, tạo thư mục và tài liệu FDS/TDS từ mẫu, và tạo khung chuẩn bằng một nút. Tài liệu có loại (FDS, TDS, ADR, RCA, GUIDE, OTHER) và trạng thái duyệt, sơ đồ Mermaid hiển thị trong preview, tài liệu dài có mục lục, và issue liệt kê tài liệu liên kết. Thêm `document_folders.parent_id`, `project_id`, `kind` và `documents.doc_type`, `status` qua migration Prisma; thư mục hiện có trở thành thư mục gốc. (DTD-19)

- A task worked on by the local runner shows an "Agent run" card with the run state, the agent's current step (for example "Editing apps/web/lib/time.ts" or "Running approved test 1/2") updated every few seconds, the pull request once there is one, and a cancel button for the run's owner. Claude Code runs report each file step; Codex runs report the runner's phases. Adds `agent_runs.progress` and `progress_at` through a Prisma migration. Deploy the API before updating the runner checkout: an older API rejects the new heartbeat field and the run fails. (#39, d340c87e)
  VI: Task do runner local xử lý hiển thị thẻ "Agent run" gồm trạng thái run, bước agent đang làm (ví dụ "Editing apps/web/lib/time.ts" hoặc "Running approved test 1/2") cập nhật vài giây một lần, pull request khi đã có, và nút hủy cho chủ run. Run Claude Code báo từng bước với file; run Codex báo theo giai đoạn của runner. Thêm cột `agent_runs.progress` và `progress_at` qua migration Prisma. Deploy API trước khi cập nhật checkout của runner: API cũ từ chối trường heartbeat mới và run sẽ thất bại.

- Clicking an image in a task's description or comments opens a full-screen viewer: ← / → move through the task's images, + / − / 0 zoom and reset, a button downloads the original, and Esc, the close button or a click on the backdrop closes it. The sidebar no longer shows a horizontal scrollbar. (DTD-16, #38, 7905caae)
  VI: Click vào ảnh trong mô tả hoặc comment của task sẽ mở trình xem toàn màn hình: ← / → chuyển giữa các ảnh của task, + / − / 0 để phóng to, thu nhỏ và đặt lại, có nút tải ảnh gốc, và đóng bằng Esc, nút đóng hoặc click ra nền. Sidebar không còn thanh cuộn ngang. (DTD-16)

- Statuses can be marked "Required before start": once a workspace or team has one, an issue enters a Started status only from such a status and with a target end date. Moves between Started statuses stay free, and workspaces without a marked status are unchanged. Adds the `issue_statuses.required_before_start` column through a Prisma migration. (#33, 66be5047)
  VI: Status có thể bật "Bắt buộc trước khi làm": khi workspace hoặc team có status như vậy, issue chỉ được vào nhóm Đang thực hiện từ status đó và phải có ngày kết thúc dự kiến. Chuyển giữa các status Đang thực hiện vẫn tự do; workspace chưa bật status nào giữ nguyên hành vi. Thêm cột `issue_statuses.required_before_start` qua migration Prisma.

- The local Claude Code and Codex runner reviews each issue read-only first, records the plan as a comment and the estimated target end date on the issue, and only then implements it with that plan. The MCP `update_issue` tool accepts `targetDate`. (#33, 66be5047)
  VI: Runner Claude Code và Codex chạy local giờ review issue ở chế độ chỉ đọc trước, ghi kế hoạch thành comment và ngày kết thúc dự kiến vào issue, rồi mới thực hiện theo kế hoạch đó. Tool MCP `update_issue` nhận thêm `targetDate`.

- Flowie can run under a path of another site, for example `https://poc-dtd.bsr.com.vn/flowie`: set `NEXT_PUBLIC_BASE_PATH=/flowie`, add the same prefix to `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` and `AZURE_AD_REDIRECT_URI`, rebuild `web`, and add the proxy locations in `docs/sub-path-deployment.md`. Left empty, Flowie stays at the domain root. (#30, a906f54f)
  VI: Flowie có thể chạy dưới một đường dẫn của site khác, ví dụ `https://poc-dtd.bsr.com.vn/flowie`: đặt `NEXT_PUBLIC_BASE_PATH=/flowie`, thêm cùng tiền tố vào `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` và `AZURE_AD_REDIRECT_URI`, build lại `web`, rồi thêm các location proxy theo `docs/sub-path-deployment.md`. Để trống thì Flowie vẫn chạy ở gốc domain.

- Agent can use an internal, OpenAI-compatible AI server (for example `http://192.168.98.100:4000/v1`): list its host in `AGENT_PROVIDER_ALLOWED_HOSTS`, recreate the `api` service, then save the URL, model and key under Agent personalization → OpenAI connection. Other hosts still require the official HTTPS API. (#29, 5e04bf06)
  VI: Agent có thể dùng máy chủ AI nội bộ tương thích OpenAI (ví dụ `http://192.168.98.100:4000/v1`): khai báo host trong `AGENT_PROVIDER_ALLOWED_HOSTS`, tạo lại service `api`, rồi lưu URL, model và key tại Agent personalization → OpenAI connection. Các host khác vẫn phải dùng API HTTPS chính thức.

- Pasting a single web link into an issue description or comment turns it into a link titled with the page's title. (#28, 4f6b18cd)
  VI: Dán một link web vào mô tả hoặc bình luận issue sẽ tự đổi thành link mang tiêu đề của trang.

- Agent runs that finish, fail or are canceled now send an Inbox notification to the agent connection's owner and the issue assignee. (#27, 3a110820)
  VI: Run của agent khi hoàn thành, thất bại hoặc bị hủy sẽ gửi thông báo Inbox cho chủ kết nối agent và người được giao issue.

- Pull requests and their task links can stay current without webhooks: set `SCM_SYNC_INTERVAL_SECONDS` (off by default, minimum 60) and the API syncs every active or failed GitHub/Azure DevOps connection once per interval, as the Sync button does. Only one sync of a connection runs at a time; pressing Sync while one is running returns "already synchronizing". Recreate the `api` service after setting it. (#26, da180887)
  VI: Pull request và liên kết task có thể luôn cập nhật mà không cần webhook: đặt `SCM_SYNC_INTERVAL_SECONDS` (mặc định tắt, tối thiểu 60) thì API đồng bộ mỗi kết nối GitHub/Azure DevOps đang hoạt động hoặc bị lỗi một lần mỗi chu kỳ, giống nút Sync. Mỗi kết nối chỉ chạy một lượt đồng bộ tại một thời điểm; bấm Sync khi đang đồng bộ sẽ báo "already synchronizing". Tạo lại service `api` sau khi đặt biến.

### Fixed

- Open in SharePoint on attachments and published Docs documents opens the file on SharePoint instead of downloading it: Office files open in Office for the web, other files in the library's file viewer. Links of files copied earlier are corrected too. No migration; rebuild `api`. (DTD-479, #165, 402a0b6c)
  VI: Nút Mở trên SharePoint của tệp đính kèm và tài liệu Docs đã phát hành mở file trên SharePoint thay vì tải về: file Office mở bằng Office for the web, file khác mở trong trình xem file của thư viện. Link của các file đã sao chép trước đây cũng được sửa. Không có migration; build lại `api`. (DTD-479)

- The issue picker shows one tooltip for a long issue name instead of two identical ones. The browser regression step of the verify job may run for 45 minutes, because a slower runner passed the old 35-minute limit, so a push to `main` no longer stops there. (DTD-380, #155, db2afd21)
  VI: Hộp chọn issue chỉ hiện một tooltip cho tên issue dài thay vì hai tooltip trùng nhau. Bước kiểm thử trình duyệt của job verify được chạy tối đa 45 phút, vì runner chậm đã vượt giới hạn 35 phút cũ, nên push lên `main` không còn dừng ở đó. (DTD-380)

- The storage acceptance step no longer fails at random and stops production deployment: its MinIO fixtures now wait for `/minio/health/cluster`, because `/minio/health/ready` answers before S3 calls work. Test tooling only; nothing in the deployed app changes. (DTD-340, #154, daf2c817)
  VI: Bước storage acceptance không còn fail ngẫu nhiên và dừng deploy production: fixture MinIO nay chờ `/minio/health/cluster`, vì `/minio/health/ready` trả lời trước khi lệnh S3 hoạt động. Chỉ đổi công cụ test, ứng dụng đã deploy không thay đổi. (DTD-340)
- Dragging a row in manual order now works across a taller sibling: a sub-issue can pass one with expanded children in either direction, where it used to snap back. The rows swap when the pointer passes the sibling's middle. The purple Today line on timelines no longer blocks clicks on a bar beneath it. The browser tests that stopped the production workflow before its deploy step match the current interface again, and image paste tests now run in Firefox. No migration; rebuild `web`. (DTD-336, #153, 6a4a3215)
  VI: Kéo hàng ở thứ tự thủ công nay đi qua được hàng cùng cấp cao hơn: sub-issue vượt được hàng đang mở con theo cả hai chiều, trước đây hàng bị bật về chỗ cũ. Hai hàng đổi chỗ khi con trỏ qua điểm giữa của hàng cùng cấp. Vạch Today màu tím trên timeline không còn chặn click vào thanh nằm dưới nó. Các test trình duyệt từng chặn workflow production trước bước deploy nay khớp lại giao diện hiện tại, và test dán ảnh nay chạy được trên Firefox. Không có migration; build lại `web`. (DTD-336)
- When an AI reply has the wrong format or a schedule breaks a rule, Agent asks the model to correct it once before showing an error. (DTD-331, #152, a1bfad19)
  VI: Khi câu trả lời của AI sai định dạng hoặc lịch vi phạm quy tắc, Agent yêu cầu model sửa một lần trước khi báo lỗi. (DTD-331)

- Agent and News retry temporary AI provider failures, wait longer for large work such as scheduling and news analysis (up to 180 seconds), and report a reply that was cut off instead of "invalid format". Provider errors now name the HTTP status. A reverse proxy in front of the API must allow requests of up to 180 seconds, or scheduling can still be cut off. (DTD-322, #151, e6f35ae4)
  VI: Agent và News thử lại khi provider AI lỗi tạm thời, chờ lâu hơn với việc lớn như xếp lịch và phân tích tin (tối đa 180 giây), và báo câu trả lời bị cắt thay vì "sai định dạng". Lỗi provider nay nêu mã HTTP. Reverse proxy trước API phải cho phép request tới 180 giây, nếu không xếp lịch vẫn có thể bị cắt. (DTD-322)

- Agent keeps attached files across planning turns, so answering its clarifying question no longer loses the document; files stop being used once the plan is applied. Includes a migration: rebuild `migrate` and `api`, and run `migrate` before `api`. (DTD-299, #150, f04c7124)
  VI: Agent giữ file đính kèm qua các lượt lập kế hoạch, nên trả lời câu hỏi làm rõ không còn mất tài liệu; file ngừng được dùng khi kế hoạch đã áp dụng. Có migration: build lại `migrate` và `api`, chạy `migrate` trước `api`. (DTD-299)
- Agent answers questions such as "Ai đang xử lý FL-12?" or "What's the plan for project TAM?" as questions instead of drafting a plan, while requests to create work still go to planning. (DTD-299, #150, f04c7124)
  VI: Agent trả lời các câu như "Ai đang xử lý FL-12?" hay "What's the plan for project TAM?" như câu hỏi thay vì soạn kế hoạch; yêu cầu tạo việc vẫn vào luồng lập kế hoạch. (DTD-299)
- News labels every new item of a group in one run, up to 120 items, instead of stopping at 30. When a workspace has an AI provider, a group's Teams card now waits up to 2 hours for labels and retries every 10 minutes, then goes out unlabelled if the AI is still failing, so a card can arrive later than 06:30. (DTD-299, #150, f04c7124)
  VI: News gán nhãn mọi tin mới của nhóm trong một lần chạy, tối đa 120 tin, thay vì dừng ở 30. Khi workspace có provider AI, thẻ Teams của nhóm chờ nhãn tối đa 2 giờ và thử lại mỗi 10 phút, rồi vẫn gửi không nhãn nếu AI còn lỗi, nên thẻ có thể đến muộn hơn 06:30. (DTD-299)
- AI scheduling counts today in Vietnam time, so it no longer allows a start date one day in the past when the server runs on UTC. (DTD-299, #150, f04c7124)
  VI: Xếp lịch bằng AI tính ngày hôm nay theo giờ Việt Nam, nên không còn cho phép ngày bắt đầu lùi một ngày khi server chạy UTC. (DTD-299)

- People who left a workspace can no longer read or change Asks they created there. (DTD-287, #139, b28ba724)
  VI: Người đã rời workspace không còn đọc hay sửa được Ask do họ tạo trong workspace đó. (DTD-287)
- Document media groups the zoom percentage between its controls, gives sticky tools breathing room, and matches Mermaid Settings to the app’s compact popovers. Web only; no migration. (DTD-266, #134, d7c2831f)
  VI: Media tài liệu gom phần trăm zoom giữa hai nút điều khiển, tạo khoảng đệm cho toolbar ghim và đồng bộ Mermaid Settings với popover gọn của ứng dụng. Chỉ web; không migration.

- Loading screens restore the supplied five-second ribbon entrance, word reveal and dot bounce with a full-size Flowie logo. Dark themes and reduced motion remain supported, and versioned assets preserve compatibility for open tabs; web only, no migration. (DTD-267, #133, b19e675e)
  VI: Màn hình tải khôi phục hiệu ứng dải màu vào lần lượt, hiện chữ và chấm bật lên trong chu kỳ năm giây theo mẫu, với logo Flowie đầy đủ. Giữ hỗ trợ theme tối, giảm chuyển động và asset có phiên bản tương thích với tab đang mở; chỉ web, không migration.

- Document approvers see why approval is blocked and how to proceed without relying on hover; review permission failures offer retry, stale permissions are discarded, and header actions wrap on narrow screens. Existing approval rules remain enforced. Web only; no migration. (DTD-270, #130, 7e5da2fb)
  VI: Người duyệt thấy lý do chưa duyệt được và bước tiếp theo mà không cần hover; lỗi tải quyền có thử lại, quyền cũ bị loại bỏ và thanh thao tác xuống dòng trên màn hình hẹp. Giữ các quy tắc duyệt hiện hành. Chỉ web; không migration.

- Issue description editing keeps Save, Cancel, draft images, errors and keyboard hints inside the same bordered composer as its text field, including narrow screens. Explicit save and draft recovery remain available. Web only; no migration. (DTD-268, #129, f0c328fc)
  VI: Khi sửa mô tả task, Save, Cancel, ảnh nháp, lỗi và gợi ý phím tắt nằm chung khung viền với ô soạn, kể cả màn hình hẹp. Vẫn lưu tường minh và phục hồi nháp. Chỉ web; không migration.

- Subtask popover links keep the configured deployment base path (such as /flowie), so clicking a child opens the correct issue page. Root deployments remain supported; web only, no migration. (DTD-265, #126, 3425f2bc)
  VI: Link task con trong popover giữ đường dẫn triển khai đã cấu hình (như /flowie), nên bấm task con mở đúng trang chi tiết. Vẫn hỗ trợ chạy ở gốc domain; chỉ đổi web, không migration.

- Images attached through the MCP upload URL (PNG, JPEG, GIF, WebP, AVIF) keep their image type on servers whose container has no system MIME table, so they preview inline instead of downloading as `application/octet-stream`. Attachments already stored with the wrong type are not changed. API only; no schema change. (DTD-214, #101, 4182a70a)
  VI: Ảnh đính kèm qua URL upload MCP (PNG, JPEG, GIF, WebP, AVIF) giữ đúng kiểu ảnh trên server có container không có bảng MIME của hệ thống, nên xem trước được thay vì chỉ tải về dạng `application/octet-stream`. Đính kèm đã lưu sai kiểu không được sửa. Chỉ đổi API; không đổi schema. (DTD-214)

- MCP connections limited to projects can read, search, update and link documents filed in an allowed project's Docs tree even before they are linked to anything; previously such documents returned "Document not found in the allowed scope", so `link_document` could never create their first link. Documents in other projects' trees or outside any project stay hidden. API only; no schema change. (DTD-216, #99, 3a73e8f2)
  VI: Kết nối MCP giới hạn theo dự án đọc, tìm, sửa và liên kết được tài liệu nằm trong cây Docs của dự án được phép ngay cả khi chưa liên kết với gì; trước đây các tài liệu này trả "Document not found in the allowed scope", nên `link_document` không bao giờ tạo được liên kết đầu tiên. Tài liệu trong cây của dự án khác hoặc ngoài mọi dự án vẫn bị ẩn. Chỉ đổi API; không đổi schema. (DTD-216)

- The Assignee and Reporter rows of an issue's Properties panel use the same layout as Schedule and Due date: a field icon, the field name, and the person's avatar beside their name in aligned columns, without the online dot. Clicking either row still opens the person picker; the panel on phones matches. Web only; no API or schema change. (DTD-213, #96, #100, b33bf25c)
  VI: Dòng Người phụ trách và Người báo trong panel Thuộc tính của issue dùng cùng bố cục với Lịch thực hiện và Hạn xử lý: icon của trường, tên trường, và avatar cạnh tên người thẳng cột, không có chấm online. Bấm vào dòng vẫn mở menu chọn người; bản trên điện thoại cũng giống vậy. Chỉ đổi web; không đổi API hay schema. (DTD-213)

- The project Timeline's issue panel shows status and priority with the same icons and names as the issue lists (for example "High" with its bars instead of "high"), and saving a status, priority, due date or schedule there moves the bar at once without reloading the page. Web only; no API or schema change. (DTD-195, #94, 5f31273c)
  VI: Panel issue của Timeline dự án hiển thị trạng thái và độ ưu tiên với cùng icon và tên như danh sách issue (ví dụ "High" kèm biểu tượng cột thay vì "high"), và lưu trạng thái, độ ưu tiên, ngày đến hạn hoặc lịch trong panel làm thanh timeline đổi ngay mà không cần tải lại trang. Chỉ đổi web; không đổi API hay schema. (DTD-195)

- Live notifications work again after the read-only admin role: the role's write guard also ran for WebSocket connections, where it could not get a request and broke the notification stream. The guard now skips anything but HTTP writes and opens its own short database session only when it must check a role, so streams never hold a database connection. API only; no schema change. (DTD-190, #93, e55fa067)
  VI: Thông báo realtime hoạt động lại sau khi có role quản trị chỉ đọc: lớp chặn ghi của role này chạy cả cho kết nối WebSocket, nơi nó không lấy được request nên làm hỏng luồng thông báo. Giờ lớp chặn bỏ qua mọi thứ không phải thao tác ghi qua HTTP và chỉ mở session database ngắn của riêng nó khi cần kiểm tra role, nên luồng stream không bao giờ giữ kết nối database. Chỉ đổi API; không đổi schema. (DTD-190)

- TeX math in Markdown renders instead of showing its source: `$\rightarrow$` shows an arrow, `$…$` renders inline and `$$…$$` renders as a block, in Docs, task descriptions, comments and Markdown attachments. Code spans and code blocks stay literal, TeX link and image commands are not run, and a literal dollar pair needs `\$`. Web only; no API or schema change. (DTD-179, #88, 8147d974)
  VI: Công thức TeX trong Markdown được hiển thị thay vì hiện mã nguồn: `$\rightarrow$` hiện mũi tên, `$…$` hiển thị trong dòng và `$$…$$` hiển thị thành khối, ở Docs, mô tả task, comment và attachment Markdown. Code span và code block giữ nguyên văn, lệnh link và ảnh của TeX không được thực thi, và muốn giữ cặp ký tự đô la thì viết `\$`. Chỉ đổi web; không đổi API hay schema. (DTD-179)

- A team's Documents tab lists only the team's own folders instead of every project Docs folder flattened into one list, and starts with links to the Docs tab of each of the team's projects; New document works even before the team has a folder (it creates "General"), and documents created for a team without a folder never land in a project tree. Pinned documents inside project trees no longer show under the team overview's resources. No schema change and no data is moved or deleted. (DTD-135, #78, a6b4d24f)
  VI: Tab Documents của team chỉ liệt kê thư mục riêng của team thay vì gộp phẳng mọi thư mục Docs của các dự án, và có hàng link sang tab Docs của từng dự án thuộc team; New document dùng được cả khi team chưa có thư mục (tạo "General"), và tài liệu tạo cho team không chỉ định thư mục không còn rơi vào cây dự án. Tài liệu được ghim trong cây dự án không còn hiện ở mục resources của team overview. Không đổi schema, không di chuyển hay xoá dữ liệu. (DTD-135)

- The Add existing sub-issue and Set/Change parent dialogs keep every search result at full row height, so a long result list scrolls evenly instead of squeezing rows together under the search box. Web only; no API or schema change. (DTD-120, #74, bf089a65)
  VI: Hộp thoại Add existing sub-issue và Set/Change parent giữ đủ chiều cao cho mọi dòng kết quả tìm kiếm, nên danh sách dài cuộn đều thay vì bị ép các dòng dính nhau dưới ô tìm kiếm. Chỉ đổi web; không đổi API hay schema. (DTD-120)

- The issue Filter now works for every section: Status, Labels and Cycle list the workspace's real statuses, labels and cycles instead of demo data, filters apply to all matching issues (not only the loaded page) and stay in the link after a reload, Clear removes them, and "Project is not X" keeps issues without a project. Option counts are no longer shown because they only counted the loaded page. No schema change; deploy `api` and `web` together. (DTD-69, #64, 8f9cdf0a)
  VI: Filter danh sách task hoạt động ở mọi mục: Status, Labels và Cycle hiển thị trạng thái, nhãn và cycle thật của workspace thay cho dữ liệu mẫu, bộ lọc áp dụng trên toàn bộ task khớp (không chỉ trang đã tải) và giữ nguyên trong link khi tải lại, Clear bỏ bộ lọc, và "Project is not X" giữ cả task không thuộc dự án. Không còn hiển thị số đếm cạnh lựa chọn vì số đó chỉ tính trên trang đã tải. Không đổi schema; deploy `api` và `web` cùng lúc. (DTD-69)

- The issue Filter's Assignee and Project sections list the workspace's real members and projects instead of demo data, so picking one filters the list correctly on All issues and the other issue lists. (DTD-63, #63, 2c1acd7d)
  VI: Mục Assignee và Project của Filter danh sách task hiển thị thành viên và dự án thật của workspace thay cho dữ liệu mẫu, nên chọn một mục sẽ lọc đúng ở All issues và các danh sách task khác. (DTD-63)

- Typing a comment no longer makes the task page and its scrollbar jump: images in the description and comments are no longer reloaded on every keystroke. The comment box now grows with its text up to about 20 lines, then scrolls inside. (DTD-55)
  VI: Gõ bình luận không còn làm trang task và thanh cuộn nhảy: ảnh trong mô tả và bình luận không bị tải lại ở mỗi phím gõ. Ô bình luận tự giãn theo nội dung tới khoảng 20 dòng rồi cuộn bên trong. (DTD-55)

- Browser regression tests use the task page's new Send comment button, Attachments tab and Activity tab, so verification on `main` passes again after the task-tab change. (DTD-55, #56, 35c3f8fd)
  VI: Test hồi quy trên trình duyệt dùng nút Gửi bình luận, tab Tệp đính kèm và tab Hoạt động mới của trang task, nên bước kiểm tra trên `main` chạy qua lại sau thay đổi chia tab. (DTD-55)

- Closing a document opened from a link (search, a task, a shared URL) returns to the page it was opened from, or to Docs when it was opened in a new tab, instead of always going to Search. (DTD-54, #53, ca87a6f7)
  VI: Đóng tài liệu mở từ link (tìm kiếm, task, URL được chia sẻ) sẽ quay về trang đã mở nó, hoặc về Docs nếu mở ở tab mới, thay vì luôn chuyển sang Tìm kiếm. (DTD-54)

- Code blocks, inline code and other monospace text render in Geist Mono instead of the proportional body font; the body font is unchanged, and the command palette's shortcut keys now use Geist. (#52, 7e3d2409)
  VI: Khối code, code inline và chữ monospace khác hiển thị bằng Geist Mono thay vì font thân trang tỷ lệ; font thân trang giữ nguyên, phím tắt trong command palette giờ dùng Geist.

- Load-error screens show a centred icon, the message and a small Retry button instead of a Retry bar stretched across the page. (DTD-19, #46, 497d61e2)
  VI: Màn hình lỗi tải dữ liệu hiển thị icon, thông báo và nút Thử lại nhỏ ở giữa, thay cho nút Thử lại kéo dài hết trang. (DTD-19)

- Creating a document for a team with no document folders, including through the MCP `create_document` tool, now creates a "General" folder instead of failing with "Document folder not found". (DTD-19, #44, 7b66f412)
  VI: Tạo tài liệu cho team chưa có thư mục tài liệu, kể cả qua tool MCP `create_document`, giờ tự tạo thư mục "General" thay vì lỗi "Document folder not found". (DTD-19)

- Issue bars on the Projects, Initiatives and project timelines follow the issue's schedule: they start at the target start and end at the target end, falling back to the creation day and the due date only when the schedule is missing. (DTD-26, #43, 8852d51e)
  VI: Thanh issue trên timeline Projects, Initiatives và timeline của dự án theo schedule của issue: bắt đầu ở ngày bắt đầu dự kiến và kết thúc ở ngày kết thúc dự kiến, chỉ dùng ngày tạo và due date khi chưa có schedule. (DTD-26)

- Issue bars on a project's Timeline match the Initiatives timeline: an outline in the status colour over the page background instead of a solid fill, readable text in both themes, and the same compact rows; hovering a bar now highlights it on both timelines. (DTD-25, #42, 77c7e34c)
  VI: Thanh issue trên Timeline của dự án giống timeline Initiatives: viền theo màu trạng thái trên nền trang thay vì tô đặc, chữ đọc rõ ở cả hai theme và các dòng gọn như nhau; rê chuột lên thanh giờ làm nổi thanh ở cả hai timeline. (DTD-25)

- A project's Issues tab follows the same list/board choice as All issues and has the Display menu (layout, grouping, ordering, properties); board mode no longer shows the list's column header. (DTD-17, #40, fc4f96d6)
  VI: Tab Issues của dự án dùng chung lựa chọn list/board với All issues và có menu Display (bố cục, nhóm, sắp xếp, thuộc tính); dạng board không còn thanh tiêu đề cột của list. (DTD-17)

- Work an MCP agent does with your token (comments, status changes, mentions) now reaches your own Inbox, labelled with the agent's name, for example "Pham Hoang Tu · flowie-mcp-desktop". Actions you take yourself still do not notify you. (#37, 1ca6c4e1)
  VI: Việc agent MCP làm bằng token của bạn (comment, đổi trạng thái, mention) giờ được gửi vào Inbox của chính bạn, kèm tên agent, ví dụ "Pham Hoang Tu · flowie-mcp-desktop". Hành động bạn tự làm vẫn không tạo thông báo cho bạn.

- Comment mentions are easier to spot: the `@` suggestion list shows member avatars, and each `@Name` a comment notified is highlighted. Mentions inside code or link text stay plain. (#36, 13a337df)
  VI: Mention trong comment dễ nhận ra hơn: danh sách gợi ý khi gõ `@` hiển thị avatar thành viên, và mỗi `@Tên` đã được comment thông báo được highlight. Mention trong code hoặc nhãn link vẫn là chữ thường.

- Screenshots in issue descriptions and comments load again after Flowie moves to another domain or sub-path: links saved with the old host, such as `https://flowie.dtd.bsr.com.vn/api/v1/attachments/…/preview`, are now fetched from the current API by attachment id. Rebuild the `web` service to apply it. (#35, a1234536)
  VI: Ảnh chụp màn hình trong mô tả và comment hiển thị lại sau khi Flowie chuyển sang domain hoặc sub-path khác: link lưu với host cũ, ví dụ `https://flowie.dtd.bsr.com.vn/api/v1/attachments/…/preview`, giờ được tải từ API hiện tại theo id đính kèm. Build lại service `web` để áp dụng.

- An issue opened from a project's page now shows the project in its breadcrumb, and that crumb returns to the project's issue list instead of the team's. Previous / next, reloads and copied links keep it; issues opened elsewhere still show the team. (#34, 75ada6d5)
  VI: Issue mở từ trang dự án giờ hiển thị dự án trên breadcrumb, và bấm vào đó quay về danh sách issue của dự án thay vì của team. Nút trước / sau, tải lại trang và link sao chép vẫn giữ breadcrumb này; issue mở từ nơi khác vẫn hiển thị team.

- Signing in under a path such as `/flowie` no longer lands on "Page not found" at `/flowie/flowie`: the web container now applies `NEXT_PUBLIC_BASE_PATH` at runtime as well as at build. Rebuild the `web` service to apply it. (#32, b7453fa2)
  VI: Đăng nhập khi chạy dưới đường dẫn như `/flowie` không còn rơi vào trang "Page not found" tại `/flowie/flowie`: container web giờ áp dụng `NEXT_PUBLIC_BASE_PATH` cả lúc chạy lẫn lúc build. Build lại service `web` để áp dụng.

- Microsoft sign-in no longer fails with "The Microsoft sign-in request has expired." when Flowie runs under a path such as `/flowie`. The sign-in cookie now follows the path of `AZURE_AD_REDIRECT_URI`; rebuild the `api` service to apply it. (#31, e5c4c328)
  VI: Đăng nhập Microsoft không còn báo "The Microsoft sign-in request has expired." khi Flowie chạy dưới đường dẫn như `/flowie`. Cookie đăng nhập giờ theo đường dẫn của `AZURE_AD_REDIRECT_URI`; build lại service `api` để áp dụng.

- Connecting a GitHub or Azure DevOps account in Settings → Code & reviews no longer fails with "The request could not be completed." The connection was saved but its response could not be encoded; an account added before this fix already exists and appears after reloading the page. (#25, 564921ff)
  VI: Kết nối tài khoản GitHub hoặc Azure DevOps trong Settings → Code & reviews không còn báo lỗi "The request could not be completed." Kết nối đã được lưu nhưng phản hồi không mã hoá được; tài khoản thêm trước bản sửa này đã tồn tại và hiện ra sau khi tải lại trang.

- The local runner resolves a configured provider binary through a PATHEXT-aware PATH lookup before starting it. On Windows npm installs Claude Code and Codex as a `.CMD` shim, which `CreateProcess` never finds from a bare name, so the documented `"claude": "claude"` configuration could not start the provider at all; a binary missing from PATH is now rejected with a clear error instead of a bare file-not-found.

### Changed

- Git ignores `.mcp.json`, the per-machine MCP client configuration that names a developer's Flowie endpoint and the environment variable holding their token, so it can no longer be committed by accident. A copy already tracked in a working tree stays tracked until it is removed from the index. Configuration only; no deployment or migration required.
  VI: Git bỏ qua `.mcp.json`, cấu hình MCP client của từng máy nêu endpoint Flowie và tên biến môi trường chứa token của lập trình viên, nên file này không còn bị commit do vô ý. Bản đã được theo dõi trong một working tree vẫn còn được theo dõi cho tới khi bị xoá khỏi index. Chỉ thay đổi cấu hình; không cần triển khai hay migration.

- Settings pages Archived records, Import and export, Audit log, Operations, SLAs and AI operations use the compact layout of Preferences. Archived records, imports, audit events, queues and background jobs are one-line rows with small buttons at the row end. Refresh actions are icon buttons and filters are small selects. Audit filters sit on one aligned row with Export in the page header. Queue lag reads like `13h 47m` instead of seconds. SLA metrics are stat cards like MCP logs, and recent imports show an empty state. Behaviour and labels are unchanged. No migration; rebuild `web`. (DTD-483, #168, b8a68a83)
  VI: Các trang Settings Archived records, Import and export, Audit log, Operations, SLAs và AI operations dùng bố cục gọn như Preferences. Bản ghi lưu trữ, lần nhập, sự kiện audit, hàng đợi và tác vụ nền là các hàng một dòng, nút nhỏ ở cuối hàng. Thao tác làm mới là nút icon, bộ lọc là select nhỏ. Bộ lọc audit nằm trên một hàng thẳng, nút Export ở đầu trang. Độ trễ hàng đợi hiện dạng `13h 47m` thay cho số giây. Chỉ số SLA là thẻ số liệu như trang MCP logs, và danh sách lần nhập gần đây có trạng thái trống. Hành vi và nhãn không đổi. Không có migration; build lại `web`. (DTD-483)

- Settings → Notifications and Security & access (Devices, History, Credentials, Authenticator) use the same compact layout as Preferences. Notification channels are rows with a checkbox on the right, and the delivery log is a bordered list. Refresh actions are small icon buttons with a tooltip, and Revoke sits at the end of each device or credential row. "Current device", credential status and "Authenticator off" are inline badges, and credential scopes show as small chips. Each security event takes one line on desktop. Revocation confirmations appear as a compact bar with small buttons. Behaviour and labels are unchanged. No migration; rebuild `web`. (DTD-482, #167, 96ca6e37)
  VI: Trang Settings → Notifications và Security & access (Devices, History, Credentials, Authenticator) dùng cùng bố cục gọn như Preferences. Các kênh thông báo là hàng có checkbox bên phải, nhật ký gửi email là danh sách có viền. Thao tác làm mới là nút icon nhỏ có tooltip, và nút Revoke nằm cuối hàng của từng thiết bị hoặc credential. "Current device", trạng thái credential và "Authenticator off" là badge nội tuyến, còn scope của credential hiện thành chip nhỏ. Mỗi sự kiện bảo mật chiếm một dòng trên desktop. Xác nhận thu hồi hiện thành một thanh gọn với nút nhỏ. Hành vi và nhãn không đổi. Không có migration; build lại `web`. (DTD-482)

- Settings → Account → Preferences is laid out as compact rows in bordered groups (General, Time, Display, Theme): each option shows its label on the left and a small select, checkbox or button on the right instead of full-width fields. The timezone controls wrap under their label on narrow screens, Customize sidebar opens from its row, and "Account preferences saved." appears as a short toast after a change instead of a line that never goes away. Saving behaviour is unchanged. No migration; rebuild `web`. (DTD-481, #166, 4f02727b)
  VI: Trang Settings → Account → Preferences được trình bày thành các hàng gọn trong những nhóm có viền (Chung, Thời gian, Hiển thị, Giao diện): mỗi tuỳ chọn có nhãn bên trái và select, checkbox hoặc nút nhỏ bên phải thay cho ô kéo hết chiều ngang. Các control múi giờ xuống dòng dưới nhãn trên màn hình hẹp, Tuỳ chỉnh thanh bên mở từ chính hàng của nó, và "Đã lưu tùy chọn tài khoản." hiện thành toast ngắn sau mỗi thay đổi thay cho dòng hiện mãi. Cách lưu không đổi. Không có migration; build lại `web`. (DTD-481)

- Opening a related document from a task now shows it below the task header, so the breadcrumb, favorite, actions and previous/next stay usable, and Close returns to the task as it was (tab, scroll position, unsaved drafts). The task title in the breadcrumb returns to the task's main view. No migration; rebuild `web`. (DTD-381, #157, ab06fbd9)
  VI: Mở tài liệu liên quan từ một task nay hiển thị ngay dưới header của task, nên breadcrumb, đánh dấu sao, thao tác và nút trước/sau vẫn dùng được, và nút Đóng quay về task như ban đầu (tab, vị trí cuộn, bản nháp chưa lưu). Tiêu đề task trên breadcrumb đưa về view chính của task. Không có migration; build lại `web`. (DTD-381)
- Agent rules in `AGENTS.md` now describe how Flowie actually ships: the server people use is pulled and rebuilt by hand, a green CT107 workflow does not mean a change is live there, and a new migration needs `migrate` rebuilt. The other projects' names match Flowie. Documentation only; nothing to deploy. (#156, 41eef31b)
  VI: Quy tắc cho agent trong `AGENTS.md` nay mô tả đúng cách Flowie được triển khai: server mọi người dùng được pull và build lại thủ công, workflow CT107 xanh không có nghĩa thay đổi đã lên server đó, và migration mới cần build lại `migrate`. Tên các dự án khác khớp với Flowie. Chỉ là tài liệu; không cần triển khai.
- Workspace Owners/Admins with document access can approve alongside team leads, including their own documents. Assigned reviewers must still agree; read-only, inactive and out-of-scope accounts remain excluded. Deploy API and web together; no migration. (DTD-270, #132, 8995185a)
  VI: Owner/Admin workspace có quyền truy cập được duyệt cùng lead, kể cả tài liệu tự tạo. Reviewer đã giao vẫn phải đồng ý; tài khoản chỉ đọc, ngừng hoạt động hoặc ngoài phạm vi không được duyệt. Triển khai API/web cùng bản; không migration.

- Flowie branding blends into light/dark surfaces with transparent artwork and an adaptive wordmark. Loading uses a compact symbol with a continuous gentle loop; full logos keep stable dimensions during sign-in and respect reduced motion. Web only; no migration. (DTD-267, #131, d372be87)
  VI: Logo Flowie hòa vào nền sáng/tối bằng ảnh trong suốt và wordmark theo theme. Loading dùng biểu tượng gọn với vòng lặp nhẹ liên tục; logo đầy đủ giữ kích thước ổn định khi đăng nhập và tôn trọng giảm chuyển động. Chỉ web; không migration.

- Flowie uses the supplied blue/teal/green brand logo and five-second loading motion across authentication, admin branding, shared loading states and favicon/PWA icons. Reduced-motion browsers receive static artwork. Web only; no migration. (DTD-267, #128, 8d90ea70)
  VI: Flowie dùng logo xanh dương/xanh ngọc/xanh lá và loading motion 5 giây được cung cấp tại auth, admin, loader dùng chung và icon favicon/PWA. Trình duyệt giảm chuyển động nhận ảnh tĩnh. Chỉ web; không migration.

- MCP tools cost agents fewer tokens and calls: `get_issue_context` no longer includes the project's other documents unless `includeProjectDocuments` is set (then titles only); `create_issue`, `update_issue` and `transition_issue` return the identifier, version, status, plan fields and the fields just sent instead of the whole issue, and comment writes return only ids and version; `transition_issue` accepts a status name; `update_document` and `upsert_feature_doc` accept exact-text `edits` instead of the full content; schema errors name the wrong arguments; and MCP logs show the average result size per tool. Clients that read other fields from write results must call `get_issue`. API and one MCP logs line; no schema change; reconnect MCP clients. (DTD-220, #104, 45791ee2)
  VI: Tool MCP tốn ít token và ít lần gọi hơn: `get_issue_context` không còn kèm các tài liệu khác của dự án trừ khi đặt `includeProjectDocuments` (khi đó chỉ trả tiêu đề); `create_issue`, `update_issue` và `transition_issue` trả mã, version, trạng thái, các trường kế hoạch và các trường vừa gửi thay cho cả issue, còn ghi comment chỉ trả id và version; `transition_issue` nhận tên trạng thái; `update_document` và `upsert_feature_doc` nhận `edits` theo đoạn chính xác thay cho cả nội dung; lỗi tham số nêu rõ trường sai; và MCP logs hiển thị kích thước kết quả trung bình theo tool. Client đọc trường khác từ kết quả ghi phải gọi `get_issue`. Đổi API và một dòng ở MCP logs; không đổi schema; kết nối lại client MCP. (DTD-220)

- The Search workspace page (`/search`) now looks like the other list pages: the standard header bar with the sidebar toggle, a search box with an icon that is focused on open, small All / Issues / Documents / Projects / Members filter tabs, and one row per result with a kind icon, the kind and the issue or project key, using the app theme in light and dark mode. Loading, error (with Retry) and empty states use the shared components. Search results, ranking and paging are unchanged; web only. (DTD-62, #80, 8ccfa78a)
  VI: Trang Search workspace (`/search`) giờ giống các trang danh sách khác: thanh header chuẩn có nút mở sidebar, ô tìm có icon và tự focus khi mở, tab lọc nhỏ All / Issues / Documents / Projects / Members, và mỗi kết quả là một dòng có icon theo loại, tên loại và mã issue hoặc dự án, theo theme của ứng dụng ở chế độ sáng và tối. Trạng thái đang tải, lỗi (có nút Thử lại) và không có kết quả dùng component chung. Kết quả tìm, thứ tự và phân trang không đổi; chỉ thay đổi web. (DTD-62)

- A document opened from a task (or search, or a link) now shows the same view as the Docs preview — type, status, approved version, SharePoint state, earlier releases and the Submit for review / Return to draft / Approve buttons — so it can be reviewed without going to Docs; Edit in Docs and on this page opens the editor straight in edit mode. The Docs tree has a draggable divider whose width the browser remembers, keeps each document title on one line with type, status and time below it, and starts with every folder below the project collapsed (search and type filters still open the matching branches). Sequence diagrams with `;` inside a message now render. `GET /documents/{id}` adds `publication`; no schema change. (DTD-134, #75, ce26c82f)
  VI: Tài liệu mở từ task (hoặc từ tìm kiếm, link) nay hiện cùng khung xem như Docs — loại, trạng thái, phiên bản đã duyệt, trạng thái SharePoint, các phiên bản cũ và các nút Gửi duyệt / Trả về nháp / Duyệt — nên duyệt được mà không phải vào Docs; nút Sửa trong Docs và trên trang này mở editor ở thẳng chế độ sửa. Cây Docs có thanh chia kéo được và trình duyệt nhớ độ rộng, giữ tên tài liệu trên một dòng với loại, trạng thái và thời gian ở dòng dưới, và mở trang với mọi thư mục dưới dự án đang thu gọn (tìm kiếm và lọc loại vẫn mở các nhánh có kết quả). Sơ đồ sequence có dấu `;` trong message nay vẽ được. `GET /documents/{id}` thêm `publication`; không đổi schema. (DTD-134)

- The day activity list on the dashboard and Reports page is easier to scan: each row shows who made the change with their avatar, a sentence such as "Pham Hoang Tu created DTD-116 …" with the issue ID as a link, a coloured dot for created, completed or reopened, and a relative time whose tooltip is the full date and time; the heading shows the day in words, and the wide "Open DTD-…" buttons are gone. Changes without a person (system changes, deleted users) show as Flowie. `POST /reports/changes` adds `actor` to each row; no schema change, deploy `api` and `web` together. (DTD-117, #72, 421d2fdc)
  VI: Danh sách hoạt động trong ngày ở Dashboard và trang Reports dễ đọc hơn: mỗi dòng hiện người thực hiện kèm avatar, câu như "Pham Hoang Tu đã tạo DTD-116 …" với mã issue là liên kết, chấm màu cho tạo, hoàn thành hoặc mở lại, và thời gian tương đối có tooltip ngày giờ đầy đủ; tiêu đề ghi ngày bằng chữ, và các nút "Open DTD-…" rộng hết dòng đã được bỏ. Thay đổi không có người thực hiện (hệ thống, user đã xóa) hiển thị là Flowie. `POST /reports/changes` thêm `actor` cho mỗi dòng; không đổi schema, deploy `api` và `web` cùng lúc. (DTD-117)

- The issue page makes each part mean something: the Task/Bug type is an Issue type control in the properties panel (bug fields typed earlier are kept when switching back), and the body shows a Bug report block only for bugs instead of an empty "Task details" block. A sub-issue's header breadcrumb keeps its parent chain (for example DTD › DTD-24 › DTD-99), with each parent linking back. Editing a description has labelled Save and Cancel buttons like comments, never autosaves, Esc no longer drops an edited draft, and switching to Activity or Attachments keeps the draft. `GET /issues/lookup/{reference}` adds `ancestors`; no schema change, deploy `api` and `web` together. (DTD-116, #71, 2539741a)
  VI: Trang issue rõ nghĩa hơn: loại Task/Bug là ô Issue type trong panel Properties (các trường bug đã nhập vẫn còn khi chuyển lại), và phần thân chỉ hiện khối Bug report với bug thay vì khối "Task details" trống. Breadcrumb trên header của sub-issue giữ chuỗi task cha (ví dụ DTD › DTD-24 › DTD-99), mỗi cấp cha là link quay lại. Sửa mô tả có nút Save và Cancel có chữ như bình luận, không tự động lưu, Esc không còn bỏ bản nháp đã sửa, và sang tab Activity hoặc Attachments vẫn giữ bản nháp. `GET /issues/lookup/{reference}` thêm `ancestors`; không đổi schema, deploy `api` và `web` cùng lúc. (DTD-116)

- `AGENTS.md` names the Flowie project and team this repository belongs to and lists the other projects reachable through the same MCP connection with their repositories, so agents do not implement another project's task here. Documentation only; nothing deploys. (#61, aadc8388)
  VI: `AGENTS.md` ghi rõ dự án và team Flowie tương ứng với repository này, kèm danh sách các dự án khác truy cập được qua cùng kết nối MCP và repository của chúng, để agent không làm task của dự án khác trong repo này. Chỉ là tài liệu; không deploy.

- The Flowie MCP server now tells every connected agent (Codex, Claude, ChatGPT …) the task workflow when it connects: read the task and screenshots, comment the plan, set the end date, move to In Progress, update the feature FDS/TDS, open a pull request, comment the result, and move to Technical Review after merge. Agents no longer depend on a repository `AGENTS.md` to follow it. Reconnect MCP clients after deploying `api` to pick up the new instructions. (#59, 01725b64)
  VI: MCP server Flowie gửi quy trình xử lý task cho mọi agent kết nối (Codex, Claude, ChatGPT …) ngay khi kết nối: đọc task và ảnh, comment kế hoạch, đặt end date, chuyển In Progress, cập nhật FDS/TDS của tính năng, mở pull request, comment kết quả và chuyển Technical Review sau khi merge. Agent không còn phụ thuộc vào `AGENTS.md` của repo để làm theo. Kết nối lại client MCP sau khi deploy `api` để nhận hướng dẫn mới.

- The task page is split into Overview, Activity and Attachments tabs (the open tab is kept in `?tab=`). Comments stay in Overview with the composer on top and the newest comment first; replies keep their order under the comment they answer. The send button now sits inside the comment box and the separate @ button is gone — type `@` to mention someone. (DTD-55, #55, 999f6356)
  VI: Trang task được chia thành các tab Tổng quan, Hoạt động và Tệp đính kèm (tab đang mở được lưu trong `?tab=`). Bình luận nằm ở Tổng quan với ô nhập ở đầu và bình luận mới nhất trước; trả lời vẫn giữ thứ tự dưới bình luận gốc. Nút gửi giờ nằm trong khung ô bình luận và không còn nút @ riêng — gõ `@` để mention. (DTD-55)

- The Docs preview shows the document's version and a status picker (Draft → In review → Approved), so a document can be released without opening the editor. Its SharePoint state is always visible: published version with a link, waiting, the last error, or "SharePoint not set up" with a shortcut to the folder settings. Published documents carry a green cloud in the tree. (DTD-19, #50, 455e00b7)
  VI: Khung xem trước trong Docs hiển thị version của tài liệu và ô chọn trạng thái (Nháp → Đang duyệt → Đã duyệt), nên duyệt tài liệu không cần mở editor. Trạng thái SharePoint luôn hiện: version đã phát hành kèm link, đang chờ, lỗi gần nhất, hoặc "Chưa cấu hình SharePoint" kèm lối tắt tới phần cấu hình thư mục. Tài liệu đã phát hành có biểu tượng đám mây xanh trên cây. (DTD-19)

- Scrollbars across the app are thin with a neutral thumb that follows the light, dark and color themes and darkens on hover; arrow buttons are gone. The sidebar uses an overlay scrollbar that appears on hover or while scrolling and never scrolls sideways. Native controls follow the app theme instead of the OS theme. Scrolling behavior is unchanged, and browsers without scrollbar styling keep their default. (DTD-32, #45, 98108000)
  VI: Thanh cuộn trong toàn app mỏng, thumb màu trung tính theo theme sáng, tối và các theme màu, đậm hơn khi hover; bỏ nút mũi tên. Sidebar dùng thanh cuộn nổi chỉ hiện khi hover hoặc đang cuộn, không cuộn ngang. Control native theo theme của app thay vì theme của hệ điều hành. Cách cuộn không đổi; trình duyệt không hỗ trợ tùy biến giữ thanh cuộn mặc định. (DTD-32)

- Every settings page shares one layout: a title with a short description, the same centered width and padding, and its own scroll area. Pages that had no description now have one; navigation and page behavior are unchanged. (DTD-18, #41, 5e428157)
  VI: Mọi trang cài đặt dùng chung một bố cục: tiêu đề kèm mô tả ngắn, cùng độ rộng căn giữa và padding, và vùng cuộn riêng. Các trang trước đây chưa có mô tả nay đã có; điều hướng và hành vi của trang không đổi. (DTD-18)

- Settings navigation is regrouped as Account, Workspace, Issues, Projects, Features, and AI & integrations; Project properties and AI operations are now listed, and the settings header shows "Settings › group › page". (DTD-18, #40, fc4f96d6)
  VI: Điều hướng Settings được gom lại thành Tài khoản, Workspace, Issues, Projects, Tính năng, và AI & tích hợp; Project properties và Vận hành AI giờ có trong danh sách, và header settings hiển thị "Settings › nhóm › trang". (DTD-18)

- The Inbox shows comment text in each row and a header with Mark as read and Open actions in the preview, closer to the Circle layout. (#28, 4f6b18cd)
  VI: Inbox hiển thị nội dung bình luận ở từng dòng và thanh tiêu đề có thao tác Đánh dấu đã đọc và Mở trong khung xem trước, gần với bố cục Circle.

- The task detail sidebar lists linked pull requests under Diffs, one line each with a colored state icon, PR number, title and an Open/Draft/Merged/Closed badge, and shows the hint for linking a PR when there is none; the main column keeps the detailed PR cards only when PRs exist. Blocked-by and related tasks moved to the sidebar and show their title even when the task was opened directly. Activity rows show their time inline, comment actions appear on hover or keyboard focus (always on touch screens), and removing a pasted image uses an icon button. No API or schema change. (#24, ffc834a7)
  VI: Sidebar chi tiết task liệt kê pull request liên kết trong mục Diffs, mỗi PR một dòng gồm icon trạng thái có màu, số PR, tiêu đề và nhãn Open/Draft/Merged/Closed, và hiện hướng dẫn liên kết PR khi chưa có; cột chính chỉ giữ thẻ PR chi tiết khi có PR. Task bị chặn bởi và task liên quan chuyển sang sidebar và hiện tiêu đề cả khi task được mở trực tiếp. Dòng hoạt động hiện thời gian ngay sau nội dung, thao tác bình luận hiện khi rê chuột hoặc focus bàn phím (luôn hiện trên màn hình cảm ứng), và nút xoá ảnh đã dán là nút icon. Không thay đổi API hay schema.

- Contribution rules require bilingual English and Vietnamese source comments that explain in detail what the code handles, and bilingual changelog entries that reference their pull request and, after release, their merge commit. Change history stays in the changelog instead of source comments. Existing comments and entries are unchanged. (#19, d7edff87)
  VI: Quy tắc đóng góp yêu cầu comment mã nguồn song ngữ Anh – Việt, giải thích chi tiết đoạn mã xử lý gì, và mục changelog song ngữ ghi số pull request, sau khi release thì thêm commit merge. Lịch sử thay đổi được ghi trong changelog thay vì trong comment mã nguồn. Comment và mục changelog hiện có giữ nguyên.

- Agent runs must now report auditable test evidence. Each reported check carries its command, exit code, verdict, duration and a bounded log tail (stdout and stderr merged, last 2000 characters), and a verdict that contradicts its exit code is rejected. A result awaiting review must report at least one check and may not report a failed one; a failed result still may, which is how a failure is recorded. The local runner captures this for every approved command and records a command stopped at `commandTimeout` as a failed check with exit code 124 instead of dropping it. The issue comment lists each check with its exit code, duration and command, and shows a log only for a failed one; the full evidence stays on the run record. Approved test commands must not print secrets, because their arguments and log tail reach Flowie. Clients reporting the previous free-form `tests` shape are rejected with 400. No schema migration is required.

- Each local runner run now works in its own `git worktree` instead of the shared checkout. The run fetches its base branch from `origin` first, so a run never builds on a stale local ref, and `baseRef` now always names a branch on `origin` (`main` and `origin/main` are equivalent). The shared checkout is never modified and no longer has to be clean before a run, so one failed run cannot block the next. A successful run removes its worktree and leaves the reviewable commit on branch `codex/flowie-RUN_ID`; a failed run keeps its worktree only while it still holds uncommitted work and prints that path locally, never to the server. The optional `worktreeRoot` field chooses where run worktrees live and must be an absolute path outside `repositoryPath`; it defaults to `<repositoryPath>.flowie-worktrees`. Local tooling only; nothing changes on CT107.

- A push to `main` that changes only documentation (Markdown files, `docs/`, `llms.txt`) and Unreleased changelog entries no longer runs verification or redeploys CT107. Any other file, a new or changed release heading in `CHANGELOG.md`, a new branch, a force push or a manual workflow run still deploys. (#20, 06eacb32)
  VI: Push lên `main` chỉ đổi tài liệu (file Markdown, `docs/`, `llms.txt`) và mục changelog Unreleased sẽ không chạy kiểm thử và không deploy lại CT107. Đổi bất kỳ file nào khác, thêm hoặc sửa tiêu đề release trong `CHANGELOG.md`, branch mới, force push hoặc chạy workflow thủ công thì vẫn deploy.

- Task detail shows linked pull requests synced from GitHub or Azure DevOps: state, number, repository, source and target branch, head commit, added and deleted lines with a diff bar, changed files, and reviewer decisions, with links to the in-app review and the provider. Edit, save, SLA, attach, subscribe, mention and comment actions are icon buttons with tooltips. `GET /reviews` accepts `issueId` to list the reviews linked to one task. No schema change. (#21, e7ee8eb8)
  VI: Chi tiết task hiển thị pull request liên kết được đồng bộ từ GitHub hoặc Azure DevOps: trạng thái, số PR, repository, branch nguồn và đích, commit mới nhất, số dòng thêm/xoá kèm thanh diff, số file thay đổi và quyết định của reviewer, có liên kết đến trang review trong ứng dụng và trang của nhà cung cấp. Các thao tác sửa, lưu, SLA, đính kèm, theo dõi, nhắc tên và bình luận chuyển thành nút icon có tooltip. `GET /reviews` nhận tham số `issueId` để liệt kê review liên kết với một task. Không thay đổi schema.

- Task activity names who changed what: status, assignee, title, priority, project, dates and effort show as `before → after`, and older updates list the changed fields. Comments and activity written through an MCP connection carry a violet `<connection name> · AI` badge next to the person whose token was used; agent comments from before this release show `AI agent`. Typing `@` in a comment suggests team members (accent-insensitive, arrow keys and Enter/Tab to choose), inserts `@Name`, and drops the mention when that text is removed. Save, cancel and delete-confirmation buttons in task detail are icon buttons. No schema change. (#22, a934fdd7)
  VI: Hoạt động của task nêu rõ ai thay đổi gì: trạng thái, người thực hiện, tiêu đề, độ ưu tiên, dự án, ngày và công hiển thị dạng `trước → sau`, còn các cập nhật cũ liệt kê trường đã đổi. Comment và hoạt động ghi qua MCP connection có nhãn tím `<tên connection> · AI` cạnh người sở hữu token; comment của agent trước bản này hiển thị `AI agent`. Gõ `@` trong comment sẽ gợi ý thành viên nhóm (không phân biệt dấu, chọn bằng phím mũi tên và Enter/Tab), chèn `@Tên` và bỏ mention khi xoá đoạn đó. Các nút lưu, huỷ và xác nhận xoá trong chi tiết task là nút icon. Không thay đổi schema.

- Synced pull requests link themselves to tasks whose key (for example `DTD-6`, in any case) appears in the branch name, title or description, limited to the repository's mapped team; existing reviews pick up links on their next sync or webhook. The task's Pull requests section now stays visible and explains how to link one when it is empty. A new MCP tool `read_attachment_image` returns authorized PNG, JPEG, GIF or WebP attachments up to 5 MiB as image content, so agents can read screenshots referenced in descriptions and comments. No schema change. (#23, 6d00851d)
  VI: Pull request được đồng bộ tự liên kết với task có mã (ví dụ `DTD-6`, viết hoa hay thường đều được) xuất hiện trong tên branch, tiêu đề hoặc mô tả, giới hạn trong team được gán cho repository; review đã có sẽ được liên kết ở lần đồng bộ hoặc webhook kế tiếp. Phần Pull requests của task luôn hiển thị và hướng dẫn cách liên kết khi còn trống. Tool MCP mới `read_attachment_image` trả về ảnh đính kèm PNG, JPEG, GIF hoặc WebP tối đa 5 MiB mà connection có quyền đọc, dưới dạng nội dung ảnh, để agent đọc được ảnh chụp trong mô tả và comment. Không thay đổi schema.

### Security

- Project updates, AI scheduling and assignment notes tell the model that workspace records are data, not instructions, and text in attached files or news items can no longer close the block that marks it as untrusted. (DTD-299, #150, f04c7124)
  VI: Project update, xếp lịch AI và ghi chú phân công nói rõ với model rằng dữ liệu workspace không phải chỉ dẫn, và nội dung trong file đính kèm hay tin tức không còn đóng được khối đánh dấu dữ liệu không tin cậy. (DTD-299)

- Updating a project that belongs to no team now requires active membership of its workspace, like every other project read and write. (DTD-33, #65, c7a5cbb3)
  VI: Cập nhật dự án không thuộc team nào giờ yêu cầu là thành viên đang hoạt động của workspace, giống mọi thao tác đọc và ghi dự án khác. (DTD-33)

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
