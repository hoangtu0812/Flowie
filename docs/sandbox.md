# Personal coding sandboxes

Each Flowie user listed in `SANDBOX_USERS` gets one container on the Flowie
server in which they sign in to their own Claude Code or Codex account and work
on a project's repository, through a browser terminal: ttyd attached to tmux
sessions that Flowie manages itself. Phase 1 (DTD-1056) added the image, the
manager and the host firewall; phase 2 (DTD-1057) proxies the terminal through
the API; phase 3 adds the Sandbox page (`/<workspace>/sandbox`, in the sidebar
only for people in `SANDBOX_USERS`), which starts and stops the sandbox and
shows its terminal sessions; phase 4 adds "Open with…" on an issue (below);
DTD-1062 stops sandboxes left idle; DTD-1063 replaced the termi UI the first
phases used with plain ttyd and tmux, so nothing outside this repository is
needed; DTD-1066 adds Flowie's own sandbox agent and termi-like sessions
(agent state, new session with a folder and a past conversation, rename).

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| `flowie-sandbox` image | `infrastructure/sandbox/Dockerfile`, `sandbox-start.sh`, `sandbox-session.sh`, `sandbox_agent.py` | Debian, Node 24, git, `gh`, tmux, ttyd, Claude Code, Codex. Runs as `node` (uid 1000); ttyd listens on port 7680 of the sandbox network under the user's secret base path, and each connection attaches to the tmux session named by `?arg=<name>` (created in `/home/node` if new). The sandbox agent (Python standard library) listens on port 7681 under the same base path and manages the tmux sessions. |
| `sandbox-manager` | `apps/api-python/app/sandbox_manager.py`, Compose profile `sandbox` | The only service with the Docker socket. Internal HTTP API behind a bearer token; only creates, starts, stops and removes containers. |
| API module | `apps/api-python/app/modules/sandbox/api.py` | `/api/v1/sandbox` (state, start, stop) and `/api/v1/sandbox/sessions`, and `/api/v1/sandbox/ui/...`, the reverse proxy to the caller's ttyd (HTTP and the terminal WebSocket). |
| Sandbox network | `flowie-sandbox`, bridge `flowie-sbx0`, `172.31.250.0/24` | Created by Compose with the `api` service. The API has the fixed address `172.31.250.2`; sandboxes get addresses from `172.31.250.128/25`. |
| Firewall | `infrastructure/sandbox/sandbox-firewall.sh`, `flowie-sandbox-firewall.service` | Sandboxes reach the internet only. |

Per user `<id>` (a Flowie user id):

- container `flowie-sandbox-<id>`, labelled `vn.bsr.flowie.sandbox.user=<id>`;
- volume `flowie-sandbox-home-<id>` at `/home/node`, holding the user's Claude,
  Codex, GitHub and git credentials and their clones. Removing the container
  keeps the volume;
- terminal token `HMAC-SHA256(SANDBOX_MANAGER_TOKEN, "terminal:<id>")`, set as
  `TERMINAL_TOKEN` in the container. ttyd answers only under `/<token>/`; the
  API proxy adds that prefix, so the token never reaches a browser. Changing `SANDBOX_MANAGER_TOKEN` changes every token: remove the
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
| `GET /api/v1/sandbox/sessions` | `{data: [{name, dir, agent, state, preview}]}`: tmux sessions, most recently used first; `agent` is `claude`, `codex` or null, `state` is `working`, `waiting`, `idle` or `shell`; empty while stopped |
| `POST /api/v1/sandbox/sessions` | `{name, dir?, agent?, resume?}`: a session in a folder of the home running Claude Code or Codex (optionally `--resume <conversation id>`) or a shell; `201`, `409` if the name exists |
| `POST /api/v1/sandbox/sessions/<name>/rename` | `{to}` |
| `DELETE /api/v1/sandbox/sessions/<name>` | Close that session (`204`) |
| `GET /api/v1/sandbox/dirs` | `{data: {home, recent}}`: open sessions' folders, `~/work/*`, `~/repos/*`, folders of past conversations |
| `GET /api/v1/sandbox/conversations?dir=` | `{data: [{agent, id, cwd, title, mtime}]}`: past Claude Code and Codex conversations, newest first |
| `/api/v1/sandbox/ui/?arg=<name>` | ttyd attached to that session (created if new), for the caller's own container only |

## Open with Claude/Codex

On an issue whose project has a repository (Settings → Code & reviews),
people with a sandbox see "Open with…" in the issue header. Choosing an agent
calls `POST /api/v1/sandbox/open`, which:

1. checks that the caller can read the issue and that the repository belongs
   to its project;
2. starts the sandbox;
3. asks the sandbox agent for the tmux session `<issue identifier>-<repository
   name>` in `/home/node` with one shell line typed into it: clone the repository into
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
request, serves only GET and HEAD, refuses `.` and `..` path segments, and
forwards only `accept`, `range`, `if-none-match` and `if-modified-since`; the
Flowie cookie and `Authorization` stay in the API. The terminal WebSocket
(`ui/ws`) is accepted only from
Flowie's own origin (`API_CORS_ORIGIN` or the origin of `APP_URL`), and an
open terminal is re-checked every minute against the session behind its
handshake cookie (not that cookie's 15-minute expiry), so signing out or
disabling the account closes it.

The Flowie access cookie lasts 15 minutes and is renewed by the Flowie web
app. The Sandbox page asks for the sandbox state every minute, which renews
it. A terminal opened in a tab of its own needs a Flowie page (the Sandbox
page or any other) open alongside it.

The Sandbox page lists the sessions beside the terminal, as termi does: the
ones waiting for the person first, then working, idle and plain shells, each
with its agent, folder and the last lines of its screen, refreshed every 5
seconds. "New session" picks an agent (Claude Code, Codex or a shell), a
folder and, if any, one of that agent's past conversations in the folder; a
session's menu renames or closes it (closing ends everything running in it).

The agent's state comes from its screen, with the rules termi uses: "Do you
want to", "Allow command", a `❯ 1.` menu and similar in the last lines mean
waiting, "esc to interrupt" means working, anything else idle. The agent of a
session is found by walking the process tree from the pane's shell.

## Stopping idle sandboxes

Every 5 minutes the API lists the running sandboxes (`GET /sandboxes` on the
manager) and asks each one's sandbox agent for its tmux sessions. A sandbox is idle since
the latest of its start and the last input or output in any of its tmux
sessions; past `SANDBOX_IDLE_MINUTES` (default 60) the API stops it. An agent
that is still working prints to its screen, so it keeps the sandbox running;
an open tab with nothing happening does not. When the sessions cannot be
read, only the start time counts. The home volume stays, so Start or "Open with…" brings
everything back. `SANDBOX_IDLE_MINUTES=0` turns this off. The check runs only
when `SANDBOX_USERS` and `SANDBOX_MANAGER_TOKEN` are set; it shows as
`sandbox-idle` among the background jobs.

## Manager API

All requests need `Authorization: Bearer $SANDBOX_MANAGER_TOKEN`. The manager
listens on port 4100 of the default Compose network.

| Request | Result |
| --- | --- |
| `GET /sandboxes` | `200 [{userId, state, address, startedAt}]` for every running sandbox |
| `GET /sandboxes/<id>` | `200 {userId, state, address, startedAt}` or `404` |
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

2. Image (rebuild with new `CLAUDE_CODE_VERSION`, `CODEX_VERSION` or
   `TTYD_VERSION` and its checksums to upgrade; running containers keep the old
   image until they are removed and created again):

   ```bash
   docker build -t flowie-sandbox:latest infrastructure/sandbox
   ```

3. Settings in the Compose `.env`:

   ```bash
   SANDBOX_MANAGER_TOKEN=$(openssl rand -hex 32)
   SANDBOX_DOCKER_GID=$(stat -c %g /var/run/docker.sock)
   SANDBOX_USERS=first@bsr.com.vn,second@bsr.com.vn
   SANDBOX_IDLE_MINUTES=60   # optional; 0 never stops an idle sandbox
   ```

4. API (it joins the sandbox network and reads the settings) and manager:

   ```bash
   docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml --profile app --profile sandbox up -d --build api sandbox-manager
   ```

## Checking it

1. Signed in to Flowie as a user listed in `SANDBOX_USERS`, open Sandbox in
   the sidebar and start the sandbox.

2. In its terminal, sign in once: `claude` then `/login`,
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
- ttyd and the sandbox agent inside a sandbox listen on the sandbox network,
  which only the API can reach, and answer only under the user's secret base
  path, which only the API knows. The agent runs as the sandbox user, refuses
  folders outside the home (symlinks included) and runs tmux with argument
  lists, never a shell.
- Credentials in the home volumes are readable by anyone with root on the
  server. Tell users before they sign in.
- Using a personal Claude or Codex subscription on a shared server may be
  limited by the provider's terms; check them before rolling out.
- There is no per-user disk quota yet; watch `docker system df -v`.
