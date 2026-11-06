# Games service (GPBank)

Microservice trò chơi văn phòng ảo: cờ caro hai người, đố vui theo lượt, bảng xếp hạng. Chạy ở cổng 3003 sau gateway. Gateway không cắt tiền tố, nên service nhận đường dẫn đầy đủ `/api/games/...`.

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|------|----------|---------|
| `PORT` | `3003` | Cổng lắng nghe |
| `HOST` | `127.0.0.1` | Đặt `0.0.0.0` khi gateway ở máy/container khác |
| `DATA_DIR` | `services/games/data` | Nơi đặt `games.db` (SQLite, WAL) |
| `AUTH_URL` | `http://127.0.0.1:3001` | Gọi `/api/auth/me` để xác thực từng request |

Chạy: `npm install` rồi `npm start`. Dependency: express 4.21.2, better-sqlite3 11.7.0.

## Xác thực

- `GET /api/health` không cần đăng nhập.
- Mọi route còn lại gọi `AUTH_URL/api/auth/me` cho từng request (timeout 3 giây, không cache). Mọi lỗi xác thực trả 401. Phản hồi auth thiếu `id` cũng bị coi là chưa đăng nhập; không dùng email thay thế.
- Vai trò employee, it và admin đều được chơi. Service không kiểm tra vai trò riêng.
- Service không lưu email. Chỉ lưu `user_id` và tên hiển thị.

## Lỗi

Mọi lỗi trả về dạng `{ "ok": false, "error": "..." }`.

## Endpoint

### Cờ caro (`/api/games/caro`)

| Method | Đường dẫn | Body | Phản hồi |
|--------|-----------|------|----------|
| POST | `/rooms` | `{name}` (2–40 ký tự) | 201 trạng thái phòng. Người tạo là quân X. 409 nếu bạn đang có 3 phòng chờ. 429 nếu tạo quá 5 phòng mỗi phút |
| GET | `/rooms` | | Tối đa 50 phòng `waiting`: `{id, name, status, players, createdAt}`. Phòng chờ quá 30 phút được đóng trước khi trả về |
| GET | `/rooms/:id` | | Trạng thái phòng (xem bên dưới) |
| POST | `/rooms/:id/join` | | 200 trạng thái. 409 nếu phòng đã đủ người, đã đóng, hoặc bạn đã ở trong phòng. Phòng chờ quá 30 phút được đóng trước khi kiểm tra |
| POST | `/rooms/:id/move` | `{row, col}` (số nguyên 0–14) | 200 trạng thái. 400 sai toạ độ, 403 không phải người chơi, 409 sai lượt / ô đã có quân / phòng chưa chơi hoặc đã kết thúc |
| POST | `/rooms/:id/leave` | | 200 trạng thái |

Trạng thái phòng: `{id, name, status, players: {x, o}, board, turn, winner, moveCount, updatedAt}`.
- `status`: `waiting`, `playing`, `finished`.
- `players.x`, `players.o`: `{name}` hoặc `null`. Không trả user_id nội bộ.
- `board`: 15 chuỗi, mỗi chuỗi 15 ký tự `.`, `X`, `O`.
- `turn`: `x`, `o` hoặc `null`. `winner`: `x`, `o`, `draw` hoặc `null`.

Không trả về danh sách nước đi.

### Đố vui (`/api/games/quiz`)

| Method | Đường dẫn | Body | Phản hồi |
|--------|-----------|------|----------|
| POST | `/round` | | 201 `{roundId, questions: [{id, text, choices[4]}]}`. Không có đáp án. 429 nếu tạo quá 10 ván mỗi phút |
| POST | `/round/:roundId/answer` | `{questionId, choice}` (choice 0–3) | 200 `{ok: true}`. Không trả đáp án đúng. 409 nếu đã trả lời câu này hoặc ván đã kết thúc. 403 nếu ván không phải của bạn |
| POST | `/round/:roundId/finish` | | 200 `{score, total, results: [{questionId, correctIndex, chosen}]}`. Đáp án đúng chỉ lộ ở đây. `results` chỉ gồm các câu đã trả lời, theo thứ tự trong ván. Ván chưa trả lời câu nào thì `score` là 0 và `results` rỗng. 409 nếu gọi lần hai |

### Bảng xếp hạng

`GET /api/games/leaderboard?kind=caro|quiz` (mặc định `quiz`). Trả về top 20 `{userName, points, games}`, gộp theo người dùng, sắp theo điểm giảm dần rồi theo số ván. `kind` khác `caro` hoặc `quiz` trả 400.

## Luật chơi

**Cờ caro.** Bàn 15x15. Thắng khi có 5 quân liên tiếp theo hàng ngang, cột, hoặc một trong hai đường chéo. Khi bàn đầy (225 ô) mà không ai thắng thì hòa. Quân X đi trước.

**Đố vui.** Mỗi ván gồm 5 câu ngẫu nhiên lấy từ bộ 20 câu trong `src/data/questions.js`. Mỗi người chỉ có một ván mở; tạo ván mới sẽ đánh dấu ván cũ còn mở là bỏ. Mỗi câu chỉ trả lời một lần. Khi trả lời, máy chủ chỉ ghi nhận, không cho biết đúng hay sai. Đáp án đúng và điểm chỉ hiện khi kết thúc ván. Điểm bằng số câu đúng. Câu chưa trả lời tính là sai, và có thể kết thúc ván bất cứ lúc nào. Ván không có câu trả lời nào thì không ghi dòng điểm.

**Điểm bảng xếp hạng.** Caro: thắng 3, hòa 1, thua 0. Mỗi người chơi một dòng điểm cho mỗi ván. Ván bỏ cuộc giữa trận vẫn được ghi kết quả, nhưng bên thắng không được cộng điểm (0). Đố vui: điểm bằng số câu đúng.

## Quy tắc đã chọn khi đề bài chưa rõ

- **Join khi đã ở trong phòng hoặc phòng đủ người:** trả 409 kèm trường `room` (trạng thái hiện tại), để client chuyển thẳng vào phòng.
- **Chủ phòng rời khi phòng còn `waiting`:** phòng đóng (`status: finished`, `winner: null`), không ghi kết quả, không tính điểm.
- **Rời khi đang `playing`:** người rời bị xử thua. Bên còn lại thắng nhưng không được cộng điểm. Ván vẫn được ghi kết quả.
- **Rời khi phòng đã `finished`:** trả 200 và không đổi gì.
- **Phòng chờ hết hạn:** phòng `waiting` quá 30 phút không có người vào thì đóng (`status: finished`, `winner: null`). Việc đóng được kiểm tra khi đọc danh sách phòng, khi tạo phòng và khi join. Không có timer nền, nên phòng hết hạn trong DB vẫn là `waiting` cho tới khi có một trong các lần gọi đó.
- **Đố vui, lộ đáp án:** trong lúc làm bài, đáp án đúng không bao giờ được trả về. Đáp án đúng và lựa chọn của người chơi chỉ có trong phản hồi finish.
- **Đố vui, ván không có câu trả lời:** không ghi dòng điểm. Ván vẫn được đóng và trả `{score: 0, total, results: []}`.
- **Tên phòng:** bỏ ký tự điều khiển và khoảng trắng hai đầu. Cắt tối đa 40 ký tự. Dưới 2 ký tự thì 400.
- **Tên hiển thị:** lấy từ auth, cắt tối đa 60 ký tự. Không có tên thì dùng `Người chơi`.
- **Số nguyên:** phải có kiểu number, không nhận chuỗi.
- **Route health:** `GET /api/health` (không có tiền tố `/games`). Nếu gateway cần `/api/games/health`, cần thêm route và quyết định có cho phép không cần đăng nhập.

## Cấu trúc

```
src/
  index.js          khởi động, lắng nghe HOST:PORT, tắt êm khi nhận SIGTERM/SIGINT
  config.js         đọc biến môi trường
  app.js            Express, middleware xác thực, mount route, xử lý lỗi
  auth.js           middleware xác thực (sao chép từ services/it)
  db.js             SQLite và schema (CREATE TABLE IF NOT EXISTS)
  util.js           ApiError, kiểm tra đầu vào, id
  routes/caro.js    cờ caro
  routes/quiz.js    đố vui
  routes/leaderboard.js
  data/questions.js bộ câu hỏi tự soạn
```
