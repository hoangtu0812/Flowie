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
    # /minio/health/ready answers 200 before S3 calls work; /cluster waits for initialization.
    # VI: /minio/health/ready trả 200 trước khi lệnh S3 hoạt động; /cluster chờ khởi tạo xong.
    if curl --fail --silent "$S3_TEST_ENDPOINT/minio/health/cluster"; then
        python -m pytest apps/api-python/tests/test_infrastructure_acceptance.py -q
        # This archive comes from a third party's release hosting, so an outage
        # there fails every run and blocks every merge — which is what happened
        # when those downloads answered 504 for long enough to stop a release.
        # When the caller offers a cache directory the verified archive is kept
        # between runs, so only the first run after a version change needs that
        # host at all. The checksum is what makes reuse safe: a cached file is
        # used only when it hashes to the pinned value, and is re-downloaded
        # otherwise.
        # VI: Tệp nén này lấy từ nơi phát hành của bên thứ ba, nên sự cố bên đó
        # làm hỏng mọi lần chạy và chặn mọi lần merge — đúng điều đã xảy ra khi
        # các lượt tải trả về 504 đủ lâu để chặn một bản phát hành. Khi nơi gọi
        # cung cấp thư mục cache, tệp đã kiểm sẽ được giữ lại giữa các lần chạy,
        # nên chỉ lần chạy đầu sau khi đổi phiên bản mới cần tới host đó. Chính
        # checksum làm cho việc dùng lại an toàn: tệp trong cache chỉ được dùng
        # khi hash đúng giá trị đã ghim, nếu không thì tải lại.
        restic_sha=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c
        restic_archive="$fixture_root/restic.bz2"
        if [ -n "${RESTIC_CACHE_DIR:-}" ]; then
            mkdir -p "$RESTIC_CACHE_DIR"
            restic_archive="$RESTIC_CACHE_DIR/restic_0.19.1_linux_amd64.bz2"
        fi
        if ! echo "$restic_sha  $restic_archive" | sha256sum --check --status 2>/dev/null; then
            curl --fail --location --retry 5 --retry-all-errors --output "$restic_archive" https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2
            echo "$restic_sha  $restic_archive" | sha256sum --check
        fi
        bzip2 --decompress --stdout "$restic_archive" > "$GOBIN/restic"
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
