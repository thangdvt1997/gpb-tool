import { useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterLook } from '../../fashion/types';
import { MpfbOutfit, type OutfitRigLike } from './MpfbOutfit';

/** Mesh thân của một cây đối tượng MPFB: SkinnedMesh có morph bodyBelly, bỏ qua vỏ trang phục (tên bắt đầu 'outfit:'). */
export function findBodyMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (found) return;
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && !m.name.startsWith('outfit:') && m.morphTargetDictionary && 'bodyBelly' in m.morphTargetDictionary) found = m;
  });
  return found;
}

export interface MpfbOutfitOnProps {
  /** Nhóm chứa <MpfbAvatar />. Tìm mesh thân bên trong khi mô hình tải xong. */
  target: RefObject<THREE.Object3D>;
  look: CharacterLook | null;
}

/**
 * Cách gắn không cần sửa MpfbAvatar: đặt <MpfbAvatar/> trong một <group ref={ref}> rồi thêm
 * <MpfbOutfitOn target={ref} look={look} />. Kiểm tra bốn lần mỗi giây xem mesh thân đã có hoặc đã đổi
 * (đổi kiểu tạo hình nạp tệp khác), rồi mount MpfbOutfit với rig tìm được.
 */
export function MpfbOutfitOn({ target, look }: MpfbOutfitOnProps) {
  const [rig, setRig] = useState<OutfitRigLike | null>(null);
  const acc = useRef(1);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const root = target.current;
    if (!root) return;
    const body = findBodyMesh(root);
    const stillThere = rig && rig.morphMesh === body;
    if (!stillThere) setRig(body ? { root, morphMesh: body } : null);
  });
  return rig ? <MpfbOutfit rig={rig} look={look} /> : null;
}
