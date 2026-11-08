import { describe, expect, it } from 'vitest';
import it_ from '../content/zones/it.json';
import type { ZoneObject } from '../content/types';
import { AMBIENT_SOURCE_DEFS, resolveAmbientSources } from '../audio/spatial/ambient';
import { applyLayoutPoses, type LayoutPoses } from '../layout/applyPoses';
import { collisionRects, footprint, type Rect } from './layout';
import { ENTRY_DROP } from './entry/placement';
import { PRINTER_POSE, PRINTER_SPOT, PRINT_ROOM_HOME, PROP_SPOTS, propRect, OFFICE_PROP_BLOCKERS } from './officePropsLayout';

const objects = (it_ as unknown as { objects: ZoneObject[] }).objects;
const room = objects.find((o) => o.id === 'util_print')!;
const overlap = (a: Rect, b: Rect) => a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;
const src = (objs: readonly ZoneObject[]) => resolveAmbientSources(objs, AMBIENT_SOURCE_DEFS.filter((d) => d.id === 'printer_print'))[0];

describe('máy in phòng In ấn', () => {
  it('tâm util_print trong it.json khớp PRINT_ROOM_HOME, máy in có đúng một chỗ', () => {
    expect(room.position[0]).toBeCloseTo(PRINT_ROOM_HOME.x);
    expect(room.position[2]).toBeCloseTo(PRINT_ROOM_HOME.z);
    expect(PROP_SPOTS.filter((s) => s.kind === 'printer')).toEqual([PRINTER_SPOT]);
  });

  it('nguồn âm dùng đúng vị trí và hướng của decor, hướng ra khỏi khối (mặt Đông)', () => {
    const s = src(objects);
    expect(s.position[0]).toBeCloseTo(PRINTER_POSE.x);
    expect(s.position[2]).toBeCloseTo(PRINTER_POSE.z);
    expect(s.orientation).toEqual([1, 0, 0]);
    // Mặt trước local +z quay PRINTER_POSE.rotationY: hướng sàn (sin, cos) trùng orientation.
    expect(Math.sin(PRINTER_POSE.rotationY)).toBeCloseTo(s.orientation[0]);
    expect(Math.cos(PRINTER_POSE.rotationY)).toBeCloseTo(s.orientation[2]);
  });

  it('máy áp sát mặt Đông khối util_print, trong dải mặt Đông và không chồng khối đặc', () => {
    const r = propRect(PRINTER_SPOT);
    const fp = footprint(room);
    expect(r.minX).toBeCloseTo(fp.maxX); // áp mặt Đông
    expect(r.minZ).toBeGreaterThanOrEqual(fp.minZ);
    expect(r.maxZ).toBeLessThanOrEqual(fp.maxZ);
    // Đầu Nam, ngoài hành lang west_link2 (plan y 10.9..12.9, tức z -4.1..-2.1).
    expect(r.minZ).toBeGreaterThanOrEqual(-2.1);
    // Tâm nguồn âm nằm trong ô máy in và tia hướng ra ngoài khối.
    const s = src(objects);
    expect(s.position[0]).toBeGreaterThan(r.minX);
    expect(s.position[0]).toBeLessThan(r.maxX);
    for (const o of objects) {
      if (o.id === 'util_print') continue;
      expect(overlap(r, footprint(o)) && collisionRects([o]).length > 0, o.id).toBe(false);
    }
    for (const b of OFFICE_PROP_BLOCKERS) if (b !== r) expect(overlap(r, b) && b.minX !== r.minX).toBe(false);
  });

  it('không chặn lối đi: từ điểm thả vẫn ra được hành lang giữa và lối nối Tây (lưới 0,1 m)', () => {
    const blockers = [...collisionRects(objects), ...OFFICE_PROP_BLOCKERS];
    const R = 0.3;
    const free = (x: number, z: number) => !blockers.some((b) => x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R);
    expect(free(ENTRY_DROP.x, ENTRY_DROP.z)).toBe(true);
    // Mép Nam hành lang west_link2 / đầu Tây hành lang giữa (z -2.1..-1.1) phải còn đủ chỗ cho người (bán kính 0,3 m) đi qua.
    const goal: [number, number] = [-9.4, -3.5]; // giữa west_link2, phía Bắc máy in
    const step = 0.1;
    const key = (x: number, z: number) => `${Math.round(x / step)},${Math.round(z / step)}`;
    const seen = new Set([key(ENTRY_DROP.x, ENTRY_DROP.z)]);
    const q: [number, number][] = [[ENTRY_DROP.x, ENTRY_DROP.z]];
    let reached = false;
    while (q.length && !reached) {
      const [x, z] = q.shift()!;
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx) > 30 || Math.abs(nz) > 20 || !free(nx, nz) || seen.has(key(nx, nz))) continue;
        seen.add(key(nx, nz));
        if (Math.hypot(nx - goal[0], nz - goal[1]) < 0.15) reached = true;
        q.push([nx, nz]);
      }
    }
    expect(reached).toBe(true);
  });

  it('theo bố cục xoay (giả định util_print có layoutRot): vị trí xoay quanh tâm, hướng cộng góc xoay', () => {
    for (const rot of [90, 180, 270] as const) {
      const rotated: ZoneObject = { ...room, layoutRot: rot };
      const s = src([rotated]);
      const a = (rot * Math.PI) / 180;
      const dx = PRINTER_POSE.x - PRINT_ROOM_HOME.x;
      const dz = PRINTER_POSE.z - PRINT_ROOM_HOME.z;
      expect(s.position[0]).toBeCloseTo(room.position[0] + dx * Math.cos(a) + dz * Math.sin(a));
      expect(s.position[2]).toBeCloseTo(room.position[2] - dx * Math.sin(a) + dz * Math.cos(a));
      expect(s.orientation[0]).toBeCloseTo(Math.sin(PRINTER_POSE.rotationY + a));
      expect(s.orientation[2]).toBeCloseTo(Math.cos(PRINTER_POSE.rotationY + a));
    }
  });

  it('khối không di chuyển được thì bố cục không đổi nguồn âm', () => {
    const poses: LayoutPoses = {
      saved: { util_print: { x: 5, z: 5, rotation: 90 } },
      defaults: { util_print: { x: room.position[0], z: room.position[2], rotation: 0 } },
    };
    const moved = applyLayoutPoses(objects, poses);
    const a = src(objects), b = src(moved);
    expect(b.position).toEqual(a.position);
    expect(b.orientation).toEqual(a.orientation);
  });
});
