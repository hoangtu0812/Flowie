"""Compares the retiring worker's retention decisions with the Python port's.

Run this on a development machine, never on a server: it drops and recreates
databases. Run it while `apps/worker` still exists — DTD-519 phase 2 deletes
it, and with it the only other implementation there is to compare against.

Setup, once:

    docker compose up -d postgres
    docker exec circle-postgres psql -U circle -d circle -c "CREATE ROLE flowie_test LOGIN PASSWORD 'test-only-password' SUPERUSER;"
    pnpm install
    pip install -r apps/api-python/requirements.txt

Run it, PowerShell:

    $env:RETENTION_DIFF_DATABASE_URL = "postgresql://flowie_test:test-only-password@localhost:5433/flowie_scratch"
    python scripts/compare-retention.py

Run it, bash:

    RETENTION_DIFF_DATABASE_URL="postgresql://flowie_test:test-only-password@localhost:5433/flowie_scratch" python scripts/compare-retention.py

5433 is this repository's default POSTGRES_PORT.

The database named in that URL is neither read nor written. The URL does two
things only: it says which server to work on, and it is the safety check — the
host must be loopback and the name must start with `flowie_`, so the script
cannot be pointed at production by accident. All the work happens in three
databases it creates and drops beside that one: `retention_diff_base`,
`retention_diff_worker` and `retention_diff_python`.

The role needs to create databases and to terminate connections to the
template it clones from; on a local test server SUPERUSER covers both.

Exits non-zero when the two implementations disagree, and also when they agree
on something the fixture says is wrong.

VI: So quyết định lưu giữ của worker sắp nghỉ với bản port Python.

Chạy ở máy lập trình viên, không bao giờ trên server: script này xoá và tạo lại
database. Chạy khi `apps/worker` còn tồn tại — DTD-519 giai đoạn 2 sẽ xoá nó,
cùng với đó là bản cài đặt thứ hai duy nhất để đối chiếu. Phần chuẩn bị và lệnh
chạy cho PowerShell lẫn bash xem ở trên.

Database nêu trong URL không được đọc cũng không được ghi. URL chỉ làm hai
việc: nói rõ làm trên server nào, và làm chốt an toàn — host phải là loopback
và tên phải bắt đầu bằng `flowie_`, để không thể lỡ tay trỏ vào production. Mọi
thao tác thật diễn ra trong ba database mà script tự tạo rồi tự xoá bên cạnh
database đó: `retention_diff_base`, `retention_diff_worker` và
`retention_diff_python`.

Role cần quyền tạo database và quyền ngắt kết nối tới template mà nó nhân bản;
trên máy test thì SUPERUSER bao cả hai.

Thoát với mã khác 0 khi hai bản cài đặt lệch nhau, và cả khi hai bên cùng đồng
ý một điều mà bộ dữ liệu nói là sai.
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
        raise SystemExit(
            'Set RETENTION_DIFF_DATABASE_URL to a loopback flowie_* database naming the '
            'server to work on.\n'
            'That database is left alone; the script creates and drops retention_diff_base, '
            'retention_diff_worker and retention_diff_python beside it.\n\n'
            '  PowerShell: $env:RETENTION_DIFF_DATABASE_URL = '
            '"postgresql://flowie_test:test-only-password@localhost:5433/flowie_scratch"\n'
            '  bash:       RETENTION_DIFF_DATABASE_URL='
            '"postgresql://flowie_test:test-only-password@localhost:5433/flowie_scratch" \\\n'
            '                  python scripts/compare-retention.py'
        )
    raise SystemExit(run(url))
