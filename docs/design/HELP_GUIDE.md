# Hướng dẫn lần đầu và gợi ý ngữ cảnh (task 10)

Mã nguồn: `src/help/`. Mount trong `src/App.tsx`: `<HelpLayer />`, `<HelpReplayButton />` (đã có). Cần thêm (App.tsx ngoài phạm vi task này):

```tsx
import { HelpLayer, HelpReplayButton, HelpCenter } from './help';
<HelpLayer role={user.role} />
<HelpCenter role={user.role} />   {/* F1 hoặc ? mở trang trợ giúp */}
```

`role` không bắt buộc; thiếu thì ẩn bước và chủ đề dành cho IT/admin.

## Hành vi

- Lần đầu vào cảnh, thẻ hướng dẫn tự mở: giới thiệu, di chuyển, xoay camera, đổi góc nhìn, tương tác, tạm dừng, xong.
- Mỗi bước có Tiếp, Quay lại (từ bước 2) và Bỏ qua. Bỏ qua hoặc Xong đều ghi nhớ đã xem.
- Nút "Xem lại hướng dẫn" (góc dưới phải) mở lại từ bước 1 bất cứ lúc nào.
- Thẻ không chặn thao tác: vẫn đi lại và tương tác khi thẻ đang mở.
- Gợi ý ngữ cảnh: lần đầu vật được chọn là cửa, ghế hoặc máy tính thì hiện một dòng ngắn 7 giây, mỗi loại một lần. Không hiện khi thẻ hướng dẫn đang mở.

## Điều kiện hoàn tất (đọc trạng thái thật, không giả lập)

| Bước | Nguồn |
| --- | --- |
| Di chuyển | `playerPose` cách điểm đầu bước từ 1,5 m, hỏi 4 lần mỗi giây |
| Đổi góc nhìn | `useControlSnapshot().firstPerson` đổi |
| Tương tác | `subscribeObjectStates` có thay đổi, hoặc `seated` chuyển sang đúng |
| Tạm dừng | `useControlSnapshot().paused` |

Điều kiện chỉ hiện dòng "Bạn đã ..." trên thẻ, không khóa nút Tiếp. Bước xoay camera không có sự kiện đáng tin trong code hiện tại nên là bước đọc.
Gợi ý ngữ cảnh lấy từ vật đang chọn của hệ tương tác mới (`useInteractionSnapshot`, có `kind`) hoặc cũ (`useInteractSnapshot`, suy ra loại từ nhãn và động từ). Không tạo sự kiện mới.

## Lưu trữ

Khóa localStorage `gpb.help.v1`: `{ version, completed, hints }`, bọc try/catch. Tăng `TUTORIAL_VERSION` trong `helpState.ts` để người đã xem thấy lại các bước, các gợi ý ngữ cảnh đã xem được giữ nguyên. Chưa lưu bước đang xem: tải lại giữa chừng thì mở lại từ bước 1 nếu chưa xong.

## Phím

Tên phím nằm ở `KEYS` trong `steps.ts`. Bộ điều khiển hiện tại cố định phím nên chưa đọc từ bảng đổi phím; khi task 11 có action mapping, thay nguồn của `KEYS`.

## Bàn phím và trợ năng

- Khi mở, focus vào nút Tiếp; khi đóng, trả về phần tử đang focus trước đó (hoặc nút Xem lại hướng dẫn). Không bẫy Tab.
- Esc khi focus trong thẻ: đóng thẻ và chặn sự kiện lan ra để không mở menu tạm dừng. Thẻ dùng `role` region, không phải dialog, nên Esc ngoài thẻ vẫn tạm dừng như cũ.
- Dòng hoàn tất và gợi ý ngữ cảnh nằm trong vùng `role="status"`. Không có hiệu ứng chuyển động.

## Điện thoại

Dưới 480 px thẻ dàn ngang ở đỉnh, cao tối đa 38% màn hình, chừa đáy cho nút tương tác và joystick. Bước đổi góc nhìn và tạm dừng bị ẩn trên cảm ứng vì chưa có nút tương ứng.

## Chưa kiểm chứng

Chưa chạy trình duyệt, typecheck hay build. Bố cục trên điện thoại, vị trí chồng với các lớp khác (`hud.css`, `ix-*`), thứ tự focus và hành vi Esc cần kiểm tra thực tế.

## Cập nhật task 10 (v2)

- Bước mới (since 2): bản đồ nhỏ, chụp ảnh và biểu cảm, Cài đặt và đổi phím, tay cầm (chỉ khi có kết nối), sắp xếp nội thất (chỉ it/admin), tương tác thêm ngăn kéo, cây nước, máy in, công tắc. Gợi ý ngữ cảnh thêm 4 loại vật này.
- Tên phím lấy động: `keys.ts` `keyNamesFrom(settings.bindings, controlMode)` dùng `keyLabel`; `KEYS` cố định đã bỏ. Đổi phím trong Cài đặt thì chữ đổi ngay.
- Lưu trữ: khóa `gpb.help.v1` nay có `seenVersion`. Dạng cũ `{version, completed}` vẫn đọc được (seenVersion = version). `TUTORIAL_VERSION` = 2: người đã xem v1 chỉ thấy các bước có `since` > 1 (rồi bước Xong); nút Xem lại luôn hiện đủ.
- `HelpCenter.tsx`: trang tra cứu, danh sách chủ đề (`topics.ts`), ô tìm không dấu (`foldVi`), mở bằng F1 hoặc ? (bỏ qua khi đang gõ vào ô nhập), Esc đóng. F1 nằm trong `RESERVED_CODES` nên không bị gán lại. Export `openHelpCenter`/`closeHelpCenter` để nút khác gọi.
- Điện thoại (rộng tối đa 760 px và pointer coarse, hoặc dưới 480 px): thẻ ở đỉnh, cao tối đa 34vh, chữ 16 px, nút từ 44 px; nút Xem lại hướng dẫn dời xuống giữa đáy để không đè joystick và cụm nút.
- Test: `src/help/help.vitest.test.ts` (22 test).

Chưa kiểm chứng: trình duyệt thật, bố cục điện thoại và chồng lớp với HUD/minimap, phím chụp ảnh và bánh xe biểu cảm không nằm trong cài đặt nên chữ hướng dẫn nói chung chung, chưa có test render React.
