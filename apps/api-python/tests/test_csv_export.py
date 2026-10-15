import csv
from io import StringIO

import pytest

from app.core.csv_export import csv_bytes
from app.core.errors import ApiError


def test_csv_quotes_delimiters_unicode_lines_and_spreadsheet_formula_text():
    values = [
        "=1+1",
        " +CMD()",
        "-formula",
        "@SUM(A1)",
        "＝1+1",
        "＋1",
        "－1",
        "＠SUM(A1)",
        "\ttext",
        "\rtext",
        "\ntext",
    ]
    data = csv_bytes(
        ["Name", "Details"],
        [[value, 'a,"b"\nTài liệu'] for value in values] + [[-3, "normal"]],
    )
    rows = list(csv.reader(StringIO(data.decode("utf-8-sig"))))
    assert rows[0] == ["Name", "Details"]
    assert all(row[0].startswith("\t") for row in rows[1:-1])
    assert rows[-1] == ["-3", "normal"]
    assert all(row[1] == 'a,"b"\nTài liệu' for row in rows[1:-1])
    with pytest.raises(ApiError):
        csv_bytes(["Name"], [["x" * 100]], maximum_bytes=20)
