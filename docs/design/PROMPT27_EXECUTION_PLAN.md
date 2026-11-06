# Kế hoạch thực thi bộ 27 prompt văn phòng 3D

**Ngày lập:** 06/11/2026
**Đặc tả:** `promy_update/27_Prompt_Van_Phong_3D_Claude.md` (1191 dòng, đã đọc hết 27 task, gồm phần mẫu bàn giao và tham chiếu).
**Phạm vi tài liệu:** chỉ khảo sát và lập kế hoạch. Không sửa mã, không chạy build, không commit.

## 0. Stack thực tế (đã xác nhận)

- Frontend (`package.json`): React 18.3.1, three 0.169.0, @react-three/fiber 8.17.10, @react-three/drei 9.114.0, @pixiv/three-vrm 3.5.5, pitchy 4.1.0, Vite 5.4.11, TypeScript 5.6.3. **Không có** thư viện vật lý (Rapier/cannon), navmesh, WebSocket, WebRTC, Yjs, ZIP, test runner (vitest/jest), Playwright.
- Backend (`services/*`): 8 service Node + Express 4.21.2 + better-sqlite3 11.7.0 (auth, it, games, karaoke, events, display, plants, layout). Auth thêm bcryptjs, nodemailer, openid-client. Realtime hiện chỉ có **SSE** (`services/layout/src/sse.js`, `services/display/src/sse.js`, heartbeat 25 s).
- Hạ tầng: `docker-compose.yml` 10 container, `network_mode: host`, bind 127.0.0.1; gateway nginx `deploy/nginx/gateway.conf` đã khai báo `map $http_upgrade` (dòng 7) và header Upgrade/Connection (dòng 28–29) nhưng **chưa có route WebSocket nào**. Deploy qua `scripts/deploy-remote.sh` (SSH, build trên máy chủ).
- **Không có file asset 3D nào trong repo** (không .glb/.gltf/.vrm/.fbx/.ktx2, không file âm thanh). Nhân vật hiện là nhân vật hình học dựng bằng code (`src/avatar/FallbackAvatar.tsx`, `fallbackBody.tsx`, `fallbackOutfit.tsx`...). `VrmAvatar.tsx` có loader VRM nhưng ghi rõ "Repo không kèm file này". Animation là tư thế procedural (`src/avatar/animation.ts`, `src/emotes/library.ts`), không có AnimationClip, skeleton thật hay morph target.
- Repo **không có AGENTS.md/CLAUDE.md** dù đặc tả yêu cầu đọc AGENTS.md.
- Va chạm: AABB 2D tự viết (`Rect` trên mặt phẳng x/z), sàn phẳng một tầng, không có dốc/cầu thang đi được.

Hệ quả chính: phần "hệ thống" (schema, controller, camera, lưu, loader, UI, editor, validator) làm được với stack hiện có; phần "người thật" (IK, chống xuyên trang phục, biểu cảm mặt, decal trên da biến dạng) bị chặn bởi asset nhân vật có rig/morph/clip thật; Giai đoạn D cần service realtime mới, thư viện mới và hạ tầng (domain HTTPS, TURN/SFU).

## 1. Bảng tổng 27 task

Trạng thái: **ĐÃ CÓ MỘT PHẦN** = có module chạy được bao phủ một phần đáng kể; **ĐÃ ĐẠT MỘT PHẦN NHỎ** = chỉ có mảnh rời liên quan; **CHƯA CÓ**.
Làm ngay: **Có** = làm được với stack hiện tại; **Một phần** = làm được phần hệ thống, phần còn lại bị chặn; **Không** = chờ quyết định/tài nguyên.

| ID | Tên | Phụ thuộc | Trạng thái hiện tại | Làm ngay | Bị chặn bởi | Kích thước |
|----|-----|-----------|---------------------|----------|-------------|-----------|
| 01 | Chuẩn hóa asset và hợp đồng dữ liệu | — | ĐÃ ĐẠT MỘT PHẦN NHỎ | Một phần | Asset nhân vật/animation thật để nạp thử (QĐ-1, TN-1) | Lớn |
| 02 | Chuyển động và animation nhân vật | 01 | ĐÃ CÓ MỘT PHẦN | Một phần | Clip animation thật; QĐ-2 (AABB hay Rapier); test runner (QĐ-3) | Lớn |
| 03 | IK tay chân, căn tư thế | 01–02 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Không | Rig xương thật (TN-1) | Lớn |
| 04 | Chống xuyên, phối nhiều lớp trang phục | 01, 03 | ĐÃ CÓ MỘT PHẦN (quy tắc tương thích) | Không (chỉ ma trận) | Garment mesh + skin weight + morph (TN-1, TN-2) | Rất lớn |
| 05 | Camera ổn định, khôi phục mắc kẹt | 02 | ĐÃ CÓ MỘT PHẦN | Có | — | Vừa |
| 06 | Lưu và khôi phục toàn bộ trạng thái | 01 | ĐÃ CÓ MỘT PHẦN | Có | — | Lớn |
| 07 | Tải asset, phục hồi lỗi, mất context | 01, 06 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Có | Asset thật để thử tải nặng (dùng fixture thay) | Vừa |
| 08 | Đo hiệu năng, tối ưu | 01, 07 | ĐÃ CÓ MỘT PHẦN (instancing) | Một phần | Thiết bị tham chiếu để đo (TN-4) | Vừa |
| 09 | Minimap, tìm phòng, chỉ đường | 01, 02, 05 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Có | — (A*/grid tự viết, không cần lib) | Lớn |
| 10 | Hướng dẫn lần đầu, trợ giúp | controller, 06 | ĐÃ CÓ MỘT PHẦN (thẻ tour onboarding) | Có | — | Vừa |
| 11 | Cài đặt điều khiển, đa thiết bị | 02, 05 | ĐÃ CÓ MỘT PHẦN | Có | Gamepad và điện thoại thật để nghiệm thu (TN-4) | Lớn |
| 12 | Tiếp cận, thay thế kéo thả | 11 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Có | Screen reader để kiểm (TN-4) | Vừa |
| 13 | Chế độ đồ họa, chất lượng tự thích nghi | 07–08 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Có (sau 08) | Thiết bị đo (TN-4) | Vừa |
| 14 | Âm thanh không gian, phản hồi | 02, 13 | ĐÃ CÓ MỘT PHẦN | Có (âm procedural) | QĐ-9 (âm tổng hợp hay sample có giấy phép) | Vừa |
| 15 | Biểu cảm, hành động nhanh | 01–03, 11 | ĐÃ CÓ MỘT PHẦN | Một phần | Facial morph, clip, prop điện thoại (TN-1, TN-2); QĐ-10 (emote đấm/kata) | Vừa |
| 16 | Chế độ chụp ảnh | 05, 13, 15 | CHƯA CÓ | Có | — | Vừa |
| 17 | Trình biên tập bố trí | 01, 06, (09, 26) | ĐÃ CÓ MỘT PHẦN (chế độ di chuyển vật) | Có | QĐ-6 (ai được sửa/publish layout) | Rất lớn |
| 18 | Thư viện asset, danh mục đồ | 01, 04, 07 | ĐÃ ĐẠT MỘT PHẦN NHỎ (catalog tĩnh) | Một phần | QĐ-7 (catalog trên server hay local) | Lớn |
| 19 | Ảnh tải lên cho hình xăm/họa tiết | 01, 06 | CHƯA CÓ | Một phần | QĐ-5 (cho upload, ai duyệt); decal trên da cần mesh UV thật | Lớn |
| 20 | Xuất/nhập, sao lưu, phiên bản | 06, 18, 19 | ĐÃ ĐẠT MỘT PHẦN NHỎ (xuất/nhập JSON look) | Có (JSON) | QĐ-8 (ZIP: cần thư viện) | Lớn |
| 21 | Bộ kiểm tra chất lượng scene/asset | 01 | ĐÃ ĐẠT MỘT PHẦN NHỎ | Có | QĐ-3 (runner cho CLI/CI) | Vừa |
| 22 | Tài khoản, hồ sơ, nhân vật cá nhân | 06, 18–20 | ĐÃ CÓ MỘT PHẦN (auth đầy đủ) | Một phần | SMTP Gmail chưa cấu hình, domain HTTPS (TN-5, TN-6) | Vừa |
| 23 | Đồng bộ nhiều người | 22, 01–06 | CHƯA CÓ | Không | QĐ-4 (transport, service mới, lib `ws`); domain/TLS | Rất lớn |
| 24 | Chiếm ghế, cầm vật, khóa sửa | 23, 22, 26 | CHƯA CÓ | Không | Task 23 | Lớn |
| 25 | Chat, thoại theo khoảng cách, phòng họp | 22–23, 26 | CHƯA CÓ (chỉ thiết kế trong SOCIAL.md) | Không | Chat: task 23/QĐ-4; Voice: QĐ-11, TURN/SFU (TN-7) | Rất lớn |
| 26 | Phân quyền chủ phòng/editor/khách | 22, 23–25, 17 | ĐÃ CÓ MỘT PHẦN (vai trò toàn hệ thống) | Một phần | QĐ-6; realtime task 23 | Lớn |
| 27 | Mất kết nối, reconnect, khôi phục phiên | 06, 22–24, 26 | ĐÃ ĐẠT MỘT PHẦN NHỎ (SSE tự nối lại) | Không | Task 23–24 | Lớn |

Tổng: **12 task làm được ngay** (05, 06, 07, 09, 10, 11, 12, 13, 16, 17, 20, 21), **9 task làm được một phần** (01, 02, 08, 14, 15, 18, 19, 22, 26), **6 task bị chặn** (03, 04, 23, 24, 25, 27).

## 2. Thứ tự thực thi đề xuất

Giữ thứ tự 01 → 27 của đặc tả, nghiệm thu từng task. Các chỗ có thể song song (khác file, không chung hợp đồng dữ liệu):

1. **Bước 0 (trước task 01, cần duyệt):** chọn test runner (QĐ-3), thêm AGENTS.md mô tả stack và quy ước. Không có runner thì mọi "kiểm thử đã chạy" trong đặc tả không có chỗ chạy.
2. **Giai đoạn A:** 01 → 02 → 05 → 06 → 07 → 08.
   - 03 và 04: chỉ làm phần interface (IK solver interface, seat anchor, compatibility matrix từ `fashion/rules.ts`), để mở khi có asset (TN-1, TN-2). Không chặn các task sau.
   - 05 và 06 song song được sau 02 (05 sửa `scene/controls`, 06 làm module lưu mới).
3. **Giai đoạn B:** 09, 10, 11 làm sau 05/06.
   - 09 (minimap) song song với 11 (input action system).
   - 10 làm sau 11 vì cần tên phím từ input mapping.
   - 12 sau 11. 13 sau 08. 14 song song với 12/13. 15 sau 11 (phần body pose). 16 sau 13 và 15.
4. **Giai đoạn C:** 21 (validator) có thể đưa lên làm ngay sau 01 vì chỉ phụ thuộc 01, và nên có trước 17 để editor dùng chung.
   - 17 → 18 → 19 → 20. 18 và 19 song song được nếu QĐ-5, QĐ-7 đã chốt.
5. **Giai đoạn D:** 22 → 23 → 24 → 26 → 25 (chat trước, voice sau) → 27.
   - Phần policy service của 26 (hàm `can(actor, action, resource)` trên vai trò hiện có) nên làm cùng 22, vì đặc tả yêu cầu mọi endpoint kiểm danh tính và ownership từ đầu.
   - Chat (25a) làm được ngay sau 23. Voice (25b) chỉ khi có TURN/SFU.

## 3. Cần người dùng quyết định

1. **QĐ-1 — Nguồn nhân vật người thật.** (a) Cung cấp/mua bộ avatar có rig + morph + clip (ví dụ VRM 1.0 hoặc glTF từ một bộ có giấy phép rõ); (b) dùng bộ OSS (Mixamo clip, MakeHuman/MPFB, VRoid) và chấp nhận giới hạn; (c) giữ nhân vật hình học hiện tại, hoãn 03/04/15-mặt/19-decal. **Khuyến nghị:** (b) để chạy thử ngay, song song tìm (a) cho production. Không có quyết định này thì 03, 04 bị chặn hẳn.
2. **QĐ-2 — Vật lý.** (a) Giữ AABB 2D tự viết (`gtaMotion.ts`) và mở rộng thêm độ cao/bậc; (b) thêm `@react-three/rapier` (thư viện mới). **Khuyến nghị:** (a) cho sàn phẳng hiện tại; chỉ chuyển (b) nếu muốn cầu thang, dốc, vật động thật. Đặc tả task 02 yêu cầu dốc/cầu thang/bậc, nên nếu chọn (a) phải ghi rõ văn phòng không có các bề mặt đó.
3. **QĐ-3 — Test runner.** (a) Thêm `vitest` (devDependency, chạy trên VPS); (b) dùng `node --test` với `--experimental-strip-types` không thêm thư viện. **Khuyến nghị:** (a), vì phần lớn logic ở TypeScript frontend; chạy test trên VPS theo quy tắc build VPS-only.
4. **QĐ-4 — Hạ tầng realtime nhiều người.** (a) Service mới `realtime` (Node + `ws`) trong docker-compose sau gateway; (b) Colyseus (đã nêu trong `docs/OSS_REUSE.md:57`); (c) dịch vụ ngoài (Ably/Pusher/Liveblocks). **Khuyến nghị:** (a), nhỏ, cùng mẫu với các service hiện có, không gửi dữ liệu ra ngoài.
5. **QĐ-5 — Ảnh tải lên cho hình xăm.** (a) Chỉ lưu cục bộ trên máy người dùng (IndexedDB), không công khai; (b) lưu server nhưng chỉ chủ sở hữu thấy; (c) cho người khác thấy (cần kiểm duyệt). **Khuyến nghị:** (a) trước, (b) khi có task 22; (c) chỉ khi có quy trình kiểm duyệt (nối với `src/moderation`).
6. **QĐ-6 — Ai được sửa và publish bố trí.** (a) Giữ vai trò toàn hệ thống hiện có (`it`/`admin` được reset, như `RESET_ROLES` ở `services/layout/src/routes/layout.js:17`); (b) thêm vai trò theo phòng owner/editor/member/guest như task 26. **Khuyến nghị:** (b) theo đặc tả, nhưng triển khai dần: bước đầu ánh xạ `admin`→owner, `it`→editor, `employee`→member.
7. **QĐ-7 — Thư viện asset.** (a) Catalog tĩnh trong repo (như `src/fashion/catalog.ts`) qua adapter; (b) service `assets` mới có upload, version theo hash, lưu file trên volume. **Khuyến nghị:** (a) cho task 18, (b) khi có quản trị chia sẻ.
8. **QĐ-8 — Gói xuất/nhập.** (a) JSON đơn, ảnh nhúng base64; (b) ZIP với thư viện `fflate` (mới). **Khuyến nghị:** (a) trước; (b) khi gói có nhiều ảnh lớn.
9. **QĐ-9 — Âm thanh.** (a) Giữ âm tổng hợp bằng Web Audio (như `src/audio/engine.ts`); (b) thêm sample bước chân/cửa/máy in có giấy phép CC0. **Khuyến nghị:** (b) cho bước chân và cửa, vì âm tổng hợp khó tự nhiên; cần người dùng duyệt nguồn.
10. **QĐ-10 — Emote bạo lực.** Bộ emote hiện có `punch_combo`, `kata` (`src/emotes/types.ts:2`), trái với task 15 mục 7. (a) Bỏ khỏi bộ mặc định; (b) giữ vì đã gắn với tính năng đấu (`DUEL_CONSENT.md`). **Khuyến nghị:** (a) với bộ emote chung, giữ riêng trong luồng đấu có đồng ý.
11. **QĐ-11 — Voice.** (a) Không làm voice, chỉ chat; (b) LiveKit self-host + coturn (`docs/OSS_REUSE.md:58`); (c) dịch vụ voice ngoài. **Khuyến nghị:** (a) cho đợt đầu; (b) khi có domain và cổng UDP công khai.
12. **QĐ-12 — Nhiều tab một tài khoản (task 27).** (a) Tab mới thay phiên cũ; (b) cho nhiều phiên độc lập, mỗi phiên một avatar. **Khuyến nghị:** (a), tránh hai avatar cùng playerId.
13. **QĐ-13 — Mục tiêu tải nhiều người.** Số người đồng thời một phòng: (a) 30; (b) 100; (c) 500 (bằng số chỗ ngồi). **Khuyến nghị:** (a) để đo trước rồi nâng; 500 người cùng phòng cần interest management và đo tải thật.
14. **QĐ-14 — Domain cho môi trường test.** Theo quyết định ngày 06/11 không dùng domain Cloudflare test hay domain site khác. Cần domain riêng để có HTTPS (cookie Secure, WebSocket wss, getUserMedia cho mic). (a) Người dùng cung cấp domain; (b) chỉ chạy nội bộ qua SSH tunnel. **Khuyến nghị:** (a) trước Giai đoạn D.

## 4. Cần tài nguyên

- **TN-1 — Nhân vật có rig thật:** ít nhất 1 mesh người trưởng thành dạng glTF/VRM, có skeleton chuẩn (humanoid), body morph (chiều cao, vai, eo, hông, cân nặng), facial morph/blendshape (vui, buồn, nháy mắt, viseme nếu có thoại), texture PBR, kèm giấy phép dùng thương mại. Đo được triangle, dung lượng.
- **TN-2 — Trang phục và phụ kiện:** ít nhất 3 bộ đồ nhiều lớp (áo sơ mi, áo khoác, quần, váy) skin vào cùng skeleton, có morph tương ứng body morph, bản tay dài/ngắn, sơ vin/không; kính, đồng hồ, dây chuyền, mũ, tóc. Ít nhất 1 prop điện thoại và 1 cốc.
- **TN-3 — Animation clip:** idle, walk, run, jumpStart, airborne, land, sit down/idle/stand up, mở cửa, cầm/đặt đồ, chào tay, gật/lắc đầu, chỉ tay, khoanh tay, xem điện thoại. Cùng rig với TN-1, ghi rõ in-place hay root motion.
- **TN-4 — Thiết bị đo và nghiệm thu:** 1 máy desktop tham chiếu (ghi CPU/GPU), 1 laptop yếu, 1 điện thoại Android và 1 iPhone, 1 gamepad (Xbox/PS), 1 screen reader (NVDA trên Windows hoặc VoiceOver). Cần cho task 08, 11, 12, 13.
- **TN-5 — SMTP:** `GMAIL_SMTP_USER` và `GMAIL_SMTP_APP_PASSWORD` trong Stored_Passwords.txt (theo quyết định 06/11, chưa có). Cần cho luồng xác minh/phục hồi task 22.
- **TN-6 — Domain + TLS:** domain riêng trỏ về VPS, chứng chỉ HTTPS, `PUBLIC_BASE_URL`, `COOKIE_SECURE=true`.
- **TN-7 — Hạ tầng voice (nếu QĐ-11 = b):** VPS có IP công khai, mở UDP (ví dụ 3478 cho TURN, dải 50000–60000 cho media), coturn với credential có thời hạn, LiveKit server; cần thử từ hai mạng khác nhau.
- **TN-8 — Âm thanh (nếu QĐ-9 = b):** sample bước chân trên gạch, cửa, ngăn kéo, ghế, máy in, ambience văn phòng, nguồn CC0/có giấy phép.
- **TN-9 — Số đo kiến trúc:** kích thước thật của văn phòng chữ L (hiện calibrate từ ảnh 1645×923 px, `src/scene/officeBounds.ts`), chiều cao trần, cửa, mặt ghế, mặt bàn. Không có thì giữ nhãn "ước lượng".
- **TN-10 — Máy cho test tải nhiều người:** ít nhất 2 máy hoặc 2 mạng khác nhau cho task 23–25; công cụ giả lập latency (tc netem trên VPS hoặc Chrome DevTools throttling).

## 5. Giai đoạn D — backend và hạ tầng thật

### 5.1 Đã có để tái sử dụng

- Auth service (`services/auth/index.js`): cookie phiên `sid` (`sidCookie`, `clearSidCookie`), `/api/auth/me` (dòng 127), logout (372), ngoại hình `GET/PUT /api/auth/profile/appearance` (389, 398), danh bạ (533), moderation report/ban/audit (648–856), rate limit đăng nhập (`sweepLoginFails`, `auth.js:371`), mật khẩu bcrypt, OTP. Vai trò toàn hệ thống `employee|it|moderator|admin` (`services/auth/db.js:23`).
- Mẫu xác thực giữa service: mỗi service gọi `AUTH_URL/api/auth/me` (`services/layout/src/auth.js:36` `requireAuth`).
- SSE hub có heartbeat và giới hạn client (`services/layout/src/sse.js`); client EventSource tự nối lại (`src/display/DisplayStore.tsx:145`, `src/layout/LayoutStore.tsx:114`).
- Layout service có version toàn cục và kiểm vị trí trả 409 (`services/layout/src/routes/layout.js:117`), rate limit move (`allowMove`).
- Thiết kế đã viết sẵn nhưng chưa làm: `docs/design/SOCIAL.md` (chat SSE, trận đấu WebSocket, cổng 3010, kiểm lại phiên mỗi 60 s ở dòng 134).

### 5.2 Cần làm mới

| Hạng mục | Task | Cần gì |
|---------|------|--------|
| Service realtime WebSocket | 23, 24, 27 | Thư viện `ws` (mới, cần duyệt), container mới, route gateway có Upgrade |
| Lưu lease/lock bền | 24 | Bảng SQLite (lease, fencing token, expiry theo giờ server) |
| Kênh chat | 25 | Chat qua WS của realtime (hoặc SSE theo SOCIAL.md), bảng tin nhắn có retention |
| Policy service dùng chung | 26 | Module `can()` dùng chung giữa REST và WS; bảng `room_members(room_id, user_id, role)`; audit |
| Voice | 25 | LiveKit + coturn, domain TLS, UDP công khai |
| HTTPS | 22–27 | Domain riêng (QĐ-14) |

### 5.3 Phương án tối thiểu trên VPS hiện có

1. Thêm service `services/realtime` (Node 20, Express cho health + `ws` cho WebSocket), cùng mẫu các service khác: `network_mode: host`, bind `127.0.0.1`, cổng mới (ví dụ 3010 như SOCIAL.md, kiểm cổng trống trên máy chủ trước), volume SQLite riêng.
2. Gateway: thêm `location /api/rt/ws { proxy_pass http://127.0.0.1:3010; proxy_read_timeout 120s; }`. Header Upgrade đã có ở cấp server.
3. Mô hình authority: **một process giữ toàn quyền mỗi room** (single authority). Trạng thái chuyển động tạm trong RAM; trạng thái vật dùng chung, lease và revision ghi SQLite, nên restart vẫn khôi phục được (task 27 mục 8). Không chạy nhiều replica cho tới khi cần, vì lock trong RAM chỉ đúng khi có một authority.
4. Giao thức: JSON có `protocolVersion`, `seq`, `requestId`; tick server 10–15 Hz cho snapshot chuyển động; reliable event cho cửa/ghế/đồ; client gửi input/intent, không gửi transform tuyệt đối được coi là sự thật.
5. Chat chạy trên cùng kết nối WS (hoặc SSE theo SOCIAL.md nếu muốn giữ quyết định cũ). Voice để sau.
6. Đo tải bằng script bot headless chạy trên VPS (không phải hai tab local), ghi RTT, bandwidth, số entity.

### 5.4 Rủi ro bảo mật và cách chặn

- **Xác thực khi upgrade:** đọc cookie `sid` lúc handshake, gọi `/api/auth/me`; từ chối nếu không hợp lệ. Kiểm lại định kỳ 60 s và đóng socket khi 401 (bị ban, logout, hết hạn).
- **Cross-site WebSocket hijacking:** kiểm header `Origin` so với `PUBLIC_BASE_URL`; cookie `SameSite` và `Secure` khi có HTTPS.
- **Ownership:** playerId lấy từ phiên server, không từ payload. Mọi message có roomId được kiểm membership qua policy service. Không dùng display name làm khóa.
- **Chống gian lận chuyển động:** server kiểm tốc độ tối đa (theo `MOTION.runSpeed`), va chạm cơ bản với footprint layout, giới hạn teleport; vị trí khôi phục do server xác nhận (task 05 mục 7).
- **Race điều kiện ghế/vật:** cấp lease bằng transaction SQLite (`UPDATE ... WHERE owner IS NULL OR expires_at < now`), trả fencing token; mọi lệnh sửa vật mang token, token cũ bị từ chối.
- **Replay và retry:** `requestId` idempotent lưu có thời hạn; action một lần (mở cửa) không thực hiện hai lần.
- **DoS:** giới hạn kích thước message, rate theo người dùng, số kết nối tối đa mỗi tài khoản (QĐ-12), backpressure (đóng kết nối có `bufferedAmount` quá ngưỡng).
- **Rò dữ liệu giữa phòng:** interest management phía server; chat và voice chỉ route tới thành viên phòng (giảm volume phía client không phải bảo mật).
- **Log:** không log token, cookie, nội dung thoại; audit chỉ ghi actor/action/target/kết quả/requestId.
- **Không có HTTPS** thì cookie phiên và nội dung WS đi rõ: Giai đoạn D không nên mở công khai trước QĐ-14.

## 6. Chi tiết theo từng task

### Task 01 — Chuẩn hóa asset và hợp đồng dữ liệu
- Phụ thuộc: không.
- Hiện có: dữ liệu bố trí `src/content/zones/it.json` + kiểu `src/content/types.ts`; quy ước trục ghi ở `gtaMotion.ts` (hướng nhìn = (sin yaw, cos yaw)), `VrmAvatar.tsx` xoay VRM 0.x về +Z; catalog đồ `src/fashion/catalog.ts`. Không có manifest, `schemaVersion`, `assetId`, socket, validator asset (grep `schemaVersion|assetId|manifest` không có kết quả).
- Làm được: tài liệu chuẩn, schema manifest TS, validator, scene xem asset (grid 1 m, bounds, pivot, socket) với stack hiện có.
- Bị chặn: nghiệm thu "nạp nhân vật + animation + phụ kiện" cần TN-1/TN-3; với nhân vật hình học chỉ chứng minh được bàn/ghế và socket ước lượng. Kiểm kê asset sẽ ghi "không có file asset", không bịa số đo.
- Migration: it.json là bố trí hiện tại, cần map sang manifest không mất vị trí.
- Kích thước: lớn.

### Task 02 — Chuyển động và animation
- Phụ thuộc: 01.
- Hiện có: `src/scene/controls/gtaMotion.ts` `stepMotion` (dòng 134): tăng/giảm tốc, `turnToward`, chuẩn hóa vector đi chéo, va chạm AABB chia bước `maxSubStep` 0,12 m, kẹp `maxDt`, nhảy `jumpVelocity`/`gravity`. Đầu vào theo camera `useGtaControls.ts`; xóa input khi blur `Player.tsx:152`; state machine nhân vật `interact/characterState.ts` (walking/seated/holding...). Animation procedural `avatar/animation.ts` (idle/walk/run/jump/sit trộn theo locomotion).
- Thiếu: timestep cố định + nội suy, state jumpStart/airborne/land, coyote/buffer, dốc/bậc/cầu thang, capsule theo chiều cao, debug overlay, test 30/60/120 FPS.
- Bị chặn: clip thật (TN-3); QĐ-2; test runner (QĐ-3).
- Kích thước: lớn.

### Task 03 — IK tay chân
- Phụ thuộc: 01–02.
- Hiện có: chỉ chỗ ngồi `SeatSpot` (`scene/controls/session.ts:28`, vị trí hông và hướng), `requestSit` (151). Không có IK solver (grep `IK|CCDIK` không có).
- Nhân vật hình học không có khuỷu/gối tách khớp đủ cho two-bone IK có pole vector; foot IK trên sàn phẳng không có giá trị kiểm chứng.
- Làm được trước: interface IK (target, weight, reach), seat anchor/stand point trong manifest 01.
- Bị chặn: TN-1 (skeleton), TN-3. three có `CCDIKSolver` trong examples, không cần lib mới.
- Kích thước: lớn.

### Task 04 — Chống xuyên, nhiều lớp trang phục
- Phụ thuộc: 01, rig/morph, 03.
- Hiện có: quy tắc tương thích `src/fashion/rules.ts` (bộ liền loại trừ quần, sơ vin, xung đột phụ kiện, giới hạn giải phẫu `BODY_LIMITS`, mũ theo kiểu tóc); trang phục dựng bằng `Loft` có `inflate` (`avatar/fallbackOutfit.tsx`); migrate `fashion/migrate.ts`.
- Làm được: compatibility matrix từ rules hiện có, giữ bộ hợp lệ trước và hiện lý do (rules đã trả cảnh báo tiếng Việt).
- Bị chặn: body-region mask, corrective morph, garment morph cần TN-1, TN-2. Không thể nghiệm thu "đi/chạy/ngồi/giơ tay không xuyên" trên nhân vật hình học theo nghĩa của đặc tả.
- Kích thước: rất lớn.

### Task 05 — Camera, khôi phục mắc kẹt
- Phụ thuộc: 02.
- Hiện có: `gtaCamera.ts` `clearRayLength` (87) tia 2D tới `Rect` với `wallMargin` 0,25 và `obstacleTop` 3,35; ngôi thứ nhất (`session.ts` `setFirstPerson` 100); kẹp pitch (161); nhả Pointer Lock (369), dừng khi blur (383); cảm ứng kéo xoay (252).
- Thiếu: mode controller (seated/inspect/overview) có enter/exit, sphere cast có mask, safe position + nút "Về vị trí an toàn", phục hồi ra ngoài map, tùy chọn giảm chuyển động camera.
- Làm ngay được. Phần server xác nhận vị trí để task 23.
- Kích thước: vừa.

### Task 06 — Lưu và khôi phục trạng thái
- Phụ thuộc: 01.
- Hiện có: `fashion/persistence.ts` (xuất/nhập/lưu look localStorage, giới hạn byte, qua `validate`), `fashion/migrate.ts`, bản nháp `onboarding/AvatarCreator.tsx:45`, cài đặt `interact/settings.ts`, server `PUT /api/auth/profile/appearance`, layout SQLite có version. `objectStates.ts` ghi rõ "Chưa lưu xuống localStorage/máy chủ".
- Thiếu: snapshot thống nhất có schemaVersion/revision, IndexedDB adapter, autosave hàng đợi, xử lý quota, nhiều tab (BroadcastChannel/revision), restore theo thứ tự + vị trí an toàn.
- Làm ngay (IndexedDB là API trình duyệt, không cần lib).
- Kích thước: lớn.

### Task 07 — Tải asset, phục hồi lỗi, mất context
- Phụ thuộc: 01, 06.
- Hiện có: `VrmAvatar.tsx` dùng `GLTFLoader` + `VRMLoaderPlugin`, lỗi thì ErrorBoundary chuyển nhân vật dự phòng. Không có loading coordinator, retry/backoff, dedupe, `webglcontextlost` (grep không có).
- Làm ngay. Vì repo gần như không có asset tải ngoài, cần fixture (file glb nhỏ, file hỏng, URL 404) để test.
- Lưu ý: hành vi "VRM lỗi thì âm thầm dùng nhân vật dự phòng" phải đổi thành có thông báo, theo mục 5 của task.
- Kích thước: vừa.

### Task 08 — Đo hiệu năng
- Phụ thuộc: 01, 07.
- Hiện có: `scene/InstancedBoxes.tsx` (InstancedMesh, mesh bắt chuột 0 draw call), `env/deskAtlas.ts`, `env/contactShadow.ts`, quản lý `owned` để dispose (`OfficeProps.tsx:414–416`), bloom tắt mặc định (`lighting/postfx.tsx`). Không có bộ đo (grep `renderer.info|Stats|PerformanceMonitor` không có).
- Làm được: tuyến camera benchmark, thu `gl.info`, frame-time p50/p95, resource registry.
- Bị chặn: số liệu cần TN-4; không ghi "GPU memory" khi không đo được.
- Kích thước: vừa.

### Task 09 — Minimap, tìm phòng, chỉ đường
- Phụ thuộc: 01, 02, 05.
- Hiện có: đa giác chữ L `scene/officeBounds.ts`, đổi tọa độ `scene/layout.ts` (`toWorldX/toWorldZ`), phòng và bàn có id trong it.json, footprint `layout/footprints.ts`, tự đi tới điểm `scene/controls/walkRequest.ts` (đi thẳng, không tìm đường). Không có minimap/navmesh/A* (grep không có).
- Làm ngay: lưới chiếm chỗ từ footprint + A* tự viết (không cần lib), minimap SVG/canvas DOM dùng cùng dữ liệu layout, cập nhật khi layout SSE đổi.
- Kích thước: lớn.

### Task 10 — Hướng dẫn lần đầu
- Phụ thuộc: controller, interaction, avatar editor, 06.
- Hiện có: bước `tour` trong onboarding (`services/auth/db.js:27`, `POST /api/auth/profile/onboarding/tour-done` index.js:494), thẻ tour tĩnh `onboarding/OnboardingWizard.tsx:88`.
- Thiếu: tutorial state machine theo domain event (đã di chuyển, cửa đã mở, đã lưu), tutorialVersion, xem lại, tên phím động.
- Làm ngay; nên làm sau 11 để lấy nhãn phím từ action map.
- Kích thước: vừa.

### Task 11 — Cài đặt điều khiển, đa thiết bị
- Phụ thuộc: 02, 05.
- Hiện có: phím cố định trong `useGtaControls.ts` (WASD/mũi tên, Shift, Space), joystick/nút chạy/nhảy cảm ứng trong `session.ts`, độ nhạy chuột (`InteractPrompt.tsx:38`), phím emote 1–6 cố định (`emotes/useEmoteHotkeys.ts:14`), pointerId cho vẽ bảng (`ui/DisplayPanel.tsx:229`). Không có gamepad, đổi phím, input context.
- Làm ngay (Gamepad API là API trình duyệt). Nghiệm thu gamepad/touch cần TN-4.
- Kích thước: lớn (đụng mọi nơi đọc phím).

### Task 12 — Tiếp cận
- Phụ thuộc: 11.
- Hiện có: `aria-live` ở `auth/AuthUi.tsx:84`, `checkin/CheckinScanOverlay.tsx:62`; `prefers-reduced-motion` ở `auth/auth.css:752`, `plants/PlantMesh.tsx:152`, `emotes/player.ts`; AvatarCreator có undo 8 s.
- Thiếu: kiểm kê thao tác kéo, phương án không kéo cho xếp đồ/đặt xăm, focus management chung cho modal, danh sách phòng/vật tương tác qua UI.
- Làm ngay; screen reader cần TN-4.
- Kích thước: vừa.

### Task 13 — Chế độ đồ họa
- Phụ thuộc: 07–08.
- Hiện có: bloom tùy chọn `postfx.tsx`; `dpr={[1, 1.5]}` chỉ ở `AvatarCreator.tsx:211`; Canvas chính `App.tsx:331` bật `shadows`, không giới hạn DPR, không preset.
- Làm ngay sau 08 (drei có `PerformanceMonitor`, `AdaptiveDpr`, không cần lib mới).
- Kích thước: vừa.

### Task 14 — Âm thanh không gian
- Phụ thuộc: 02, 13.
- Hiện có: `audio/engine.ts` (AudioContext chỉ tạo khi có thao tác người dùng, bus master/hiệu ứng, fade), âm theo khu `scene/audioZones.ts`, `AmbientAudio.tsx`, SFX tổng hợp `audio/sfx.ts`, nhạc chủ đề. Không có PannerNode/âm vị trí, không bước chân.
- Thiếu: bus footsteps/interaction/UI/voice, spatial theo nguồn, pool và giới hạn nguồn, mô tả văn bản.
- Làm ngay với âm tổng hợp; QĐ-9 cho sample.
- Kích thước: vừa.

### Task 15 — Biểu cảm, hành động nhanh
- Phụ thuộc: 01–03, 11.
- Hiện có: thư viện emote keyframe `emotes/library.ts` (6 emote người dùng, 5 nội bộ), bộ phát `emotes/player.ts` (có giảm chuyển động), `EmotePanel.tsx`, phím 1–6; biểu cảm khuôn mặt dạng tham số `fashion/face.ts` (`EXPRESSIONS`).
- Thiếu: precondition/cancel/cooldown/mask upper-body, action wheel, event đồng bộ (actionId, startTime).
- Bị chặn: facial morph, clip, prop điện thoại + hand IK (TN-1–TN-3, task 03). QĐ-10 cho emote đấm/kata.
- Kích thước: vừa.

### Task 16 — Chế độ chụp ảnh
- Phụ thuộc: 05, 13, 15.
- Hiện có: chưa có (grep `toBlob|toDataURL|preserveDrawingBuffer` không có).
- Làm ngay: render target kích thước định sẵn, `toBlob`, ẩn UI/tên, preset góc chữ L, khôi phục camera/input khi thoát. Không có texture ngoài nên ít rủi ro taint CORS.
- Kích thước: vừa.

### Task 17 — Trình biên tập bố trí
- Phụ thuộc: 01, 06; dùng chung layout với 09; quyền 26.
- Hiện có: chế độ di chuyển vật `layout/useMoveMode.ts`, `GhostMesh.tsx`, `placement.ts`, `ui/LayoutMovePanel.tsx`; server `POST /api/layout/move` kiểm id, bàn không được di chuyển, kiểm vị trí trả 409, rate limit; `POST /reset` chỉ `it`/`admin`; SSE phát thay đổi.
- Thiếu: edit mode tách, gizmo xoay/dịch (drei `TransformControls` có sẵn), thêm/nhân bản/xóa/nhóm, undo/redo, draft vs published, revision cho cả layout, quy tắc tường/cửa.
- Làm ngay; QĐ-6 cho ai được publish. Server layout phải mở rộng schema (hiện chỉ lưu x, z, rotation cho vật movable).
- Kích thước: rất lớn.

### Task 18 — Thư viện asset
- Phụ thuộc: 01, 04, 07.
- Hiện có: catalog tĩnh `fashion/catalog.ts` (1254 dòng), `hair.ts`, `face.ts`, `tattoos.ts`; catalog cây `services/plants/src/catalog.js`. Không có trang quản lý, version theo hash, "nơi đang dùng".
- Làm được: catalog local qua adapter, trang duyệt/lọc, thống kê validator. Upload/import server và publish theo QĐ-7.
- Kích thước: lớn.

### Task 19 — Ảnh tải lên cho hình xăm
- Phụ thuộc: 01, 06.
- Hiện có: hình xăm procedural `fashion/tattoos.ts` (ghi rõ "Ảnh PNG người dùng tải lên chưa hỗ trợ"), `TattooLayer` trong `fashion/types.ts:198`. Không có upload/decode/EXIF.
- Làm được: kiểm MIME + chữ ký, giới hạn pixel, `createImageBitmap`, crop/xoay/alpha, bỏ EXIF bằng vẽ lại canvas, lưu Blob IndexedDB (task 06). Không bật "xóa nền" khi không có thuật toán thật.
- Bị chặn: QĐ-5; áp decal trên da biến dạng cần mesh UV thật (TN-1), trên nhân vật hình học chỉ là texture trên vùng thân.
- Kích thước: lớn.

### Task 20 — Xuất/nhập, phiên bản
- Phụ thuộc: 06, 18, 19.
- Hiện có: xuất/nhập JSON look `fashion/persistence.ts` có giới hạn byte và validate.
- Thiếu: package manifest, preview import hai bước, lịch sử checkpoint, compare theo thay đổi có nghĩa, transaction.
- Làm ngay với JSON; ZIP theo QĐ-8. Phần online (quyền import/restore) chờ 22/26.
- Kích thước: lớn.

### Task 21 — Bộ kiểm tra chất lượng
- Phụ thuộc: 01.
- Hiện có: `fashion/rules.ts` `validate()`, `layout/placement.ts`, `services/layout/src/geometry.js` (AABB xoay), `services/layout/src/movable.js`. Không có validator scene/CLI/report.
- Làm ngay: module TS thuần dùng chung cho CLI (chạy trên VPS) và panel editor; fixture lỗi. Cần QĐ-3 để chạy CLI/CI.
- Kích thước: vừa.

### Task 22 — Tài khoản, hồ sơ
- Phụ thuộc: 06, 18–20.
- Hiện có (phần lớn): `services/auth` đăng ký OTP, đăng nhập bcrypt, phiên cookie, logout, OAuth Google/Microsoft (tắt khi trống cấu hình), hồ sơ ngoại hình có validate server (`services/auth/appearance.js`, bỏ khóa lạ như role/id), danh bạ, moderation, rate limit.
- Thiếu: outfit presets lưu server, revision/optimistic concurrency cho ngoại hình, merge dữ liệu guest, xóa hồ sơ, xác định public profile tách khỏi dữ liệu riêng (kiểm lại `/api/auth/directory` có lộ email không).
- Bị chặn: SMTP thật (TN-5), HTTPS (TN-6) để nghiệm thu đầy đủ.
- Kích thước: vừa.

### Task 23 — Đồng bộ nhiều người
- Phụ thuộc: 22, 01–06.
- Hiện có: không. NPC và va chạm xã hội chỉ cục bộ (`scene/social/world.ts`, `npcReactions.ts`); SSE một chiều cho layout/display. Không có WebSocket (grep không có).
- Cần: service realtime (mục 5.3), protocol schema, snapshot interpolation cho người khác, reconciliation cho người chơi, interest management, đo RTT/bandwidth.
- Bị chặn: QĐ-4 (thêm `ws`), QĐ-13, QĐ-14; test cần TN-10.
- Kích thước: rất lớn.

### Task 24 — Chiếm ghế, cầm vật, khóa sửa
- Phụ thuộc: 23, 22, 26.
- Hiện có: trạng thái ngồi/cầm cục bộ (`characterState.ts`), layout trả 409 khi vị trí bị chiếm nhưng không có lease.
- Cần: bảng lease SQLite, fencing token, heartbeat, grace period, force release có audit, UI available/pending/ownedByMe/occupiedByOther/releasing.
- Bị chặn: task 23.
- Kích thước: lớn.

### Task 25 — Chat, thoại, phòng họp
- Phụ thuộc: 22–23, 26.
- Hiện có: thiết kế `docs/design/SOCIAL.md` (chat SSE, rate 30 tin/phút); lọc từ tục `services/*/profanity.js`; moderation report. Chưa có code chat/voice.
- Chat: làm được sau 23 (hoặc theo SOCIAL.md bằng SSE + POST).
- Voice: cần QĐ-11, TN-7 (coturn/LiveKit, UDP công khai, domain TLS vì `getUserMedia` cần HTTPS). Hai tab cùng máy không phải bằng chứng.
- Kích thước: rất lớn.

### Task 26 — Phân quyền
- Phụ thuộc: 22; tích hợp 23–25, 17.
- Hiện có: vai trò toàn hệ thống `employee|it|moderator|admin` (`services/auth/db.js:23`), `requireModerator` (`index.js:580`), `requireAdminRole` (856), `RESET_ROLES` layout, `ORGANIZER_ROLES` events (`services/events/src/util.js:84`). Mỗi service tự kiểm role, không có policy dùng chung, không có vai trò theo phòng.
- Làm được ngay: policy module + permission matrix + bảng thành viên phòng; áp vào REST hiện có. Phần realtime (thu hồi trong phiên, hủy lease/voice) chờ 23–25.
- Kích thước: lớn.

### Task 27 — Reconnect và khôi phục phiên
- Phụ thuộc: 06, 22–24, 26.
- Hiện có: SSE heartbeat 25 s (`services/layout/src/sse.js:4`), EventSource tự nối lại (`DisplayStore.tsx:145`); `visibilitychange` ở `App.tsx:255`, `DuelLayer.tsx:75`.
- Cần: connection state machine, resume token, delta history hoặc full snapshot, phân loại action queue/không queue, chính sách nhiều tab (QĐ-12), drain khi restart, telemetry.
- Bị chặn: task 23–24.
- Kích thước: lớn.

## 7. Ghi chú cho người giao task

- Mỗi lần giao một task, kèm mục tương ứng ở phần 6 và các quyết định đã chốt ở phần 3.
- Build, test và chạy dev làm trên VPS theo quy tắc hiện có; máy cục bộ chỉ sửa mã.
- Với task bị chặn bởi asset, giao phần interface trước và ghi "chưa kiểm chứng" cho tiêu chí cần asset, đúng yêu cầu "không giả lập để báo hoàn tất" của đặc tả.
