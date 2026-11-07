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

## 2026-11-07 — Lần lặp 2, kết quả đợt 1–3

### Acceptance, push, deploy

| Commit | Acceptance | Push origin/main | Bundle | Deploy production | Test production |
|---|---|---|---|---|---|
| efe00e6 | PASS 11:51 (e2e 32) | có | /home/cc/bundles/gpb-efe00e6.bundle | 12:10 UTC (watcher root) | 3/4, 20-controls hỏng do tải; chạy lại riêng PASS |
| 54e6406 | FAIL (2 e2e quá thời gian do load ~98) | — | — | — | — |
| 6137383 | FAIL (03-login-real: .env test mới xuất hiện, preview trỏ auth production) | — | — | — | — |
| d71e1be | FAIL (20-controls quá 240 s) | — | — | — | — |
| b75a255 | FAIL (10-panels Thư viện: thẻ đổi sang role option, test cập nhật) | — | — | — | — |
| 6cadd19 | **PASS** 13:41 (e2e 47, gồm đăng nhập thật qua auth kiểm thử) | có | /home/cc/bundles/gpb-6cadd19.bundle | 14:01 UTC | **4/4 PASS** (BROWSER_QA.md) |

Ghi chú hạ tầng:
- /home/cc/handoff-20261107 thuộc root, user cc không ghi được, nên bundle đặt ở /home/cc/bundles/.
- Root chạy watcher (/home/cc/handoff-20261107/watcher.sh) tự deploy khi /home/cc/gpb-acceptance.txt có RESULT=PASS, theo đúng các bước sao lưu, tag image, build web. Smoke test của watcher lỗi vì root chưa cài trình duyệt Playwright; điều phối viên chạy test production bằng user cc.
- e2e_with_stub.sh không khởi động được stub (ghi log vào thư mục root). Đăng nhập thật dùng auth kiểm thử 127.0.0.1:3902 qua biến mới `GPB_PREVIEW_AUTH_API` (vite.config.ts); webServer trong /home/cc/gpb-e2e/playwright.config.ts đặt mặc định biến này.
- Spec mới thêm vào /home/cc/gpb-e2e/tests: 23-ik, 24-asset-viewer, 25-camera, 26-autowalk, 27-mobile, 28-overview (+ camera-helpers.ts). Bản gốc nằm trong repo ở e2e-new/.

### Nhánh đã gộp (worktree /home/cc/wt/<tên>)

world (15, 26, 27), ik (03), auth22 (22), remote (avatar từ xa phát hành động), assets01 (01, 02), appear (world gửi ngoại hình), interact (va chạm cửa, bàn, cửa sổ sau rèm), fashion (mũ, 41 phụ kiện, họa tiết, tab Phụ kiện/Họa tiết, sửa mất thân trong phòng thay đồ, mép hông, mép cổ, điện thoại trong túi, tóc né mũ), camera (05, 09 sửa kẹt tự đi), mobile (joystick cảm ứng, HelpCenter modal, axe), overview (xem tổng thể, phím O), ik2 (cầm cốc, điện thoại, tay lên bàn), body (dài tay/chân/cổ, cong lưng).

### Còn lại

- Bị chặn bởi hạ tầng hoặc asset: 25b thoại (TURN/SFU); 23–27 cần deploy service world và route gateway; 22 cần deploy auth mới; 01/02 cần GLB đồ đạc, clip thật, bằng chứng license MPFB; 12 cần trình đọc màn hình thật.
| 48631c6 | **PASS** 14:08 (e2e 47) | có | /home/cc/bundles/gpb-48631c6.bundle | 14:26 UTC | **4/4 PASS** |

(48631c6 gồm thanh hình thể bằng xương và fashion đợt 3: mép cổ, điện thoại trong túi, tóc né mũ.)

Không tạo PROJECT_COMPLETE.txt: 22–27 cần deploy service auth/world (ngoài phạm vi quy trình deploy chỉ cho web), 25b cần TURN/SFU, 01/02 cần asset, 12 cần trình đọc màn hình thật. Cần chủ dự án quyết định có cho deploy services/auth và services/world hay không.

## 2026-11-07 — Lần lặp 3, đợt 1

Bắt đầu từ main 39280bf (chỉ tài liệu sau 48631c6; 48631c6 đã PASS acceptance, đã deploy, test production 4/4 PASS).

TASK_STATUS: Thời trang → ĐÃ LÀM (39ffb11 đã có trên production). Nội thất và trần, Hình chữ L → ĐÃ LÀM theo PENDING_DECISIONS mục 1, 2, 3.

| Subagent | Worktree / nhánh | Task | Cổng preview |
|---|---|---|---|
| multi | /home/cc/wt/multi, wt3/multi | 23–27: kiểm hai trình duyệt bằng service world cục bộ 127.0.0.1:3903 + auth kiểm thử 3902 (không đụng production) | 4191 |
| assets3 | /home/cc/wt/assets3, wt3/assets3 | 01, 02: GLB bàn/ghế/phụ kiện và clip bake từ mã, socket neck/foot, rotationDeg | 4192 |
| tuong3 | /home/cc/wt/tuong3, wt3/tuong3 | Đối chiếu tuongtac/room/fashion với mã, làm phần còn thiếu | 4193 |
| a11y3 | /home/cc/wt/a11y3, wt3/a11y3 | 12: axe toàn bộ panel, bàn phím, aria snapshot; checklist trình đọc màn hình | 4194 |

Vẫn chặn ngoài phạm vi quy trình deploy (chỉ dịch vụ web): deploy services/auth (22) và services/world + route gateway (23–27) lên production; 25b cần TURN/SFU.

## 2026-11-07 — Lần lặp 3, kết quả đợt 1

| Commit | Acceptance | Push origin/main | Bundle | Deploy production | Test production |
|---|---|---|---|---|---|
| ab407c7 (tuong3) | FAIL ×2 (spec dang dở trong tests/, rồi e2e bị pkill), PASS 18:15 (e2e 47) | có | /home/cc/bundles/gpb-ab407c7.bundle | ~18:35 UTC (watcher root) | 4/4 PASS |
| 8fb740a (a11y3, multi) | FAIL (e2e bị pkill), PASS 18:53 (59 pass, 5 skip) | có | /home/cc/bundles/gpb-8fb740a.bundle | ~19:15 UTC (watcher root) | 4/4 PASS, asset hash khớp bản build riêng |

Nhánh đã gộp: tuong3 (xem trước đặt vật, thả rơi, rèm và ánh sáng, Đặt lại vật, bảng audit), a11y3 (useReturnFocus, nhãn nút, e2e 30-a11y-full), multi (GPB_PREVIEW_WORLD_API, WorldDebug, scripts/e2e/world-local.sh, e2e 29-multiplayer), assets3 (GLB và clip tự sinh, socket, manifest), tuong4 (quan sát đồ nhỏ, lease vật cầm, 5 preset camera, lọc và xuất/nhập ở phòng thay đồ).

Hạ tầng: subagent từng chạy `pkill -f playwright`, giết acceptance hai lần; đã cấm, chỉ kill đúng PID. Spec dang dở để ở /home/cc/gpb-e2e/pending/ cho tới khi gộp. axe-core đặt cố định ở /home/cc/gpb-e2e/vendor/axe.min.js. Tài khoản test thứ hai e2e-test2@test.invalid chỉ có trong DB kiểm thử /home/cc/e2e-auth-data (TEST_EMAIL2/TEST_PASSWORD2 trong .env quyền 600).

Chủ dự án cần quyết: (1) có cho deploy services/auth và services/world cùng route gateway `/api/world` không (22–27 chỉ còn thiếu bước này; quy trình deploy hiện chỉ cho web); (2) license chính thức của repo cho asset tự sinh (manifest ghi LicenseRef-GPB-project) và đối chiếu license 3 GLB MPFB; (3) 25b thoại cần TURN/SFU.

| 1235903 (assets3, tuong4) | PASS 19:22 (59 pass, 5 skip) | có | /home/cc/bundles/gpb-1235903.bundle | ~19:45 UTC (watcher root) | 4/4 PASS, GLB mới phục vụ đúng |

Không tạo PROJECT_COMPLETE.txt: 01, 02, 12, 22–27 vẫn MỘT PHẦN vì các lý do trên (asset/license, trình đọc màn hình thật, deploy service).
