import * as THREE from 'three';

/** Mã chi: tay trái/phải, chân trái/phải. */
export type LimbId = 'armL' | 'armR' | 'legL' | 'legR';
export const LIMB_IDS: readonly LimbId[] = ['armL', 'armR', 'legL', 'legR'];

export interface LimbBones {
  root: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
}

export interface LimbRigBones {
  pelvis: THREE.Object3D | null;
  limbs: Partial<Record<LimbId, LimbBones>>;
  /** Tên xương không tìm thấy (để cảnh báo). */
  missing: string[];
}

/** Tên xương MPFB game_engine (đã đối chiếu với tệp GLB, xem docs/design/IK.md). */
export const MPFB_LIMB_NAMES: Record<LimbId, readonly [string, string, string]> = {
  armL: ['upperarm_l', 'lowerarm_l', 'hand_l'],
  armR: ['upperarm_r', 'lowerarm_r', 'hand_r'],
  legL: ['thigh_l', 'calf_l', 'foot_l'],
  legR: ['thigh_r', 'calf_r', 'foot_r'],
};

/** Tên chuẩn hóa dự phòng: bỏ dấu câu, chữ thường, bỏ tiền tố mixamorig. */
export function normalizeBoneName(name: string): string {
  return name.toLowerCase().replace(/^mixamorig/, '').replace(/[^a-z0-9]/g, '');
}

const ALIASES: Record<LimbId, readonly [readonly string[], readonly string[], readonly string[]]> = {
  armL: [
    ['upperarml', 'leftupperarm', 'leftarm', 'arml', 'upperarmleft', 'larm', 'luparm'],
    ['lowerarml', 'leftforearm', 'leftlowerarm', 'forearml', 'lowerarmleft', 'lforearm'],
    ['handl', 'lefthand', 'handleft', 'lhand'],
  ],
  armR: [
    ['upperarmr', 'rightupperarm', 'rightarm', 'armr', 'upperarmright', 'rarm', 'ruparm'],
    ['lowerarmr', 'rightforearm', 'rightlowerarm', 'forearmr', 'lowerarmright', 'rforearm'],
    ['handr', 'righthand', 'handright', 'rhand'],
  ],
  legL: [
    ['thighl', 'leftupleg', 'leftupperleg', 'leftthigh', 'upperlegl', 'lthigh'],
    ['calfl', 'leftleg', 'leftlowerleg', 'leftshin', 'lowerlegl', 'shinl', 'lcalf'],
    ['footl', 'leftfoot', 'anklel', 'lfoot'],
  ],
  legR: [
    ['thighr', 'rightupleg', 'rightupperleg', 'rightthigh', 'upperlegr', 'rthigh'],
    ['calfr', 'rightleg', 'rightlowerleg', 'rightshin', 'lowerlegr', 'shinr', 'rcalf'],
    ['footr', 'rightfoot', 'ankler', 'rfoot'],
  ],
};
const PELVIS_ALIASES = ['pelvis', 'hips', 'hip', 'root_hip'].map(normalizeBoneName);

function firstBoneChild(o: THREE.Object3D): THREE.Object3D | null {
  for (const c of o.children) if ((c as THREE.Bone).isBone) return c;
  return null;
}

/** Tìm xương theo tên chính xác trước, rồi theo tên chuẩn hóa/bí danh. Chạy một lần khi dựng. */
export function findBone(root: THREE.Object3D, exact: string, aliases: readonly string[]): THREE.Object3D | null {
  const direct = root.getObjectByName(exact);
  if (direct && (direct as THREE.Bone).isBone) return direct;
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found || !(o as THREE.Bone).isBone) return;
    if (aliases.includes(normalizeBoneName(o.name))) found = o;
  });
  return found;
}

/** Ánh xạ rig sang các chuỗi chi. Thiếu xương giữa/ngọn thì thử lấy con xương đầu tiên. */
export function mapLimbBones(root: THREE.Object3D): LimbRigBones {
  const limbs: Partial<Record<LimbId, LimbBones>> = {};
  const missing: string[] = [];
  for (const id of LIMB_IDS) {
    const [n0, n1, n2] = MPFB_LIMB_NAMES[id];
    const al = ALIASES[id];
    const b0 = findBone(root, n0, al[0]);
    if (!b0) {
      missing.push(n0);
      continue;
    }
    const b1 = findBone(root, n1, al[1]) ?? firstBoneChild(b0);
    const b2 = b1 ? (findBone(root, n2, al[2]) ?? firstBoneChild(b1)) : null;
    if (!b1 || !b2) {
      missing.push(!b1 ? n1 : n2);
      continue;
    }
    limbs[id] = { root: b0, mid: b1, end: b2 };
  }
  const pelvis = findBone(root, 'pelvis', PELVIS_ALIASES);
  if (!pelvis) missing.push('pelvis');
  return { pelvis, limbs, missing };
}
