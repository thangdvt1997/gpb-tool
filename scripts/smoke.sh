#!/bin/sh
# Kiểm thử nhanh sau khi triển khai: gọi API qua gateway và kiểm tra các luồng chính.
#
# Cách dùng (trên máy chủ, hoặc trên laptop khi đã mở SSH tunnel tới 127.0.0.1:18080):
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... SMOKE_OTP=123456 sh scripts/smoke.sh
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... sh scripts/smoke.sh   (không có SMOKE_OTP: đăng nhập bằng mật khẩu ở bước 6)
#
# Biến môi trường:
#   GATEWAY            địa chỉ gateway, mặc định http://127.0.0.1:18080
#   SMOKE_EMAIL        bắt buộc. Nên dùng địa chỉ mới cho mỗi lần chạy
#   SMOKE_PASSWORD     bắt buộc, 10 đến 128 ký tự. Không bao giờ in ra màn hình
#   SMOKE_OTP          mã 6 số gửi tới SMOKE_EMAIL, dùng để xác minh ở bước 6. Thiếu thì bước 6 đăng nhập bằng SMOKE_PASSWORD
#   SMOKE_WRITE        1 để chạy bước 55 (ghi bố cục layout). Mặc định 0
#   SMOKE_EXPECT_ROLE  employee (mặc định), it hoặc admin. Phải khớp vai trò đã đặt bằng scripts/admin.js
#
# Script tạo dữ liệu thật: tài khoản, một lượt đặt phòng, một vinh danh và một ticket.
# Bước 16 đến 35 (cần phiên đăng nhập) tạo thêm ván caro, ván đố vui, điểm karaoke và sự kiện (chỉ it/admin tạo được sự kiện).
# Bước 36 đến 51 (cần phiên đăng nhập) kiểm tra màn hình hiển thị, cây trồng, đăng ký và đăng nhập. Các bước này cũng ghi dữ liệu thật:
# bật rồi tắt TV tv_lobby, thêm nét vẽ vào whiteboard_mr1, xóa whiteboard_mr1 (chỉ it/admin), tưới một cây và tạo một tài khoản thử trên example.com.
# Bước 52 đến 56 kiểm tra dịch vụ layout. Bước 55 ghi bố cục (chỉ chạy khi SMOKE_WRITE=1). Bước 56 với it/admin đặt lại bố cục thật về mặc định.
# Mã thoát: 0 nếu không có bước FAIL, 1 nếu có FAIL, 2 nếu thiếu hoặc sai biến môi trường.

# Không dùng set -e: script chạy tiếp sau lỗi để báo đủ kết quả.
set -u

GATEWAY=${GATEWAY:-http://127.0.0.1:18080}
GATEWAY=${GATEWAY%/}
SMOKE_EMAIL=${SMOKE_EMAIL:-}
SMOKE_PASSWORD=${SMOKE_PASSWORD:-}
SMOKE_OTP=${SMOKE_OTP:-}
SMOKE_WRITE=${SMOKE_WRITE:-0}
SMOKE_EXPECT_ROLE=${SMOKE_EXPECT_ROLE:-employee}
SID=''
CHK_WHY=''
PASS=0
FAIL=0
SKIP=0

pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip_steps() { SKIP=$((SKIP + $1)); printf 'SKIP  %s\n' "$2"; }
say() { printf '%s\n' "$1"; }

if ! command -v curl >/dev/null 2>&1; then
  say 'Thiếu curl trên máy đang chạy script.' >&2
  exit 2
fi
if [ -z "$SMOKE_EMAIL" ] || [ -z "$SMOKE_PASSWORD" ]; then
  say 'Thiếu SMOKE_EMAIL hoặc SMOKE_PASSWORD.' >&2
  say 'Cách dùng: SMOKE_EMAIL=... SMOKE_PASSWORD=... [SMOKE_OTP=123456] sh scripts/smoke.sh' >&2
  exit 2
fi
case $SMOKE_EXPECT_ROLE in
  employee|it|admin) ;;
  *) say 'SMOKE_EXPECT_ROLE chỉ nhận employee, it hoặc admin.' >&2; exit 2 ;;
esac
if [ -n "$SMOKE_OTP" ]; then
  case $SMOKE_OTP in
    [0-9][0-9][0-9][0-9][0-9][0-9]) ;;
    *) say 'SMOKE_OTP phải gồm đúng 6 chữ số.' >&2; exit 2 ;;
  esac
fi

JAR=$(mktemp) || exit 2
BODY=$(mktemp) || { rm -f "$JAR"; exit 2; }
trap 'rm -f "$JAR" "$BODY"' EXIT
trap 'exit 130' INT TERM

# Escape dấu \ và " để đưa giá trị vào chuỗi JSON.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Thời điểm UTC cách hiện tại $1 giây, dạng 2026-11-06T10:00:00Z.
# Không dùng dấu +, vì trong query string dấu + bị đổi thành khoảng trắng.
utc_after() {
  ua_epoch=$(( $(date -u +%s) + $1 ))
  date -u -d "@$ua_epoch" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -r "$ua_epoch" '+%Y-%m-%dT%H:%M:%SZ'
}

# req <phương thức> <đường dẫn> <JSON hoặc rỗng> <cookie: none|jar|sid>
# Ghi nội dung phản hồi vào $BODY, in mã HTTP ra stdout (000 nếu không kết nối được).
#   none: không gửi cookie.  jar: đọc và ghi $JAR.  sid: gửi đúng cookie sid đã lưu.
req() {
  rq_method=$1
  rq_path=$2
  rq_json=${3-}
  rq_cookie=${4-none}
  set -- curl -sS --connect-timeout 5 --max-time 20 -o "$BODY" -w '%{http_code}' \
    -X "$rq_method" -H 'Accept: application/json'
  if [ -n "$rq_json" ]; then
    set -- "$@" -H 'Content-Type: application/json' --data-binary "$rq_json"
  fi
  case $rq_cookie in
    jar) set -- "$@" -b "$JAR" -c "$JAR" ;;
    sid) set -- "$@" -H "Cookie: sid=$SID" ;;
  esac
  set -- "$@" "$GATEWAY$rq_path"
  rq_code=$("$@" 2>/dev/null) || rq_code=''
  case $rq_code in
    [0-9][0-9][0-9]) ;;
    *) rq_code=000 ;;
  esac
  printf '%s' "$rq_code"
}

# Các hàm kiểm tra nội dung. Chạy sau khi req đã ghi $BODY.
check_array() {
  first=$(awk '{ sub(/^[ \t\r]+/, ""); if ($0 != "") { print substr($0, 1, 1); exit } }' "$BODY")
  [ "$first" = '[' ]
}
check_google_off() { grep -q '"google":false' "$BODY"; }
check_role() { grep -q "\"role\":\"$SMOKE_EXPECT_ROLE\"" "$BODY"; }
check_sid() { [ -n "$SID" ]; }

# Trích xuất và kiểm tra cho bước 16 đến 51. Id có thể là số hoặc chuỗi, script tự nhận.

# json_from <khóa>: in phần JSON trong $BODY từ lần xuất hiện đầu của khóa đó trở đi.
json_from() {
  awk -v k="\"$1\"" '
    f { print; next }
    { i = index($0, k); if (i > 0) { f = 1; print substr($0, i + length(k)) } }
  ' "$BODY"
}

# json_val <khóa>: đọc JSON từ stdin, in giá trị đầu tiên của khóa (chuỗi bỏ dấu nháy, hoặc số). Rỗng nếu không có.
json_val() {
  grep -o -E "\"$1\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|-?[0-9]+)" | head -n 1 |
    sed -e 's/^"[^"]*"[[:space:]]*:[[:space:]]*//' -e 's/^"//' -e 's/"$//'
}

# list_stats <chuỗi phải có trong mỗi phần tử, hoặc rỗng>: đọc JSON từ stdin, lấy mảng đầu tiên.
# In "<số phần tử mức đầu> <số phần tử không chứa chuỗi trên>".
list_stats() {
  awk -v need="$1" '
    BEGIN { depth = 0; inq = 0; started = 0; inel = 0; done = 0; total = 0; missing = 0; elem = "" }
    done { next }
    {
      s = $0 "\n"
      n = length(s)
      for (i = 1; i <= n; i++) {
        ch = substr(s, i, 1)
        if (inq) {
          if (inel) elem = elem ch
          if (ch == "\\") { i++; if (inel) elem = elem substr(s, i, 1) }
          else if (ch == "\"") inq = 0
          continue
        }
        if (ch == "\"") { inq = 1; if (inel) elem = elem ch; continue }
        if (!started) { if (ch == "[") { started = 1; depth = 1 }; continue }
        if (inel) elem = elem ch
        if (ch == "{" || ch == "[") {
          if (ch == "{" && depth == 1 && !inel) { total++; inel = 1; elem = "{" }
          depth++
        } else if (ch == "}" || ch == "]") {
          depth--
          if (ch == "}" && inel && depth == 1) {
            if (need != "" && index(elem, need) == 0) missing++
            inel = 0; elem = ""
          } else if (ch == "]" && depth == 0) {
            done = 1; break
          }
        }
      }
    }
    END { printf "%d %d\n", total, missing }
  '
}

# jlit <id>: in id dạng JSON. Số giữ nguyên, chuỗi được bọc dấu nháy.
jlit() {
  case $1 in
    ''|*[!0-9]*) printf '"%s"' "$(json_escape "$1")" ;;
    *) printf '%s' "$1" ;;
  esac
}

# miss <nhãn> <lý do>: không gửi yêu cầu được vì thiếu dữ liệu từ bước trước. Tính là FAIL.
miss() { fail "$1 (HTTP -, không gửi yêu cầu: $2)"; }

check_has_id() {
  if [ -z "$(json_val id < "$BODY")" ]; then CHK_WHY='không có trường id'; return 1; fi
  return 0
}
check_status_waiting() {
  grep -q -E '"status"[[:space:]]*:[[:space:]]*"waiting"' "$BODY" || { CHK_WHY='thiếu "status":"waiting"'; return 1; }
}
check_has_correct() {
  grep -q -E '"correct"[[:space:]]*:' "$BODY" || { CHK_WHY='thiếu trường correct'; return 1; }
}
check_has_score() {
  grep -q -E '"score"[[:space:]]*:' "$BODY" || { CHK_WHY='thiếu trường score'; return 1; }
}
check_quiz_round() {
  if [ -z "$(json_val roundId < "$BODY")" ]; then CHK_WHY='không có roundId'; return 1; fi
  cq_stats=$(json_from questions | list_stats '')
  cq_n=${cq_stats%% *}
  if [ "$cq_n" != 5 ]; then CHK_WHY="questions có $cq_n phần tử, kỳ vọng 5"; return 1; fi
  if json_from questions | grep -q -E '"(answer|answers|answerIndex|correct|correctIndex|correctChoice|isCorrect)"[[:space:]]*:'; then
    CHK_WHY='câu hỏi lộ trường đáp án'; return 1
  fi
  return 0
}
check_songs() {
  check_array || { CHK_WHY='không phải mảng JSON'; return 1; }
  cs_stats=$(list_stats '"notes":' < "$BODY")
  cs_n=${cs_stats%% *}
  cs_miss=${cs_stats##* }
  if [ "$cs_n" -lt 2 ]; then CHK_WHY="có $cs_n bài, cần ít nhất 2"; return 1; fi
  if [ "$cs_miss" -ne 0 ]; then CHK_WHY="$cs_miss bài thiếu notes"; return 1; fi
  return 0
}

# step <nhãn> <mã HTTP cho phép, cách nhau bằng khoảng trắng> <mã thực tế> [hàm kiểm tra nội dung]
# In PASS hoặc FAIL kèm mã HTTP. Trả về 0 nếu đạt.
step() {
  st_label=$1
  st_allowed=$2
  st_got=$3
  st_check=${4-}
  st_code_ok=0
  CHK_WHY=''
  for st_want in $st_allowed; do
    if [ "$st_got" = "$st_want" ]; then st_code_ok=1; fi
  done
  if [ "$st_code_ok" != 1 ]; then
    fail "$st_label (HTTP $st_got, kỳ vọng $st_allowed)"
    return 1
  fi
  if [ -n "$st_check" ] && ! $st_check; then
    if [ -n "$CHK_WHY" ]; then
      fail "$st_label (HTTP $st_got, $CHK_WHY)"
    else
      fail "$st_label (HTTP $st_got, điều kiện bổ sung không đạt)"
    fi
    return 1
  fi
  pass "$st_label (HTTP $st_got)"
  return 0
}

hint_register() {
  case $1 in
    409) say '      Gợi ý: email này đã có tài khoản (bình thường với tài khoản thử đã xác minh). Muốn kiểm tra đăng ký đầy đủ thì dùng email mới.' ;;
    429) say '      Gợi ý: vừa gửi mã cho email này. Đợi 60 giây rồi chạy lại.' ;;
    502) say '      Gợi ý: máy chủ chưa gửi được mail. Kiểm tra MAIL_MODE, SMTP_* và log của auth.' ;;
    000) say '      Gợi ý: không kết nối được gateway. Kiểm tra GATEWAY và SSH tunnel.' ;;
  esac
}

hint_verify() {
  case $1 in
    200) say '      Gợi ý: máy chủ không trả cookie sid. Nếu COOKIE_SECURE=true, cần truy cập qua HTTPS.' ;;
    400) say '      Gợi ý: mã sai hoặc đã hết hạn (10 phút). Dùng mã gửi gần nhất.' ;;
    409) say '      Gợi ý: email đã xác minh từ trước. Dùng email khác.' ;;
    429) say '      Gợi ý: nhập sai quá 5 lần. Cần mã mới: đăng ký lại sau 60 giây để nhận mã.' ;;
  esac
}

# hint_login <mã HTTP>: gợi ý khi đăng nhập bằng mật khẩu thất bại.
hint_login() {
  case $1 in
    401) say '      Gợi ý: sai SMOKE_PASSWORD hoặc SMOKE_EMAIL. Kiểm tra lại mật khẩu của tài khoản thử.' ;;
    409) say '      Gợi ý: tài khoản chưa xác minh. Chạy lại với SMOKE_OTP để xác minh trước.' ;;
    000) say '      Gợi ý: không kết nối được gateway. Kiểm tra GATEWAY và SSH tunnel.' ;;
  esac
}

# read_sid: đọc cookie sid từ cookie jar vào biến SID.
read_sid() {
  SID=$(awk '$6 == "sid" { v = $7 } END { print v }' "$JAR")
}

# Bước 6 đến 15: cần phiên đăng nhập. Có SMOKE_OTP thì bước 6 xác minh mã.
# Không có SMOKE_OTP thì bước 6 đăng nhập bằng SMOKE_PASSWORD (POST /api/auth/login).
session_steps() {
  if [ -n "$SMOKE_OTP" ]; then
    verify_json=$(printf '{"email":"%s","code":"%s"}' "$(json_escape "$SMOKE_EMAIL")" "$SMOKE_OTP")
    c=$(req POST /api/auth/verify "$verify_json" jar)
    read_sid
    if ! step '6. POST /api/auth/verify (nhận cookie sid)' 200 "$c" check_sid; then
      hint_verify "$c"
      skip_steps 13 'Bước 7 đến 15b: không có phiên đăng nhập'
      skip_steps 41 'Bước 16 đến 56: không có phiên đăng nhập'
      return 1
    fi
  else
    login_json=$(printf '{"email":"%s","password":"%s"}' \
      "$(json_escape "$SMOKE_EMAIL")" "$(json_escape "$SMOKE_PASSWORD")")
    c=$(req POST /api/auth/login "$login_json" jar)
    read_sid
    if ! step '6. POST /api/auth/login bằng SMOKE_PASSWORD (nhận cookie sid)' 200 "$c" check_sid; then
      hint_login "$c"
      skip_steps 13 'Bước 7 đến 15b: không có phiên đăng nhập'
      skip_steps 41 'Bước 16 đến 56: không có phiên đăng nhập'
      return 1
    fi
  fi

  c=$(req GET /api/auth/me '' jar)
  step "7. GET /api/auth/me (vai trò $SMOKE_EXPECT_ROLE)" 200 "$c" check_role

  c=$(req GET /api/it/services '' jar)
  step '8. GET /api/it/services (mảng JSON)' 200 "$c" check_array

  if [ "$SMOKE_EXPECT_ROLE" = employee ]; then want9=403; else want9=200; fi
  c=$(req GET /api/it/security/summary '' jar)
  step "9. GET /api/it/security/summary (kỳ vọng $want9)" "$want9" "$c"

  c=$(req GET /api/rooms '' jar)
  step '10a. GET /api/rooms (mảng JSON)' 200 "$c" check_array

  start_iso=$(utc_after 3600)
  end_iso=$(utc_after 10800)
  c=$(req GET "/api/rooms/free?start=$start_iso&end=$end_iso" '' jar)
  step '10b. GET /api/rooms/free (khung 2 giờ, bắt đầu sau 1 giờ)' 200 "$c" check_array

  room_id=$(grep -o '"id":"[^"]*"' "$BODY" | sed -n '1{s/^"id":"//;s/"$//;p;}')
  if [ -n "$room_id" ]; then
    book_json=$(printf '{"roomId":"%s","start":"%s","end":"%s","title":"Smoke test hop"}' \
      "$room_id" "$start_iso" "$end_iso")
    c=$(req POST /api/rooms/book "$book_json" jar)
    step "11a. POST /api/rooms/book (phòng $room_id)" 201 "$c"
    c=$(req POST /api/rooms/book "$book_json" jar)
    step '11b. POST /api/rooms/book lặp lại cùng khung giờ' 409 "$c"
  else
    fail '11a. POST /api/rooms/book: không có phòng để thử (bước 10b không trả danh sách phòng)'
    skip_steps 1 '11b. POST /api/rooms/book lặp lại: bỏ qua'
  fi

  kudos_json=$(printf '{"toName":"%s","message":"%s"}' 'Smoke Test' 'Smoke test')
  c=$(req POST /api/kudos "$kudos_json" jar)
  step '12a. POST /api/kudos' 201 "$c"
  c=$(req GET /api/kudos/board '' jar)
  step '12b. GET /api/kudos/board (mảng JSON)' 200 "$c" check_array

  c=$(req POST /api/it/tickets '{"category":"Khác","title":"smoke test","description":"","priority":"P3"}' jar)
  step '13. POST /api/it/tickets' 201 "$c"

  c=$(req GET /api/it/incidents/open '' jar)
  step '14. GET /api/it/incidents/open (mảng JSON)' 200 "$c" check_array

  new_steps
  more_steps
  layout_steps

  c=$(req POST /api/auth/logout '' jar)
  step '15a. POST /api/auth/logout' 200 "$c"
  c=$(req GET /api/auth/me '' sid)
  step '15b. GET /api/auth/me sau khi đăng xuất (phiên cũ phải hết hiệu lực)' 401 "$c"
  return 0
}

# utc_at <epoch>: đổi epoch sang dạng 2026-11-06T10:00:00Z (UTC). Dùng một mốc thời gian duy nhất để hai mốc cách nhau đúng.
utc_at() {
  date -u -d "@$1" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -r "$1" '+%Y-%m-%dT%H:%M:%SZ'
}

# Bước 16 đến 35: cần phiên đăng nhập. Chạy trước bước 15a vì 15a đăng xuất và hủy phiên.
new_steps() {
  # Caro
  c=$(req POST /api/games/caro/rooms '{"name":"Smoke caro"}' jar)
  step '16. POST /api/games/caro/rooms (201, có trường id)' 201 "$c" check_has_id
  caro_id=''
  if [ "$c" = 201 ]; then caro_id=$(json_val id < "$BODY"); fi

  c=$(req GET /api/games/caro/rooms '' jar)
  step '17. GET /api/games/caro/rooms (mảng JSON)' 200 "$c" check_array

  if [ -n "$caro_id" ]; then
    c=$(req POST "/api/games/caro/rooms/$caro_id/move" '{"row":0,"col":0}' jar)
    step "18. POST /api/games/caro/rooms/$caro_id/move khi chưa có người thứ hai (409)" 409 "$c"
    c=$(req GET "/api/games/caro/rooms/$caro_id" '' jar)
    step "19. GET /api/games/caro/rooms/$caro_id (status waiting)" 200 "$c" check_status_waiting
    c=$(req POST "/api/games/caro/rooms/$caro_id/leave" '' jar)
    step "20. POST /api/games/caro/rooms/$caro_id/leave" 200 "$c"
  else
    miss '18. POST /api/games/caro/rooms/<id>/move (409)' 'không có id phòng ở bước 16'
    miss '19. GET /api/games/caro/rooms/<id> (status waiting)' 'không có id phòng ở bước 16'
    miss '20. POST /api/games/caro/rooms/<id>/leave (200)' 'không có id phòng ở bước 16'
  fi

  # Đố vui
  c=$(req POST /api/games/quiz/round '' jar)
  step '21. POST /api/games/quiz/round (201, 5 câu, không có đáp án)' 201 "$c" check_quiz_round
  round_id=''
  q_id=''
  if [ "$c" = 201 ]; then
    round_id=$(json_val roundId < "$BODY")
    q_id=$(json_from questions | json_val id)
  fi
  if [ -z "$round_id" ]; then
    miss '22. POST /api/games/quiz/round/<roundId>/answer (có "correct")' 'không có roundId ở bước 21'
    miss '23. POST /api/games/quiz/round/<roundId>/finish (có "score")' 'không có roundId ở bước 21'
  else
    if [ -n "$q_id" ]; then
      qa_json="{\"questionId\":$(jlit "$q_id"),\"choice\":0}"
      c=$(req POST "/api/games/quiz/round/$round_id/answer" "$qa_json" jar)
      step "22. POST /api/games/quiz/round/$round_id/answer (có \"correct\")" 200 "$c" check_has_correct
    else
      miss '22. POST /api/games/quiz/round/<roundId>/answer (có "correct")' 'không có id câu hỏi đầu tiên ở bước 21'
    fi
    c=$(req POST "/api/games/quiz/round/$round_id/finish" '' jar)
    step "23. POST /api/games/quiz/round/$round_id/finish (có \"score\")" 200 "$c" check_has_score
  fi
  c=$(req GET '/api/games/leaderboard?kind=quiz' '' jar)
  step '24. GET /api/games/leaderboard?kind=quiz (mảng JSON)' 200 "$c" check_array

  # Karaoke
  c=$(req GET /api/karaoke/songs '' jar)
  step '25. GET /api/karaoke/songs (mảng, ít nhất 2 bài, mỗi bài có notes)' 200 "$c" check_songs
  song_id=''
  if [ "$c" = 200 ]; then song_id=$(json_val id < "$BODY"); fi
  if [ -n "$song_id" ]; then
    sc_id=$(jlit "$song_id")
    sc_ok="{\"songId\":$sc_id,\"score\":85,\"accuracy\":0.85,\"durationMs\":45000}"
    sc_bad="{\"songId\":$sc_id,\"score\":150,\"accuracy\":0.85,\"durationMs\":45000}"
    c=$(req POST /api/karaoke/scores "$sc_ok" jar)
    step '26. POST /api/karaoke/scores (score 85)' 201 "$c"
    c=$(req POST /api/karaoke/scores "$sc_bad" jar)
    step '27. POST /api/karaoke/scores (score 150, kỳ vọng bị từ chối)' 400 "$c"
  else
    miss '26. POST /api/karaoke/scores (201)' 'không có id bài hát ở bước 25'
    miss '27. POST /api/karaoke/scores (score 150, 400)' 'không có id bài hát ở bước 25'
  fi
  c=$(req GET /api/karaoke/leaderboard '' jar)
  step '28. GET /api/karaoke/leaderboard (mảng JSON)' 200 "$c" check_array
  c=$(req GET /api/karaoke/me/history '' jar)
  step '29. GET /api/karaoke/me/history (mảng JSON)' 200 "$c" check_array

  # Sự kiện
  c=$(req GET /api/events '' jar)
  step '30. GET /api/events (mảng JSON)' 200 "$c" check_array

  if [ "$SMOKE_EXPECT_ROLE" = employee ]; then want31=403; else want31=201; fi
  ev_base=$(date -u +%s)
  ev_start=$(utc_at $((ev_base + 90000)))
  ev_end=$(utc_at $((ev_base + 97200)))
  ev_json=$(printf '{"title":"Smoke event","description":"Smoke test","startsAt":"%s","endsAt":"%s"}' "$ev_start" "$ev_end")
  c=$(req POST /api/events "$ev_json" jar)
  step "31. POST /api/events (kỳ vọng $want31)" "$want31" "$c"
  ev_id=''
  if [ "$c" = 201 ]; then ev_id=$(json_val id < "$BODY"); fi

  if [ "$SMOKE_EXPECT_ROLE" = employee ]; then
    skip_steps 4 '32 đến 35: vai trò employee không tạo được sự kiện nên không chạy'
  elif [ -z "$ev_id" ]; then
    miss '32. POST /api/events/<id>/programs (201)' 'không tạo được sự kiện ở bước 31'
    miss '33. POST /api/events/<id>/vote (201)' 'không tạo được sự kiện ở bước 31'
    miss '34. POST /api/events/<id>/vote lặp lại (409)' 'không tạo được sự kiện ở bước 31'
    miss '35. GET /api/events/<id>/results (200)' 'không tạo được sự kiện ở bước 31'
  else
    c=$(req POST "/api/events/$ev_id/programs" '{"performer":"Smoke Tester","title":"Tiết mục thử","kind":"singing","durationMin":3}' jar)
    step "32. POST /api/events/$ev_id/programs (201)" 201 "$c"
    pg_id=''
    if [ "$c" = 201 ]; then pg_id=$(json_val id < "$BODY"); fi
    if [ -n "$pg_id" ]; then
      vote_json="{\"programId\":$(jlit "$pg_id")}"
      c=$(req POST "/api/events/$ev_id/vote" "$vote_json" jar)
      step "33. POST /api/events/$ev_id/vote (201)" 201 "$c"
      c=$(req POST "/api/events/$ev_id/vote" "$vote_json" jar)
      step "34. POST /api/events/$ev_id/vote lặp lại (409)" 409 "$c"
    else
      miss '33. POST /api/events/<id>/vote (201)' 'không có id tiết mục ở bước 32'
      miss '34. POST /api/events/<id>/vote lặp lại (409)' 'không có id tiết mục ở bước 32'
    fi
    c=$(req GET "/api/events/$ev_id/results" '' jar)
    step "35. GET /api/events/$ev_id/results (it/admin: 200)" 200 "$c"
  fi
}

# json_first_char <khóa>: in ký tự đầu của giá trị khóa trong $BODY ('[' hoặc '{'). Rỗng nếu không có.
json_first_char() {
  json_from "$1" | sed -e 's/^[[:space:]]*:[[:space:]]*//' | head -n 1 | cut -c1
}

check_display_state() {
  for ds_key in tvs boards channels; do
    grep -q "\"$ds_key\"[[:space:]]*:" "$BODY" || { CHK_WHY="thiếu khoá $ds_key"; return 1; }
  done
  return 0
}
check_on_true() {
  grep -q -E '"on"[[:space:]]*:[[:space:]]*true' "$BODY" || { CHK_WHY='thiếu "on":true'; return 1; }
}
check_has_version() {
  grep -q -E '"version"[[:space:]]*:' "$BODY" || { CHK_WHY='thiếu trường version'; return 1; }
}
check_stream_lines() {
  grep -q -E 'state|data' "$BODY" || { CHK_WHY='2 giây đầu không có dòng state hoặc data'; return 1; }
}
check_plants_five() {
  [ "$(json_first_char plants)" = '[' ] || { CHK_WHY='khoá plants không phải mảng'; return 1; }
  cp_stats=$(json_from plants | list_stats '')
  cp_n=${cp_stats%% *}
  if [ "$cp_n" != 5 ]; then CHK_WHY="plants có $cp_n phần tử, kỳ vọng 5"; return 1; fi
  return 0
}
check_log_array() {
  [ "$(json_first_char log)" = '[' ] || { CHK_WHY='khoá log không phải mảng'; return 1; }
  return 0
}

# Bước 36 đến 51: màn hình hiển thị (36 đến 42), cây trồng (43 đến 47), đăng ký và đăng nhập (48 đến 51).
# Bước 36 đến 47 cần phiên đăng nhập (cookie jar). Bước 48 đến 51 không cần phiên nên không dùng jar.
# Chạy trước bước 15a vì 15a đăng xuất và hủy phiên.
more_steps() {
  # Màn hình hiển thị
  c=$(req GET /api/display/state '' jar)
  step '36. GET /api/display/state (có tvs, boards, channels)' 200 "$c" check_display_state

  c=$(req POST /api/display/tv/tv_lobby '{"on":true,"channel":2}' jar)
  step '37a. POST /api/display/tv/tv_lobby bật (có "on":true)' 200 "$c" check_on_true
  c=$(req POST /api/display/tv/tv_lobby '{"on":false}' jar)
  step '37b. POST /api/display/tv/tv_lobby tắt' 200 "$c"

  c=$(req POST /api/display/tv/khong_co '{"on":true}' jar)
  step '38. POST /api/display/tv/khong_co (404)' 404 "$c"

  c=$(req POST /api/display/board/whiteboard_mr1/strokes '{"points":[[0.1,0.1],[0.2,0.2]],"color":"#1f6feb","width":3}' jar)
  step '39. POST /api/display/board/whiteboard_mr1/strokes (201, có version)' 201 "$c" check_has_version

  c=$(req POST /api/display/board/whiteboard_mr1/strokes '{"points":[],"color":"xyz","width":3}' jar)
  step '40. POST /api/display/board/whiteboard_mr1/strokes màu sai (400)' 400 "$c"

  if [ "$SMOKE_EXPECT_ROLE" = employee ]; then want41=403; else want41=200; fi
  c=$(req POST /api/display/board/whiteboard_mr1/clear '' jar)
  step "41. POST /api/display/board/whiteboard_mr1/clear (kỳ vọng $want41)" "$want41" "$c"

  # Luồng SSE: curl chạy tối đa 2 giây rồi tự dừng, phần đã nhận nằm trong $BODY.
  ds_code=$(curl -s -N --connect-timeout 5 --max-time 2 -H 'Accept: text/event-stream' \
    -b "$JAR" -o "$BODY" -w '%{http_code}' "$GATEWAY/api/display/stream" 2>/dev/null)
  case $ds_code in
    [0-9][0-9][0-9]) ;;
    *) ds_code=000 ;;
  esac
  step '42. GET /api/display/stream (2 giây đầu có dòng state hoặc data)' 200 "$ds_code" check_stream_lines

  # Cây trồng
  c=$(req GET /api/plants/state '' jar)
  step '43. GET /api/plants/state (plants là mảng đúng 5 phần tử)' 200 "$c" check_plants_five
  plant_id=''
  if [ "$c" = 200 ]; then plant_id=$(json_from plants | json_val id); fi

  if [ -n "$plant_id" ]; then
    c=$(req POST "/api/plants/$plant_id/care" '{"action":"water"}' jar)
    step "44. POST /api/plants/$plant_id/care action water (200 hoặc 409 hồi chiêu)" '200 409' "$c"
    c=$(req POST "/api/plants/$plant_id/care" '{"action":"khong_hop_le"}' jar)
    step "45. POST /api/plants/$plant_id/care action không hợp lệ (400)" 400 "$c"
    c=$(req GET "/api/plants/$plant_id/log" '' jar)
    step "46. GET /api/plants/$plant_id/log (khoá log là mảng)" 200 "$c" check_log_array
  else
    miss '44. POST /api/plants/<id>/care action water (200 hoặc 409)' 'không có id cây ở bước 43'
    miss '45. POST /api/plants/<id>/care action không hợp lệ (400)' 'không có id cây ở bước 43'
    miss '46. GET /api/plants/<id>/log (khoá log là mảng)' 'không có id cây ở bước 43'
  fi
  c=$(req POST /api/plants/khong_co/care '{"action":"water"}' jar)
  step '47. POST /api/plants/khong_co/care (404)' 404 "$c"

  # Đăng ký và đăng nhập: không cần phiên, không dùng cookie jar.
  ob_email="smoke-$(date +%s)@example.com"
  ob_json=$(printf '{"email":"%s","name":"Smoke Test"}' "$(json_escape "$ob_email")")
  c=$(req POST /api/auth/register "$ob_json" none)
  step '48. POST /api/auth/register không có password (201)' 201 "$c"
  hint_register "$c"

  ob_pw_email="smoke-$(date +%s)-pw@example.com"
  ob_pw_json=$(printf '{"email":"%s","password":"%s","name":"Smoke Test"}' \
    "$(json_escape "$ob_pw_email")" 'Smoke-Test-Pass-2026')
  c=$(req POST /api/auth/register "$ob_pw_json" none)
  case $c in
    201) pass '49. POST /api/auth/register có trường password (HTTP 201: backend bỏ qua trường password)' ;;
    400) pass '49. POST /api/auth/register có trường password (HTTP 400: backend từ chối yêu cầu có trường password)' ;;
    *) fail "49. POST /api/auth/register có trường password (HTTP $c, kỳ vọng 201 hoặc 400)" ;;
  esac

  c=$(req POST /api/auth/password '{"password":"ngan"}' none)
  step '50. POST /api/auth/password không có phiên tạm (401 hoặc 403)' '401 403' "$c"

  ob_login=$(printf '{"email":"%s","password":"sai-mat-khau-123"}' "$(json_escape "$ob_email")")
  c=$(req POST /api/auth/login "$ob_login" none)
  step '51. POST /api/auth/login sai mật khẩu (401 hoặc 409, chưa xác minh)' '401 409' "$c"
}

# Kiểm tra cấu trúc của layout/state: có các khoá items, defaults và version.
check_layout_state() {
  for cl_key in items defaults version; do
    grep -q "\"$cl_key\"[[:space:]]*:" "$BODY" || { CHK_WHY="thiếu khoá $cl_key"; return 1; }
  done
  return 0
}

# Bước 52 đến 56: dịch vụ layout (qua gateway /api/layout). Cần phiên đăng nhập.
# 52 chỉ đọc. 53 và 54 bị từ chối nên không ghi. 55 ghi bố cục nên chỉ chạy khi SMOKE_WRITE=1.
# 56 với it/admin đặt lại bố cục thật về mặc định.
layout_steps() {
  c=$(req GET /api/layout/state '' jar)
  step '52. GET /api/layout/state (có items, defaults, version)' 200 "$c" check_layout_state

  c=$(req POST /api/layout/move '{"id":"desk_L1","x":0,"z":0,"rotation":0}' jar)
  step '53. POST /api/layout/move desk_L1 (bàn làm việc không được di chuyển, kỳ vọng 403)' 403 "$c"

  c=$(req POST /api/layout/move '{"id":"service_desk","x":999,"z":0,"rotation":0}' jar)
  step '54. POST /api/layout/move service_desk ngoài sàn (kỳ vọng 409 hoặc 400)' '409 400' "$c"

  if [ "$SMOKE_WRITE" = 1 ]; then
    c=$(req POST /api/layout/move '{"id":"plant_north","x":0,"z":0,"rotation":0}' jar)
    step '55. POST /api/layout/move plant_north gần gốc (GHI DỮ LIỆU, kỳ vọng 409 hoặc 200)' '409 200' "$c"
  else
    skip_steps 1 '55. POST /api/layout/move plant_north: bỏ qua, bước này ghi dữ liệu nên cần SMOKE_WRITE=1'
  fi

  if [ "$SMOKE_EXPECT_ROLE" = employee ]; then want56=403; else want56=200; fi
  c=$(req POST /api/layout/reset '' jar)
  step "56. POST /api/layout/reset (kỳ vọng $want56)" "$want56" "$c"
}

say "Kiểm thử nhanh qua $GATEWAY, vai trò kỳ vọng: $SMOKE_EXPECT_ROLE"
say ''

# Bước 1 đến 5: không cần đăng nhập.
c=$(req GET /api/health '' none)
step '1. GET /api/health' 200 "$c"

c=$(req GET /api/auth/providers '' none)
step '2. GET /api/auth/providers (có "google":false)' 200 "$c" check_google_off

c=$(req GET /api/auth/me '' none)
step '3. GET /api/auth/me khi chưa đăng nhập' 401 "$c"

c=$(req GET /api/it/services '' none)
step '4. GET /api/it/services khi chưa đăng nhập' 401 "$c"

register_json=$(printf '{"email":"%s","password":"%s","name":"Smoke Test"}' \
  "$(json_escape "$SMOKE_EMAIL")" "$(json_escape "$SMOKE_PASSWORD")")
c=$(req POST /api/auth/register "$register_json" none)
step '5. POST /api/auth/register' '201 409' "$c"
hint_register "$c"

if [ -n "$SMOKE_OTP" ]; then
  say ''
  say 'Đăng nhập bằng SMOKE_OTP ở bước 6 (xác minh mã).'
else
  say ''
  say 'Không có SMOKE_OTP: đăng nhập bằng SMOKE_PASSWORD ở bước 6.'
fi
session_steps

say ''
printf 'Tổng kết: %s PASS, %s FAIL, %s SKIP\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -ne 0 ]; then
  say 'KẾT QUẢ: KHÔNG ĐẠT'
  exit 1
fi
if [ "$SKIP" -ne 0 ]; then
  say 'KẾT QUẢ: ĐẠT CÁC BƯỚC ĐÃ CHẠY, CHƯA ĐẦY ĐỦ (còn bước bị bỏ qua)'
  exit 0
fi
say 'KẾT QUẢ: ĐẠT'
exit 0
