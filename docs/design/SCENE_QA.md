# Kiểm tra chất lượng scene (scene-qa)

Phạm vi: dữ liệu `src/content/zones/it.json`, đa giác chữ L trích từ `src/scene/officeBounds.ts` (đổi sang hệ three.js bằng x-29, y-15 như `layout.ts`), quy tắc vật đặc của `layout.ts`. Chỉ đọc, không sửa dữ liệu.

## Lệnh
```
node scripts/scene-qa/scene-qa.mjs                 # báo cáo văn bản
node scripts/scene-qa/scene-qa.mjs --json|--md     # JSON hoặc Markdown ra stdout
node scripts/scene-qa/scene-qa.mjs --out FILE      # ghi thêm báo cáo ra FILE (chỉ ghi FILE này)
node scripts/scene-qa/scene-qa.mjs --baseline B.json --strict
node scripts/scene-qa/selftest.mjs                 # chạy fixture trong scripts/scene-qa/fixtures
sh scripts/scene-qa/smoke.sh [thư mục dự án]       # smoke cho VPS: selftest + quét dữ liệu thật
```
Mã thoát: 0 sạch, 1 có error (hoặc warning khi `--strict`), 2 lỗi chạy. Baseline: `{"suppress":[{"ruleId":"SCN-040","objectId":"x","reason":"..."}]}`; bắt buộc có lý do, chỉ tắt từng cặp rule và vật.

## Rule
| ID | Mức | Nội dung |
|---|---|---|
| SCN-000 | error | Không trích được đa giác L |
| SCN-001/002 | error | Thiếu id / id trùng |
| SCN-003/004/005/006 | error | kind sai, vector sai, giá trị không hữu hạn, size không dương |
| SCN-007/008/009 | warning/error/warning | Kích thước bất thường, vị trí xa sàn, thiếu label |
| SCN-010 | error | roles thiếu hoặc lạ |
| SCN-020..024 | error/warning | Thiếu action, action lạ, action sai kind, thiếu capacity, thiếu squad |
| SCN-030/031 | warning | Vật ngoài hoặc cắt ngang chữ L (không được dựng) |
| SCN-040 | error/warning | Footprint chồng (warning nếu cả hai ngoài L); cặp có chủ ý ở `ALLOWED_OVERLAPS` |
| SCN-050/051 | error | Cửa thang xa lõi; thiếu lift7_east hoặc security_gate |
| SCN-052..054 | error | Điểm bắt buộc (SPAWN, điểm thả, trước cabin thang, quanh bàn an ninh) ngoài L, trong vật cản, hoặc khoảng trống dưới 1 m |
| SCN-060..062 | error | Spawn bị chặn; điểm bắt buộc hoặc vật có action không tới được (BFS lưới 0,1 m, bán kính 0,35 m) |

Mỗi lỗi có ruleId, severity, objectId, message, location, suggestedFix.

## Chưa làm (chưa kiểm chứng)
Schema/hash/file asset, texture thiếu, parent cycle, collider, hinge/travel limit cửa, rig/garment/texture budget nhân vật, panel editor, auto-fix có undo, HTML. `ASSET_STANDARD.md` chưa có nên bỏ qua phần asset. Lối đi 1 m là tiêu chuẩn dự án, không phải kiểm định pháp lý. Va chạm decor trong phòng không được quét; footprint là AABB.
