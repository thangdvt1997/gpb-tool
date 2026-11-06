import { describe, expect, it } from 'vitest';
import { checkPlacement, distanceToRect, KEEP_OUT } from './placement';
import { footprint, type Rect } from '../scene/layout';
import itZone from '../content/zones/it.json';
import type { ZoneObject } from '../content/types';
import { keepOutRectsOf } from './footprints';

const box = (cx: number, cz: number, w: number, d: number): Rect => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

describe('vùng cấm (giống services/layout movable.js)', () => {
  it('distanceToRect: 0 trong hình, khoảng cách Euclid ngoài hình', () => {
    const r = box(0, 0, 2, 2);
    expect(distanceToRect(0.5, 0.5, r)).toBe(0);
    expect(distanceToRect(4, 1, r)).toBeCloseTo(3);
    expect(distanceToRect(4, 5, r)).toBeCloseTo(5);
  });
  it('chặn theo bán kính quanh tâm lõi, không nới cả footprint lõi', () => {
    const door = box(0, 0, 3, 0.2); // lối vào rộng 3 m
    const ctx = { fixed: [], keepOut: [door], movables: [] };
    // Cách tâm 1,4 m: chặn. Cách tâm 1,6 m (dù cách mép cửa chỉ 0,1 m theo x): cho phép.
    expect(checkPlacement(box(0, 1.4 + 0.5, 1, 1), ctx).valid).toBe(false);
    expect(checkPlacement(box(1.6 + 0.5, 0, 1, 1), ctx).valid).toBe(true);
    expect(KEEP_OUT).toBe(1.5);
  });
  it('Service Desk cạnh lối vào nhích ra xa lối vào được', () => {
    const objects = (itZone as unknown as { objects: ZoneObject[] }).objects;
    const desk = objects.find((o) => o.id === 'service_desk')!;
    const keepOut = keepOutRectsOf(objects);
    const ctx = { fixed: [], keepOut, movables: [] };
    const r = footprint(desk);
    const away = { ...r, minZ: r.minZ - 0.5, maxZ: r.maxZ - 0.5 };
    expect(checkPlacement(away, ctx).valid).toBe(true);
  });
});
