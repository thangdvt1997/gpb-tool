#!/bin/bash
# Rollback layout về bản sao lưu TS. Dùng: sudo bash scripts/rollback-layout.sh <TS>
# Không xóa volume. Bảng props do bản mới thêm vào layout.db (CREATE IF NOT EXISTS) bản cũ bỏ qua nên tương thích ngược;
# chỉ khôi phục dữ liệu từ $BK/layout-data nếu đặt RESTORE_LAYOUT_DB=1 (mất các thay đổi bố cục sau thời điểm sao lưu).
set -u
TS=${1:?thiếu TS}
P=/opt/gpb-tool
BK=/root/backup-gpb-layout-$TS
[ -f "$BK/docker-compose.yml" ] && [ -d "$BK/layout-src" ] || { echo "không có $BK"; exit 1; }
docker tag "gpb-tool/layout:backup-$TS" gpb-tool/layout:local || exit 1
rm -rf "$P/services/layout" && cp -a "$BK/layout-src" "$P/services/layout" || exit 1
cp -a "$BK/docker-compose.yml" "$P/docker-compose.yml"
cd "$P" || exit 1
if [ "${RESTORE_LAYOUT_DB:-0}" = 1 ]; then
  docker compose stop layout
  docker run --rm -u 0 -v gpb-tool_layout-data:/data -v "$BK/layout-data":/in:ro gpb-tool/layout:local sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; cp -a /in/. /data/'
fi
docker compose up -d --no-build layout || exit 1
sleep 3
echo "layout health=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3008/api/health) (kỳ vọng 200)"
echo "rollback layout TS=$TS $(date -u)" >> /home/cc/deploy-gpb/deploys.txt
echo "rollback xong"
