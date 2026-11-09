from __future__ import annotations

import json
from datetime import timedelta
from typing import Any, Literal

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..core.utc_responses import UtcAPIRouter as APIRouter
from ..db.session import get_session
from ..modules.notifications.outbox import stage_notifications
from ..services.notification_events import (
    create_notification_batch,
    project_teams_batch,
    team_recipient_ids,
)
from .auth import _cuid, _utcnow, current_user
from .native_issues import CreateIssueInput, create_issue
from .native_projects import _team_access, _workspace_access
from .service_desk_assistant import AssistantQuestion, answer_question, assistant_status

router = APIRouter(prefix='/api/v1/asks', tags=['asks'])
TICKET_FILE_NOTICE_GAP = timedelta(seconds=60)
AskPriority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
AskScope = Literal['team', 'mine']
TicketAction = Literal['resolve', 'decline', 'reopen', 'cancel']
CLOSED_TICKET_STATUSES = {'done', 'canceled', 'declined'}
# Action -> Ask status, the label it leads to, the notification text and the audit action.
# VI: Thao tác -> trạng thái Ask, nhãn đạt được, nội dung thông báo và hành động audit.
TRANSITIONS: dict[str, tuple[str, str, str, str]] = {
    'resolve': ('resolved', 'done', 'resolved the ticket', 'ask.resolved'),
    'decline': ('declined', 'declined', 'declined the ticket', 'ask.declined'),
    'cancel': ('canceled', 'canceled', 'canceled the ticket', 'ask.canceled'),
    'reopen': ('open', 'received', 'reopened the ticket', 'ask.reopened'),
}


class CreateAskInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    projectId: str | None = None
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    priority: AskPriority = 'NONE'


class UpdateAskInput(BaseModel):
    teamId: str | None = None
    projectId: str | None = None
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    priority: AskPriority | None = None
    assigneeId: str | None = None


class AskMessageInput(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class AskTransitionInput(BaseModel):
    action: TicketAction
    message: str | None = Field(default=None, max_length=10_000)


async def _role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspace_id, 'user_id': user_id})
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')
    return role


async def _accepts_tickets(db: AsyncSession, workspace_id: str, team_id: str, project_id: str | None) -> bool:
    if not project_id:
        return False
    result = await db.execute(text('''SELECT 1 FROM projects project JOIN teams team ON team.id = project.team_id
                                      WHERE project.id = :project_id AND project.workspace_id = :workspace_id AND project.team_id = :team_id
                                      AND project.service_desk_enabled AND project.archived_at IS NULL AND team.archived_at IS NULL'''), {'project_id': project_id, 'workspace_id': workspace_id, 'team_id': team_id})
    return result.scalar_one_or_none() is not None


async def _references(db: AsyncSession, workspace_id: str, team_id: str, project_id: str | None, user_id: str) -> None:
    # A Service Desk project opens intake to the whole workspace; callers have already checked membership.
    # VI: Dự án bật Service Desk mở tiếp nhận cho cả workspace; caller đã kiểm tra thành viên trước khi gọi.
    if await _accepts_tickets(db, workspace_id, team_id, project_id):
        return
    await _team_access(db, workspace_id, team_id, user_id)
    if project_id:
        result = await db.execute(text('''SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                                          AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id)'''), {'project_id': project_id, 'workspace_id': workspace_id, 'team_id': team_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Ask project not found for this team.', 'Not Found')


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, ask_id: str, metadata: dict[str, Any]) -> None:
    await db.execute(text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                             VALUES (:id, :workspace_id, :actor_id, :action, 'ask', :entity_id, CAST(:metadata AS jsonb), :now)'''), {'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'entity_id': ask_id, 'metadata': json.dumps(metadata), 'now': _utcnow()})


def _identifier(number: int) -> str:
    return f'SD-{number}'


def reopen_pending(ask_status: str, issue_category: str | None, reopened_at: Any, issue_closed_at: Any) -> bool:
    """True while a reopened ticket's issue is still closed and no team member has decided yet.
    Nothing has to clear this: returning the issue to work changes the category, and closing it
    again moves `issue_closed_at` past `reopened_at`, so the ticket follows the issue once more.
    A missing closing time keeps the ticket with the team, which is the safe side.
    VI: Đúng khi ticket đã mở lại mà Issue vẫn đóng và chưa ai trong team quyết định.
    VI: Không cần xoá cờ nào: chuyển Issue về đang làm thì category đổi, còn đóng lại thì
    VI: `issue_closed_at` vượt `reopened_at`, nên ticket lại theo Issue.
    VI: Thiếu thời điểm đóng thì ticket ở lại với team, đây là hướng an toàn.
    """
    return ask_status == 'accepted' and issue_category in {'COMPLETED', 'CANCELED'} and reopened_at is not None and (issue_closed_at is None or reopened_at > issue_closed_at)


def ticket_status(ask_status: str, issue_category: str | None, awaiting_requester: bool = False, reopened: bool = False) -> str:
    """Maps an Ask and its linked issue's status category to the label a requester sees.
    A deleted issue leaves no category and reads as received, so a handler looks at the ticket again.
    `awaiting_requester` only applies while work is open; a closed ticket has nothing to answer.
    `reopened` comes from `reopen_pending` and ignores the closed issue until the team decides.
    VI: Quy đổi Ask và category trạng thái của Issue liên kết thành nhãn người yêu cầu thấy.
    VI: Issue đã xoá không còn category và được xem là đã nhận, để người xử lý xem lại ticket.
    VI: `awaiting_requester` chỉ có tác dụng khi việc còn mở; ticket đã đóng không cần trả lời.
    VI: `reopened` lấy từ `reopen_pending`, bỏ qua Issue đã đóng cho tới khi team quyết định.
    """
    closed_by_ask = {'declined': 'declined', 'resolved': 'done', 'canceled': 'canceled'}.get(ask_status)
    if closed_by_ask:
        return closed_by_ask
    status = {'STARTED': 'in_progress', 'COMPLETED': 'done', 'CANCELED': 'canceled'}.get('' if reopened else issue_category or '', 'received')
    return 'waiting_for_you' if awaiting_requester and status in {'received', 'in_progress'} else status


async def _ask(db: AsyncSession, ask_id: str, workspace_id: str) -> dict[str, Any]:
    result = await db.execute(text('''SELECT ask.*, team.id AS team_id_value, team.name AS team_name, team.identifier AS team_identifier, team.icon AS team_icon,
                                      project.id AS project_id_value, project.name AS project_name, project.identifier AS project_identifier,
                                      creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url,
                                      issue.id AS issue_id_value, issue.identifier AS issue_identifier, issue.title AS issue_title, COALESCE(issue.completed_at, issue.canceled_at) AS issue_closed_at, issue_status.category AS issue_category, assignee.name AS assignee_name, assignee.avatar_url AS assignee_avatar_url,
                                      (SELECT message.author_id FROM ask_messages message WHERE message.ask_id = ask.id ORDER BY message.created_at DESC, message.id DESC LIMIT 1) AS last_message_author
                               FROM asks ask JOIN teams team ON team.id = ask.team_id JOIN users creator ON creator.id = ask.created_by
                               LEFT JOIN projects project ON project.id = ask.project_id LEFT JOIN issues issue ON issue.id = ask.converted_issue_id LEFT JOIN issue_statuses issue_status ON issue_status.id = issue.status_id LEFT JOIN users assignee ON assignee.id = ask.assignee_id
                               WHERE ask.id = :ask_id AND ask.workspace_id = :workspace_id AND ask.archived_at IS NULL'''), {'ask_id': ask_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Ask not found.', 'Not Found')
    pending = reopen_pending(row['status'], row['issue_category'], row['reopened_at'], row['issue_closed_at'])
    return {'id': row['id'], 'number': row['number'], 'identifier': _identifier(row['number']), 'workspaceId': row['workspace_id'], 'teamId': row['team_id'], 'projectId': row['project_id'], 'title': row['title'], 'description': row['description'], 'priority': row['priority'], 'status': row['status'], 'ticketStatus': ticket_status(row['status'], row['issue_category'], row['last_message_author'] not in {None, row['created_by']}, pending), 'reopenPending': pending, 'createdById': row['created_by'], 'assigneeId': row['assignee_id'], 'assignee': {'id': row['assignee_id'], 'name': row['assignee_name'], 'avatarUrl': row['assignee_avatar_url']} if row['assignee_id'] else None, 'convertedIssueId': row['converted_issue_id'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
            'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier'], 'icon': row['team_icon']},
            'project': {'id': row['project_id_value'], 'name': row['project_name'], 'identifier': row['project_identifier'], 'team': {'id': row['team_id']} if row['team_id'] else None} if row['project_id_value'] else None,
            'createdBy': {'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url']},
            'convertedIssue': {'id': row['issue_id_value'], 'identifier': row['issue_identifier'], 'title': row['issue_title']} if row['issue_id_value'] else None}


def _requester_view(ask: dict[str, Any]) -> dict[str, Any]:
    # Requesters follow progress through ticketStatus; the issue itself stays with the team.
    # VI: Người yêu cầu theo dõi tiến độ qua ticketStatus; bản thân Issue chỉ dành cho team.
    return {key: value for key, value in ask.items() if key not in {'convertedIssueId', 'convertedIssue', 'reopenPending'}}


async def _is_handler(db: AsyncSession, ask: dict[str, Any], workspace_id: str, user_id: str) -> bool:
    if await _role(db, workspace_id, user_id) in {'OWNER', 'ADMIN'}:
        return True
    result = await db.execute(text('SELECT 1 FROM team_members WHERE team_id = :team_id AND user_id = :user_id'), {'team_id': ask['teamId'], 'user_id': user_id})
    return result.scalar_one_or_none() is not None


async def _manage(db: AsyncSession, ask: dict[str, Any], workspace_id: str, user_id: str) -> None:
    # Authorship alone is not enough: a creator who left the workspace keeps no access to the ticket.
    # VI: Là người tạo thôi chưa đủ: người tạo đã rời workspace không còn quyền với ticket.
    await _workspace_access(db, workspace_id, user_id)
    if ask['createdById'] != user_id and not await _is_handler(db, ask, workspace_id, user_id):
        raise ApiError(403, 'Only the creator, a team member or a workspace administrator can manage this Ask.', 'Forbidden')


async def _triage(db: AsyncSession, ask: dict[str, Any], workspace_id: str, user_id: str) -> None:
    if not await _is_handler(db, ask, workspace_id, user_id):
        raise ApiError(403, 'Only a team member or a workspace administrator can decide on this Ask.', 'Forbidden')


@router.get('/service-desk-projects')
async def list_service_desk_projects(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    # The one project read open to people outside the team, so it returns only what the ticket form needs.
    # VI: Đây là API đọc dự án duy nhất mở cho người ngoài team, nên chỉ trả những gì form ticket cần.
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(text('''SELECT project.id, project.name, project.team_id FROM projects project JOIN teams team ON team.id = project.team_id
                                      WHERE project.workspace_id = :workspace_id AND project.service_desk_enabled
                                      AND project.archived_at IS NULL AND team.archived_at IS NULL ORDER BY project.name'''), {'workspace_id': workspaceId})
    return {'data': [{'id': row['id'], 'name': row['name'], 'teamId': row['team_id']} for row in result.mappings().all()]}


@router.get('/assistant/status')
async def get_assistant_status(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _role(db, workspaceId, user['id'])
    return {'data': await assistant_status(db, workspaceId)}


@router.post('/assistant')
async def ask_assistant(payload: AssistantQuestion, request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    # Any active member may ask, like raising a ticket; what the answer can draw on is limited by the knowledge scope.
    # VI: Mọi thành viên còn ACTIVE đều hỏi được, như khi tạo ticket; nội dung trả lời bị giới hạn bởi phạm vi tri thức.
    await _role(db, payload.workspaceId, user['id'])
    return {'data': await answer_question(request.app.state.settings, db, payload, user['id'])}


@router.get('')
async def list_asks(workspaceId: str = Query(min_length=1), scope: AskScope = 'team', user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    if scope == 'mine':
        result = await db.execute(text('''SELECT id FROM asks WHERE workspace_id = :workspace_id AND archived_at IS NULL AND created_by = :user_id ORDER BY updated_at DESC'''), {'workspace_id': workspaceId, 'user_id': user['id']})
        return {'data': [_requester_view(await _ask(db, row['id'], workspaceId)) for row in result.mappings().all()]}
    result = await db.execute(text('''SELECT ask.id FROM asks ask JOIN team_members member ON member.team_id = ask.team_id
                                      WHERE ask.workspace_id = :workspace_id AND ask.archived_at IS NULL AND member.user_id = :user_id ORDER BY ask.updated_at DESC'''), {'workspace_id': workspaceId, 'user_id': user['id']})
    return {'data': [await _ask(db, row['id'], workspaceId) for row in result.mappings().all()]}


def _transition_allowed(action: str, ask: dict[str, Any], handler: bool, user_id: str) -> None:
    """Raises unless this person may run `action` on the ticket now; callers have passed `_manage`.
    Requesters reopen what they or the normal flow closed, but a decline or an issue the team
    canceled is the team's decision. An open ticket here means not converted and not closed.
    VI: Báo lỗi nếu người này không được chạy `action` trên ticket lúc này; caller đã qua `_manage`.
    VI: Người yêu cầu mở lại được ticket đã xong hoặc tự huỷ, còn từ chối hay Issue bị team huỷ
    VI: là quyết định của team. Ticket đang mở ở đây là chưa chuyển Issue và chưa đóng.
    """
    is_open = ask['status'] == 'open'
    creator = ask['createdById'] == user_id
    if action == 'cancel':
        permitted, applicable = creator, is_open
    elif action == 'reopen':
        permitted = handler or (creator and (ask['ticketStatus'] == 'done' or ask['status'] == 'canceled'))
        applicable = ask['ticketStatus'] in CLOSED_TICKET_STATUSES
    else:
        permitted, applicable = handler, is_open or (action == 'resolve' and ask['reopenPending'])
    if not permitted:
        raise ApiError(403, 'You cannot change this ticket this way.', 'Forbidden')
    if not applicable:
        raise ApiError(400, 'This ticket cannot be changed this way in its current status.', 'Bad Request')


async def _parties(db: AsyncSession, ask: dict[str, Any]) -> set[str]:
    # An assignee takes over from the team, unless they have left it and nobody would hear the news.
    # VI: Người được giao thay cả team nhận tin, trừ khi họ đã rời team và tin sẽ không tới ai.
    team = await team_recipient_ids(db, ask['teamId'])
    return ({ask['assigneeId']} if ask['assigneeId'] in team else team) | {ask['createdById']}


async def _add_message(db: AsyncSession, ask_id: str, author_id: str, content: str, now: Any) -> str:
    message_id = _cuid()
    await db.execute(text('INSERT INTO ask_messages (id, ask_id, author_id, content, created_at) VALUES (:id, :ask_id, :author_id, :content, :now)'), {'id': message_id, 'ask_id': ask_id, 'author_id': author_id, 'content': content, 'now': now})
    return message_id


@router.post('')
async def create_ask(payload: CreateAskInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _references(db, payload.workspaceId, payload.teamId, payload.projectId, user['id'])
    ask_id, now = _cuid(), _utcnow()
    # The row lock lasts until commit, so concurrent tickets in a workspace take numbers in turn.
    # VI: Khoá dòng giữ đến khi commit, nên các ticket tạo đồng thời trong workspace lấy số lần lượt.
    number = (await db.execute(text('UPDATE workspaces SET ticket_sequence = ticket_sequence + 1 WHERE id = :id RETURNING ticket_sequence'), {'id': payload.workspaceId})).scalar_one()
    await db.execute(text('''INSERT INTO asks (id, number, workspace_id, team_id, project_id, title, description, priority, status, notified_ticket_status, created_by, created_at, updated_at)
                             VALUES (:id, :number, :workspace_id, :team_id, :project_id, :title, :description, :priority, 'open', 'received', :created_by, :now, :now)'''), {'id': ask_id, 'number': number, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'project_id': payload.projectId, 'title': payload.title.strip(), 'description': payload.description.strip() if payload.description else None, 'priority': payload.priority, 'created_by': user['id'], 'now': now})
    await _audit(db, payload.workspaceId, user['id'], 'ask.created', ask_id, {'title': payload.title.strip(), 'teamId': payload.teamId})
    # Only Service Desk intake reaches the team's Inbox; Asks a team files for itself stay quiet.
    # VI: Chỉ ticket từ Service Desk mới báo vào Inbox của team; Ask do team tự tạo thì không báo.
    if await _accepts_tickets(db, payload.workspaceId, payload.teamId, payload.projectId):
        batch = await create_notification_batch(db, workspace_id=payload.workspaceId, recipient_ids=await team_recipient_ids(db, payload.teamId), actor=user,
                                                event_type='ticket.created', entity_type='ticket', entity_id=ask_id, title=payload.title.strip(), message='raised a ticket',
                                                entity_path=f'/service-desk/{ask_id}', entity_label=_identifier(number), body=payload.description, discord=False)
        channel = await project_teams_batch(db, payload.workspaceId, payload.projectId, actor=user, event_type='ticket.created', entity_type='ticket', title=payload.title.strip(), message='raised a ticket',
                                            entity_path=f'/service-desk/{ask_id}', entity_label=_identifier(number))
        await stage_notifications(db, batch, channel, workspace_id=payload.workspaceId)
    await db.commit()
    return {'data': await _ask(db, ask_id, payload.workspaceId)}


@router.patch('/{ask_id}')
async def update_ask(ask_id: str, payload: UpdateAskInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    if ask['status'] != 'open': raise ApiError(400, 'Only open tickets can be edited.', 'Bad Request')
    values = payload.model_dump(exclude_unset=True)
    if 'assigneeId' in values: await _triage(db, ask, workspaceId, user['id'])
    team_id, project_id = values.get('teamId', ask['teamId']), values.get('projectId', ask['projectId'])
    await _references(db, workspaceId, team_id, project_id, user['id'])
    # An assignee belongs to the ticket's team, so moving the ticket clears the old one.
    # VI: Người được giao thuộc team của ticket, nên chuyển ticket sang team khác sẽ bỏ giao.
    if team_id != ask['teamId'] and 'assigneeId' not in values: values['assigneeId'] = None
    if values.get('assigneeId') and values['assigneeId'] not in await team_recipient_ids(db, team_id):
        raise ApiError(400, 'A ticket can only be assigned to a member of its team.', 'Bad Request')
    columns = {'teamId': 'team_id', 'projectId': 'project_id', 'title': 'title', 'description': 'description', 'priority': 'priority', 'assigneeId': 'assignee_id'}
    sets, params = [], {'ask_id': ask_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            value = values[field]
            if field == 'title' and isinstance(value, str): value = value.strip()
            if field == 'description' and isinstance(value, str): value = value.strip() or None
            params[field] = value; sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE asks SET {', '.join(sets)}, updated_at = :now WHERE id = :ask_id"), params)
        await _audit(db, workspaceId, user['id'], 'ask.updated', ask_id, values)
        if values.get('assigneeId') and values['assigneeId'] != ask['assigneeId']:
            batch = await create_notification_batch(db, workspace_id=workspaceId, recipient_ids={values['assigneeId']}, actor=user, event_type='ticket.assigned', entity_type='ticket', entity_id=ask_id,
                                                    title=values.get('title', ask['title']), message='assigned you a ticket', entity_path=f'/service-desk/{ask_id}', entity_label=ask['identifier'], discord=False)
            await stage_notifications(db, batch, workspace_id=workspaceId)
        await db.commit()
    return {'data': await _ask(db, ask_id, workspaceId)}


@router.post('/{ask_id}/transition')
async def transition_ask(ask_id: str, payload: AskTransitionInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    handler = await _is_handler(db, ask, workspaceId, user['id'])
    _transition_allowed(payload.action, ask, handler, user['id'])
    content = (payload.message or '').strip()
    if payload.action in {'decline', 'reopen'} and not content:
        raise ApiError(400, 'Say why, so the other side knows what to do next.', 'Bad Request')
    status, label, notice, audit_action = TRANSITIONS[payload.action]
    # A reopened converted ticket keeps its issue, so it returns to accepted rather than open.
    # VI: Ticket đã chuyển Issue khi mở lại vẫn giữ Issue, nên về accepted thay vì open.
    if payload.action == 'reopen' and ask['convertedIssueId']: status = 'accepted'
    now = _utcnow()
    # Matching the old status stops two people from overriding each other. Writing the label here
    # keeps the ticket-status job from repeating this news, or telling someone what they just did.
    # VI: Khớp trạng thái cũ để hai người không ghi đè nhau. Ghi nhãn tại đây để job ticket-status
    # VI: không báo lại tin này, cũng không báo cho người vừa tự thao tác.
    changed = await db.execute(text('''UPDATE asks SET status = :status, notified_ticket_status = :label, updated_at = :now,
                                       reopened_at = CASE WHEN :reopen THEN CAST(:now AS timestamp) ELSE reopened_at END
                                       WHERE id = :ask_id AND status = :current'''), {'status': status, 'label': label, 'now': now, 'reopen': payload.action == 'reopen', 'ask_id': ask_id, 'current': ask['status']})
    if changed.rowcount == 0:
        await db.rollback()
        raise ApiError(409, 'This ticket has just changed. Reload it and try again.', 'Conflict')
    if content: await _add_message(db, ask_id, user['id'], content, now)
    await _audit(db, workspaceId, user['id'], audit_action, ask_id, {'from': ask['status']})
    batch = await create_notification_batch(db, workspace_id=workspaceId, recipient_ids=await _parties(db, ask), actor=user, event_type='ticket.status_changed', entity_type='ticket', entity_id=ask_id,
                                            title=ask['title'], message=notice, entity_path=f'/service-desk/{ask_id}', entity_label=ask['identifier'], body=content or None, discord=False)
    await stage_notifications(db, batch, workspace_id=workspaceId)
    await db.commit()
    updated = await _ask(db, ask_id, workspaceId)
    return {'data': updated if handler else _requester_view(updated)}


@router.post('/{ask_id}/convert')
async def convert_ask(ask_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _triage(db, ask, workspaceId, user['id'])
    if ask['convertedIssueId']: return {'data': ask}
    if ask['status'] != 'open': raise ApiError(400, 'Only open tickets can be converted.', 'Bad Request')
    issue = await create_issue(CreateIssueInput(workspaceId=workspaceId, teamId=ask['teamId'], projectId=ask['projectId'], title=ask['title'], description=ask['description'], priority=ask['priority'], assigneeId=ask['assigneeId']), user, db)
    issue_data = issue['data']
    await db.execute(text("UPDATE asks SET status = 'accepted', converted_issue_id = :issue_id, updated_at = :now WHERE id = :ask_id"), {'issue_id': issue_data['id'], 'ask_id': ask_id, 'now': _utcnow()})
    await _audit(db, workspaceId, user['id'], 'ask.converted', ask_id, {'issueId': issue_data['id'], 'identifier': issue_data['identifier']}); await db.commit()
    return {'data': await _ask(db, ask_id, workspaceId)}


def _message(row: Any) -> dict[str, Any]:
    return {'id': row['id'], 'askId': row['ask_id'], 'content': row['content'], 'createdAt': row['created_at'], 'author': {'id': row['author_id'], 'name': row['author_name'], 'avatarUrl': row['author_avatar_url']}}


MESSAGE_COLUMNS = 'message.id, message.ask_id, message.content, message.created_at, message.author_id, author.name AS author_name, author.avatar_url AS author_avatar_url'


@router.get('/by-issue/{issue_id}')
async def ticket_for_issue(issue_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, str] | None]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(text('SELECT id FROM asks WHERE converted_issue_id = :issue_id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'issue_id': issue_id, 'workspace_id': workspaceId})
    ask_id = result.scalar_one_or_none()
    if ask_id is None:
        return {'data': None}
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    return {'data': {'id': ask['id'], 'title': ask['title']}}


@router.get('/{ask_id}/messages')
async def list_ask_messages(ask_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    result = await db.execute(text(f'''SELECT {MESSAGE_COLUMNS} FROM ask_messages message JOIN users author ON author.id = message.author_id
                                       WHERE message.ask_id = :ask_id ORDER BY message.created_at, message.id'''), {'ask_id': ask_id})
    return {'data': [_message(row) for row in result.mappings().all()]}


@router.post('/{ask_id}/messages')
async def create_ask_message(ask_id: str, payload: AskMessageInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    content = payload.content.strip()
    if not content: raise ApiError(400, 'A message cannot be empty.', 'Bad Request')
    now = _utcnow()
    message_id = await _add_message(db, ask_id, user['id'], content, now)
    await db.execute(text('UPDATE asks SET updated_at = :now WHERE id = :ask_id'), {'now': now, 'ask_id': ask_id})
    await _audit(db, workspaceId, user['id'], 'ask.message_created', ask_id, {'messageId': message_id})
    # discord=False keeps a requester's conversation out of the shared team channels.
    # VI: discord=False giữ trao đổi của người yêu cầu ngoài các kênh chung của team.
    batch = await create_notification_batch(db, workspace_id=workspaceId, recipient_ids=await _parties(db, ask), actor=user,
                                            event_type='ticket.message', entity_type='ticket', entity_id=ask_id, title=ask['title'], message='sent a message',
                                            entity_path=f'/service-desk/{ask_id}', entity_label=ask['identifier'], body=content, discord=False)
    await stage_notifications(db, batch, workspace_id=workspaceId)
    await db.commit()
    result = await db.execute(text(f'SELECT {MESSAGE_COLUMNS} FROM ask_messages message JOIN users author ON author.id = message.author_id WHERE message.id = :id'), {'id': message_id})
    return {'data': _message(result.mappings().one())}


async def record_ticket_file(db: AsyncSession, ask_id: str, workspace_id: str, user: Any, filename: str) -> None:
    """Brings a ticket forward and tells the other side about a new file, in the upload's transaction.
    Files arrive one request at a time, so one person's burst, or the files sent with a new ticket,
    would otherwise become a row per file. The caller has authorized the upload.
    VI: Đưa ticket lên trước và báo bên còn lại có file mới, trong transaction của lần tải lên.
    VI: File tới theo từng request, nên một đợt tải của một người, hoặc file gửi kèm ticket mới, sẽ
    VI: thành một dòng cho mỗi file nếu không gom lại. Caller đã kiểm tra quyền tải lên.
    """
    ask = await _ask(db, ask_id, workspace_id)
    now = _utcnow()
    recent = await db.execute(text('''SELECT 1 FROM audit_logs WHERE entity_type = 'ask' AND entity_id = :ask_id AND actor_id = :user_id
                                      AND action IN ('ask.created', 'ask.file_added') AND created_at > :since LIMIT 1'''), {'ask_id': ask_id, 'user_id': user['id'], 'since': now - TICKET_FILE_NOTICE_GAP})
    await db.execute(text('UPDATE asks SET updated_at = :now WHERE id = :ask_id'), {'now': now, 'ask_id': ask_id})
    await _audit(db, workspace_id, user['id'], 'ask.file_added', ask_id, {'filename': filename})
    if recent.scalar_one_or_none() is None:
        batch = await create_notification_batch(db, workspace_id=workspace_id, recipient_ids=await _parties(db, ask), actor=user, event_type='ticket.attachment', entity_type='ticket', entity_id=ask_id,
                                                title=ask['title'], message='added a file', entity_path=f'/service-desk/{ask_id}', entity_label=ask['identifier'], body=filename, discord=False)
        await stage_notifications(db, batch, workspace_id=workspace_id)


@router.delete('/{ask_id}')
async def archive_ask(ask_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _triage(db, ask, workspaceId, user['id'])
    now = _utcnow(); await db.execute(text('UPDATE asks SET archived_at = :now, updated_at = :now WHERE id = :ask_id'), {'ask_id': ask_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'ask.archived', ask_id, {'title': ask['title']}); await db.commit()
    return {'data': {'id': ask_id, 'archivedAt': now}}
