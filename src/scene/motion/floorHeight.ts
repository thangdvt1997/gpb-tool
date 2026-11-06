/**
 * Mở rộng API va chạm AABB theo chiều cao: bậc thấp (stepHeight) và độ dốc tối đa (maxSlope).
 * Hàm thuần. Hộp có độ cao là bề mặt đi được (bậc, bục, đường dốc) hoặc vật cản thấp.
 *
 * LƯU Ý: văn phòng hiện PHẲNG, không có bậc hay dốc nào trong dữ liệu cảnh (obstacles là Rect 2D, sàn y = 0).
 * Module này là hạ tầng + tham số để dùng khi có bề mặt như vậy; chưa được nối vào cảnh nào.
 */

export interface HeightBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Độ cao mặt trên (m). Với đường dốc: độ cao tại đầu minAxis, xem `ramp`. */
  topY: number;
  /** Đường dốc: mặt trên đổi tuyến tính theo trục `axis` từ topY (tại min) đến endY (tại max). */
  ramp?: { axis: 'x' | 'z'; endY: number };
}

export interface FloorConfig {
  /** Bước lên tối đa (m). Cao hơn bị coi là tường. */
  stepHeight: number;
  /** Góc dốc tối đa đi được (rad). Dốc hơn bị chặn. */
  maxSlope: number;
  /** Bán kính nhân vật (m), mở rộng hộp khi kiểm tra. */
  radius: number;
  /** Sai số coi là chạm đất (m). */
  groundEps: number;
}

export const DEFAULT_FLOOR_CONFIG: FloorConfig = {
  stepHeight: 0.3,
  maxSlope: (40 * Math.PI) / 180,
  radius: 0.3,
  groundEps: 0.02,
};

/** Chiều cao người tham chiếu (m) để suy bậc/bán kính theo hình thể. */
export const REFERENCE_HEIGHT = 1.75;

/** Tham số tỉ lệ theo chiều cao (hỗ trợ khoảng 1,4 - 2,1 m, ngoài khoảng thì kẹp). */
export function floorConfigForHeight(heightM: number, base: FloorConfig = DEFAULT_FLOOR_CONFIG): FloorConfig {
  const h = Math.min(2.1, Math.max(1.4, heightM));
  const k = h / REFERENCE_HEIGHT;
  return { ...base, stepHeight: base.stepHeight * k, radius: base.radius * Math.sqrt(k) };
}

/** Độ cao mặt trên của hộp tại (x, z). */
export function boxTopAt(b: HeightBox, x: number, z: number): number {
  if (!b.ramp) return b.topY;
  const lo = b.ramp.axis === 'x' ? b.minX : b.minZ;
  const hi = b.ramp.axis === 'x' ? b.maxX : b.maxZ;
  const v = b.ramp.axis === 'x' ? x : z;
  const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0;
  return b.topY + (b.ramp.endY - b.topY) * t;
}

/** Góc dốc của hộp (rad), 0 với bề mặt phẳng. */
export function boxSlope(b: HeightBox): number {
  if (!b.ramp) return 0;
  const len = b.ramp.axis === 'x' ? b.maxX - b.minX : b.maxZ - b.minZ;
  if (len <= 0) return Math.PI / 2;
  return Math.atan2(Math.abs(b.ramp.endY - b.topY), len);
}

export interface FloorResult {
  /** Độ cao sàn đỡ nhân vật tại điểm (m). */
  floorY: number;
  /** Có hộp nào chặn (quá cao hoặc quá dốc) tại điểm này. */
  blocked: boolean;
  /** Góc dốc của bề mặt đang đứng (rad). */
  slope: number;
  /** Chỉ số hộp đang đứng lên, -1 nếu là sàn gốc (y = 0). */
  surface: number;
}

function covers(b: HeightBox, x: number, z: number, r: number): boolean {
  return x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;
}

/**
 * Xác định độ cao sàn tại (x, z) khi chân đang ở `currentY`.
 * - Hộp có mặt trên <= currentY + stepHeight và dốc <= maxSlope: đi lên được, lấy cao nhất.
 * - Hộp cao hơn bậc cho phép hoặc dốc quá mức, mà chân đang thấp hơn mặt hộp: blocked.
 * - Hộp thấp hơn chân: bỏ qua (nhân vật rơi/đi xuống).
 */
export function resolveFloorHeight(
  x: number,
  z: number,
  currentY: number,
  boxes: readonly HeightBox[],
  cfg: FloorConfig = DEFAULT_FLOOR_CONFIG,
): FloorResult {
  let floorY = 0;
  let slope = 0;
  let surface = -1;
  let blocked = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (!covers(b, x, z, cfg.radius)) continue;
    const top = boxTopAt(b, x, z);
    const sl = boxSlope(b);
    if (top > currentY + cfg.stepHeight + 1e-9 || sl > cfg.maxSlope + 1e-9) {
      // Mặt này nằm trên tầm bước (hoặc quá dốc) và chân thấp hơn nó: là tường.
      if (top > currentY + cfg.groundEps) {
        blocked = true;
        continue;
      }
    }
    if (top > floorY) {
      floorY = top;
      slope = sl;
      surface = i;
    }
  }
  return { floorY, blocked, slope, surface };
}

/** Có thể đi từ (x0,z0) đến (x1,z1) ở độ cao y không (kiểm tra điểm đích và điểm giữa, bước nhỏ). */
export function canStepTo(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  boxes: readonly HeightBox[],
  cfg: FloorConfig = DEFAULT_FLOOR_CONFIG,
): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / Math.max(0.05, cfg.radius * 0.5)));
  let curY = y;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = resolveFloorHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, curY, boxes, cfg);
    if (r.blocked) return false;
    curY = Math.max(curY, r.floorY);
  }
  return true;
}

export interface GroundResult {
  y: number;
  grounded: boolean;
  /** Đã hút xuống sàn thấp hơn trong tầm bước (đi xuống bậc không bị coi là rơi). */
  snapped: boolean;
  blocked: boolean;
  slope: number;
}

/**
 * Cập nhật độ cao đứng đất. `wasGrounded`: khung trước đang chạm đất. `vy`: vận tốc đứng (dương = lên).
 * Grounded dựa trên tiếp xúc với bề mặt (khoảng cách tới sàn) và vận tốc, không chỉ so Y với 0.
 */
export function settleOnGround(
  x: number,
  z: number,
  y: number,
  vy: number,
  wasGrounded: boolean,
  boxes: readonly HeightBox[],
  cfg: FloorConfig = DEFAULT_FLOOR_CONFIG,
): GroundResult {
  const f = resolveFloorHeight(x, z, y, boxes, cfg);
  const gap = y - f.floorY;
  if (vy <= 0 && gap <= cfg.groundEps) {
    return { y: f.floorY, grounded: true, snapped: gap > 1e-9, blocked: f.blocked, slope: f.slope };
  }
  // Đang đứng đất, sàn thấp hơn trong tầm bước và không bay lên: hút xuống.
  if (wasGrounded && vy <= 0 && gap <= cfg.stepHeight) {
    return { y: f.floorY, grounded: true, snapped: true, blocked: f.blocked, slope: f.slope };
  }
  return { y, grounded: false, snapped: false, blocked: f.blocked, slope: f.slope };
}
