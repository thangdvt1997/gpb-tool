# Kiểm tra trình duyệt (BROWSER_QA)

Cập nhật: 2026-11-06. Bộ test nằm ngoài repo tại `/home/cc/gpb-e2e` (Playwright 1.49.1, Chromium headless,
WebGL bằng SwiftShader: `--use-gl=angle --use-angle=swiftshader`). Ảnh chụp lưu ở `/home/cc/gpb-e2e/shots/`.

## Cách chạy

```
cd /home/cc/gpb-dev && npm run build
cd /home/cc/gpb-e2e && npx playwright test
```

`playwright.config.ts` tự chạy `vite preview` trên 127.0.0.1:4173 nếu chưa có (dùng lại server đang chạy).
`vite.config.ts` (mục `preview`) chuyển mọi `/api` về gateway đang chạy `127.0.0.1:18080` (đổi bằng biến `GPB_PREVIEW_API`).
Bước e2e nằm trong `/home/cc/gpb-acceptance.sh`.

## Phiên giả lập

Chưa có `/home/cc/gpb-e2e/.env` (TEST_EMAIL, TEST_PASSWORD), nên đăng nhập thật **chưa kiểm chứng**.
Để vẫn kiểm được cảnh 3D và HUD, các test `02-*`, `10-*`, `11-*`, `12-*` chặn `GET /api/auth/me` bằng `page.route`
và trả một người dùng đã xong onboarding. Mọi mã giao diện và cảnh là bản build thật; chỉ dữ liệu phiên là giả.
Các API khác vẫn đi tới gateway và trả 401 (lỗi tải tài nguyên này không tính là lỗi nghiêm trọng).
Không tạo tài khoản và không lấy mật khẩu từ nơi khác.

Đặt nhân vật trước vật: test ghi vị trí vào bản lưu IndexedDB (`gpb-office/snapshots`) rồi tải lại trang;
app khôi phục vị trí qua `persist.loadSnapshot` → `placeCharacter` (TASK 06).

## Kết quả các bước bắt buộc

| Bước | Test | Kết quả |
|---|---|---|
| 1. Trang tải, không lỗi console nghiêm trọng | mọi test (`collectErrors`: pageerror + console.error trừ lỗi tải tài nguyên) | PASS |
| 2. Màn đăng nhập: tab Đăng nhập, Tạo tài khoản; nút Google/Microsoft theo `/api/auth/providers` | `01-login.spec.ts` | PASS (gateway trả google=true, microsoft=false: Google bật, Microsoft tắt kèm "Chưa được cấu hình") |
| 3. Cảnh 3D render, không trống | `02-scene-mock.spec.ts` (PNG canvas > 30 KB) | PASS (phiên giả lập); ảnh `02-scene.png` |
| 4. Đăng nhập bằng tài khoản test | `03-login-real.spec.ts` | **Chưa kiểm chứng: thiếu .env test** (test bị bỏ qua) |
| 5. Nút Thi đấu, Biểu cảm; dòng trợ giúp; gợi ý "E — …" gần vật; E hoặc bấm vật mở panel | `02-scene-mock.spec.ts` | PASS (phiên giả lập). Bấm quầy Service Desk mở panel; trước tủ hồ sơ mẫu hiện "E — Mở ngăn kéo", nhấn E thành "E — Đóng ngăn kéo" |
| HUD không chồng nhau ở 1280x800 | `02-scene-mock.spec.ts` | PASS sau khi sửa |

Ghi chú định dạng: gợi ý dùng "E — <hành động>" (gạch dài) theo thiết kế CTRL-13, test chấp nhận cả "E:".

## Lỗi tìm được nhờ kiểm tra trình duyệt (đã sửa, commit 4b44886)

1. Menu tạm dừng camera ("Về vị trí an toàn", "Toàn cảnh", "Rung camera") luôn hiện: `style.display = 'flex'` đè thuộc tính `hidden` (`src/scene/controls/gtaCamera.ts`).
2. Cây nước, máy in, cốc của khu mẫu nằm ngoài chữ L, người chơi không tới được (`InteractObjects.tsx` lấy vị trí đầu tiên của từng loại, không kiểm L).
3. HUD chồng nhau: thanh xã hội đè nút Chụp ảnh và Xem lại hướng dẫn; Chụp ảnh đè Xem lại hướng dẫn; gợi ý E đè thanh chăm cây; dòng hướng dẫn phím bị lặp hai lần (chân trang và `InteractionHelp`) và đè nút Bản đồ.
4. Tour lần đầu che nút Thi đấu và Biểu cảm khi đang mở (đúng thiết kế: đóng tour thì hiện).

## Lỗi tìm được nhờ kiểm tra trình duyệt (lần lặp 2, commit d65adfa)

Kết quả e2e toàn bộ trên d65adfa: 27 pass, 1 bỏ qua (đăng nhập thật, thiếu `.env`), 0 lỗi, khoảng 31 phút (SwiftShader).
Không còn test nào đánh dấu `test.fail`.

1. Ghế: chọn "Ngồi xuống" rồi gợi ý vẫn là "Xoay ghế", không đứng dậy được. Có hai nguyên nhân:
   - `characterState` không bao giờ chuyển sang `seated` khi điều khiển đã ngồi, nên hành động "Đứng dậy" không khả dụng.
   - Yêu cầu ngồi bị bỏ mất nếu đúng khung đó đang tạm dừng hoặc chưa chạm đất, trong khi ghế đã ghi người ngồi nên bị kẹt.

   Sửa: `src/scene/interact/seatSync.ts`; yêu cầu ngồi giữ tối đa 1 s (`controls/index.ts`); ghế ghi tên mình mà chưa ngồi thì cho ngồi lại. Đã kiểm bằng số đo `?debug=controls` (`seated: true`, z 4,40 → 3,61).
2. Cốc: cầm cốc rồi không bao giờ có "Đặt xuống", vì mặt tủ thấp (priority -0,2) luôn thua máy in và ngăn kéo cùng chỗ. Sửa: khi đang cầm đồ thì ưu tiên mặt đặt là 1 (`SURFACE_PRIORITY_HOLDING`).
3. Sắp xếp nội thất, có ba lỗi:
   - Bấm vật để chọn lại chạy tương tác hoặc tự đi tới vật: `useInteractionSelect` nhận `enabled` không tính chế độ sắp xếp.
   - Cú thả (pointerup) kết thúc kéo, nhưng `onClick` của chính vật nhấc lại vật ngay. Vật luôn ở dưới con trỏ nên gần như không thả được, và Hoàn tác bị từ chối vì vẫn đang kéo.
   - Vùng cấm phía client phình cả footprint lối vào (rộng 3 m) thêm 1,5 m, chặt hơn server (`services/layout/src/movable.js`: bán kính 1,5 m quanh tâm). Service Desk đặt sát lối vào nên không nhích được hướng nào. Đã căn theo luật server (`src/layout/placement.ts`).

   Còn lại, đúng luật: xoay 90 độ Service Desk (dài 4,5 m) tại chỗ bị từ chối vì chạm vùng cấm, có thông báo lý do. Test ghi lý do vào annotation.
4. Cài đặt: phím mũi tên tính từ tab đang chọn, không tính từ tab đang có focus.
5. Bảng an toàn camera hiện cả khi phòng thay đồ hoặc chế độ chụp ảnh giữ tạm dừng, đè lên nút của chúng. Giờ chỉ hiện với menu Esc (`menuPaused`).
6. Thanh hành động xã hội nằm dưới panel sắp xếp nội thất; giờ ẩn khi đang sắp xếp (vẫn giữ phiên lời mời).
7. Kéo chuột trên cảnh bôi đen chữ HUD (thấy rõ trong ảnh `21-before-floor.png`). Sửa: `user-select: none` cho `.app`, trừ ô nhập, hộp thoại, panel.
8. Mép trang phục bậc thang theo tam giác. Sửa: cắt bằng thuộc tính `aCut` trong shader. Ảnh `21-after-skin-wardrobe-zoom.png`: tay áo đã thẳng; cổ áo và mép quần ở hông vẫn còn răng cưa (đang sửa, xem PROGRESS).

## Giới hạn

- SwiftShader chậm (p95 khung vài giây), nên số đo hiệu năng trong headless không đại diện cho máy thật; HUD `[perf]` cảnh báo vượt ngân sách là do môi trường.
- Âm thanh, tay cầm, cảm ứng, trình đọc màn hình: chưa kiểm được trong headless.
- Nhiều người (world ws), hồ sơ trên server mới: gateway 18080 là bản deploy cũ, chưa có route `/api/world`; **chưa kiểm chứng**.

## Vân bề mặt (trước/sau)

Ảnh: `/home/cc/gpb-e2e/shots/21-before-*.png` và `21-after-*.png` (floor, floor-far, wall, wall2, tattoo-dialog, skin-wardrobe, skin-wardrobe-zoom), chụp bằng `tests/21-textures.spec.ts` (`SHOT_TAG=before|after`).

Vân xấu và cách sửa:
- Sàn đá: vân là vài đường gấp khúc thẳng, mọi viên cùng độ sáng, ô lặp 5 x 5 viên (4 m) nên thấy lặp, clearcoat 0,8 làm bóng như nhựa. Sửa trong `src/scene/stoneTexture.ts` (hàm thuần, nhiễu fbm nhiều tần số, mỗi viên xoay/lật/dịch ngẫu nhiên, vân cong mảnh thưa tương phản thấp, mạch lát khử răng cưa) và `src/scene/Floorplan.tsx` (texture 2048 px, 8 x 8 viên = 6,4 m, mipmap, anisotropy 16, roughness 0,45, clearcoat 0,5). Test: `src/scene/stoneTexture.vitest.test.ts`.
- Tường: roughness 0,7 hơi bóng; thêm prop `roughness` cho `InstancedBoxes`, tường dùng 0,92, metalness 0.
- Da nhân vật: GLB xuất hai mặt nên mặt trong da tạo sọc bóng đổ tự che trên cẳng tay; roughness 0,5 hơi bóng. `fixMaterials` trong `src/avatar/MpfbAvatar.tsx`: da FrontSide, roughness 0,62, metalness 0, envMapIntensity 0,45, anisotropy 8 cho map da (hằng số `SKIN_MATERIAL`).
- Xăm: texture xăm 1024/2048 px đã lọc tuyến tính và mipmap; thêm anisotropy 8 (`src/tattoo/overlay.ts`). Bản đồ UV xem trước vẽ mask ở độ phân giải gốc rồi phóng to có làm mượt (`TattooPainter.tsx`); ranh giới vùng vẫn thô vì mask nguồn chỉ MASK_RES ô.

## Production 2026-11-07 — commit 6cadd19 (deploy 14:01 UTC)

Chạy `npx playwright test -c playwright.prod.config.ts --workers=1` từ /home/cc/gpb-e2e trên https://gp.daisoncoop.com (Chromium headless, SwiftShader). **4/4 PASS** (6,7 phút).

| Test | Kết quả | Số đo |
|---|---|---|
| prod/30-hanging: camera không lọt băng rôn | PASS | 36 mẫu, 8 khung bị kéo lại trước băng rôn, 0 khung lọt |
| 02-scene-mock: cảnh 3D, HUD, trợ giúp, gợi ý E, panel | PASS | canvas render, không lỗi console |
| 02-scene-mock: HUD không chồng (1280x800) | PASS | |
| 20-controls: chuột phải, đầu theo camera, WASD | PASS | đầu lệch tối đa 56,4° khi kéo nhanh (giới hạn 70°); A/D/S/W: thân lệch 2,5° / 3,2° / 3,0° / 3,3° so với hướng mong đợi, đi 0,86–1,53 m đúng hướng camera |

Lần chạy trước trên efe00e6 với `--workers=4` song song acceptance: 20-controls hỏng ở W (thân lệch 20,4°, ngưỡng 20°) do tải; chạy lại một mình PASS. Đã tăng timeout bài này lên 600 s.

Chưa kiểm chứng trên production: đăng nhập thật (tài khoản test e2e chỉ có trong auth kiểm thử 127.0.0.1:3902, không có trong auth production; không tự tạo tài khoản production). Service world và auth bản mới chưa deploy (quy trình deploy chỉ cho web), nên các tính năng `?world=1`, hồ sơ mở rộng (/profile/about) chưa thử trên production.

## Production 2026-11-07 — commit 48631c6 (deploy 14:26 UTC)

`playwright.prod.config.ts --workers=1`: **4/4 PASS** (6,3 phút). Băng rôn: 36 mẫu, 9 khung bị kéo lại, 0 khung lọt. Đầu lệch tối đa 55,7° khi kéo nhanh (giới hạn 70°). Cảnh 3D, HUD, WASD theo camera đều qua. Đăng nhập thật trên production: chưa kiểm chứng (tài khoản test chỉ có ở auth kiểm thử).

## Production 2026-11-07 — commit ab407c7 (deploy khoảng 18:35 UTC, watcher root)

Acceptance PASS 18:15 (e2e 46 + 1 đăng nhập thật qua auth kiểm thử 127.0.0.1:3902). Gateway 18080 trả 200; trang 18081 phục vụ `assets/index-C3KRgaVO.js`, trùng bản build của ab407c7.

`playwright.prod.config.ts --workers=1`: **4/4 PASS** (6,6 phút). Băng rôn: 36 mẫu, 9 khung bị kéo lại, 0 khung lọt. Đầu lệch tối đa 55,2° khi kéo nhanh (giới hạn 70°), lệch 1,3° khi kéo chậm. Cảnh 3D, HUD, WASD theo camera đều qua. Đăng nhập thật trên production: chưa kiểm chứng (tài khoản test chỉ có ở auth kiểm thử).

## Nhiều người, hai trình duyệt (stack cục bộ, không phải production) — wt3/multi 16d747e

Service world chạy từ mã repo ở 127.0.0.1:3903 (`scripts/e2e/world-local.sh start`), xác thực qua auth kiểm thử 127.0.0.1:3902, vite preview đặt `GPB_PREVIEW_AUTH_API` và `GPB_PREVIEW_WORLD_API`. Hai tài khoản test (e2e-test, e2e-test2 trong DB kiểm thử), hai browser context. Spec `29-multiplayer.spec.ts`: **5/5 PASS** (3,4 phút): presence và di chuyển, chat hai chiều (HTML hiện như chữ thuần), lease ghế (A bị từ chối khi B ngồi, được ngồi sau khi B đứng dậy), vai trò member, rớt kết nối (đóng socket và setOffline) rồi resume. Spec tự bỏ qua khi world 3903 không chạy, nên trong acceptance cả 5 test được skip.

Chưa kiểm chứng: đường qua gateway production (`/api/world`, ws), đổi vai trò và `can()` qua UI (cần tài khoản admin trong DB kiểm thử), kick và mute.

## Khả năng tiếp cận tự động — wt3/a11y3 87ad9d4

Spec `30-a11y-full.spec.ts` trên bản build main 8fb740a: **13/13 PASS**. axe 0 critical/serious ở màn đăng nhập, 7 panel và toàn trang cảnh; mở/đóng panel bằng bàn phím, focus trap, trả focus; ariaSnapshot thanh công cụ; aria-live; prefers-reduced-motion. Trình đọc màn hình thật (NVDA, VoiceOver, TalkBack): chưa kiểm chứng, checklist ở `docs/design/A11Y_VERIFICATION.md`.

## Production 2026-11-07 — commit 8fb740a (deploy khoảng 19:15 UTC, watcher root)

Acceptance PASS 18:53 (59 pass, 5 skip là 29-multiplayer khi không có world 3903; 1 đăng nhập thật). Trang 18081 phục vụ `assets/index-i8jpEkJ4.js`, trùng bản build riêng của 8fb740a. `playwright.prod.config.ts --workers=1`: **4/4 PASS** (6,5 phút). Băng rôn: 36 mẫu, 9 khung bị kéo lại, 0 khung lọt. Đầu lệch tối đa 55,3° khi kéo nhanh.

## Production 2026-11-07 — commit 1235903 (deploy khoảng 19:45 UTC, watcher root)

Acceptance PASS 19:22 (59 pass, 5 skip, 1 đăng nhập thật). Trang phục vụ `assets/index-BiJMpdRh.js`, trùng bản build riêng của 1235903. GLB tự sinh phục vụ đúng (`/models/anim_male_real.glb`, `/models/furn_desk.glb`: 200, `application/octet-stream`, magic `glTF`). `playwright.prod.config.ts --workers=1`: **4/4 PASS** (6,6 phút). Băng rôn: 36 mẫu, 9 khung bị kéo lại, 0 khung lọt. Đầu lệch tối đa 56,4° khi kéo nhanh.

## NVDA thật (chủ dự án kiểm, 07/11/2026, Windows, NVDA 2026.2, Chrome, production đã đăng nhập)

Giọng NVDA trên máy chủ dự án báo "Vietnamese (not supported)": môi trường, không phải lỗi app.

| Đợt | Bản production | Nút / panel | Kết quả NVDA | Xử lý |
|---|---|---|---|---|
| 1 | (trước ab407c7) | Thứ tự Tab toàn trang | ĐẠT: mọi phần tử có tên và trạng thái | — |
| 1 | | Phòng thay đồ: Esc | LỖI: focus về nút nhưng đọc "expanded" | sửa ở 478bdc8 |
| 1 | | Thông báo "Đã ghi danh lúc …, mời bạn vào tầng 7" | LỖI nhỏ: đọc hai lần | sửa ở commit sau 478bdc8 (vùng live một chuỗi) |
| 2 | ab407c7 | Phòng thay đồ, Cài đặt: Esc | LỖI: đọc "expanded" / "expanded opens dialog" | sửa ở 478bdc8 |
| 2 | ab407c7 | Vẽ xăm | ĐẠT | — |
| 2 | ab407c7 | Trợ giúp | ĐẠT: Esc đóng, focus về nút, đọc "opens dialog" | — |
| 2 | ab407c7 | Sao lưu: Esc | LỖI: panel không đóng | sửa ở 478bdc8 |
| 2 | ab407c7 | Thư viện, Hồ sơ | Đóng bằng Esc nhưng NVDA không đọc lại nút | 478bdc8: Esc đóng cả khi mở bằng chuột, focus về nút (e2e) |
| 3 | 1235903 | Thư viện, Hồ sơ, Vẽ xăm | ĐẠT: "expanded" rồi "collapsed" | — |
| 3 | 1235903 | Phòng thay đồ, Cài đặt | LỖI như đợt 2 | sửa ở 478bdc8 |
| 3 | 1235903 | Sao lưu | LỖI như đợt 2 | sửa ở 478bdc8 |

Chưa kiểm bằng NVDA thật: nhập liệu trong hộp thoại, Enter để kích hoạt nút, bẫy focus (Tab vòng), đọc nội dung cảnh 3D. Phần trình đọc màn hình thật chỉ chủ dự án kiểm được (VPS Linux không chạy NVDA/JAWS); task 12 chưa đóng cho đến khi chủ dự án kiểm lại bản có 478bdc8.

### Nguyên nhân và cách sửa (478bdc8)

- Phòng thay đồ và Cài đặt là hộp thoại `aria-modal="true"`; Tattoo, Thư viện, Hồ sơ là `aria-modal="false"` và NVDA đọc đúng. State `wardrobeOpen`/`settingsOpen` vẫn về `false` (callback onCancel/onClose đã gọi `setXOpen(false)`), nhưng focus được trả về nút ngay trong lúc tháo hộp thoại modal. Lúc đó Chrome chưa dựng lại cây trợ năng cho phần trang bị che, NVDA đọc trạng thái cũ. Sửa: `restoreFocusLater` (src/a11y/restoreFocus.ts) trả focus sau hai khung hình, dùng cho Phòng thay đồ, Cài đặt, bẫy focus chung (Trợ giúp, Thành viên, Máy tính) và `useReturnFocus`.
- Nguyên nhân trên là suy luận từ việc chỉ hộp thoại modal bị lỗi; Playwright/Chromium headless không tái hiện được thời điểm NVDA đọc. Bằng chứng cuối cùng là NVDA thật của chủ dự án.
- Sao lưu là `role="region"` và chỉ có nút ×: Esc rơi xuống phím Esc của điều khiển (mở menu tạm dừng). Thư viện chỉ bắt Esc khi focus nằm trong panel; Hồ sơ không bắt Esc. Sửa: `useEscapeClose` (src/a11y/useEscapeClose.ts) nghe Esc trên window ở pha bắt, panel mở sau cùng đóng trước, nhường cho hộp thoại modal; dùng cho Thư viện, Hồ sơ, Sao lưu, Vẽ xăm. Sao lưu đổi sang `role="dialog" aria-modal="false"`; nút × giữ `aria-label="Đóng bảng sao lưu"`. Menu tạm dừng bỏ qua Esc đã có `defaultPrevented`.

### Rà nút HUD (V3) — e2e `31-hud-expanded.spec.ts`, bản build 478bdc8 trên preview cục bộ

Mỗi nút: mở bằng chuột (như chủ dự án), đóng bằng Esc và bằng nút đóng; kiểm panel ẩn, `aria-expanded="false"`, focus về nút, giá trị `aria-expanded` tại sự kiện focus cuối của nút là `"false"`, ariaSnapshot không còn `[expanded]`.

| Nút | aria-haspopup | Esc | Nút đóng | aria-expanded sau đóng | Focus về nút |
|---|---|---|---|---|---|
| Thư viện | — | ĐẠT | ĐẠT ("Đóng thư viện") | false | có |
| Hồ sơ | — | ĐẠT | ĐẠT ("Đóng hồ sơ") | false | có |
| Sao lưu | — | ĐẠT | ĐẠT ("Đóng bảng sao lưu") | false | có |
| Phòng thay đồ | dialog | ĐẠT | ĐẠT (Hủy) | false | có |
| Vẽ xăm | dialog | ĐẠT | ĐẠT ("Đóng xưởng xăm") | false | có |
| Cài đặt | dialog | ĐẠT | ĐẠT ("Đóng cài đặt") | false | có |
| Trợ giúp | dialog | ĐẠT | ĐẠT | (không có aria-expanded) | có |

Trước khi sửa, cùng spec trên bản chưa có `useEscapeClose`: Thư viện, Hồ sơ, Sao lưu FAIL ở bước Esc khi mở bằng chuột (panel vẫn hiện). Spec 30-a11y-full 13/13 PASS cùng lượt (27/27). Bản sao spec trong repo: tests/e2e/31-hud-expanded.spec.ts.
