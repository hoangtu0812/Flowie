from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ...core.errors import ApiError
from ...core.timezones import time_zone

Priority = Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]


def clock_minutes(value):
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


class BusinessWindow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weekday: int = Field(ge=0, le=6)
    start: str = Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    end: str = Field(pattern=r"^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")

    @model_validator(mode="after")
    def ordered(self):
        if clock_minutes(self.start) >= clock_minutes(self.end):
            raise ValueError(
                "Working windows must end after they start; split overnight work across dates"
            )
        return self


class BusinessCalendar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = Field(default="Asia/Ho_Chi_Minh", min_length=1, max_length=100)
    windows: list[BusinessWindow] = Field(
        default_factory=lambda: [
            BusinessWindow(weekday=day, start="09:00", end="17:00") for day in range(5)
        ],
        min_length=1,
        max_length=28,
    )
    holidays: list[date] = Field(default_factory=list, max_length=366)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            time_zone(value)
        except ApiError as error:
            raise ValueError("Unknown IANA time zone") from error
        return value

    @model_validator(mode="after")
    def valid_windows(self):
        if len(set(self.holidays)) != len(self.holidays):
            raise ValueError("Holiday dates must be distinct")
        total = 0
        for day in range(7):
            windows = sorted(
                (clock_minutes(row.start), clock_minutes(row.end))
                for row in self.windows
                if row.weekday == day
            )
            for index, (start, end) in enumerate(windows):
                if index and start < windows[index - 1][1]:
                    raise ValueError("Working windows must not overlap")
                total += end - start
        if total < 60:
            raise ValueError("Configure at least 60 working minutes per week")
        return self


class PolicyValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    teamId: str | None = Field(default=None, max_length=100)
    priority: Priority | None = None
    deadlineMinutes: int = Field(ge=15, le=525600)
    enabled: bool = True
    calendar: BusinessCalendar | None = None
    pauseStatusIds: list[str] = Field(default_factory=list, max_length=100)
    warningMinutes: int = Field(default=0, ge=0, le=525600)
    escalateToId: str | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Policy name requires at least two characters")
        return value

    @model_validator(mode="after")
    def valid_policy(self):
        if self.warningMinutes >= self.deadlineMinutes:
            raise ValueError("Warning threshold must be less than the SLA budget")
        if len(set(self.pauseStatusIds)) != len(self.pauseStatusIds) or any(
            not value or len(value) > 100 for value in self.pauseStatusIds
        ):
            raise ValueError("Pause status IDs must be distinct bounded IDs")
        return self


class CreatePolicy(PolicyValues):
    workspaceId: str = Field(min_length=1, max_length=100)


class UpdatePolicy(PolicyValues):
    expectedVersion: int = Field(ge=1)


class PolicyCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedVersion: int = Field(ge=1)


class CalendarPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    startAt: datetime
    deadlineMinutes: int = Field(ge=15, le=525600)
    calendar: BusinessCalendar | None = None

    @field_validator("startAt")
    @classmethod
    def bounded_start(cls, value):
        if value.tzinfo is None or value.utcoffset() is None or not 2020 <= value.year <= 2100:
            raise ValueError("Preview starts require a UTC offset and a year from 2020 through 2100")
        return value


class IssueSlaCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedVersion: int = Field(ge=1)
    expectedCycle: int | None = Field(ge=1)


class RetrySlaJob(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedGeneration: int = Field(ge=1)
