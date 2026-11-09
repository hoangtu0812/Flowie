import asyncio
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

import pytest

from app.core.errors import ApiError
from app.domains import native_attachments
from app.domains.attachment_tables import (
    MAX_ROWS,
    UnreadableSpreadsheet,
    csv_sheet,
    table_page,
    xlsx_sheets,
)

MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def workbook(sheet_rows: str) -> bytes:
    """Smallest XLSX Excel writes: one sheet, shared strings, relative and absolute targets."""
    buffer = BytesIO()
    with ZipFile(buffer, "w") as book:
        book.writestr(
            "xl/workbook.xml",
            f'<workbook {MAIN} {REL}><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/>'
            '<sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
        )
        book.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
        )
        book.writestr(
            "xl/sharedStrings.xml",
            f'<sst {MAIN}><si><t>Task</t></si><si><r><t>&lt;script&gt;</t></r><r><t>alert(1)</t></r></si></sst>',
        )
        book.writestr("xl/worksheets/sheet1.xml", f"<worksheet {MAIN}><sheetData>{sheet_rows}</sheetData></worksheet>")
        book.writestr("xl/worksheets/sheet2.xml", f"<worksheet {MAIN}><sheetData/></worksheet>")
    return buffer.getvalue()


def test_xlsx_sheets_read_values_keep_gaps_and_escape():
    body = workbook(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Done</t></is></c></row>'
        '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><v>42.5</v></c>'
        '<c r="BA3"><v>cut</v></c></row>'
    )
    (plan, rows, truncated), empty = xlsx_sheets(body)
    assert plan == "Plan" and rows == [["Task", "", "Done"], [], ["<script>alert(1)", "TRUE", "42.5"]]
    assert truncated, "column BA is past MAX_COLUMNS"
    assert empty == ("Empty", [], False)
    page = table_page("plan.xlsx", [(plan, rows, truncated), empty])
    assert "&lt;script&gt;alert(1)" in page and "<script>" not in page
    assert "<h2>Plan</h2>" in page and "Showing the first" in page


def test_xlsx_rows_stop_at_the_limit_and_bad_files_are_refused():
    rows = "".join(f'<row r="{n}"><c r="A{n}"><v>{n}</v></c></row>' for n in range(1, MAX_ROWS + 3))
    (_, read, truncated), _ = xlsx_sheets(workbook(rows))
    assert len(read) == MAX_ROWS and truncated
    for bad in (b"not a zip", workbook("<row><c r='a1'><v>1</v></c></row>")):
        with pytest.raises(UnreadableSpreadsheet):
            xlsx_sheets(bad)


def test_csv_sheet_handles_bom_quotes_and_limits():
    name, rows, truncated = csv_sheet("a.csv", '﻿Name,Note\n"Lê, Văn","say ""hi"""\n'.encode())
    assert (name, rows, truncated) == ("a.csv", [["Name", "Note"], ["Lê, Văn", 'say "hi"']], False)
    assert csv_sheet("b.csv", ("x\n" * (MAX_ROWS + 1)).encode())[2]


def preview(monkeypatch, filename: str, body: bytes):
    """Calls the preview route with storage and access stubbed; returns the response."""

    class Storage:
        def __init__(self, settings):
            pass

        async def get(self, key):
            return body

    async def allowed(*args, **kwargs):
        return None

    row = {"id": "a1", "workspace_id": "w", "entity_type": "issue", "entity_id": "i", "object_key": "k",
           "filename": filename, "mime_type": "application/octet-stream"}
    db = SimpleNamespace(execute=lambda *a, **k: _result(row))
    monkeypatch.setattr(native_attachments, "MinioStorage", Storage)
    monkeypatch.setattr(native_attachments, "_authorize_entity", allowed)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=None)))
    return asyncio.run(native_attachments.preview_attachment("a1", request, {"id": "u"}, db))


async def _result(row):
    return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: row))


def test_html_preview_is_sandboxed_and_cannot_reach_the_network(monkeypatch):
    response = preview(monkeypatch, "page.html", b"<h1>Hi</h1><script>alert(document.cookie)</script>")
    policy = response.headers["content-security-policy"]
    assert policy.startswith("sandbox;") and "allow-scripts" not in policy and "default-src 'none'" in policy
    page = response.body.decode()
    assert page.startswith('<meta http-equiv="Content-Security-Policy" content="default-src \'none\';')
    assert "<h1>Hi</h1>" in page


def test_spreadsheet_and_text_previews(monkeypatch):
    sheet = preview(monkeypatch, "plan.xlsx", workbook('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'))
    assert "<td>Task</td>" in sheet.body.decode() and sheet.headers["content-security-policy"].startswith("sandbox;")
    assert "<td>b</td>" in preview(monkeypatch, "a.csv", b"a,b\n").body.decode()
    assert "&lt;b&gt;" in preview(monkeypatch, "notes.txt", b"<b>").body.decode()
    with pytest.raises(ApiError) as refused:
        preview(monkeypatch, "broken.xlsx", b"nope")
    assert refused.value.status_code == 422
