# Hồ sơ người dùng và nhân vật cá nhân (TASK 22)

Trạng thái: backend trong `services/auth`; test thuần (validate/migrate) và **test HTTP thật cục bộ** (`test/http.test.js`) đã chạy. Client có hàm gọi API (`src/auth/api.ts`) và `src/profile/ProfilePanel.tsx`; panel **chưa được mount** vào App. Chưa kiểm chứng trên VPS/trình duyệt thật (mục 8).

## 1. Tái sử dụng auth hiện có

Không dựng auth mới. Mọi route dùng `requireFullSession` (cookie `sid`, `HttpOnly; SameSite=Lax`, có hạn, logout xóa phiên, tài khoản bị khóa thì thu hồi phiên). Danh tính lấy từ phiên ở server (`req.authUser.id`). Không route nào nhận `userId` từ client làm bằng chứng sở hữu.

## 2. Tách dữ liệu

| Phần | Nơi lưu | Ai đọc | Ai sửa |
|---|---|---|---|
| Tài khoản (email, mật khẩu, vai trò, tenant) | `users` (có sẵn) | chính chủ qua `/me`, `/profile` | CLI quản trị |
| Hồ sơ công khai (tên, phòng ban) | `users.name`, `users.department` (có sẵn) | cùng tenant qua `/directory` (có sẵn, không có email) | tên: chính chủ qua `PUT /profile`; phòng ban: CLI |
| Tham chiếu ảnh đại diện | `user_profiles.avatar_ref` (mới) | chính chủ | chính chủ |
| Nhân vật cá nhân (CharacterLook) | `user_characters` (mới) | chính chủ | chính chủ |
| Ngoại hình cũ (Appearance) | `users.appearance` (có sẵn) | cùng tenant qua `/profile/appearance(s)` | chính chủ |
| Tùy chọn riêng | `users.react_bump` (có sẵn) | chính chủ | chính chủ |

Khóa sở hữu là `users.id` (số, ổn định). Tên hiển thị không bao giờ là khóa.

Bộ phối (outfit presets) vẫn chỉ lưu cục bộ (`src/fashion/persistence.ts`, `gpb.fashion.outfitSets.v1`); chưa có bảng server. Đây là việc còn thiếu.

## 3. Migration DB

Trong `services/auth/db.js`, chạy sau khối migration `users`. Chỉ `CREATE TABLE IF NOT EXISTS`, không đổi bảng đang chạy, chạy lại an toàn.

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_ref TEXT CHECK (avatar_ref IS NULL OR length(avatar_ref) <= 64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_characters (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 0),
  data TEXT NOT NULL CHECK (json_valid(data) AND length(data) <= 262144),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);
```

Thao tác duy nhất ghi vào bảng cũ: `PUT /profile` cập nhật giá trị `users.name` (không đổi schema). Sao lưu `app.db` trước khi deploy như ONBOARDING_API mục 9.1.

## 4. API

Mọi route: cần `sid` đầy đủ, `Cache-Control: no-store` (đặt chung cho `/api/auth`), phản hồi lỗi dạng `{ok:false, code, error, path?}`.

### `GET /api/auth/profile`
`200 {ok, profile:{id, name, email, department, avatarRef, revision, updatedAt}}`. Email chỉ trả ở đây, cho chính chủ.

### `PUT /api/auth/profile`
Body JSON: `{revision, name?, avatarRef?}`.
- `revision`: bản client đang có (`0` khi chưa có dòng `user_profiles`).
- `name`: 2 đến 80 ký tự sau khi gộp khoảng trắng; không ký tự điều khiển, không URL; qua bộ lọc từ tục.
- `avatarRef`: `null`, `"character"` (vẽ từ nhân vật), hoặc `"preset:<id>"` (`[a-z0-9-]`, ảnh có sẵn trong bundle). Không nhận URL, data URI hay ảnh tải lên.

### `GET /api/auth/profile/character`
- Có bản: `200 {ok, character, schemaVersion, migrated, revision, updatedAt}`. `migrated: true` khi bản lưu ở schema cũ đã được nâng lúc đọc (GET không ghi lại DB).
- Chưa có: `200 {ok, character:null, revision:0, legacyAppearance}`.
- Bản hỏng: `200 {ok, character:null, corrupt:true, revision, legacyAppearance}` và ghi log server (không có nội dung look).
- Bản do server mới hơn ghi: `409 schema_newer`.

### `PUT /api/auth/profile/character`
Body JSON: `{revision, look}`; `look` là CharacterLook v1 (`src/fashion/types.ts`). Body tối đa 72 KB, `look` tối đa 64 KB (khớp `MAX_LOOK_BYTES`). Trả `200 {ok, character, schemaVersion, revision, updatedAt}`.

### `DELETE /api/auth/profile/character`
Xóa bản cloud của chính mình. `200 {ok, deleted}`. Không giữ bản sao trên server ngoài bản backup `app.db` theo chính sách backup chung. Xóa tài khoản thì hai bảng mới tự xóa theo (`ON DELETE CASCADE`).

### Mã lỗi

| Mã HTTP | `code` | Khi nào |
|---|---|---|
| 401 | `unauthenticated` | không có `sid`, phiên hết hạn, chỉ có phiên tạm `osid`, hoặc tài khoản bị khóa |
| 403 | `field_forbidden` | body có `id`, `userId`, `email`, `department`, `role`, `tenant*`, `status` |
| 404 | `not_found` | mọi đường dẫn có id như `/profile/character/5` (không tồn tại route đọc của người khác) |
| 409 | `revision_conflict` | `revision` khác bản trên server; kèm `currentRevision`. Không ghi đè |
| 409 | `schema_newer` | bản lưu có `schema_version` lớn hơn server |
| 413 | `payload_too_large` | body quá 72 KB (parser) hoặc look quá 64 KB (route) |
| 415 | `unsupported_media_type` | PUT không phải `application/json` hoặc body không phải đối tượng |
| 422 | `invalid_character`, `missing_field`, `unknown_field`, `unsupported_version`, `external_ref`, `too_complex`, `invalid_revision`, `empty_update` | dữ liệu sai; `path` chỉ trường lỗi |
| 422 | `content_rejected` | tên, `meta.name` hoặc chữ hình xăm bị bộ lọc từ tục chặn |
| 429 | `rate_limited` | ghi quá 1 lần mỗi 2 giây cho mỗi người (theo instance); kèm `Retry-After` |

Thứ tự kiểm tra: parser JSON (413/400) chạy trước kiểm tra phiên, nên body quá lớn trả 413 kể cả khi chưa đăng nhập. Sau đó: 401, 415, 403, 422, 413 (look), 422 từ tục, 429, 409.

## 5. Kiểm tra và migrate nhân vật (`services/auth/character.js`)

Ghi (`validateCharacter`): từ chối, không tự sửa.
- Đúng 11 khóa cấp 1 của CharacterLook; `version === 1`; `bodyStyle` là `realistic` hoặc `chibi`.
- `meta` chỉ có `name` (tối đa 40 ký tự), `presetId`, `legacyOutfit` (chuỗi tối đa 64 hoặc null).
- `body, face, hair, skin, outfit, accessories` là đối tượng; `tattoos, scars` là danh sách tối đa 12 lớp đối tượng.
- Toàn cây: độ sâu tối đa 8, tối đa 4000 nút, danh sách tối đa 32 phần tử, chuỗi tối đa 120 ký tự, số hữu hạn, khóa dạng `[A-Za-z][A-Za-z0-9_]*` và không phải `__proto__/constructor/prototype`, không ký tự điều khiển, không chuỗi chứa `://` hay bắt đầu bằng `data:`, `blob:`, `javascript:`, `file:`.

Giới hạn: server không sao lại catalog (`src/fashion/rules.ts`), nên id món đồ, giới hạn số đo, màu theo bảng màu không được kiểm ở server. Client phải chạy `validate()` của `rules.ts` sau khi đọc. Hai danh sách hằng (`CHARACTER_SCHEMA_VERSION`, `BODY_STYLES`, `MAX_CHARACTER_BYTES`, `maxLayers`) phải sửa cùng lúc khi frontend đổi.

Đọc (`migrateStoredCharacter`): `MIGRATIONS[n]` nâng version n lên n + 1. Hiện có bước 0 lên 1 (bản nháp chưa có `version`, `bodyStyle`, `meta` đủ trường: thêm mặc định `realistic`, `null`, danh sách rỗng). Sau migrate luôn chạy lại `validateCharacter`.

## 6. Chuyển dữ liệu khách và đồng bộ

- Khi chưa có bản cloud, GET trả `character:null` và `legacyAppearance`. Client tự chuyển đổi (`appearanceToLook`) hoặc lấy look cục bộ, cho người dùng xem trước, rồi PUT với `revision: 0`.
- `revision: 0` chỉ thành công khi server chưa có bản nào. Có rồi thì 409, nên bản cloud không bị ghi đè tự động.
- Hai tab sửa đồng thời hoặc request gửi trùng: request sau mang revision cũ nên nhận 409.
- Đăng xuất: phiên bị xóa ở server, phản hồi `/api/auth` là `no-store`. Client phải xóa state nhân vật trong bộ nhớ khi logout (việc của client, chưa làm).

## 7. Riêng tư

- Danh bạ (`/directory`, `/directory/:id`) và route ngoại hình công khai không trả email. Không đổi các route này.
- Nhân vật cá nhân không có route đọc theo id người khác. Người khác chỉ thấy ngoại hình qua `/profile/appearance(s)` như trước.
- Log lỗi không ghi nội dung look hay token.

## 8. Kiểm thử

Đã chạy (máy cục bộ, Node thuần, không npm): `cd services/auth && node --test test/character.test.js` (15 test).

Chưa kiểm chứng: HTTP thật. Chạy trên VPS sau khi deploy (thay `BASE`, tạo hai tài khoản test A, B qua luồng đăng ký, lấy cookie `sid` từ trình duyệt hoặc từ phản hồi login):

```bash
BASE=https://<domain>/api/auth
# 401
curl -s -o /dev/null -w '%{http_code}\n' $BASE/profile/character
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: application/json' -d '{"revision":0,"look":{}}' $BASE/profile/character
# Đọc hồ sơ và nhân vật (A)
curl -s -b "sid=$SID_A" $BASE/profile
curl -s -b "sid=$SID_A" $BASE/profile/character
# 403: gửi trường sở hữu
curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' -d '{"revision":0,"department":"IT"}' $BASE/profile
curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' -d '{"revision":0,"userId":2,"look":{}}' $BASE/profile/character
# 404: không có route đọc nhân vật người khác
curl -s -o /dev/null -w '%{http_code}\n' -b "sid=$SID_A" $BASE/profile/character/2
# 422
curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' -d '{"revision":0,"look":{"version":1}}' $BASE/profile/character
curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' -d '{"revision":0,"avatarRef":"https://x.example/a.png"}' $BASE/profile
# 413
node -e 'process.stdout.write(JSON.stringify({revision:0,look:{pad:"x".repeat(80000)}}))' > /tmp/big.json
curl -s -o /dev/null -w '%{http_code}\n' -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' --data-binary @/tmp/big.json $BASE/profile/character
# Ghi hợp lệ (look.json là một CharacterLook v1 xuất từ trình sửa nhân vật), rồi ghi lại cùng revision 0 -> 409
jq -n --slurpfile l look.json '{revision:0, look:$l[0]}' > /tmp/put.json
curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' --data-binary @/tmp/put.json $BASE/profile/character
sleep 3; curl -s -b "sid=$SID_A" -X PUT -H 'Content-Type: application/json' --data-binary @/tmp/put.json $BASE/profile/character
# B không thấy nhân vật của A (B nhận character:null hoặc bản của B)
curl -s -b "sid=$SID_B" $BASE/profile/character
# Danh bạ không có email
curl -s -b "sid=$SID_B" "$BASE/directory" | grep -c '@' || true
# Logout rồi đọc lại -> 401
curl -s -b "sid=$SID_A" -X POST $BASE/logout; curl -s -o /dev/null -w '%{http_code}\n' -b "sid=$SID_A" $BASE/profile/character
# Bảng mới
sqlite3 /data/app.db '.schema user_characters' '.schema user_profiles'
```

## 9. Giới hạn đã biết

- Giới hạn tần suất nằm trong bộ nhớ, đúng khi chạy một instance, reset khi khởi động lại.
- Kiểm tra nhân vật ở server chỉ ở mức cấu trúc (mục 5).
- Bộ phối chưa lưu trên server; client chưa gọi API mới; luồng preview merge dữ liệu khách chưa có giao diện.
- Không có route xóa toàn bộ tài khoản; xóa tài khoản qua DB/CLI sẽ xóa theo hồ sơ và nhân vật.

## 9. Kiểm thử HTTP cục bộ và giao diện (bổ sung)

`cd services/auth && node --test test/` (35 test, gồm `test/http.test.js`). File HTTP chạy `index.js` như tiến trình con trên `127.0.0.1` cổng ngẫu nhiên, `DATA_DIR` là thư mục tmp (xóa sau test), `MAIL_MODE=log`, không có SMTP/secret. User và phiên được chèn thẳng vào DB (token ngẫu nhiên, DB lưu SHA-256 như `createSession`); test dùng `node:sqlite` (Node >= 22.5) vì `better-sqlite3` 11.7 abort lúc thoát tiến trình trên Node 24.

Đã kiểm: 401 khi thiếu/giả/hết hạn/đăng xuất/phiên tạm/tài khoản khóa; GET/PUT hồ sơ (revision, 403, 422, 415, 400, 429, 409); PUT nhân vật hợp lệ, 409 không ghi đè, 422 (thiếu trường, URL, `__proto__`), 403 `userId`, 413 (body > 72 KB, kể cả khi chưa đăng nhập); ownership giữa A và B (route theo id trả 404, query `userId` bị bỏ qua, dữ liệu B nguyên vẹn trong DB); danh bạ không lộ email; log không chứa token.

Ghi nhận hiện trạng (không phải lỗi mới): server **không có** middleware CSRF/Origin. Bảo vệ dựa vào cookie `SameSite=Lax` và việc PUT chỉ nhận `application/json` (form chéo trang nhận 415). Origin lạ không được chấp nhận hay từ chối riêng; không có header CORS. Ghi nhận một lần 409 cũng tính vào giới hạn 2 giây (throttle ghi nhận trước khi kiểm revision).

`ProfilePanel` (`src/profile/`): sửa tên, chọn ảnh đại diện (`none` hoặc `character`), xem tóm tắt nhân vật cloud, đồng bộ nhân vật hiện tại (hỏi xác nhận trước khi ghi đè bản cloud khác), nạp bản cloud (qua `validate()` của `rules.ts`), xóa bản cloud, xử lý 401/409/413/422/429. API chưa có trường giới thiệu, trạng thái hay quyền riêng tư nên panel không làm các mục này. Bộ phối (outfit presets) vẫn chỉ ở cục bộ.

## 10. Giới thiệu, trạng thái, quyền riêng tư và kiểm Origin (bổ sung)

### Bảng mới `user_about` (chỉ thêm, `CREATE TABLE IF NOT EXISTS`, không đụng bảng cũ)
`bio` (tối đa 280 ký tự), `status` (`free|busy|meeting|away`), `status_text` (tối đa 60), `profile_visibility`, `character_visibility` (`everyone|colleagues|self`, mặc định `colleagues`), `revision` (riêng, 0 = chưa có dòng), `updated_at`. Dùng bảng riêng để revision của hồ sơ cũ không đổi nghĩa.

### API (đều cần `sid`; route mới nên server cũ trả 404)
- `GET /api/auth/profile/about` -> `{ok, about:{bio, presence, statusText, profileVisibility, characterVisibility, revision, updatedAt}}`.
- `PUT /api/auth/profile/about` body `{revision, bio?, presence?, statusText?, profileVisibility?, characterVisibility?}`. Trường tên `presence` (không dùng `status` vì `status` là trường tài khoản bị cấm). Văn bản: NFC, gộp khoảng trắng, không ký tự điều khiển, không URL, qua `findBlocked` (422 `content_rejected`), quá dài 422 `too_long`. Mã lỗi khác như `PUT /profile` (403, 409, 415, 422, 429). Giới hạn ghi 1 lần/2 giây/người.
- `GET /api/auth/profile/about/:userId` -> thẻ `{id, name, department, avatarRef, bio, presence, statusText, character}` theo quyền của chủ hồ sơ. Không có email. `403 profile_private` nếu không được xem; `404` nếu id sai hoặc tài khoản bị khóa. `character` là `null` nếu `characterVisibility` không cho phép hoặc chưa có. Chủ luôn xem được chính mình.
- Ý nghĩa mức: `everyone` mọi người đã đăng nhập; `colleagues` cùng `tenant_id` (tenant `personal` không tính là đồng nghiệp); `self` chỉ chủ.
- Route cũ `/profile/character/:id` vẫn 404.

### Kiểm Origin/Referer (`services/auth/origin.js`)
Áp cho `POST/PUT/PATCH/DELETE` dưới `/api/auth`, chạy trước parser và phiên. Có `Origin` (hoặc, nếu không, `Referer`) mà không thuộc danh sách thì `403 origin_forbidden`; `Origin: null` cũng bị chặn. Cho qua nếu: không có cả hai header (curl, máy-máy), origin nằm trong danh sách, hoặc trùng `Host` của chính server. Danh sách: `ALLOWED_ORIGINS` (phân tách dấu phẩy, thay thế mặc định); mặc định `https://gp.daisoncoop.com`, `PUBLIC_BASE_URL` và `localhost`/`127.0.0.1`/`[::1]` mọi cổng. Khi đặt `ALLOWED_ORIGINS`, localhost chỉ được phép nếu `ALLOW_LOCALHOST_ORIGINS=true`. GET không bị chặn. Lưu ý triển khai: đặt `ALLOWED_ORIGINS` đủ mọi domain thật nếu có nhiều (qua proxy cần chuyển đúng header `Origin`).

### Client và tương thích
`getMyAbout()` trả `null` khi server trả 404/405 (bản auth cũ trên production); `ProfilePanel` khi đó ẩn mục giới thiệu, trạng thái, quyền riêng tư và không báo lỗi. Các lỗi khác ở mục này cũng chỉ ẩn mục, không chặn phần hồ sơ cũ. Chưa có UI xem thẻ người khác (`GET about/:userId` chưa được client gọi).

### Kiểm thử
`cd services/auth && node --test test/` (41 test, gồm Origin, about, quyền riêng tư giữa chủ/đồng nghiệp/ngoài tenant). Vitest: `buildAboutPatch`, `getMyAbout` với 404.
