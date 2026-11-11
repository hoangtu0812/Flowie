import pytest

from app.core.errors import ApiError
from app.modules.mcp.application import result_bytes
from app.modules.mcp.compact import compact_document
from app.modules.mcp.outline import find_section, outline

DOC = """# Title

Intro.

## 1. Rules
Rule text.

```md
# not a heading
```

### 1.1 Detail
Detail text.

## 2. API ##
API text.
"""


def test_outline_has_levels_lines_offsets_and_section_sizes():
    items = outline(DOC)
    assert [(h["level"], h["title"], h["line"]) for h in items] == [
        (1, "Title", 1), (2, "1. Rules", 5), (3, "1.1 Detail", 12), (2, "2. API", 15),
    ]
    rules = items[1]
    part = DOC[rules["offset"] : rules["offset"] + rules["length"]]
    # A section runs to the next heading of the same or a higher level, sub-sections included.
    # VI: Một phần kéo tới heading kế tiếp cùng cấp hoặc cao hơn, gồm cả mục con.
    assert part.startswith("## 1. Rules") and "Detail text." in part and "API text." not in part
    assert items[0]["length"] == len(DOC)
    assert outline(DOC, max_level=2, positions=False) == [
        {"level": 1, "title": "Title", "line": 1},
        {"level": 2, "title": "1. Rules", "line": 5},
        {"level": 2, "title": "2. API", "line": 15},
    ]


def test_find_section_matches_titles_and_explains_misses():
    assert find_section(DOC, "## 2. api")["line"] == 15
    with pytest.raises(ApiError) as missing:
        find_section(DOC, "Nope")
    assert missing.value.status_code == 404 and '"1. Rules"' in missing.value.message
    with pytest.raises(ApiError) as twice:
        find_section("## A\n\n## A\n", "A")
    assert twice.value.status_code == 400 and "lines 1, 3" in twice.value.message


def test_compact_document_drops_the_text_of_a_long_fds():
    # A realistic long FDS (~60 KB, 40 sections): the write result must stay small.
    # VI: Một FDS dài thực tế (~60 KB, 40 mục): kết quả ghi phải nhỏ.
    sections = "".join(f"## {n}. Section\n\n" + "Rule line with details.\n" * 60 for n in range(40))
    data = {"id": "doc", "title": "FDS", "version": 3, "content": "# FDS\n\n" + sections, "teamId": "t"}
    full = result_bytes({"data": data})
    short = compact_document(data, include_content=False)
    assert "content" not in short and short["length"] == len(data["content"]) and len(short["outline"]) == 41
    assert result_bytes({"data": short}) < full / 10
    assert compact_document(data, include_content=True)["content"] == data["content"]
