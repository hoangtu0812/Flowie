import csv
from io import StringIO, BytesIO
from unicodedata import normalize

from .errors import ApiError


def csv_cell(value):
    text = "" if value is None else str(value)
    # Spreadsheet-facing CSV uses quoted tab prefixes for formula-like text, including full-width variants.
    if isinstance(value, str) and (
        text.startswith(("\t", "\r", "\n"))
        or normalize("NFKC", text).lstrip().startswith(("=", "+", "-", "@"))
    ):
        return "\t" + text
    return text


def csv_bytes(columns, rows, *, maximum_bytes=10 * 1024 * 1024):
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n", quoting=csv.QUOTE_ALL)
    result = BytesIO(b"\xef\xbb\xbf")
    result.seek(0, 2)

    def append(row):
        output.seek(0)
        output.truncate(0)
        writer.writerow([csv_cell(value) for value in row])
        result.write(output.getvalue().encode("utf8"))
        if result.tell() > maximum_bytes:
            raise ApiError(
                400, "Narrow the filters; the export is too large.", "Bad Request"
            )

    append(columns)
    for row in rows:
        append(row)
    return result.getvalue()
