/**
 * Bảng xuất/nhập và sao lưu (TASK 20). Không phụ thuộc layout app: chỉ cần truyền service.
 * Trợ năng: nhóm có nhãn, trạng thái qua role="status" (aria-live), lỗi qua role="alert", nút có aria-label.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedBundle, PreviewItem } from './importer';
import type { BackupService } from './service';
import type { ImportMode, MetaBackup } from './types';
import { MAX_IMPORT_BYTES } from './types';

interface Props {
  service: BackupService;
  onClose?: () => void;
}

const REASON_TEXT: Record<MetaBackup['reason'], string> = {
  manual: 'Thủ công',
  auto: 'Tự động',
  'pre-import': 'Trước khi nhập',
  'pre-restore': 'Trước khi khôi phục',
};

const STATUS_TEXT: Record<PreviewItem['status'], string> = { new: 'Mới', identical: 'Giống hệt', changed: 'Có thay đổi' };

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BackupPanel({ service, onClose }: Props) {
  const [backups, setBackups] = useState<MetaBackup[]>(() => service.ring.list());
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedBundle | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setBackups(service.ring.list()), [service]);
  const fail = (e: string) => {
    setMsg('');
    setErr(e);
  };
  const ok = (m: string) => {
    setErr('');
    setMsg(m);
  };

  // Xem trước tính lại khi đổi chế độ.
  useEffect(() => {
    if (!parsed) return;
    let live = true;
    void service.preview(parsed, mode).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [parsed, mode, service]);

  async function doExport() {
    setBusy(true);
    try {
      const r = await service.exportBundle();
      if (!r.ok) return fail(r.error);
      download(r.fileName ?? 'gpb-backup.json', r.text);
      const extra = r.removed.length ? ` Đã loại ${r.removed.length} trường nhạy cảm.` : '';
      ok(`Đã xuất ${Object.keys(r.bundle.sections).length} phần (${Math.round(r.bytes / 1024)} KB).${extra}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    setParsed(null);
    setPreview([]);
    if (!file) return;
    if (!/\.json$/i.test(file.name)) return fail('Chỉ nhận tệp .json.');
    if (file.size > MAX_IMPORT_BYTES) return fail(`Tệp quá lớn (tối đa ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB).`);
    setBusy(true);
    try {
      const r = await service.parse(await file.text());
      if (!r.ok) return fail(r.error);
      setParsed(r.parsed);
      setPicked(new Set(r.parsed.sections.map((s) => s.id)));
      ok(`Đã đọc "${file.name}". Xem trước rồi bấm Nhập; chưa có gì bị ghi.`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await service.apply(parsed, { mode, selected: [...picked] });
      if (r.ok) {
        ok(r.message);
        setParsed(null);
        setPreview([]);
      } else {
        const rb = r.rolledBack.length ? ` Đã hoàn tác: ${r.rolledBack.join(', ')}.` : '';
        const re = r.rollbackErrors.length ? ` Hoàn tác lỗi: ${r.rollbackErrors.join('; ')}.` : '';
        fail(`${r.error}${rb}${re}`);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doBackup() {
    const r = await service.backupNow();
    if (r.ok) ok('Đã tạo bản sao lưu.');
    else fail(r.error);
    refresh();
  }

  async function doRestore(id: string) {
    setConfirmRestore(null);
    setBusy(true);
    try {
      const r = await service.restore(id);
      if (r.ok) ok(r.message);
      else fail(r.error);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <section className="panel backup-panel" role="region" aria-label="Xuất, nhập và sao lưu dữ liệu">
      <header className="panel-head">
        <h2>Sao lưu và chuyển dữ liệu</h2>
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng bảng sao lưu">
            ✕
          </button>
        )}
      </header>

      <div role="status" aria-live="polite">{msg}</div>
      <div role="alert">{err}</div>

      <fieldset disabled={busy}>
        <legend>Xuất</legend>
        <p className="muted">Gói JSON gồm nhân vật, cài đặt, văn phòng. Token và email được loại trước khi xuất.</p>
        <button type="button" onClick={doExport} aria-label="Xuất toàn bộ dữ liệu ra tệp JSON">
          Xuất ra tệp
        </button>
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Nhập</legend>
        <label htmlFor="backup-file">Chọn tệp .json</label>
        <input id="backup-file" ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />

        {parsed && (
          <div aria-label="Xem trước nhập">
            <div role="radiogroup" aria-label="Chế độ nhập">
              <label>
                <input type="radio" name="backup-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Gộp (giữ phần không trùng)
              </label>
              <label>
                <input type="radio" name="backup-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Thay thế
              </label>
            </div>
            <ul>
              {preview.map((p) => (
                <li key={p.id}>
                  <label>
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Nhập phần ${p.label}`} />{' '}
                    <strong>{p.label}</strong> — {STATUS_TEXT[p.status]}
                    {p.totalChanges > 0 && ` (${p.totalChanges} thay đổi)`}
                  </label>
                  {p.changes.length > 0 && (
                    <ul aria-label={`Khác biệt của ${p.label}`}>
                      {p.changes.slice(0, 10).map((c) => (
                        <li key={c.path}>
                          <code>{c.path}</code>: {c.before ?? '∅'} → {c.after ?? '∅'}
                        </li>
                      ))}
                      {p.totalChanges > 10 && <li>… và {p.totalChanges - 10} thay đổi khác</li>}
                    </ul>
                  )}
                  {p.warnings.length > 0 && <p className="muted">Cảnh báo: {p.warnings.slice(0, 3).join('; ')}</p>}
                </li>
              ))}
            </ul>
            {parsed.rejected.length > 0 && (
              <p className="muted">Bỏ qua: {parsed.rejected.map((r) => `${r.id} (${r.reason})`).join('; ')}</p>
            )}
            {parsed.notes.map((n) => (
              <p key={n} className="muted">{n}</p>
            ))}
            <p className="muted">Trạng thái hiện tại sẽ được tự sao lưu trước khi ghi.</p>
            <button type="button" onClick={doImport} disabled={picked.size === 0} aria-label="Nhập các phần đã chọn">
              Nhập
            </button>{' '}
            <button type="button" onClick={() => { setParsed(null); setPreview([]); }} aria-label="Hủy nhập">
              Hủy
            </button>
          </div>
        )}
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Bản sao lưu cục bộ (giữ {service.ring.max} bản gần nhất)</legend>
        <button type="button" onClick={doBackup} aria-label="Tạo bản sao lưu cục bộ ngay">
          Sao lưu ngay
        </button>
        {backups.length === 0 ? (
          <p className="muted">Chưa có bản sao lưu.</p>
        ) : (
          <ul aria-label="Danh sách bản sao lưu">
            {backups.map((b) => (
              <li key={b.id}>
                <time dateTime={new Date(b.createdAt).toISOString()}>{new Date(b.createdAt).toLocaleString('vi-VN')}</time> — {REASON_TEXT[b.reason]} — {Math.round(b.bytes / 1024)} KB
                {confirmRestore === b.id ? (
                  <>
                    {' '}
                    <button type="button" onClick={() => void doRestore(b.id)} aria-label={`Xác nhận khôi phục bản ${b.label}`}>
                      Xác nhận khôi phục
                    </button>{' '}
                    <button type="button" onClick={() => setConfirmRestore(null)} aria-label="Hủy khôi phục">
                      Hủy
                    </button>
                  </>
                ) : (
                  <>
                    {' '}
                    <button type="button" onClick={() => setConfirmRestore(b.id)} aria-label={`Khôi phục bản sao lưu ${b.label}`}>
                      Khôi phục
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => {
                        service.ring.remove(b.id);
                        refresh();
                        ok('Đã xóa bản sao lưu.');
                      }}
                      aria-label={`Xóa bản sao lưu ${b.label}`}
                    >
                      Xóa
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </section>
  );
}
