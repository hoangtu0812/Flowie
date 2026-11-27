#!/bin/sh
# Attaches the browser terminal to the tmux session named by ttyd's URL argument
# (`?arg=<name>`), creating it in the home directory when it does not exist. A
# name outside [A-Za-z0-9_-]{1,40} falls back to "main".
# VI: Gắn terminal của trình duyệt vào phiên tmux mang tên theo tham số URL của ttyd
# VI: (`?arg=<tên>`), tạo phiên ở thư mục home nếu chưa có. Tên ngoài
# VI: [A-Za-z0-9_-]{1,40} thì dùng "main".
name="${1:-main}"
case "$name" in
  *[!A-Za-z0-9_-]*) name=main ;;
esac
[ -n "$name" ] && [ "${#name}" -le 40 ] || name=main
cd "$HOME"
exec tmux new-session -A -s "$name"
