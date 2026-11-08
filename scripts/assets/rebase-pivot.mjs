#!/usr/bin/env node
/**
 * Đưa origin của GLB nhân vật MPFB xuống mặt sàn, giữa hai bàn chân (bỏ pivot.offset).
 *
 *   node scripts/assets/rebase-pivot.mjs [--check] [file.glb ...]     (mặc định: male_real, female_real, chibi)
 *
 * Phép dịch d = (cx, minY, cz): minY = đáy thấp nhất của mọi POSITION; cx, cz = trung bình x, z của foot_l, foot_r,
 * ball_l, ball_r ở tư thế nghỉ. Áp d như phép tịnh tiến thật vào dữ liệu, không thêm node:
 *   - POSITION của mọi mesh: p - d (morph target là delta nên giữ nguyên); cập nhật min/max accessor.
 *   - inverseBindMatrices: IBM' = IBM · T(d) (vì xương bind dịch -d).
 *   - xương gốc (node cha của khớp không có cha trong skin): translation - d (cha của nó là identity).
 * Skin, trọng số, morph, tên và thứ tự xương giữ nguyên. Chạy lại là no-op (đã ở sàn thì d ≈ 0).
 * Sau khi đổi: npx vite-node scripts/assets/bake-clips.ts (clip Root dựa trên rest mới), rồi
 * node scripts/assets/sync-char-manifest.mjs (hash, bytes, bounds, bỏ pivot.offset).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
export const CHAR_FILES = ['male_real.glb', 'female_real.glb', 'chibi.glb'];
const EPS = 1e-6;
const FEET = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];

function parse(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('không phải GLB');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const binOff = 20 + jl;
  const binLen = buf.readUInt32LE(binOff);
  const bin = Buffer.from(buf.subarray(binOff + 8, binOff + 8 + binLen));
  return { json, bin };
}

function build(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (js.length % 4)) % 4;
  js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const h = Buffer.alloc(20);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(total, 8);
  h.writeUInt32LE(js.length, 12);
  h.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, js, bh, bin]);
}

/** Ma trận cột-chính 4x4 từ node (TRS hoặc matrix). */
function localMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function worldMatrices(json) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const cache = new Map();
  const world = (i) => {
    if (cache.has(i)) return cache.get(i);
    const l = localMatrix(json.nodes[i]);
    const w = parent.has(i) ? mul(world(parent.get(i)), l) : l;
    cache.set(i, w);
    return w;
  };
  return { world, parent };
}

function accessorView(json, bin, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const stride = bv.byteStride ?? comps * 4;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return { a, comps, stride, base };
}

/**
 * Tính d và (nếu apply) trả về GLB mới. Trả { buffer, offset:[cx,minY,cz] }.
 * Khi |d| < EPS thì buffer giữ nguyên (no-op).
 */
export function rebasePivot(input) {
  const { json, bin } = parse(input);
  const skin = json.skins?.[0];
  if (!skin) throw new Error('GLB không có skin');
  // Đáy thấp nhất của mọi POSITION.
  const posAcc = [];
  let minY = Infinity;
  for (const m of json.meshes) for (const p of m.primitives) {
    const idx = p.attributes.POSITION;
    if (posAcc.includes(idx)) continue;
    posAcc.push(idx);
    minY = Math.min(minY, json.accessors[idx].min[1]);
  }
  const { world } = worldMatrices(json);
  const byName = new Map(json.nodes.map((n, i) => [n.name, i]));
  let cx = 0, cz = 0;
  for (const f of FEET) {
    if (!byName.has(f)) throw new Error(`thiếu xương ${f}`);
    const w = world(byName.get(f));
    cx += w[12] / FEET.length;
    cz += w[14] / FEET.length;
  }
  const d = [cx, minY, cz];
  if (Math.hypot(...d) < EPS) return { buffer: input, offset: [0, 0, 0] };

  for (const idx of posAcc) {
    const { a, stride, base } = accessorView(json, bin, idx);
    for (let i = 0; i < a.count; i++) {
      const o = base + i * stride;
      for (let k = 0; k < 3; k++) bin.writeFloatLE(bin.readFloatLE(o + k * 4) - d[k], o + k * 4);
    }
    a.min = a.min.map((v, k) => v - d[k]);
    a.max = a.max.map((v, k) => v - d[k]);
  }
  // IBM' = IBM · T(d), cột-chính: cột 3 mới = IBM · (d, 1).
  const { a: ia, stride: is, base: ib } = accessorView(json, bin, skin.inverseBindMatrices);
  for (let j = 0; j < ia.count; j++) {
    const o = ib + j * is;
    const m = [];
    for (let k = 0; k < 16; k++) m.push(bin.readFloatLE(o + k * 4));
    for (let r = 0; r < 4; r++) bin.writeFloatLE(m[12 + r] + m[r] * d[0] + m[4 + r] * d[1] + m[8 + r] * d[2], o + (12 + r) * 4);
  }
  // Xương gốc: khớp skin mà cha không nằm trong skin.
  const joints = new Set(skin.joints);
  const parentOf = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
  for (const j of skin.joints) {
    if (joints.has(parentOf.get(j))) continue;
    const pw = parentOf.has(j) ? world(parentOf.get(j)) : null;
    if (pw && (pw[12] || pw[13] || pw[14] || pw[0] !== 1 || pw[5] !== 1 || pw[10] !== 1)) {
      throw new Error('cha của xương gốc không phải identity, chưa hỗ trợ');
    }
    const n = json.nodes[j];
    n.translation = (n.translation ?? [0, 0, 0]).map((v, k) => v - d[k]);
  }
  return { buffer: build(json, bin), offset: d };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter((a) => !a.startsWith('--'));
  const targets = files.length ? files : CHAR_FILES.map((f) => path.join(models, f));
  let bad = 0;
  for (const f of targets) {
    const src = fs.readFileSync(f);
    const { buffer, offset } = rebasePivot(src);
    const moved = Math.hypot(...offset) >= EPS;
    console.log(`${path.relative(root, f)}: ${moved ? `d = [${offset.map((v) => v.toFixed(4)).join(', ')}] m` : 'đã ở mặt sàn'}`);
    if (check) {
      if (moved) bad++;
    } else if (moved) fs.writeFileSync(f, buffer);
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
