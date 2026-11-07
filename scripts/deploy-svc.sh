#!/bin/bash
# Deploy services/auth, services/world và route gateway /api/world lên production (/opt/gpb-tool).
# Cần quyền root (ghi /opt/gpb-tool, đọc .env, ghi /root). Dùng: sudo bash scripts/deploy-svc.sh <commit-trên-wt4/svc4>
# Chỉ build/up auth, world, gateway. Không đụng web, it, games, karaoke, events, display, plants, layout.
# Rollback: sudo bash scripts/rollback-svc.sh <TS>
set -u
C=${1:?thiếu commit}
P=/opt/gpb-tool
G=/home/cc/gpb-dev
L=/home/cc/deploy-gpb
FULL=$(git -C "$G" rev-parse --short "$C") || exit 1
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/root/backup-gpb-svc-$TS
echo "== bắt đầu $(date -u) TS=$TS commit=$FULL"
# 1. Sao lưu
mkdir -p "$BK/auth-data" "$BK/world-data" || exit 1
chmod 700 "$BK"
cp -a "$P/docker-compose.yml" "$P/deploy" "$P/services" "$P/docker" "$BK/" || exit 1
# DB auth: sqlite .backup nhất quán qua container hiện tại; thêm bản cp -a cả volume (gồm -wal, -shm).
docker run --rm -u 0 -v gpb-tool_auth-data:/data:ro -v "$BK/auth-data":/out gpb-tool/auth:local sh -c 'cp -a /data/. /out/' || exit 1
docker tag gpb-tool/auth:local "gpb-tool/auth:backup-$TS" || exit 1
docker tag gpb-tool/gateway:local "gpb-tool/gateway:backup-$TS" || exit 1
docker volume inspect gpb-tool_world-data >/dev/null 2>&1 && docker run --rm -u 0 -v gpb-tool_world-data:/data:ro -v "$BK/world-data":/out gpb-tool/auth:local sh -c 'cp -a /data/. /out/'
echo "sao lưu: $BK, image gpb-tool/auth:backup-$TS, gpb-tool/gateway:backup-$TS"
# 2. Lấy mã từ commit
R=/tmp/release-svc-$TS
mkdir -p "$R" && git -C "$G" archive "$FULL" | tar -x -C "$R" || exit 1
rm -rf "$P/services/auth" "$P/services/world" "$P/deploy" "$P/docker" || exit 1
cp -a "$R/services/auth" "$R/services/world" "$P/services/" && cp -a "$R/deploy" "$R/docker" "$P/" && cp -a "$R/docker-compose.yml" "$P/docker-compose.yml" || { echo "chép mã lỗi: chạy rollback-svc.sh $TS"; exit 2; }
# 3. Build và chạy đúng ba service
cd "$P" || exit 1
docker compose build auth world gateway > "$L/build-svc-$TS.log" 2>&1 || { echo "build lỗi, xem $L/build-svc-$TS.log; chưa đổi container; chạy rollback-svc.sh $TS để khôi phục file"; exit 3; }
docker compose up -d auth world gateway || { echo "up lỗi: chạy rollback-svc.sh $TS"; exit 4; }
# 4. Kiểm
sleep 5
a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/auth/me)
w=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3011/api/health)
K=$(head -c16 /dev/urandom | base64)
ws=$(curl -s -i -N --max-time 4 -H 'Host: gp.daisoncoop.com' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $K" -H 'Origin: https://gp.daisoncoop.com' http://127.0.0.1:18080/api/world/ws | head -1)
g=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gp.daisoncoop.com' http://127.0.0.1:18080/)
h=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gp.daisoncoop.com' http://127.0.0.1:18080/api/health)
echo "auth(/me, chưa cookie, kỳ vọng 401)=$a world health=$w ws=[$ws] gateway /=$g /api/health=$h"
echo "TS=$TS commit=$FULL auth=$a world=$w ws=$ws gw=$g" >> "$L/deploys.txt"
chmod 644 "$L/deploys.txt" "$L/build-svc-$TS.log" 2>/dev/null
case "$ws" in *101*|*401*) ;; *) echo "KIỂM LỖI ws: chạy rollback-svc.sh $TS"; exit 5;; esac
[ "$a" = 401 ] && [ "$w" = 200 ] && [ "$g" = 200 ] && [ "$h" = 200 ] || { echo "KIỂM LỖI: chạy rollback-svc.sh $TS"; exit 6; }
echo "== xong $(date -u)"
