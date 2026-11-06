/**
 * Va chạm giữa hai nhân vật (docs/design/MOVEMENT_EMOTES.md mục 3).
 * Không gọi API, không đụng React. Trạng thái nằm trong BumpState dựng một lần.
 * Chuỗi khóa cặp chỉ được tạo khi hai thân thật sự chạm nhau.
 */

export const BUMP_COOLDOWN_MS = 60_000;

/** Thân tròn trên mặt phẳng XZ. Mảng bodies do cảnh giữ và tái dùng. */
export interface BumpBody {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Vận tốc XZ (đơn vị/giây) để xác định ai là người đi va. */
  vx: number;
  vz: number;
}

export interface BumpState {
  /** Khóa cặp (id nhỏ|id lớn) -> thời điểm hết cooldown. */
  until: Map<string, number>;
  lastPrune: number;
}

export function createBumpState(): BumpState {
  return { until: new Map<string, number>(), lastPrune: 0 };
}

/** Khóa cặp không phụ thuộc thứ tự. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Tùy chọn reactBump lưu ở auth; vắng mặt hoặc không phải false thì coi như bật. */
export function reactBumpEnabled(prefs: { reactBump?: boolean | null } | null | undefined): boolean {
  return prefs?.reactBump !== false;
}

export interface BumpHandlers {
  /** Người đi va: phát apologize, một lần mỗi cooldown. */
  onApologize: (walkerId: string, victimId: string) => void;
  /** Người bị va: phát startle. Không gọi nếu họ tắt reactBump. */
  onStartle: (victimId: string, walkerId: string) => void;
}

/**
 * Đẩy hai thân ra khỏi nhau (chặn xuyên nhau). Luôn chạy, không phụ thuộc reactBump.
 * Trả true nếu đang chồng lấn. Ghi trực tiếp vào x, z của hai thân.
 */
export function pushApart(a: BumpBody, b: BumpBody): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const min = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1;
  const nz = d > 1e-6 ? dz / d : 0;
  const half = (min - d) * 0.5;
  a.x -= nx * half;
  a.z -= nz * half;
  b.x += nx * half;
  b.z += nz * half;
  return true;
}

/** Người đi va là bên có thành phần vận tốc hướng về phía bên kia lớn hơn. */
function aIsWalker(a: BumpBody, b: BumpBody): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const toward = a.vx * dx + a.vz * dz;
  const away = -(b.vx * dx + b.vz * dz);
  return toward >= away;
}

/**
 * Duyệt mọi cặp, chặn va chạm vật lý, và phát phản ứng khi hết cooldown của cặp.
 * isReactBumpOn(id) trả tùy chọn của người bị va (mặc định bật).
 */
export function updateBumps(
  state: BumpState,
  bodies: readonly BumpBody[],
  nowMs: number,
  isReactBumpOn: (id: string) => boolean,
  handlers: BumpHandlers,
): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      // Hướng đi va tính theo vận tốc, nên xác định trước khi đẩy là không cần: đẩy chỉ đổi x, z.
      if (!pushApart(a, b)) continue;
      const key = pairKey(a.id, b.id);
      const until = state.until.get(key);
      if (until !== undefined && nowMs < until) continue;
      state.until.set(key, nowMs + BUMP_COOLDOWN_MS);
      const walker = aIsWalker(a, b) ? a : b;
      const victim = walker === a ? b : a;
      handlers.onApologize(walker.id, victim.id);
      if (isReactBumpOn(victim.id)) handlers.onStartle(victim.id, walker.id);
    }
  }
  if (nowMs - state.lastPrune > BUMP_COOLDOWN_MS) {
    state.lastPrune = nowMs;
    state.until.forEach((t, k) => {
      if (t <= nowMs) state.until.delete(k);
    });
  }
}
