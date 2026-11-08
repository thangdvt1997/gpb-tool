import { useEffect, useRef } from 'react';
import type { ZoneObject } from '../content/types';
import { getSpatialAudio } from './spatial/react';
import { AmbientScape, resolveAmbientSources, type AmbientZone } from './spatial/ambient';

declare global {
  interface Window {
    __gpbAudio?: () => { status: string; ambient: ReturnType<AmbientScape['debugState']>; activeVoices: number; master: { setting: number; muted: boolean; node: number | null } };
  }
}

/**
 * Hook âm nền của khu, chạy trên bus 'ambient' của SpatialAudioManager.
 * - Chưa phát khi chưa có thao tác người dùng: pointerdown/keydown đầu tiên gọi manager.unlock().
 * - Âm lượng/tắt tiếng theo bus trong Cài đặt, tạm dừng khi tab ẩn do manager xử lý.
 * - Hook e2e window.__gpbAudio chỉ có khi URL có ?debug=audio.
 */
export function useAmbient(zone: AmbientZone, enabled: boolean, objects: readonly ZoneObject[] = []) {
  const scapeRef = useRef<AmbientScape | null>(null);

  useEffect(() => {
    const manager = getSpatialAudio();
    const scape = new AmbientScape(manager);
    scapeRef.current = scape;
    const unlock = () => { void manager.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    if (new URLSearchParams(window.location.search).get('debug') === 'audio') {
      window.__gpbAudio = () => ({
        status: manager.status, ambient: scape.debugState(), activeVoices: manager.activeVoices,
        master: {
          setting: manager.getSettings().master.volume,
          muted: manager.getSettings().master.muted,
          node: manager.getBus('master')?.node.gain.value ?? null,
        },
      });
    }
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      delete window.__gpbAudio;
      scape.dispose();
      scapeRef.current = null;
    };
  }, []);

  useEffect(() => { scapeRef.current?.setZone(zone); }, [zone]);
  useEffect(() => { scapeRef.current?.setSources(resolveAmbientSources(objects)); }, [objects]);
  useEffect(() => { scapeRef.current?.setEnabled(enabled); }, [enabled]);
}
