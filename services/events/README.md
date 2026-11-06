# Events service (cổng 3005)

Microservice giao lưu văn hóa văn nghệ: công ty tổ chức chương trình, nhân viên đăng ký tiết mục, cả công ty bình chọn. Gateway proxy `/api/events/*` tới service này, không cắt tiền tố.

## Chạy

Yêu cầu Node 20 trở lên. Thư viện được ghim trong `package.json`: express 4.21.2, better-sqlite3 11.7.0.

```
cd services/events
npm install            # chạy trên máy đích, tạo package-lock.json
PORT=3005 AUTH_URL=http://127.0.0.1:3001 DATA_DIR=./data node src/index.js
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `PORT` | `3005` | Cổng lắng nghe |
| `HOST` | `127.0.0.1` | Đặt `0.0.0.0` khi gateway nằm ở máy/container khác |
| `DATA_DIR` | `services/events/data` | Chứa `events.db` (SQLite) |
| `AUTH_URL` | `http://127.0.0.1:3001` | Service xác thực, gọi `/api/auth/me` |

## Endpoint

| Method | Đường dẫn | Quyền | Ghi chú |
| --- | --- | --- | --- |
| GET | `/api/health` | Công khai | `{ok:true}` |
| GET | `/api/events` | Đăng nhập | Sự kiện `open` (kể cả đã quá `endsAt`, khi đó `status` trả về là `closed`) hoặc đã đóng thủ công nhưng chưa tới `endsAt`; sắp theo `startsAt` |
| POST | `/api/events` | `it` hoặc `admin` | `{title, description?, startsAt, endsAt}`, trả 201 `{ok, id}` |
| GET | `/api/events/:id` | Đăng nhập | Sự kiện và danh sách tiết mục, 404 nếu không có |
| POST | `/api/events/:id/close` | `it` hoặc `admin` | Đặt `closed`; gọi lại vẫn trả 200 |
| POST | `/api/events/:id/programs` | Đăng nhập | `{performer, title, kind, durationMin}`, trả 201 `{ok, id}` |
| POST | `/api/events/:id/vote` | Đăng nhập | `{programId}`, trả 201 `{ok}` |
| GET | `/api/events/:id/results` | Sự kiện đã đóng (thủ công hoặc quá `endsAt`), hoặc `it`/`admin` | Sắp theo số phiếu giảm dần, 403 khi chưa được xem |

`kind` nhận `singing`, `dance`, `poem`, `game`, `other`. `durationMin` là số nguyên 1 đến 30.

Lỗi trả về dạng `{ok:false, error:"..."}` bằng tiếng Việt, không có stack trace.

## Quy tắc nghiệp vụ

- Mỗi người đăng ký một tiết mục trong mỗi sự kiện; tối đa 30 tiết mục mỗi sự kiện.
- Mỗi người một phiếu trong mỗi sự kiện. Không được bình chọn tiết mục của chính mình (409).
- Thời gian bắt đầu khi tạo sự kiện phải ở tương lai (400).
- Sự kiện đã đóng không nhận đăng ký hay bình chọn (409).
- Sự kiện được coi là đã đóng khi `status` trong DB là `closed` hoặc thời điểm hiện tại đã vượt `endsAt` (so sánh theo UTC), dù chưa được đóng thủ công. Khi đó `status` trả về cho client (danh sách và chi tiết) là `closed`. Cột `status` trong DB không được ghi lại tự động; `POST /close` vẫn cần để đóng thủ công.
- Sự kiện kéo dài tối đa 24 giờ. Thời gian gửi lên phải là ISO 8601 có múi giờ, lưu dạng UTC.
- Mọi thao tác ghi đều ghi `audit_log` trong cùng transaction. Chỉ lưu hash của nội dung.

## Xác thực

Mỗi request (trừ health) gọi `AUTH_URL/api/auth/me` với header `Cookie` được forward, không cache. Timeout 3 giây. Mọi lỗi đều trả 401 `{ok:false, error:"Chưa đăng nhập"}`.

## Dữ liệu

SQLite tại `DATA_DIR/events.db`, tạo bằng `CREATE TABLE IF NOT EXISTS`: `events`, `programs`, `votes`, `audit_log`.
