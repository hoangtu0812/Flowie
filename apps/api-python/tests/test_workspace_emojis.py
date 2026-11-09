"""Custom emoji upload accepts only real image bytes.

The file's own bytes decide the type: the name and the content type a browser
sends are ignored, so an SVG or an HTML page renamed `.png` is refused before
anything reaches storage.
VI: Upload emoji tuỳ chỉnh chỉ nhận byte ảnh thật.
VI: Chính byte của file quyết định loại: tên và content type trình duyệt gửi bị
VI: bỏ qua, nên một SVG hay trang HTML đổi tên thành `.png` bị từ chối trước khi
VI: bất cứ thứ gì chạm tới storage.
"""
import asyncio
import io
import os
from types import SimpleNamespace

import pytest
from fastapi import UploadFile
from sqlalchemy import text

from app.core.errors import ApiError
from app.domains import native_emojis
from app.domains.native_emojis import _image_mime, upload_emoji
from tests.seeded_workspace import seeded_workspace

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
IMAGES = {
    PNG: "image/png",
    b"\xff\xd8\xff\xe0" + b"\x00" * 16: "image/jpeg",
    b"GIF87a" + b"\x00" * 8: "image/gif",
    b"GIF89a" + b"\x00" * 8: "image/gif",
    b"RIFF\x10\x00\x00\x00WEBPVP8 ": "image/webp",
}
NOT_IMAGES = [
    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    b"<!doctype html><html></html>",
    b"%PDF-1.7",
    b"RIFF\x10\x00\x00\x00WAVE",
    b"RIFF\x10\x00",
    b"\x89PNG",
    b"",
]


def test_only_supported_image_signatures_are_recognised():
    for body, mime in IMAGES.items():
        assert _image_mime(body) == mime
    for body in NOT_IMAGES:
        assert _image_mime(body) is None, body


class FakeStorage:
    stored: list = []

    def __init__(self, _settings):
        pass

    async def put(self, key, body, content_type):
        self.stored.append((key, body, content_type))


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured")
def test_upload_refuses_non_images_before_storage_and_stores_a_real_one(monkeypatch):
    monkeypatch.setattr(native_emojis, "MinioStorage", FakeStorage)
    FakeStorage.stored = []
    asyncio.run(verify_upload())


async def verify_upload():
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=None)))

    def upload(body, filename="party.png"):
        return UploadFile(io.BytesIO(body), filename=filename)

    async with seeded_workspace() as (factory, workspace, member):
        async with factory() as db:
            seed, owner = await workspace(db)
            plain = await member(db, seed["workspace_id"])
            await db.commit()
            ws = seed["workspace_id"]

            for body, name, status in [
                (b"", "party", 400),
                (NOT_IMAGES[0], "party", 400),
                (b"<!doctype html>", "party", 400),
                (PNG, "Bad Name!", 400),
                (b"\x00" * (native_emojis.MAX_EMOJI_BYTES + 1), "party", 400),
            ]:
                with pytest.raises(ApiError) as refused:
                    await upload_emoji(request, ws, name, upload(body), owner, db)
                assert refused.value.status_code == status
            with pytest.raises(ApiError) as denied:
                await upload_emoji(request, ws, "party", upload(PNG), plain, db)
            assert denied.value.status_code == 403
            assert FakeStorage.stored == []

            # The extension comes from the bytes, not from the name the browser sent.
            # VI: Phần mở rộng lấy từ byte, không lấy từ tên trình duyệt gửi.
            emoji = (await upload_emoji(request, ws, " Party ", upload(PNG, "evil.svg"), owner, db))["data"]
            assert (emoji["name"], emoji["mimeType"], emoji["filename"]) == ("party", "image/png", "party.png")
            [(key, body, mime)] = FakeStorage.stored
            assert key.startswith(f"{ws}/emojis/") and body == PNG and mime == "image/png"
            assert (await db.execute(
                text("SELECT COUNT(*) FROM workspace_emojis WHERE workspace_id=:ws"), {"ws": ws}
            )).scalar_one() == 1
