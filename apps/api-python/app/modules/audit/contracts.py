from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AuditFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actorId: str | None = Field(default=None, max_length=100)
    entityType: str | None = Field(default=None, max_length=40, pattern=r"^[a-z-]+$")
    source: Literal["WEB", "AI", "SYSTEM", "UNKNOWN"] | None = None
    since: datetime | None = None
    until: datetime | None = None

    @field_validator("since", "until")
    @classmethod
    def utc(cls, value):
        return (
            value.astimezone(timezone.utc).replace(tzinfo=None)
            if value and value.tzinfo
            else value
        )

    @model_validator(mode="after")
    def ordered(self):
        if self.since and self.until and self.since >= self.until:
            raise ValueError("End time must be after start time.")
        return self
