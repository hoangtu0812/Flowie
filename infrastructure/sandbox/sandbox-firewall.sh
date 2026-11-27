#!/usr/bin/env bash
# Isolates the per-user coding sandboxes on the host (docs/sandbox.md).
# A sandbox runs an agent with a shell and the user's credentials, so it must
# reach the internet but nothing on the server or the LAN: not the host itself,
# not Postgres, MinIO or any other container, not another user's sandbox, and
# no private, carrier-grade NAT or link-local address. Only addresses listed in
# SANDBOX_ALLOW (ip or ip:port, for an internal git server) are let through.
# SANDBOX_API_IP (the Flowie API's fixed address on the sandbox network) is not
# a sandbox: it may open connections to sandboxes, and its own traffic through
# the bridge (it may route there) is left alone. Sandboxes may open connections
# to it on SANDBOX_API_PORT only (default 4000), so their agents reach Flowie's
# MCP server; empty closes that too.
# Usage: sandbox-firewall.sh apply|remove|status. Run as root; the rules live in two chains of their own and are rebuilt
# whole on every apply, so applying twice is harmless.
# VI: Cô lập sandbox lập trình của từng người trên host (docs/sandbox.md).
# VI: Sandbox chạy agent có shell và thông tin đăng nhập của người dùng, nên được ra
# VI: internet nhưng không được tới thứ gì trên server hay LAN: không tới chính host,
# VI: Postgres, MinIO hay container nào khác, không tới sandbox của người khác, và không
# VI: tới địa chỉ private, CGNAT hay link-local nào. Chỉ địa chỉ trong SANDBOX_ALLOW
# VI: (ip hoặc ip:port, cho máy git nội bộ) được cho qua. SANDBOX_API_IP (địa chỉ cố
# VI: định của API Flowie trên mạng sandbox) không phải sandbox: nó được mở kết nối tới
# VI: sandbox, và lưu lượng của chính nó qua bridge (nó có thể đi đường đó) không bị đụng.
# VI: Sandbox chỉ được mở kết nối tới nó ở SANDBOX_API_PORT (mặc định 4000), để agent
# VI: trong đó gọi được MCP server của Flowie; để rỗng là đóng luôn.
# VI: Cách dùng: sandbox-firewall.sh apply|remove|status. Chạy bằng root; luật nằm trong hai
# VI: chain riêng và được dựng lại toàn bộ mỗi lần apply, nên apply hai lần không sao.
set -euo pipefail

BRIDGE="${SANDBOX_BRIDGE:-flowie-sbx0}"
API_IP="${SANDBOX_API_IP:-172.31.250.2}"
API_PORT="${SANDBOX_API_PORT-4000}"
read -r -a ALLOW <<< "${SANDBOX_ALLOW:-}"
FORWARD_CHAIN=FLOWIE-SANDBOX
INPUT_CHAIN=FLOWIE-SANDBOX-IN
BLOCKED=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16)

unhook() {
  while iptables -C "$1" -i "$BRIDGE" -j "$2" 2>/dev/null; do
    iptables -D "$1" -i "$BRIDGE" -j "$2"
  done
}

remove() {
  unhook DOCKER-USER "$FORWARD_CHAIN"
  unhook INPUT "$INPUT_CHAIN"
  for chain in "$FORWARD_CHAIN" "$INPUT_CHAIN"; do
    iptables -F "$chain" 2>/dev/null || true
    iptables -X "$chain" 2>/dev/null || true
  done
}

apply() {
  # Traffic between two containers on one bridge only reaches iptables when
  # bridge netfilter is on; without it sandboxes could talk to each other.
  # VI: Lưu lượng giữa hai container trên cùng bridge chỉ đi qua iptables khi bật
  # VI: bridge netfilter; thiếu nó thì sandbox nói chuyện được với nhau.
  modprobe br_netfilter
  sysctl -q -w net.bridge.bridge-nf-call-iptables=1

  iptables -N DOCKER-USER 2>/dev/null || true
  for chain in "$FORWARD_CHAIN" "$INPUT_CHAIN"; do
    iptables -N "$chain" 2>/dev/null || iptables -F "$chain"
  done

  iptables -A "$FORWARD_CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  iptables -A "$FORWARD_CHAIN" -s "$API_IP" -j RETURN
  if [[ -n "$API_PORT" ]]; then
    iptables -A "$FORWARD_CHAIN" -d "$API_IP" -p tcp --dport "$API_PORT" -j RETURN
  fi
  for target in "${ALLOW[@]}"; do
    if [[ "$target" == *:* ]]; then
      iptables -A "$FORWARD_CHAIN" -d "${target%%:*}" -p tcp --dport "${target##*:}" -j RETURN
    else
      iptables -A "$FORWARD_CHAIN" -d "$target" -j RETURN
    fi
  done
  iptables -A "$FORWARD_CHAIN" -o "$BRIDGE" -j DROP
  for net in "${BLOCKED[@]}"; do
    iptables -A "$FORWARD_CHAIN" -d "$net" -j DROP
  done
  iptables -A "$FORWARD_CHAIN" -j RETURN

  # Anything addressed to the host itself (SSH, the deploy console, a service
  # outside Docker) arrives through INPUT, which DOCKER-USER never sees.
  # VI: Mọi thứ gửi tới chính host (SSH, deploy console, service ngoài Docker) đi
  # VI: qua INPUT, nơi DOCKER-USER không thấy.
  iptables -A "$INPUT_CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  iptables -A "$INPUT_CHAIN" -s "$API_IP" -j RETURN
  iptables -A "$INPUT_CHAIN" -j DROP

  iptables -C DOCKER-USER -i "$BRIDGE" -j "$FORWARD_CHAIN" 2>/dev/null \
    || iptables -I DOCKER-USER 1 -i "$BRIDGE" -j "$FORWARD_CHAIN"
  iptables -C INPUT -i "$BRIDGE" -j "$INPUT_CHAIN" 2>/dev/null \
    || iptables -I INPUT 1 -i "$BRIDGE" -j "$INPUT_CHAIN"
}

status() {
  iptables -S DOCKER-USER | grep -- "$FORWARD_CHAIN" || echo "DOCKER-USER: not hooked"
  iptables -S INPUT | grep -- "$INPUT_CHAIN" || echo "INPUT: not hooked"
  iptables -S "$FORWARD_CHAIN" 2>/dev/null || true
  iptables -S "$INPUT_CHAIN" 2>/dev/null || true
}

case "${1:-}" in
  apply) apply ;;
  remove) remove ;;
  status) status ;;
  *) echo "usage: $0 apply|remove|status" >&2; exit 2 ;;
esac
