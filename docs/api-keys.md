# API keys for other systems

API keys let another system (a portal, a report job, an n8n flow) call Flowie's REST
API without a browser session. They are separate from AI connections (MCP): an MCP
connection authorizes an AI client and acts with its owner's access, while an API key
belongs to the workspace and can only do what its scopes allow.

VI: API key cho phép hệ thống khác (portal, job báo cáo, flow n8n) gọi REST API của
Flowie mà không cần phiên trình duyệt. Key tách riêng với kết nối AI (MCP): kết nối MCP
cấp quyền cho AI client và hoạt động bằng quyền của chủ kết nối, còn API key thuộc
workspace và chỉ làm được những gì scope của nó cho phép.

## Create and manage keys

Workspace owners and admins open **Settings → Integrations → API keys → Manage**
(`/settings/api-keys`) and choose **New API key**: a name, an expiry of 1–365 days
(default 90) and its permissions. The key (`flowie_api_...`) is shown once; only its
SHA-256 hash is stored. The list shows each key's prefix, expiry, last use and creator.
Revoking a key stops it at once; a revoked or expired key can then be deleted. Creating,
revoking and deleting are written to the workspace audit log (`api_key.*`).

A key stops working when it expires, is revoked, or its creator leaves the workspace,
is deactivated or resets their password.

| Scope | Allows |
| --- | --- |
| `news:read` | `GET /api/v1/news/feed` |

## News feed

Read the workspace's News items over plain REST:

```bash
curl -H "Authorization: Bearer $FLOWIE_API_KEY" \
  "https://<host>/api/v1/news/feed?category=AI&since=2026-11-01T00:00:00Z&limit=50"
```

| Query | Meaning |
| --- | --- |
| `category` | News group id or exact name, for example `Security` or `Thị trường`; omit for every group |
| `since`, `until` | ISO 8601 instants; items published at or after `since` and before `until` |
| `limit` | 1–100 items per page, default 50 |
| `cursor` | `nextCursor` from the previous page, sent with the same filters |

The response is `{"data": {"items": [...], "nextCursor": "..." | null}}`, newest
first. Each item has `id`, `title`, `url`, `source`, `category`, `publishedAt`
(UTC), `summary` (from the feed), and the AI's `aiSummary`, `riskLevel` and
`riskScore` when it has rated the item. The key only reads its own workspace and
is limited to `MCP_RATE_LIMIT` calls per minute (HTTP 429 beyond it). A key without
`news:read` gets HTTP 403; a missing, unknown, expired or revoked key gets 401.

**Deprecated:** the feed still accepts an MCP connection token (`flowie_mcp_...`), because
a caller on poc-dtd used one, and logs `news_feed_mcp_token_deprecated connection=<id>`
for each such call. Move that caller to an API key; the MCP path will be removed once the
log shows no more warnings.
