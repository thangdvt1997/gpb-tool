/**
 * Thân giả để test logic thuần: mỗi đoạn xương là một ống 4 đỉnh nhiều vòng, trọng số skin 1 cho xương của đoạn.
 * Cho phép kiểm tra phân vùng/che/xếp lớp mà không cần tệp GLB.
 */
import type { BodyData } from './regions';

type V3 = [number, number, number];

const BONES: Record<string, V3> = {
  Root: [0, 0, 0],
  pelvis: [0, 1.0, 0],
  spine_01: [0, 1.1, 0],
  spine_02: [0, 1.25, 0],
  spine_03: [0, 1.4, 0],
  clavicle_l: [0.05, 1.55, 0],
  clavicle_r: [-0.05, 1.55, 0],
  neck_01: [0, 1.6, 0],
  head: [0, 1.7, 0],
  upperarm_l: [0.2, 1.55, 0],
  lowerarm_l: [0.35, 1.3, 0],
  hand_l: [0.45, 1.1, 0],
  upperarm_r: [-0.2, 1.55, 0],
  lowerarm_r: [-0.35, 1.3, 0],
  hand_r: [-0.45, 1.1, 0],
  thigh_l: [0.1, 1.0, 0],
  calf_l: [0.1, 0.55, 0],
  foot_l: [0.1, 0.1, 0],
  ball_l: [0.1, 0.05, 0.15],
  thigh_r: [-0.1, 1.0, 0],
  calf_r: [-0.1, 0.55, 0],
  foot_r: [-0.1, 0.1, 0],
  ball_r: [-0.1, 0.05, 0.15],
};

export const FAKE_BONE_NAMES: readonly string[] = Object.keys(BONES);

/** Đoạn: [xương dẫn trọng số, điểm đầu, điểm cuối, số vòng]. */
const SEGS: [string, V3, V3, number][] = [
  ['pelvis', [0, 0.95, 0], [0, 1.1, 0], 4],
  ['spine_01', [0, 1.1, 0], [0, 1.25, 0], 4],
  ['spine_02', [0, 1.25, 0], [0, 1.4, 0], 4],
  ['spine_03', [0, 1.4, 0], [0, 1.58, 0], 4],
  ['neck_01', [0, 1.6, 0], [0, 1.68, 0], 3],
  ['head', [0, 1.7, 0], [0, 1.9, 0], 4],
  ['upperarm_l', BONES.upperarm_l, BONES.lowerarm_l, 6],
  ['lowerarm_l', BONES.lowerarm_l, BONES.hand_l, 6],
  ['hand_l', BONES.hand_l, [0.5, 1.0, 0], 3],
  ['upperarm_r', BONES.upperarm_r, BONES.lowerarm_r, 6],
  ['lowerarm_r', BONES.lowerarm_r, BONES.hand_r, 6],
  ['hand_r', BONES.hand_r, [-0.5, 1.0, 0], 3],
  ['thigh_l', [0.1, 1.05, 0], BONES.calf_l, 8],
  ['calf_l', BONES.calf_l, BONES.foot_l, 8],
  ['foot_l', BONES.foot_l, BONES.ball_l, 4],
  ['thigh_r', [-0.1, 1.05, 0], BONES.calf_r, 8],
  ['calf_r', BONES.calf_r, BONES.foot_r, 8],
  ['foot_r', BONES.foot_r, BONES.ball_r, 4],
];

/** Dựng thân giả. */
export function makeFakeBody(): BodyData {
  const pos: number[] = [];
  const nor: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const names = [...FAKE_BONE_NAMES];
  const R = 0.06;
  for (const [bone, a, b, rings] of SEGS) {
    const base = pos.length / 3;
    for (let r = 0; r < rings; r++) {
      const k = rings === 1 ? 0 : r / (rings - 1);
      const c: V3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      for (let q = 0; q < 4; q++) {
        const ang = (q / 4) * Math.PI * 2;
        const nx = Math.cos(ang);
        const nz = Math.sin(ang);
        pos.push(c[0] + nx * R, c[1], c[2] + nz * R);
        nor.push(nx, 0, nz);
        si.push(names.indexOf(bone), 0, 0, 0);
        sw.push(1, 0, 0, 0);
      }
    }
    for (let r = 0; r < rings - 1; r++) {
      for (let q = 0; q < 4; q++) {
        const q2 = (q + 1) % 4;
        const v00 = base + r * 4 + q;
        const v01 = base + r * 4 + q2;
        const v10 = base + (r + 1) * 4 + q;
        const v11 = base + (r + 1) * 4 + q2;
        idx.push(v00, v10, v01, v01, v10, v11);
      }
    }
  }
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nor),
    index: Uint32Array.from(idx),
    skinIndex: Uint8Array.from(si),
    skinWeight: Float32Array.from(sw),
    boneNames: names,
    bonePos: BONES,
  };
}
