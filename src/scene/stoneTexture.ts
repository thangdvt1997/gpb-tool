// Sinh dữ liệu vân sàn đá xám bằng nhiễu nhiều tần số (hàm thuần, không phụ thuộc canvas nên kiểm thử được).
// Mỗi viên gạch lấy mẫu nhiễu ở một vị trí, góc xoay và chiều lật ngẫu nhiên riêng, nên các viên không giống nhau
// và chu kỳ lặp của cả texture (tiles x tiles viên) khó nhận ra. Vân đá là đường cong mảnh, độ tương phản thấp.

export interface StoneOptions {
  /** Cạnh texture (px), vuông. */
  size: number;
  /** Số viên mỗi cạnh trong một ô texture. */
  tiles: number;
  seed: number;
  /** Màu nền, vân, mạch lát: [r, g, b] 0..255. */
  stone: readonly [number, number, number];
  vein: readonly [number, number, number];
  grout: readonly [number, number, number];
}

/** Băm số nguyên 2D về [0, 1). */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 362437)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Nhiễu giá trị mượt (smoothstep), [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Nhiễu fbm: cộng các tần số, chuẩn hóa về [0, 1). */
export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f + o * 17.3, y * f - o * 9.1, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Trả bộ đệm RGBA size x size (alpha 255). */
export function stoneTextureData(opt: StoneOptions): Uint8ClampedArray {
  const { size, tiles, seed, stone, vein, grout } = opt;
  const out = new Uint8ClampedArray(size * size * 4);
  const tilePx = size / tiles;
  // Mạch lát 1,5 px mỗi bên mép viên; sàn 256 px/viên 0,8 m, khoảng 3 mm.
  const half = Math.max(0.9, tilePx / 170);

  // Thông số riêng từng viên.
  const tileInfo = Array.from({ length: tiles * tiles }, (_, k) => {
    const r = (n: number) => hash2(k, n, seed);
    const ang = r(1) * Math.PI * 2;
    return {
      cos: Math.cos(ang),
      sin: Math.sin(ang),
      ox: r(2) * 400,
      oy: r(3) * 400,
      flip: r(4) < 0.5 ? 1 : -1,
      tone: (r(5) - 0.5) * 0.06,
      veinAmt: 0.55 + r(6) * 0.6,
    };
  });

  for (let py = 0; py < size; py++) {
    const ty = Math.min(tiles - 1, Math.floor(py / tilePx));
    const ly = py - ty * tilePx;
    for (let px = 0; px < size; px++) {
      const tx = Math.min(tiles - 1, Math.floor(px / tilePx));
      const lx = px - tx * tilePx;
      const t = tileInfo[ty * tiles + tx]!;
      const i = (py * size + px) * 4;

      // Khoảng cách tới mép viên (px) cho mạch lát và vát mép.
      const edge = Math.min(lx, ly, tilePx - lx, tilePx - ly);

      // Tọa độ nhiễu trong viên: xoay, lật, dịch ngẫu nhiên theo viên (đơn vị: 1 = một viên).
      const u = lx / tilePx - 0.5;
      const v = ly / tilePx - 0.5;
      const nx = (u * t.cos - v * t.sin) * t.flip * 3 + t.ox;
      const ny = (u * t.sin + v * t.cos) * 3 + t.oy;

      // Đám mây nền: vài mảng sáng tối rất nhẹ.
      const cloud = fbm(nx * 0.9, ny * 0.9, seed + 11, 4) - 0.5;
      // Vân: đường cong mảnh quanh nơi nhiễu bị uốn cắt ngưỡng 0,5 (ridge), mép mềm, độ tương phản thấp.
      const wx = fbm(nx * 0.7 + 5, ny * 0.7, seed + 23, 3);
      const wy = fbm(nx * 0.7, ny * 0.7 + 9, seed + 37, 3);
      const f = fbm(nx * 1.1 + wx * 2.2, ny * 1.1 + wy * 2.2, seed + 53, 3);
      const d = Math.abs(f - 0.5);
      const ridge = Math.exp(-(d * d) / (2 * 0.018 * 0.018));
      // Vân thưa: chỉ hiện ở nơi một nhiễu thấp tần số vượt ngưỡng.
      const mask = Math.min(1, Math.max(0, (fbm(nx * 0.5, ny * 0.5, seed + 71, 2) - 0.42) * 4));
      const veinA = ridge * mask * 0.38 * t.veinAmt;
      // Hạt đá mịn 1 px.
      const grain = (hash2(px, py, seed + 5) - 0.5) * 0.05;

      let shade = 1 + t.tone + cloud * 0.14 + grain;
      let r = stone[0] * shade;
      let g = stone[1] * shade;
      let b = stone[2] * shade;
      r += (vein[0] - r) * veinA;
      g += (vein[1] - g) * veinA;
      b += (vein[2] - b) * veinA;

      // Mạch lát: mép mềm 1 px (khử răng cưa), kèm vát tối nhẹ sát mạch.
      const gAmt = Math.min(1, Math.max(0, (half + 0.5 - edge) / 1));
      const bevel = Math.min(1, Math.max(0, 1 - (edge - half) / 3)) * 0.06;
      r *= 1 - bevel;
      g *= 1 - bevel;
      b *= 1 - bevel;
      r += (grout[0] - r) * gAmt;
      g += (grout[1] - g) * gAmt;
      b += (grout[2] - b) * gAmt;

      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}
