import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { announce } from '../a11y';
import { ROOM_BOUNDS, setPaused } from '../scene/controls';
import type { Bounds, FollowParams } from './cameraModes';
import { downloadBlob } from './download';
import type { PhotoFormat } from './filename';
import { ASPECT_IDS, LONG_EDGE_PRESETS, type AspectId } from './framing';
import { PhotoCapture, type PhotoCaptureApi } from './PhotoCapture';
import { usePhotoHudHidden } from './usePhotoHud';

/**
 * Chế độ chụp ảnh: một kho nhỏ dùng chung giữa phần trong Canvas (PhotoScene) và bảng DOM (PhotoPanel).
 * Camera: bám theo nhân vật, nhìn từ sau lưng hoặc chính diện. Camera tự do và preset cố định chưa làm.
 */
interface PhotoState {
  active: boolean;
  front: boolean;
  aspect: AspectId;
  longEdge: number;
  format: PhotoFormat;
  hideHud: boolean;
}

let state: PhotoState = { active: false, front: false, aspect: 'viewport', longEdge: 1920, format: 'png', hideHud: true };
const listeners = new Set<() => void>();
const apiRef: { current: PhotoCaptureApi | null } = { current: null };

function set(patch: Partial<PhotoState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getState = (): PhotoState => state;

export function usePhotoState(): PhotoState {
  return useSyncExternalStore(subscribe, getState, getState);
}
export function setPhotoActive(active: boolean): void {
  set({ active });
}

const BOUNDS: Bounds = { minX: ROOM_BOUNDS.minX, maxX: ROOM_BOUNDS.maxX, minZ: ROOM_BOUNDS.minZ, maxZ: ROOM_BOUNDS.maxZ, minY: 0.3, maxY: 3.2 };

/** Đặt BÊN TRONG Canvas, SAU component camera chính. */
export function PhotoScene(): JSX.Element {
  const s = usePhotoState();
  const follow: FollowParams = { dist: 3, pitch: 0.18, azimuthOffset: s.front ? Math.PI : 0, targetHeight: 1.35 };
  return (
    <PhotoCapture
      active={s.active}
      mode="follow"
      follow={follow}
      free={{ position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 }}
      bounds={BOUNDS}
      apiRef={apiRef}
    />
  );
}

const ERRORS: Record<string, string> = {
  'no-crop': 'Không tính được vùng cắt.',
  'no-size': 'Kích thước ảnh không hợp lệ.',
  blank: 'Ảnh trống, chưa lưu.',
  tainted: 'Không đọc được điểm ảnh của canvas.',
  encode: 'Không mã hóa được ảnh.',
  busy: 'Đang chụp, thử lại sau.',
};

/** Nút bật chế độ và bảng điều khiển chụp ảnh (DOM). Tạm dừng nhập liệu của nhân vật khi bật. */
export function PhotoPanel(): JSX.Element {
  const s = usePhotoState();
  const [msg, setMsg] = useState('');
  const busy = useRef(false);

  usePhotoHudHidden(s.active && s.hideHud);

  useEffect(() => {
    if (!s.active) return undefined;
    setPaused(true);
    return () => setPaused(false);
  }, [s.active]);

  useEffect(() => {
    if (!s.active) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') set({ active: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.active]);

  const capture = async (): Promise<void> => {
    const api = apiRef.current;
    if (!api || busy.current) return;
    busy.current = true;
    try {
      const r = await api.capture({ aspect: s.aspect, longEdge: s.longEdge, format: s.format, quality: 0.92, hudHidden: s.hideHud });
      if (r.ok) {
        downloadBlob(r.blob, r.fileName);
        const text = `Đã chụp ${r.width}×${r.height}. ${r.reducedReason}`.trim();
        setMsg(text);
        announce(text);
      } else {
        const text = ERRORS[r.error] ?? 'Không chụp được.';
        setMsg(text);
        announce(text, 'assertive');
      }
    } finally {
      busy.current = false;
    }
  };

  if (!s.active) {
    return (
      <button
        type="button"
        className="ui-hud-chip photo-open"
        data-hud
        aria-label="Chế độ chụp ảnh"
        onClick={() => set({ active: true })}
      >
        <span aria-hidden="true" className="ui-hud-chip-icon">◎</span>
        <span className="ui-hud-chip-label">Chụp ảnh</span>
      </button>
    );
  }

  return (
    <div className="photo-panel" role="dialog" aria-label="Chế độ chụp ảnh">
      <label>
        Tỷ lệ{' '}
        <select value={s.aspect} onChange={(e) => set({ aspect: e.target.value as AspectId })}>
          {ASPECT_IDS.map((a) => (
            <option key={a} value={a}>{a === 'viewport' ? 'Theo khung hình' : a}</option>
          ))}
        </select>
      </label>
      <label>
        Cạnh dài{' '}
        <select value={s.longEdge} onChange={(e) => set({ longEdge: Number(e.target.value) })}>
          {LONG_EDGE_PRESETS.map((n) => (
            <option key={n} value={n}>{n}px</option>
          ))}
        </select>
      </label>
      <label>
        Định dạng{' '}
        <select value={s.format} onChange={(e) => set({ format: e.target.value as PhotoFormat })}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={s.front} onChange={(e) => set({ front: e.target.checked })} /> Chụp chính diện
      </label>
      <label>
        <input type="checkbox" checked={s.hideHud} onChange={(e) => set({ hideHud: e.target.checked })} /> Ẩn giao diện
      </label>
      <div className="photo-actions">
        <button type="button" className="btn" onClick={() => void capture()}>Chụp</button>
        <button type="button" className="btn btn-ghost" onClick={() => set({ active: false })}>Đóng (Esc)</button>
      </div>
      {msg && <p className="photo-msg" role="status">{msg}</p>}
    </div>
  );
}
