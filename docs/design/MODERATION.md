# Kiểm duyệt và quản trị người dùng

Ngày: 2026-11-06. Đây là hợp đồng chung để ba agent làm song song. Ai làm phần nào thì theo mục 10.

## 1. Vai trò

- **`moderator`** (mới): xem hàng đợi báo cáo, tìm người dùng, khóa tạm hoặc khóa vĩnh viễn tài khoản có vai trò `employee` hoặc `it`. Không khóa được `admin` hoặc `moderator`. Không tự khóa chính mình.
- **`admin`**: mọi quyền của moderator, cộng thêm: khóa được moderator, mở khóa bất kỳ ai, xem nhật ký kiểm duyệt.
- **`it`, `employee`**: không có quyền kiểm duyệt. Vẫn có nút báo cáo.

## 2. Nội dung và bộ lọc từ tục

- Bộ lọc từ tục tiếng Việt chạy tại điểm ghi:
  - tên hiển thị khi đăng ký (service `auth`)
  - kudos (service `it`)
  - tiêu đề và mô tả sự kiện, chương trình (service `events`)
- Nếu có từ bị chặn, trả `422 { ok: false, error: "content_rejected" }` và không lưu.
- Người dùng có thể báo cáo nội dung hoặc người dùng. Khi báo cáo, hệ thống lưu bản chụp nội dung, tối đa 500 ký tự, vào service `auth`.
- **Giới hạn MVP**: chưa ẩn hay xóa nội dung ở service nguồn. Moderator xử lý người dùng. Nội dung gốc vẫn nằm ở service nguồn.

## 3. Khóa tài khoản

- Bảng `users` thêm các cột: `status` (`active` | `banned`), `ban_reason`, `ban_until` (ISO, `null` = vĩnh viễn), `banned_by`, `banned_at`.
- **Đăng nhập**: người đang bị khóa nhận `403 { ok: false, error: "account_banned", until }`. Khi `ban_until` đã qua thì tự mở khóa, không cần thao tác.
- **Phiên đang có**: mỗi request `/api/auth/me` kiểm tra trạng thái. Người bị khóa nhận `401` và phiên bị thu hồi. Các service khác đã gọi `/me` mỗi request nên sẽ tự chặn.

## 4. API (service `auth`, base `/api/auth/moderation`, bắt buộc đăng nhập)

Gateway đã có `/api/auth`, không cần sửa.

- **POST `/reports`**: mọi người đăng nhập.
  - Body: `{ contentType: "kudos" | "program" | "event" | "user", contentId?, targetUserId?, reason (≤ 300), snapshot (≤ 500) }`
  - 201: `{ ok: true, report }`
- **GET `/reports?status=open|resolved`**: moderator, admin. Mới nhất trước.
- **POST `/reports/:id/resolve`**: moderator, admin.
  - Body: `{ action: "dismiss" | "warn" | "ban", reason?, banDays? }`
  - `action: "ban"` khóa người bị báo cáo, theo quy tắc mục 5.
  - Ghi nhật ký.
- **POST `/users/:id/ban`**: moderator, admin.
  - Body: `{ reason (bắt buộc, ≤ 300), banDays: 1–3650 | null }`. `null` nghĩa là vĩnh viễn.
  - Ghi nhật ký.
- **POST `/users/:id/unban`**: moderator, admin. Ghi nhật ký.
- **GET `/users?query=`**: moderator, admin. Tìm theo email hoặc tên. Trả `id`, `email`, `name`, `role`, `status`, `ban_until`. Không trả trường nhạy cảm.
- **GET `/audit`**: chỉ admin. Nhật ký hành động, mới nhất trước.

Lỗi thống nhất: `401` chưa đăng nhập, `403` không đủ quyền hoặc đối tượng không được phép, `404`, `409` đã bị khóa, `422` dữ liệu không hợp lệ.

## 5. Quy tắc an toàn

- Không tự khóa chính mình: `403 { error: "cannot_target_self" }`.
- Moderator chỉ khóa `employee` và `it`. Admin khóa được cả moderator.
- Mọi hành động khóa, mở khóa, cảnh cáo đều bắt buộc có lý do.

## 6. Nhật ký

Bảng `moderation_actions(id, at, actor_id, action, target_user_id, report_id, reason, ban_until)`. Không xóa, không sửa.

## 7. Giao diện

- Panel `moderation` (thêm case trong `src/ui/Panel.tsx`), chỉ hiện với role `moderator` hoặc `admin`:
  - Tab **Hàng đợi**: danh sách báo cáo, mở chi tiết, nút Cảnh cáo, Bỏ qua, Khóa.
  - Tab **Người dùng**: tìm và khóa hoặc mở khóa.
  - Tab **Nhật ký**: chỉ admin.
- Nút **Báo cáo** trong kudos, chương trình, sự kiện.
- Hộp xác nhận khóa có ô lý do bắt buộc. Không dùng `alert` hoặc `confirm`.
- Tiếng Việt, tương phản đạt chuẩn, bàn phím dùng được.

## 8. Quyền riêng tư

- Moderator chỉ thấy nội dung đã bị báo cáo hoặc bị bộ lọc chặn, dưới dạng bản chụp.
- Không đọc nội dung khác. Chưa có chat riêng.

## 9. Tạo tài khoản quản trị

1. Người dùng tự đăng ký bằng email muốn dùng, qua luồng đăng ký hiện có.
2. Admin chạy trên VPS, trong container `auth`:
   `node scripts/admin.js set-role <email> moderator`
3. Không ghi mật khẩu hay mã OTP vào tài liệu hay log.

## 10. Phân quyền file (không ghi chồng)

- **Agent auth**: `services/auth/**` (trừ file `profanity.js`), `scripts/admin.js`. Nhận vai trò `moderator` trong danh sách hợp lệ. Import bộ lọc từ `./profanity.js`, không tự viết.
- **Agent UI**: `src/moderation/**`, `src/ui/ModerationPanel.tsx`, `src/ui/ReportButton.tsx`, `src/ui/Panel.tsx` (chỉ thêm case `moderation`, và gắn nút báo cáo vào case kudos hoặc events nếu cần), `src/ui/EventsPanel.tsx` và `src/ui/KudosPanel.tsx` nếu có, chỉ để gắn nút báo cáo.
- **Agent bộ lọc**: file `profanity.js` đặt cùng cấp với file khởi tạo của mỗi service, giống hệt nhau ở ba nơi (`auth`, `it`, `events`). Thêm kiểm tra vào tên đăng ký (`auth`), kudos (`it`), tiêu đề và mô tả (`events`). Trả `422 content_rejected`. Không sửa các route không liên quan.
- **Không ai sửa**: `src/scene/**`, `src/checkin/**`, `services/it/src/routes/checkins.js` (đang dùng cho ghi danh).

Hàm của `profanity.js`: `findBlocked(text): string | null` (trả về từ bị chặn đầu tiên, hoặc `null`). Chuẩn hóa: chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng và ký tự lặp lại.

## 11. Ngoài phạm vi đợt này

- Ẩn hoặc xóa nội dung ở service nguồn.
- Chat riêng, bảng vẽ, lọc hình ảnh.
- Email thông báo cho người bị khóa.

## 12. Tiêu chí chấp nhận

- Tài khoản `moderator` xem được hàng đợi, không xem được nhật ký.
- Khóa tạm hết hạn tự mở. Khóa vĩnh viễn giữ nguyên.
- Người bị khóa không đăng nhập được, phiên đang có trả `401` ở request kế tiếp.
- Từ tục trong kudos và tên đăng ký bị từ chối với `422`.
- Không tự khóa chính mình. Moderator không khóa được admin.

## 13. Quy tắc làm việc

- Không chạy `npm install`, `tsc`, `vite build` hay `docker` trên máy cục bộ. Kiểm tra bằng đọc code.
- Không commit, không push.
