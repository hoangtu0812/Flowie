from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ...core.errors import ApiError
from .issue_search import IssueFilter, filter_sql


class ViewQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    filters: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    categories: list[
        Literal["triage", "backlog", "unstarted", "started", "completed", "canceled"]
    ] = Field(default_factory=list, max_length=6)
    noTeam: bool = False
    noProject: bool = False
    issueType: Literal["TASK", "BUG"] | None = None
    projectId: str | None = Field(default=None, min_length=1, max_length=100)
    assigneeId: str | None = Field(default=None, min_length=1, max_length=100)
    creatorId: str | None = Field(default=None, min_length=1, max_length=100)
    cycleId: str | None = Field(default=None, min_length=1, max_length=100)
    query: str | None = Field(default=None, max_length=500)
    includeSubIssues: bool = True


class IssueViewConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1] = 1
    teamId: str | None = Field(default=None, min_length=1, max_length=100)
    query: ViewQuery = Field(default_factory=ViewQuery)


def issue_view_config(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize supported legacy filters; unknown fields never become an unrestricted view.
    VI: Chuẩn hóa bộ lọc cũ được hỗ trợ; trường lạ không bao giờ biến thành view không lọc.
    """
    try:
        if not isinstance(raw, dict):
            raise ValueError("View configuration must be an object.")
        if "version" in raw and type(raw["version"]) is not int:
            raise ValueError("Invalid configuration version.")
        if "version" not in raw:
            allowed = {
                "statusIds",
                "statusCategories",
                "priorityIds",
                "labelIds",
                "unassigned",
                "hasProject",
                "teamId",
            }
            if set(raw) - allowed:
                raise ValueError("Unsupported legacy view configuration.")
            filters = []
            for key, column in [
                ("statusIds", "status"),
                ("priorityIds", "priority"),
                ("labelIds", "labels"),
            ]:
                values = raw.get(key, [])
                if not isinstance(values, list) or any(
                    not isinstance(value, str) for value in values
                ):
                    raise ValueError("Invalid legacy filter values.")
                if values:
                    filters.append(
                        {
                            "columnId": column,
                            "type": "multiOption" if column == "labels" else "option",
                            "operator": "include any of"
                            if column == "labels"
                            else "is any of",
                            "values": values,
                        }
                    )
            for key, column, operator, value in [
                ("unassigned", "assignee", "is", "unassigned"),
                ("hasProject", "project", "is not", ""),
            ]:
                if key in raw and not isinstance(raw[key], bool):
                    raise ValueError("Invalid legacy flag.")
                if raw.get(key):
                    filters.append(
                        {
                            "columnId": column,
                            "type": "option",
                            "operator": operator,
                            "values": [value],
                        }
                    )
            raw = {
                "version": 1,
                "teamId": raw.get("teamId"),
                "query": {
                    "filters": filters,
                    "categories": raw.get("statusCategories", []),
                },
            }
        config = IssueViewConfig.model_validate(raw)
        if config.teamId and config.query.noTeam:
            raise ValueError("Team and no-team scopes cannot be combined.")
        for item in config.query.filters:
            if set(item) != set(IssueFilter.model_fields):
                raise ValueError("Invalid filter fields.")
            IssueFilter.model_validate(item, strict=True)
            if not item["values"]:
                raise ValueError("Saved filters require values.")
        filter_sql(json.dumps(config.query.filters))
        return config.model_dump(exclude_none=True)
    except (ValueError, ValidationError) as error:
        raise ApiError(
            400, "Unsupported or invalid saved view configuration.", "Bad Request"
        ) from error
