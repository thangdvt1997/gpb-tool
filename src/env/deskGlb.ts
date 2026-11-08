// Nạp GLB bàn làm việc (public/models/furn_desk_{dev,design,ops}.glb, sinh bởi scripts/assets/bake-desk-variants.ts)
// thành hình học dùng cho InstancedMesh trong DeskDecorField. Vật liệu không lấy từ GLB: UV của GLB trỏ vào atlas
// của buildDeskAtlas (texture canvas, không nhúng được vào GLB), nên cảnh gắn vật liệu atlas chung.
// Lỗi tải hoặc ?glbDesks=0 thì DeskDecorField vẽ procedural như cũ.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type DeskGlbVariant = 'dev' | 'design' | 'ops';
export type DeskGlbGeometries = Record<DeskGlbVariant, THREE.BufferGeometry>;
export type DeskGlbSource = 'glb' | 'procedural' | 'loading';

export const DESK_GLB_URLS: Record<DeskGlbVariant, string> = {
  dev: '/models/furn_desk_dev.glb',
  design: '/models/furn_desk_design.glb',
  ops: '/models/furn_desk_ops.glb',
};

/** ?glbDesks=0 tắt bàn từ GLB (về procedural). Mặc định bật. */
export function deskGlbEnabled(search: string): boolean {
  return new URLSearchParams(search).get('glbDesks') !== '0';
}

/** Gộp mọi mesh của cây GLB (áp ma trận thế giới) thành một hình học đúng tập thuộc tính của atlas. Null nếu không có mesh. */
export function geometryFromScene(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') flat.deleteAttribute(name);
    }
    if (!flat.getAttribute('uv') || !flat.getAttribute('color') || !flat.getAttribute('normal')) return;
    parts.push(flat);
  });
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
}

let cache: Promise<DeskGlbGeometries | null> | null = null;

/** Nạp ba GLB một lần. Bất kỳ lỗi nào (mạng, giải mã, thiếu mesh) trả null. */
export function loadDeskGlbs(): Promise<DeskGlbGeometries | null> {
  if (!cache) {
    const loader = new GLTFLoader();
    const keys = Object.keys(DESK_GLB_URLS) as DeskGlbVariant[];
    cache = Promise.all(keys.map((k) => loader.loadAsync(DESK_GLB_URLS[k])))
      .then((gltfs) => {
        const out: Partial<DeskGlbGeometries> = {};
        for (let i = 0; i < keys.length; i++) {
          const g = geometryFromScene(gltfs[i]!.scene);
          if (!g) return null;
          out[keys[i]!] = g;
        }
        return out as DeskGlbGeometries;
      })
      .catch(() => null);
  }
  return cache;
}

declare global {
  interface Window {
    /** Cờ debug: nguồn bàn làm việc (glb hay procedural) và số InstancedMesh/bản sao của bàn GLB. */
    __gpbDeskGlb?: { source: DeskGlbSource; flag: boolean; instancedMeshes: number; instances: number; signatures?: string[] };
  }
}

/** Trạng thái nạp. 'loading' (đang tải, vẽ procedural tạm), 'glb', hoặc 'procedural' (tắt cờ hay lỗi). */
export function useDeskGlb(): { source: DeskGlbSource; geometries: DeskGlbGeometries | null } {
  const [state, setState] = useState<{ source: DeskGlbSource; geometries: DeskGlbGeometries | null }>(() =>
    deskGlbEnabled(typeof location === 'undefined' ? '' : location.search)
      ? { source: 'loading', geometries: null }
      : { source: 'procedural', geometries: null },
  );
  useEffect(() => {
    if (state.source !== 'loading') return;
    let alive = true;
    void loadDeskGlbs().then((g) => {
      if (alive) setState(g ? { source: 'glb', geometries: g } : { source: 'procedural', geometries: null });
    });
    return () => {
      alive = false;
    };
  }, [state.source]);
  return state;
}
