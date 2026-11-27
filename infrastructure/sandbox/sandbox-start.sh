#!/bin/sh
# Starts a sandbox: ttyd serves the browser terminal on port 7680 of the sandbox
# network, restarted if it exits. Each connection runs `sandbox-session <name>`,
# which attaches to (or creates) that tmux session. ttyd answers only under the
# secret base path /$TERMINAL_TOKEN, which sandbox-manager derives per user and
# only the Flowie API knows, so ttyd must never start without it.
# VI: Khởi động một sandbox: ttyd phục vụ terminal cho trình duyệt ở cổng 7680 trên
# VI: mạng sandbox, tự chạy lại nếu thoát. Mỗi kết nối chạy `sandbox-session <tên>`,
# VI: gắn vào (hoặc tạo) phiên tmux đó. ttyd chỉ trả lời dưới đường dẫn bí mật
# VI: /$TERMINAL_TOKEN, do sandbox-manager suy ra theo từng người và chỉ API Flowie
# VI: biết, nên ttyd không bao giờ được chạy khi thiếu nó.
set -eu
: "${TERMINAL_TOKEN:?TERMINAL_TOKEN is required}"
while true; do
  ttyd -i 0.0.0.0 -p 7680 -b "/$TERMINAL_TOKEN" -W -a -P 20 -t fontSize=14 \
    -t "fontFamily=Menlo,Consolas,Droid Sans Mono,monospace" -t disableLeaveAlert=true \
    -t 'theme={"background":"#16181d"}' /usr/local/bin/sandbox-session || true
  sleep 1
done
