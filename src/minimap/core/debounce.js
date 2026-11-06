// Debounce có thể bơm đồng hồ giả để test.

/**
 * Gọi fn sau wait ms kể từ lần call cuối, với tham số của lần call cuối.
 * @param timers { setTimeout, clearTimeout } (mặc định của môi trường)
 */
export function createDebouncer(fn, wait, timers = globalThis) {
  let handle = null;
  let lastArgs = null;
  const run = () => {
    handle = null;
    const args = lastArgs;
    lastArgs = null;
    fn(...(args ?? []));
  };
  return {
    call(...args) {
      lastArgs = args;
      if (handle !== null) timers.clearTimeout(handle);
      handle = timers.setTimeout(run, wait);
    },
    /** Chạy ngay nếu đang chờ. */
    flush() {
      if (handle === null) return;
      timers.clearTimeout(handle);
      run();
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
      lastArgs = null;
    },
    get pending() {
      return handle !== null;
    },
  };
}
