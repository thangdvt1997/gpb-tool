import type { Object3D } from 'three';
import type { Pose } from './types';

/** Các xương chuẩn hóa của VRM mà emote điều khiển. Phần tử null thì bỏ qua. */
export interface VrmEmoteBones {
  scene: Object3D;
  head: Object3D | null;
  leftUpperArm: Object3D | null;
  rightUpperArm: Object3D | null;
  leftUpperLeg: Object3D | null;
  rightUpperLeg: Object3D | null;
}

const HALF_PI = Math.PI / 2;

/**
 * Áp Pose lên VRM (xương chuẩn hóa, tư thế T). Tay VRM chỉ ngang theo X nên bù 90 độ để quy về
 * quy ước "tay thả xuống" của Pose: tay trái z = -90 độ + armLZ, tay phải z = +90 độ + armRZ.
 * Chỉ gán thuộc tính xoay có sẵn, không tạo đối tượng. Gọi trước vrm.update(delta).
 */
export function applyPoseToVrm(b: VrmEmoteBones, p: Pose): void {
  b.scene.position.y = p.rootY;
  b.scene.rotation.y = p.rootRotY;
  if (b.head) b.head.rotation.z = p.headRotZ;
  if (b.leftUpperArm) b.leftUpperArm.rotation.set(p.armLX, 0, -HALF_PI + p.armLZ);
  if (b.rightUpperArm) b.rightUpperArm.rotation.set(p.armRX, 0, HALF_PI + p.armRZ);
  if (b.leftUpperLeg) b.leftUpperLeg.rotation.x = p.legLX;
  if (b.rightUpperLeg) b.rightUpperLeg.rotation.x = p.legRX;
}
