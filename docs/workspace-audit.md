# Workspace audit

Workspace owners and administrators use Settings → Audit log. API routes are
`GET /api/v1/audit` and `GET /api/v1/audit/export`, with `workspaceId`, optional
`actorId`, `entityType`, `source`, `since` (inclusive) and `until` (exclusive).
Times are UTC; list pages default to 50 with a maximum of 100. Cursors bind the
account, workspace and filters. Export uses the same current-access predicate,
rejects more than 10,000 matches or 10 MB, and is limited to 20 requests per hour.

An administrator does not inherit private-team membership. Archived records
remain eligible when current membership proves access. Unknown entity types or
deleted records without a durable scope snapshot are excluded rather than
assumed public. Deleted workflow statuses keep an explicit workspace/team scope.
This screen is an operational history, not a promise of complete forensic
retention for every legacy event. Existing audit and issue/project activity
records are combined; separate domain and MCP tool events may describe the same
operation and retain separate IDs.

New shared issue/document operations record transport source from server context;
MCP tool events are AI, background work is SYSTEM. Legacy events without transport
attribution show UNKNOWN. Client headers cannot select the source. Document bodies,
before/after values, tokens and arbitrary metadata are omitted. Only bounded tool,
outcome and changed-field names are exposed. Removing a record can remove its
provable scope from this view; the underlying audit row is not deleted by the view.

CSV is UTF-8 with a BOM, all fields quoted and CRLF rows. Formula-like text has a
leading tab inside the quoted field for spreadsheet viewing, including normalized
full-width operator variants. Importers must treat all cells as text; no CSV
encoding provides universal formula protection across every spreadsheet program.
The export is for inspection and does not replace operational backup.
