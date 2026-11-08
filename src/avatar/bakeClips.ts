/**
 * Bake clip procedural thành AnimationClip keyframe trên skeleton MPFB của một tệp nhân vật.
 * Chỉ dùng trong script/test (kéo MpfbAvatar nên không import từ mã runtime của ứng dụng).
 */
import * as THREE from 'three';
import { applyMpfbPose, buildRig, createPoseWork } from './MpfbAvatar';
import { POSE_HIP_HEIGHT, REST_POSE, type AvatarPose } from './animation';
import { BAKED_BONES, ALL_BAKED_CLIP_DEFS, BAKED_ROOT_BONE, type BakedClipDef } from './bakedClips';
import { buildSkeletonScene, readGlbJson } from './glbSkeleton';

export interface BakeResult {
  /** Cây xương dùng để xuất GLB (cùng tên/rest với nhân vật). */
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

function constant(values: number[], stride: number, eps = 1e-6): boolean {
  for (let i = stride; i < values.length; i++) if (Math.abs(values[i] - values[i % stride]) > eps) return false;
  return true;
}

export function bakeClip(def: BakedClipDef, rig: ReturnType<typeof buildRig>, restRootPos: THREE.Vector3, restRootQuat: THREE.Quaternion): THREE.AnimationClip {
  const work = createPoseWork();
  const n = Math.ceil(def.durationSec * def.fps - 1e-9);
  const times: number[] = [];
  for (let i = 0; i <= n; i++) times.push(Math.min(def.durationSec, i / def.fps));
  const bones = BAKED_BONES.map((b) => rig.root.getObjectByName(b) as THREE.Object3D);
  const quats = BAKED_BONES.map(() => [] as number[]);
  const rootPos: number[] = [];
  const rootQuat: number[] = [];
  const hipScale = rig.hipY / POSE_HIP_HEIGHT;
  const pose: AvatarPose = { ...REST_POSE };
  const qy = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const prev: Array<THREE.Quaternion | null> = BAKED_BONES.map(() => null);
  let prevRoot: THREE.Quaternion | null = null;
  for (const t of times) {
    Object.assign(pose, REST_POSE);
    def.pose(t, pose);
    applyMpfbPose(rig, pose, work);
    bones.forEach((b, i) => {
      q.copy(b.quaternion);
      const p = prev[i];
      if (p && p.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev[i] = (p ?? new THREE.Quaternion()).copy(q);
      quats[i].push(q.x, q.y, q.z, q.w);
    });
    rootPos.push(restRootPos.x, restRootPos.y + pose.rootY * hipScale, restRootPos.z);
    qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.rootRotY);
    q.copy(qy).multiply(restRootQuat);
    if (prevRoot && prevRoot.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    prevRoot = (prevRoot ?? new THREE.Quaternion()).copy(q);
    rootQuat.push(q.x, q.y, q.z, q.w);
  }
  const tracks: THREE.KeyframeTrack[] = [];
  const push = (name: string, ctor: typeof THREE.QuaternionKeyframeTrack | typeof THREE.VectorKeyframeTrack, vals: number[], stride: number) => {
    // Track không đổi theo thời gian chỉ giữ 2 khóa (đầu và cuối) để tệp nhỏ.
    if (constant(vals, stride)) tracks.push(new ctor(name, [0, def.durationSec], [...vals.slice(0, stride), ...vals.slice(0, stride)]));
    else tracks.push(new ctor(name, times, vals));
  };
  BAKED_BONES.forEach((b, i) => push(`${b}.quaternion`, THREE.QuaternionKeyframeTrack, quats[i], 4));
  push(`${BAKED_ROOT_BONE}.position`, THREE.VectorKeyframeTrack, rootPos, 3);
  push(`${BAKED_ROOT_BONE}.quaternion`, THREE.QuaternionKeyframeTrack, rootQuat, 4);
  return new THREE.AnimationClip(def.name, def.durationSec, tracks);
}

/** Bake toàn bộ ALL_BAKED_CLIP_DEFS (locomotion và emote) cho một tệp nhân vật GLB (đọc cấu trúc xương từ JSON, không cần giải mã texture). */
export function bakeForCharacter(glb: ArrayBuffer | Uint8Array): BakeResult {
  const json = readGlbJson(glb);
  const scene = buildSkeletonScene(json);
  const rig = buildRig({ scene } as unknown as Parameters<typeof buildRig>[0]);
  const root = rig.root.getObjectByName(BAKED_ROOT_BONE) as THREE.Object3D;
  const restPos = root.position.clone();
  const restQuat = root.quaternion.clone();
  const clips = ALL_BAKED_CLIP_DEFS.map((d) => bakeClip(d, rig, restPos, restQuat));
  return { scene, clips };
}
