/** Tạo gói xuất: header, manifest phiên bản các phần, loại dữ liệu nhạy cảm, checksum SHA-256. */
import type { BackupRegistry } from './registry';
import { redactSensitive, sha256Hex, stableStringify, utf8Bytes } from './safeJson';
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type BackupBundle } from './types';

export interface BuildOptions {
  /** Chỉ xuất các phần này; mặc định tất cả phần đã đăng ký. */
  ids?: readonly string[];
  now?: Date;
  /** Mặc định true. Chỉ tắt cho sao lưu cục bộ nội bộ. */
  redact?: boolean;
}

export interface SkippedSection {
  id: string;
  reason: string;
}

export type BuildResult =
  | { ok: true; bundle: BackupBundle; text: string; bytes: number; removed: string[]; skipped: SkippedSection[] }
  | { ok: false; error: string };

export async function computeChecksum(sections: Record<string, unknown>): Promise<string> {
  return `sha256:${await sha256Hex(stableStringify(sections))}`;
}

export async function buildBundle(registry: BackupRegistry, opts: BuildOptions = {}): Promise<BuildResult> {
  const wanted = opts.ids ?? registry.ids();
  const sections: Record<string, unknown> = {};
  const sectionVersions: Record<string, number> = {};
  const removed: string[] = [];
  const skipped: SkippedSection[] = [];
  for (const id of wanted) {
    const sec = registry.get(id);
    if (!sec) {
      skipped.push({ id, reason: 'Phần chưa đăng ký.' });
      continue;
    }
    let data: unknown;
    try {
      data = await sec.read();
    } catch (e) {
      skipped.push({ id, reason: `Đọc thất bại: ${(e as Error).message}` });
      continue;
    }
    if (data === null || data === undefined) {
      skipped.push({ id, reason: 'Chưa có dữ liệu.' });
      continue;
    }
    if (opts.redact !== false) {
      const r = redactSensitive(data);
      data = r.value;
      for (const p of r.removed) removed.push(p ? `${id}.${p}` : id);
    }
    const v = sec.validate(data);
    if (!v.ok) {
      skipped.push({ id, reason: `Dữ liệu hiện tại không hợp lệ: ${v.error}` });
      continue;
    }
    sections[id] = v.data;
    sectionVersions[id] = sec.version;
  }
  if (Object.keys(sections).length === 0) return { ok: false, error: 'Không có phần dữ liệu nào để xuất.' };
  const bundle: BackupBundle = {
    header: {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: (opts.now ?? new Date()).toISOString(),
      sectionVersions,
      checksum: await computeChecksum(sections),
    },
    sections,
  };
  const text = JSON.stringify(bundle, null, 2);
  return { ok: true, bundle, text, bytes: utf8Bytes(text), removed, skipped };
}

/** Tên tệp gợi ý: gpb-backup-YYYYMMDD-HHMMSS.json (UTC). */
export function backupFileName(now: Date = new Date()): string {
  const p = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `gpb-backup-${p}.json`;
}
