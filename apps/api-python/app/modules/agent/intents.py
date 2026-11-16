"""Rules that classify a chat message: questions, deadlines, reports, follow-up replies and capability questions.

VI: Luật phân loại tin nhắn chat: câu hỏi, deadline, báo cáo, câu trả lời tiếp nối và câu hỏi về khả năng.
"""

from __future__ import annotations

import re


def _is_overdue_issue_question(message: str) -> bool:
    normalized = message.casefold()
    overdue_terms = ('trễ hạn', 'qua han', 'quá hạn', 'overdue', 'past due', 'late issue')
    issue_terms = ('issue', 'issues', 'công việc', 'cong viec', 'task', 'tasks')
    question_terms = ('thống kê', 'bao nhiêu', 'số lượng', 'how many', 'count', 'report', 'stats', 'statistics', '?')
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return (
        any(term in normalized for term in overdue_terms)
        and any(term in normalized for term in issue_terms)
        and any(term in normalized for term in question_terms)
        and not any(term in normalized for term in creation_terms)
    )


DEADLINE_TERMS = (
    'deadline', 'đến hạn', 'den han', 'hạn chót', 'han chot', 'hết hạn', 'het han',
    'due today', 'due tomorrow', 'due this week', 'due soon', 'due date',
)
DEADLINE_WINDOW_DAYS = 7
DEADLINE_LISTED_ISSUES = 10


def _is_deadline_question(message: str) -> bool:
    """Detect a question about deadlines: due today, this week or soon.

    Such a question used to reach the planner, which cannot read issues and kept asking for the
    team and scope. Requests to create work stay with the planner, and a message naming an issue
    identifier is left to the analyst, which reads that issue.
    VI: Nhận diện câu hỏi về deadline: đến hạn hôm nay, tuần này hoặc sắp tới. Trước đây câu hỏi
    VI: này rơi vào planner, vốn không đọc được issue và cứ hỏi lại team, phạm vi. Yêu cầu tạo việc
    VI: vẫn thuộc planner, và tin nhắn nêu mã issue để analyst trả lời vì analyst đọc được issue đó.
    """
    normalized = message.casefold()
    return (
        any(term in normalized for term in DEADLINE_TERMS)
        and not WORK_REQUEST.search(normalized)
        and ISSUE_MENTION.search(normalized) is None
    )


def _is_issue_count_question(message: str) -> bool:
    normalized = message.casefold()
    count_terms = ('bao nhiêu', 'số lượng', 'how many', 'count', 'tổng số', 'thống kê')
    issue_terms = ('issue', 'issues', 'công việc', 'cong viec', 'task', 'tasks')
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return any(term in normalized for term in count_terms) and any(term in normalized for term in issue_terms) and not any(term in normalized for term in creation_terms)


def _is_issue_status_question(message: str) -> bool:
    normalized = message.casefold()
    return any(term in normalized for term in ('trạng thái', 'trang thai', 'by status', 'theo status')) and any(term in normalized for term in ('issue', 'issues', 'công việc', 'task'))


def _is_issue_assignee_question(message: str) -> bool:
    normalized = message.casefold()
    return any(term in normalized for term in ('người phụ trách', 'nguoi phu trach', 'assignee', 'assigned')) and any(term in normalized for term in ('issue', 'issues', 'công việc', 'task'))


def _is_project_progress_question(message: str) -> bool:
    normalized = message.casefold()
    return any(term in normalized for term in ('dự án', 'du an', 'project', 'projects')) and any(term in normalized for term in ('tiến độ', 'tien do', 'progress', 'hoàn thành', 'hoan thanh'))


def _is_project_delivery_question(message: str) -> bool:
    normalized = message.casefold()
    project_terms = ('dự án', 'du an', 'project', 'projects')
    delivery_terms = (
        'chậm', 'cham', 'trễ', 'tre', 'delay', 'delayed', 'late', 'at risk',
        'rủi ro', 'rui ro', 'off track', 'on track', 'ổn', 'tốt', 'tot',
        'healthy', 'on-track',
    )
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return (
        any(term in normalized for term in project_terms)
        and any(term in normalized for term in delivery_terms)
        and not any(term in normalized for term in creation_terms)
    )


def _is_stale_issue_question(message: str) -> bool:
    normalized = message.casefold()
    issue_terms = ('issue', 'issues', 'công việc', 'cong viec', 'task', 'tasks')
    stale_terms = ('treo lâu', 'treo lau', 'bị treo', 'bi treo', 'không cập nhật', 'khong cap nhat', 'stale', 'stuck', 'inactive')
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return (
        any(term in normalized for term in issue_terms)
        and any(term in normalized for term in stale_terms)
        and not any(term in normalized for term in creation_terms)
    )


def _is_initiative_delivery_question(message: str) -> bool:
    normalized = message.casefold()
    initiative_terms = ('initiative', 'initiatives', 'sáng kiến', 'sang kien')
    delivery_terms = ('chậm', 'cham', 'trễ', 'tre', 'delay', 'delayed', 'late', 'at risk', 'rủi ro', 'rui ro', 'off track')
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return (
        any(term in normalized for term in initiative_terms)
        and any(term in normalized for term in delivery_terms)
        and not any(term in normalized for term in creation_terms)
    )


def _is_cycle_progress_question(message: str) -> bool:
    normalized = message.casefold()
    return any(term in normalized for term in ('cycle', 'cycles', 'chu kỳ', 'chu ky', 'sprint')) and any(term in normalized for term in ('tiến độ', 'tien do', 'progress', 'hoàn thành', 'hoan thanh', 'status'))


def _is_workload_question(message: str) -> bool:
    normalized = message.casefold()
    workload_terms = (
        'workload', 'khối lượng', 'khoi luong', 'quá tải', 'qua tai', 'overloaded',
        'capacity', 'ai đang bận', 'ai dang ban', 'ai rảnh', 'ai ranh', 'bận rộn', 'ban ron',
        'tải công việc', 'tai cong viec',
    )
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return any(term in normalized for term in workload_terms) and not any(
        term in normalized for term in creation_terms
    )


# Matches whole words so "address" and "created" do not count, and skips forms that describe work
# instead of asking for it: "ai tạo FL-12", "đang thêm", "the plan". "xử lý" stays out because the
# planner only drafts items, so a message about handling a task loses nothing as a question.
# VI: Khớp từ nguyên nên "address", "created" không tính, và bỏ qua dạng mô tả công việc thay vì
# VI: yêu cầu: "ai tạo FL-12", "đang thêm", "the plan". Không có "xử lý" vì planner chỉ soạn nháp,
# VI: nên tin nhắn về việc xử lý task không mất gì khi được coi là câu hỏi.
WORK_REQUEST = re.compile(
    r'(?<!\w)(?<!đang )(?<!đã )(?<!được )(?<!chưa )(?<!sẽ )(?<!ai )'
    r'(?:create|draft|add|tạo|lập|thêm|viết)(?!\w)'
    r'|(?<!\w)(?<!the )(?<!a )(?<!our )(?<!my )(?<!this )plan(?!\w)'
)
ISSUE_MENTION = re.compile(r'(?<![\w-])[a-z][a-z0-9]+-\d+(?![\w-])', re.IGNORECASE)
REPORT_TERMS = ('báo cáo', 'bao cao', 'report', 'briefing')
REPORT_SCOPE_TERMS = (
    'lãnh đạo', 'lanh dao', 'chi tiết', 'chi tiet', 'tổng hợp', 'tong hop', 'tổng quan', 'tong quan',
    'tình hình', 'tinh hinh', 'tuần', 'tuan', 'tháng', 'thang', 'leadership', 'executive', 'management',
    'detailed', 'overview', 'status', 'weekly', 'monthly',
)
# "tạo issue báo cáo lỗi…" asks for work items, not a report about them.
# VI: "tạo issue báo cáo lỗi…" là yêu cầu tạo việc, không phải yêu cầu báo cáo.
WORK_ITEM_CREATION = re.compile(
    r'(tạo|lập|thêm|create|add|draft)\s+(\d+\s+)?(issue|task|project|dự án|du an|công việc|cong viec)'
)
OPEN_QUESTION_TERMS = (
    'thế nào', 'the nao', 'ra sao', 'tình hình', 'tinh hinh', 'tại sao', 'tai sao', 'vì sao', 'vi sao',
    'khi nào', 'khi nao', 'bao giờ', 'bao gio', 'ai đang', 'ai dang', 'ai làm', 'ai lam', 'có ổn', 'có kịp',
    'how ', 'what ', 'which ', 'why ', 'when ', 'who ', 'is there', 'are there',
)


def _is_report_request(message: str) -> bool:
    """Detect a request for a written leadership/status report.

    Creation verbs are allowed ("tạo báo cáo chi tiết") because the report is
    the thing being made; only creating issues/projects is excluded.
    VI: Nhận diện yêu cầu viết báo cáo lãnh đạo/tình hình. Cho phép động từ
    VI: tạo ("tạo báo cáo chi tiết") vì thứ được tạo là báo cáo; chỉ loại trừ
    VI: yêu cầu tạo issue/dự án.
    """
    normalized = message.casefold()
    return (
        any(term in normalized for term in REPORT_TERMS)
        and any(term in normalized for term in REPORT_SCOPE_TERMS)
        and not WORK_ITEM_CREATION.search(normalized)
    )


def _is_open_question(message: str) -> bool:
    """Detect a free-form question the fixed reports did not match.

    Such a question used to fall through to the issue planner; it is answered
    from workspace facts instead. A message matching ``WORK_REQUEST`` stays a plan.
    VI: Nhận diện câu hỏi tự do không khớp báo cáo cố định. Trước đây câu hỏi
    VI: này rơi vào luồng lập kế hoạch; nay được trả lời từ số liệu workspace.
    VI: Tin nhắn khớp ``WORK_REQUEST`` vẫn là yêu cầu lập kế hoạch.
    """
    normalized = message.casefold().strip()
    if WORK_REQUEST.search(normalized):
        return False
    return (
        normalized.endswith('?')
        or any(term in normalized for term in OPEN_QUESTION_TERMS)
        or ISSUE_MENTION.search(normalized) is not None
    )


def _is_vietnamese(message: str) -> bool:
    normalized = message.casefold()
    vietnamese_terms = ('bạn', 'ban ', 'giúp', 'giup', 'cho tôi', 'cho toi', 'có thể', 'co the', 'làm gì', 'lam gi')
    return any(term in normalized for term in vietnamese_terms)


def _is_capability_question(message: str) -> bool:
    normalized = message.casefold().strip()
    creation_terms = ('create ', 'draft ', 'plan ', 'add ', 'tạo ', 'lập ', 'thêm ', 'viết ', 'xử lý ')
    capability_terms = (
        'bạn có thể', 'ban co the', 'bạn giúp', 'ban giup', 'giúp gì', 'giup gi',
        'what can you', 'what do you do', 'how can you help', 'can you help me',
    )
    return any(term in normalized for term in capability_terms) and not any(
        term in normalized for term in creation_terms
    )


def _capability_response(message: str) -> str:
    if _is_vietnamese(message):
        return (
            'Tôi có thể giúp bạn lập kế hoạch và tạo project hoặc issue sau khi bạn duyệt, '
            'đọc file Markdown, DOCX hoặc XLSX để đề xuất công việc, trả lời câu hỏi về tiến độ, '
            'workload, tình hình dự án và viết báo cáo chi tiết cho lãnh đạo khi công cụ tương ứng '
            'được cài đặt. Bạn muốn bắt đầu với việc nào?'
        )
    return (
        'I can draft projects and issues for your approval, read Markdown, DOCX, or XLSX '
        'files to propose work, answer questions about progress, workload and project status, '
        'and write detailed leadership reports when the corresponding tool is installed. '
        'What would you like to work on?'
    )


def _is_assignment_request(message: str) -> bool:
    normalized = message.casefold()
    assign_terms = (
        'phân công', 'phan cong', 'phân bổ', 'phan bo', 'gán việc', 'gan viec',
        'giao việc', 'giao viec', 'đề xuất người', 'de xuat', 'gợi ý người', 'goi y',
        'assign', 'auto-assign', 'auto assign', 'suggest assignee', 'recommend assignee',
    )
    creation_terms = ('create', 'draft', 'plan', 'add', 'tạo', 'lập', 'thêm', 'viết', 'xử lý')
    return any(term in normalized for term in assign_terms) and not any(
        term in normalized for term in creation_terms
    )


def _is_bare_creation_request(message: str) -> bool:
    normalized = message.casefold().strip(' .?!')
    return normalized in {
        'tạo dự án', 'tao du an', 'tạo project', 'tao project', 'create project', 'create a project',
        'tạo issue', 'tao issue', 'create issue', 'create an issue', 'tạo công việc', 'tao cong viec',
    }


