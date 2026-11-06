# Auth service

Microservice xác thực, chạy ở cổng `3001`. Gateway proxy `/api/auth/*` tới đây. Không có route nào khác ngoài `/api/health` và `/api/auth/*`.

Thiết kế chi tiết: `docs/design/ONBOARDING_API.md`. Quyết định đã chốt: `docs/design/DECISIONS.md`.

## Chạy

```
npm install --omit=dev
node index.js
```

`better-sqlite3` cần build từ nguồn trên Alpine (cần python3, make, g++ trong image).

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PORT` | `3001` | |
| `DATA_DIR` | `./data` | Thư mục chứa `app.db` (SQLite, WAL) |
| `MAIL_MODE` | `log` | `log` hoặc `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | | Bắt buộc khi `MAIL_MODE=smtp` (cần `SMTP_HOST` và `MAIL_FROM`) |
| `COOKIE_SECURE` | | `true` để cookie `sid` và `osid` có cờ `Secure` (dùng khi chạy HTTPS) |
| `PUBLIC_BASE_URL` | | Ví dụ `https://test.example.com`. Bắt buộc khi bật OAuth, dùng để dựng redirect URI |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | Bật đăng nhập Google khi có đủ cả hai |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | | Bật đăng nhập Microsoft khi có đủ cả hai |
| `MICROSOFT_TENANT` | `common` | `common`, `organizations`, `consumers` hoặc GUID tenant. Không nhận tên miền |

Redirect URI cần đăng ký ở nhà cung cấp:

- `${PUBLIC_BASE_URL}/api/auth/oauth/google/callback`
- `${PUBLIC_BASE_URL}/api/auth/oauth/microsoft/callback`

## Cảnh báo `MAIL_MODE=log`

Chế độ `log` không gửi email. Mã OTP được in ra log server. Chỉ dùng để thử nghiệm, không dùng cho production.

## Đăng ký và đặt mật khẩu

Đăng ký không nhận mật khẩu. Mật khẩu chỉ được đặt sau khi xác minh OTP.

1. `POST /api/auth/register` với `{email, name}`. Trả `201 {ok, needsVerification:true, email, tenant, expiresInSeconds, resendInSeconds, attemptsLeft}`. Trả về cùng dạng cho email mới, email chưa xác minh, email đã xác minh nhưng chưa có mật khẩu, và email đã có tài khoản đầy đủ. Với email đã có tài khoản đầy đủ thì không gửi mã và không đổi gì. Email chưa xác minh đăng ký lại trong 60 giây: `429 otp_wait` kèm `retryAfter`.
2. `POST /api/auth/verify` với `{email, code}`. Đúng mã thì đặt cookie `osid` và trả `{ok, onboardingStep:'password', email}`. Không cấp cookie `sid`. Mọi lỗi mã (sai, hết hạn, không có tài khoản) cho cùng một thông điệp `invalid_code`. Sai quá 5 lần cho một mã: `429 otp_locked`.
3. `POST /api/auth/password` với `{password}` và cookie `osid`. Đổi `osid` lấy `sid` đầy đủ, trả `{ok, onboardingStep:'appearance', user}`.
4. Tiếp tục với hồ sơ nhân vật, xem mục bên dưới.

Trường đếm ngược, có trong mọi phản hồi 201 của `register` và trong các lỗi của `verify`: `expiresInSeconds` là thời hạn mã (600 giây), `resendInSeconds` là số giây tới khi được gửi lại (60 khi vừa gửi), `attemptsLeft` là số lần nhập còn lại của mã (tối đa 5). `retryAfter` chỉ có khi đang bị giới hạn gửi lại, cùng giá trị với `resendInSeconds`. `resend` không trả các trường này.

Phụ trợ: `POST /api/auth/resend` (luôn 200, chỉ gửi khi đã qua 60 giây), `GET /api/auth/onboarding` (đọc trạng thái phiên tạm khi tải lại trang).

Quy tắc mật khẩu:

- Từ 10 đến 128 ký tự (đếm theo ký tự Unicode), không trùng email.
- Tối đa **72 byte UTF-8**. bcrypt chỉ dùng 72 byte đầu, nên mật khẩu dài hơn bị từ chối bằng `400`, không bị cắt âm thầm. Ký tự có dấu tiếng Việt chiếm 2 đến 3 byte, nên số ký tự tối đa thực tế thấp hơn 72.
- Sai 5 lần trong một phiên tạm: phiên bị xóa, trả `429 onboarding_locked`. Cần gửi lại mã và xác minh lại.
- Băm bcrypt với cost 12.

## Phiên

| Cookie | Scope | Path | Thời hạn | Dùng ở |
|---|---|---|---|---|
| `sid` | `full` | `/` | 7 ngày | `/me`, `/login`, `/profile/*`, và service văn phòng qua `/me` |
| `osid` | `onboarding` | `/api/auth` | 30 phút, không gia hạn | `/onboarding`, `/password`, `/logout` |

- Cả hai cookie có `HttpOnly` và `SameSite=Lax`. Có `Secure` khi `COOKIE_SECURE=true`.
- Phiên tạm không phải đăng nhập. `GET /api/auth/me` với chỉ `osid` trả `403 {code:'onboarding_session', error:'Cần hoàn tất đăng ký.', onboardingStep}`. Service văn phòng coi mọi status khác 200 là chưa đăng nhập.
- Các route profile chỉ nhận `sid`. Route dùng `osid` trả `401`.
- Đổi phiên (login, đặt mật khẩu, OAuth) luôn tạo token mới và xóa token cũ.

## Đăng nhập

`POST /api/auth/login` với `{email, password}`:

- `200 {ok, user, onboardingStep}` và cookie `sid`. `onboardingStep` là `appearance`, `tour` hoặc `done`.
- `401 invalid_credentials`: sai mật khẩu, chưa xác minh, hoặc tài khoản chỉ đăng nhập bằng Google/Microsoft. Không gửi mã.
- `409 password_setup_required`: đã xác minh nhưng chưa đặt mật khẩu. Trả `{needsPassword:true, onboardingStep:'password', email, resendInSeconds}`, gửi mã nếu đã qua 60 giây. Không tính là sai mật khẩu. Frontend nhập mã để có `osid` rồi đặt mật khẩu.
- `429 login_locked`: sai 5 lần, khóa 15 phút.

## Route

- `GET /api/health`: `{ok, mail}`
- `GET /api/auth/providers`: `{google, microsoft}`
- `GET /api/auth/me`: `200 {ok, user, onboardingStep, appearance}` với `sid`; `onboardingStep` luôn có, dữ liệu cũ không có bước được trả `done`; `403` với `osid`; `401` nếu không có cookie
- `POST /api/auth/register` `{email, name}`: `201`, xem mục trên
- `POST /api/auth/verify` `{email, code}`: `200`, đặt `osid`
- `POST /api/auth/resend` `{email}`: luôn `200`
- `GET /api/auth/onboarding`: `200` với `osid` ở bước `password`, `401` khi không có
- `POST /api/auth/password` `{password}`: `200`, đổi `osid` lấy `sid`
- `POST /api/auth/login` `{email, password}`: xem mục Đăng nhập
- `POST /api/auth/logout`: xóa `sid` và `osid`, luôn `200`
- `GET /api/auth/oauth/{google,microsoft}/start` và `/callback`: `404` nếu chưa cấu hình

## Hồ sơ nhân vật

Mọi route yêu cầu `sid`. Thao tác ghi không nhận `userId` từ client.

- `GET /api/auth/profile/appearance`: `{ok, appearance, onboardingStep}`. `appearance` là `null` nếu chưa lưu.
- `PUT /api/auth/profile/appearance`: body là Appearance (JSON, tối đa 4 KB). Trả `{ok, appearance}` với bản đã chuẩn hoá.
  - Trường và giá trị (nguồn chuẩn `src/avatar/appearance.ts`, danh sách id khớp `src/avatar/catalog.ts`):
    - `bodyType`: `slim`, `regular`, `broad`.
    - `skinTone`: số nguyên 0 đến 5.
    - `hairStyle`: `short`, `bob`, `long`, `bun`, `spiky`, `curly`, `buzz`, `ponytail`.
    - `outfit`: `shirt-tie`, `blazer`, `dress`, `casual`, `party-suit`, `ao-dai`, `uniform-karaoke`.
    - `shoes`: `oxford`, `heels`, `sneakers`.
    - `accessories`: mảng gồm `glasses`, `watch`, `name-badge`, `lanyard`, `pin-brooch`, `cufflinks`, `scarf`, `bowtie`, `hat-party`. Trùng lặp được gộp, giữ thứ tự chuẩn.
    - `hairColor`, `eyeColor`, `topColor`, `bottomColor`: `#RRGGBB`.
  - Giá trị sai hoặc thiếu (id lạ, màu sai dạng, tông da ngoài 0 đến 5, phụ kiện lạ) được thay bằng mặc định trong `DEFAULT_APPEARANCE` (`services/auth/appearance.js`). Không báo lỗi.
  - Khóa lạ (kể cả `role`, `department`, `id`, `tenant_id`, `email`, `v`) bị bỏ qua. Chỉ các trường trên được ghi xuống DB.
  - Body không phải đối tượng JSON (mảng, chuỗi, hoặc thiếu `Content-Type: application/json`): `400 invalid_input` kèm thông điệp tiếng Việt.
  - Giới hạn 1 lần mỗi 5 giây cho mỗi người dùng: `429 rate_limited`, kèm `retryAfter`.
- Dữ liệu đã lưu không có trường nào của schema trên (dữ liệu cũ) được đọc là `null`, như chưa có ngoại hình.
- `GET /api/auth/profile/appearance/:userId`: `{ok, user:{id, name, appearance}}`. Không trả email, role hay department. Không tồn tại và khác tenant đều trả `404 not_found`.
- `GET /api/auth/profile/appearances?ids=1,2,3`: đọc hàng loạt, tối đa 100 id, cùng tenant. Có `ETag`, trả `304` khi không đổi.
- `POST /api/auth/profile/onboarding/complete`: chuyển `appearance` sang `tour`. Cần appearance đã lưu, nếu không trả `409 appearance_missing`.
- `POST /api/auth/profile/onboarding/tour-done`: chuyển `tour` sang `done`. Gọi lại khi đã `done` vẫn trả `200`.

### Hồ sơ và nhân vật cá nhân (chi tiết: `docs/design/PROFILE.md`)

Chỉ đọc/ghi dữ liệu của chính người đăng nhập (id lấy từ phiên). Bảng mới: `user_profiles`, `user_characters`.

- `GET /api/auth/profile`, `PUT /api/auth/profile` (`{revision, name?, avatarRef?}`; phòng ban, vai trò, email gửi lên thì `403 field_forbidden`).
- `GET|PUT|DELETE /api/auth/profile/character` (PUT: `{revision, look}`, look là CharacterLook v1, tối đa 64 KB, `422` khi sai, `413` khi quá lớn, `409 revision_conflict` khi revision cũ).
- Test thuần: `node --test test/character.test.js`.

## Dữ liệu cũ (migration)

Khởi động lại tự động thêm cột mới và gán bước onboarding:

- Tài khoản chưa xác minh: xóa `password_hash` cũ (lỗ hổng: mật khẩu đặt trước khi xác minh). Phải đăng ký lại.
- Tài khoản đã xác minh (có hoặc không có mật khẩu): đánh dấu `done`, không ép tạo nhân vật.

Migration chạy lại an toàn. Trước khi triển khai, sao lưu `app.db` (xem ONBOARDING_API mục 9.1).

## Tenant

- Email thuộc danh sách cá nhân (gmail.com, outlook.com, ...) vào tenant `personal`.
- Email khác vào tenant có id là tên miền, tạo tự động.

## Quản trị (CLI)

```
node scripts/admin.js set-role <email> <employee|it|admin>
node scripts/admin.js set-dept <email> <phòng ban>
node scripts/admin.js set-tenant <tenantId> <server> <tunnel>
node scripts/admin.js list-tenants
```

Dùng `-` để xóa một giá trị.

Chạy trong container (service `auth` trong docker-compose, dữ liệu nằm ở volume `auth-data`, `DATA_DIR=/data`):

```
docker compose exec auth node scripts/admin.js set-role <email> <employee|it|admin>
```

Vai trò và phòng ban chỉ đổi qua CLI này, không đổi qua API hồ sơ.

## Hạn chế đã biết

- Giới hạn đăng nhập sai, giới hạn gửi lại OTP, và giới hạn ghi ngoại hình nằm trong bộ nhớ. Chỉ đúng khi chạy một instance, và reset khi khởi động lại.
- Gửi mã khi đăng ký, gửi lại và đăng nhập (đoạn 409) không chờ mail gửi xong. Lỗi mail không trả về client, chỉ ghi log `err.code`. Người dùng bấm gửi lại.
- Không có giới hạn theo IP cho đăng ký và gửi OTP.
- Token Microsoft không kiểm tra chữ ký: token được đổi trực tiếp với token endpoint qua TLS, còn iss, aud, nonce, exp và tid được kiểm tra thủ công.
- Email trong token Microsoft của tài khoản work/school chưa chắc đã được xác minh. Vì vậy đăng nhập Microsoft không được liên kết vào tài khoản đã đăng ký bằng mật khẩu, trừ tenant cá nhân.
- Giới hạn "10 lần mỗi giờ cho mỗi email" ở bước verify và "5 lần mỗi giờ" cho gửi OTP trong đặc tả chưa được triển khai. Hiện chỉ có giới hạn cũ: 60 giây giữa hai lần gửi và 5 lần nhập sai cho mỗi mã.
- Frontend phải đi cùng bản backend này. `verify` không còn cấp `sid`, nên client cũ không đăng nhập được sau bước xác minh.
