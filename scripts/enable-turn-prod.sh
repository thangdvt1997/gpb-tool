#!/bin/bash
# Bật thoại (TASK 25b) trên production: đưa TURN_SECRET của coturn (container gpb-turn-coturn, /home/cc/gpb-turn/.env)
# vào /opt/gpb-tool/.env rồi tạo lại container world. Cần root (ghi /opt/gpb-tool/.env).
# Dùng: sudo bash scripts/enable-turn-prod.sh
# Không in secret. Rollback: cp /root/backup-gpb-turn-<TS>/.env /opt/gpb-tool/.env && cd /opt/gpb-tool && docker compose up -d world
set -u
P=/opt/gpb-tool
SRC=/home/cc/gpb-turn/.env
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/root/backup-gpb-turn-$TS
[ "$(id -u)" = 0 ] || { echo "cần root"; exit 1; }
[ -r "$SRC" ] || { echo "không đọc được $SRC"; exit 1; }
SECRET=$(sed -n 's/^TURN_SECRET=//p' "$SRC" | head -1)
[ -n "$SECRET" ] || { echo "TURN_SECRET rỗng trong $SRC"; exit 1; }
mkdir -p "$BK" && chmod 700 "$BK" && cp -a "$P/.env" "$BK/.env" || exit 1
echo "sao lưu .env: $BK/.env"
# Thay dòng TURN_SECRET cũ (nếu có) bằng giá trị mới; giữ nguyên mọi dòng khác.
TMP=$(mktemp) && chmod 600 "$TMP"
grep -v '^TURN_SECRET=' "$P/.env" > "$TMP"
printf 'TURN_SECRET=%s\n' "$SECRET" >> "$TMP"
cat "$TMP" > "$P/.env" && rm -f "$TMP"
cd "$P" || exit 1
docker compose up -d --no-build world || { echo "up lỗi: khôi phục bằng lệnh rollback ở đầu tệp"; exit 2; }
sleep 4
LEN=$(docker inspect gpb-tool-world-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^TURN_SECRET=//p' | tr -d '\n' | wc -c)
w=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3011/api/health)
t=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gp.daisoncoop.com' http://127.0.0.1:18080/api/world/turn)
echo "world health=$w, TURN_SECRET trong container dài $LEN ký tự, /api/world/turn chưa đăng nhập=$t (kỳ vọng 401)"
[ "$w" = 200 ] && [ "$LEN" -gt 0 ] || { echo "KIỂM LỖI: khôi phục bằng lệnh rollback ở đầu tệp"; exit 3; }
echo "xong: thoại dùng coturn 3478 với credential ngắn hạn"
