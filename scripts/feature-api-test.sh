#!/bin/sh
# Kiểm tra API các tính năng mới: ghi danh (checkins), kiểm duyệt (moderation), mời đấu (duel), kudos.
# Mặc định KHÔNG ghi dữ liệu. Kiểm tra ghi chỉ chạy khi FEATURE_WRITE=1.
# Script không chứa mật khẩu hay bí mật: đăng nhập bằng file cookie do người điều phối tạo.
#
# Cách dùng:
#   BASE_URL=http://127.0.0.1:18080 SESSION_COOKIE_FILE=/đường/dẫn/cookies.txt sh scripts/feature-api-test.sh
#   FEATURE_WRITE=1 BLOCKED_SAMPLE=... SESSION_COOKIE_FILE=... sh scripts/feature-api-test.sh
#
# Biến môi trường:
#   BASE_URL            gateway, mặc định http://127.0.0.1:18080
#   SESSION_COOKIE_FILE file cookie định dạng curl (Netscape) của tài khoản employee thử. Thiếu thì bỏ qua kiểm tra cần đăng nhập
#   FEATURE_WRITE       đặt 1 để chạy kiểm tra ghi (ghi danh, mời đấu, kudos)
#   BLOCKED_SAMPLE      chuỗi chứa từ bị chặn, chỉ dùng cho kiểm tra kudos 422 khi FEATURE_WRITE=1
#
# Mã thoát: 0 nếu không có FAIL (WARN không tính), 1 nếu có FAIL, 2 nếu thiếu curl.

set -u

BASE_URL=${BASE_URL:-http://127.0.0.1:18080}
BASE_URL=${BASE_URL%/}
SESSION_COOKIE_FILE=${SESSION_COOKIE_FILE:-}
FEATURE_WRITE=${FEATURE_WRITE:-0}
BLOCKED_SAMPLE=${BLOCKED_SAMPLE:-}
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

HAVE_COOKIE=0
if [ -n "$SESSION_COOKIE_FILE" ] && [ -r "$SESSION_COOKIE_FILE" ]; then
  HAVE_COOKIE=1
fi

BODY=$(mktemp) || exit 2
trap 'rm -f "$BODY"' EXIT
trap 'exit 130' INT TERM

# req <phương thức> <đường dẫn> <JSON hoặc rỗng> <auth: none|cookie> [giá trị Sec-Fetch-Site]
# Ghi nội dung vào $BODY, in mã HTTP (000 nếu không kết nối được).
req() {
  rq_method=$1
  rq_path=$2
  rq_json=${3-}
  rq_auth=${4-none}
  rq_site=${5-}
  : > "$BODY"
  set -- curl -sS --connect-timeout 5 --max-time 20 -o "$BODY" -w '%{http_code}' \
    -X "$rq_method" -H 'Accept: application/json'
  if [ -n "$rq_json" ]; then
    set -- "$@" -H 'Content-Type: application/json' --data-binary "$rq_json"
  fi
  if [ -n "$rq_site" ]; then
    set -- "$@" -H "Sec-Fetch-Site: $rq_site"
  fi
  if [ "$rq_auth" = cookie ]; then
    set -- "$@" -b "$SESSION_COOKIE_FILE"
  fi
  set -- "$@" "$BASE_URL$rq_path"
  rq_code=$("$@" 2>/dev/null) || rq_code=''
  case $rq_code in
    [0-9][0-9][0-9]) ;;
    *) rq_code=000 ;;
  esac
  printf '%s' "$rq_code"
}

# expect <nhãn> <mã kỳ vọng> <mã thực tế> [hàm kiểm tra nội dung]
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

# expect_any <nhãn> <mã thực tế> <mã1> <mã2>: chấp nhận một trong hai mã.
expect_any() {
  if [ "$2" = "$3" ] || [ "$2" = "$4" ]; then
    pass "$1 (HTTP $2)"
  else
    fail "$1 (HTTP $2, kỳ vọng $3 hoặc $4)"
  fi
}

check_not_html() {
  if grep -qiE '<html|<!doctype' "$BODY"; then
    CHK_WHY='phản hồi là HTML'
    return 1
  fi
  return 0
}

check_json_error() {
  check_not_html || return 1
  grep -q '"ok"[[:space:]]*:[[:space:]]*false' "$BODY" || { CHK_WHY='thiếu ok:false'; return 1; }
  return 0
}

check_already_true() {
  grep -q '"alreadyCheckedIn"[[:space:]]*:[[:space:]]*true' "$BODY" || { CHK_WHY='alreadyCheckedIn không phải true'; return 1; }
  return 0
}

check_content_rejected() {
  grep -q '"content_rejected"' "$BODY" || { CHK_WHY='thiếu error content_rejected'; return 1; }
  return 0
}

say "Kiểm tra tính năng mới tại $BASE_URL"
if [ "$FEATURE_WRITE" = 1 ]; then
  say 'Chế độ: CÓ GHI (FEATURE_WRITE=1)'
else
  say 'Chế độ: chỉ đọc'
fi
say ''

# ---- 1. Chưa đăng nhập: 401, JSON, không phải 404 HTML ----
say '== Chưa đăng nhập =='
for rt in 'GET /api/it/checkins/me' 'GET /api/it/checkins/today' \
  'GET /api/auth/moderation/reports' 'GET /api/auth/moderation/users?query=a' \
  'GET /api/auth/moderation/audit' 'GET /api/games/duel/inbox' 'GET /api/games/duel/active'; do
  m=${rt%% *}
  p=${rt#* }
  c=$(req "$m" "$p" '' none)
  expect "$m $p chưa đăng nhập" 401 "$c" check_json_error
done

c=$(req POST /api/it/checkins '{}' none)
expect 'POST /api/it/checkins chưa đăng nhập' 401 "$c" check_json_error
c=$(req POST /api/auth/moderation/reports '{}' none)
expect 'POST /api/auth/moderation/reports chưa đăng nhập' 401 "$c" check_json_error
c=$(req POST /api/games/duel/invite '{}' none)
expect 'POST /api/games/duel/invite chưa đăng nhập' 401 "$c" check_json_error
c=$(req POST /api/auth/moderation/users/0/ban '{}' none)
expect 'POST /api/auth/moderation/users/:id/ban chưa đăng nhập' 401 "$c" check_json_error

# ---- 2. POST cross-site bị chặn ----
say ''
say '== POST cross-site =='
for pp in /api/it/checkins /api/auth/moderation/reports /api/games/duel/invite /api/kudos; do
  if [ "$HAVE_COOKIE" = 1 ]; then
    c=$(req POST "$pp" '{}' cookie cross-site)
    expect "POST $pp cross-site (có cookie)" 403 "$c"
  else
    c=$(req POST "$pp" '{}' none cross-site)
    expect_any "POST $pp cross-site (không cookie)" "$c" 401 403
  fi
done

# ---- 3. Cần đăng nhập ----
say ''
say '== Đã đăng nhập (employee) =='
if [ "$HAVE_COOKIE" != 1 ]; then
  warn 'Không có SESSION_COOKIE_FILE hợp lệ: bỏ qua mọi kiểm tra cần đăng nhập'
else
  c=$(req GET /api/it/checkins/me '' cookie)
  expect 'GET /api/it/checkins/me' 200 "$c" check_not_html
  c=$(req GET /api/it/checkins/today '' cookie)
  expect 'GET /api/it/checkins/today' 200 "$c" check_not_html
  c=$(req GET '/api/it/checkins/today?detail=1' '' cookie)
  expect 'GET /api/it/checkins/today?detail=1 với employee' 403 "$c"
  c=$(req GET '/api/auth/moderation/reports?status=open' '' cookie)
  expect 'GET moderation/reports với employee' 403 "$c"
  c=$(req GET '/api/auth/moderation/users?query=a' '' cookie)
  expect 'GET moderation/users với employee' 403 "$c"
  c=$(req GET /api/auth/moderation/audit '' cookie)
  expect 'GET moderation/audit với employee' 403 "$c"
  c=$(req GET /api/games/duel/inbox '' cookie)
  expect 'GET /api/games/duel/inbox' 200 "$c" check_not_html
  c=$(req GET /api/games/duel/active '' cookie)
  expect 'GET /api/games/duel/active' 200 "$c" check_not_html
  c=$(req POST /api/it/checkins '{"gate":"cong-khong-ton-tai"}' cookie)
  expect 'POST /api/it/checkins với gate không hợp lệ' 400 "$c"
fi

# ---- 4. Kiểm tra ghi ----
say ''
say '== Kiểm tra ghi =='
if [ "$FEATURE_WRITE" != 1 ]; then
  warn 'FEATURE_WRITE chưa bật: bỏ qua kiểm tra ghi'
elif [ "$HAVE_COOKIE" != 1 ]; then
  warn 'Thiếu cookie: bỏ qua kiểm tra ghi'
else
  c=$(req POST /api/it/checkins '{"gate":"lift7"}' cookie)
  expect_any 'POST /api/it/checkins lần đầu' "$c" 201 200
  c=$(req POST /api/it/checkins '{"gate":"lift7"}' cookie)
  expect 'POST /api/it/checkins lần hai (alreadyCheckedIn true)' 200 "$c" check_already_true

  c=$(req GET /api/auth/me '' cookie)
  MY_ID=''
  if [ "$c" = 200 ]; then
    MY_ID=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\{0,1\}\([A-Za-z0-9_-]*\)"\{0,1\}.*/\1/p' "$BODY" | head -n 1)
  fi
  if [ -z "$MY_ID" ]; then
    warn 'Không lấy được id của tài khoản thử từ /api/auth/me: bỏ qua kiểm tra mời tự thân'
  else
    c=$(req POST /api/games/duel/invite "{\"targetUserId\":\"$MY_ID\",\"mode\":\"fight\"}" cookie)
    expect 'POST /api/games/duel/invite tự mời chính mình' 400 "$c"
  fi

  if [ -z "$BLOCKED_SAMPLE" ]; then
    warn 'Thiếu BLOCKED_SAMPLE: bỏ qua kiểm tra kudos content_rejected'
  else
    ks=$(printf '%s' "$BLOCKED_SAMPLE" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    c=$(req POST /api/kudos "{\"toName\":\"Kiem Thu\",\"message\":\"$ks\"}" cookie)
    expect 'POST /api/kudos có từ bị chặn' 422 "$c" check_content_rejected
  fi
fi

say ''
printf 'Tổng kết: %s PASS, %s FAIL, %s WARN\n' "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -ne 0 ]; then
  say 'KẾT QUẢ: KHÔNG ĐẠT'
  exit 1
fi
say 'KẾT QUẢ: ĐẠT'
exit 0
