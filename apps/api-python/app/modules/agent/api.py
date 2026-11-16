"""HTTP endpoints of the Agent: providers, tools, skills, conversations, messages and assignments.

VI: Endpoint HTTP của Agent: provider, tool, skill, hội thoại, tin nhắn và phân công.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any, cast

from fastapi import Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import (
    workspace_access,
    workspace_manager,
)
from ..ai.calls import (
    call_provider,
)
from ..identity.auth import current_user
from ..identity.password_reset import limit_request
from ..portfolio.projects_api import (
    CreateProjectInput,
    UpdateProjectInput,
    create_project,
    update_project,
)
from ..work_items.issues_api import (
    CreateIssueInput,
    create_issue,
)
from .chat import _process_message
from .commands import (
    ACCEPT_PROPOSAL_INSERT_AUDIT_LOGS,
    ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES,
    ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_2,
    ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_3,
    ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_4,
    APPLY_ASSIGNMENT_INSERT_AUDIT_LOGS,
    APPLY_ASSIGNMENT_UPDATE_ISSUES,
    CREATE_PERSONAL_SKILL_INSERT_USER_AGENT_SKILLS,
    INSTALL_SKILL_INSERT_USER_AGENT_SKILLS,
    INSTALL_TOOL_INSERT_AUDIT_LOGS,
    INSTALL_TOOL_INSERT_WORKSPACE_AGENT_TOOLS,
    REMOVE_SKILL_DELETE_USER_AGENT_SKILLS,
    REMOVE_TOOL_DELETE_WORKSPACE_AGENT_TOOLS,
    REMOVE_TOOL_INSERT_AUDIT_LOGS,
    SAVE_PROVIDER_INSERT_AUDIT_LOGS,
    SAVE_PROVIDER_INSERT_WORKSPACE_AGENT_PROVIDERS,
    SAVE_PROVIDER_UPDATE_WORKSPACE_AGENT_PROVIDERS,
    UPDATE_ISSUE_DEFAULTS_UPDATE_USER_AGENT_SKILLS,
    UPDATE_PERSONAL_SKILL_UPDATE_USER_AGENT_SKILLS,
)
from .compose import router as compose_router
from .insights import TOOL_DETAILS
from .models import AgentProgress, AgentProposal, IssueDefaultsInput, PersonalSkillInput
from .planning import (
    PERSONAL_SKILL_DETAILS,
    _ignore_progress,
    _installed_tool_keys,
    _message_view,
    _personal_skills,
    _validate_proposal,
    _workspace_catalog,
)
from .providers import (
    PROVIDER_TEST_HOURLY_LIMIT,
    ProviderInput,
    ProviderName,
    _cipher,
    _provider_view,
    _usable_provider,
    _validated_endpoint,
)
from .queries import (
    ACCEPT_PROPOSAL_SELECT_AGENT_MESSAGES,
    APPLY_ASSIGNMENT_SELECT_ISSUES,
    APPLY_ASSIGNMENT_SELECT_WORKSPACE_MEMBERS,
    CHECK_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS,
    GET_CONVERSATION_SELECT_AGENT_CONVERSATIONS,
    GET_CONVERSATION_SELECT_AGENT_MESSAGES,
    LIST_CONVERSATIONS_SELECT_AGENT_CONVERSATIONS,
    LIST_PROVIDERS_SELECT_WORKSPACE_AGENT_PROVIDERS,
    LIST_PROVIDERS_SELECT_WORKSPACE_MEMBERS,
    LIST_SKILLS_SELECT_USER_AGENT_SKILLS,
    LIST_TOOLS_SELECT_WORKSPACE_MEMBERS,
    SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS,
    SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS_2,
)

router = APIRouter(prefix='/api/v1/agent', tags=['agent'])
@router.get('/providers')
async def list_providers(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await workspace_access(db, workspaceId, user['id'])
    manager = await db.execute(LIST_PROVIDERS_SELECT_WORKSPACE_MEMBERS, {'workspace_id': workspaceId, 'user_id': user['id']})
    rows = await db.execute(LIST_PROVIDERS_SELECT_WORKSPACE_AGENT_PROVIDERS, {'workspace_id': workspaceId})
    return {'data': {'canManage': manager.scalar_one() in {'OWNER', 'ADMIN'}, 'providers': [_provider_view(row) for row in rows.mappings().all()]}}


@router.put('/providers/{provider}')
async def save_provider(provider: ProviderName, payload: ProviderInput, request: Request, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await workspace_manager(db, workspaceId, user['id'])
    endpoint = _validated_endpoint(provider, payload.endpoint, request.app.state.settings.agent_provider_allowed_hosts)
    current = await db.execute(SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS, {'workspace_id': workspaceId, 'provider': provider})
    existing_key = current.scalar_one_or_none()
    if not payload.apiKey and not existing_key:
        raise ApiError(400, 'An API key is required when configuring a provider for the first time.', 'Bad Request')
    key = _cipher(request).encrypt(payload.apiKey.strip().encode('utf-8')).decode('ascii') if payload.apiKey else existing_key
    if payload.enabled:
        await db.execute(SAVE_PROVIDER_UPDATE_WORKSPACE_AGENT_PROVIDERS, {'workspace_id': workspaceId, 'now': utcnow()})
    await db.execute(SAVE_PROVIDER_INSERT_WORKSPACE_AGENT_PROVIDERS, {
        'id': cuid(), 'workspace_id': workspaceId, 'provider': provider, 'endpoint': endpoint,
        'model': payload.model.strip(), 'api_key': key, 'enabled': payload.enabled, 'now': utcnow(),
    })
    await db.execute(SAVE_PROVIDER_INSERT_AUDIT_LOGS, {
        'id': cuid(), 'workspace_id': workspaceId, 'actor_id': user['id'], 'entity_id': provider,
        'metadata': json.dumps({'provider': provider, 'enabled': payload.enabled}), 'now': utcnow(),
    })
    await db.commit()
    row = await db.execute(SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS_2, {'workspace_id': workspaceId, 'provider': provider})
    return {'data': _provider_view(row.mappings().one())}


@router.post('/providers/{provider}/test')
async def check_provider(provider: ProviderName, request: Request, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Try the saved provider with one small call and say whether it answered.

    It takes no URL or key from the client, so it cannot be used to reach an arbitrary host. A
    provider failure is the answer here, so it returns 200 with the reason instead of an error.
    VI: Thử provider đã lưu bằng một lần gọi nhỏ và cho biết có trả lời không. Không nhận URL hay key
    VI: từ client nên không thể dùng để gọi host tuỳ ý. Lỗi provider chính là kết quả cần biết, nên
    VI: trả 200 kèm lý do thay vì báo lỗi.
    """
    await workspace_manager(db, workspaceId, user['id'])
    settings = request.app.state.settings
    await limit_request(db, settings.auth_jwt_secret, 'agent-provider-test', user['id'], PROVIDER_TEST_HOURLY_LIMIT)
    result = await db.execute(
        CHECK_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS,
        {'workspace_id': workspaceId, 'provider': provider},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Save this provider before testing it.', 'Not Found')
    await db.commit()
    try:
        await call_provider(
            _usable_provider(settings, db, row, workspaceId), 'agent.test',
            'Reply with exactly this JSON object: {"ok":true}', [{'role': 'user', 'content': 'Connection test'}],
        )
    except ApiError as error:
        return {'data': {'reachable': False, 'reason': error.message}}
    return {'data': {'reachable': True}}


@router.get('/tools')
async def list_tools(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await workspace_access(db, workspaceId, user['id'])
    role = await db.execute(LIST_TOOLS_SELECT_WORKSPACE_MEMBERS, {'workspace_id': workspaceId, 'user_id': user['id']})
    installed = await _installed_tool_keys(db, workspaceId)
    return {'data': {'canManage': role.scalar_one() in {'OWNER', 'ADMIN'}, 'tools': [
        {'key': key, 'title': title, 'description': description, 'installed': key in installed}
        for key, (title, description) in TOOL_DETAILS.items()
    ]}}


@router.post('/tools/{tool_key}')
async def install_tool(tool_key: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if tool_key not in TOOL_DETAILS:
        raise ApiError(404, 'Agent tool not found.', 'Not Found')
    await workspace_manager(db, workspaceId, user['id'])
    now = utcnow()
    await db.execute(INSTALL_TOOL_INSERT_WORKSPACE_AGENT_TOOLS, {'id': cuid(), 'workspace_id': workspaceId, 'tool_key': tool_key, 'now': now})
    await db.execute(INSTALL_TOOL_INSERT_AUDIT_LOGS, {'id': cuid(), 'workspace_id': workspaceId, 'actor_id': user['id'], 'entity_id': tool_key, 'now': now})
    await db.commit()
    title, description = TOOL_DETAILS[tool_key]
    return {'data': {'key': tool_key, 'title': title, 'description': description, 'installed': True}}


@router.delete('/tools/{tool_key}')
async def remove_tool(tool_key: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if tool_key not in TOOL_DETAILS:
        raise ApiError(404, 'Agent tool not found.', 'Not Found')
    await workspace_manager(db, workspaceId, user['id'])
    await db.execute(REMOVE_TOOL_DELETE_WORKSPACE_AGENT_TOOLS, {'workspace_id': workspaceId, 'tool_key': tool_key})
    await db.execute(REMOVE_TOOL_INSERT_AUDIT_LOGS, {'id': cuid(), 'workspace_id': workspaceId, 'actor_id': user['id'], 'entity_id': tool_key, 'now': utcnow()})
    await db.commit()
    title, description = TOOL_DETAILS[tool_key]
    return {'data': {'key': tool_key, 'title': title, 'description': description, 'installed': False}}


def _skill_view(key: str, installed: bool, config: Any = None) -> dict[str, Any]:
    title, description = PERSONAL_SKILL_DETAILS[key]
    return {'key': key, 'title': title, 'description': description, 'installed': installed, 'config': config if installed else None, 'builtIn': True, 'instructions': None}


@router.get('/skills')
async def list_skills(user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    installed = await _personal_skills(db, user['id'])
    rows = await db.execute(LIST_SKILLS_SELECT_USER_AGENT_SKILLS, {'user_id': user['id']})
    custom = [
        {
            'key': row['skill_key'], 'title': row['name'], 'description': row['description'],
            'instructions': row['instructions'], 'config': row['config'], 'installed': True, 'builtIn': False,
        }
        for row in rows.mappings().all()
    ]
    built_in = [_skill_view(key, key in installed, installed.get(key)) for key in PERSONAL_SKILL_DETAILS]
    return {'data': {'skills': [*built_in, *custom]}}


@router.post('/skills')
async def create_personal_skill(payload: PersonalSkillInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    key, now = f'custom.{cuid()}', utcnow()
    await db.execute(CREATE_PERSONAL_SKILL_INSERT_USER_AGENT_SKILLS, {
        'id': cuid(), 'user_id': user['id'], 'skill_key': key, 'name': payload.name.strip(),
        'description': payload.description.strip() if payload.description else None,
        'instructions': payload.instructions.strip(), 'now': now,
    })
    await db.commit()
    return {'data': {'key': key, 'title': payload.name.strip(), 'description': payload.description.strip() if payload.description else None, 'instructions': payload.instructions.strip(), 'config': {}, 'installed': True, 'builtIn': False}}


@router.post('/skills/{skill_key}')
async def install_skill(skill_key: str, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if skill_key not in PERSONAL_SKILL_DETAILS:
        raise ApiError(404, 'Agent skill not found.', 'Not Found')
    now = utcnow()
    config = {'defaultPriority': 'NONE', 'dueInDays': None}
    await db.execute(INSTALL_SKILL_INSERT_USER_AGENT_SKILLS, {'id': cuid(), 'user_id': user['id'], 'skill_key': skill_key, 'config': json.dumps(config), 'now': now})
    await db.commit()
    return {'data': _skill_view(skill_key, True, config)}


@router.put('/skills/issue.defaults')
async def update_issue_defaults(payload: IssueDefaultsInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    skill_key = 'issue.defaults'
    config = payload.model_dump(mode='json')
    result = await db.execute(UPDATE_ISSUE_DEFAULTS_UPDATE_USER_AGENT_SKILLS, {'user_id': user['id'], 'skill_key': skill_key, 'config': json.dumps(config), 'now': utcnow()})
    if cast(CursorResult[Any], result).rowcount != 1:
        raise ApiError(409, 'Install this personal skill before changing its settings.', 'Conflict')
    await db.commit()
    return {'data': _skill_view(skill_key, True, config)}


@router.put('/skills/{skill_key}')
async def update_personal_skill(skill_key: str, payload: PersonalSkillInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if not skill_key.startswith('custom.'):
        raise ApiError(404, 'Agent skill not found.', 'Not Found')
    result = await db.execute(UPDATE_PERSONAL_SKILL_UPDATE_USER_AGENT_SKILLS, {
        'name': payload.name.strip(), 'description': payload.description.strip() if payload.description else None,
        'instructions': payload.instructions.strip(), 'now': utcnow(), 'user_id': user['id'], 'skill_key': skill_key,
    })
    if cast(CursorResult[Any], result).rowcount != 1:
        raise ApiError(404, 'Agent skill not found.', 'Not Found')
    await db.commit()
    return {'data': {'key': skill_key, 'title': payload.name.strip(), 'description': payload.description.strip() if payload.description else None, 'instructions': payload.instructions.strip(), 'config': {}, 'installed': True, 'builtIn': False}}


@router.delete('/skills/{skill_key}')
async def remove_skill(skill_key: str, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if skill_key not in PERSONAL_SKILL_DETAILS and not skill_key.startswith('custom.'):
        raise ApiError(404, 'Agent skill not found.', 'Not Found')
    await db.execute(REMOVE_SKILL_DELETE_USER_AGENT_SKILLS, {'user_id': user['id'], 'skill_key': skill_key})
    await db.commit()
    if skill_key in PERSONAL_SKILL_DETAILS:
        return {'data': _skill_view(skill_key, False)}
    return {'data': {'key': skill_key, 'installed': False, 'builtIn': False}}


@router.get('/conversations')
async def list_conversations(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await workspace_access(db, workspaceId, user['id'])
    result = await db.execute(LIST_CONVERSATIONS_SELECT_AGENT_CONVERSATIONS, {'workspace_id': workspaceId, 'user_id': user['id']})
    return {'data': [{'id': row['id'], 'title': row['title'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at']} for row in result.mappings().all()]}


@router.get('/conversations/{conversation_id}')
async def get_conversation(conversation_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await workspace_access(db, workspaceId, user['id'])
    conversation = await db.execute(GET_CONVERSATION_SELECT_AGENT_CONVERSATIONS, {'id': conversation_id, 'workspace_id': workspaceId, 'user_id': user['id']})
    row = conversation.mappings().first()
    if not row:
        raise ApiError(404, 'Agent conversation not found.', 'Not Found')
    messages = await db.execute(GET_CONVERSATION_SELECT_AGENT_MESSAGES, {'conversation_id': conversation_id})
    return {'data': {'id': row['id'], 'title': row['title'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'], 'messages': [_message_view(message) for message in messages.mappings().all()]}}


def _sse(event: str, data: dict[str, Any]) -> str:
    return f'event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n'


@router.post('/conversations/messages')
async def send_message(request: Request, workspaceId: str = Form(), message: str = Form(min_length=1, max_length=10_000), conversationId: str | None = Form(default=None), files: list[UploadFile] = File(default=[]), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    data = await _process_message(request, workspaceId, message, conversationId, files, user, db, _ignore_progress)
    return {'data': data}


@router.post('/conversations/messages/stream')
async def stream_message(request: Request, workspaceId: str = Form(), message: str = Form(min_length=1, max_length=10_000), conversationId: str | None = Form(default=None), files: list[UploadFile] = File(default=[]), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> StreamingResponse:
    queue: asyncio.Queue[tuple[str, dict[str, Any]]] = asyncio.Queue()

    async def report(update: AgentProgress) -> None:
        await queue.put(('progress', cast(dict[str, Any], update)))

    async def run() -> None:
        try:
            data = await _process_message(request, workspaceId, message, conversationId, files, user, db, report)
            await queue.put(('complete', data))
        except ApiError as error:
            await queue.put(('error', {'message': error.message, 'statusCode': error.status_code}))
        except Exception:
            await queue.put(('error', {'message': 'Could not generate an Agent response.', 'statusCode': 500}))

    async def events() -> AsyncIterator[str]:
        task = asyncio.create_task(run())
        try:
            while True:
                event, data = await queue.get()
                yield _sse(event, data)
                if event in {'complete', 'error'}:
                    break
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@router.post('/messages/{message_id}/accept')
async def accept_proposal(message_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await workspace_access(db, workspaceId, user['id'])
    result = await db.execute(ACCEPT_PROPOSAL_SELECT_AGENT_MESSAGES, {'message_id': message_id, 'workspace_id': workspaceId, 'user_id': user['id']})
    message = result.mappings().first()
    if not message or not message['proposal']:
        raise ApiError(404, 'Agent proposal not found.', 'Not Found')
    if message['applied_at']:
        return {'data': message['applied_result']}
    proposal = AgentProposal.model_validate(message['proposal'])
    catalog = await _workspace_catalog(db, workspaceId)
    _validate_proposal(proposal, catalog)
    progress = message['applied_result'] or {'projects': {}, 'issues': {}}
    await db.execute(ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES, {'id': message_id, 'now': utcnow()})
    await db.commit()
    created_project_ids: dict[str, str] = dict(progress.get('projects') or {})
    issue_ids: dict[str, str] = dict(progress.get('issues') or {})
    existing_projects = {project['identifier']: project['id'] for project in catalog['projects']}
    for draft in proposal.projects:
        if draft.identifier in created_project_ids:
            continue
        created = await create_project(CreateProjectInput(workspaceId=workspaceId, teamId=draft.teamId, name=draft.name, identifier=draft.identifier, description=draft.description), user, db)
        project_id = created['data']['id']
        if draft.startDate or draft.targetDate:
            await update_project(project_id, UpdateProjectInput(startDate=draft.startDate, targetDate=draft.targetDate), workspaceId, user, db)
        created_project_ids[draft.identifier] = project_id
        progress['projects'] = created_project_ids
        await db.execute(ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_3, {'id': message_id, 'result': json.dumps(progress)})
        await db.commit()
    project_ids = {**existing_projects, **created_project_ids}
    for issue_draft in proposal.issues:
        if issue_draft.key in issue_ids:
            continue
        created = await create_issue(CreateIssueInput(workspaceId=workspaceId, teamId=issue_draft.teamId, title=issue_draft.title, description=issue_draft.description, projectId=project_ids.get(issue_draft.projectIdentifier) if issue_draft.projectIdentifier else None, priority=issue_draft.priority, dueDate=issue_draft.dueDate), user, db)
        issue_ids[issue_draft.key] = created['data']['id']
        progress['issues'] = issue_ids
        await db.execute(ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_4, {'id': message_id, 'result': json.dumps(progress)})
        await db.commit()
    applied_result = {'projects': created_project_ids, 'issues': issue_ids}
    await db.execute(ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_2, {'id': message_id, 'now': utcnow(), 'result': json.dumps(applied_result)})
    await db.execute(ACCEPT_PROPOSAL_INSERT_AUDIT_LOGS, {'id': cuid(), 'workspace_id': workspaceId, 'actor_id': user['id'], 'entity_id': message_id, 'metadata': json.dumps({'projects': len(proposal.projects), 'issues': len(proposal.issues)}), 'now': utcnow()})
    await db.commit()
    return {'data': applied_result}


class AssignmentApplyInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    workspaceId: str = Field(min_length=1)
    issueId: str = Field(min_length=1)
    assigneeId: str = Field(min_length=1)


@router.post('/assignments/apply')
async def apply_assignment(payload: AssignmentApplyInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Apply one drafted assignment row. Stale rows are rejected, never overwritten."""
    await workspace_access(db, payload.workspaceId, user['id'])
    issue = await db.execute(
        APPLY_ASSIGNMENT_SELECT_ISSUES,
        {'issue_id': payload.issueId, 'workspace_id': payload.workspaceId},
    )
    row = issue.mappings().first()
    if not row:
        raise ApiError(404, 'This issue is no longer open for assignment.', 'Not Found')
    if row['assignee_id'] and row['assignee_id'] != payload.assigneeId:
        raise ApiError(
            409,
            f"{row['identifier']} is already assigned to {row['assignee_name']}. Refresh the proposal.",
            'Conflict',
        )
    member = await db.execute(
        APPLY_ASSIGNMENT_SELECT_WORKSPACE_MEMBERS,
        {'workspace_id': payload.workspaceId, 'user_id': payload.assigneeId},
    )
    if member.scalar_one_or_none() is None:
        raise ApiError(400, 'The suggested person is not an active workspace member.', 'Bad Request')
    if not row['assignee_id']:
        now = utcnow()
        await db.execute(
            APPLY_ASSIGNMENT_UPDATE_ISSUES,
            {'assignee_id': payload.assigneeId, 'now': now, 'id': payload.issueId},
        )
        await db.execute(
            APPLY_ASSIGNMENT_INSERT_AUDIT_LOGS,
            {
                'id': cuid(), 'workspace_id': payload.workspaceId, 'actor_id': user['id'],
                'entity_id': payload.issueId,
                'metadata': json.dumps({'assigneeId': payload.assigneeId}), 'now': now,
            },
        )
        await db.commit()
    return {'data': {'applied': True, 'issueId': payload.issueId, 'assigneeId': payload.assigneeId}}


# Write with Agent and schedule routes live in `compose`; they share this prefix.
# VI: Route Write with Agent và xếp lịch nằm ở `compose`; chúng dùng chung prefix này.
router.include_router(compose_router)
