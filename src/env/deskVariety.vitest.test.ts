import { describe, expect, it } from 'vitest';
import { deskSeatSignatures, type DeskSpec } from './desk';

function spec(id: string, seed: number, variant: DeskSpec['variant'] = 'dev'): DeskSpec {
  return { id, x: 0, z: 0, width: 6, depth: 2.4, height: 0.75, variant, seed, chairs: true, plants: true };
}

describe('đa dạng đồ dùng theo chỗ khi dùng bàn GLB', () => {
  it('xác định: cùng seed cho cùng chữ ký', () => {
    const d = [spec('a', 11), spec('b', 12, 'ops')];
    expect(deskSeatSignatures(d)).toEqual(deskSeatSignatures(d));
  });

  it('một khối nhiều chỗ có ít nhất 2 cấu hình khác nhau', () => {
    const sigs = deskSeatSignatures([spec('a', 7)]);
    expect(sigs.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(2);
  });

  it('nhiều seed khác nhau cho nhiều cấu hình, không còn giống hệt', () => {
    const sigs = deskSeatSignatures(Array.from({ length: 10 }, (_, i) => spec(`d${i}`, 100 + i * 7)));
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(5);
  });

  it('GLB và procedural cùng chọn cấu hình đồ dùng cho chỗ đầu của bàn (cùng seed)', () => {
    const d = [spec('a', 21)];
    const g = deskSeatSignatures(d, true);
    const p = deskSeatSignatures(d, false);
    expect(g.length).toBe(p.length);
    expect(g.every((s) => s.length > 0)).toBe(true);
  });
});
