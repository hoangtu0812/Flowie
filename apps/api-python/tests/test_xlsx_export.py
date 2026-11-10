from app.core.xlsx_export import xlsx_bytes
from app.modules.attachments.tables import xlsx_sheets


def test_xlsx_round_trips_text_numbers_formula_text_and_invalid_xml_characters():
    data = xlsx_bytes(
        "Issues",
        ["ID", "Title", "Effort"],
        [["FL-1", "=SUM(1) <Tài liệu> & \x00bell", 1.5], ["FL-2", None, None]],
    )
    [(name, rows, truncated)] = xlsx_sheets(data)
    assert name == "Issues" and not truncated
    assert rows == [
        ["ID", "Title", "Effort"],
        ["FL-1", "=SUM(1) <Tài liệu> & bell", "1.5"],
        ["FL-2"],
    ]
