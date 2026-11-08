/** ZIP tối giản (chỉ "store", không nén) kèm CRC32, tự viết để không thêm dependency. */

export const ZIP_MAX_ENTRIES = 64;

let table: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Tên an toàn: tương đối, không "..", không ký tự điều khiển hay "\\", dài <= 200. */
export function isSafeZipName(name: string): boolean {
  if (name.length === 0 || name.length > 200 || name.startsWith('/') || name.includes('\\') || name.includes(':')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return false;
  return !name.split('/').some((p) => p === '..' || p === '' || p === '.');
}

const enc = new TextEncoder();
// Mốc thời gian cố định (1980-01-01) để đầu ra xác định.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function buildZip(files: readonly ZipFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    if (!isSafeZipName(f.name)) throw new Error(`Tên tệp ZIP không an toàn: ${f.name}`);
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length);
    const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // UTF-8
    v.setUint16(8, 0, true); // store
    v.setUint16(10, DOS_TIME, true);
    v.setUint16(12, DOS_DATE, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.data.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    ch.set(name, 46);
    chunks.push(lh, f.data);
    central.push(ch);
    offset += lh.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export type ReadZipResult = { ok: true; files: ZipFile[] } | { ok: false; error: string };

export function isZipBytes(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** Đọc ZIP store-only. Từ chối: sai chữ ký, nén, mã hóa, ZIP64, tên không an toàn, quá giới hạn, CRC sai. */
export function readZip(bytes: Uint8Array, opts: { maxTotalBytes: number; maxEntries?: number }): ReadZipResult {
  const maxEntries = opts.maxEntries ?? ZIP_MAX_ENTRIES;
  if (!isZipBytes(bytes)) return { ok: false, error: 'Không phải tệp ZIP hợp lệ.' };
  if (bytes.length > opts.maxTotalBytes + 1024 * 1024) return { ok: false, error: 'Tệp ZIP quá lớn.' };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, error: 'ZIP hỏng: không thấy bảng thư mục cuối.' };
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) return { ok: false, error: 'ZIP64 không được hỗ trợ.' };
  if (count > maxEntries) return { ok: false, error: `ZIP có quá nhiều mục (tối đa ${maxEntries}).` };
  if (cdOff + cdSize > eocd) return { ok: false, error: 'ZIP hỏng: bảng thư mục sai vị trí.' };
  const files: ZipFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return { ok: false, error: 'ZIP hỏng: mục thư mục sai.' };
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    if (p + 46 + nlen > bytes.length) return { ok: false, error: 'ZIP hỏng: tên tệp vượt dữ liệu.' };
    const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 1) return { ok: false, error: 'ZIP mã hóa không được hỗ trợ.' };
    if (method !== 0) return { ok: false, error: 'ZIP nén không được hỗ trợ (chỉ nhận gói do ứng dụng này xuất).' };
    if (csize !== usize) return { ok: false, error: 'ZIP hỏng: kích thước không khớp.' };
    if (!isSafeZipName(name)) return { ok: false, error: `Tên tệp trong ZIP không an toàn: ${name.slice(0, 60)}` };
    if (seen.has(name)) return { ok: false, error: `ZIP có tên trùng: ${name}` };
    seen.add(name);
    total += usize;
    if (total > opts.maxTotalBytes) return { ok: false, error: 'Nội dung ZIP quá lớn.' };
    if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== 0x04034b50) return { ok: false, error: 'ZIP hỏng: tiêu đề tệp sai.' };
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (start + usize > cdOff) return { ok: false, error: 'ZIP hỏng: dữ liệu tệp vượt phạm vi.' };
    const data = bytes.slice(start, start + usize);
    if (crc32(data) !== crc) return { ok: false, error: `ZIP hỏng: CRC32 sai ở "${name}".` };
    files.push({ name, data });
  }
  return { ok: true, files };
}
