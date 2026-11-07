import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { CharacterLook } from '../../fashion/types';
import { accessorySignature } from './accessoryPlan';
import { attachAccessories, morphKey } from './accessoryRig';

export interface MpfbAccessoriesProps {
  /** Mesh thân (SkinnedMesh) của rig MPFB. */
  body: THREE.SkinnedMesh | null;
  look: CharacterLook | null;
}

/**
 * Gắn phụ kiện và mũ (procedural) vào xương của rig. Dựng lại khi danh sách món, màu hoặc hình thể thân đổi;
 * gỡ sạch khi unmount. Không render gì vào cây React.
 */
export function MpfbAccessories({ body, look }: MpfbAccessoriesProps) {
  const lookRef = useRef(look);
  lookRef.current = look;
  const sig = `${accessorySignature(look)}#${morphKey(look)}`;
  useEffect(() => {
    const current = lookRef.current;
    if (!body || !current) return;
    const att = attachAccessories(body, current);
    for (const s of att.skipped) console.warn(`Phụ kiện chưa dựng (${s.slot}/${s.itemId}): ${s.reason}`);
    return () => att.dispose();
  }, [body, sig]);
  return null;
}
