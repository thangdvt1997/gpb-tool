# Plants service (cổng 3007)

Microservice cây cảnh văn phòng. Mỗi cây có chu kỳ sống mô phỏng theo thời gian thực: héo khi thiếu nước, bị sâu thì sức khỏe giảm, ra hoa theo thời gian, lá có thể rụng và mọc lại. Nhân viên chăm sóc bằng dụng cụ (tưới, bắt sâu, hái hoa, tỉa lá, bón phân). Trạng thái dùng chung cho mọi người. Gateway proxy `/api/plants` tới service này.

## Chạy

Yêu cầu Node 20 trở lên. Thư viện được ghim trong `package.json`: express 4.21.2, better-sqlite3 11.7.0.

```
cd services/plants
npm install            # chạy trên máy đích, tạo package-lock.json
PORT=3007 AUTH_URL=http://127.0.0.1:3001 DATA_DIR=./data node src/index.js
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `PORT` | `3007` | Cổng lắng nghe |
| `HOST` | `127.0.0.1` | Đặt `0.0.0.0` khi gateway nằm ở máy/container khác |
| `DATA_DIR` | `services/plants/data` | Chứa `plants.db` (SQLite) |
| `AUTH_URL` | `http://127.0.0.1:3001` | Service xác thực, gọi `/api/auth/me` |

## Xác thực

Mọi route trừ `GET /api/health` gọi `AUTH_URL/api/auth/me` với header `Cookie` được chuyển tiếp, không cache, timeout 3 giây. Mọi lỗi (401, status khác 200, timeout, mạng, JSON hỏng) đều trả 401 `{ok:false, error:"Chưa đăng nhập"}`. Mọi nhân viên đã đăng nhập đều chăm sóc được cây.

## Endpoint

Base: `/api/plants`.

| Method | Đường dẫn | Ghi chú |
| --- | --- | --- |
| GET | `/api/health` | Công khai, `{ok:true}` |
| GET | `/api/plants/state` | `{plants: [...], serverTime}`. Mỗi cây: `id, name, species, stage, health, water, pests, flowers, leaves, ageDays, status, needs, updatedAt` |
| POST | `/api/plants/:id/care` | Body `{action}`, trả `200 {plant, message}` |
| GET | `/api/plants/:id/log` | Trả `{log: [{userName, action, at}]}`, 20 hành động gần nhất, mới nhất trước |

`action` của care: `water`, `remove_pests`, `pick_flowers`, `prune_leaves`, `fertilize`.

| Action | Điều kiện | Tác dụng | Lỗi |
| --- | --- | --- | --- |
| `water` | Cách lần tưới trước ít nhất 5 phút | water +40 (tối đa 100), health +2 | 409 `Cây vừa được tưới, đợi thêm vài phút.` |
| `remove_pests` | Có sâu | pests = 0, health +3 | 409 `Cây không có sâu.` |
| `pick_flowers` | Có hoa | flowers = 0 | 409 `Cây chưa có hoa.` |
| `prune_leaves` | Có lá | bỏ 20% lá (làm tròn xuống, tối thiểu 1), health +1 | 409 `Cây không còn lá để tỉa.` |
| `fertilize` | Cách lần bón trước ít nhất 60 phút | health +8 | 409 `Cây vừa được bón phân, đợi thêm một lúc.` |

Lỗi chung: 400 cho action sai hoặc body không hợp lệ, 404 cho id không thuộc danh sách 5 cây, 429 `Bạn chăm sóc quá nhiều, nghỉ một chút nhé.` khi vượt 60 hành động mỗi giờ mỗi người. Lỗi trả dạng `{ok:false, error}` bằng tiếng Việt, không có stack trace.

Mỗi lần chăm sóc thành công ghi một dòng vào `care_log` (tên hiển thị, action, thời điểm) và một dòng vào `audit_log` (who, action dạng `plant.<action>`, target là id cây, at) trong cùng transaction.

## Luật mô phỏng

Không có timer nền. Trạng thái được tính khi đọc hoặc khi có hành động (lazy). Mỗi cây lưu `tick_at`, là thời điểm đã mô phỏng đến. Khi đọc, service chạy từng phút trôi qua kể từ `tick_at`, tối đa 7 ngày gần nhất.

Mỗi phút, theo thứ tự:

1. Nước giảm 0,4 (từ 100 về 0 mất khoảng 4 giờ).
2. Sâu: nếu health > 30 và số sâu < 5, xác suất 1/240 xuất hiện thêm 1 con.
3. Health: nếu nước < 25 thì giảm 0,05. Nếu nước >= 60 và không có sâu thì tăng 0,02 (tối đa 100). Mỗi con sâu làm giảm 0,01. Health kẹp trong [0, 100].
4. Hoa: tại các phút chia hết cho 120 (theo đồng hồ), nếu stage là `flowering` và health > 50 thì thêm 1 hoa (tối đa 8).
5. Lá: nếu health < 40, xác suất 1/60 rụng 1 lá (về tối thiểu 0). Nếu health >= 70, xác suất 1/180 mọc 1 lá (tối đa 24).

RNG: mỗi phút băm `(seed của cây, chỉ số phút tuyệt đối)` rồi chạy mulberry32, và luôn rút đủ 3 số. Vì vậy kết quả tái lập được, không phụ thuộc việc đọc thường xuyên hay thưa (trừ khi cây vắng quá 7 ngày, khi đó phần đầu bị bỏ qua).

Tuổi và stage không lưu, tính từ `planted_at` và health hiện tại:

- `wilted`: health < 20.
- `seedling`: tuổi dưới 1 ngày.
- Từ 1 đến dưới 3 ngày: `mature` nếu health >= 40, ngược lại `growing`.
- Từ 3 ngày trở lên: `flowering` nếu health >= 40, ngược lại `mature`.

`status` (ưu tiên từ trên xuống): `wilting` (health < 20), `thirsty` (nước < 25), `pests` (có sâu), `healthy`.

`needs`: `water` (nước < 60), `pests` (có sâu), `prune` (lá >= 18), `fertilize` (health < 60).

Dữ liệu seed: 5 cây, `planted_at` lùi 2 ngày so với lúc seed, `tick_at` là lúc seed, nước 80, health 90, 12 lá, không sâu, không hoa. Chỉ seed khi bảng trống.

## Dữ liệu

SQLite tại `DATA_DIR/plants.db`, tạo bằng `CREATE TABLE IF NOT EXISTS`: `plants`, `care_log`, `audit_log`. Thời gian lưu dạng ISO UTC. Mọi thao tác đọc-tính-ghi chạy trong `db.transaction()` đồng bộ của better-sqlite3.

## Điểm đã tự quyết định (đặc tả chưa nêu)

- Stage ở khoảng 1 đến 3 ngày và trên 3 ngày: đã chọn bảng trên, đủ cho mọi ngưỡng đã nêu.
- Hoa được xét tại các mốc 120 phút theo đồng hồ, không tích lũy theo thời gian đủ điều kiện.
- Giới hạn 60 hành động mỗi giờ đếm mọi lần thử hợp lệ, kể cả lần bị 409. Lưu trong bộ nhớ, khởi động lại sẽ reset. Khoá theo id người dùng.
- Vắng quá 7 ngày: chỉ mô phỏng 7 ngày gần nhất, phần còn lại bỏ qua.
- `updatedAt` là thời điểm đã mô phỏng đến (`tick_at`), không phải lúc có hành động cuối.
- Tên hiển thị trong nhật ký lấy `name`, nếu trống thì lấy `email`, rồi `id`.
- `/:id/log` trả object có khoá `log`, không trả mảng trần.

## Hạn chế đã biết

- Chưa chạy thử: chưa `npm install` và chưa kiểm thử hành vi với better-sqlite3 thật. Mới kiểm cú pháp.
- Giới hạn hành động lưu trong bộ nhớ, không chia sẻ giữa nhiều tiến trình.
- Ngưỡng `needs` và giá trị seed là lựa chọn của người viết, nên điều chỉnh sau khi chơi thử.
