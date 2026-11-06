/**
 * Gắn lớp xăm lên mesh thân của nhân vật MPFB trong cảnh.
 * Logic thuần (findBodyMesh, shouldAttachOverlay) tách riêng để test; hook chỉ nối store, masks, canvas và overlay.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { applyTattooOverlay, type TattooOverlayHandle } from './overlay';
import { createCanvas, drawDocToCanvas, QUALITY_RES, type TattooQuality } from './raster';
import type { RegionMask } from './regions';
import type { TattooDoc } from './schema';
import { loadRegionMasks, TATTOO_MODEL_URLS } from './masks';
import { docHasItems, useTattooDoc, type ModelId } from './store';

/** Mesh thân = mesh có morph 'bodyBelly' (giống findMorphMesh trong MpfbAvatar). */
export function findBodyMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!found && m.isMesh && m.morphTargetDictionary && 'bodyBelly' in m.morphTargetDictionary) found = m;
  });
  return found;
}

/** Có nên gắn overlay không: cần mesh thân, mask đã nạp và doc có nét hiện. */
export function shouldAttachOverlay(body: THREE.Mesh | null, masks: readonly RegionMask[] | null, doc: TattooDoc): boolean {
  return !!body && !!masks && masks.length > 0 && docHasItems(doc);
}

export function useBodyTattoo(root: THREE.Object3D | null, model: ModelId, quality: TattooQuality): void {
  const doc = useTattooDoc(model);
  const [masks, setMasks] = useState<RegionMask[] | null>(null);
  const handle = useRef<TattooOverlayHandle | null>(null);
  const canvas = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null);
  const attachedTo = useRef<THREE.Mesh | null>(null);
  const drawn = useRef<TattooDoc | null>(null);

  // Nạp mask chỉ khi có xăm để cần vẽ (tránh tải GLB thừa lúc chưa ai xăm).
  const needMasks = docHasItems(doc);
  useEffect(() => {
    if (!needMasks) return;
    const ac = new AbortController();
    setMasks(null);
    loadRegionMasks(TATTOO_MODEL_URLS[model], ac.signal).then(setMasks, () => { /* huỷ hoặc lỗi: bỏ qua, không xăm */ });
    return () => ac.abort();
  }, [model, needMasks]);

  const drop = () => {
    handle.current?.dispose();
    handle.current = null; attachedTo.current = null; drawn.current = null;
  };

  // Gắn/vẽ lại khi doc, mesh, mask hoặc chất lượng đổi.
  useEffect(() => {
    const body = root ? findBodyMesh(root) : null;
    if (!shouldAttachOverlay(body, masks, doc)) { drop(); return; }
    const res = QUALITY_RES[quality];
    if (!canvas.current || canvas.current.width !== res) {
      canvas.current = createCanvas(res);
      drop();
    }
    const cv = canvas.current;
    if (!cv || !body) return;
    if (attachedTo.current !== body) drop();
    if (drawn.current !== doc || !handle.current) {
      drawDocToCanvas(doc, masks as RegionMask[], cv);
      drawn.current = doc;
    }
    if (!handle.current) {
      handle.current = applyTattooOverlay(body, cv);
      attachedTo.current = handle.current ? body : null;
    } else handle.current.update();
  }, [root, masks, doc, quality]);

  useEffect(() => () => { drop(); canvas.current = null; }, [root, model]);
}
