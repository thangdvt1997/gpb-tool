// Nút bật/tắt mic cho thoại WebRTC (TASK 25b). Hiện trong ChatPanel (chỉ khi WORLD_ON). getUserMedia chỉ chạy khi bấm.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import itZone from '../../content/zones/it.json';
import type { ZoneDef } from '../../content/types';
import { getSpatialAudio } from '../../audio/spatial';
import { playerPose } from '../../scene/controls/playerPose';
import { audioZoneRects } from '../../scene/audioZones';
import { fetchIceServers } from '../iceServers';
import type { WorldApi } from '../useWorld';
import { debugWorldEnabled } from '../WorldDebug';
import { micAnnouncement, micLabel, roomAt, type Candidate, type SelfInfo } from './logic';
import { VoiceManager, type VoiceError } from './VoiceManager';

const rects = audioZoneRects((itZone as unknown as ZoneDef).objects);

const ERR_TEXT: Record<VoiceError, string> = {
  unsupported: 'Trình duyệt này không hỗ trợ thoại.',
  mic_denied: 'Không truy cập được micro. Hãy cho phép micro trong trình duyệt rồi thử lại.',
  no_turn: 'Máy chủ thoại chưa sẵn sàng, chưa bật được mic.',
  no_audio: 'Không phát được âm thanh thoại.',
};

type VoiceWorld = Pick<WorldApi, 'client' | 'remote' | 'subscribe' | 'state' | 'role' | 'muted'>;

const hidden: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

export function VoicePanel({ world }: { world: VoiceWorld }) {
  const ref = useRef(world);
  ref.current = world;
  const manager = useMemo(
    () =>
      new VoiceManager({
        selfId: () => ref.current.client.current?.selfId ?? null,
        send: (m) => ref.current.client.current?.send(m) ?? false,
        subscribe: (fn) => ref.current.subscribe(fn),
        self: (): SelfInfo => ({ x: playerPose.x, z: playerPose.z, room: roomAt(rects, playerPose.x, playerPose.z) }),
        others: (): Candidate[] => {
          const r = ref.current.remote;
          const now = Date.now();
          const out: Candidate[] = [];
          for (const id of r.ids()) {
            const s = r.sampleNow(id, now);
            if (s) out.push({ id, x: s.x, z: s.z, room: roomAt(rects, s.x, s.z) });
          }
          return out;
        },
        getBus: () => getSpatialAudio().getBus('voice'),
        fetchIce: () => fetchIceServers(),
        getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      }),
    [],
  );
  const snap = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.getSnapshot(),
  );
  const [announce, setAnnounce] = useState('');
  const on = snap.status === 'on';
  const starting = snap.status === 'starting';
  const allowed = world.role !== 'guest' && !world.muted;
  const canVoice = allowed && world.state === 'connected';

  const toggle = useCallback(async () => {
    if (manager.getSnapshot().status === 'on') {
      manager.disable();
      setAnnounce(micAnnouncement(false));
      return;
    }
    // Mở khóa AudioContext trong cùng cử chỉ bấm nút, trước khi chờ xin quyền mic.
    await getSpatialAudio().unlock();
    const ok = await manager.enable();
    setAnnounce(ok ? micAnnouncement(true) : '');
  }, [manager]);

  // Bị tắt tiếng bởi chủ phòng hoặc mất quyền: dừng mic ngay và báo. Rớt WebSocket tạm thời thì giữ nguyên
  // (luồng P2P đang chạy vẫn sống, tín hiệu mới chờ kết nối lại).
  useEffect(() => {
    if (on && !allowed) {
      manager.disable();
      setAnnounce(world.muted ? 'Bạn đang bị tắt tiếng nên mic đã tắt.' : 'Bạn không còn quyền dùng mic nên mic đã tắt.');
    }
  }, [on, allowed, manager, world.muted]);

  useEffect(() => () => manager.disable(), [manager]);

  useEffect(() => {
    if (typeof window === 'undefined' || !debugWorldEnabled(window.location.search)) return undefined;
    const w = window as unknown as { __gpbVoice?: unknown };
    w.__gpbVoice = {
      get status() { return manager.getSnapshot().status; },
      get peers() { return manager.getSnapshot().peers; },
      stats: () => manager.debugStats(),
      gains: () => manager.debugGains(),
      get lastError() { return manager.lastSignalError; },
    };
    return () => { delete w.__gpbVoice; };
  }, [manager]);

  const errText = snap.error ? ERR_TEXT[snap.error] : '';
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-label={micLabel(on)}
        disabled={starting || (!on && !canVoice)}
        title={!canVoice && !on ? (world.muted ? 'Bạn đang bị tắt tiếng' : 'Cần đăng nhập thành viên và kết nối để dùng mic') : undefined}
        onClick={() => void toggle()}
      >
        {starting ? 'Đang bật…' : micLabel(on)}
      </button>
      {on ? <span aria-hidden="true" style={{ fontSize: 12 }}>{snap.peers.filter((p) => p.state === 'connected').length} đang nghe</span> : null}
      <div role="status" aria-live="polite" style={hidden}>{announce}</div>
      {errText ? <div role="alert" style={{ flexBasis: '100%', fontSize: 12, color: '#ff8a80' }}>{errText}</div> : null}
    </>
  );
}
