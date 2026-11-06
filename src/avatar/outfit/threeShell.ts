/**
 * Lớp three.js của vỏ trang phục: lấy dữ liệu thô từ SkinnedMesh thân, dựng geometry vỏ dùng chung attribute
 * (position, normal, uv, skinIndex, skinWeight, morph) với thân và chỉ có index riêng, vật liệu đẩy đỉnh theo
 * pháp tuyến bằng thuộc tính aOff và tô màu theo vùng bằng thuộc tính aZone.
 * Không có React ở đây để dễ test trong node.
 */
import * as THREE from 'three';
import { classifyBody, type BodyData, type Classification } from './regions';
import { ZONE_LIST } from './zones';
import { hashArray, RefPool } from './pool';
import type { Material as FashionMaterial } from '../../fashion/types';

/** Dữ liệu thô của mesh thân. Vị trí xương lấy từ boneInverses (tư thế bind) nên không phụ thuộc pose hiện tại. */
export function bodyDataFromMesh(mesh: THREE.SkinnedMesh): BodyData {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const idx = geo.getIndex();
  if (!pos || !si || !sw || !idx) throw new Error('Mesh thân thiếu position/skin/index.');
  const bones = mesh.skeleton.bones;
  const bonePos: Record<string, [number, number, number]> = {};
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (let i = 0; i < bones.length; i++) {
    // inverse(boneInverse) = ma trận thế giới của xương lúc bind; đổi về không gian cục bộ của mesh.
    m.copy(mesh.skeleton.boneInverses[i]).invert().premultiply(mesh.bindMatrixInverse);
    v.setFromMatrixPosition(m);
    bonePos[bones[i].name] = [v.x, v.y, v.z];
  }
  return {
    positions: pos.array as ArrayLike<number>,
    normals: nor ? (nor.array as ArrayLike<number>) : [],
    index: idx.array as ArrayLike<number>,
    skinIndex: si.array as ArrayLike<number>,
    skinWeight: sw.array as ArrayLike<number>,
    boneNames: bones.map((b) => b.name),
    bonePos,
  };
}

interface BodyAnalysis {
  data: BodyData;
  cls: Classification;
}

const analysisCache = new WeakMap<THREE.BufferGeometry, BodyAnalysis>();

/** Phân vùng thân, lưu theo geometry gốc (geometry dùng chung nên mọi bản sao nhân vật dùng chung kết quả). */
export function analyzeBody(mesh: THREE.SkinnedMesh, baseGeometry: THREE.BufferGeometry): BodyAnalysis {
  const hit = analysisCache.get(baseGeometry);
  if (hit) return hit;
  const data = bodyDataFromMesh(mesh);
  const out = { data, cls: classifyBody(data) };
  analysisCache.set(baseGeometry, out);
  return out;
}

/** Geometry dẫn xuất: dùng chung attribute và morph với geometry gốc, chỉ khác index và thuộc tính riêng. */
export function deriveGeometry(
  base: THREE.BufferGeometry,
  index: Uint32Array,
  extra?: { offset: Float32Array; zone: Uint8Array; cut?: Float32Array },
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.attributes[name]);
  g.morphAttributes = base.morphAttributes;
  g.morphTargetsRelative = base.morphTargetsRelative;
  const count = base.getAttribute('position').count;
  const small = count <= 65535;
  g.setIndex(new THREE.BufferAttribute(small ? Uint16Array.from(index) : index, 1));
  if (extra) {
    g.setAttribute('aOff', new THREE.BufferAttribute(extra.offset, 1));
    g.setAttribute('aZone', new THREE.BufferAttribute(Float32Array.from(extra.zone), 1));
    // Lề cắt: mảnh có giá trị nội suy < 0 bị bỏ, nên mép áo là đường đẳng trị thẳng thay vì bậc thang theo tam giác.
    if (extra.cut) g.setAttribute('aCut', new THREE.BufferAttribute(extra.cut, 1));
  }
  if (base.boundingSphere) g.boundingSphere = base.boundingSphere.clone();
  if (base.boundingBox) g.boundingBox = base.boundingBox.clone();
  return g;
}

/** Kho geometry vỏ và geometry da đã ẩn, dùng chung mọi nhân vật. */
export const geometryPool = new RefPool<THREE.BufferGeometry>();

/** Khoá geometry vỏ theo nội dung (chỉ số và độ đẩy), nên hai nhân vật cùng bộ đồ dùng chung. */
export function shellGeometryKey(baseUuid: string, specKey: string, index: Uint32Array, offset: Float32Array, cut?: Float32Array): string {
  return `shell|${baseUuid}|${specKey}|${hashArray(index)}|${hashArray(offset, 1e6)}|${cut ? hashArray(cut, 1e6) : 0}`;
}

export function skinGeometryKey(baseUuid: string, index: Uint32Array): string {
  return `skin|${baseUuid}|${hashArray(index)}`;
}

/* ------------------------------------------------------------------ */
/* Vật liệu                                                            */
/* ------------------------------------------------------------------ */

const SHELL_PROGRAM_KEY = 'gpb-outfit-shell-v2';

/** Độ nhám và kim loại theo chất liệu thời trang. */
export const MATERIAL_PARAMS: Readonly<Record<FashionMaterial, { roughness: number; metalness: number }>> = {
  cotton: { roughness: 0.92, metalness: 0 },
  knit: { roughness: 0.97, metalness: 0 },
  denim: { roughness: 0.88, metalness: 0 },
  woven: { roughness: 0.82, metalness: 0 },
  twill: { roughness: 0.85, metalness: 0 },
  nylon: { roughness: 0.55, metalness: 0 },
  fleece: { roughness: 1, metalness: 0 },
  silk: { roughness: 0.4, metalness: 0 },
  leather: { roughness: 0.5, metalness: 0 },
  suede: { roughness: 0.95, metalness: 0 },
  canvas: { roughness: 0.9, metalness: 0 },
  rubber: { roughness: 0.8, metalness: 0 },
  metal: { roughness: 0.3, metalness: 0.9 },
  plastic: { roughness: 0.45, metalness: 0 },
};

/** Số slot màu vùng trong shader (>= ZONE_LIST.length). */
const ZONE_SLOTS = 12;

/** Vật liệu vỏ: đẩy đỉnh theo pháp tuyến aOff sau morph, trước skinning; nhân màu vùng aZone. */
export function createShellMaterial(layerRank: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.FrontSide });
  const colors: THREE.Color[] = Array.from({ length: ZONE_SLOTS }, () => new THREE.Color(0xcccccc));
  mat.userData.zoneColors = colors;
  // Lớp ngoài thắng độ sâu ở chỗ gần nhau (cộng với độ đẩy theo lớp).
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1 - layerRank;
  mat.polygonOffsetUnits = -1 - layerRank;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uZoneColors = { value: colors };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOff;\nattribute float aZone;\nattribute float aCut;\nvarying float vZone;\nvarying float vCut;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\n  transformed += normalize(normal) * aOff;\n  vZone = aZone;\n  vCut = aCut;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uZoneColors[${ZONE_SLOTS}];\nvarying float vZone;\nvarying float vCut;`)
      // Cắt mép trang phục theo đường đẳng trị lề = 0 (đầu main, trước mọi tính toán khác).
      .replace('#include <clipping_planes_fragment>', '  if (vCut < 0.0) discard;\n#include <clipping_planes_fragment>')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= uZoneColors[int(vZone + 0.5)];');
  };
  mat.customProgramCacheKey = () => SHELL_PROGRAM_KEY;
  return mat;
}

/** Ghi màu từng vùng vào vật liệu vỏ. zoneColors[i] là màu hex của ZONE_LIST[i]. */
export function setShellZoneColors(mat: THREE.MeshStandardMaterial, hexByZone: readonly string[]): void {
  const colors = mat.userData.zoneColors as THREE.Color[];
  for (let i = 0; i < ZONE_LIST.length && i < colors.length; i++) colors[i].set(hexByZone[i] ?? '#cccccc');
}

export function setShellMaterialParams(mat: THREE.MeshStandardMaterial, material: FashionMaterial): void {
  const p = MATERIAL_PARAMS[material];
  mat.roughness = p.roughness;
  mat.metalness = p.metalness;
}
