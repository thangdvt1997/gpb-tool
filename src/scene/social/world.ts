import type { InternalEmoteId } from '../../emotes/types';
import { createBumpState, type BumpBody, type BumpHandlers, type BumpState } from './bumpReactions';
import type { Vec2 } from './duelVisuals';
import { createNpcReactionState, type NpcEmote, type NpcKind, type NpcReactionState } from './npcReactions';

/**
 * Sổ đăng ký dùng chung cho va chạm, thi đấu và NPC của một cảnh. Trạng thái nằm trong đối tượng này
 * (không phải React state) nên useFrame chỉ đọc và ghi tại chỗ, không cấp phát.
 */

/** Điểm nguồn của một nhân vật: SocialLayer đọc x, z mỗi khung và ghi lại nếu bị đẩy ra. Vector3 dùng được. */
export interface ActorSource {
  x: number;
  z: number;
}

export interface SocialActor {
  id: string;
  src: ActorSource;
  body: BumpBody;
  /** Vị trí khung trước, để suy ra vận tốc. */
  lastX: number;
  lastZ: number;
  /**
   * Phát emote nội bộ cho CHÍNH nhân vật này. Bộ phát emote hiện chỉ có một (của người chơi),
   * nên chỉ nhân vật của người chơi được gán; nhân vật khác để trống thì bị bỏ qua, không phát nhầm lên ai.
   */
  playEmote?: (id: InternalEmoteId) => void;
}

export interface SocialNpc {
  id: string;
  kind: NpcKind;
  src: ActorSource;
  radius: number;
  /** Được gọi khi phản ứng mới bắt đầu; NPC cũng có thể đọc getNpcReaction(world.npc, id, now) mỗi khung. */
  onReact?: (emote: NpcEmote) => void;
}

export interface SocialWorld {
  selfId: string;
  actors: Map<string, SocialActor>;
  /** Mảng thân dùng cho updateBumps; chỉ dựng lại khi đăng ký hoặc hủy. */
  bodies: BumpBody[];
  /** Vị trí XZ theo id, cập nhật tại chỗ (chính các BumpBody). Truyền thẳng cho DuelFighters. */
  positions: Record<string, Vec2>;
  npcs: Map<string, SocialNpc>;
  /** Tùy chọn reactBump theo người. Không có mục thì mặc định bật. */
  reactBump: Map<string, boolean>;
  bump: BumpState;
  npc: NpcReactionState;
  handlers: BumpHandlers;
  isReactBumpOn: (id: string) => boolean;
  /** Khóa startedAt của lần tập quyền đã tính cho NPC. */
  lastPunchKey: number;
}

export function createSocialWorld(): SocialWorld {
  const world: SocialWorld = {
    selfId: '',
    actors: new Map(),
    bodies: [],
    positions: {},
    npcs: new Map(),
    reactBump: new Map(),
    bump: createBumpState(),
    npc: createNpcReactionState(),
    handlers: {
      onApologize: (walkerId) => {
        world.actors.get(walkerId)?.playEmote?.('apologize');
      },
      onStartle: (victimId) => {
        world.actors.get(victimId)?.playEmote?.('startle');
      },
    },
    isReactBumpOn: (id) => world.reactBump.get(id) !== false,
    lastPunchKey: -1,
  };
  return world;
}

/** Đăng ký một nhân vật. Trả hàm hủy. Đăng ký lại cùng id thì thay thế. */
export function registerActor(
  world: SocialWorld,
  id: string,
  src: ActorSource,
  radius: number,
  playEmote?: (emote: InternalEmoteId) => void,
): () => void {
  const body: BumpBody = { id, x: src.x, z: src.z, radius, vx: 0, vz: 0 };
  const actor: SocialActor = { id, src, body, lastX: src.x, lastZ: src.z, playEmote };
  world.actors.set(id, actor);
  world.positions[id] = body;
  world.bodies = Array.from(world.actors.values(), (a) => a.body);
  return () => {
    if (world.actors.get(id) !== actor) return;
    world.actors.delete(id);
    delete world.positions[id];
    world.bodies = Array.from(world.actors.values(), (a) => a.body);
  };
}

/** Đăng ký NPC hoặc động vật (không chặn đường, không ảnh hưởng người thật). Trả hàm hủy. */
export function registerNpc(world: SocialWorld, npc: SocialNpc): () => void {
  world.npcs.set(npc.id, npc);
  return () => {
    if (world.npcs.get(npc.id) === npc) world.npcs.delete(npc.id);
  };
}
