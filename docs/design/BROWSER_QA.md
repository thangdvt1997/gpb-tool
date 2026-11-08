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

## Production 2026-11-07 — commit ed28d05 (deploy 22:22 UTC) và 70715a8 (deploy 23:31 UTC), watcher root

playwright.prod.config.ts (02-scene-mock, 20-controls, prod/30-hanging, 31-hud-expanded): **18/18 PASS** trên cả hai bản. 31-hud-expanded trên production: 7 nút HUD × (Esc, nút đóng), aria-expanded="false" và focus về nút sau khi đóng. Phiên giả lập phía trình duyệt (mockSession), không đăng nhập production. Kiểm lại bằng NVDA thật: chờ chủ dự án.

## Production 2026-11-08 — commit 409d1d5 (deploy 00:00 UTC, watcher root)

Trang phục vụ `assets/index-BeJKSoJM.js`, trùng log deploy. playwright.prod.config.ts `--workers=1`: **18/18 PASS** (14,4 phút): 02-scene-mock, 20-controls, prod/30-hanging, 31-hud-expanded (Thư viện, Hồ sơ, Sao lưu, Phòng thay đồ, Vẽ xăm, Cài đặt, Trợ giúp × Esc và nút đóng: aria-expanded="false", focus về nút). Phiên giả lập phía trình duyệt, không đăng nhập production. NVDA thật trên bản này: chưa kiểm, chờ chủ dự án (Phòng thay đồ, Cài đặt, Sao lưu là ba mục còn FAIL ở đợt 3 trên 1235903, bản trước khi sửa).

## Production 2026-11-08 — commit 5dbc123 (deploy 00:35 UTC, watcher root)

Trang phục vụ `assets/index-BeJKSoJM.js` (mã giống 409d1d5, 5dbc123 chỉ đổi tài liệu). playwright.prod.config.ts `--workers=1`, chạy 00:40 UTC: **18/18 PASS** (16,0 phút). 31-hud-expanded 14 ca: Thư viện, Hồ sơ, Sao lưu, Phòng thay đồ, Vẽ xăm, Cài đặt, Trợ giúp, mỗi nút đóng bằng Esc và bằng nút đóng: aria-expanded="false", focus về nút, Sao lưu ẩn sau Esc. Ba mục NVDA đợt 3 còn FAIL (Phòng thay đồ, Cài đặt, Sao lưu) kiểm trên 1235903, bản trước bản sửa 478bdc8. NVDA thật trên 5dbc123: chưa kiểm, chờ chủ dự án.

## Production 2026-11-08 — commit c4688f7 (deploy 01:25 UTC, watcher root)

Acceptance PASS 01:04 (e2e 88 + đăng nhập thật). Trang phục vụ `assets/index-hhuG20op.js`, trùng log deploy. playwright.prod.config.ts (thêm 34-player-baked-clip, 35-glb-furniture) `--workers=1`: **23/24**, ca fail là `?baked=0` của spec 34, do spec chờ cố định 1,5 s. Nguyên nhân phía test: điểm xuất phát (-4, 3) vướng vật cản sau khoảng 0,45 m khi đi thẳng, và swiftshader trên production có khung trên 300 ms nên `clipName` (ghi ở khung vẽ) trễ `loco` (ghi ở bước FSM) tới khoảng 1 s. Đã sửa spec: dịch chuyển tới (-10, 3) hướng 0, poll tới khi FSM và clip cùng là đi. Chạy lại spec 34 trên production `--repeat-each=5`: **10/10 PASS** (Idle bake, giữ W thì Walk bake, nhả W thì về Idle; `?baked=0` thì procedural). Spec 35: 4/4 (nguồn glb, `?glbFurniture=0` thì boxes, draw call 66 = 66, GLB lỗi thì về boxes). 31-hud-expanded 14/14.

## Production 2026-11-08 — commit 4a03739 (deploy 02:28 UTC, watcher root)

`playwright.prod.config.ts`: **24/24 PASS** (19,9 phút). Gồm 30-hanging, 02-scene-mock (2), 20-controls, 31-hud-expanded 14 ca, 34-player-baked-clip (2), 35-glb-furniture (4).

Kiểm V3 trên production 4a03739. Mỗi nút được mở bằng chuột, rồi đóng hai cách: Esc và nút đóng. Sau khi đóng, nút có aria-expanded="false" (Trợ giúp không có aria-expanded, chỉ có aria-haspopup) và focus trở về nút.

| Nút | Esc | Nút đóng |
|---|---|---|
| Thư viện | ĐẠT | ĐẠT |
| Hồ sơ | ĐẠT | ĐẠT |
| Sao lưu | ĐẠT (Esc đóng panel, nút × "Đóng bảng sao lưu") | ĐẠT |
| Phòng thay đồ | ĐẠT | ĐẠT |
| Vẽ xăm | ĐẠT | ĐẠT |
| Cài đặt | ĐẠT | ĐẠT |
| Trợ giúp | ĐẠT | ĐẠT |

NVDA thật đợt 3 kiểm bản 1235903, là bản trước khi có sửa 478bdc8 và 1c2b1f9. Chủ dự án cần chạy lại NVDA trên production hiện tại cho Phòng thay đồ, Cài đặt, Sao lưu. Trình đọc màn hình thật: chưa kiểm trên bản này.

## Production 2026-11-08 — commit f55cddd (deploy khoảng 03:35 UTC, watcher root)

Gồm 2431d63 (emote phát clip bake, bước tại chỗ khi xoay). Acceptance PASS 03:14 UTC trên f55cddd.

`playwright.prod.config.ts`: **24/24 PASS** (18,0 phút): 30-hanging, 02-scene-mock (2), 20-controls, 31-hud-expanded 14 ca (7 nút × Esc/nút đóng, aria-expanded="false" và focus về nút), 34-player-baked-clip (2), 35-glb-furniture (4).
Thêm 36-player-emote-baked-clip vào cấu hình production: **2/2 PASS** (tấn hold và nhảy loop phát clip bake rồi về Idle; ?baked=0 dùng procedural).

Trình đọc màn hình thật: chưa kiểm trên bản này. Chủ dự án cần chạy lại NVDA cho Phòng thay đồ, Cài đặt, Sao lưu (đợt 3 kiểm bản 1235903, trước bản sửa 478bdc8 và 1c2b1f9).

## Production 2026-11-08 — kiểm lại lần lặp 10 (image tạo 03:34:56 UTC, mã f55cddd)

Đây là lần kiểm lại trên cùng image đã đánh giá ở mục trên. Main chỉ có thêm commit tài liệu, nên không deploy lại.
`playwright.prod.config.ts`: **26/26 PASS** (19,4 phút). Gồm 30-hanging, 02-scene-mock (2), 20-controls, 31-hud-expanded 14 ca, 34-player-baked-clip (2), 35-glb-furniture (4), 36-player-emote-baked-clip (2).

31-hud-expanded kiểm từng nút HUD. Mỗi nút có 2 ca: đóng bằng Esc và đóng bằng nút đóng. Sau khi đóng, kiểm aria-expanded="false" (nếu nút có thuộc tính này) và focus đã về nút.

| Nút | Esc | Nút đóng | Ghi chú |
|---|---|---|---|
| Thư viện | ĐẠT | ĐẠT | panel không modal |
| Hồ sơ | ĐẠT | ĐẠT | panel không modal |
| Sao lưu | ĐẠT | ĐẠT | Esc đóng panel (useEscapeClose). Nút × có tên "Đóng bảng sao lưu" |
| Phòng thay đồ | ĐẠT | ĐẠT | modal. Esc gọi onCancel, wardrobeOpen=false |
| Vẽ xăm | ĐẠT | ĐẠT | |
| Cài đặt | ĐẠT | ĐẠT | modal. Esc gọi onClose, settingsOpen=false |
| Trợ giúp | ĐẠT | ĐẠT | không có aria-expanded. Kiểm hộp thoại đóng và focus về nút |

Trình đọc màn hình thật: **chưa kiểm trình đọc thật trên bản này**. NVDA đợt 3 kiểm bản 1235903, trước bản sửa 478bdc8/1c2b1f9. Chủ dự án cần chạy lại NVDA trên production hiện tại cho Phòng thay đồ, Cài đặt, Sao lưu.

## Production 2026-11-08 — commit 5c0d0d2 (deploy 06:22 UTC, watcher root): nút Trợ giúp

Kiểm độc lập 08/11 trên f55cddd: nút Trợ giúp không có aria-expanded (null), và bản test cũ bỏ qua vì đánh dấu Trợ giúp là `expanded: false`. Báo cáo "7 nút đạt" ở hai mục trên vì vậy **không kiểm aria-expanded của Trợ giúp**.

Sửa (5c0d0d2): HelpCenter xuất `useHelpCenterOpen`, App gắn `aria-expanded` cho nút Trợ giúp. 31-hud-expanded: Trợ giúp kiểm aria-expanded như các nút khác, thêm 7 ca bàn phím (Enter mở, aria-expanded="true", hộp modal có focus bên trong; Esc, aria-expanded="false", focus về nút).

Chứng minh test bắt được lỗi: ca bàn phím Trợ giúp chạy trên production f55cddd (trước deploy) **FAIL**: aria-expanded nhận `null`.

Acceptance 5c0d0d2 PASS (e2e 97 + đăng nhập thật 1). `playwright.prod.config.ts --workers=4` trên 5c0d0d2: **32/33**. 31-hud-expanded 21/21 PASS. 20-controls FAIL một lần ở bước "D: thân quay theo hướng đi" (lệch 20,4° so với ngưỡng 20°), khi acceptance e2e chạy song song trên cùng máy; 5c0d0d2 không chạm điều khiển. Chạy lại riêng 20-controls trên production 5c0d0d2 khi máy rảnh: **PASS** (thân lệch hướng đi tối đa 3,3°; W/A/S/D mỗi phím 10–13 s). Hai lần FAIL trước đó có mỗi lần đọc trạng thái mất vài giây (vòng lặp 12 s ghi 24–33 s), do quá tải. Tổng: 33/33 (20-controls ở lần chạy lại).

| Nút | Enter mở: aria-expanded | Focus khi mở bằng Enter | Esc: aria-expanded, focus về nút | Chuột + Esc / nút đóng |
|---|---|---|---|---|
| Thư viện | "true" | ở nút (panel không modal) | ĐẠT | ĐẠT / ĐẠT |
| Hồ sơ | "true" | ở nút (panel không modal) | ĐẠT | ĐẠT / ĐẠT |
| Sao lưu | "true" | ở nút (panel không modal) | ĐẠT | ĐẠT / ĐẠT |
| Phòng thay đồ | "true" | trong hộp (modal) | ĐẠT | ĐẠT / ĐẠT |
| Vẽ xăm | "true" | ở nút (panel không modal) | ĐẠT | ĐẠT / ĐẠT |
| Cài đặt | "true" | trong hộp (modal) | ĐẠT | ĐẠT / ĐẠT |
| Trợ giúp | "true" (trước: null) | trong hộp, ô "Tìm chủ đề" (modal) | ĐẠT | ĐẠT / ĐẠT |

Focus Trợ giúp: trên mã mới (local và production 5c0d0d2), mở bằng Enter thì focus vào ô "Tìm chủ đề" (trapFocus). Chưa kiểm focus trên mã cũ (ca chạy trên f55cddd dừng ở bước aria-expanded), nên chưa rõ nguyên nhân lỗi "activeElement rỗng" đã báo. Ca bàn phím mới giữ kiểm này trên production. Bốn panel không modal (aria-modal="false") giữ focus ở nút mở, kiểu disclosure; NVDA đợt 3 chấm đạt Thư viện, Hồ sơ, Vẽ xăm. Nếu muốn các panel này cũng đưa focus vào trong khi mở, cần quyết định của chủ dự án.

Trình đọc màn hình thật: **chưa kiểm trình đọc thật trên bản này**. Chủ dự án chạy NVDA (Speech Viewer) trên 5c0d0d2 trở về sau: Trợ giúp phải đọc "collapsed" khi đóng và "expanded" khi mở.

## Production 2026-11-08 — commit c0e2265 (deploy 07:15 UTC, watcher root): manifest license đã duyệt

Acceptance c0e2265 PASS (e2e 97 + đăng nhập thật 1). /models/manifest.json trên production: 3 GLB MPFB verified=true, approvedBy "Chủ dự án duyệt dùng trong sản phẩm (08/11/2026)". Spec đọc manifest trên production (02-scene-mock, 34-player-baked-clip, 35-glb-furniture, 36-player-emote-baked-clip): **10/10 PASS**. Mã giao diện giống 5c0d0d2, nên kết quả 31-hud-expanded ở mục trên vẫn áp dụng.

## Môi trường test VPS cho 22–27 — lần lặp 12 (08/11/2026), mã main ff21ea7

Theo quyết định chủ dự án 08/11 07:40 UTC: không tạo tài khoản và không dùng auth production để test. Kiểm trên môi trường test chạy trên VPS, cùng mã với commit đang triển khai:

| Thành phần | Địa chỉ | Ghi chú |
|---|---|---|
| Auth TEST | 127.0.0.1:3902 (container gpb-e2e-auth) | ba tài khoản test trong /home/cc/gpb-e2e/.env: e2e-test, e2e-test2 (employee), e2e-admin (admin) |
| World | 127.0.0.1:3903 (`scripts/e2e/world-local.sh`, chạy từ services/world của repo) | services/world không đổi từ 9de7442 (bản production deploy 04:44 UTC); khởi động lại lúc 07:45 UTC |
| Layout | 127.0.0.1:3904 (container gpb-e2e-layout, image build từ services/layout của repo) | dữ liệu riêng /home/cc/e2e-layout-data |
| TURN | coturn gpb-turn-coturn, 198.204.229.10:3478 | world test nạp TURN_SECRET từ /home/cc/gpb-turn/.env |
| Web | vite preview bản build main, cổng 4173 (spec 29) và 4174 (`playwright.testenv.config.ts`) | `GPB_PREVIEW_AUTH_API`, `GPB_PREVIEW_WORLD_API`, `GPB_PREVIEW_LAYOUT_API` |

Kết quả (mỗi người dùng một trình duyệt riêng ở 32, 40, 42):

| Spec | Task | Kết quả | Nội dung |
|---|---|---|---|
| tests/29-multiplayer.spec.ts (gồm voice-suite) | 23, 24, 25, 27 | **9/9 PASS** | presence và di chuyển; chat hai chiều (HTML hiện như chữ thuần); lease ghế; rớt kết nối (đóng socket, setOffline) rồi resume; thoại: mic chỉ xin khi bấm, PeerConnection connected và nhận audio (bytesReceived > 0 hai bên), gain theo khoảng cách, tắt mic thì bên kia đóng kết nối |
| pending/32-room-roles.spec.ts | 25, 26 | **7/7 PASS** | admin là owner thấy "Thành viên phòng", employee là member; member → editor → guest (guest không chat, không ngồi ghế, vẫn đọc chat) → member; mute và bỏ mute; chặn và bỏ chặn; kick (B thấy thông báo, mất kết nối, A ở lại) |
| pending/40-profile-item.spec.ts | 22, 24, 15, 05 | **5/5 PASS** | đổi tên hiển thị, tải lại vẫn còn, B thấy tên mới; đồng bộ nhân vật lên máy chủ; ngoại hình tài khoản của A đến B qua world; vật cầm (A cầm thì B bị từ chối "Vật này đang có người cầm", A trả thì B cầm được); bắt tay có đồng ý (B thấy lời mời, chấp nhận, hai bên phát emote); server ghi đè vị trí khi nhảy 40 m (ack corrected, nhân vật và camera về vị trí server, B thấy cùng vị trí) |
| pending/42-editor-layout-real.spec.ts | 17 | **1/1 PASS** | admin thêm, nhân bản, xóa vật, thêm tường có cửa, lưu một request batch, tải lại còn nguyên; employee thấy vật nhưng không có nút sắp xếp, batch trả 403; batch có thao tác sai trả 409 và không ghi gì |

Lượt chạy cuối (mã main ff21ea7, world chạy từ /home/cc/gpb-dev/services/world, kiểm bằng /proc/<pid>/cwd trước và sau lượt chạy): tests/29-multiplayer.spec.ts --workers=1 **9/9 PASS** (VOICE_STATS A nhận 1313 byte/31 gói, B nhận 1219 byte/31 gói); `playwright.testenv.config.ts` (32, 40, 42) **13/13 PASS** trong 8,3 phút.

Sự cố trong lần lặp: afterAll của 32 (sau ca kick) khởi động lại world bằng script mặc định trong worktree cũ /home/cc/wt/roles. World khi đó chạy mã cũ và không nạp TURN_SECRET, nên các lượt 40/42 chạy sau 32 và ca thoại trong acceptance bị ảnh hưởng (thoại báo "no_turn"). Đã đổi mặc định sang /home/cc/gpb-dev/scripts/e2e/world-local.sh, đặt WORLD_LOCAL_SH trong playwright.testenv.config.ts và chạy lại toàn bộ. Số liệu trong bảng trên là của lượt chạy lại.

Lỗi thật mà e2e mới bắt được, đã sửa ở 9fa1ccd:
- **Ngoại hình không bao giờ gửi lên world.** `useAppearanceSync` phụ thuộc vào cả object `world`, mà `useWorld` trả object mới mỗi lần render. Effect chạy lại liên tục, mỗi lần tạo bộ gửi mới ở trạng thái "chưa vào phòng", nên không gửi gì. Sửa: phụ thuộc vào `client` và `subscribe`; đã kết nối thì coi như đã vào phòng. Đo bằng WebSocket: trước khi sửa không có khung `appearance` nào được gửi.
- **Lời mời bắt tay, đập tay không hiện ở người nhận.** World gửi id dạng chuỗi (`to:"2"`), còn SocialBar so với `user.id` dạng số (2). Sửa: `String(user.id)` cho SocialBar và transport xã hội.
- Task 17 (từ subagent): client đặt vật mới đè lên 10 vật cố định không có trong it.json nên máy chủ trả 409. Sửa `FIXTURE_SIZES` và `fixedRectsOf`.

Ghi chú môi trường: ba cảnh swiftshader trong cùng một trình duyệt dùng chung một tiến trình GPU, khung hình đứng hàng chục giây, heartbeat phía client hết hạn và world client bỏ cuộc (trạng thái disconnected). Vì vậy 32, 40, 42 mở mỗi người một trình duyệt. Đây là giới hạn của máy test không có GPU, không phải lỗi app.

Production: chỉ kiểm smoke theo quyết định. Trang chủ 200, /api/auth/providers 200, /api/world/health 401 khi chưa đăng nhập.

Chưa kiểm được trên môi trường test:
- **Thoại trên production:** container gpb-tool-world-1 có TURN_SECRET rỗng (không khớp coturn), nên /api/world/turn sẽ trả 503 cho người đã đăng nhập. User cc không ghi được /opt/gpb-tool/.env. Chủ dự án chạy `sudo bash /home/cc/gpb-dev/scripts/enable-turn-prod.sh`.
- **Layout batch trên production:** endpoint `POST /api/layout/batch` (task 17) mới có ở môi trường test. deploy-svc.sh không phủ layout. Chủ dự án chạy `sudo bash /home/cc/gpb-dev/scripts/deploy-layout.sh <sha>`. Trước khi deploy layout, client trên production vẫn lưu được vị trí vật gốc theo đường cũ (nhận 404 thì lưu từng vật), còn vật thêm, tường và cửa chưa lưu được.
