# Thư viện asset và danh mục đồ (task 18, phần scene xem asset của task 01)

## Quyết định
Chưa có service assets, nên thư viện là catalog tĩnh trong repo, đọc qua adapter (`src/library/adapter.ts`). Thay nguồn dữ liệu chỉ cần sửa `src/library/sources.ts`.

## Mô hình mục (`types.ts`)
`LibraryItem`: id, kind (character / outfit / accessory / furniture / prop / animation), name (vi), description, tags, license (SPDX, nguồn, đã kiểm chứng), file, bytes, triangles, version, source, usable, reasons, warnings.

## Nguồn gộp
| Nguồn | Mục | ID |
|---|---|---|
| `public/models/manifest.json` | nhân vật, nội thất, phụ kiện, hoạt ảnh... (có tệp GLB) | `assetId` |
| `src/fashion/catalog.ts` GARMENTS | trang phục (dựng bằng mã) | `garment.<id>` |
| `ACCESSORIES_CATALOG` | phụ kiện (dựng bằng mã) | `accessory.<id>` |
| `PROP_SPOTS` (officePropsLayout) | đạo cụ/nội thất, gộp theo loại, ghi số vị trí | `prop.<kind>` |

Đồ dựng bằng mã mang giấy phép `LicenseRef-internal`. Mục manifest thiếu giấy phép, thiếu SPDX/nguồn, đường dẫn không an toàn (tuyệt đối, có `..`, có scheme) hoặc loại lạ bị đánh dấu `usable=false` kèm lý do. Giấy phép chưa `verified` chỉ là cảnh báo. ID trùng: giữ một mục, đánh dấu không dùng được và báo trong `duplicates`.

## Tìm kiếm (`query.ts`, `text.ts`)
Tìm không dấu (NFD, đ thành d), mọi từ phải khớp (AND) trên id, tên, mô tả, loại, tag. Lọc loại / tag / SPDX / chỉ dùng được. Sắp xếp theo tên, loại, dung lượng, tam giác (giá trị null luôn cuối). Phân trang có kẹp trang.

## Yêu thích và gần đây (`storage.ts`)
Khoá `gpb.library.favorites.v1` và `gpb.library.recent.v1` (tối đa 500 và 12). JSON hỏng, sai kiểu, id rỗng/trùng đều bị bỏ, không ném lỗi; không có localStorage hoặc đầy quota vẫn chạy. Id không còn trong thư viện bị lược khi mở panel.

## Thống kê GLB (`glbStats.ts`)
Đọc JSON chunk GLB 2.0 (giới hạn 32 MB), tính mesh, primitive, tam giác, đỉnh, skin, xương, morph (tổng theo mesh của số target lớn nhất mỗi mesh), vật liệu, texture, animation, bounds POSITION và danh sách URI ngoài. Không cần WebGL. Test đối chiếu `male_real.glb` với 27120 tam giác trong manifest.

## UI
- `LibraryPanel.tsx`: ô tìm, lọc, sắp xếp, lưới thẻ 3 cột, 12 mục/trang, chi tiết (giấy phép, tệp, lý do/cảnh báo), yêu thích, gần đây. Bàn phím: mũi tên di chuyển thẻ, Enter mở, F yêu thích, Esc đóng chi tiết rồi panel. Không có nút upload/publish.
- `AssetViewer.tsx`: Canvas riêng, `useGLTF` nạp tệp `/models/...` (chỉ khi `usable` và đường dẫn bắt đầu bằng `/models/`), lưới 1 m, trục, hộp bao, OrbitControls; hiện mesh / tam giác / xương / morph / vật liệu / kích thước đo từ cây Object3D. Lỗi nạp hiện thông báo, không sập panel. Nạp lười (`lazy`) nên đổi bộ lọc không tải lại GLB; `useGLTF` có cache.

## Dòng mount (chủ App thêm; tôi không sửa App.tsx)
```tsx
import { lazy, Suspense } from 'react';
const LibraryPanel = lazy(() => import('./library').then((m) => ({ default: m.LibraryPanel })));
// trong JSX, khi state libraryOpen = true:
{libraryOpen && <Suspense fallback={null}><LibraryPanel onClose={() => setLibraryOpen(false)} /></Suspense>}
```
Panel cần vùng chứa cố định/overlay do App cung cấp (panel chỉ có `maxWidth: 560`).

## Chưa kiểm chứng / chưa làm
- Giao diện chưa chạy trong trình duyệt, chưa chụp ảnh; AssetViewer chưa nạp thử GLB thật trong WebGL (chỉ tsc và test logic thuần).
- Chưa làm: thumbnail và fallback ảnh, upload/import, version bất biến theo hash, xem nơi đang dùng trước khi xoá/deprecate, tương thích theo nhân vật hiện tại, batch tagging, ảo hoá danh sách lớn (hiện phân trang), lọc theo style/màu/rig/body range/layer/trạng thái draft. Cần backend hoặc bước import task 19.
- Manifest hiện chỉ có 2 nhân vật; `chibi.glb` chưa có trong manifest nên chưa hiện. Tên hiển thị của mục manifest là assetId (chưa có tên vi trong schema).
- Số morph của viewer lấy từ `morphTargetInfluences` của mesh nên có thể đếm lặp giữa các mesh dùng chung target.
