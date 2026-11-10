"""Read-only table previews of spreadsheet attachments (XLSX and CSV).

XLSX is read with the standard library: the file is a ZIP of XML parts, so the workbook, its
relationships, shared strings and each sheet are parsed with ElementTree, which does not
resolve external entities. Every part is checked against its declared size before it is
decompressed, and ZipFile stops at that size, so a ZIP bomb cannot exhaust memory. Only the
first MAX_ROWS rows and MAX_COLUMNS columns of each sheet are shown, with a note when cut.
Cell text is HTML-escaped; the page carries no script.
VI: Xem trước dạng bảng, chỉ đọc, cho attachment bảng tính (XLSX và CSV). XLSX đọc bằng thư
VI: viện chuẩn: file là ZIP chứa các phần XML, nên workbook, quan hệ, chuỗi dùng chung và từng
VI: sheet được phân tích bằng ElementTree, vốn không phân giải entity bên ngoài. Mỗi phần được
VI: kiểm tra kích thước khai báo trước khi giải nén, và ZipFile dừng ở kích thước đó, nên ZIP
VI: bomb không thể làm cạn bộ nhớ. Mỗi sheet chỉ hiện MAX_ROWS dòng và MAX_COLUMNS cột đầu, có
VI: ghi chú khi bị cắt. Nội dung ô được escape HTML; trang không chứa script.
"""

from __future__ import annotations

import csv
import posixpath
import re
from html import escape
from io import BytesIO, StringIO
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

MAX_ROWS = 500
MAX_COLUMNS = 50
# Largest decompressed XML part read from a workbook. VI: Phần XML giải nén lớn nhất được đọc.
MAX_PART_BYTES = 20 * 1024 * 1024
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RELATIONSHIP = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PACKAGE_RELATIONSHIP = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
CELL_REFERENCE = re.compile(r"^([A-Z]+)")

Sheet = tuple[str, list[list[str]], bool]


class UnreadableSpreadsheet(Exception):
    """The file is not a workbook this preview can read. VI: File không phải workbook đọc được."""


def _column(reference: str) -> int:
    """Zero-based column of a cell reference such as `AB12`. VI: Cột (từ 0) của ô như `AB12`."""
    # A reference without column letters is a malformed workbook; ValueError makes the caller
    # report it as unreadable.
    # VI: Tham chiếu không có chữ cột là workbook hỏng; ValueError khiến nơi gọi báo là không đọc được.
    found = CELL_REFERENCE.match(reference)
    if found is None:
        raise ValueError(f"Not a cell reference: {reference!r}")
    index = 0
    for letter in found.group(1):
        index = index * 26 + ord(letter) - 64
    return index - 1


def xlsx_sheets(body: bytes) -> list[Sheet]:
    """Sheets of a workbook as `(name, rows, truncated)`, in workbook order.

    Values are shown as stored: numbers and dates keep their raw form because number formats
    are not applied (a date appears as its serial number).
    shortcut: number formats are ignored; apply `styles.xml` formats if users need dates shown.
    VI: Các sheet của workbook dạng `(tên, dòng, bị cắt)`, theo thứ tự trong workbook. Giá trị
    VI: hiện như được lưu: số và ngày giữ dạng thô vì không áp định dạng số (ngày hiện là số sê-ri).
    VI: shortcut: bỏ qua định dạng số; áp định dạng trong `styles.xml` nếu người dùng cần xem ngày.
    """
    try:
        with ZipFile(BytesIO(body)) as book:
            names = set(book.namelist())

            def opened(name: str):
                if book.getinfo(name).file_size > MAX_PART_BYTES:
                    raise UnreadableSpreadsheet("A part of the workbook is too large to preview.")
                return book.open(name)

            def part(name: str):
                with opened(name) as stream:
                    return ElementTree.parse(stream).getroot()

            shared = []
            if "xl/sharedStrings.xml" in names:
                for item in part("xl/sharedStrings.xml").iter(f"{MAIN}si"):
                    runs = item.findall(f"{MAIN}t") + item.findall(f"{MAIN}r/{MAIN}t")
                    shared.append("".join(run.text or "" for run in runs))
            targets = {
                rel.get("Id"): rel.get("Target", "")
                for rel in part("xl/_rels/workbook.xml.rels").iter(PACKAGE_RELATIONSHIP)
            }
            sheets: list[Sheet] = []
            for sheet in part("xl/workbook.xml").iter(f"{MAIN}sheet"):
                target = targets.get(sheet.get(RELATIONSHIP), "")
                location = target.lstrip("/") if target.startswith("/") else posixpath.normpath(f"xl/{target}")
                if location not in names:
                    continue
                rows: list[list[str]] = []
                truncated = False
                with opened(location) as stream:
                    for _, row in ElementTree.iterparse(stream):
                        if row.tag != f"{MAIN}row":
                            continue
                        number = int(row.get("r") or len(rows) + 1)
                        if number > MAX_ROWS:
                            truncated = True
                            break
                        rows += [[]] * (number - 1 - len(rows))
                        values: list[str] = []
                        for cell in row.iter(f"{MAIN}c"):
                            column = _column(reference) if (reference := cell.get("r")) else len(values)
                            if column >= MAX_COLUMNS:
                                truncated = True
                                continue
                            kind, value = cell.get("t"), cell.findtext(f"{MAIN}v") or ""
                            if kind == "s":
                                value = shared[int(value)] if value.isdigit() and int(value) < len(shared) else ""
                            elif kind == "inlineStr":
                                value = "".join(t.text or "" for t in cell.iter(f"{MAIN}t"))
                            elif kind == "b":
                                value = "TRUE" if value == "1" else "FALSE"
                            values += [""] * (column - len(values)) + [value]
                        rows.append(values)
                        row.clear()
                sheets.append((sheet.get("name") or "Sheet", rows, truncated))
            return sheets
    except (BadZipFile, KeyError, ElementTree.ParseError, AttributeError, ValueError) as error:
        raise UnreadableSpreadsheet("The spreadsheet could not be read.") from error


def csv_sheet(name: str, body: bytes) -> Sheet:
    """A CSV file as one sheet; UTF-8 (with or without BOM), undecodable bytes replaced.
    VI: File CSV thành một sheet; UTF-8 (có hoặc không BOM), byte lỗi được thay thế."""
    rows: list[list[str]] = []
    truncated = False
    for row in csv.reader(StringIO(body.decode("utf-8-sig", errors="replace"))):
        if len(rows) == MAX_ROWS:
            truncated = True
            break
        truncated = truncated or len(row) > MAX_COLUMNS
        rows.append(row[:MAX_COLUMNS])
    return (name, rows, truncated)


def table_page(title: str, sheets: list[Sheet]) -> str:
    """Static HTML page with one table per sheet. VI: Trang HTML tĩnh, mỗi sheet một bảng."""
    sections = []
    for name, rows, truncated in sheets:
        width = max((len(row) for row in rows), default=0)
        body = "".join(
            "<tr>" + "".join(f"<td>{escape(value)}</td>" for value in row + [""] * (width - len(row))) + "</tr>"
            for row in rows
        )
        note = f'<p class="note">Showing the first {MAX_ROWS} rows and {MAX_COLUMNS} columns.</p>' if truncated else ""
        heading = f"<h2>{escape(name)}</h2>" if len(sheets) > 1 else ""
        sections.append(f"<section>{heading}{note}<table>{body}</table></section>")
    return (
        f'<!doctype html><html><head><meta charset="utf-8"><title>{escape(title)}</title><style>'
        "body{margin:0;padding:16px;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#202124}"
        "h2{font-size:14px;margin:16px 0 8px}.note{color:#5f6368;margin:0 0 8px}"
        "table{border-collapse:collapse}td{border:1px solid #d0d7de;padding:4px 8px;white-space:pre-wrap;"
        "vertical-align:top}tr:first-child td{background:#f6f8fa;font-weight:600}"
        f"</style></head><body>{''.join(sections) or '<p>This file has no rows.</p>'}</body></html>"
    )
