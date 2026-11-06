import { useCallback, useEffect, useRef } from 'react';
import { getControls, playerPose } from '../../scene/controls';
import { getCharacterState } from '../../scene/interact/characterState';
import { notifyCause } from './controller';
import type { QuickContext } from './logic';

/** Tốc độ ngang (m/s) từ trên ngưỡng này tính là đang di chuyển và hủy hành động nhanh đang chạy. */
const MOVE_SPEED = 0.3;

/**
 * Cầu nối giữa QuickWheel và cảnh: đo tốc độ từ playerPose mỗi khung (requestAnimationFrame), báo notifyCause('move' | 'sit' | 'interact')
 * khi tình huống đổi, và cấp getContext. airborne luôn false (playerPose không có độ cao), editorOpen luôn false (chưa có chế độ sắp xếp),
 * zones null (không giới hạn vùng).
 */
export function useQuickHost(): () => QuickContext {
  const speed = useRef(0);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    let lastX = playerPose.x;
    let lastZ = playerPose.z;
    let wasSeated = getControls().seated;
    let wasInteracting = getCharacterState() === 'interacting';
    const tick = (t: number): void => {
      const dt = (t - lastT) / 1000;
      if (dt > 0) {
        speed.current = Math.hypot(playerPose.x - lastX, playerPose.z - lastZ) / dt;
        lastT = t;
        lastX = playerPose.x;
        lastZ = playerPose.z;
      }
      if (speed.current > MOVE_SPEED) notifyCause('move');
      const seated = getControls().seated;
      if (seated && !wasSeated) notifyCause('sit');
      wasSeated = seated;
      const interacting = getCharacterState() === 'interacting';
      if (interacting && !wasInteracting) notifyCause('interact');
      wasInteracting = interacting;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return useCallback(
    () => ({
      speed: speed.current,
      airborne: false,
      sitting: getControls().seated,
      editorOpen: false,
      interacting: getCharacterState() === 'interacting',
      position: { x: playerPose.x, z: playerPose.z },
      zones: null,
    }),
    [],
  );
}
