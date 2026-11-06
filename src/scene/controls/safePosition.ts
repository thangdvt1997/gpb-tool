/**
 * Vị trí an toàn và phục hồi khi rơi khỏi bản đồ. Module thuần (chỉ import kiểu), chạy được bằng node:test.
 *
 * - Một điểm "an toàn" khi: tọa độ hữu hạn, nằm trong biên phòng, có sàn ở tâm và trên vòng bán kính
 *   (bán kính nhân vật + khoảng trống), không chồng vật cản nở thêm cùng khoảng đó, không sát người khác.
 * - SafeTracker lấy mẫu vị trí khi nhân vật đứng trên sàn, mỗi `sampleInterval` giây, chỉ lưu điểm đã kiểm tra
 *   và cách điểm trước ít nhất `minSpacing`. Đứng yên không sinh mẫu mới và KHÔNG bao giờ tự teleport.
 * - resolve() kiểm tra lại các điểm đã lưu (mới nhất trước) vì vật cản hoặc người khác có thể đã chiếm chỗ,
 *   rồi tìm quanh điểm đó, rồi spawn, rồi quanh spawn. Không có điểm nào thì trả null (bên gọi không di chuyển).
 * - FallWatch: tọa độ không hợp lệ (NaN, vô hạn) hoặc rơi dưới fallY thì phục hồi ngay; ra ngoài vùng có sàn
 *   thì chờ `outsideGrace` giây (đi sát mép chữ L không bị kéo về vì sai số).
 */
import type { Rect } from '../layout';

export interface Point2 {
  x: number;
  z: number;
}

export interface SafeWorld {
  /** Có sàn tại (x, z). Ví dụ isInsideOffice của officeBounds.ts. */
  isOnFloor: (x: number, z: number) => boolean;
  obstacles: readonly Rect[];
  /** Biên trong của phòng (lòng tường). */
  bounds?: Rect;
  /** Vị trí nhân vật khác (không gồm chính mình). */
  others?: () => Iterable<Point2>;
}

export interface SafeConfig {
  /** Bán kính nhân vật (m). */
  radius: number;
  /** Khoảng trống thêm quanh nhân vật (m). */
  clearance: number;
  /** Khoảng cách tối thiểu giữa hai nhân vật khi phục hồi, tính thêm ngoài 2 × radius (m). */
  actorGap: number;
  sampleInterval: number;
  minSpacing: number;
  historySize: number;
  /** Dưới độ cao này (m) coi như rơi khỏi bản đồ. */
  fallY: number;
  /** Ở ngoài vùng có sàn liên tục quá chừng này (s) thì phục hồi. */
  outsideGrace: number;
  /** Bước và số vòng tìm quanh một điểm bị chặn. */
  searchStep: number;
  searchRings: number;
}

export const SAFE_DEFAULTS: Readonly<SafeConfig> = {
  radius: 0.35,
  clearance: 0.15,
  actorGap: 0.2,
  sampleInterval: 0.5,
  minSpacing: 0.75,
  historySize: 8,
  fallY: -2,
  outsideGrace: 1.0,
  searchStep: 0.5,
  searchRings: 8,
};

export function withDefaults(cfg?: Partial<SafeConfig>): SafeConfig {
  return { ...SAFE_DEFAULTS, ...(cfg ?? {}) };
}

const isNum = (v: number): boolean => typeof v === 'number' && Number.isFinite(v);

/** 8 hướng đều quanh vòng tròn, dùng chung (không cấp phát mỗi lần gọi). */
const RING: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)] as const;
});

export function isSpotSafe(x: number, z: number, world: SafeWorld, cfg: SafeConfig = SAFE_DEFAULTS): boolean {
  if (!isNum(x) || !isNum(z)) return false;
  const r = cfg.radius + cfg.clearance;
  const b = world.bounds;
  if (b && (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r)) return false;
  if (!world.isOnFloor(x, z)) return false;
  for (const [cx, cz] of RING) {
    if (!world.isOnFloor(x + cx * r, z + cz * r)) return false;
  }
  for (const o of world.obstacles) {
    if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return false;
  }
  if (world.others) {
    const min = 2 * cfg.radius + cfg.actorGap;
    for (const p of world.others()) {
      if (Math.hypot(p.x - x, p.z - z) < min) return false;
    }
  }
  return true;
}

/** Tìm điểm an toàn gần (x, z) theo các vòng đồng tâm, gần trước. Chính điểm đó trước tiên. */
export function findSafeNear(x: number, z: number, world: SafeWorld, cfg: SafeConfig = SAFE_DEFAULTS): Point2 | null {
  if (!isNum(x) || !isNum(z)) return null;
  if (isSpotSafe(x, z, world, cfg)) return { x, z };
  for (let ring = 1; ring <= cfg.searchRings; ring++) {
    const d = ring * cfg.searchStep;
    // Vòng xa hơn thì thử nhiều hướng hơn để giữ bước cung xấp xỉ searchStep.
    const n = Math.max(8, Math.ceil((2 * Math.PI * d) / cfg.searchStep));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (isSpotSafe(px, pz, world, cfg)) return { x: px, z: pz };
    }
  }
  return null;
}

export type RecoverySource = 'history' | 'history-near' | 'spawn' | 'spawn-near';

export interface RecoveryTarget extends Point2 {
  source: RecoverySource;
}

export interface SafeTracker {
  /**
   * Gọi mỗi khung. Chỉ lấy mẫu khi grounded và đủ thời gian; trả true nếu vừa lưu điểm mới.
   * Không bao giờ di chuyển nhân vật.
   */
  observe(x: number, y: number, z: number, grounded: boolean, world: SafeWorld, dt: number): boolean;
  /** Điểm phục hồi đã kiểm tra lại, hoặc null nếu không tìm được (kể cả quanh spawn). */
  resolve(world: SafeWorld, spawn: Point2): RecoveryTarget | null;
  /** Điểm mới nhất đã lưu (chưa kiểm tra lại). */
  latest(): Point2 | null;
  size(): number;
  clear(): void;
}

export function createSafeTracker(partial?: Partial<SafeConfig>): SafeTracker {
  const cfg = withDefaults(partial);
  const hist: Point2[] = [];
  let acc = cfg.sampleInterval; // lấy mẫu ngay khung hợp lệ đầu tiên
  return {
    observe(x, y, z, grounded, world, dt) {
      acc += isNum(dt) && dt > 0 ? dt : 0;
      if (acc < cfg.sampleInterval) return false;
      if (!grounded || !isNum(y) || Math.abs(y) > 0.05) return false;
      acc = 0;
      const last = hist[hist.length - 1];
      if (last && Math.hypot(last.x - x, last.z - z) < cfg.minSpacing) return false;
      if (!isSpotSafe(x, z, world, cfg)) return false;
      hist.push({ x, z });
      if (hist.length > cfg.historySize) hist.shift();
      return true;
    },
    resolve(world, spawn) {
      for (let i = hist.length - 1; i >= 0; i--) {
        const p = hist[i]!;
        if (isSpotSafe(p.x, p.z, world, cfg)) return { x: p.x, z: p.z, source: 'history' };
      }
      const last = hist[hist.length - 1];
      if (last) {
        const near = findSafeNear(last.x, last.z, world, cfg);
        if (near) return { ...near, source: 'history-near' };
      }
      if (isSpotSafe(spawn.x, spawn.z, world, cfg)) return { x: spawn.x, z: spawn.z, source: 'spawn' };
      const near = findSafeNear(spawn.x, spawn.z, world, cfg);
      return near ? { ...near, source: 'spawn-near' } : null;
    },
    latest: () => {
      const p = hist[hist.length - 1];
      return p ? { x: p.x, z: p.z } : null;
    },
    size: () => hist.length,
    clear() {
      hist.length = 0;
      acc = cfg.sampleInterval;
    },
  };
}

export type MapStatus = 'ok' | 'invalid' | 'fell' | 'outside';

export function mapStatus(x: number, y: number, z: number, world: SafeWorld, cfg: SafeConfig = SAFE_DEFAULTS): MapStatus {
  if (!isNum(x) || !isNum(y) || !isNum(z)) return 'invalid';
  if (y < cfg.fallY) return 'fell';
  if (!world.isOnFloor(x, z)) return 'outside';
  return 'ok';
}

export interface FallWatch {
  /** Trả true khi cần phục hồi ngay khung này. */
  update(status: MapStatus, dt: number): boolean;
  reset(): void;
}

export function createFallWatch(partial?: Partial<SafeConfig>): FallWatch {
  const cfg = withDefaults(partial);
  let outside = 0;
  return {
    update(status, dt) {
      if (status === 'invalid' || status === 'fell') {
        outside = 0;
        return true;
      }
      if (status === 'outside') {
        outside += isNum(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
        if (outside >= cfg.outsideGrace) {
          outside = 0;
          return true;
        }
        return false;
      }
      outside = 0;
      return false;
    },
    reset() {
      outside = 0;
    },
  };
}
