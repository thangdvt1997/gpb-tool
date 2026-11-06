export type ContextPhase = 'ok' | 'lost' | 'restoring' | 'failed';

export interface ContextRecoveryOptions {
  /** Tạm dừng simulation/input. */
  pause: () => void;
  resume: () => void;
  /** Remount có kiểm soát (tăng key Canvas) khi restored xong hoặc quá hạn chờ. */
  remount: () => void;
  /** Lưu trạng thái (layout/nhân vật) trước khi reload. Có thể async. */
  saveState: () => void | Promise<void>;
  reload: () => void;
  /** Thời gian chờ webglcontextrestored trước khi tự remount. */
  restoreWaitMs?: number;
  /** Số lần remount tối đa trong cửa sổ trước khi chuyển sang reload an toàn. */
  maxRemounts?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  onPhase?: (p: ContextPhase) => void;
}

/** Logic thuần: sự kiện lost/restored -> pause, remount, hoặc lưu + reload. Không đụng DOM. */
export function createContextRecovery(o: ContextRecoveryOptions) {
  const wait = o.restoreWaitMs ?? 3000;
  const maxRemounts = o.maxRemounts ?? 2;
  const st = o.setTimeout ?? ((f, ms) => setTimeout(f, ms));
  const ct = o.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let phase: ContextPhase = 'ok';
  let timer: unknown;
  let remounts = 0;
  let disposed = false;

  const set = (p: ContextPhase) => { if (phase !== p) { phase = p; o.onPhase?.(p); } };
  const clear = () => { if (timer !== undefined) { ct(timer); timer = undefined; } };

  async function giveUp() {
    set('failed');
    try { await o.saveState(); } catch { /* vẫn reload; lưu thất bại không được chặn phục hồi */ }
    if (!disposed) o.reload();
  }

  function remountOrGiveUp() {
    clear();
    if (remounts >= maxRemounts) { void giveUp(); return; }
    remounts++;
    set('restoring');
    o.remount();
  }

  return {
    get phase() { return phase; },
    get remounts() { return remounts; },
    /** Trả true nếu caller nên gọi event.preventDefault() (cho phép restored). */
    onLost(): boolean {
      if (disposed || phase === 'failed') return false;
      if (phase === 'ok') o.pause();
      set('lost');
      clear();
      timer = st(() => { timer = undefined; if (phase === 'lost') remountOrGiveUp(); }, wait);
      return true;
    },
    onRestored() {
      if (disposed || phase === 'failed' || phase === 'ok') return;
      remountOrGiveUp();
    },
    /** Gọi khi scene mới đã render ổn định sau remount. */
    onReady() {
      if (disposed || phase === 'failed') return;
      clear();
      if (phase !== 'ok') { set('ok'); o.resume(); }
    },
    /** Reset bộ đếm remount sau thời gian ổn định. */
    resetCounter() { remounts = 0; },
    dispose() { disposed = true; clear(); },
  };
}

export type ContextRecovery = ReturnType<typeof createContextRecovery>;
