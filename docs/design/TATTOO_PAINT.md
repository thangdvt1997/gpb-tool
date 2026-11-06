# Task 19: công cụ vẽ hình xăm trên UV (không tải ảnh lên)

Theo DECISIONS_27 mục 4: hình xăm là nét vẽ hoặc mẫu có sẵn của dự án, không có bước tải ảnh. Không có `input type=file`, nên không cần kiểm duyệt ảnh. Giới hạn kích thước, kẹp đầu vào và làm sạch chuỗi vẫn áp dụng cho dữ liệu vẽ.

## File (src/tattoo)
- `schema.ts`: tài liệu `{version:2, layers[{items[stroke|stamp]}]}`, `sanitizeDoc`, `migrateDoc` (v1 -> v2), `parseDoc`/`serializeDoc`, `canAddItem`. Giới hạn: 8 lớp, 200 mục, 2000 điểm/nét, 20000 điểm tổng, 256 KB JSON, chữ 20 ký tự, cỡ cọ 0.002..0.03 UV, độ mờ 0.1..1, tỉ lệ 0.2..2.5. Màu ép về `INK_PALETTE`.
- `templates.ts`: 6 mẫu path vector tự dựng (rồng, tribal, hoa năm cánh, hoa sen, dải sóng, sao trong vòng) cộng mẫu chữ `text` (canvas text, font hệ thống).
- `raster.ts`: logic thuần trên bộ đệm RGBA: `uvBoxToRect`, `masksFor`, `inRegion`, `clampToIsland`, `densify`, `renderDoc`, `dilateEdges` (chống tràn đường nối), `drawDocToCanvas`. Chất lượng: low/medium 1024, high 2048.
- `edit.ts`: `addItem`, `removeItem`, `clearRegion`, lớp, lịch sử `commit/undo/redo` (50 bước).
- `overlay.ts`: `applyTattooOverlay(bodyMesh, canvas)` trả handle `{update,setOpacity,dispose,texture}`.
- `TattooPainter.tsx`: UI + hook `useTattooOverlay(bodyMesh)`.
- `glbUv.ts`, `regions.ts`: mask vùng da từ GLB (đã có).

## Cách hoạt động
- Điểm lưu theo UV (0..1, gốc trên trái), nên không phụ thuộc độ phân giải hay hình thể (morph không đổi UV).
- Mỗi nét/con dấu có `region` + `side`; chỉ pixel nằm trong mask vùng đó mới nhận mực. Vùng chưa có mask thì không vẽ gì. Mặt và bàn chân không có trong `TATTOO_REGIONS`.
- Mực không cộng dồn trong cùng một nét (lấy max coverage), độ mờ áp một lần. Nét tẩy trừ alpha các mục trước trong cùng lớp.
- Overlay: nhân bản vật liệu thân (vật liệu gốc dùng chung với cache của useLoader nên không sửa tại chỗ), chèn lấy mẫu `tattooMap` sau `map_fragment` bằng `vMapUv`, trộn `mix(diffuse, ink, a)`. Giữ nguyên map, ánh sáng, skinning, morph. `dispose()` trả vật liệu gốc, huỷ texture và bản sao.

## Dòng mount (điều phối viên chèn)
Trong MpfbAvatar, sau khi có `findMorphMesh(root)` (mesh thân), và masks nạp một lần từ GLB bằng `buildRegionMasks(await (await fetch(url)).arrayBuffer())`:
```tsx
import { TattooPainter, useTattooOverlay } from '../tattoo/TattooPainter';
const attachTattoo = useTattooOverlay(bodyMesh);          // trong component có bodyMesh
<TattooPainter masks={masks} initialDoc={saved} quality="medium" onCanvas={attachTattoo} onDocChange={(_, json) => save(json)} />
```
Khi tải lại: `parseDoc(json)` cho `initialDoc` (null thì dùng `emptyDoc()`). Khi tháo avatar: dispose handle (hook tự làm khi bodyMesh đổi/unmount). Nếu mesh thân bị tạo lại (đổi kiểu), gọi lại `attachTattoo` với canvas hiện có.

## Bàn phím
Tab vào bản đồ UV; mũi tên di con trỏ (Shift bước lớn); Enter/Space hạ-nhấc bút hoặc đặt mẫu; Esc huỷ nét; Ctrl+Z / Ctrl+Y (hoặc Ctrl+Shift+Z). Thông báo qua `role=status aria-live=polite`.

## Kiểm thử
`npx vitest run src/tattoo`: 31 test (schema, mẫu, raster, lịch sử, overlay với three thật, và một test đọc `public/models/male_real.glb` dựng mask thật rồi vẽ).

## Chưa kiểm chứng
- Shader chưa chạy trên GPU/trình duyệt thật: chỉ test chuỗi GLSL và hook `onBeforeCompile`. Cần xem bằng mắt trên avatar thật (cánh tay, lưng, sau khi mặc áo).
- UI `TattooPainter` chưa render trong trình duyệt; chỉ qua tsc. Chưa test con trỏ cảm ứng.
- Mask 64x64 thô: mép vùng lệch tới ~1/64 UV (khoảng 16 px ở 1024), có thể tràn nhẹ sang đường nối hoặc thiếu sát mép. Mask gán theo xương nên ranh giới vùng (vd bắp tay/cẳng tay) có thể không khớp giải phẫu.
- Hai bên (trái/phải) và mặt trước/sau có thể dùng chung vùng UV hay phản chiếu tùy mô hình; chưa kiểm tra chibi.
- Xăm chỉ nằm trong texture da: không che bởi quần áo ở mức render nếu áo là mesh riêng (áo phủ lên da nên che tự nhiên); nếu áo dùng chung texture thân thì chưa xử lý.
- Mẫu chữ cần canvas (trình duyệt); trong node không có canvas nên bị bỏ qua. Hình dạng mẫu rồng/hoa chưa được đánh giá thẩm mỹ.
- Tỉ lệ con dấu theo UV đồng đều, nên méo theo độ kéo giãn UV của từng vùng.
- Chưa có kéo-thả/chỉnh sửa mẫu đã đặt (chỉ hoàn tác); `removeItem` có sẵn trong edit.ts nhưng chưa nối UI.
- Texture 2048 nặng ~16 MB GPU; mỗi lần đổi tài liệu render lại toàn bộ CPU (khoảng 0.7 s ở 2048 trong test), chưa tối ưu tăng dần.
