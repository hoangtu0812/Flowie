#!/bin/sh
# Starts a sandbox, both servers restarted if they exit:
# - ttyd on port 7680 serves the browser terminal; each connection runs
#   `sandbox-session <name>`, which attaches to (or creates) that tmux session;
# - Flowie's sandbox agent on port 7681 lists and manages the tmux sessions.
# Both answer only under the secret base path /$TERMINAL_TOKEN, which
# sandbox-manager derives per user and only the Flowie API knows, so neither may
# start without it.
# VI: Khởi động một sandbox, cả hai server tự chạy lại nếu thoát:
# VI: - ttyd ở cổng 7680 phục vụ terminal cho trình duyệt; mỗi kết nối chạy
# VI:   `sandbox-session <tên>`, gắn vào (hoặc tạo) phiên tmux đó;
# VI: - sandbox agent của Flowie ở cổng 7681 liệt kê và quản lý các phiên tmux.
# VI: Cả hai chỉ trả lời dưới đường dẫn gốc bí mật /$TERMINAL_TOKEN, do sandbox-manager
# VI: suy ra theo từng người và chỉ API Flowie biết, nên không cái nào được chạy khi thiếu nó.
set -eu
: "${TERMINAL_TOKEN:?TERMINAL_TOKEN is required}"
(
  while true; do
    python3 /usr/local/lib/flowie/sandbox_agent.py || true
    sleep 1
  done
) &
while true; do
  ttyd -i 0.0.0.0 -p 7680 -b "/$TERMINAL_TOKEN" -W -a -P 20 -t fontSize=14 \
    -t "fontFamily=Menlo,Consolas,Droid Sans Mono,monospace" -t disableLeaveAlert=true \
    -t 'theme={"background":"#16181d"}' /usr/local/bin/sandbox-session || true
  sleep 1
done
