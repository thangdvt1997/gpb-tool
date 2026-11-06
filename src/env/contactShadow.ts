// Bóng tiếp xúc giả dưới bàn, ghế, hộc tủ, tủ (room.txt mục 6): các ô mờ nằm sát sàn, gộp một mesh, một draw call.
// Không dùng shadow map nên không tốn lượt vẽ bóng. Độ đậm từng ô nằm trong kênh alpha của màu đỉnh (vec4),
// texture là một hình chữ nhật mép mềm dùng chung.

import * as THREE from 'three';
import type { Disposable } from './shared';

/** Độ cao mặt bóng trên sàn (m). polygonOffset giữ bóng nằm trên sàn bóng mà không nhấp nháy. */
const LIFT = 0.004;

/** Một ô bóng trên sàn, toạ độ thế giới (m). w, d theo trục local trước khi xoay yaw; a độ đậm 0 đến 1. */
export interface ShadowSpot {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
  a: number;
}

type Blob = ShadowSpot;

/** Hình chữ nhật mép mềm: lõi đặc chiếm nửa giữa, mờ dần ra mép. Mã hoá ở alpha, RGB đen. */
function blobTexture(): THREE.CanvasTexture {
  const n = 64;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = Math.max(0, Math.abs((i + 0.5) / n - 0.5) - 0.22) / 0.28;
        const v = Math.max(0, Math.abs((j + 0.5) / n - 0.5) - 0.22) / 0.28;
        const t = Math.min(1, Math.sqrt(u * u + v * v));
        const a = 1 - t * t * (3 - 2 * t);
        img.data[(j * n + i) * 4 + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Gom ô bóng theo toạ độ thế giới (m). build() trả mesh đã sẵn vật liệu, kèm danh sách cần dispose. */
export class ShadowBatch {
  private blobs: Blob[] = [];

  /** (x, z) tâm ô, (w, d) kích thước theo trục local trước khi xoay yaw, a độ đậm 0 đến 1. */
  add(x: number, z: number, w: number, d: number, a: number, yaw = 0): this {
    this.blobs.push({ x, z, w, d, yaw, a });
    return this;
  }

  /** Thêm ô theo khung local (frame là ma trận local → thế giới, chỉ gồm tịnh tiến và xoay quanh Y). */
  addLocal(frame: THREE.Matrix4, lx: number, lz: number, w: number, d: number, a: number, yaw = 0): this {
    const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(frame);
    const e = frame.elements;
    const frameYaw = Math.atan2(e[8] ?? 0, e[0] ?? 1);
    return this.add(p.x, p.z, w, d, a, frameYaw + yaw);
  }

  addAll(spots: readonly ShadowSpot[]): this {
    for (const s of spots) this.blobs.push({ ...s });
    return this;
  }

  get size(): number {
    return this.blobs.length;
  }

  build(): { mesh: THREE.Mesh; owned: Disposable[] } | null {
    const n = this.blobs.length;
    if (n === 0) return null;
    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const col = new Float32Array(n * 16);
    const idx = new Uint32Array(n * 6);
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [-0.5, -0.5, 0, 1],
      [0.5, -0.5, 1, 1],
      [0.5, 0.5, 1, 0],
      [-0.5, 0.5, 0, 0],
    ];
    this.blobs.forEach((b, k) => {
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      corners.forEach(([cx, cz, u, v], i) => {
        const lx = cx * b.w;
        const lz = cz * b.d;
        // Xoay quanh Y theo quy ước three.js: x' = x cos + z sin, z' = -x sin + z cos.
        pos[k * 12 + i * 3] = b.x + lx * c + lz * s;
        pos[k * 12 + i * 3 + 1] = LIFT;
        pos[k * 12 + i * 3 + 2] = b.z - lx * s + lz * c;
        uv[k * 8 + i * 2] = u;
        uv[k * 8 + i * 2 + 1] = v;
        col[k * 16 + i * 4 + 3] = b.a;
      });
      // Mặt hướng lên (+y): thứ tự 0, 3, 2 và 0, 2, 1 theo chiều ngược kim đồng hồ khi nhìn từ trên.
      const o = k * 4;
      idx.set([o, o + 3, o + 2, o, o + 2, o + 1], k * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const map = blobTexture();
    const mat = new THREE.MeshBasicMaterial({
      map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'contact-shadows';
    mesh.renderOrder = -1;
    mesh.raycast = () => undefined;
    return { mesh, owned: [geo, map, mat] };
  }
}
