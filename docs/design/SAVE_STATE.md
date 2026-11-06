# Lưu và khôi phục trạng thái văn phòng (TASK 06)

Mã: `src/persist/` (types.ts, core.ts, storage.ts, manager.ts, index.ts). Chưa gắn vào App.

## Snapshot (schema 1)

| Trường | Nội dung |
| --- | --- |
| `format` | `'gpb-office-snapshot'` |
| `schemaVersion` | `1` (`SNAPSHOT_SCHEMA_VERSION`) |
| `sceneId` | mặc định `'office-l-it7'` |
| `revision` | số nguyên, tăng 1 mỗi lần ghi thành công; mốc compare-and-swap |
| `savedAt`, `writerId` | thời điểm ghi (ms), id tab ghi |
| `assets` | `AssetRef[]`: `id = 'a-' + 32 hex đầu của sha256`, kind, mime (png/jpeg/webp), bytes, sha256 |
| `character.look` | `CharacterLook` của `src/fashion` (hình thể, mặt, tóc, da, lớp xăm/sẹo, outfit, phụ kiện) |
| `character.position` | `{x, z, yaw}` hoặc null. Chỉ là gợi ý, luôn kiểm tra lại khi khôi phục |
| `layout.overrides` | id vật → `Pose` (`src/layout/types`) |
| `objects` | id vật → khóa → giá trị nguyên thủy (chỉ vật khác mặc định, lấy từ `objectStates`) |
| `settings` | nhóm → khóa → giá trị; hiện có `interact.highlight`, `interact.keyHints` |

Không lưu: scene graph, mesh, instance vật lý, phím đang giữ, con trỏ, khung animation, trạng thái nhân vật
(đi/ngồi), focus tương tác. Khóa trạng thái vật bắt đầu bằng `_` hoặc thuộc `TRANSIENT_OBJECT_KEYS`
(`heldBy`, `lockedBy`, `occupiedBy`, `grabbedBy`, `animFrame`, `busy`) bị bỏ khi lưu và khi đọc.
Các task tương tác sau phải đặt khóa tạm thời theo quy ước này.

## Lưu trữ

- IndexedDB `gpb-office` v1: `snapshots` (key sceneId), `backups` (key `sceneId:kind`), `assets` (Blob theo id).
  Mỗi lần ghi: một transaction readwrite đọc revision, so CAS, chép bản cũ sang backup `previous`, ghi asset mới,
  ghi snapshot. Lỗi hoặc đóng tab giữa chừng thì transaction hủy, bản cũ còn nguyên (không có trạng thái nửa chừng).
- localStorage `gpb.persist.prefs.v1`: chỉ `{autosave}`. Bọc try/catch.
- Không có IndexedDB: dùng store bộ nhớ, `state.storeKind = 'memory'` để UI báo đóng trang sẽ mất dữ liệu.
- Máy chủ: viết adapter mới theo `SnapshotStore` (types.ts). `write` phải là CAS nguyên tử. Chưa có đồng bộ cloud.

## Luồng

- Autosave: `markDirty()` hoặc thay đổi `objectStates` → debounce 1,5 s, tối đa 10 s kể từ thay đổi đầu.
  Hàng đợi tuần tự: không bao giờ hai lượt ghi song song; thay đổi trong lúc ghi gộp thành đúng một lượt sau.
- Trạng thái (`usePersistState`): `idle | loading | saving | saved | error | conflict | blocked`, cùng `dirty`,
  `revision`, `remoteRevision`, `error`, `warnings`, `missingAssets`, `storeKind`.
- Rời trang khi `dirty` hoặc đang ghi: `beforeunload` hỏi xác nhận. Tab bị ẩn: thử ghi ngay.
- Nhiều tab: BroadcastChannel `gpb-persist` báo `{type:'saved', revision}`. Tab sạch tự tải bản mới; tab có thay đổi
  chuyển `conflict`, dừng autosave. Kể cả không có BroadcastChannel, CAS khi ghi vẫn chặn ghi đè.
  Ghi đè chỉ khi người dùng chọn `saveSnapshot({ overwrite: true })`.
- Đọc: migrate → validate → áp. Áp theo thứ tự: asset → look → bố cục → trạng thái vật → cài đặt → vị trí.
  Vị trí ngoài chữ L (`isInsideOffice`) hoặc chồng collider (nới `PLAYER_RADIUS`) thì đưa về `SPAWN`.
- Migrate: schema 0 = tệp look đơn lẻ (`exportLook`, CharacterLook trần, Appearance cũ) → schema 1.
  Trước khi ghi bản nâng cấp, bản thô được lưu vào backup `pre-migration`. Schema lớn hơn bản ứng dụng: từ chối,
  `status = 'blocked'`, không ghi gì. Dữ liệu hỏng cũng `blocked` (không tự ghi đè).
- Asset thiếu: liệt kê trong `missingAssets`, `applyAssets` nhận danh sách để dùng hình thay thế; tham chiếu
  vẫn giữ trong snapshot, không xóa dữ liệu người dùng.
- Quota: lỗi `QuotaExceededError` → `status = 'error'` với thông báo; bản cũ giữ nguyên.

## API (`PersistManager`)

- `saveSnapshot(opts?)`: lưu thủ công (validate trước khi ghi, CAS).
- `loadSnapshot()`: **khôi phục bản lưu gần nhất**, bỏ thay đổi chưa lưu.
- `restoreFromBackup(kind = 'previous')`: lấy bản sao lưu (`previous`, `pre-migration`, `pre-reset`, `pre-import`).
- `resetToDefault()`: **đặt lại** về look mặc định, bố cục gốc, vật mặc định. Sao lưu bản đang lưu vào `pre-reset` trước.
- `exportSnapshot()` / `importSnapshot(text)`: JSON `gpb-office-export` có asset base64; asset chỉ nhận khi sha256 khớp id.
  Nhập cũng nhận snapshot trần và tệp look schema 0. Sao lưu `pre-import` trước khi ghi.
- `registerAsset(blob, kind)` / `releaseAsset(id)` / `getAsset(id)`: ảnh xăm/họa tiết theo nội dung, không dùng object URL làm id.
- `attach()`, `markDirty()`, `setAutosave(on)`, `getState()`, `subscribe()`.

## Gắn vào App (người điều phối làm)

```tsx
import { createPersistManager, usePersistState } from './persist';
const persist = useMemo(() => createPersistManager(
  { getLook: () => lookRef.current, getLayoutOverrides: () => overridesRef.current, getColliders: () => collidersRef.current },
  { applyLook: setLook, applyLayoutOverrides: applyOverrides, placeCharacter: setSpawnAndRemountPlayer, applyAssets },
), []);
useEffect(() => { const off = persist.attach(); void persist.loadSnapshot(); return off; }, [persist]);
// Gọi persist.markDirty() khi người dùng đổi look hoặc dời vật (không gọi cho thay đổi do apply*).
```

Lưu ý: bố cục hiện đồng bộ qua máy chủ (`src/layout/api.ts`, SSE). Người điều phối quyết định `applyLayoutOverrides`
ghi lên máy chủ hay chỉ áp cục bộ; module này không gọi API bố cục.

## Kiểm thử

`node --test src/persist/__tests__/core.test.mjs` (Node 22.18+ hoặc 24, không cần npm). 20 test: validate,
migrate, CAS (hai tab, quota giả lập), debounce, hàng đợi, vị trí an toàn, asset thiếu. Look dùng validator giả lập.

Chưa kiểm chứng (cần trình duyệt): IndexedDB thật, đóng tab giữa lượt ghi, quota thật, hai tab thật,
`tsc --noEmit`, round-trip với validate look thật. Cách thử: chạy dev trên VPS, mở hai tab, đổi trong tab A rồi
tab B; dùng DevTools > Application > IndexedDB `gpb-office` xem revision/backups; giả lập quota bằng
DevTools > Application > Storage > "Simulate custom storage quota".
