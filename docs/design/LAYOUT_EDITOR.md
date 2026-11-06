# Trình biên tập bố trí (TASK 17)

Chế độ "sắp xếp nội thất" cho it/admin: lưới, hoàn tác/làm lại, đặt lại, lưu qua API có sẵn. Mã ở `src/editor/`.

## Phạm vi và hành vi
- Chỉ sửa vật trong `MOVABLE_IDS` (bàn `desk_*` luôn cố định, đúng quy tắc server). Không đổi bố trí bàn mặc định.
- Lõi thuần `core.ts`: `editorReducer`, `validatePose`, `diffPoses`, `actionForKey`. Kiểm tra dùng lại `checkPlacement`/`rectOfPose` (src/layout) và `officeCoverage` (officeBounds): footprint phải nằm trọn trong chữ L, không vào vùng cấm 1,5 m, không chồng/quá sát (0,6 m) vật cố định và vật khác.
- Bước lưới 0,1 / 0,2 / 0,5 / 1 m (server làm tròn 0,1 m nên mọi toạ độ nháp được làm tròn 0,1). Bật/tắt snap; nudge dùng `stepOnGrid` của a11y.
- Lịch sử tối đa 100 bước. Kéo liên tục (`dragStart`, `dragMove`..., `dragEnd`) chỉ cập nhật preview, thả hợp lệ mới thành đúng một bước; thả không hợp lệ thì về chỗ cũ.
- Đặt lại một vật / toàn bộ về `defaults` (đi vào lịch sử, hoàn tác được). Hủy bỏ toàn bộ nháp.
- Nháp tách khỏi bản đã lưu; `diffPoses` liệt kê vật khác nhau.
- Lưu (`save.ts`): vật về đúng mặc định gọi `resetLayout(id)`, còn lại `moveItem`. 409 lần đầu được thử lại một lượt sau khi vật khác ghi (đổi chỗ chéo); vẫn 409 thì tải lại `getLayoutState`, rebase (vật chưa sửa lấy bản máy chủ, vật đã sửa giữ nháp), báo bằng aria-live.
- Quyền: `canEditLayout(role)` chỉ `it`/`admin`; vai trò khác thấy "chỉ xem". Server vẫn là bên quyết định (403/409).
- Phím: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Ctrl+S, R, Delete (đặt lại vật), mũi tên (Shift = 5 bước), Esc (hủy). Bỏ qua khi đang gõ trong input.

## Dòng mount (không sửa các file bị cấm, bên tích hợp thêm)
Trong App (trong `LayoutProvider`, sau khi có `objects` và `user`):
```tsx
const ed = useLayoutEditor(objects, user.role);
<EditorPanel state={ed.state} dispatch={ed.dispatch} onSave={ed.save} />   // trong HUD
<EditorLayer state={ed.state} dispatch={ed.dispatch} />                    // trong <Canvas>
```
Vật di chuyển được, khi `ed.state.active`, gọi `dispatch({type:'select',id})` rồi `dispatch({type:'dragStart'})` ở `onPointerDown`; khi active nên tắt chế độ di chuyển cũ (`useMoveMode`) và điều khiển nhân vật (phím mũi tên/R trùng).

## Chưa kiểm chứng
- Chưa mount vào App, chưa chạy trong trình duyệt/WebGL: EditorGrid, EditorLayer, EditorPanel, useLayoutEditor chỉ qua tsc, chưa có test render.
- Lưu nhiều vật là nhiều request tuần tự, không nguyên tử: lỗi giữa chừng để máy chủ ở trạng thái một phần (bản nháp còn nguyên để lưu lại). API không có cơ chế `baseVersion`, nên "xung đột" chỉ phát hiện qua 409 của kiểm tra vị trí; giới hạn 30 lần/phút của `/move` có thể chặn lưu nhiều vật.
- Chưa có: thêm/xóa/nhân bản/nhóm vật, tường/cửa, đèn, nhập số theo mét/độ trong UI, lối đi tối thiểu; đây là phần còn lại của yêu cầu gốc TASK 17.
- Kiểm tra phía client dùng footprint ZoneObject (chưa tính decor chặn như `decorBlockersOf`); server kiểm lại.
