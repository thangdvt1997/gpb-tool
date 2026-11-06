/**
 * Nhập gói: parse an toàn -> migrate -> kiểm checksum -> kiểm schema từng phần -> xem trước khác biệt
 * -> áp dụng (merge/replace) có tự sao lưu trước và rollback khi lỗi giữa chừng.
 */
import { buildBundle, computeChecksum } from './bundle';
import { deepMerge, diffValues } from './diff';
import { migrateBundle, migrateSectionData } from './migrate';
import type { BackupRegistry } from './registry';
import type { BackupRing } from './ring';
import { cloneJson, isPlainObject, safeParse } from './safeJson';
import { MAX_IMPORT_BYTES, type BackupHeader, type DiffEntry, type ImportMode } from './types';

export interface ParsedSection {
  id: string;
  label: string;
  /** Dữ liệu đã migrate + validate ở version hiện tại. */
  data: unknown;
  warnings: string[];
  fromVersion: number;
}

export interface RejectedSection {
  id: string;
  reason: string;
}

export interface ParsedBundle {
  header: BackupHeader;
  sections: ParsedSection[];
  /** Phần bị bỏ: không đăng ký, schema sai, version tương lai. */
  rejected: RejectedSection[];
  bundleFromVersion: number;
  checksum: 'ok' | 'missing';
  notes: string[];
}

export type ParseBundleResult = { ok: true; parsed: ParsedBundle } | { ok: false; error: string };

export async function parseBundleText(text: unknown, registry: BackupRegistry, opts: { maxBytes?: number } = {}): Promise<ParseBundleResult> {
  const p = safeParse(text, opts.maxBytes ?? MAX_IMPORT_BYTES);
  if (!p.ok) return p;
  const raw = p.value;
  // Checksum kiểm trên dữ liệu gốc (trước migrate) khi gói có header.
  let checksum: 'ok' | 'missing' = 'missing';
  if (isPlainObject(raw) && isPlainObject(raw.header) && typeof raw.header.checksum === 'string') {
    if (!isPlainObject(raw.sections)) return { ok: false, error: 'Gói thiếu sections.' };
    const actual = await computeChecksum(raw.sections);
    if (actual !== raw.header.checksum) return { ok: false, error: 'Checksum không khớp: tệp bị sửa hoặc hỏng.' };
    checksum = 'ok';
  }
  const m = migrateBundle(raw);
  if (!m.ok) return { ok: false, error: m.error };
  const { bundle } = m;
  const notes: string[] = [];
  if (m.steps.length) notes.push(`Gói cũ v${m.fromVersion} đã được nâng lên v${bundle.header.schemaVersion} (bản gốc không bị sửa).`);
  const sections: ParsedSection[] = [];
  const rejected: RejectedSection[] = [];
  for (const id of Object.keys(bundle.sections)) {
    const sec = registry.get(id);
    if (!sec) {
      rejected.push({ id, reason: 'Phần không được ứng dụng này hỗ trợ.' });
      continue;
    }
    const from = bundle.header.sectionVersions[id] ?? sec.version;
    const mig = migrateSectionData(sec, bundle.sections[id], from);
    if (!mig.ok) {
      rejected.push({ id, reason: mig.error });
      continue;
    }
    if (mig.steps.length) notes.push(`Phần "${sec.label}": nâng v${from} -> v${sec.version}.`);
    let v;
    try {
      v = sec.validate(mig.data);
    } catch (e) {
      v = { ok: false as const, error: (e as Error).message };
    }
    if (!v.ok) {
      rejected.push({ id, reason: `Sai schema: ${v.error}` });
      continue;
    }
    sections.push({ id, label: sec.label, data: v.data, warnings: v.warnings, fromVersion: from });
  }
  if (sections.length === 0) return { ok: false, error: rejected.length ? `Không có phần nào nhập được: ${rejected.map((r) => `${r.id} (${r.reason})`).join('; ')}` : 'Gói không có phần dữ liệu.' };
  return { ok: true, parsed: { header: bundle.header, sections, rejected, bundleFromVersion: m.fromVersion, checksum, notes } };
}

/* ------------------------------ Xem trước ------------------------------ */

export interface PreviewItem {
  id: string;
  label: string;
  status: 'new' | 'identical' | 'changed';
  changes: DiffEntry[];
  totalChanges: number;
  truncated: boolean;
  warnings: string[];
}

function resultData(mode: ImportMode, current: unknown, incoming: unknown, merge?: (c: unknown, i: unknown) => unknown): unknown {
  if (mode === 'replace' || current === null || current === undefined) return incoming;
  return (merge ?? deepMerge)(cloneJson(current), cloneJson(incoming));
}

/** Không ghi gì: chỉ đọc dữ liệu hiện tại và tính khác biệt sẽ xảy ra theo chế độ. */
export async function previewImport(parsed: ParsedBundle, registry: BackupRegistry, mode: ImportMode): Promise<PreviewItem[]> {
  const items: PreviewItem[] = [];
  for (const s of parsed.sections) {
    const sec = registry.get(s.id);
    if (!sec) continue;
    let current: unknown = null;
    try {
      current = (await sec.read()) ?? null;
    } catch {
      current = null;
    }
    const after = resultData(mode, current, s.data, sec.merge);
    if (current === null) {
      items.push({ id: s.id, label: s.label, status: 'new', changes: [], totalChanges: 0, truncated: false, warnings: s.warnings });
      continue;
    }
    const d = diffValues(current, after, { ignore: sec.volatilePaths });
    items.push({
      id: s.id,
      label: s.label,
      status: d.total === 0 ? 'identical' : 'changed',
      changes: d.entries,
      totalChanges: d.total,
      truncated: d.truncated,
      warnings: s.warnings,
    });
  }
  return items;
}

/* ------------------------------ Áp dụng ------------------------------ */

export interface ApplyOptions {
  mode: ImportMode;
  /** id các phần được chọn; mặc định tất cả phần hợp lệ. */
  selected?: readonly string[];
  ring: BackupRing;
  now?: Date;
  /** Bỏ yêu cầu sao lưu trước khi ghi (không khuyến nghị). */
  skipBackup?: boolean;
  reason?: 'pre-import' | 'pre-restore';
}

export type ApplyResult =
  | { ok: true; applied: string[]; backupId: string | null; message: string }
  | { ok: false; error: string; rolledBack: string[]; rollbackErrors: string[]; backupId: string | null };

export async function applyImport(parsed: ParsedBundle, registry: BackupRegistry, opts: ApplyOptions): Promise<ApplyResult> {
  const chosen = parsed.sections.filter((s) => !opts.selected || opts.selected.includes(s.id));
  if (chosen.length === 0) return { ok: false, error: 'Chưa chọn phần nào để nhập.', rolledBack: [], rollbackErrors: [], backupId: null };

  // 1) Đọc trạng thái hiện tại (để rollback) và tính dữ liệu kết quả; chưa ghi gì.
  const plan: Array<{ id: string; label: string; before: unknown; next: unknown }> = [];
  for (const s of chosen) {
    const sec = registry.get(s.id);
    if (!sec) return { ok: false, error: `Phần "${s.id}" chưa đăng ký.`, rolledBack: [], rollbackErrors: [], backupId: null };
    let before: unknown;
    try {
      before = cloneJson((await sec.read()) ?? null);
    } catch (e) {
      return { ok: false, error: `Không đọc được "${sec.label}": ${(e as Error).message}`, rolledBack: [], rollbackErrors: [], backupId: null };
    }
    let next: unknown;
    try {
      next = resultData(opts.mode, before, s.data, sec.merge);
    } catch (e) {
      return { ok: false, error: `Gộp "${sec.label}" thất bại: ${(e as Error).message}`, rolledBack: [], rollbackErrors: [], backupId: null };
    }
    // Kết quả gộp phải hợp lệ trước khi ghi.
    const v = sec.validate(next);
    if (!v.ok) return { ok: false, error: `Kết quả "${sec.label}" không hợp lệ: ${v.error}`, rolledBack: [], rollbackErrors: [], backupId: null };
    plan.push({ id: s.id, label: sec.label, before, next: v.data });
  }

  // 2) Tự sao lưu toàn bộ trạng thái hiện tại.
  let backupId: string | null = null;
  if (!opts.skipBackup) {
    const b = await buildBundle(registry, { now: opts.now, redact: false });
    if (b.ok) {
      const r = opts.ring.add(b.text, { reason: opts.reason ?? 'pre-import', now: opts.now });
      if (!r.ok) return { ok: false, error: `Không tạo được bản sao lưu trước khi ghi đè: ${r.error}`, rolledBack: [], rollbackErrors: [], backupId: null };
      backupId = r.meta.id;
    }
    // Chưa có dữ liệu nào hiện tại thì không có gì để sao lưu: cho phép nhập.
  }

  // 3) Ghi lần lượt; lỗi thì khôi phục ngược các phần đã ghi.
  const written: typeof plan = [];
  for (const step of plan) {
    const sec = registry.get(step.id)!;
    try {
      await sec.write(cloneJson(step.next));
      written.push(step);
    } catch (e) {
      // Phần đang ghi dở cũng có thể đã đổi một phần: đưa vào danh sách rollback.
      written.push(step);
      const rolledBack: string[] = [];
      const rollbackErrors: string[] = [];
      for (const w of [...written].reverse()) {
        const s2 = registry.get(w.id)!;
        try {
          if (w.before === null || w.before === undefined) {
            if (s2.clear) await s2.clear();
            else rollbackErrors.push(`${w.label}: trước đó rỗng và phần không hỗ trợ xóa`);
          } else {
            await s2.write(cloneJson(w.before));
          }
          rolledBack.push(w.id);
        } catch (re) {
          rollbackErrors.push(`${w.label}: ${(re as Error).message}`);
        }
      }
      return { ok: false, error: `Ghi "${step.label}" thất bại: ${(e as Error).message}`, rolledBack, rollbackErrors, backupId };
    }
  }
  return {
    ok: true,
    applied: plan.map((p) => p.id),
    backupId,
    message: `Đã nhập ${plan.length} phần (${opts.mode === 'merge' ? 'gộp' : 'thay thế'}).${backupId ? ' Đã tự sao lưu trạng thái trước đó.' : ''}`,
  };
}
