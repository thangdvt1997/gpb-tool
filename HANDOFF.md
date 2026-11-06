# Bàn giao dự án GP văn phòng 3D cho agent trên VPS

Ngày: 2026-11-06. Người giao: người dùng. Đọc file này đầu tiên.

## 1. Vị trí và phạm vi

- Bản làm việc sau khi tải lên: `/home/cc/gpb-dev` (user `cc`). Đây là thư mục duy nhất được sửa.
- KHÔNG đụng vào:
  - `/opt/gpb-tool`: bản đang chạy tại gp.daisoncoop.com. Chỉ deploy khi người dùng duyệt.
  - `/root/trading-system` và mọi phiên `ts`, `tmux`, `claude` của dự án trading.
  - `/opt/office3d`, `/opt/gpb-mpfb` (đầu ra pipeline MPFB, chỉ đọc).
- Đặc tả gốc: `promy_update/27_Prompt_Van_Phong_3D_Claude.md` (27 task) và `promy_update/control.txt`, `room.txt`, `fashion.txt`, `user.txt`, `tuongtac.txt`.
- Trạng thái từng task: `docs/design/TASK_STATUS.csv`. Cập nhật file này khi có kiểm chứng.
- Quyết định đã chốt: `docs/design/DECISIONS_27.md`.
- Bảng đối chiếu yêu cầu với mã: `docs/design/COMPLIANCE_MATRIX.md`. Kế hoạch: `docs/design/PROMPT27_EXECUTION_PLAN.md`.
- Ghi chú bàn giao từng phần: `docs/design/HANDOFF_*.md` (camera, minimap nếu có).

## 2. Quy tắc làm việc

- Chưa khởi tạo git. Đề xuất `git init` cục bộ trong `/home/cc/gpb-dev` để theo dõi thay đổi. Không push ra remote khi chưa được duyệt.
- Không deploy production khi chưa có duyệt của người dùng. Build và test trong `/home/cc/gpb-dev` là được phép.
- Không hardcode secret. Mật khẩu và secret ở máy người dùng, không có trên VPS. Đọc từ biến môi trường.
- Không đưa file GLB lớn vào git. Asset nằm trong `public/models/`, ghi nguồn trong `public/models/manifest.json`.
- Mọi tính năng phải kiểm chứng. Không báo hoàn tất nếu chưa test. Ghi rõ phần "chưa kiểm chứng".
- Không sửa `src/data` (đã có dữ liệu cần thiết).

## 3. Lệnh kiểm thử hiện có

Chạy trong thư mục gốc `gpb-dev`:

```
node --test src/persist/__tests__/core.test.mjs
node --test src/emotes/quick/quick.test.mjs
node --test src/photo/photo.test.mjs
node --test scripts/assets/validate-manifest.test.mjs
node scripts/assets/validate-manifest.mjs
node scripts/scene-qa/selftest.mjs
node scripts/scene-qa/scene-qa.mjs
cd services/auth && node --test test/
cd services/world && node --test test/*.test.js
```

Chưa chạy được bằng node thuần (file TypeScript): `src/a11y/a11y.test.ts`, `src/settings/selftest.ts`. Cần cài `vitest` hoặc `tsx`, theo quyết định đã chốt là vitest.

Chưa chạy được: kiểm tra kiểu toàn dự án (`npx tsc --noEmit`), build web (`npm run build`). Cần chạy trên VPS và sửa lỗi phát sinh.

## 4. Việc đang dở (đã nhắn dừng và ghi bàn giao)

- Task 05 (camera ổn định): đọc `docs/design/HANDOFF_CAMERA.md`.
- Task 09 (minimap và chỉ đường): đọc `docs/design/HANDOFF_MINIMAP.md`.
- Task 23 (đồng bộ nhiều người): service `services/world` dùng WebSocket `ws`. Chưa deploy. Gateway cần header Upgrade cho `/api/world`. Chi tiết trong `docs/design/WORLD_SYNC.md`.

## 5. Việc tiếp theo, theo thứ tự đề xuất

1. Nối nhân vật MPFB vào cảnh: `src/avatar/MpfbAvatar.tsx` đã có, cần truyền `look` hoặc `mpfb` từ `src/scene/Player.tsx`. Sửa lại vật liệu thân từ BLEND sang OPAQUE, lông mày sang MASK (xem báo cáo task 01).
2. Gắn các module đã viết vào app. Mỗi module có dòng mount ghi trong `docs/design/*.md`:
   - `src/persist` (task 06)
   - `src/help` (task 10, đã gắn 3 dòng vào `App.tsx`)
   - `src/a11y` (task 12)
   - `src/emotes/quick` (task 15)
   - `src/photo` (task 16)
   - `src/settings` (task 11, cần nối `session.ts` và `interact/settings.ts`)
   - Khung tương tác `src/scene/interact/framework.ts`: thay tracker cũ, không để hai hệ cùng nghe phím E.
3. Chạy `npx tsc --noEmit` trên VPS, sửa lỗi kiểu.
4. Chạy toàn bộ lệnh test ở mục 3, ghi kết quả.
5. Làm các task chưa bắt đầu: 07, 08, 13, 14, 17, 18, 19 (vẽ hình xăm trên cơ thể, không tải ảnh lên), 20, và 24 đến 27 theo `PROMPT27_EXECUTION_PLAN.md`.
6. Khi đủ điều kiện, đề xuất deploy và chờ duyệt.

## 6. Quyết định đã chốt (chi tiết `DECISIONS_27.md`)

- Nhân vật: mô hình người MakeHuman/MPFB (CC0). Đã có ba GLB: nam, nữ, chibi.
- Nhiều người: tự viết service bằng Node với thư viện `ws`.
- Domain: đã có `gp.daisoncoop.com` với HTTPS.
- Hình xăm: vẽ trong app lên UV của mô hình, không tải ảnh lên. Mẫu có sẵn do dự án tự tạo.
- Vật lý: giữ va chạm hộp (AABB), không dùng Rapier. Test dùng vitest.

## 7. Quyết định còn chờ người dùng

- 11 khu nằm ngoài hình chữ L (lounge, pantry, karaoke, game, kudos, y tế, in ấn, thông báo, lối vào lounge, góc đằng sau). Chọn: giữ hình L, nới hình L, hoặc bỏ khu.
- Bàn đối diện nhau: cần sửa lưới ghế trong `src/scene/interact/geometry.ts`, hay giữ hàng bàn song song.
- Trần draw call: đang khoảng 208, trần 200. Chọn: nâng trần hay giảm thêm.
- Múa võ và tập quyền có nằm trong bộ biểu cảm mặc định không.

Không tự quyết các mục này. Ghi câu hỏi và chờ người dùng.
