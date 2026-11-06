import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Camera, Object3D, PerspectiveCamera } from 'three';
import { applyMouseDelta, getSettings } from '../../settings';
import { isAction } from './bindings';
import { getCharacterState } from '../interact/characterState';
import type { Rect } from '../layout';
import { isInsideOffice } from '../officeBounds';
import type { SocialWorld } from '../social/world';
import {
  createCameraModeController,
  createComfortStore,
  effectiveShake,
  MODE_POLICY,
  type CameraMode,
  type CameraModeController,
  type ComfortStore,
  type StorageLike,
} from './cameraModes';
import { haltMotion, wrapAngle, type MotionState } from './gtaMotion';
import { playerPose } from './playerPose';
import {
  createFallWatch,
  createSafeTracker,
  mapStatus,
  type Point2,
  type RecoveryTarget,
  type SafeWorld,
} from './safePosition';
import { getControls, setPaused, subscribeControls } from './session';

export const CAM = {
  minDist: 2.5,
  maxDist: 20,
  /** Lúc vào: 7,5 m sau lưng, nhìn xuống 0,5 rad để thấy cả nhân vật và khu quanh bàn. */
  startDist: 7.5,
  /** Góc ngẩng góc nhìn thứ ba (rad): 0 là ngang tầm mắt, lớn hơn là nhìn từ trên xuống. */
  minPitch: 0.05,
  maxPitch: 1.25,
  startPitch: 0.5,
  /** Góc nhìn thứ nhất: dương là cúi xuống, âm là ngẩng lên. */
  fpMinPitch: -1.2,
  fpMaxPitch: 1.3,
  /** Độ cao điểm nhìn trên chân nhân vật (m), cao hơn vai (vai khoảng 1,38 m). */
  targetHeight: 1.5,
  /** Bán kính quả cầu quét camera = khoảng giữ cách vật cản (m). */
  wallMargin: 0.25,
  /** Khoảng gần nhất khi bị vật cản ép (m), nhỏ hơn thì xuyên mặt nhân vật. */
  hardMinDist: 1.2,
  /**
   * Đỉnh cao nhất của vật cản (m): tường ngoài 3,2 m (OUTER_WALL.height) cộng khoảng hở.
   * Tia nhìn từ mắt nhân vật lên camera đã cao hơn mức này khi tới vật cản thì vật cản không che, camera không co lại.
   */
  obstacleTop: 3.35,
  /**
   * Collision mask: vật cản có cạnh dài nhất dưới mức này (m) là props nhỏ (ghế, chậu cây, thùng rác),
   * camera bỏ qua để không bị kéo sát nhân vật. Nhân vật vẫn va chạm với chúng (gtaMotion không đổi).
   */
  smallPropSize: 0.7,
  /** Hết vướng phải giữ chừng này (s) mới nở lại, tránh dao động giữa hai khoảng cách. */
  expandDelay: 0.2,
  /** Góc ngẩng tối đa khi bị ép ở góc tường (camera nâng lên trên đầu thay vì chui vào tường). */
  cornerMaxPitch: 1.4,
  /** Mặt phẳng cắt gần (m): thường và khi camera sát (mắt, ngồi sát bàn). */
  near: 0.1,
  nearClose: 0.05,
  /** Dưới khoảng này (m) dùng nearClose; trên closeDistOff thì về near (trễ để không đổi qua lại). */
  closeDistOn: 1.6,
  closeDistOff: 1.9,
  /** rad/px ở độ nhạy 1. */
  dragSensitivity: 0.005,
  zoomSensitivity: 0.0012,
  /** Bám góc quay và góc ngẩng (1/s): nhanh để chuột không trễ, vẫn mượt. */
  lookRate: 22,
  /** Bám vị trí nhân vật theo mặt phẳng và theo chiều cao (1/s). Chiều cao chậm hơn để nhảy không giật camera. */
  followRate: 14,
  followRateY: 7,
  /** Nở lại sau khi hết vướng vật cản, và chuyển khoảng cách khi đổi chế độ (1/s). */
  zoomRate: 5,
  /** Lệch quá chừng này (m) thì nhảy thẳng (dịch chuyển, xuất hiện lại). */
  snapDist: 4,
  /** Kéo cảm ứng dưới ngưỡng này (px) vẫn tính là chạm, để chạm-để-đi không bị nuốt. */
  dragThresholdPx: 6,
  /** Rung: biên độ tối đa (m) và tốc độ tắt (1/s). */
  shakeMax: 0.15,
  shakeDecay: 6,
} as const;

export interface CameraRig {
  /** Hướng nhìn ngang người dùng đặt (rad, tuyệt đối, quy ước playerPose). */
  yaw: number;
  /** Góc ngẩng người dùng đặt (rad). */
  pitchGoal: number;
  /** Hướng nhìn và góc ngẩng đã làm mượt. Hướng di chuyển của phím lấy theo azimuth. */
  azimuth: number;
  pitch: number;
  /** Khoảng cách người dùng muốn (zoom). */
  wantDist: number;
  /** Khoảng cách thực tế sau khi tránh vật cản và làm mượt. */
  dist: number;
  /** Điểm bám đã làm mượt (chân nhân vật). */
  fx: number;
  fy: number;
  fz: number;
  dragging: boolean;
  initialized: boolean;
  /** Thời gian còn phải chờ trước khi nở lại sau va chạm (s). */
  expandHold: number;
  /** Góc ngẩng thêm khi bị ép ở góc tường (rad). */
  pitchBoost: number;
  /** Đang dùng near gần (trễ theo closeDistOn/Off). */
  nearClose: boolean;
  /** Chế độ camera của khung gần nhất. */
  mode: CameraMode;
}

export function createCameraRig(yaw: number = Math.PI): CameraRig {
  return {
    yaw,
    pitchGoal: CAM.startPitch,
    azimuth: yaw,
    pitch: CAM.startPitch,
    wantDist: CAM.startDist,
    dist: CAM.startDist,
    fx: 0,
    fy: 0,
    fz: 0,
    dragging: false,
    initialized: false,
    expandHold: 0,
    pitchBoost: 0,
    nearClose: false,
    mode: 'thirdPerson',
  };
}

// ---- Bộ điều khiển chế độ và tùy chọn dễ chịu (một người chơi mỗi trang) ----

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Chế độ camera: thirdPerson/firstPerson (phím V), seated, overview, inspect. Xem docs/design/CAMERA.md. */
export const cameraModes: CameraModeController = createCameraModeController();
/** Giảm chuyển động, hệ số rung. Lưu localStorage 'gpb.camera.comfort.v1'. */
export const cameraComfort: ComfortStore = createComfortStore(browserStorage(), prefersReducedMotion());

/** Nguồn yêu cầu chế độ do camera tự đồng bộ từ trạng thái phiên/nhân vật. */
export const MODE_SOURCE = {
  seated: 'session:seated',
  inspect: 'character:using_ui',
  overview: 'user:overview',
} as const;

/** Bật/tắt toàn cảnh do người chơi chủ động. Esc thoát về chế độ trước. */
export function toggleOverview(): void {
  if (cameraModes.has(MODE_SOURCE.overview)) cameraModes.release(MODE_SOURCE.overview);
  else cameraModes.request('overview', MODE_SOURCE.overview, { escapable: true });
}

const shake = { amp: 0, t: 0 };

/** Rung camera (0..1). Nhân hệ số của người dùng; tắt hẳn khi giảm chuyển động. Chưa có nơi gọi trong cảnh. */
export function addCameraShake(strength: number): void {
  const a = effectiveShake(strength, cameraComfort.get()) * CAM.shakeMax;
  if (a > shake.amp) shake.amp = a;
}

function clampPitch(rig: CameraRig, mode: CameraMode): void {
  const p = MODE_POLICY[mode];
  rig.pitchGoal = Math.min(p.maxPitch, Math.max(p.minPitch, rig.pitchGoal));
}

/** Collision mask của camera: true nếu vật cản đủ lớn để chặn camera. */
export function isCameraBlocker(r: Rect): boolean {
  return Math.max(r.maxX - r.minX, r.maxZ - r.minZ) >= CAM.smallPropSize;
}

const blockerCache = new WeakMap<readonly Rect[], readonly Rect[]>();

/** Lọc vật cản theo mask, nhớ theo tham chiếu mảng (không lọc lại mỗi khung). */
export function cameraBlockers(obstacles: readonly Rect[]): readonly Rect[] {
  let out = blockerCache.get(obstacles);
  if (out === undefined) {
    out = obstacles.filter(isCameraBlocker);
    blockerCache.set(obstacles, out);
  }
  return out;
}

/**
 * Quét cầu (sphere sweep) theo hình chiếu ngang: khoảng cách ngang từ gốc (ox, oz) theo hướng đơn vị (dx, dz)
 * tới vật cản đầu tiên, tối đa `len`. Mỗi vật cản là hộp nở thêm `margin` (bán kính cầu, xấp xỉ Minkowski
 * bảo thủ ở góc), cộng biên trong của phòng. Phương pháp slab, không cấp phát.
 */
export function clearRayLength(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  len: number,
  margin: number,
  obstacles: readonly Rect[],
  bounds?: Rect,
  /**
   * Độ cao tia nhìn: tại khoảng ngang t, tia ở độ cao baseY + t * rise. Vật cản gặp ở t mà tia đã cao hơn top
   * thì bỏ qua (tia đi bên trên, không xuyên). Bỏ trống thì coi vật cản cao vô hạn.
   */
  height?: { baseY: number; rise: number; top: number },
): number {
  const over =
    height && height.rise > 1e-6 ? Math.max(0, (height.top - height.baseY) / height.rise) : Number.POSITIVE_INFINITY;
  let best = len;
  for (let i = 0; i < obstacles.length; i++) {
    const r = obstacles[i]!;
    const x0 = r.minX - margin;
    const x1 = r.maxX + margin;
    const z0 = r.minZ - margin;
    const z1 = r.maxZ + margin;
    // Gốc nằm trong hộp nở (nhân vật sát vật thể hoặc đang ngồi ở bàn): bỏ qua, nếu không camera bị ép về 0.
    if (ox > x0 && ox < x1 && oz > z0 && oz < z1) continue;
    let tMin = 0;
    let tMax = best;
    if (Math.abs(dx) < 1e-9) {
      if (ox <= x0 || ox >= x1) continue;
    } else {
      const a = (x0 - ox) / dx;
      const b = (x1 - ox) / dx;
      tMin = Math.max(tMin, Math.min(a, b));
      tMax = Math.min(tMax, Math.max(a, b));
    }
    if (Math.abs(dz) < 1e-9) {
      if (oz <= z0 || oz >= z1) continue;
    } else {
      const a = (z0 - oz) / dz;
      const b = (z1 - oz) / dz;
      tMin = Math.max(tMin, Math.min(a, b));
      tMax = Math.min(tMax, Math.max(a, b));
    }
    if (tMin <= tMax && tMin < best && tMin < over) best = tMin;
  }
  if (bounds) {
    const bx0 = bounds.minX + margin;
    const bx1 = bounds.maxX - margin;
    const bz0 = bounds.minZ + margin;
    const bz1 = bounds.maxZ - margin;
    const hit = (t: number): void => {
      if (t < over) best = Math.min(best, t);
    };
    if (dx > 1e-9) hit((bx1 - ox) / dx);
    else if (dx < -1e-9) hit((bx0 - ox) / dx);
    if (dz > 1e-9) hit((bz1 - oz) / dz);
    else if (dz < -1e-9) hit((bz0 - oz) / dz);
  }
  return Math.max(0, best);
}

/** Tia nhìn dùng lại mỗi khung hình (không cấp phát). */
const SIGHT = { baseY: 0, rise: 0, top: 0 };

export interface CameraFrame {
  /** Góc nhìn thứ nhất. */
  firstPerson: boolean;
  /** Độ cao mắt trên chân (m), dùng cho góc nhìn thứ nhất. */
  eyeHeight: number;
  /** Độ cao điểm nhìn góc nhìn thứ ba (m), hạ xuống khi ngồi. */
  targetHeight: number;
}

/**
 * Cập nhật camera mỗi khung hình. Hướng nhìn do chuột đặt (rig.yaw), không bám hướng mặt nhân vật,
 * nên đứng yên vẫn nhìn quanh được. Camera thứ ba đứng sau điểm bám (anchor = chân + targetHeight),
 * co lại ngay khi quả cầu quét chạm vật cản, chờ expandDelay rồi nở lại mượt. Không tạo đối tượng mới.
 * `mode` bỏ trống thì suy từ frame.firstPerson (tương thích cách gọi cũ).
 */
export function updateGtaCamera(
  rig: CameraRig,
  camera: Camera,
  tx: number,
  ty: number,
  tz: number,
  dt: number,
  obstacles: readonly Rect[],
  bounds: Rect | undefined,
  frame: CameraFrame,
  mode: CameraMode = frame.firstPerson ? 'firstPerson' : 'thirdPerson',
): void {
  const d = Math.min(Math.max(dt, 0), 0.1);
  const comfort = cameraComfort.get();
  const pol = MODE_POLICY[mode];
  const kLook = 1 - Math.exp(-CAM.lookRate * d);
  const kZoom = comfort.reduceMotion ? 1 : 1 - Math.exp(-CAM.zoomRate * d);
  rig.mode = mode;

  clampPitch(rig, mode);
  if (!rig.initialized || Math.hypot(tx - rig.fx, tz - rig.fz) > CAM.snapDist) {
    rig.fx = tx;
    rig.fy = ty;
    rig.fz = tz;
  }
  if (!rig.initialized) {
    rig.azimuth = rig.yaw;
    rig.pitch = rig.pitchGoal;
    rig.dist = Math.min(rig.wantDist, rig.dist);
    rig.initialized = true;
  } else {
    // Bù trừ theo delta time: xoay nhanh vẫn hội tụ, không vượt quá đích.
    rig.azimuth = wrapAngle(rig.azimuth + wrapAngle(rig.yaw - rig.azimuth) * kLook);
    rig.pitch += (rig.pitchGoal - rig.pitch) * kLook;
  }

  const sinA = Math.sin(rig.azimuth);
  const cosA = Math.cos(rig.azimuth);

  if (pol.eye) {
    // Đầu nhân vật (firstPerson, inspect): bám thẳng vị trí (không trễ) để không thấy thân, nhìn theo yaw và pitch.
    const cosP = Math.cos(rig.pitch);
    const sinP = Math.sin(rig.pitch);
    rig.fx = tx;
    rig.fy = ty;
    rig.fz = tz;
    rig.pitchBoost = 0;
    const ex = tx + sinA * 0.12;
    const ey = ty + frame.eyeHeight;
    const ez = tz + cosA * 0.12;
    camera.position.set(ex, ey, ez);
    camera.lookAt(ex + sinA * cosP, ey - sinP, ez + cosA * cosP);
    return;
  }

  const kXZ = 1 - Math.exp(-CAM.followRate * d);
  // Giảm chuyển động: chiều cao bám nhanh như mặt phẳng, không nhún theo cú nhảy.
  const kY = comfort.reduceMotion ? kXZ : 1 - Math.exp(-CAM.followRateY * d);
  rig.fx += (tx - rig.fx) * kXZ;
  rig.fz += (tz - rig.fz) * kXZ;
  rig.fy += (ty - rig.fy) * kY;
  const fx = rig.fx;
  const fz = rig.fz;
  const eyeY = rig.fy + frame.targetHeight;
  // Camera nằm ngược hướng nhìn: (-sinA, -cosA) trên mặt phẳng.
  const hx = -sinA;
  const hz = -cosA;

  const basePitch = rig.pitch;
  const cosB = Math.cos(basePitch);
  const sinB = Math.sin(basePitch);
  // Quét từ vị trí thật của nhân vật (không phải điểm bám trễ), chỉ với vật cản qua mask.
  const wantH = rig.wantDist * cosB;
  SIGHT.baseY = eyeY;
  SIGHT.rise = sinB / Math.max(cosB, 1e-3);
  SIGHT.top = CAM.obstacleTop;
  const clearH = clearRayLength(tx, tz, hx, hz, wantH, CAM.wallMargin, cameraBlockers(obstacles), bounds, SIGHT);

  // Góc tường / chỗ hẹp: khoảng ngang còn lại không đủ cho hardMinDist thì nâng camera lên trên đầu
  // (tăng góc ngẩng) thay vì đặt camera trong tường.
  let boostGoal = 0;
  const minH = CAM.hardMinDist * cosB;
  if (clearH < minH) {
    const need = Math.acos(Math.min(1, Math.max(0, clearH / CAM.hardMinDist)));
    boostGoal = Math.max(0, Math.min(CAM.cornerMaxPitch, need) - basePitch);
  }
  if (boostGoal > rig.pitchBoost) rig.pitchBoost = boostGoal;
  else rig.pitchBoost += (boostGoal - rig.pitchBoost) * kZoom;
  const pitch = basePitch + rig.pitchBoost;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const allowed = Math.max(CAM.hardMinDist, clearH / Math.max(cosB, 0.2));
  if (rig.dist > allowed) {
    // Va chạm: co ngay, bắt đầu đếm thời gian chờ nở lại.
    rig.dist = allowed;
    rig.expandHold = CAM.expandDelay;
  } else {
    const goal = Math.min(rig.wantDist, allowed);
    if (goal > rig.dist && rig.expandHold > 0) {
      rig.expandHold -= d;
    } else {
      rig.dist += (goal - rig.dist) * kZoom;
    }
  }

  const h = rig.dist * cosP;
  let px = fx + hx * h;
  let py = eyeY + rig.dist * sinP;
  let pz = fz + hz * h;
  if (shake.amp > 1e-4) {
    shake.t += d;
    px += Math.sin(shake.t * 37) * shake.amp;
    py += Math.sin(shake.t * 53 + 1.3) * shake.amp * 0.6;
    pz += Math.sin(shake.t * 41 + 2.1) * shake.amp;
    shake.amp *= Math.exp(-CAM.shakeDecay * d);
    if (comfort.reduceMotion) shake.amp = 0;
  }
  camera.position.set(px, py, pz);
  camera.lookAt(fx, eyeY, fz);
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/**
 * Gắn điều khiển camera lên canvas. Trả hàm gỡ.
 * - Chuột: GIỮ CHUỘT PHẢI và kéo để xoay camera (ngang và dọc). Chuột trái để dành cho click-để-đi và chọn vật.
 * - Cảm ứng: kéo một ngón trên canvas (vùng bên phải, joystick nằm bên trái) để xoay camera; chạm nhẹ vẫn là chạm-để-đi.
 * - Cuộn chuột: đổi khoảng cách camera trong giới hạn của chế độ (chặn cuộn trang).
 * - Tạm dừng, hoặc chế độ không cho xoay (inspect: UI giữ chuột): bỏ qua thao tác, nhả kéo đang dở.
 * - Đổi chế độ: nhả kéo và pointer capture, để thoát chế độ không làm mất con trỏ.
 */
export function attachCameraInput(
  el: HTMLElement,
  rig: CameraRig,
  getSensitivity: () => number,
  modes: CameraModeController = cameraModes,
): () => void {
  let pointerId = -1;
  let isTouch = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragged = false;

  const prevTouchAction = el.style.touchAction;
  // Không để trình duyệt cuộn hoặc phóng trang khi kéo trên canvas.
  el.style.touchAction = 'none';

  const stop = (): void => {
    if (pointerId !== -1) {
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* đã thả */
      }
    }
    pointerId = -1;
    rig.dragging = false;
  };

  const look = (dx: number, dy: number): void => {
    if (!modes.getPolicy().orbit) return;
    const m = getSettings().mouse;
    const d = applyMouseDelta(dx, dy, { sensitivity: getSensitivity(), invertX: m.invertX, invertY: m.invertY });
    rig.yaw = wrapAngle(rig.yaw - d.dx * CAM.dragSensitivity);
    rig.pitchGoal += d.dy * CAM.dragSensitivity;
    clampPitch(rig, modes.getMode());
  };

  const onDown = (e: PointerEvent): void => {
    if (pointerId !== -1 || getControls().paused || !modes.getPolicy().orbit) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!touch && e.button !== 2) return;
    pointerId = e.pointerId;
    isTouch = touch;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    dragged = false;
    if (!touch) {
      // Chuột phải: xoay ngay, không cần ngưỡng.
      e.preventDefault();
      dragged = true;
      rig.dragging = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* bỏ qua */
      }
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    if (getControls().paused || !modes.getPolicy().orbit) {
      stop();
      return;
    }
    if (!isTouch && (e.buttons & 2) === 0) {
      // Đã thả nút phải mà pointerup không tới (thả ngoài cửa sổ).
      stop();
      return;
    }
    if (!dragged) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < CAM.dragThresholdPx) return;
      dragged = true;
      rig.dragging = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* con trỏ đã thả, bỏ qua */
      }
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    look(dx, dy);
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    stop();
  };
  // Sau một lần kéo cảm ứng, nuốt click kế tiếp để không kích hoạt chạm-để-đi hay chọn vật.
  const onClickCapture = (e: MouseEvent): void => {
    if (dragged && isTouch) {
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const pol = modes.getPolicy();
    if (getControls().paused || !pol.zoom) return;
    const next = rig.wantDist * Math.exp(e.deltaY * CAM.zoomSensitivity);
    rig.wantDist = Math.min(pol.maxDist, Math.max(pol.minDist, next));
  };
  const onContextMenu = (e: Event): void => {
    // Chuột phải dùng để xoay camera: không mở menu ngữ cảnh trên canvas.
    e.preventDefault();
  };
  // Mở menu tạm dừng: nhả kéo đang dở và giải phóng con trỏ.
  const unsub = subscribeControls(() => {
    if (!getControls().paused) return;
    stop();
    dragged = false;
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* bỏ qua */
    }
  });
  const unsubModes = modes.subscribe(() => {
    stop();
    dragged = false;
  });

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', stop);
  el.addEventListener('click', onClickCapture);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', stop);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('lostpointercapture', stop);
    el.removeEventListener('click', onClickCapture);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('blur', stop);
    unsub();
    unsubModes();
    stop();
    el.style.touchAction = prevTouchAction;
  };
}

/**
 * Hợp đồng enter/exit của camera: rời chế độ thì lưu yaw/pitch/khoảng cách mục tiêu,
 * vào lại thì khôi phục; lần đầu vào thì dùng startPitch/startDist của chế độ.
 * inspect quay camera theo hướng mặt nhân vật; rời inspect khôi phục cả yaw.
 */
function bindModeHooks(rig: CameraRig, modes: CameraModeController): void {
  modes.setHooks({
    exit: () => ({ yaw: rig.yaw, pitch: rig.pitchGoal, dist: rig.wantDist }),
    enter: (to, from, saved) => {
      const pol = MODE_POLICY[to];
      if (to === 'inspect') {
        rig.yaw = playerPose.yaw;
        rig.pitchGoal = pol.startPitch;
      } else if (saved !== undefined) {
        rig.pitchGoal = saved.pitch;
        if (!pol.eye) rig.wantDist = saved.dist;
        if (from === 'inspect') rig.yaw = saved.yaw;
      } else if (!pol.eye) {
        rig.pitchGoal = pol.startPitch;
        rig.wantDist = pol.startDist;
      }
      rig.wantDist = Math.min(pol.maxDist, Math.max(pol.minDist, rig.wantDist));
      clampPitch(rig, to);
      rig.dragging = false;
    },
  });
}

/** Đồng bộ yêu cầu chế độ từ trạng thái phiên và nhân vật (đọc mỗi khung, không cấp phát). */
function syncModes(modes: CameraModeController): CameraMode {
  const ctl = getControls();
  modes.setBase(ctl.firstPerson ? 'firstPerson' : 'thirdPerson');
  // Ngồi khi đang ở góc nhìn thứ nhất: giữ mắt (firstPerson, mắt hạ theo EYE_SIT), không ép sang camera sau lưng.
  const wantSeated = ctl.seated && !ctl.firstPerson;
  if (wantSeated !== modes.has(MODE_SOURCE.seated)) {
    if (wantSeated) modes.request('seated', MODE_SOURCE.seated, { escapable: false });
    else modes.release(MODE_SOURCE.seated);
  }
  const usingUi = getCharacterState() === 'using_ui';
  if (usingUi !== modes.has(MODE_SOURCE.inspect)) {
    if (usingUi) modes.request('inspect', MODE_SOURCE.inspect, { escapable: false });
    else modes.release(MODE_SOURCE.inspect);
  }
  return modes.getMode();
}

export interface GtaCameraOptions {
  rig: CameraRig;
  positionRef: MutableRefObject<{ x: number; y: number; z: number }>;
  obstacles: readonly Rect[];
  /** Biên trong của phòng (chưa trừ bán kính nhân vật). */
  bounds?: Rect;
  /** Gọi mỗi khung: góc nhìn và độ cao mắt hiện tại. Ghi vào đối tượng dùng lại, không cấp phát. */
  getFrame: () => CameraFrame;
  enabled?: boolean;
}

/**
 * Hook R3F: chiếm camera mặc định. Phải dùng bên trong <Canvas>.
 * Đăng ký useFrame sau hook chuyển động nên chạy sau khi vị trí đã cập nhật.
 * Esc (pha capture) thoát chế độ escapable (overview) về chế độ trước, khi không tạm dừng và không gõ chữ.
 */
export function useGtaCamera({ rig, positionRef, obstacles, bounds, getFrame, enabled = true }: GtaCameraOptions): void {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (!enabled) return undefined;
    bindModeHooks(rig, cameraModes);
    const detach = attachCameraInput(gl.domElement, rig, () => getControls().settings.sensitivity);
    const onKey = (e: KeyboardEvent): void => {
      if (!isAction(e.code, 'cancel') || e.isComposing || isTyping(e.target) || getControls().paused) return;
      if (!cameraModes.canEscape()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cameraModes.escape();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      detach();
      cameraModes.setHooks(null);
      cameraModes.reset();
    };
  }, [gl, rig, enabled]);

  useFrame((state, dt) => {
    if (!enabled) return;
    const mode = syncModes(cameraModes);
    const p = positionRef.current;
    updateGtaCamera(rig, state.camera, p.x, p.y, p.z, dt, obstacles, bounds, getFrame(), mode);

    // Near-clip: gần khi camera ở mắt hoặc sát nhân vật, có trễ để không đổi qua lại.
    const cam = state.camera as PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      const eye = MODE_POLICY[mode].eye;
      if (eye || rig.dist < CAM.closeDistOn) rig.nearClose = true;
      else if (rig.dist > CAM.closeDistOff) rig.nearClose = false;
      const want = rig.nearClose ? CAM.nearClose : CAM.near;
      if (Math.abs(cam.near - want) > 1e-6) {
        cam.near = want;
        cam.updateProjectionMatrix();
      }
    }
  });
}

// ---- Vị trí an toàn, phục hồi, nút "Về vị trí an toàn" ----

let safeReturnRequested = false;

/** Yêu cầu đưa nhân vật về vị trí an toàn ở khung kế tiếp (nút trong menu tạm dừng hoặc UI khác). */
export function requestSafeReturn(): void {
  safeReturnRequested = true;
}

export type RecoveryReason = 'manual' | 'invalid' | 'fell' | 'outside';

export interface CameraSafetyOptions {
  positionRef: MutableRefObject<{ x: number; y: number; z: number }>;
  motion: MotionState;
  rig: CameraRig;
  obstacles: readonly Rect[];
  bounds?: Rect;
  /** Điểm xuất hiện, fallback khi không còn điểm an toàn đã lưu. */
  spawn: Point2;
  /** Sổ va chạm của cảnh: tránh phục hồi chồng lên người hoặc NPC khác. */
  world?: SocialWorld;
  selfId?: string;
  /**
   * Multiplayer: server xác nhận điểm phục hồi trước khi áp. Bỏ trống thì áp ngay (chỉ cục bộ).
   * Hiện chưa có bên nào truyền vào (xem docs/design/CAMERA.md).
   */
  confirmRecovery?: (t: RecoveryTarget, reason: RecoveryReason) => Promise<boolean>;
  /** Gọi sau khi đã dịch chuyển: xóa đích tự đi, trạng thái tạm. */
  onRecovered?: (t: RecoveryTarget, reason: RecoveryReason) => void;
  enabled?: boolean;
}

const RECOVERY_TEXT: Record<RecoveryTarget['source'], string> = {
  history: 'điểm an toàn gần nhất',
  'history-near': 'gần điểm an toàn gần nhất',
  spawn: 'điểm xuất hiện',
  'spawn-near': 'gần điểm xuất hiện',
};

/** Thanh nhỏ hiện khi tạm dừng: nút về vị trí an toàn, toàn cảnh và tùy chọn camera. DOM thật, không thuộc cây React. */
function mountSafetyPanel(setStatus: { fn: ((s: string) => void) | null }): () => void {
  const root = document.createElement('div');
  root.className = 'cam-safety';
  root.hidden = true;
  Object.assign(root.style, {
    position: 'fixed',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    zIndex: '1000',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 'calc(100vw - 32px)',
    padding: '8px 12px',
    borderRadius: '10px',
    background: 'rgba(20, 22, 26, 0.92)',
    color: '#f2f2f2',
    font: '14px system-ui, sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);

  const mkButton = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    Object.assign(b.style, { padding: '6px 10px', borderRadius: '6px', border: '1px solid #666', cursor: 'pointer' });
    b.addEventListener('click', onClick);
    return b;
  };

  const back = mkButton('Về vị trí an toàn', () => {
    requestSafeReturn();
    setPaused(false);
  });
  const overview = mkButton('Toàn cảnh', () => {
    toggleOverview();
    setPaused(false);
  });

  const reduceLabel = document.createElement('label');
  const reduce = document.createElement('input');
  reduce.type = 'checkbox';
  reduce.addEventListener('change', () => cameraComfort.update({ reduceMotion: reduce.checked }));
  reduceLabel.append(reduce, ' Giảm chuyển động');

  const shakeLabel = document.createElement('label');
  const shakeInput = document.createElement('input');
  shakeInput.type = 'range';
  shakeInput.min = '0';
  shakeInput.max = '1';
  shakeInput.step = '0.05';
  shakeInput.addEventListener('input', () => cameraComfort.update({ shakeScale: Number(shakeInput.value) }));
  shakeLabel.append('Rung camera ', shakeInput);

  const status = document.createElement('span');
  status.setAttribute('aria-live', 'polite');
  status.style.flexBasis = '100%';
  status.style.textAlign = 'center';
  status.hidden = true;

  root.append(back, overview, reduceLabel, shakeLabel, status);
  document.body.appendChild(root);

  const syncComfort = (): void => {
    const c = cameraComfort.get();
    reduce.checked = c.reduceMotion;
    shakeInput.value = String(c.shakeScale);
    shakeInput.disabled = c.reduceMotion;
  };
  const syncVisible = (): void => {
    // Inline display: flex đè thuộc tính hidden, nên phải đặt display trực tiếp.
    root.hidden = !getControls().paused;
    root.style.display = root.hidden ? 'none' : 'flex';
    overview.textContent = cameraModes.has(MODE_SOURCE.overview) ? 'Thoát toàn cảnh' : 'Toàn cảnh';
  };
  syncComfort();
  syncVisible();
  setStatus.fn = (s) => {
    status.textContent = s;
    status.hidden = s === '';
  };
  const u1 = cameraComfort.subscribe(syncComfort);
  const u2 = subscribeControls(syncVisible);
  const u3 = cameraModes.subscribe(syncVisible);
  return () => {
    u1();
    u2();
    u3();
    setStatus.fn = null;
    root.remove();
  };
}

/**
 * Theo dõi vị trí an toàn và phục hồi. Gọi trong <Canvas>, sau useGtaPlayer.
 * - Lấy mẫu điểm đã kiểm tra có sàn (chữ L) và đủ khoảng trống; đứng yên KHÔNG tự teleport.
 * - Tọa độ hỏng hoặc rơi: phục hồi ngay. Ra ngoài vùng có sàn quá 1 s: phục hồi.
 * - "Về vị trí an toàn": theo yêu cầu người chơi (requestSafeReturn), bị từ chối khi đang ngồi.
 * - Phục hồi: kiểm tra lại điểm (vật cản, người khác), fallback spawn; reset vận tốc; camera nhảy thẳng.
 */
export function useCameraSafety({
  positionRef,
  motion,
  rig,
  obstacles,
  bounds,
  spawn,
  world,
  selfId,
  confirmRecovery,
  onRecovered,
  enabled = true,
}: CameraSafetyOptions): void {
  const st = useRefOnce(() => ({
    tracker: createSafeTracker(),
    watch: createFallWatch(),
    pending: false,
    status: { fn: null as ((s: string) => void) | null },
  }));

  useEffect(() => {
    if (!enabled) return undefined;
    return mountSafetyPanel(st.status);
  }, [enabled, st]);

  // Mảng người khác dùng lại mỗi lần gọi (resolve và lấy mẫu không chạy mỗi khung).
  const live = useRefOnce(() => ({ world: undefined as SocialWorld | undefined, selfId: undefined as string | undefined }));
  live.world = world;
  live.selfId = selfId;
  const others = useRefOnce(() => {
    const buf: Point2[] = [];
    return (): Iterable<Point2> => {
      buf.length = 0;
      const w = live.world;
      if (w) {
        w.actors.forEach((a, id) => {
          if (id !== live.selfId) buf.push(a.src);
        });
        w.npcs.forEach((n) => buf.push(n.src));
      }
      return buf;
    };
  });
  const safeWorld = useRefOnce<SafeWorld>(() => ({ isOnFloor: isInsideOffice, obstacles, bounds, others }));
  safeWorld.obstacles = obstacles;
  safeWorld.bounds = bounds;

  useFrame((_s, dt) => {
    if (!enabled) return;
    const p = positionRef.current;
    const manual = safeReturnRequested;
    safeReturnRequested = false;
    const seated = getControls().seated;

    if (seated) {
      // Ngồi: vị trí do ghế quyết định; không lấy mẫu, không phục hồi.
      st.watch.reset();
      if (manual) st.status.fn?.('Đang ngồi: bấm E để đứng dậy trước.');
      return;
    }
    let reason: RecoveryReason | null = manual ? 'manual' : null;
    const ms = mapStatus(p.x, p.y, p.z, safeWorld);
    if (st.watch.update(ms, dt) && ms !== 'ok') reason = ms;
    if (reason === null) {
      if (ms === 'ok') st.tracker.observe(p.x, p.y, p.z, motion.grounded, safeWorld, dt);
      return;
    }
    if (st.pending) return;
    const why: RecoveryReason = reason;
    const t = st.tracker.resolve(safeWorld, spawn);
    if (t === null) {
      st.status.fn?.('Không tìm được vị trí an toàn còn trống.');
      return;
    }
    const apply = (): void => {
      p.x = t.x;
      p.y = 0;
      p.z = t.z;
      haltMotion(motion);
      rig.initialized = false; // camera nhảy thẳng tới chỗ mới, không lia qua tường
      st.watch.reset();
      onRecovered?.(t, why);
      st.status.fn?.(`Đã về ${RECOVERY_TEXT[t.source]}.`);
    };
    if (confirmRecovery === undefined) {
      apply();
      return;
    }
    st.pending = true;
    confirmRecovery(t, why)
      .then((ok) => {
        if (ok) apply();
        else st.status.fn?.('Máy chủ không xác nhận vị trí phục hồi.');
      })
      .catch(() => st.status.fn?.('Không liên lạc được máy chủ để xác nhận vị trí.'))
      .finally(() => {
        st.pending = false;
      });
  });
}

/** Giá trị tạo một lần theo vòng đời component. */
function useRefOnce<T>(make: () => T): T {
  const ref = useRef<{ v: T } | null>(null);
  if (ref.current === null) ref.current = { v: make() };
  return ref.current.v;
}

/**
 * Ẩn thân nhân vật khi camera đặt ở mắt (firstPerson, inspect) để không nhìn thấy mặt trong của đầu.
 * Chỉ đổi Object3D.visible, không đụng hay sao chép material. Gọi sau useGtaPlayer.
 */
export function useCameraBodyVisibility(bodyRef: { readonly current: Object3D | null }): void {
  useFrame(() => {
    const b = bodyRef.current;
    if (b) b.visible = !MODE_POLICY[cameraModes.getMode()].eye;
  });
}
