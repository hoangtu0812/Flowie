from datetime import date, datetime, time, timedelta
import json

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ...core.timezones import local_instant, time_zone
from ..work_items.query_contract import IssueSelectionQuery


class WorkflowReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fromDate: date
    toDate: date
    timezone: str = Field(default="Asia/Ho_Chi_Minh", max_length=100)
    weekStart: int = Field(default=0, ge=0, le=6)
    selection: IssueSelectionQuery = Field(default_factory=IssueSelectionQuery)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        time_zone(value)
        return value

    @model_validator(mode="after")
    def bounded_range(self):
        if not 2020 <= self.fromDate.year <= self.toDate.year <= 2100:
            raise ValueError("Report dates must be in 2020–2100")
        if not 0 <= (self.toDate - self.fromDate).days < 366:
            raise ValueError("Choose an ordered range of at most 366 days")
        return self

    def parameters(self, now):
        zone = time_zone(self.timezone)
        day, days = self.fromDate, []
        while day <= self.toDate:
            start = local_instant(datetime.combine(day, time()), zone)
            end = local_instant(datetime.combine(day + timedelta(days=1), time()), zone)
            days.append(
                {
                    "day": day.isoformat(),
                    "starts": start.isoformat(),
                    "ends": end.isoformat(),
                    "cutoff": min(now, end - timedelta(microseconds=1)).isoformat()
                    if now >= start
                    else None,
                    "complete": end <= now,
                }
            )
            day += timedelta(days=1)
        return {
            "now": now,
            "start": local_instant(datetime.combine(self.fromDate, time()), zone),
            "until": local_instant(
                datetime.combine(self.toDate + timedelta(days=1), time()), zone
            ),
            "from_date": self.fromDate,
            "to_date": self.toDate,
            "week_start": self.weekStart,
            "days": json.dumps(days),
        }
