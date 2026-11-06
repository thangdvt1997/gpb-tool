# Đoạn cấu hình cần gộp cho service plants (cổng 3007)

Phần này do người điều phối gộp. Service plants không tự sửa `deploy/nginx/gateway.conf` hay `docker-compose.yml`.

## 1. Gateway: deploy/nginx/gateway.conf

Thêm cùng nhóm với các block `/api/...` khác (ví dụ ngay sau block `/api/games`). Không có dấu `/` cuối để cả `/api/plants` và `/api/plants/...` đều được proxy, và tránh 301 của nginx làm mất method POST.

```
    # plants: cây cảnh văn phòng (3007). Không có dấu / cuối để cả /api/plants và /api/plants/... đều được proxy.
    # Tránh 301 của nginx làm mất method POST.
    location /api/plants {
        proxy_pass http://127.0.0.1:3007;
    }
```

## 2. Compose: docker-compose.yml

Thêm vào `services:`, sau block `karaoke` hoặc `events` tuỳ thứ tự gộp:

```yaml
  plants:
    build:
      context: ./services/plants
      dockerfile: ../../docker/plants.Dockerfile
    image: gpb-tool/plants:local
    network_mode: host
    restart: unless-stopped
    environment:
      PORT: "3007"
      DATA_DIR: /data
      # plants gọi auth để kiểm tra phiên qua /api/auth/me. Dùng 127.0.0.1 vì network_mode: host.
      AUTH_URL: http://127.0.0.1:3001
    volumes:
      - plants-data:/data
```

Thêm vào `volumes:` ở cuối file, cùng nhóm với `it-data`, `games-data`:

```yaml
  plants-data:
```

## Ghi chú cho người gộp

- Port 3007 chưa được service nào khác dùng trong repo. `docs/RESEARCH_SERVICES.md` ghi 3007 trở đi là dự phòng.
- Service dùng `network_mode: host`, nên `AUTH_URL` phải là `127.0.0.1:3001` như các service khác.
- Build context là `./services/plants`. Dockerfile và dockerignore nằm trong `docker/`.
- Không cần biến môi trường bí mật. Dữ liệu chỉ nằm trong volume `plants-data`.
