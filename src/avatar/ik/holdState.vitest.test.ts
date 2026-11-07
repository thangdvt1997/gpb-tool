// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import it_json from '../../content/zones/it.json';
import type { ZoneObject } from '../../content/types';
import {
  FingerGrip, HAND_SOCKET_R, LimbIKController, cupReachPoint, handSocketForUrl, deskHeightAhead, deskSurfacesOf,
  gripAt, setDeskSurfaces,
} from './index';
import { loadRig } from './rigLoader.testutil';

describe('socket và điểm cầm', () => {
  it('HAND_SOCKET_R khớp socket hand_r đã hiệu chỉnh trong manifest (theo thứ tự male, female, chibi)', () => {
    // @ts-ignore process là của node
    const m = JSON.parse(readFileSync(`${process.cwd()}/public/models/manifest.json`, 'utf8'));
    const found: Array<{ offset: number[]; calibrated: boolean }> = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        const r = o as Record<string, unknown>;
        if (r.name === 'hand_r' && Array.isArray(r.offset)) found.push(r as never);
        Object.values(r).forEach(walk);
      }
    };
    walk(m);
    const mine = Object.values(HAND_SOCKET_R);
    expect(found.length).toBe(mine.length);
    found.forEach((f, i) => {
      expect(f.calibrated).toBe(true);
      f.offset.forEach((v, j) => expect(v).toBeCloseTo(mine[i][j], 4));
    });
    expect(handSocketForUrl('/models/chibi.glb')).toEqual(HAND_SOCKET_R.chibi);
  });
});

describe('mặt bàn', () => {
  const objects = (it_json as unknown as { objects: ZoneObject[] }).objects;
  it('ghế hàng mép của desk_L3 thấy bàn cao 0,75 m phía trước; ngoài khối thì không', () => {
    setDeskSurfaces(deskSurfacesOf(objects));
    const d = objects.find((o) => o.id === 'desk_L3')!;
    expect(deskHeightAhead(d.position[0], d.position[2] + 0.6 + 0.55 + 0.06, Math.PI)).toBeCloseTo(d.size[1]);
    expect(deskHeightAhead(d.position[0], d.position[2] + 20, Math.PI)).toBeNull();
    setDeskSurfaces([]);
    expect(deskHeightAhead(d.position[0], d.position[2] + 1.2, Math.PI)).toBeNull();
  });
});

describe.each(['male_real', 'female_real', 'chibi'] as const)('grip cốc ở điểm với của app, rig %s', (name) => {
  it('socket bàn tay tới điểm cầm (< 3 cm), luôn với tới được, không NaN', async () => {
    const s = await loadRig(name);
    const h = new THREE.Group();
    h.scale.setScalar(name === 'female_real' ? 1.1 : name === 'chibi' ? 1.4 : 0.95);
    h.add(s);
    h.updateMatrixWorld(true);
    const ctrl = new LimbIKController(h);
    const hand = ctrl.chain('armR')!.bones.end;
    const fingers = new FingerGrip(hand);
    const shoulder = ctrl.limbRootPosition('armR', new THREE.Vector3())!.clone();
    const pt = cupReachPoint(shoulder, 0, ctrl.limbLength('armR'), new THREE.Vector3());
    let ok = false;
    for (let i = 0; i < 120; i++) {
      ok = gripAt(ctrl, fingers, 'R', pt, 'cup', HAND_SOCKET_R[name]);
      ctrl.update(1 / 60);
      fingers.update(1 / 60);
      h.updateMatrixWorld(true);
    }
    const sock = new THREE.Vector3(...HAND_SOCKET_R[name]).applyMatrix4(hand.matrixWorld);
    const d = sock.distanceTo(pt);
    console.log(`[${name}] với tới=${ok}, socket cách điểm cầm ${(d * 100).toFixed(2)} cm`);
    h.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    expect(ok).toBe(true);
    expect(d).toBeLessThan(0.03);
    expect(fingers.closed).toBeGreaterThan(0.9);
  });
});
