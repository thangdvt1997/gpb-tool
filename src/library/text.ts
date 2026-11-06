/** Chuẩn hoá chuỗi để tìm kiếm không dấu tiếng Việt. */
export function foldVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách truy vấn thành các từ đã chuẩn hoá; mọi từ phải khớp (AND). */
export function queryTokens(q: string): string[] {
  const f = foldVietnamese(q);
  return f ? f.split(' ') : [];
}

export function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return 'không rõ';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
