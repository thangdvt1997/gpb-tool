/**
 * Store ngoài React giữ tài liệu xăm theo kiểu mô hình (UV mỗi tệp GLB khác nhau nên xăm không dùng chung).
 * Lưu localStorage 'gp.tattoo.v1' dạng { v:1, docs: { [model]: chuỗi JSON của tài liệu } }.
 * Mọi dữ liệu đọc vào đều qua parseDoc (kiểm tra, kẹp, giới hạn byte), hỏng thì coi như rỗng.
 */
import { useSyncExternalStore } from 'react';
import type { BackupSection, ValidateResult } from '../backup/types';
import { emptyDoc, parseDoc, PAINT_LIMITS, serializeDoc, type TattooDoc } from './schema';

export type ModelId = 'male_real' | 'female_real' | 'chibi';
export const MODEL_IDS: readonly ModelId[] = ['male_real', 'female_real', 'chibi'];
export const TATTOO_STORAGE_KEY = 'gp.tattoo.v1';
/** Tổng byte tối đa của dữ liệu lưu (mỗi mô hình một tài liệu tối đa maxJsonBytes). */
export const MAX_STORE_BYTES = PAINT_LIMITS.maxJsonBytes * MODEL_IDS.length + 1024;

const isModel = (m: unknown): m is ModelId => typeof m === 'string' && (MODEL_IDS as readonly string[]).includes(m);

/** Doc có mục nào để vẽ không (chỉ lớp đang hiện). */
export function docHasItems(doc: TattooDoc): boolean {
  return doc.layers.some((l) => l.visible && l.items.length > 0);
}

let docs: Partial<Record<ModelId, TattooDoc>> = {};
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: TattooDoc = emptyDoc();

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Chuyển đối tượng thô { model: chuỗi JSON | đối tượng } thành bản đồ doc đã làm sạch. */
export function sanitizeStored(raw: unknown): Partial<Record<ModelId, TattooDoc>> {
  const out: Partial<Record<ModelId, TattooDoc>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const d = (raw as { docs?: unknown }).docs;
  if (!d || typeof d !== 'object') return out;
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (!isModel(k)) continue;
    const json = typeof v === 'string' ? v : JSON.stringify(v ?? null);
    const doc = parseDoc(json);
    if (doc && docHasItems(doc)) out[k] = doc;
  }
  return out;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  const s = storage();
  if (!s) return;
  try {
    const txt = s.getItem(TATTOO_STORAGE_KEY);
    if (!txt || txt.length > MAX_STORE_BYTES) return;
    docs = sanitizeStored(JSON.parse(txt));
  } catch { docs = {}; }
}

function persist(): boolean {
  const s = storage();
  if (!s) return true;
  const payload: Record<string, string> = {};
  for (const m of MODEL_IDS) { const d = docs[m]; if (d) payload[m] = serializeDoc(d); }
  const txt = JSON.stringify({ v: 1, docs: payload });
  if (txt.length > MAX_STORE_BYTES) return false;
  try {
    if (Object.keys(payload).length === 0) s.removeItem(TATTOO_STORAGE_KEY);
    else s.setItem(TATTOO_STORAGE_KEY, txt);
    return true;
  } catch { return false; }
}

function emit(): void { for (const l of [...listeners]) l(); }

/** Tài liệu của mô hình; chưa có thì trả đối tượng rỗng dùng chung (cùng tham chiếu, an toàn cho getSnapshot). */
export function getTattooDoc(model: ModelId): TattooDoc {
  load();
  return docs[model] ?? EMPTY;
}

/**
 * Ghi tài liệu cho mô hình. Trả false nếu bị từ chối (quá byte hoặc không đọc lại được).
 * Nội dung giống bản hiện có thì không phát sự kiện (TattooPainter báo đổi cả khi mới mở).
 */
export function setTattooDoc(model: ModelId, doc: TattooDoc): boolean {
  load();
  if (!isModel(model)) return false;
  const json = serializeDoc(doc);
  if (json.length > PAINT_LIMITS.maxJsonBytes) return false;
  const clean = parseDoc(json);
  if (!clean) return false;
  const prev = docs[model];
  if (!docHasItems(clean)) {
    if (!prev) return true;
    return clearTattoo(model);
  }
  if (prev && serializeDoc(prev) === json) return true;
  const before = docs;
  docs = { ...docs, [model]: clean };
  if (!persist()) { docs = before; return false; }
  emit();
  return true;
}

export function clearTattoo(model: ModelId): boolean {
  load();
  if (!docs[model]) return true;
  const { [model]: _drop, ...rest } = docs;
  docs = rest;
  persist();
  emit();
  return true;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Chỉ cho test: đặt lại bộ nhớ (và nạp lại từ localStorage ở lần đọc sau). */
export function resetTattooStoreForTest(): void {
  docs = {}; loaded = false;
}

export function useTattooDoc(model: ModelId): TattooDoc {
  return useSyncExternalStore(subscribe, () => getTattooDoc(model), () => EMPTY);
}

/** Phần mở rộng cho sao lưu (registry.register(createTattooBackupSection())). */
export function createTattooBackupSection(): BackupSection {
  return {
    id: 'tattoo',
    label: 'Hình xăm',
    version: 1,
    migrations: {},
    validate(data: unknown): ValidateResult {
      if (data == null || typeof data !== 'object') return { ok: false, error: 'Dữ liệu xăm không hợp lệ' };
      const clean = sanitizeStored({ docs: (data as { docs?: unknown }).docs ?? data });
      return { ok: true, data: { docs: Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, serializeDoc(v as TattooDoc)])) }, warnings: [] };
    },
    read() {
      load();
      return Object.keys(docs).length ? { docs: Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, serializeDoc(v as TattooDoc)])) } : null;
    },
    write(data: unknown) {
      load();
      const clean = sanitizeStored(data);
      const before = docs;
      docs = clean;
      if (!persist()) { docs = before; throw new Error('Không ghi được dữ liệu xăm'); }
      emit();
    },
    clear() { docs = {}; persist(); emit(); },
  };
}
