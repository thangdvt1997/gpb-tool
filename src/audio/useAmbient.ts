import { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientEngine, type AmbientZone } from './engine';

/**
 * Hook âm thanh nền của khu.
 * - Không phát âm khi chưa có thao tác người dùng: khi enabled là true, lần nhấn chuột hoặc phím đầu tiên mới gọi resume().
 * - Engine được tạo một lần (useRef). Khi unmount, AudioContext được đóng bằng dispose().
 * - Trạng thái mute nằm trong state, không lưu localStorage.
 */
export function useAmbient(zone: AmbientZone, enabled: boolean) {
  const engineRef = useRef<AmbientEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new AmbientEngine();
  const engine = engineRef.current;

  const [muted, setMuted] = useState(false);

  useEffect(() => {
    engine.setZone(zone);
  }, [engine, zone]);

  useEffect(() => {
    if (!enabled) {
      void engine.suspend();
      return undefined;
    }
    if (engine.isStarted()) {
      void engine.resume();
      return undefined;
    }

    // Chưa có AudioContext: đợi thao tác người dùng đầu tiên rồi mới mở.
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    const unlock = () => {
      cleanup();
      void engine.resume();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return cleanup;
  }, [engine, enabled]);

  useEffect(() => () => engine.dispose(), [engine]);

  /** Gọi từ trình xử lý click. Nếu đang tắt tiếng thì mở lại và bật tiếng. */
  const toggleMute = useCallback(() => {
    if (engine.isMuted()) {
      void engine.resume();
      engine.unmute();
      setMuted(false);
    } else {
      engine.mute();
      setMuted(true);
    }
  }, [engine]);

  return { engine, muted, toggleMute };
}
