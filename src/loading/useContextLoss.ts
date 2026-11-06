import { useEffect } from 'react';
import type { ContextRecovery } from './contextRecovery';

/** Hook mỏng: gắn/gỡ listener webglcontextlost/restored lên canvas. Đã mount trong App. Chưa kiểm chứng trên trình duyệt. */
export function useContextLoss(canvas: HTMLCanvasElement | null | undefined, recovery: ContextRecovery | null) {
  useEffect(() => {
    if (!canvas || !recovery) return;
    // Canvas cũ bị R3F gọi forceContextLoss khi remount (đổi key): sự kiện đến sau khi canvas đã rời DOM thì bỏ qua,
    // nếu không bộ phục hồi coi là mất ngữ cảnh mới và remount lặp tới khi tải lại trang.
    const lost = (ev: Event) => { if (canvas.isConnected && recovery.onLost()) ev.preventDefault(); };
    const restored = () => { if (canvas.isConnected) recovery.onRestored(); };
    canvas.addEventListener('webglcontextlost', lost, false);
    canvas.addEventListener('webglcontextrestored', restored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost, false);
      canvas.removeEventListener('webglcontextrestored', restored, false);
    };
  }, [canvas, recovery]);
}
