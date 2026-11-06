# ONBOARDING_API: đăng ký lần đầu, đặt mật khẩu, hồ sơ nhân vật

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Đề xuất thiết kế. Chưa triển khai. Chờ duyệt mục 10. |
| Phạm vi file | Chỉ tài liệu này. Không sửa services/, src/, deploy/. |
| Phụ thuộc | services/auth (cổng 3001), deploy/nginx/gateway.conf, docs/design/AVATAR_SPEC.md |
| Đối tượng | Agent ONBOARD-UX (frontend), người triển khai auth |

Cách đọc: mục "Hiện trạng" chỉ mô tả code đã đọc. Số dòng tham chiếu theo services/auth/index.js trừ khi ghi khác. Các con số (30 phút, 60 giây, trần tốc độ, 4 KB, 1 KB) là đề xuất, chưa đo.

---

## 0. Tóm tắt

- Đăng ký không còn nhận mật khẩu. Mật khẩu chỉ được đặt sau khi xác minh OTP, trong phiên tạm `osid` (30 phút).
- Bốn trạng thái: `pending_verification`, `verified_no_password`, `active`, `onboarded`. Không thêm cột provider. Trạng thái suy ra từ `email_verified_at`, `password_hash` và `onboarding_step`.
- Phiên tạm dùng cookie riêng `osid` với `Path=/api/auth`. Service văn phòng chỉ nhận `sid`. `/api/auth/me` từ chối `osid`.
- Hồ sơ nhân vật đặt trong auth service dưới `/api/auth/profile/*` ở giai đoạn này (lý do ở mục 4).
- Sửa một lỗ hổng: hiện `register` ghi `password_hash` ngay cả khi email chưa xác minh (index.js:106). Người đăng ký trước có thể đăng nhập bằng mật khẩu của họ sau khi chủ email xác minh. Thiết kế mới không ghi hash trước khi xác minh. Migration xóa hash cũ của tài khoản chưa xác minh.
- OAuth hiện đang tắt (ghi chú "để sau" trong memory dự án). Các chuyển trạng thái OAuth (T10, T11) vẫn được ghi để khi bật lại không phải sửa thiết kế.

---

## Hiện trạng (đã đọc)

| Điểm | Vị trí | Ghi chú cho thiết kế |
|---|---|---|
| `register` nhận password và ghi hash ngay, kể cả khi chưa xác minh | index.js:81-133, ghi đè ở dòng 106 | Lỗ hổng pre-hijack (xem tóm tắt) |
| `verify` đặt cookie `sid` đầy đủ ngay sau OTP | index.js:147-148 | Đổi thành phiên tạm |
| `verify` trả 409 "đã xác minh" trước khi kiểm OTP | index.js:140-142 | Lộ email đã tồn tại |
| `register` trả 409 khi đã xác minh, 429 khi vừa gửi OTP | index.js:98, 101 | Lộ email đã tồn tại |
| `login` với user không có hash trả 400 "đăng nhập bằng Google/Microsoft" trước khi kiểm mật khẩu | index.js:176-178 | Lộ loại tài khoản |
| `login` chưa xác minh trả 403 và gửi OTP | index.js:187-199 | Đổi theo T6 |
| Bộ đếm đăng nhập sai nằm trong bộ nhớ (`loginFails`) | auth.js:186 | Mất khi khởi động lại |
| `express.json` giới hạn 16 KB toàn cục | index.js:40 | Hạ xuống 4 KB (mục 3.0) |
| Dựng lại bảng `users` dùng danh sách cột cố định | db.js:76-90, `cols` ở dòng 77 | Cột mới phải xử lý đúng, xem 9.3 |
| `sessionUser` không lọc theo scope | auth.js:64-78 | Thêm điều kiện `scope = 'full'` |
| Service văn phòng gọi `/api/auth/me` và forward toàn bộ header Cookie | services/it/src/auth.js:18, 24 (cùng mẫu ở games, karaoke, events) | `/me` phải tự từ chối phiên tạm |
| bcryptjs 2.4.3 chỉ dùng 72 byte đầu của mật khẩu | services/auth/package.json | Xem D8 |
| Không có `src/avatar/appearance.ts`, không có `normalizeAppearance` | src/ | Phải viết mới, mục 2.2 |
| Không có socket cho avatar, chưa có presence | toàn repo | Đồng bộ bằng poll trước, mục 5 |
| Gateway chỉ nghe 127.0.0.1:18080, truy cập qua SSH tunnel | gateway.conf:1-2, 13 | Mọi request có cùng IP nguồn, nên rate limit theo IP không có ý nghĩa |
| Mã OTP được in ra log khi `MAIL_MODE=log` | services/auth/mailer.js, nhánh log của `sendOtp` | Chấp nhận, chỉ ở chế độ log |

---

## 1. Trạng thái tài khoản

### 1.1 Định nghĩa

| Trạng thái | Điều kiện trong bảng users | onboarding_step | Phiên hợp lệ |
|---|---|---|---|
| pending_verification | `email_verified_at IS NULL` | `'password'` (mặc định, chưa có nghĩa) | không |
| verified_no_password | `email_verified_at NOT NULL` và `password_hash IS NULL` và step = `'password'` | `'password'` | chỉ `osid`, qua verify |
| active | có credential (`password_hash`, hoặc đăng nhập OAuth) và step = `'appearance'` | `'appearance'` | `sid` |
| onboarded | step thuộc `('tour','done')` | `'tour'` hoặc `'done'` | `sid` |

Quy tắc suy trạng thái: step = `'password'` với email đã xác minh luôn nghĩa là chưa có mật khẩu và chưa đăng nhập OAuth. Tài khoản OAuth được đặt step = `'appearance'` ngay khi tạo, nên không cần cột provider để phân biệt OAuth-only với verified_no_password.

Bất biến cần test:
- I1: step = `'password'` và `email_verified_at NOT NULL` thì `password_hash IS NULL`.
- I2: step thuộc `('appearance','tour','done')` thì `email_verified_at NOT NULL`.
- I3: tài khoản OAuth mới không bao giờ có step = `'password'`.
- I4: `appearance` không NULL chỉ khi `json_valid` và đã qua chuẩn hoá (mục 2.2).

### 1.2 Sơ đồ

```
[không có] --register--> pending_verification
pending_verification --verify đúng OTP (cấp osid)--> verified_no_password
verified_no_password --POST /password (đổi osid lấy sid)--> active (step=appearance)
active --POST /profile/onboarding/complete--> onboarded (step=tour)
onboarded --POST /profile/onboarding/tour-done--> onboarded (step=done)
[không có] | pending | verified_no_password --OAuth thành công--> active (step=appearance)
```

### 1.3 Bảng chuyển trạng thái

Mỗi lỗi có `code` ổn định để frontend xử lý. Trường `error` tiếng Việt vẫn có như hiện tại.

| # | Từ → đến | Sự kiện và điều kiện | Endpoint | Thành công | Lỗi trả về |
|---|---|---|---|---|---|
| T1 | không có → pending | email hợp lệ, name ≥ 2 ký tự, chưa có user | POST /api/auth/register | 201 | 400 `invalid_input`; 502 `mail_failed` (chỉ khi gửi đồng bộ, xem 3.1) |
| T2 | pending → pending | đăng ký lại hoặc gửi lại; cập nhật name, tenant; xóa hash cũ | POST /register, POST /resend | 201 / 200 | 429 `otp_wait` (kèm `retryAfter`); 429 `rate_limited` |
| T3 | pending hoặc verified_no_password → verified_no_password | OTP đúng, chưa hết hạn, attempts < 5; step = `'password'` | POST /api/auth/verify | 200, đặt cookie `osid` | 400 `invalid_code` (mọi lỗi dùng chung); 429 `otp_locked` |
| T4 | verified_no_password → active | `osid` hợp lệ, step = `'password'`, mật khẩu hợp lệ; cập nhật có điều kiện trên step | POST /api/auth/password | 200, đổi `osid` lấy `sid` | 401 `onboarding_session`; 400 `invalid_input`; 409 `step_conflict`; 429 `onboarding_locked` |
| T5 | verified_no_password → không đổi | login khi chưa có mật khẩu | POST /api/auth/login | không tạo phiên | 409 `password_setup_required` (kèm `onboardingStep`, `resendInSeconds`) |
| T6 | pending → không đổi | login khi chưa xác minh (không có hash) | POST /api/auth/login | không | 401 `invalid_credentials`, không gửi OTP |
| T7 | active hoặc onboarded → không đổi | mật khẩu đúng, không bị khóa | POST /api/auth/login | 200, cấp `sid` | 401 `invalid_credentials`; 429 `login_locked` |
| T8 | active → onboarded (tour) | `sid`; step = `'appearance'`; `appearance` không NULL | POST /api/auth/profile/onboarding/complete | 200 | 409 `step_conflict`; 409 `appearance_missing`; 401 `unauthenticated` |
| T9 | onboarded (tour) → onboarded (done) | `sid`; step = `'tour'` | POST /api/auth/profile/onboarding/tour-done | 200 | 409 `step_conflict`. Gọi khi đã `done`: 200 (idempotent) |
| T10 | không có / pending / verified_no_password → active | OAuth thành công; email chưa có tài khoản hoặc chưa có mật khẩu | GET /api/auth/oauth/{provider}/callback | 302 về `/`, cấp `sid` | 400 (state hết hạn, như hiện tại); 409 `email_exists` (Microsoft work trùng email, index.js:255-259) |
| T11 | active hoặc onboarded → không đổi | OAuth với tài khoản đã có | callback | 302, cấp `sid` | như T10 |
| T12 | mọi trạng thái → mọi trạng thái | đăng xuất | POST /api/auth/logout | 200, xóa `sid` và `osid` | không |
| T13 | `osid` → hết hiệu lực | quá 30 phút, hoặc POST /password sai quá 5 lần | tự động | `purgeExpired` xóa, hoặc thu hồi | 401 `onboarding_session` |

Ghi chú T10: OAuth tạo tài khoản mới với `password_hash` NULL, `email_verified_at` = now, step = `'appearance'`. Với tài khoản pending, `signInOAuthUser` đã xóa hash (auth.js:126). Cần thêm: nếu step = `'password'` thì đặt thành `'appearance'`. Đây là thay đổi code, không chỉ là dữ liệu. Hiện `signInOAuthUser` không đụng vào step.

---

## 2. Schema

### 2.1 Cột và bảng mới

```sql
-- users: thêm vào USERS_COLUMNS (DB mới) và addColumnIfMissing (DB cũ)
onboarding_step TEXT CHECK (onboarding_step IS NULL OR onboarding_step IN ('password','appearance','tour','done')),
appearance      TEXT CHECK (appearance IS NULL OR json_valid(appearance)),  -- JSON đã chuẩn hoá, tối đa 1 KB
tour_done_at    INTEGER,                                                    -- ms epoch; NULL = chưa xong tour

-- sessions
scope    TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','onboarding')),
attempts INTEGER NOT NULL DEFAULT 0,   -- số lần POST /password sai trong phiên tạm

-- bộ đếm cửa sổ cố định (mới)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,         -- ví dụ 'otp_send:email:<sha256(email)>'
  count      INTEGER NOT NULL,
  window_end INTEGER NOT NULL          -- ms epoch
);
```

Khóa bucket dùng sha256 của email để bảng đếm không chứa email thô.

### 2.2 Chuẩn hoá appearance (module mới)

Chưa có `src/avatar/appearance.ts`. Đặt mới tại `services/auth/appearance.js`, không phụ thuộc DB, để sau này chuyển sang service profile nếu cần (mục 4).

- Hàm `normalizeAppearance(input)` trả `{ value, warnings }`. Lỗi kiểu ném kèm `path`.
- Trường được phép: `v`, `body`, `skin`, `face`, `eyes`, `hair` (`style`, `color`), `shirt`, `vest`, `bottom`, `shoes`, `acc` (mảng), `theme`. Khóa khác (kể cả `role`, `department`, `id`, `tenant_id`, `email`, `password_hash`) bị bỏ qua và ghi vào `warnings` với `reason: 'ignored_field'`. Không phải lỗi, không bao giờ được ghi xuống DB.
- Danh mục id: `services/auth/avatar-catalog.json` (mới). Chưa có manifest, vì AVATAR_SPEC mục 7.2 do build tạo ra. Giai đoạn đầu dùng danh mục tay theo bước 1 của AVATAR_SPEC mục 2.2. Id lạ được thay bằng mặc định của lớp và ghi `warnings` với `reason: 'unknown_id'` (theo AVATAR_SPEC mục 7.1 và 7.3).
- Mặc định mỗi lớp: phần tử đầu tiên trong danh mục.
- Màu khớp `^#[0-9A-Fa-f]{6}$`. Không khớp: 400 `invalid_input`, không dùng mặc định, vì không có mặc định hợp lý.
- `acc`: tối đa 6 phần tử. Quá 6: 400. Trùng lặp: loại bỏ.
- `v` phải bằng 1. Khác: 400 `unsupported_version`.
- Kích thước: body HTTP tối đa 4 KB (mục 3.0). JSON sau chuẩn hoá tối đa 1 KB, vượt: 400.
- Đầu ra có thứ tự khóa cố định, để ETag ổn định (mục 5).

Ví dụ đầu ra sau chuẩn hoá (lấy từ ví dụ AVATAR_SPEC mục 7.1):

```json
{"v":1,"body":"body-a","skin":"S3","face":"face-01","eyes":"eye-03","hair":{"style":"H03","color":"#3B2A1F"},"shirt":"shirt-white","vest":"vest-navy","bottom":"pants-tailored","shoes":"shoes-oxford-01","acc":["glasses-round-01"],"theme":"office-a"}
```

---

## 3. API auth (cổng 3001, prefix /api/auth)

### 3.0 Quy ước chung

- Mọi phản hồi có `ok`. Lỗi: `{ok:false, code, error}`.
- `Content-Type` phải là `application/json`. Body không đúng kiểu coi như thiếu trường (400).
- `express.json` giới hạn 4 KB toàn cục (đổi từ 16 KB). Body hợp lệ đều dưới 1 KB.
- `Cache-Control: no-store` là mặc định cho `/api/auth` (index.js:41-44). Riêng GET profile dùng `private, no-cache` để ETag có tác dụng (mục 5).
- Cookie:

| Cookie | Giá trị | Path | Max-Age | Ai đọc |
|---|---|---|---|---|
| `sid` | phiên đầy đủ, scope `full` | `/` | 604800 (như hiện tại) | `/me`, `/login`, `/profile/*`; service văn phòng qua `/me` |
| `osid` | phiên tạm, scope `onboarding` | `/api/auth` | 1800 | `/onboarding`, `/password`, `/logout` |

Cả hai: `HttpOnly`, `SameSite=Lax`, thêm `Secure` khi `COOKIE_SECURE=true`. Token 32 byte base64url, DB chỉ lưu sha256 (như hiện tại). Tạo token mới khi đổi phiên (chống session fixation).

### 3.1 POST /api/auth/register

Body: `{email, name}`. Trường `password` bị bỏ qua và không bao giờ được lưu. Trong giai đoạn chuyển đổi, nếu frontend cũ vẫn gửi `password` thì bỏ qua và ghi log cảnh báo, không ghi giá trị.

Hành vi theo trạng thái hiện tại của email:

| Trạng thái hiện tại | Thay đổi DB | Gửi OTP | Phản hồi |
|---|---|---|---|
| không có | INSERT pending: hash NULL, step `'password'`, tenant | có | 201 `{ok, needsVerification:true, email, tenant}` |
| pending | cập nhật name và tenant; xóa hash còn sót | có, nếu đã qua 60 giây | 201 cùng dạng; trong 60 giây: 429 `otp_wait` |
| verified_no_password | không đổi name | có, nếu đã qua 60 giây | 201 cùng dạng |
| active, onboarded, OAuth-only | không đổi gì | không | 409 `{ok:false, code:'account_exists', error:'Email này đã có tài khoản. Hãy đăng nhập.'}` |

Trade-off, theo yêu cầu "409 nhưng không lộ trạng thái khác":

- Phương án A (đúng như yêu cầu, mặc định trong bảng): chỉ tài khoản active nhận 409. Kẻ tấn công biết được email nào đã active. Không lộ thêm trạng thái nào khác, vì pending và verified_no_password nhận 201 như email mới.
- Phương án B (khuyến nghị, D2): luôn 201 với cùng nội dung. Với tài khoản active thì không gửi OTP mà gửi một email thông báo "Email này đã có tài khoản, hãy đăng nhập". Phản hồi không còn là oracle.
- Dù chọn A hay B, thời gian phản hồi vẫn lộ: nhánh gửi mail mất hàng trăm mili giây (SMTP), nhánh 409 không mất. Cách xử lý: gửi mail bất đồng bộ (không `await`) ở mọi nhánh. Đổi lại, mất phản hồi 502 `mail_failed` ngay lập tức; người dùng bấm gửi lại.

Lỗi: 400 `invalid_input` (email sai định dạng, name dưới 2 ký tự), 429 `otp_wait` (`retryAfter` tính bằng giây), 429 `rate_limited` (mục 6.3), 409 `account_exists`, 502 `mail_failed` (chỉ khi gửi đồng bộ).

### 3.2 POST /api/auth/verify

Body: `{email, code}`, `code` gồm 6 chữ số.

Thứ tự kiểm tra, không để lộ trạng thái email:
1. Định dạng `code`. Sai: 400 `invalid_input`.
2. Số lần nhập sai trong giờ của email (bucket `verify_fail`). Vượt 10: 429 `otp_locked`.
3. `checkOtp`: mã đúng, chưa hết hạn, attempts < 5. Sai: 400 `invalid_code`, tăng bộ đếm.
4. Tìm user. Không có, hoặc step khác `'password'`, hoặc đã có mật khẩu: 400 `invalid_code`, cùng thông điệp và thời gian gần đúng như các nhánh trên. Thực tế không có OTP hợp lệ cho các trường hợp này, nhưng kiểm tra để chắc.
5. Đặt `email_verified_at` nếu đang NULL (giữ nguyên nếu đã có). Xóa `osid` cũ của user. Tạo `osid` mới (scope `onboarding`, hết hạn sau 30 phút). Xóa OTP đã dùng.

Thành công: 200 `{ok:true, onboardingStep:'password', email}` và `Set-Cookie: osid`.

Khác với hiện tại: không còn cấp `sid`, không còn 409 "đã xác minh" (index.js:142).

Thiết kế phiên tạm (D3):
- Là một dòng trong `sessions` với `scope='onboarding'`, `expires_at = now + 30 phút`. Không gia hạn, không trượt.
- Chỉ dùng cho ba việc: đặt mật khẩu (POST /password), xem trạng thái (GET /onboarding), đăng xuất.
- Không có quyền với endpoint nào khác (mục 6.1).
- Khi mật khẩu được đặt, dòng `osid` bị xóa và thay bằng `sid` mới.

### 3.3 POST /api/auth/resend

Body `{email}`. Luôn 200 `{ok:true}` (như hiện tại). Chỉ gửi OTP khi email là pending hoặc verified_no_password, đã qua 60 giây, và chưa vượt trần mục 6.3. Không trả thông tin gì về trạng thái.

### 3.4 GET /api/auth/onboarding

Chỉ đọc `osid`. Dùng để tải lại trang đặt mật khẩu khi người dùng làm mới trang.

- 200 `{ok:true, email, onboardingStep:'password', expiresAt}`.
- 401 `onboarding_session` khi không có `osid`, hết hạn, hoặc đã dùng xong.
- Chỉ có `sid`: 401. Phiên đầy đủ không dùng endpoint này.

### 3.5 POST /api/auth/password

Body `{password}`. Yêu cầu `osid` hợp lệ và step = `'password'`.

Kiểm tra theo thứ tự:
1. Không có `osid`, hoặc hết hạn: 401 `onboarding_session`.
2. Tài khoản không ở step `'password'` (ví dụ đã đặt rồi): 409 `step_conflict`.
3. Mật khẩu:
   - Là chuỗi, dài 10 đến 128 ký tự (đếm theo code point, `[...pw].length`).
   - Không trùng email (so sánh không phân biệt hoa thường).
   - Nếu chọn D8 phương án (i): không quá 72 byte UTF-8.
   - Sai: 400 `invalid_input`, tăng `sessions.attempts`. Khi đạt 5: xóa phiên, 429 `onboarding_locked`.
4. Transaction:
   - Băm bcrypt (cost 12, như hiện tại) trước khi vào transaction.
   - `UPDATE users SET password_hash = ?, onboarding_step = 'appearance' WHERE id = ? AND onboarding_step = 'password' AND email_verified_at IS NOT NULL`. Nếu số dòng khác 1: rollback, 409 `step_conflict`. Điều kiện trên step là chống gửi trùng.
   - `DELETE FROM sessions WHERE token_hash = sha256(osid)`.
   - INSERT phiên đầy đủ (scope `full`, 7 ngày).
5. Đặt cookie `sid`, xóa cookie `osid`.

Thành công: 200 `{ok:true, onboardingStep:'appearance', user: publicUser}`.

Gửi lần hai với `osid` cũ: 401 (đã xóa). Gửi bằng `sid` mới: 409 `step_conflict`. Các ca này nằm ở mục 8.

### 3.6 POST /api/auth/login

Body `{email, password}`. Thứ tự:

1. Khóa theo email (hiện có): đang khóa, 429 `login_locked`.
2. Tra user:
   - Không có, hoặc pending (hash NULL, chưa xác minh): chạy bcrypt với `DUMMY_HASH`, trả 401 `invalid_credentials`. Không gửi OTP. Khác hiện tại (index.js:187-199, 403).
   - verified_no_password (hash NULL, step `'password'`): 409 `password_setup_required`, body `{onboardingStep:'password', email, resendInSeconds}`. Gửi OTP nếu đã qua 60 giây và chưa vượt trần. Không tạo phiên, không tính là sai mật khẩu.
   - OAuth-only (hash NULL, step khác `'password'`): 401 `invalid_credentials`. Thay cho 400 hiện tại (index.js:177). Frontend hiển thị nút Google/Microsoft dựa trên `GET /providers`.
   - Có hash: bcrypt so sánh. Sai: `recordLoginFail`, trả 401, hoặc 429 nếu vừa bị khóa.
3. Đúng: `clearLoginFails`, tạo `sid`, trả `{ok, user, onboardingStep}`. Step là `appearance`, `tour` hoặc `done`.

Cách lấy phiên tạm sau 409 (theo yêu cầu): frontend hiện ô nhập OTP. Mã vừa được gửi, hoặc người dùng đợi `resendInSeconds` rồi gọi POST /resend. Người dùng nhập mã, gọi POST /verify để nhận `osid`, rồi gọi POST /password. Không cần đăng nhập lại.

### 3.7 POST /api/auth/logout

Xóa `sid` và `osid` (mỗi cookie với Path tương ứng). Luôn 200.

### 3.8 GET /api/auth/me

Chỉ đọc `sid` có scope `full`.

- `sid` hợp lệ: 200 `{ok, user, onboardingStep, appearance}`. `appearance` là object đã parse, hoặc `null`.
- Chỉ có `osid`: 401 `{ok:false, code:'onboarding_session', error:'Đăng ký chưa hoàn tất.'}`.
- Không có gì: 401 `Chưa đăng nhập.` (như hiện tại).

`publicUser` thêm `onboardingStep`. Không bao giờ có `password_hash`, `tour_done_at`, `email` của người khác.

### 3.9 Không đổi

GET /providers, GET /health, OAuth start và callback (ngoài T10, T11).

---

## 4. Hồ sơ nhân vật: hai cách

### 4.1 So sánh

| Tiêu chí | (a) trong auth service | (b) service profile, cổng 3006 |
|---|---|---|
| Triển khai | Thêm route và module. Không thêm tiến trình, unit systemd hay service compose, không thêm cổng | Service mới theo cấu trúc it/games: cổng, compose, healthcheck, README, `AUTH_URL` |
| Gateway | Không đổi. `location /api/auth/` đã bao phủ | Thêm `location /api/profile` (không có dấu `/` cuối) |
| Trạng thái onboarding | Cùng bảng users, cùng transaction với password và step | Phải gọi auth để đổi step, hoặc ghi chéo DB. Dễ lệch trạng thái |
| Xác thực phiên | `sessionUser` trong cùng process | Gọi `AUTH_URL/api/auth/me` mỗi request (timeout 3 giây, không cache), như service khác |
| Đọc appearance của đồng nghiệp | Cùng DB, một truy vấn | HTTP tới auth, hoặc đồng bộ sang DB riêng |
| Phạm vi lỗi và tải | Auth đã nằm trên mọi đường đi. Thêm đọc avatar làm tăng tải auth | Tách được tải avatar. Auth lỗi thì profile cũng không xác thực được |
| Khớp AVATAR_SPEC mục 12 | Chưa khớp: spec ghi `services/` giữ appearance JSON và manifest | Khớp với ý định đó |
| Đường lùi | Module `appearance.js` tách sang service sau này được | Khó gộp lại nếu đã tách |

### 4.2 Khuyến nghị: (a) cho giai đoạn này

Lý do chính: step onboarding và appearance phải đổi cùng lúc với bảng users, và luồng đặt mật khẩu đã nằm trong auth. Tách ra sẽ cần một API nội bộ giữa hai service chỉ để đổi một cột. Chi phí triển khai thấp nhất, gateway không đổi, không thêm cổng.

Điều kiện để chuyển sang (b): khi có phục vụ manifest, upload asset, hoặc tải avatar làm tăng đáng kể tải auth. Khi đó:
- Tách `appearance.js` và cột/bảng appearance sang `profile.db`.
- Auth giữ `onboarding_step` và `tour_done_at`. Profile gọi auth qua API nội bộ (loopback, có secret) để đổi step.

Việc chuyển đổi là bước sau, không làm trong đợt này. Cần thống nhất với agent avatar trước (D5).

### 4.3 Endpoint (a)

Tất cả nằm dưới `/api/auth/profile`. Mọi endpoint yêu cầu `sid` (scope `full`). Thao tác ghi không nhận `userId` từ client.

| Method và đường dẫn | Mô tả | Thành công | Lỗi |
|---|---|---|---|
| GET /api/auth/profile/appearance | Appearance của chính mình | 200 `{ok, appearance, onboardingStep}` | 401 |
| PUT /api/auth/profile/appearance | Ghi appearance (body là Appearance) | 200 `{ok, appearance, warnings}` | 400 `invalid_input` (kèm `path`); 400 `unsupported_version`; 413 `payload_too_large`; 429 `rate_limited` |
| GET /api/auth/profile/appearance/:userId | Đọc công khai cho đồng nghiệp | 200 `{ok, user:{id, name, appearance}}` | 404 `not_found` (không tồn tại hoặc khác tenant: cùng một phản hồi) |
| GET /api/auth/profile/appearances?ids=1,2,3 | Đọc hàng loạt cho phòng, tối đa 100 id | 200 `{ok, items:[{id, name, appearance}]}`, có ETag | 400 nếu quá 100 id. Id khác tenant bị bỏ qua |
| POST /api/auth/profile/onboarding/complete | appearance → tour | 200 `{ok, onboardingStep:'tour'}` | 409 `step_conflict`; 409 `appearance_missing` |
| POST /api/auth/profile/onboarding/tour-done | tour → done | 200 `{ok, onboardingStep:'done'}` | 409 `step_conflict` (khi step là `appearance` hoặc `password`). Khi đã `done`: 200 (idempotent) |

Chi tiết:

- PUT: sid, rồi kiểm tra kích thước (4 KB, express), `normalizeAppearance`, kiểm 1 KB, rate limit 1 lần mỗi 5 giây theo userId, rồi `UPDATE users SET appearance = ? WHERE id = ?` với `id` lấy từ phiên. Trả bản đã chuẩn hoá và `warnings` (ví dụ `[{path:'shirt', reason:'unknown_id', used:'shirt-white'}]`).
- GET :userId: `userId` phải khớp `^\d+$`, nếu không trả 404. Điều kiện: `caller.tenant_id = target.tenant_id`. Không trả email, role, department (D13), password_hash, tour_done_at. Nếu chưa có appearance: `appearance: null`, frontend dùng mặc định.
- complete: `UPDATE users SET onboarding_step = 'tour' WHERE id = ? AND onboarding_step = 'appearance' AND appearance IS NOT NULL`. Nếu không có dòng nào được cập nhật, một SELECT trước đó quyết định trả `appearance_missing` hay `step_conflict`.
- tour-done: `UPDATE users SET onboarding_step = 'done', tour_done_at = ? WHERE id = ? AND onboarding_step = 'tour'`. Không cập nhật dòng nào: nếu step đã là `done` thì 200, ngược lại 409.

Quy tắc chung:
- Không ai sửa appearance của người khác: `userId` không bao giờ đi vào câu UPDATE.
- `role` và `department` không có trong bất kỳ câu UPDATE nào của các endpoint này. Thay đổi role và department vẫn chỉ qua `services/auth/scripts/admin.js` (dòng 29, 40).
- Không endpoint profile nào nhận cookie `osid` (mục 6.1).

---

## 5. Đồng bộ đa người chơi

Payload đồng bộ:

```json
{"userId": 12, "v": 1, "appearance": {"...": "theo mục 2.2"}}
```

Tối đa 1 KB. Không gửi mesh, texture, vị trí. Vị trí và hướng đi kênh presence riêng (AVATAR_SPEC mục 7.3, bước 5).

**Giai đoạn 1 (làm trong đợt này, không cần socket): poll.**
- Client lấy danh sách người đang hiển thị (tối đa 40, theo ngân sách ghi trong AVATAR_SPEC, mục Hiện trạng), gọi `GET /api/auth/profile/appearances?ids=...` mỗi 30 giây.
- Gửi `If-None-Match` với ETag là sha256 của JSON danh sách đã chuẩn hoá. Server trả 304 khi không đổi.
- Không poll toàn bộ danh sách nhân viên. Chỉ poll người trong vùng nhìn thấy.

**Giai đoạn 2 (bước sau, repo chưa có socket): sự kiện `avatar:changed`.**
- Server phát sự kiện sau khi UPDATE đã commit. Không phát khi PUT bị từ chối.
- Client vào phòng: lấy snapshot qua `/appearances`, rồi nhận sự kiện qua socket.
- Client áp dụng sự kiện theo thứ tự nhận. Bỏ qua khi `v` không hỗ trợ. Id lạ: dùng mặc định và ghi log.
- Giới hạn PUT (1 lần mỗi 5 giây) áp dụng trước khi phát, nên một người không spam được sự kiện.
- Nếu cần thứ tự tuyệt đối giữa các lần ghi của cùng một người, thêm cột `appearance_rev`. Không làm trong đợt này.

Cache: build theo hash của base body (AVATAR_SPEC mục 7.3, bước 2). Không lưu appearance trong localStorage.

---

## 6. Bảo mật

### 6.1 Ma trận phạm vi phiên

| Đích | `sid` hợp lệ | Chỉ `osid` | Không cookie |
|---|---|---|---|
| GET /api/auth/me | 200 | 401 `onboarding_session` | 401 |
| GET /api/auth/onboarding | 401 | 200 | 401 |
| POST /api/auth/password | 409 `step_conflict` (đã đặt) | 200 (T4) | 401 |
| /api/auth/profile/* | 200 | 401 | 401 |
| POST /api/auth/logout | xóa `sid` | xóa `osid` | 200 |
| it, games, karaoke, events (qua `AUTH_URL/api/auth/me`) | 200 | 401 | 401 |
| /api/it/*, /api/games/*, ... trên gateway | theo service | trình duyệt không gửi `osid` ngoài `/api/auth` | 401 |

Ba lớp bảo vệ:

1. Tên cookie khác nhau và `Path=/api/auth`. Trình duyệt không gửi `osid` tới `/api/it`, `/api/games`, và các đường dẫn khác. Service văn phòng chỉ nhận header Cookie do gateway chuyển tiếp từ trình duyệt.
2. Server: `sessionUser` lọc `scope = 'full'`. `/me` không bao giờ trả user cho `osid`. Phiên tạm chỉ được đọc bởi hàm riêng `readOnboardingSid()`, dùng cho mục 3.4, 3.5 và 3.7.
3. Hợp đồng test: mọi service văn phòng, khi `/me` nhận header chỉ có `osid`, phải trả 401. Dù service forward toàn bộ header Cookie (services/*/src/auth.js:18), `/me` vẫn từ chối.

Không cần sửa mã service văn phòng. Chỉ thêm test hợp đồng (K-SVC, mục 8).

### 6.2 Chống dò email

| Endpoint | Tín hiệu có thể dò | Biện pháp | Phần còn lại |
|---|---|---|---|
| register | 409 chỉ với active; 429 trong 60 giây | Phương án B (D2); gửi mail bất đồng bộ | Phương án A còn lộ active |
| verify | không có. Mọi lỗi dùng chung một thông điệp | Kiểm OTP trước, không tiết lộ user | không |
| login | 409 cho verified_no_password; 401 cho các trường hợp khác | Dummy bcrypt; trần gửi OTP (6.3) | lộ "đã xác minh, chưa có mật khẩu" (D4) |
| resend | không có | luôn 200 | không |
| thời gian phản hồi | nhánh gửi mail chậm | gửi bất đồng bộ; dummy bcrypt | chênh lệch nhỏ từ DB |

### 6.3 Giới hạn tốc độ

| Mục | Giới hạn | Khóa | Lưu ở |
|---|---|---|---|
| Gửi OTP cho một email | 60 giây giữa hai lần (giữ nguyên); tối đa 5 lần mỗi giờ | sha256(email) | `rate_limits` |
| Gửi OTP toàn hệ thống | 60 lần mỗi phút (cầu dao chống bão mail) | hằng số | `rate_limits` |
| Nhập sai OTP | 5 lần mỗi mã (giữ nguyên); 10 lần mỗi giờ cho mỗi email (mới) | sha256(email) | `rate_limits` và `otp_codes` |
| Đặt mật khẩu sai | 5 lần mỗi phiên tạm, sau đó thu hồi `osid` | id phiên | `sessions.attempts` |
| Đăng nhập sai | 5 lần mỗi 15 phút (giữ nguyên) | email | bộ nhớ hiện tại. Đề xuất chuyển sang `rate_limits` (D14) |
| PUT appearance | 1 lần mỗi 5 giây | userId | `rate_limits` |
| Theo IP | không dùng làm khóa chính | | gateway chỉ thấy 127.0.0.1 (mục 0) |

Cửa sổ cố định: `window_end = now + W`. Khi vượt `window_end` thì đặt lại `count`. `purgeExpired` dọn các dòng đã hết cửa sổ.

### 6.4 Log và dữ liệu nhạy cảm

- Không log password, hash, token, cookie. Không log body của register, verify, login, password.
- Mã OTP chỉ xuất hiện trong log khi `MAIL_MODE=log`. Khi `MAIL_MODE=smtp`, không log mã.
- Lỗi mail: chỉ log `err.code` (như index.js:63).
- Nếu sau này thêm middleware log, phải bỏ qua body của mọi route `/api/auth`.

### 6.5 Khác

- Mass assignment: whitelist trong `normalizeAppearance`. Các câu UPDATE liệt kê cột cụ thể.
- Session fixation: `sid` mới khi login và khi POST /password. `osid` mới ở mỗi lần verify.
- Pre-hijack: không ghi hash trước khi xác minh. Register không còn nhận password. Migration xóa hash cũ của tài khoản chưa xác minh.
- CSRF: `SameSite=Lax` và yêu cầu `application/json`. Form cross-site không gửi được JSON nếu không qua preflight.
- Mật khẩu: bcrypt cost 12 như hiện tại. Xem D8 về 72 byte. Kiểm tra mật khẩu phổ biến là tùy chọn.

---

## 7. Gateway (deploy/nginx/gateway.conf, chỉ đọc)

Phương án (a), không cần sửa: `location /api/auth/` (gateway.conf:38) đã bao phủ mọi endpoint mới. Không có endpoint nào đúng bằng `/api/auth` (không có dấu `/`), nên không xảy ra 301 làm mất POST.

Phương án (b), nếu chọn service profile:

```nginx
    # profile: hồ sơ nhân vật (3006). Không có dấu / cuối để /api/profile và /api/profile/... đều được proxy,
    # tránh 301 làm mất method POST.
    location /api/profile {
        proxy_pass http://127.0.0.1:3006;
    }
```

Đặt trước `location /api/`. Thêm `AUTH_URL=http://127.0.0.1:3001` vào môi trường của service profile.

Lưu ý chung:
- `client_max_body_size 1m` toàn cục (gateway.conf:17) đã đủ. Giới hạn 4 KB do service áp.
- Không thêm `limit_req` theo IP: mọi request đến từ 127.0.0.1 (lý do ở mục 0). Nếu cần cầu dao toàn cục, dùng zone theo `$server_name`. Không bắt buộc.
- Gateway không cache. Các GET profile phải đặt `Cache-Control: private, no-cache` ở app, ghi đè `no-store` mặc định (index.js:41-44) đúng cho các route đó.

---

## 8. Kiểm thử

Chạy bằng `node:test` và `fetch`, server trên cổng ngẫu nhiên, DB tạm, `MAIL_MODE=log` hoặc mock `sendOtp`. Không thêm dependency. Không chạy trong phiên thiết kế này.

| Nhóm | Ca | Mong đợi |
|---|---|---|
| Register | K1: email mới, body có password | 201; hash NULL; step `'password'`; có OTP; password không được lưu |
| | K2: đăng ký lại pending trong 60 giây | 429 `otp_wait`; không gửi mail |
| | K3: đăng ký lại pending sau 60 giây | 201; OTP mới; OTP cũ không dùng được |
| | K4: đăng ký lại pending, có hash cũ | name cập nhật; hash bị xóa |
| | K5: verified_no_password | 201; có gửi OTP; name không đổi |
| | K6: email active | 409 `account_exists`; không mail; DB không đổi |
| | K7: OAuth-only | 409 như K6; không mail |
| | K8: mail lỗi (đồng bộ) | 502. Với gửi bất đồng bộ: 201 và log lỗi |
| | K9: email sai định dạng; name 1 ký tự | 400 |
| | K10: vượt trần gửi OTP trong giờ | 429 `rate_limited` |
| Verify | K11: OTP đúng | 200; `osid` có `Path=/api/auth`, `Max-Age=1800`; không có `sid` |
| | K12: sai 5 lần | 429 `otp_locked`; mã bị vô hiệu |
| | K13: OTP hết hạn | 400 `invalid_code` |
| | K14: email active, mã bất kỳ | 400 `invalid_code`; cùng thông điệp và thời gian với K12 |
| | K15: email không tồn tại | như K14 |
| | K16: verify lần hai khi đã có `osid` | `osid` cũ bị thay thế |
| Password | K17: 10 ký tự hợp lệ | 200; step `'appearance'`; hash bắt đầu bằng `$2`; có `sid` mới; `osid` bị xóa |
| | K18: 9 ký tự; 129 ký tự | 400; `attempts` tăng |
| | K19: trùng email (khác hoa thường) | 400 |
| | K20: sai 5 lần | 429 `onboarding_locked`; `osid` không dùng được |
| | K21: hai request song song | một 200, một 401 hoặc 409; DB chỉ có một hash |
| | K22: gửi lần hai bằng `osid` cũ | 401 `onboarding_session` |
| | K23: gửi bằng `sid` sau khi đã đặt | 409 `step_conflict` |
| | K24: `osid` quá 30 phút (đồng hồ giả) | 401; `purgeExpired` xóa dòng |
| | K25: tiếng Việt, khoảng 40 ký tự nhưng trên 72 byte | theo D8: 400, hoặc chấp nhận. Không cắt âm thầm |
| Login | K26: pending | 401; không mail |
| | K27: verified_no_password | 409 `password_setup_required`; có `resendInSeconds`; có mail nếu đủ 60 giây; không tăng bộ đếm sai |
| | K28: OAuth-only | 401 |
| | K29: active, đúng | 200; có `sid`; có `onboardingStep` |
| | K30: sai 5 lần | 429 `login_locked` |
| | K31: onboarded (tour), đúng | 200; `onboardingStep` là `'tour'` |
| OAuth | K32: email mới qua Google | active; step `'appearance'`; hash NULL; có `sid`; 302 về `/` |
| | K33: pending, Google cùng email | verified; hash NULL; step `'appearance'` |
| | K34: verified_no_password, Google cùng email | step `'appearance'`; không yêu cầu mật khẩu |
| | K35: Microsoft work trùng email | 409; không liên kết |
| | K36: dùng lại state | 400 |
| Hồ sơ | K37: PUT hợp lệ | 200; trả bản đã chuẩn hoá |
| | K38: `role`, `department`, `tenant_id` trong body | bị bỏ qua; DB không đổi; `warnings` có `ignored_field` |
| | K39: id lạ; màu sai; `acc` 7 phần tử | id lạ: mặc định và warning; màu sai và `acc` quá 6: 400 |
| | K40: body trên 4 KB | 413 |
| | K41: PUT hai lần trong 5 giây | 429 |
| | K42: GET :userId khác tenant | 404, giống userId không tồn tại |
| | K43: GET :userId của đồng nghiệp | 200; không có email, role, department |
| | K44: PUT bằng `osid` | 401 |
| | K45: complete khi chưa có appearance | 409 `appearance_missing` |
| | K46: complete đúng | 200; step `'tour'` |
| | K47: tour-done khi step là appearance | 409 `step_conflict` |
| | K48: tour-done hai lần | lần hai 200; `tour_done_at` không đổi |
| Phân quyền | K-SVC: it, games, karaoke, events với chỉ `osid` | 401 |
| | K-ME: `/me` với chỉ `osid` | 401 `onboarding_session` |
| Đồng bộ | K49: GET batch có ETag | 304 khi không đổi; 200 sau PUT |
| Migration | K50: DB rỗng | schema mới đủ cột và bảng |
| | K51: DB hiện tại (password nullable, chưa có cột mới) | cột mới được thêm; backfill đúng; dữ liệu cũ còn nguyên |
| | K52: DB rất cũ (password NOT NULL) | dựng lại; cột mới không bị mất (mục 9.3) |
| | K53: chạy migration hai lần | không lỗi; không đổi dữ liệu |
| | K54: legacy đã xác minh có hash | step `'done'`; `tour_done_at` có giá trị |
| | K55: legacy chưa xác minh có hash | hash NULL; step `'password'` |
| | K56: legacy đã xác minh không hash (OAuth cũ) | step `'done'` (D7) |

---

## 9. Migration và rollback

### 9.1 Thứ tự triển khai

1. Dừng auth (SIGTERM, `server.close`). Mọi service văn phòng phụ thuộc auth, nên có thời gian ngừng ngắn. Dừng để bản sao lưu nhất quán với WAL.
2. Sao lưu `services/auth/data/app.db`, `app.db-wal`, `app.db-shm` (nếu có) ra thư mục ngoài repo, kèm ngày giờ. Trên bản sao chạy `PRAGMA integrity_check`.
3. Triển khai auth mới cùng bản frontend mới (D1). Phải cùng một đợt, vì verify không còn trả `sid`. Migration chạy khi khởi động.
4. Kiểm tra sau triển khai: `/api/health`; đăng ký thử bằng email test với `MAIL_MODE=log`; đăng nhập tài khoản đã xác minh cũ; `/me`; một service văn phòng vẫn đọc được phiên đầy đủ.
5. Sau đó mới bật OAuth.

### 9.2 Migration (db.js)

Dùng mẫu `addColumnIfMissing` có sẵn (db.js:66-74), tức là kiểm tra `PRAGMA table_info` trước khi `ALTER TABLE ADD COLUMN`. Thứ tự trong file:

1. `CREATE TABLE IF NOT EXISTS` cho DB mới đã có cột mới (cập nhật `USERS_COLUMNS` và định nghĩa sessions).
2. Dựng lại `users` nếu `password_hash` còn NOT NULL (db.js:99-102), như hiện tại.
3. Thêm cột mới và tạo `rate_limits`, mỗi cột qua `addColumnIfMissing`.
4. Backfill trong một transaction.

```sql
-- Bước 3 (qua addColumnIfMissing, chỉ khi PRAGMA table_info chưa có cột):
ALTER TABLE users ADD COLUMN onboarding_step TEXT CHECK (onboarding_step IS NULL OR onboarding_step IN ('password','appearance','tour','done'));
ALTER TABLE users ADD COLUMN appearance TEXT CHECK (appearance IS NULL OR json_valid(appearance));
ALTER TABLE users ADD COLUMN tour_done_at INTEGER;
ALTER TABLE sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','onboarding'));
ALTER TABLE sessions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, window_end INTEGER NOT NULL);

-- Bước 4: backfill, idempotent (chỉ tác động dòng onboarding_step IS NULL)
-- (1) chưa xác minh: xóa mật khẩu đặt trước khi xác minh (pre-hijack)
UPDATE users SET password_hash = NULL, onboarding_step = 'password'
 WHERE email_verified_at IS NULL AND onboarding_step IS NULL;
-- (2) đã xác minh, có mật khẩu: đã xong onboarding (D7)
UPDATE users SET onboarding_step = 'done', tour_done_at = :now
 WHERE email_verified_at IS NOT NULL AND password_hash IS NOT NULL AND onboarding_step IS NULL;
-- (3) đã xác minh, không mật khẩu (OAuth cũ): cũng 'done' (D7)
UPDATE users SET onboarding_step = 'done', tour_done_at = :now
 WHERE email_verified_at IS NOT NULL AND password_hash IS NULL AND onboarding_step IS NULL;
```

Ghi chú:
- `ALTER TABLE ... ADD COLUMN ... NOT NULL` cần DEFAULT khác NULL. Cột `scope` có DEFAULT `'full'`.
- Ràng buộc CHECK trong cột thêm mới được kiểm trên các dòng đã có. Cần SQLite từ 3.37 trở lên. better-sqlite3 11.7.0 đi kèm bản mới hơn, nhưng cần xác nhận bằng `SELECT sqlite_version()` trước khi triển khai.
- Bước 3 và 4 chạy trong `db.transaction(...)()`. DDL trong SQLite là transactional, nên lỗi giữa chừng không để lại trạng thái nửa vời. Bước 2 nằm ngoài transaction vì `PRAGMA foreign_keys` không đổi được trong transaction, như code hiện tại.
- `:now` là `Date.now()` truyền từ JS.
- Fresh DB: `USERS_COLUMNS` (db.js:14-24) và định nghĩa sessions phải có các cột mới, để DB mới và DB được migrate giống nhau.

### 9.3 Lỗi cần tránh: dựng lại bảng

`db.js:77` liệt kê cột cố định cho `INSERT ... SELECT` khi dựng lại `users`. Nếu cột mới được thêm trước khi dựng lại, các cột này sẽ bị bỏ khỏi bảng mới. Hai cách, chọn một:
- Giữ thứ tự: dựng lại (bước 2) trước khi thêm cột mới (bước 3). Đây là cách khuyến nghị.
- Hoặc thêm `onboarding_step`, `appearance`, `tour_done_at` vào `cols` (db.js:77).

Ca K52 kiểm tra đúng lỗi này.

### 9.4 Rollback

- Thay đổi schema chỉ thêm cột và thêm bảng, không đổi cột cũ. Code cũ chạy được trên DB mới: câu INSERT của code cũ liệt kê cột cụ thể, SELECT chọn theo tên cột, cột mới bị bỏ qua, `sessions.scope` mặc định `'full'`.
- Rollback nhanh: triển khai lại auth cũ và frontend cũ. Không cần khôi phục dữ liệu.
- Phần không đảo ngược được: backfill (1) xóa `password_hash` của tài khoản chưa xác minh. Những tài khoản này không đăng nhập được trước khi xác minh nên không ảnh hưởng người dùng đã hoàn tất, nhưng họ phải đăng ký lại. Nếu cần giữ, khôi phục từ bản sao lưu ở 9.1.
- `osid` còn trong trình duyệt: code cũ bỏ qua, hết hạn sau 30 phút.
- Chỉ rollback backend mà frontend mới đã lên: lỗi, vì verify không còn trả `sid`. Rollback phải đồng bộ cả hai.
- Khôi phục đầy đủ: dừng auth, thay `app.db` và xóa `app.db-wal`, `app.db-shm` bằng bản sao lưu, khởi động code cũ.
- Lỗi migration: transaction tự rollback. Auth không khởi động được. Triển khai code cũ (chạy được trên schema mới), rồi điều tra. Không cần khôi phục, trừ khi backfill đã commit sai.

### 9.5 File sẽ đổi khi triển khai (không làm trong phiên này)

- `services/auth/db.js`: `USERS_COLUMNS`, định nghĩa sessions, migration, `rate_limits`.
- `services/auth/auth.js`: `readOnboardingSid`, `sessionUser` (lọc scope), `createSession(userId, scope, ttl)`, `signInOAuthUser` (đặt step), bộ đếm.
- `services/auth/index.js`: register, verify, resend, login, và các route mới `onboarding`, `password`, `profile/*`. Giới hạn `express.json` 4 KB.
- `services/auth/appearance.js` và `services/auth/avatar-catalog.json`: mới.
- `services/auth/test/*.test.js`: mới.
- `deploy/nginx/gateway.conf`: không đổi với phương án (a).
- `src/auth/api.ts`, `src/auth/AuthScreen.tsx`: thuộc agent ONBOARD-UX.
- `services/{it,games,karaoke,events}/src/auth.js`: không đổi. Thêm test hợp đồng.

---

## 10. Mục cần người dùng duyệt

- **D1. Đổi hành vi đăng ký (breaking).** Register không còn nhận password. Mật khẩu đặt sau OTP. Verify không còn trả `sid`. Đề xuất: triển khai backend và frontend cùng một đợt. Ảnh hưởng: dừng auth ngắn khi migrate, và người đang dở đăng ký phải bắt đầu lại.
- **D2. Phản hồi register cho email đã active.** (A) 409 đúng như yêu cầu, lộ "đã active". (B) khuyến nghị: luôn 201, gửi email thông báo cho chủ tài khoản, không gửi OTP. Đi kèm: gửi mail bất đồng bộ (mất phản hồi 502 đồng bộ).
- **D3. Phiên tạm.** Cookie `osid` riêng, `Path=/api/auth`, 30 phút, không gia hạn. POST /password đổi `osid` lấy `sid` mới (khuyến nghị). Phương án khác: giữ `osid` đến khi xong appearance. Không khuyến nghị: khi đó profile phải chấp nhận `osid`, và người dùng bị đăng xuất giữa chừng sẽ phải nhập OTP lại.
- **D4. Login của verified_no_password.** Mặc định theo yêu cầu: 409 `password_setup_required`, kèm gửi OTP. Lộ trạng thái "chưa có mật khẩu". Khuyến nghị: 401 chung, nhất quán với D2 (B). Frontend vẫn đi được luồng vì register cho verified_no_password trả 201.
- **D5. Vị trí hồ sơ nhân vật.** (a) auth service (khuyến nghị cho đợt này) hoặc (b) service profile cổng 3006. Cần thống nhất với agent avatar: AVATAR_SPEC mục 12 ghi `services/` giữ appearance JSON và manifest. Danh mục id (`avatar-catalog.json`) cũng do agent avatar chốt.
- **D6. OAuth trên tài khoản email chưa có mật khẩu.** Đưa thẳng sang step `'appearance'` (active, không cần đặt mật khẩu). Mặc định: có.
- **D7. Tài khoản cũ.** Đã xác minh thì đánh dấu `'done'`, không ép tạo nhân vật, appearance NULL, dùng mặc định. Chưa xác minh thì xóa hash cũ, phải đăng ký lại. Cần xác nhận: có muốn ép tài khoản cũ tạo nhân vật không?
- **D8. Chính sách mật khẩu.** Giữ 10 đến 128 ký tự, nhưng bcryptjs chỉ dùng 72 byte đầu. Chọn: (i) từ chối nếu quá 72 byte UTF-8 (khuyến nghị, không cắt âm thầm), hoặc (ii) băm SHA-256 trước khi bcrypt. Kèm: có kiểm tra mật khẩu phổ biến không (mặc định: không).
- **D9. Quyền API văn phòng khi onboarding chưa xong.** Người có `sid` nhưng đang ở step `tour` có dùng được API văn phòng không? Mặc định: có. Onboarding là luồng UX, không chặn quyền.
- **D10. Login khi chưa xác minh.** Đổi từ 403 kèm gửi OTP (hiện tại) sang 401, không gửi OTP. Frontend không được dựa vào `403 needsVerification` nữa.
- **D11. Trần tốc độ.** OTP 5 lần mỗi giờ mỗi email; nhập sai 10 lần mỗi giờ mỗi email; toàn hệ thống 60 lần mỗi phút (mục 6.3). Con số là đề xuất, chưa đo.
- **D12. `/me` trả thêm appearance.** Theo yêu cầu, trả luôn. Hệ quả: mỗi request từ service văn phòng nhận thêm tối đa 1 KB, vì các service gọi `/me` không cache. Phương án: chỉ trả khi có `?include=appearance`.
- **D13. Thông tin hiển thị cho đồng nghiệp.** Mặc định: chỉ `name` và `appearance`. Có thêm `department` không?
- **D14. Bộ đếm đăng nhập sai.** Chuyển từ bộ nhớ (auth.js:186, mất khi khởi động lại) sang `rate_limits`. Đề xuất, không chặn đợt này.
- **D15. Mail bất đồng bộ cho register, login, resend.** Gộp với D2 nếu D2 chọn (B). Nếu chọn (A) vẫn nên làm để giảm chênh lệch thời gian.

---

## 11. Giới hạn của tài liệu

- Đã đọc trực tiếp: `services/auth/db.js`, `auth.js`, `index.js`, `config.js`, `mailer.js`, `package.json`; `deploy/nginx/gateway.conf`; `docs/design/AVATAR_SPEC.md` (mục Hiện trạng, 2.1-2.2, 7, 12 và phần đọc theo grep).
- Chỉ đọc qua grep: `services/{it,games,karaoke,events}/src/auth.js` (dòng 18, 24); `services/auth/scripts/admin.js` (dòng 29, 40, 59).
- Chưa đọc nội dung: `services/auth/oauth.js` (chỉ thấy phần được `index.js` dùng), `src/auth/api.ts`, `src/auth/AuthScreen.tsx` (thuộc phạm vi ONBOARD-UX), `docs/PROMPT_phong_CNTT.md`.
- Không có `src/avatar/appearance.ts` và không có `normalizeAppearance`. Mục 2.2 là đặc tả mới.
- AVATAR_SPEC mục 2.2 và mục 7.1 chưa khớp hoàn toàn về id. Ví dụ, bước 1 nêu 3 kiểu tóc (H01, H03, H05) và 3 màu mắt, trong khi ví dụ 7.1 dùng `eye-03`. Danh mục id phải do agent avatar chốt.
- Không chạy test, không chạy npm, không kiểm tra phiên bản SQLite thực tế, không đo thời gian bcrypt. Các con số (30 phút, 60 giây, trần tốc độ, 4 KB, 1 KB, 40 avatar) là đề xuất, chưa đo.
- OAuth đang tắt. Chỉ phân tích các chuyển trạng thái T10 và T11, không kiểm chứng luồng đăng nhập Google và Microsoft thực tế.
