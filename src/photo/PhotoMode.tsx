import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { announce } from '../a11y';
import { holdPause } from '../scene/controls';
import { cancelEmote, getEmoteState, holdEmotePose, playEmote, releaseHeldPose } from '../emotes/player';
import itZone from '../content/zones/it.json';
import type { ZoneDef } from '../content/types';
import { decorBlockersOf } from '../env';
import { entryBlockers } from '../scene/entry/placement';
import { collisionRects, type Rect } from '../scene/layout';
import { OFFICE_PROP_BLOCKERS } from '../scene/officePropsLayout';
import { playerPose } from '../scene/controls/playerPose';
import { OFFICE_L_RECTS } from '../scene/officeBounds';
import { stepFreeCamera, type Bounds, type FollowParams } from './cameraModes';
import { downloadBlob } from './download';
import type { PhotoFormat } from './filename';
import { ASPECT_IDS, aspectRatio, clampFov, computeCropRect, gridLines, type AspectId, type GridKind } from './framing';
import { PhotoCapture, type FreeCam, type PhotoCaptureApi } from './PhotoCapture';
import {
  PITCH_LIMIT,
  PRESETS,
  applyLook,
  boundingBox,
  clampToOfficeBoxes,
  computePresetPose,
  lookAngles,
  moveFromKeys,
  nextCountdown,
  scaleMove,
  tiltToRadians,
  type CaptureScale,
  type PresetId,
} from './photoLogic';
import { escapeBlockers, slideCamera } from './photoCollision';
import { isPhotoPose, photoPoseOptions } from './photoPose';
import { usePhotoHudHidden } from './usePhotoHud';
import type { UserEmoteId } from '../emotes/types';

/**
 * Chế độ chụp ảnh: một kho nhỏ dùng chung giữa phần trong Canvas (PhotoScene) và bảng DOM (PhotoPanel).
 * Hai kiểu camera: 'orbit' (bám nhân vật) và 'free' (bay WASD/QE + kéo chuột, kẹp trong văn phòng chữ L).
 * Mọi cài đặt (FOV, nghiêng, lưới, tỷ lệ) chỉ áp trong chế độ chụp; thoát là khôi phục camera chính.
 */
type CamKind = 'orbit' | 'free';

interface PhotoState {
  active: boolean;
  cam: CamKind;
  front: boolean;
  aspect: AspectId;
  scale: CaptureScale;
  format: PhotoFormat;
  hideHud: boolean;
  fov: number;
  tilt: number;
  grid: GridKind;
  timer: 0 | 3 | 10;
  /** Tư thế giữ khi chụp (emote người dùng); '' là không giữ. */
  pose: UserEmoteId | '';
}

let state: PhotoState = {
  active: false, cam: 'orbit', front: false, aspect: 'viewport', scale: 1, format: 'png', hideHud: true,
  fov: 50, tilt: 0, grid: 'none', timer: 0, pose: '',
};
const listeners = new Set<() => void>();
const apiRef: { current: PhotoCaptureApi | null } = { current: null };
/** Camera tự do dạng đối tượng khả biến: FreeFly ghi mỗi khung, PhotoCapture đọc cùng khung (không qua React). */
const freeCam: FreeCam = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };

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

/**
 * Cờ cho App/scene: true khi photo mode đang bật. Khi true, điều khiển nhân vật phải bị khóa
 * (PhotoPanel giữ holdPause('photo') của scene/controls; App có thể đọc cờ này nếu cần khóa thêm đầu vào khác).
 */
export function isPhotoControlLocked(): boolean {
  return state.active;
}
/** True khi đang bay camera tự do (phím WASD/QE thuộc về photo mode). */
export function isPhotoFlying(): boolean {
  return state.active && state.cam === 'free';
}
/** Hook của cờ khóa điều khiển nhân vật để component React phản ứng. */
export function usePhotoControlLocked(): boolean {
  return usePhotoState().active;
}

const OFFICE_BOX = boundingBox(OFFICE_L_RECTS);
const MIN_Y = 0.3;
const MAX_Y = 3.2;
const BOUNDS: Bounds = { minX: OFFICE_BOX.minX, maxX: OFFICE_BOX.maxX, minZ: OFFICE_BOX.minZ, maxZ: OFFICE_BOX.maxZ, minY: MIN_Y, maxY: MAX_Y };

/**
 * Vật cản của camera tự do: cùng nguồn với ITOffice (đồ nội thất, vật trang trí không cây, bàn lối vào, đạo cụ).
 * Dựng một lần từ it.json; bố cục tự sắp xếp của người dùng không được phản ánh (camera chụp ảnh chỉ là xấp xỉ).
 */
const PHOTO_OBSTACLES: readonly Rect[] = (() => {
  const objects = (itZone as unknown as ZoneDef).objects;
  return [...collisionRects(objects), ...decorBlockersOf(objects, false), ...entryBlockers(objects), ...OFFICE_PROP_BLOCKERS];
})();

/** Đặt camera tự do theo preset quanh nhân vật, kẹp vào văn phòng. */
function applyPreset(id: PresetId): void {
  const r = computePresetPose(id, playerPose);
  const pos = escapeBlockers(clampToOfficeBoxes(r.position, OFFICE_L_RECTS, MIN_Y, MAX_Y), PHOTO_OBSTACLES);
  const a = lookAngles(pos, r.target);
  freeCam.position = pos;
  freeCam.yaw = a.yaw;
  freeCam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, a.pitch));
  set({ cam: 'free', fov: r.fov });
}

/** Bay camera tự do: WASD di chuyển, Q/E xuống/lên, Shift nhanh, kéo chuột để xoay. Chỉ chạy khi cam = 'free'. */
function FreeFly(): null {
  const s = usePhotoState();
  const camera = useThree((t) => t.camera);
  const keys = useRef(new Set<string>());
  const fast = useRef(false);
  const flying = s.active && s.cam === 'free';

  // Vào chế độ bay: khởi tạo từ camera hiện tại để không giật.
  useEffect(() => {
    if (!flying) return;
    freeCam.position = escapeBlockers(
      clampToOfficeBoxes({ x: camera.position.x, y: camera.position.y, z: camera.position.z }, OFFICE_L_RECTS, MIN_Y, MAX_Y),
      PHOTO_OBSTACLES,
    );
    const dir = { x: 0, y: 0, z: -1 };
    const e = camera.getWorldDirection(camera.position.clone());
    dir.x = e.x; dir.y = e.y; dir.z = e.z;
    const a = lookAngles({ x: 0, y: 0, z: 0 }, dir);
    freeCam.yaw = a.yaw;
    freeCam.pitch = a.pitch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying]);

  useEffect(() => {
    if (!flying) return undefined;
    const ks = keys.current;
    const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    const down = (e: KeyboardEvent): void => {
      if (typing(e.target)) return;
      if (/^(Key[WASDQE])$/.test(e.code)) {
        ks.add(e.code);
        e.preventDefault();
      }
      fast.current = e.shiftKey;
    };
    const up = (e: KeyboardEvent): void => {
      ks.delete(e.code);
      fast.current = e.shiftKey;
    };
    let drag = false;
    const pd = (e: PointerEvent): void => {
      if (e.target instanceof HTMLCanvasElement) drag = true;
    };
    const pu = (): void => { drag = false; };
    const pm = (e: PointerEvent): void => {
      if (!drag) return;
      const r = applyLook(freeCam.yaw, freeCam.pitch, e.movementX, e.movementY);
      freeCam.yaw = r.yaw;
      freeCam.pitch = r.pitch;
    };
    const blur = (): void => ks.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', pd);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointermove', pm);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('blur', blur);
      ks.clear();
    };
  }, [flying]);

  useFrame((_, dt) => {
    if (!flying) return;
    const m = scaleMove(moveFromKeys(keys.current), dt, 3, fast.current);
    if (m.forward === 0 && m.right === 0 && m.up === 0) return;
    // stepFreeCamera kẹp hộp bao, rồi kẹp lại vào hợp các hộp chữ L (không bay ra ngoài vùng khuyết).
    const boxed = stepFreeCamera(freeCam.position, freeCam.yaw, m, BOUNDS);
    // Rồi trượt dọc đồ nội thất và dừng trước băng rôn (không xuyên).
    freeCam.position = slideCamera(freeCam.position, clampToOfficeBoxes(boxed, OFFICE_L_RECTS, MIN_Y, MAX_Y), PHOTO_OBSTACLES);
  });
  return null;
}

/** Đặt BÊN TRONG Canvas, SAU component camera chính. */
export function PhotoScene(): JSX.Element {
  const s = usePhotoState();
  const follow: FollowParams = { dist: 3, pitch: 0.18, azimuthOffset: s.front ? Math.PI : 0, targetHeight: 1.35 };
  return (
    <>
      <FreeFly />
      <PhotoCapture
        active={s.active}
        mode={s.cam === 'free' ? 'free' : 'follow'}
        follow={follow}
        free={freeCam}
        bounds={BOUNDS}
        fov={clampFov(s.fov)}
        roll={tiltToRadians(s.tilt)}
        apiRef={apiRef}
      />
    </>
  );
}

/** Lớp phủ khung tỷ lệ và lưới 1/3. DOM thuần, không nằm trong canvas nên không lọt vào ảnh. */
function FrameOverlay({ aspect, grid }: { aspect: AspectId; grid: GridKind }): JSX.Element | null {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = (): void => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const crop = computeCropRect(vp.w, vp.h, aspectRatio(aspect, vp.w, vp.h));
  if (!crop) return null;
  const lines = gridLines(grid);
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', left: crop.x, top: crop.y, width: crop.w, height: crop.h,
        outline: '9999px solid rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: 40,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ display: 'block' }}>
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(255,255,255,0.7)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
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
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCountdown = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setCount(0);
  };
  // Thoát photo mode hoặc unmount thì hủy hẹn giờ, không để chụp mồ côi.
  useEffect(() => {
    if (!s.active) cancelCountdown();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [s.active]);

  usePhotoHudHidden(s.active && s.hideHud);

  // Tư thế nhân vật: nhớ emote đang giữ (stance) lúc vào, giữ khung đứng yên khi chọn, thoát thì trả lại.
  const prevEmote = useRef<ReturnType<typeof getEmoteState> | null>(null);
  useEffect(() => {
    if (!s.active) return undefined;
    prevEmote.current = getEmoteState();
    return () => {
      releaseHeldPose();
      const p = prevEmote.current;
      if (p && p.phase === 'playing' && p.mode === 'hold' && p.id !== null) {
        cancelEmote();
        playEmote(p.id);
      }
      prevEmote.current = null;
      set({ pose: '' });
    };
  }, [s.active]);
  useEffect(() => {
    if (!s.active) return;
    if (s.pose) holdEmotePose(s.pose);
    else releaseHeldPose();
  }, [s.active, s.pose]);

  useEffect(() => {
    if (!s.active) return undefined;
    return holdPause('photo');
  }, [s.active]);

  useEffect(() => {
    if (!s.active) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (timerRef.current) cancelCountdown();
        else set({ active: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.active]);

  const capture = async (): Promise<void> => {
    const api = apiRef.current;
    if (!api || busy.current) return;
    busy.current = true;
    try {
      const r = await api.capture({ aspect: s.aspect, longEdge: 1920, scale: s.scale, format: s.format, quality: 0.92, hudHidden: s.hideHud });
      if (r.ok) {
        downloadBlob(r.blob, r.fileName);
        const text = `Đã chụp ${r.width}×${r.height}.${r.reducedReason !== 'none' ? ` Đã giảm kích thước (${r.reducedReason}), thử 1x hoặc tỷ lệ nhỏ hơn.` : ''}`;
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

  /** Bấm chụp: có hẹn giờ thì đếm ngược từng giây rồi mới chụp. */
  const start = (): void => {
    if (timerRef.current || busy.current) return;
    if (s.timer === 0) {
      void capture();
      return;
    }
    const tick = (n: number): void => {
      setCount(n);
      if (n <= 0) {
        timerRef.current = null;
        void capture();
        return;
      }
      timerRef.current = setTimeout(() => tick(nextCountdown(n)), 1000);
    };
    tick(s.timer);
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

  const flying = s.cam === 'free';
  return (
    <>
      <FrameOverlay aspect={s.aspect} grid={s.grid} />
      {count > 0 && (
        <div role="status" aria-live="assertive" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', fontSize: '8rem', color: '#fff', textShadow: '0 0 12px #000', pointerEvents: 'none', zIndex: 50 }}>
          {count}
        </div>
      )}
      <div className="photo-panel" role="dialog" aria-modal="false" aria-label="Chế độ chụp ảnh" style={count > 0 ? { visibility: 'hidden' } : undefined}>
        <label>
          Camera{' '}
          <select value={s.cam} onChange={(e) => set({ cam: e.target.value as CamKind })}>
            <option value="orbit">Bám nhân vật</option>
            <option value="free">Tự do (WASD/QE + kéo chuột)</option>
          </select>
        </label>
        <label>
          Góc máy{' '}
          <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value as PresetId)}>
            <option value="">Chọn preset...</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>
          FOV {Math.round(s.fov)}°{' '}
          <input type="range" min={20} max={100} value={s.fov} onChange={(e) => set({ fov: Number(e.target.value) })} />
        </label>
        <label>
          Nghiêng {s.tilt}°{' '}
          <input type="range" min={-45} max={45} value={s.tilt} onChange={(e) => set({ tilt: Number(e.target.value) })} />
        </label>
        <label>
          Lưới{' '}
          <select value={s.grid} onChange={(e) => set({ grid: e.target.value as GridKind })}>
            <option value="none">Không</option>
            <option value="thirds">Lưới 1/3</option>
            <option value="center">Tâm</option>
          </select>
        </label>
        <label>
          Tỷ lệ{' '}
          <select value={s.aspect} onChange={(e) => set({ aspect: e.target.value as AspectId })}>
            {ASPECT_IDS.map((a) => (
              <option key={a} value={a}>{a === 'viewport' ? 'Theo khung hình' : a}</option>
            ))}
          </select>
        </label>
        <label>
          Độ phân giải{' '}
          <select value={s.scale} onChange={(e) => set({ scale: Number(e.target.value) as CaptureScale })}>
            <option value={1}>1x</option>
            <option value={2}>2x (có giới hạn)</option>
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
          Hẹn giờ{' '}
          <select value={s.timer} onChange={(e) => set({ timer: Number(e.target.value) as 0 | 3 | 10 })}>
            <option value={0}>Tắt</option>
            <option value={3}>3 giây</option>
            <option value={10}>10 giây</option>
          </select>
        </label>
        <label>
          Tư thế nhân vật{' '}
          <select
            value={s.pose}
            aria-describedby="photo-pose-hint"
            onChange={(e) => {
              const v = e.target.value;
              set({ pose: isPhotoPose(v) ? v : '' });
              announce(v ? 'Đã chọn tư thế nhân vật.' : 'Đã bỏ tư thế nhân vật.');
            }}
          >
            <option value="">Không giữ tư thế</option>
            {photoPoseOptions().map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <span id="photo-pose-hint" className="ui-sr-only">Nhân vật giữ tư thế đứng yên trong lúc chụp, thoát chế độ chụp sẽ trả lại.</span>
        {!flying && (
          <label>
            <input type="checkbox" checked={s.front} onChange={(e) => set({ front: e.target.checked })} /> Chụp chính diện
          </label>
        )}
        <label>
          <input type="checkbox" checked={s.hideHud} onChange={(e) => set({ hideHud: e.target.checked })} /> Ẩn giao diện
        </label>
        <div className="photo-actions">
          <button type="button" className="btn" onClick={start}>Chụp</button>
          <button type="button" className="btn btn-ghost" onClick={() => set({ active: false })}>Đóng (Esc)</button>
        </div>
        {msg && <p className="photo-msg" role="status">{msg}</p>}
      </div>
    </>
  );
}
