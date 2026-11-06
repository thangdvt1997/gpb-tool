import { useFrame } from '@react-three/fiber';
import { getEmoteState } from '../../emotes/player';
import { updateBumps } from './bumpReactions';
import { triggerNpcReaction, type NpcEmote } from './npcReactions';
import type { SocialWorld } from './world';

/** Tầm đấm vào NPC khi tập quyền (m) tính từ tâm hai thân. */
const PUNCH_REACH = 1.4;

/**
 * Mỗi khung: chặn xuyên nhau và phát phản ứng va chạm giữa các nhân vật, rồi phản ứng của NPC.
 * Phải mount TRƯỚC <Player> để vị trí bị đẩy ra được ghi lại trước khi Player di chuyển tiếp.
 * Không cấp phát trong vòng lặp.
 */
export function SocialLayer({ world }: { world: SocialWorld }) {
  useFrame((_state, delta) => {
    const nowMs = performance.now();
    const dt = delta > 1e-3 ? delta : 1e-3;

    world.actors.forEach((a) => {
      const b = a.body;
      b.x = a.src.x;
      b.z = a.src.z;
      b.vx = (b.x - a.lastX) / dt;
      b.vz = (b.z - a.lastZ) / dt;
    });

    updateBumps(world.bump, world.bodies, nowMs, world.isReactBumpOn, world.handlers);

    world.actors.forEach((a) => {
      const b = a.body;
      if (b.x !== a.src.x) a.src.x = b.x;
      if (b.z !== a.src.z) a.src.z = b.z;
      a.lastX = b.x;
      a.lastZ = b.z;
    });

    if (world.npcs.size === 0) return;
    const me = world.actors.get(world.selfId);
    if (me === undefined) return;
    const es = getEmoteState();
    const punching = es.phase === 'playing' && es.id === 'punch_combo';
    const newPunch = punching && es.startedAt !== world.lastPunchKey;
    if (newPunch) world.lastPunchKey = es.startedAt;
    world.npcs.forEach((n) => {
      const dx = n.src.x - me.body.x;
      const dz = n.src.z - me.body.z;
      const r = n.radius + me.body.radius;
      const d2 = dx * dx + dz * dz;
      let emote: NpcEmote | null = null;
      if (newPunch && d2 < (r + PUNCH_REACH) * (r + PUNCH_REACH)) {
        emote = triggerNpcReaction(world.npc, n.id, n.kind, 'punch', nowMs);
      } else if (d2 < r * r) {
        emote = triggerNpcReaction(world.npc, n.id, n.kind, 'bump', nowMs);
      }
      if (emote !== null) n.onReact?.(emote);
    });
  });
  return null;
}
