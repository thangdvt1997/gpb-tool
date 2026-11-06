# Hiệu năng (Task 08, phần runtime)

Mã: `src/perf/**`. Hướng dẫn đo máy thật: `scripts/perf/bench.md`. Đếm tĩnh: `node scripts/perf/static-census.mjs`.

## Thành phần
| File | Vai trò |
|---|---|
| `stats.ts` | p50/p95/p99, FPS, khung giật > 50 ms, cửa sổ trượt (thuần, có test) |
| `budget.ts` | Ngân sách cấu hình được (draw call 200, tam giác, texture MB ước lượng, geometry, p95). CHỈ cảnh báo |
| `leak.ts` | Bộ đếm rò rỉ geometry/texture qua N chu kỳ; phân biệt `bounded-growth` và `suspect-leak` |
| `bench.ts` | Đường camera tất định, bộ ghi kết quả JSON, đọc `?perf=1`, `?bench=1&benchSec=N` |
| `store.ts` | Kho số liệu ngoài React (không setState mỗi khung) |
| `PerfProbe.tsx` | Trong Canvas: đo khung, đọc `gl.info`, kiểm ngân sách, cấp mẫu cho adaptive, chạy bench |
| `PerfOverlay.tsx` | HUD DOM, bật bằng `?perf=1` hoặc F3, cập nhật ~4 Hz |

## Nối với src/quality
`PerfProbe` nhận `adaptive` (từ `createAdaptiveController`) và gọi `adaptive.push({ ms, drawCalls }, now)` mỗi khung; nếu có đổi mức thì gọi `onQualityChange(change)`.
Khi tab ẩn/hiện gọi `adaptive.resetWindow()`. Probe không tự áp mức; App quyết định (và tôn trọng khóa preset qua `adaptive.setEnabled(false)`).

## Dòng mount (cho người sở hữu App.tsx; agent này không sửa)
```tsx
import { PerfProbe, PerfOverlay } from './perf';
// trong <Canvas> ... :
<PerfProbe adaptive={adaptive} onQualityChange={(c) => setLevel(c.to)} />
// ngoài Canvas, cùng cấp với HUD khác:
<PerfOverlay />
```
`adaptive` và `setLevel` là biến App đang dùng cho task 13 (tên minh họa). Không có adaptive thì bỏ prop; probe vẫn đo.
Bench: truyền `benchPath` đúng tọa độ cảnh thật.

## Phân loại số liệu
- Đo thật trong trình duyệt: thời gian khung rAF (CPU/compositor), `gl.info.render/memory`, `performance.memory.usedJSHeapSize` (Chromium).
- Ước lượng: `textureMB` (w*h*4, *4/3 mipmap; bỏ qua nén). Không gọi là bộ nhớ GPU.
- Không có: thời gian GPU (cần `EXT_disjoint_timer_query`, chưa làm).
- `info.render.calls` là của khung cuối, gồm pass đổ bóng.

## Đề xuất (không thực hiện; đổi trần/cảnh nằm ở PENDING_DECISIONS mục 3)
1. Đo trước bằng bench trên máy thật để biết ~208 draw call là thật hay ước tính.
2. Nếu vượt: ưu tiên instancing đồ tĩnh lặp (giữ ID đồ tương tác), tắt đổ bóng ở mức Thấp rồi so lại, sau đó mới tính LOD.
3. Chạy vòng đổi trang phục/vào-ra scene >= 20 lần với `createLeakCounter` ở cả hai preset.

## Chưa kiểm chứng
- PerfProbe/PerfOverlay/bench chưa chạy trong trình duyệt (VPS không có GPU/trình duyệt); chỉ typecheck + test logic thuần (23 test).
- Đường bench mặc định dùng tọa độ giả định.
- Overlay dùng một cache snapshot cấp module: dùng nhiều store cùng lúc chưa được hỗ trợ.
- `LeakCounter` chưa nối vào luồng đổi trang phục/cảnh (cần hook ở nơi dispose); hiện là API để gọi.
- Chi phí của PerfProbe (duyệt scene mỗi 1 s để ước lượng texture) chưa đo.
