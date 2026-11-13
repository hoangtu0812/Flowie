"""Agent Q&A as a read-only function-calling loop.

The model receives the question, the recent conversation and a fixed list of read-only tools: the
MCP read tools, run under the asker's own team membership exactly as an MCP connection with read
scopes would, plus the deterministic Agent insights (deadlines, overdue, workload, delivery...).
It calls tools for a bounded number of rounds and then answers. Nothing here can write.
VI: Hỏi đáp của Agent dưới dạng vòng lặp function calling chỉ đọc. Model nhận câu hỏi, đoạn hội
VI: thoại gần nhất và danh sách tool chỉ đọc cố định: các tool đọc của MCP, chạy theo đúng quyền
VI: thành viên team của người hỏi như một kết nối MCP chỉ có scope đọc, cộng các insight cố định của
VI: Agent (deadline, quá hạn, workload, tiến độ...). Model gọi tool trong số vòng có giới hạn rồi trả
VI: lời. Không phần nào ở đây ghi được dữ liệu.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ..ai.calls import call_provider_with_tools
from ..mcp.application import schema_errors
from ..mcp.contracts import normalize_arguments
from ..mcp.domain import READ_SCOPES, Principal
from ..mcp.query_service import QueryService
from ..mcp.registry import TOOLS

MAX_STEPS = 6
MAX_RESULT_CHARS = 12_000
HANDOFF_TOOL = 'handoff_to_planner'
# MCP tools the Agent may call. Only read tools are listed; ``tool_specs`` asserts it.
# VI: Các tool MCP Agent được gọi. Chỉ liệt kê tool đọc; ``tool_specs`` kiểm tra điều đó.
MCP_READ_TOOLS = (
    'list_teams', 'list_projects', 'get_project', 'search_issues', 'get_issue', 'list_comments', 'list_issue_options',
)
TEAM_ARGUMENT = {
    'type': 'object',
    'properties': {'team': {'type': 'string', 'description': 'Team identifier or name, such as "DTD"; omit for all of the asker\'s teams.'}},
    'additionalProperties': False,
}
NO_ARGUMENTS: dict[str, Any] = {'type': 'object', 'properties': {}, 'additionalProperties': False}

InsightRunner = Callable[[AsyncSession, str, str, str], Awaitable[Mapping[str, Any]]]
ProgressCallback = Callable[[str, str, str, str], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class InsightTool:
    """A deterministic Agent insight exposed as a tool. ``run(db, workspace, user, team)`` returns
    the insight; ``team`` is "" for every team of the asker. ``scoped`` says whether it takes a team.
    VI: Một insight cố định của Agent được đưa ra dưới dạng tool. ``run(db, workspace, user, team)``
    VI: trả insight; ``team`` rỗng nghĩa là mọi team của người hỏi. ``scoped`` cho biết có nhận team không.
    """

    name: str
    description: str
    run: InsightRunner
    scoped: bool = True


def asker_principal(workspace_id: str, user: dict[str, Any]) -> Principal:
    """The asker as an MCP principal with read scopes only and no team or project limit, so the
    access policy narrows every read to the teams the asker belongs to.
    VI: Người hỏi dưới dạng principal MCP chỉ có scope đọc, không giới hạn team hay dự án, nên chính
    VI: sách truy cập thu hẹp mọi lần đọc vào các team người hỏi là thành viên.
    """
    return Principal(
        connection_id=f"agent-chat:{user['id']}", workspace_id=workspace_id, user=user,
        scopes=READ_SCOPES, team_ids=(), project_ids=(), connection_name='Agent chat',
    )


def tool_specs(insights: tuple[InsightTool, ...]) -> list[dict[str, Any]]:
    specs = []
    for name in MCP_READ_TOOLS:
        definition = TOOLS[name]
        assert not definition.write, name
        specs.append({'name': name, 'description': definition.description, 'parameters': definition.model.model_json_schema()})
    for insight in insights:
        specs.append({'name': insight.name, 'description': insight.description, 'parameters': TEAM_ARGUMENT if insight.scoped else NO_ARGUMENTS})
    specs.append({
        'name': HANDOFF_TOOL,
        'description': 'Call this instead of answering when the user asks to create, plan, draft or assign projects or issues.',
        'parameters': NO_ARGUMENTS,
    })
    return specs


def _clip(result: Any) -> str:
    text = json.dumps(jsonable_encoder(result), ensure_ascii=False, default=str)
    if len(text) <= MAX_RESULT_CHARS:
        return text
    return text[:MAX_RESULT_CHARS] + '… [result truncated: use filters or a smaller limit]'


async def run_tool(
    db: AsyncSession,
    settings: Any,
    principal: Principal,
    insights: tuple[InsightTool, ...],
    name: str,
    arguments: dict[str, Any] | None,
) -> str:
    """Run one tool call and return its result as JSON text for the model.

    A failure the model can act on (unknown tool, invalid arguments, a record outside the asker's
    scope) comes back as ``{"error": ...}`` so the model can correct itself. Each call runs in a
    savepoint, so a failed query cannot break the turn's transaction, and under the MCP tool timeout.
    VI: Chạy một lần gọi tool và trả kết quả dạng JSON cho model. Lỗi model tự sửa được (tool lạ,
    VI: tham số sai, bản ghi ngoài phạm vi người hỏi) được trả về dạng ``{"error": ...}`` để model
    VI: sửa. Mỗi lần gọi chạy trong savepoint, nên truy vấn lỗi không làm hỏng transaction của lượt,
    VI: và có giới hạn thời gian như tool MCP.
    """
    if arguments is None:
        return json.dumps({'error': 'The arguments were not valid JSON.'})
    try:
        async with asyncio.timeout(settings.mcp_tool_timeout_seconds), db.begin_nested():
            insight = next((item for item in insights if item.name == name), None)
            if insight:
                team = str(arguments.get('team') or '') if insight.scoped else ''
                result = await insight.run(db, principal.workspace_id, principal.user['id'], team)
                return _clip({'summary': result['content'], 'data': result['data']})
            if name not in MCP_READ_TOOLS:
                return json.dumps({'error': f'Unknown tool {name[:100]}.'})
            definition = TOOLS[name]
            payload = definition.model.model_validate(normalize_arguments(definition.model, arguments))
            return _clip(await getattr(QueryService(db, principal, settings), definition.handler)(payload))
    except ValidationError as error:
        return json.dumps({'error': 'Invalid arguments: ' + schema_errors(error)})
    except ApiError as error:
        return json.dumps({'error': error.message})
    except TimeoutError:
        return json.dumps({'error': 'The tool timed out. Use a narrower query.'})


async def answer_with_tools(
    provider: dict[str, Any],
    system_prompt: str,
    history: list[dict[str, Any]],
    specs: list[dict[str, Any]],
    execute: Callable[[str, dict[str, Any] | None], Awaitable[str]],
    progress: ProgressCallback,
) -> tuple[str | None, list[str]]:
    """Loop model → tools → model for at most ``MAX_STEPS`` rounds.

    Returns the answer and the names of the tools called; the answer is None when the model handed
    the message to the planner. ``progress(id, label, state, detail)`` is awaited before and after
    every tool call. A model that still wants tools after the last round gets a 502.
    VI: Lặp model → tool → model tối đa ``MAX_STEPS`` vòng. Trả câu trả lời và tên các tool đã gọi;
    VI: câu trả lời là None khi model chuyển tin nhắn cho planner. ``progress(id, label, state,
    VI: detail)`` được gọi trước và sau mỗi lần gọi tool. Model vẫn đòi tool sau vòng cuối thì lỗi 502.
    """
    turns = list(history)
    called: list[str] = []
    for step in range(MAX_STEPS):
        reply = await call_provider_with_tools(provider, 'agent.ask', system_prompt, turns, specs)
        calls = reply['toolCalls']
        if not calls:
            if not reply['text'].strip():
                raise ApiError(502, 'The AI provider returned an empty answer. Please try again.', 'Bad Gateway')
            return reply['text'].strip(), called
        if any(call['name'] == HANDOFF_TOOL for call in calls):
            return None, called
        turns.append({'role': 'assistant', 'content': reply['text'], 'toolCalls': calls})
        for index, call in enumerate(calls):
            step_id = f"tool.{step + 1}.{index + 1}.{call['name']}"
            detail = json.dumps(call['arguments'], ensure_ascii=False) if call['arguments'] else ''
            await progress(step_id, f"Calling {call['name']}", 'running', detail)
            result = await execute(call['name'], call['arguments'])
            called.append(call['name'])
            label = f"{call['name']} failed" if result.startswith('{"error"') else f"{call['name']} done"
            await progress(step_id, label, 'completed', detail)
            turns.append({'role': 'tool', 'id': call['id'], 'name': call['name'], 'content': result})
    raise ApiError(502, 'The Agent needed more steps than allowed. Please ask a narrower question.', 'Bad Gateway')
