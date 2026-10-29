"""FDS/TDS steps of a run: read the task's feature documents before review and save the
drafts the review returns before any code is written.

Both steps warn instead of failing the run: a connection without document scopes, or a
document that cannot be saved, is reported in the plan comment and the run summary, so
missing documentation is visible without blocking delivery (the agreed "warn first" level).
VI: Các bước FDS/TDS của một run: đọc tài liệu tính năng của task trước review và lưu bản
VI: nháp mà review trả về trước khi viết code. Cả hai bước chỉ cảnh báo chứ không làm run
VI: thất bại: kết nối thiếu quyền tài liệu, hoặc tài liệu không lưu được, được ghi vào comment
VI: kế hoạch và tóm tắt run, nên việc thiếu tài liệu vẫn hiện rõ mà không chặn giao việc
VI: (mức "cảnh báo trước" đã thống nhất).
"""

from .progress import one_line


async def read_feature_docs(client, issue_id):
    """Return get_feature_docs for the issue, or an empty result carrying a warning.
    VI: Trả kết quả get_feature_docs của issue, hoặc kết quả rỗng kèm cảnh báo."""
    try:
        return await client.call("get_feature_docs", {"issueId": issue_id})
    except Exception as error:
        return {
            "linked": [],
            "features": [],
            "warning": f"FDS/TDS could not be read: {one_line(error)}",
        }


async def save_feature_docs(client, issue_id, drafts, current, key):
    """Upsert each reviewed draft and return one note per document or warning.

    Notes read like "FDS · Tree v3"; a failed save becomes "⚠ FDS · Tree was not saved: …",
    and a review without drafts repeats the server's missing-document warning.
    VI: Lưu từng bản nháp đã review và trả về một ghi chú cho mỗi tài liệu hoặc cảnh báo. Ghi
    VI: chú có dạng "FDS · Tree v3"; lưu lỗi thành "⚠ FDS · Tree was not saved: …", và review
    VI: không có bản nháp sẽ lặp lại cảnh báo thiếu tài liệu của server.
    """
    notes = []
    for draft in drafts:
        try:
            saved = await client.call(
                "upsert_feature_doc", {"issueId": issue_id, **draft, "idempotencyKey": key()}
            )
            notes.append(f"{saved['title']} v{saved['version']}")
        except Exception as error:
            notes.append(
                f"⚠ {draft['docType']} · {draft['feature']} was not saved: {one_line(error)}"
            )
    if not drafts and current.get("warning"):
        notes.append(f"⚠ {current['warning']}")
    return notes
