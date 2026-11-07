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
