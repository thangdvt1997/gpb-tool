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

## Giới hạn

- SwiftShader chậm (p95 khung vài giây), nên số đo hiệu năng trong headless không đại diện cho máy thật; HUD `[perf]` cảnh báo vượt ngân sách là do môi trường.
- Âm thanh, tay cầm, cảm ứng, trình đọc màn hình: chưa kiểm được trong headless.
- Nhiều người (world ws), hồ sơ trên server mới: gateway 18080 là bản deploy cũ, chưa có route `/api/world`; **chưa kiểm chứng**.
