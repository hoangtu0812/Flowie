# Issue query benchmark — 2026-10-14

Local Windows / Python 3.12 / PostgreSQL 16.15 on loopback. Synthetic fixtures are rolled back after each dataset. These are service/query timings, excluding HTTP serialization, network transfer and browser rendering; no CT107 workload was used.

Baseline: `28f5760`, 5 samples. Full batch: 10 samples. First page: 20 samples. p95 uses inclusive empirical quantiles; the small baseline sample is directional, not a production SLA.

| Dataset | Path | Rows returned | Queries | Median ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| 1,000 | Previous full list | 1,000 | 6,004 | 1285.18 | 1446.6 |
| 1,000 | Batch full hydration | 1,000 | 6 | 25.95 | 40.05 |
| 1,000 | Cursor first page | 100 | 9 | 12.83 | 26.88 |
| 10,000 | Previous full list | 10,000 | 60,004 | 19814.91 | 20423.58 |
| 10,000 | Batch full hydration | 10,000 | 6 | 820.68 | 843.13 |
| 10,000 | Cursor first page | 100 | 9 | 75.73 | 79.31 |

Full batch comparison isolates removal of N+1 queries. Paging additionally bounds payload and initial rendering. A count query still scans matching rows; search/filter complexity and many relations need separate load tests on representative data.

The Web loads at most 100 matching rows per page, retains scope/filter/search in the cursor, and reports loaded versus total rows. Detail uses direct ID/key lookup. List/board insights describe loaded rows, while the bug report aggregates all matching accessible bugs.

Reproduce only against a local `flowie_test` database named `flowie_*`, with committed Prisma migrations applied:

```powershell
.\.venv\Scripts\python.exe scripts/benchmark-issue-queries.py --database postgresql://flowie_test@127.0.0.1:55439/flowie_mcp_final --baseline-ref 28f5760 --samples 5 --output baseline.json
.\.venv\Scripts\python.exe scripts/benchmark-issue-queries.py --database postgresql://flowie_test@127.0.0.1:55439/flowie_mcp_final --hydrate-all --samples 10 --output batch.json
.\.venv\Scripts\python.exe scripts/benchmark-issue-queries.py --database postgresql://flowie_test@127.0.0.1:55439/flowie_mcp_final --samples 20 --output pages.json
```
