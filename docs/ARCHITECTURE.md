# Kiến trúc hệ thống · Test App Phòng CNTT

Tài liệu này mô tả các service, port, luồng xác thực, luồng dữ liệu và cách phân tenant theo tên miền. Cách chạy và biến môi trường nằm trong `README.md`. Các điểm chưa đúng với thiết kế được liệt kê ở mục Hạn chế đã biết.

## Nguyên tắc

1. **Mỗi module một container.** Frontend (web), auth, it, games, karaoke, events và gateway tách riêng, build và deploy độc lập.
2. **Gateway là điểm vào duy nhất.** Trình duyệt chỉ nói chuyện với gateway. Frontend và API cùng một origin nên không cần CORS.
3. **Không dùng mạng Docker tự tạo.** Tất cả container dùng `network_mode: host`. Máy chủ đã cạn dải địa chỉ Docker, và mạng bridge mặc định không có DNS giữa container. Vì vậy mọi upstream dùng địa chỉ IP và port cố định.
4. **Chỉ mở gateway ra ngoài máy chủ.** Web, auth, it, games, karaoke và events đều chỉ lắng nghe `127.0.0.1`. Người dùng truy cập qua SSH tunnel tới `127.0.0.1:18080`.

## Sơ đồ service

```
  Trình duyệt (laptop)
        │  ssh -L 18080:127.0.0.1:18080
        ▼
  gateway (nginx)  127.0.0.1:18080   [máy chủ, network_mode: host]
  │
  ├── /api/auth/*                     ──►  auth     (Node 20, Express)  127.0.0.1:3001
  │                                         volume auth-data → /data
  ├── /api/it/*, /api/rooms/*,        ──►  it       (Node 20, Express)  127.0.0.1:3002
  │   /api/kudos/*                          volume it-data → /data
  ├── /api/games/*                    ──►  games    (Node 20, Express)  127.0.0.1:3003
  │                                         volume games-data → /data
  ├── /api/karaoke/*                  ──►  karaoke  (Node 20, Express)  127.0.0.1:3004
  │                                         volume karaoke-data → /data
  ├── /api/events/*                   ──►  events   (Node 20, Express)  127.0.0.1:3005
  │                                         volume events-data → /data
  ├── /api/display/*                  ──►  display  (Node 20, Express)  127.0.0.1:3006
  │                                         volume display-data → /data (SSE, không buffer)
  ├── /api/plants/*                   ──►  plants   (Node 20, Express)  127.0.0.1:3007
  │                                         volume plants-data → /data
  ├── /api/* khác                     ──►  404 JSON (gateway tự trả lời)
  └── mọi đường dẫn khác              ──►  web (nginx, dist)  127.0.0.1:18081

  it, games, karaoke, events, display, plants  ── GET AUTH_URL/api/auth/me (kiểm tra phiên, không cache) ──►  auth
```

## Bảng port

| Container | Địa chỉ lắng nghe | Công nghệ | Ghi chú |
|---|---|---|---|
| gateway | `127.0.0.1:18080` | nginx 1.27 | Điểm vào duy nhất. Health: `GET /api/health` |
| web | `127.0.0.1:18081` | nginx 1.27 | Chỉ gateway gọi tới |
| auth | `127.0.0.1:3001` | Node 20, Express | Code gọi `app.listen(config.port, '127.0.0.1')`. Gateway và các service khác gọi tới để kiểm tra phiên |
| it | `127.0.0.1:3002` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới |
| games | `127.0.0.1:3003` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới |
| karaoke | `127.0.0.1:3004` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới |
| events | `127.0.0.1:3005` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới |
| display | `127.0.0.1:3006` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới. SSE realtime |
| plants | `127.0.0.1:3007` | Node 20, Express | Mặc định `HOST=127.0.0.1`. Chỉ gateway gọi tới |

### Định tuyến của gateway

Lấy từ `deploy/nginx/gateway.conf`:

| Đường dẫn | Đích |
|---|---|
| `/api/health` | gateway tự trả lời, không gọi upstream |
| `/api/auth` | auth `127.0.0.1:3001` |
| `/api/it`, `/api/rooms`, `/api/kudos` | it `127.0.0.1:3002` |
| `/api/games` | games `127.0.0.1:3003` |
| `/api/karaoke` | karaoke `127.0.0.1:3004` |
| `/api/events` | events `127.0.0.1:3005` |
| `/api/display` | display `127.0.0.1:3006` (SSE: `proxy_buffering off`, timeout đọc 3600 giây) |
| `/api/plants` | plants `127.0.0.1:3007` |
| `/api/` còn lại | gateway trả 404 JSON |
| mọi đường dẫn khác | web `127.0.0.1:18081` |

Gateway không cắt tiền tố `/api/...`. Service nhận đường dẫn đầy đủ, ví dụ `/api/auth/me`. Gateway không đụng tới header `Cookie`, nên cookie phiên đi nguyên vẹn tới upstream.

Ba location `/api/games`, `/api/karaoke` và `/api/events` không có dấu `/` cuối, nên cả `/api/games` lẫn `/api/games/...` đều được proxy. Nếu có dấu `/` cuối, nginx trả 301 cho request thiếu dấu `/`, và trình duyệt đổi POST thành GET khi theo chuyển hướng. Tài liệu viết `/api/games/*` cho ngắn gọn; cấu hình thật không có dấu `/`.

## Luồng xác thực

1. **Đăng ký và xác minh.** Người dùng đăng ký bằng email, mật khẩu (10 đến 128 ký tự) và họ tên. Mật khẩu được băm bcrypt, cost 12. Auth gửi mã OTP 6 chữ số. Mã hết hạn sau 10 phút, nhập sai tối đa 5 lần, và gửi lại sau tối thiểu 60 giây. Nhập đúng mã thì tài khoản được xác minh và phiên được tạo.
2. **Đăng nhập bằng mật khẩu.** Sai 5 lần liên tiếp thì khóa 15 phút. Trạng thái khóa nằm trong bộ nhớ. Tài khoản chưa xác minh nhận 403. Nếu mã gần nhất đã quá 60 giây thì auth gửi mã mới.
3. **Đăng nhập Google và Microsoft (đang tắt).** Dùng OIDC với state, nonce và PKCE. State chỉ dùng được một lần và hết hạn sau 10 phút. Tài khoản Microsoft công ty không được liên kết vào tài khoản đã đăng ký bằng mật khẩu, trả 409.
4. **Phiên.** Auth tạo token ngẫu nhiên và chỉ lưu SHA-256 của token trong bảng `sessions`, hết hạn sau 7 ngày. Cookie `sid` là HttpOnly, `SameSite=Lax`, `Path=/`, có thêm cờ `Secure` khi `COOKIE_SECURE=true`. Đăng xuất xóa phiên trong DB.
5. **Gửi request có phiên.** Các request sau đó đi qua gateway kèm cookie `sid`. Gateway chuyển tiếp nguyên header `Cookie` tới upstream.
6. **It, games, karaoke và events kiểm tra phiên.** Các service này không tự lưu phiên. Mỗi request, chúng gọi `AUTH_URL/api/auth/me` và chuyển tiếp header `Cookie` để lấy người dùng. Theo `services/it/src/auth.js`, `services/games/src/auth.js`, `services/karaoke/src/auth.js` và `services/events/src/auth.js`, không cache, để logout có hiệu lực ngay. Timeout 3 giây. Mọi lỗi (401, status khác 200, timeout, lỗi mạng, JSON hỏng) đều trả 401 cho client. Hệ quả: khi auth khởi động lại hoặc chậm, người dùng bị coi là chưa đăng nhập.
7. **Phân quyền.** Vai trò (`employee`, `it`, `admin`) lưu trong bảng `users` của auth, mặc định `employee`. Người dùng không tự khai vai trò. Auth trả vai trò trong `/api/auth/me`. It đọc vai trò từ đó cho API tóm tắt SOC, và frontend đọc từ đó để hiển thị. Events đọc vai trò để giới hạn tạo sự kiện, đóng sự kiện và xem kết quả khi chưa đóng (chỉ `it` và `admin`). Games và karaoke không kiểm tra vai trò. Cách đặt vai trò và bảng quyền xem `README.md`.

## Luồng dữ liệu

| Dữ liệu | Nơi lưu | Ai đọc, ai ghi |
|---|---|---|
| Mã nguồn frontend (bản build `dist`) | Image `web`, thư mục `/usr/share/nginx/html` | Chỉ đọc. Nginx phục vụ |
| Dữ liệu mẫu của it: `services.json`, `security.json` | Image `it`, thư mục `/app/mock` | Chỉ đọc. Đọc mỗi lần có request |
| Tài khoản, phiên, mã OTP, vai trò, tenant, state OAuth | Volume `auth-data`, mount tại `/data`, file `app.db` (SQLite, WAL) | auth đọc và ghi |
| Ticket, sự cố, đặt phòng, vinh danh, audit log | Volume `it-data`, mount tại `/data`, file `it.db` (SQLite, WAL) | it đọc và ghi. Audit chỉ lưu hash của nội dung |
| Token xác nhận sự cố (bước 2 khi tạo sự cố) | Bộ nhớ tiến trình it, hết hạn sau 60 giây | it |
| Đếm đăng nhập sai | Bộ nhớ tiến trình auth | auth |
| Phòng caro, kết quả caro, lượt quiz, đáp án và điểm trò chơi | Volume `games-data`, mount tại `/data`, file `games.db` (SQLite, WAL) | games đọc và ghi |
| Điểm karaoke | Volume `karaoke-data`, mount tại `/data`, file `karaoke.db` (SQLite, WAL) | karaoke đọc và ghi |
| Sự kiện, tiết mục, bình chọn | Volume `events-data`, mount tại `/data`, file `events.db` (SQLite, WAL) | events đọc và ghi |
| Câu hỏi quiz | Mã nguồn `services/games/src/data/questions.js`, nằm trong image `games` | Chỉ đọc |
| Danh sách bài hát karaoke | Mã nguồn `services/karaoke/src/data/songs.js`, nằm trong image `karaoke` | Chỉ đọc |

Frontend chỉ gọi API cùng origin qua gateway: `/api/auth/*` cho đăng nhập và phiên, `/api/it/services` cho khu NOC, `/api/it/security/summary`, `/api/it/tickets`, `/api/it/incidents/open`, `/api/rooms*` và `/api/kudos*`. Không còn đọc `/mock/` từ web root. Tính đến lần rà soát này, `src/` chưa gọi `/api/games`, `/api/karaoke` hay `/api/events`.

Volume tách riêng để có thể sao lưu, khôi phục hoặc thay thế từng service mà không ảnh hưởng service còn lại. Xóa volume (`docker compose down -v`) sẽ mất dữ liệu.

## Tenant theo tên miền

Quy tắc nằm trong `services/auth/tenants.js`, dùng chung cho đăng ký bằng mật khẩu và đăng nhập OAuth.

- **Email cá nhân** (danh sách `PERSONAL_DOMAINS`: gmail.com, outlook.com, icloud.com, proton.me và tương tự) vào tenant dùng chung `personal`.
- **Email doanh nghiệp.** Mỗi tên miền là một tenant riêng, id và tên đều là tên miền. Tenant được tạo khi có người đăng ký, trước cả bước xác minh.
- **Chỉ vào được hệ thống sau khi xác minh hộp thư.** Người đăng ký chưa xác minh không có phiên. Vì vậy không ai dùng được tenant của tên miền mà mình không nhận được mail.

## Ràng buộc và giả định

- Trình duyệt chỉ đi qua gateway. Các service gọi auth trực tiếp qua `127.0.0.1:3001` để kiểm tra phiên.
- Biến đăng nhập OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`) khớp với `services/auth/config.js`. Đăng nhập OAuth chỉ bật khi có cả client ID và secret.
- Health check của gateway không kiểm tra auth và it.
- Khóa đăng nhập sai và token xác nhận sự cố nằm trong bộ nhớ tiến trình, nên hệ thống chỉ đúng khi chạy một instance mỗi service.

## Hạn chế đã biết

1. **Tạo sự cố không kiểm tra vai trò.** `POST /api/it/incidents` trong `services/it/src/routes/it.js` không kiểm tra `req.user.role`. Mọi tài khoản đã đăng nhập đều tạo được sự cố P1 hoặc P2. Chỉ `GET /api/it/security/summary` có kiểm tra vai trò. Giao diện hiện không có form tạo sự cố.
2. **Không có giới hạn theo IP cho đăng ký và gửi OTP.** Giới hạn hiện có là theo email: một mã mỗi 60 giây.
3. **Trạng thái trong bộ nhớ.** Khóa đăng nhập sai (auth) và token xác nhận sự cố (it) mất khi tiến trình khởi động lại. Không chia sẻ được giữa nhiều instance.
4. **Không có lock file.** Repo chưa có `package-lock.json`. Các Dockerfile dùng `npm install`, nên phiên bản dependency gián tiếp có thể khác giữa các lần build.
5. **Dữ liệu dịch vụ và SOC là mẫu.** `services/it/mock/` chứa dữ liệu cố định, không nối vào hệ thống giám sát thật.
6. **Gửi mail mặc định là log.** Với `MAIL_MODE=log`, mã OTP nằm trong log container, không gửi đến hộp thư.
7. **Smoke test và healthcheck chưa phủ games, karaoke, events.** Smoke test chỉ kiểm tra auth và it. Compose chỉ khai báo healthcheck cho web và gateway.

## Dịch vụ giải trí và giao lưu văn nghệ

Ba service `games`, `karaoke` và `events` chạy theo cùng mô hình với auth và it: mỗi service một container, `network_mode: host`, chỉ lắng nghe `127.0.0.1`, và đi qua gateway. Bảng port, định tuyến và volume của chúng nằm trong các mục trên.

Biến môi trường cố định trong `docker-compose.yml`: `PORT` (3003, 3004, 3005), `DATA_DIR=/data`, và `AUTH_URL=http://127.0.0.1:3001`. Giá trị `AUTH_URL` giống it. Mỗi service có volume riêng để sao lưu, khôi phục hoặc thay thế độc lập.

Các service này chưa có healthcheck trong compose. Kiểm tra bằng `docker compose ps` và `docker compose logs <tên service>`. Dockerfile và compose giả định `services/games`, `services/karaoke`, `services/events` đều có `package.json` và `src/index.js`.

### Lưu ý pháp lý về nhạc

- Chỉ dùng nhạc do nhóm tự sáng tác.
- Không đưa nhạc có bản quyền vào mã nguồn, dữ liệu mẫu, image Docker hay volume. Điều này gồm file nhạc thương mại, bản karaoke sao chép và lời bài hát có bản quyền.
- Lý do: image và volume được sao chép và triển khai lại, nên nhạc có bản quyền trong đó là bản sao không có giấy phép.
