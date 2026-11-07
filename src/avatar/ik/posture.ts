import * as THREE from 'three';
import type { LimbIKController } from './controller';
import type { LimbId } from './boneMap';

/** Quy ước dự án: hướng nhìn = (sin yaw, 0, cos yaw); bên trái nhân vật = (cos yaw, 0, -sin yaw). */
export interface SeatSpec {
  /** Điểm neo ghế: tâm mặt ngồi (x, y mặt ghế, z), thế giới. */
  anchor: THREE.Vector3;
  yaw: number;
  /** Độ cao sàn chỗ để chân. */
  floorY: number;
  /** Hông (xương pelvis) cao hơn mặt ghế bao nhiêu; mặc định 0,10 m. */
  pelvisAboveSeat?: number;
  /** Độ cao mắt cá so với sàn khi chân đặt phẳng; mặc định 0,08 m. */
  ankleHeight?: number;
  /** Độ gập gối mong muốn: tỉ lệ khoảng cách hông-mắt cá / tổng chân (0,88 ~ gối 90 độ). */
  legExtension?: number;
}

export interface DeskHands {
  /** Điểm đặt bàn tay (mặt bàn/bàn phím), thế giới; null để để tay theo animation. */
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
}

const _fwd = new THREE.Vector3();
const _left = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _pel = new THREE.Vector3();
const _shift = new THREE.Vector3();

/**
 * Đặt mục tiêu ngồi: hông về điểm neo ghế, hai chân đặt xuống sàn phía trước (gối hướng ra trước),
 * tay (nếu có) lên bàn với khuỷu hướng xuống. Chỉ ghi mục tiêu; controller.update() sẽ giải.
 * Gọi lại mỗi khung hoặc một lần khi ngồi (mục tiêu giữ nguyên tới khi tắt).
 */
export function applySeatPose(ctrl: LimbIKController, seat: SeatSpec, hands?: DeskHands): void {
  const sin = Math.sin(seat.yaw);
  const cos = Math.cos(seat.yaw);
  _fwd.set(sin, 0, cos);
  _left.set(cos, 0, -sin);
  const pt = ctrl.pelvisTarget;
  pt.active = true;
  pt.weight = 1;
  pt.position.copy(seat.anchor);
  pt.position.y += seat.pelvisAboveSeat ?? 0.1;

  const pelNow = ctrl.bones.pelvis;
  if (pelNow) _shift.subVectors(pt.position, _pel.setFromMatrixPosition(pelNow.matrixWorld));
  else _shift.set(0, 0, 0);

  const ankleH = seat.ankleHeight ?? 0.08;
  const ext = seat.legExtension ?? 0.88;
  for (const [id, side] of [['legL', 1], ['legR', -1]] as const) {
    const t = ctrl.targets[id];
    if (!ctrl.hasLimb(id)) continue;
    // Khoảng cách ngang hông-chân từ độ cao hông và độ dài chân.
    // Hai khớp hông: nửa khoảng cách làm độ rộng chân; độ cao khớp hông so với pelvis hiện tại.
    ctrl.limbRootPosition(id, _hip);
    const other = id === 'legL' ? 'legR' : 'legL';
    const halfWidth = ctrl.limbRootPosition(other, _sh) ? _hip.distanceTo(_sh) / 2 : 0.09;
    const pel = ctrl.bones.pelvis;
    const hipDy = pel ? _hip.y - _pel.setFromMatrixPosition(pel.matrixWorld).y : 0;
    const total = ctrl.limbLength(id);
    const vert = Math.max(0, pt.position.y + hipDy - (seat.floorY + ankleH));
    const dTarget = Math.max(total * ext, vert + 0.02);
    const fwdDist = Math.sqrt(Math.max(0, dTarget * dTarget - vert * vert));
    t.position.copy(pt.position).addScaledVector(_fwd, fwdDist).addScaledVector(_left, side * halfWidth);
    t.position.y = seat.floorY + ankleH;
    t.usePole = true;
    t.pole.copy(pt.position).addScaledVector(_fwd, 1).addScaledVector(_left, side * 0.1);
    t.useOrientation = false;
    t.weight = 1;
    t.active = true;
  }
  for (const [id, p] of [['armL', hands?.left], ['armR', hands?.right]] as const) {
    const t = ctrl.targets[id];
    if (!p) {
      t.active = false;
      continue;
    }
    // Vai sẽ dịch cùng hông: kiểm tra tầm với theo vị trí vai dự đoán, không theo vị trí hiện tại.
    reachTo(ctrl, id, p, 0.02, _shift);
  }
}

/** Hạ trạng thái ngồi: tắt mục tiêu, trọng số blend về animation. */
export function releaseSeatPose(ctrl: LimbIKController): void {
  ctrl.pelvisTarget.active = false;
  for (const id of ['legL', 'legR', 'armL', 'armR'] as const) ctrl.targets[id].active = false;
}

/**
 * Với tay/chân tới một điểm (tay nắm cửa, công tắc). Khuỷu hướng xuống.
 * Trả về false và tắt mục tiêu nếu quá tầm với (không giật xương, chỉ blend về animation).
 */
export function reachTo(
  ctrl: LimbIKController,
  id: LimbId,
  point: THREE.Vector3,
  margin = 0.02,
  /** Độ dịch dự kiến của gốc chi (vai) trước khi giải, ví dụ khi hông đang được kéo về ghế. */
  rootShift?: THREE.Vector3,
): boolean {
  const t = ctrl.targets[id];
  const reach = rootShift ? ctrl.limbRootPosition(id, _sh)?.add(rootShift) : null;
  const ok = reach ? reach.distanceTo(point) <= ctrl.limbLength(id) - margin : ctrl.canReach(id, point, margin);
  if (!ok) {
    t.active = false;
    return false;
  }
  ctrl.limbRootPosition(id, _sh);
  if (rootShift) _sh.add(rootShift);
  t.position.copy(point);
  t.usePole = true;
  t.pole.addVectors(_sh, point).multiplyScalar(0.5);
  t.pole.y -= 0.5;
  t.useOrientation = false;
  t.weight = 1;
  t.active = true;
  return true;
}

/**
 * Hai điểm đặt tay trên mặt bàn trước người ngồi: cách điểm neo `forward` m về phía trước, lệch ±`spread` m,
 * ở độ cao `deskY`. Dùng với applySeatPose khi biết mặt bàn.
 */
export function deskHandPoints(anchor: THREE.Vector3, yaw: number, deskY: number, forward = 0.38, spread = 0.18): DeskHands {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const mk = (side: number) =>
    new THREE.Vector3(
      anchor.x + sin * forward + cos * side * spread,
      deskY,
      anchor.z + cos * forward - sin * side * spread,
    );
  return { left: mk(1), right: mk(-1) };
}
