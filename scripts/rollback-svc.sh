#!/bin/bash
# Rollback auth, gateway và gỡ world về bản sao lưu TS. Dùng: sudo bash scripts/rollback-svc.sh <TS>
# Không xóa volume. DB auth chỉ khôi phục từ $BK/auth-data nếu thêm biến RESTORE_AUTH_DB=1 (mặc định giữ DB hiện tại; schema mới tương thích ngược).
set -u
TS=${1:?thiếu TS}
P=/opt/gpb-tool
BK=/root/backup-gpb-svc-$TS
[ -f "$BK/docker-compose.yml" ] || { echo "không có $BK"; exit 1; }
docker tag "gpb-tool/auth:backup-$TS" gpb-tool/auth:local || exit 1
docker tag "gpb-tool/gateway:backup-$TS" gpb-tool/gateway:local || exit 1
cd "$P" && docker compose stop world && docker compose rm -f world
rm -rf "$P/services/auth" "$P/services/world" "$P/deploy" "$P/docker"
cp -a "$BK/services/auth" "$P/services/auth"; [ -d "$BK/services/world" ] && cp -a "$BK/services/world" "$P/services/world"
cp -a "$BK/deploy" "$BK/docker" "$P/"; cp -a "$BK/docker-compose.yml" "$P/docker-compose.yml"
docker compose up -d --no-build auth gateway || exit 1
if [ "${RESTORE_AUTH_DB:-0}" = 1 ]; then
  docker compose stop auth
  docker run --rm -u 0 -v gpb-tool_auth-data:/data -v "$BK/auth-data":/in:ro gpb-tool/auth:local sh -c 'cp -a /in/. /data/'
  docker compose up -d --no-build auth
fi
echo "rollback svc TS=$TS $(date -u)" >> /home/cc/deploy-gpb/deploys.txt
echo "rollback xong"
