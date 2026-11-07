#!/usr/bin/env bash
# Checks scripts/deploy-scope.sh against ranges built in a throwaway repository.
# A wrong answer here either deploys production for a change that cannot affect
# it, or skips a deployment that was needed, so every exemption has a case.
# VI: Kiểm tra scripts/deploy-scope.sh trên các dải commit dựng trong một
# VI: repository tạm. Trả lời sai ở đây hoặc là deploy production cho thay đổi
# VI: không thể ảnh hưởng tới nó, hoặc là bỏ qua một lần deploy cần thiết, nên
# VI: mỗi trường hợp miễn trừ đều có một ca kiểm thử.
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy-scope.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$work"
git init -q .
git config user.email test@example.invalid
git config user.name "deploy scope test"
git config commit.gpgsign false
# Keeps the Windows line-ending warnings out of the test output.
# VI: Giữ cho cảnh báo xuống dòng của Windows không lọt vào output kiểm thử.
git config core.autocrlf false

commit() {
  git add -A
  git commit -qm "$1"
  git rev-parse HEAD
}

mkdir -p docs apps/desktop/crates/flowie-core/src apps/api-python/app scripts
printf 'base\n' >README.md
printf 'base\n' >CHANGELOG.md
printf 'base\n' >apps/api-python/app/main.py
base="$(commit base)"

failures=0

expect() {
  local label="$1" want="$2" before="$3" after="$4"
  local got
  got="$(bash "$script" "$before" "$after")"
  if [[ "$got" == "deploy=$want" ]]; then
    printf 'ok    %s -> %s\n' "$label" "$got"
  else
    printf 'FAIL  %s -> %s (wanted deploy=%s)\n' "$label" "$got" "$want"
    failures=$((failures + 1))
  fi
}

# Desktop-only: the Cargo workspace cannot affect a server image.
# VI: Chỉ desktop: Cargo workspace không thể ảnh hưởng tới image server.
printf 'fn main() {}\n' >apps/desktop/crates/flowie-core/src/lib.rs
printf '[workspace]\n' >apps/desktop/Cargo.toml
desktop="$(commit desktop)"
expect "desktop only" false "$base" "$desktop"

# Documentation-only, the rule that already existed.
# VI: Chỉ tài liệu, quy tắc vốn đã có.
printf 'text\n' >docs/plan.md
docs="$(commit docs)"
expect "docs only" false "$desktop" "$docs"

# Desktop and documentation together are both exempt.
# VI: Desktop và tài liệu đi chung thì cả hai đều được miễn trừ.
printf 'more\n' >docs/plan.md
printf 'more\n' >apps/desktop/Cargo.toml
both="$(commit "desktop and docs")"
expect "desktop plus docs" false "$docs" "$both"

# A server change still deploys.
# VI: Thay đổi server thì vẫn deploy.
printf 'changed\n' >apps/api-python/app/main.py
server="$(commit server)"
expect "server only" true "$both" "$server"

# Desktop mixed with a server change deploys, because the server part needs it.
# VI: Desktop đi kèm thay đổi server thì deploy, vì phần server cần.
printf 'changed again\n' >apps/api-python/app/main.py
printf 'changed again\n' >apps/desktop/Cargo.toml
mixed="$(commit "server and desktop")"
expect "server plus desktop" true "$server" "$mixed"

# A release heading in CHANGELOG.md deploys even though the file is Markdown.
# VI: Tiêu đề release trong CHANGELOG.md thì deploy dù file là Markdown.
printf '## [1.2.3] — 2026-01-01 00:00 +07\n' >CHANGELOG.md
release="$(commit release)"
expect "changelog release heading" true "$mixed" "$release"

# A changelog edit without a version heading does not deploy.
# VI: Sửa changelog mà không có tiêu đề phiên bản thì không deploy.
printf '## [1.2.3] — 2026-01-01 00:00 +07\n- a bullet\n' >CHANGELOG.md
bullet="$(commit "changelog bullet")"
expect "changelog bullet only" false "$release" "$bullet"

# An unknown base revision cannot be diffed, so it deploys rather than guess.
# VI: Base không tra được thì không diff tin cậy, nên deploy thay vì đoán.
expect "all-zero base" true "0000000000000000000000000000000000000000" "$bullet"

# A path that merely starts with the exempt prefix but is a different directory
# must still deploy; the pattern has to match the directory, not the prefix.
# VI: Path chỉ tình cờ bắt đầu bằng tiền tố được miễn trừ nhưng là thư mục khác
# VI: thì vẫn phải deploy; pattern phải khớp thư mục chứ không phải tiền tố.
mkdir -p apps/desktop-server
printf 'server-ish\n' >apps/desktop-server/app.py
lookalike="$(commit "desktop-server lookalike")"
expect "apps/desktop-server is not exempt" true "$bullet" "$lookalike"

if ((failures > 0)); then
  printf '\n%d case(s) failed\n' "$failures"
  exit 1
fi
printf '\nall cases passed\n'
