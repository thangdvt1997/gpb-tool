import { describe, expect, it } from 'vitest';
// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakeWorkstationGeometry, BAKED_DESK_HEIGHT, DESK_VARIANTS } from './desk';
import { DESK_GLB_URLS, deskGlbEnabled, geometryFromScene } from './deskGlb';

async function loadFile(url: string): Promise<THREE.Group> {
  const buf = fs.readFileSync(`public${url}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  return gltf.scene;
}

describe('bàn GLB bake từ hình học procedural', () => {
  it('cờ ?glbDesks=0 tắt, mặc định bật', () => {
    expect(deskGlbEnabled('')).toBe(true);
    expect(deskGlbEnabled('?perf=1&glbDesks=0')).toBe(false);
    expect(deskGlbEnabled('?glbDesks=1')).toBe(true);
  });

  for (const v of DESK_VARIANTS) {
    it(`${v}: GLB khớp bakeWorkstationGeometry, đủ position/normal/uv/color, đứng trên sàn`, async () => {
      const g = geometryFromScene(await loadFile(DESK_GLB_URLS[v]));
      expect(g).not.toBeNull();
      const ref = bakeWorkstationGeometry(v);
      expect(g!.getAttribute('position').count).toBe(ref.toNonIndexed().getAttribute('position').count);
      for (const a of ['position', 'normal', 'uv', 'color']) expect(g!.getAttribute(a)).toBeDefined();
      g!.computeBoundingBox();
      const bb = g!.boundingBox!;
      expect(Math.abs(bb.min.y)).toBeLessThan(0.01);
      expect(bb.max.y).toBeGreaterThan(BAKED_DESK_HEIGHT);
      // Ghế ở +z, màn hình ở -z, bàn rộng khoảng 1.2 m.
      expect(bb.max.z).toBeGreaterThan(0.4);
      expect(bb.min.z).toBeLessThan(-0.2);
      expect(bb.max.x - bb.min.x).toBeLessThan(1.6);
      // Mọi UV nằm trong atlas.
      const uv = g!.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(i)).toBeLessThanOrEqual(1);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(i)).toBeLessThanOrEqual(1);
      }
    });
  }

  it('manifest có 3 biến thể bàn, license dự án, hash khớp file', async () => {
    // @ts-ignore tsconfig không có kiểu node.
    const crypto = await import('node:crypto');
    const m = JSON.parse(fs.readFileSync('public/models/manifest.json', 'utf8'));
    for (const v of DESK_VARIANTS) {
      const a = m.assets.find((x: { assetId: string }) => x.assetId === `furn.desk_workstation_${v}`);
      expect(a).toBeDefined();
      expect(a.license.spdx).toBe('LicenseRef-GPB-project');
      expect(a.pivot.offset).toEqual([0, 0, 0]);
      const buf = fs.readFileSync(`public/models/${a.url}`);
      expect(a.bytes).toBe(buf.length);
      expect(a.hash.value).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
    }
  });
});
