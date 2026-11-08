import { describe, expect, it } from 'vitest';
// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHAIR_OFFSET_Z, furniturePlacements, glbFurnitureEnabled, placementMatrix, sourcesFromScene } from './furnitureGlb';

function box(w: number, pos: [number, number, number], mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, w), mat);
  m.position.set(...pos);
  return m;
}

describe('sourcesFromScene', () => {
  it('gộp mesh cùng vật liệu thành một nguồn, khác vật liệu thành nguồn riêng', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    root.add(box(1, [0, 0, 0], a), box(1, [2, 0, 0], a), box(1, [0, 3, 0], b), new THREE.Object3D());
    const src = sourcesFromScene(root);
    expect(src).toHaveLength(2);
    const sa = src.find((s) => s.material === a)!;
    expect(sa.geometry.getAttribute('position').count).toBe(72);
  });
  it('áp ma trận thế giới vào đỉnh', () => {
    const a = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    root.position.set(10, 0, 0);
    root.add(box(2, [0, 5, 0], a));
    const g = sourcesFromScene(root)[0]!.geometry;
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(5);
  });
  it('GLB thật của dự án: mỗi tệp đúng một cặp geometry+vật liệu (một draw call)', async () => {
    for (const f of ['furn_desk', 'furn_chair']) {
      // @ts-ignore
      const buf = fs.readFileSync(`${process.cwd()}/public/models/${f}.glb`);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const gltf = await new GLTFLoader().parseAsync(ab as ArrayBuffer, '');
      expect(sourcesFromScene(gltf.scene)).toHaveLength(1);
    }
  });
});

describe('furniturePlacements', () => {
  it('ghế cách bàn 0,55 m về +z, xoay pi; chủ sở hữu giữ nguyên', () => {
    const p = furniturePlacements([{ owner: 'd1', x: 3, z: 4 }]);
    expect(p.desks[0]).toEqual({ pos: [3, 0, 4], yaw: 0, owner: 'd1' });
    expect(p.chairs[0]!.pos).toEqual([3, 0, 4 + CHAIR_OFFSET_Z]);
    const m = placementMatrix(p.chairs[0]!);
    const back = new THREE.Vector3(0, 0, -1).transformDirection(m);
    expect(back.z).toBeCloseTo(1);
  });
});

describe('glbFurnitureEnabled', () => {
  it('mặc định bật, chỉ ?glbFurniture=0 mới tắt', () => {
    expect(glbFurnitureEnabled('')).toBe(true);
    expect(glbFurnitureEnabled('?glbFurniture=1')).toBe(true);
    expect(glbFurnitureEnabled('?a=1&glbFurniture=0')).toBe(false);
  });
});
