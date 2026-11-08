# Layout service (services/layout)

Microservice bố trí văn phòng IT. Cho phép di chuyển đồ đạc (trừ bàn làm việc), lưu vị trí chung cho mọi người và phát realtime qua SSE.

Cổng mặc định 3008, base path `/api/layout`. Mọi route trừ `/api/health` đều gọi `AUTH_URL/api/auth/me` với cookie được chuyển tiếp (không cache). Lỗi xác thực trả 401.

## Endpoint

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/layout/state` | `{items, defaults, props, version}`. `items` chỉ có vật đã được di chuyển; `props` là vật thêm bằng trình biên tập (bàn, ghế, cây, tủ, tường ngăn có thể có cửa). |
| GET | `/api/layout/stream` | SSE. Gửi `state` khi kết nối, `move` và `reset` khi có thay đổi. `: ping` mỗi 25 giây. Tối đa 2000 client, vượt thì 503. |
| POST | `/api/layout/move` | Body `{id, x, z, rotation}`. Trả `{ok, item, version}`. |
| POST | `/api/layout/batch` | Body `{ops: [...]}` tối đa 100 thao tác: `move`, `reset`, `put` (thêm/sửa vật thêm, `kind` thuộc `table, chair, plant, cabinet, wall2, wall4`, `door` chỉ cho tường), `remove`. Chỉ `it`/`admin`. Nguyên tử: kiểm trạng thái cuối, một giao dịch SQLite, version tăng một lần; 409 thì không ghi gì (kèm `id` vật vướng). Phát SSE `reset` (client tải lại). Logic ở `src/extras.js`, test `npm test`. |
| POST | `/api/layout/reset` | Body `{id?}`. Chỉ role `it` hoặc `admin`. Không có `id` thì đặt lại toàn bộ. |

Mã lỗi của `move`: 400 dữ liệu sai, 403 bàn làm việc (`desk_*`), 404 vật không di chuyển được, 409 vị trí vướng hoặc chặn lối, 429 vượt 30 lần mỗi phút cho mỗi người.

## Danh sách vật di chuyển được

Cố định trong `src/movable.js`, API không nhận thêm id: `service_desk`, `games_corner`, `karaoke_room`, `kudos_board`, `util_coffee`, `pantry`, `lounge`, `tv_lobby`, `tv_lounge`, `tv_meeting`, `whiteboard_mr1`, `design_board`, `plant_lobby`, `plant_lounge_a`, `plant_lounge_b`, `plant_meeting`, `plant_north`.

Mọi id khác trong `data/zone.json` (bàn làm việc, thang, nhà vệ sinh, phòng kín, tường, bảng sự kiện, khu dự phòng) là chướng ngại cố định.

## Quy tắc kiểm tra vị trí (`src/movable.js`, `src/geometry.js`)

- Tâm vật nằm trong x `[-28.2, 28.2]`, z `[-14.2, 14.2]` (sàn 58 x 30 m, biên 0,8 m).
- Footprint sau khi xoay không chồng lên chướng ngại cố định hoặc vật di chuyển khác, và cách mọi vật đó tối thiểu 0,6 m.
- Footprint không nằm trong vùng 1,5 m quanh tâm các `core_*` và `entrance`.
- Footprint = `size[0]` theo x và `size[2]` theo z. Xoay 90 hoặc 270 độ thì đổi chỗ hai cạnh.
- Toạ độ làm tròn 0,1 m. Mọi lỗi vị trí trả 409 với cùng một thông báo.

## Dữ liệu

- `data/zone.json`: bản sao có chọn lọc từ `src/content/zones/it.json`. Cập nhật tay khi it.json đổi.
- `DATA_DIR/layout.db`: bảng `items`, `meta` (version toàn cục) và `audit` (who, action, target, at). Ghi audit cho mọi lần di chuyển thành công và mọi lần reset.

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PORT` | 3008 | |
| `HOST` | 127.0.0.1 | |
| `DATA_DIR` | `local-data/` | Trong container là `/data`. |
| `AUTH_URL` | `http://127.0.0.1:3001` | Phải là http hoặc https. |

## Còn thiếu hoặc cần quyết định

- 10 vật không có toạ độ trong it.json (tv_lobby, tv_lounge, tv_meeting, whiteboard_mr1, design_board, plant_lobby, plant_lounge_a, plant_lounge_b, plant_meeting, plant_north). Các vật này có `position: null`, không xuất hiện trong `defaults` cho tới khi bổ sung.
- `lounge` có footprint 11,4 x 16,3 m. Vì lounge là vật di chuyển được, footprint này chắn các vật khác nằm trong khu lounge, nên có thể cần coi lounge là vùng sàn và loại khỏi kiểm tra va chạm.
- `kudos_board` có toạ độ mặc định x = 28,55, vượt giới hạn sàn. Giới hạn chỉ áp dụng khi di chuyển.
