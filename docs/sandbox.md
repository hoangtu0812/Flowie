# Personal coding sandboxes

Each Flowie user gets one container on the Flowie server in which they sign in
to their own Claude Code or Codex account and work on a project's repository.
This document covers phase 1 (DTD-1056): the image, the manager that runs the
containers, and the host firewall. The browser terminal, the API proxy, the
Sandbox page and the "Open with Claude/Codex" action on a task come in later
phases of DTD-1055.

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| `flowie-sandbox` image | `infrastructure/sandbox/Dockerfile` | Debian, Node 24, git, `gh`, tmux, ttyd, Claude Code, Codex. Runs as `node` (uid 1000). |
| `sandbox-manager` | `apps/api-python/app/sandbox_manager.py`, Compose profile `sandbox` | The only service with the Docker socket. Internal HTTP API behind a bearer token. |
| Sandbox network | `flowie-sandbox`, bridge `flowie-sbx0`, `172.31.250.0/24` | Created by the manager on start. Only sandboxes (and, from phase 2, the API) join it. |
| Firewall | `infrastructure/sandbox/sandbox-firewall.sh`, `flowie-sandbox-firewall.service` | Sandboxes reach the internet only. |

Per user `<id>` (a Flowie user id):

- container `flowie-sandbox-<id>`, labelled `vn.bsr.flowie.sandbox.user=<id>`;
- volume `flowie-sandbox-home-<id>` at `/home/node`, holding the user's Claude,
  Codex, GitHub and git credentials and their clones. Removing the container
  keeps the volume.

Every container gets the same configuration: unprivileged user, all
capabilities dropped, `no-new-privileges`, `SANDBOX_CPUS` CPUs (default 1),
`SANDBOX_MEMORY_MB` memory with no extra swap (default 2048), `SANDBOX_PIDS`
processes (default 512), no published ports, no bind mounts, no restart
policy. No caller can change any of it.

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
- `SANDBOX_API_IP=172.31.250.2`: the API's address on the sandbox network
  (phase 2), allowed to open connections to sandboxes.

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

2. Image (rebuild with new `CLAUDE_CODE_VERSION` / `CODEX_VERSION` build args
   to upgrade the agents; running containers keep the old image until they
   are removed and created again):

   ```bash
   docker build -t flowie-sandbox:latest infrastructure/sandbox
   ```

3. Settings in the Compose `.env`:

   ```bash
   SANDBOX_MANAGER_TOKEN=$(openssl rand -hex 32)
   SANDBOX_DOCKER_GID=$(stat -c %g /var/run/docker.sock)
   ```

4. Manager:

   ```bash
   docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml --profile sandbox up -d --build sandbox-manager
   ```

## Checking it

```bash
TOKEN=...   # SANDBOX_MANAGER_TOKEN
docker exec circle-api python -c "import urllib.request as u; r=u.Request('http://circle-sandbox-manager:4100/sandboxes/<id>', method='PUT', headers={'Authorization': 'Bearer $TOKEN'}); print(u.urlopen(r).read().decode())"
docker exec -it flowie-sandbox-<id> bash
```

Inside the sandbox:

- `claude` then `/login`, `codex login --device-auth`, `gh auth login`;
- Azure DevOps: `git clone https://dev.azure.com/...` asks for a user name and
  a personal access token; git keeps it in `~/.git-credentials`;
- isolation: `curl -m 5 https://api.anthropic.com` answers, while
  `curl -m 5 http://192.168.90.53:8094` (deploy console), `curl -m 5
  telnet://192.168.90.53:<POSTGRES_PORT>` (Postgres) and the address of another
  sandbox time out.

## Security notes

- The manager holds the Docker socket, which is root on the host. It is on the
  default network only, publishes nothing, and requires the token.
- Credentials in the home volumes are readable by anyone with root on the
  server. Tell users before they sign in.
- Using a personal Claude or Codex subscription on a shared server may be
  limited by the provider's terms; check them before rolling out.
- There is no per-user disk quota yet; watch `docker system df -v`.
