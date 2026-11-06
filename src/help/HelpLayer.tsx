import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { playerPose, useControlSnapshot } from '../scene/controls';
import { useInteractSnapshot } from '../scene/interact';
import { subscribeObjectStates, useInteractionSnapshot } from '../scene/interact/framework';
import { closeTour, hasSeenHint, markHintSeen, openTour, setStep, useHelp, type HintKind } from './helpState';
import { HINTS, STEPS, hintKindOf, type StepCheck, type TourStep } from './steps';
import './help.css';

const TOUCH_QUERY = '(pointer: coarse)';
/** Quãng đi (m) tính là "đã di chuyển". */
const MOVED_DISTANCE = 1.5;
/** Thời gian hiện một gợi ý ngữ cảnh (ms). */
const HINT_MS = 7000;

function detectTouch(): boolean {
  try {
    if (window.matchMedia(TOUCH_QUERY).matches) return true;
    return navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

function useTouch(): boolean {
  const [touch, setTouch] = useState(detectTouch);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(TOUCH_QUERY);
    } catch {
      return undefined;
    }
    const on = (): void => setTouch(detectTouch());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

/**
 * Báo bước đã đạt điều kiện thật hay chưa. Đo từ lúc bước này bắt đầu (stepKey đổi thì đo lại).
 * - moved: vị trí nhân vật (playerPose) cách điểm xuất phát bước từ MOVED_DISTANCE trở lên, hỏi 4 lần mỗi giây.
 * - view: góc nhìn thứ nhất hoặc thứ ba khác lúc bắt đầu bước.
 * - interacted: đã ngồi hoặc có trạng thái vật nào đổi (cửa mở, đèn...) từ lúc bắt đầu bước.
 * - paused: menu tạm dừng đã mở.
 */
function useStepDone(check: StepCheck | undefined, stepKey: string): boolean {
  const controls = useControlSnapshot();
  const [done, setDone] = useState(false);
  const base = useRef({ x: 0, z: 0, firstPerson: false, seated: false });

  useEffect(() => {
    setDone(false);
    base.current = { x: playerPose.x, z: playerPose.z, firstPerson: controls.firstPerson, seated: controls.seated };
    if (check === 'moved') {
      const t = window.setInterval(() => {
        if (Math.hypot(playerPose.x - base.current.x, playerPose.z - base.current.z) >= MOVED_DISTANCE) setDone(true);
      }, 250);
      return () => window.clearInterval(t);
    }
    if (check === 'interacted') return subscribeObjectStates(() => setDone(true));
    return undefined;
    // Chỉ đo lại khi đổi bước; controls được đọc tại thời điểm vào bước.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, check]);

  if (check === 'view') return done || controls.firstPerson !== base.current.firstPerson;
  if (check === 'interacted') return done || (controls.seated && !base.current.seated);
  if (check === 'paused') return done || controls.paused;
  return done;
}

function Tour({ touch }: { touch: boolean }) {
  const { step } = useHelp();
  const steps: readonly TourStep[] = touch ? STEPS.filter((s) => !s.keyboardOnly) : STEPS;
  const index = Math.min(step, steps.length - 1);
  const current = steps[index] as TourStep;
  const last = index === steps.length - 1;
  const done = useStepDone(current.check, current.id);
  const primary = useRef<HTMLButtonElement>(null);

  // Đưa focus tới nút chính khi mở, trả lại chỗ cũ khi đóng. Không bẫy bàn phím: Tab đi ra ngoài được.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primary.current?.focus({ preventScroll: true });
    return () => {
      const target = before && before.isConnected ? before : document.querySelector<HTMLElement>('.help-replay');
      target?.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
    // Esc khi đang ở trong thẻ hướng dẫn thì đóng thẻ, không để bộ phím phiên mở menu tạm dừng.
    e.stopPropagation();
    e.preventDefault();
    closeTour();
  };

  return (
    <section className="help-tour ui-panel ui-panel-float" aria-labelledby="help-tour-title" onKeyDown={onKeyDown}>
      <p className="help-count ui-muted">
        Bước {index + 1} trên {steps.length}
      </p>
      <h2 id="help-tour-title" className="help-title">
        {current.title}
      </h2>
      <p className="help-body">{current.body(touch)}</p>
      <p className="help-done" role="status">
        {current.check && done ? current.doneLabel : ''}
      </p>
      <div className="help-actions">
        {index > 0 && (
          <button type="button" className="ui-btn" onClick={() => setStep(index - 1)}>
            Quay lại
          </button>
        )}
        <button
          ref={primary}
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={() => (last ? closeTour() : setStep(index + 1))}
        >
          {last ? 'Xong' : 'Tiếp'}
        </button>
        {!last && (
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => closeTour()}>
            Bỏ qua
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Gợi ý ngữ cảnh: lần đầu gặp mỗi loại vật (cửa, ghế, máy tính) hiện một dòng ngắn rồi tự tắt.
 * Nguồn là vật đang được chọn của hệ tương tác (khung mới và khung cũ, cái nào đang chạy thì có
 * dữ liệu). Mỗi loại chỉ hiện một lần, lưu localStorage. Không hiện khi đang xem các bước.
 */
function ContextHint({ touch, suppressed }: { touch: boolean; suppressed: boolean }) {
  const oldFocus = useInteractSnapshot().focus;
  const newFocus = useInteractionSnapshot().focus;
  const kind: HintKind | null = newFocus
    ? hintKindOf(newFocus.label, null, newFocus.kind)
    : oldFocus
      ? hintKindOf(oldFocus.label, oldFocus.verb, null)
      : null;
  const [shown, setShown] = useState<HintKind | null>(null);

  useEffect(() => {
    if (suppressed || kind === null || hasSeenHint(kind)) return undefined;
    markHintSeen(kind);
    setShown(kind);
    const t = window.setTimeout(() => setShown(null), HINT_MS);
    return () => window.clearTimeout(t);
  }, [kind, suppressed]);

  return (
    <div className="help-hint-slot" role="status">
      {shown !== null && !suppressed && <p className="help-hint ui-panel ui-panel-float">{HINTS[shown](touch)}</p>}
    </div>
  );
}

/** Mount một lần, ngoài Canvas. Tự mở lần đầu, sau đó chỉ gợi ý ngữ cảnh. */
export function HelpLayer() {
  const { open } = useHelp();
  const touch = useTouch();
  return (
    <>
      {open && <Tour touch={touch} />}
      <ContextHint touch={touch} suppressed={open} />
    </>
  );
}

/** Nút luôn truy cập được: mở lại các bước từ đầu. */
export function HelpReplayButton() {
  const { open } = useHelp();
  return (
    <button type="button" className="help-replay ui-btn" aria-expanded={open} onClick={() => openTour()}>
      Xem lại hướng dẫn
    </button>
  );
}
