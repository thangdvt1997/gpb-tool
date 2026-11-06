import * as THREE from 'three';
import { createTwoBoneResult, ELBOW_LIMITS, KNEE_LIMITS, solveTwoBone, type HingeLimits, type TwoBoneResult } from './twoBoneSolver';
import type { LimbBones } from './boneMap';

const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _d0 = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Xoay xương sao cho vector thế giới d0 thành d1 (xoay tối thiểu), ghi vào quaternion cục bộ. */
function rotateBoneWorld(bone: THREE.Object3D, d0: THREE.Vector3, d1: THREE.Vector3): void {
  _q.setFromUnitVectors(d0, d1);
  bone.matrixWorld.decompose(_p, _qw, _s);
  _qw.premultiply(_q);
  if (bone.parent) {
    bone.parent.matrixWorld.decompose(_p, _qp, _s);
    _qw.premultiply(_qp.invert());
  }
  bone.quaternion.copy(_qw);
}

/** Một chuỗi hai xương gắn với bộ giải. Không cấp phát trong apply(). */
export class LimbChain {
  readonly result: TwoBoneResult = createTwoBoneResult();
  private readonly origRoot = new THREE.Quaternion();
  private readonly origMid = new THREE.Quaternion();
  private readonly solvedRoot = new THREE.Quaternion();
  private readonly solvedMid = new THREE.Quaternion();

  // Bản gốc (do animation ghi) và bản IK đã ghi của 3 xương, để mỗi khung khôi phục đúng nếu animation không ghi đè.
  private readonly base = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly written = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private hasWritten = false;

  constructor(
    readonly bones: LimbBones,
    readonly limits: HingeLimits,
  ) {}

  /**
   * Gọi đầu mỗi khung, trước khi cập nhật ma trận: nếu xương vẫn giữ đúng giá trị IK đã ghi
   * (animation không ghi đè), trả về tư thế gốc để IK không cộng dồn qua các khung.
   */
  restore(): void {
    const { root, mid, end } = this.bones;
    if (this.hasWritten) {
      if (root.quaternion.equals(this.written[0])) root.quaternion.copy(this.base[0]);
      if (mid.quaternion.equals(this.written[1])) mid.quaternion.copy(this.base[1]);
      if (end.quaternion.equals(this.written[2])) end.quaternion.copy(this.base[2]);
      this.hasWritten = false;
    }
  }

  private snapshotBase(): void {
    this.base[0].copy(this.bones.root.quaternion);
    this.base[1].copy(this.bones.mid.quaternion);
    this.base[2].copy(this.bones.end.quaternion);
  }

  /** Chiều dài hai đoạn (m, thế giới) theo ma trận hiện tại. */
  lengths(out: { l1: number; l2: number }): void {
    _A.setFromMatrixPosition(this.bones.root.matrixWorld);
    _B.setFromMatrixPosition(this.bones.mid.matrixWorld);
    _C.setFromMatrixPosition(this.bones.end.matrixWorld);
    out.l1 = _A.distanceTo(_B);
    out.l2 = _B.distanceTo(_C);
  }

  /**
   * Giải và áp lên xương với trọng số w (0..1). w <= 0 không chạm vào xương.
   * Cần ma trận thế giới của rig đã cập nhật. Sau khi gọi, ma trận của chuỗi đã cập nhật lại.
   * @param endQuat hướng thế giới mong muốn của bàn tay/chân (tùy chọn), trộn theo w * orientWeight
   */
  apply(
    target: THREE.Vector3,
    pole: THREE.Vector3 | null,
    w: number,
    endQuat: THREE.Quaternion | null = null,
    orientWeight = 1,
  ): TwoBoneResult {
    const { root, mid, end } = this.bones;
    const res = this.result;
    if (!(w > 1e-5)) {
      res.reachable = true;
      res.error = 0;
      return res;
    }
    if (w > 1) w = 1;
    _A.setFromMatrixPosition(root.matrixWorld);
    _B.setFromMatrixPosition(mid.matrixWorld);
    _C.setFromMatrixPosition(end.matrixWorld);
    const l1 = _A.distanceTo(_B);
    const l2 = _B.distanceTo(_C);
    solveTwoBone(_A, _B, l1, l2, target, pole, this.limits, res);
    if (!Number.isFinite(res.mid.x + res.mid.y + res.mid.z + res.end.x + res.end.y + res.end.z)) return res;

    this.snapshotBase();
    this.origRoot.copy(root.quaternion);
    this.origMid.copy(mid.quaternion);

    // Xương gốc: quay đoạn gốc->giữa về hướng mới.
    _d0.subVectors(_B, _A).normalize();
    _d1.subVectors(res.mid, _A).normalize();
    rotateBoneWorld(root, _d0, _d1);
    this.solvedRoot.copy(root.quaternion);
    root.updateMatrixWorld(true);

    // Xương giữa: quay đoạn giữa->ngọn về hướng mới (tính từ vị trí giữa thật sau bước trên).
    _B.setFromMatrixPosition(mid.matrixWorld);
    _C.setFromMatrixPosition(end.matrixWorld);
    _d0.subVectors(_C, _B).normalize();
    _d1.subVectors(res.end, _B).normalize();
    rotateBoneWorld(mid, _d0, _d1);
    this.solvedMid.copy(mid.quaternion);

    if (w < 1) {
      root.quaternion.slerpQuaternions(this.origRoot, this.solvedRoot, w);
      mid.quaternion.slerpQuaternions(this.origMid, this.solvedMid, w);
    }
    root.updateMatrixWorld(true);

    if (endQuat) {
      const ow = w * Math.min(1, Math.max(0, orientWeight));
      if (ow > 1e-5) {
        end.matrixWorld.decompose(_p, _qw, _s);
        _qw.slerp(endQuat, ow);
        if (end.parent) {
          end.parent.matrixWorld.decompose(_p, _qp, _s);
          _qw.premultiply(_qp.invert());
        }
        end.quaternion.copy(_qw);
        end.updateMatrixWorld(true);
      }
    }
    this.written[0].copy(root.quaternion);
    this.written[1].copy(mid.quaternion);
    this.written[2].copy(end.quaternion);
    this.hasWritten = true;
    // Sai số thực tế sau khi trộn.
    _C.setFromMatrixPosition(end.matrixWorld);
    res.error = _C.distanceTo(target);
    return res;
  }
}

export function defaultLimits(id: string): HingeLimits {
  return id.startsWith('leg') ? KNEE_LIMITS : ELBOW_LIMITS;
}
