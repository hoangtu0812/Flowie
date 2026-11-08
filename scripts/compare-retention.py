"""Compares the retiring worker's retention decisions with the Python port's.

Both run over byte-identical clones of one seeded database and every row either
could write is compared. Usage:

    RETENTION_DIFF_DATABASE_URL=postgresql://flowie_test:...@localhost:5432/flowie_x \
        python scripts/compare-retention.py

The URL must be a loopback `flowie_*` database and its role must be allowed to
create databases: the script drops and recreates three of them beside it.

Exits non-zero when the two disagree, or when they agree on something the
fixture says is wrong.

VI: So quyết định lưu giữ của worker sắp nghỉ với bản port Python. Cả hai chạy
trên các bản sao giống hệt từng byte của một database đã gieo và mọi dòng mà
một trong hai có thể ghi đều được so sánh. URL phải là database `flowie_*` trên
loopback và role của nó phải được phép tạo database: script này xoá và tạo lại
ba database bên cạnh nó. Thoát với mã khác 0 khi hai bên lệch nhau, hoặc khi
hai bên cùng đồng ý một điều mà bộ dữ liệu nói là sai.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api-python'))
sys.path.insert(0, str(ROOT / 'scripts'))

from differential_retention.compare import run  # noqa: E402

if __name__ == '__main__':
    url = os.environ.get('RETENTION_DIFF_DATABASE_URL')
    if not url:
        raise SystemExit('Set RETENTION_DIFF_DATABASE_URL to a loopback flowie_* database.')
    raise SystemExit(run(url))
