import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Appearance } from './appearance';
import {
  MPFB_BONE_MAP,
  MPFB_JOINT_ORDER,
  POSE_HIP_HEIGHT,
  computePose,
  playerLocomotion,
  createPoseScratch,
  type AvatarAnimation,
  type AvatarPose,
  type PoseJoint,
} from './animation';
import { getEmoteState, isEmoteReduced, sampleEmotePose } from '../emotes/player';
import type { EmoteId } from '../emotes/types';
import type { BodyFrame, BodyStyle, CharacterLook } from '../fashion/types';
import { BODY_LIMITS_BY_STYLE } from '../fashion/rules';
import { DEFAULT_HEIGHT_CM } from '../fashion/defaults';
import { applyBoneShape, boneShapeOf, footDrop, REST_SPANS } from './boneShape';
import { useAvatarGltf } from './glbLoad';
import { FallbackAvatar } from './FallbackAvatar';
import {
  FingerGrip,
  applySeatPose,
  cupReachPoint,
  handSocketForUrl,
  deskHandPoints,
  deskHeightAhead,
  gripAt,
  ikHold,
  releaseSeatPose,
  useLimbIK,
  type GroundSampler,
} from './ik';
import { playerPose } from '../scene/controls/playerPose';
import { getHeldItem } from '../scene/interact/objects/smallItem';
import { MpfbOutfit } from './outfit/MpfbOutfit';
import { useBakedPlayer, playerClipDebug } from './useBakedClips';
import { chooseBakedClip, clipTimeScale, emoteFadeSec } from './bakedClips';
import { useBodyTattoo } from '../tattoo/useBodyTattoo';

// ---------------------------------------------------------------------------------------------------------------
// Tệp mô hình (xuất từ MPFB, rig game_engine 53 xương, 18 morph trên mesh thân).

export type MpfbModelId = 'male_real' | 'female_real' | 'chibi';

export const MPFB_MODEL_URLS: Readonly<Record<MpfbModelId, string>> = {
  male_real: '/models/male_real.glb',
  female_real: '/models/female_real.glb',
  chibi: '/models/chibi.glb',
};

/** Chọn tệp theo kiểu tạo hình và mesh gốc. Chibi chỉ có một tệp cho cả nam và nữ. */
export function mpfbModelFor(style: BodyStyle, frame: BodyFrame): MpfbModelId {
  if (style === 'chibi') return 'chibi';
  return frame === 'female' ? 'female_real' : 'male_real';
}

/**
 * Chiều cao chibi mặc định khi không có look: 1,10 m (DEFAULT_HEIGHT_CM.chibi.male). Tệp chibi.glb cao gốc
 * khoảng 0,874 m (đo từ đế chân 0,024 tới đỉnh 0,898), nên scale mặc định khoảng 1,26.
 * Khi có look, dùng look.body.heightCm, kẹp theo BODY_LIMITS_BY_STYLE.chibi (85 đến 130 cm).
 */
export const CHIBI_DEFAULT_HEIGHT_M = DEFAULT_HEIGHT_CM.chibi.male / 100;

/** Chiều cao mục tiêu (m) của nhân vật, kẹp trong giới hạn của kiểu tạo hình. */
export function targetHeightM(style: BodyStyle, frame: BodyFrame, heightCm: number | undefined): number {
  const range = BODY_LIMITS_BY_STYLE[style].heightCm[frame];
  const fallback = DEFAULT_HEIGHT_CM[style][frame];
  const cm = typeof heightCm === 'number' && Number.isFinite(heightCm) ? heightCm : fallback;
  return Math.min(range.max, Math.max(range.min, cm)) / 100;
}

// ---------------------------------------------------------------------------------------------------------------
// IK chân (TASK 03). Sàn văn phòng phẳng y = 0. Bật bằng ?ik=1 cho tới khi xem được trên trình duyệt
// (docs/design/IK.md, mục chưa kiểm chứng).

const FLAT_FLOOR: GroundSampler = (_x, _z, out) => {
  out.y = 0;
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
  return true;
};

/** Mặc định BẬT (đã qua e2e); tắt bằng ?ik=0. */
export function ikEnabledFromUrl(search: string): boolean {
  return new URLSearchParams(search).get('ik') !== '0';
}

/** Mặt đệm ghế cao 0,46 m (hông ngồi 0,56 m trừ 0,10 m hông cao hơn mặt ngồi), theo SEATED_HIP của animation. */
const SEAT_SURFACE_Y = 0.46;

/** Hook kiểm tra trình duyệt: chỉ khi ?debug=ik. Chỉ đọc, ghi mỗi khung. */
export interface IkDebug {
  frames: number;
  sitFrames: number;
  nanBones: number;
  pelvisY: number;
  floorY: number;
  footY: [number, number];
  /** Tay phải đang cầm vật bằng IK; khoảng cách socket tay tới điểm cầm danh nghĩa (m), -1 nếu không cầm. */
  gripActive: boolean;
  holdDist: number;
  /** Tay đặt lên bàn: sai số hai bàn tay tới điểm bàn (m), -1 nếu không có bàn. */
  deskErr: number;
}
const IK_DEBUG: IkDebug | null = (() => {
  if (typeof window === 'undefined') return null;
  if (new URLSearchParams(window.location.search).get('debug') !== 'ik') return null;
  const d: IkDebug = { frames: 0, sitFrames: 0, nanBones: 0, pelvisY: 0, floorY: 0, footY: [0, 0], gripActive: false, holdDist: -1, deskErr: -1 };
  (window as unknown as { __gpbIK?: IkDebug }).__gpbIK = d;
  return d;
})();
const IK_ON = typeof window !== 'undefined' && ikEnabledFromUrl(window.location.search);

// ---------------------------------------------------------------------------------------------------------------
// Morph thân. Chỉ nối morph có thật trong GLB; trọng số kẹp [0, 1].

type BodyMorph = 'bodyShouldersV' | 'bodyWaistSlim' | 'bodyHipsWide' | 'bodyBelly' | 'chestMuscle' | 'headFat' | 'gpb_upperarm_girth' | 'gpb_thigh_girth';

const BODY_MORPHS: readonly BodyMorph[] = [
  'bodyShouldersV', 'bodyWaistSlim', 'bodyHipsWide', 'bodyBelly', 'chestMuscle', 'headFat', 'gpb_upperarm_girth', 'gpb_thigh_girth',
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp11(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Morph hai chiều (influence âm làm chi gầy đi). */
const SIGNED_MORPHS: ReadonlySet<string> = new Set(['gpb_upperarm_girth', 'gpb_thigh_girth']);

/** Ghi trọng số morph đã kẹp [0, 1]. index < 0 (tệp không có morph) thì bỏ qua. */
function setMorph(infl: number[], index: number, v: number): void {
  if (index >= 0 && index < infl.length) infl[index] = clamp01(v);
}

/**
 * Trọng số morph thân từ look. Trường hình thể là -1..1; morph chỉ có một chiều nên chiều kia về 0.
 * - shoulderWidth > 0 -> bodyShouldersV (vai rộng hình chữ V).
 * - waist < 0 -> bodyWaistSlim (eo thon). waist > 0 (eo to) chưa có morph.
 * - hips > 0 -> bodyHipsWide. belly > 0 -> bodyBelly. chest > 0 -> chestMuscle.
 * - face.structure.headSize > 0 -> headFat (đầu đầy hơn; không phải phóng to đầu).
 */
export function bodyMorphWeights(look: CharacterLook): Record<BodyMorph, number> {
  const t = look.body.torso;
  return {
    bodyShouldersV: clamp01(t.shoulderWidth),
    bodyWaistSlim: clamp01(-t.waist),
    bodyHipsWide: clamp01(t.hips),
    bodyBelly: clamp01(t.belly),
    chestMuscle: clamp01(t.chest),
    headFat: clamp01(look.face.structure.headSize),
    gpb_upperarm_girth: clamp11((look.body.arms.left.upperArm + look.body.arms.right.upperArm) / 2),
    gpb_thigh_girth: clamp11((look.body.legs.left.thigh + look.body.legs.right.thigh) / 2),
  };
}

/**
 * Hộp bao của mesh thân như trước khi thêm morph gpb_* (three cộng dồn biên độ mọi morph vào hộp bao). Giữ nguyên số đo
 * chiều cao và mặt sàn đã hiệu chỉnh; hai morph bắp tay, đùi chỉ nở ngang chi nên không đổi chiều cao.
 */
function legacyBounds(body: THREE.Mesh): THREE.Box3 | null {
  const geo = body.geometry;
  const dict = body.morphTargetDictionary;
  const all = geo.morphAttributes.position;
  if (!dict || !all) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    return geo.boundingBox;
  }
  const keep = Object.entries(dict).filter(([n]) => !n.startsWith('gpb_')).map(([, i]) => all[i]);
  const saved = geo.morphAttributes.position;
  geo.morphAttributes.position = keep;
  geo.boundingBox = null;
  geo.computeBoundingBox();
  const box = geo.boundingBox ? (geo.boundingBox as THREE.Box3).clone() : null;
  geo.morphAttributes.position = saved;
  geo.boundingBox = null;
  geo.computeBoundingBox();
  return box;
}

export interface ShapeDebug {
  /** Influence của morph thân theo tên. */
  morph: Record<string, number>;
  /** Scale cục bộ của xương hand/foot. */
  scale: Record<string, [number, number, number]>;
  /** Y thế giới thấp nhất của mọi đỉnh thân đã skin và morph (đáy bàn chân khi đứng). */
  minY: number;
}

function readShapeDebug(rig: MpfbRig): ShapeDebug | null {
  const mesh = rig.morphMesh as THREE.SkinnedMesh | null;
  if (!mesh || !mesh.isSkinnedMesh) return null;
  rig.root.updateMatrixWorld(true);
  const morph: Record<string, number> = {};
  for (const [n, i] of Object.entries(mesh.morphTargetDictionary ?? {})) morph[n] = mesh.morphTargetInfluences?.[i] ?? 0;
  const scale: Record<string, [number, number, number]> = {};
  for (const n of ['hand_l', 'hand_r', 'foot_l', 'foot_r']) {
    const b = rig.root.getObjectByName(n);
    if (b) scale[n] = [b.scale.x, b.scale.y, b.scale.z];
  }
  const v = new THREE.Vector3();
  let minY = Infinity;
  const n = mesh.geometry.getAttribute('position').count;
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    if (v.y < minY) minY = v.y;
  }
  return { morph, scale, minY };
}

// ---------------------------------------------------------------------------------------------------------------
// Biểu cảm mặt.

type FaceMorph =
  | 'eyeBlink_L' | 'eyeBlink_R' | 'eyeWide_L' | 'eyeWide_R' | 'jawOpen' | 'mouthSmile' | 'mouthFrown'
  | 'mouthPucker' | 'browUp_L' | 'browUp_R' | 'browDown_L' | 'browDown_R';

const FACE_MORPHS: readonly FaceMorph[] = [
  'eyeBlink_L', 'eyeBlink_R', 'eyeWide_L', 'eyeWide_R', 'jawOpen', 'mouthSmile', 'mouthFrown', 'mouthPucker',
  'browUp_L', 'browUp_R', 'browDown_L', 'browDown_R',
];

/** Biểu cảm gọn: blink cộng riêng theo nhịp chớp mắt. */
interface FaceTarget {
  smile: number;
  frown: number;
  jaw: number;
  wide: number;
  browUp: number;
  browDown: number;
  blink: number;
}

const FACE_REST: FaceTarget = { smile: 0, frown: 0, jaw: 0, wide: 0, browUp: 0, browDown: 0, blink: 0 };

/** Biểu cảm nền theo look.face.expression (fashion/face.ts EXPRESSIONS). id lạ thì để nghỉ. */
const EXPRESSION_FACE: Readonly<Record<string, Partial<FaceTarget>>> = {
  neutral: {},
  'slight-smile': { smile: 0.3 },
  smile: { smile: 0.7 },
  confident: { smile: 0.2, browDown: 0.1 },
  focused: { browDown: 0.3 },
  serious: { browDown: 0.2, frown: 0.15 },
};

/** Biểu cảm khi đang phát emote. Emote không có trong bảng thì dùng biểu cảm nền. */
const EMOTE_FACE: Readonly<Partial<Record<EmoteId, Partial<FaceTarget>>>> = {
  wave: { smile: 0.8, browUp: 0.3 },
  dance_1: { smile: 0.9, jaw: 0.2 },
  dance_2: { smile: 0.9, jaw: 0.2 },
  kata: { browDown: 0.5 },
  punch_combo: { browDown: 0.6, jaw: 0.1 },
  stance: { browDown: 0.5 },
  apologize: { browUp: 0.6, frown: 0.3 },
  startle: { wide: 0.9, browUp: 0.8, jaw: 0.35 },
  hit: { blink: 0.7, browDown: 0.6, jaw: 0.25 },
  down: { blink: 0.6, frown: 0.4 },
  angry_stance: { browDown: 0.9, frown: 0.6 },
};

/**
 * Lông mày là mesh riêng (eyebrow001) không có morph, nên morph brow trên da đẩy da khỏi lông mày.
 * Giới hạn biên độ brow để lệch không quá khoảng 3 mm.
 */
const BROW_MAX = 0.5;
const BLINK_PERIOD = 3.8;
const BLINK_TIME = 0.14;

// ---------------------------------------------------------------------------------------------------------------
// Chuẩn bị mô hình và dữ liệu xương nghỉ.

/** Cánh tay nghỉ: dạng ra 0,1 rad khỏi phương thẳng đứng để không xuyên hông (MPFB xuất ở tư thế A). */
const ARM_REST_ABDUCT = 0.1;
/** Khuỷu nghỉ gập nhẹ 0,15 rad (cẳng tay MPFB gốc gập khoảng 0,8 rad về trước). */
const ELBOW_REST_BEND = 0.15;

interface JointRig {
  bone: THREE.Bone;
  /** Hướng nghỉ trong không gian mô hình. */
  restWorld: THREE.Quaternion;
  /** Nghịch đảo hướng nghỉ của xương cha (không gian mô hình). */
  parentRestInv: THREE.Quaternion;
  /** Khớp cha nếu xương cha cũng có trong bảng map. */
  parentJoint: PoseJoint | null;
  /** Xoay căn tư thế nghỉ (A-pose sang tay thả), không gian mô hình. Đơn vị nếu không cần. */
  align: THREE.Quaternion;
}

interface MpfbRig {
  root: THREE.Object3D;
  joints: Partial<Record<PoseJoint, JointRig>>;
  /** Mesh có morph (thân) và bảng tên morph. */
  morphMesh: THREE.Mesh | null;
  /** Chiều cao gốc (m) và đáy chân (m) của mesh thân, tư thế nghỉ. */
  nativeHeight: number;
  minY: number;
  /** Độ cao khớp hông gốc (m). */
  hipY: number;
  missing: string[];
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/** Hướng của xương (từ khớp tới khớp con đầu tiên) trong không gian mô hình. */
function boneDirection(bone: THREE.Bone, out: THREE.Vector3): THREE.Vector3 {
  const child = bone.children.find((c): c is THREE.Bone => (c as THREE.Bone).isBone === true);
  bone.getWorldPosition(_v3);
  if (child) {
    child.getWorldPosition(out);
    return out.sub(_v3).normalize();
  }
  // Không có con: trục Y cục bộ là trục dọc xương (Blender).
  return out.set(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(_q1)).normalize();
}

/** Ngưỡng alpha cho lông mày (MASK), theo ASSET_STANDARD mục 6. */
export const EYEBROW_ALPHA_CUTOFF = 0.4;

/** Phân loại vật liệu MPFB theo tên: lông mày cắt alpha (MASK), còn lại (thân, mắt) đặc (OPAQUE). */
export function materialAlphaMode(name: string): 'MASK' | 'OPAQUE' {
  return /eyebrow/i.test(name) ? 'MASK' : 'OPAQUE';
}

/**
 * Sửa vật liệu dùng chung: GLB xuất BLEND làm vỡ thứ tự vẽ. Thân và mắt về OPAQUE, lông mày về MASK
 * (alphaTest, ghi depth). Gọi lặp lại không sao.
 */
/** Da: nhám vừa, không phản chiếu gắt (không như nhựa). Hằng số vật liệu. */
export const SKIN_MATERIAL = { roughness: 0.62, metalness: 0, envMapIntensity: 0.45, anisotropy: 8 } as const;

function fixMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      m.transparent = false;
      m.depthWrite = true;
      if (/body/i.test(m.name)) {
        const sm = m as THREE.MeshStandardMaterial;
        sm.roughness = SKIN_MATERIAL.roughness;
        sm.metalness = SKIN_MATERIAL.metalness;
        sm.envMapIntensity = SKIN_MATERIAL.envMapIntensity;
        // GLB xuất hai mặt: mặt trong của da tạo sọc bóng đổ tự che ở tay; da là khối kín nên chỉ cần mặt ngoài.
        sm.side = THREE.FrontSide;
        if (sm.map) {
          sm.map.anisotropy = SKIN_MATERIAL.anisotropy;
          sm.map.minFilter = THREE.LinearMipmapLinearFilter;
          sm.map.needsUpdate = true;
        }
      }
      if (materialAlphaMode(m.name) === 'MASK') {
        m.alphaTest = EYEBROW_ALPHA_CUTOFF;
      } else {
        m.alphaTest = 0;
        m.alphaToCoverage = false;
      }
      m.needsUpdate = true;
    }
  });
}

/** Mesh thân: mesh có morph bodyBelly. */
function findMorphMesh(root: THREE.Object3D): THREE.Mesh | null {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && 'bodyBelly' in mesh.morphTargetDictionary) found.push(mesh);
  });
  return found[0] ?? null;
}

/** Tạo bản sao riêng (xương riêng, geometry và vật liệu dùng chung với bộ đệm glbLoad) và đo rig. */
export function buildRig(gltf: GLTF): MpfbRig {
  const root = cloneSkinned(gltf.scene);
  root.updateMatrixWorld(true);

  const body = findMorphMesh(root);
  fixMaterials(root);

  // Đo chiều cao trên geometry nghỉ của mesh thân (mesh đặt tại gốc, không có transform riêng).
  let minY = 0;
  let maxY = 1;
  if (body) {
    const box = legacyBounds(body);
    if (box) {
      minY = box.min.y;
      maxY = box.max.y;
    }
  }

  const missing: string[] = [];
  const joints: Partial<Record<PoseJoint, JointRig>> = {};
  const boneToJoint = new Map<THREE.Object3D, PoseJoint>();
  for (const id of MPFB_JOINT_ORDER) {
    const obj = root.getObjectByName(MPFB_BONE_MAP[id].bone);
    if (!obj || !(obj as THREE.Bone).isBone) {
      missing.push(MPFB_BONE_MAP[id].bone);
      continue;
    }
    const bone = obj as THREE.Bone;
    boneToJoint.set(bone, id);
    const restWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const parentRestInv = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion();
    joints[id] = { bone, restWorld, parentRestInv, parentJoint: null, align: new THREE.Quaternion() };
  }
  for (const id of MPFB_JOINT_ORDER) {
    const j = joints[id];
    if (j && j.bone.parent) j.parentJoint = boneToJoint.get(j.bone.parent) ?? null;
  }

  // Căn tay từ tư thế A về tay thả, giữ mặt phẳng gập khuỷu của rig.
  for (const [arm, fore, side] of [['armL', 'foreArmL', 1], ['armR', 'foreArmR', -1]] as const) {
    const a = joints[arm];
    if (!a) continue;
    const restUp = boneDirection(a.bone, _v1).clone();
    const targetUp = new THREE.Vector3(side * Math.sin(ARM_REST_ABDUCT), -Math.cos(ARM_REST_ABDUCT), 0);
    a.align.setFromUnitVectors(restUp, targetUp);
    const f = joints[fore];
    if (!f) continue;
    const lowAfter = boneDirection(f.bone, _v2).applyQuaternion(a.align);
    const hinge = new THREE.Vector3().crossVectors(targetUp, lowAfter);
    const bend = targetUp.angleTo(lowAfter);
    f.align.copy(a.align);
    if (hinge.lengthSq() > 1e-8) {
      hinge.normalize();
      f.align.premultiply(new THREE.Quaternion().setFromAxisAngle(hinge, ELBOW_REST_BEND - bend));
    }
  }

  const thigh = root.getObjectByName('thigh_l');
  const hipY = thigh ? thigh.getWorldPosition(new THREE.Vector3()).y : (maxY - minY) * 0.55;

  return { root, joints, morphMesh: body, nativeHeight: Math.max(0.1, maxY - minY), minY, hipY, missing };
}

function disposeRig(rig: MpfbRig): void {
  // Geometry, vật liệu, texture thuộc bộ đệm glbLoad và dùng chung giữa các bản sao: không dispose ở đây.
  // Mỗi bản sao có Skeleton riêng; dispose giải phóng boneTexture (renderer tạo lại nếu bản sao còn được vẽ,
  // nên an toàn với StrictMode chạy effect hai lần). Tách khỏi cảnh do R3F làm khi gỡ <primitive>.
  rig.root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) sm.skeleton.dispose();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Áp tư thế.

interface PoseWork {
  euler: THREE.Euler;
  own: THREE.Quaternion;
  chain: Partial<Record<PoseJoint, THREE.Quaternion>>;
  delta: Partial<Record<PoseJoint, THREE.Quaternion>>;
  tmp: THREE.Quaternion;
}

export function createPoseWork(): PoseWork {
  const chain: Partial<Record<PoseJoint, THREE.Quaternion>> = {};
  const delta: Partial<Record<PoseJoint, THREE.Quaternion>> = {};
  for (const id of MPFB_JOINT_ORDER) {
    chain[id] = new THREE.Quaternion();
    delta[id] = new THREE.Quaternion();
  }
  return { euler: new THREE.Euler(0, 0, 0, 'XYZ'), own: new THREE.Quaternion(), chain, delta, tmp: new THREE.Quaternion() };
}

const HEAD_ONLY: ReadonlySet<PoseJoint> = new Set<PoseJoint>(['neck', 'head']);

/**
 * Áp AvatarPose lên xương MPFB. Góc tính trong không gian mô hình (cùng quy ước FallbackAvatar: Euler XYZ),
 * rồi đổi sang cục bộ: local = inv(Wnghỉ_cha) * inv(D_cha) * D * Wnghỉ, với D = Rchuỗi * Rcăn.
 * Không cấp phát.
 */
export function applyMpfbPose(rig: MpfbRig, p: AvatarPose, w: PoseWork, only?: ReadonlySet<PoseJoint>): void {
  for (const id of MPFB_JOINT_ORDER) {
    if (only && !only.has(id)) continue;
    const j = rig.joints[id];
    const chain = w.chain[id] as THREE.Quaternion;
    const delta = w.delta[id] as THREE.Quaternion;
    const map = MPFB_BONE_MAP[id];
    w.euler.set(map.rotX ? p[map.rotX] : 0, map.rotY ? p[map.rotY] : 0, map.rotZ ? p[map.rotZ] : 0, 'XYZ');
    w.own.setFromEuler(w.euler);
    if (map.follows) chain.copy(w.chain[map.follows] as THREE.Quaternion).multiply(w.own);
    else chain.copy(w.own);
    if (!j) continue;
    delta.copy(chain).multiply(j.align);
    const q = j.bone.quaternion.copy(j.parentRestInv);
    if (j.parentJoint) q.multiply(w.tmp.copy(w.delta[j.parentJoint] as THREE.Quaternion).invert());
    q.multiply(delta).multiply(j.restWorld);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Component.

interface MpfbModelProps {
  url: string;
  style: BodyStyle;
  frame: BodyFrame;
  look: CharacterLook | null;
  animation: AvatarAnimation;
  emote: boolean;
}

const _ikPos = new THREE.Vector3();
const _ikQuat = new THREE.Quaternion();
const _ikScl = new THREE.Vector3();
const _ikFwd = new THREE.Vector3();
const _ikAnchor = new THREE.Vector3();
const _ikCup = new THREE.Vector3();

function approach(cur: number, goal: number, rate: number, dt: number): number {
  return cur + (goal - cur) * (1 - Math.exp(-rate * dt));
}

function MpfbModel({ url, style, frame, look, animation, emote }: MpfbModelProps) {
  const gltf = useAvatarGltf(url);
  const rig = useMemo(() => buildRig(gltf), [gltf]);
  const work = useMemo(createPoseWork, []);
  // Clip bake (public/models/anim_*.glb) thay tư thế procedural cho animation cố định khi tải được; lỗi thì rơi về procedural.
  const baked = useBakedPlayer(rig.root, url);
  const headPose = useMemo(createPoseScratch, []);
  const scratch = useMemo(createPoseScratch, []);
  const rootRef = useRef<THREE.Group>(null);
  const face = useRef<FaceTarget>({ ...FACE_REST });
  const blinkSeed = useMemo(() => Math.random() * BLINK_PERIOD, []);

  useEffect(() => {
    if (rig.missing.length > 0) console.warn('MPFB: thiếu xương, bỏ qua khớp tương ứng:', rig.missing.join(', '), url);
    return () => disposeRig(rig);
  }, [rig, url]);

  // Chỉ số morph theo tên (-1 nếu tệp không có morph đó). Chỉ nối morph có thật.
  const idx = useMemo(() => {
    const dict = rig.morphMesh?.morphTargetDictionary ?? {};
    const out = {} as Record<FaceMorph | BodyMorph, number>;
    for (const name of [...FACE_MORPHS, ...BODY_MORPHS]) out[name] = name in dict ? dict[name] : -1;
    const absent = [...FACE_MORPHS, ...BODY_MORPHS].filter((n) => out[n] < 0);
    if (absent.length > 0) console.warn('MPFB: tệp thiếu morph, bỏ qua:', absent.join(', '), url);
    return out;
  }, [rig, url]);

  // Morph thân: đổi khi look đổi, không chạy mỗi khung.
  useEffect(() => {
    const infl = rig.morphMesh?.morphTargetInfluences;
    if (!infl) return;
    const weights = look ? bodyMorphWeights(look) : null;
    for (const name of BODY_MORPHS) {
      const v = weights ? weights[name] : 0;
      if (SIGNED_MORPHS.has(name)) {
        if (idx[name] >= 0 && idx[name] < infl.length) infl[idx[name]] = clamp11(v);
      } else setMorph(infl, idx[name], v);
    }
  }, [rig, look, idx]);

  const heightM = targetHeightM(style, frame, look?.body.heightCm);
  const scale = heightM / rig.nativeHeight;
  // Hình thể bằng xương (tay, chân, cổ, lưng): áp lên skeleton dùng chung với vỏ trang phục.
  const shape = useMemo(() => boneShapeOf(look), [look]);
  useEffect(() => applyBoneShape(rig.root, shape), [rig, shape]);
  // Hook e2e (?debug=shape): window.__gpbShape.read() cho avatar mount sau cùng (sân khấu phòng thay đồ).
  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('debug') !== 'shape') return;
    const w = window as unknown as { __gpbShape?: { read: () => ShapeDebug | null } };
    const reader = { read: (): ShapeDebug | null => readShapeDebug(rig) };
    w.__gpbShape = reader;
    return () => {
      if (w.__gpbShape === reader) delete w.__gpbShape;
    };
  }, [rig]);
  // Chân dài/ngắn đổi vị trí bàn chân thấp nhất: tính lại mặt sàn và độ cao hông (IK chân và camera theo đó).
  const drop = footDrop(REST_SPANS[mpfbModelFor(style, frame)], shape);
  // Chân chạm y = 0: dịch lên bù đáy chân của mesh (khoảng 2,4 đến 2,7 cm ở tệp gốc).
  const groundY = -(rig.minY - drop) * scale;
  // rootY của AvatarPose tính theo hông 0,86 m của rig dự phòng: quy đổi theo độ cao hông thật.
  const rootYScale = ((rig.hipY + drop) * scale) / POSE_HIP_HEIGHT;

  const expressionBase = EXPRESSION_FACE[look?.face.expression ?? 'neutral'] ?? {};

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const emoting = emote && sampleEmotePose(scratch);
    let pose: AvatarPose;
    // Chọn clip theo animation (NPC) hoặc trạng thái FSM (người chơi); thiếu clip/lỗi tải/?baked=0 thì procedural.
    const emoteId = emoting ? getEmoteState().id : null;
    const choice = chooseBakedClip(animation, playerLocomotion.fsm, baked?.names ?? null, !!emoting, {
      emoteId,
      emoteReduced: emoting ? isEmoteReduced() : false,
      turn: animation === 'locomotion' ? playerLocomotion.turn : 0,
      prevClip: baked?.player.current,
    });
    const useBaked = !!baked && choice.clip !== null;
    if (animation === 'locomotion') {
      playerClipDebug.clip = choice.clip;
      playerClipDebug.source = useBaked ? 'baked' : 'procedural';
    }
    if (baked) {
      if (useBaked && choice.clip) {
        baked.player.play(choice.clip, emoteId ? emoteFadeSec(emoteId) : undefined);
        baked.player.setTimeScale(animation === 'locomotion' ? clipTimeScale(choice.clip, playerLocomotion.speed, playerLocomotion.turn) : 1);
      } else baked.player.stop();
    }
    if (useBaked && baked) {
      // Clip bake điều khiển xương (kể cả Root: độ cao thân, xoay), nên không áp tư thế procedural và không dịch group.
      baked.player.update(dt);
      pose = scratch;
    } else if (emoting) {
      // Emote không ghi gối: duỗi thẳng như VrmAvatar.
      scratch.kneeLX = 0;
      scratch.kneeRX = 0;
      pose = scratch;
    } else {
      pose = computePose(animation, t);
    }
    const g = rootRef.current;
    if (useBaked) {
      if (g) {
        g.position.y = 0;
        g.rotation.y = 0;
      }
      // Quay đầu theo camera của người chơi: chồng lên cổ/đầu sau khi clip đã ghi xương.
      if (animation === 'locomotion' && Math.abs(playerLocomotion.headYaw) > 1e-3) {
        headPose.neckRotY = playerLocomotion.headYaw * 0.4;
        headPose.headRotY = playerLocomotion.headYaw * 0.6;
        applyMpfbPose(rig, headPose, work, HEAD_ONLY);
      }
    } else {
      applyMpfbPose(rig, pose, work);
      if (g) {
        g.position.y = pose.rootY * rootYScale;
        g.rotation.y = pose.rootRotY;
      }
    }

    // Biểu cảm: emote đang phát (nếu có trong bảng) hoặc biểu cảm nền; trộn mượt.
    const infl = rig.morphMesh?.morphTargetInfluences;
    if (!infl) return;
    const goal = (emoteId && EMOTE_FACE[emoteId]) || expressionBase;
    const f = face.current;
    const d = Math.min(Math.max(dt, 0), 0.1);
    f.smile = approach(f.smile, goal.smile ?? 0, 8, d);
    f.frown = approach(f.frown, goal.frown ?? 0, 8, d);
    f.jaw = approach(f.jaw, goal.jaw ?? 0, 10, d);
    f.wide = approach(f.wide, goal.wide ?? 0, 12, d);
    f.browUp = approach(f.browUp, goal.browUp ?? 0, 8, d);
    f.browDown = approach(f.browDown, goal.browDown ?? 0, 8, d);
    f.blink = approach(f.blink, goal.blink ?? 0, 10, d);
    const cycle = (t + blinkSeed) % BLINK_PERIOD;
    const blinkPulse = cycle < BLINK_TIME ? Math.sin((cycle / BLINK_TIME) * Math.PI) : 0;
    const blink = clamp01(Math.max(f.blink, blinkPulse) - f.wide * 0.5);

    setMorph(infl, idx.eyeBlink_L, blink);
    setMorph(infl, idx.eyeBlink_R, blink);
    setMorph(infl, idx.eyeWide_L, f.wide);
    setMorph(infl, idx.eyeWide_R, f.wide);
    setMorph(infl, idx.jawOpen, f.jaw);
    setMorph(infl, idx.mouthSmile, f.smile);
    setMorph(infl, idx.mouthFrown, f.frown);
    // mouthPucker: chưa có emote hay biểu cảm dùng, để nghỉ.
    setMorph(infl, idx.mouthPucker, 0);
    setMorph(infl, idx.browUp_L, Math.min(BROW_MAX, f.browUp));
    setMorph(infl, idx.browUp_R, Math.min(BROW_MAX, f.browUp));
    setMorph(infl, idx.browDown_L, Math.min(BROW_MAX, f.browDown));
    setMorph(infl, idx.browDown_R, Math.min(BROW_MAX, f.browDown));
  });

  // Hình xăm vẽ trong app (TASK 19): tài liệu theo kiểu mô hình, áp lên vật liệu thân.
  useBodyTattoo(rig.root, mpfbModelFor(style, frame), 'medium');

  // Chạy sau useFrame ghi tư thế ở trên (cùng priority, thứ tự đăng ký).
  const seatedIk = useRef(false);
  const socketOffset = handSocketForUrl(url);
  const armGrip = useRef({ L: false, R: false });
  const fingersR = useRef<FingerGrip | null>(null);
  const fingersL = useRef<FingerGrip | null>(null);
  const anchorRef = useRef<THREE.Group>(null);
  useLimbIK(IK_ON ? rig.root : null, (ctrl, dt) => {
    if (ctrl.ground === null) {
      ctrl.ground = { sampler: FLAT_FLOOR, maxPelvisDrop: 0.15, maxPelvisRaise: 0.05, maxFootTilt: 0, smoothRate: 12 };
    }
    // Ngồi: hông khớp mặt ghế, chân chạm sàn qua IK chân. Gốc nhân vật nằm tại điểm ngồi (x, z) trên sàn.
    const sit = animation === 'sit' ? 1 : animation === 'locomotion' ? playerLocomotion.sit : 0;
    const g = anchorRef.current;
    if (g && sit > 0.5) {
      g.updateWorldMatrix(true, false);
      g.matrixWorld.decompose(_ikPos, _ikQuat, _ikScl);
      const floorY = _ikPos.y - groundY;
      const fwd = _ikFwd.set(0, 0, 1).applyQuaternion(_ikQuat);
      _ikAnchor.set(_ikPos.x, floorY + SEAT_SURFACE_Y * rootYScale, _ikPos.z);
      const seatYaw = Math.atan2(fwd.x, fwd.z);
      // Bàn có máy tính trước mặt: đặt tay lên mặt bàn (độ cao từ dữ liệu khối bàn).
      const deskY = deskHeightAhead(_ikAnchor.x, _ikAnchor.z, seatYaw);
      const hands = deskY === null ? undefined : deskHandPoints(_ikAnchor, seatYaw, floorY + deskY, 0.3, 0.15);
      if (IK_DEBUG) IK_DEBUG.deskErr = hands ? Math.max(ctrl.lastError('armL'), ctrl.lastError('armR')) : -1;
      applySeatPose(ctrl, { anchor: _ikAnchor, yaw: seatYaw, floorY, pelvisAboveSeat: 0.1 * rootYScale }, hands);
      ctrl.pelvisTarget.weight = sit;
      seatedIk.current = true;
    } else if (seatedIk.current) {
      releaseSeatPose(ctrl);
      seatedIk.current = false;
    }
    // Grip (chỉ nhân vật người chơi): cầm vật bằng E -> tay phải với tới socket, ngón khép; điện thoại cầm/dùng.
    if (animation === 'locomotion') {
      fingersR.current ??= ctrl.hasLimb('armR') ? new FingerGrip(ctrl.chain('armR')!.bones.end) : null;
      fingersL.current ??= ctrl.hasLimb('armL') ? new FingerGrip(ctrl.chain('armL')!.bones.end) : null;
      const held = getHeldItem();
      let usedL = false;
      let usedR = false;
      let gripOk = false;
      if (held !== null) {
        const profile = /phone/i.test(held) ? 'phone' : 'cup';
        gripOk = (() => {
          const sh = ctrl.limbRootPosition('armR', _ikAnchor);
          return sh ? gripAt(ctrl, fingersR.current, 'R', cupReachPoint(sh, playerPose.yaw, ctrl.limbLength('armR'), _ikCup), profile, socketOffset) : false;
        })();
        usedR = true;
      }
      const ph = look?.accessories?.phone;
      if (ph && ph.state !== 'stowed') {
        const side: 'L' | 'R' = ph.side === 'left' ? 'L' : 'R';
        if (!(side === 'R' && usedR)) {
          const fingers = side === 'L' ? fingersL.current : fingersR.current;
          if (side === 'L') usedL = true;
          else usedR = true;
          if (ph.state === 'using') {
            // Đưa điện thoại lên trước ngực: điểm cách vai 0,25 m phía trước, thấp hơn vai 0,2 m.
            const id = side === 'L' ? 'armL' : 'armR';
            const sh = ctrl.limbRootPosition(id, _ikAnchor);
            if (sh) {
              const k = ctrl.limbLength(id) / 0.56;
              const sy = Math.sin(playerPose.yaw);
              const cy = Math.cos(playerPose.yaw);
              _ikCup.set(sh.x + sy * 0.25 * k, sh.y - 0.2 * k, sh.z + cy * 0.25 * k);
              gripAt(ctrl, fingers, side, _ikCup, 'phone');
            }
          } else fingers?.grip('phone');
        }
      }
      if (!usedL) fingersL.current?.grip(null);
      if (!usedR) fingersR.current?.grip(null);
      // Hết cầm: trả tay về animation (tư thế ngồi tự quản tay qua applySeatPose).
      if (!usedR && armGrip.current.R) ctrl.targets.armR.active = false;
      if (!usedL && armGrip.current.L) ctrl.targets.armL.active = false;
      armGrip.current.R = usedR && (held !== null || ph?.state === 'using');
      armGrip.current.L = usedL && ph?.state === 'using';
      fingersL.current?.update(dt);
      fingersR.current?.update(dt);
      const hand = ctrl.chain('armR')?.bones.end;
      ikHold.active = gripOk && ctrl.weights.armR > 0.9 && !!hand;
      if (ikHold.active && hand) {
        hand.updateWorldMatrix(true, false);
        ikHold.handSocket.set(...socketOffset).applyMatrix4(hand.matrixWorld);
      }
      if (IK_DEBUG) {
        IK_DEBUG.gripActive = ikHold.active;
        IK_DEBUG.holdDist = ikHold.active && ikHold.itemPos ? ikHold.handSocket.distanceTo(ikHold.itemPos) : -1;
      }
    }
    if (IK_DEBUG) {
      const pel = ctrl.bones.pelvis;
      let bad = 0;
      rig.root.traverse((o) => {
        const e = o.matrixWorld.elements;
        for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) { bad++; break; }
      });
      IK_DEBUG.frames++;
      if (sit > 0.5) IK_DEBUG.sitFrames++;
      IK_DEBUG.nanBones = bad;
      if (g) {
        g.updateWorldMatrix(true, false);
        IK_DEBUG.floorY = g.matrixWorld.elements[13] - groundY;
      }
      if (pel) IK_DEBUG.pelvisY = _ikAnchor.setFromMatrixPosition(pel.matrixWorld).y;
      const l = ctrl.chain('legL')?.bones.end;
      const r = ctrl.chain('legR')?.bones.end;
      if (l) IK_DEBUG.footY[0] = _ikAnchor.setFromMatrixPosition(l.matrixWorld).y;
      if (r) IK_DEBUG.footY[1] = _ikAnchor.setFromMatrixPosition(r.matrixWorld).y;
    }
  });

  return (
    <group position={[0, groundY, 0]} ref={anchorRef}>
      <group ref={rootRef}>
        <group scale={scale}>
          <primitive object={rig.root} />
          {/* Trang phục dựng từ vỏ thân, cùng skeleton và morph (TASK 04, docs/design/WARDROBE.md). */}
          <MpfbOutfit rig={rig} look={look} />
        </group>
      </group>
    </group>
  );
}

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
  url: string;
}

interface BoundaryState {
  failed: boolean;
}

/** Bắt lỗi tải hoặc đọc GLB, hiển thị nhân vật dự phòng thay vì để trống cảnh. */
class MpfbErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.warn(`Không tải được mô hình MPFB (${this.props.url}), dùng nhân vật dự phòng.`, error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface MpfbAvatarProps {
  appearance: Appearance;
  /** Ngoại hình mới (fashion). null: dùng mặc định theo kiểu tạo hình, không morph thân. */
  look: CharacterLook | null;
  displayName?: string;
  animation?: AvatarAnimation;
  emote?: boolean;
}

/**
 * Nhân vật người MPFB. Chọn male_real, female_real hoặc chibi theo look.bodyStyle và look.body.frame.
 * Đang tải hoặc lỗi thì hiển thị FallbackAvatar với cùng appearance.
 */
export function MpfbAvatar({ appearance, look, displayName, animation = 'idle', emote = false }: MpfbAvatarProps) {
  const style: BodyStyle = look?.bodyStyle ?? 'realistic';
  const frame: BodyFrame = look?.body.frame ?? (appearance.bodyType === 'slim' ? 'female' : 'male');
  const url = MPFB_MODEL_URLS[mpfbModelFor(style, frame)];
  const fallback = <FallbackAvatar appearance={appearance} displayName={displayName} animation={animation} emote={emote} />;
  return (
    <MpfbErrorBoundary key={url} url={url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <MpfbModel url={url} style={style} frame={frame} look={look} animation={animation} emote={emote} />
      </Suspense>
    </MpfbErrorBoundary>
  );
}
