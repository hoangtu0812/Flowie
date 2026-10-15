from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

ArchiveKind = Literal["issue", "project", "document", "initiative"]


class RestoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedUpdatedAt: datetime
