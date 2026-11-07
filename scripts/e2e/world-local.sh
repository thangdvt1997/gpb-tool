#!/usr/bin/env bash
# Chạy service world cục bộ cho e2e nhiều người. Chỉ bind 127.0.0.1:3903, xác thực qua auth TEST 127.0.0.1:3902.
# Dùng: scripts/e2e/world-local.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT=3903
PIDFILE=/tmp/gpb-world-local.pid
LOG=/tmp/gpb-world-local.log
case "${1:-start}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "đã chạy (pid $(cat "$PIDFILE"))"; exit 0; fi
    if [ ! -d "$ROOT/services/world/node_modules" ]; then ln -s /home/cc/gpb-dev/services/world/node_modules "$ROOT/services/world/node_modules"; fi
    mkdir -p /tmp/gpb-world-data
    (cd "$ROOT/services/world" && HOST=127.0.0.1 PORT=$PORT AUTH_URL=http://127.0.0.1:3902 \
      ALLOWED_ORIGINS= WORLD_ALLOW_LOCALHOST=1 WORLD_DATA_DIR=/tmp/gpb-world-data \
      nohup node src/index.js >"$LOG" 2>&1 & echo $! >"$PIDFILE")
    for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break || sleep 0.3; done
    echo "world 127.0.0.1:$PORT pid $(cat "$PIDFILE"), log $LOG"; tail -2 "$LOG" ;;
  stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; echo stopped ;;
  status)
    ss -ltn | grep ":$PORT " || echo "không chạy" ;;
esac
