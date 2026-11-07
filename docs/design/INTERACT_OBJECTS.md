# Tương tác vật (cửa, ghế, máy tính, ngăn kéo, đèn, TV, rèm, đồ nhỏ, máy in, cây nước)

Mã: `src/scene/interact/objects/`. Dựa trên khung `src/scene/interact/framework.ts` (registerInteractable, objectStates). Không sửa file nào ngoài thư mục này.

## Cấu trúc

| File | Nội dung |
|---|---|
| `interactEvents.ts` | Bus sự kiện (`emitInteractEvent`, `onInteractEvent`, `onInteractEventType(['door.'], cb)`). Hệ âm thanh nghe sau; sự kiện có `x, z` để phát theo khoảng cách. |
| `tickers.ts` | `registerTicker`, `tickAll(dt)`; logic theo thời gian (tự đóng cửa, rót nước, in). |
| `door.ts` `chair.ts` `computer.ts` `drawer.ts` `lightSwitch.ts` `tv.ts` `curtain.ts` `smallItem.ts` `printer.ts` `waterCooler.ts` | Mỗi file: reducer thuần + `*Interactable()` (InteractableDef) + (nếu cần) `register*Ticker`. |
| `components.tsx` | Mesh primitive, damp trong `useFrame`: `DoorMesh, ComputerMesh, DrawerCabinetMesh, GroupLight, SwitchMesh, TvMesh, CurtainMesh, ItemMesh, PrinterMesh, WaterCoolerMesh, ObjectsTicker`. |
| `index.ts` | `registerObjects(config)` đăng ký tất cả, trả hàm hủy. |
| `InteractObjects.tsx` | Khu mẫu dựng từ `PROP_SPOTS` + component mount. |

Nguyên tắc: mesh chỉ đọc `useObjectState`; mọi thay đổi qua action của def -> `setObjectState` nên tự lưu/đặt lại cùng objectStates. Giá trị state chỉ là primitive (string/number/boolean).

## Hành vi chính

- Cửa: pha closed/opening/open/closing/locked. Hướng quay chốt lúc mở = phía người đứng, lá cửa đi về phía xa người (`dir = playerSideOf`, có test hình học). Góc tối đa 100 độ, tự đóng sau 8 s, `lockable` bật hành động Khóa/Mở khóa. Chặn: `doorBlocked` (đoạn lá cửa so với vòng tròn người, bán kính 0,35 + độ dày). Chặn khi mở: dừng tại chỗ; chặn khi đóng: dừng và mở lại (không đẩy xuyên người).
- Ghế: `occupant`, `swivel`. `wrapChairs(chairInteractables(objects), ...)` tái dùng chairs.ts: giữ hành động `sit` gốc (requestSit), thêm chiếm chỗ, đứng dậy kiểm tra chỗ trống (`findStandSpot`: sau, trái, phải, trước), xoay ghế. `bindSeatRelease` nhả chỗ khi nhân vật về `walking`.
- Máy tính: bật/tắt, đăng nhập giả, đổi hình nền, ghi chú (<= 500 ký tự), tài liệu mẫu; `screenGlow` cho emissive. Chỉ dùng khi đứng trước bàn (`standAt`, bán kính 1,1) hoặc ngồi ghế gắn (`chairId`). Mở giao diện + camera qua callback `openUi` (chưa nối, xem "chưa kiểm chứng").
- Ngăn kéo: mỗi ngăn một id `${tủ}:d${i}`; mở ngăn mới đóng ngăn khác; ngăn khóa phát `drawer.locked`. Vật bên trong là con của `DrawerFront` nên đi theo ngăn.
- Công tắc: trạng thái nhóm ở objectStates id `lightgroup:<nhóm>`. Hệ đèn đọc `isLightGroupOn(g)` / `useLightGroup(g)` hoặc nghe `light.switch` (`data.group`, `data.on`). `GroupLight` là đèn điểm mẫu damp theo nhóm.
- TV: bật/tắt, 4 kênh mẫu (vòng), âm lượng 0..10. Rèm: `open` 0..1, bước 0,25; `getCurtainDaylight(id)` (0,08..1) để hệ render nhân vào ánh sáng ngày.
- Đồ nhỏ: một vật trên tay (`getHeldItem`), chuyển `walking -> holding`; đặt qua vật "mặt đặt" (`surfaceInteractable`): kiểm tra nằm trọn trong mặt (không nhô mép) và không chồng vật khác, `item.denied` kèm `reason`. `registerItem` đăng ký lại footprint khi vật được đặt chỗ mới.
- Máy in: hàng đợi tối đa 5, 4 s/lệnh, kẹt giấy (xác suất `jamChance`, rng tiêm vào), gỡ kẹt thì in lại lệnh.
- Cây nước: lấy cốc -> rót lạnh (2,5 s) / nóng (3,5 s) -> lấy cốc nước.

## Sự kiện âm thanh

`door.open|close|locked|lock|unlock|blocked`, `chair.sit|stand|swivel|denied`, `computer.on|off|login|logout`, `drawer.open|close|locked`, `light.switch`, `tv.on|off|channel|volume`, `curtain.move`, `item.pickup|place|return|denied`, `printer.queue|start|done|jam|clear`, `water.cup|pour|done|denied`.

## Dòng mount (điều phối viên chèn)

Trong `ITOffice.tsx`, trong Canvas, cạnh `OfficeProps`:

```tsx
import { InteractObjects } from './interact/objects/InteractObjects';
// ...
<InteractObjects objects={zone.objects} blocked={(x, z) => isBlockedAt(x, z)} />
```

`zone.objects` là mảng `ZoneObject[]` đang truyền cho `chairInteractables`. `blocked(x, z)` nên dùng cùng phép kiểm tra va chạm của Player (hợp `collisionRects(objects)` + `OFFICE_PROP_BLOCKERS` nở thêm `PLAYER_RADIUS`); nếu chưa có hàm sẵn thì truyền `() => false` (đứng dậy luôn được).

Vị trí khu mẫu lấy từ `PROP_SPOTS`: tủ hồ sơ đầu tiên (3 ngăn, ngăn 3 khóa), máy lọc nước đầu tiên (cây nước + công tắc cạnh bên + đèn nhóm `sample_zone`), TV (chỉ đăng ký tương tác, không vẽ mesh vì OfficeProps đã vẽ), tủ thấp đầu tiên (máy in + cốc + mặt đặt). Đã thêm ở góc Đông-Nam (SAMPLE_DOOR, SAMPLE_DESK, SAMPLE_CURTAIN): cửa kho `sample_door` (mép Đông chữ L), máy tính `sample_computer` trên bàn nhỏ, rèm `sample_curtain` ở tường Nam; test `placement.vitest.test.ts`. Hành động máy tính "Dùng máy tính" tự bật máy, đăng nhập và mở `ComputerPanel` (mount trong App.tsx; đồng hồ, ghi chú localStorage, Esc đóng, holdPause); đóng panel thì máy về nghỉ. Cửa/bàn chưa có va chạm cho người chơi (khung chưa hỗ trợ). Vị trí khác: dùng `DoorMesh`/`ComputerMesh`/`CurtainMesh` với `doors`, `computers`, `curtains` của `ObjectsConfig` khi có tọa độ.

Chú ý: ngăn kéo mẫu vẽ chồng lên tủ hồ sơ `OfficeProps` tại cùng vị trí; điều phối viên nên ẩn tủ đó hoặc chọn `PROP_SPOTS` khác.

## Số draw call thêm (ước lượng, chưa đo)

Cửa 2; máy tính 2; tủ 3 ngăn: 1 thân + 3 mặt = 4 (mỗi ngăn chứa đồ +n); công tắc 2; TV 1 (+1 khi bật); rèm 1; đồ nhỏ 1; máy in 3; cây nước 2 (+2 khi có cốc). Khu mẫu hiện mount: tủ 4 + cây nước 2..4 + máy in 3 + công tắc 2 + đồ nhỏ 1 = khoảng 12..14 draw call. Chưa dùng instancing (số vật ít); nếu nhân bản nhiều (ví dụ 30 ngăn kéo) nên gộp bằng InstancedMesh. Đèn điểm `GroupLight` tốn thêm chi phí shader theo số đèn, không phải draw call.

## Test

`npx vitest run src/scene/interact/objects` : 47 test (logic thuần + tích hợp registry/objectStates/tickers/bus).

## Chưa kiểm chứng

- Chưa chạy trong trình duyệt: mesh, damp, vị trí khu mẫu, chồng với `OfficeProps` chưa xem bằng mắt.
- `openUi` của máy tính, camera đưa gần màn hình, ô nhập chặn W/A/S/D: chưa làm (cần lớp UI/camera ngoài phạm vi).
- Hành động ghế dùng `requestSit/requestStand`; việc chuyển `characterState` sang `seated` do InteractionSystem; nhả `occupant` dựa vào về `walking`. Đứng dậy qua phím E của hệ thống không đi qua `findStandSpot` (chỉ hành động `stand` của def mới kiểm chỗ trống); chỗ đứng thật do `useGtaPlayer` quyết định.
- Menu nhiều hành động, nút cảm ứng, viền sáng: thuộc khung có sẵn, chưa thử với def mới.
- Vật lý thả rơi đồ nhỏ, xem trước xanh/đỏ khi đặt (prop `preview` của ItemMesh có nhưng chưa nối), IK tay, âm thanh thật: chưa làm.
- Đồ nhỏ đã nhấc đi thì hành động `pickup` ở chỗ mới dựa vào đăng ký lại footprint; chưa thử nhiều lần đặt liên tiếp.
- Chế độ sắp xếp nội thất (mục 3 của tuongtac.txt) không thuộc phạm vi này.
- Đa người dùng: `occupant` có chuỗi người dùng nhưng chưa có xác nhận quyền phía máy chủ.
- Trần draw call, cửa kính/L-shape/múa võ: không đụng tới.
