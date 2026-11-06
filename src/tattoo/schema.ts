/**
 * Mô hình dữ liệu hình xăm vẽ tay: tài liệu gồm các lớp, mỗi lớp có nét vẽ (stroke) và con dấu mẫu (stamp).
 * Không có ảnh tải lên: mọi thứ là số liệu nhỏ (điểm UV, màu trong bảng mực) nên lưu JSON được.
 * Mọi đầu vào (kể cả dữ liệu lưu cũ hoặc bị sửa tay) đi qua sanitizeDoc: kẹp số, ép màu về bảng, cắt giới hạn.
 */
import { INK_PALETTE, snapToPalette } from '../fashion/palette';
import type { HexColor } from '../fashion/types';
import { TATTOO_REGIONS, type Side, type SkinRegion } from './regions';

export const TATTOO_DOC_VERSION = 2;

export const PAINT_LIMITS = {
  maxLayers: 8,
  maxItems: 200,
  maxPointsPerStroke: 2000,
  maxTotalPoints: 20000,
  maxJsonBytes: 256 * 1024,
  maxTextLength: 20,
  brush: { min: 0.002, max: 0.03 },
  opacity: { min: 0.1, max: 1 },
  scale: { min: 0.2, max: 2.5 },
  maxNameLength: 24,
} as const;

export const DEFAULT_INK: HexColor = INK_PALETTE[0].hex;

export interface StrokeItem {
  type: 'stroke';
  id: string;
  region: SkinRegion;
  side: Side | null;
  /** Dãy phẳng [u0, v0, u1, v1, ...] trong 0..1. */
  points: number[];
  /** Bán kính cọ theo đơn vị UV (độc lập độ phân giải canvas). */
  size: number;
  opacity: number;
  ink: HexColor;
  /** Nét tẩy: xoá mọi thứ vẽ trước đó trong cùng lớp. */
  erase: boolean;
}

export interface StampItem {
  type: 'stamp';
  id: string;
  /** Id mẫu trong templates.ts, hoặc 'text'. */
  templateId: string;
  /** Nội dung khi templateId = 'text'. */
  text: string;
  region: SkinRegion;
  side: Side | null;
  u: number;
  v: number;
  /** Góc xoay (radian, -PI..PI). */
  rotation: number;
  scale: number;
  flipX: boolean;
  opacity: number;
  ink: HexColor;
}

export type TattooItem = StrokeItem | StampItem;

export interface TattooLayer {
  id: string;
  name: string;
  visible: boolean;
  items: TattooItem[];
}

export interface TattooDoc {
  version: number;
  layers: TattooLayer[];
}

export function emptyDoc(): TattooDoc {
  return { version: TATTOO_DOC_VERSION, layers: [{ id: 'L1', name: 'Lớp 1', visible: true, items: [] }] };
}

const num = (x: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : d;
  return Math.min(hi, Math.max(lo, n));
};
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const isRegion = (r: unknown): r is SkinRegion => typeof r === 'string' && (TATTOO_REGIONS as readonly string[]).includes(r);
const cleanId = (x: unknown, fb: string): string => (typeof x === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(x) ? x : fb);

/** Bỏ ký tự điều khiển, cắt độ dài. Không bao giờ dùng làm HTML (chỉ vẽ lên canvas). */
export function cleanText(x: unknown): string {
  if (typeof x !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, PAINT_LIMITS.maxTextLength);
}

export function sanitizeItem(raw: unknown, fallbackId: string): TattooItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isRegion(o.region)) return null;
  const side: Side | null = o.side === 'left' || o.side === 'right' ? o.side : null;
  const ink = snapToPalette(o.ink, INK_PALETTE, DEFAULT_INK);
  const opacity = num(o.opacity, PAINT_LIMITS.opacity.min, PAINT_LIMITS.opacity.max, 1);
  const id = cleanId(o.id, fallbackId);
  if (o.type === 'stroke') {
    if (!Array.isArray(o.points)) return null;
    const pts: number[] = [];
    const n = Math.min(o.points.length - (o.points.length % 2), PAINT_LIMITS.maxPointsPerStroke * 2);
    for (let i = 0; i < n; i++) pts.push(r4(num(o.points[i], 0, 1, 0)));
    if (pts.length < 2) return null;
    return {
      type: 'stroke', id, region: o.region, side, points: pts,
      size: num(o.size, PAINT_LIMITS.brush.min, PAINT_LIMITS.brush.max, 0.008), opacity, ink, erase: o.erase === true,
    };
  }
  if (o.type === 'stamp') {
    const templateId = typeof o.templateId === 'string' ? o.templateId.slice(0, 32) : '';
    if (!templateId) return null;
    const text = cleanText(o.text);
    if (templateId === 'text' && !text) return null;
    return {
      type: 'stamp', id, templateId, text, region: o.region, side,
      u: r4(num(o.u, 0, 1, 0.5)), v: r4(num(o.v, 0, 1, 0.5)),
      rotation: r4(num(o.rotation, -Math.PI, Math.PI, 0)),
      scale: num(o.scale, PAINT_LIMITS.scale.min, PAINT_LIMITS.scale.max, 1),
      flipX: o.flipX === true, opacity, ink,
    };
  }
  return null;
}

/** Chuẩn hoá một tài liệu bất kỳ (đã ở phiên bản hiện tại) về dạng hợp lệ trong giới hạn. */
export function sanitizeDoc(raw: unknown): TattooDoc {
  const out: TattooDoc = { version: TATTOO_DOC_VERSION, layers: [] };
  const layers = raw && typeof raw === 'object' && Array.isArray((raw as TattooDoc).layers) ? (raw as TattooDoc).layers : [];
  let items = 0;
  let points = 0;
  for (const l of layers.slice(0, PAINT_LIMITS.maxLayers)) {
    if (!l || typeof l !== 'object') continue;
    const lo = l as unknown as Record<string, unknown>;
    const layer: TattooLayer = {
      id: cleanId(lo.id, `L${out.layers.length + 1}`),
      name: (typeof lo.name === 'string' ? lo.name.replace(/[\u0000-\u001f]/g, '') : '').slice(0, PAINT_LIMITS.maxNameLength) || `Lớp ${out.layers.length + 1}`,
      visible: lo.visible !== false,
      items: [],
    };
    const src = Array.isArray(lo.items) ? lo.items : [];
    for (const it of src) {
      if (items >= PAINT_LIMITS.maxItems) break;
      const s = sanitizeItem(it, `i${items + 1}`);
      if (!s) continue;
      if (s.type === 'stroke') {
        if (points + s.points.length / 2 > PAINT_LIMITS.maxTotalPoints) break;
        points += s.points.length / 2;
      }
      layer.items.push(s);
      items++;
    }
    out.layers.push(layer);
  }
  if (!out.layers.length) out.layers.push(emptyDoc().layers[0]);
  return out;
}

/**
 * Di chuyển phiên bản. v1: lớp phẳng `strokes` với `color`, `width`; v2 (hiện tại): layers[].items[].
 * Dữ liệu không nhận ra thì trả tài liệu rỗng; phiên bản mới hơn thì đọc theo khả năng (sanitize bỏ phần lạ).
 */
export function migrateDoc(raw: unknown): TattooDoc {
  if (!raw || typeof raw !== 'object') return emptyDoc();
  const o = raw as Record<string, unknown>;
  const ver = typeof o.version === 'number' ? o.version : 1;
  if (ver <= 1 && Array.isArray(o.strokes)) {
    const items = (o.strokes as Record<string, unknown>[]).map((s, i) => ({
      type: 'stroke', id: `m${i + 1}`, region: s?.region, side: s?.side ?? null, points: s?.points,
      size: typeof s?.width === 'number' ? s.width / 2 : 0.008, opacity: s?.opacity ?? 1, ink: s?.color, erase: false,
    }));
    return sanitizeDoc({ layers: [{ id: 'L1', name: 'Lớp 1', visible: true, items }] });
  }
  return sanitizeDoc(o);
}

export function serializeDoc(doc: TattooDoc): string {
  return JSON.stringify(sanitizeDoc(doc));
}

/** Đọc chuỗi JSON: quá byte thì từ chối (trả null), hỏng thì null. */
export function parseDoc(json: string): TattooDoc | null {
  if (typeof json !== 'string' || json.length > PAINT_LIMITS.maxJsonBytes) return null;
  try {
    return migrateDoc(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Còn chỗ để thêm mục này không (giới hạn số mục, điểm, byte). */
export function canAddItem(doc: TattooDoc, item: TattooItem): boolean {
  let items = 0;
  let pts = 0;
  for (const l of doc.layers) for (const i of l.items) { items++; if (i.type === 'stroke') pts += i.points.length / 2; }
  if (items >= PAINT_LIMITS.maxItems) return false;
  if (item.type === 'stroke' && pts + item.points.length / 2 > PAINT_LIMITS.maxTotalPoints) return false;
  return JSON.stringify(doc).length + JSON.stringify(item).length < PAINT_LIMITS.maxJsonBytes;
}
