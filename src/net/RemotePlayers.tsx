// Vẽ người chơi khác trong Canvas (R3F). Vị trí lấy từ RemoteStore (nội suy), cập nhật thẳng vào group mỗi khung hình,
// React chỉ render lại khi có người vào/ra. Dùng Avatar có sẵn với ngoại hình mặc định (đồng bộ ngoại hình thuộc lát cắt sau).
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Group } from 'three';
import { Avatar } from '../avatar/Avatar';
import { DEFAULT_APPEARANCE } from '../avatar/appearance';
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
    g.rotation.y = s.yaw;
    const next = ANIM[s.anim] ?? 'idle';
    if (next !== anim) setAnim(next);
  });
  return (
    <group ref={group} visible={false}>
      <Avatar appearance={DEFAULT_APPEARANCE} displayName={world.remote.nameOf(id)} animation={anim} />
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
