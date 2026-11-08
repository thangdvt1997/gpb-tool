#!/bin/bash
# Deploy services/layout (endpoint POST /api/layout/batch, vật thêm, tường ngăn) lên production (/opt/gpb-tool).
# Cần quyền root (ghi /opt/gpb-tool, đọc volume docker, ghi /root). Dùng: sudo bash scripts/deploy-layout.sh <commit-trên-repo-gpb-dev>
# Chỉ build/up layout. Không đụng web, it, games, karaoke, events, display, plants, auth, world, gateway; không ghi đè docker-compose.yml.
# services/layout/data/zone.json KHÔNG nằm trong git (bị .gitignore) nên script giữ nguyên thư mục data của bản đang chạy.
# Rollback: sudo bash scripts/rollback-layout.sh <TS>
set -u
C=${1:?thiếu commit}
P=/opt/gpb-tool
G=/home/cc/gpb-dev
L=/home/cc/deploy-gpb
FULL=$(git -C "$G" rev-parse --short "$C") || exit 1
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/root/backup-gpb-layout-$TS
echo "== bắt đầu $(date -u) TS=$TS commit=$FULL"
[ -f "$P/services/layout/data/zone.json" ] || { echo "thiếu $P/services/layout/data/zone.json, dừng (không có dữ liệu bố cục để giữ)"; exit 1; }
# 1. Sao lưu: volume dữ liệu, docker-compose.yml, services/layout, image hiện tại
mkdir -p "$BK/layout-data" || exit 1
chmod 700 "$BK"
cp -a "$P/docker-compose.yml" "$BK/" && cp -a "$P/services/layout" "$BK/layout-src" || exit 1
docker run --rm -u 0 -v gpb-tool_layout-data:/data:ro -v "$BK/layout-data":/out gpb-tool/layout:local sh -c 'cp -a /data/. /out/' || exit 1
docker tag gpb-tool/layout:local "gpb-tool/layout:backup-$TS" || exit 1
echo "sao lưu: $BK, image gpb-tool/layout:backup-$TS"
# 2. Lấy mã từ commit, giữ data/ của bản đang chạy
R=/tmp/release-layout-$TS
mkdir -p "$R" && git -C "$G" archive "$FULL" services/layout | tar -x -C "$R" || exit 1
[ -f "$R/services/layout/src/extras.js" ] || { echo "commit $FULL chưa có services/layout/src/extras.js (không phải bản có batch)"; exit 1; }
cp -a "$P/services/layout/data" "$R/services/layout/data" || exit 1
rm -rf "$P/services/layout" || exit 1
cp -a "$R/services/layout" "$P/services/layout" || { echo "chép mã lỗi: chạy rollback-layout.sh $TS"; exit 2; }
# 3. Build và chạy đúng layout
cd "$P" || exit 1
docker compose build layout > "$L/build-layout-$TS.log" 2>&1 || { echo "build lỗi, xem $L/build-layout-$TS.log; chưa đổi container; chạy rollback-layout.sh $TS để khôi phục file"; exit 3; }
docker compose up -d layout || { echo "up lỗi: chạy rollback-layout.sh $TS"; exit 4; }
# 4. Kiểm
sleep 5
h=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3008/api/health)
s=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3008/api/layout/state)
b=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"ops":[]}' http://127.0.0.1:3008/api/layout/batch)
g=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gp.daisoncoop.com' http://127.0.0.1:18080/api/health)
echo "layout health=$h (kỳ vọng 200) state không cookie=$s (kỳ vọng 401) batch không cookie=$b (kỳ vọng 401) gateway /api/health=$g"
echo "TS=$TS commit=$FULL layout health=$h state=$s batch=$b" >> "$L/deploys.txt"
chmod 644 "$L/deploys.txt" "$L/build-layout-$TS.log" 2>/dev/null
[ "$h" = 200 ] && [ "$s" = 401 ] && [ "$b" = 401 ] && [ "$g" = 200 ] || { echo "KIỂM LỖI: chạy rollback-layout.sh $TS"; exit 6; }
echo "== xong $(date -u)"
echo "Rollback nếu cần: sudo bash scripts/rollback-layout.sh $TS   (thêm RESTORE_LAYOUT_DB=1 để khôi phục cả dữ liệu volume từ $BK/layout-data)"
