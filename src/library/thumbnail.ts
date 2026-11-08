/**
 * Ảnh thu nhỏ tĩnh cho mục thư viện (task 18). Không render WebGL.
 * - Mục có GLB trong manifest: SVG sinh sẵn lúc build bằng scripts/assets/gen-thumbs.ts, nằm ở /thumbs/<id>.svg.
 * - Mục dựng bằng mã / tự tải lên: SVG biểu tượng theo loại + màu, nhúng thẳng bằng data URL.
 * Hàm sinh SVG là thuần, dùng chung cho script và giao diện.
 */
import { KIND_LABELS, type LibraryItem, type LibraryKind } from './types';

export const THUMB_SIZE = 56;
export const THUMBS_BASE = '/thumbs/';

/** Băm chuỗi ổn định (FNV-1a 32 bit). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Màu nền theo id (HSL, độ sáng thấp hợp nền tối của panel). Xác định theo id. */
export function colorForId(id: string): string {
  const hue = hashString(id) % 360;
  return `hsl(${hue} 45% 38%)`;
}

const ICONS: Record<LibraryKind, string> = {
  // người: đầu + thân
  character: '<circle cx="28" cy="19" r="7"/><path d="M14 44c0-9 6-14 14-14s14 5 14 14z"/>',
  // áo
  outfit: '<path d="M19 12l-9 7 5 7 4-3v21h18V23l4 3 5-7-9-7c-1 4-4 6-9 6s-8-2-9-6z"/>',
  // kính/mũ: vành mũ
  accessory: '<path d="M14 34c0-10 6-17 14-17s14 7 14 17z"/><rect x="9" y="34" width="38" height="5" rx="2.5"/>',
  // ghế/bàn: mặt bàn + chân
  furniture: '<rect x="9" y="19" width="38" height="6" rx="2"/><rect x="13" y="25" width="5" height="19"/><rect x="38" y="25" width="5" height="19"/>',
  // hộp
  prop: '<path d="M28 10l17 8v20l-17 8-17-8V18z"/>',
  // nốt chạy/tam giác phát
  animation: '<path d="M20 12l24 16-24 16z"/>',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** SVG vuông THUMB_SIZE x THUMB_SIZE: nền màu + biểu tượng theo loại. Có <title> tiếng Việt. */
export function thumbnailSvg(kind: LibraryKind, color: string, title?: string): string {
  const t = esc(title ?? KIND_LABELS[kind]);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_SIZE}" height="${THUMB_SIZE}" viewBox="0 0 56 56" role="img">` +
    `<title>${t}</title><rect width="56" height="56" rx="8" fill="${esc(color)}"/>` +
    `<g fill="#ffffff" fill-opacity="0.88">${ICONS[kind]}</g></svg>`
  );
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Tên tệp thumbnail tĩnh cho một assetId của manifest (an toàn cho đường dẫn). */
export function thumbFileName(assetId: string): string {
  return `${assetId.replace(/[^A-Za-z0-9._-]/g, '_')}.svg`;
}

export interface Thumbnail {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export function thumbnailFor(item: LibraryItem): Thumbnail {
  const alt = `Ảnh minh họa ${KIND_LABELS[item.kind].toLowerCase()} ${item.name}`;
  const src =
    item.source === 'manifest' && item.file
      ? THUMBS_BASE + thumbFileName(item.id)
      : svgDataUrl(thumbnailSvg(item.kind, colorForId(item.id), item.name));
  return { src, alt, width: THUMB_SIZE, height: THUMB_SIZE };
}
