import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getEmoteState, notifyMovement } from '../../emotes/player';
import { isInternalEmote } from '../../emotes/library';
import { playerLocomotion, stepLocomotion } from '../../avatar/animation';
import { FLOOR, OUTER_WALL, PLAYER_RADIUS, type Rect } from '../layout';
import { CAM, createCameraRig, useGtaCamera, type CameraFrame, type CameraRig } from './gtaCamera';
import { createMotionInput, createMotionState, haltMotion, stepMotion, type MotionState } from './gtaMotion';
import { getControls, setFirstPerson, setSeated, takeSeatRequest, type SeatSpot } from './session';
import { useGtaControls, useSessionHotkeys, type MoveInput } from './useGtaControls';
import { advanceFixedStep, createFixedStepper, lerpAngle } from '../motion/fixedStep';

export { useGtaControls, useSessionHotkeys, isTypingTarget, type GtaControls, type MoveInput } from './useGtaControls';
export {
  stepMotion,
  createMotionState,
  createMotionInput,
  haltMotion,
  wrapAngle,
  MOTION,
  type MotionState,
  type MotionInput,
} from './gtaMotion';
export { useGtaCamera, updateGtaCamera, createCameraRig, CAM, type CameraRig, type CameraFrame } from './gtaCamera';
export { playerPose } from './playerPose';
export { requestWalk, takeWalkRequest, cancelWalkRequest, type WalkRequest } from './walkRequest';
export {
  useControlSnapshot,
  getControls,
  subscribeControls,
  setPaused,
  setFirstPerson,
  toggleFirstPerson,
  updateSettings,
  requestSit,
  requestStand,
  requestTouchJump,
  resetTouchInput,
  touchInput,
  SENSITIVITY_RANGE,
  type ControlSettings,
  type ControlSnapshot,
  type SeatSpot,
} from './session';

/** Biên trong của phòng (lòng tường ngoài). Bán kính nhân vật do stepMotion tự trừ. */
export const ROOM_BOUNDS: Rect = {
  minX: -FLOOR.width / 2 + OUTER_WALL.thickness,
  maxX: FLOOR.width / 2 - OUTER_WALL.thickness,
  minZ: -FLOOR.depth / 2 + OUTER_WALL.thickness,
  maxZ: FLOOR.depth / 2 - OUTER_WALL.thickness,
};

/** Độ cao mắt (góc nhìn thứ nhất) và điểm nhìn (góc nhìn thứ ba) khi đứng và khi ngồi (m). */
const EYE_STAND = 1.58;
const EYE_SIT = 1.18;
const TARGET_SIT = 1.1;

/**
 * Tự đi (click sàn, walkRequest). useGtaPlayer gọi trước bước chuyển động của mỗi khung.
 * - steer: trả true và ghi hướng đi (hệ thế giới) vào out khi đang tự đi. keyMove: người chơi đang bấm phím
 *   hoặc joystick; locked: đang khóa (tạm dừng, ngồi, trận đấu). Bên gọi tự hủy đích khi cần.
 * - after: gọi sau bước chuyển động của khung có tự đi, để kiểm tra tới nơi hoặc kẹt.
 */
export interface GtaAutopilot {
  steer: (
    keyMove: boolean,
    locked: boolean,
    pos: { readonly x: number; readonly z: number },
    out: { x: number; z: number },
  ) => boolean;
  after: (motion: MotionState, dt: number) => void;
}

export interface GtaPlayerOptions {
  /** Điểm xuất hiện. rotY mặc định Math.PI (nhìn về -z, vào trong văn phòng). Chỉ đọc khi mount. */
  start: { x: number; z: number; rotY?: number };
  obstacles: Rect[];
  /** false thì nhả phím và ngừng điều khiển (camera vẫn bám). Mặc định true. */
  enabled?: boolean;
  /** Gọi mỗi khung; true thì bỏ qua phím (ví dụ đang nằm đỡ trong trận). Không cấp phát. */
  isLocked?: () => boolean;
  autopilot?: GtaAutopilot;
}

export interface GtaPlayer {
  /** Vị trí hiện tại, cập nhật mỗi khung. Có thể ghi vào (dịch chuyển), hook sẽ đọc lại. */
  positionRef: MutableRefObject<THREE.Vector3>;
  /** Hướng mặt (rad), g.rotation.y = yawRef.current. */
  yawRef: MutableRefObject<number>;
  /** Có thể ghi yaw vào đây (ví dụ khi tới đích của walkRequest), hook sẽ đọc lại. */
  motion: MotionState;
  rig: CameraRig;
  /**
   * Tư thế để vẽ (TASK 02): nội suy giữa hai bước mô phỏng cố định 60 Hz theo alpha, nên màn hình 120/144 Hz
   * không giật. Chỉ đọc. positionRef vẫn là trạng thái mô phỏng.
   */
  renderPose: { x: number; y: number; z: number; yaw: number };
  /** Đổi giá trị mới re-render, không phải mỗi khung. */
  isMoving: boolean;
  isRunning: boolean;
}

/** Chỗ đang ngồi và chỗ đứng trước khi ngồi (để đứng dậy đúng chỗ, ngoài vật cản). */
interface Seated {
  seat: SeatSpot;
  standX: number;
  standZ: number;
  standYaw: number;
}

/**
 * Điều khiển kiểu GTA + camera bám. Chỉ dùng bên trong <Canvas>. Tách lớp:
 * input (useGtaControls, session), chuyển động (gtaMotion), camera (gtaCamera), hoạt ảnh (stepLocomotion).
 * Khung hình: đọc phím, quy hướng theo camera, stepMotion, cập nhật trộn hoạt ảnh, rồi camera.
 */
export function useGtaPlayer({ start, obstacles, enabled = true, isLocked, autopilot }: GtaPlayerOptions): GtaPlayer {
  const controls = useGtaControls(enabled);
  useSessionHotkeys(enabled);

  const positionRef = useRef<THREE.Vector3>(null as unknown as THREE.Vector3);
  if (positionRef.current === null) positionRef.current = new THREE.Vector3(start.x, 0, start.z);
  const yawRef = useRef<number>(start.rotY ?? Math.PI);
  const motionRef = useRef<MotionState | null>(null);
  if (motionRef.current === null) motionRef.current = createMotionState(positionRef.current, yawRef.current);
  const motion = motionRef.current;
  const rigRef = useRef<CameraRig | null>(null);
  if (rigRef.current === null) rigRef.current = createCameraRig(yawRef.current);
  const rig = rigRef.current;

  const scratchMove = useRef<MoveInput>({ forward: 0, strafe: 0 }).current;
  const input = useRef(createMotionInput()).current;
  const autoDir = useRef({ x: 0, z: 0 }).current;
  const seated = useRef<Seated | null>(null);
  const camFrame = useRef<CameraFrame>({ firstPerson: false, eyeHeight: EYE_STAND, targetHeight: CAM.targetHeight }).current;

  const [isMoving, setIsMoving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const isMovingPrev = useRef(false);
  const isRunningPrev = useRef(false);
  const autopilotRef = useRef(autopilot);
  autopilotRef.current = autopilot;
  // Bước thời gian cố định (TASK 02, docs/design/MOTION.md): stepMotion luôn chạy với h = 1/60 s.
  const stepper = useRef(createFixedStepper()).current;
  const prevPose = useRef({ x: start.x, y: 0, z: start.z, yaw: yawRef.current }).current;
  const renderPose = useRef({ x: start.x, y: 0, z: start.z, yaw: yawRef.current }).current;
  /** Nhảy bấm ở khung không có bước mô phỏng nào thì giữ tới bước kế tiếp. */
  const pendingJump = useRef(false);

  // Đổi enabled sang false giữa chừng: dừng hẳn.
  useEffect(() => {
    if (!enabled) {
      haltMotion(motion);
      setIsMoving(false);
      setIsRunning(false);
    }
  }, [enabled, motion]);

  // Rời cảnh: không còn ngồi, trở lại góc nhìn thứ ba.
  useEffect(
    () => () => {
      setSeated(false);
      setFirstPerson(false);
    },
    [],
  );

  useFrame((_state, dt) => {
    const ctl = getControls();
    const pos = positionRef.current;
    // positionRef và yawRef là nguồn sự thật, bên ngoài có thể ghi vào.
    motion.yaw = yawRef.current;
    const live = enabled && !ctl.paused && !(isLocked !== undefined && isLocked());

    // Ngồi, đứng dậy (yêu cầu từ InteractTracker).
    const req = takeSeatRequest();
    if (req === 'stand') {
      const prev = seated.current;
      if (prev !== null) {
        seated.current = null;
        pos.set(prev.standX, 0, prev.standZ);
        yawRef.current = motion.yaw = prev.standYaw;
        haltMotion(motion);
        setSeated(false);
      }
    } else if (req !== null && live && motion.grounded && seated.current === null) {
      seated.current = { seat: req, standX: pos.x, standZ: pos.z, standYaw: motion.yaw };
      setSeated(true);
    }

    const mv = controls.getMoveInput(scratchMove);
    const f = live ? mv.forward : 0;
    const st = live ? mv.strafe : 0;
    const keyMove = f !== 0 || st !== 0;
    if (controls.consumeJump() && live) pendingJump.current = true;
    if (!live) pendingJump.current = false;

    const seat = seated.current;
    if (seat !== null) {
      // Ngồi: khóa di chuyển, căn đúng chỗ ghế. Phím di chuyển và nhảy bị bỏ qua (E để đứng dậy).
      pos.set(seat.seat.x, 0, seat.seat.z);
      motion.yaw = seat.seat.yaw;
      haltMotion(motion);
    } else {
      // Hướng đi theo camera: tiến = hướng nhìn camera, phải = bên phải màn hình.
      const sinA = Math.sin(rig.azimuth);
      const cosA = Math.cos(rig.azimuth);
      input.dirX = sinA * f - cosA * st;
      input.dirZ = cosA * f + sinA * st;
      input.run = live && controls.isRunning();
      input.faceYaw = ctl.firstPerson ? rig.azimuth : null;

      const ap = autopilotRef.current;
      let auto = false;
      if (ap !== undefined && ap.steer(keyMove, !live, pos, autoDir)) {
        auto = true;
        input.dirX = autoDir.x;
        input.dirZ = autoDir.z;
        input.run = false;
        input.faceYaw = null;
      }
      let jumped = false;
      advanceFixedStep(stepper, dt, (h) => {
        prevPose.x = pos.x;
        prevPose.y = pos.y;
        prevPose.z = pos.z;
        prevPose.yaw = motion.yaw;
        // Nhảy chỉ tiêu ở bước đầu tiên của khung.
        input.jump = pendingJump.current;
        pendingJump.current = false;
        stepMotion(motion, input, h, PLAYER_RADIUS, obstacles, ROOM_BOUNDS);
        jumped ||= motion.jumped;
        if (auto && ap !== undefined) ap.after(motion, h);
      });
      motion.jumped = jumped;

      // Emote nội bộ (apologize, startle, hit, down) do cảnh phát, không bị phím di chuyển hủy.
      const intent = keyMove || motion.jumped;
      const es = getEmoteState();
      if (intent && es.phase !== 'idle' && !(es.id !== null && isInternalEmote(es.id))) notifyMovement();
    }
    yawRef.current = motion.yaw;

    // Tư thế vẽ: nội suy prev -> hiện tại. Dịch chuyển lớn (ngồi, đứng dậy, hồi vị trí) thì nhảy thẳng.
    const a = stepper.alpha;
    if (Math.hypot(pos.x - prevPose.x, pos.z - prevPose.z) > 1 || seat !== null) {
      prevPose.x = pos.x;
      prevPose.y = pos.y;
      prevPose.z = pos.z;
      prevPose.yaw = motion.yaw;
    }
    renderPose.x = prevPose.x + (pos.x - prevPose.x) * a;
    renderPose.y = prevPose.y + (pos.y - prevPose.y) * a;
    renderPose.z = prevPose.z + (pos.z - prevPose.z) * a;
    renderPose.yaw = lerpAngle(prevPose.yaw, motion.yaw, a);

    stepLocomotion(playerLocomotion, motion.speed, motion.grounded, seat !== null, dt);
    const sitW = playerLocomotion.sit;
    camFrame.firstPerson = ctl.firstPerson;
    camFrame.eyeHeight = EYE_STAND + (EYE_SIT - EYE_STAND) * sitW;
    camFrame.targetHeight = CAM.targetHeight + (TARGET_SIT - CAM.targetHeight) * sitW;

    const moving = motion.moved || !motion.grounded;
    if (moving !== isMovingPrev.current) {
      isMovingPrev.current = moving;
      setIsMoving(moving);
    }
    if (motion.running !== isRunningPrev.current) {
      isRunningPrev.current = motion.running;
      setIsRunning(motion.running);
    }
  });

  // Đăng ký sau useFrame chuyển động để camera dùng vị trí của chính khung này.
  useGtaCamera({ rig, positionRef, obstacles, bounds: ROOM_BOUNDS, getFrame: () => camFrame });

  return { positionRef, yawRef, motion, rig, renderPose, isMoving, isRunning };
}
