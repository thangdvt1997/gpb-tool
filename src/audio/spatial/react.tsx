import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { SpatialAudioManager, type AudioStatus } from './manager';

let shared: SpatialAudioManager | null = null;
/** Bộ quản lý dùng chung toàn app (tạo lười, không tạo AudioContext). */
export function getSpatialAudio(): SpatialAudioManager {
  return (shared ??= new SpatialAudioManager({
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
}

const Ctx = createContext<SpatialAudioManager | null>(null);
export function SpatialAudioProvider({ manager, children }: { manager?: SpatialAudioManager; children: ReactNode }) {
  return createElement(Ctx.Provider, { value: manager ?? getSpatialAudio() }, children);
}

/** Hook: điều khiển âm thanh không gian; status phản ánh trạng thái thật của AudioContext. */
export function useSpatialAudio() {
  const m = useContext(Ctx) ?? getSpatialAudio();
  const settings = useSyncExternalStore(
    (cb) => m.subscribe(cb), () => m.getSettings(),
  );
  const status = useSyncExternalStore((cb) => m.subscribe(cb), () => m.status) as AudioStatus;
  const unlock = useCallback(() => m.unlock(), [m]);
  return useMemo(
    () => ({
      manager: m, settings, status, unlock,
      play: m.play.bind(m), playUi: m.playUi.bind(m),
      setVolume: m.setVolume.bind(m), setMuted: m.setMuted.bind(m),
    }),
    [m, settings, status, unlock],
  );
}

const _fwd = new Vector3();
/** Cập nhật listener theo camera mỗi frame, mở khóa audio ở thao tác đầu và tạm dừng khi tab ẩn. */
export function SpatialAudioListener({ getZone }: { getZone?: (x: number, z: number) => string }) {
  const { manager } = useSpatialAudio();
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const unlock = () => { void manager.unlock(); };
    const onVis = () => manager.setHidden(document.hidden);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVis);
      manager.stopAll();
    };
  }, [manager]);
  useFrame(() => {
    camera.getWorldDirection(_fwd);
    const p = camera.position;
    manager.setListener([p.x, p.y, p.z], [_fwd.x, _fwd.y, _fwd.z], getZone?.(p.x, p.z));
  });
  return null;
}
