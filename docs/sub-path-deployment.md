# Serving Flowie under a sub-path

Use this when another site owns the domain root and Flowie must live under a
path, for example `https://poc-dtd.bsr.com.vn/flowie`. Without
`NEXT_PUBLIC_BASE_PATH`, Flowie serves from the host root as before.

## 1. Environment

All four values carry the same prefix. `NEXT_PUBLIC_*` values are compiled into
the web build, so the `web` image must be rebuilt after changing them.

```env
NEXT_PUBLIC_BASE_PATH=/flowie
NEXT_PUBLIC_API_URL=https://poc-dtd.bsr.com.vn/flowie/api/v1
NEXT_PUBLIC_APP_URL=https://poc-dtd.bsr.com.vn/flowie
AZURE_AD_REDIRECT_URI=https://poc-dtd.bsr.com.vn/flowie/api/v1/auth/microsoft/callback
AUTH_COOKIE_SECURE=true
MCP_ENABLED=true
MCP_ALLOWED_HOSTS=poc-dtd.bsr.com.vn,poc-dtd.bsr.com.vn:*
```

- Keep `MCP_ENABLED` as it already is. `MCP_ALLOWED_HOSTS` must list the public
  host, because the MCP endpoint rejects any other `Host` header.
- When Microsoft sign-in is enabled, add the new redirect URI to the Entra app
  registration (see `microsoft-entra-login.md`).

```bash
docker compose --profile app up -d --build web api
```

## 2. Nginx Proxy Manager

On the proxy host for `poc-dtd.bsr.com.vn`, keep the root pointed at the home
page. Open **Edit → Advanced** and add:

```nginx
# Web: keep the /flowie prefix; Next.js routes on it (basePath).
location /flowie {
    proxy_pass http://192.168.90.53:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
}

# API: strip /flowie; the API serves /api/v1. Buffering is off for
# notification and agent event streams.
location /flowie/api/ {
    proxy_pass http://192.168.90.53:4000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    client_max_body_size 50m;
}

# MCP for Codex/Claude runners: strip /flowie; the API serves /mcp/.
location /flowie/mcp/ {
    proxy_pass http://192.168.90.53:4000/mcp/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

nginx picks the longest matching prefix, so `/flowie/api/` and `/flowie/mcp/`
take precedence over `/flowie`. Do not add these as NPM **Custom locations**
pointing at the same paths at the same time; one definition per path.

The sign-in cookies use path `/`, so the home page on the same host also
receives them. They are `HttpOnly` and only the Flowie API reads them.

## 3. Verify

```bash
curl -sI https://poc-dtd.bsr.com.vn/flowie/auth/login | head -1   # 200
curl -s  https://poc-dtd.bsr.com.vn/flowie/api/v1/auth/providers    # JSON from the API
curl -sI https://poc-dtd.bsr.com.vn/flowie/flowie-icon.svg | head -1 # 200
```

Then sign in, open an issue, and copy its link: it must contain `/flowie/`.
Point MCP clients at `https://poc-dtd.bsr.com.vn/flowie/mcp/`; Settings →
Integrations shows the same URL.

An old domain can forward to the new path with an NPM **Redirection Host**
(for example `flowie.dtd.bsr.com.vn` → `poc-dtd.bsr.com.vn/flowie`, preserve
path off).
