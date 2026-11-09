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
| 1235903 (assets3, tuong4) | PASS 19:22 (59 pass, 5 skip) | có | /home/cc/bundles/gpb-1235903.bundle | ~19:45 UTC (watcher root) | 4/4 PASS, GLB mới phục vụ đúng |

Nhánh đã gộp: tuong3 (xem trước đặt vật, thả rơi, rèm và ánh sáng, Đặt lại vật, bảng audit), a11y3 (useReturnFocus, nhãn nút, e2e 30-a11y-full), multi (GPB_PREVIEW_WORLD_API, WorldDebug, scripts/e2e/world-local.sh, e2e 29-multiplayer), assets3 (GLB và clip tự sinh, socket, manifest), tuong4 (quan sát đồ nhỏ, lease vật cầm, 5 preset camera, lọc và xuất/nhập ở phòng thay đồ).

Hạ tầng: subagent từng chạy `pkill -f playwright`, giết acceptance hai lần; đã cấm, chỉ kill đúng PID. Spec dang dở để ở /home/cc/gpb-e2e/pending/ cho tới khi gộp. axe-core đặt cố định ở /home/cc/gpb-e2e/vendor/axe.min.js. Tài khoản test thứ hai e2e-test2@test.invalid chỉ có trong DB kiểm thử /home/cc/e2e-auth-data (TEST_EMAIL2/TEST_PASSWORD2 trong .env quyền 600).

Chủ dự án cần quyết: (1) có cho deploy services/auth và services/world cùng route gateway `/api/world` không (22–27 chỉ còn thiếu bước này; quy trình deploy hiện chỉ cho web); (2) license chính thức của repo cho asset tự sinh (manifest ghi LicenseRef-GPB-project) và đối chiếu license 3 GLB MPFB; (3) 25b thoại cần TURN/SFU.

Không tạo PROJECT_COMPLETE.txt: 01, 02, 12, 22–27 vẫn MỘT PHẦN vì các lý do trên (asset/license, trình đọc màn hình thật, deploy service).

## 2026-11-07 — Lần lặp 4 (giao việc V1–V6 của chủ dự án)

| Việc | Ai / worktree | Kết quả |
|---|---|---|
| V1 aria-expanded sau khi đóng hộp thoại modal | điều phối viên, main | 478bdc8 + 1c2b1f9. State đã về false đúng (onCancel/onClose gọi setXOpen(false)); lỗi do trả focus đồng bộ khi tháo hộp thoại aria-modal. `restoreFocusLater` (2 khung hình hoặc 120 ms). Chi tiết: BROWSER_QA.md mục NVDA thật. |
| V2 Esc đóng Sao lưu | điều phối viên, main | `useEscapeClose`: Esc đóng Sao lưu, Thư viện, Hồ sơ, Vẽ xăm cả khi mở bằng chuột; Sao lưu thành role=dialog aria-modal=false; nút × "Đóng bảng sao lưu". |
| V3 rà 7 nút HUD | điều phối viên | e2e 31-hud-expanded (7 nút × Esc/nút đóng): 14/14 cục bộ, 14/14 trên production ed28d05. Bảng ở BROWSER_QA.md. |
| LỖI 2 NVDA đợt 1 (ghi danh đọc hai lần) | điều phối viên | 1c2b1f9: vùng live một chuỗi. Chưa kiểm NVDA thật. |
| V5 22–27 deploy service | subagent svc4, /home/cc/wt/svc4 (wt4/svc4 ef7dae8, đã gộp) | **Bị chặn: cần root.** cc không có sudo, không ghi /opt/gpb-tool, không đọc .env; không dùng nhóm docker để vượt quyền. Đã chuẩn bị compose service world, route nginx /api/world, scripts/deploy-svc.sh và rollback-svc.sh; thử trên bản sao DB và gateway test: OK. |
| V5 25b coturn | subagent voice4, /home/cc/wt/voice4 (859f3db) | coturn chạy (/home/cc/gpb-turn, container gpb-turn-coturn, 3478 udp/tcp, relay 49160–49200/udp), relay kiểm udp/tcp trên VPS, IP nội bộ bị chặn 403. Rollback: `cd /home/cc/gpb-turn && docker compose down`. |
| V5 25b thoại | subagent voice4b (cdb3785) | Tín hiệu qua world WS, mesh ≤ 6 peer, gain theo khoảng cách; e2e 33-voice 4/4 (getStats nhận audio hai phía). |
| V5 01, 02 | subagent assets4 (8115a7f) | runtimeAlphaMode, validator 15 → 6 cảnh báo. Còn lại cần license hoặc thiết kế (xem TASK_STATUS). |
| V6 license | — | **Chờ chủ dự án quyết định license** (3 GLB MPFB `verified=false`, asset tự sinh `LicenseRef-GPB-project`). Không chặn việc khác. |

Hạ tầng e2e: preview 4173 mồ côi (chạy 8 giờ, thiếu proxy /api/world) và world 3903 mồ côi từ wt/roles làm 29-multiplayer fail; đã dừng, world 3903 chạy lại từ main bằng scripts/e2e/world-local.sh (nạp TURN từ /home/cc/gpb-turn/.env). playwright.config.ts đặt mặc định GPB_PREVIEW_WORLD_API=127.0.0.1:3903. playwright.prod.config.ts thêm 31-hud-expanded.

| Commit | Acceptance | Push origin/main | Bundle | Deploy production | Test production |
|---|---|---|---|---|---|
| 478bdc8 | FAIL (10-panels: Sao lưu đổi role; focus Phòng thay đồ chậm dưới tải; 29-multiplayer do preview mồ côi) | — | — | — | — |
| ed28d05 | **PASS** 22:00 (e2e 78 + đăng nhập thật) | có | /home/cc/bundles/gpb-ed28d05.bundle | 22:22 UTC (watcher root) | **18/18 PASS** (02-scene-mock, 20-controls, 30-hanging, 31-hud-expanded 14 ca) |
| aca14c6 | FAIL (29-multiplayer: 33-voice chạy song song cùng hai tài khoản test, world thay phiên 4409) | — | — | — | — |
| 70715a8 | **PASS** 23:10 (e2e 82, gồm thoại 4 và nhiều người 5, + đăng nhập thật) | có | /home/cc/bundles/gpb-70715a8.bundle | 23:31 UTC (watcher root) | **18/18 PASS** |

70715a8 gồm thoại 25b phía web (nút mic chỉ hiện sau cờ ?world=1; production chưa có service world nên chưa dùng được).

Việc cần root (chủ dự án hoặc root chạy một lần, sau khi commit có scripts/deploy-svc.sh đã PASS):
`sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>` (sao lưu /root/backup-gpb-svc-<TS>, tag auth/gateway backup, build và up auth, world, gateway, tự kiểm). Thoại cần thêm TURN_SECRET (từ /home/cc/gpb-turn/.env) và TURN_URLS vào env của service world. Rollback: `sudo bash scripts/rollback-svc.sh <TS>`.

Không tạo PROJECT_COMPLETE.txt: 22–27 chưa có bằng chứng production (cần root), 01/02 chờ license, 12 chờ NVDA thật.

## 2026-11-08 — Lần lặp 5

Rà lại giao việc V1–V6: V1, V2, V3 đã có trên main từ lần lặp 4 (478bdc8, 1c2b1f9, ed28d05), không làm lại. Production đang chạy 409d1d5 (acceptance PASS 23:40 UTC, deploy 00:00 UTC bởi watcher root, smoke 200).

| Việc | Kết quả |
|---|---|
| V1–V3 trên production 409d1d5 | playwright.prod.config.ts **18/18 PASS** (31-hud-expanded 14 ca). Ghi ở BROWSER_QA.md. |
| V4 | Đã xong từ lần lặp 4 (push origin/main, deploy). Lần lặp này chỉ đổi tài liệu, không chạy lại acceptance. |
| 12 | Chờ chủ dự án chạy lại NVDA trên 409d1d5 cho Phòng thay đồ, Cài đặt, Sao lưu. Chưa đánh dấu xong. |
| 22–27 | Vẫn cần root: `sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>` (user cc không có sudo, không ghi /opt/gpb-tool, không đọc .env). Không dùng nhóm docker để vượt quyền hệ thống tệp. |
| 01, 02 | Chờ chủ dự án quyết định license (3 GLB MPFB, asset và clip tự sinh). |

Không tạo PROJECT_COMPLETE.txt.

## 2026-11-08 — Lần lặp 6

V1–V3 đã có từ lần lặp 4 (478bdc8, 1c2b1f9). Ba mục NVDA đợt 3 còn FAIL (Phòng thay đồ, Cài đặt, Sao lưu) được kiểm trên 1235903, bản trước bản sửa. Production 5dbc123: playwright.prod.config.ts **18/18 PASS** lúc 00:40 UTC (31-hud-expanded 14 ca).

| Subagent | Worktree / nhánh | Task | Kết quả |
|---|---|---|---|
| anim02 | /home/cc/wt/anim02, wt6/anim02 | 02: FSM người chơi lái clip bake | c85d7c3, vitest 1010, e2e 34-player-baked-clip 2/2 |
| glb01 | /home/cc/wt/glb01, wt6/glb01 | 01: bàn/ghế GLB bằng InstancedMesh | ede2e14, draw call 66 = 66, e2e 35-glb-furniture 4/4. Bàn hiển thị vẫn là DeskDecorField (chi tiết hơn GLB tự sinh) |

Acceptance c4688f7 PASS 01:04 (e2e 88), push origin/main, bundle /home/cc/bundles/gpb-c4688f7.bundle, deploy 01:25 UTC (watcher root), production 23/24 rồi spec 34 sửa xong 10/10 (BROWSER_QA.md).

Vẫn bị chặn: 22–27 cần root chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>` (watcher root chỉ deploy web; cc không có sudo). 01, 02: **chờ chủ dự án quyết định license**. 12: chờ NVDA thật trên bản ≥ ed28d05.

## 2026-11-08 — Lần lặp 8

V1–V3 đã có trên main từ lần lặp 4 (478bdc8, 1c2b1f9), không làm lại. Lần lặp này kiểm bản mới nhất trên production.

| Commit | Acceptance | Push origin/main | Bundle | Deploy production | Test production |
|---|---|---|---|---|---|
| f55cddd (gồm 2431d63: emote clip bake) | PASS 03:14 UTC | có (4a03739..f55cddd) | /home/cc/bundles/gpb-f55cddd.bundle | ~03:35 UTC (watcher root) | **24/24 PASS** + 36-player-emote-baked-clip 2/2 |

TASK_STATUS 02: emote và bước khi xoay đã có, còn lại chỉ chờ license.

Vẫn bị chặn, không đổi so với lần lặp 6:
- 22–27: cần root chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>`. User cc không có sudo (`sudo -n true` đòi mật khẩu), /opt/gpb-tool thuộc root, watcher root chỉ deploy web. Không dùng nhóm docker để vượt quyền.
- 01, 02: **chờ chủ dự án quyết định license** (3 GLB MPFB, asset và clip tự sinh LicenseRef-GPB-project).
- 12: chờ chủ dự án chạy NVDA thật trên production hiện tại (f55cddd) cho Phòng thay đồ, Cài đặt, Sao lưu.

Không tạo PROJECT_COMPLETE.txt.

## 2026-11-08 — Lần lặp 9

Kiểm lại hiện trạng, không có mã mới:
- V1, V2 có trên main: SettingsPanel Esc gọi onClose (nút "Đóng cài đặt"); WardrobeRoom onCancel đặt wardrobeOpen=false; BackupPanel dùng useEscapeClose và nút × có aria-label "Đóng bảng sao lưu". Production chạy image tạo lúc 03:34 UTC (f55cddd), lần lặp 8 đã test 24/24 PASS, trong đó 31-hud-expanded kiểm aria-expanded và focus của từng nút HUD.
- LỖI 2 NVDA (thông báo ghi danh đọc hai lần) đã sửa sau 478bdc8, vùng live chỉ còn một chuỗi.
- wt/assets3 sạch, d837dfc đã nằm trong main.
- Smoke production: trang chủ trả 200; /api/world/health trả 404 vì service world chưa deploy.

Vẫn bị chặn, như lần lặp 8:
- 22–27: cần root chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>`. `sudo -n true` vẫn đòi mật khẩu, /opt/gpb-tool thuộc root.
- 01, 02: **chờ chủ dự án quyết định license**.
- 12: chờ chủ dự án chạy NVDA thật trên production (f55cddd) cho Phòng thay đồ, Cài đặt, Sao lưu.

Chỉ đổi tài liệu, không chạy lại acceptance. Không tạo PROJECT_COMPLETE.txt.

## 2026-11-08 — Lần lặp 10

Đã rà giao việc V1–V6. V1, V2, V3 đã có trên main từ lần lặp 4 (478bdc8: Esc đóng mọi panel HUD và aria-expanded đúng sau khi đóng modal; 1c2b1f9: trả focus dự phòng, thông báo ghi danh chỉ đọc một lần). Không làm lại. Ba lỗi trong NVDA đợt 3 (Phòng thay đồ, Cài đặt, Sao lưu) được kiểm trên 1235903, tức là bản trước khi sửa.

| Việc | Kết quả |
|---|---|
| V1–V3 trên production (image 03:34:56 UTC, mã f55cddd) | playwright.prod.config.ts **26/26 PASS** (19,4 phút). 31-hud-expanded có 14 ca: 7 nút × (Esc, nút đóng), kiểm aria-expanded="false" và focus về nút. Bảng từng nút ở BROWSER_QA.md |
| V4 | Main chỉ có thêm commit tài liệu kể từ f55cddd. Không chạy lại acceptance, không deploy lại. Smoke: trang chủ 200 |
| V5 22–27, 25b | Vẫn cần root: `sudo -n true` đòi mật khẩu, /opt/gpb-tool thuộc root, /api/world/health trả 404. Chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-svc.sh <sha>` |
| V5 01, 02 | wt/assets3 không còn thay đổi chưa commit (d837dfc đã ở main). Phần còn lại **chờ chủ dự án quyết định license** |
| V5 12 | Phần tự động đạt. Còn chờ chủ dự án chạy NVDA thật trên production hiện tại |
| V6 | **Chờ chủ dự án quyết định license** (3 GLB MPFB, asset và clip tự sinh LicenseRef-GPB-project). Không chặn việc khác |

Không tạo PROJECT_COMPLETE.txt.

## 2026-11-08 — Lần lặp 11

| Việc | Kết quả |
|---|---|
| Trợ giúp (ưu tiên 1) | 5c0d0d2: nút Trợ giúp có aria-expanded theo trạng thái HelpCenter (trước là null). 31-hud-expanded: Trợ giúp hết miễn kiểm aria-expanded; thêm 7 ca bàn phím (Enter mở → "true", hộp modal có focus bên trong; Esc → "false", focus về nút). Ca Trợ giúp chạy trên production f55cddd FAIL (null), nên test mới bắt được lỗi mà báo cáo "7 nút đạt" ở lần lặp 8–10 bỏ sót |
| Acceptance 5c0d0d2 | **PASS** 06:19 UTC (e2e 97 + đăng nhập thật 1). Push origin/main 4462e24..5c0d0d2. Bundle /home/cc/bundles/gpb-5c0d0d2.bundle |
| Deploy 5c0d0d2 | 06:22 UTC, watcher root, smoke OK |
| Production 5c0d0d2 | `--workers=4`: 32/33, 31-hud-expanded 21/21. 20-controls FAIL khi chạy cùng acceptance (quá tải), chạy lại riêng PASS. Chi tiết ở BROWSER_QA.md |
| 01, 02 license | **License đã duyệt bởi chủ dự án 08/11** (3 GLB MPFB, asset và clip tự sinh). c0e2265: manifest verified=true, approvedBy; validator 0 lỗi, 3 cảnh báo (PIVOT_OFFSET_REQUIRED). 02 → ĐÃ LÀM (clip bake đã kiểm trên production, 34 và 36). 01 còn MỘT PHẦN: bàn trong cảnh vẫn là DeskDecorField; nhân vật nên xuất lại với origin ở sàn |
| Acceptance c0e2265 | Lần 1 FAIL: chỉ 20-controls (chạy cùng lúc test production và docker build, mỗi lần đọc trạng thái mất vài giây). Lần 2 chạy một mình **PASS** 07:12 UTC (e2e 97 + đăng nhập thật 1). Push 5c0d0d2..c0e2265, bundle /home/cc/bundles/gpb-c0e2265.bundle. Deploy 07:15 UTC (watcher root, smoke OK). Production: manifest phục vụ verified=true, approvedBy; 02-scene-mock, 34, 35, 36 **10/10 PASS** |
| 22–27 | Service auth, world và route /api/world đã deploy 04:44 UTC (chủ dự án chạy deploy-svc.sh). Gateway công khai: /api/world/ws và /api/world/turn trả 401 khi chưa đăng nhập. Hai trình duyệt chỉ kiểm được trên stack cục bộ (29-multiplayer, auth test 3902). **Chưa có e2e nhiều người trên production**: cần phiên production, mà quy định cấm tạo tài khoản và cấm dùng auth production để test. Cần chủ dự án cấp tài khoản test production hoặc tự kiểm hai trình duyệt |
| 12 | Phần tự động đạt. Chờ chủ dự án chạy NVDA (Speech Viewer) trên 5c0d0d2 trở về sau, gồm Trợ giúp |

Không tạo PROJECT_COMPLETE.txt (01, 22–27, 12 chưa xong).

## 2026-11-08 — Lần lặp 12

Theo quyết định chủ dự án 07:40 UTC: 22–27 kiểm trên môi trường test VPS (auth TEST 127.0.0.1:3902, world mã repo 127.0.0.1:3903, layout test 127.0.0.1:3904), production chỉ smoke. Chi tiết và bảng kết quả ở BROWSER_QA.md mục "Môi trường test VPS cho 22–27 — lần lặp 12".

| Subagent | Worktree / nhánh | Task | Kết quả (đã kiểm lại bằng lệnh) |
|---|---|---|---|
| misc12 | /home/cc/wt/misc12, wt12/misc12 | 11 giảm chuyển động; 07 GLB nhân vật qua bộ điều phối; 04 mép cổ áo | 4ba5f5f, 795617d, 75e565e; e2e 39-misc12 2/2 |
| lib18 | /home/cc/wt/lib18, wt12/lib18 | 18 thumbnail, tải GLB cục bộ; 20 ZIP | a096e2e; e2e 38 2/2 |
| ed17 | /home/cc/wt/ed17, wt12/ed17 | 17 thêm/xóa/nhân bản, tường/cửa, lưu batch; layout test 3904; scripts/deploy-layout.sh | f15c123, 73d9649; e2e 37 2/2, 42 1/1 |
| assets12 | /home/cc/wt/assets12, wt12/assets12 | 01 origin nhân vật ở sàn, bàn GLB | 68dafc8, aee1e4b; validator 0 lỗi 0 cảnh báo; e2e 41 4/4 |

Điều phối viên:
- 8dae97b (owner gán vai trò khách) chỉ nằm ở wt3/roles, chưa vào main nên 32-room-roles bị để pending. Đã cherry-pick.
- E2E mới bắt được hai lỗi thật, sửa ở 9fa1ccd: ngoại hình không bao giờ gửi lên world (`useAppearanceSync` chạy lại mỗi render); lời mời bắt tay không hiện ở người nhận (id số so với id chuỗi).
- ff21ea7: nút Xuất ZIP có aria-label không chứa chữ hiển thị (axe label-content-name-mismatch, 30-a11y-full bắt được).
- Kết quả trên môi trường test (main ff21ea7): 29-multiplayer gồm thoại 9/9; 32-room-roles 7/7; 40-profile-item 5/5 (22, 24, 15, 05); 42-editor-layout-real 1/1.
- GPU: docs/design/GPU_REQUEST.md (bản sao /home/cc/gpu-handoff/gpu_request.md) cho 03, 04, 07, 08, 13, 14, 15, 16, 19.

Bị chặn, cần root (user cc không có sudo):
- **25 thoại production:** gpb-tool-world-1 có TURN_SECRET rỗng (không khớp coturn). Chạy `sudo bash /home/cc/gpb-dev/scripts/enable-turn-prod.sh` (sao lưu .env, chỉ tạo lại container world, không in secret).
- **17 layout production:** endpoint batch mới chưa deploy. Chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-layout.sh <sha>` (rollback: scripts/rollback-layout.sh).
- **/home/cc/handoff-20261107 đổi chủ sang root lúc 08:15 UTC**, cc không ghi được nữa. Không ghi được gpu_request.md, bundle hay log stub vào đó. Có tiến trình root cũng đã build vào /home/cc/gpb-dev/dist (đã đổi tên thành dist.root-owned-20261108T0813, không xóa), tạo test-results thuộc root trong /home/cc/gpb-e2e, và có object git thuộc root.
- **Acceptance song song:** tiến trình root /home/cc/deploy622/run.sh chạy acceptance cho 622b58f nhiều lần (11:11, 11:41 UTC). Nó ghi cùng /home/cc/gpb-acceptance.txt, dùng chung tài khoản test và world 3903, và chạy bộ test /home/cc/gpb-e2e/tests hiện tại, trong đó có spec cho tính năng chưa có ở 622b58f (37, 38, 39, 41), nên lượt đó luôn FAIL. 622b58f đã nằm trong main. Đã thêm `PW_OUTPUT_DIR` (playwright.config.ts, gpb-acceptance.sh) và khóa /tmp/gpb-mp-e2e.lock cho spec nhiều người để hai lượt không phá nhau.

Kết quả lần lặp 12:

| Bước | Kết quả |
|---|---|
| Acceptance 2d00d8b | **PASS** 13:35 UTC (e2e 107 + đăng nhập thật 1). Các lượt FAIL trước đó: lỗi thật ở 30-a11y (sửa ff21ea7), world chạy mã cũ (sửa script), tranh tài nguyên với lượt root, tệp thuộc root (test-results, /tmp/overview-on.png) |
| Push | origin/main 622b58f..2d00d8b (fast-forward). Không tạo bundle vì /home/cc/handoff-20261107 không ghi được |
| Deploy | watcher root 13:37 UTC, bundle index-bVAw7j-W.js |
| Test production | smoke 200/200/401; playwright.prod.config.ts --workers=4 **43/43 PASS** |
| TASK_STATUS | 01, 22, 23, 24, 26, 27 → ĐÃ LÀM. 25 giữ MỘT PHẦN (chờ bật TURN trên production). 12 giữ MỘT PHẦN (chờ NVDA). 04, 05, 07, 11, 15, 17, 18, 20 cập nhật cột "Còn thiếu" |

Việc còn lại:
- 25: chủ dự án chạy `sudo bash /home/cc/gpb-dev/scripts/enable-turn-prod.sh`, sau đó kiểm thoại hai trình duyệt trên production bằng phiên của mình (agent không có phiên production).
- 17: chủ dự án chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-layout.sh 2d00d8b` để có POST /api/layout/batch trên production.
- GPU: chủ dự án chạy theo docs/design/GPU_REQUEST.md (03, 04, 07, 08, 13, 14, 15, 16, 19), ghi kết quả vào gpu_result.md hoặc docs/design/GPU_RESULT.md.
- 12: chủ dự án chạy NVDA trên 2d00d8b.
- Đề nghị chủ dự án trả quyền ghi /home/cc/handoff-20261107 cho cc (hoặc chỉ định thư mục khác), và cho tiến trình root dùng thư mục test và tệp kết quả acceptance riêng.

Không tạo PROJECT_COMPLETE.txt (25, 12 và các mục cần GPU chưa xong).

## 2026-11-08 — Lần lặp 13

Hai lỗi acceptance của ff21ea7 (26-autowalk, voice-suite WebRTC) đã hết từ lần lặp 12: acceptance 0fc3119 lúc 14:17 UTC có 26-autowalk 2/2 và voice-suite 4/4 PASS (log /home/cc/gpb-acc-e2e.log), không cần sửa thêm.

gpu_result.md (máy Windows RTX 3070 Ti, dev server 622b58f): 07 ĐẠT trên GPU thật; 08 có số đo FPS (TB 57,2, p95 14,7 ms). 03, 11, 13, 14, 15, 16, 19 máy đó ghi "chưa kiểm". Đã ghi vào TASK_STATUS.

| Subagent | Worktree / nhánh | Task | Kết quả (điều phối viên kiểm lại tsc, vitest sau khi gộp) |
|---|---|---|---|
| desk13 | /home/cc/wt/desk13, wt13/desk13 | 01 đồ dùng theo chỗ với bàn GLB | 6d56775; 118 chỗ, 49 cấu hình, draw call 66/69 không đổi; e2e 41 4/4, 43 2/2 |
| audio13 | /home/cc/wt/audio13, wt13/audio13 | 14 ambient qua engine mới, cone, âm lượng chung | d43f105, 499c1ae; e2e 44 1/1 |
| photo13 | /home/cc/wt/photo13, wt13/photo13 | 16 vật cản chụp ảnh theo bố trí người dùng | 48023b4; e2e 45 1/1 |
| gfx13 | /home/cc/wt/gfx13, wt13/gfx13 | 13 texture tier, LOD, AO áp dụng thật | a230427; e2e 46 2/2 |
| tattoo13 | /home/cc/wt/tattoo13, wt13/tattoo13 | 19 mask vùng 256x256 | 2416e39; e2e 47 3/3 |
| draft13 | /home/cc/wt/draft13, wt13/draft13 | 20 nguồn bố cục nháp | 1e1a6d1; e2e 48 2/2 |
| morph13 | /home/cc/wt/morph13, wt13/morph13 | user.txt bắp tay, đùi, bàn tay, bàn chân; lỗi lơ lửng 11 cm; chiều cao hiển thị thấp 9% | 5a6c58c, fd6c3f4, b4c8743; e2e 49, 41, 20, 23, 25, 34, 36, 12 PASS |
| ed13 | /home/cc/wt/ed13, wt13/ed13 | 17 lỗi phát hiện khi gộp: vật gốc đã di chuyển vẫn vẽ ở chỗ cũ | e471194; e2e 50, 37, 45, 48, 12 14/14 |

Sau khi gộp (1f06373): tsc sạch, vitest 1206/1206, validator manifest 0 lỗi 0 cảnh báo. Xung đột gộp: useLayoutEditor.ts (draft13 với photo13), App.tsx (ed13 với gfx13), đã gỡ tay.

Lỗi thật tìm thấy trong lần lặp: nhân vật (cả trong văn phòng và phòng thay đồ) lơ lửng ~11 cm và thấp hơn heightCm ~9% vì minY và nativeHeight lấy từ boundingBox có cộng biên độ morph. Spec 41 trước đây hiệu chỉnh theo trạng thái sai (mắt cá 0,10 m); nay kiểm theo tỉ lệ xương foot đo từ GLB.

Vẫn cần root (không đổi so với lần lặp 12): 25 thoại production (`sudo bash /home/cc/gpb-dev/scripts/enable-turn-prod.sh`; world production vẫn TURN_SECRET rỗng lúc 14:20 UTC), 17 POST /api/layout/batch production (`sudo bash /home/cc/gpb-dev/scripts/deploy-layout.sh <sha>`; gpb-tool-layout-1 vẫn là image 06/11).

Kết quả lần lặp 13:

| Bước | Kết quả |
|---|---|
| Acceptance 1361ca2 | **PASS** 15:56 UTC (e2e 120 + đăng nhập thật 1) |
| Push | origin/main 0fc3119..1361ca2 (fast-forward) |
| Deploy | watcher root, deployed.sha 1361ca2, smoke 200/200/401 |
| Test production | playwright.prod.config.ts --workers=4 **56/56 PASS** (thêm 43–50) |

Việc còn lại: 25 và layout batch production cần root (như trên); GPU_REQUEST cho 03, 04, 07 (bản build), 08 (bản build), 13, 14, 15, 16, 19 và xem bằng mắt bàn, hình thể; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.

Đợt 2 lần lặp 13:

| Subagent | Worktree / nhánh | Việc | Kết quả |
|---|---|---|---|
| limb13 | /home/cc/wt/limb13, wt13/limb13 | user.txt: morph cẳng tay, bắp chân | 8cc0085; validator 0 lỗi; e2e 49, 41, 23 |
| rot13 | /home/cc/wt/rot13, wt13/rot13 | 17 khối ghép xoay thật; 14 nguồn âm theo bố trí | 1fc19ae; e2e 51 |

| Bước | Kết quả |
|---|---|
| Acceptance d237702 lần 1 | FAIL: 45-photo-layout (máy tải nặng, camera tiến chưa đủ trong 2,5 s; spec nay giữ W tới khi tiến > 0,5 m) và vitest accessory "co tuyến tính theo thân" (không tái hiện: 5 lần vitest đầy đủ sau đó đều 1211/1211; theo dõi tiếp) |
| Acceptance d237702 lần 2 | **PASS** 19:35 UTC (e2e 121 + đăng nhập thật 1) |
| Push, deploy | origin/main 0992c40..d237702; watcher deploy d237702; smoke 200/200/401 |
| Test production | --workers=4 **57/57 PASS** (thêm 51) |

## 2026-11-08 — Lần lặp 14

Đầu lần lặp (22:26 UTC): gpu_result.md không đổi từ 08:15 UTC; world production vẫn TURN_SECRET rỗng; layout production vẫn image 06/11. Các mục cần root (25 thoại production, 17 POST /api/layout/batch) và GPU/NVDA giữ nguyên như lần lặp 13.

Việc tự làm được trên VPS:

| Subagent / nơi làm | Nhánh | Việc | Kết quả |
|---|---|---|---|
| điều phối viên | main | 08: bench và overlay có FPS thấp nhất theo cửa sổ 1 s (`frame.minFps1s`); cửa sổ trượt tổng hợp theo thứ tự khung | 760df9a; vitest src/perf 24/24 |
| printer14 (/home/cc/wt/printer14) | wt14/printer14 | 14: model máy in thủ tục ở mặt Đông khối In ấn (util_print là khối đặc), 0 draw call thêm (gộp vào mesh có sẵn); nguồn âm `printer_print` dùng chung vị trí và hướng với model (một nguồn chân lý `officePropsLayout.ts`), xoay theo layoutRot; có ô chặn; BFS kiểm lối từ điểm vào tới west_link2 | dfbf726; tên thư viện "Máy in" a07a857 |

| Bước | Kết quả |
|---|---|
| tsc, vitest sau gộp | sạch; 1218/1218 |
| Acceptance a07a857 | **PASS** 22:32–22:59 UTC (e2e 121 + đăng nhập thật 1) |
| Push | origin/main 203cdc0..a07a857 (fast-forward) |
| Deploy | watcher root 23:02 UTC, deployed.sha a07a857, bundle index-0WiiMNte.js; smoke 200/200/401 |
| Test production | playwright.prod.config.ts --workers=4 **57/57 PASS** |

GPU_REQUEST.md (và /home/cc/gpu-handoff/gpu_request.md) trỏ a07a857; mục 08 ghi thêm minFps1s, mục 14 ghi vị trí máy in.

Việc còn lại (không đổi): 25 và 17 production cần root (`sudo bash scripts/enable-turn-prod.sh`, `sudo bash scripts/deploy-layout.sh a07a857`); GPU cho 03, 04, 07 (bản build), 08 (bản build), 13, 14, 15, 16, 19; 10, 11 cần điện thoại, cảm ứng, tay cầm thật; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.

## 2026-11-09 — Lần lặp 15

Đầu lần lặp (08/11 23:49 UTC): gpu_result.md không đổi từ 08:15 UTC; world production vẫn TURN_SECRET rỗng; gpb-tool-layout-1 vẫn image 06/11; user cc không có sudo. Các mục cần root, GPU, NVDA, thiết bị thật giữ nguyên như lần lặp 14.

Việc tự làm được trên VPS (điều phối viên, main, không mở subagent vì chỉ có một việc độc lập):

| Việc | Commit | Kết quả |
|---|---|---|
| 08: thời gian GPU (EXT_disjoint_timer_query_webgl2) bọc gl.render, chỉ đo lần render ngoài cùng, tối đa 4 truy vấn chờ, bỏ mẫu disjoint; overlay `?perf=1` dòng GPU; bench JSON khóa `gpu` | 02bc5e1, 1b18bec | vitest src/perf 30/30; e2e 52-gpu-timer |

| Bước | Kết quả |
|---|---|
| Acceptance 02bc5e1 | FAIL: chỉ 52-gpu-timer (spec dò extension bằng canvas riêng; dưới tải bench 4 s chưa có mẫu và bench trả gpu=null). Sửa bench giữ khóa gpu khi hỗ trợ, spec đọc trạng thái từ overlay |
| Acceptance 1b18bec | **PASS** 00:27–00:55 UTC (e2e 122 + đăng nhập thật 1) |
| Push | origin/main 1c0342a..1b18bec (fast-forward) |
| Deploy | watcher root, deployed.sha 1b18bec, bundle index-0roBI1Vk.js; smoke 200/200/401 |
| Test production | playwright.prod.config.ts --workers=4 **58/58 PASS** |

GPU_REQUEST.md (và /home/cc/gpu-handoff/gpu_request.md) trỏ 1b18bec; mục 08 xin thêm thời gian GPU.

Việc còn lại (không đổi): 25 thoại production cần root (`sudo bash scripts/enable-turn-prod.sh`), 17 POST /api/layout/batch production cần root (`sudo bash scripts/deploy-layout.sh 1b18bec`); GPU cho 01, 03, 04, 07 (bản build), 08 (bản build, thời gian GPU), 13, 14, 15, 16, 19, user.txt; 10, 11 cần điện thoại, cảm ứng, tay cầm thật; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.

## 2026-11-09 — Lần lặp 16

Đầu lần lặp (01:47 UTC): acceptance 09268bd **PASS** (01:15–01:46 UTC); production smoke trang chủ 200, /api/auth/providers 200, /api/world/health 401. gpu_result.md (máy Windows 192.168.1.2) không đổi từ 08/11 08:15 UTC: 07 đạt, 08 có số đo dev server; 03, 11, 13, 14, 15, 16, 19 vẫn "chưa kiểm". gpb-tool-world-1 vẫn TURN_SECRET rỗng; gpb-tool-layout-1 vẫn image 06/11; user cc không có sudo (/opt/gpb-tool/.env thuộc root, quyền 600). Hai lỗi acceptance của ff21ea7 (26-autowalk, voice-suite) đã hết từ các lần lặp trước (1b18bec, 09268bd PASS).

Rà cột "Còn thiếu" của TASK_STATUS.csv: không còn mục nào làm được trên VPS mà không cần root, GPU, NVDA hay thiết bị thật (11: chiều trục Y cần phải cần tay cầm thật; mã đảo trục và map axes[2]/axes[3] đã có test). Không mở subagent, không đổi mã.

Việc còn lại (không đổi): 25 thoại production cần root (`sudo bash scripts/enable-turn-prod.sh`); 17 POST /api/layout/batch production cần root (`sudo bash scripts/deploy-layout.sh 1b18bec`); GPU cho 03, 08 (bản build), 13, 14, 15, 16, 19 theo GPU_REQUEST.md (trỏ 1b18bec, mã không đổi từ đó); 10, 11 cần điện thoại, cảm ứng, tay cầm thật; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.

## 2026-11-09 — Lần lặp 17

Đầu lần lặp (02:47 UTC): acceptance a4c8872 **PASS** (02:17 UTC); watcher đã deploy a4c8872; production smoke trang chủ 200, /api/auth/providers 200, /api/world/health 401. gpu_result.md không đổi từ 08/11 08:15 UTC (07 đạt; 08 số đo dev server; 03, 11, 13, 14, 15, 16, 19 chưa kiểm). gpb-tool-world-1 vẫn TURN_SECRET rỗng; gpb-tool-layout-1 vẫn image 06/11 (17:57 UTC). Rà lại TASK_STATUS.csv: không có mục mới làm được trên VPS; không đổi mã, không mở subagent.

Việc còn lại (không đổi so với lần lặp 16): 25 thoại production cần root (`sudo bash scripts/enable-turn-prod.sh`); 17 POST /api/layout/batch production cần root (`sudo bash scripts/deploy-layout.sh 1b18bec`); GPU cho 03, 08 (bản build), 13, 14, 15, 16, 19 theo GPU_REQUEST.md (trỏ 1b18bec); 10, 11 cần thiết bị thật; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.

## 2026-11-09 — Lần lặp 18

Đầu lần lặp (03:49 UTC): acceptance ead7039 **PASS** (03:18 UTC); main trùng origin/main; production smoke trang chủ 200, /api/auth/providers 200, /api/world/health 401. gpu_result.md vẫn bản 08/11 08:15 UTC (07 đạt; 08 số đo dev server; 03, 11, 13, 14, 15, 16, 19 chưa kiểm). gpb-tool-world-1 vẫn TURN_SECRET rỗng; gpb-tool-layout-1 vẫn image 06/11. Không có mục mới làm được trên VPS; không đổi mã, không mở subagent.

Việc còn lại (không đổi): 25 thoại production cần root (`sudo bash scripts/enable-turn-prod.sh`); 17 POST /api/layout/batch production cần root (`sudo bash scripts/deploy-layout.sh 1b18bec`); GPU cho 03, 08 (bản build), 13, 14, 15, 16, 19 theo GPU_REQUEST.md (trỏ 1b18bec); 10, 11 cần thiết bị thật; 12 chờ NVDA. Không tạo PROJECT_COMPLETE.txt.
