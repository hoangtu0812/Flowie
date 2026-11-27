# Personal coding sandboxes

Each Flowie user listed in `SANDBOX_USERS` gets one container on the Flowie
server in which they sign in to their own Claude Code or Codex account and work
on a project's repository, through a browser terminal served by
[termi](https://github.com/hoangtu0812/termi). Phase 1 (DTD-1056) added the
image, the manager and the host firewall; phase 2 (DTD-1057) runs termi in the
container and proxies it through the API; phase 3 adds the Sandbox page
(`/<workspace>/sandbox`, in the sidebar only for people in `SANDBOX_USERS`),
which starts and stops the sandbox and embeds termi; phase 4 adds "Open
with…" on an issue (below). Stopping an idle sandbox on its own is still to
come.

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| `flowie-sandbox` image | `infrastructure/sandbox/Dockerfile`, `sandbox-start.sh` | Debian, Node 24, git, `gh`, tmux, ttyd, Claude Code, Codex, termi (pinned commit). Runs as `node` (uid 1000); starts ttyd on loopback and termi on port 7680. |
| `sandbox-manager` | `apps/api-python/app/sandbox_manager.py`, Compose profile `sandbox` | The only service with the Docker socket. Internal HTTP API behind a bearer token. |
| API module | `apps/api-python/app/modules/sandbox/api.py` | `/api/v1/sandbox` (state, start, stop) and `/api/v1/sandbox/ui/...`, the reverse proxy to the caller's termi (HTTP and the terminal WebSocket). |
| Sandbox network | `flowie-sandbox`, bridge `flowie-sbx0`, `172.31.250.0/24` | Created by Compose with the `api` service. The API has the fixed address `172.31.250.2`; sandboxes get addresses from `172.31.250.128/25`. |
| Firewall | `infrastructure/sandbox/sandbox-firewall.sh`, `flowie-sandbox-firewall.service` | Sandboxes reach the internet only. |

Per user `<id>` (a Flowie user id):

- container `flowie-sandbox-<id>`, labelled `vn.bsr.flowie.sandbox.user=<id>`;
- volume `flowie-sandbox-home-<id>` at `/home/node`, holding the user's Claude,
  Codex, GitHub and git credentials, their clones and termi's data. Removing
  the container keeps the volume;
- termi token `HMAC-SHA256(SANDBOX_MANAGER_TOKEN, "termi:<id>")`, set as
  `TERMI_TOKEN` in the container and added by the API proxy. It never reaches
  a browser. Changing `SANDBOX_MANAGER_TOKEN` changes every token: remove the
  containers (`DELETE /sandboxes/<id>`) so they are recreated with the new one.

Every container gets the same configuration: unprivileged user, all
capabilities dropped, `no-new-privileges`, `SANDBOX_CPUS` CPUs (default 1),
`SANDBOX_MEMORY_MB` memory with no extra swap (default 2048), `SANDBOX_PIDS`
processes (default 512), no published ports, no bind mounts, no restart
policy. No caller can change any of it.

## API

For a signed-in user whose email is in `SANDBOX_USERS` (everyone else gets 403):

| Request | Result |
| --- | --- |
| `GET /api/v1/sandbox` | `{data: {state}}`: `none`, `created`, `running`, `exited`… |
| `PUT /api/v1/sandbox` | Create if missing, start if stopped |
| `POST /api/v1/sandbox/stop` | Stop it |
| `GET /api/v1/sandbox/repositories?issueId=` | `{data: [{id, name}]}`: repositories of the issue's project the caller can read |
| `POST /api/v1/sandbox/open` | `{issueId, repositoryId, agent}` with `agent` `claude` or `codex`: start the sandbox and open the issue's session; `{data: {session}}` |
| `/api/v1/sandbox/ui/` | termi, for the caller's own container only |

## Open with Claude/Codex

On an issue whose project has a repository (Settings → Code & reviews),
people with a sandbox see "Open with…" in the issue header. Choosing an agent
calls `POST /api/v1/sandbox/open`, which:

1. checks that the caller can read the issue and that the repository belongs
   to its project;
2. starts the sandbox;
3. creates the termi session `<issue identifier>-<repository name>` in
   `/home/node` and types one shell line into it: clone the repository into
   `~/repos/<name>` if it is not there, fetch, add the worktree
   `~/work/<session>` on branch `flowie/<session>` from `origin/<base branch>`
   (or reuse it), then run `claude` or `codex` there with the issue's title,
   description (first 4000 characters), branch and the repository's
   instructions as the first prompt.

The browser then opens the Sandbox page on that session. When the session
already exists, nothing is typed: opening the issue again goes back to it.
git asks for credentials in the terminal the first time a private repository
is cloned (`gh auth login` for GitHub, a personal access token for Azure
DevOps).

The proxy picks the container from the authenticated user id, never from the
request. It forwards only `accept`, `content-type`, `x-termi`, `range`,
`if-none-match` and `last-event-id`; the Flowie cookie and `Authorization`
stay in the API. The terminal WebSocket (`ui/term/...`) is accepted only from
Flowie's own origin (`API_CORS_ORIGIN` or the origin of `APP_URL`), and an
open terminal is re-checked every minute against the session behind its
handshake cookie (not that cookie's 15-minute expiry), so signing out or
disabling the account closes it.

The Flowie access cookie lasts 15 minutes and is renewed by the Flowie web
app. The Sandbox page asks for the sandbox state every minute, which renews
it. termi opened in a tab of its own needs a Flowie page (the Sandbox page or
any other) open alongside it.

termi refuses to be framed by another origin (`frame-ancestors 'self'`), so
the embedded terminal works only when the web app and the API share an origin,
as on the server (`/flowie` and `/flowie/api/v1`). In local development (web
on port 3000, API on port 4000) use "Open in a new tab".

## Manager API

All requests need `Authorization: Bearer $SANDBOX_MANAGER_TOKEN`. The manager
listens on port 4100 of the default Compose network.

| Request | Result |
| --- | --- |
| `GET /sandboxes/<id>` | `200 {userId, state, address}` or `404` |
| `PUT /sandboxes/<id>` | Create if missing, start if stopped; `200 {userId, state, address}` |
| `POST /sandboxes/<id>/stop` | `200` with the new state, `404` if none |
| `DELETE /sandboxes/<id>` | Remove the container, keep the volume; `204` |

A container with a sandbox's name but without the manager's label is never
touched (`409`).

## What the firewall enforces

From interface `flowie-sbx0`:

- from the API (`SANDBOX_API_IP`, default `172.31.250.2`): untouched;
- to the host itself (SSH, the deploy console, anything outside Docker): dropped;
- to another sandbox: dropped;
- to `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`,
  `169.254.0.0/16`: dropped. This covers Postgres, MinIO, every other
  container (published ports are rewritten to container addresses before the
  check) and the LAN;
- to anything else (the internet): allowed;
- replies to allowed connections: allowed.

Optional settings in `/etc/flowie-sandbox/firewall.env`:

- `SANDBOX_ALLOW="10.1.2.3:443 10.1.2.4"`: internal hosts sandboxes may reach,
  for example an internal git server;
- `SANDBOX_API_IP`: only if `SANDBOX_API_IP` in the Compose `.env` differs from
  the default.

## Setup on the server

Run these as root (sudo) in `/opt/flowie`. Apply the firewall before the
first sandbox starts: a sandbox started without it can reach the whole LAN.

1. Firewall:

   ```bash
   install -m 0644 infrastructure/sandbox/flowie-sandbox-firewall.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now flowie-sandbox-firewall
   infrastructure/sandbox/sandbox-firewall.sh status
   ```

2. Image (the termi repository must be public, because the build downloads
   the pinned commit from `codeload.github.com`; rebuild with new
   `CLAUDE_CODE_VERSION`, `CODEX_VERSION` or `TERMI_COMMIT`/`TERMI_SHA256`
   build args to upgrade; running containers keep the old image until they are
   removed and created again):

   ```bash
   docker build -t flowie-sandbox:latest infrastructure/sandbox
   ```

3. Settings in the Compose `.env`:

   ```bash
   SANDBOX_MANAGER_TOKEN=$(openssl rand -hex 32)
   SANDBOX_DOCKER_GID=$(stat -c %g /var/run/docker.sock)
   SANDBOX_USERS=first@bsr.com.vn,second@bsr.com.vn
   ```

4. API (it joins the sandbox network and reads the settings) and manager:

   ```bash
   docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml --profile app --profile sandbox up -d --build api sandbox-manager
   ```

## Checking it

1. Signed in to Flowie as a user listed in `SANDBOX_USERS`, start the sandbox
   from the browser console of a Flowie page:

   ```js
   await fetch('/flowie/api/v1/sandbox', { method: 'PUT', credentials: 'include' }).then(r => r.json())
   ```

2. Open `https://<flowie host>/flowie/api/v1/sandbox/ui/`, create a session,
   and sign in once in its terminal: `claude` then `/login`,
   `codex login --device-auth`, `gh auth login`. For Azure DevOps,
   `git clone https://dev.azure.com/...` asks for a user name and a personal
   access token; git keeps it in `~/.git-credentials`.

3. Isolation, from that terminal: `curl -m 5 https://api.anthropic.com`
   answers, while `curl -m 5 http://192.168.90.53:8094` (deploy console),
   `curl -m 5 telnet://192.168.90.53:<POSTGRES_PORT>` (Postgres) and the
   address of another sandbox time out.

## Security notes

- The manager holds the Docker socket, which is root on the host. It is on the
  default network only, publishes nothing, and requires the token.
- termi inside a sandbox listens on the sandbox network and refuses any
  request without the user's termi token; only the API has it.
- Credentials in the home volumes are readable by anyone with root on the
  server. Tell users before they sign in.
- Using a personal Claude or Codex subscription on a shared server may be
  limited by the provider's terms; check them before rolling out.
- There is no per-user disk quota yet; watch `docker system df -v`.
