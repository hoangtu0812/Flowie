# syntax=docker/dockerfile:1
# Per-user coding sandbox: one container per Flowie user, created only by
# sandbox-manager. The user's own Claude Code / Codex / git sign-ins and repo
# clones live in /home/node, which is a named volume per user, so they survive
# a container being recreated from a newer image.
# VI: Sandbox lập trình theo từng người: mỗi người dùng Flowie một container, chỉ
# VI: sandbox-manager tạo ra. Thông tin đăng nhập Claude Code / Codex / git của chính
# VI: người đó và các repo đã clone nằm ở /home/node, là một named volume riêng của
# VI: từng người, nên vẫn còn khi container được tạo lại từ image mới hơn.
FROM node:24-bookworm-slim

# Agent versions are pinned so every sandbox runs what was built and tested;
# upgrading is a rebuild with new build args, not a self-update at runtime.
# VI: Phiên bản agent được ghim để mọi sandbox chạy đúng bản đã build và thử; nâng
# VI: cấp là build lại với build arg mới, không tự cập nhật lúc chạy.
ARG CLAUDE_CODE_VERSION=2.1.332
ARG CODEX_VERSION=0.172.0
# Debian bookworm has no ttyd package, so the upstream static build is used,
# pinned by version and checked against its published SHA-256.
# VI: Debian bookworm không có gói ttyd nên dùng bản static của upstream, ghim
# VI: phiên bản và kiểm theo SHA-256 đã công bố.
ARG TTYD_VERSION=1.7.7
ARG TTYD_SHA256_X86_64=8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55
ARG TTYD_SHA256_AARCH64=b38acadd89d1d396a0f5649aa52c539edbad07f4bc7348b27b4f4b7219dd4165

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq less openssh-client procps python3 ripgrep tmux unzip \
 && arch="$(uname -m)" \
 && case "$arch" in x86_64) sum="$TTYD_SHA256_X86_64" ;; aarch64) sum="$TTYD_SHA256_AARCH64" ;; *) exit 1 ;; esac \
 && curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${arch}" -o /usr/local/bin/ttyd \
 && echo "${sum}  /usr/local/bin/ttyd" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/ttyd \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN npm install --global --no-fund --no-audit \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
 && npm cache clean --force

# The agents are installed under /usr/local, which the unprivileged user cannot
# write, so their self-updaters would only fail; they are turned off instead.
# Git keeps HTTPS credentials (an Azure DevOps PAT, for example) in the user's
# volume; `gh auth login` adds its own helper for github.com on top.
# VI: Agent được cài trong /usr/local, nơi user thường không ghi được, nên trình tự
# VI: cập nhật của chúng chỉ báo lỗi; vì vậy tắt đi. Git lưu thông tin đăng nhập
# VI: HTTPS (ví dụ PAT của Azure DevOps) trong volume của người dùng; `gh auth login`
# VI: thêm helper riêng cho github.com bên trên.
ENV DISABLE_AUTOUPDATER=1 \
    LANG=C.UTF-8 \
    TERM=xterm-256color \
    SHELL=/bin/bash
RUN git config --system credential.helper store \
 && git config --system init.defaultBranch main

USER node
WORKDIR /home/node
COPY --chmod=0755 sandbox-start.sh /usr/local/bin/sandbox-start
COPY --chmod=0755 sandbox-session.sh /usr/local/bin/sandbox-session
CMD ["sandbox-start"]
