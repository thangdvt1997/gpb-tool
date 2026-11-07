// Vẽ người chơi khác trong Canvas (R3F). Vị trí lấy từ RemoteStore (nội suy), cập nhật thẳng vào group mỗi khung hình,
// React chỉ render lại khi có người vào/ra. Dùng Avatar có sẵn với ngoại hình mặc định (đồng bộ ngoại hình thuộc lát cắt sau).
import { useFrame } from '@react-three/fiber';
import { useCallback, useRef, useState } from 'react';
import type { Group } from 'three';
import { Avatar } from '../avatar/Avatar';
import { DEFAULT_APPEARANCE } from '../avatar/appearance';
import { actionYaw, canShowAction } from './remoteActions';
import { EMOTES } from '../emotes/library';
import { prefersReducedMotion, samplePoseOf } from '../emotes/player';
import type { Pose } from '../emotes/types';
import type { AvatarAnimation } from '../avatar/animation';
import type { WorldApi } from './useWorld';

// Nhãn animation của server -> animation của Avatar.
const ANIM: Record<string, AvatarAnimation> = {
  idle: 'idle', walk: 'walk', run: 'run', jump: 'jump', fall: 'jump', sit: 'sit', emote: 'wave',
};

function Remote({ id, world }: { id: string; world: Pick<WorldApi, 'remote'> }) {
  const group = useRef<Group>(null);
  // Animation đổi hiếm (đứng/đi/ngồi) nên dùng state; vị trí đổi mỗi khung hình nên ghi thẳng vào group.
  const [anim, setAnim] = useState<AvatarAnimation>('idle');
  // Nguồn tư thế emote cho avatar này: đọc hành động xã hội của id, hết hạn thì trả false (về locomotion).
  const poseSource = useCallback(
    (out: Pose) => {
      const a = world.remote.actions.get(id, Date.now());
      if (!a) return false;
      return samplePoseOf(out, EMOTES[a.emoteId], (Date.now() - a.startedAt) / 1000, prefersReducedMotion());
    },
    [id, world.remote],
  );
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const s = world.remote.sampleNow(id, Date.now());
    if (!s) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(s.x, 0, s.z);
    const act = canShowAction(s.anim) ? world.remote.actions.get(id, Date.now()) : null;
    if (!act) world.remote.actions.clear(id);
    g.rotation.y = actionYaw(act, s, s.yaw);
    const next = ANIM[s.anim] ?? 'idle';
    if (next !== anim) setAnim(next);
  });
  return (
    <group ref={group} visible={false}>
      <Avatar appearance={world.remote.appearanceOf(id) ?? DEFAULT_APPEARANCE} displayName={world.remote.nameOf(id)} animation={anim} poseSource={poseSource} />
    </group>
  );
}

export function RemotePlayers({ world }: { world: Pick<WorldApi, 'remote' | 'players'> }) {
  return (
    <>
      {world.players.map((id) => (
        <Remote key={id} id={id} world={world} />
      ))}
    </>
  );
}
