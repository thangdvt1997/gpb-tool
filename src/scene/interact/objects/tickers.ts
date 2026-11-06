/**
 * Bộ đếm thời gian dùng chung cho logic theo thời gian (tự đóng cửa, đang rót, đang in...).
 * Mỗi vật đăng ký một hàm tick(dt); một component duy nhất (ObjectsTicker) gọi tickAll trong useFrame.
 * Tách khỏi React để test được bằng cách gọi tickAll(dt) trực tiếp.
 */
const tickers = new Map<string, (dt: number) => void>();

export function registerTicker(id: string, fn: (dt: number) => void): () => void {
  tickers.set(id, fn);
  return () => {
    if (tickers.get(id) === fn) tickers.delete(id);
  };
}

/** dt bị kẹp 0,1 s để tab nền quay lại không làm vật nhảy cóc. */
export function tickAll(dt: number): void {
  const d = Math.min(Math.max(dt, 0), 0.1);
  tickers.forEach((fn) => fn(d));
}

export function tickerCount(): number {
  return tickers.size;
}
