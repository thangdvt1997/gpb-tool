import { useEffect } from 'react';
import type { ContextRecovery } from './contextRecovery';

/** Hook mỏng: gắn/gỡ listener webglcontextlost/restored lên canvas. Chưa mount. Chưa kiểm chứng trên trình duyệt. */
export function useContextLoss(canvas: HTMLCanvasElement | null | undefined, recovery: ContextRecovery | null) {
  useEffect(() => {
    if (!canvas || !recovery) return;
    const lost = (ev: Event) => { if (recovery.onLost()) ev.preventDefault(); };
    const restored = () => recovery.onRestored();
    canvas.addEventListener('webglcontextlost', lost, false);
    canvas.addEventListener('webglcontextrestored', restored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost, false);
      canvas.removeEventListener('webglcontextrestored', restored, false);
    };
  }, [canvas, recovery]);
}
