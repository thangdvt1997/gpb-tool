#!/bin/sh
# Smoke scene-qa cho VPS (chạy sau khi đồng bộ mã nguồn lên VPS; chỉ cần node, không cần npm/docker).
#   sh scripts/scene-qa/smoke.sh [thư mục dự án]
# Chỉ đọc. Thoát 0 nếu selftest qua và dữ liệu thật không có error; khác 0 nếu ngược lại.
set -eu
ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"
node scripts/scene-qa/selftest.mjs
node scripts/scene-qa/scene-qa.mjs --md --out "${TMPDIR:-/tmp}/scene-qa-report.md"
echo "scene-qa smoke OK"
