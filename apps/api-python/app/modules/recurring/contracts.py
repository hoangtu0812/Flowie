from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ...core.timezones import time_zone
from ...core.errors import ApiError
from ..work_items.bug_contracts import BugCreateFields


class ScheduleRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = Field(default="Asia/Ho_Chi_Minh", min_length=1, max_length=100)
    startDate: date
    time: str = Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    frequency: Literal["DAILY", "WEEKLY", "MONTHLY"] = "WEEKLY"
    interval: int = Field(default=1, ge=1, le=365)
    weekdays: list[int] = Field(default_factory=lambda: [0], max_length=7)
    monthDay: int = Field(default=1, ge=1, le=31)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            time_zone(value)
        except ApiError as error:
            raise ValueError("Unknown IANA time zone") from error
        return value

    @model_validator(mode="after")
    def valid_rule(self):
        if not date(2020, 1, 1) <= self.startDate <= date(2100, 12, 31):
            raise ValueError("Start date must be between 2020 and 2100")
        if len(set(self.weekdays)) != len(self.weekdays) or any(
            day < 0 or day > 6 for day in self.weekdays
        ):
            raise ValueError("Weekdays must be distinct, Monday=0 through Sunday=6")
        if self.frequency == "WEEKLY" and (not self.weekdays or self.interval > 52):
            raise ValueError("Weekly schedules require weekdays and interval <=52")
        if self.frequency == "MONTHLY" and self.interval > 12:
            raise ValueError("Monthly interval must be <=12")
        return self


class RecurringTemplate(BugCreateFields):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    priority: Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] = "NONE"
    statusId: str | None = Field(default=None, max_length=100)
    projectId: str | None = Field(default=None, max_length=100)
    assigneeId: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def trimmed_title(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Title requires at least two characters")
        return value


class ScheduleValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)
    rule: ScheduleRule
    template: RecurringTemplate
    dueAfterMinutes: int | None = Field(default=None, ge=1, le=525600)

    @field_validator("name")
    @classmethod
    def trimmed_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name requires at least two characters")
        return value


class CreateSchedule(ScheduleValues):
    workspaceId: str = Field(min_length=1, max_length=100)
    teamId: str = Field(min_length=1, max_length=100)
    requestKey: str = Field(min_length=8, max_length=128)


class UpdateSchedule(ScheduleValues):
    expectedVersion: int = Field(ge=1)


class ScheduleCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedVersion: int = Field(ge=1)
    requestKey: str | None = Field(default=None, min_length=8, max_length=128)
