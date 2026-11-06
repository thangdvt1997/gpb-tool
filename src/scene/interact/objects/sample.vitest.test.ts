// Khu mẫu vật tương tác: mọi vật và điểm đứng dùng vật phải nằm trong chữ L (người chơi tới được).
import { describe, expect, it } from 'vitest';
import { buildSampleConfig } from './InteractObjects';
import { isInsideOffice } from '../../officeBounds';

describe('khu mẫu vật tương tác', () => {
  const cfg = buildSampleConfig([], () => false);
  const g = cfg.geo;
  it.each([
    ['tủ hồ sơ', g.cab],
    ['cây nước', g.water],
    ['máy in', g.low],
    ['TV', g.tv],
  ] as const)('%s nằm trong chữ L', (_n, pl) => {
    expect(isInsideOffice(pl.x, pl.z)).toBe(true);
  });
  it('điểm đứng dùng tủ, cây nước, máy in nằm trong chữ L', () => {
    for (const p of [cfg.cabinets![0]!.at, cfg.coolers![0]!.point, cfg.printers![0]!.point]) expect(isInsideOffice(p!.x, p!.z)).toBe(true);
  });
});
