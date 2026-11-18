"""Team automation rules (DTD-903): "when <trigger> and <conditions> then <actions>" on issues.

`create_issue` and `update_issue` stage one event row per trigger inside the user's transaction,
and only when the team has an enabled rule for it, so a team without rules writes nothing extra.
After commit, a worker leases each event and runs every matching rule in its own transaction,
through the same issue and comment services people use, acting as the person who saved the rule
last. A failing rule is rolled back and logged in the run history; it never undoes the user's
change or blocks the other rules. A rule never re-triggers itself and rule chains stop at
`MAX_DEPTH`, so two rules that undo each other cannot loop.

VI: Rule tự động hoá cấp team (DTD-903): "khi <trigger> và <điều kiện> thì <hành động>" trên issue.
VI: `create_issue` và `update_issue` ghi một dòng sự kiện cho mỗi trigger trong transaction của
VI: người dùng, và chỉ khi team có rule đang bật cho trigger đó, nên team không có rule không ghi
VI: thêm gì. Sau commit, worker lease từng sự kiện và chạy mỗi rule khớp trong transaction riêng,
VI: qua đúng service issue và comment mà người dùng dùng, với quyền của người lưu rule gần nhất.
VI: Rule lỗi được rollback và ghi vào lịch sử chạy; nó không bao giờ huỷ thay đổi của người dùng
VI: hay chặn các rule khác. Rule không tự kích hoạt lại chính nó và chuỗi rule dừng ở `MAX_DEPTH`,
VI: nên hai rule đảo ngược nhau không thể lặp vô hạn.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.audit_context import audit_automation
from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..operations.heartbeats import progress
from .commands import (
    FINISH_AUTOMATION_EVENT,
    INSERT_AUTOMATION_RUN,
    LEASE_AUTOMATION_EVENT,
    PRUNE_AUTOMATION_EVENTS,
    PRUNE_AUTOMATION_RUNS,
    STAGE_AUTOMATION_EVENT,
)
from .queries import (
    HAS_ENABLED_RULES,
    ISSUE_FACTS,
    RULE_ACTOR,
    RULES_FOR_TRIGGER,
    SUBISSUES_CLOSED,
)

logger = logging.getLogger(__name__)

TRIGGERS = (
    'issue.created',
    'issue.status_changed',
    'issue.assigned',
    'issue.labeled',
    'issue.subissues_completed',
)
# Longest chain of rules triggering rules: a person's change is depth 0, a change made by a rule
# running on a depth-d event is depth d + 1, and events deeper than this are dropped.
# VI: Chuỗi rule kích hoạt rule dài nhất: thay đổi của người là độ sâu 0, thay đổi của rule chạy
# VI: trên sự kiện độ sâu d là d + 1, và sự kiện sâu hơn mức này bị bỏ.
MAX_DEPTH = 3
MAX_ATTEMPTS = 3
RETENTION = timedelta(days=30)
CLOSED_CATEGORIES = ('COMPLETED', 'CANCELED')


async def stage_automation(db: AsyncSession, team_id: str | None, issue_id: str, triggers: list[str]) -> None:
    """Queue the issue's triggers for the worker inside the caller's transaction.

    A status change also counts for `issue.subissues_completed`, because the worker derives the
    parent's event from it (a parent is always in its sub-issue's team).
    VI: Xếp các trigger của issue cho worker, trong transaction của nơi gọi. Đổi trạng thái cũng
    VI: tính cho `issue.subissues_completed`, vì worker suy ra sự kiện của issue cha từ nó (issue
    VI: cha luôn cùng team với sub-issue).
    """
    if not team_id or not triggers:
        return
    wanted = set(triggers) | ({'issue.subissues_completed'} if 'issue.status_changed' in triggers else set())
    if not (await db.execute(HAS_ENABLED_RULES, {'team_id': team_id, 'triggers': sorted(wanted)})).scalar():
        return
    run = audit_automation.get()
    now = utcnow()
    await db.execute(
        STAGE_AUTOMATION_EVENT,
        [
            {
                'id': cuid(),
                'issue_id': issue_id,
                'trigger': trigger,
                'depth': run['depth'] if run else 0,
                'source_rule_id': run['ruleId'] if run else None,
                'now': now,
            }
            for trigger in triggers
        ],
    )


def matches(conditions: dict[str, Any], issue: dict[str, Any]) -> bool:
    """Whether the issue meets every non-empty condition list (an empty list means any value).

    VI: Issue có thoả mọi danh sách điều kiện không rỗng không (danh sách rỗng là mọi giá trị).
    """
    checks = (
        ('issueTypes', issue['issue_type']),
        ('priorities', issue['priority']),
        ('projectIds', issue['project_id']),
        ('statusIds', issue['status_id']),
    )
    if any(conditions.get(key) and value not in conditions[key] for key, value in checks):
        return False
    labels = conditions.get('labelIds')
    return not labels or bool(set(labels) & set(issue['label_ids']))


async def _facts(db: AsyncSession, issue_id: str) -> dict[str, Any] | None:
    row = (await db.execute(ISSUE_FACTS, {'id': issue_id})).mappings().first()
    return dict(row) if row and row['archived_at'] is None else None


async def _apply(db: AsyncSession, rule: dict[str, Any], issue: dict[str, Any], actor: dict[str, Any]) -> str:
    """Perform the rule's actions on the issue as `actor`; return a short summary for the history.

    Field actions are merged into one `update_issue` call (one activity entry, one notification),
    and values the issue already has are left out so a rule that changes nothing writes nothing.
    VI: Thực hiện các hành động của rule trên issue với tư cách `actor`; trả tóm tắt ngắn cho lịch
    VI: sử. Các hành động đổi trường được gộp vào một lần `update_issue` (một activity, một thông
    VI: báo), và giá trị issue đã có bị bỏ qua nên rule không đổi gì thì không ghi gì.
    """
    from ...services.notification_events import create_notification_batch
    from ..notifications.outbox import stage_notifications
    from ..work_items.comments import create_comment
    from ..work_items.contracts import CreateCommentInput, UpdateIssueInput
    from ..work_items.issues import update_issue

    workspace_id = issue['workspace_id']
    fields: dict[str, Any] = {}
    labels = set(issue['label_ids'])
    comments: list[str] = []
    recipients: set[str] = set()
    for action in rule['actions']:
        kind = action.get('type')
        if kind == 'set_status' and action['statusId'] != issue['status_id']:
            fields['statusId'] = action['statusId']
        elif kind == 'assign' and action.get('userId') != issue['assignee_id']:
            fields['assigneeId'] = action.get('userId')
        elif kind == 'set_priority' and action['priority'] != issue['priority']:
            fields['priority'] = action['priority']
        elif kind == 'add_label':
            labels.add(action['labelId'])
        elif kind == 'remove_label':
            labels.discard(action['labelId'])
        elif kind == 'comment':
            comments.append(action['body'])
        elif kind == 'notify':
            recipients.update(action.get('userIds') or [])
    if labels != set(issue['label_ids']):
        fields['labelIds'] = sorted(labels)
    done: list[str] = []
    if fields:
        updated = await update_issue(issue['id'], UpdateIssueInput.model_validate(fields), workspace_id, actor, db)
        done.append('updated ' + ', '.join(fields))
        issue_view = updated['data']
    else:
        issue_view = None
    for body in comments:
        await create_comment(CreateCommentInput(workspaceId=workspace_id, issueId=issue['id'], content=body), actor, db)
    if comments:
        done.append('commented')
    if recipients:
        if issue_view is None:
            from ..work_items.issue_queries import issue_row

            issue_view = await issue_row(db, issue['id'], workspace_id, actor['id'])
        batch = await create_notification_batch(
            db,
            workspace_id=workspace_id,
            recipient_ids=recipients,
            actor=actor,
            event_type='automation.notify',
            entity_type='issue',
            entity_id=issue['id'],
            title=issue_view['title'],
            message=f'ran the automation rule "{rule["name"]}"',
            entity_path=f"/issue/{issue_view['identifier']}",
            entity_label=issue_view['identifier'],
            discord=False,
        )
        await stage_notifications(db, batch, workspace_id=workspace_id)
        done.append(f'notified {len(batch.records)}')
    return '; '.join(done) or 'No change needed'


async def _run_rule(factory: Any, rule: dict[str, Any], issue_id: str, depth: int) -> None:
    """Run one rule on one issue in its own transaction and record the outcome.

    VI: Chạy một rule trên một issue trong transaction riêng và ghi lại kết quả.
    """
    status, message = 'SUCCEEDED', ''
    token = audit_automation.set({'ruleId': rule['id'], 'name': rule['name'], 'depth': depth + 1})
    try:
        async with factory() as db:
            try:
                issue = await _facts(db, issue_id)
                # Conditions are re-read per rule: an earlier rule may have changed the issue.
                # VI: Điều kiện được đọc lại cho từng rule: rule chạy trước có thể đã đổi issue.
                if issue is None or not matches(rule['conditions'] or {}, issue):
                    return
                actor = (
                    await db.execute(RULE_ACTOR, {'user': rule['actor_id'], 'workspace': issue['workspace_id']})
                ).mappings().first()
                if actor is None:
                    raise ApiError(403, 'The person who saved this rule is no longer an active workspace member.', 'Forbidden')
                message = await _apply(db, rule, issue, dict(actor))
                await db.commit()
            except Exception as error:
                await db.rollback()
                status = 'FAILED'
                message = error.message if isinstance(error, ApiError) else type(error).__name__
                if not isinstance(error, ApiError):
                    logger.exception('Automation rule %s failed on issue %s.', rule['id'], issue_id)
    finally:
        audit_automation.reset(token)
    async with factory() as db:
        await db.execute(
            INSERT_AUTOMATION_RUN,
            {'id': cuid(), 'rule_id': rule['id'], 'issue_id': issue_id, 'status': status,
             'message': message[:500], 'now': utcnow()},
        )
        await db.commit()


async def process_one(factory: Any) -> bool:
    """Lease one staged event and run the rules it triggers; False when none is waiting.

    VI: Lease một sự kiện đã ghi và chạy các rule nó kích hoạt; trả False khi không còn sự kiện.
    """
    token, now = cuid(), utcnow()
    async with factory() as db:
        event = (
            await db.execute(
                LEASE_AUTOMATION_EVENT,
                {'lease': now + timedelta(minutes=2), 'token': token, 'now': now, 'max_attempts': MAX_ATTEMPTS},
            )
        ).mappings().first()
        await db.commit()
    if event is None:
        return False
    if event['depth'] > MAX_DEPTH:
        logger.warning('Automation chain stopped at depth %s on issue %s.', event['depth'], event['issue_id'])
    else:
        async with factory() as db:
            issue = await _facts(db, event['issue_id'])
            targets: list[tuple[str, str]] = []
            if issue is not None:
                targets.append((event['issue_id'], event['trigger']))
                if (
                    event['trigger'] == 'issue.status_changed'
                    and issue['category'] in CLOSED_CATEGORIES
                    and issue['parent_issue_id']
                    and (await db.execute(SUBISSUES_CLOSED, {'parent_id': issue['parent_issue_id']})).scalar()
                ):
                    targets.append((issue['parent_issue_id'], 'issue.subissues_completed'))
            work = [
                (dict(rule), target_id)
                for target_id, trigger in targets
                for rule in (
                    await db.execute(RULES_FOR_TRIGGER, {'team_id': issue['team_id'] if issue else None, 'trigger': trigger})
                ).mappings().all()
                if rule['id'] != event['source_rule_id']
            ]
        for rule, target_id in work:
            await _run_rule(factory, rule, target_id, event['depth'])
    async with factory() as db:
        await db.execute(FINISH_AUTOMATION_EVENT, {'id': event['id'], 'token': token, 'now': utcnow()})
        await db.commit()
    return True


async def prune(factory: Any) -> None:
    cutoff = utcnow() - RETENTION
    async with factory() as db:
        await db.execute(PRUNE_AUTOMATION_EVENTS, {'cutoff': cutoff})
        await db.execute(PRUNE_AUTOMATION_RUNS, {'cutoff': cutoff})
        await db.commit()


async def automation_loop(factory: Any, stop: asyncio.Event) -> None:
    last_prune = 0.0
    while not stop.is_set():
        try:
            if await progress(factory, 'automation-rules', process_one(factory)):
                continue
            if time.monotonic() - last_prune >= 3600:
                await prune(factory)
                last_prune = time.monotonic()
        except Exception:
            logger.exception('Automation worker failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=2)
        except TimeoutError:
            pass
