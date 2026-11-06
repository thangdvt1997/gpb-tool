/**
 * Thống kê GLB thuần (không cần WebGL): đọc JSON chunk của glTF 2.0 và tính số mesh, tam giác,
 * xương, morph target, vật liệu, texture. Dùng được trong Node (test) và trình duyệt.
 */

export interface GlbStats {
  meshes: number;
  primitives: number;
  triangles: number;
  vertices: number;
  skins: number;
  bones: number;
  morphTargets: number;
  materials: number;
  textures: number;
  animations: number;
  /** Hộp bao theo accessor POSITION (không áp transform node). null nếu không có min/max. */
  boundsMin: [number, number, number] | null;
  boundsMax: [number, number, number] | null;
  /** URI ngoài (không phải data:) mà tệp tham chiếu; loader không nên tự tải. */
  externalUris: string[];
}

export class GlbParseError extends Error {}

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;

/** Giới hạn để không phân tích JSON khổng lồ từ nguồn không tin cậy. */
export const MAX_JSON_BYTES = 32 * 1024 * 1024;

export function readGlbJson(buf: ArrayBuffer): unknown {
  if (buf.byteLength < 20) throw new GlbParseError('Tệp quá ngắn cho GLB.');
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new GlbParseError('Không phải GLB (sai magic).');
  if (dv.getUint32(4, true) !== 2) throw new GlbParseError('Chỉ hỗ trợ glTF 2.0.');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new GlbParseError('Chunk đầu tiên không phải JSON.');
  if (jsonLen > MAX_JSON_BYTES || 20 + jsonLen > buf.byteLength) throw new GlbParseError('Độ dài chunk JSON không hợp lệ.');
  const text = new TextDecoder('utf-8').decode(new Uint8Array(buf, 20, jsonLen));
  try {
    return JSON.parse(text);
  } catch {
    throw new GlbParseError('JSON trong GLB bị hỏng.');
  }
}

interface Gltf {
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number; mode?: number; targets?: unknown[] }>; weights?: number[] }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  skins?: Array<{ joints?: number[] }>;
  materials?: unknown[];
  textures?: unknown[];
  animations?: unknown[];
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
}

function trianglesFor(mode: number, n: number): number {
  switch (mode) {
    case 4:
      return Math.floor(n / 3);
    case 5:
    case 6:
      return Math.max(0, n - 2);
    default:
      return 0; // điểm, đường: không có tam giác
  }
}

export function computeGltfStats(json: unknown): GlbStats {
  const g = (json && typeof json === 'object' ? json : {}) as Gltf;
  const acc = g.accessors ?? [];
  let primitives = 0;
  let triangles = 0;
  let vertices = 0;
  let morph = 0;
  let bMin: [number, number, number] | null = null;
  let bMax: [number, number, number] | null = null;
  for (const m of g.meshes ?? []) {
    let meshMorph = 0;
    for (const p of m.primitives ?? []) {
      primitives++;
      const pos = p.attributes?.POSITION;
      const posAcc = typeof pos === 'number' ? acc[pos] : undefined;
      const vcount = posAcc?.count ?? 0;
      vertices += vcount;
      const idxAcc = typeof p.indices === 'number' ? acc[p.indices] : undefined;
      triangles += trianglesFor(p.mode ?? 4, idxAcc?.count ?? vcount);
      meshMorph = Math.max(meshMorph, p.targets?.length ?? 0);
      if (posAcc?.min?.length === 3 && posAcc.max?.length === 3) {
        const mn = posAcc.min as [number, number, number];
        const mx = posAcc.max as [number, number, number];
        bMin = bMin ? [Math.min(bMin[0], mn[0]), Math.min(bMin[1], mn[1]), Math.min(bMin[2], mn[2])] : [mn[0], mn[1], mn[2]];
        bMax = bMax ? [Math.max(bMax[0], mx[0]), Math.max(bMax[1], mx[1]), Math.max(bMax[2], mx[2])] : [mx[0], mx[1], mx[2]];
      }
    }
    morph += meshMorph;
  }
  const bones = new Set<number>();
  for (const s of g.skins ?? []) for (const j of s.joints ?? []) bones.add(j);
  const externalUris = [...(g.buffers ?? []), ...(g.images ?? [])]
    .map((x) => x.uri)
    .filter((u): u is string => typeof u === 'string' && !u.startsWith('data:'));
  return {
    meshes: g.meshes?.length ?? 0,
    primitives,
    triangles,
    vertices,
    skins: g.skins?.length ?? 0,
    bones: bones.size,
    morphTargets: morph,
    materials: g.materials?.length ?? 0,
    textures: g.textures?.length ?? 0,
    animations: g.animations?.length ?? 0,
    boundsMin: bMin,
    boundsMax: bMax,
    externalUris,
  };
}

export function computeGlbStats(buf: ArrayBuffer): GlbStats {
  return computeGltfStats(readGlbJson(buf));
}
