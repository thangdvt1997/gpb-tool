# Thi đấu có đồng thuận (duel)

Ngày: 2026-11-06. Hợp đồng chung cho backend và giao diện. Chỉ hai người đã đồng ý mới có trận.

## 1. Luật

- Mọi trận đều bắt đầu bằng lời mời. Người được mời chấp nhận thì trận mới có hiệu lực.
- Lời mời tự hết hạn sau 30 giây không trả lời. Từ chối hoặc hết hạn thì không có gì xảy ra, không tính gì thêm.
- Hai chế độ:
  - `fight`: có HP mặc định 100. Mỗi đòn trừ HP theo công thức ở mục 3. Khi HP về 0, người đó nằm đỡ 30 giây (trạng thái `down`). Trận kết thúc khi một bên nằm đỡ.
  - `dance`: không có HP. Hai người cùng thực hiện một điệu nhảy. Trận kết thúc khi một bên rời.
- Bất kỳ ai cũng có thể đầu hàng trong trận `fight`. Người kia thắng.
- Mỗi người chỉ có một trận đang diễn ra và một lời mời đang chờ.
- Trận không hoạt động 3 phút tự kết thúc.
- Không có bảng xếp hạng trong MVP.
- Không có đòn lên người không tham gia trận.

## 2. Trạng thái

- Trận: `invited` → `active` → `finished` | `expired` | `cancelled`.
- Người chơi trong trận `fight` có thể ở trạng thái `ready`, `down`. `down` có `downUntil` (ISO). Hết giờ thì trận kết thúc, người nằm đỡ là người thua.

## 3. Công thức đòn

- `power` từ 1 đến 3. Sát thương = `10 × power`, tối đa 30.
- Đòn chỉ được tính khi trận đang `active`, người gửi là một trong hai bên, và người gửi không đang `down`.
- Giới hạn: tối đa 30 đòn mỗi phút cho mỗi người. Vượt thì trả 429.

## 4. API (service `games`, base `/api/games/duel`, bắt buộc đăng nhập)

Gateway đã có `/api/games` trỏ về service games, không cần sửa gateway.

- **POST `/invite`**: body `{ targetUserId, mode: "fight" | "dance" }`.
  - 201: `{ ok: true, duel }`
  - 400: tự mời chính mình.
  - 403: người được mời không phải nhân viên đang hoạt động.
  - 409: một trong hai người đã có trận hoặc lời mời đang chờ.
- **GET `/inbox`**: lời mời đến và đi đang chờ. Trả về các trận `invited`.
- **POST `/:id/accept`**: chỉ người được mời. Chuyển sang `active`.
- **POST `/:id/decline`**: chỉ người được mời.
- **POST `/:id/hit`**: body `{ power: 1 | 2 | 3 }`. Chỉ trong trận `fight`. Trả về `duel` kèm `lastHit: { by, power, damage, at }`.
- **POST `/:id/forfeit`**: người tham gia bất kỳ, trong trận `fight` đang `active`.
- **POST `/:id/leave`**: người tham gia bất kỳ, trong trận `dance`.
- **GET `/:id`**: chỉ hai bên tham gia. Người khác nhận 403.
- **GET `/active`**: trận đang diễn ra của người đang đăng nhập, hoặc `null`.

Mọi route trả về `{ ok, ... }`. Lỗi theo khuôn `{ ok: false, error: "code" }`. Mã lỗi: `401`, `403`, `404`, `409`, `400`, `429`.

Thời gian dùng ISO có offset `+07:00`.

## 5. Lưu trữ

Bảng `duels` trong SQLite của service `games` (thư mục `/data`):
- `id`, `mode`, `status`, `inviter_id`, `invitee_id`, `created_at`, `accepted_at`, `ended_at`, `winner_id`, `hp_inviter`, `hp_invitee`, `down_user_id`, `down_until`, `last_hit_by`, `last_hit_power`, `last_hit_damage`, `last_hit_at`.
- Không lưu tên người chơi. Lấy tên từ `/api/auth/me` hoặc từ thư mục nhân viên khi cần hiển thị.

Một job nhỏ kiểm tra lời mời hết hạn và trận không hoạt động mỗi 10 giây, hoặc kiểm tra khi có request. Không cần tiến trình nền riêng nếu việc kiểm tra theo request đủ.

## 6. Giao diện

- Module `src/duel/`: `types.ts`, `api.ts`, `DuelPanel.tsx`, `DuelBanner.tsx`, `duel.css` (tiền tố `duel-`).
- `DuelPanel` hiện danh sách nhân viên (tìm theo tên, lấy từ `GET /api/auth/directory`), nút mời, chọn chế độ, lời mời đến với nút chấp nhận và từ chối, đếm ngược 30 giây.
- `DuelBanner` hiện thanh HP hai bên, nút đầu hàng hoặc rời, và thông báo khi nằm đỡ.
- Không dùng `alert` hoặc `confirm`. Tôn trọng `prefers-reduced-motion`. Tương phản đạt chuẩn.
- Không chỉnh `src/ui/Panel.tsx`. Agent chuyển động sẽ gắn `DuelPanel` vào giao diện.

## 7. Tiêu chí chấp nhận

- Không chấp nhận thì không có trận, không có gì thay đổi.
- Đòn sai người, sai trạng thái, hoặc vượt giới hạn bị từ chối.
- HP về 0 thì người đó nằm đỡ 30 giây, sau đó trận kết thúc với người thắng.
- Người không tham gia không đọc được trạng thái trận.
