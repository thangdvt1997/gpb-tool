#!/usr/bin/env bash
# Đóng gói repo, gửi lên máy chủ qua SSH, rồi build và chạy docker compose trên máy chủ.
#
# Cách dùng:
#   HOST=10.0.0.5 SSH_USER=deploy REMOTE_DIR=/opt/gpb-tool bash scripts/deploy-remote.sh
#
# Biến môi trường:
#   HOST        (bắt buộc) địa chỉ máy chủ
#   SSH_USER    (bắt buộc) user SSH trên máy chủ. Đặt tên khác USER để không đè biến USER của shell
#   REMOTE_DIR  thư mục triển khai trên máy chủ (mặc định /opt/gpb-tool)
#   SSH_OPTS    tùy chọn ssh thêm (mặc định: -o BatchMode=yes)
#
# Xác thực: script không chứa mật khẩu. Cần SSH key hoặc ssh-agent đã nạp key cho máy chủ đích.
# BatchMode=yes làm ssh thất bại thay vì hỏi mật khẩu, nên không có lệnh nào bị treo chờ nhập.
#
# File .env thật nằm trên máy chủ tại $REMOTE_DIR/.env. Script KHÔNG gửi .env từ máy này lên.
# Script cũng không xóa file cũ trên máy chủ, nên dữ liệu trong volume và .env được giữ nguyên.

set -euo pipefail

: "${HOST:?Thiếu HOST, ví dụ HOST=10.0.0.5}"
: "${SSH_USER:?Thiếu SSH_USER, ví dụ SSH_USER=deploy}"
REMOTE_DIR="${REMOTE_DIR:-/opt/gpb-tool}"
SSH_OPTS="${SSH_OPTS:--o BatchMode=yes}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${SSH_USER}@${HOST}"
read -r -a SSH_ARGS <<< "${SSH_OPTS}"

echo "==> Đóng gói ${ROOT_DIR} và gửi tới ${TARGET}:${REMOTE_DIR}"
# Loại .git, dist, data, node_modules, log và .env*.
# Các mẫu ./data và ./services/*/data được neo vào đúng vị trí, để không loại nhầm
# src/data (mã nguồn) hay services/it/src/data. Không dùng wildcard cho đường dẫn data.
tar -C "${ROOT_DIR}" -czf - \
  --exclude=./.git \
  --exclude=./dist \
  --exclude=./data \
  --exclude=./services/auth/data \
  --exclude=./services/it/data \
  --exclude=node_modules \
  --exclude='*.log' \
  --exclude=.env \
  --exclude='.env.*' \
  . \
  | ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${REMOTE_DIR}' && tar -xzf - -C '${REMOTE_DIR}'"

echo "==> Build và chạy container trên máy chủ, sau đó kiểm tra health"
ssh "${SSH_ARGS[@]}" "${TARGET}" bash -s -- "${REMOTE_DIR}" <<'REMOTE'
set -euo pipefail
cd "$1"

docker compose build < /dev/null
docker compose up -d < /dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18080/api/health; then
    echo
    docker compose ps < /dev/null
    exit 0
  fi
  sleep 2
done

echo "Health check thất bại sau 60 giây. Trạng thái và log gần nhất:" >&2
docker compose ps < /dev/null >&2 || true
docker compose logs --tail=50 < /dev/null >&2 || true
exit 1
REMOTE

echo "==> Xong. Truy cập từ laptop qua SSH tunnel:"
echo "    ssh -L 18080:127.0.0.1:18080 ${TARGET}"
echo "    rồi mở http://127.0.0.1:18080"
