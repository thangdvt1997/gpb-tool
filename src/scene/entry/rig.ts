// Trạng thái hoạt cảnh dùng chung giữa EntryFixtures (vẽ thang, cổng, bảo vệ) và EntrySequence (điều khiển).
// EntrySequence ghi giá trị đích, EntryFixtures làm mượt về đích trong useFrame. Không gây render lại React.

import * as THREE from 'three';
import { playLiftChime } from './chime';

export interface EntryRig {
  /** Cửa thang Đông: 0 đóng, 1 mở hẳn. */
  eastDoor: number;
  /** Cửa thang Tây: 0 đóng, 1 mở hẳn. */
  westDoor: number;
  /** Cánh cổng xoay: 0 đóng, 1 mở. */
  gate: number;
  /** Bảo vệ: 0 ngồi, 1 đứng. */
  guardStand: number;
  /** Tay cầm máy quét: 0 thả xuôi, 1 đưa về phía nhân vật. */
  guardArm: number;
  /** Góc quay thân bảo vệ quanh trục y (rad). */
  guardYaw: number;
  /** Pha gật đầu 0..1 (một nhịp gật). Ghi trực tiếp, không làm mượt. */
  guardNod: number;
  /** Độ sáng tia quét 0..1. 0 thì không vẽ tia. Ghi trực tiếp. */
  beam: number;
  /** Điểm cuối tia quét (hệ thế giới): huy hiệu tên trên ngực nhân vật. */
  beamTarget: THREE.Vector3;
  /** Đèn cổng báo lỗi (màu down) thay cho màu chờ. */
  gateError: boolean;
  /** true thì EntryFixtures đặt thẳng giá trị đích, không làm mượt (prefers-reduced-motion). */
  snap: boolean;
}

/** Tư thế nghỉ: bảo vệ ngồi, mọi cửa đóng. */
export const GUARD_IDLE_YAW = 0.25;

export function restRig(): Omit<EntryRig, 'beamTarget'> {
  return {
    eastDoor: 0,
    westDoor: 0,
    gate: 0,
    guardStand: 0,
    guardArm: 0,
    guardYaw: GUARD_IDLE_YAW,
    guardNod: 0,
    beam: 0,
    gateError: false,
    snap: false,
  };
}

/** Giá trị đích hiện tại. Một bản duy nhất cho cả cảnh (chỉ có một tầng 7). */
export const rig: EntryRig = { ...restRig(), beamTarget: new THREE.Vector3() };

/** Đưa mọi giá trị về tư thế nghỉ. Gọi khi chuỗi cảnh kết thúc hoặc unmount. */
export function resetRig(): void {
  const snap = rig.snap;
  Object.assign(rig, restRig());
  rig.snap = snap;
}

let westTimer: ReturnType<typeof setTimeout> | null = null;

/** Cửa thang Tây mở kèm chuông rồi tự đóng sau vài giây. Dùng khi có đồng nghiệp vào tầng. */
export function ringWestLift(holdMs = 3500): void {
  playLiftChime();
  rig.westDoor = 1;
  if (westTimer) clearTimeout(westTimer);
  westTimer = setTimeout(() => {
    rig.westDoor = 0;
    westTimer = null;
  }, holdMs);
}
