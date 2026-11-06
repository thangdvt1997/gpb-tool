import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { emitInteractEvent } from './interactEvents';
import { registerTicker } from './tickers';

/** Máy in: hàng đợi, tiến độ in, kẹt giấy ngẫu nhiên (rng tiêm vào) và gỡ kẹt. */
export const PRINT_DOCS: readonly string[] = ['Hợp đồng mẫu', 'Báo cáo tháng', 'Sơ đồ chỗ ngồi'];

export interface PrinterState {
  /** Số lệnh đang chờ (gồm lệnh đang in). */
  queue: number;
  /** Tiến độ lệnh hiện tại 0..1. */
  progress: number;
  jam: boolean;
  /** Số tờ đã in xong. */
  done: number;
  /** Tài liệu đang chọn (chỉ số PRINT_DOCS). */
  doc: number;
}

export const PRINTER_INITIAL = { queue: 0, progress: 0, jam: false, done: 0, doc: 0 } as const;
export const QUEUE_MAX = 5;

export function printerOf(s: ObjectState): PrinterState {
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  return { queue: n(s.queue, 0), progress: n(s.progress, 0), jam: s.jam === true, done: n(s.done, 0), doc: n(s.doc, 0) };
}

export function printerSelectDoc(s: PrinterState): Partial<PrinterState> {
  return { doc: (s.doc + 1) % PRINT_DOCS.length };
}

/** Gửi lệnh in: từ chối khi hàng đợi đầy. */
export function printerSubmit(s: PrinterState, max = QUEUE_MAX): Partial<PrinterState> | null {
  return s.queue >= max ? null : { queue: s.queue + 1 };
}

export function printerClearJam(s: PrinterState): Partial<PrinterState> | null {
  return s.jam ? { jam: false, progress: 0 } : null;
}

export type PrinterTickEvent = 'start' | 'done' | 'jam' | null;

/**
 * Một bước thời gian. Mỗi lệnh mất secondsPerJob. Kẹt giấy: rng() < jamChance được thử một lần mỗi lệnh
 * khi qua 50% tiến độ. Kẹt thì đứng yên đến khi gỡ; lệnh bị kẹt in lại từ đầu.
 */
export function printerTick(
  s: PrinterState,
  dt: number,
  secondsPerJob: number,
  jamChance: number,
  rng: () => number,
): { state: PrinterState; event: PrinterTickEvent } {
  if (s.jam || s.queue <= 0) return { state: s, event: null };
  const start = s.progress === 0;
  const p = Math.min(1, s.progress + dt / secondsPerJob);
  if (s.progress < 0.5 && p >= 0.5 && rng() < jamChance) return { state: { ...s, progress: 0.5, jam: true }, event: 'jam' };
  if (p >= 1) return { state: { ...s, queue: s.queue - 1, progress: 0, done: s.done + 1 }, event: 'done' };
  return { state: { ...s, progress: p }, event: start ? 'start' : null };
}

export interface PrinterOptions {
  id: string;
  label?: string;
  footprint: Footprint;
  point?: InteractPoint;
  secondsPerJob?: number;
  jamChance?: number;
  rng?: () => number;
}

export function printerInteractable(o: PrinterOptions): InteractableDef {
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const cur = () => printerOf(getObjectState(o.id));
  const ev = (type: 'printer.queue' | 'printer.jam' | 'printer.clear') => emitInteractEvent({ type, id: o.id, ...at });
  return {
    id: o.id,
    kind: 'printer',
    label: o.label ?? 'Máy in',
    footprint: o.footprint,
    baseY: 0.7,
    height: 0.5,
    point: o.point,
    defaultState: PRINTER_INITIAL,
    actions: [
      {
        id: 'print',
        label: (c) => `In "${PRINT_DOCS[printerOf(c.state).doc]}" (hàng đợi ${printerOf(c.state).queue})`,
        when: (c) => !printerOf(c.state).jam,
        run: () => {
          const p = printerSubmit(cur());
          if (p) {
            setObjectState(o.id, p);
            ev('printer.queue');
          } else ev('printer.jam');
        },
      },
      { id: 'doc', label: 'Chọn tài liệu khác', when: (c) => !printerOf(c.state).jam, run: () => setObjectState(o.id, printerSelectDoc(cur())) },
      {
        id: 'clear',
        label: 'Gỡ giấy kẹt',
        when: (c) => printerOf(c.state).jam,
        run: () => {
          const p = printerClearJam(cur());
          if (p) {
            setObjectState(o.id, p);
            ev('printer.clear');
          }
        },
      },
    ],
  };
}

export function registerPrinterTicker(o: PrinterOptions): () => void {
  const rng = o.rng ?? Math.random;
  return registerTicker(o.id, (dt) => {
    const { state, event } = printerTick(printerOf(getObjectState(o.id)), dt, o.secondsPerJob ?? 4, o.jamChance ?? 0.15, rng);
    setObjectState(o.id, { queue: state.queue, progress: state.progress, jam: state.jam, done: state.done });
    if (event === 'start') emitInteractEvent({ type: 'printer.start', id: o.id, x: o.footprint.cx, z: o.footprint.cz });
    else if (event === 'done') emitInteractEvent({ type: 'printer.done', id: o.id, x: o.footprint.cx, z: o.footprint.cz });
    else if (event === 'jam') emitInteractEvent({ type: 'printer.jam', id: o.id, x: o.footprint.cx, z: o.footprint.cz });
  });
}
