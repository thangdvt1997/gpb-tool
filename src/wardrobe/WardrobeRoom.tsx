import { Suspense, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DEFAULT_APPEARANCE, type Appearance } from '../avatar/appearance';
import type { AvatarAnimation } from '../avatar/animation';
import { MpfbAvatar, targetHeightM } from '../avatar/MpfbAvatar';
import { garmentSupport } from '../avatar/outfit/compat';
import {
  ACCESSORY_SIZE_MAX,
  ACCESSORY_SIZE_MIN,
  ACCESSORY_SLOT_LABELS,
  GARMENT_GROUP_LABELS,
  MAX_RINGS,
  PATTERNS,
  PATTERN_TEXT_MAX,
  accessoriesInSlot,
  garmentsInGroup,
  getAccessory,
  getGarment,
  getPattern,
  STYLE_TAG_LABELS,
} from '../fashion/catalog';
import { MAX_PATTERNS_PER_GARMENT } from '../fashion/rules';
import { GARMENT_PALETTE } from '../fashion/palette';
import { PRESETS } from '../fashion/presets';
import { BODY_LIMITS_BY_STYLE } from '../fashion/rules';
import { ACCESSORY_SLOTS, OUTFIT_SLOTS, PHONE_STATES, type AccessorySlot, type BodyStyle, type CharacterLook, type OutfitSlot, type RingFinger, type Side, type WornAccessory } from '../fashion/types';
import { SHAPE_SLIDERS, UNSUPPORTED_SHAPE, type SliderGroup } from './shapeSliders';
import {
  REMOVABLE_SLOTS,
  WARDROBE_TABS,
  canConfirm,
  initWardrobe,
  isDirty,
  previewLook,
  wardrobeKey,
  wardrobeReducer,
  type WardrobeTab,
} from './wardrobeState';

export interface WardrobeRoomProps {
  /** Look hiện tại của nhân vật; phòng thay đồ chỉnh bản nháp và chỉ trả về khi xác nhận. */
  initialLook: CharacterLook;
  appearance?: Appearance;
  onConfirm: (look: CharacterLook) => void;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

type Focus = 'full' | 'face' | 'torso' | 'legs' | 'feet';

/** Điểm nhìn theo phần trăm chiều cao và khoảng cách theo chiều cao. */
const FOCUS: Readonly<Record<Focus, { y: number; dist: number }>> = {
  full: { y: 0.5, dist: 2.6 },
  face: { y: 0.92, dist: 0.9 },
  torso: { y: 0.68, dist: 1.4 },
  legs: { y: 0.3, dist: 1.5 },
  feet: { y: 0.06, dist: 1.0 },
};

function focusFor(tab: WardrobeTab, slot: OutfitSlot): Focus {
  if (tab !== 'outfit' && tab !== 'color') return 'full';
  switch (slot) {
    case 'inner':
    case 'outer':
      return 'torso';
    case 'bottom':
    case 'socks':
      return 'legs';
    case 'shoes':
      return 'feet';
    case 'hat':
      return 'face';
    default:
      return 'full';
  }
}

interface CameraRigProps {
  controls: RefObject<OrbitControlsImpl>;
  focus: Focus;
  /** Tăng để buộc về góc chuẩn (nút "Góc nhìn chuẩn"). */
  resetToken: number;
  heightM: number;
}

/** Tự đưa camera tới vùng đang chỉnh trong khoảng 1,2 giây rồi trả quyền cho người dùng xoay/zoom. */
function CameraRig({ controls, focus, resetToken, heightM }: CameraRigProps) {
  const budget = useRef(1.2);
  const front = useRef(false);
  const dir = useMemo(() => new THREE.Vector3(0, 0.1, 1).normalize(), []);
  const goalT = useMemo(() => new THREE.Vector3(), []);
  const goalP = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    budget.current = 1.2;
  }, [focus, heightM]);
  useEffect(() => {
    budget.current = 1.2;
    front.current = true;
  }, [resetToken]);
  useFrame(({ camera }, dt) => {
    const c = controls.current;
    if (!c || budget.current <= 0) return;
    budget.current -= dt;
    const f = FOCUS[focus];
    goalT.set(0, f.y * heightM, 0);
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.1));
    if (front.current) {
      goalP.copy(goalT).addScaledVector(dir, f.dist * heightM);
    } else {
      // Giữ góc xoay hiện tại, chỉ đổi khoảng cách và điểm nhìn.
      goalP.copy(camera.position).sub(c.target).normalize().multiplyScalar(f.dist * heightM).add(goalT);
    }
    c.target.lerp(goalT, k);
    camera.position.lerp(goalP, k);
    c.update();
    if (budget.current <= 0) front.current = false;
  });
  return null;
}

interface PreviewProps {
  look: CharacterLook;
  appearance: Appearance;
  animation: AvatarAnimation;
  focus: Focus;
  resetToken: number;
}

function Preview({ look, appearance, animation, focus, resetToken }: PreviewProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const avatar = useRef<THREE.Group>(null);
  const heightM = targetHeightM(look.bodyStyle, look.body.frame, look.body.heightCm);
  return (
    <>
      <color attach="background" args={['#262b33']} />
      <hemisphereLight args={['#dfe8f5', '#3a3f48', 0.9]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[1.4, 48]} />
        <meshStandardMaterial color="#3a414c" roughness={0.9} />
      </mesh>
      <group ref={avatar}>
        <Suspense fallback={null}>
          <MpfbAvatar appearance={appearance} look={look} animation={animation} />
        </Suspense>
      </group>
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.5} maxDistance={6} target={[0, heightM * 0.5, 0]} />
      <CameraRig controls={controls} focus={focus} resetToken={resetToken} heightM={heightM} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kiểu                                                                */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#1c2027',
  panel: '#232831',
  line: '#3a414d',
  text: '#e8ecf2',
  dim: '#9aa4b2',
  accent: '#4aa3ff',
  warn: '#e0a63a',
  err: '#ef6a6a',
  ok: '#58c28a',
};

const S: Record<string, CSSProperties> = {
  root: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', background: C.bg, color: C.text, font: '14px system-ui, sans-serif' },
  stage: { position: 'relative', flex: 1, minWidth: 0, touchAction: 'none' },
  side: { width: 380, maxWidth: '48vw', display: 'flex', flexDirection: 'column', background: C.panel, borderLeft: `1px solid ${C.line}` },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, borderBottom: `1px solid ${C.line}` },
  body: { flex: 1, overflowY: 'auto', padding: 12 },
  foot: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderTop: `1px solid ${C.line}`, alignItems: 'center' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' },
  h: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: C.dim, margin: '12px 0 6px' },
  stageBar: { position: 'absolute', left: 10, bottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 },
};

function btn(active = false, disabled = false): CSSProperties {
  return {
    minHeight: 36,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${active ? C.accent : C.line}`,
    background: active ? '#1d3b5c' : '#2b313b',
    color: disabled ? '#6b7480' : C.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    font: 'inherit',
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 style={S.h}>{title}</h3>
      {children}
    </section>
  );
}

const SLOT_SHORT: Readonly<Record<OutfitSlot, string>> = {
  inner: GARMENT_GROUP_LABELS.inner,
  outer: GARMENT_GROUP_LABELS.outer,
  bottom: GARMENT_GROUP_LABELS.bottom,
  onePiece: GARMENT_GROUP_LABELS.onePiece,
  socks: GARMENT_GROUP_LABELS.socks,
  shoes: GARMENT_GROUP_LABELS.shoes,
  hat: GARMENT_GROUP_LABELS.hat,
};

const SLIDER_GROUP_LABEL: Readonly<Record<SliderGroup, string>> = { overall: 'Tổng thể', torso: 'Thân', head: 'Đầu' };

const POSES: readonly { id: AvatarAnimation; label: string }[] = [
  { id: 'idle', label: 'Đứng' },
  { id: 'walk', label: 'Đi' },
  { id: 'run', label: 'Chạy' },
  { id: 'sit', label: 'Ngồi' },
  { id: 'wave', label: 'Giơ tay' },
];

/* ------------------------------------------------------------------ */
/* Phòng thay đồ                                                       */
/* ------------------------------------------------------------------ */

export function WardrobeRoom({ initialLook, appearance = DEFAULT_APPEARANCE, onConfirm, onCancel }: WardrobeRoomProps) {
  const [s, dispatch] = useReducer(wardrobeReducer, initialLook, initWardrobe);
  const [pose, setPose] = useStateAnimation();
  const resetToken = useRef(0);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const shown = previewLook(s);
  const focus = focusFor(s.tab, s.slot);
  const draftRef = useRef(s);
  draftRef.current = s;
  const rootRef = useRef<HTMLDivElement>(null);

  // Mở: đưa focus vào hộp thoại. Đóng (unmount): trả focus về nơi mở (thường là nút "Phòng thay đồ").
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    return () => {
      if (prev && prev.isConnected) prev.focus();
    };
  }, []);

  // Phím tắt: Esc hủy, Ctrl+Enter xác nhận, Ctrl+Z/Y hoàn tác, 1-5 chuyển tab, V về góc chuẩn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
      const intent = wardrobeKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, inField });
      if (!intent) return;
      e.preventDefault();
      if (intent.type === 'action') dispatch(intent.action);
      else if (intent.type === 'cancel') onCancel();
      else if (intent.type === 'confirm') {
        if (canConfirm(draftRef.current)) onConfirm(draftRef.current.draft);
      } else if (intent.type === 'resetView') {
        resetToken.current++;
        force();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div ref={rootRef} style={S.root} role="dialog" aria-modal="true" aria-label="Phòng thay đồ">
      <div style={S.stage}>
        <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.2, 4], fov: 32 }}>
          <Preview look={shown} appearance={appearance} animation={pose} focus={focus} resetToken={resetToken.current} />
        </Canvas>
        <div style={S.stageBar}>
          {POSES.map((p) => (
            <button key={p.id} type="button" style={btn(pose === p.id)} onClick={() => setPose(p.id)} aria-pressed={pose === p.id}>
              {p.label}
            </button>
          ))}
          <button
            type="button"
            style={btn()}
            onClick={() => {
              resetToken.current++;
              force();
            }}
            title="Phím V"
          >
            Góc nhìn chuẩn
          </button>
        </div>
        {s.compare && (
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', background: '#000a', borderRadius: 6 }}>
            Đang xem bản trước khi chỉnh
          </div>
        )}
      </div>

      <aside style={S.side}>
        <div style={S.tabs} role="tablist" aria-label="Mục chỉnh sửa">
          {WARDROBE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={s.tab === t.id}
              style={btn(s.tab === t.id)}
              onClick={() => dispatch({ type: 'tab', tab: t.id })}
              title={`Phím ${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={S.body}>
          <div aria-live="polite">
            {s.notice && (
              <div
                role={s.notice.kind === 'error' ? 'alert' : 'status'}
                style={{ padding: 8, marginBottom: 10, borderRadius: 6, border: `1px solid ${s.notice.kind === 'error' ? C.err : s.notice.kind === 'warn' ? C.warn : C.line}` }}
              >
                <div>{s.notice.text}</div>
                {s.notice.issues.flatMap((i) => i.suggestions).slice(0, 3).map((id) => {
                  const g = getGarment(id);
                  return g ? (
                    <button key={id} type="button" style={{ ...btn(), marginTop: 6, marginRight: 6 }} onClick={() => dispatch({ type: 'wear', slot: g.group, garmentId: id })}>
                      Thử: {g.name}
                    </button>
                  ) : null;
                })}
                {s.notice.issues.map((i, k) =>
                  i.suggestFit ? (
                    <button key={k} type="button" style={{ ...btn(), marginTop: 6, marginRight: 6 }} onClick={() => dispatch({ type: 'fit', slot: i.slot, fit: i.suggestFit as 'regular' })}>
                      Đổi sang phom {i.suggestFit}
                    </button>
                  ) : null,
                )}
              </div>
            )}
            {s.pending && (
              <div role="alertdialog" aria-label="Xác nhận thay đổi" style={{ padding: 8, marginBottom: 10, borderRadius: 6, border: `1px solid ${C.warn}` }}>
                <div>{s.pending.message}</div>
                <div style={{ ...S.row, marginTop: 6, marginBottom: 0 }}>
                  <button type="button" style={btn(true)} onClick={() => dispatch({ type: 'confirmPending' })}>
                    Đồng ý
                  </button>
                  <button type="button" style={btn()} onClick={() => dispatch({ type: 'dismissPending' })}>
                    Giữ nguyên
                  </button>
                </div>
              </div>
            )}
          </div>

          {s.tab === 'presets' && <PresetsTab s={s} dispatch={dispatch} />}
          {s.tab === 'outfit' && <OutfitTab s={s} dispatch={dispatch} />}
          {s.tab === 'color' && <ColorTab s={s} dispatch={dispatch} />}
          {s.tab === 'shape' && <ShapeTab s={s} dispatch={dispatch} />}
          {s.tab === 'style' && <StyleTab s={s} dispatch={dispatch} />}
          {s.tab === 'acc' && <AccessoryTab s={s} dispatch={dispatch} />}
          {s.tab === 'pattern' && <PatternTab s={s} dispatch={dispatch} />}
        </div>

        <div style={S.foot}>
          <button type="button" style={btn(false, s.undoStack.length === 0)} disabled={s.undoStack.length === 0} onClick={() => dispatch({ type: 'undo' })} title="Ctrl+Z">
            Hoàn tác
          </button>
          <button type="button" style={btn(false, s.redoStack.length === 0)} disabled={s.redoStack.length === 0} onClick={() => dispatch({ type: 'redo' })} title="Ctrl+Y">
            Làm lại
          </button>
          <button
            type="button"
            style={btn(s.compare)}
            onPointerDown={() => dispatch({ type: 'compare', on: true })}
            onPointerUp={() => dispatch({ type: 'compare', on: false })}
            onPointerLeave={() => s.compare && dispatch({ type: 'compare', on: false })}
            onBlur={() => s.compare && dispatch({ type: 'compare', on: false })}
          >
            Giữ để so sánh
          </button>
          <button type="button" style={btn(false, !isDirty(s))} disabled={!isDirty(s)} onClick={() => dispatch({ type: 'resetAll' })}>
            Khôi phục
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" style={btn()} onClick={onCancel} title="Esc">
            Hủy
          </button>
          <button type="button" style={btn(true, !canConfirm(s))} disabled={!canConfirm(s)} onClick={() => onConfirm(s.draft)} title="Ctrl+Enter">
            Xác nhận
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Trạng thái tư thế xem thử (chỉ ảnh hưởng xem trước). */
function useStateAnimation(): [AvatarAnimation, (a: AvatarAnimation) => void] {
  return useState<AvatarAnimation>('idle');
}

/* ------------------------------------------------------------------ */
/* Các tab                                                             */
/* ------------------------------------------------------------------ */

interface TabProps {
  s: ReturnType<typeof initWardrobe>;
  dispatch: (a: Parameters<typeof wardrobeReducer>[1]) => void;
}

function PresetsTab({ s, dispatch }: TabProps) {
  return (
    <Section title="Bộ mẫu (giữ nguyên hình thể của bạn)">
      <div style={{ display: 'grid', gap: 8 }}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" style={{ ...btn(s.draft.meta.presetId === p.id), textAlign: 'left' }} onClick={() => dispatch({ type: 'preset', id: p.id })}>
            <strong>{p.name}</strong>
            <div style={{ color: C.dim, fontSize: 12 }}>{p.description}</div>
          </button>
        ))}
      </div>
    </Section>
  );
}

function OutfitTab({ s, dispatch }: TabProps) {
  const worn = s.draft.outfit[s.slot];
  const wornDef = worn ? getGarment(worn.garmentId) : undefined;
  const list = garmentsInGroup(s.slot);
  return (
    <>
      <div style={S.row} role="group" aria-label="Ô trang phục">
        {OUTFIT_SLOTS.map((slot) => (
          <button key={slot} type="button" style={btn(s.slot === slot)} onClick={() => dispatch({ type: 'slot', slot })}>
            {SLOT_SHORT[slot]}
            {s.draft.outfit[slot] ? ' •' : ''}
          </button>
        ))}
      </div>

      {wornDef && worn && (
        <Section title={`Đang mặc: ${wornDef.name}`}>
          <div style={S.row}>
            {wornDef.fits.map((f) => (
              <button key={f} type="button" style={btn(worn.fit === f)} onClick={() => dispatch({ type: 'fit', slot: s.slot, fit: f })}>
                Phom {f === 'regular' ? 'thường' : f === 'slim' ? 'ôm' : 'rộng'}
              </button>
            ))}
            {s.slot === 'inner' && wornDef.tuckable && (
              <button type="button" style={btn(worn.tucked)} aria-pressed={worn.tucked} onClick={() => dispatch({ type: 'tuck', tucked: !worn.tucked })}>
                Sơ vin
              </button>
            )}
            {REMOVABLE_SLOTS.includes(s.slot) && (
              <button type="button" style={btn()} onClick={() => dispatch({ type: 'takeOff', slot: s.slot })}>
                Cởi
              </button>
            )}
          </div>
        </Section>
      )}

      <Section title={GARMENT_GROUP_LABELS[s.slot]}>
        <div style={{ display: 'grid', gap: 6 }}>
          {list.map((g) => {
            const sup = garmentSupport(g, s.draft.bodyStyle);
            const off = sup.level === 'unsupported';
            return (
              <button
                key={g.id}
                type="button"
                disabled={off}
                title={sup.reason || g.description}
                style={{ ...btn(worn?.garmentId === g.id, off), textAlign: 'left' }}
                onClick={() => dispatch({ type: 'wear', slot: s.slot, garmentId: g.id })}
              >
                <strong>{g.name}</strong>
                {sup.level === 'limited' && <span style={{ color: C.warn }}> (hạn chế)</span>}
                {off && <span style={{ color: C.err }}> (chưa có mesh)</span>}
                <div style={{ color: C.dim, fontSize: 12 }}>{g.styles.map((t) => STYLE_TAG_LABELS[t]).join(', ')}</div>
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function ColorTab({ s, dispatch }: TabProps) {
  const worn = s.draft.outfit[s.slot];
  const def = worn ? getGarment(worn.garmentId) : undefined;
  return (
    <>
      <div style={S.row} role="group" aria-label="Ô trang phục">
        {OUTFIT_SLOTS.map((slot) => (
          <button key={slot} type="button" style={btn(s.slot === slot, !s.draft.outfit[slot])} disabled={!s.draft.outfit[slot]} onClick={() => dispatch({ type: 'slot', slot })}>
            {SLOT_SHORT[slot]}
          </button>
        ))}
      </div>
      {!worn || !def ? (
        <p style={{ color: C.dim }}>Ô này đang trống.</p>
      ) : (
        <>
          {def.zones.map((zone) => (
            <Section key={zone} title={`Vùng ${zone}`}>
              <div style={S.row}>
                {GARMENT_PALETTE.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    aria-label={sw.label}
                    title={sw.label}
                    onClick={() => dispatch({ type: 'color', slot: s.slot, zone, hex: sw.hex })}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      background: sw.hex,
                      border: worn.colors[zone] === sw.hex ? `2px solid ${C.accent}` : `1px solid ${C.line}`,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <label style={{ color: C.dim }}>
                Chất liệu{' '}
                <select
                  value={worn.materials[zone] ?? ''}
                  onChange={(e) => dispatch({ type: 'material', slot: s.slot, zone, material: e.target.value as 'cotton' })}
                  style={{ minHeight: 32 }}
                >
                  {(def.materials[zone] ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </Section>
          ))}
          <p style={{ color: C.dim, fontSize: 12 }}>
            Xem trước hiển thị màu từng vùng và độ nhám/kim loại theo chất liệu của vùng thân/chính.
          </p>
        </>
      )}
    </>
  );
}

function ShapeTab({ s, dispatch }: TabProps) {
  const style = s.draft.bodyStyle;
  const frame = s.draft.body.frame;
  const groups: SliderGroup[] = ['overall', 'torso', 'head'];
  return (
    <>
      <Section title="Mesh gốc">
        <div style={S.row}>
          <button type="button" style={btn(frame === 'male')} onClick={() => dispatch({ type: 'frame', frame: 'male' })}>
            Nam
          </button>
          <button type="button" style={btn(frame === 'female')} onClick={() => dispatch({ type: 'frame', frame: 'female' })}>
            Nữ
          </button>
        </div>
        {style === 'chibi' && <p style={{ color: C.dim, fontSize: 12 }}>Chibi dùng chung một mesh cho nam và nữ; chỉ khác khoảng chiều cao.</p>}
      </Section>
      {groups.map((g) => (
        <Section key={g} title={SLIDER_GROUP_LABEL[g]}>
          {SHAPE_SLIDERS.filter((d) => d.group === g).map((d) => {
            const eff = d.effective(style, frame);
            const full = d.range(style, frame);
            const value = d.get(s.draft);
            const locked = eff.max - eff.min <= 0;
            return (
              <label key={d.id} style={{ display: 'block', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{d.label}</span>
                  <span style={{ color: C.dim }}>
                    {d.id === 'heightCm' ? `${Math.round(value)} cm` : value.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={eff.min}
                  max={eff.max}
                  step={d.step}
                  value={Math.min(eff.max, Math.max(eff.min, value))}
                  disabled={locked}
                  onChange={(e) => dispatch({ type: 'slider', id: d.id, value: Number(e.target.value) })}
                  style={{ width: '100%', minHeight: 28 }}
                  aria-label={d.label}
                />
                {(eff.min > full.min || eff.max < full.max) && (
                  <div style={{ color: C.dim, fontSize: 11 }}>Mô hình chỉ có morph cho {eff.min >= 0 ? 'chiều tăng' : 'chiều giảm'} của thanh này.</div>
                )}
              </label>
            );
          })}
        </Section>
      ))}
      <button type="button" style={btn()} onClick={() => dispatch({ type: 'resetSliders' })}>
        Đặt lại hình thể
      </button>
      <Section title="Chưa hỗ trợ (cần asset)">
        <ul style={{ margin: 0, paddingLeft: 18, color: C.dim, fontSize: 12 }}>
          {UNSUPPORTED_SHAPE.map((u) => (
            <li key={u.id}>
              <strong>{u.label}</strong>: {u.reason}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

const STYLE_CARDS: readonly { id: BodyStyle; title: string; text: string }[] = [
  { id: 'realistic', title: 'Người thật', text: 'Người trưởng thành tỷ lệ khoảng 7,5 đầu (mặc định).' },
  { id: 'chibi', title: 'Chibi', text: 'Đầu lớn, thân ngắn khoảng 3 đầu. Lựa chọn riêng, dùng chung bộ xương và trang phục.' },
];

function StyleTab({ s, dispatch }: TabProps) {
  const limits = BODY_LIMITS_BY_STYLE[s.draft.bodyStyle];
  const range = limits.heightCm[s.draft.body.frame];
  return (
    <>
      <div style={{ display: 'grid', gap: 8 }}>
        {STYLE_CARDS.map((c) => (
          <button key={c.id} type="button" style={{ ...btn(s.draft.bodyStyle === c.id), textAlign: 'left' }} onClick={() => dispatch({ type: 'style', style: c.id })} aria-pressed={s.draft.bodyStyle === c.id}>
            <strong>{c.title}</strong>
            <div style={{ color: C.dim, fontSize: 12 }}>{c.text}</div>
          </button>
        ))}
      </div>
      <p style={{ color: C.dim, fontSize: 12 }}>
        Đổi kiểu giữ vị trí tương đối của chiều cao trong khoảng cho phép ({range.min} đến {range.max} cm), kẹp các thanh hình thể theo giới hạn kiểu mới và giữ nguyên trang phục, tóc, phụ kiện.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Phụ kiện và họa tiết                                                */
/* ------------------------------------------------------------------ */

type AccKey = AccessorySlot | 'hat' | 'ring';
const ACC_KEYS: readonly AccKey[] = ['hat', ...ACCESSORY_SLOTS, 'ring'];
const accLabel = (k: AccKey): string => (k === 'hat' ? GARMENT_GROUP_LABELS.hat : ACCESSORY_SLOT_LABELS[k]);
const PHONE_LABEL = { stowed: 'Cất', held: 'Cầm', using: 'Dùng' } as const;
const FINGERS: readonly { id: RingFinger; label: string }[] = [
  { id: 'index', label: 'Trỏ' },
  { id: 'middle', label: 'Giữa' },
  { id: 'ring', label: 'Áp út' },
  { id: 'little', label: 'Út' },
];

function Swatches({ value, label, onPick }: { value: string; label: string; onPick: (hex: string) => void }) {
  return (
    <div style={S.row} role="group" aria-label={label}>
      {GARMENT_PALETTE.map((sw) => (
        <button
          key={sw.hex}
          type="button"
          aria-label={`${label}: ${sw.label}`}
          title={sw.label}
          onClick={() => onPick(sw.hex)}
          style={{ width: 24, height: 24, borderRadius: 4, background: sw.hex, border: value === sw.hex ? `2px solid ${C.accent}` : `1px solid ${C.line}`, cursor: 'pointer' }}
        />
      ))}
    </div>
  );
}

function AccessoryTab({ s, dispatch }: TabProps) {
  const [key, setKey] = useState<AccKey>('hat');
  const acc = s.draft.accessories;
  const worn = key !== 'hat' && key !== 'ring' ? ((acc as unknown as Record<string, WornAccessory | null>)[key] ?? null) : null;
  const def = worn ? getAccessory(worn.itemId) : undefined;
  const isWorn = (k: AccKey): boolean => (k === 'hat' ? !!s.draft.outfit.hat : k === 'ring' ? acc.rings.length > 0 : !!(acc as unknown as Record<string, unknown>)[k]);
  return (
    <>
      <div style={S.row} role="group" aria-label="Loại phụ kiện">
        {ACC_KEYS.map((k) => (
          <button key={k} type="button" style={btn(key === k)} aria-pressed={key === k} onClick={() => setKey(k)}>
            {accLabel(k)}
            {isWorn(k) ? ' •' : ''}
          </button>
        ))}
      </div>

      {key === 'hat' && (
        <Section title="Mũ">
          <div style={{ display: 'grid', gap: 6 }}>
            <button type="button" style={btn(!s.draft.outfit.hat)} aria-pressed={!s.draft.outfit.hat} onClick={() => dispatch({ type: 'takeOff', slot: 'hat' })}>
              Không đội mũ
            </button>
            {garmentsInGroup('hat').map((g) => (
              <button key={g.id} type="button" style={{ ...btn(s.draft.outfit.hat?.garmentId === g.id), textAlign: 'left' }} aria-pressed={s.draft.outfit.hat?.garmentId === g.id} onClick={() => dispatch({ type: 'wear', slot: 'hat', garmentId: g.id })}>
                <strong>{g.name}</strong>
                <div style={{ color: C.dim, fontSize: 12 }}>{g.description}</div>
              </button>
            ))}
          </div>
          <p style={{ color: C.dim, fontSize: 12 }}>Màu mũ chỉnh ở tab Màu (ô Mũ).</p>
        </Section>
      )}

      {key !== 'hat' && key !== 'ring' && (
        <>
          <Section title={ACCESSORY_SLOT_LABELS[key]}>
            <div style={{ display: 'grid', gap: 6 }}>
              <button type="button" style={btn(!worn)} aria-pressed={!worn} onClick={() => dispatch({ type: 'acc', slot: key, itemId: null })}>
                Không dùng
              </button>
              {accessoriesInSlot(key).map((a) => (
                <button key={a.id} type="button" style={{ ...btn(worn?.itemId === a.id), textAlign: 'left' }} aria-pressed={worn?.itemId === a.id} onClick={() => dispatch({ type: 'acc', slot: key, itemId: a.id })}>
                  <strong>{a.name}</strong>
                  <div style={{ color: C.dim, fontSize: 12 }}>{a.styles.map((t) => STYLE_TAG_LABELS[t]).join(', ')}</div>
                </button>
              ))}
            </div>
          </Section>
          {worn && def && (
            <Section title={`Tùy chỉnh: ${def.name}`}>
              <Swatches value={worn.color} label="Màu phụ kiện" onPick={(hex) => dispatch({ type: 'accOpt', slot: key, patch: { color: hex } })} />
              <label style={{ display: 'block', color: C.dim, marginBottom: 8 }}>
                Chất liệu{' '}
                <select value={worn.material} style={{ minHeight: 32 }} onChange={(e) => dispatch({ type: 'accOpt', slot: key, patch: { material: e.target.value as 'metal' } })}>
                  {def.materials.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Kích thước</span>
                  <span style={{ color: C.dim }}>{worn.size.toFixed(2)}</span>
                </div>
                <input type="range" aria-label="Kích thước phụ kiện" min={ACCESSORY_SIZE_MIN} max={ACCESSORY_SIZE_MAX} step={0.01} value={worn.size} style={{ width: '100%', minHeight: 28 }} onChange={(e) => dispatch({ type: 'accOpt', slot: key, patch: { size: Number(e.target.value) } })} />
              </label>
              {def.sides.length > 1 && (
                <div style={S.row} role="group" aria-label="Bên đeo">
                  {def.sides.map((sd) => (
                    <button key={sd} type="button" style={btn(worn.side === sd)} aria-pressed={worn.side === sd} onClick={() => dispatch({ type: 'accOpt', slot: key, patch: { side: sd } })}>
                      {sd === 'left' ? 'Trái' : sd === 'right' ? 'Phải' : 'Hai bên'}
                    </button>
                  ))}
                </div>
              )}
              {key === 'phone' && (
                <div style={S.row} role="group" aria-label="Trạng thái điện thoại">
                  {PHONE_STATES.map((st) => (
                    <button key={st} type="button" style={btn((worn as { state?: string }).state === st)} aria-pressed={(worn as { state?: string }).state === st} onClick={() => dispatch({ type: 'accOpt', slot: key, patch: { state: st } })}>
                      {PHONE_LABEL[st]}
                    </button>
                  ))}
                </div>
              )}
              {key === 'headphones' && (
                <div style={S.row} role="group" aria-label="Cách đeo tai nghe">
                  {(['on-ears', 'around-neck'] as const).map((w) => (
                    <button key={w} type="button" style={btn((worn as { wear?: string }).wear === w)} aria-pressed={(worn as { wear?: string }).wear === w} onClick={() => dispatch({ type: 'accOpt', slot: key, patch: { wear: w } })}>
                      {w === 'on-ears' ? 'Trên tai' : 'Quanh cổ'}
                    </button>
                  ))}
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {key === 'ring' && <RingSection s={s} dispatch={dispatch} />}
    </>
  );
}

function RingSection({ s, dispatch }: TabProps) {
  const [hand, setHand] = useState<Side>('right');
  const [finger, setFinger] = useState<RingFinger>('ring');
  const rings = s.draft.accessories.rings;
  return (
    <Section title={`Nhẫn (tối đa ${MAX_RINGS})`}>
      <div style={S.row} role="group" aria-label="Tay đeo nhẫn">
        {(['left', 'right'] as const).map((h) => (
          <button key={h} type="button" style={btn(hand === h)} aria-pressed={hand === h} onClick={() => setHand(h)}>
            {h === 'left' ? 'Tay trái' : 'Tay phải'}
          </button>
        ))}
      </div>
      <div style={S.row} role="group" aria-label="Ngón đeo nhẫn">
        {FINGERS.map((f) => (
          <button key={f.id} type="button" style={btn(finger === f.id)} aria-pressed={finger === f.id} onClick={() => setFinger(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {accessoriesInSlot('ring').map((a) => (
          <button key={a.id} type="button" style={{ ...btn(), textAlign: 'left' }} onClick={() => dispatch({ type: 'ring', op: 'add', itemId: a.id, hand, finger })}>
            <strong>Thêm: {a.name}</strong>
          </button>
        ))}
      </div>
      {rings.length > 0 && (
        <ul style={{ paddingLeft: 18 }}>
          {rings.map((r, i) => (
            <li key={`${r.hand}-${r.finger}`} style={{ marginBottom: 4 }}>
              {getAccessory(r.itemId)?.name} ({r.hand === 'left' ? 'trái' : 'phải'}, {FINGERS.find((f) => f.id === r.finger)?.label}){' '}
              <button type="button" style={btn()} onClick={() => dispatch({ type: 'ring', op: 'remove', index: i })} aria-label={`Bỏ nhẫn ${i + 1}`}>
                Bỏ
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PatternTab({ s, dispatch }: TabProps) {
  const worn = s.draft.outfit[s.slot];
  const def = worn ? getGarment(worn.garmentId) : undefined;
  const slots = OUTFIT_SLOTS.filter((sl) => {
    const w = s.draft.outfit[sl];
    return !!w && (getGarment(w.garmentId)?.patternZones.length ?? 0) > 0;
  });
  const sliderRow = (label: string, value: number, min: number, max: number, step: number, index: number, field: 'scale' | 'rotation' | 'offsetX' | 'offsetY') => (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: C.dim }}>{value.toFixed(2)}</span>
      </div>
      <input type="range" aria-label={`${label} (họa tiết ${index + 1})`} min={min} max={max} step={step} value={value} style={{ width: '100%', minHeight: 28 }} onChange={(e) => dispatch({ type: 'patternSet', slot: s.slot, index, patch: { [field]: Number(e.target.value) } })} />
    </label>
  );
  return (
    <>
      <div style={S.row} role="group" aria-label="Món có thể thêm họa tiết">
        {slots.length === 0 && <span style={{ color: C.dim }}>Chưa có món nào cho đặt họa tiết.</span>}
        {slots.map((slot) => (
          <button key={slot} type="button" style={btn(s.slot === slot)} aria-pressed={s.slot === slot} onClick={() => dispatch({ type: 'slot', slot })}>
            {SLOT_SHORT[slot]}
          </button>
        ))}
      </div>
      {worn && def && def.patternZones.length > 0 ? (
        <>
          <Section title={`Họa tiết trên: ${def.name} (${worn.patterns.length}/${MAX_PATTERNS_PER_GARMENT})`}>
            {worn.patterns.length === 0 && <p style={{ color: C.dim }}>Chưa có họa tiết.</p>}
            {worn.patterns.map((p, i) => {
              const pd = getPattern(p.patternId);
              return (
                <fieldset key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 10 }}>
                  <legend>
                    {i + 1}. {pd?.name ?? p.patternId}
                  </legend>
                  {pd?.allowsText && (
                    <label style={{ display: 'block', marginBottom: 6 }}>
                      Chữ{' '}
                      <input
                        type="text"
                        value={p.text}
                        maxLength={PATTERN_TEXT_MAX}
                        aria-label={`Chữ (họa tiết ${i + 1})`}
                        onChange={(e) => dispatch({ type: 'patternSet', slot: s.slot, index: i, patch: { text: e.target.value } })}
                        style={{ minHeight: 32 }}
                      />
                    </label>
                  )}
                  <Swatches value={p.color} label={`Màu họa tiết ${i + 1}`} onPick={(hex) => dispatch({ type: 'patternSet', slot: s.slot, index: i, patch: { color: hex } })} />
                  {sliderRow('Tỷ lệ', p.scale, 0.3, 3, 0.05, i, 'scale')}
                  {sliderRow('Góc xoay', p.rotation, -180, 180, 1, i, 'rotation')}
                  {sliderRow('Lệch ngang', p.offsetX, -1, 1, 0.05, i, 'offsetX')}
                  {sliderRow('Lệch dọc', p.offsetY, -1, 1, 0.05, i, 'offsetY')}
                  <button type="button" style={btn()} onClick={() => dispatch({ type: 'patternRemove', slot: s.slot, index: i })}>
                    Xóa họa tiết {i + 1}
                  </button>
                </fieldset>
              );
            })}
          </Section>
          <Section title="Thêm họa tiết">
            <div style={{ display: 'grid', gap: 6 }}>
              {PATTERNS.map((pt) => (
                <button key={pt.id} type="button" style={{ ...btn(false, worn.patterns.length >= MAX_PATTERNS_PER_GARMENT), textAlign: 'left' }} disabled={worn.patterns.length >= MAX_PATTERNS_PER_GARMENT} onClick={() => dispatch({ type: 'patternAdd', slot: s.slot, patternId: pt.id })}>
                  {pt.name}
                </button>
              ))}
            </div>
          </Section>
          <p style={{ color: C.dim, fontSize: 12 }}>Xem trước in họa tiết và chữ lên mặt trước thân của áo (vùng thân). Họa tiết ở tay, mũ, giày chưa in lên vỏ.</p>
        </>
      ) : (
        slots.length > 0 && <p style={{ color: C.dim }}>Chọn một món ở trên.</p>
      )}
    </>
  );
}

