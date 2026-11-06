"""Knowledge the Service Desk assistant may answer from, and the passages it hands the model.

Scope is decided here, in SQL, and never by the question or the model: the latest approved
release of a GUIDE or FDS document filed under a project that accepts tickets, with the document,
project and team not archived. Every workspace member may ask, so anything inside this scope can
reach people outside the document's team; anything outside it must never reach the model.
VI: Kiến thức trợ lý Service Desk được dùng để trả lời, và các đoạn văn bản đưa cho model.
VI: Phạm vi được quyết định tại đây, bằng SQL, không bao giờ do câu hỏi hay model: bản phát hành
VI: đã duyệt mới nhất của tài liệu GUIDE hoặc FDS nằm trong dự án nhận ticket, với tài liệu, dự án
VI: và team chưa lưu trữ. Mọi thành viên workspace đều hỏi được, nên nội dung trong phạm vi có thể
VI: tới người ngoài team của tài liệu; nội dung ngoài phạm vi không bao giờ được tới model.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..modules.work_items.issue_search import NORMALIZED, VIETNAMESE

# Common Vietnamese and English question words. They match almost every document, so keeping
# them would rank documents by how much prose they have instead of by the question's subject.
# VI: Các từ để hỏi phổ biến tiếng Việt và tiếng Anh. Chúng khớp gần như mọi tài liệu, nên nếu giữ
# VI: lại thì tài liệu được xếp theo độ dài văn bản thay vì theo chủ đề của câu hỏi.
STOP_WORDS = frozenset(
    'la co khong cua toi ban the nao lam sao gi duoc cho va voi mot nhung cac de thi o a '
    'how what is to the do can i in on of and or for my'.split()
)
MAX_TERMS = 20
MAX_DOCUMENTS = 5
MAX_SECTIONS = 8
MAX_SECTION_CHARS = 3_000
MAX_SOURCE_CHARS = 12_000
FOLD = str.maketrans(VIETNAMESE, NORMALIZED)
WORD = re.compile(r'[a-z0-9]+')
HEADING = re.compile(r'^(#{1,4})\s+(.+?)\s*#*\s*$')
FENCE = re.compile(r'^\s*(```|~~~)')

# Documents in scope with their latest release. The latest release is chosen before matching, so
# words that only an older release contained never select a document.
# VI: Tài liệu trong phạm vi kèm bản phát hành mới nhất. Bản mới nhất được chọn trước khi so khớp,
# VI: nên từ chỉ có trong bản cũ không bao giờ làm tài liệu được chọn.
SCOPE = """
SELECT d.id AS document_id, r.release, r.title, r.content, d.team_id, p.id AS project_id, p.name AS project_name
FROM documents d
JOIN document_folders f ON f.id = d.folder_id
JOIN projects p ON p.id = f.project_id AND p.service_desk_enabled AND p.archived_at IS NULL
JOIN teams t ON t.id = p.team_id AND t.archived_at IS NULL
JOIN LATERAL (
    SELECT release, title, content FROM document_releases
    WHERE document_id = d.id ORDER BY release DESC LIMIT 1
) r ON true
WHERE d.workspace_id = :workspace AND d.archived_at IS NULL AND d.doc_type IN ('GUIDE', 'FDS')
"""


def fold(value: str) -> str:
    """Lower-case and strip Vietnamese accents exactly as the SQL ``translate`` does.

    NFC first, so text typed in decomposed form (common on macOS) folds like composed text.
    VI: Chuyển chữ thường và bỏ dấu tiếng Việt giống hệt ``translate`` trong SQL. Chuẩn hoá NFC
    VI: trước để văn bản gõ ở dạng tách dấu (thường gặp trên macOS) cũng được bỏ dấu như dạng dựng sẵn.
    """
    return unicodedata.normalize('NFC', value).lower().translate(FOLD)


def knowledge_terms(question: str) -> list[str]:
    """Distinct folded words of a question, in order, without stop words or single letters.

    Terms only contain ``[a-z0-9]``, so joining them with `` | `` is always a valid tsquery and
    the question cannot inject tsquery operators.
    VI: Các từ khác nhau đã bỏ dấu của câu hỏi, theo thứ tự, bỏ từ dừng và chữ cái đơn. Từ chỉ gồm
    VI: ``[a-z0-9]`` nên ghép bằng `` | `` luôn là tsquery hợp lệ và câu hỏi không chèn được toán tử.
    """
    terms = [
        word for word in dict.fromkeys(WORD.findall(fold(question)))
        if len(word) > 1 and word not in STOP_WORDS
    ]
    return terms[:MAX_TERMS]


def split_sections(title: str, content: str) -> list[tuple[str, str]]:
    """Split Markdown at headings up to level 4 into ``(heading path, text)`` pairs.

    Text before the first heading takes the document title as its heading. ``#`` lines inside
    fenced code are not headings. Sections with no text besides their heading are dropped.
    VI: Tách Markdown theo heading tới cấp 4 thành cặp ``(đường dẫn heading, nội dung)``. Phần
    VI: trước heading đầu tiên lấy tên tài liệu làm heading. Dòng ``#`` trong khối code không phải
    VI: heading. Đoạn không có nội dung ngoài heading bị bỏ.
    """
    sections: list[tuple[str, str]] = []
    path: list[str] = []
    heading, lines, in_fence = title, [], False

    def flush() -> None:
        body = [line for line in lines if not HEADING.match(line)]
        if '\n'.join(body).strip():
            sections.append((heading, '\n'.join(lines).strip()))

    for line in content.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
        match = None if in_fence else HEADING.match(line)
        if match:
            flush()
            level = len(match[1])
            del path[level - 1:]
            path.append(match[2])
            heading, lines = ' › '.join(path), []
        lines.append(line)
    flush()
    return sections


def _pick_sections(documents: list[dict[str, Any]], terms: list[str]) -> list[dict[str, Any]]:
    """Choose the passages that match the most distinct terms, within the source budget.

    A passage must match at least two distinct terms (one when the question has one), so a
    document chosen for a single common word does not fill the prompt. Passages that do not fit
    the remaining budget are skipped so a shorter one further down can still be used.
    VI: Chọn các đoạn khớp nhiều từ khác nhau nhất, trong ngân sách ký tự. Một đoạn phải khớp ít
    VI: nhất hai từ khác nhau (một nếu câu hỏi chỉ có một từ), để tài liệu được chọn chỉ vì một từ
    VI: phổ biến không chiếm prompt. Đoạn không vừa ngân sách còn lại bị bỏ qua để đoạn ngắn hơn
    VI: phía sau vẫn được dùng.
    """
    wanted = set(terms)
    needed = min(2, len(terms))
    candidates = []
    for document_order, document in enumerate(documents):
        for section_order, (heading, body) in enumerate(split_sections(document['title'], document['content'])):
            counts = Counter(WORD.findall(fold(f"{document['title']} {heading} {body}")))
            matched = wanted.intersection(counts)
            if len(matched) < needed:
                continue
            score = len(matched) * 10 + sum(counts[term] for term in matched) + float(document['rank'])
            candidates.append((-score, document_order, section_order, document, heading, body[:MAX_SECTION_CHARS]))

    chosen, used = [], 0
    for *_, document, heading, excerpt in sorted(candidates, key=lambda item: item[:3]):
        if len(chosen) == MAX_SECTIONS:
            break
        if used + len(excerpt) > MAX_SOURCE_CHARS:
            continue
        used += len(excerpt)
        chosen.append({
            'id': f'S{len(chosen) + 1}',
            'documentId': document['document_id'],
            'title': document['title'],
            'release': document['release'],
            'heading': heading,
            'projectId': document['project_id'],
            'projectName': document['project_name'],
            'excerpt': excerpt,
            'canOpen': document['can_open'],
        })
    return chosen


async def knowledge_applications(db: AsyncSession, workspace_id: str) -> list[dict[str, str]]:
    """Projects that have at least one document in scope, by name.

    The caller checks that the person is an active workspace member.
    VI: Các dự án có ít nhất một tài liệu trong phạm vi, sắp theo tên. Nơi gọi kiểm tra người dùng
    VI: là thành viên workspace còn ACTIVE.
    """
    rows = await db.execute(
        text(f'SELECT DISTINCT s.project_id, s.project_name FROM ({SCOPE}) s ORDER BY s.project_name, s.project_id'),
        {'workspace': workspace_id},
    )
    return [{'projectId': row['project_id'], 'name': row['project_name']} for row in rows.mappings()]


async def knowledge_sources(db: AsyncSession, workspace_id: str, user_id: str, question: str) -> list[dict[str, Any]]:
    """Passages in scope that answer ``question``, labelled ``S1…Sn``; empty when none match.

    Ranks the latest releases with ``ts_rank_cd`` over an OR query of the question's terms, keeps
    the top five documents and picks passages from them. ``canOpen`` tells the web whether this
    person may open the source document itself, under the same rule as quick search: a document
    with no team, or one whose team they belong to and is not archived. The caller checks that
    the person is an active workspace member.
    VI: Các đoạn trong phạm vi trả lời được ``question``, gắn nhãn ``S1…Sn``; rỗng khi không khớp.
    VI: Xếp hạng bản phát hành mới nhất bằng ``ts_rank_cd`` với truy vấn OR các từ của câu hỏi, giữ
    VI: năm tài liệu đầu và chọn đoạn từ đó. ``canOpen`` cho web biết người này có được mở tài liệu
    VI: gốc không, theo cùng quy tắc với Tìm kiếm nhanh: tài liệu không có team, hoặc thuộc team
    VI: chưa lưu trữ mà họ là thành viên. Nơi gọi kiểm tra người dùng là thành viên workspace ACTIVE.
    """
    terms = knowledge_terms(question)
    if not terms:
        return []
    # shortcut: the search vector is computed per query without an index, which is fine for a few
    # hundred approved GUIDE/FDS documents; add an IMMUTABLE fold function and a GIN index on
    # document_releases when this query gets slow.
    # VI: shortcut: vector tìm kiếm được tính mỗi lần truy vấn, không có index, đủ cho vài trăm tài
    # VI: liệu GUIDE/FDS đã duyệt; thêm hàm bỏ dấu IMMUTABLE và GIN index trên document_releases khi
    # VI: truy vấn này chậm.
    rows = await db.execute(
        text(f"""
            SELECT m.document_id, m.release, m.title, m.content, m.project_id, m.project_name,
                   ts_rank_cd(m.vector, m.query) AS rank,
                   (m.team_id IS NULL OR EXISTS (
                       SELECT 1 FROM teams dt JOIN team_members tm ON tm.team_id = dt.id
                       WHERE dt.id = m.team_id AND dt.archived_at IS NULL AND tm.user_id = :user
                   )) AS can_open
            FROM (
                SELECT s.*, to_tsvector('simple', translate(lower(s.title || ' ' || s.content), :accents, :normalized)) AS vector,
                       to_tsquery('simple', :query) AS query
                FROM ({SCOPE}) s
            ) m
            WHERE m.vector @@ m.query
            ORDER BY rank DESC, m.document_id
            LIMIT :limit
        """),
        {
            'workspace': workspace_id,
            'user': user_id,
            'accents': VIETNAMESE,
            'normalized': NORMALIZED,
            'query': ' | '.join(terms),
            'limit': MAX_DOCUMENTS,
        },
    )
    return _pick_sections([dict(row) for row in rows.mappings()], terms)
