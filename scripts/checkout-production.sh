#!/usr/bin/env bash
set -euo pipefail

repository="${1:?Repository path is required}"
revision="${2:?Verified revision is required}"
if [[ ! "$revision" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'A full verified commit SHA is required.' >&2
  exit 1
fi
cd "$repository"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Tracked production source is modified; refusing to overwrite it.' >&2
  exit 1
fi
fetched=0
for attempt in 1 2 3; do
  if git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 fetch origin "$revision"; then
    fetched=1
    break
  fi
  echo "Fetch attempt ${attempt} failed; retrying in 15s."
  sleep 15
done
if [[ "$fetched" != 1 ]]; then
  echo 'Could not fetch the verified revision; leaving the deployment untouched.' >&2
  exit 1
fi
[[ "$(git rev-parse FETCH_HEAD)" == "$revision" ]]
git checkout --detach "$revision"
[[ "$(git rev-parse HEAD)" == "$revision" ]]
