# Karaoke service (cổng 3004)

Microservice karaoke ảo GPBank: danh sách bài hát, ghi điểm, bảng xếp hạng và lịch sử hát của từng người. Gateway proxy `/api/karaoke/*` tới service này. Việc chấm cao độ chạy trên trình duyệt (frontend, thư viện pitchy MIT). Server chỉ lưu điểm và kiểm tra khoảng giá trị.

## Bản quyền bài hát

Mọi bài trong MVP là giai điệu tự sáng tác bằng mã (danh sách nốt MIDI do nhóm viết), trường `license` là `Tự sáng tác, giấy phép nội bộ`. Không thêm lời hay nhạc có bản quyền. Không thêm bài từ YouTube, Zing, Spotify hoặc nguồn không rõ giấy phép.

## Chạy

Yêu cầu Node 20 trở lên. Thư viện được ghim trong `package.json`: express 4.21.2, better-sqlite3 11.7.0.

```
cd services/karaoke
npm install            # chạy trên máy đích, tạo package-lock.json
PORT=3004 AUTH_URL=http://127.0.0.1:3001 DATA_DIR=./data node src/index.js
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `PORT` | `3004` | Cổng lắng nghe |
| `HOST` | `127.0.0.1` | Đặt `0.0.0.0` khi gateway nằm ở máy/container khác |
| `DATA_DIR` | `services/karaoke/data` | Chứa `karaoke.db` (SQLite) |
| `AUTH_URL` | `http://127.0.0.1:3001` | Service xác thực, gọi `/api/auth/me` |

## Endpoint

| Method | Đường dẫn | Quyền | Ghi chú |
| --- | --- | --- | --- |
| GET | `/api/health` | Công khai | `{ok:true}` |
| GET | `/api/karaoke/songs` | Đăng nhập | Mảng bài hát, kèm `notes` (midi, startMs, durationMs) |
| POST | `/api/karaoke/scores` | Đăng nhập | Body `{songId, score, accuracy, durationMs}`. Trả 201 `{ok, id}`. Sai giá trị trả 400, vượt giới hạn trả 429 |
| GET | `/api/karaoke/leaderboard?songId=` | Đăng nhập | Top 20 theo `bestScore`, rồi theo `plays`. Không có `songId` thì gộp mọi bài. Chỉ tính lượt có `suspicious = 0` |
| GET | `/api/karaoke/me/history` | Đăng nhập | 20 lượt gần nhất của chính người gọi, gồm cả lượt đáng ngờ. Mỗi dòng có trường `suspicious` (0 hoặc 1) |

Mọi route trừ `/api/health` đều cần phiên đăng nhập hợp lệ. Mọi vai trò (employee, it, admin) đều hát được.

## Quy tắc điểm

- `score` (0–100, số nguyên) và `accuracy` (0–1) do frontend tính. Server không tính lại, chỉ kiểm tra khoảng giá trị. Vì vậy một client tự sửa mã vẫn có thể gửi điểm giả. Chấp nhận cho MVP. Cần xem lại nếu bảng xếp hạng dùng để trao thưởng.
- `durationMs` là số nguyên từ 0 đến 600000. Nếu nhỏ hơn 50% thời lượng bài thì lưu với cờ `suspicious = 1` (không từ chối). Cờ này chỉ bắt được gian lận lười: client gửi `durationMs` bằng thời lượng bài vẫn qua được.
- Quy tắc bảng xếp hạng: `/leaderboard` chỉ tính các lượt có `suspicious = 0`, gồm `bestScore`, `plays` và tên hiển thị. Lượt bị gắn cờ vẫn được lưu trong bảng `scores`. Chúng chỉ hiện ở `/me/history` với `suspicious = 1`, và không ảnh hưởng xếp hạng của ai. Cột `suspicious` được thêm bằng migration `ensureColumn` (PRAGMA table_info, rồi ALTER TABLE ADD COLUMN nếu thiếu) trong `src/db.js`, nên DB cũ vẫn chạy được.
- Giới hạn chống spam: tối đa 30 lượt ghi điểm mỗi người trong 1 giờ gần nhất. Vượt quá trả 429.
- Tên hiển thị lấy từ `name` của phiên đăng nhập. Nếu thiếu thì dùng `Ẩn danh`, không dùng email.

## Kiểm thử

Chưa chạy được server trong môi trường phát triển này vì không cài dependency. Mới kiểm tra cú pháp bằng `node --check`.
