from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any

# Delivery rows are queued whether or not the server has SMTP, so without this limit turning SMTP
# on later would send every old ticket event at once.
# VI: Dòng gửi được xếp hàng dù server có SMTP hay không, nên nếu không giới hạn thì bật SMTP sau
# VI: này sẽ gửi dồn mọi sự kiện ticket cũ.
TICKET_EMAIL_MAX_AGE = timedelta(days=1)

# Notification text -> (Vietnamese, English) wording. Unknown text falls back to a generic line.
# VI: Nội dung thông báo -> cách viết (tiếng Việt, tiếng Anh). Nội dung lạ dùng dòng chung.
ACTIONS = {
    'raised a ticket': ('đã tạo ticket', 'raised ticket'),
    'sent a message': ('đã gửi tin nhắn trên ticket', 'sent a message on ticket'),
    'added a file': ('đã thêm tệp vào ticket', 'added a file to ticket'),
    'assigned you a ticket': ('đã giao cho bạn ticket', 'assigned you ticket'),
    'resolved the ticket': ('đã giải quyết ticket', 'resolved ticket'),
    'declined the ticket': ('đã từ chối ticket', 'declined ticket'),
    'canceled the ticket': ('đã huỷ ticket', 'canceled ticket'),
    'reopened the ticket': ('đã mở lại ticket', 'reopened ticket'),
}
FALLBACK_ACTION = ('đã cập nhật ticket', 'updated ticket')


def ticket_email_allowed(target: Mapping[str, Any], now: datetime) -> bool:
    """Decides at send time, so switching email off also stops rows already queued.
    `target` is the row read by `deliver_one`. A person with no preference row has a null
    `ticket_email_enabled`, which counts as on, matching the queueing trigger.
    VI: Quyết định lúc gửi, nên tắt email cũng dừng các dòng đang chờ.
    VI: `target` là dòng do `deliver_one` đọc. Người chưa có dòng preference có
    VI: `ticket_email_enabled` null, được xem là bật, khớp với trigger xếp hàng.
    """
    if target['ticket_archived_at'] or target['created_at'] < now - TICKET_EMAIL_MAX_AGE:
        return False
    owner = target['ticket_owner'] == target['user_id']
    return bool(target['email_enabled'] or (owner and target['ticket_email_enabled'] is not False))


def _line(value: Any) -> str:
    # A line break in a header makes EmailMessage raise, and titles are free text.
    # VI: Ký tự xuống dòng trong header làm EmailMessage báo lỗi, mà tiêu đề là văn bản tự do.
    return ' '.join(str(value or '').split())


def ticket_email(target: Mapping[str, Any], app_url: str) -> tuple[str, str]:
    """Builds the subject and text of a ticket email from the notification row.
    The notification's `body` is left out on purpose: messages, decline reasons and file names
    stay inside Flowie, where access is checked. The link is the team page, which sends requesters
    on to their own page, so the sender need not know which side a recipient is on.
    VI: Dựng tiêu đề và nội dung email ticket từ dòng thông báo.
    VI: Cố ý bỏ `body` của thông báo: tin nhắn, lý do từ chối và tên tệp ở lại trong Flowie, nơi có
    VI: kiểm tra quyền. Link là trang team, trang này chuyển người yêu cầu sang trang riêng, nên
    VI: bên gửi không cần biết người nhận thuộc phía nào.
    """
    raw = target['data']
    data = json.loads(raw) if isinstance(raw, str) else raw
    code = _line(data.get('entityLabel')) or 'Service Desk'
    title = _line(data.get('title'))
    actor = _line((data.get('actor') or {}).get('name')) or 'Flowie'
    vietnamese, english = ACTIONS.get(data.get('message'), FALLBACK_ACTION)
    slug = target['workspace_slug']
    lines = [f'{actor} {vietnamese} {code}: {title}', f'{actor} {english} {code}: {title}']
    lines += [f"Trạng thái / Status: {_line(item.get('value'))}" for item in data.get('details') or []]
    lines += ['', 'Mở ticket / Open the ticket:', f"{app_url}/{slug}/service-desk/{target['entity_id']}", '']
    if target['ticket_owner'] == target['user_id']:
        lines += ['Tắt email này trên trang Service Desk / Turn these emails off on the Service Desk page:', f'{app_url}/servicedesk?workspace={slug}']
    else:
        lines.append('Manage email notifications in workspace Settings > Notifications.')
    return f'[{code}] {title}', '\n'.join(lines)
