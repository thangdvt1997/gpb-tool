/**
 * Đọc UV + trọng số xương từ GLB (chỉ JSON chunk + BIN chunk, thuần, chạy được trong node và trình duyệt)
 * để suy ra vùng da trên UV: mỗi đỉnh gán vùng theo xương có trọng số lớn nhất (và hướng pháp tuyến
 * cho ngực/lưng), sau đó dựng hộp UV và lưới bit từ tam giác (chỉ tam giác mà cả 3 đỉnh cùng vùng).
 */
import { MASK_RES, type RegionMask, type Side, type SkinRegion } from './regions';

interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface Gltf {
  accessors: Accessor[];
  bufferViews: BufferView[];
  meshes: { name?: string; primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  nodes: { name?: string }[];
  skins?: { joints: number[] }[];
}

export interface ParsedGlb { gltf: Gltf; bin: DataView }

export function parseGlb(buf: ArrayBuffer): ParsedGlb {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('Không phải GLB');
  let off = 12;
  let gltf: Gltf | null = null;
  let bin: DataView | null = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > buf.byteLength) throw new Error('GLB bị cắt cụt');
    if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len))) as Gltf;
    else if (type === 0x004e4942 && !bin) bin = new DataView(buf, start, len);
    off = start + ((len + 3) & ~3);
  }
  if (!gltf || !bin) throw new Error('GLB thiếu JSON hoặc BIN');
  return { gltf, bin };
}

function readAccessor(p: ParsedGlb, idx: number): { data: number[][]; } {
  const a = p.gltf.accessors[idx];
  const bv = p.gltf.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  if (!comps) throw new Error('Kiểu accessor không hỗ trợ: ' + a.type);
  const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 || a.componentType === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? size * comps;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const data: number[][] = [];
  for (let i = 0; i < a.count; i++) {
    const row: number[] = [];
    for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * size;
      let v: number;
      switch (a.componentType) {
        case 5126: v = p.bin.getFloat32(o, true); break;
        case 5125: v = p.bin.getUint32(o, true); break;
        case 5123: v = p.bin.getUint16(o, true); if (a.normalized) v /= 65535; break;
        case 5122: v = p.bin.getInt16(o, true); break;
        case 5121: v = p.bin.getUint8(o); if (a.normalized) v /= 255; break;
        case 5120: v = p.bin.getInt8(o); break;
        default: throw new Error('componentType không hỗ trợ');
      }
      row.push(v);
    }
    data.push(row);
  }
  return { data };
}

/** Tên xương (đã bỏ hậu tố _l/_r) sang vùng da. Ngực/lưng cần thêm hướng pháp tuyến. */
export function boneRegion(bone: string, normalZ: number): { region: SkinRegion; side: Side | null } | null {
  const m = /^(.*?)(?:_([lr]))?$/.exec(bone.toLowerCase());
  if (!m) return null;
  const name = m[1];
  const side: Side | null = m[2] === 'l' ? 'left' : m[2] === 'r' ? 'right' : null;
  const torsoSide = normalZ >= 0 ? 'front' : 'back';
  if (name === 'head') return { region: 'face', side: null };
  if (name === 'neck_01' || name === 'neck') return { region: 'neck', side: null };
  if (name === 'spine_03' || name === 'spine_02' || name === 'clavicle') {
    if (name === 'clavicle') return { region: 'upperArm', side };
    return { region: torsoSide === 'front' ? 'chest' : 'back', side: null };
  }
  if (name === 'spine_01') return { region: torsoSide === 'front' ? 'abdomen' : 'back', side: null };
  if (name === 'upperarm') return { region: 'upperArm', side };
  if (name === 'lowerarm') return { region: 'forearm', side };
  if (name === 'hand' || /^(index|middle|pinky|ring|thumb)_\d+$/.test(name)) return { region: 'hand', side };
  if (name === 'thigh') return { region: 'thigh', side };
  if (name === 'calf') return { region: 'calf', side };
  if (name === 'foot' || name === 'ball') return { region: 'foot', side };
  return null;
}

/**
 * Suy ra RegionMask cho từng (vùng, bên) từ mesh `meshName` (mặc định 'base').
 * Pháp tuyến +Z = phía trước (manifest: forward +Z). Ném lỗi nếu thiếu UV/skin.
 */
export function buildRegionMasks(buf: ArrayBuffer, meshName = 'base'): RegionMask[] {
  const p = parseGlb(buf);
  const mesh = p.gltf.meshes.find((m) => m.name === meshName);
  const prim = mesh?.primitives[0];
  if (!prim) throw new Error(`Không có mesh ${meshName}`);
  const at = prim.attributes;
  if (at.TEXCOORD_0 === undefined || at.JOINTS_0 === undefined || at.WEIGHTS_0 === undefined || at.NORMAL === undefined) {
    throw new Error('Mesh thiếu TEXCOORD_0/JOINTS_0/WEIGHTS_0/NORMAL');
  }
  const skin = p.gltf.skins?.[0];
  if (!skin) throw new Error('Không có skin');
  const jointName = skin.joints.map((n) => p.gltf.nodes[n]?.name ?? '');
  const uv = readAccessor(p, at.TEXCOORD_0).data;
  const jn = readAccessor(p, at.JOINTS_0).data;
  const wt = readAccessor(p, at.WEIGHTS_0).data;
  const nr = readAccessor(p, at.NORMAL).data;
  const n = uv.length;
  const label: (string | null)[] = new Array(n).fill(null);
  const info = new Map<string, { region: SkinRegion; side: Side | null }>();
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (wt[i][k] > wt[i][best]) best = k;
    if (wt[i][best] < 0.3) continue;
    const r = boneRegion(jointName[jn[i][best]] ?? '', nr[i][2]);
    if (!r) continue;
    const key = r.side ? `${r.region}.${r.side}` : r.region;
    label[i] = key;
    info.set(key, r);
  }
  const idx: number[] = prim.indices !== undefined ? readAccessor(p, prim.indices).data.map((r) => r[0]) : Array.from({ length: n }, (_, i) => i);
  const grids = new Map<string, Uint8Array>();
  const boxes = new Map<string, { u0: number; v0: number; u1: number; v1: number }>();
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const key = label[a];
    if (!key || key !== label[b] || key !== label[c]) continue;
    let g = grids.get(key);
    if (!g) { g = new Uint8Array(MASK_RES * MASK_RES); grids.set(key, g); }
    const pts = [a, b, c].map((i) => [clamp01(uv[i][0]), clamp01(uv[i][1])]);
    const bx = boxes.get(key) ?? { u0: 1, v0: 1, u1: 0, v1: 0 };
    for (const [u, v] of pts) { bx.u0 = Math.min(bx.u0, u); bx.v0 = Math.min(bx.v0, v); bx.u1 = Math.max(bx.u1, u); bx.v1 = Math.max(bx.v1, v); }
    boxes.set(key, bx);
    fillTriangle(g, pts);
  }
  const out: RegionMask[] = [];
  for (const [key, grid] of grids) {
    const r = info.get(key)!;
    out.push({ region: r.region, side: r.side, box: boxes.get(key)!, grid });
  }
  return out;
}

/** Tô các ô lưới mà tam giác chạm (xấp xỉ bảo thủ: lấy mẫu mịn trong tam giác + đỉnh). */
function fillTriangle(g: Uint8Array, p: number[][]): void {
  const minX = Math.min(p[0][0], p[1][0], p[2][0]);
  const maxX = Math.max(p[0][0], p[1][0], p[2][0]);
  const minY = Math.min(p[0][1], p[1][1], p[2][1]);
  const maxY = Math.max(p[0][1], p[1][1], p[2][1]);
  const x0 = Math.floor(minX * MASK_RES), x1 = Math.min(MASK_RES - 1, Math.floor(maxX * MASK_RES));
  const y0 = Math.floor(minY * MASK_RES), y1 = Math.min(MASK_RES - 1, Math.floor(maxY * MASK_RES));
  const e = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const area = e(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1]);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (g[y * MASK_RES + x]) continue;
      // Ô được tô nếu tâm ô nằm trong tam giác, hoặc tam giác nhỏ hơn ô (đỉnh nằm trong ô).
      const cx = (x + 0.5) / MASK_RES, cy = (y + 0.5) / MASK_RES;
      let inside = false;
      if (Math.abs(area) > 1e-12) {
        const w0 = e(p[1][0], p[1][1], p[2][0], p[2][1], cx, cy) / area;
        const w1 = e(p[2][0], p[2][1], p[0][0], p[0][1], cx, cy) / area;
        const w2 = 1 - w0 - w1;
        inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
      }
      if (!inside) {
        for (const q of p) if (Math.floor(q[0] * MASK_RES) === x && Math.floor(q[1] * MASK_RES) === y) { inside = true; break; }
      }
      if (inside) g[y * MASK_RES + x] = 1;
    }
  }
}
