# Rà soát OSS · Test App Phòng CNTT

Ngày rà soát: 2026-11-06.

Cách ghi trạng thái:
- **npm registry**: trường `license` trong metadata của đúng phiên bản ghim, lấy bằng `https://registry.npmjs.org/<gói>/<phiên bản>`.
- **GitHub (LICENSE)**: nội dung file LICENSE tại repo chính thức.
- **Chưa xác minh**: chưa đối chiếu với nguồn chính thức. Không coi là đã kiểm tra.

Các mục ghi "npm registry" hoặc "GitHub" đã được đối chiếu trong phiên rà soát ngày 2026-11-06. Lần cập nhật tài liệu sau đó (bổ sung các gói `@types/*`, ghi nhận nodemailer) không truy cập lại các nguồn này, nên các mục mới ghi "Chưa xác minh".

Chưa có `package-lock.json` trong repo. Khi có lock file (sau `npm install` trên máy chủ), đối chiếu lại license trong `THIRD_PARTY.md`.

## Thư viện đang dùng

| Thành phần | Dùng ở | Phiên bản ghim | License | Trạng thái xác minh |
|---|---|---|---|---|
| express | auth, it | 4.21.2 | MIT | npm registry |
| better-sqlite3 | auth, it | 11.7.0 | MIT | npm registry |
| bcryptjs | auth | 2.4.3 | MIT | npm registry |
| nodemailer | auth | 6.9.16 | **Chưa thống nhất**: npm ghi `MIT-0`, file LICENSE ghi MIT | npm registry và GitHub (LICENSE). Chờ pháp chế xác nhận |
| openid-client | auth (SSO OIDC) | 5.7.1 | MIT | npm registry |
| react, react-dom | web | 18.3.1 | MIT | npm registry |
| three | web | 0.169.0 | MIT | npm registry |
| @react-three/fiber | web | 8.17.10 | MIT | npm registry |
| @react-three/drei | web | 9.114.0 | MIT | npm registry |
| vite | web (build) | 5.4.11 | MIT | npm registry |
| @vitejs/plugin-react | web (build) | 4.3.4 | MIT | npm registry |
| typescript | web (build) | 5.6.3 | Apache-2.0 | npm registry |
| @types/react | web (build, kiểu TypeScript) | 18.3.12 | MIT (theo kiến thức chung) | Chưa xác minh |
| @types/react-dom | web (build, kiểu TypeScript) | 18.3.1 | MIT (theo kiến thức chung) | Chưa xác minh |
| @types/three | web (build, kiểu TypeScript) | 0.169.0 | MIT (theo kiến thức chung) | Chưa xác minh |

### Lưu ý về nodemailer

Với nodemailer 6.9.16, npm ghi `"license": "MIT-0"`, còn file LICENSE của gói ghi MIT. Hai nguồn không khớp nhau. Khác biệt có ý nghĩa thực tế: MIT yêu cầu giữ thông báo bản quyền và văn bản giấy phép khi phân phối, còn MIT-0 không yêu cầu. Chờ pháp chế xác nhận trước khi phát hành.

## Image nền và runtime

| Thành phần | Tag cố định | License | Trạng thái xác minh |
|---|---|---|---|
| Node.js (image `node:20-alpine`) | 20-alpine | MIT cho lõi Node.js | LICENSE trên GitHub `nodejs/node`. Các thư viện đi kèm có license riêng, chưa kiểm tra từng cái |
| nginx (image `nginx:1.27-alpine`) | 1.27-alpine | BSD-2-Clause | LICENSE trên GitHub `nginx/nginx` (văn bản 2 điều khoản) |
| Gói Alpine `libstdc++` (runtime của better-sqlite3) | theo image | Chưa xác minh (theo kiến thức chung là GPL-3.0 kèm GCC Runtime Library Exception) | Chưa kiểm tra trong phiên này |
| Gói build tạm `python3`, `make`, `g++` | theo image | Chưa xác minh | Chỉ có trong layer build của auth và it, được gỡ trong cùng lệnh RUN, không nằm trong image chạy |

Tag cố định, không dùng `latest`. License của image là tổng hợp các gói bên trong. Khi phát hành chính thức, cần kiểm tra theo SBOM của image.

## Đã xác minh trước đó, dự kiến dùng ở bước sau

Các mục này xác minh trong phiên rà soát trước. Chưa được kiểm tra lại trong phiên này.

| Thành phần | License | Dùng cho | Nguồn |
|---|---|---|---|
| @pixiv/three-vrm (3.5.5) | MIT | Avatar VRM | npm registry |
| Socket.IO (4.8.4) | MIT | Presence, realtime | npm registry |
| Colyseus | MIT | Phòng nhiều người, nếu cần | GitHub API |
| LiveKit | Apache-2.0 | Voice, tùy chọn | GitHub API |
| Quaternius (asset) | CC0 | Asset phòng | Mô tả trong repo, cần kiểm tra lại từng pack |

## Đã loại

| Repo | Lý do |
|---|---|
| Asvarox/allkaraoke | Không có LICENSE, không được copy code |
| Duy2kne/san-quay-live | Không có LICENSE. Dùng tiktok-live-connector v2 (AGPL-3.0). Không liên quan đến dự án |
| tienphan1412-sudo/karaoke-vuive-3d | Không có LICENSE |
| npm tiktok-live-connector v2.x | AGPL-3.0-only. Không dùng: không thuộc phạm vi dự án |

Các phương án ITSM mã nguồn mở đã bỏ khỏi danh sách. Chúng không phải dependency của hệ thống. Nếu đưa lại, pháp chế cần xem trước vì điều khoản copyleft.
