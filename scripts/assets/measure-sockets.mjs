#!/usr/bin/env node
/**
 * Đo offset socket (tay phải/trái, đầu, lưng) từ xương và đỉnh mesh thật của GLB MPFB, tư thế nghỉ.
 * Offset tính trong KHÔNG GIAN CỤC BỘ của xương gắn socket (đơn vị m), khớp trường sockets[].offset của manifest.
 *
 *   hand_l / hand_r : giữa xương hand và xương middle_01 cùng bên (tâm lòng bàn tay).
 *   head            : đỉnh sọ = y lớn nhất của đỉnh mesh trong vùng |x|<0.12 phía trên xương head; x, z theo xương head.
 *   back            : mặt lưng = z nhỏ nhất của đỉnh mesh quanh cao độ spine_03 (|dy|<0.04, |x|<0.1); x, y theo xương spine_03.
 *   neck            : giữa thân cổ = trung điểm xương neck_01 và head (vòng cổ, khăn, cà vạt).
 *   foot_l / foot_r : đế chân = giữa xương foot và ball theo x, z; y = đỉnh mesh thấp nhất quanh điểm đó (phụ kiện bàn chân, hiệu ứng bước).
 * rotationDeg (Euler XYZ, độ, cục bộ theo xương) là phép xoay đưa khung socket về trùng trục mô hình ở tư thế nghỉ
 * (+Y lên, +Z phía trước): R_cục_bộ = nghịch đảo xoay thế giới của xương. Nhờ vậy phụ kiện dựng thẳng/quay mặt trước khi tay ở tư thế nghỉ.
 *
 *   node scripts/assets/measure-sockets.mjs public/models/male_real.glb [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const bin = buf.subarray(binStart + 8, binStart + 8 + buf.readUInt32LE(binStart));
  return { json, bin };
}

const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; // cột-chính (column-major)
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const s = n.scale ?? [1, 1, 1];
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
/** Nghịch đảo của biến đổi affine (đủ cho TRS có scale đều/không đều). */
function invAffine(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [
    (e * i - f * h) / det, (f * g - d * i) / det, (d * h - e * g) / det, 0,
    (c * h - b * i) / det, (a * i - c * g) / det, (b * g - a * h) / det, 0,
    (b * f - c * e) / det, (c * d - a * f) / det, (a * e - b * d) / det, 0,
    0, 0, 0, 1,
  ];
  const tx = m[12], ty = m[13], tz = m[14];
  r[12] = -(r[0] * tx + r[4] * ty + r[8] * tz);
  r[13] = -(r[1] * tx + r[5] * ty + r[9] * tz);
  r[14] = -(r[2] * tx + r[6] * ty + r[10] * tz);
  return r;
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const round = (v) => v.map((x) => Math.round(x * 10000) / 10000 + 0);
const roundDeg = (v) => v.map((x) => Math.round(x * 100) / 100 + 0);
/** Euler XYZ (độ) của nghịch đảo phần xoay trong ma trận thế giới của xương (chuẩn hóa bỏ scale), cùng quy ước three.js Euler 'XYZ'. */
export function inverseRotationDeg(m) {
  const cols = [0, 4, 8].map((o) => {
    const l = Math.hypot(m[o], m[o + 1], m[o + 2]) || 1;
    return [m[o] / l, m[o + 1] / l, m[o + 2] / l];
  });
  // Nghịch đảo của ma trận xoay = chuyển vị: hàng r của R^T là cột r của R.
  const t = [...cols[0], ...cols[1], ...cols[2]]; // hàng-chính
  const [m11, m12, m13, , , m23, , , m33] = t;
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  let x, z;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m23, m33);
    z = Math.atan2(-m12, m11);
  } else {
    x = Math.atan2(t[7], t[4]);
    z = 0;
  }
  return roundDeg([x, y, z].map((r) => (r * 180) / Math.PI));
}

export function measureSockets(file) {
  const { json: j, bin } = parseGlb(file);
  const nodes = j.nodes;
  const parent = new Map();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const worldCache = new Map();
  const world = (i) => {
    if (worldCache.has(i)) return worldCache.get(i);
    const local = trs(nodes[i]);
    const w = parent.has(i) ? mul(world(parent.get(i)), local) : local;
    worldCache.set(i, w);
    return w;
  };
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const bone = (name) => {
    if (!byName.has(name)) throw new Error(`Thiếu xương ${name} trong ${file}`);
    return byName.get(name);
  };
  const pos = (name) => apply(world(bone(name)), [0, 0, 0]);

  // Đỉnh mesh (tư thế nghỉ, mesh skin nên không áp transform node mesh)
  const verts = [];
  for (const m of j.meshes) {
    for (const pr of m.primitives) {
      const acc = j.accessors[pr.attributes.POSITION];
      const bv = j.bufferViews[acc.bufferView];
      const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const stride = bv.byteStride ?? 12;
      for (let k = 0; k < acc.count; k++) {
        const o = off + k * stride;
        verts.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
      }
    }
  }
  const toLocal = (boneName, p) => round(apply(invAffine(world(bone(boneName))), p));

  const out = {};
  for (const side of ['l', 'r']) {
    const h = pos(`hand_${side}`);
    const mid = pos(`middle_01_${side}`);
    out[`hand_${side}`] = { bone: `hand_${side}`, offset: toLocal(`hand_${side}`, [(h[0] + mid[0]) / 2, (h[1] + mid[1]) / 2, (h[2] + mid[2]) / 2]) };
  }
  const hp = pos('head');
  let topY = -Infinity;
  for (const v of verts) if (v[1] > hp[1] && Math.abs(v[0]) < 0.12) topY = Math.max(topY, v[1]);
  out.head = { bone: 'head', offset: toLocal('head', [hp[0], topY, hp[2]]) };
  const sp = pos('spine_03');
  let backZ = Infinity;
  for (const v of verts) if (Math.abs(v[1] - sp[1]) < 0.04 && Math.abs(v[0]) < 0.1) backZ = Math.min(backZ, v[2]);
  out.back = { bone: 'spine_03', offset: toLocal('spine_03', [sp[0], sp[1], backZ]) };
  const np = pos('neck_01');
  out.neck = { bone: 'neck_01', offset: toLocal('neck_01', [(np[0] + hp[0]) / 2, (np[1] + hp[1]) / 2, (np[2] + hp[2]) / 2]) };
  for (const side of ['l', 'r']) {
    const f = pos(`foot_${side}`);
    const b = pos(`ball_${side}`);
    const cx = (f[0] + b[0]) / 2;
    const cz = (f[2] + b[2]) / 2;
    let soleY = Infinity;
    for (const v of verts) if (Math.abs(v[0] - cx) < 0.04 && Math.abs(v[2] - cz) < 0.08 && v[1] < f[1] + 0.02) soleY = Math.min(soleY, v[1]);
    out[`foot_${side}`] = { bone: `foot_${side}`, offset: toLocal(`foot_${side}`, [cx, soleY, cz]) };
  }
  for (const v of Object.values(out)) v.rotationDeg = inverseRotationDeg(world(bone(v.bone)));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = process.argv[2];
  if (!f) { console.error('Thiếu đường dẫn GLB.'); process.exit(2); }
  console.log(JSON.stringify(measureSockets(f), null, 2));
}
