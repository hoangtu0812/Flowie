"""Check that the API's SQL names only tables and columns that schema.prisma defines.

Prisma owns the schema, but the Python API reaches the database through hand-written
`sqlalchemy.text()` statements, so renaming a column in `schema.prisma` breaks nothing at
build time. This script reads every `text()` argument under `apps/api-python/app`
(interpolated parts become an opaque placeholder) and reports:

- a name after FROM / JOIN / INTO / UPDATE that is not a table, a CTE of the same statement,
  a function call or a subquery;
- `alias.column` where the alias belongs to a real table in the same statement and that
  table has no such column (`EXCLUDED.column` checks the INSERT target);
- a column in `INSERT INTO table (...)`, `UPDATE table SET column = ...` or
  `ON CONFLICT ... DO UPDATE SET column = ...` that the table does not have.

Names it cannot pin to one table (aliases of CTEs or subqueries, interpolated tables,
unqualified columns in SELECT/WHERE) are skipped rather than guessed, so a finding is
always a real mismatch. Usage: `python scripts/check_sql_schema.py`; exit code 1 lists
each finding as `file:line: message`.

VI: Kiểm tra SQL của API chỉ nhắc tới bảng và cột có trong schema.prisma.
VI: Prisma sở hữu schema, nhưng API Python truy cập database bằng câu `sqlalchemy.text()`
VI: viết tay, nên đổi tên cột trong `schema.prisma` không làm hỏng gì lúc build. Script đọc
VI: mọi đối số `text()` trong `apps/api-python/app` (phần nội suy thành chỗ trống) và báo:
VI: - tên sau FROM / JOIN / INTO / UPDATE không phải bảng, CTE của cùng câu, hàm hay subquery;
VI: - `alias.cột` mà alias thuộc một bảng thật trong cùng câu và bảng đó không có cột ấy
VI:   (`EXCLUDED.cột` kiểm theo bảng đích của INSERT);
VI: - cột trong `INSERT INTO bảng (...)`, `UPDATE bảng SET cột = ...` hoặc
VI:   `ON CONFLICT ... DO UPDATE SET cột = ...` mà bảng không có.
VI: Tên không gắn chắc được vào một bảng (alias của CTE/subquery, bảng nội suy, cột không
VI: có alias trong SELECT/WHERE) được bỏ qua thay vì đoán, nên mỗi lỗi báo ra đều là sai
VI: thật. Cách dùng: `python scripts/check_sql_schema.py`; mã thoát 1 kèm danh sách
VI: `file:dòng: thông báo`.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "packages/database/prisma/schema.prisma"
APP = ROOT / "apps/api-python/app"
DYNAMIC = "__dyn__"
# Postgres system columns exist on every table without being declared in the schema.
# VI: Cột hệ thống của Postgres có trên mọi bảng dù schema không khai báo.
SYSTEM_COLUMNS = frozenset({"ctid", "xmin", "xmax", "cmin", "cmax", "oid", "tableoid"})

# Words that can follow FROM/JOIN/INTO/UPDATE or a table without being a table or alias.
# VI: Các từ có thể đứng sau FROM/JOIN/INTO/UPDATE hay sau tên bảng mà không phải bảng/alias.
KEYWORDS = frozenset(
    """
    all and any array as asc between both by case cast check conflict constraint cross
    current_date current_timestamp default delete desc distinct do else end except excluded
    exists false fetch filter for from full group having ilike in inner insert intersect into
    is join key lateral leading left like limit local locked natural no not nothing null
    nulls of offset on only or order outer over partition recursive returning right rows
    select set share skip some table then trailing true union unnest update using values
    when where window with within
    """.split()
)
# A FROM after these words belongs to an expression (EXTRACT, IS DISTINCT FROM, SUBSTRING).
# VI: FROM đứng sau các từ này thuộc một biểu thức (EXTRACT, IS DISTINCT FROM, SUBSTRING).
EXPRESSION_FROM = frozenset(
    "distinct epoch year month day hour minute second week dow isodow doy quarter both leading trailing".split()
)

LITERALS = re.compile(r"'(?:[^']|'')*'|--[^\n]*")
BIND = re.compile(r"(?<![:\w]):\w+")
CAST = re.compile(r"::\s*\"?\w+\"?(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])?")
QUOTED = re.compile(r'"(\w+)"')
CTE = re.compile(
    r"(?:\bWITH(?:\s+RECURSIVE)?|,)\s+(\w+)\s*(?:\([^()]*\))?\s+AS\s+(?:NOT\s+)?(?:MATERIALIZED\s+)?\(",
    re.I,
)
TABLE_REF = re.compile(r"\b(FROM|JOIN|INTO|UPDATE)\s+(?:ONLY\s+)?(\w+)", re.I)
SUBQUERY_ALIAS = re.compile(r"\)\s+(?:AS\s+)?(\w+)")
QUALIFIED = re.compile(r"(?<![\w.])(\w+)\s*\.\s*(\w+)\b(?!\s*\()")
INSERT_COLUMNS = re.compile(r"\bINSERT\s+INTO\s+(\w+)(?:\s+AS\s+\w+)?\s*\(([^()]*)\)", re.I)
UPDATE_SET = re.compile(r"\bUPDATE\s+(?:ONLY\s+)?(\w+)(?:\s+(?:AS\s+)?(?!SET\b)\w+)?\s+SET\s+", re.I)
CONFLICT_SET = re.compile(r"\bDO\s+UPDATE\s+SET\s+", re.I)
SET_END = re.compile(r"\b(?:WHERE|FROM|RETURNING)\b", re.I)


def load_schema(text: str) -> dict[str, set[str]]:
    """Map each table (`@@map`) to its columns (`@map` or field name), relations excluded.

    VI: Ánh xạ mỗi bảng (`@@map`) tới các cột (`@map` hoặc tên field), bỏ field quan hệ.
    """
    blocks = re.findall(r"^model (\w+) \{(.*?)^\}", text, re.M | re.S)
    models = {name for name, _ in blocks}
    tables: dict[str, set[str]] = {}
    for name, body in blocks:
        mapped = re.search(r'@@map\("([^"]+)"\)', body)
        columns = set()
        for raw in body.splitlines():
            line = raw.split("//")[0].strip()
            field = re.match(r"(\w+)\s+(\S+)", line)
            if not field or line.startswith("@@"):
                continue
            kind = re.sub(r"[\[\]?]", "", field.group(2))
            if kind in models:
                continue
            column = re.search(r'@map\("([^"]+)"\)', line)
            columns.add(column.group(1) if column else field.group(1))
        tables[mapped.group(1) if mapped else name] = columns
    return tables


def render(node: ast.expr) -> str:
    """SQL text of a `text()` argument; anything computed at run time becomes DYNAMIC.

    VI: Văn bản SQL của đối số `text()`; phần tính lúc chạy thành DYNAMIC.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            v.value if isinstance(v, ast.Constant) else f" {DYNAMIC} " for v in node.values
        )
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return render(node.left) + render(node.right)
    return f" {DYNAMIC} "


def statements(app: Path):
    """Yield (path, line, sql) for every `text()` call under `app`.

    VI: Trả (đường dẫn, dòng, sql) cho mọi lời gọi `text()` trong `app`.
    """
    for path in sorted(app.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(), str(path))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "text" and node.args:
                yield path, node.lineno, render(node.args[0])


def fragment_ctes(app: Path) -> set[str]:
    """CTE names defined in any string literal under `app`.

    Shared CTE prefixes such as `history_ctes(scope)` reach a statement as an interpolated
    value, so their names are only accepted in statements that have an interpolated part.
    VI: Tên CTE được định nghĩa trong bất kỳ chuỗi nào dưới `app`. Phần CTE dùng chung như
    VI: `history_ctes(scope)` tới câu lệnh dưới dạng giá trị nội suy, nên các tên này chỉ được
    VI: chấp nhận trong câu có phần nội suy.
    """
    names: set[str] = set()
    for path in sorted(app.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(), str(path))):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                names.update(name.lower() for name in CTE.findall(normalize(node.value)))
    return names


def normalize(sql: str) -> str:
    sql = LITERALS.sub(lambda m: "''" if m.group(0).startswith("'") else " ", sql)
    sql = CAST.sub(" ", sql)
    sql = BIND.sub(" 0 ", sql)
    return QUOTED.sub(r"\1", sql)


def set_columns(sql: str, start: int) -> list[str]:
    """Column names assigned in the SET list that starts at `start` (top-level commas only).

    VI: Tên cột được gán trong danh sách SET bắt đầu ở `start` (chỉ tách ở dấu phẩy ngoài ngoặc).
    """
    end = SET_END.search(sql, start)
    body = sql[start : end.start() if end else len(sql)]
    parts, depth, current = [], 0, ""
    for char in body:
        depth += char == "("
        depth -= char == ")"
        if char == "," and depth == 0:
            parts.append(current)
            current = ""
        elif depth >= 0:
            current += char
    parts.append(current)
    names = []
    for part in parts:
        target = re.match(r"\s*(\w+)\s*=", part)
        if target:
            names.append(target.group(1))
    return names


def check(sql: str, tables: dict[str, set[str]], shared_ctes: frozenset[str] = frozenset()) -> list[str]:
    """Findings for one statement; an empty list means every resolvable name exists.

    VI: Các lỗi của một câu; danh sách rỗng nghĩa là mọi tên xác định được đều tồn tại.
    """
    sql = normalize(sql)
    found: list[str] = []
    ctes = {name.lower() for name in CTE.findall(sql)}
    if DYNAMIC in sql:
        ctes |= shared_ctes
    aliases: dict[str, set[str]] = {}
    unknown: set[str] = set(ctes)
    for match in TABLE_REF.finditer(sql):
        name = match.group(2)
        lower = name.lower()
        before = sql[: match.start()].split()
        rest = sql[match.end() :]
        if (
            lower in KEYWORDS
            or name == DYNAMIC
            or name.isdigit()
            or rest.lstrip().startswith(("(", "."))
            or (match.group(1).upper() == "FROM" and before and before[-1].lower() in EXPRESSION_FROM)
        ):
            continue
        if lower in ctes:
            target = None
        elif name in tables:
            target = name
        elif lower.startswith(("pg_", "information_schema")):
            continue
        else:
            found.append(f"unknown table {name!r}")
            continue
        alias = re.match(r"\s+(?:AS\s+)?(\w+)", rest, re.I)
        names = {lower}
        if alias and alias.group(1).lower() not in KEYWORDS and alias.group(1) != DYNAMIC:
            names.add(alias.group(1).lower())
        for key in names:
            if target is None:
                unknown.add(key)
            else:
                aliases.setdefault(key, set()).add(target)
    unknown.update(a.lower() for a in SUBQUERY_ALIAS.findall(sql) if a.lower() not in KEYWORDS)
    insert = INSERT_COLUMNS.search(sql)
    if insert and insert.group(1) in tables:
        aliases.setdefault("excluded", set()).add(insert.group(1))
        for column in insert.group(2).split(","):
            column = column.strip()
            if column and column != DYNAMIC and column not in tables[insert.group(1)]:
                found.append(f"unknown column {insert.group(1)}.{column} in INSERT")
    for match in UPDATE_SET.finditer(sql):
        if match.group(1) in tables:
            for column in set_columns(sql, match.end()):
                if column != DYNAMIC and column not in tables[match.group(1)]:
                    found.append(f"unknown column {match.group(1)}.{column} in UPDATE SET")
    for match in CONFLICT_SET.finditer(sql):
        if insert and insert.group(1) in tables:
            for column in set_columns(sql, match.end()):
                if column != DYNAMIC and column not in tables[insert.group(1)]:
                    found.append(f"unknown column {insert.group(1)}.{column} in ON CONFLICT SET")
    for alias, column in QUALIFIED.findall(sql):
        key = alias.lower()
        if key in unknown or key not in aliases or column == DYNAMIC:
            continue
        owners = aliases[key]
        if column not in SYSTEM_COLUMNS and not any(column in tables[t] for t in owners):
            found.append(f"unknown column {alias}.{column} (table {'/'.join(sorted(owners))})")
    return found


def main() -> int:
    tables = load_schema(SCHEMA.read_text())
    shared = frozenset(fragment_ctes(APP))
    problems = 0
    for path, line, sql in statements(APP):
        for finding in check(sql, tables, shared):
            problems += 1
            print(f"{path.relative_to(ROOT)}:{line}: {finding}")
    print(f"checked {len(tables)} tables; {problems} finding(s)", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
