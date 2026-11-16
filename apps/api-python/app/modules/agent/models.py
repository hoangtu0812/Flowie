"""Shared Pydantic models, typed dicts and callable aliases of the Agent module.

VI: Model Pydantic, typed dict và alias hàm dùng chung của module Agent.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Literal, NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession


class ProjectDraft(BaseModel):
    model_config = ConfigDict(extra='forbid')

    identifier: str = Field(min_length=1, max_length=24, pattern=r'^[A-Z][A-Z0-9_-]*$')
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    teamId: str | None = None
    startDate: str | None = None
    targetDate: str | None = None


class IssueDraft(BaseModel):
    model_config = ConfigDict(extra='forbid')

    key: str = Field(min_length=1, max_length=64, pattern=r'^[a-z0-9_-]+$')
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    teamId: str = Field(min_length=1)
    projectIdentifier: str | None = Field(default=None, max_length=24, pattern=r'^[A-Z][A-Z0-9_-]*$')
    priority: Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] = 'NONE'
    dueDate: str | None = None


class AgentProposal(BaseModel):
    model_config = ConfigDict(extra='forbid')

    summary: str = Field(min_length=1, max_length=4000)
    requiresClarification: bool = False
    questions: list[str] = Field(default_factory=list, max_length=8)
    projects: list[ProjectDraft] = Field(default_factory=list, max_length=20)
    issues: list[IssueDraft] = Field(default_factory=list, max_length=100)


class PlannerState(TypedDict):
    provider: dict[str, Any]
    system_prompt: str
    history: list[dict[str, str]]
    proposal: dict[str, Any]


class ReadOnlyInsight(TypedDict):
    capability: str
    content: str
    data: dict[str, Any]


class IssueDefaultsInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    defaultPriority: Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] = 'NONE'
    dueInDays: int | None = Field(default=None, ge=1, le=365)


class PersonalSkillInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=240)
    instructions: str = Field(min_length=2, max_length=4_000)


ReadOnlyCapability = tuple[
    str,
    Callable[[str], bool],
    Callable[[AsyncSession, str, str], Awaitable[ReadOnlyInsight]],
]


class AgentProgress(TypedDict):
    id: str
    label: str
    state: Literal['running', 'completed']
    orb: Literal['working', 'searching', 'solving', 'composing', 'shaping']
    # Tool arguments as JSON for a tool-call step of the Q&A loop.
    # VI: Tham số tool dạng JSON cho bước gọi tool của vòng lặp hỏi đáp.
    detail: NotRequired[str]


ProgressReporter = Callable[[AgentProgress], Awaitable[None]]


