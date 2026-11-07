# Quyết định cho các mục còn chờ

Ngày chốt: 2026-11-07. Người chốt: agent điều phối trên VPS, theo chỉ thị của chủ dự án: không chờ duyệt, chọn phương án an toàn (giữ hành vi hiện tại, hoặc theo đúng đặc tả nếu người dùng không bị ảnh hưởng). Mỗi mục có cách đổi lại ở cuối. Chủ dự án muốn đổi thì chỉ cần làm theo dòng "Cách đổi lại".

## 1. 11 khu nằm ngoài hình chữ L

Khu: lounge, pantry, karaoke, game, kudos, y tế, in ấn, thông báo, lối vào lounge, góc đằng sau, và một khu phụ cùng nhóm. Hiện trạng: sàn, tường, trần dựng theo hình L. Các khu này có trong dữ liệu nhưng không được dựng. Minimap không có tuyến tới chúng (test `realRoute`: vật ngoài L không có trong chỉ mục).

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Giữ hình L, không dựng 11 khu | Không đổi cảnh | Đúng bản vẽ. Không có lối vào karaoke, game, pantry |
| B. Nới hình L để chứa các khu | Sửa `src/scene/officeBounds.ts` thêm đa giác phụ, dựng tường, trần, sàn mới, cập nhật lưới chỉ đường | Đủ tính năng. Lệch bản vẽ thật. Thêm draw call (mục 3). Phải chạy lại scene-qa và test minimap |

**Chọn A.** Lý do: đây là hành vi hiện tại và đúng bản vẽ chữ L. Người dùng không mất gì so với bản đang chạy. B làm lệch bản vẽ và vượt thêm ngân sách draw call.

Cách đổi lại: thêm hình chữ nhật của khu vào `OFFICE_L_RECTS` (`src/scene/officeBounds.ts`), bỏ bộ lọc ngoài L trong phần dựng khu, rồi chạy `node scripts/scene-qa/scene-qa.mjs` và `node --test src/minimap/core/test/*.test.mjs`.

## 2. Bàn đối diện nhau

Hiện trạng: các hàng bàn song song, quay một hướng (`src/scene/interact/geometry.ts`, lưới ghế).

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Đổi sang cụm bàn đối diện | Sửa lưới ghế, hướng ghế, điểm neo ngồi | Giống ảnh văn phòng thật. Phải sửa test ghế, IK ngồi (task 03), tuyến minimap, bố trí mặc định (task 17) và bố trí người dùng đã lưu |
| B. Giữ hàng song song | Không đổi | Khác ảnh tham chiếu |

**Chọn B.** Lý do: giữ hành vi hiện tại. Bố trí người dùng đã lưu qua trình biên tập (task 17) vẫn đúng, ghế đã kiểm e2e vẫn ngồi được. Người dùng it/admin muốn bàn đối diện thì tự xoay bàn trong chế độ sắp xếp nội thất.

Cách đổi lại: đổi hướng ghế xen kẽ theo hàng trong `src/scene/interact/geometry.ts` và `Desks.tsx`, rồi cập nhật test ghế, `src/layout` (bố trí mặc định) và e2e `12-interact-editor`.

## 3. Trần draw call 200 so với khoảng 208

Hiện trạng: đo tĩnh khoảng 208 draw call (`scripts/perf/static-census.mjs`), trần ngân sách 200 (`src/perf/budget.ts`). Module perf chỉ cảnh báo khi vượt, không cắt nội dung.

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Nâng trần lên 250 | Đổi một hằng số | Hết cảnh báo. Đặc tả ghi 200 |
| B. Giữ trần 200, chỉ cảnh báo | Không đổi | Đúng đặc tả. HUD `?perf=1` báo vượt khoảng 4 %. Máy yếu đã có chất lượng tự thích nghi (task 13) bù |

**Chọn B.** Lý do: đúng đặc tả và là hành vi hiện tại. Trần chỉ dùng để cảnh báo, nên người dùng không bị ảnh hưởng. Cắt nội dung để về dưới 200 mới làm thay đổi trải nghiệm.

Cách đổi lại: sửa `maxDrawCalls` trong `src/perf/budget.ts` và test `src/perf/perf.vitest.test.ts` ("trần draw call mặc định là 200").

## 4. Múa võ và tập quyền trong bộ biểu cảm mặc định

Hiện trạng: `kata` (Múa võ, phím R trên bánh xe) và `punch_combo` (Tập quyền, phím F) nằm trong bánh xe hành động nhanh (`src/emotes/quick/logic.ts`) và `EMOTE_ORDER` (`src/emotes/library.ts`). Đây là động tác một mình, không nhắm vào ai. Thi đấu với người khác vẫn phải qua luồng đồng ý (`docs/design/DUEL_CONSENT.md`).

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Bỏ khỏi bộ mặc định, chỉ dùng trong thi đấu có đồng ý | Lọc khỏi bánh xe và `EMOTE_ORDER` | Theo khuyến nghị task 15 mục 7. Người dùng mất hai động tác đang dùng được |
| B. Giữ trong bộ mặc định | Không đổi | Người dùng dùng được mọi lúc |

**Chọn B.** Lý do: giữ hành vi hiện tại, người dùng không mất tính năng. Hai động tác không nhắm vào ai và không gây sát thương. Tương tác võ với người khác vẫn bắt buộc đồng ý.

Cách đổi lại: xóa hai dòng `act('kata', …)` và `act('punch_combo', …)` trong `src/emotes/quick/logic.ts`, bỏ `'kata', 'punch_combo'` khỏi `EMOTE_ORDER`, rồi chạy `node --test src/emotes/quick/quick.test.mjs` và `npx vitest run src/emotes`.
