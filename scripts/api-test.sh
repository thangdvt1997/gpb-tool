#!/bin/sh
# Kiểm tra API chỉ đọc qua gateway: endpoint công khai, endpoint cần đăng nhập và header bảo mật.
# Không ghi dữ liệu. Ngoại lệ duy nhất: POST /api/auth/login tạo một phiên mới trên máy chủ.
#
# Cách dùng (trên máy chủ, hoặc trên laptop khi đã mở SSH tunnel tới 127.0.0.1:18080):
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... sh scripts/api-test.sh
#
# Biến môi trường:
#   GATEWAY          địa chỉ gateway, mặc định http://127.0.0.1:18080
#   SMOKE_EMAIL      bắt buộc. Tài khoản đã xác minh
#   SMOKE_PASSWORD   bắt buộc. Mật khẩu của SMOKE_EMAIL. Không bao giờ in ra màn hình
#
# Mã thoát: 0 nếu không có FAIL (WARN không tính là FAIL), 1 nếu có FAIL, 2 nếu thiếu curl hoặc biến môi trường.

# Không dùng set -e: script chạy hết mọi kiểm tra rồi báo tổng kết.
set -u

GATEWAY=${GATEWAY:-http://127.0.0.1:18080}
GATEWAY=${GATEWAY%/}
SMOKE_EMAIL=${SMOKE_EMAIL:-}
SMOKE_PASSWORD=${SMOKE_PASSWORD:-}
SID=''
SETCOOKIE=''
CHK_WHY=''
PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
warn() { WARN=$((WARN + 1)); printf 'WARN  %s\n' "$1"; }
say() { printf '%s\n' "$1"; }

if ! command -v curl >/dev/null 2>&1; then
  say 'Thiếu curl trên máy đang chạy script.' >&2
  exit 2
fi
if [ -z "$SMOKE_EMAIL" ] || [ -z "$SMOKE_PASSWORD" ]; then
  say 'Thiếu SMOKE_EMAIL hoặc SMOKE_PASSWORD.' >&2
  say 'Cách dùng: SMOKE_EMAIL=... SMOKE_PASSWORD=... sh scripts/api-test.sh' >&2
  exit 2
fi

BODY=$(mktemp) || exit 2
HDR=$(mktemp) || { rm -f "$BODY"; exit 2; }
trap 'rm -f "$BODY" "$HDR"' EXIT
trap 'exit 130' INT TERM

# Escape dấu \ và " để đưa giá trị vào chuỗi JSON.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# req <phương thức> <đường dẫn> <JSON hoặc rỗng> <cookie: none|sid>
# Ghi nội dung vào $BODY, header vào $HDR, in mã HTTP ra stdout (000 nếu không kết nối được).
req() {
  rq_method=$1
  rq_path=$2
  rq_json=${3-}
  rq_cookie=${4-none}
  : > "$BODY"
  : > "$HDR"
  set -- curl -sS --connect-timeout 5 --max-time 20 -o "$BODY" -D "$HDR" -w '%{http_code}' \
    -X "$rq_method" -H 'Accept: application/json'
  if [ -n "$rq_json" ]; then
    set -- "$@" -H 'Content-Type: application/json' --data-binary "$rq_json"
  fi
  if [ "$rq_cookie" = sid ]; then
    set -- "$@" -H "Cookie: sid=$SID"
  fi
  set -- "$@" "$GATEWAY$rq_path"
  rq_code=$("$@" 2>/dev/null) || rq_code=''
  case $rq_code in
    [0-9][0-9][0-9]) ;;
    *) rq_code=000 ;;
  esac
  printf '%s' "$rq_code"
}

# expect <nhãn> <mã HTTP kỳ vọng> <mã thực tế> [hàm kiểm tra nội dung]
expect() {
  ex_label=$1
  ex_want=$2
  ex_got=$3
  ex_check=${4-}
  CHK_WHY=''
  if [ "$ex_got" != "$ex_want" ]; then
    fail "$ex_label (HTTP $ex_got, kỳ vọng $ex_want)"
    return 1
  fi
  if [ -n "$ex_check" ] && ! $ex_check; then
    fail "$ex_label (HTTP $ex_got, ${CHK_WHY:-điều kiện bổ sung không đạt})"
    return 1
  fi
  pass "$ex_label (HTTP $ex_got)"
  return 0
}

# expect_fn <nhãn> <hàm>: kiểm tra không dựa trên mã HTTP (cookie, header).
expect_fn() {
  CHK_WHY=''
  if $2; then
    pass "$1"
  else
    fail "$1 (${CHK_WHY:-không đạt})"
  fi
}

# body_first_char: in ký tự đầu tiên không phải khoảng trắng của $BODY.
body_first_char() {
  awk '{ sub(/^[ \t\r]+/, ""); if ($0 != "") { print substr($0, 1, 1); exit } }' "$BODY"
}

check_array() {
  [ "$(body_first_char)" = '[' ] || { CHK_WHY='không phải mảng JSON'; return 1; }
  return 0
}

check_json_body() {
  cj_first=$(body_first_char)
  if [ "$cj_first" != '{' ] && [ "$cj_first" != '[' ]; then
    CHK_WHY='phản hồi không phải JSON'
    return 1
  fi
  if grep -qiE '<html|<!doctype' "$BODY"; then
    CHK_WHY='phản hồi là HTML'
    return 1
  fi
  return 0
}

check_has_email() {
  grep -q -E '"email"[[:space:]]*:' "$BODY" || { CHK_WHY='thiếu trường email'; return 1; }
  return 0
}

check_has_sid() {
  [ -n "$SID" ] || { CHK_WHY='không có cookie sid trong Set-Cookie'; return 1; }
  return 0
}

check_sid_httponly() {
  if [ -z "$SETCOOKIE" ]; then CHK_WHY='không có Set-Cookie cho sid'; return 1; fi
  printf '%s' "$SETCOOKIE" | grep -qi 'httponly' || { CHK_WHY='Set-Cookie sid thiếu HttpOnly'; return 1; }
  return 0
}

# json_from <khóa>: in JSON trong $BODY từ lần xuất hiện đầu của khóa trở đi.
json_from() {
  awk -v k="\"$1\"" '
    f { print; next }
    { i = index($0, k); if (i > 0) { f = 1; print substr($0, i + length(k)) } }
  ' "$BODY"
}

# count_items: đọc từ stdin đoạn JSON bắt đầu bằng mảng (ví dụ ":[{...},{...}]"), in số phần tử object ở mức đầu.
count_items() {
  awk '
    BEGIN { depth = 0; inq = 0; started = 0; total = 0; done = 0 }
    done { next }
    {
      s = $0 "\n"
      n = length(s)
      for (i = 1; i <= n; i++) {
        ch = substr(s, i, 1)
        if (inq) {
          if (ch == "\\") { i++ } else if (ch == "\"") { inq = 0 }
          continue
        }
        if (ch == "\"") { inq = 1; continue }
        if (!started) { if (ch == "[") { started = 1; depth = 1 }; continue }
        if (ch == "{" || ch == "[") {
          if (ch == "{" && depth == 1) { total++ }
          depth++
        } else if (ch == "}" || ch == "]") {
          depth--
          if (depth == 0) { done = 1; break }
        }
      }
    }
    END { print total + 0 }
  '
}

check_plants_five() {
  cp_first=$(json_from plants | sed -e 's/^[[:space:]]*:[[:space:]]*//' | head -n 1 | cut -c1)
  if [ "$cp_first" != '[' ]; then CHK_WHY='khoá plants không phải mảng'; return 1; fi
  cp_n=$(json_from plants | count_items)
  if [ "$cp_n" != 5 ]; then CHK_WHY="plants có $cp_n phần tử, kỳ vọng 5"; return 1; fi
  return 0
}

say "Kiểm tra API chỉ đọc qua $GATEWAY"
say ''
say '-- Không đăng nhập --'

c=$(req GET /api/health '' none)
expect 'GET /api/health' 200 "$c"

c=$(req GET /api/auth/providers '' none)
expect 'GET /api/auth/providers' 200 "$c"

for ap in /api/auth/me /api/it/services /api/display/state /api/plants/state \
  /api/games/leaderboard /api/karaoke/songs /api/events /api/layout/state \
  /api/rooms /api/kudos/board; do
  c=$(req GET "$ap" '' none)
  expect "GET $ap khi chưa đăng nhập" 401 "$c"
done

c=$(req GET /api/nonexistent '' none)
expect 'GET /api/nonexistent (404, trả JSON)' 404 "$c" check_json_body

say ''
say '-- Đăng nhập --'

login_json=$(printf '{"email":"%s","password":"%s"}' \
  "$(json_escape "$SMOKE_EMAIL")" "$(json_escape "$SMOKE_PASSWORD")")
c=$(req POST /api/auth/login "$login_json" none)
SETCOOKIE=$(grep -i '^set-cookie:[[:space:]]*sid=' "$HDR" | tr -d '\r' | head -n 1)
SID=$(printf '%s' "$SETCOOKIE" | sed -e 's/^[^=]*=//' -e 's/;.*$//')
expect 'POST /api/auth/login bằng SMOKE_EMAIL và SMOKE_PASSWORD (có cookie sid)' 200 "$c" check_has_sid
expect_fn 'Cookie sid có HttpOnly (đọc Set-Cookie lúc đăng nhập)' check_sid_httponly
if [ -z "$SID" ]; then
  say '      Gợi ý: không có phiên, các kiểm tra cần đăng nhập sẽ FAIL. Kiểm tra SMOKE_EMAIL, SMOKE_PASSWORD và tài khoản đã xác minh.'
fi

say ''
say '-- Có đăng nhập --'

c=$(req GET /api/auth/me '' sid)
expect 'GET /api/auth/me (có "email")' 200 "$c" check_has_email

c=$(req GET /api/it/services '' sid)
expect 'GET /api/it/services (mảng JSON)' 200 "$c" check_array

c=$(req GET /api/rooms '' sid)
expect 'GET /api/rooms' 200 "$c"

c=$(req GET /api/display/state '' sid)
expect 'GET /api/display/state' 200 "$c"

c=$(req GET /api/plants/state '' sid)
expect 'GET /api/plants/state (đúng 5 cây)' 200 "$c" check_plants_five

c=$(req GET /api/layout/state '' sid)
expect 'GET /api/layout/state' 200 "$c"

c=$(req GET '/api/games/leaderboard?kind=quiz' '' sid)
expect 'GET /api/games/leaderboard?kind=quiz' 200 "$c"

c=$(req GET /api/karaoke/songs '' sid)
expect 'GET /api/karaoke/songs' 200 "$c"

c=$(req GET /api/events '' sid)
expect 'GET /api/events' 200 "$c"

say ''
say '-- Header bảo mật ở / (chỉ cảnh báo) --'

c=$(req GET / '' none)
if grep -qi '^x-content-type-options:[[:space:]]*nosniff' "$HDR"; then
  pass "GET / có X-Content-Type-Options: nosniff (HTTP $c)"
else
  warn "GET / thiếu X-Content-Type-Options: nosniff (HTTP $c)"
fi
if grep -qi '^referrer-policy:' "$HDR"; then
  pass "GET / có Referrer-Policy (HTTP $c)"
else
  warn "GET / thiếu Referrer-Policy (HTTP $c)"
fi

say ''
printf 'Tổng kết: %s PASS, %s FAIL, %s WARN\n' "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -ne 0 ]; then
  say 'KẾT QUẢ: KHÔNG ĐẠT'
  exit 1
fi
say 'KẾT QUẢ: ĐẠT'
exit 0
