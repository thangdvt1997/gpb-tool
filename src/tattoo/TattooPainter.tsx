/**
 * Bảng vẽ hình xăm: chọn vùng, cọ/tẩy/con dấu, màu mực, xem trước 2D trên bản đồ UV.
 * Không có input type=file. Dùng được bằng bàn phím: Tab vào bản đồ UV, mũi tên di con trỏ (Shift = bước lớn),
 * Enter/Space hạ-nhấc bút (cọ, tẩy) hoặc đặt con dấu, Esc huỷ nét, Ctrl+Z / Ctrl+Y hoàn tác/làm lại.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INK_PALETTE } from '../fashion/palette';
import { addItem, clearRegion, commit, newHistory, newId, redo, undo, addLayer, toggleLayer, type History } from './edit';
import { applyTattooOverlay, type TattooOverlayHandle } from './overlay';
import { canvasTextRasterizer, clampToIsland, createCanvas, drawDocToCanvas, inkOutsideMasks, masksFor, QUALITY_RES, renderDoc, type TattooQuality } from './raster';
import { MASK_RES, maskRes, TATTOO_REGIONS, regionKey, type RegionMask, type Side, type SkinRegion } from './regions';
import { DEFAULT_INK, emptyDoc, PAINT_LIMITS, serializeDoc, type StampItem, type StrokeItem, type TattooDoc } from './schema';
import { STAMP_TEMPLATES, TEXT_TEMPLATE_ID } from './templates';

const REGION_LABEL: Record<string, string> = {
  neck: 'Cổ', chest: 'Ngực', abdomen: 'Bụng', back: 'Lưng', upperArm: 'Bắp tay', forearm: 'Cẳng tay', hand: 'Bàn tay', thigh: 'Đùi', calf: 'Bắp chân',
};
const PREVIEW = 512;

type Tool = 'brush' | 'eraser' | 'stamp';

export interface TattooPainterProps {
  /** Mask vùng da từ buildRegionMasks(glb). Rỗng thì chưa vẽ được. */
  masks: readonly RegionMask[];
  initialDoc?: TattooDoc;
  quality?: TattooQuality;
  /** Gọi khi tài liệu đổi (đã commit), để lưu JSON. */
  onDocChange?: (doc: TattooDoc, json: string) => void;
  /** Canvas xăm (độ phân giải theo chất lượng) đã cập nhật, để truyền vào applyTattooOverlay. */
  onCanvas?: (canvas: HTMLCanvasElement | OffscreenCanvas) => void;
}

export function TattooPainter({ masks, initialDoc, quality = 'medium', onDocChange, onCanvas }: TattooPainterProps) {
  const [hist, setHist] = useState<History>(() => newHistory(initialDoc ?? emptyDoc()));
  const [region, setRegion] = useState<SkinRegion>('upperArm');
  const [side, setSide] = useState<Side | null>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [size, setSize] = useState(0.008);
  const [opacity, setOpacity] = useState(1);
  const [ink, setInk] = useState(DEFAULT_INK);
  const [templateId, setTemplateId] = useState(STAMP_TEMPLATES[0].id);
  const [text, setText] = useState('Bình an');
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [flipX, setFlipX] = useState(false);
  const [layer, setLayer] = useState(0);
  const [live, setLive] = useState<number[] | null>(null);
  const [cursor, setCursor] = useState({ u: 0.5, v: 0.5 });
  const [msg, setMsg] = useState('');
  const previewRef = useRef<HTMLCanvasElement>(null);
  const texRef = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null);
  const doc = hist.present;

  const available = useMemo(() => TATTOO_REGIONS.filter((r) => masks.some((m) => m.region === r)), [masks]);
  const sides = useMemo(() => masks.filter((m) => m.region === region && m.side).map((m) => m.side as Side), [masks, region]);
  const regionMasks = useMemo(() => masksFor(masks, region, side), [masks, region, side]);

  useEffect(() => { if (available.length && !available.includes(region)) setRegion(available[0]); }, [available, region]);
  useEffect(() => { if (side && !sides.includes(side)) setSide(null); }, [side, sides]);

  const apply = useCallback((next: TattooDoc, say?: string) => {
    setHist((h) => commit(h, next));
    if (say) setMsg(say);
  }, []);

  // Canvas xăm thật: vẽ lại khi tài liệu hoặc chất lượng đổi, báo cho nơi áp lên mesh.
  useEffect(() => {
    const res = QUALITY_RES[quality];
    let cv = texRef.current;
    if (!cv || cv.width !== res) { cv = createCanvas(res); texRef.current = cv; }
    if (!cv) return;
    drawDocToCanvas(doc, masks, cv);
    onCanvas?.(cv);
    onDocChange?.(doc, serializeDoc(doc));
    // onCanvas/onDocChange cố ý không phụ thuộc: chúng thường là hàm nội tuyến.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, masks, quality]);

  /** Hook e2e: độ phân giải mask và kiểm mực tràn ra ngoài vùng đang chọn (xem inkOutsideMasks). */
  function exposeHook(cv: HTMLCanvasElement | OffscreenCanvas) {
    if (typeof window === 'undefined') return;
    (window as unknown as { __gpbTattoo?: unknown }).__gpbTattoo = {
      maskRes: regionMasks.reduce((a, m) => Math.max(a, maskRes(m)), 0),
      region, side,
      regionTexels: regionMasks.reduce((a, m) => a + (m.grid ? m.grid.reduce((x, y) => x + y, 0) : 0), 0),
      check: () => {
        const ctx = cv.getContext('2d') as CanvasRenderingContext2D | null;
        if (!ctx) return null;
        return inkOutsideMasks(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, regionMasks);
      },
    };
  }

  useEffect(() => { if (texRef.current) exposeHook(texRef.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [doc, masks, quality, regionMasks]);

  // Xem trước 2D: nền vùng + xăm (kèm nét đang vẽ) + con trỏ.
  useEffect(() => {
    const cv = previewRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.fillStyle = '#e9e4dc';
    ctx.fillRect(0, 0, PREVIEW, PREVIEW);
    // Mask vẽ ở MASK_RES x MASK_RES rồi phóng to có làm mượt, tránh các ô vuông răng cưa trên bản xem trước.
    const maskCv = document.createElement('canvas');
    const pr = masks.reduce((a, m) => Math.max(a, maskRes(m)), MASK_RES);
    maskCv.width = pr;
    maskCv.height = pr;
    const mctx = maskCv.getContext('2d');
    if (mctx) {
      for (const m of masks) {
        const sel = m.region === region && (!side || m.side === side);
        mctx.fillStyle = sel ? '#cfe3d3' : m.region && TATTOO_REGIONS.includes(m.region) ? '#d6d2ca' : '#bdb9b2';
        if (m.grid) {
          const r = maskRes(m), k = pr / r;
          for (let y = 0; y < r; y++) for (let x = 0; x < r; x++) if (m.grid[y * r + x]) mctx.fillRect(x * k, y * k, k, k);
        } else mctx.fillRect(m.box.u0 * pr, m.box.v0 * pr, (m.box.u1 - m.box.u0) * pr, (m.box.v1 - m.box.v0) * pr);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(maskCv, 0, 0, PREVIEW, PREVIEW);
    }
    let shown = doc;
    if (live && live.length >= 2 && tool !== 'stamp') {
      const s = strokeFrom(live);
      shown = { ...doc, layers: doc.layers.map((l, i) => (i === layer ? { ...l, items: [...l.items, s] } : l)) };
    }
    const data = renderDoc(shown, masks, PREVIEW, { text: canvasTextRasterizer });
    const tmp = createCanvas(PREVIEW) as HTMLCanvasElement | null;
    const tctx = tmp?.getContext('2d');
    if (tmp && tctx) { tctx.putImageData(new ImageData(data, PREVIEW, PREVIEW), 0, 0); ctx.drawImage(tmp, 0, 0); }
    ctx.strokeStyle = '#d33';
    ctx.lineWidth = 2;
    const cx = cursor.u * PREVIEW, cy = cursor.v * PREVIEW;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
    // strokeFrom phụ thuộc state cọ; liệt kê đủ để xem trước cập nhật.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, masks, region, side, live, cursor, layer, ink, size, opacity, tool]);

  function strokeFrom(points: number[]): StrokeItem {
    return { type: 'stroke', id: 'live', region, side, points, size, opacity, ink, erase: tool === 'eraser' };
  }

  function stampAt(u: number, v: number): StampItem {
    return { type: 'stamp', id: newId('s'), templateId, text, region, side, u, v, rotation, scale, flipX, opacity, ink };
  }

  /** Điểm trỏ -> điểm hợp lệ trong đảo UV của vùng; null nếu vùng chưa có mask. */
  const snap = (u: number, v: number) => clampToIsland(regionMasks, u, v);

  function finishStroke(points: number[] | null) {
    setLive(null);
    if (!points || points.length < 2) return;
    const before = hist.present;
    const next = addItem(before, layer, { ...strokeFrom(points), id: newId('k') });
    apply(next, next === before ? 'Không thêm được nét: vượt giới hạn.' : tool === 'eraser' ? 'Đã tẩy.' : 'Đã vẽ nét.');
  }

  function uvOfPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const raw = uvOfPointer(e);
    const p = snap(raw.u, raw.v);
    if (!p) { setMsg('Vùng này chưa có dữ liệu UV.'); return; }
    setCursor(p);
    if (tool === 'stamp') {
      const before = hist.present;
      const next = addItem(before, layer, stampAt(p.u, p.v));
      apply(next, next === before ? 'Không đặt được mẫu.' : 'Đã đặt mẫu.');
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLive([p.u, p.v]);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!live) return;
    const raw = uvOfPointer(e);
    const p = snap(raw.u, raw.v);
    if (!p) return;
    setCursor(p);
    if (live.length / 2 < PAINT_LIMITS.maxPointsPerStroke) setLive([...live, p.u, p.v]);
  }
  function onPointerUp() { if (live) finishStroke(live); }

  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key in d) {
      e.preventDefault();
      const p = snap(cursor.u + d[e.key][0], cursor.v + d[e.key][1]);
      if (!p) return;
      setCursor(p);
      if (live && live.length / 2 < PAINT_LIMITS.maxPointsPerStroke) setLive([...live, p.u, p.v]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tool === 'stamp') {
        const before = hist.present;
        const next = addItem(before, layer, stampAt(cursor.u, cursor.v));
        apply(next, next === before ? 'Không đặt được mẫu.' : 'Đã đặt mẫu.');
      } else if (live) finishStroke(live);
      else { setLive([cursor.u, cursor.v]); setMsg('Bút đã hạ. Dùng mũi tên để vẽ, Enter để nhấc bút.'); }
    } else if (e.key === 'Escape') { setLive(null); setMsg('Đã huỷ nét.'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist((h) => (e.shiftKey ? redo(h) : undo(h))); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist((h) => redo(h)); }
  }

  const empty = masks.length === 0;
  return (
    <section aria-label="Vẽ hình xăm" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', font: '13px system-ui' }}>
      <div>
        <canvas
          ref={previewRef}
          width={PREVIEW}
          height={PREVIEW}
          tabIndex={0}
          role="application"
          aria-label={`Bản đồ UV vùng ${REGION_LABEL[region] ?? region}. Mũi tên di chuyển, Enter hạ hoặc nhấc bút, Esc huỷ.`}
          style={{ width: 384, height: 384, touchAction: 'none', border: '1px solid #888', cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setLive(null)}
          onKeyDown={onKeyDown}
        />
        <div role="status" aria-live="polite" style={{ minHeight: 18 }}>{empty ? 'Chưa có dữ liệu vùng da (masks).' : msg}</div>
      </div>
      <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
        <label>Vùng{' '}
          <select value={region} onChange={(e) => setRegion(e.target.value as SkinRegion)}>
            {(available.length ? available : TATTOO_REGIONS).map((r) => <option key={r} value={r}>{REGION_LABEL[r] ?? r}</option>)}
          </select>
        </label>
        {sides.length > 0 && (
          <label>Bên{' '}
            <select value={side ?? ''} onChange={(e) => setSide((e.target.value || null) as Side | null)}>
              <option value="">Cả hai</option>
              {sides.map((s) => <option key={regionKey(region, s)} value={s}>{s === 'left' ? 'Trái' : 'Phải'}</option>)}
            </select>
          </label>
        )}
        <div role="radiogroup" aria-label="Công cụ">
          {([['brush', 'Cọ'], ['eraser', 'Tẩy'], ['stamp', 'Mẫu']] as const).map(([t, l]) => (
            <button key={t} type="button" role="radio" aria-checked={tool === t} onClick={() => setTool(t)} style={{ fontWeight: tool === t ? 700 : 400 }}>{l}</button>
          ))}
        </div>
        <label>Cỡ cọ <input type="range" min={PAINT_LIMITS.brush.min} max={PAINT_LIMITS.brush.max} step={0.001} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <label>Độ mờ <input type="range" min={PAINT_LIMITS.opacity.min} max={PAINT_LIMITS.opacity.max} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
        <div role="group" aria-label="Màu mực">
          {INK_PALETTE.map((s) => (
            <button key={s.hex} type="button" aria-label={s.label} aria-pressed={ink === s.hex} title={s.label} onClick={() => setInk(s.hex)}
              style={{ width: 24, height: 24, marginRight: 4, background: s.hex, border: ink === s.hex ? '3px solid #d33' : '1px solid #666' }} />
          ))}
        </div>
        {tool === 'stamp' && (
          <>
            <label>Mẫu{' '}
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {STAMP_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value={TEXT_TEMPLATE_ID}>Chữ</option>
              </select>
            </label>
            {templateId === TEXT_TEMPLATE_ID && (
              <label>Chữ <input type="text" value={text} maxLength={PAINT_LIMITS.maxTextLength} onChange={(e) => setText(e.target.value)} /></label>
            )}
            <label>Xoay <input type="range" min={-Math.PI} max={Math.PI} step={0.05} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} /></label>
            <label>Tỉ lệ <input type="range" min={PAINT_LIMITS.scale.min} max={PAINT_LIMITS.scale.max} step={0.1} value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
            <label><input type="checkbox" checked={flipX} onChange={(e) => setFlipX(e.target.checked)} /> Lật ngang</label>
          </>
        )}
        <label>Lớp{' '}
          <select value={layer} onChange={(e) => setLayer(Number(e.target.value))}>
            {doc.layers.map((l, i) => <option key={l.id} value={i}>{l.name}{l.visible ? '' : ' (ẩn)'}</option>)}
          </select>
        </label>
        <div>
          <button type="button" onClick={() => apply(addLayer(doc), 'Đã thêm lớp.')}>Thêm lớp</button>{' '}
          <button type="button" onClick={() => apply(toggleLayer(doc, layer))}>Ẩn/hiện lớp</button>
        </div>
        <div>
          <button type="button" disabled={!hist.past.length} onClick={() => setHist(undo)}>Hoàn tác</button>{' '}
          <button type="button" disabled={!hist.future.length} onClick={() => setHist(redo)}>Làm lại</button>
        </div>
        <div>
          <button type="button" onClick={() => apply(clearRegion(doc, region, side), 'Đã xoá vùng.')}>Xoá vùng</button>{' '}
          <button type="button" onClick={() => apply(emptyDoc(), 'Đã xoá tất cả.')}>Xoá tất cả</button>
        </div>
      </div>
    </section>
  );
}

/** Hook tiện cho nơi mount: áp canvas xăm lên mesh thân và tự gỡ khi đổi mesh hoặc unmount. */
export function useTattooOverlay(bodyMesh: import('three').Mesh | null) {
  const handle = useRef<TattooOverlayHandle | null>(null);
  const canvas = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null);
  const attach = useCallback((c: HTMLCanvasElement | OffscreenCanvas) => {
    if (canvas.current === c && handle.current) { handle.current.update(); return; }
    handle.current?.dispose();
    canvas.current = c;
    handle.current = bodyMesh ? applyTattooOverlay(bodyMesh, c) : null;
  }, [bodyMesh]);
  useEffect(() => () => { handle.current?.dispose(); handle.current = null; }, [bodyMesh]);
  return attach;
}
