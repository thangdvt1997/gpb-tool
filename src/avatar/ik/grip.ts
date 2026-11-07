import * as THREE from 'three';
import type { LimbIKController } from './controller';
import { reachTo } from './posture';

/** Hồ sơ cầm: góc gập mỗi đốt ngón (rad) và độ lùi cổ tay so với điểm socket (m). */
export interface GripProfile {
  /** Gập bốn ngón dài mỗi đốt. */
  fingerCurl: number;
  /** Gập ngón cái mỗi đốt. */
  thumbCurl: number;
  /** Lòng bàn tay cách xương cổ tay bao nhiêu dọc theo cánh tay (cổ tay lùi lại chừng đó so với socket). */
  palmOffset: number;
}

export const GRIP_PROFILES = {
  /** Cốc/ly: nắm khép quanh thân cốc. */
  cup: { fingerCurl: 0.85, thumbCurl: 0.45, palmOffset: 0.06 },
  /** Điện thoại: ngón khép gọn, ngón cái ôm cạnh máy. */
  phone: { fingerCurl: 0.6, thumbCurl: 0.3, palmOffset: 0.05 },
} as const satisfies Record<string, GripProfile>;
export type GripKind = keyof typeof GRIP_PROFILES;

const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
const AXES: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

interface Digit {
  bones: THREE.Object3D[];
  rest: THREE.Quaternion[];
  axis: THREE.Vector3;
  thumb: boolean;
}

function findFinger(hand: THREE.Object3D, finger: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  let cur: THREE.Object3D | undefined = hand.children.find((c) => c.name.toLowerCase().startsWith(`${finger}_01`));
  while (cur) {
    out.push(cur);
    const prefix = cur.name.toLowerCase().replace(/_0(\d)(_[lr])?$/, (_m, d: string) => `_0${Number(d) + 1}`);
    cur = cur.children.find((c) => c.name.toLowerCase().startsWith(prefix));
  }
  return out;
}

/**
 * Khép ngón tay quanh vật cầm. Trục gập của từng ngón được dò tự động (trục cục bộ làm đầu ngón lại gần bàn tay nhất),
 * nên không phụ thuộc quy ước trục của rig. Gọi `update` sau `ctrl.update` mỗi khung; ngón chỉ bị ghi khi đang cầm
 * hoặc đang nhả (nhả xong trả về tư thế gốc đã lưu rồi thôi ghi).
 */
export class FingerGrip {
  private readonly digits: Digit[] = [];
  private target = 0;
  private amount = 0;
  private dirty = false;
  private profile: GripProfile = GRIP_PROFILES.cup;

  constructor(readonly hand: THREE.Object3D) {
    hand.updateWorldMatrix(true, true);
    for (const f of [...FINGERS, 'thumb']) {
      const bones = findFinger(hand, f);
      if (bones.length < 2) continue;
      const rest = bones.map((b) => b.quaternion.clone());
      this.digits.push({ bones, rest, axis: this.detectAxis(bones, rest), thumb: f === 'thumb' });
    }
  }

  get fingerCount(): number {
    return this.digits.length;
  }

  /** Mức khép hiện tại 0..1. */
  get closed(): number {
    return this.amount;
  }

  private detectAxis(bones: THREE.Object3D[], rest: THREE.Quaternion[]): THREE.Vector3 {
    const tip = bones[bones.length - 1];
    const dist = () => {
      this.hand.updateWorldMatrix(false, false);
      bones[0].updateWorldMatrix(true, true);
      return _a.setFromMatrixPosition(tip.matrixWorld).distanceTo(_b.setFromMatrixPosition(this.hand.matrixWorld));
    };
    let best = AXES[0];
    let bestD = Infinity;
    for (const ax of AXES) {
      bones.forEach((b, i) => b.quaternion.copy(rest[i]).multiply(_q.setFromAxisAngle(ax, 0.5)));
      const d = dist();
      if (d < bestD) {
        bestD = d;
        best = ax;
      }
    }
    bones.forEach((b, i) => b.quaternion.copy(rest[i]));
    bones[0].updateWorldMatrix(true, true);
    return best.clone();
  }

  /** Đặt đích: kind = hồ sơ, hoặc null để nhả. */
  grip(kind: GripKind | GripProfile | null): void {
    if (kind === null) {
      this.target = 0;
      return;
    }
    this.profile = typeof kind === 'string' ? GRIP_PROFILES[kind] : kind;
    this.target = 1;
  }

  update(dt: number, rate = 14): void {
    if (!(dt > 0)) dt = 1 / 60;
    this.amount += (this.target - this.amount) * (1 - Math.exp(-rate * Math.min(dt, 0.25)));
    if (this.target === 0 && this.amount < 1e-3) this.amount = 0;
    if (this.amount === 0 && !this.dirty) return;
    const p = this.profile;
    for (const d of this.digits) {
      const per = (d.thumb ? p.thumbCurl : p.fingerCurl) * this.amount;
      d.bones.forEach((b, i) => {
        b.quaternion.copy(d.rest[i]).multiply(_q.setFromAxisAngle(d.axis, per));
      });
    }
    this.dirty = this.amount > 0;
  }
}

/**
 * Đưa tay `side` tới socket của vật cầm (cổ tay lùi `palmOffset` dọc cánh tay để lòng bàn tay trùm socket) và khép ngón.
 * Trả về false (tay về animation, ngón nhả) nếu socket ngoài tầm.
 */
export function gripAt(
  ctrl: LimbIKController,
  fingers: FingerGrip | null,
  side: 'L' | 'R',
  socket: THREE.Vector3,
  kind: GripKind | GripProfile,
): boolean {
  const id = side === 'L' ? 'armL' : 'armR';
  const profile = typeof kind === 'string' ? GRIP_PROFILES[kind] : kind;
  const root = ctrl.limbRootPosition(id, _a);
  const wrist = _b.copy(socket);
  if (root) {
    const dir = wrist.clone().sub(root);
    if (dir.lengthSq() > 1e-8) wrist.addScaledVector(dir.normalize(), -profile.palmOffset);
  }
  const ok = reachTo(ctrl, id, wrist);
  fingers?.grip(ok ? kind : null);
  return ok;
}
