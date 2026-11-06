// Bộ lọc từ tục tiếng Việt. File này giống hệt nhau ở ba service (auth, it, events). Sửa một nơi thì sửa cả ba.
//
// findBlocked(text) trả về từ bị chặn đầu tiên (đúng như trong danh sách), hoặc null nếu sạch.
//
// Cách làm:
// - Chữ thường, NFC. Có hai dạng: "có dấu" (giữ nguyên dấu, đ) và "không dấu" (NFD, bỏ dấu, đ -> d).
// - So khớp theo từ (và cụm 2-3 từ liền nhau), không khớp chuỗi con.
// - Ký tự phân cách xen giữa chữ (d.m, c*c, d_i_t) được thử theo hai cách: coi là khoảng trắng, và xóa đi.
//   Chuỗi chữ đơn cách nhau bằng khoảng trắng (v c l) được ghép lại.
// - Ký tự lặp liên tiếp rút về một (địttttt -> địt). Danh sách cũng được rút gọn như vậy khi nạp.
// - Từ nhập nhằng khi bỏ dấu (ví dụ "buổi", "đeo", "các") chỉ nằm trong danh sách "có dấu":
//   chỉ khớp khi người dùng gõ đúng dấu, nên "buổi sáng", "đeo kính", "các bạn" không bị chặn.

// Khớp cả khi gõ không dấu. Chỉ chứa từ không trùng từ thường dùng sau khi bỏ dấu.
const PLAIN_WORDS = [
  'dit', 'dcm', 'dcmm', 'dmm', 'dkm', 'dume', 'loz', 'concac', 'concak', 'cailon',
  'vcl', 'vkl', 'vclm', 'khon nan', 'chet tiet', 'me kiep', 'suc sinh',
  'fuck', 'fuk', 'fck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'asshole', 'cunt',
];

// Chỉ khớp khi có đúng dấu như viết ở đây. Mọi mục đều chứa ít nhất một dấu hoặc chữ đ.
const ACCENTED_WORDS = [
  'cặc', 'lồn', 'buồi', 'đéo', 'đĩ', 'điếm', 'đụ', 'đù má', 'đù mẹ', 'đm',
  'chó chết', 'chó đẻ', 'óc chó', 'mất dạy', 'khốn kiếp', 'cứt', 'chịch', 'nứng',
];

const MAX_PHRASE = 3;

function collapse(token) {
  return token.replace(/(\p{L})\1+/gu, '$1');
}

function toPlain(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').normalize('NFC');
}

// Trả về mảng token đã rút gọn ký tự lặp, đã ghép chuỗi chữ đơn.
function tokenize(s, removeSeparators) {
  let t = s;
  if (removeSeparators) {
    t = t.replace(/(?<=[\p{L}\p{M}\p{N}])[^\p{L}\p{M}\p{N}\s]+(?=[\p{L}\p{M}\p{N}])/gu, '');
  }
  const raw = t.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  const joined = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) joined.push(run.join(''));
    else joined.push(...run);
    run = [];
  };
  for (const tok of raw) {
    if (Array.from(tok).length === 1 && /^\p{L}$/u.test(tok)) run.push(tok);
    else {
      flush();
      joined.push(tok);
    }
  }
  flush();
  return joined.map(collapse);
}

function buildSet(words, plain) {
  const map = new Map();
  for (const w of words) {
    const key = tokenize(plain ? toPlain(w.toLowerCase()) : w.normalize('NFC').toLowerCase(), false).join(' ');
    if (!map.has(key)) map.set(key, w);
  }
  return map;
}

const PLAIN_MAP = buildSet(PLAIN_WORDS, true);
const ACCENTED_MAP = buildSet(ACCENTED_WORDS, false);

function scan(tokens, map) {
  for (let i = 0; i < tokens.length; i += 1) {
    for (let len = 1; len <= MAX_PHRASE && i + len <= tokens.length; len += 1) {
      const hit = map.get(tokens.slice(i, i + len).join(' '));
      if (hit) return hit;
    }
  }
  return null;
}

export function findBlocked(text) {
  if (typeof text !== 'string' || text === '') return null;
  const base = text.normalize('NFC').toLowerCase();
  const plain = toPlain(base);
  for (const removeSeparators of [false, true]) {
    const hit =
      scan(tokenize(base, removeSeparators), ACCENTED_MAP) ||
      scan(tokenize(plain, removeSeparators), PLAIN_MAP);
    if (hit) return hit;
  }
  return null;
}
