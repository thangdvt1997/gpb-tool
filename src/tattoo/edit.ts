/**
 * Thao tác sửa tài liệu (bất biến) và lịch sử hoàn tác/làm lại.
 */
import { canAddItem, emptyDoc, sanitizeItem, type TattooDoc, type TattooItem, type TattooLayer, PAINT_LIMITS } from './schema';
import type { Side, SkinRegion } from './regions';

let seq = 0;
export function newId(prefix = 'i'): string {
  seq = (seq + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`.slice(0, 32);
}

/** Thêm mục vào lớp; mục đi qua sanitize. Trả doc cũ nếu vượt giới hạn hoặc không hợp lệ. */
export function addItem(doc: TattooDoc, layerIndex: number, item: TattooItem): TattooDoc {
  const layer = doc.layers[layerIndex];
  if (!layer) return doc;
  const clean = sanitizeItem(item, newId());
  if (!clean || !canAddItem(doc, clean)) return doc;
  return { ...doc, layers: doc.layers.map((l, i) => (i === layerIndex ? { ...l, items: [...l.items, clean] } : l)) };
}

export function removeItem(doc: TattooDoc, itemId: string): TattooDoc {
  return { ...doc, layers: doc.layers.map((l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) })) };
}

/** Xoá toàn bộ mục thuộc một vùng (bên null = cả hai bên). */
export function clearRegion(doc: TattooDoc, region: SkinRegion, side: Side | null): TattooDoc {
  return { ...doc, layers: doc.layers.map((l) => ({ ...l, items: l.items.filter((i) => !(i.region === region && (side === null || i.side === side))) })) };
}

export function addLayer(doc: TattooDoc, name?: string): TattooDoc {
  if (doc.layers.length >= PAINT_LIMITS.maxLayers) return doc;
  const layer: TattooLayer = { id: newId('L'), name: (name ?? `Lớp ${doc.layers.length + 1}`).slice(0, PAINT_LIMITS.maxNameLength), visible: true, items: [] };
  return { ...doc, layers: [...doc.layers, layer] };
}

export function removeLayer(doc: TattooDoc, index: number): TattooDoc {
  if (doc.layers.length <= 1 || !doc.layers[index]) return doc;
  return { ...doc, layers: doc.layers.filter((_, i) => i !== index) };
}

export function toggleLayer(doc: TattooDoc, index: number): TattooDoc {
  return { ...doc, layers: doc.layers.map((l, i) => (i === index ? { ...l, visible: !l.visible } : l)) };
}

export function clearAll(): TattooDoc {
  return emptyDoc();
}

export const HISTORY_LIMIT = 50;

export interface History { past: TattooDoc[]; present: TattooDoc; future: TattooDoc[] }

export function newHistory(doc: TattooDoc = emptyDoc()): History {
  return { past: [], present: doc, future: [] };
}

/** Ghi trạng thái mới; trùng tham chiếu (thao tác bị từ chối) thì không ghi. */
export function commit(h: History, next: TattooDoc): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
