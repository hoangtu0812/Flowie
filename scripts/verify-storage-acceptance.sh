#!/usr/bin/env bash
set -euo pipefail

if [ "${CI:-}" != "true" ]; then
    echo "Storage acceptance requires an isolated CI runner." >&2
    exit 1
fi

# Pin the official source because public community container pulls are unavailable.
minio_revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a"
fixture_root="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/flowie-minio.XXXXXXXX")"
export GOBIN="$fixture_root/bin"
export CGO_ENABLED=0
go install "github.com/minio/minio@$minio_revision"

export MINIO_ROOT_USER=minioadmin
export MINIO_ROOT_PASSWORD=minioadmin123
fixture_port="$(python -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
export S3_TEST_ENDPOINT="http://127.0.0.1:$fixture_port"
"$GOBIN/minio" server "$fixture_root/data" --address "127.0.0.1:$fixture_port" --console-address 127.0.0.1:0 >"$fixture_root/server.log" 2>&1 &
minio_test_pid=$!
trap 'kill "$minio_test_pid" 2>/dev/null || true; wait "$minio_test_pid" 2>/dev/null || true' EXIT

for attempt in $(seq 1 60); do
    if ! kill -0 "$minio_test_pid" 2>/dev/null; then
        cat "$fixture_root/server.log"
        exit 1
    fi
    if curl --fail --silent "$S3_TEST_ENDPOINT/minio/health/ready"; then
        python -m pytest apps/api-python/tests/test_infrastructure_acceptance.py -q
        curl --fail --location --retry 3 --output "$fixture_root/restic.bz2" https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2
        echo "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c  $fixture_root/restic.bz2" | sha256sum --check
        bzip2 --decompress --stdout "$fixture_root/restic.bz2" > "$GOBIN/restic"
        chmod 700 "$GOBIN/restic"
        export BACKUP_RESTIC_BINARY="$GOBIN/restic"
        export BACKUP_MINIO_BINARY="$GOBIN/minio"
        export BACKUP_PG_BIN=/usr/lib/postgresql/16/bin
        test -x "$BACKUP_PG_BIN/pg_dump"
        python -m pytest apps/api-python/tests/test_backup_rehearsal.py -q
        exit 0
    fi
    if [ "$attempt" -eq 60 ]; then
        cat "$fixture_root/server.log"
        exit 1
    fi
    sleep 1
done
