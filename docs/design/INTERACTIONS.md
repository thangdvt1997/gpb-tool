# INTERACTIONS · Tương tác trong văn phòng ảo GPBank (Khối CNTT)

Trạng thái: thiết kế, chưa triển khai. Ngày: 2026-11-06.

Phạm vi: mọi vật thể trong `src/content/zones/it.json`, tương tác người với người, người với vật, người với động vật. Tài liệu này không sửa mã, không tạo dịch vụ, không đổi `it.json`.

Nguồn đối chiếu (chỉ đọc): `docs/FLOORPLAN_IT.md`, `src/content/zones/it.json`, `docs/design/DESIGN_V2.md`, `docs/design/DECISIONS.md`, `docs/design/ONBOARDING_API.md`, `docs/design/AVATAR_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/RESEARCH_SERVICES.md`, `services/*/src/routes/*`, `src/ui/Panel.tsx`, `src/env/index.ts`, `src/scene/Desks.tsx`, `src/content/types.ts`.

Phụ thuộc: `docs/design/ANIMALS.md` chưa có trong repo khi viết. Mục 6 chỉ tham chiếu. Khi ANIMALS.md có, đối chiếu lại tên động từ và trạng thái động vật.

---

## 0. Tóm tắt

- `it.json` có 39 vật thể, mỗi vật thể đều có mục trong mục 3, kèm công dụng, động từ, hiệu ứng, dịch vụ, vai trò, trạng thái cần lưu và pha triển khai. Không vật thể nào bị bỏ trống.
- Thêm 27 loại vật thể mới (mục 4) cho các đối tượng trong yêu cầu mà `it.json` chưa có: ghế, cửa phòng họp, cửa sổ, đèn công tắc, máy in, máy pha cà phê, bình nước, cây, tivi, bảng vẽ, bảng trắng, bàn cờ, micro, máy bán hàng, kệ văn phòng phẩm, tủ tài liệu, tủ dụng cụ cây, tủ sách, tranh, thảm, thùng rác, nút gọi thang máy, bàn ăn, ghế cao, sofa, ghế bành.
- 51 ID động từ: 36 với môi trường, 10 người với người, 5 người với động vật. `play` dùng chung cho trò chơi và chơi với bóng, nên đếm một lần.
- Kiến trúc: một dịch vụ mới `world` cổng 3008 cho trạng thái dùng chung, presence, yêu cầu người với người và SSE. Cây có dịch vụ riêng `plants` (3007, đề xuất). Lý do ở mục 9.
- Bốn pha: Pha 1 nền tảng và vật thể có dịch vụ sẵn. Pha 2 người với người. Pha 3 người với động vật. Pha 4 vật thể phụ và hiệu ứng.
- Mặc định cho các điểm mơ hồ ở mục 11. Các mâu thuẫn cần người dùng xác nhận ở mục 12.

---

## 1. Khung động từ

### 1.1 Nguyên tắc

1. Mỗi tương tác có một động từ (`verb`) có ID duy nhất, một chủ thể (`person` hoặc `animal`) và một đối tượng (vật thể, người khác hoặc động vật).
2. Hai loại hiệu ứng:
   - **Cục bộ**: chỉ đổi hình ảnh hoặc âm thanh trên máy người chơi, không gửi gì lên máy chủ. Ví dụ: bật đèn, tư thế ngồi trong Pha 1, hơi nước máy pha ở Pha 1.
   - **Chia sẻ**: ghi trạng thái lên một dịch vụ. Máy chủ là nguồn sự thật. Client chỉ đoán trước để hiển thị nhanh, rồi chấp nhận kết quả của máy chủ.
3. Máy chủ kiểm tra lại mọi điều kiện (vai trò, khoảng cách, hồi chiêu, trạng thái) trước khi ghi. Client không bao giờ là căn cứ duy nhất.
4. Mọi ghi trạng thái và audit nằm trong cùng một giao dịch SQLite, theo quy ước của `services/it` (bảng `audit_log`, lưu `payload_hash` chứ không lưu nội dung).
5. Tương tác có đồng ý luôn có thời hạn (`expiresAt`). Hết hạn thì tự động kết thúc, không cần ai bấm.

### 1.2 Đối tượng dữ liệu chung

Kế hoạch file: `src/interactions/types.ts` (chưa tạo). Dùng chung cho frontend và cho đặc tả hợp đồng API của world, plants.

```ts
// src/interactions/types.ts (kế hoạch, chưa tạo)
export type Subject = 'person' | 'animal';

export type TargetRef =
  | { type: 'object'; id: string }      // id trong it.json, hoặc vật thể bổ sung ở mục 4
  | { type: 'person'; userId: number }  // userId từ GET /api/auth/me
  | { type: 'animal'; id: string };     // theo ANIMALS.md

export interface EffectRef {
  service: 'local' | 'world' | 'plants' | 'display' | 'it' | 'games' | 'karaoke' | 'events';
  path: string;                         // đường dẫn đầy đủ, ví dụ '/api/it/kudos'
}

export interface InteractionDef {
  verb: VerbId;
  subject: Subject;
  targetTypes: Array<TargetRef['type']>;
  roles: Role[];                        // vai trò được dùng động từ (hẹp hơn hoặc bằng roles của vật thể)
  rangeM: number;                       // khoảng cách tối đa, mét
  cooldownMs: { actorVerb?: number; actorTarget?: number; actorAny?: number };
  requires?: string[];                  // điều kiện trạng thái, ví dụ 'carry:coffee', 'seat:free'
  consent: 'none' | 'ask';              // 'ask': người nhận phải đồng ý
  consentTtlS?: number;                 // chỉ khi consent = 'ask'
  effects: EffectRef[];
  feedback: { sfx?: string; anim?: string; hud?: string };  // sfx tra theo DESIGN_V2 mục 4.4
  audit: 'none' | 'minimal';
  phase: 1 | 2 | 3 | 4;
}

export interface InteractionRequest {
  verb: VerbId;
  target: TargetRef;
  payload?: Record<string, unknown>;    // tối đa 1 KB, không HTML, không liên kết
  expectedVersion?: number;             // chống ghi đè khi nhiều người chạm cùng lúc
  clientSeq: number;                    // khử trùng khi thử lại
}

export interface InteractionResult {
  ok: boolean;
  code: ResultCode;                     // xem mục 1.4
  retryAfterMs?: number;
  version?: number;
  state?: unknown;
}
```

Ghi chú: `payload` giới hạn 1 KB, theo cùng tinh thần giới hạn payload đồng bộ avatar ở ONBOARDING_API mục 5.

### 1.3 Điều kiện chung (áp dụng mọi động từ)

| Điều kiện | Quy định | Nguồn |
|---|---|---|
| Phiên | `sid` hợp lệ, phạm vi `full`, qua `GET /api/auth/me`. `osid` không đủ. | ONBOARDING_API 6.1 |
| Trạng thái tài khoản | Chỉ người đã onboard (`onboarding_step` là `tour` hoặc `done`) mới dùng được tương tác. Tài khoản `active` chưa qua tour chỉ xem được. | ONBOARDING_API 1.1 |
| Vai trò | Vai trò dùng động từ là giao của `roles` vật thể và `roles` của động từ. | it.json, mục 2 |
| Khoảng cách | Mặc định 2.0 m tính từ mép footprint. Ghế: 1.5 m tới tâm ghế. Người với người: 10 m cho `wave`, 1.5 m cho `high_five`, `toast`, `gift_flower`, `invite_sit`. Động vật: 1.5 m. | Quyết định ở mục 11 |
| Hồi chiêu | Ba mức: theo (người, động từ), theo (người, đích), theo người. Giá trị ghi ở từng động từ. Mức tối thiểu toàn cục: 1 s. | mục 2 |
| Tay cầm | Mỗi người cầm tối đa một món (`coffee`, `water_cup`, `flower`, `watering_can`, `fertilizer`, `pen`, `notepad`, `sticky`, `mic`, `pruning_shears`). Món tự rơi sau 10 phút. Không cầm được khi tay đang cầm. | mục 7 |
| Giới hạn tốc độ | Mặc định 60 yêu cầu tương tác mỗi phút cho mỗi người, cộng giới hạn riêng từng động từ ở mục 5. Vượt trả `429`. | mục 9.6 |
| CSRF | Chặn `POST` có `Sec-Fetch-Site: cross-site`, cùng quy tắc với events. | DECISIONS 5 |
| Riêng tư | Log không chứa nội dung. Chỉ ghi outcome, verb, id, `payload_hash`. | mục 8 |

### 1.4 Mã kết quả

| `code` | Ý nghĩa | Hiển thị cho người gửi |
|---|---|---|
| `ok` | Đã ghi nhận | Hiệu ứng và HUD thành công |
| `forbidden` | Sai vai trò hoặc không có quyền | "Khu này chỉ dành cho nhóm IT" (hoặc tương tự) |
| `too_far` | Ngoài khoảng cách | "Lại gần hơn một chút" |
| `cooldown` | Đang hồi chiêu, kèm `retryAfterMs` | Nút mờ, đếm ngược |
| `state_conflict` | Ghế đã có người, lệch `version`, máy đang bận | Đồng bộ lại trạng thái rồi báo |
| `consent_pending` | Đã gửi lời mời, chờ người nhận | "Đã gửi, đang chờ" |
| `declined` | Người nhận từ chối | Chỉ hiện khi người nhận đã từ chối rõ ràng cho chính người gửi, không công khai |
| `expired` | Hết hạn chờ đồng ý, hoặc người nhận im lặng | "Chưa nhận được phản hồi" |
| `not_delivered` | Người nhận chặn, bật "Đang tập trung" hoặc tắt loại này | Trả về giống hệt `expired`, để không lộ việc bị chặn |
| `rate_limited` | Vượt giới hạn | "Thử lại sau ít phút" |
| `not_available_mvp` | Tính năng chưa mở trong MVP (ví dụ lên tầng khác) | "Chỉ có một tầng trong MVP" |

### 1.5 Vòng đời một tương tác

1. Người chơi bấm vật thể bằng chuột, hoặc bấm phím E khi đứng gần (quy ước phím ở mục 11). Registry (mục 1.6) trả danh sách động từ theo vai trò và trạng thái cục bộ.
2. Client kiểm tra điều kiện cục bộ (khoảng cách, cầm đồ, hồi chiêu) và hiện nút khả dụng hoặc mờ kèm lý do.
3. Client gửi yêu cầu tới dịch vụ sở hữu dữ liệu. Trạng thái dùng chung đi qua `world` (mục 9). Dữ liệu nghiệp vụ đi thẳng tới `it`, `games`, `karaoke`, `events`, `plants`.
4. Máy chủ kiểm tra lại mục 1.3, ghi trạng thái và audit trong một giao dịch, rồi trả kết quả.
5. Máy chủ phát sự kiện SSE (mục 9.4) tới những người liên quan và người trong cùng khu (chỉ phần thay đổi).
6. Client phát SFX, chạy hoạt ảnh, cập nhật HUD. Nếu nhận `state_conflict`, client tải lại trạng thái vật thể rồi báo người chơi.
7. Với động từ có đồng ý (`consent: ask`), người nhận nhận yêu cầu qua SSE và trả lời bằng `POST /api/world/requests/:id/respond`. Hết hạn thì máy chủ tự đóng yêu cầu.

### 1.6 Đăng ký vào frontend (registry theo loại vật thể)

Kế hoạch file (chưa tạo): `src/interactions/registry.ts`, `verbs.ts`, `effects.ts`, `useInteraction.ts`, `worldClient.ts`.

Thứ tự tra cứu: `obj.id` trước, rồi `obj.action`, rồi `obj.kind`. Không khớp thì vật thể chỉ là trang trí, không có động từ.

Lý do: `Panel.tsx` (switch theo `action`, khoảng dòng 39–60) và `env/index.ts` (switch theo `id`, khoảng dòng 118–159) đang trùng nhau một phần. Registry gom về một chỗ, không đổi `kind`, giữ `action` làm khóa tương thích.

```ts
// src/interactions/registry.ts (kế hoạch, chưa tạo)
export interface ObjectRule {
  match: { id?: string; action?: string; kind?: ObjectKind };
  verbs: VerbId[];          // thứ tự hiển thị trên panel
  primary?: VerbId;         // nút chính khi đứng gần
  panel?: string;           // tên panel React
  worldKeys?: string[];     // khóa trạng thái cần nhận qua SSE
}

export const REGISTRY: ObjectRule[] = [
  { match: { id: 'kudos_board' }, verbs: ['view', 'praise'], primary: 'praise', panel: 'KudosPanel' },
  { match: { action: 'booking' }, verbs: ['book', 'inspect'], primary: 'book', panel: 'BookingPanel' },
  { match: { kind: 'desk' }, verbs: ['sit', 'view'], primary: 'sit', panel: 'SquadPanel' },
  // ... một dòng cho mỗi id và mỗi loại mới ở mục 4
];

export function verbsFor(obj: ZoneObject, role: Role): VerbId[] { /* lọc theo roles và trạng thái */ }
```

Trường `interactions?: VerbId[]` chỉ thêm vào `ZoneObject` khi cần ghi đè. Mặc định suy ra từ registry, để tránh sửa `it.json` cho từng vật thể.

Hook dùng chung: `useInteraction(verb)` trả về `{ run, busy, cooldownLeftMs, lastResult }`. `effects.ts` chỉ nhận tên SFX và tên hoạt ảnh (theo DESIGN_V2 mục 4.4 và 7.7), không nhận dữ liệu.

Trợ năng (DESIGN_V2 mục 1.5): mọi động từ có đường bàn phím. Trạng thái không chỉ dựa vào màu. Vùng chạm tối thiểu 40 px.

### 1.7 Ánh xạ sang dịch vụ backend

| Dịch vụ | Cổng | Trạng thái trong repo | Dùng cho tương tác | Dữ liệu sở hữu |
|---|---|---|---|---|
| auth | 3001 | Có | `GET /api/auth/me` (phiên, vai trò, bước onboard), `GET /api/auth/profile/appearances` (avatar người khác) | users, sessions |
| it | 3002 | Có: kudos, rooms, tickets, services, security summary | `praise`, `book`, `request`, `view` (NOC, SOC, notice), đặt phòng | tickets, incidents, bookings, kudos, audit_log |
| games | 3003 | Có: caro, quiz, leaderboard | `play`, `invite_play`, bảng xếp hạng | caro_rooms, quiz, scores trò chơi |
| karaoke | 3004 | Có: songs, scores, leaderboard, history. Chưa có queue | `sing`, `invite_sing` | scores, lịch sử |
| events | 3005 | Có: danh sách, programs, votes, results, close. Chưa có highlights, ics | `register`, `vote`, `view` (lịch, kết quả) | events, programs, votes |
| display | 3006 (đề xuất) | Sẽ có, chưa có trong ARCHITECTURE.md | Nội dung kênh TV, màn chào, tóm tắt NOC cho TV, SSE nội dung | Không sở hữu trạng thái tương tác |
| plants | 3007 (đề xuất) | Sẽ có | `water`, `catch`, `pluck`, `prune`, `fertilize` | plants, plant_events |
| world | 3008 (mới) | Sẽ có (thiết kế ở mục 9) | Presence, tay cầm, trạng thái vật thể dùng chung, yêu cầu người với người, động vật, log tối thiểu, SSE | world.db |

Lệch tên endpoint giữa `RESEARCH_SERVICES.md` và code hiện có. Tương tác dùng tên trong code, để khi đồng bộ tài liệu thì sửa tài liệu:

| Mục | `RESEARCH_SERVICES.md` | Code hiện tại | Tương tác dùng |
|---|---|---|---|
| Đăng ký tiết mục | `POST /api/events/:id/registrations` | `POST /api/events/:id/programs` | code |
| Bình chọn | `POST /api/events/:id/votes` | `POST /api/events/:id/vote` | code |
| Đóng sự kiện | `POST /api/events/:id/status` | `POST /api/events/:id/close` | code. Tự đóng khi qua `endsAt` (DECISIONS 4) |
| Điểm karaoke | `POST /api/karaoke/sessions/:id/score` | `POST /api/karaoke/scores` | code |
| Phòng caro | `/api/games/rooms` | `/api/games/caro/rooms` | code |
| Nước đi caro | `POST /rooms/:id/moves` | `POST /rooms/:id/move` | code |

---

## 2. Bảng động từ

Cột "Pha" theo mục 10. Cột "Hồi chiêu" và "Đồng ý" chi tiết ở mục 5 cho người với người và mục 6 cho động vật.

### 2.1 Với môi trường (36 động từ)

| # | Verb | Chủ thể → đối tượng | Vai trò | Điều kiện | Hiệu ứng và dịch vụ | Phản hồi | Pha |
|---|---|---|---|---|---|---|---|
| 1 | `sit` | người → ghế, sofa, ghế bành, bàn ăn, ghế cao, thảm (ngồi bệt) | employee, it, admin | Trong 1.5 m tới tâm ghế; ghế trống; hồi chiêu 2 s | P1: tư thế cục bộ. P2: `POST /api/world/objects/:id/actions` ghi `occupant`. Tự nhả sau 15 phút không heartbeat | Hoạt ảnh ngồi 0.4 s | 1 / 2 |
| 2 | `stand` | người → ghế đang tự ngồi | Như trên | Chỉ người đang ngồi | `world` nhả `occupant` | Hoạt ảnh đứng 0.3 s | 2 |
| 3 | `open` | người → `door_mr1..3`, `window_*` | Cửa phòng họp: theo khóa (mục 7.9). Cửa sổ: employee, it, admin | Cửa phòng họp: đang mở khóa, hoặc người đặt phòng, hoặc it/admin. Cửa sổ: không khóa | `world` cập nhật `door:<id>` hoặc `window:<id>` | SFX nhẹ, hoạt ảnh cánh cửa 0.8 s | 1 (cửa) / 4 (cửa sổ) |
| 4 | `close` | người → cửa, cửa sổ | Như `open` | Như `open` | Như `open` | Như `open` | 1 / 4 |
| 5 | `press` | người → `lift_btn_1..3` | employee, it, admin | Hồi chiêu 1 s. MVP chỉ có một tầng | Cục bộ. Không gửi máy chủ | Nút sáng 0.2 s, cửa cabin mở 1.5 s (chỉ hình) | 4 |
| 6 | `climb` | người → `core_st1..3` | Tất cả | Không khả dụng trong MVP | Không ghi trạng thái | `not_available_mvp`: "Chỉ có một tầng trong MVP" | 1 |
| 7 | `brew` | người → `coffee_machine_1..2` | Tất cả | Trong 2 m; máy không bận (8 s); tối đa 1 ly mỗi 10 phút mỗi người | P1: cục bộ, hơi nước và SFX. P2: `world` đặt `carry: coffee` 10 phút | Hoạt ảnh pha 8 s, 12 hạt hơi nước, SFX "Hơi máy pha" | 1 / 2 |
| 8 | `print` | người → `printer_util_print` | Tất cả | Hồi chiêu 3 s | Cục bộ. Ra một tờ mẫu cố định. Không gửi nội dung, không có hàng đợi | Đèn máy, tờ mẫu ra khay 5 s, SFX "Gõ phím" lặp 4 lần | 4 |
| 9 | `water` | người → `plant_*` | Tất cả | Đang cầm `watering_can`; độ ẩm cây dưới 80; 1 lần mỗi 30 phút mỗi cây | `plants`: `POST /api/plants/:id/water` | Hoạt ảnh tưới 2 s, giọt nước | 4 |
| 10 | `fill` | người → `water_cooler_pantry` | Tất cả | Tay trống; hồi chiêu 5 s | `world` đặt `carry: water_cup` | Hoạt ảnh rót 2 s | 2 |
| 11 | `draw` | người → `drawing_board_lounge`, `whiteboard_mr1..3` | Tất cả. Bảng trắng: người đặt phòng đang hoạt động, hoặc người đang ở trong phòng (presence) | Tối đa 30 nét mỗi phút; tối đa 300 nét mỗi bảng | `world`: `POST /api/world/strokes` | Nét hiện ngay, không SFX | 4 |
| 12 | `erase` | người → nét của chính mình. it/admin: nét bất kỳ | Tất cả (phạm vi như trên) | Nét thuộc người gọi, hoặc người gọi là it/admin | `world`: xóa mềm `deleted_at` | Nét biến mất | 4 |
| 13 | `clear` | người đặt phòng → `whiteboard_mr*`. it/admin → `drawing_board_lounge` | Như ghi chú | Có quyền theo phạm vi | `world` xóa mềm toàn bộ nét của bảng, ghi audit | Bảng trắng xóa | 4 |
| 14 | `switch_channel` | người → `tv_lounge`; người đặt phòng hoặc it/admin → `tv_mr1..3` | Như ghi chú | Bật nguồn; cooldown 5 s toàn TV | `world`: `object:tv:<id>` đặt `channel`. Nội dung kênh lấy từ `display` | Chuyển kênh 0.3 s, SFX "Nhấn nút giao diện" | 4 |
| 15 | `power` | người → `tv_*` | Như `switch_channel` | Hồi chiêu 5 s | `world`: đặt `power` | Màn hình sáng hoặc tối | 4 |
| 16 | `book` | người → `mr1..3`, `util_quiet`, `util_health` | Tất cả | Tối đa 8 giờ; không đặt quá khứ; không trùng lịch | `it`: `GET /api/rooms/free`, `POST /api/rooms/book` | Toast "Đã đặt phòng. Mã: ..." | 1 |
| 17 | `pick` | người → `mic_karaoke_*`, `tool_cabinet_lounge` | Tất cả | Tay trống. Micro: đang đứng trong `karaoke_room` | Micro: cục bộ, nhận micro của trình duyệt. Dụng cụ: `world` đặt `carry` | Hoạt ảnh nhấc vật 0.5 s | 1 (micro) / 4 (dụng cụ) |
| 18 | `drop` | người đang cầm → `bin_*`, `mic_karaoke_*` | Tất cả | Đang cầm món | `world` xóa `carry`. Micro: cục bộ | Hoạt ảnh bỏ vào thùng, SFX nhẹ | 2 |
| 19 | `borrow` | người → `stationery_shelf_util_print`, `filing_cabinet_*` | Tất cả | Tối đa 2 món cầm cùng lúc; còn tồn kho | `world`: giảm tồn kho, đặt `carry` | Hoạt ảnh lấy hàng, toast ngắn | 4 |
| 20 | `return` | người → như `borrow` | Tất cả | Đang cầm đúng loại đó | `world`: tăng tồn kho, xóa `carry` | Hoạt ảnh trả hàng | 4 |
| 21 | `sing` | người → `karaoke_room` | Tất cả | Đứng trong phòng; sức chứa 6; chọn bài đã duyệt | `karaoke`: `GET /api/karaoke/songs`, `POST /api/karaoke/scores`. Điểm tính trong trình duyệt (DECISIONS 3) | Nhạc, lời, điểm; SFX "Vỗ tay" sau khi kết thúc | 1 |
| 22 | `play` | người → `games_corner`, `chess_table_1..2`. Người → động vật (quả bóng) | Tất cả | Caro, đố vui: theo quy tắc games. Cờ vua: P4 | `games`: `POST /api/games/caro/rooms`, `POST /api/games/quiz/round`. Cờ vua: `chess.js` (P4) | Giao diện bàn chơi | 1 / 4 |
| 23 | `vote` | người → `events_board` (một tiết mục) | employee, it, admin | Sự kiện đang mở; chưa bình chọn ở vòng này; không bình chọn tiết mục của chính mình | `events`: `POST /api/events/:id/vote` (409 nếu đã bình chọn) | Toast "Đã ghi nhận bình chọn" | 1 |
| 24 | `register` | người → `events_board` | Tất cả | Sự kiện chưa đóng (chưa qua `endsAt`) | `events`: `POST /api/events/:id/programs` | Toast "Đã đăng ký tiết mục" | 1 |
| 25 | `praise` | người → `kudos_board` | Tất cả | Một lần mỗi ngày theo UTC+7; lời nhắn 140 ký tự | `it`: `POST /api/kudos`. P4: ghim, pháo giấy | Ghim lên bảng, SFX "Ghim lên bảng", pháo giấy 120 hạt (P4) | 1 / 4 |
| 26 | `view` | người → `notice_board`, `noc_wall`, `kudos_board` (đọc), `soc_room` (it, admin), `server_room` (it, admin), `events_board` (lịch và kết quả) | Theo vật thể | Không có. Kết quả khi chưa đóng: it, admin | `it`: `GET /api/it/services` (30 s), `GET /api/it/security/summary`, `GET /api/kudos/board`. `events`: `GET /api/events`, `GET /api/events/:id/results` | Bảng nội dung | 1 |
| 27 | `request` | người → `service_desk`. it, admin → `util_store` | Tất cả. Kho: it, admin | Nội dung ticket tối thiểu, không có dữ liệu cá nhân ngoài tên hiển thị | `it`: `POST /api/it/tickets` | Toast "Đã gửi yêu cầu. Mã: ..." | 1 |
| 28 | `browse` | người → `bookshelf_north_*` | Tất cả | Không có | Danh sách tĩnh, không có dữ liệu động | Hoạt ảnh lật trang 0.5 s | 4 |
| 29 | `inspect` | người → mọi vật thể có công dụng chỉ thông tin (mục 3) | Tất cả | Không có | Cục bộ: mở panel mô tả | Panel | 1 |
| 30 | `straighten` | người → `painting_lounge_*` | Tất cả | Hồi chiêu 2 s | Cục bộ. Không lưu cho người khác | Tranh nghiêng về đúng 0.3 s | 4 |
| 31 | `toggle` | người → `light_switch_*` | Tất cả | Không có | Cục bộ. Chỉ ảnh hưởng ánh sáng khu đó trên máy người gọi. Không gửi máy chủ (mục 7.11) | Đèn đổi độ sáng 0.5 s | 4 |
| 32 | `vend` | người → `vending_lounge` | Tất cả | Tối đa 1 món mỗi 2 giờ mỗi người; món là đồ miễn phí, không có giá | `world`: giảm tồn kho nội bộ, đặt `carry` | Hoạt ảnh rơi món, SFX nhẹ | 4 |
| 33 | `catch` | người → `plant_*` đang có sâu | Tất cả | Tay trống | `plants`: `POST /api/plants/:id/catch` | Hoạt ảnh bắt sâu, sâu biến mất | 4 |
| 34 | `pluck` | người → `plant_*` đang có hoa | Tất cả | Tay trống; một hoa mỗi 2 giờ mỗi cây | `plants`: `POST /api/plants/:id/pluck`. Đặt `carry: flower` | Hoa rơi vào tay | 4 |
| 35 | `prune` | người → `plant_*` có lá khô | Tất cả | Đang cầm `pruning_shears`; một lần mỗi 60 phút mỗi cây | `plants`: `POST /api/plants/:id/prune` | Hoạt ảnh cắt, lá rơi | 4 |
| 36 | `fertilize` | người → `plant_*` | Tất cả | Đang cầm `fertilizer`; một lần mỗi ngày mỗi cây | `plants`: `POST /api/plants/:id/fertilize` | Hạt bụi phân bay 1 s | 4 |

### 2.2 Người với người (10 động từ)

| # | Verb | Mục đích | Vai trò | Điều kiện | Hiệu ứng và dịch vụ | Phản hồi | Pha |
|---|---|---|---|---|---|---|---|
| 37 | `wave` | Chào | Tất cả | 10 m; hồi chiêu 5 s cho cùng người, 3 s toàn cục | `world`: `POST /api/world/requests` với `consent: none` | Nhân vật vẫy tay 1.5 s, bong bóng chào | 2 |
| 38 | `thumbs_up` | Giơ ngón cái | Tất cả | 10 m; hồi chiêu 60 s cho cùng người; tối đa 10 lần mỗi ngày | `world` (không đồng ý) | Biểu tượng ngón cái 1.5 s | 2 |
| 39 | `high_five` | Đập tay | Tất cả | 1.5 m cả hai; người nhận phải đồng ý trong 20 s | `world` (`consent: ask`) | Hai tay gặp nhau, SFX nhẹ (P4) | 2 |
| 40 | `toast` | Nâng ly | Tất cả | Người gửi đang cầm `coffee` hoặc `water_cup`; 1.5 m; người nhận đồng ý trong 20 s | `world` (`consent: ask`) | Hai ly chạm nhau, SFX "Chuông tre" nhẹ (P4) | 2 |
| 41 | `gift_flower` | Tặng hoa | Tất cả | Người gửi đang cầm `flower`; 1.5 m; người nhận đồng ý trong 20 s; tối đa 3 hoa mỗi ngày từ người gửi | `world` (`consent: ask`) và giảm `carry` của người gửi | Hoa chuyển tay | 4 |
| 42 | `sticker` | Tặng sticker vinh danh (từ danh sách cố định) | Tất cả | Tối đa 3 sticker mỗi ngày từ người gửi; mỗi người nhận tối đa 1 từ cùng người gửi mỗi ngày | `world` (`consent: none`, người nhận có thể ẩn). Ghi lịch sử, không đăng bảng vinh danh | Biểu tượng sticker trên thẻ người nhận | 2 |
| 43 | `invite_play` | Mời chơi caro hoặc đố vui | Tất cả | Người nhận online và không đang trong trò chơi khác; yêu cầu sống 60 s; hồi chiêu 2 phút cho cùng cặp | `world` (`consent: ask`), khi đồng ý thì `games` tạo phòng | Panel mời kèm nút "Vào bàn" | 2 |
| 44 | `invite_sing` | Mời hát | Tất cả | Phòng karaoke còn chỗ (tối đa 6); yêu cầu sống 60 s; hồi chiêu 5 phút | `world` (`consent: ask`) | Panel mời | 2 |
| 45 | `invite_sit` | Mời ngồi chung bàn hoặc sofa | Tất cả | Người gửi đang ngồi; ghế của người nhận trống; yêu cầu sống 30 s | `world` (`consent: ask`), sau khi đồng ý thì giữ ghế cho người nhận | Panel mời | 2 |
| 46 | `remind` | Nhắc việc (thông báo nhỏ, có giới hạn) | Tất cả | Tối đa 1 nhắc mỗi người nhận mỗi ngày từ cùng người gửi; tối đa 3 nhắc mỗi ngày từ một người gửi | `world`: nội dung giữ tối đa 24 giờ để giao, sau đó chỉ còn `payload_hash` | Thông báo nhỏ, SFX "Thông báo" | 2 |

### 2.3 Người với động vật (5 động từ mới và `play`)

| # | Verb | Mục đích | Chi tiết | Pha |
|---|---|---|---|---|
| 47 | `pet` | Vuốt ve | Mục 6 | 3 |
| 48 | `feed` | Cho ăn | Mục 6 | 3 |
| 49 | `play` | Chơi với bóng (dùng chung ID với trò chơi, phân biệt bằng loại đích) | Mục 6 | 3 |
| 50 | `give_water` | Đưa nước (không dùng `water`, vì `water` là tưới cây) | Mục 6 | 3 |
| 51 | `photo` | Chụp ảnh (chỉ lưu cục bộ) | Mục 6 | 3 |
| 52 | `call_back` | Gọi về chỗ | Mục 6 | 3 |

Ghi chú: bảng 2.3 có 6 dòng nhưng `play` đã nằm ở 2.1 (dòng 22), nên tổng ID duy nhất là 51.

---

## 3. Catalog vật thể trong it.json (39 id)

Quy ước: vai trò mặc định là `employee`, `it`, `admin` (theo `roles` trong `it.json`), trừ khi ghi khác. Cột "Động từ" dùng ID ở mục 2. Cột "Pha" là pha mà động từ hoặc hiệu ứng chính xuất hiện. Thứ tự theo nhóm trong `it.json`.

### 3.1 Lõi giao thông (6)

| id | Công dụng thực tế | Động từ | Hiệu ứng và dịch vụ | Trạng thái cần lưu | Pha |
|---|---|---|---|---|---|
| `core_st1` | Đi lên và xuống giữa các tầng bằng thang bộ. MVP chỉ có một tầng | `climb` (không khả dụng MVP), `inspect` | Thông báo "Chỉ có một tầng trong MVP" | Không | 1 |
| `core_st2` | Như `core_st1`, góc Đông-Bắc | `climb`, `inspect` | Như trên | Không | 1 |
| `core_st3` | Như `core_st1`, lõi Đông-Nam | `climb`, `inspect` | Như trên | Không | 1 |
| `core_lift1` | Thang máy và thang bộ, lõi giữa-Nam. Đưa người lên xuống | `inspect`; `press` ở `lift_btn_1` (mục 4) | Panel ghi "Thang máy: một tầng trong MVP". Cabin mở khi bấm nút (chỉ hình, mục 7.10) | Không | 1 / 4 |
| `core_lift2` | Thang máy, lõi giữa | `inspect`; `press` ở `lift_btn_2` | Như `core_lift1` | Không | 1 / 4 |
| `core_lift3` | Thang máy phụ cạnh khối WC. Footprint chồng `wc_block` ở dải y 11.1–11.9 (mục 12) | `inspect`; `press` ở `lift_btn_3` | Như `core_lift1` | Không | 1 / 4 |

### 3.2 Tiện ích, pantry, lounge (8)

| id | Công dụng thực tế | Động từ | Hiệu ứng và dịch vụ | Trạng thái cần lưu | Pha |
|---|---|---|---|---|---|
| `wc_block` | Nhà vệ sinh Nam, Nữ và khuyết tật | `inspect` | Biển chỉ dẫn. Không hiện ai đang ở trong khối, không có presence bên trong (riêng tư) | Không | 1 |
| `pantry` | Pha đồ uống, ăn trưa, nghỉ ngắn. Góc Đông-Nam | `inspect`; `sit` (bàn ăn, mục 4); `brew` (`coffee_machine_1`); `fill` (`water_cooler_pantry`); `drop` (`bin_pantry`) | Thấy người đang ngồi bàn ăn (P2). Đồ uống cầm được (P2) | Chiếm chỗ bàn ăn, tay cầm | 1 / 2 |
| `util_coffee` | Coffee corner cạnh lõi Đông | `inspect`; `brew` (`coffee_machine_2`); `sit` (`coffee_stool_*`) | Như `pantry` | Chiếm chỗ ghế cao, tay cầm | 1 / 2 |
| `lounge` | Sảnh mở và lounge, nơi giao lưu. Chứa karaoke, game, bảng vinh danh, sofa, cây, tranh, máy bán hàng | `inspect` (danh sách vật thể trong khu, gợi ý điểm tụ) | Không có hiệu ứng riêng. Là điểm tụ cho người online không có chỗ ngồi (DESIGN_V2 7.7) | Không | 1 |
| `util_print` | In ấn và văn phòng phẩm, mép khu dự phòng | `inspect`; `print` (`printer_util_print`); `borrow`, `return` (`stationery_shelf_util_print`) | Tờ mẫu khi in, không có nội dung người dùng | Tồn kho văn phòng phẩm | 1 / 4 |
| `util_store` | Kho thiết bị IT. Chỉ IT và admin | `request` (yêu cầu cấp thiết bị), `inspect` | Ticket loại "thiết bị" qua `it`. Không có danh mục kho trong MVP | Không | 1 |
| `util_quiet` | Phòng nghỉ yên tĩnh cạnh khu L1. Đặt phòng như phòng họp | `book`, `inspect` | Đặt phòng qua `it`. Không có âm thanh | Đặt phòng | 1 |
| `util_health` | Phòng y tế, mẹ và bé, trong lounge. Đặt phòng như phòng họp | `book`, `inspect` | Đặt phòng qua `it`, tiêu đề mặc định "Đặt phòng", không ghi lý do. Không hiện ai đang trong phòng. Panel có số đường dây khẩn cấp (chưa có số, mục 12) | Đặt phòng | 1 |

### 3.3 Bảng, quầy, tường (5)

| id | Công dụng thực tế | Động từ | Hiệu ứng và dịch vụ | Trạng thái cần lưu | Pha |
|---|---|---|---|---|---|
| `kudos_board` | Vinh danh đồng nghiệp bằng lời nhắn ngắn. Không có giá trị tiền | `view` (20 lời mới nhất), `praise` (một lần mỗi ngày theo UTC+7) | `it`: `GET /api/kudos/board`, `POST /api/kudos`. P4: ghim màu, pháo giấy 120 hạt, SFX "Ghim lên bảng" và "Vỗ tay" | Bản ghi kudos trong `it.db` | 1 / 4 |
| `notice_board` | Lịch bảo trì, thay đổi và quy định IT | `view` | Nội dung tĩnh do IT duy trì trong file nội dung của web (chưa có API). Mặc định ở mục 11 | Không | 1 |
| `events_board` | Lịch chương trình, đăng ký tiết mục, bình chọn | `view` (lịch, kết quả), `register`, `vote` | `events`: `GET /api/events`, `POST /api/events/:id/programs`, `POST /api/events/:id/vote`, `GET /api/events/:id/results`. Sự kiện tự đóng khi qua `endsAt` (DECISIONS 4) | `events.db` | 1 |
| `service_desk` | Quầy hỗ trợ IT, tạo ticket. Sát lối vào chính | `request`; `view` (trạng thái ticket của tôi, P3, chưa có API) | `it`: `POST /api/it/tickets`. Hiện mã ticket. SFX "Thông báo" | Ticket trong `it.db` | 1 |
| `noc_wall` | Trạng thái dịch vụ GP.DigiPlus và hạ tầng. Chỉ đọc | `view` | `it`: `GET /api/it/services`, làm mới 30 s (`it.json`). Không hiện IP, tên máy, log | Không | 1 |

### 3.4 Khu làm việc (12)

| id | Khu hoặc squad | Vị trí theo lưới hiện tại | Động từ | Ghi chú | Pha |
|---|---|---|---|---|---|
| `open_north` | Khu làm việc chung phía Bắc, hot-desk | 48 (4 hàng × 12) | `sit`, `view` (số chỗ trống theo khu) | Chỗ không cố định. Tường NOC ở mép Bắc | 1 (cục bộ) / 2 (chia sẻ) |
| `reserved` | Khu dự phòng 227.2 m², không đặt bàn | 0 | `inspect` | Không mở chỗ ngồi, không đặt bàn tạm (DESIGN_V2 phát hiện 4) | 1 |
| `desk_L1` | Squad Core integration (tên mẫu, cần xác nhận) | 20 (4 × 5) | `sit`, `view` (vai trò, mẫu) | Trùng tên với `desk_B3` (mục 12) | 1 / 2 |
| `desk_L2` | Squad Data & BI | 20 (4 × 5) | `sit`, `view` | Trùng tên với `desk_B4` | 1 / 2 |
| `desk_L3` | Squad Security (SOC) | 15 (3 × 5) | `sit`, `view` | `view` không hiện dữ liệu SOC | 1 / 2 |
| `desk_B1` | Squad Mobile (GP.DigiPlus) | 16 (4 × 4) | `sit`, `view` | | 1 / 2 |
| `desk_B2` | Squad Backend & API | 16 (4 × 4) | `sit`, `view` | | 1 / 2 |
| `desk_B3` | Squad Core integration | 16 (4 × 4) | `sit`, `view` | Trùng tên với `desk_L1` | 1 / 2 |
| `desk_B4` | Squad Data & BI | 16 (4 × 4) | `sit`, `view` | Trùng tên với `desk_L2` | 1 / 2 |
| `desk_B5` | Squad Hạ tầng (máy chủ, mạng, CSDL) | 16 (4 × 4) | `sit`, `view` | Không hiện tên máy, IP | 1 / 2 |
| `desk_B6` | Squad Vận hành | 16 (4 × 4) | `sit`, `view` | | 1 / 2 |
| `desk_B7` | Squad Product / QA | 20 (4 × 5) | `sit`, `view` | | 1 / 2 |

Tổng lưới hiện tại: 219 vị trí. Tính bằng hàm `deskSeats()` trong `src/scene/Desks.tsx` với kích thước trong `it.json`.

Quy tắc chỗ ngồi:
- Mỗi chỗ có id ổn định dạng `<deskId>:r<hàng>:c<cột>`. Id không dùng tọa độ thực, vì tọa độ đổi khi chỉnh bố cục.
- DECISIONS 1 chọn khoảng 104 chỗ có ghế, sẽ áp vào dữ liệu khối bàn sau. Tương tác không hard-code số chỗ. Khi đổi số hàng và cột, id cũng đổi, nên phải thêm trường `seats` (mảng id cố định) vào khối bàn trước khi đổi, để không mất trạng thái đang lưu.
- Ghế là tài nguyên trong ngày (hot-desk). Không gắn cố định người với chỗ. Đặt chỗ trước chưa có API. Để P3, hoặc dùng bảng `bookings` của `it` với loại `desk`.
- Trạng thái lưu: `occupant` (userId, tự nhả sau 15 phút không heartbeat). P1 chỉ có tư thế cục bộ, không ghi `occupant`.

### 3.5 Phòng họp và phòng chức năng (8)

| id | Công dụng thực tế | Động từ | Hiệu ứng và dịch vụ | Trạng thái cần lưu | Pha |
|---|---|---|---|---|---|
| `mr1` | Phòng họp 8 chỗ | `book`; `open` (`door_mr1`); `switch_channel`, `power` (`tv_mr1`); `draw`, `clear` (`whiteboard_mr1`) | `it`: `GET /api/rooms`, `GET /api/rooms/free`, `POST /api/rooms/book`. Cửa khóa theo lịch (mục 7.9). Biển "Đang họp" theo giờ đặt | Đặt phòng (`it.db`), presence (`world`) | 1 (đặt, cửa) / 4 (TV, bảng) |
| `mr2` | Phòng họp 10 chỗ. DESIGN_V2 phát hiện 3: bố trí sát | Như `mr1` | Như `mr1` | Như `mr1` | 1 / 4 |
| `mr3` | Phòng họp 12 chỗ. DESIGN_V2 đề xuất 8–9 chỗ vì lối đi | Như `mr1` | Như `mr1`. Khi đặt phòng hiện sức chứa đề xuất | Như `mr1` | 1 / 4 |
| `server_room` | Phòng máy chủ, kính, hạn chế truy cập | `view` (it, admin: sơ đồ rack, chỉ đọc) | Nhân viên thường chỉ thấy vỏ kính và biển "Khu hạn chế", không mở được panel. Không có nút điều khiển | Không | 1 |
| `soc_room` | Phòng SOC, theo dõi cảnh báo | `view` (it, admin: tóm tắt số lượng theo mức, không log) | `it`: `GET /api/it/security/summary` | Không | 1 |
| `karaoke_room` | Phòng karaoke, sức chứa 6 | `sing`, `pick` (`mic_karaoke_*`), `invite_sing` (P2) | `karaoke`: `GET /api/karaoke/songs`, `POST /api/karaoke/scores`. Điểm do trình duyệt tính (DECISIONS 3). Bảng xếp hạng bỏ lượt `suspicious` | Điểm (`karaoke.db`), presence trong phòng | 1 / 2 |
| `games_corner` | Cờ caro và đố vui theo lượt | `play`, `invite_play` (P2), `view` (bảng xếp hạng của người đã chọn tham gia) | `games`: caro (`rooms`, `move`), quiz (`round`, `answer`, `finish`), leaderboard. Áp dụng DECISIONS 2, 6, 7, 8 | `caro_rooms`, quiz, điểm trong `games.db` | 1 / 2 |
| `entrance` | Lối vào chính, mép Nam sảnh giữa. Điểm xuất hiện nhân vật (25.0, 17.0) | `inspect`. Vẫy tay tự động khi vào (không phải động từ người dùng bấm) | P4: vẫy tay 1.5 s khi vào sảnh (DESIGN_V2 1.4) | Không | 1 / 4 |

---

## 4. Vật thể bổ sung mới (không có trong it.json)

Các vật thể dưới đây không có trong `it.json`. Mỗi loại có mẫu `id`. Số lượng và vị trí lấy từ DESIGN_V2 mục 5.5 khi có. Vị trí chưa có trong bản vẽ thì ghi "cần đo" và không đặt thử.

Việc thêm vào `it.json` là việc của bước triển khai, không làm trong tài liệu này. Không thêm `kind` mới: ưu tiên `amenity`, `board`, `screen`, `desk`, `wall` có sẵn. Riêng `door_*` cần đổi logic va chạm (mục 7.9).

| # | Loại (mẫu id) | kind / action | Số lượng | Đặt ở (nguồn) | Vai trò | Động từ | Pha |
|---|---|---|---|---|---|---|---|
| 1 | `door_mr1..3` (cửa kính phòng họp) | amenity (cao 2.2 m) / `door` | 3 | Cửa từng phòng họp (DESIGN_V2 5.5 Z06, "Ba cửa"). Vị trí cần đo | Tất cả. Khóa theo mục 7.9 | `open`, `close`, `view` (biển trạng thái) | 1 |
| 2 | `lift_btn_1..3` (nút gọi tầng) | amenity (nhỏ, cao 1.1 m) / `press` | 3 | Sát cabin `core_lift1..3` | Tất cả | `press` | 4 |
| 3 | `window_<hướng>_<n>` (cửa sổ) | amenity / `window` | Cần đo | Tường ngoài. Chưa có trong bản vẽ hay DESIGN_V2 | Tất cả | `open`, `close` | 4 |
| 4 | `light_switch_<khu>` (công tắc đèn) | amenity nhỏ / `toggle` | 1 mỗi khu: lounge, north, squad_nam, squad_tay, pantry, mr | Cạnh lối đi chính của khu | Tất cả | `toggle` (cục bộ) | 4 |
| 5 | `sofa_lounge_1..2` (ghế sofa, 2.2 × 0.95 × 0.85 m) | amenity / `sit` | 2 | Lounge (DESIGN_V2 5.5 Z05) | Tất cả | `sit` | 2 |
| 6 | `armchair_lounge_1..4` (ghế bành, 0.85 × 0.85 × 0.9 m) | amenity / `sit` | 4 | Lounge (DESIGN_V2 5.5 Z05) | Tất cả | `sit` | 2 |
| 7 | `pantry_table_1..2` và `pantry_chair_*` (bàn ăn, 3 ghế mỗi bàn) | amenity / `sit` | 2 bàn, 6 ghế | Pantry (DESIGN_V2 5.5 Z07) | Tất cả | `sit` | 2 |
| 8 | `coffee_stool_1..2` (ghế cao) | amenity / `sit` | 2 | Coffee corner (DESIGN_V2 5.5 Z07) | Tất cả | `sit` | 2 |
| 9 | `bin_<khu>` (thùng rác) | amenity nhỏ / `drop` | 3: pantry, lounge, util_coffee | Cạnh bàn pha và cạnh sofa | Tất cả | `drop` | 2 |
| 10 | `coffee_machine_1..2` (máy pha cà phê, 0.4 × 0.4 × 0.45 m) | amenity / `brew` | 2 | Pantry và coffee corner (DESIGN_V2 5.5 Z07) | Tất cả | `brew`, `inspect` | 1 / 2 |
| 11 | `water_cooler_pantry` (bình nước) | amenity / `fill` | 1 | Pantry. Đề xuất mới, DESIGN_V2 chưa có | Tất cả | `fill` | 2 |
| 12 | `printer_util_print` (máy in A3, 0.6 × 0.6 × 1.0 m) | amenity / `print` | 1 | `util_print` (DESIGN_V2 5.5 Z07) | Tất cả | `print`, `inspect` | 4 |
| 13 | `plant_<khu>_<n>` (cây, chậu cao 0.6–1.8 m) | amenity / `plant` | Khoảng 23: sảnh 2, mỗi cụm squad 1 (10), Z04 2, lounge 9 | DESIGN_V2 5.5 Z01–Z05 | Tất cả | `water`, `catch`, `pluck`, `prune`, `fertilize`, `inspect` | 4 |
| 14 | `tv_lounge` (tivi lounge, 1.45 × 0.83 m) | screen / `tv` | 1 | Lounge (DESIGN_V2 5.5 Z05, "TV karaoke") | Tất cả | `switch_channel`, `power` | 4 |
| 15 | `tv_mr1..3` (TV phòng họp, 65–75 inch) | screen / `tv` | 3 | Trong `mr1`, `mr2`, `mr3` (DESIGN_V2 5.5 Z06) | Người đặt phòng, it, admin (đổi kênh). Ai trong phòng: chỉ xem | `switch_channel`, `power` | 4 |
| 16 | `drawing_board_lounge` (bảng vẽ) | board / `draw` | 1 | Lounge, tường gần khu karaoke (vị trí đề xuất, cần đo) | Tất cả | `draw`, `erase`, `clear` (it, admin) | 4 |
| 17 | `whiteboard_mr1..3` (bảng trắng) | board / `draw` | 3 | Trong `mr1`, `mr2`, `mr3` (DESIGN_V2 5.5 Z06) | Người đặt phòng và người đang trong phòng. `clear`: người đặt phòng | `draw`, `erase`, `clear` | 4 |
| 18 | `chess_table_1..2` (bàn cờ: vua, tướng, caro, kích thước 0.9 × 0.9 m) | amenity / `play` | 2 | Lounge, cạnh `games_corner` (DESIGN_V2 5.5 Z05) | Tất cả | `play` (caro P1 qua `games`; cờ vua, cờ tướng P4) | 1 / 4 |
| 19 | `mic_karaoke_1..2` (micro, 0.05 × 0.2 m) | amenity nhỏ / `pick` | 2 | Trong `karaoke_room` (DESIGN_V2 5.5 Z05) | Tất cả | `pick`, `drop` | 1 |
| 20 | `vending_lounge` (máy bán hàng, miễn phí) | amenity / `vend` | 1 | Lounge, gần pantry. Vị trí cần đo | Tất cả | `vend` | 4 |
| 21 | `stationery_shelf_util_print` (kệ văn phòng phẩm, 1.8 m) | amenity / `borrow` | 1 | Trong `util_print` (DESIGN_V2 5.5 Z07) | Tất cả | `borrow`, `return` | 4 |
| 22 | `filing_cabinet_<khu>_<n>`, n = 1 hoặc 2 (tủ tài liệu, 0.8 × 0.45 × 1.8 m) | amenity / `borrow` | 2 mỗi cụm squad, 20 tổng | Mỗi cụm squad (DESIGN_V2 5.5 Z02, Z03) | Tất cả | `borrow`, `return`, `open` (chỉ xem, không có hồ sơ) | 4 |
| 23 | `tool_cabinet_lounge` (tủ dụng cụ cây: `watering_can`, `fertilizer`, `pruning_shears`) | amenity / `pick` | 1 | Lounge, cạnh cụm cây. Vị trí cần đo | Tất cả | `pick` | 4 |
| 24 | `bookshelf_north_1..2` (tủ sách, 2 × 0.4 × 2.0 m) | amenity / `browse` | 2 | Khu Bắc (DESIGN_V2 5.5 Z04) | Tất cả | `browse`, `inspect` | 4 |
| 25 | `painting_lounge_1..4` (tranh tự tạo, 1.0 × 0.7 m) | amenity mỏng, treo tường / `straighten` | 4 | Lounge (DESIGN_V2 5.5 Z05) | Tất cả | `inspect`, `straighten` | 4 |
| 26 | `rug_entrance`, `rug_lounge_1..2`, `rug_squad_<khu>` (thảm) | amenity cao 0.01 m, không đặc / không có action | 1 + 2 + 10 | Sảnh, lounge, cụm squad | Tất cả | `inspect`; `sit` ở `rug_lounge_*` | 4 |
| 27 | `seat_<deskId>_r<hàng>_c<cột>` (ghế hot-desk) | Sinh từ khối bàn, không đặt riêng / `sit` | 219 vị trí lưới hiện tại (mục 3.4) | Trong khối bàn | Nhân viên, it, admin | `sit`, `stand`, `view` | 1 / 2 |

Ghi chú:
- Tủ dụng cụ cây (`tool_cabinet_lounge`) cấp ba loại đồ mượn: bình tưới (`watering_can`), phân bón (`fertilizer`), kéo tỉa (`pruning_shears`). Tất cả là tay cầm (mục 1.3).
- Tủ tài liệu chỉ chứa văn phòng phẩm mượn, không có hồ sơ thật. Panel ghi rõ điều này.
- Ghế hot-desk không phải `ZoneObject` riêng trong `it.json`. Nó được sinh từ khối bàn bằng `deskSeats()`, nên id ghế theo mục 3.4.

## 5. Tương tác người với người

### 5.1 Bảng quy tắc

| Tương tác | Người nhận có được hỏi? | Ghi lịch sử | Hồi chiêu | Giới hạn và an toàn | Pha |
|---|---|---|---|---|---|
| `wave` | Không. Người nhận có thể tắt "nhận tương tác nhẹ" (mặc định bật) | Không | 5 s cùng người, 3 s toàn cục | Tối đa 10 lần mỗi phút. Không có nội dung | 2 |
| `thumbs_up` | Không (tắt được như `wave`) | Có, tối thiểu: sự kiện, không nội dung | 60 s cùng người | Tối đa 10 lần mỗi ngày từ một người gửi | 2 |
| `high_five` | Có, chờ 20 s | Có: đồng ý, từ chối, hết hạn | 60 s cùng cặp | Cả hai trong 1.5 m. Không ép: im lặng là hết hạn | 2 |
| `toast` | Có, chờ 20 s | Có | 60 s cùng cặp | Người gửi phải đang cầm ly (cà phê hoặc nước). Hệ thống không có đồ uống có cồn | 2 |
| `gift_flower` | Có, chờ 20 s | Có | 1 lần mỗi người nhận mỗi ngày | Tối đa 3 hoa mỗi ngày từ một người gửi. Người nhận tối đa 5 hoa mỗi ngày từ mọi người. Hoa không có giá trị | 4 |
| `sticker` | Không cần đồng ý để nhận. Người nhận có thể "Ẩn" hoặc "Không nhận từ người này" | Có | 1 sticker cùng cặp mỗi ngày | Tối đa 3 sticker mỗi ngày từ một người gửi. Danh sách cố định, không chữ tự do. Không đăng lên bảng vinh danh | 2 |
| `invite_play` | Có, chờ 60 s | Có | 2 phút cùng cặp | Người nhận đang chơi trò khác thì tự từ chối, không báo lý do | 2 |
| `invite_sing` | Có, chờ 60 s | Có | 5 phút cùng cặp | Phòng tối đa 6 người | 2 |
| `invite_sit` | Có, chờ 30 s | Có | 2 phút cùng cặp | Chỉ mời khi người gửi đang ngồi gần đó. Ghế được giữ tối đa 30 s | 2 |
| `remind` | Không, nhưng người nhận có thể "Tắt nhắc từ người này" hoặc bật "Đang tập trung" | Có: chỉ đếm và băm, không nội dung | 1 nhắc cùng cặp mỗi ngày | Tối đa 3 nhắc mỗi ngày từ một người gửi. Sau hai nhắc liên tiếp bị bỏ qua, người gửi bị khóa nhắc người này 24 giờ. Nội dung tối đa 80 ký tự, lọc từ khóa, không liên kết, không @ | 2 |

### 5.2 Quy tắc chung an toàn và lịch sự

1. **Đồng ý theo loại.** Mỗi loại có ba mức: `Cho phép`, `Hỏi` (mặc định với loại có đồng ý), `Tắt`. Loại không cần đồng ý (`wave`, `thumbs_up`, `remind`) có nút "Tắt" và "Tắt tất cả".
2. **Không ép.** Từ chối hoặc im lặng đều hiện với người gửi là `expired` hoặc `not_delivered`. Không có thông báo công khai "bị từ chối", không đếm số lần từ chối.
3. **Không xếp hạng người.** Không có bảng xếp hạng số lượt vẫy, thích hay tặng. Không có huy hiệu theo số lượt tương tác. Tránh áp lực và so sánh cá nhân.
4. **Đang tập trung.** Tắt mọi yêu cầu và nhắc. Trạng thái hiển thị "Đang tập trung" (chấm màu cộng biểu tượng, DESIGN_V2 1.5). Vẫy tay vẫn thấy nhưng không có bong bóng.
5. **Chặn.** Người nhận chặn người gửi thì mọi yêu cầu của người đó trả `not_delivered`. Người gửi không biết mình bị chặn. Chặn có hiệu lực ngay qua SSE.
6. **Báo cáo.** Mọi thông báo người với người có nút "Báo cáo". Báo cáo lưu nội dung liên quan vào bảng `reports` để IT xử lý. Nội dung xóa 30 ngày sau khi đóng báo cáo. Audit chỉ ghi băm.
7. **Nội dung.** Chữ tự do chỉ có ở `praise` (140 ký tự) và `remind` (80 ký tự). Các loại khác dùng danh sách cố định. Cả hai lọc theo danh sách từ cấm. Cấm: liên kết, tệp đính kèm, @, số điện thoại, email, nội dung về lương, đánh giá hiệu suất, kỷ luật, sức khỏe, gia đình.
8. **Tên hiển thị.** Mọi tương tác chỉ dùng tên hiển thị. Tên đầy đủ chỉ hiện trong panel hồ sơ, và chỉ với người đã đồng ý (DESIGN_V2 5.7).
9. **Phạm vi.** Chỉ người cùng tenant và đã onboard. Presence chỉ gửi cho người trong vùng đã đăng ký (mục 9.4).
10. **Lịch sử của chính mình.** Người dùng xem được lịch sử của mình qua `GET /api/world/me/log`: loại, thời gian, kết quả. Không có nội dung.
11. **Hồi chiêu là chống spam, không phải phần thưởng.** Kết quả tốt không làm giảm hồi chiêu. Kết quả xấu không làm tăng hồi chiêu.

---

## 6. Tương tác người với động vật

Phạm vi: sáu động từ (`pet`, `feed`, `play`, `give_water`, `photo`, `call_back`). Trạng thái, độ đói, độ khát, độ thân thiện, vị trí và tên động vật do `docs/design/ANIMALS.md` định nghĩa. Mục này chỉ nêu điểm nối với tương tác. Tên biến trong bảng dưới là tên tạm, đổi theo ANIMALS.md.

| Động từ | Đích | Điều kiện | Hiệu ứng (theo ANIMALS.md khi có) | Ghi lịch sử | Pha |
|---|---|---|---|---|---|
| `pet` (vuốt ve) | Động vật trong 1.5 m | Hồi chiêu 10 s cùng động vật. Động vật không ở trạng thái "bận" | Tăng độ thân thiện, hoạt ảnh | Không | 3 |
| `feed` (cho ăn) | Động vật trong 1.5 m | Đang cầm `food`. Không cho ăn khi độ no vượt ngưỡng | Giảm đói. Giới hạn số lần mỗi giờ | Có: không ghi số lượng | 3 |
| `play` (chơi bóng) | Động vật trong 3 m | Đang cầm `ball` hoặc bóng có sẵn trong khu. Hồi chiêu 30 s | Động vật đuổi bóng và mang về | Không | 3 |
| `give_water` (đưa nước) | Động vật trong 1.5 m | Đang cầm `water_cup` | Giảm khát | Không | 3 |
| `photo` (chụp ảnh) | Động vật trong 3 m | Hồi chiêu 5 s | Ảnh chỉ lưu trên máy người chụp, không gửi máy chủ | Không | 3 |
| `call_back` (gọi về chỗ) | Động vật trong khu của mình | Không gọi vào `server_room` hay `soc_room` | Động vật về chỗ quy định | Không | 3 |

Quy tắc:
- Động vật không đồng ý được, nên không có bước hỏi. Thay vào đó có hai giới hạn: tần suất mỗi người với mỗi động vật, và tổng tác động lên một động vật (chống làm động vật quá tải).
- Trạng thái động vật lưu ở `world` (bảng `animal_state`). Vị trí và trạng thái động vật đi trên sự kiện `animal.changed` của SSE, không gộp vào presence của người (theo nguyên tắc kênh riêng ở AVATAR_SPEC 7.3 bước 5).
- Động vật không vào khu hạn chế (`server_room`, `soc_room`).
- Không gắn tên người thật cho động vật.
- Lịch sử chỉ ghi động từ và kết quả. Không ghi số lượng đồ ăn, nước.
- `play` dùng chung ID với trò chơi (mục 2.1, dòng 22). Phân biệt theo loại đích: `object` là trò chơi, `animal` là bóng.

---

## 7. Vật thể đặc biệt

Mỗi mục dưới đây nêu quy tắc riêng. Dữ liệu chung đi theo mục 1 và 9.

### 7.1 Tivi (`tv_lounge`, `tv_mr1..3`)

Kênh của tivi lounge (chung cho mọi người):

| Kênh | Nội dung | Nguồn | Ghi chú |
|---|---|---|---|
| `chao` | Lịch hôm nay, số chỗ trống theo khu. Không có tên người | `display` | Kênh mặc định |
| `su_kien` | Sự kiện đang mở, kết quả gần nhất | `events` | Không có nút bình chọn trên TV |
| `vinh_danh` | 5 lời vinh danh mới nhất, không email | `it` | Hiển thị tên hiển thị |
| `karaoke` | Lời bài do nhóm soạn khi có người hát | `karaoke` (P4) | Không hiện lời có bản quyền (DESIGN_V2 4.3) |
| `noc` | Tóm tắt trạng thái dịch vụ, theo màu | `display`, lấy từ `it` | Không IP, không tên máy, không log |
| `tat` | Màn tắt | Không | Tương đương `power` tắt |

Kênh của tivi phòng họp: `lich_hop` (lịch đặt của phòng) và `trong` (màn đen). Không có nối máy tính trong MVP.

Quy tắc:
- Tivi lounge: mọi nhân viên đổi kênh. Trạng thái chung (`object_state`). Hồi chiêu 5 s toàn TV để tránh giật.
- Tivi phòng họp: người đặt phòng đang hoạt động đổi kênh. it và admin đổi được. Người khác chỉ xem.
- Kênh lấy nội dung từ `display` (cổng 3006 đề xuất). Nếu `display` chưa có, tivi chỉ có kênh `chao` tĩnh và `tat`.

### 7.2 Bảng vẽ và bảng trắng (`drawing_board_lounge`, `whiteboard_mr1..3`)

- Dữ liệu: nét vẽ `{id, boardId, authorId, color, width, points[]}`. `points` là tọa độ chuẩn hóa 0 đến 1, tối đa 200 điểm mỗi nét. Không có chữ, không tải ảnh lên (giảm rủi ro nội dung và bản quyền).
- Bảng màu cố định 8 màu lấy từ palette DESIGN_V2 mục 1.3. Hai cỡ nét.
- Giới hạn: 300 nét mỗi bảng; 30 nét mỗi phút mỗi người; ghi theo lô mỗi 0.5 s.
- `erase`: người viết xóa nét của mình. it và admin xóa nét bất kỳ (kiểm duyệt). `clear`: người đặt phòng xóa toàn bộ bảng trắng; it và admin xóa cả hai loại bảng. Xóa là xóa mềm (`deleted_at`), purge sau 30 ngày.
- Bảng trắng: hết giờ đặt phòng thì mọi nét bị xóa mềm tự động.
- Bảng vẽ lounge: lưu lâu dài, không tự xóa.
- Nét vẽ hiển thị cho mọi người online trong zone. Không có SFX riêng.

### 7.3 Cây (`plant_*`, dịch vụ `plants`)

- Trạng thái mỗi cây: `water` (0–100), `health` (0–100), `pests` (0–3), `flowers` (0–3), `deadLeaves` (0–5), `lastWateredAt`, `fertilizedDay`, `lastPluckAt`, `lastPruneAt`.
- Tính trên máy chủ, không tính trên trình duyệt:
  - Độ ẩm giảm 1 điểm mỗi 30 phút.
  - Sức khỏe giảm khi độ ẩm dưới 20, hoặc khi có quá 2 con sâu trong 24 giờ.
  - Lá khô tăng 1 mỗi ngày nếu không chăm, tối đa 5.
  - Hoa mở tối đa 3. Cây sức khỏe trên 60 mới có thể mở thêm một hoa mỗi 2 giờ. Các con số này là ước lượng, cần cân chỉnh khi chạy thử.
- Sâu: tối đa 1 con mới mỗi ngày mỗi cây, sinh theo seed `hash(plantId, day_vn)`. Không ngẫu nhiên theo lần tải trang, để mọi người thấy cùng kết quả.
- `water`: cần `watering_can`, tối đa 1 lần mỗi 30 phút mỗi cây.
- `fertilize`: tối đa 1 lần mỗi ngày mỗi cây, cần `fertilizer`.
- `prune`: cần `pruning_shears`, tối đa 1 lần mỗi 60 phút mỗi cây.
- `catch`: mỗi lần bắt một con.
- `pluck`: lấy một hoa, đặt `carry: flower` 10 phút. Tặng hoa là `gift_flower` (mục 2.2).
- Cây không có tiền, không có điểm thưởng, không có bảng xếp hạng người chăm cây (mục 5.2, quy tắc 3).
- Cập nhật: client gọi `GET /api/plants/state` mỗi 30 s cho vùng nhìn thấy. Không cần SSE riêng.
- Chạm cây đã thay đổi (hết sâu, hết hoa) trả `state_conflict` và tải lại trạng thái.

### 7.4 Bàn cờ (`chess_table_1..2`, `games_corner`)

- Caro: dùng `games` (rooms và move). Bàn cờ là điểm vào. Hai người chơi một ván. MVP không có người xem.
- Phòng chờ: tối đa 3 phòng chờ mỗi người. Phòng chờ quá 30 phút tự đóng (`services/games/README.md`, DECISIONS 7).
- Bỏ cuộc giữa trận: bên còn lại thắng nhưng không cộng điểm (DECISIONS 6).
- Đố vui: đáp án không hiện khi đang làm bài. Trả lời một câu chỉ nhận về "đã ghi nhận". Đáp án và điểm hiện khi kết thúc ván (DECISIONS 2).
- Cờ vua (P4): dùng `chess.js` (BSD-2-Clause, RESEARCH_SERVICES 3.1). Luật chạy trên máy chủ. Nước đi qua `games`, client không giữ FEN.
- Cờ tướng: chưa xác minh giấy phép của engine, không nằm trong kế hoạch này.
- Ván cờ không có tiền cược và không có vật phẩm đổi được.

### 7.5 Karaoke (`karaoke_room`, `mic_karaoke_*`)

- Chỉ bài đã duyệt bản quyền (`license_status` approved, RESEARCH_SERVICES 1.1) mới hiện trong danh sách. API trả 403 nếu chưa duyệt.
- Lời hiển thị chỉ là bài do nhóm soạn (DESIGN_V2 4.3). Không nhập lời từ LRCLIB, Musixmatch hay Genius (RESEARCH_SERVICES 3.6).
- Điểm chấm trong trình duyệt bằng `pitchy` (RESEARCH_SERVICES 3.2). Lượt hát ngắn hơn 50% thời lượng bài bị gắn `suspicious`. Không từ chối lượt, chỉ không đưa vào bảng xếp hạng (DECISIONS 3).
- Micro: `pick` cần quyền micro của trình duyệt. Trang chạy trên `127.0.0.1` qua SSH tunnel hoặc HTTPS. Nếu không có quyền, báo "Cần quyền micro để chấm điểm" và vẫn cho hát không chấm điểm.
- Sức chứa 6 người trong phòng (presence). `sing`: hát một mình (P1). `invite_sing`: mời hát (P2).
- Song ca (nhiều micro cùng hát) cần WebRTC và UDP. Nằm sau MVP (RESEARCH_SERVICES 1 và 3.3), không trong kế hoạch này.
- Hàng đợi (`POST /api/karaoke/queue`) chỉ có trong đề xuất RESEARCH_SERVICES 5.2. Code hiện chưa có. Mọi nhắc đến hàng đợi là từ Pha 4 trở đi, khi dịch vụ đã có.

### 7.6 Tủ tài liệu và kệ văn phòng phẩm (`filing_cabinet_*`, `stationery_shelf_util_print`)

- Vật phẩm mượn: bút bi, bút dạ, sổ tay, giấy ghi chú. Không có giá.
- Tồn kho theo từng tủ hoặc kệ. Mặc định mỗi tủ: bút bi 10, bút dạ 5, sổ tay 5, giấy ghi chú 10. Đặt lại mỗi ngày lúc 07:00 UTC+7 (đề xuất, mục 11).
- Giới hạn: tối đa 2 món cầm cùng lúc. Trả ở bất kỳ tủ nào.
- Ghi: `world` giảm tồn kho và đặt `carry`. Không có tiền. Audit tối thiểu.
- Tủ chỉ chứa văn phòng phẩm. Panel không có chữ "giá", "mua", "phí", "thanh toán".

### 7.7 Máy pha cà phê và bình nước (`coffee_machine_*`, `water_cooler_pantry`, `bin_*`)

- Máy pha: không tính tiền, không có giá, không có thẻ. Hiệu ứng: 12 hạt hơi nước, pha 8 s, SFX "Hơi máy pha" (DESIGN_V2 1.4 và 4.4).
- Giới hạn: tối đa 1 ly mỗi 10 phút mỗi người. Mỗi máy bận 8 s. Không giới hạn tổng số ly.
- Ly cà phê và ly nước: cầm 10 phút. Thả ở `bin_*` (`drop`) hoặc tự rơi sau 10 phút.
- `toast` cần đang cầm `coffee` hoặc `water_cup`.
- Bình nước: rót nước (`fill`), hồi chiêu 5 s. Không giới hạn tổng.
- Log: ghi `brew` và `fill` ở mức tối thiểu để kiểm tra lạm dụng. Không có bảng thống kê cá nhân.

### 7.8 Máy in (`printer_util_print`)

- Chỉ hiệu ứng. Không nhận tệp, không nhận nội dung từ người dùng, không gửi gì ra mạng.
- Hiệu ứng: đèn máy nháy, một tờ mẫu cố định ra khay trong 5 s, SFX gõ phím lặp 4 lần.
- Hồi chiêu 3 s mỗi người, 1 s toàn máy.
- Panel nói rõ: "Đây là máy in mô phỏng. Không in tài liệu thật."
- Không có audit (`audit: none`).

### 7.9 Cửa phòng họp (`door_mr1..3`, `mr1..3`)

- Trạng thái khóa suy ra từ lịch đặt của `it`. Cửa khóa từ `start` trừ 5 phút đến `end`. Hết giờ thì khóa tự mở.
- Ai mở:
  - Người đặt phòng: `open`, `close`.
  - Người đặt phòng có thể "Mở cho khách": cửa tạm không khóa đến khi họ đóng. Khóa tự khôi phục lúc hết giờ.
  - it, admin: override, có lý do bắt buộc, ghi audit (băm).
  - Người khác: `forbidden`, thông báo "Phòng đang họp".
- Biển trạng thái: "Đang họp" kèm giờ, hoặc "Trống". Tiêu đề lịch không hiện ra ngoài mặc định. Người đặt phòng có thể bật "Hiện tiêu đề" (mặc định tắt) vì tiêu đề có thể chứa thông tin nhạy cảm.
- Va chạm: khi khóa, cửa là vật đặc. Khi mở, không chặn. Hiện `isSolidObject` trong `src/scene/layout.ts` chỉ nhìn kích thước, nên phải đổi để nhận trạng thái trước khi bật tính năng (mục 12).
- Nguồn: `GET /api/rooms` của `it`. Client đọc lại mỗi 30 s. Không cần SSE.

### 7.10 Thang máy (`core_lift1..3`, `lift_btn_1..3`)

- MVP chỉ có một tầng. Nút gọi tầng chỉ có nút tầng hiện tại. Bấm thì nút sáng, cửa cabin mở 1.5 s (hình, không trạng thái). Thông báo: "Bạn đang ở tầng này".
- Không gửi máy chủ, không có trạng thái chia sẻ.
- Khi có nhiều tầng (sau MVP): trạng thái gọi thang là `object_state` (`lift:<id>.floor`, `door`). Cần xem lại mục này.
- SFX "Cửa thang": mặc định tắt (DESIGN_V2 4.4 ghi là tùy chọn).

### 7.11 Đèn và công tắc (`light_switch_*`)

- Hoàn toàn cục bộ. Không gửi máy chủ, không lưu. Bật hoặc tắt chỉ ảnh hưởng ánh sáng của khu đó trên máy người bấm (rig S1, DESIGN_V2 3.3).
- Rời khu hoặc tải lại trang thì đèn về mặc định của khu. Không ảnh hưởng người khác, không ghi đè trạng thái chung.
- Đèn ở lối đi chính không được tắt hết. Giữ mức tối thiểu để không tối đen. Mức cụ thể theo DESIGN_V2 3.3 và kiểm tra thị giác mục 8.2.
- Đèn bàn "tan ca" (DESIGN_V2 1.4) là tự động, không do công tắc điều khiển.
- Khi bật "giảm chuyển động" (DESIGN_V2 8.3), công tắc vẫn chạy. Chỉ bỏ hiệu ứng mờ dần.

### 7.12 Máy bán hàng (`vending_lounge`)

- Không tiền, không giá, không thẻ thanh toán, không liên kết tới trang mua hàng.
- Loại món chưa chốt. Mặc định: văn phòng phẩm và đồ uống không đóng gói thương hiệu (mục 11).
- Giới hạn: 1 món mỗi 2 giờ mỗi người. Tồn kho đặt lại mỗi ngày.
- Panel ghi: "Miễn phí. Chỉ một món mỗi 2 giờ."
- Đây là vật thể tương tác trang trí, không phải thương mại.

---

## 8. Quy tắc chung

- **Không có tiền thật.** Không có trường tiền trong mọi bảng. Không có thanh toán. Vật phẩm (món, hoa, sticker, lượt) không quy đổi được, không đổi quà, không voucher, không mã giảm giá (RESEARCH_SERVICES 1.1).
- **Không cờ bạc.** Không đặt cược, không vòng quay, không hộp quà ngẫu nhiên, không phần thưởng ngẫu nhiên có giá trị. Trò chơi là kỹ năng hoặc đố vui. Ngẫu nhiên chỉ dùng cho hiệu ứng không có giá trị (sâu cây, hạt bụi).
- **Nội dung phù hợp ngân hàng.** Không ảnh, không chữ tự do ngoài mục 5.2, không âm thanh có bản quyền, không biểu tượng thương hiệu bên thứ ba. Biểu tượng vẽ tay (DESIGN_V2 1.5).
- **Tên người.** Chỉ tên hiển thị. Không email, số điện thoại, mã nhân viên trong giao diện tương tác.
- **Audit tối thiểu.** Bảng `interaction_log` chỉ có các cột: `ts`, `day_vn`, `verb`, `actor_id`, `target_type`, `target_id`, `outcome`, `payload_hash`. Không có cột nội dung. Nét vẽ và nội dung nhắc nằm ở bảng riêng (có xóa mềm hoặc hạn 24 giờ). Giữ 90 ngày, sau đó xóa.
- **Báo cáo xem log ở mức tổng hợp.** Không có màn hình xem lịch sử tương tác của người khác.
- **Nội dung nhạy cảm.** Sức khỏe, gia đình, tôn giáo không hiện trong tương tác. Bộ lọc `praise`, `remind`, nét vẽ áp dụng cùng danh sách.
- **Hiệu ứng nhạy cảm.** "Giảm chuyển động" (DESIGN_V2 8.3) tắt pháo giấy, hạt bụi và hoạt ảnh lớn. Không tắt phản hồi bằng chữ.
- **Ngôn ngữ.** Tiếng Việt có dấu cho tên vật thể, nút, thông báo.

## 9. Kiến trúc: dịch vụ world và dữ liệu

### 9.1 Lựa chọn

| Phương án | Ưu điểm | Nhược điểm | Kết luận |
|---|---|---|---|
| A. Mở rộng `display` (3006) thành dịch vụ chung | Ít dịch vụ hơn. Đã có SSE theo thiết kế | `display` là nội dung màn hình. Gộp presence và trạng thái vật thể làm nó nặng và trộn trách nhiệm. Nội dung và trạng thái đổi với tốc độ khác nhau | Không chọn |
| B. Dịch vụ mới `world` cổng 3008 | Tách rõ presence, trạng thái vật thể dùng chung, yêu cầu người với người, log. SSE riêng. Khớp kênh presence riêng ở AVATAR_SPEC 7.3 | Thêm một container và một location trong gateway | **Chọn (mặc định)** |
| C. Dùng `it` cho tất cả | Có sẵn DB và audit | `it` đã gánh NOC, SOC, ticket, phòng, kudos. ARCHITECTURE, nguyên tắc 1: mỗi module một container. Mở rộng `it` tăng rủi ro phạm vi IT | Không chọn |

Không dùng Socket.IO hay Colyseus giai đoạn này. SSE một chiều từ máy chủ đến client là đủ, client gửi yêu cầu bằng `POST`. Có thể thêm Socket.IO sau nếu cần hai chiều liên tục (RESEARCH_SERVICES 3.1).

### 9.2 Bảng dữ liệu (`world.db`)

Cùng mô hình SQLite WAL với `auth`, `it`, `games`, `karaoke`, `events`. Đường dẫn `DATA_DIR=/data`, volume riêng `world-data`, chỉ lắng nghe `127.0.0.1:3008`.

| Bảng | Nội dung | Ghi khi | Giữ bao lâu |
|---|---|---|---|
| `presence` | `user_id`, `zone`, `x`, `z`, `facing`, `pose`, `status`, `carry`, `seat_id`, `updated_at` | Heartbeat mỗi 10 s | 60 s không heartbeat thì xóa |
| `object_state` | `object_id`, `state_json`, `version`, `updated_at`, `updated_by` | Khi tương tác có ghi | Đến khi vật thể bị gỡ khỏi dữ liệu |
| `strokes` | `id`, `board_id`, `author_id`, `color`, `width`, `points_json`, `created_at`, `deleted_at` | Khi `draw` | Xóa mềm, purge sau 30 ngày |
| `carry` | `user_id`, `item`, `expires_at` | `brew`, `fill`, `pluck`, `borrow`, `vend`, `pick` | Tự hết hạn sau 10 phút |
| `requests` | `id`, `verb`, `from_id`, `to_id`, `payload_json`, `status`, `created_at`, `expires_at`, `responded_at` | Người với người | `payload_json` xóa sau 24 giờ, chỉ còn băm |
| `prefs` | `user_id`, `verb_group`, `mode` | Khi người dùng đổi | Đến khi đổi lại |
| `mutes` | `user_id`, `muted_id`, `created_at` | Khi chặn | Đến khi bỏ chặn |
| `reminder_limits` | `day_vn`, `sender_id`, `recipient_id`, `count`, `ignored_streak`, `locked_until` | Khi `remind` | 7 ngày |
| `interaction_log` | Các cột ở mục 8 | Mọi tương tác có audit | 90 ngày |
| `animal_state` | Theo ANIMALS.md | Pha 3 | Theo ANIMALS.md |
| `reports` | `id`, `reporter_id`, `ref_type`, `ref_id`, `content`, `reason`, `created_at`, `status`, `closed_at` | Khi báo cáo | Xóa 30 ngày sau khi đóng |

### 9.3 Endpoint đề xuất

Tiền tố `/api/world`. Mọi endpoint cần `sid` phạm vi `full`, trạng thái đã onboard, và chặn `Sec-Fetch-Site: cross-site` với `POST`, `PUT`, `DELETE`.

| Method | Đường dẫn | Body | Trả về | Ai dùng |
|---|---|---|---|---|
| POST | `/presence` | `{zone, x, z, facing, pose, status}` | 204 | Mọi người, mỗi 10 s |
| GET | `/presence?zones=a,b` | | `[{userId, displayName, avatarRef, zone, x, z, facing, pose, status, carry, seatId}]`. Tối đa 40 mỗi zone. Không trả người ở trạng thái ẩn | Mọi người |
| POST | `/carry` | `{item}` hoặc `{item: null}` | 200 | Người gọi |
| GET | `/objects?ids=` | | `[{id, state, version}]` | Mọi người |
| POST | `/objects/:id/actions` | `{verb, payload, expectedVersion}` | 200 `{state, version}`, hoặc 409 `state_conflict` | Theo động từ |
| POST | `/strokes` | `{boardId, color, width, points}` | 201 `{id}` | Người có quyền vẽ |
| DELETE | `/strokes/:id` | | 204 | Chủ nét, hoặc it, admin |
| GET | `/boards/:id/strokes` | | `[...]` | Mọi người trong zone |
| POST | `/requests` | `{verb, toUserId, payload}` | 201 `{id, expiresAt}` | Người gửi |
| POST | `/requests/:id/respond` | `{accept}` | 200 | Người nhận |
| GET | `/requests/inbox` | | Yêu cầu đang chờ của tôi | Người nhận |
| PUT | `/prefs` | `{verbGroup, mode}` | 200 | Người dùng |
| POST | `/mutes` | `{userId}` | 201 | Người dùng |
| DELETE | `/mutes/:userId` | | 204 | Người dùng |
| POST | `/reports` | `{refType, refId, reason}` | 201 | Người dùng |
| GET | `/me/log?limit=` | | `[{ts, verb, outcome}]`, không có nội dung | Người dùng |
| GET | `/stream?zones=` | | SSE (mục 9.4) | Mọi người |

Cây dùng dịch vụ `plants` (3007, đề xuất): `GET /api/plants/state`, `POST /api/plants/:id/water`, `/catch`, `/pluck`, `/prune`, `/fertilize`. Không đi qua `world`.

### 9.4 Luồng sự kiện SSE

- `GET /api/world/stream?zones=<z1,z2>`, xác thực bằng cookie `sid` qua gateway cùng origin. Trình duyệt không gửi được header tùy ý trong `EventSource`, nên dùng cookie.
- Mỗi tab một kết nối, mỗi người tối đa 2 tab.
- Khi kết nối, máy chủ gửi snapshot: presence của các zone đã đăng ký và `object_state` của vật thể trong các zone đó. Sau đó chỉ gửi phần thay đổi.
- Sự kiện:
  - `presence.delta`: thay đổi presence trong zone.
  - `object.changed`: `{id, version}`. Client tải chi tiết nếu `version` cao hơn bản đang có.
  - `request.new`: chỉ gửi cho người nhận.
  - `request.updated`: gửi cho cả hai bên.
  - `stroke.added`, `stroke.removed`: theo bảng vẽ.
  - `animal.changed`: Pha 3.
  - `heartbeat`: mỗi 25 s.
- Mỗi sự kiện có `id` tăng dần. `Last-Event-ID` để tiếp tục. Nếu khoảng trống lớn hơn 200 sự kiện, máy chủ gửi lại snapshot.
- Quyền: client chỉ nhận presence và trạng thái của zone đã đăng ký. Yêu cầu chỉ gửi cho người trong cuộc.
- Mỗi sự kiện tối đa 1 KB.

### 9.5 Thay đổi gateway (kế hoạch, chưa làm)

Không sửa `deploy/nginx/gateway.conf` trong tài liệu này. Khi triển khai:

- Thêm `location /api/world` trỏ tới `127.0.0.1:3008`. Không có `/` cuối, cùng quy tắc với `/api/games`, `/api/karaoke`, `/api/events` (ARCHITECTURE, phần gateway). Nếu có `/` cuối, nginx trả 301 và trình duyệt đổi `POST` thành `GET`.
- Riêng `/api/world/stream` cần `proxy_buffering off`, `proxy_cache off`, `proxy_http_version 1.1`, `proxy_read_timeout 3600s` và `Connection ''`. Nếu không có, SSE bị gom lại và không tới trình duyệt đúng lúc.
- Thêm `location /api/plants` (3007) và `location /api/display` (3006) khi các dịch vụ này có.
- Giữ nguyên nguyên tắc chỉ gateway lắng nghe ra ngoài máy chủ (ARCHITECTURE nguyên tắc 4).

### 9.6 Ngân sách và giới hạn tốc độ

| Mục | Giới hạn |
|---|---|
| Heartbeat presence | 1 lần mỗi 10 s, tối đa 6 lần mỗi phút |
| Tương tác vật thể (`/objects/:id/actions`) | 60 lần mỗi phút mỗi người |
| Yêu cầu người với người (`/requests`) | 20 lần mỗi phút mỗi người. Giới hạn riêng từng động từ ở mục 5 |
| Nét vẽ | 30 nét mỗi phút mỗi người. Ghi theo lô mỗi 0.5 s |
| Kết nối SSE | Tối đa 2 mỗi người |
| Payload | 1 KB |
| Presence trong một zone | Tối đa 40 người (ngân sách avatar, AVATAR_SPEC) |
| Dung lượng `world.db` | Chưa ước lượng. Đo khi chạy thử |

---

## 10. Phân pha triển khai

### Pha 1: nền tảng và vật thể có dịch vụ sẵn

Việc:
- Tạo `src/interactions/` (types, verbs, registry, effects, hook). Thay các switch trong `src/ui/Panel.tsx` và `src/env/index.ts` bằng tra cứu registry.
- Đăng ký 39 id của `it.json` (mục 3). Động từ dùng dịch vụ có sẵn: `view`, `praise`, `request`, `book`, `vote`, `register`, `play`, `sing`, `inspect`, `climb`.
- `open` cho cửa phòng họp, khóa theo lịch đọc từ `it`. Không ghi trạng thái.
- `sit`, `stand` chỉ cục bộ, không chia sẻ.
- `brew` chỉ hiệu ứng cục bộ, chưa có tay cầm.
- `pick` micro và `sing` trong `karaoke_room`.
- Phím E, focus, đường bàn phím (DESIGN_V2 1.5).
- Kiểm thử: registry (mỗi id trong `it.json` có ít nhất một dòng, vật thể không khớp thì không có động từ), vai trò (nhân viên không thấy động từ của it, admin), hồi chiêu phía client.

Tiêu chí hoàn thành:
- 39/39 id của `it.json` có mục trong registry (có thể chỉ có `inspect`).
- Không còn switch theo `action` và theo `id` trong `Panel.tsx` và `env/index.ts`.
- `book` từ chối đặt quá 8 giờ và đặt trong quá khứ (khớp `services/it/README.md`).
- Nhân viên thường không mở được panel của `soc_room` và `server_room`. `soc_room` chỉ có tóm tắt cho it, admin.
- Không có yêu cầu mới ra dịch vụ ngoài danh sách mục 1.7. Không ghi thêm dữ liệu cá nhân.
- Không thêm dependency mới.

### Pha 2: người với người (cần `world` và gateway)

Việc:
- Dựng `services/world` (cổng 3008): presence, SSE, tay cầm, yêu cầu, tùy chọn, chặn, log, báo cáo.
- Động từ: `wave`, `thumbs_up`, `high_five`, `toast`, `sticker`, `remind`.
- `invite_play` (tạo phòng caro qua `games`), `invite_sing`, `invite_sit`.
- `sit`, `stand` chia sẻ (occupancy) và `invite_sit`.
- `brew`, `fill`, `drop` với tay cầm. `toast` dùng tay cầm.
- Chế độ "Đang tập trung", chặn, báo cáo.
- Cập nhật gateway theo mục 9.5 trong bước triển khai.

Tiêu chí hoàn thành:
- Hai trình duyệt của hai tài khoản thấy nhau trong 2 s qua SSE, trên mạng nội bộ.
- `wave` không cần đồng ý và bị giới hạn 10 lần mỗi phút. Kiểm thử được.
- Từ chối hoặc im lặng: người gửi thấy `expired` (hoặc `declined` nếu người nhận đã từ chối rõ). Không có thông báo công khai.
- Chặn có hiệu lực ngay. Người bị chặn không nhận lỗi có nội dung.
- Hai người không chiếm cùng một ghế (`state_conflict` đúng).
- SSE không gửi presence ngoài các zone đã đăng ký.
- `interaction_log` không có cột nội dung (kiểm tra bằng schema).
- `remind`: tối đa 1 nhắc mỗi cặp mỗi ngày. Khóa 24 giờ sau 2 lần bỏ qua liên tiếp.

### Pha 3: người với động vật (cần `docs/design/ANIMALS.md`)

Việc:
- Đối chiếu ANIMALS.md, đồng bộ tên động từ, trạng thái và id.
- Bảng `animal_state` và sự kiện `animal.changed`.
- Động từ: `pet`, `feed`, `play` (bóng), `give_water`, `photo`, `call_back`.
- Giới hạn tần suất theo động vật. Không cho vào khu hạn chế.
- Thêm `food`, `ball` vào tay cầm nếu ANIMALS.md cần.

Tiêu chí hoàn thành:
- Động vật phản hồi trong 1 s với hiệu ứng.
- Trạng thái động vật đồng bộ giữa các người chơi.
- Giới hạn tần suất kiểm thử được.
- `photo` không gửi ảnh lên máy chủ.

### Pha 4: vật thể phụ và hiệu ứng

Việc:
- Dịch vụ `plants` (3007): `water`, `catch`, `pluck`, `prune`, `fertilize`, và tủ dụng cụ cây.
- Tivi: `switch_channel`, `power`. `display` (3006) cung cấp nội dung kênh.
- Bảng vẽ và bảng trắng: `draw`, `erase`, `clear`.
- `borrow`, `return`, `vend`, `pick` (dụng cụ), `drop`.
- `print` (hiệu ứng), `browse`, `straighten`, `toggle`, `open`/`close` cho cửa sổ, `press` cho nút thang máy.
- Cờ vua qua `chess.js`.
- Hiệu ứng: pháo giấy kudos, ghim bảng, hơi nước, hạt bụi, vẫy tay khi vào sảnh, cabin thang máy, tranh nghiêng.
- Tắt hiệu ứng lớn khi bật "giảm chuyển động".

Tiêu chí hoàn thành:
- Hiệu ứng nằm trong ngân sách DESIGN_V2 mục 9 cho mức Trung (draw call, tam giác, hạt).
- Giảm chuyển động tắt pháo giấy và hạt, không tắt phản hồi bằng chữ.
- Không có vật thể nào có tiền, giá, hoặc liên kết mua hàng.
- Cây và cửa phòng họp có kiểm thử trạng thái: sâu theo seed ngày, khóa theo lịch đặt.

---

## 11. Quyết định đã chọn (mặc định cho điểm mơ hồ)

Không hỏi lại. Các mặc định dưới đây áp dụng khi triển khai. Thay đổi thì sửa tại đây.

| # | Điểm mơ hồ | Mặc định đã chọn | Lý do và nguồn |
|---|---|---|---|
| 1 | Nơi giữ trạng thái chung | `world` cổng 3008 | Yêu cầu của người dùng. Tách bạch (mục 9.1) |
| 2 | Cổng `display` và `plants` | `display` 3006, `plants` 3007 (đề xuất) | Hai cổng còn trống. Chưa có trong ARCHITECTURE.md |
| 3 | Phím tương tác | E để tương tác với vật thể gần nhất, Enter xác nhận, Esc đóng panel | DESIGN_V2 1.5 chưa quy ước phím tương tác |
| 4 | Ai được tương tác | Người đã onboard (`tour` hoặc `done`) | ONBOARDING_API 1.1 |
| 5 | Khoảng cách | 2.0 m với vật thể. 1.5 m với người và động vật khi chạm, đưa, mời. 10 m với `wave` | Cỡ nhân vật (capsule 0.35 m, AVATAR_SPEC) và cỡ bàn (DESIGN_V2 5.5) |
| 6 | Id ghế | `<deskId>:r<hàng>:c<cột>`. Số chỗ là dữ liệu, không hard-code. Thêm `seats` trước khi đổi | Mục 3.4. Lưới hiện tại cho 219 vị trí |
| 7 | Động từ `play` | Dùng chung cho trò chơi và chơi với bóng, phân biệt theo loại đích | Tránh trùng tên nhưng không tách ID thêm |
| 8 | Cho động vật uống | `give_water`. `water` dành cho cây | Tránh trùng với tưới cây |
| 9 | Làm mới NOC | 30 s, theo `it.json` | DESIGN_V2 Z04 ghi 1 phút. Mục 12 |
| 10 | Nguồn thông báo IT | File nội dung tĩnh trong web, chưa có API | Không có dịch vụ notice. Mục 12 |
| 11 | Endpoint events, karaoke, games | Theo code hiện có, không theo RESEARCH | Mục 1.7 |
| 12 | Log | Không có nội dung, băm nội dung, giữ 90 ngày | Mục 8. Theo `audit_log` của `it` |
| 13 | Nội dung chữ tự do | Chỉ `praise` (140 ký tự) và `remind` (80 ký tự), có lọc từ | Mục 5.2 |
| 14 | Nhắc việc | 1 nhắc mỗi cặp mỗi ngày. 3 nhắc mỗi người gửi mỗi ngày. Khóa 24 giờ sau 2 lần bỏ qua | Chống làm phiền |
| 15 | Sticker | Danh sách cố định, không cần đồng ý, người nhận có thể ẩn | Nhẹ nhàng, không gây áp lực |
| 16 | Đèn | Hoàn toàn cục bộ | Yêu cầu của người dùng |
| 17 | Máy bán hàng | Đồ miễn phí, 1 món mỗi 2 giờ. Loại món mặc định là văn phòng phẩm và đồ uống không thương hiệu | Không có tiền. Mục 12 |
| 18 | Máy pha cà phê | Không giá, 1 ly mỗi 10 phút | Không có tiền |
| 19 | Phòng y tế, mẹ và bé | Tiêu đề mặc định "Đặt phòng", không có lý do, không hiện ai đang ở trong | Riêng tư |
| 20 | Cửa phòng họp | Khóa theo lịch đặt. Người đặt mở được. it và admin override có audit | Yêu cầu của người dùng |
| 21 | Thang máy | Một tầng, chỉ có hình | MVP |
| 22 | Phòng máy chủ | Nhân viên chỉ thấy vỏ kính và biển "Khu hạn chế", không mở panel | DESIGN_V2 5.7 |
| 23 | Khu dự phòng | Chỉ xem thông tin, không có động từ thao tác | FLOORPLAN |
| 24 | Bảng vẽ | Không chữ, không tải ảnh, 300 nét, xóa mềm | Giảm rủi ro nội dung và bản quyền |
| 25 | Bảng trắng | Xóa mềm khi hết giờ đặt phòng | Phạm vi theo phòng |
| 26 | Cây | Trạng thái tính trên máy chủ, sâu theo seed ngày, không thưởng | Tránh gian lận và yếu tố cờ bạc |
| 27 | Tranh | Tranh tự tạo (generative) | DESIGN_V2 5.5 Z05 |
| 28 | Bảng xếp hạng người | Không có bảng xếp hạng tương tác xã hội | Tránh áp lực |
| 29 | Hồi chiêu | Chỉ là giới hạn chống spam, không phải phần thưởng | Mục 5.2 |
| 30 | Tủ tài liệu | Chỉ văn phòng phẩm. Tồn kho đặt lại 07:00 UTC+7 | Đề xuất. Mục 7.6 |
| 31 | Trò chơi đố vui | Đáp án ẩn khi làm bài. "Đã ghi nhận" khi trả lời | DECISIONS 2 |

---

## 12. Mâu thuẫn và việc cần người dùng xác nhận

Các mục dưới đây không chặn Pha 1. Pha 1 chỉ cần chờ mục 5 và mục 9 khi làm đến phần đó.

| # | Nội dung | Nguồn | Ảnh hưởng | Đề xuất |
|---|---|---|---|---|
| 1 | Số chỗ: lưới hiện tại cho 219 vị trí. DECISIONS 1 chọn khoảng 104 chỗ có ghế. FLOORPLAN và DESIGN_V2 phát hiện 1 ghi mục tiêu 484 | `Desks.tsx`, DECISIONS, DESIGN_V2 | Id ghế, số lượng `seat_*` | Chốt số chỗ trước khi đổi dữ liệu khối bàn |
| 2 | Hai cặp khối bàn trùng tên squad: `desk_L1` và `desk_B3` (Core integration), `desk_L2` và `desk_B4` (Data & BI) | `it.json` | Người xem có thể hiểu là một nhóm | Xác nhận có phải cùng squad |
| 3 | Vai trò squad là mẫu, ghi "cần xác nhận" | `it.json` | Panel `view` | Xác nhận danh sách vai trò |
| 4 | Vị trí cửa sổ, bảng vẽ, cây, máy bán hàng, tủ dụng cụ, công tắc chưa có trong bản vẽ | FLOORPLAN, DESIGN_V2 | Không đặt thử được | Đo trên bản vẽ gốc |
| 5 | Cửa phòng họp chưa có tọa độ. `isSolidObject` trong `src/scene/layout.ts` không nhận trạng thái mở, khóa | `layout.ts` | Va chạm | Đo cửa, sửa logic trước khi bật tính năng |
| 6 | `core_lift3` chồng `wc_block` ở dải y 11.1–11.9 (3.2 m²) | FLOORPLAN, DESIGN_V2 phát hiện 2 | Lối đi quanh thang máy phụ | Sửa một trong hai khối (DESIGN_V2 đề xuất) |
| 7 | `mr2` và `mr3` sát. DESIGN_V2 đề xuất `mr3` chỉ 8–9 chỗ | DESIGN_V2 phát hiện 3 | Sức chứa hiển thị khi đặt | Quyết định sức chứa |
| 8 | Endpoint events, karaoke, games trong RESEARCH_SERVICES khác code | Mục 1.7 | Tài liệu sai lệch | Cập nhật RESEARCH_SERVICES (ngoài phạm vi tài liệu này) |
| 9 | Chưa có số đường dây khẩn cấp cho phòng y tế | Chưa có | Panel `util_health` | IT cung cấp số |
| 10 | Nguồn và người duy trì nội dung bảng thông báo | Chưa có | `notice_board` | IT chọn: file hay API |
| 11 | Loại món máy bán hàng | Chưa có | `vending_lounge` | Xác nhận. Mặc định mục 11 |
| 12 | Phím tương tác và quy ước bàn phím | Chưa có | Trợ năng | Xác nhận phím E |
| 13 | Làm mới NOC: 30 s (`it.json`) và 1 phút (DESIGN_V2 Z04) | Hai nguồn | Tần suất gọi API | Mặc định 30 s, xác nhận |
| 14 | `ANIMALS.md` chưa có | Repo | Pha 3 | Chờ tài liệu |
| 15 | `util_store` (it, admin) yêu cầu thiết bị qua ticket: đúng quy trình chưa | `it.json` | Quy trình | Xác nhận |
| 16 | `ObjectKind` chưa có `door`, `plant`, `seat`, `printer`. Tạm dùng `amenity`, `desk` | `src/content/types.ts` | Kiểu dữ liệu | Quyết định có thêm kind hay không |

<!-- KẾT THÚC -->

