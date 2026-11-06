# Hồ sơ người dùng và nhân vật cá nhân (TASK 22)

Trạng thái: backend đã viết trong `services/auth`, test thuần cho validate/migrate đã chạy. **Chưa kiểm chứng HTTP thật** (cần deploy lên VPS, xem mục 8). Client (`src/**`) chưa gọi các route này.

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
