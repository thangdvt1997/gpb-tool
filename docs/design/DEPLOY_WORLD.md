# Chuẩn bị triển khai service world (TASK 23 đến 27)

Trạng thái: **chưa triển khai**. Tài liệu này chỉ chuẩn bị trong repo. Agent không sửa `docker-compose.yml`, `deploy/nginx/gateway.conf` của hệ thống thật và không deploy. Người dùng duyệt rồi mới làm.

## 1. Service

- Mã: `services/world` (Node + `ws`). Lệnh: `node src/index.js`.
- Biến môi trường (`services/world/src/config.js`):
  - `PORT` (mặc định 3011), bind 127.0.0.1 như các service khác.
  - `AUTH_URL` (ví dụ `http://127.0.0.1:3001`): kiểm cookie phiên qua `/api/auth/me` khi bắt tay.
  - `ALLOWED_ORIGINS`: thêm Origin ngoài `https://gp.daisoncoop.com` (phân cách dấu phẩy).
- Đường WebSocket: `/api/world/ws`. Client tự chọn `wss://<host>/api/world/ws` khi trang chạy HTTPS (`src/net/useWorld.ts`).

## 2. Đoạn compose đề xuất (chưa áp dụng)

```yaml
  world:
    build: ./services/world
    network_mode: host
    restart: unless-stopped
    environment:
      PORT: "3011"
      AUTH_URL: "http://127.0.0.1:3001"
```

## 3. Đoạn gateway đề xuất (chưa áp dụng)

Gateway đã đặt `proxy_set_header Upgrade` và `Connection $connection_upgrade` ở cấp server (dòng 28 đến 29), nên location mới kế thừa:

```nginx
    location /api/world/ {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_read_timeout 75s;   # dài hơn chu kỳ ping/pong của service
    }
```

## 4. Bật phía client

Client chỉ kết nối khi build với `VITE_WORLD_ENABLED=1` hoặc mở trang với `?world=1` (`src/net/poseThrottle.ts`, `worldEnabled`). Mặc định tắt để bản đang chạy không thử kết nối tới service chưa có.

## 5. Cách kiểm sau khi triển khai (chưa kiểm chứng)

1. `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGVzdA==' -H 'Origin: https://gp.daisoncoop.com' https://gp.daisoncoop.com/api/world/ws`: không có cookie phải bị đóng 4401 hoặc 401.
2. Hai trình duyệt (hai tài khoản) mở `?world=1`: thấy nhau di chuyển, chat theo phòng, chat gần.
3. Mở tab thứ hai cùng tài khoản: tab cũ nhận mã 4409 (bị thay phiên).
4. Tắt mạng 10 giây rồi bật: nối lại, giữ ghế trong thời gian ân hạn.
5. Origin lạ: bị từ chối.

Thoại theo khoảng cách (task 25b) chưa làm: cần TURN/SFU và cổng UDP công khai (QĐ-11).
