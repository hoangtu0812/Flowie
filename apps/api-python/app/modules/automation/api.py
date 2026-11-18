"""Team settings → Automation rules: list, create, change and delete a team's rules (DTD-903).

Team members read the rules and the run history; only the team's LEAD or a workspace
administrator changes them, and every change is written to the audit log. Saving a rule makes
the saver its actor, so a rule never acts with the rights of someone who did not approve it.
References (statuses, labels, people) are checked when the rule runs, through the issue
services, and a bad one shows up as a failed run.
VI: Team settings → Automation rules: xem, tạo, sửa và xoá rule của team (DTD-903). Thành viên
VI: team đọc được rule và lịch sử chạy; chỉ LEAD của team hoặc admin workspace được sửa, và mọi
VI: thay đổi được ghi audit log. Người lưu rule trở thành tác nhân của rule, nên rule không bao
VI: giờ chạy bằng quyền của người không duyệt nó. Tham chiếu (trạng thái, label, người) được kiểm
VI: khi rule chạy, qua các service issue, và tham chiếu sai hiện thành một lần chạy thất bại.
"""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.membership import workspace_role
from ..access.read_only import ADMIN_READ_ROLES
from ..identity.auth import current_user
from .commands import (
    AUDIT_AUTOMATION_RULE,
    CREATE_AUTOMATION_RULE,
    DELETE_AUTOMATION_RULE,
    UPDATE_AUTOMATION_RULE,
)
from .queries import LIST_RULES, LIST_RUNS, RULE, TEAM_MEMBER_ROLE

router = APIRouter(prefix='/api/v1/teams', tags=['automation-rules'])

Id = Annotated[str, Field(min_length=1, max_length=100)]
Priority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']


class Conditions(BaseModel):
    model_config = ConfigDict(extra='forbid')
    issueTypes: list[Literal['TASK', 'BUG', 'EPIC']] = Field(default_factory=list, max_length=3)
    priorities: list[Priority] = Field(default_factory=list, max_length=5)
    labelIds: list[Id] = Field(default_factory=list, max_length=100)
    projectIds: list[Id] = Field(default_factory=list, max_length=100)
    statusIds: list[Id] = Field(default_factory=list, max_length=100)


class SetStatus(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['set_status']
    statusId: Id


class Assign(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['assign']
    userId: Id | None = None


class LabelAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['add_label', 'remove_label']
    labelId: Id


class SetPriority(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['set_priority']
    priority: Priority


class Comment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['comment']
    body: str = Field(min_length=1, max_length=5000)


class Notify(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['notify']
    userIds: list[Id] = Field(min_length=1, max_length=50)


Action = Annotated[SetStatus | Assign | LabelAction | SetPriority | Comment | Notify, Field(discriminator='type')]


class RuleInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    trigger: Literal[
        'issue.created', 'issue.status_changed', 'issue.assigned', 'issue.labeled', 'issue.subissues_completed'
    ]
    conditions: Conditions = Field(default_factory=Conditions)
    actions: list[Action] = Field(min_length=1, max_length=10)


async def _access(db: AsyncSession, workspace_id: str, team_id: str, user_id: str, *, write: bool) -> bool:
    """Return whether the caller manages the team's rules; raise 403/404 when they may not act.

    VI: Trả về người gọi có quản lý rule của team không; báo 403/404 khi họ không được thao tác.
    """
    role = await workspace_role(db, workspace_id, user_id)
    team = (
        await db.execute(TEAM_MEMBER_ROLE, {'team_id': team_id, 'workspace_id': workspace_id, 'user_id': user_id})
    ).mappings().first()
    if team is None:
        raise ApiError(404, 'Team not found.', 'Not Found')
    admin = role in ADMIN_READ_ROLES
    if not admin and team['role'] is None:
        raise ApiError(403, 'You do not have access to this team.', 'Forbidden')
    manages = role in ('OWNER', 'ADMIN') or team['role'] == 'LEAD'
    if write and not manages:
        raise ApiError(403, 'Only the team lead or a workspace administrator can change automation rules.', 'Forbidden')
    return manages


def _rule(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'name': row['name'],
        'enabled': row['enabled'],
        'trigger': row['trigger'],
        'conditions': row['conditions'],
        'actions': row['actions'],
        'actor': {'id': row['actor_id'], 'name': row['actor_name']} if row['actor_id'] else None,
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }


async def _audit(db: AsyncSession, workspace_id: str, user_id: str, action: str, rule_id: str, team_id: str, payload: RuleInput | None) -> None:
    metadata: dict[str, Any] = {'teamId': team_id}
    if payload is not None:
        metadata |= {'name': payload.name, 'trigger': payload.trigger, 'enabled': payload.enabled}
    await db.execute(
        AUDIT_AUTOMATION_RULE,
        {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': user_id, 'action': action,
         'entity_id': rule_id, 'metadata': json.dumps(metadata), 'now': utcnow()},
    )


async def _saved(db: AsyncSession, rule_id: str, team_id: str) -> dict[str, Any]:
    row = (await db.execute(RULE, {'id': rule_id, 'team_id': team_id})).mappings().first()
    if row is None:
        raise ApiError(404, 'Automation rule not found.', 'Not Found')
    return _rule(row)


@router.get('/{team_id}/automation-rules')
async def list_rules(
    team_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    manages = await _access(db, workspaceId, team_id, user['id'], write=False)
    rules = (await db.execute(LIST_RULES, {'team_id': team_id})).mappings().all()
    runs = (await db.execute(LIST_RUNS, {'team_id': team_id})).mappings().all()
    return {
        'data': {
            'canManage': manages,
            'rules': [_rule(row) for row in rules],
            'runs': [
                {'id': run['id'], 'ruleId': run['rule_id'], 'ruleName': run['rule_name'],
                 'issue': {'id': run['issue_id'], 'identifier': run['identifier'], 'title': run['title']},
                 'status': run['status'], 'message': run['message'], 'createdAt': run['created_at']}
                for run in runs
            ],
        }
    }


@router.post('/{team_id}/automation-rules', status_code=201)
async def create_rule(
    team_id: str,
    payload: RuleInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _access(db, workspaceId, team_id, user['id'], write=True)
    rule_id = cuid()
    await db.execute(
        CREATE_AUTOMATION_RULE,
        {'id': rule_id, 'team_id': team_id, 'name': payload.name.strip(), 'enabled': payload.enabled,
         'trigger': payload.trigger, 'conditions': payload.conditions.model_dump_json(),
         'actions': json.dumps([action.model_dump() for action in payload.actions]),
         'actor_id': user['id'], 'now': utcnow()},
    )
    await _audit(db, workspaceId, user['id'], 'automation_rule.created', rule_id, team_id, payload)
    rule = await _saved(db, rule_id, team_id)
    await db.commit()
    return {'data': rule}


@router.put('/{team_id}/automation-rules/{rule_id}')
async def update_rule(
    team_id: str,
    rule_id: str,
    payload: RuleInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _access(db, workspaceId, team_id, user['id'], write=True)
    result = await db.execute(
        UPDATE_AUTOMATION_RULE,
        {'id': rule_id, 'team_id': team_id, 'name': payload.name.strip(), 'enabled': payload.enabled,
         'trigger': payload.trigger, 'conditions': payload.conditions.model_dump_json(),
         'actions': json.dumps([action.model_dump() for action in payload.actions]),
         'actor_id': user['id'], 'now': utcnow()},
    )
    if not getattr(result, 'rowcount', 0):
        raise ApiError(404, 'Automation rule not found.', 'Not Found')
    await _audit(db, workspaceId, user['id'], 'automation_rule.updated', rule_id, team_id, payload)
    rule = await _saved(db, rule_id, team_id)
    await db.commit()
    return {'data': rule}


@router.delete('/{team_id}/automation-rules/{rule_id}')
async def delete_rule(
    team_id: str,
    rule_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _access(db, workspaceId, team_id, user['id'], write=True)
    result = await db.execute(DELETE_AUTOMATION_RULE, {'id': rule_id, 'team_id': team_id})
    if not getattr(result, 'rowcount', 0):
        raise ApiError(404, 'Automation rule not found.', 'Not Found')
    await _audit(db, workspaceId, user['id'], 'automation_rule.deleted', rule_id, team_id, None)
    await db.commit()
    return {'data': {'id': rule_id}}
