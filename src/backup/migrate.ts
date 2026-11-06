/**
 * Chuỗi migrate theo từng bước, hai tầng:
 *  1) Tầng GÓI (BUNDLE_MIGRATIONS): khung header/sections, từ schemaVersion N lên N+1.
 *  2) Tầng PHẦN (BackupSection.migrations): dữ liệu từng phần, từ version n lên n+1.
 * Mọi bước là hàm thuần; đầu vào luôn được sao chép trước nên bản gốc không bị sửa.
 */
import type { BackupRegistry } from './registry';
import { cloneJson, isPlainObject } from './safeJson';
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type BackupBundle, type BackupSection } from './types';

export type BundleStep = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Các khóa ở gốc gói v0 không phải phần dữ liệu. */
const V0_META_KEYS = new Set(['app', 'createdAt', 'format', 'version', 'schemaVersion']);

/**
 * v0 -> v1. Gói v0 (bản thử nghiệm) phẳng: { app?, createdAt?, look?, settings?, persist?, ... }.
 * v1 có header + sections + sectionVersions. Phần v0: look là version 0 (có thể là Appearance cũ),
 * settings version 1 (trước Settings v2), các phần khác version 1.
 */
export function bundleV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const sections: Record<string, unknown> = {};
  const sectionVersions: Record<string, number> = {};
  for (const k of Object.keys(raw)) {
    if (V0_META_KEYS.has(k)) continue;
    sections[k] = raw[k];
    sectionVersions[k] = k === 'look' ? 0 : 1;
  }
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString();
  return {
    header: { app: BACKUP_APP, format: BACKUP_FORMAT, schemaVersion: 1, createdAt, sectionVersions },
    sections,
  };
}

/** BUNDLE_MIGRATIONS[n]: schemaVersion n -> n+1. */
export const BUNDLE_MIGRATIONS: Readonly<Record<number, BundleStep>> = {
  0: bundleV0ToV1,
};

export type DetectResult = { ok: true; version: number } | { ok: false; code: 'unknown_format' | 'too_new' | 'foreign_app'; error: string };

/** Nhận diện schemaVersion của gói thô. */
export function detectBundleVersion(raw: unknown): DetectResult {
  if (!isPlainObject(raw)) return { ok: false, code: 'unknown_format', error: 'Gói phải là một đối tượng JSON.' };
  const h = raw.header;
  if (isPlainObject(h)) {
    if (h.format !== BACKUP_FORMAT) return { ok: false, code: 'unknown_format', error: 'Không phải gói sao lưu của ứng dụng.' };
    if (h.app !== BACKUP_APP) return { ok: false, code: 'foreign_app', error: 'Gói thuộc ứng dụng khác.' };
    const v = h.schemaVersion;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, code: 'unknown_format', error: 'schemaVersion không hợp lệ.' };
    if (v > BACKUP_SCHEMA_VERSION) {
      return { ok: false, code: 'too_new', error: `Gói do phiên bản mới hơn tạo (v${v}, hỗ trợ tới v${BACKUP_SCHEMA_VERSION}). Hãy cập nhật ứng dụng.` };
    }
    return { ok: true, version: v };
  }
  // Không có header: chỉ nhận dạng phẳng v0 nếu có ít nhất một khóa dữ liệu và không có 'format' lạ.
  if ('format' in raw || 'schemaVersion' in raw) return { ok: false, code: 'unknown_format', error: 'Định dạng gói không nhận ra.' };
  const dataKeys = Object.keys(raw).filter((k) => !V0_META_KEYS.has(k));
  if (dataKeys.length === 0) return { ok: false, code: 'unknown_format', error: 'Gói không có phần dữ liệu nào.' };
  return { ok: true, version: 0 };
}

export type MigrateBundleResult =
  | { ok: true; bundle: BackupBundle; fromVersion: number; steps: number[] }
  | { ok: false; error: string; code: string };

/** Chạy chuỗi migrate tầng gói tới BACKUP_SCHEMA_VERSION. */
export function migrateBundle(raw: unknown): MigrateBundleResult {
  const det = detectBundleVersion(raw);
  if (!det.ok) return det;
  let cur = cloneJson(raw) as Record<string, unknown>;
  const steps: number[] = [];
  for (let v = det.version; v < BACKUP_SCHEMA_VERSION; v++) {
    const step = BUNDLE_MIGRATIONS[v];
    if (!step) return { ok: false, code: 'missing_step', error: `Thiếu bước migrate gói v${v} -> v${v + 1}.` };
    try {
      cur = step(cloneJson(cur));
    } catch (e) {
      return { ok: false, code: 'step_failed', error: `Bước migrate gói v${v} thất bại: ${(e as Error).message}` };
    }
    steps.push(v);
  }
  const header = cur.header;
  const sections = cur.sections;
  if (!isPlainObject(header) || !isPlainObject(sections)) return { ok: false, code: 'invalid', error: 'Gói sau migrate thiếu header hoặc sections.' };
  const sv = isPlainObject(header.sectionVersions) ? header.sectionVersions : {};
  const clean: Record<string, number> = {};
  for (const k of Object.keys(sv)) if (typeof sv[k] === 'number' && Number.isInteger(sv[k]) && (sv[k] as number) >= 0) clean[k] = sv[k] as number;
  return {
    ok: true,
    fromVersion: det.version,
    steps,
    bundle: {
      header: {
        app: String(header.app),
        format: String(header.format),
        schemaVersion: BACKUP_SCHEMA_VERSION,
        createdAt: typeof header.createdAt === 'string' ? header.createdAt : '',
        sectionVersions: clean,
        checksum: typeof header.checksum === 'string' ? header.checksum : undefined,
      },
      sections: sections as Record<string, unknown>,
    },
  };
}

export type MigrateSectionResult = { ok: true; data: unknown; steps: number[] } | { ok: false; error: string };

/** Chạy chuỗi migrate của một phần từ fromVersion tới section.version. */
export function migrateSectionData(section: BackupSection, data: unknown, fromVersion: number): MigrateSectionResult {
  if (fromVersion > section.version) {
    return { ok: false, error: `Phần "${section.label}" do phiên bản mới hơn tạo (v${fromVersion}, hỗ trợ tới v${section.version}).` };
  }
  let cur = cloneJson(data);
  const steps: number[] = [];
  for (let v = fromVersion; v < section.version; v++) {
    const step = section.migrations[v];
    if (!step) return { ok: false, error: `Phần "${section.label}" thiếu bước migrate v${v} -> v${v + 1}.` };
    try {
      cur = step(cloneJson(cur));
    } catch (e) {
      return { ok: false, error: `Phần "${section.label}": bước v${v} thất bại: ${(e as Error).message}` };
    }
    steps.push(v);
  }
  return { ok: true, data: cur, steps };
}

export function listSectionVersions(registry: BackupRegistry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of registry.list()) out[s.id] = s.version;
  return out;
}
