# Display service (màn hình văn phòng)

Microservice cho tivi và bảng vẽ trong văn phòng ảo. Mọi người đang ở trong văn phòng đều nhận cập nhật realtime, kể cả khi không bấm vào trang. Port 3006.

## Chạy

Biến môi trường:

- `PORT`: mặc định 3006.
- `HOST`: mặc định 127.0.0.1.
- `DATA_DIR`: thư mục chứa `display.db` (SQLite). Mặc định `services/display/data`. Trong container là `/data`.
- `AUTH_URL`: mặc định `http://127.0.0.1:3001`.

Chạy trực tiếp: `npm install` rồi `npm start` trong `services/display`. Khi deploy, dùng `docker-compose.yml` (service `display`, volume `display-data`).

## Xác thực

Mọi route trừ `GET /api/health` gọi `AUTH_URL/api/auth/me` với cookie được chuyển tiếp, timeout 3 giây. Lỗi hoặc không có phiên đều trả 401. Không cache phiên nên đăng xuất có hiệu lực ngay ở request tiếp theo.

Vai trò lấy từ `user.role`. Chỉ `it` và `admin` được xóa bảng.

## Route (base `/api/display`)

| Method | Đường dẫn | Ghi chú |
| --- | --- | --- |
| GET | `/state` | Toàn bộ trạng thái: tivi, bảng (tối đa 5000 nét mỗi bảng), danh sách kênh. |
| GET | `/stream` | SSE. Gửi ngay sự kiện `state`, sau đó `tv`, `stroke`, `clear`. Heartbeat `: ping` mỗi 25 giây. |
| POST | `/tv/:tvId` | Body `{on?: boolean, channel?: 1-6}`, ít nhất một trường. Tivi: `tv_lobby`, `tv_lounge`, `tv_meeting`. |
| POST | `/board/:boardId/strokes` | Body `{points: [[x,y],...], color: "#RRGGBB", width: 1-12}`. Trả 201 `{version}`. |
| POST | `/board/:boardId/clear` | Chỉ `it` hoặc `admin`. Trả 200 `{version}`. |

Bảng hợp lệ: `whiteboard_mr1`, `design_board`. Id khác trả 404.

Kênh: 1 Thông báo IT, 2 Trạng thái dịch vụ, 3 Lịch sự kiện, 4 Bảng vinh danh, 5 Bảng xếp hạng, 6 Chào mừng. Mặc định mọi tivi tắt, kênh 1.

## Giới hạn

- Điểm của mỗi nét: 2 đến 500, tọa độ trong [0, 1], làm tròn 4 chữ số thập phân.
- Mỗi người tối đa 120 nét mỗi phút (429). Bộ đếm nằm trong bộ nhớ, mất khi khởi động lại.
- Mỗi bảng tối đa 5000 nét (409). Phải xóa bảng để vẽ tiếp.
- Tối đa 2000 client SSE đồng thời (503).
- Body JSON tối đa 64 KB.

## Dữ liệu

SQLite `display.db`, WAL. Bảng `tvs`, `boards`, `strokes`, `audit_log`. Audit ghi người, hành động, đối tượng và thời điểm. Không ghi toạ độ nét.

## Ghi chú

- Luồng SSE chỉ xác thực lúc mở kết nối. Đăng xuất không đóng luồng đang mở.
- Sự kiện `state` gửi toàn bộ nét. Bảng đầy có thể làm payload lớn khi nhiều client kết nối cùng lúc.
