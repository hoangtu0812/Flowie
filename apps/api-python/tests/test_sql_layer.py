from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "apps/api-python/app"
sys.path.insert(0, str(ROOT / "scripts"))

from check_sql_schema import check  # noqa: E402

TABLES = {"issues": {"id", "title", "team_id"}, "teams": {"id", "name"}}


class SqlLayerTests(unittest.TestCase):
    def test_text_calls_live_only_in_queries_and_commands(self):
        # Every raw SQL statement belongs to a queries.py (reads) or commands.py (writes) file
        # next to its caller, so a schema change has one known set of files to review.
        # VI: Mọi câu SQL thô thuộc file queries.py (đọc) hoặc commands.py (ghi) cạnh nơi gọi,
        # VI: để khi schema đổi có một tập file xác định cần rà.
        outside = [
            f"{path.relative_to(ROOT)}:{node.lineno}"
            for path in sorted(APP.rglob("*.py"))
            if path.name not in {"queries.py", "commands.py"}
            for node in ast.walk(ast.parse(path.read_text(), str(path)))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "text"
        ]
        self.assertEqual(outside, [], "move these text() statements into queries.py or commands.py")

    def test_schema_check_accepts_known_names(self):
        self.assertEqual(
            check(
                "WITH x AS (SELECT id FROM teams) SELECT i.id, t.name, x.anything FROM issues i "
                "JOIN teams t ON t.id = i.team_id JOIN x ON x.id = t.id "
                "WHERE i.title ILIKE :q AND EXTRACT(EPOCH FROM now()) > 0 AND i.ctid IS NOT NULL",
                TABLES,
            ),
            [],
        )
        self.assertEqual(
            check(
                "INSERT INTO teams (id, name) VALUES (:id, :name) "
                "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
                TABLES,
            ),
            [],
        )

    def test_schema_check_reports_unknown_tables_and_columns(self):
        cases = {
            "SELECT * FROM issue x": "unknown table 'issue'",
            "SELECT i.titel FROM issues i": "unknown column i.titel (table issues)",
            "INSERT INTO teams (id, nam) VALUES (:id, :n)": "unknown column teams.nam in INSERT",
            "UPDATE teams SET nam = :n WHERE id = :id": "unknown column teams.nam in UPDATE SET",
            "INSERT INTO teams (id, name) VALUES (:a, :b) ON CONFLICT (id) DO UPDATE SET nme = EXCLUDED.name":
                "unknown column teams.nme in ON CONFLICT SET",
        }
        for sql, finding in cases.items():
            with self.subTest(sql=sql):
                self.assertIn(finding, check(sql, TABLES))

    def test_schema_check_skips_names_it_cannot_resolve(self):
        # Interpolated tables and subquery aliases are not guessed at.
        # VI: Bảng nội suy và alias của subquery không bị đoán.
        self.assertEqual(check("SELECT e.whatever FROM __dyn__ e", TABLES), [])
        self.assertEqual(check("SELECT s.calls FROM (SELECT 1 AS calls) s", TABLES), [])


if __name__ == "__main__":
    unittest.main()
