# Snippet triển khai cho layout (chưa áp dụng)

File này chỉ ghi nội dung cần thêm vào các file khác. Lần viết này không sửa gateway hay compose.

## 1. deploy/nginx/gateway.conf

Thêm block sau, ví dụ đặt cạnh `location /api/plants`. Nginx khớp tiền tố dài nhất nên vị trí không ảnh hưởng tới `location /api/`:

```nginx
    # layout: bố trí văn phòng (3008). Không có dấu / cuối để giữ nguyên /api/layout/...
    # SSE cần tắt buffer và cache, giữ kết nối dài (heartbeat 25 giây).
    location /api/layout {
        proxy_pass http://127.0.0.1:3008;
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }
```

## 2. docker-compose.yml

Thêm service sau vào mục `services:`:

```yaml
  layout:
    build:
      context: ./services/layout
      dockerfile: ../../docker/layout.Dockerfile
    image: gpb-tool/layout:local
    network_mode: host
    restart: unless-stopped
    environment:
      PORT: "3008"
      DATA_DIR: /data
      # layout gọi auth để kiểm tra phiên qua /api/auth/me. Dùng 127.0.0.1 vì network_mode: host.
      AUTH_URL: http://127.0.0.1:3001
    volumes:
      - layout-data:/data
```

Thêm vào mục `volumes:` ở cấp cao nhất:

```yaml
  layout-data:
```
