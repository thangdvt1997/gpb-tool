import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { emitInteractEvent } from './interactEvents';

/**
 * Rèm: open = tỷ lệ mở 0..1 (1 = mở hết, kéo gọn sang bên). Hệ render đọc curtainDaylight(open)
 * (hệ số 0..1 nhân vào ánh sáng ngày xuyên cửa kính); rèm kéo kín vẫn lọt MIN_DAYLIGHT.
 */
export const CURTAIN_STEP = 0.25;
export const MIN_DAYLIGHT = 0.08;

export const curtainOf = (s: ObjectState): number => (typeof s.open === 'number' ? Math.min(1, Math.max(0, s.open)) : 1);

export function curtainStep(open: number, delta: number): number {
  const v = Math.min(1, Math.max(0, open + delta));
  return Math.round(v * 1000) / 1000;
}

export function curtainDaylight(open: number): number {
  return MIN_DAYLIGHT + (1 - MIN_DAYLIGHT) * Math.min(1, Math.max(0, open));
}

export function getCurtainDaylight(id: string): number {
  return curtainDaylight(curtainOf(getObjectState(id)));
}

export interface CurtainOptions {
  id: string;
  label?: string;
  footprint: Footprint;
  point?: InteractPoint;
  baseY?: number;
  height?: number;
}

export function curtainInteractable(o: CurtainOptions): InteractableDef {
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const move = (delta: number) => {
    const from = curtainOf(getObjectState(o.id));
    const to = curtainStep(from, delta);
    if (to === from) return;
    setObjectState(o.id, { open: to });
    emitInteractEvent({ type: 'curtain.move', id: o.id, ...at, data: { open: to } });
  };
  return {
    id: o.id,
    kind: 'curtain',
    label: o.label ?? 'Rèm cửa',
    footprint: o.footprint,
    baseY: o.baseY ?? 0.2,
    height: o.height ?? 2.4,
    point: o.point,
    defaultState: { open: 1 },
    actions: [
      { id: 'close', label: 'Kéo rèm lại', when: (c) => curtainOf(c.state) > 0, run: () => move(-CURTAIN_STEP) },
      { id: 'open', label: 'Kéo rèm ra', when: (c) => curtainOf(c.state) < 1, run: () => move(CURTAIN_STEP) },
    ],
  };
}

/** Cường độ đèn "ánh sáng ngày" sau cửa sổ (đơn vị đèn three): tỷ lệ với curtainDaylight, rèm kín còn MIN_DAYLIGHT. */
export const WINDOW_LIGHT_MAX = 5;
export function curtainLightIntensity(open: number, max: number = WINDOW_LIGHT_MAX): number {
  return Math.round(max * curtainDaylight(open) * 1000) / 1000;
}
