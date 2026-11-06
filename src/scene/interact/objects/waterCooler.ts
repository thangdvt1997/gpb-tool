import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { emitInteractEvent } from './interactEvents';
import { registerTicker } from './tickers';

/**
 * Cây nước: lấy cốc đặt lên khay, rót nóng/lạnh (mất POUR_SECONDS), rồi lấy cốc nước.
 * Trình tự: cup (khay trống -> có cốc rỗng) -> pouring (hot|cold) -> ready -> lấy đi.
 */
export type Temp = 'hot' | 'cold';

export interface WaterState {
  /** Số cốc còn trong ống. */
  cups: number;
  /** Cốc trên khay: '' không có, 'empty', 'pouring', 'full'. */
  tray: '' | 'empty' | 'pouring' | 'full';
  temp: Temp | '';
  /** Tiến độ rót 0..1. */
  fill: number;
  /** Số cốc đã uống. */
  drunk: number;
}

export const WATER_INITIAL = { cups: 20, tray: '', temp: '', fill: 0, drunk: 0 } as const;
/** Rót nước nóng lâu hơn nước lạnh (giây). */
export const POUR_SECONDS: Record<Temp, number> = { cold: 2.5, hot: 3.5 };

export function waterOf(s: ObjectState): WaterState {
  const tray = s.tray === 'empty' || s.tray === 'pouring' || s.tray === 'full' ? s.tray : '';
  return {
    cups: typeof s.cups === 'number' ? s.cups : WATER_INITIAL.cups,
    tray,
    temp: s.temp === 'hot' || s.temp === 'cold' ? s.temp : '',
    fill: typeof s.fill === 'number' ? s.fill : 0,
    drunk: typeof s.drunk === 'number' ? s.drunk : 0,
  };
}

export function waterTakeCup(s: WaterState): Partial<WaterState> | null {
  return s.tray === '' && s.cups > 0 ? { tray: 'empty', cups: s.cups - 1, temp: '', fill: 0 } : null;
}

export function waterPour(s: WaterState, temp: Temp): Partial<WaterState> | null {
  return s.tray === 'empty' ? { tray: 'pouring', temp, fill: 0 } : null;
}

/** Lấy cốc khỏi khay: chỉ khi đã đầy; cốc rỗng bỏ lại thì trả về ống. */
export function waterTake(s: WaterState): Partial<WaterState> | null {
  if (s.tray === 'full') return { tray: '', temp: '', fill: 0, drunk: s.drunk + 1 };
  if (s.tray === 'empty') return { tray: '', cups: s.cups + 1 };
  return null;
}

export function waterTick(s: WaterState, dt: number): { state: WaterState; done: boolean } {
  if (s.tray !== 'pouring' || s.temp === '') return { state: s, done: false };
  const fill = Math.min(1, s.fill + dt / POUR_SECONDS[s.temp]);
  if (fill >= 1) return { state: { ...s, fill: 1, tray: 'full' }, done: true };
  return { state: { ...s, fill }, done: false };
}

export interface WaterOptions {
  id: string;
  label?: string;
  footprint: Footprint;
  point?: InteractPoint;
}

export function waterInteractable(o: WaterOptions): InteractableDef {
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const cur = () => waterOf(getObjectState(o.id));
  const ev = (type: 'water.cup' | 'water.pour' | 'water.denied', data?: Record<string, string>) =>
    emitInteractEvent({ type, id: o.id, ...at, data });
  const pour = (t: Temp) => () => {
    const p = waterPour(cur(), t);
    if (!p) return ev('water.denied');
    setObjectState(o.id, p);
    ev('water.pour', { temp: t });
  };
  return {
    id: o.id,
    kind: 'water',
    label: o.label ?? 'Cây nước',
    footprint: o.footprint,
    baseY: 0,
    height: 1.1,
    point: o.point,
    defaultState: WATER_INITIAL,
    actions: [
      {
        id: 'cup',
        label: (c) => (waterOf(c.state).cups > 0 ? 'Lấy cốc' : 'Hết cốc'),
        when: (c) => waterOf(c.state).tray === '',
        run: () => {
          const p = waterTakeCup(cur());
          if (!p) return ev('water.denied');
          setObjectState(o.id, p);
          ev('water.cup');
        },
      },
      { id: 'cold', label: 'Rót nước lạnh', when: (c) => waterOf(c.state).tray === 'empty', run: pour('cold') },
      { id: 'hot', label: 'Rót nước nóng', when: (c) => waterOf(c.state).tray === 'empty', run: pour('hot') },
      { id: 'wait', label: 'Đang rót nước...', when: (c) => waterOf(c.state).tray === 'pouring', run: () => ev('water.denied') },
      {
        id: 'take',
        label: (c) => (waterOf(c.state).tray === 'full' ? 'Lấy cốc nước' : 'Bỏ cốc lại'),
        when: (c) => waterOf(c.state).tray === 'full' || waterOf(c.state).tray === 'empty',
        run: () => {
          const p = waterTake(cur());
          if (p) setObjectState(o.id, p);
        },
      },
    ],
  };
}

export function registerWaterTicker(o: WaterOptions): () => void {
  return registerTicker(o.id, (dt) => {
    const { state, done } = waterTick(waterOf(getObjectState(o.id)), dt);
    setObjectState(o.id, { tray: state.tray, fill: state.fill });
    if (done) emitInteractEvent({ type: 'water.done', id: o.id, x: o.footprint.cx, z: o.footprint.cz });
  });
}
