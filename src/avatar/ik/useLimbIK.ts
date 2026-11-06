import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { LimbIKController, type LimbIKOptions } from './controller';

/**
 * Tạo LimbIKController cho rig và chạy nó mỗi khung SAU phần ghi tư thế/mixer.
 * Thứ tự: R3F chạy useFrame cùng priority theo thứ tự đăng ký, nên gọi hook này SAU useFrame ghi tư thế
 * trong cùng component (không dùng priority > 0 vì sẽ tắt render tự động của R3F).
 *
 * `setup` (tùy chọn) được gọi mỗi khung ngay trước giải để ghi mục tiêu (đọc store, ref...).
 * Trả về controller để component điều khiển mục tiêu/công tắc.
 */
export function useLimbIK(
  rig: THREE.Object3D | null,
  setup?: (ctrl: LimbIKController, dt: number) => void,
  options?: Partial<LimbIKOptions>,
): LimbIKController | null {
  const ctrl = useMemo(() => (rig ? new LimbIKController(rig, options) : null), [rig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ctrl && ctrl.bones.missing.length > 0) console.warn('LimbIK: thiếu xương', ctrl.bones.missing.join(', '));
  }, [ctrl]);
  useFrame((_, dt) => {
    if (!ctrl) return;
    setup?.(ctrl, dt);
    ctrl.update(dt);
  });
  return ctrl;
}
