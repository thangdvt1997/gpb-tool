import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityConfig } from './levels';
import {
  applyTierToMaterial,
  buildAoHaloGeometry,
  distanceToBox,
  isTierable,
  lodVisible,
  type GraphicsState,
} from './graphics';

const SCAN_S = 2; // quét vật liệu mới tải, vật LOD mới, mesh bóng tiếp xúc mới
const LOD_S = 0.3;

interface LodEntry { obj: THREE.Object3D; base: number; box: THREE.Box3 }

/** Gắn halo AO vào mesh bóng tiếp xúc (tên 'contact-shadows'). Trả halo, hoặc null nếu đã có. */
function ensureHalo(mesh: THREE.Mesh): THREE.Mesh | null {
  const ud = mesh.userData as { gpbHalo?: THREE.Mesh };
  if (ud.gpbHalo) return null;
  const geo = buildAoHaloGeometry(mesh.geometry);
  const mat = (mesh.material as THREE.Material).clone();
  const halo = new THREE.Mesh(geo, mat);
  halo.name = 'contact-shadows-ao';
  halo.renderOrder = mesh.renderOrder - 1;
  halo.raycast = () => undefined;
  halo.visible = false;
  mesh.add(halo);
  ud.gpbHalo = halo;
  // Mesh gốc bị giải phóng thì giải phóng halo theo (geometry, vật liệu nhân bản; map dùng chung không đụng).
  mesh.geometry.addEventListener('dispose', () => { geo.dispose(); mat.dispose(); mesh.remove(halo); delete ud.gpbHalo; });
  return halo;
}

/**
 * Áp texture tier, LOD khoảng cách và AO giả lên cảnh theo cấu hình chất lượng (TASK 13).
 * Chạy trong Canvas. Không vẽ gì; chi phí: quét cảnh mỗi 2 giây, duyệt danh sách LOD mỗi 0,3 giây.
 */
export function GraphicsApplier({ config }: { config: Pick<QualityConfig, 'textureTier' | 'lodDistanceScale' | 'ambientOcclusion'> }) {
  const { scene, gl, camera } = useThree();
  const cfg = useRef(config);
  const lods = useRef<LodEntry[]>([]);
  const halos = useRef<THREE.Mesh[]>([]);
  const state = useRef<GraphicsState>({
    textureTier: config.textureTier, lodDistanceScale: config.lodDistanceScale, ambientOcclusion: config.ambientOcclusion,
    sampleAnisotropy: null, maxAnisotropy: 0, maxTextureSize: 0, texturesTotal: 0, lodTotal: 0, lodHidden: 0, aoHalos: 0, aoVisible: 0,
  });
  const tScan = useRef(Infinity);
  const tLod = useRef(Infinity);
  const tmp = useRef(new THREE.Vector3());

  const publish = () => {
    state.current = { ...state.current, textureTier: cfg.current.textureTier, lodDistanceScale: cfg.current.lodDistanceScale, ambientOcclusion: cfg.current.ambientOcclusion };
    window.__gpbGfx = state.current;
  };

  const runLod = () => {
    const pos = camera.getWorldPosition(tmp.current);
    let hidden = 0;
    for (const e of lods.current) {
      const v = lodVisible(distanceToBox(pos, e.box), e.base, cfg.current.lodDistanceScale, e.obj.visible);
      if (e.obj.visible !== v) e.obj.visible = v;
      if (!v) hidden++;
    }
    state.current = { ...state.current, lodTotal: lods.current.length, lodHidden: hidden };
  };

  const scan = () => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    const seen = new Set<THREE.Material>();
    const lodList: LodEntry[] = [];
    const haloList: THREE.Mesh[] = [];
    let sample: number | null = null;
    let total = 0;
    let maxSize = 0;
    let maxAn = 0;
    scene.traverse((o) => {
      const base = (o.userData as { lodDetail?: number }).lodDetail;
      if (typeof base === 'number') lodList.push({ obj: o, base, box: new THREE.Box3().setFromObject(o) });
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name === 'contact-shadows') {
        const h = ensureHalo(m) ?? (m.userData as { gpbHalo?: THREE.Mesh }).gpbHalo;
        if (h) haloList.push(h);
      }
      const mats = (m as { material?: THREE.Material | THREE.Material[] }).material;
      if (!mats) return;
      for (const mat of Array.isArray(mats) ? mats : [mats]) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        applyTierToMaterial(mat, cfg.current.textureTier, maxAniso);
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
          const t = v as THREE.Texture | null;
          if (!t || !t.isTexture) continue;
          total++;
          if (sample === null) sample = t.anisotropy;
          maxAn = Math.max(maxAn, t.anisotropy);
          const im = t.image as { width?: number; height?: number } | undefined;
          // Chỉ tính texture mà tier áp được (CanvasTexture do mã vẽ giữ nguyên cỡ).
          if (im?.width && isTierable(t) && !(t as THREE.Texture & { isCanvasTexture?: boolean }).isCanvasTexture) maxSize = Math.max(maxSize, im.width, im.height ?? 0);
        }
      }
    });
    // Giữ trạng thái hiện/ẩn của vật LOD cũ qua lần quét mới.
    lods.current = lodList;
    halos.current = haloList;
    for (const h of haloList) h.visible = cfg.current.ambientOcclusion;
    state.current = {
      ...state.current, sampleAnisotropy: sample, maxAnisotropy: maxAn, maxTextureSize: maxSize, texturesTotal: total,
      aoHalos: haloList.length, aoVisible: haloList.filter((h) => h.visible).length,
    };
  };

  // Đổi cấu hình: quét và áp ngay.
  useEffect(() => {
    cfg.current = config;
    scan();
    runLod();
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.textureTier, config.lodDistanceScale, config.ambientOcclusion, scene, gl]);

  useEffect(() => () => { delete window.__gpbGfx; }, []);

  useFrame((_, dt) => {
    tScan.current += dt;
    tLod.current += dt;
    let dirty = false;
    if (tScan.current >= SCAN_S) { tScan.current = 0; scan(); dirty = true; }
    if (tLod.current >= LOD_S) { tLod.current = 0; runLod(); dirty = true; }
    if (dirty) publish();
  });
  return null;
}
