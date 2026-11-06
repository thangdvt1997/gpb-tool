import { describe, expect, it } from 'vitest';
import { stoneTextureData } from './stoneTexture';

const opt = { size: 256, tiles: 4, seed: 7, stone: [169, 171, 170], vein: [205, 208, 208], grout: [133, 136, 138] } as const;

function lum(d: Uint8ClampedArray, x: number, y: number, size: number): number {
  const i = (y * size + x) * 4;
  return (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
}

describe('stoneTextureData', () => {
  const d = stoneTextureData(opt);

  it('xác định theo seed và đúng kích thước', () => {
    expect(d.length).toBe(256 * 256 * 4);
    expect(Array.from(stoneTextureData(opt).slice(0, 64))).toEqual(Array.from(d.slice(0, 64)));
  });

  it('không sọc: trung bình theo hàng không dao động tuần hoàn mạnh trong lòng viên', () => {
    // Bên trong viên (tránh mạch), trung bình theo hàng chỉ biến thiên nhẹ và không có chu kỳ lặp ngắn.
    const rows: number[] = [];
    for (let y = 6; y < 58; y++) {
      let s = 0;
      for (let x = 6; x < 58; x++) s += lum(d, x, y, 256);
      rows.push(s / 52);
    }
    const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
    const sd = Math.sqrt(rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length);
    expect(sd).toBeLessThan(6);
    // Tự tương quan ở độ trễ 2..12 hàng không có đỉnh gần 1 kiểu sọc.
    for (let lag = 2; lag <= 12; lag++) {
      let c = 0;
      for (let i = 0; i + lag < rows.length; i++) c += (rows[i]! - mean) * (rows[i + lag]! - mean);
      const ac = c / ((rows.length - lag) * sd * sd + 1e-9);
      if (lag > 8) expect(Math.abs(ac)).toBeLessThan(0.97);
    }
  });

  it('các viên khác nhau (không lặp), độ tương phản vân thấp', () => {
    const tilePx = 64;
    const sig = (tx: number, ty: number) => {
      const v: number[] = [];
      for (let y = 8; y < 56; y += 4) for (let x = 8; x < 56; x += 4) v.push(lum(d, tx * tilePx + x, ty * tilePx + y, 256));
      return v;
    };
    const a = sig(0, 0);
    const b = sig(1, 0);
    const diff = a.reduce((s, x, i) => s + Math.abs(x - b[i]!), 0) / a.length;
    expect(diff).toBeGreaterThan(0.5);
    const all = [...a, ...b];
    expect(Math.max(...all) - Math.min(...all)).toBeLessThan(70);
  });

  it('mạch lát tối hơn nền ở mép viên', () => {
    expect(lum(d, 0, 30, 256)).toBeLessThan(lum(d, 32, 30, 256));
  });
});
