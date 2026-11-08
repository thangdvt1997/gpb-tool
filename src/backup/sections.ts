/**
 * Các phần dựng sẵn: look (nhân vật), settings, persist (snapshot văn phòng, gồm ảnh xăm nhúng),
 * layoutDraft (bố cục nháp). Phần I/O đi qua adapter được tiêm vào nên test được không cần trình duyệt.
 * Phần mở rộng khác (vd. xăm riêng) tự tạo BackupSection rồi registry.register().
 */
import { appearanceToLook, isLegacyAppearance } from '../fashion/migrate';
import { validate as validateLook } from '../fashion/rules';
import type { CharacterLook } from '../fashion/types';
import { LOOK_SCHEMA_VERSION } from '../fashion/types';
import { EXPORT_FORMAT, SNAPSHOT_FORMAT, SNAPSHOT_SCHEMA_VERSION } from '../persist/core';
import { SETTINGS_VERSION, importJson, sanitize, type Settings } from '../settings/schema';
import { isPropId, isPropKind } from '../editor/props';
import { deepMerge } from './diff';
import { isPlainObject, utf8Bytes } from './safeJson';
import type { BackupSection, ValidateResult } from './types';

/* ------------------------------- look ------------------------------- */

export interface LookAdapter {
  getLook(): CharacterLook;
  applyLook(look: CharacterLook): void;
}

/** look v0 = Appearance cũ (chibi); v1 = CharacterLook. */
export function lookV0ToV1(data: unknown): unknown {
  return isLegacyAppearance(data) ? appearanceToLook(data).look : data;
}

export function createLookSection(a: LookAdapter): BackupSection {
  return {
    id: 'look',
    label: 'Nhân vật (hình thể, trang phục, xăm)',
    version: LOOK_SCHEMA_VERSION,
    migrations: { 0: lookV0ToV1 },
    validate(data): ValidateResult {
      if (!isPlainObject(data)) return { ok: false, error: 'look phải là đối tượng.' };
      if (utf8Bytes(JSON.stringify(data)) > 256 * 1024) return { ok: false, error: 'look quá lớn.' };
      const r = validateLook(data);
      return { ok: true, data: r.look, warnings: r.warnings.map((w) => `${w.path}: ${w.message}`) };
    },
    read: () => a.getLook(),
    write: (d) => a.applyLook(d as CharacterLook),
    // Một look không gộp được có nghĩa: gộp = lấy bản nhập.
    merge: (_c, i) => i,
  };
}

/* ------------------------------ settings ------------------------------ */

export interface SettingsAdapter {
  getSettings(): Settings;
  /** Ghi cài đặt đã sanitize. */
  setSettings(s: Settings): void;
}

/** settings v1 (trước Settings v2, chưa có version/touch/controlMode): kẹp lại về v2. */
export function settingsV1ToV2(data: unknown): unknown {
  return sanitize(data);
}

export function createSettingsSection(a: SettingsAdapter): BackupSection {
  return {
    id: 'settings',
    label: 'Cài đặt (điều khiển, âm lượng, gợi ý)',
    version: SETTINGS_VERSION,
    migrations: { 1: settingsV1ToV2 },
    validate(data): ValidateResult {
      if (!isPlainObject(data)) return { ok: false, error: 'settings phải là đối tượng.' };
      const r = importJson(JSON.stringify(data));
      // Phím sai/trùng: không chặn cả gói, chỉ cảnh báo và dùng phím mặc định cho phần đó.
      return { ok: true, data: sanitize(data), warnings: r.ok ? [] : r.errors };
    },
    read: () => a.getSettings(),
    write: (d) => a.setSettings(sanitize(d)),
    merge: (c, i) => sanitize(deepMerge(c, i)),
  };
}

/* ------------------------------- persist ------------------------------- */

export interface PersistAdapter {
  /** Chuỗi JSON dạng EXPORT_FORMAT (manager.exportSnapshot). null nếu chưa có gì. */
  exportText(): Promise<string | null>;
  /** manager.importSnapshot; ném lỗi nếu thất bại. */
  importText(text: string): Promise<void>;
}

export function createPersistSection(a: PersistAdapter): BackupSection {
  return {
    id: 'persist',
    label: 'Văn phòng (bố cục, trạng thái vật, ảnh xăm nhúng)',
    version: SNAPSHOT_SCHEMA_VERSION,
    migrations: {},
    validate(data): ValidateResult {
      if (!isPlainObject(data)) return { ok: false, error: 'persist phải là đối tượng.' };
      const snap = data.format === EXPORT_FORMAT ? data.snapshot : data;
      if (!isPlainObject(snap) || snap.format !== SNAPSHOT_FORMAT) return { ok: false, error: 'Không phải snapshot văn phòng.' };
      if (typeof snap.schemaVersion !== 'number' || snap.schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
        return { ok: false, error: 'Snapshot văn phòng do phiên bản mới hơn tạo.' };
      }
      if (data.format === EXPORT_FORMAT && data.assets !== undefined && !Array.isArray(data.assets)) {
        return { ok: false, error: 'Danh sách asset nhúng sai kiểu.' };
      }
      // Kiểm sâu (look, layout, đối tượng...) do persist.importSnapshot làm khi ghi.
      return { ok: true, data, warnings: [] };
    },
    async read() {
      const t = await a.exportText();
      if (!t) return null;
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    },
    async write(d) {
      await a.importText(JSON.stringify(d));
    },
    merge: (_c, i) => i,
    volatilePaths: ['snapshot.savedAt', 'snapshot.revision', 'snapshot.writerId'],
  };
}

/* ------------------------------ layoutDraft ------------------------------ */

export interface LayoutDraft {
  /** id vật -> tư thế. */
  items: Record<string, { x: number; z: number; rotation: 0 | 90 | 180 | 270; door?: boolean }>;
  /** id vật thêm (p_...) -> loại vật. Vắng ở bản nháp cũ. */
  props?: Record<string, string>;
  /** id vật thêm đã xóa trong bản nháp (chưa lưu). */
  removed?: string[];
}

export const MAX_DRAFT_ITEMS = 400;

export interface LayoutDraftAdapter {
  read(): LayoutDraft | null;
  write(d: LayoutDraft): void;
  clear?(): void;
}

export function validateLayoutDraft(data: unknown): ValidateResult {
  if (!isPlainObject(data) || !isPlainObject(data.items)) return { ok: false, error: 'layoutDraft cần trường items.' };
  const items: LayoutDraft['items'] = {};
  const warnings: string[] = [];
  const ids = Object.keys(data.items);
  if (ids.length > MAX_DRAFT_ITEMS) return { ok: false, error: `layoutDraft có quá ${MAX_DRAFT_ITEMS} vật.` };
  for (const id of ids) {
    const p = data.items[id];
    if (!/^[\w.:-]{1,64}$/.test(id) || !isPlainObject(p)) {
      warnings.push(`Bỏ qua vật "${id}": id hoặc tư thế sai.`);
      continue;
    }
    const { x, z, rotation } = p;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1000 || Math.abs(z) > 1000) {
      warnings.push(`Bỏ qua vật "${id}": toạ độ sai.`);
      continue;
    }
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      warnings.push(`Bỏ qua vật "${id}": góc xoay phải là 0/90/180/270.`);
      continue;
    }
    items[id] = p.door === true ? { x, z, rotation, door: true } : { x, z, rotation };
  }
  const out: LayoutDraft = { items };
  if (data.props !== undefined) {
    if (!isPlainObject(data.props)) warnings.push('Bỏ qua props: sai kiểu.');
    else {
      const props: Record<string, string> = {};
      for (const [id, kind] of Object.entries(data.props)) {
        if (isPropId(id) && isPropKind(kind) && items[id]) props[id] = kind;
        else warnings.push(`Bỏ qua loại vật của "${id}".`);
      }
      out.props = props;
    }
  }
  if (data.removed !== undefined) {
    if (!Array.isArray(data.removed)) warnings.push('Bỏ qua removed: sai kiểu.');
    else out.removed = data.removed.filter((id): id is string => typeof id === 'string' && isPropId(id)).slice(0, MAX_DRAFT_ITEMS);
  }
  return { ok: true, data: out, warnings };
}

export function createLayoutDraftSection(a: LayoutDraftAdapter): BackupSection {
  return {
    id: 'layoutdraft',
    label: 'Bố cục nháp',
    version: 1,
    migrations: {},
    validate: validateLayoutDraft,
    read: () => a.read(),
    write: (d) => a.write(d as LayoutDraft),
    clear: a.clear ? () => a.clear!() : undefined,
    merge: (c, i) => deepMerge(c, i),
  };
}
