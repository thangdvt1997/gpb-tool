import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar } from '../avatar/Avatar';
import { getSpatialAudio } from '../audio/spatial';
import { targetHeightM } from '../avatar/MpfbAvatar';
import type { CharacterLook } from '../fashion/types';
import { DEFAULT_APPEARANCE, type Appearance } from '../avatar/appearance';
import { isInternalEmote } from '../emotes/library';
import { getEmoteState, notifyMovement, playInternalEmote } from '../emotes/player';
import { worldPointFromRay } from '../layout/floorPointer';
import { getControls, ROOM_BOUNDS, useControlSnapshot, useGtaPlayer, wrapAngle, type GtaAutopilot } from './controls';
import { useCameraBodyVisibility, useCameraSafety } from './controls/gtaCamera';
import { playerPose } from './controls/playerPose';
import { getSettings } from '../settings';
import { isTapToWalk, type PointerDownRecord } from './controls/tapToWalk';
import { cancelWalkRequest, takeWalkRequest } from './controls/walkRequest';
import { FLOOR, PLAYER_RADIUS, SPAWN, type Rect } from './layout';
import { getMyVisual } from './social/DuelFighters';
import { registerActor, type SocialWorld } from './social/world';

export interface PlayerProps {
  obstacles: Rect[];
  /** Ngoại hình nhân vật. Mặc định DEFAULT_APPEARANCE. */
  appearance?: Appearance;
  /** Gọi mỗi khung hình với vị trí hiện tại (mét, hệ three.js). Dùng để biết người chơi đang ở khu nào. */
  onMove?: (x: number, z: number) => void;
  /** Điểm xuất hiện (mét, hệ three.js) và hướng mặt (rad). Chỉ đọc khi mount. Mặc định SPAWN ở sảnh. */
  spawn?: { x: number; z: number; rotY?: number };
  /** false: khóa phím và click-để-đi (ví dụ khi chuỗi ghi danh đang chạy). Camera vẫn bám. Mặc định true. */
  enabled?: boolean;
  /** Sổ va chạm và thi đấu của cảnh. Có thì nhân vật được đăng ký để chặn xuyên nhau và nhận phản ứng. */
  world?: SocialWorld;
  /** id người dùng trong world. */
  selfId?: string;
  /** Ngoại hình fashion. Có thì dựng mô hình người MPFB theo look này. */
  look?: CharacterLook | null;
  /** true (mặc định): dùng mô hình người MPFB (look suy ra từ appearance nếu không có look). false: nhân vật hình học. */
  mpfb?: boolean;
}

/** Đích đang đi tới: từ click sàn (facingYaw null, không onArrive) hoặc từ walkRequest. */
interface WalkTarget {
  x: number;
  z: number;
  facingYaw: number | null;
  onArrive?: () => void;
}

/** Kẹt khi còn cách đích dưới khoảng này (m) thì coi như đã tới (đích sát vật thể). */
const STUCK_ARRIVE_DIST = 1.0;
/** Còn cách đích chừng này (m) thì đi chậm lại để dừng đúng chỗ (nhân vật có quán tính). */
const SLOW_RADIUS = 0.9;

export function Player({
  obstacles,
  appearance = DEFAULT_APPEARANCE,
  onMove,
  spawn,
  enabled = true,
  world,
  selfId = 'self',
  look,
  mpfb = true,
}: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const { firstPerson } = useControlSnapshot();

  // Vị trí đầu chỉ đặt một lần. Sau đó useGtaPlayer giữ vị trí, đổi prop không kéo nhân vật về.
  const [initial] = useState(() => ({
    x: spawn?.x ?? SPAWN.x,
    z: spawn?.z ?? SPAWN.z,
    // Math.PI = nhìn về -z, tức vào trong sảnh/văn phòng. Camera đứng sau lưng nên nhìn cùng hướng với nhân vật.
    rotY: spawn?.rotY ?? Math.PI,
  }));

  // Đi tới đích (click sàn hoặc walkRequest): useGtaPlayer hỏi hướng đi qua autopilot trước bước chuyển động,
  // nên dùng chung stepMotion, va chạm và quán tính. Phím hoặc joystick ghi đè: xóa đích, hủy walkRequest.
  const target = useRef<WalkTarget | null>(null);
  const stuckFor = useRef(0);
  const yawSink = useRef<((yaw: number) => void) | null>(null);

  const setTarget = useCallback((x: number, z: number, facingYaw: number | null, onArrive?: () => void) => {
    const r = PLAYER_RADIUS;
    target.current = {
      x: Math.min(ROOM_BOUNDS.maxX - r, Math.max(ROOM_BOUNDS.minX + r, x)),
      z: Math.min(ROOM_BOUNDS.maxZ - r, Math.max(ROOM_BOUNDS.minZ + r, z)),
      facingYaw,
      onArrive,
    };
    stuckFor.current = 0;
    const es = getEmoteState();
    if (es.phase !== 'idle' && !(es.id !== null && isInternalEmote(es.id))) notifyMovement();
  }, []);

  const autopilot = useMemo<GtaAutopilot>(() => {
    /** Tới đích: xóa đích, quay về facingYaw (nếu có), rồi báo onArrive. */
    const arrive = (t: WalkTarget): void => {
      target.current = null;
      if (t.facingYaw !== null) yawSink.current?.(wrapAngle(t.facingYaw));
      t.onArrive?.();
    };
    return {
      steer: (keyMove, locked, p, out) => {
        // Yêu cầu đi tới từ nơi khác (agent tương tác). Đang khóa hoặc đang bấm phím thì bỏ yêu cầu.
        const req = takeWalkRequest();
        if (req !== null && !locked && !keyMove) setTarget(req.x, req.z, req.facingYaw, req.onArrive);
        const t = target.current;
        if (t === null) return false;
        if (locked || keyMove) {
          target.current = null;
          cancelWalkRequest();
          return false;
        }
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) {
          arrive(t);
          return false;
        }
        // Đi chậm dần khi gần đích để quán tính không vượt quá.
        const k = Math.min(1, Math.max(0.3, dist / SLOW_RADIUS)) / dist;
        out.x = dx * k;
        out.z = dz * k;
        return true;
      },
      after: (motion, dt) => {
        const t = target.current;
        if (t === null) return;
        // Kẹt vào vật cản quá 0,5 giây: gần đích thì coi như tới nơi, xa thì bỏ đích, không gọi onArrive.
        stuckFor.current = motion.speed < 0.3 ? stuckFor.current + Math.min(dt, 0.05) : 0;
        if (stuckFor.current > 0.5) {
          const d = Math.hypot(t.x - motion.pos.x, t.z - motion.pos.z);
          if (d < STUCK_ARRIVE_DIST) arrive(t);
          else target.current = null;
        }
      },
    };
  }, [setTarget]);

  const { positionRef, yawRef, motion, rig, renderPose } = useGtaPlayer({
    start: initial,
    obstacles,
    enabled,
    // Đang nằm đỡ trong trận thì không đi lại.
    isLocked: () => getMyVisual().locked,
    autopilot,
    // Tầm mắt camera theo chiều cao nhân vật (chibi thấp hơn người thật).
    bodyHeight: look ? targetHeightM(look.bodyStyle, look.body.frame, look.body.heightCm) : undefined,
  });
  yawSink.current = (yaw: number) => {
    yawRef.current = yaw;
    motion.yaw = yaw;
  };
  // Camera (TASK 05): vị trí an toàn + phục hồi khi rơi khỏi map, ẩn thân khi camera ở mắt (firstPerson, inspect).
  useCameraSafety({
    positionRef,
    motion,
    rig,
    obstacles,
    bounds: ROOM_BOUNDS,
    spawn: initial,
    world,
    selfId,
    onRecovered: () => {
      target.current = null;
      cancelWalkRequest();
    },
  });
  useCameraBodyVisibility(group);

  // Mất focus tab: bỏ đích đang tự đi để nhân vật đứng yên.
  useEffect(() => {
    const stop = (): void => {
      target.current = null;
      cancelWalkRequest();
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') stop();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Ghi lúc nhấn xuống để onFloorClick biết là chạm cảm ứng và đo thời gian, quãng di chuyển (tapToWalk.ts).
  const floorDown = useRef<PointerDownRecord | null>(null);
  const onFloorDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    floorDown.current = { pointerType: e.pointerType, t: performance.now(), x: e.clientX, y: e.clientY };
  }, []);

  const onFloorClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      // Chỉ chuột trái (hoặc chạm). Kéo không tính là click. Vật thể có stopPropagation chặn trước.
      if (!enabled || e.button !== 0 || e.delta > 5) return;
      const c = getControls();
      if (c.paused || c.seated || getMyVisual().locked) return;
      const down = floorDown.current;
      floorDown.current = null;
      if (!isTapToWalk(down, { t: performance.now(), x: e.clientX, y: e.clientY }, getSettings().touch.tapToWalk)) return;
      const pt = worldPointFromRay(e.ray);
      if (!pt) return;
      // Click sàn thay đích cũ, kể cả walkRequest đang đi (không gọi onArrive của nó).
      cancelWalkRequest();
      setTarget(pt.x, pt.z, null);
    },
    [enabled, setTarget],
  );

  // Đăng ký vào cảnh để chặn xuyên nhau. playInternalEmote chỉ tác động lên nhân vật này
  // vì bộ phát emote chỉ có một và Avatar bên dưới là nơi duy nhất đọc nó (emote={true}).
  useEffect(() => {
    if (!world) return undefined;
    world.selfId = selfId;
    return registerActor(world, selfId, positionRef.current, PLAYER_RADIUS, (id) => playInternalEmote(id));
  }, [world, selfId, positionRef]);

  // Đăng ký sau useFrame của useGtaPlayer nên chạy sau bước chuyển động và camera trong cùng khung.
  useFrame((_, dt) => {
    const p = positionRef.current;
    const g = group.current;
    // Bước chân (TASK 14): không phát gì khi AudioContext chưa mở khóa.
    getSpatialAudio().updateFootsteps(motion.speed, dt, motion.grounded);
    if (g) {
      // Vẽ theo tư thế nội suy giữa hai bước cố định (TASK 02).
      g.position.set(renderPose.x, renderPose.y, renderPose.z);
      g.rotation.y = renderPose.yaw;
    }
    // Hợp đồng playerPose: ghi sau mọi bước di chuyển của khung này.
    playerPose.x = p.x;
    playerPose.z = p.z;
    playerPose.yaw = yawRef.current;
    onMove?.(p.x, p.z);
  });

  return (
    <>
      {/* Mặt sàn vô hình hứng click. Vật thể có stopPropagation nằm gần camera hơn nên chặn click này. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} onPointerDown={onFloorDown} onClick={onFloorClick}>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* Góc nhìn thứ nhất: ẩn thân nhân vật (camera đặt ở đầu). */}
      <group ref={group} position={[initial.x, 0, initial.z]} rotation={[0, initial.rotY, 0]} visible={!firstPerson}>
        <Avatar appearance={appearance} look={look} mpfb={mpfb} animation="locomotion" emote />
      </group>
    </>
  );
}
