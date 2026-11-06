# Hành động nhanh (TASK 15)

Thư mục: `src/emotes/quick/`. Dùng lại `playEmote`, `cancelEmote` của player; không sửa library hay player.

## Hành động có clip thật (6)
| ID | Nhãn | Phím | Loại | Hồi (s) |
|---|---|---|---|---|
| wave | Vẫy tay | Z | once | 1.5 |
| dance_1 | Nhảy 1 | X | loop | 1 |
| dance_2 | Nhảy 2 | C | loop | 1 |
| kata | Múa võ | R | once | 2 |
| punch_combo | Tập quyền | F | once | 2 |
| stance | Tấn | T | hold | 0.5 |

Phím 1-6 giữ nguyên cho `useEmoteHotkeys`. Q mở bánh xe; khi mở, phím số 1-6 chọn ô, chuột chọn theo góc.

## Điều kiện bắt đầu
Đứng yên (tốc độ <= 0.05), không nhảy, không ngồi, không mở editor, không đang tương tác (E), nằm trong vùng cho phép (zones; null = chưa cấu hình, không giới hạn; mảng rỗng = không đâu), hết hồi.

## Trạng thái và hủy
Chạy: start -> playing (player) -> finish (once tự về nghỉ) hoặc cancel. Nguyên nhân hủy: move, jump, sit, interact, editor, focus_loss, user, wheel_open. Stance không bị hủy khi di chuyển (đúng hành vi player), các nguyên nhân khác thì hủy. Bấm lại stance để thoát.

## Cấm trùng phím
`RESERVED_KEYS` = W A S D Shift Space E V Esc và 1-6; thêm phím Q của bánh xe. `findKeyConflicts` và `rebind` từ chối trùng. Phím có Ctrl/Meta/Alt/Shift bị bỏ qua.

## Đồng bộ (chưa nối mạng)
`sync.ts`: `EmoteSyncEvent { type, actionId, startTime, parameters, endCause? }` và `setEmoteSyncSink`. Mặc định không có sink.

## Chưa làm (không hiển thị, không chạy giả)
Bắt tay và vẫy tay với người khác (chưa có cơ chế đồng ý), gật đầu, lắc đầu (thiếu kênh Pose), chỉ tay, khoanh tay (không có clip), điện thoại (thiếu prop, IK, clip), ngồi thư giãn (thiếu clip và trạng thái ngồi), biểu cảm mặt (rig chưa có morph). Danh sách: `NOT_IMPLEMENTED`.

## Mount
Trong App: `<QuickWheel getContext={getQuickContext} onPointerCapture={setLookLocked} />` (import từ `./emotes/quick`). Host phải cấp `getQuickContext` và gọi `notifyCause('move' | 'jump' | 'sit' | 'interact' | 'editor')` khi các sự kiện đó xảy ra.

## Kiểm thử
`node --test src/emotes/quick/quick.test.mjs` (không cần npm). Phần giao diện bánh xe và thao tác trên trình duyệt chưa kiểm chứng.
