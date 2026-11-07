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

Kết quả cuối (commit 9eb4365, chạy bản sao script ra `/tmp/gpbacc/gpb-acceptance.txt`): tsc=0, build=0, t_persist=0, t_quick=0, t_photo=0, t_manifest=0, v_manifest=0, t_sceneqa=0, v_sceneqa=0, t_auth=0 (35 test), t_world=0 (66 test), t_vitest=0 (35 file, 625 test). **RESULT=PASS.** Thêm ngoài script: `node --test src/minimap/core/test/*.test.mjs` 32/32.

Rà soát: một agent chỉ đọc rà phần nối module, tìm 5 lỗi thật và đã sửa ở 9eb4365 (canvas cũ phát mất ngữ cảnh sau remount gây vòng tải lại; cờ tạm dừng bị tranh chấp giữa chụp ảnh, phòng thay đồ, mất ngữ cảnh — thay bằng `holdPause`; StrictMode làm hỏng bộ phục hồi và phiên xã hội; phím E nhấc vật khi đang sắp xếp; mức chất lượng lệch sau khi đổi cài đặt). Agent cũng sửa một lỗi dữ liệu do agent con tạo: chibi bị đánh dấu `deprecated` trong manifest dù là lựa chọn chính thức.

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

### GitHub

**Chưa push.** Điều kiện push là `/home/cc/gpb-acceptance.txt` có RESULT=PASS, nhưng tệp này không tạo được vì `/home/cc` không cho user `cc` ghi. Kết quả PASS chỉ có ở bản sao `/tmp/gpbacc/gpb-acceptance.txt` (cùng nội dung script, đổi đường dẫn đầu ra). TASK_STATUS.csv không còn mục CHƯA LÀM hay ĐANG CHẠY. Khi người dùng sửa quyền (hoặc xác nhận chấp nhận bản sao), chạy lại `bash /home/cc/gpb-acceptance.sh` rồi `git push origin auto/20261106` và `git push origin auto/20261106:main`. Nhánh local có 16 commit mới so với 6fff85f.

## 2026-11-07 — Lần lặp 2, đợt 1 (tăng tốc, nhiều worktree)

Nhánh làm việc: `main` (đã fast-forward lên 8f3c99f, trùng `origin/main`). Không dùng `auto/20261106` nữa.

Acceptance trên 8f3c99f (11:11 UTC): mọi bước 0 trừ `e2e=1` → **FAIL**. 3 test e2e hỏng: 22-objects (máy tính không mở panel; cửa kho không chuyển sang "Đóng cửa"), 20-controls (góc đầu khi kéo nhanh 25,8° < 30°, nghi do khung chậm khi 8 worker). Chưa deploy, chưa push.

Production: vẫn chạy image `gpb-tool/web:backup-20261107T102845Z` (tag local trùng), gateway trả 200.

| Subagent | Worktree / nhánh | Task | Cổng preview |
|---|---|---|---|
| e2efix | /home/cc/wt/e2efix, wt2/e2efix | sửa 3 e2e hỏng (duy nhất được sửa /home/cc/gpb-e2e/tests) | 4181 |
| world | /home/cc/wt/world, wt2/world | 15 (lời mời xã hội qua WS), 26 (lưu vai trò, chuyển owner), 27 (test mạng chập chờn) | 4182 |
| interact | /home/cc/wt/interact, wt2/interact | tuongtac: va chạm cửa theo trạng thái, bàn máy tính chặn, cửa sổ sau rèm | 4183 |
| ik | /home/cc/wt/ik, wt2/ik | 03: neo ghế, grip cốc/điện thoại, cân nhắc bật IK mặc định | 4184 |
| fashion | /home/cc/wt/fashion, wt2/fashion | 04 + fashion.txt: mũ/phụ kiện, mép cổ áo/hông, họa tiết | 4185 |
| camera | /home/cc/wt/camera, wt2/camera | 05 (e2e camera trong cảnh, phục hồi khi server ghi đè vị trí), 09 (tự đi qua Player) | 4186 |

Tiếp theo: gộp từng nhánh khi xanh (tsc, vitest, build), chạy acceptance đầy đủ, push `main`, bundle vào /home/cc/handoff-20261107/, deploy production.
