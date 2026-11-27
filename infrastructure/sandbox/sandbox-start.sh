#!/bin/sh
# Starts a sandbox: ttyd on loopback (restarted if it exits) attaches the
# browser terminal to tmux, and termi on TERMI_HOST:TERMI_PORT serves the UI to
# the Flowie API. termi listens beyond loopback here, so it must never start
# without the per-user TERMI_TOKEN that sandbox-manager sets.
# VI: Khởi động một sandbox: ttyd trên loopback (tự chạy lại nếu thoát) gắn terminal
# VI: của trình duyệt vào tmux, và termi trên TERMI_HOST:TERMI_PORT phục vụ giao diện
# VI: cho API Flowie. termi ở đây nghe ra ngoài loopback nên không bao giờ được chạy
# VI: khi thiếu TERMI_TOKEN riêng của người dùng do sandbox-manager đặt.
set -eu
: "${TERMI_TOKEN:?TERMI_TOKEN is required}"
mkdir -p "$HOME/.termi"
(
  while true; do
    ttyd -i 127.0.0.1 -p "$TERMI_TTYD_PORT" -b /term -W -a -O -P 20 -t fontSize=14 \
      -t "fontFamily=Menlo,Consolas,Droid Sans Mono,monospace" -t disableLeaveAlert=true \
      -t 'theme={"background":"#16181d"}' /opt/termi/scripts/attach.sh || true
    sleep 1
  done
) &
exec node /opt/termi/src/server.mjs
