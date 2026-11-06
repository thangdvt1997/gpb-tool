// Gộp nhiều mảnh hình học tĩnh thành một BufferGeometry có màu đỉnh, để cả cụm chỉ tốn một draw call
// cho mỗi loại vật liệu. Mảnh dùng hình học đơn vị của src/env/shared (đều có index, position, normal, uv).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

interface Piece {
  geo: THREE.BufferGeometry;
  m: THREE.Matrix4;
  c: THREE.Color;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Danh sách mảnh của một vật liệu. add() nhận tọa độ local và ma trận khung (local → world). */
export class Batch {
  private pieces: Piece[] = [];

  add(
    geo: THREE.BufferGeometry,
    frame: THREE.Matrix4 | null,
    p: V3,
    s: V3,
    color: THREE.ColorRepresentation,
    r?: V3,
  ): this {
    tmpE.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
    tmpQ.setFromEuler(tmpE);
    const m = new THREE.Matrix4().compose(tmpP.set(p[0], p[1], p[2]), tmpQ, tmpS.set(s[0], s[1], s[2]));
    if (frame) m.premultiply(frame);
    this.pieces.push({ geo, m, c: new THREE.Color(color) });
    return this;
  }

  /**
   * Thêm cả danh sách bản sao (cùng quy ước với Inst của src/env/shared: p, s, r, c).
   * Bản sao không màu lấy màu trắng, giống InstancedMesh có instanceColor.
   */
  addAll(
    geo: THREE.BufferGeometry,
    items: ReadonlyArray<{ p: V3; s: V3; r?: V3; c?: THREE.ColorRepresentation }>,
    frame: THREE.Matrix4 | null = null,
  ): this {
    for (const it of items) this.add(geo, frame, it.p, it.s, it.c ?? 0xffffff, it.r);
    return this;
  }

  get size(): number {
    return this.pieces.length;
  }

  /** Gộp thành một hình học. Trả null nếu không có mảnh nào. Người gọi chịu trách nhiệm dispose. */
  build(): THREE.BufferGeometry | null {
    if (this.pieces.length === 0) return null;
    const parts = this.pieces.map(({ geo, m, c }) => {
      const g = geo.clone();
      g.applyMatrix4(m);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (merged) merged.computeBoundingSphere();
    return merged;
  }
}
