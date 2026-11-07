#!/usr/bin/env node
/**
 * Dựng bàn, ghế và 3 phụ kiện bằng hình học procedural (hộp, trụ) từ kích thước của cảnh văn phòng, rồi xuất GLB.
 * Mỗi asset gộp thành MỘT mesh, MỘT vật liệu (màu theo đỉnh) để chỉ tốn 1 draw call khi đưa vào cảnh.
 *
 * Chạy:   node scripts/assets/bake-furniture.mjs [--check]
 * Ra:     public/models/{furn_desk,furn_chair,acc_headphones,acc_backpack,acc_mug}.glb
 * --check: không ghi, so byte với tệp hiện có (thoát 1 nếu khác).
 * Sau khi đổi tệp: node scripts/assets/sync-baked-manifest.mjs  (đo lại hash, bytes, bounds, tam giác vào manifest).
 *
 * Kích thước bàn khớp src/scene/Desks.tsx (DESK_W, DESK_D, TOP_Y, màn hình). Quy ước: mét, +Y lên, mặt trước +Z.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { exportGlb } from './lib/node-gltf-polyfill.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'public', 'models');

/** Hộp tâm (cx,cy,cz), kích thước (w,h,d), xoay quanh Y (rad), màu hex. */
function box(c, [w, h, d], color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(...c);
  return paint(g, color);
}

function cyl(c, r, h, color, seg = 14, rz = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (rz) g.rotateZ(rz);
  g.translate(...c);
  return paint(g, color);
}

function paint(g, hex) {
  const col = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = col.r;
    a[i * 3 + 1] = col.g;
    a[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

function build(name, parts, materialName, empties = []) {
  const scene = new THREE.Scene();
  scene.name = name;
  const mat = new THREE.MeshStandardMaterial({ name: materialName, vertexColors: true, roughness: 0.8, metalness: 0 });
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g), false), mat);
  mesh.name = name;
  scene.add(mesh);
  for (const [n, pos] of empties) {
    const o = new THREE.Object3D();
    o.name = n;
    o.position.set(...pos);
    scene.add(o);
  }
  return scene;
}

const WOOD = '#8a6e4b';
const DARK = '#2b2f38';
const SCREEN = '#1d2a44';

// Bàn: mặt 1.0 x 0.05 x 0.6 (mặt trên cao 0.75 m), 4 chân, màn hình 0.5 x 0.32 trên chân đế, như DeskField.
function desk() {
  const top = 0.725;
  const parts = [box([0, top, 0], [1.0, 0.05, 0.6], WOOD)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box([sx * 0.46, (top - 0.025) / 2, sz * 0.26], [0.05, top - 0.025, 0.05], DARK));
  parts.push(box([0, 0.935, -0.22], [0.5, 0.32, 0.03], SCREEN));
  parts.push(box([0, 0.80, -0.22], [0.06, 0.1, 0.03], DARK));
  parts.push(box([0, 0.755, -0.2], [0.2, 0.01, 0.12], DARK));
  return build('furn.desk_bench', parts, 'furn.baked', [['interact.use', [0, 0.75, 0.35]]]);
}

// Ghế xoay: gốc ở tâm chân sao trên sàn; đệm ngồi cao 0.48 m; lưng dựa phía -Z (nhân vật nhìn +Z).
function chair() {
  const parts = [
    cyl([0, 0.24, 0], 0.025, 0.4, DARK, 10),
    box([0, 0.45, 0], [0.45, 0.06, 0.45], '#3a4a6b'),
    box([0, 0.73, -0.21], [0.42, 0.42, 0.05], '#3a4a6b'),
    box([-0.22, 0.6, 0], [0.04, 0.02, 0.3], DARK),
    box([0.22, 0.6, 0], [0.04, 0.02, 0.3], DARK),
    cyl([0, 0.02, 0], 0.04, 0.04, DARK, 10),
  ];
  for (let i = 0; i < 5; i++) {
    const ang = (i * 2 * Math.PI) / 5;
    parts.push(box([Math.sin(ang) * 0.14, 0.02, Math.cos(ang) * 0.14], [0.04, 0.04, 0.3], DARK, ang));
  }
  return build('furn.chair_swivel', parts, 'furn.baked', [['interact.sit', [0, 0.48, 0]]]);
}

// Tai nghe: gốc ở đỉnh đầu (socket head), vòng đệm trên đầu rộng 0.17 m, hai ốp tai.
function headphones() {
  const band = new THREE.TorusGeometry(0.095, 0.007, 6, 18, Math.PI);
  band.translate(0, -0.095, 0);
  const parts = [paint(band, DARK)];
  for (const s of [-1, 1]) parts.push(cyl([s * 0.098, -0.09, 0], 0.035, 0.03, '#c0392b', 12, Math.PI / 2));
  return build('acc.headphones', parts, 'acc.baked');
}

// Ba lô: gốc ở giữa lưng (socket back), thân phình ra sau (-Z).
function backpack() {
  const parts = [
    box([0, -0.06, -0.09], [0.28, 0.38, 0.14], '#556b2f'),
    box([0, -0.16, -0.17], [0.2, 0.14, 0.04], '#3f5121'),
    box([-0.1, 0.0, -0.02], [0.04, 0.3, 0.02], DARK),
    box([0.1, 0.0, -0.02], [0.04, 0.3, 0.02], DARK),
  ];
  return build('acc.backpack', parts, 'acc.baked');
}

// Cốc: gốc ở lòng bàn tay (socket hand_r), cốc đặt đứng, quai hướng +X.
function mug() {
  const parts = [cyl([0, 0.045, 0], 0.04, 0.09, '#f2efe6', 14), cyl([0, 0.0875, 0], 0.034, 0.005, '#4b2e1a', 14)];
  const handle = new THREE.TorusGeometry(0.025, 0.006, 6, 10, Math.PI);
  handle.rotateZ(-Math.PI / 2);
  handle.translate(0.04, 0.045, 0);
  parts.push(paint(handle, '#f2efe6'));
  return build('acc.mug', parts, 'acc.baked');
}

export const FILES = {
  'furn_desk.glb': desk,
  'furn_chair.glb': chair,
  'acc_headphones.glb': headphones,
  'acc_backpack.glb': backpack,
  'acc_mug.glb': mug,
};

async function main() {
  const check = process.argv.includes('--check');
  let diff = 0;
  for (const [file, make] of Object.entries(FILES)) {
    const out = await exportGlb(make());
    const dst = path.join(outDir, file);
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
