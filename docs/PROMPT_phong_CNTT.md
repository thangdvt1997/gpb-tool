# PROMPT: GPBank Virtual Office, module 1 "Phòng CNTT & Ngân hàng số"

Bạn là kỹ sư full-stack kiêm 3D web. Nhiệm vụ: xây module đầu tiên của website 3D nội bộ cho nhân viên GPBank, gồm phòng Công nghệ thông tin và Ngân hàng số (đơn vị vận hành app GP.DigiPlus). Các khối còn lại làm sau, nhưng kiến trúc phải cho phép thêm khu mới bằng cấu hình (xem mục 5), không sửa code lõi.

## 1. Bối cảnh và mục tiêu

- Người dùng: nhân viên GPBank (nội bộ), không phải khách hàng. Đăng nhập bằng SSO nội bộ.
- Thay vì menu phẳng, nhân viên "bước vào" văn phòng 3D: đi lại, thấy đồng nghiệp đang ở khu nào, bấm vào vật thể để xem thông tin hoặc thực hiện hành động nghiệp vụ.
- Giữ tinh thần của bản 3D trước: không gian 3D, avatar, tương tác bằng click vào vật thể, bảng thông báo, bảng vinh danh, minimap.
- Bỏ hoàn toàn: livestream, quà tặng bằng kim cương/tiền ảo, bảng xếp hạng theo tiền. Thay "quà" bằng "vinh danh" (kudos): ghi nhận đồng nghiệp bằng lời nhắn ngắn, không có giá trị tiền.

## 2. Ràng buộc bắt buộc

1. **Nội bộ:** chạy trong hạ tầng GPBank hoặc VPS/server nội bộ đã được duyệt. Không gửi dữ liệu nội bộ tới dịch vụ SaaS bên ngoài.
2. **Không dùng dữ liệu thật** trong giai đoạn này. Mọi số liệu là mock có cấu trúc giống API thật (mục 6).
3. **Chi phí phần mềm bằng 0.** Chỉ dùng OSS có license cho phép dùng thương mại: MIT, Apache-2.0, BSD, ISC, MPL-2.0; asset dùng CC0 hoặc CC-BY kèm ghi nguồn. Không dùng code hoặc asset không có license. Thư viện GPL/AGPL chỉ dùng khi pháp chế đã xác nhận.
4. **OSS-first:** trước khi viết module mới, rà OSS (license, mức bảo trì, chạy được trên laptop văn phòng). Ghi vào `docs/OSS_REUSE.md` và `THIRD_PARTY.md`.
5. **Không thao tác hệ thống trực tiếp từ 3D.** Mọi hành động có ảnh hưởng (tạo ticket, báo sự cố, đặt phòng) đi qua API có xác nhận và ghi audit log. Scene 3D chỉ hiển thị và gửi yêu cầu.
6. **Giao diện tiếng Việt.** Thuật ngữ kỹ thuật giữ tiếng Anh (ticket, incident, on-call).
7. **Hiệu năng:** mượt (≥30 fps) trên laptop văn phòng cấu hình trung bình (Intel i5, 8 GB RAM, GPU tích hợp). Có chế độ 2D fallback khi WebGL không hỗ trợ.

## 3. Phạm vi module 1: Phòng CNTT

Bố cục khu vực (mỗi khu là một zone trong `content/zones/it.json`):

| Khu | Nội dung | Hành động khi click |
|---|---|---|
| Quầy Service Desk | Nhân viên hỗ trợ ảo | Mở panel "Yêu cầu hỗ trợ": tạo ticket, xem trạng thái ticket của tôi |
| Tường NOC (màn hình lớn) | Trạng thái dịch vụ: app GP.DigiPlus (app, API, DB), tích hợp core, cổng thanh toán, hạ tầng (cluster, DB). Chỉ đọc, làm mới 30 giây | Mở chi tiết dịch vụ, lịch sử 24 giờ, người phụ trách |
| Khu Ứng dụng (bàn các squad) | Mỗi bàn là một squad: Mobile, Backend, Core integration, Data/BI | Xem thông tin squad, ai đang on-call |
| Khu An ninh thông tin (SOC) | Tóm tắt cảnh báo mức cao: số lượng theo mức độ | Xem tóm tắt. Không hiển thị log thô |
| Phòng máy chủ (kính) | Cửa cần thẻ (mô phỏng theo quyền). Bên trong: sơ đồ rack, trạng thái node | Chỉ đọc. Không có nút điều khiển |
| Phòng họp | Bảng lịch phòng họp | Xem phòng trống, đặt phòng |
| Bảng thông báo | Lịch bảo trì và thay đổi (change calendar), sự cố đang mở, quy định IT | Mở và đọc chi tiết |
| Lounge | Khu nghỉ, có presence (ai đang online trong phòng), chat nhanh | Chat nhanh, xem avatar đồng nghiệp |
| Bảng vinh danh | Danh sách lời cảm ơn gần đây | Gửi vinh danh cho đồng nghiệp |

**Hành động chính (action bar hoặc panel):**
1. Yêu cầu hỗ trợ (tạo ticket).
2. Báo sự cố khẩn, mức P1/P2. Có xác nhận hai bước trước khi gửi, tự gọi on-call.
3. Xem trạng thái hệ thống và lịch bảo trì.
4. Đặt phòng họp.
5. Vinh danh đồng nghiệp: chọn người, lời nhắn tối đa 140 ký tự, giới hạn 1 lần mỗi người mỗi ngày.
6. Xem hồ sơ người hoặc squad: tên, vai trò, trạng thái on-call.

**Điều khiển:** WASD hoặc phím mũi tên đi lại. Kéo chuột để xoay camera. E hoặc click để tương tác. Esc đóng panel. Tab để điều hướng bằng bàn phím. Minimap ở góc trên phải.

**Phân quyền (RBAC):** lấy vai trò từ group của SSO, người dùng không tự khai.
- Nhân viên thường: xem NOC, bảng thông báo, tạo ticket, đặt phòng, vinh danh.
- Nhân viên IT: thêm xem tóm tắt SOC và sơ đồ rack.
- Admin IT: quản lý nội dung bảng thông báo và thông tin squad.

## 4. Kiến trúc đề xuất (OSS, cần xác nhận lại trong bước OSS review)

- **Frontend:** Vite + TypeScript + React + React Three Fiber + @react-three/drei (MIT), three.js (MIT). Phương án thay thế: Babylon.js (Apache-2.0). UI panel: Tailwind CSS (MIT) hoặc shadcn/ui (MIT).
- **Avatar:** định dạng VRM, dùng @pixiv/three-vrm (MIT). Tạo nhân vật bằng VRoid Studio (miễn phí, cần kiểm tra điều khoản dùng nội bộ). Asset phòng: Quaternius (CC0) hoặc tự dựng bằng Blender (GPL, chỉ dùng như công cụ, không ảnh hưởng license của file xuất ra).
- **Realtime** (presence, chat nhanh, cập nhật NOC): Socket.IO (MIT) hoặc Colyseus (MIT). Chọn một và ghi lý do.
- **Voice** (tùy chọn, làm sau): LiveKit self-host (Apache-2.0).
- **Backend:** Node.js + TypeScript + Fastify (MIT). Có adapter cho:
  - ITSM: GLPI (GPL-2.0) hoặc Zammad (AGPL-3.0), hoặc ITSM đang dùng. Chỉ gọi qua API. Ghi rõ rủi ro license vào `THIRD_PARTY.md`.
  - Giám sát: Prometheus HTTP API hoặc Zabbix, tùy GPBank đang dùng.
  - Lịch phòng họp: CalDAV hoặc API nội bộ.
  - SSO: OIDC.
- **Database:** PostgreSQL cho audit log, cấu hình zone, vinh danh, lịch sử trạng thái.
- **Deploy:** Docker Compose trên server nội bộ. Reverse proxy Caddy (Apache-2.0) hoặc Nginx (BSD-2).
- **Test:** Vitest cho unit test, Playwright (Apache-2.0) cho e2e và chụp screenshot từng khu.

## 5. Cấu trúc repo (data-driven)

```
gpbank-virtual-office/
  apps/web/            # client 3D
  apps/api/            # backend và adapter
  packages/shared/     # schema, type dùng chung (zod hoặc tương đương)
  content/zones/       # mỗi khu một file JSON: id, tọa độ, vật thể, action, role được xem
  content/zones/it.json
  mock/                # dữ liệu giả lập cho mọi API
  docs/OSS_REUSE.md
  docs/ARCHITECTURE.md
  docs/RUNBOOK.md
  docs/screens/       # screenshot từng khu để duyệt UI
  THIRD_PARTY.md
  docker-compose.yml
  .env.example         # không commit secret
```

Quy tắc: thêm một khối mới (Kinh doanh, Rủi ro, ...) chỉ được thêm file `content/zones/<khoi>.json` và asset tương ứng. Không sửa code lõi.

## 6. Hợp đồng dữ liệu (mock trước, API thật sau)

- `GET /api/it/services` → `[{id, name, status: "ok"|"warn"|"down", updatedAt, owner}]`
- `GET /api/it/incidents/open` → `[{id, severity, title, startedAt}]` (chỉ tóm tắt)
- `GET /api/it/security/summary` → `{critical, high, medium, low, updatedAt}` (không có log thô)
- `POST /api/it/tickets` `{category, title, description, priority}` → `{ticketId, status}`
- `POST /api/it/incidents` `{severity, title, description, confirmToken}` (xác nhận hai bước)
- `GET /api/rooms/free?start&end` và `POST /api/rooms/book`
- `POST /api/kudos` `{toUserId, message}` và `GET /api/kudos/board`
- `GET /api/presence` qua WebSocket
- Mọi ghi dữ liệu tạo bản ghi `audit_log`: {who, action, target, timestamp, payloadHash}.

## 7. Chi tiết UX

- **Sảnh vào:** giới thiệu 3 giây, nút "Vào Phòng CNTT".
- **Camera:** giữ góc nhìn ổn định khi vào khu. Cho phép xoay nhẹ, không cho bay tự do.
- **Panel:** trượt từ phải, rộng 360 px trên desktop. Trên màn hình nhỏ thì thành bottom sheet toàn màn hình.
- **Trạng thái:** loading dạng skeleton. Lỗi mạng hiện banner, không làm treo scene.
- **Màu trạng thái:** xanh, vàng, đỏ luôn đi kèm icon và chữ, không chỉ dựa vào màu.
- **Theme:** tối làm mặc định cho khu NOC. Panel dùng theme sáng/tối theo cài đặt của người dùng.
- **Chữ:** tiếng Việt có dấu, cỡ chữ tối thiểu 14 px trên panel.

## 8. Hiệu năng và chất lượng

- Tổng asset tải lần đầu dưới 15 MB. JS khởi động dưới 1 MB gzip.
- Dưới 150 draw call. Dùng instancing cho bàn và ghế. LOD cho avatar ở xa. Tắt shadow trên máy yếu.
- Hiển thị tối đa 40 avatar cùng lúc trong một phòng. Phần còn lại hiện số đếm.
- Panel đạt WCAG 2.1 AA. Mọi hành động thực hiện được bằng bàn phím.

## 9. Tiêu chí hoàn thành (Definition of Done)

1. Đăng nhập SSO (mock OIDC cho môi trường dev). Phân quyền đúng 3 vai trò.
2. Đi lại được trong các khu. Click từng vật thể mở đúng panel.
3. NOC hiển thị trạng thái từ mock API, tự cập nhật, có trạng thái lỗi rõ ràng.
4. Tạo ticket và báo sự cố (xác nhận hai bước) đều ghi được audit log.
5. Đặt phòng họp không bị trùng lịch.
6. Vinh danh hiện trên bảng, đúng giới hạn 1 lần mỗi người mỗi ngày, không có giá trị tiền.
7. Có chế độ 2D fallback. Playwright chạy được 5 luồng chính. Screenshot từng khu lưu vào `docs/screens/`.
8. `docker compose up` chạy được một lệnh. README có hướng dẫn dev và deploy.
9. Không có secret trong repo. Có `.env.example`.
10. `docs/OSS_REUSE.md` và `THIRD_PARTY.md` đầy đủ license cho mọi thư viện và asset.

## 10. Quy trình làm việc

1. **Bước 0, OSS review (tối đa 1 ngày):** với 3D engine, realtime, adapter ITSM: liệt kê 3 lựa chọn, chọn 1, ghi lý do.
2. **Bước 1, prototype bấm được (chưa có backend):** một khu NOC, Service Desk, di chuyển và panel. Chụp screenshot. **Dừng lại để người dùng duyệt hướng UI trước khi làm tiếp.**
3. **Bước 2, backend mock và presence realtime.**
4. **Bước 3, hoàn thiện đủ khu IT, panel, RBAC.**
5. **Bước 4, test, tài liệu, Docker.**

Có thể chạy song song nhiều agent (frontend 3D, backend API, tài liệu và test) nếu các agent không sửa cùng file.

## 11. Cần người dùng xác nhận trước khi làm

- SSO GPBank dùng gì: Microsoft Entra ID, Keycloak, AD FS, hay khác?
- ITSM hiện đang dùng: ServiceNow, GLPI, Jira Service Management, hay khác? Nếu chưa có, có chấp nhận GLPI hoặc Zammad tự host không?
- Nguồn trạng thái hệ thống: Prometheus, Zabbix, hay khác?
- Hosting: server nội bộ hay VPS? Có được chạy Docker không?
- Số người dùng đồng thời dự kiến trong một phòng.
- Có cần voice ngay từ đầu không? (Mặc định: không.)

## 12. Đầu ra mong đợi

- Repo chạy được theo `docker compose up`.
- Tài liệu: `ARCHITECTURE.md`, `OSS_REUSE.md`, `THIRD_PARTY.md`, `RUNBOOK.md`.
- Screenshot từng khu trong `docs/screens/`.
- Báo cáo cuối: đã làm gì, chưa làm gì, rủi ro còn lại, và các câu hỏi ở mục 11 chưa có đáp án.

---

## Phụ lục: khung cho các khối còn lại (chưa làm ở module này)

Mỗi khối là một file zone trong `content/zones/`. Cột "Độ nhạy" quyết định mức phân quyền và việc có được hiện số liệu chi tiết hay không.

| Khối | Khu gợi ý | Hành động chính | Dữ liệu hiển thị | Độ nhạy |
|---|---|---|---|---|
| Kinh doanh: KH Cá nhân | Quầy giao dịch | Xem sản phẩm, quy trình bán | Tài liệu sản phẩm | Thấp |
| Kinh doanh: KH Doanh nghiệp (SME) | Phòng RM | Xem pipeline (tổng hợp) | Số lượng theo giai đoạn | Trung bình |
| Nguồn vốn và Thị trường tài chính | Phòng dealing | Xem lãi suất thị trường | Dữ liệu thị trường, chỉ đọc | Trung bình |
| Quản trị Rủi ro | Phòng rủi ro | Xem dashboard chỉ số | Chỉ số tổng hợp | Cao |
| Tín dụng và Thẩm định | Phòng hồ sơ | Xem hàng đợi hồ sơ, SLA | Số lượng và thời gian xử lý | Cao |
| Xử lý nợ | Phòng xử lý nợ | Xem chỉ số nhóm nợ | Không có tên hay mã khách hàng | Rất cao, phân quyền chặt |
| Pháp chế và Tuân thủ | Phòng tuân thủ | Xem checklist, văn bản | Tài liệu nội bộ | Trung bình |
| Vận hành | Phòng vận hành | Xem queue giao dịch lỗi | Tổng hợp | Cao |
| Tài chính Kế toán | Phòng kế toán | Xem lịch chốt sổ | Lịch, không có số liệu chi tiết | Cao |
| Nhân sự | Sảnh onboarding | Xem lộ trình onboarding | Thông tin cá nhân chỉ hiện với chủ tài khoản | Trung bình (dữ liệu cá nhân) |
| Hành chính | Kho và đặt tài sản | Đặt tài sản, xem lịch | Danh mục tài sản | Thấp |
| Marketing và Truyền thông | Studio | Xem lịch chiến dịch | Lịch và tài liệu | Thấp |
| Mạng lưới chi nhánh và phòng giao dịch | Bản đồ | Xem trạng thái chi nhánh | Trạng thái và giờ làm việc | Thấp |
