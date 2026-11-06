import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  requestTouchJump,
  resetTouchInput,
  SENSITIVITY_RANGE,
  setPaused,
  touchInput,
  updateSettings,
  useControlSnapshot,
} from '../controls';
import { activateInteractFocus, useInteractSnapshot } from './store';
import './interact.css';

/**
 * Thẻ gợi ý gần đáy màn hình. Chỉ hiện khi có vật đủ điều kiện dùng ngay (trong tầm với và trước mặt).
 * Chữ theo loại vật: "E — Mở cửa", "E — Ngồi xuống", "E — Xem thông tin phòng", "E — Sử dụng"; đang ngồi: "E — Đứng dậy".
 * Bấm vào thẻ cũng dùng vật (tiện cho màn hình cảm ứng).
 */
export function InteractPrompt() {
  const { focus, pointer } = useInteractSnapshot();
  return (
    <div className="interact-prompt" aria-live="polite">
      {focus && (
        <button
          type="button"
          className="ui-hud-chip"
          aria-keyshortcuts="E"
          onClick={() => activateInteractFocus()}
        >
          <span>{pointer ? 'Bấm chuột' : 'E'} — {focus.verb}</span>
          {focus.label !== '' && <span className="interact-prompt-label">{focus.label}</span>}
        </button>
      )}
    </div>
  );
}

/** Hai thanh trượt: độ nhạy chuột và âm lượng. Lưu localStorage (trong session.ts, có try/catch). */
function ControlSettingsFields({ idPrefix }: { idPrefix: string }) {
  const { settings } = useControlSnapshot();
  return (
    <div className="ctl-settings">
      <label className="ctl-slider" htmlFor={`${idPrefix}-sens`}>
        <span>Độ nhạy chuột</span>
        <input
          id={`${idPrefix}-sens`}
          type="range"
          min={SENSITIVITY_RANGE.min}
          max={SENSITIVITY_RANGE.max}
          step={0.1}
          value={settings.sensitivity}
          onChange={(e) => updateSettings({ sensitivity: Number(e.currentTarget.value) })}
        />
        <output htmlFor={`${idPrefix}-sens`}>{settings.sensitivity.toFixed(1)}×</output>
      </label>
      <label className="ctl-slider" htmlFor={`${idPrefix}-vol`}>
        <span>Âm lượng</span>
        <input
          id={`${idPrefix}-vol`}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => updateSettings({ volume: Number(e.currentTarget.value) })}
        />
        <output htmlFor={`${idPrefix}-vol`}>{Math.round(settings.volume * 100)}%</output>
      </label>
    </div>
  );
}

/** Bảng hướng dẫn phím nhỏ ở góc trên phải, có nút ẩn, kèm thanh trượt cài đặt. */
function ControlsHelp() {
  const { settings, firstPerson } = useControlSnapshot();
  if (settings.helpHidden) {
    return (
      <div className="ctl-help ctl-help-collapsed">
        <button
          type="button"
          className="ui-hud-chip"
          aria-expanded="false"
          onClick={() => updateSettings({ helpHidden: false })}
        >
          Phím điều khiển
        </button>
      </div>
    );
  }
  return (
    <section className="ctl-help" aria-label="Hướng dẫn phím">
      <div className="ctl-help-head">
        <strong>Điều khiển</strong>
        <button
          type="button"
          className="ctl-link"
          aria-expanded="true"
          onClick={() => updateSettings({ helpHidden: true })}
        >
          Ẩn
        </button>
      </div>
      <ul className="ctl-keys">
        <li><kbd className="ui-kbd">W A S D</kbd> / <kbd className="ui-kbd">↑ ← ↓ →</kbd> đi theo hướng camera</li>
        <li><kbd className="ui-kbd">Shift</kbd> chạy · <kbd className="ui-kbd">Space</kbd> nhảy</li>
        <li>Giữ <strong>chuột phải</strong> và kéo: xoay camera · Cuộn: đổi khoảng cách</li>
        <li><strong>Chuột trái</strong>: đi tới điểm, bấm vật để tới dùng</li>
        <li><kbd className="ui-kbd">E</kbd> tương tác, ngồi, đứng dậy</li>
        <li><kbd className="ui-kbd">V</kbd> {firstPerson ? 'về góc nhìn thứ ba' : 'góc nhìn thứ nhất'} · <kbd className="ui-kbd">Esc</kbd> tạm dừng</li>
      </ul>
      <ControlSettingsFields idPrefix="ctl-help" />
    </section>
  );
}

/** Menu tạm dừng (Esc). Trong lúc mở, cảnh không nhận điều khiển; "Tiếp tục" hoặc Esc để quay lại. */
function PauseMenu() {
  const { paused } = useControlSnapshot();
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (paused) resumeRef.current?.focus();
  }, [paused]);
  if (!paused) return null;
  return (
    <div className="ui-dialog-backdrop ctl-pause-backdrop" onContextMenu={(e) => e.preventDefault()}>
      <div className="ui-dialog ctl-pause" role="dialog" aria-modal="true" aria-labelledby="ctl-pause-title">
        <h2 id="ctl-pause-title" className="ui-dialog-title">Tạm dừng</h2>
        <p className="ui-muted">Phím đang giữ đã được nhả. Nhân vật đứng yên cho tới khi tiếp tục.</p>
        <ControlSettingsFields idPrefix="ctl-pause" />
        <div className="ui-dialog-actions">
          <button ref={resumeRef} type="button" className="ui-btn ui-btn-primary" onClick={() => setPaused(false)}>
            Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}

/** Màn hình cảm ứng (con trỏ thô). Theo dõi thay đổi, ví dụ khi cắm chuột vào máy tính bảng. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let found: MediaQueryList | null = null;
    try {
      found = window.matchMedia('(pointer: coarse)');
    } catch {
      found = null;
    }
    if (found === null) return undefined;
    const mq = found;
    const on = (): void => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

const JOY_RADIUS = 48;

/**
 * Điều khiển cảm ứng: joystick bên trái để di chuyển; kéo trên vùng cảnh bên phải để xoay camera
 * (gtaCamera nhận kéo cảm ứng trên canvas); nút Chạy (bật/tắt), Nhảy, Tương tác.
 */
function TouchControls() {
  const { paused } = useControlSnapshot();
  const { focus } = useInteractSnapshot();
  const [run, setRun] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    touchInput.run = run;
  }, [run]);
  useEffect(() => {
    if (paused) {
      active.current = null;
      setRun(false);
      if (knobRef.current) knobRef.current.style.transform = '';
    }
  }, [paused]);
  useEffect(() => () => resetTouchInput(), []);

  const moveKnob = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const a = active.current;
    if (!a || e.pointerId !== a.id) return;
    let dx = e.clientX - a.cx;
    let dy = e.clientY - a.cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    touchInput.x = dx / JOY_RADIUS;
    touchInput.y = -dy / JOY_RADIUS;
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const endKnob = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active.current || e.pointerId !== active.current.id) return;
    active.current = null;
    touchInput.x = 0;
    touchInput.y = 0;
    if (knobRef.current) knobRef.current.style.transform = '';
  };

  if (paused) return null;
  return (
    <>
      <div
        className="ctl-joystick"
        role="presentation"
        onPointerDown={(e) => {
          if (active.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
          e.currentTarget.setPointerCapture(e.pointerId);
          moveKnob(e);
        }}
        onPointerMove={moveKnob}
        onPointerUp={endKnob}
        onPointerCancel={endKnob}
        onLostPointerCapture={endKnob}
      >
        <div ref={knobRef} className="ctl-joystick-knob" />
      </div>
      <div className="ctl-touch-buttons">
        <button type="button" className="ui-hud-chip" aria-pressed={run} onClick={() => setRun((v) => !v)}>
          Chạy
        </button>
        <button type="button" className="ui-hud-chip" onPointerDown={() => requestTouchJump()}>
          Nhảy
        </button>
        <button type="button" className="ui-hud-chip" disabled={focus === null} onClick={() => activateInteractFocus()}>
          {focus ? focus.verb : 'Tương tác'}
        </button>
      </div>
    </>
  );
}

/** Lớp giao diện điều khiển: bảng phím (ẩn được) kèm cài đặt, menu tạm dừng, điều khiển cảm ứng. */
export function InteractHelp() {
  const coarse = useCoarsePointer();
  return (
    <>
      <ControlsHelp />
      {coarse && <TouchControls />}
      <PauseMenu />
    </>
  );
}
