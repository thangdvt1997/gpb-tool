import { useEffect, useSyncExternalStore } from 'react';
import { isAction, keyFor } from '../../controls/bindings';
import { getControls } from '../../controls/session';
import { isTypingTarget } from '../../controls/useGtaControls';
import { keyLabel } from '../../../settings/rebindFlow';
import { useObjectStateVersion } from './itemHeldHook';
import { getHeldItem } from './smallItem';
import { getInspect, INSPECT_VIEW, inspectKeyAxis, rotateInspect, startInspect, stopInspect, subscribeInspect, toggleInspect } from './itemInspect';

/**
 * Phím quan sát (cài đặt "inspectItem", mặc định R) và gợi ý trên HUD.
 * Đang quan sát: kéo chuột hoặc giữ mũi tên/WASD để xoay; Esc hoặc phím quan sát lần nữa để thoát.
 */
export function ItemInspectHud(): JSX.Element | null {
  const inspecting = useSyncExternalStore(subscribeInspect, () => getInspect().active, () => false);
  const holding = useObjectStateVersion(() => getHeldItem() !== null);

  useEffect(() => {
    const down = new Set<string>();
    let raf = 0;
    let last = 0;
    const tick = (t: number): void => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      let y = 0;
      let p = 0;
      for (const c of down) {
        const a = inspectKeyAxis(c);
        if (a) {
          y += a.yaw;
          p += a.pitch;
        }
      }
      if (y || p) rotateInspect(y * INSPECT_VIEW.keyRate * dt, p * INSPECT_VIEW.keyRate * dt);
      raf = getInspect().active ? requestAnimationFrame(tick) : 0;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const active = getInspect().active;
      if (active && (isAction(e.code, 'cancel') || isAction(e.code, 'inspectItem'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) stopInspect();
        return;
      }
      if (active) {
        if (inspectKeyAxis(e.code)) {
          e.preventDefault();
          down.add(e.code);
          if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(tick);
          }
        }
        return;
      }
      if (isAction(e.code, 'inspectItem') && !e.repeat && !getControls().paused && getHeldItem() !== null) {
        e.preventDefault();
        startInspect();
      }
    };
    const up = (e: KeyboardEvent): void => void down.delete(e.code);
    let drag: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent): void => {
      if (getInspect().active && e.button === 0 && !(e.target as HTMLElement | null)?.closest?.('button, a, input')) drag = { x: e.clientX, y: e.clientY };
    };
    const pm = (e: PointerEvent): void => {
      if (!drag || !getInspect().active) return;
      rotateInspect((e.clientX - drag.x) * INSPECT_VIEW.dragRate, (e.clientY - drag.y) * INSPECT_VIEW.dragRate);
      drag = { x: e.clientX, y: e.clientY };
    };
    const pu = (): void => {
      drag = null;
    };
    const blur = (): void => down.clear();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('blur', blur);
      if (raf) cancelAnimationFrame(raf);
      stopInspect();
    };
  }, []);

  if (!holding && !inspecting) return null;
  const k = keyLabel(keyFor('inspectItem'));
  return (
    <div className="ix-inspect-hint" role="status" data-testid="item-inspect-hint" style={{ position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', padding: '4px 10px', borderRadius: 6, background: 'rgba(20,22,26,.85)', color: '#f2f2f2', font: '13px system-ui, sans-serif', pointerEvents: 'none' }}>
      {inspecting ? `Kéo chuột hoặc phím mũi tên để xoay · ${k} hoặc Esc để thoát quan sát` : `${k} — Quan sát vật đang cầm`}
    </div>
  );
}
