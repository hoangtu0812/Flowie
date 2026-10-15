# Import and export

Settings → Import and export is available to active workspace members. A user
imports only into a team they currently belong to; owners and administrators do
not bypass private-team access. The API service lives in `modules/data_exchange`,
with separate contracts, CSV parser, preview/command service, durable worker and
export repository. Apply Prisma migration `20261015100000_data_exchange` before
starting API/worker. The API supervisor runs and monitors `issue-import`.

## CSV input

Paste UTF-8 comma-separated CSV, optionally with a BOM, with unique non-empty
headers and 1–1000 non-empty data records, at most 2 MB. Quoted commas and embedded
line breaks are supported. Data row numbers count CSV records after the header;
they are not physical line numbers when a quoted cell contains line breaks.
Inspect columns, map `externalId` and `title`, then optional fields shown in the
UI. Reference fields accept Flowie IDs. Priority/type/severity are normalized
to uppercase. Dates accept ISO 8601 and are interpreted in UTC when no offset is
provided. Blank cells are omitted; this creates tasks and never updates existing
tasks. CSV input is text and no cell is evaluated as a formula.

Choose a stable source namespace, for example `jira-support`. The unique import
key is `(workspace, source namespace, externalId)`. Its registration and issue
creation commit in one transaction, serialized across concurrent batches. A
different request key cannot create the same external key again while its task
exists, including archived tasks. Skip or report duplicate errors explicitly;
the existence of a key never reveals a private task's ID or contents. Changing
the namespace intentionally changes identity; keep it consistent for repeat
imports. Exports provide task IDs as `externalId` for use in a destination
namespace; imports do not infer duplicates from titles or existing native IDs.

Preview freezes up to 1000 normalized rows without creating issues. Request keys
are idempotent and reject changed payloads. The preview expires after 15 minutes.
Confirm imports only PENDING rows; invalid/skipped rows remain inspectable.
Each worker transaction locks one batch and atomically creates one issue, its
notifications/activity and external key, then records the result. Worker restart
resumes remaining rows. Current account/team permissions and references are
rechecked, so a preview is not a grant of future access. Cancellation waits for
an in-flight transaction and stops remaining rows without deleting created tasks.
Failures roll back their row and have bounded error codes; inspect the named
invalid fields, correct the CSV and preview again. Successful keys prevent replay.

Latest 20 imports are listed per importing account and current team access;
individual results are paged by record number (50 rows). Preview/result payloads
expire after 30 days; external key registrations stay while their task exists.
Preview requests are limited to 20 per account/hour. Export requests share a
20 per account/hour limit. These limits are independent of MCP tool budgets.

## Exports

Issue lists expose **Export matching issues CSV**. It uses the same current ACL
and applied query as list and Insights, independent of loaded pages. More than
10,000 matches or 10 MB are rejected instead of silently truncated. UTF-8 BOM,
quoted fields and leading tabs on formula-like text support spreadsheet viewing;
as with audit CSV, consumers must treat cells as text.

Select up to 100 accessible documents for a ZIP containing Markdown bodies and
`manifest.json`. Source URLs and original authenticated attachment links are
preserved. They are never fetched from the network. Optional stored attachments
are authorized by the selected document and limited to 200 files / 25 MB total
uncompressed. Reads enforce declared byte bounds and fail on a size mismatch.
ZIP paths use server-generated record IDs; titles and original filenames appear
only as manifest values. Existing Markdown links are not rewritten to relative
paths; the manifest maps each attachment ID to its packaged file. A missing or
inaccessible selected document fails the entire export, with no partial download.

Exports are account-scoped downloads with `private, no-store` and `nosniff`, and
record their operation type in audit without the exported content or filters.
They do not replace backup, revision retention or a verified migration procedure.
