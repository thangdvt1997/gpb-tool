# IT service (cổng 3002)

Microservice IT: trạng thái dịch vụ, tóm tắt SOC, ticket hỗ trợ, sự cố khẩn, đặt phòng họp, vinh danh. Gateway proxy `/api/it/*`, `/api/rooms/*`, `/api/kudos/*` tới service này.

## Chạy

Yêu cầu Node 20 trở lên. Thư viện được ghim trong `package.json`: express 4.21.2, better-sqlite3 11.7.0.

```
cd services/it
npm install            # chạy trên máy đích, tạo package-lock.json
PORT=3002 AUTH_URL=http://127.0.0.1:3001 DATA_DIR=./data node src/index.js
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `PORT` | `3002` | Cổng lắng nghe |
| `HOST` | `127.0.0.1` | Ngoài hợp đồng. Đặt `0.0.0.0` khi gateway nằm ở máy/container khác |
| `DATA_DIR` | `services/it/data` | Chứa `it.db` (SQLite) |
| `AUTH_URL` | `http://127.0.0.1:3001` | Service xác thực, gọi `/api/auth/me` |
| `SERVICES_FILE` | `mock/services.json` | Ghi đè nguồn trạng thái dịch vụ |

## Endpoint

| Method | Đường dẫn | Quyền | Ghi chú |
| --- | --- | --- | --- |
| GET | `/api/health` | Công khai | `{ok:true}` |
| GET | `/api/it/services` | Đăng nhập | Đọc từ `mock/services.json` |
| GET | `/api/it/incidents/open` | Đăng nhập | Sự cố có `status = open` |
| GET | `/api/it/security/summary` | `role` là `it` hoặc `admin` | Đọc từ `mock/security.json`, khác quyền trả 403 |
| POST | `/api/it/tickets` | Đăng nhập | `{category, title, description?, priority?}`, trả 201 |
| POST | `/api/it/incidents` | Đăng nhập | Hai bước: gửi nội dung trả `confirmToken` (hết hạn 60 giây, dùng một lần); gửi lại kèm `confirmToken` để tạo, trả 201 |
| GET | `/api/rooms` | Đăng nhập | Danh sách phòng (seed mr1, mr2, mr3, util_quiet, util_health), khớp các object đặt phòng trong zone JSON |
| GET | `/api/rooms/free?start&end` | Đăng nhập | ISO 8601 có múi giờ; tối đa 8 giờ. Mã hóa dấu `+` thành `%2B` trong URL |
| POST | `/api/rooms/book` | Đăng nhập | `{roomId, start, end, title}`; tối đa 8 giờ; 400 nếu trong quá khứ; 409 nếu trùng lịch |
| POST | `/api/kudos` | Đăng nhập | `{toName, message}`; 1 lần mỗi ngày theo UTC+7, vượt trả 429 |
| GET | `/api/kudos/board` | Đăng nhập | 20 vinh danh mới nhất, `id` là số, không lộ email |

Lỗi trả về dạng `{ok:false, error:"..."}` bằng tiếng Việt, không có stack trace.

## Xác thực

Mỗi request (trừ health) gọi `AUTH_URL/api/auth/me` với header `Cookie` được forward, không cache, nên logout có hiệu lực ngay. Timeout 3 giây. Mọi lỗi (401, status khác 200, timeout, mạng) đều trả 401 `{ok:false, error:"Chưa đăng nhập"}`. User được gắn vào `req.user` gồm `id`, `email`, `name`, `role`.

## Dữ liệu và audit

SQLite tại `DATA_DIR/it.db`, tạo bằng `CREATE TABLE IF NOT EXISTS`: `tickets`, `incidents`, `bookings`, `kudos`, `audit_log`. Mọi ghi đều ghi `audit_log` trong cùng transaction. `audit_log` có thêm cột `user_id` ngoài các cột trong hợp đồng; `payload_hash` là sha256 của nội dung, không lưu nội dung. Thời gian lưu dạng ISO UTC.

## Hạn chế đã biết

- Mỗi request gọi auth, nếu sau này thấy chậm mới cân nhắc cache ngắn hơn.
- Token xác nhận sự cố lưu trong bộ nhớ, khởi động lại sẽ mất token đang chờ.
- Notifier hiện chỉ là stub ghi log.
- Phòng họp mr1 đến mr3 chưa có `zone` trong yêu cầu, đang để "Chưa xác định".
