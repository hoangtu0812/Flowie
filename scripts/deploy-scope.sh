#!/usr/bin/env bash
# Prints `deploy=true` or `deploy=false` for a pushed range BEFORE..AFTER.
# Production redeploys only when the range changes something the images or the
# baked-in release identity are built from; documentation-only pushes skip it.
# VI: In ra `deploy=true` hoặc `deploy=false` cho dải commit BEFORE..AFTER.
# VI: Production chỉ deploy lại khi dải commit đổi thứ mà image hoặc thông tin
# VI: release được build từ đó; push chỉ đổi tài liệu thì bỏ qua deploy.
set -euo pipefail

before="${1:?Previous revision is required}"
after="${2:?Pushed revision is required}"

decide() {
  echo "deploy=$1"
  exit 0
}

# A new branch (all-zero SHA), a force push or an unreachable base cannot be
# diffed reliably, so it deploys rather than guessing.
# VI: Branch mới (SHA toàn số 0), force push hoặc base không truy cập được thì
# VI: không diff tin cậy được, nên vẫn deploy thay vì đoán.
if [[ ! "$before" =~ ^[a-f0-9]{40}$ || "$before" =~ ^0+$ ]] ||
  ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
  decide true
fi

# No image build or runtime reads Markdown files, docs/ or llms.txt, except
# CHANGELOG.md, which is checked separately below.
# VI: Không image build hay runtime nào đọc file Markdown, docs/ hoặc llms.txt,
# VI: ngoại trừ CHANGELOG.md, được kiểm tra riêng ở dưới.
#
# apps/desktop/ is the Flowie Desktop Cargo workspace. No server image copies
# it and no runtime reads it; it ships as a signed installer from its own
# workflow, so a push that only touches it must not rebuild or redeploy the
# server. A range that touches both still deploys, because the first non
# exempt path decides.
# VI: apps/desktop/ là Cargo workspace của Flowie Desktop. Không image server
# VI: nào copy nó và không runtime nào đọc nó; nó phát hành dưới dạng bộ cài đã
# VI: ký từ workflow riêng, nên push chỉ chạm nó thì không được build lại hay
# VI: deploy lại server. Dải commit chạm cả hai thì vẫn deploy, vì path đầu tiên
# VI: không thuộc nhóm miễn trừ sẽ quyết định.
while IFS= read -r path; do
  case "$path" in
    docs/* | *.md | llms.txt | apps/desktop/*) ;;
    *) decide true ;;
  esac
done < <(git diff --name-only --no-renames "$before" "$after")

# apps/web/next.config.ts bakes the newest released section into the web image,
# so a release commit that adds or changes a version heading must deploy.
# shortcut: edits to bullets of an already released section do not redeploy;
# they appear with the next deploy. Parse sections here if that ever matters.
# VI: apps/web/next.config.ts đưa mục release mới nhất vào image web, nên commit
# VI: release thêm hoặc sửa tiêu đề phiên bản bắt buộc phải deploy.
# VI: Sửa nội dung của mục đã release thì không deploy lại; nội dung đó sẽ hiện
# VI: ở lần deploy kế tiếp.
if git diff -U0 "$before" "$after" -- CHANGELOG.md | grep -qE '^[+-]## \['; then
  decide true
fi

decide false
