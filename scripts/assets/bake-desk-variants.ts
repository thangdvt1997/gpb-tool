/**
 * Bake 3 biến thể bàn làm việc (dev, design, ops) từ CHÍNH hình học procedural của cảnh (src/env/desk.tsx) thành GLB.
 * Chạy:  npx vite-node scripts/assets/bake-desk-variants.ts [--check]
 * Ra:    public/models/furn_desk_{dev,design,ops}.glb
 * Mỗi GLB: một mesh, một vật liệu, thuộc tính POSITION, NORMAL, TEXCOORD_0 (trỏ vào atlas src/env/deskAtlas.ts), COLOR_0.
 * Vật liệu trong GLB chỉ là giữ chỗ (màu theo đỉnh); cảnh gắn vật liệu atlas (texture canvas không nhúng được).
 * Gốc: tâm bàn trên sàn (y = 0), người ngồi và ghế ở +z. Xác định: cùng mã cho cùng byte. --check: so với tệp hiện có.
 * Sau khi đổi tệp: node scripts/assets/sync-baked-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { exportGlb } from './lib/node-gltf-polyfill.mjs';
import { bakeWorkstationGeometry, DESK_VARIANTS } from '../../src/env/desk';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
const check = process.argv.includes('--check');
let diff = 0;
for (const v of DESK_VARIANTS) {
  const scene = new THREE.Scene();
  scene.name = `furn.desk_${v}`;
  const mesh = new THREE.Mesh(
    bakeWorkstationGeometry(v),
    new THREE.MeshStandardMaterial({ name: 'furn.desk_atlas', vertexColors: true, roughness: 0.6, metalness: 0 }),
  );
  mesh.name = `furn.desk_${v}`;
  scene.add(mesh);
  const use = new THREE.Object3D();
  use.name = 'interact.use';
  use.position.set(0, 0.75, 0.35);
  scene.add(use);
  const out = await exportGlb(scene);
  const dst = path.join(models, `furn_desk_${v}.glb`);
  if (check) {
    const same = fs.existsSync(dst) && Buffer.compare(fs.readFileSync(dst), out) === 0;
    console.log(`${same ? 'GIỐNG' : 'KHÁC'} ${path.relative(root, dst)}`);
    if (!same) diff++;
  } else {
    fs.writeFileSync(dst, out);
    console.log(`${path.relative(root, dst)}: ${out.length} byte`);
  }
}
process.exit(diff ? 1 : 0);
