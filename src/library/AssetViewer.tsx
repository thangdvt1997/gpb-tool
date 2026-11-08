/**
 * Scene xem asset (task 01 + 18): Canvas riêng, nạp GLB từ đường dẫn trong manifest, hiện thống kê,
 * lưới 1 m, hộp bao và xoay quanh bằng OrbitControls. Không dùng chung Canvas với scene chính.
 */
import { Component, Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Grid, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { LibraryItem } from './types';

export interface ObjectStats {
  meshes: number;
  triangles: number;
  bones: number;
  morphTargets: number;
  materials: number;
  size: [number, number, number] | null;
}

/** Thống kê từ cây Object3D đã nạp (đếm theo geometry thực tế). */
export function statsFromObject(root: THREE.Object3D): ObjectStats {
  let meshes = 0;
  let triangles = 0;
  let morph = 0;
  const mats = new Set<THREE.Material>();
  const bones = new Set<THREE.Bone>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const idx = g.getIndex();
    triangles += Math.floor((idx ? idx.count : (g.getAttribute('position')?.count ?? 0)) / 3);
    morph += m.morphTargetInfluences?.length ?? 0;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.bones.forEach((b) => bones.add(b));
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? null : (box.getSize(new THREE.Vector3()).toArray() as [number, number, number]);
  return { meshes, triangles, bones: bones.size, morphTargets: morph, materials: mats.size, size };
}

function Model({ url, onStats }: { url: string; onStats: (s: ObjectStats) => void }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene, [gltf]);
  useEffect(() => {
    onStats(statsFromObject(scene));
  }, [scene, onStats]);
  return (
    <>
      <primitive object={scene} />
      <boxHelper args={[scene, 0x4f8cff]} />
    </>
  );
}

/** Error boundary tối giản để lỗi nạp GLB không làm sập panel. */
class Boundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AssetViewer({ item }: { item: LibraryItem }) {
  const [stats, setStats] = useState<ObjectStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = item.file;
  const safe = !!url && ((url.startsWith('/models/') && !url.includes('..')) || (item.source === 'user-upload' && url.startsWith('blob:')));

  useEffect(() => {
    setStats(null);
    setError(null);
  }, [item.id]);

  if (!safe || !url) {
    return (
      <div role="status" style={boxStyle}>
        Mục này không có tệp GLB để xem (dựng bằng mã hoặc đường dẫn không hợp lệ).
      </div>
    );
  }
  return (
    <div>
      <div style={{ height: 260, borderRadius: 8, overflow: 'hidden', background: '#0b1020' }} aria-label={`Xem 3D ${item.name}`}>
        {error ? (
          <div role="alert" style={boxStyle}>
            Không nạp được mô hình: {error}
          </div>
        ) : (
          <Canvas camera={{ position: [1.5, 1.4, 2.5], fov: 40 }} dpr={[1, 1.5]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 5, 2]} intensity={1.2} />
            <Grid args={[10, 10]} cellSize={1} sectionSize={5} infiniteGrid={false} fadeDistance={12} position={[0, 0, 0]} />
            <axesHelper args={[0.5]} />
            <Boundary key={item.id} onError={(e) => setError(e.message)}>
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.4}>
                  <Model url={url} onStats={setStats} />
                </Bounds>
              </Suspense>
            </Boundary>
            <OrbitControls makeDefault enablePan={false} target={[0, 0.9, 0]} />
          </Canvas>
        )}
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: '8px 0', fontSize: 13 }} aria-live="polite">
        {stats ? (
          <>
            <dt>Mesh</dt><dd>{stats.meshes}</dd>
            <dt>Tam giác</dt><dd>{stats.triangles.toLocaleString('vi-VN')}</dd>
            <dt>Xương</dt><dd>{stats.bones}</dd>
            <dt>Morph target</dt><dd>{stats.morphTargets}</dd>
            <dt>Vật liệu</dt><dd>{stats.materials}</dd>
            {stats.size && (<><dt>Kích thước (m)</dt><dd>{stats.size.map((v) => v.toFixed(2)).join(' x ')}</dd></>)}
          </>
        ) : (
          !error && <dd>Đang nạp...</dd>
        )}
      </dl>
    </div>
  );
}

const boxStyle: CSSProperties = { padding: 12, color: '#9aa8c7', fontSize: 13 };
