// Kho số liệu ngoài React: PerfProbe ghi mỗi khung, overlay đọc ~4 lần/giây (không setState mỗi khung).
import { createRollingWindow, type FrameSummary } from './stats';
import type { BudgetWarning } from './budget';
import type { RendererSnap } from './bench';

export interface PerfSnapshot {
  frame: FrameSummary;
  renderer: RendererSnap | null;
  /** Ước lượng (xem estimateTextureBytes), null nếu chưa tính. */
  textureMB: number | null;
  jsHeapMB: number | null;
  warnings: BudgetWarning[];
  bench: { running: boolean; progress: number } | null;
}

export function createPerfStore(windowSize = 240) {
  const win = createRollingWindow(windowSize);
  let renderer: RendererSnap | null = null;
  let textureMB: number | null = null, jsHeapMB: number | null = null;
  let warnings: BudgetWarning[] = [];
  let bench: PerfSnapshot['bench'] = null;
  const subs = new Set<() => void>();
  return {
    pushFrame(ms: number) { win.push(ms); },
    setRenderer(r: RendererSnap) { renderer = r; },
    setExtras(e: { textureMB?: number | null; jsHeapMB?: number | null }) {
      if (e.textureMB !== undefined) textureMB = e.textureMB;
      if (e.jsHeapMB !== undefined) jsHeapMB = e.jsHeapMB;
    },
    setWarnings(w: BudgetWarning[]) { warnings = w; },
    setBench(b: PerfSnapshot['bench']) { bench = b; },
    snapshot(): PerfSnapshot { return { frame: win.summary(), renderer, textureMB, jsHeapMB, warnings, bench }; },
    clear() { win.clear(); },
    emit() { subs.forEach((f) => f()); },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type PerfStore = ReturnType<typeof createPerfStore>;
/** Kho dùng chung mặc định. */
export const perfStore: PerfStore = createPerfStore();
