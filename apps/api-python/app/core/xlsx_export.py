"""Single-sheet XLSX workbooks written with the standard library.

Every cell is an inline string or a number, never a formula, so text such as `=SUM(1)` stays
text without the tab prefix CSV needs. Characters XML 1.0 cannot carry are removed. The first
row is bold and frozen, with an auto filter, so the file opens ready to sort and filter.
VI: Workbook XLSX một sheet, ghi bằng thư viện chuẩn. Mỗi ô là chuỗi inline hoặc số, không bao
VI: giờ là công thức, nên chữ như `=SUM(1)` vẫn là chữ mà không cần tiền tố tab như CSV. Ký tự
VI: XML 1.0 không chứa được bị loại bỏ. Dòng đầu in đậm, cố định và có auto filter, nên file mở
VI: ra là lọc và sắp xếp được ngay.
"""

import re
from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

INVALID_XML = re.compile("[^\t\n\r\x20-퟿-�\U00010000-\U0010ffff]")
# Excel's own cell text limit. VI: Giới hạn độ dài chữ trong một ô của Excel.
MAX_CELL_TEXT = 32767

PARTS = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
}


def _column(index: int) -> str:
    """Letters of a zero-based column index, e.g. 27 -> `AB`. VI: Chữ cột của chỉ số từ 0."""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _cell(reference: str, value, style: str) -> str:
    """One cell: numbers stay numeric, everything else is inline text, empty values are skipped.
    VI: Một ô: số giữ dạng số, còn lại là chữ inline, giá trị rỗng thì bỏ qua."""
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{reference}"{style}><v>{value}</v></c>'
    text = INVALID_XML.sub("", str(value))[:MAX_CELL_TEXT]
    return f'<c r="{reference}"{style} t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def xlsx_bytes(sheet_name: str, columns: list[str], rows) -> bytes:
    """Workbook with one sheet: `columns` as the bold header, then `rows` (lists of cell values).
    VI: Workbook một sheet: `columns` làm tiêu đề in đậm, sau đó là `rows` (danh sách giá trị ô)."""
    lines = []
    for number, row in enumerate([columns, *rows], start=1):
        style = ' s="1"' if number == 1 else ""
        cells = "".join(
            _cell(f"{_column(index)}{number}", value, style)
            for index, value in enumerate(row)
        )
        lines.append(f'<row r="{number}">{cells}</row>')
    last = f"{_column(len(columns) - 1)}{len(lines)}"
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f'<sheetData>{"".join(lines)}</sheetData><autoFilter ref="A1:{last}"/></worksheet>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets>'
        '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'
        f"&apos;{escape(sheet_name)}&apos;!$A$1:${_column(len(columns) - 1)}${len(lines)}"
        "</definedName></definedNames></workbook>"
    )
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in PARTS.items():
            archive.writestr(name, content)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return output.getvalue()
