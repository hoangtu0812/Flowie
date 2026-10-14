import sys
from pathlib import Path
from datetime import date, datetime, timezone
import unittest

import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from starlette.responses import StreamingResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.utc_responses import UtcAPIRouter, utc_response_value


class TimestampPayload(BaseModel):
    createdAt: datetime


class UtcResponseTests(unittest.IsolatedAsyncioTestCase):
    def test_only_datetime_values_are_normalized(self):
        plain = "2026-10-14T00:00:00"
        result = utc_response_value({"createdAt": datetime(2026, 10, 14), "date": date(2026, 10, 14), "content": plain})
        self.assertEqual(result["createdAt"].tzinfo, timezone.utc)
        self.assertEqual(result["content"], plain)
        self.assertEqual(result["date"], date(2026, 10, 14))

    async def test_response_filtering_dependencies_and_streams_are_preserved(self):
        app, router = FastAPI(), UtcAPIRouter()

        @router.get("/timestamp/{record_id}", response_model=TimestampPayload)
        async def timestamp(record_id: str):
            return {"createdAt": datetime(2026, 10, 14), "secret": record_id}

        @router.get("/sync")
        def sync_timestamp():
            return {"updatedAt": datetime(2026, 10, 14)}

        @router.get("/stream")
        async def stream():
            return StreamingResponse(iter(["unchanged"]), media_type="text/plain")

        app.include_router(router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            self.assertEqual((await client.get("/timestamp/private")).json(), {"createdAt": "2026-10-14T00:00:00Z"})
            self.assertEqual((await client.get("/sync")).json(), {"updatedAt": "2026-10-14T00:00:00+00:00"})
            self.assertEqual((await client.get("/stream")).text, "unchanged")
