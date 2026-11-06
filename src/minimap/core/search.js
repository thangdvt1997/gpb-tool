// Tìm phòng, mã phòng, bàn theo dữ liệu layout thật (it.json). Không thêm tên hay mục nào ngoài dữ liệu.

/** Chuẩn hóa để so khớp: chữ thường, bỏ dấu tiếng Việt (đ -> d), gộp khoảng trắng, '_' và '-' thành khoảng trắng. */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dựng chỉ mục từ danh sách mục có sẵn.
 * @param items [{ id, label, kind, category, squad?, capacity?, rect, center }]
 */
export function buildSearchIndex(items) {
  return items
    .filter((it) => it && typeof it.id === 'string' && it.id.length > 0)
    .map((it) => ({
      item: it,
      id: normalizeText(it.id),
      idRaw: String(it.id).toLowerCase(),
      label: normalizeText(it.label),
      squad: normalizeText(it.squad ?? ''),
    }));
}

function wordPrefix(text, q) {
  if (text.startsWith(q)) return true;
  return text.includes(' ' + q);
}

function scoreEntry(e, q) {
  if (e.idRaw === q || e.id === q) return 100;
  if (e.id.startsWith(q)) return 85;
  if (e.label === q) return 80;
  if (e.label.startsWith(q)) return 70;
  if (wordPrefix(e.label, q)) return 60;
  if (e.label.includes(q)) return 45;
  if (e.squad && wordPrefix(e.squad, q)) return 40;
  if (e.squad && e.squad.includes(q)) return 30;
  if (e.id.includes(q)) return 25;
  // Mọi từ trong truy vấn đều có trong nhãn, squad hoặc id (không theo thứ tự).
  const words = q.split(' ').filter(Boolean);
  if (words.length > 1) {
    const hay = `${e.id} ${e.label} ${e.squad}`;
    if (words.every((w) => hay.includes(w))) return 20;
  }
  return 0;
}

/**
 * Tìm. Truy vấn rỗng trả về []. Không có dữ liệu trả về [].
 * Kết quả sắp theo điểm giảm dần, cùng điểm thì theo nhãn.
 */
export function searchIndex(index, query, limit = 20) {
  const q = normalizeText(query);
  if (!q || index.length === 0) return [];
  const hits = [];
  for (const e of index) {
    const s = scoreEntry(e, q);
    if (s > 0) hits.push({ score: s, item: e.item });
  }
  hits.sort((a, b) => b.score - a.score || String(a.item.label).localeCompare(String(b.item.label), 'vi'));
  return hits.slice(0, limit).map((h) => h.item);
}
