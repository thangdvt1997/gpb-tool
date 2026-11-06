# Xuất/nhập, sao lưu và phiên bản dữ liệu (TASK 20)

Mã: `src/backup/**`. Khác với autosave của `src/persist` (TASK 06): ở đây là dữ liệu di chuyển (tệp) và lịch sử sao lưu cục bộ.
Quyết định: gói JSON đơn, không ZIP, không thêm thư viện.

## Định dạng gói
```
{ "header": { app:"gpb-office", format:"gpb-backup", schemaVersion:1, createdAt:ISO,
              sectionVersions:{look:1, settings:2, persist:1, layoutdraft:1}, checksum:"sha256:<hex>" },
  "sections": { look:{...}, settings:{...}, persist:{...}, layoutdraft:{...} } }
```
- checksum = SHA-256 của `stableStringify(sections)` (khóa sắp xếp). Dùng `crypto.subtle`, dự phòng SHA-256 thuần (`sha256Pure`, có test vector).
- `sectionVersions` là manifest phiên bản từng phần. `schemaVersion` là phiên bản khung gói.
- Xuất luôn qua `redactSensitive`: bỏ khóa tên chứa token/secret/password/authorization/api key/cookie/session id/email/credential và mọi chuỗi có dạng email. Danh sách đường dẫn đã loại trả về trong `removed`.
- Phần chưa có dữ liệu (đọc ra null) hoặc không hợp lệ thì bị bỏ khỏi gói và ghi vào `skipped`.

## Phần (section) và mở rộng
`BackupSection` (types.ts): `id, label, version, migrations{n: n->n+1}, validate, read, write, clear?, merge?, volatilePaths?`.
Dựng sẵn (sections.ts, I/O qua adapter): `look` (v1, bước 0->1 đổi Appearance cũ), `settings` (v2, bước 1->2 = sanitize), `persist` (snapshot văn phòng dạng EXPORT_FORMAT, kèm ảnh xăm nhúng base64; kiểm sâu do `PersistManager.importSnapshot`), `layoutdraft` (v1, `{items:{id:{x,z,rotation}}}`).
Hình xăm riêng hoặc dữ liệu khác: viết một `BackupSection` rồi `registry.register(section)` (truyền qua `extra` của `createDefaultBackupService`). Hiện ảnh xăm đi cùng phần `persist` (asset nhúng) và lớp xăm nằm trong `look`.

## Migrate
- Tầng gói: `BUNDLE_MIGRATIONS[n]` (hiện có 0->1: gói phẳng cũ thành header+sections). Tầng phần: `section.migrations[n]`.
- Mỗi bước thuần, đầu vào được sao chép (bản gốc không đổi); thiếu bước hoặc bước ném lỗi thì phần/gói bị từ chối; version lớn hơn hỗ trợ (`too_new`) bị từ chối với thông báo cập nhật ứng dụng.
- Quy tắc thêm bước: tăng version, thêm `migrations[cũ]`, thêm test riêng cho bước đó.

## Nhập
1. `service.parse(text)`: giới hạn 25 MB (`MAX_IMPORT_BYTES`), `safeParse` (chặn `__proto__`/`constructor`/`prototype` ở mọi cấp, sâu <= 32, <= 400k nút), kiểm checksum (gói có header), migrate gói, rồi migrate + validate từng phần. Phần lỗi/không hỗ trợ vào `rejected`, phần tốt vẫn nhập được.
2. `service.preview(parsed, mode)`: không ghi gì; trả khác biệt theo đường dẫn (added/removed/changed) cho từng phần, tùy chế độ `merge` (gộp sâu an toàn, trừ look/persist là lấy bản nhập) hoặc `replace`.
3. `service.apply(parsed, {mode, selected})`: đọc trạng thái hiện tại, tính và validate kết quả, TỰ SAO LƯU toàn bộ trạng thái hiện tại vào vòng (`pre-import`; không sao lưu được thì dừng, chưa ghi gì), ghi lần lượt; lỗi thì ghi ngược trạng thái cũ các phần đã ghi (phần trước đó rỗng dùng `clear()`), trả `rolledBack`/`rollbackErrors`.

## Vòng sao lưu cục bộ
`createBackupRing({storage, max})` (mặc định 5, tối đa 50) trên localStorage (dự phòng bộ nhớ nếu bị chặn). Khóa `gpb.backup.v1.index` và `gpb.backup.v1.entry.<id>`. Mỗi bản có thời điểm, nhãn, lý do (manual/auto/pre-import/pre-restore), kích thước. Hết dung lượng thì bỏ bản cũ nhất rồi thử lại. `service.restore(id)` tạo bản `pre-restore` rồi thay thế; nên có thể quay lại bản mới bằng bản `pre-restore`.
Lưu ý: bản cục bộ không redact (cần khôi phục đầy đủ); chỉ gói xuất ra tệp mới redact.

## Dòng mount
Trong App (chưa mount, vì không được sửa App.tsx), cạnh nơi tạo `persist` manager:
```tsx
import { BackupPanel, createDefaultBackupService } from './backup';
const backup = useMemo(() => createDefaultBackupService({ getLook, applyLook, persist: persistManager /*, layoutDraft, extra */ }), []);
{backupOpen && <BackupPanel service={backup} onClose={() => setBackupOpen(false)} />}
```
`getLook/applyLook` là hàm đang dùng cho look nhân vật (cùng cặp với `PersistAppliers.applyLook`).

## Chưa kiểm chứng
- Chưa mount vào App, chưa chạy trên trình duyệt thật: tải tệp, input file, giao diện BackupPanel chỉ qua tsc, chưa có ảnh chụp, chưa kiểm axe/đọc màn hình.
- `runtime.ts` (nối settings store, PersistManager) chỉ qua tsc; test dùng adapter giả. Chưa thử vòng xuất/nhập thật với ảnh xăm nhúng trong IndexedDB.
- Ghi nhiều phần không phải transaction thật: rollback là ghi lại trạng thái cũ, có thể thất bại (báo qua `rollbackErrors`). `PersistManager.importSnapshot` có kiểm sâu riêng và có thể từ chối bản đã qua kiểm nhẹ ở phần `persist`.
- Phần `layoutdraft` cần adapter do App cung cấp (chưa có nguồn nháp trong repo). Gói v0 là bản thử nghiệm giả định, chưa có gói v0 thật để đối chiếu.
- localStorage ~5 MB: gói có nhiều ảnh xăm có thể không vào vòng sao lưu (khi đó nhập bị dừng thay vì ghi đè không sao lưu). Chưa có lịch sử/revision và so sánh ngữ nghĩa kiểu body/xăm/outfit như prompt (chỉ khác biệt theo đường dẫn); chưa có ZIP, asset reference/giấy phép, quyền server (ngoài phạm vi, không có backend).
- Khi vòng đầy, `restore` của bản cũ nhất có thể làm bản đó bị đẩy khỏi vòng bởi bản `pre-restore` (dữ liệu đã đọc trước nên khôi phục vẫn chạy).
