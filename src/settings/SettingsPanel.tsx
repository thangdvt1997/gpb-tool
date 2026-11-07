import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import './settings.css';
import { ACTION_IDS, RANGES, type ActionId, type Bindings } from './schema';
import { useSettings } from './useSettings';
import { confirmSwap, keyLabel, resetAll, resetOne, resolveCapture } from './rebindFlow';
import { pickPad } from './useGamepadInput';

/** Nhãn tiếng Việt và trạng thái nối của từng action. wired=false: đã lưu nhưng chưa có mã nào đọc. */
const ACTION_INFO: Record<ActionId, { label: string; wired: boolean }> = {
  moveForward: { label: 'Đi tới', wired: true },
  moveBack: { label: 'Đi lùi', wired: true },
  moveLeft: { label: 'Sang trái', wired: true },
  moveRight: { label: 'Sang phải', wired: true },
  run: { label: 'Chạy', wired: true },
  jump: { label: 'Nhảy', wired: true },
  firstPerson: { label: 'Đổi góc nhìn', wired: true },
  overview: { label: 'Xem tổng thể', wired: true },
  cancel: { label: 'Tạm dừng / thoát', wired: true },
  interact: { label: 'Tương tác', wired: false },
  map: { label: 'Bản đồ', wired: false },
  editor: { label: 'Trình biên tập', wired: false },
};

type Tab = 'controls' | 'mouse' | 'gamepad' | 'camera' | 'display';
const TABS: { id: Tab; label: string }[] = [
  { id: 'controls', label: 'Điều khiển' },
  { id: 'mouse', label: 'Chuột / cảm ứng' },
  { id: 'gamepad', label: 'Gamepad' },
  { id: 'camera', label: 'Camera' },
  { id: 'display', label: 'Hiển thị' },
];

const FOCUSABLE = 'button, input, select, [href], [tabindex]:not([tabindex="-1"])';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Hộp thoại cài đặt: focus trap, Esc đóng (Esc khi đang chờ phím chỉ hủy việc đổi phím). */
export function SettingsPanel({ open, onClose }: SettingsPanelProps): JSX.Element | null {
  const { settings, update } = useSettings();
  const [tab, setTab] = useState<Tab>('controls');
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [pending, setPending] = useState<{ action: ActionId; other: ActionId; code: string } | null>(null);
  const [msg, setMsg] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const bindings = settings.bindings;

  const setBindings = useCallback((b: Bindings) => update({ bindings: b }), [update]);

  /** Mũi tên trái/phải đổi tab (vòng tròn), Home/End về đầu/cuối (mẫu WAI-ARIA tabs). */
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Tính từ tab đang có focus (có thể khác tab đang chọn khi focus bằng chuột/script).
    const focused = (e.target as HTMLElement).id?.replace(/^sp-tab-/, '');
    const fi = TABS.findIndex((t) => t.id === focused);
    const i = fi >= 0 ? fi : TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    const next = TABS[n];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setTab(next.id);
    dialogRef.current?.querySelector<HTMLElement>(`#sp-tab-${next.id}`)?.focus();
  };

  // Đưa focus vào hộp thoại khi mở, trả lại nơi cũ khi đóng.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => prev?.focus?.();
  }, [open]);

  // Đang chờ phím: bắt ở pha capture để không lọt xuống useGtaControls hay đóng hộp thoại.
  useEffect(() => {
    if (!open || !capturing) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.code === '' || e.code === 'Unidentified') return;
      e.preventDefault();
      e.stopPropagation();
      const r = resolveCapture(bindings, capturing, e.code);
      if (r.kind === 'applied') {
        setBindings(r.bindings);
        setMsg(`Đã gán ${keyLabel(e.code)} cho "${ACTION_INFO[capturing].label}".`);
        setCapturing(null);
      } else if (r.kind === 'conflict') {
        setPending({ action: capturing, other: r.with, code: r.code });
        setCapturing(null);
      } else if (r.kind === 'invalid') {
        setMsg(`Phím ${keyLabel(e.code)} không được phép gán (dành cho trình duyệt). Thử phím khác.`);
      } else {
        setMsg(r.kind === 'cancelled' ? 'Đã hủy đổi phím.' : 'Phím không đổi.');
        setCapturing(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, capturing, bindings, setBindings]);

  if (!open) return null;

  const onDialogKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && !capturing) {
      e.stopPropagation();
      if (pending) setPending(null);
      else onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.hasAttribute('disabled'));
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): JSX.Element => (
    <label className="sp-row">
      <span>{label}: {Number(value.toFixed(2))}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, todo?: string): JSX.Element => (
    <label className="sp-row">
      <span>{label}{todo ? <span className="sp-todo"> ({todo})</span> : null}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );

  return (
    <div className="sp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="sp-dialog" role="dialog" aria-modal="true" aria-labelledby="sp-title" onKeyDown={onDialogKey}>
        <div className="sp-head">
          <h2 id="sp-title" style={{ margin: 0, fontSize: 18 }}>Cài đặt</h2>
          <button type="button" onClick={onClose} aria-label="Đóng cài đặt">Đóng</button>
        </div>
        <div className="sp-tabs" role="tablist" aria-label="Nhóm cài đặt" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`sp-tab-${t.id}`} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} aria-controls="sp-body" onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div id="sp-body" role="tabpanel" aria-labelledby={`sp-tab-${tab}`}>
          {tab === 'controls' && (
            <div>
              {ACTION_IDS.map((a) => (
                <div className="sp-row" key={a}>
                  <span>{ACTION_INFO[a].label}{ACTION_INFO[a].wired ? null : <span className="sp-todo"> (chưa nối vào scene)</span>}</span>
                  <kbd aria-label={`Phím hiện tại: ${keyLabel(bindings[a])}`}>{capturing === a ? 'Nhấn phím… (Esc để hủy)' : keyLabel(bindings[a])}</kbd>
                  <button type="button" onClick={() => { setPending(null); setMsg(''); setCapturing(a); }}>Đổi</button>
                  <button type="button" onClick={() => { setBindings(resetOne(bindings, a)); setMsg(''); }}>Mặc định</button>
                </div>
              ))}
              {pending && (
                <div className="sp-warn" role="alertdialog" aria-label="Xung đột phím">
                  <p>Phím {keyLabel(pending.code)} đang dùng cho "{ACTION_INFO[pending.other].label}". Hoán đổi hai phím?</p>
                  <button type="button" onClick={() => { setBindings(confirmSwap(bindings, pending.action, pending.other)); setPending(null); setMsg('Đã hoán đổi.'); }}>Hoán đổi</button>{' '}
                  <button type="button" onClick={() => { setPending(null); setMsg('Đã hủy, giữ nguyên.'); }}>Hủy</button>
                </div>
              )}
              <div className="sp-row"><button type="button" onClick={() => { setBindings(resetAll()); setMsg('Đã đặt lại toàn bộ phím.'); }}>Đặt lại tất cả</button></div>
              <p className="sp-note">Mũi tên và Shift phải luôn dùng được như phím phụ. Phím F1, F3, F5, F6, F11, F12, Meta không gán được.</p>
              <p className="sp-note" role="status" aria-live="polite">{msg}</p>
            </div>
          )}
          {tab === 'mouse' && (
            <div>
              {slider('Độ nhạy chuột', settings.mouse.sensitivity, RANGES.sensitivity.min, RANGES.sensitivity.max, 0.05, (v) => update({ mouse: { ...settings.mouse, sensitivity: v } }))}
              {check('Đảo trục Y', settings.mouse.invertY, (v) => update({ mouse: { ...settings.mouse, invertY: v } }))}
              {check('Đảo trục X', settings.mouse.invertX, (v) => update({ mouse: { ...settings.mouse, invertX: v } }))}
              <h3>Cảm ứng</h3>
              {slider('Cỡ joystick', settings.touch.joystickSize, RANGES.joystickSize.min, RANGES.joystickSize.max, 5, (v) => update({ touch: { ...settings.touch, joystickSize: v } }))}
              {check('Hiện nút hành động', settings.touch.buttonsEnabled, (v) => update({ touch: { ...settings.touch, buttonsEnabled: v } }))}
              {check('Chạm sàn để đi tới đó', settings.touch.tapToWalk, (v) => update({ touch: { ...settings.touch, tapToWalk: v } }))}
              <div className="sp-row">
                <span>Chế độ điều khiển chuột <span className="sp-todo">(chưa nối)</span></span>
                <select value={settings.controlMode} onChange={(e) => update({ controlMode: e.target.value === 'leftMouse' ? 'leftMouse' : 'rightMouse' })} aria-label="Chế độ điều khiển chuột">
                  <option value="rightMouse">Chuột phải kéo để nhìn</option>
                  <option value="leftMouse">Chuột trái (chạm để đi)</option>
                </select>
              </div>
            </div>
          )}
          {tab === 'gamepad' && <GamepadTab />}
          {tab === 'camera' && (
            <div>
              <p>Độ nhạy và đảo trục của camera chỉnh ở tab "Chuột / cảm ứng" (đã có hiệu lực).</p>
              <p className="sp-note">FOV và khoảng cách camera chưa có trong schema cài đặt nên chưa hiển thị tùy chọn. Cuộn chuột vẫn đổi khoảng cách tại chỗ.</p>
            </div>
          )}
          {tab === 'display' && (
            <div>
              {check('Hiện gợi ý phím', settings.hintsEnabled, (v) => update({ hintsEnabled: v }))}
              {check('Viền sáng vật tương tác', settings.highlightEnabled, (v) => update({ highlightEnabled: v }))}
              {slider('Âm lượng', settings.volume, RANGES.volume.min, RANGES.volume.max, 0.05, (v) => update({ volume: v }))}
              {check('Giảm chuyển động', settings.display.reducedMotion, (v) => update({ display: { reducedMotion: v } }), 'tắt rung và nhún camera; cũng theo prefers-reduced-motion của hệ thống')}
              <p className="sp-note">Cỡ chữ: chưa có trong schema nên chưa hiển thị.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GamepadTab(): JSX.Element {
  const { settings, update } = useSettings();
  const [name, setName] = useState<string | null>(null);
  const supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  useEffect(() => {
    if (!supported) return undefined;
    const poll = (): void => setName(pickPad(navigator.getGamepads())?.id ?? null);
    poll();
    const id = window.setInterval(poll, 500);
    window.addEventListener('gamepadconnected', poll);
    window.addEventListener('gamepaddisconnected', poll);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('gamepadconnected', poll);
      window.removeEventListener('gamepaddisconnected', poll);
    };
  }, [supported]);
  return (
    <div>
      <p role="status" aria-live="polite">
        {!supported ? 'Trình duyệt không hỗ trợ Gamepad API.' : name ? `Đã kết nối: ${name}` : 'Chưa có tay cầm. Cắm tay cầm và nhấn một nút bất kỳ.'}
      </p>
      {slider2('Vùng chết', settings.gamepad.deadzone, RANGES.deadzone.min, RANGES.deadzone.max, 0.01, (v) => update({ gamepad: { ...settings.gamepad, deadzone: v } }))}
      {slider2('Độ nhạy nhìn', settings.gamepad.sensitivity, RANGES.gamepadSensitivity.min, RANGES.gamepadSensitivity.max, 0.05, (v) => update({ gamepad: { ...settings.gamepad, sensitivity: v } }))}
      <p className="sp-todo">Hook useGamepadInput đã có nhưng chưa được nối vào scene, nên tay cầm chưa điều khiển nhân vật.</p>
      <p className="sp-note">Bố cục standard: cần trái = đi, cần phải = nhìn, A = nhảy, X = tương tác, Y = đổi góc nhìn, RT/L3 = chạy, Start = tạm dừng, Back = bản đồ.</p>
    </div>
  );
}

function slider2(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): JSX.Element {
  return (
    <label className="sp-row">
      <span>{label}: {Number(value.toFixed(2))}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
