/** Panel HUD (ngoài Canvas) mở TattooPainter cho mô hình hiện tại; lưu vào store, hiện lên nhân vật qua useBodyTattoo. */
import { useEffect, useState } from 'react';
import { loadRegionMasks, TATTOO_MODEL_URLS } from './masks';
import type { RegionMask } from './regions';
import { clearTattoo, getTattooDoc, setTattooDoc, type ModelId } from './store';
import { TattooPainter } from './TattooPainter';
import { emptyDoc, type TattooDoc } from './schema';

export interface TattooStudioProps { model: ModelId; onClose: () => void }

import { useReturnFocus } from '../a11y/useReturnFocus';
export function TattooStudio({ model, onClose }: TattooStudioProps) {
  useReturnFocus();
  const [masks, setMasks] = useState<RegionMask[] | null>(null);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<TattooDoc>(() => getTattooDoc(model));
  const [rev, setRev] = useState(0); // đổi khi Xóa hết để dựng lại TattooPainter
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const ac = new AbortController();
    setMasks(null); setError('');
    setDoc(getTattooDoc(model));
    loadRegionMasks(TATTOO_MODEL_URLS[model], ac.signal).then(setMasks, (e) => {
      if ((e as Error)?.name !== 'AbortError') setError('Không tải được bản đồ da. Thử lại sau.');
    });
    return () => ac.abort();
  }, [model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clearAll = () => {
    clearTattoo(model);
    setDoc(emptyDoc());
    setRev((r) => r + 1);
    setSaveMsg('Đã xóa hết hình xăm.');
  };

  return (
    <section role="dialog" aria-modal="false" aria-label="Xưởng xăm hình" style={{ position: 'fixed', right: 12, top: 12, maxHeight: '90vh', overflow: 'auto', background: 'rgba(20,20,28,.94)', color: '#eee', padding: 12, borderRadius: 10, zIndex: 50 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ flex: 1 }}>Xăm hình</strong>
        <button type="button" onClick={clearAll} aria-label="Xóa hết hình xăm">Xóa hết</button>
        <button type="button" onClick={onClose} aria-label="Đóng xưởng xăm">Đóng</button>
      </div>
      <div role="status" aria-live="polite">
        {error ? <span role="alert">{error}</span> : !masks ? 'Đang tải bản đồ da...' : saveMsg}
      </div>
      {masks && (
        <TattooPainter
          key={`${model}-${rev}`}
          masks={masks}
          initialDoc={doc}
          onDocChange={(d) => { if (!setTattooDoc(model, d)) setSaveMsg('Không lưu được: hình xăm quá lớn.'); else setSaveMsg(''); }}
        />
      )}
    </section>
  );
}
