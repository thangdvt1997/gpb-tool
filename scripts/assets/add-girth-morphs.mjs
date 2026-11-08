#!/usr/bin/env node
/**
 * Thêm hai morph target đối xứng vào mesh thân của 3 GLB nhân vật MPFB (không thêm phụ thuộc, sửa thẳng nhị phân GLB
 * như rebase-pivot.mjs):
 *   gpb_upperarm_girth  độ đầy bắp tay (cả hai tay)
 *   gpb_thigh_girth     độ đầy đùi (cả hai chân)
 *
 *   node scripts/assets/add-girth-morphs.mjs [--check] [file.glb ...]   (mặc định: male_real, female_real, chibi)
 *
 * Cách tính (tư thế nghỉ):
 *   - trọng số = tổng skin weight của xương upperarm_[lr] (hoặc thigh_[lr]) tại đỉnh, làm mượt bằng smoothstep;
 *   - nhân với đường bao dọc đoạn xương env(t) = sin(pi t)^0.6, t = hình chiếu lên trục xương (từ khớp đầu tới khớp
 *     cuối, 0..1), nên delta về 0 ở vai/háng và khuỷu/gối: không gãy ở khớp, không đụng thân và cẳng tay;
 *   - hướng dịch = pháp tuyến đỉnh chiếu vuông góc trục xương (chỉ nở ngang chi, không kéo dài); đùi trong giảm 50%
 *     để hai đùi không cắt nhau;
 *   - biên độ tỉ lệ chiều cao mesh (tay 0,012 m, đùi 0,02 m ở mesh cao 1,8 m). Influence âm làm chi gầy đi.
 * Morph lưu dạng sparse (chỉ đỉnh có delta), thêm vào cuối bin, tên ghi vào mesh.extras.targetNames, mesh.weights.
 * Chạy lại là no-op (đã có morph). Sau khi đổi: node scripts/assets/sync-baked-manifest.mjs rồi validate-manifest.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
export const CHAR_FILES = ['male_real.glb', 'female_real.glb', 'chibi.glb'];
export const GIRTH_MORPHS = ['gpb_upperarm_girth', 'gpb_thigh_girth'];

const GROUPS = [
  { name: 'gpb_upperarm_girth', bones: ['upperarm_l', 'upperarm_r'], next: ['lowerarm_l', 'lowerarm_r'], amp: 0.012, inward: 1 },
  { name: 'gpb_thigh_girth', bones: ['thigh_l', 'thigh_r'], next: ['calf_l', 'calf_r'], amp: 0.02, inward: 0.5 },
];

function parse(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('không phải GLB');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const binOff = 20 + jl;
  const binLen = buf.readUInt32LE(binOff);
  return { json, bin: Buffer.from(buf.subarray(binOff + 8, binOff + 8 + binLen)) };
}

function build(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
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
function worldPositions(json) {
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
  return (name) => {
    const i = json.nodes.findIndex((n) => n.name === name);
    if (i < 0) throw new Error(`thiếu xương ${name}`);
    const w = world(i);
    return [w[12], w[13], w[14]];
  };
}

function view(json, bin, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
  return { a, comps, stride: bv.byteStride ?? comps * size, base: (bv.byteOffset ?? 0) + (a.byteOffset ?? 0) };
}
const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Trả { buffer, added: số đỉnh mỗi morph } ; buffer giữ nguyên nếu đã có morph. */
export function addGirthMorphs(input) {
  const { json, bin } = parse(input);
  const mesh = json.meshes.find((m) => m.primitives[0]?.targets && (m.extras?.targetNames ?? []).includes('bodyBelly'));
  if (!mesh) throw new Error('không thấy mesh thân có morph');
  const names = mesh.extras.targetNames;
  if (GIRTH_MORPHS.every((n) => names.includes(n))) return { buffer: input, added: [] };
  if (GIRTH_MORPHS.some((n) => names.includes(n))) throw new Error('chỉ có một phần morph gpb_*, không xử lý');
  const prim = mesh.primitives[0];
  const skin = json.skins[0];
  const jointName = skin.joints.map((j) => json.nodes[j].name);
  const P = view(json, bin, prim.attributes.POSITION);
  const N = view(json, bin, prim.attributes.NORMAL);
  const J = view(json, bin, prim.attributes.JOINTS_0);
  const W = view(json, bin, prim.attributes.WEIGHTS_0);
  const count = P.a.count;
  if (count > 65535) throw new Error('quá 65535 đỉnh, cần chỉ số 32 bit');
  const nativeH = P.a.max[1] - P.a.min[1];
  const pos = worldPositions(json);
  const readJ = J.a.componentType === 5121 ? (o) => bin.readUInt8(o) : (o) => bin.readUInt16LE(o);
  const jsz = J.a.componentType === 5121 ? 1 : 2;
  const added = [];
  let off = bin.length + ((4 - (bin.length % 4)) % 4);
  const out = [Buffer.alloc(off - bin.length)];
  const push = (b) => {
    const pad = Buffer.alloc((4 - (b.length % 4)) % 4);
    const start = off;
    out.push(b, pad);
    off += b.length + pad.length;
    return start;
  };

  for (const g of GROUPS) {
    const sides = g.bones.map((b, k) => {
      const a = pos(b), c = pos(g.next[k]);
      const ax = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const len = Math.hypot(...ax);
      return { ji: jointName.indexOf(b), a, ax: ax.map((v) => v / len), len, sign: Math.sign(a[0]) || 1 };
    });
    if (sides.some((s) => s.ji < 0)) throw new Error('thiếu xương trong skin');
    const idxs = [];
    const vals = [];
    for (let v = 0; v < count; v++) {
      let best = null;
      for (let k = 0; k < 4; k++) {
        const jo = readJ(J.base + v * J.stride + k * jsz);
        const w = bin.readFloatLE(W.base + v * W.stride + k * 4);
        const side = sides.find((s) => s.ji === jo);
        if (side && w > 0.01) best = { side, w: (best?.side === side ? best.w : 0) + w };
      }
      if (!best) continue;
      const p = [0, 1, 2].map((i) => bin.readFloatLE(P.base + v * P.stride + i * 4));
      const n = [0, 1, 2].map((i) => bin.readFloatLE(N.base + v * N.stride + i * 4));
      const { side } = best;
      const t = ((p[0] - side.a[0]) * side.ax[0] + (p[1] - side.a[1]) * side.ax[1] + (p[2] - side.a[2]) * side.ax[2]) / side.len;
      if (t <= 0 || t >= 1) continue;
      const env = Math.pow(Math.sin(Math.PI * t), 0.6);
      const dot = n[0] * side.ax[0] + n[1] * side.ax[1] + n[2] * side.ax[2];
      const np = [n[0] - dot * side.ax[0], n[1] - dot * side.ax[1], n[2] - dot * side.ax[2]];
      const nl = Math.hypot(...np);
      if (nl < 0.2) continue;
      const inward = np[0] * side.sign < 0 ? g.inward : 1;
      const mag = g.amp * (nativeH / 1.8) * smoothstep(best.w) * env * inward;
      if (mag < 1e-5) continue;
      idxs.push(v);
      vals.push(np[0] / nl * mag, np[1] / nl * mag, np[2] / nl * mag);
    }
    const ib = Buffer.alloc(idxs.length * 2);
    idxs.forEach((v, i) => ib.writeUInt16LE(v, i * 2));
    const vb = Buffer.alloc(vals.length * 4);
    vals.forEach((x, i) => vb.writeFloatLE(x, i * 4));
    const ibv = json.bufferViews.push({ buffer: 0, byteOffset: push(ib), byteLength: ib.length }) - 1;
    const vbv = json.bufferViews.push({ buffer: 0, byteOffset: push(vb), byteLength: vb.length }) - 1;
    const acc = json.accessors.push({
      componentType: 5126, count, type: 'VEC3',
      sparse: { count: idxs.length, indices: { bufferView: ibv, componentType: 5123 }, values: { bufferView: vbv } },
    }) - 1;
    prim.targets.push({ POSITION: acc });
    names.push(g.name);
    if (mesh.weights) mesh.weights.push(0);
    added.push(idxs.length);
  }
  const newBin = Buffer.concat([bin, ...out]);
  json.buffers[0].byteLength = newBin.length;
  return { buffer: build(json, newBin), added };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter((a) => !a.startsWith('--'));
  const targets = files.length ? files : CHAR_FILES.map((f) => path.join(models, f));
  let bad = 0;
  for (const f of targets) {
    const src = fs.readFileSync(f);
    const { buffer, added } = addGirthMorphs(src);
    const rel = path.relative(root, f);
    if (!added.length) console.log(`${rel}: đã có morph ${GIRTH_MORPHS.join(', ')}`);
    else {
      console.log(`${rel}: +${GIRTH_MORPHS.join(', ')} (đỉnh ${added.join(', ')}); cỡ tệp ${src.length} -> ${buffer.length} byte (+${buffer.length - src.length})`);
      if (check) bad++;
      else fs.writeFileSync(f, buffer);
    }
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
