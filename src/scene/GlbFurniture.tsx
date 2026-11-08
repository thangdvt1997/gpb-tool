import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stateOf, toneFor, useScene } from './context';
import { glbFurnitureEnabled, placementMatrix, sourcesFromScene, type FurnitureSource, type InstanceSource, type Placement } from './furnitureGlb';

const DESK_URL = '/models/furn_desk.glb';
const CHAIR_URL = '/models/furn_chair.glb';
const WHITE = '#ffffff';

export interface FurnitureSources {
  desk: InstanceSource[];
  chair: InstanceSource[];
}

let cache: Promise<FurnitureSources | null> | null = null;

/** Nạp hai GLB một lần. Lỗi tải/giải mã hoặc không có mesh thì trả null (cảnh rơi về InstancedBoxes). */
export function loadFurnitureSources(): Promise<FurnitureSources | null> {
  if (!cache) {
    const loader = new GLTFLoader();
    cache = Promise.all([loader.loadAsync(DESK_URL), loader.loadAsync(CHAIR_URL)])
      .then(([d, c]) => {
        const desk = sourcesFromScene(d.scene);
        const chair = sourcesFromScene(c.scene);
        return desk.length > 0 && chair.length > 0 ? { desk, chair } : null;
      })
      .catch(() => null);
  }
  return cache;
}

declare global {
  interface Window {
    /** Cờ debug: nguồn bàn/ghế đang dùng và số InstancedMesh (draw call) của chúng. */
    __gpbFurniture?: { source: FurnitureSource; flag: boolean; instancedMeshes: number; desks: number; chairs: number };
  }
}

/** Trả nguồn hiện tại. 'loading' khi chưa tải xong; 'boxes' khi cờ tắt hoặc tải lỗi. */
export function useFurnitureSources(): { source: FurnitureSource; sources: FurnitureSources | null } {
  const [state, setState] = useState<{ source: FurnitureSource; sources: FurnitureSources | null }>(() =>
    glbFurnitureEnabled(typeof location === 'undefined' ? '' : location.search)
      ? { source: 'loading', sources: null }
      : { source: 'boxes', sources: null },
  );
  useEffect(() => {
    if (state.source !== 'loading') return;
    let alive = true;
    void loadFurnitureSources().then((s) => {
      if (alive) setState(s ? { source: 'glb', sources: s } : { source: 'boxes', sources: null });
    });
    return () => {
      alive = false;
    };
  }, [state.source]);
  return state;
}

interface Props {
  sources: InstanceSource[];
  placements: Placement[];
  castShadow?: boolean;
}

/** Một InstancedMesh cho mỗi cặp geometry + vật liệu của GLB. Bấm hoặc rê tác động tới khối bàn sở hữu. */
export function GlbInstances({ sources, placements, castShadow = true }: Props) {
  const { selected, hovered, select, hover, unhover } = useScene();
  if (placements.length === 0) return null;
  return (
    <>
      {sources.map((s, i) => (
        <GlbMesh key={i} source={s} placements={placements} castShadow={castShadow} sel={{ selected, hovered, select, hover, unhover }} />
      ))}
    </>
  );
}

type SceneApi = Pick<ReturnType<typeof useScene>, 'selected' | 'hovered' | 'select' | 'hover' | 'unhover'>;

function GlbMesh({ source, placements, castShadow, sel }: { source: InstanceSource; placements: Placement[]; castShadow: boolean; sel: SceneApi }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { selected, hovered, select, hover, unhover } = sel;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    placements.forEach((p, i) => {
      mesh.setMatrixAt(i, placementMatrix(p, m));
      mesh.setColorAt(i, c.set(toneFor(WHITE, stateOf(p.owner, selected, hovered))));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placements, selected, hovered]);
  const ownerOf = (e: { instanceId?: number }) => (e.instanceId === undefined ? undefined : placements[e.instanceId]?.owner);
  return (
    <instancedMesh
      ref={ref}
      args={[source.geometry, source.material, placements.length]}
      castShadow={castShadow}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const id = ownerOf(e);
        if (id === undefined) return;
        e.stopPropagation();
        select(id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        const id = ownerOf(e);
        if (id === undefined) return;
        e.stopPropagation();
        hover(id);
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        const id = ownerOf(e);
        if (id !== undefined) unhover(id);
      }}
    />
  );
}

/** Ghi cờ debug window.__gpbFurniture. */
export function useFurnitureFlag(source: FurnitureSource, sources: FurnitureSources | null, desks: number): void {
  useEffect(() => {
    window.__gpbFurniture = {
      source,
      flag: glbFurnitureEnabled(location.search),
      instancedMeshes: source === 'glb' && sources ? sources.desk.length + sources.chair.length : 0,
      desks,
      chairs: desks,
    };
  }, [source, sources, desks]);
}
