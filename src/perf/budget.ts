// Ngân sách hiệu năng cấu hình được. CHỈ cảnh báo, không tự giảm chất lượng hay đổi cảnh.

export interface Budget {
  /** Trần draw call (200 theo DECISIONS mục 11; đổi trần là quyết định chờ duyệt, không đổi ở đây). */
  maxDrawCalls: number;
  maxTriangles: number;
  /** Ước lượng MB texture (xem estimateTextureBytes: chỉ là ước lượng). */
  maxTextureMB: number;
  maxGeometries: number;
  maxP95Ms: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxDrawCalls: 200, maxTriangles: 500_000, maxTextureMB: 256, maxGeometries: 600, maxP95Ms: 33.4,
};

export interface BudgetInput {
  drawCalls?: number; triangles?: number; textureMB?: number; geometries?: number; p95Ms?: number;
}
export interface BudgetWarning { key: keyof Budget; value: number; limit: number; message: string }

const MAP: Array<[keyof Budget, keyof BudgetInput, string]> = [
  ['maxDrawCalls', 'drawCalls', 'draw call'],
  ['maxTriangles', 'triangles', 'tam giác'],
  ['maxTextureMB', 'textureMB', 'texture MB (ước lượng)'],
  ['maxGeometries', 'geometries', 'geometry'],
  ['maxP95Ms', 'p95Ms', 'p95 khung (ms)'],
];

/** Trả danh sách vượt ngân sách (value > limit). Giá trị thiếu/NaN bị bỏ qua. */
export function checkBudget(input: BudgetInput, budget: Partial<Budget> = {}): BudgetWarning[] {
  const b = { ...DEFAULT_BUDGET, ...budget };
  const out: BudgetWarning[] = [];
  for (const [bk, ik, label] of MAP) {
    const v = input[ik];
    if (v === undefined || Number.isNaN(v)) continue;
    if (v > b[bk]) out.push({ key: bk, value: v, limit: b[bk], message: `${label} ${round(v)} vượt ngân sách ${b[bk]}` });
  }
  return out;
}
const round = (x: number) => Math.round(x * 100) / 100;

/** Chống spam: chỉ cho cảnh báo cùng khóa lặp lại sau cooldownMs. */
export function createWarnThrottle(cooldownMs = 5000) {
  const last = new Map<string, number>();
  return (key: string, now: number) => {
    const t = last.get(key);
    if (t !== undefined && now - t < cooldownMs) return false;
    last.set(key, now);
    return true;
  };
}

export interface TextureLike { image?: { width?: number; height?: number } | null; generateMipmaps?: boolean }
/**
 * Ước lượng byte texture trên GPU = w*h*4 (RGBA8), nhân 4/3 nếu có mipmap. KHÔNG phải số đo GPU thật
 * (không tính nén, định dạng khác, lưu trữ trình điều khiển); chỉ dùng để so sánh tương đối.
 */
export function estimateTextureBytes(t: TextureLike): number {
  const w = t.image?.width ?? 0, h = t.image?.height ?? 0;
  const base = w * h * 4;
  return Math.round(t.generateMipmaps === false ? base : (base * 4) / 3);
}
