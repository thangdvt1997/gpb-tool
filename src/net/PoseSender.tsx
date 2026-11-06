import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPose } from '../scene/controls/playerPose';
import type { WorldApi } from './useWorld';
import { shouldSendPose } from './poseThrottle';

/** Gửi tư thế của mình lên service world tối đa 10 lần/giây, chỉ khi có thay đổi (trong Canvas). */
export function PoseSender({ world }: { world: Pick<WorldApi, 'client' | 'state'> }) {
  const last = useRef({ t: -Infinity, x: NaN, z: NaN, yaw: NaN, seq: 0 });
  useFrame((state) => {
    const c = world.client.current;
    if (!c || world.state !== 'connected') return;
    const now = state.clock.elapsedTime * 1000;
    const l = last.current;
    if (!shouldSendPose(l, playerPose, now)) return;
    l.seq += 1;
    if (c.sendPose({ seq: l.seq, x: playerPose.x, z: playerPose.z, yaw: playerPose.yaw })) {
      l.t = now;
      l.x = playerPose.x;
      l.z = playerPose.z;
      l.yaw = playerPose.yaw;
    }
  });
  return null;
}
