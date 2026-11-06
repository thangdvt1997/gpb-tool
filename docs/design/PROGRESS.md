# Tiến độ agent tự động (nhánh auto/20261106)

## 2026-11-06 — Bước (a), (b)

**(a) npm install + tsc**
- `npm install` thành công. `npx tsc --noEmit`: 0 lỗi. `npm run build`: thành công (bundle 1.68 MB, cảnh báo chunk > 500 kB, chưa tách chunk).
- Thêm devDependency `vitest@2.1.9` (bản mới nhất 5.x đòi vite >= 6, dự án đang vite 5.4.11), `vitest.config.ts`, script `npm test`.

**(b) Kết quả test (mục 3 HANDOFF)**
| Lệnh | Kết quả |
|---|---|
| persist core.test.mjs | 20/20 pass |
| emotes quick.test.mjs | 11/11 pass |
| photo.test.mjs | 11/11 pass |
| validate-manifest.test.mjs | 12/12 pass |
| validate-manifest.mjs | 0 lỗi, 30 cảnh báo (thiếu clip) |
| scene-qa selftest | 6/6 pass |
| scene-qa.mjs | 0 lỗi nghiêm trọng, cảnh báo SCN-030=11, SCN-031=5, SCN-040=1 |
| services/world (`node --test test/*.test.js`) | 26/26 pass (cần `npm install` trong service) |
| services/auth | 23/23 pass. Lệnh `node --test test/` trong HANDOFF lỗi trên Node 24; dùng `test/*.test.js` |
| vitest: a11y (19) + settings selftest | 20/20 pass (bọc bằng `*.vitest.test.ts`) |

Ghi chú: `package-lock.json` (gốc, auth, world) mới được tạo; không có trong repo trước đó.

## 2026-11-06 — Bước (c) một phần

- MPFB: `Player` truyền `look` và `mpfb` (mặc định bật) cho `Avatar`; `ITOffice` nhận prop `look`. `fixMaterials` đưa thân và mắt về OPAQUE, lông mày MASK (alphaTest 0,4). Test vitest: phân loại vật liệu, chọn tệp, kẹp chiều cao (3 test pass). **Chưa kiểm chứng trên trình duyệt** (không có trình duyệt trên VPS): chưa thấy nhân vật thật, chưa xem lông mày.
- Mount trong `App.tsx`: persist (`createPersistManager`, attach + loadSnapshot; bố cục do máy chủ giữ nên không lưu cục bộ; chưa khôi phục vị trí vì Player đọc spawn khi mount; chưa có chỗ gọi `markDirty` vì chưa có UI đổi look), `LiveRegion` + `announce` (lỗi đăng xuất, lỗi khôi phục, kết quả chụp), `QuickWheel` với `useQuickHost` (airborne luôn false, editorOpen luôn false), chế độ chụp ảnh `src/photo/PhotoMode.tsx` (chỉ camera bám theo; chưa có camera tự do và preset). Kiểm chứng: `tsc --noEmit` sạch tại commit b258678 (build đầy đủ chưa chạy lại sau khi agent khác sửa dở controls). Chưa kiểm chứng trên trình duyệt.
- Đang chạy song song (agent): nối settings + khung tương tác; task 07 + 13; task 21 + 08.

## Tiếp theo
Gộp kết quả agent, chạy lại tsc/test/build, rồi các task còn lại (17, 18, 19, 20, 14, 09...).

## 2026-11-06 — Phiên điều phối đa agent (từ commit 6fff85f)

### Kiểm tra chấp nhận

`/home/cc/gpb-acceptance.sh` không ghi được kết quả: thư mục `/home/cc` thuộc uid 197609, user `cc` không có quyền ghi (`Permission denied` khi tạo `/home/cc/gpb-acceptance.txt` và `/home/cc/gpb-acc-*.log`). Agent không sửa script (ngoài repo). Cách làm: chạy bản sao y hệt script với đường dẫn đầu ra đổi sang `/tmp/gpbacc/` (`sed 's#/home/cc/gpb-acc#/tmp/gpbacc/gpb-acc#g'`). Cần người dùng sửa quyền `/home/cc` hoặc đổi `OUT` trong script.

Lần chạy đầu (6fff85f): mọi bước 0 trừ `t_auth=1` — Node 24 coi `node --test test/` là module, không tìm thấy. Sửa: thêm `services/auth/test/index.js` import các file test.

KET_QUA_CUOI (điền bên dưới).

### Đã làm (mỗi mục có test và đã nối vào app, trừ khi ghi khác)

| Mục | Kết quả |
|---|---|
| 01 | Thêm `chibi.glb` vào manifest với số đo thật; `style: "chibi"` có khoảng chiều cao riêng (không coi chibi là bỏ dùng); `proceduralClips`; kiểm kích thước tệp; dòng MPFB trong THIRD_PARTY. Validator 0 lỗi, 36 cảnh báo |
| 02 | Bước cố định 60 Hz trong `useGtaPlayer`, nội suy tư thế vẽ; state machine 12 trạng thái (chưa nối vào Avatar) |
| 03 | IK hai xương; test trên 3 GLB thật; nối vào MpfbAvatar sau cờ `?ik=1` (chưa xem bằng mắt) |
| 04 | Vỏ trang phục nhiều lớp từ thân, dùng chung skeleton và morph, ẩn da bị che; gắn vào MpfbAvatar |
| 05 | Tầm mắt camera theo chiều cao nhân vật |
| 07 | Phục hồi mất ngữ cảnh WebGL nối vào App (remount Canvas, lưu rồi tải lại) |
| 08 | PerfProbe, HUD `?perf=1`/F3, benchmark `?bench=1`, ngân sách chỉ cảnh báo |
| 09 | NavMarkers 3D, focus trap, tự đi có điều kiện dừng |
| 10 | Tên phím động, bước mới, HelpCenter (F1) |
| 11 | SettingsPanel, đổi phím, tay cầm nối vào điều khiển |
| 12 | Test tĩnh a11y cho panel mới, sửa lỗi aria/tương phản |
| 13 | `useQuality` nối vào Canvas (dpr, đổ bóng), bộ chọn trên HUD |
| 14 | Âm thanh không gian; bước chân; âm khi dùng vật |
| 15 | Hành động xã hội có đồng ý; SocialBar |
| 16 | Camera tự do, preset, hẹn giờ, chụp 2x |
| 17 | Chế độ sắp xếp nội thất: lưới, hoàn tác, đặt lại, lưu có xử lý 409 (it/admin) |
| 18 | Thư viện asset + AssetViewer |
| 19 | Vẽ xăm trên UV (không tải ảnh), hiện trên nhân vật, có trong sao lưu |
| 20 | Xuất/nhập JSON có checksum, migrate, sao lưu vòng, rollback |
| 22 | ProfilePanel; test HTTP thật cho API hồ sơ/nhân vật |
| 24–27 | Lease ghế/vật, khóa sửa, chat chữ, vai trò phòng + `can()`, reconnect/resume/thay phiên; client sau cờ `?world=1` |
| tuongtac.txt | 10 loại vật; khu mẫu trong ITOffice |
| fashion/user.txt | Phòng thay đồ, bộ mẫu, thanh hình thể người thật và chibi |

### Chưa kiểm chứng (cần trình duyệt có GPU; VPS không có)

Mọi phần giao diện và hình ảnh: nhân vật MPFB với vỏ trang phục và xăm, IK, marker minimap, panel mới, âm thanh, chụp ảnh, mất ngữ cảnh WebGL (thử bằng `WEBGL_lose_context`), tay cầm thật, điện thoại thật, trình đọc màn hình. Nhiều người: cần deploy service world và route gateway (`docs/design/DEPLOY_WORLD.md`), rồi thử hai trình duyệt.

### Bị chặn / chưa làm

- 25b thoại theo khoảng cách: cần TURN/SFU, cổng UDP (QĐ-11).
- Clip animation thật, mesh trang phục rời, mũ/phụ kiện: cần asset.
- Vị trí cửa bản lề, máy tính, rèm chưa có trong dữ liệu khu nên chưa đặt vào cảnh (logic và mesh đã có).

### PENDING (docs/design/PENDING_DECISIONS.md, mỗi mục 2 phương án)

1. 11 khu ngoài hình chữ L. 2. Bàn đối diện. 3. Trần draw call (vật tương tác mới thêm khoảng 12–14 draw call, vỏ trang phục thêm một draw call mỗi món). 4. Múa võ, tập quyền.
