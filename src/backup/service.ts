/** Dịch vụ sao lưu: gom registry + vòng sao lưu cục bộ thành các thao tác mà UI gọi. */
import { backupFileName, buildBundle, type BuildResult } from './bundle';
import { applyImport, parseBundleText, previewImport, type ApplyResult, type ParsedBundle, type ParseBundleResult, type PreviewItem } from './importer';
import type { BackupRegistry } from './registry';
import type { BackupRing } from './ring';
import type { ImportMode, MetaBackup } from './types';

export interface BackupService {
  readonly registry: BackupRegistry;
  readonly ring: BackupRing;
  exportBundle(ids?: readonly string[]): Promise<BuildResult & { fileName?: string }>;
  parse(text: string): Promise<ParseBundleResult>;
  preview(parsed: ParsedBundle, mode: ImportMode): Promise<PreviewItem[]>;
  apply(parsed: ParsedBundle, opts: { mode: ImportMode; selected?: readonly string[] }): Promise<ApplyResult>;
  /** Sao lưu cục bộ ngay bây giờ (không xuất tệp). */
  backupNow(label?: string, reason?: MetaBackup['reason']): Promise<{ ok: true; meta: MetaBackup } | { ok: false; error: string }>;
  /** Khôi phục một bản trong vòng; trước đó tự sao lưu trạng thái hiện tại ('pre-restore'). */
  restore(id: string): Promise<ApplyResult>;
}

export function createBackupService(deps: { registry: BackupRegistry; ring: BackupRing; now?: () => Date }): BackupService {
  const { registry, ring } = deps;
  const now = () => deps.now?.() ?? new Date();
  return {
    registry,
    ring,
    async exportBundle(ids) {
      const d = now();
      const r = await buildBundle(registry, { ids, now: d });
      return r.ok ? { ...r, fileName: backupFileName(d) } : r;
    },
    parse: (text) => parseBundleText(text, registry),
    preview: (parsed, mode) => previewImport(parsed, registry, mode),
    apply: (parsed, o) => applyImport(parsed, registry, { ...o, ring, now: now() }),
    async backupNow(label, reason = 'manual') {
      const d = now();
      const r = await buildBundle(registry, { now: d, redact: false });
      if (!r.ok) return r;
      const a = ring.add(r.text, { label, reason, now: d });
      return a.ok ? { ok: true, meta: a.meta } : a;
    },
    async restore(id) {
      const text = ring.get(id);
      if (!text) return { ok: false, error: 'Không tìm thấy bản sao lưu.', rolledBack: [], rollbackErrors: [], backupId: null };
      const p = await parseBundleText(text, registry);
      if (!p.ok) return { ok: false, error: p.error, rolledBack: [], rollbackErrors: [], backupId: null };
      return applyImport(p.parsed, registry, { mode: 'replace', ring, now: now(), reason: 'pre-restore' });
    },
  };
}
