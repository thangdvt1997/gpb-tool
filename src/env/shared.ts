// Tiện ích dùng chung cho module trang trí 3D (src/env).
// Gồm: hình học đơn vị dùng chung (không dispose), gom bản sao bằng InstancedMesh,
// texture nhãn bằng canvas, RNG có hạt giống, và dọn vật liệu/texture khi unmount.
// Không có biến toàn cục thay đổi trạng thái.

import { useEffect } from 'react';
import * as THREE from 'three';
import { Batch } from '../scene/entry/merge';

export type Vec3 = [number, number, number];

/** Props chung của mọi decor: vị trí trên sàn, phóng to, xoay quanh trục Y. */
export interface DecorBase {
  /** Điểm trên mặt sàn (y = 0) tại tâm khối. Mọi độ cao chi tiết tính từ sàn. */
  position?: Vec3;
  /** Hệ số phóng to đồng nhất, mặc định 1. */
  scale?: number;
  /** Xoay quanh trục Y (rad), mặc định 0. */
  rotationY?: number;
}

export interface Disposable {
  dispose: () => void;
}

// Hình học đơn vị, dùng chung cho mọi decor. Kích thước thật đặt bằng scale của từng bản sao.
// BOX: s = [rộng, cao, sâu].
// CYL (bán kính 1, cao 1, trục Y): s = [bán kính, cao, bán kính].
// SPHERE (bán kính 1): s = [bán kính x, bán kính y, bán kính z].
// PLANE (1 x 1, mặt hướng +z): s = [rộng, cao, 1].
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
export const UNIT_SPHERE = new THREE.SphereGeometry(1, 10, 8);
export const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

/** Một bản sao trong InstancedMesh. */
export interface Inst {
  /** Tâm, theo hệ tọa độ local của module (mét). */
  p: Vec3;
  /** Kích thước đã scale, theo quy ước của hình học đơn vị. */
  s: Vec3;
  /** Góc Euler XYZ (rad), mặc định 0. */
  r?: Vec3;
  /** Màu bản sao (nhân với màu vật liệu). Nếu lô có ít nhất một màu thì bản sao không màu sẽ là trắng. */
  c?: string | number;
}

/** Tạo một InstancedMesh từ danh sách bản sao. Trả null nếu danh sách rỗng. */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: Inst[],
): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const anyColor = items.some((it) => it.c !== undefined);
  items.forEach((it, i) => {
    const r: Vec3 = it.r ?? [0, 0, 0];
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    p.set(it.p[0], it.p[1], it.p[2]);
    s.set(it.s[0], it.s[1], it.s[2]);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (anyColor) mesh.setColorAt(i, col.set(it.c ?? 0xffffff));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Gộp nhiều lô bản sao tĩnh (khác hình học đơn vị) thành một Mesh màu đỉnh: cả cụm một draw call thay vì
 * một InstancedMesh cho mỗi hình học. material phải bật vertexColors. Trả null nếu mọi lô rỗng.
 * Hình học gộp là của riêng mesh: người gọi dispose qua mesh.geometry (thêm vào danh sách owned).
 */
export function mergedMesh(
  material: THREE.Material,
  groups: ReadonlyArray<readonly [THREE.BufferGeometry, readonly Inst[]]>,
): THREE.Mesh | null {
  const batch = new Batch();
  for (const [geo, items] of groups) batch.addAll(geo, items);
  const geo = batch.build();
  return geo ? new THREE.Mesh(geo, material) : null;
}

/** Vẽ texture bằng canvas 2D. Người gọi chịu trách nhiệm dispose texture. */
export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Đặt font đậm (hoặc weight khác) sao cho chữ vừa maxWidth, bắt đầu từ maxPx. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxPx: number,
  weight = 'bold',
): void {
  let px = maxPx;
  ctx.font = `${weight} ${px}px sans-serif`;
  while (px > 10 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px sans-serif`;
  }
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32). Mỗi lần gọi tạo trạng thái riêng. */
export function makeRng(seed: number): () => number {
  let state = Math.floor(Math.abs(seed)) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chọn một phần tử ngẫu nhiên bằng RNG có hạt giống. Mảng không được rỗng. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Hạt giống ổn định từ id vật thể (FNV-1a). */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Hình chữ nhật trên mặt sàn (m, hệ three.js). Dùng cho va chạm của decor. */
export interface FloorRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Hình chữ nhật đặt tại (cx, cz) cộng độ lệch (x, z), kích thước (w, d). */
export function floorRect(
  cx: number,
  cz: number,
  r: { x: number; z: number; w: number; d: number },
): FloorRect {
  const x = cx + r.x;
  const z = cz + r.z;
  return { minX: x - r.w / 2, maxX: x + r.w / 2, minZ: z - r.d / 2, maxZ: z + r.d / 2 };
}

/**
 * Dispose các vật liệu, texture, hình học sở hữu riêng khi danh sách đổi hoặc unmount.
 * Truyền một mảng đã memo (useMemo), không truyền mảng tạo mới mỗi lần render.
 */
export function useDisposeOnChange(items: readonly Disposable[]): void {
  useEffect(() => {
    return () => {
      for (const it of items) it.dispose();
    };
  }, [items]);
}
