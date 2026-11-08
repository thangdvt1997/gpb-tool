// Đo thời gian GPU của mỗi lần render bằng EXT_disjoint_timer_query_webgl2 (task 08).
// Kết quả trả về trễ vài khung (truy vấn bất đồng bộ). Không có extension (Firefox, Safari, swiftshader) thì supported=false.
// Bỏ mẫu khi GPU báo disjoint (đổi xung nhịp, mất ngữ cảnh) vì số đo khi đó không tin được.

/** Phần tối thiểu của WebGL2RenderingContext mà bộ đo cần (để test bằng đối tượng giả). */
export interface TimerGL {
  getExtension(name: string): unknown;
  createQuery(): WebGLQuery | null;
  deleteQuery(q: WebGLQuery | null): void;
  beginQuery(target: number, q: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(q: WebGLQuery, pname: number): unknown;
  getParameter(pname: number): unknown;
  readonly QUERY_RESULT: number;
  readonly QUERY_RESULT_AVAILABLE: number;
}
interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export interface GpuTimer {
  readonly supported: boolean;
  /** Mở truy vấn trước khi render. Trả false nếu không đo khung này (không hỗ trợ, đang lồng, hết chỗ). */
  begin(): boolean;
  end(): void;
  /** Lấy các kết quả đã sẵn sàng (ms), theo thứ tự đã đo. Gọi mỗi khung. */
  poll(): number[];
  /** Số mẫu bị bỏ vì disjoint. */
  readonly discarded: number;
  dispose(): void;
}

export function createGpuTimer(gl: TimerGL | null | undefined, maxPending = 4): GpuTimer {
  const ext = (gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null) as TimerExt | null;
  if (!gl || !ext) {
    return { supported: false, begin: () => false, end() {}, poll: () => [], discarded: 0, dispose() {} };
  }
  const pending: WebGLQuery[] = [];
  const free: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;
  let discarded = 0;
  return {
    supported: true,
    get discarded() { return discarded; },
    begin() {
      if (active) return false; // render lồng nhau (chụp ảnh, env map): chỉ đo lần ngoài cùng
      if (pending.length >= maxPending) return false;
      const q = free.pop() ?? gl.createQuery();
      if (!q) return false;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = q;
      return true;
    },
    end() {
      if (!active) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    },
    poll() {
      const out: number[] = [];
      // Đọc disjoint trước: nếu true thì mọi truy vấn đang chờ đều không tin được.
      const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length > 0) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; // kết quả về theo thứ tự
        pending.shift();
        const ns = Number(gl.getQueryParameter(q, gl.QUERY_RESULT));
        if (disjoint || !Number.isFinite(ns)) discarded++;
        else out.push(ns / 1e6);
        free.push(q);
      }
      return out;
    },
    dispose() {
      if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); free.push(active); active = null; }
      for (const q of [...pending, ...free]) gl.deleteQuery(q);
      pending.length = 0; free.length = 0;
    },
  };
}
