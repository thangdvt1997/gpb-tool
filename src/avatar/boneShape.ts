/**
 * Hình thể bằng xương (không có morph trong GLB): chiều dài tay, chân, cổ và độ cong lưng trên skeleton MPFB
 * (53 xương, dùng chung cho male_real, female_real, chibi). Thuần three, không React.
 *
 * Cách làm: scale trục dọc xương (trục Y cục bộ của xương MPFB) của xương gốc đoạn (upperarm, thigh, neck_01);
 * các xương con kế thừa nên cả chi dài ra. Bàn tay, bàn chân, đầu bù ngược (1/L) để giữ nguyên kích thước.
 * Vỏ trang phục, hình xăm và phụ kiện dùng chung skeleton nên tự theo (xem boneShape.vitest.test.ts).
 * Lưng: xoay nhẹ spine_01..03 quanh trục ngang của mô hình (dương = gù về trước, âm = ưỡn).
 *
 * Giới hạn an toàn (kẹp ở đây, ngoài kẹp của rules.ts): tay/chân +-15%, cổ -30% đến +25%, lưng +-0,2 rad tổng.
 * Chiều cao hiển thị tăng/giảm theo chân và cổ (chân dài hơn thì người cao hơn); camera và chạm sàn tính lại
 * từ shapedHeightM và footDropM.
 */
import * as THREE from 'three';
import type { CharacterLook } from '../fashion/types';

export interface BoneShape {
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  neck: number;
  /** Cỡ bàn tay, bàn chân (scale đều quanh cổ tay, cổ chân; 1 = nguyên bản). */
  handL: number;
  handR: number;
  footL: number;
  footR: number;
  /** Tổng góc gù (rad) chia đều cho spine_01..03. */
  backRad: number;
  /** Cỡ đầu (scale đều quanh khớp head; 1 = nguyên bản). Chỉ đặt theo kiểu tạo hình (CHIBI_HEAD_SCALE), không có slider. */
  head: number;
}

export const IDENTITY_BONE_SHAPE: Readonly<BoneShape> = { armL: 1, armR: 1, legL: 1, legR: 1, neck: 1, handL: 1, handR: 1, footL: 1, footR: 1, backRad: 0, head: 1 };

export const BONE_SHAPE_LIMITS = {
  limb: { min: 0.85, max: 1.15 },
  neck: { min: 0.7, max: 1.25 },
  /** Bàn tay, bàn chân: scale đều, kẹp -25% đến +25% (slider -0,5..0,5 nhân handGain). Đáy chân tính lại trong footDrop. */
  extremity: { min: 0.75, max: 1.25 },
  extremityGain: 0.5,
  backRad: 0.2,
  /** Hệ số từ trọng số slider (-1..1) sang độ lệch scale. */
  limbGain: 0.3,
  neckGain: 0.4,
} as const;

function clampTo(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1;
}

/** Look -> hệ số xương. null hoặc trường thiếu/hỏng -> đơn vị (không đổi). */
export function boneShapeOf(look: CharacterLook | null | undefined): BoneShape {
  if (!look) return { ...IDENTITY_BONE_SHAPE };
  const b = look.body;
  const L = BONE_SHAPE_LIMITS;
  const limb = (w: unknown): number => clampTo(1 + L.limbGain * (typeof w === 'number' ? w : 0), L.limb.min, L.limb.max);
  const ext = (w: unknown): number => clampTo(1 + L.extremityGain * (typeof w === 'number' ? w : 0), L.extremity.min, L.extremity.max);
  const back = typeof b.torso?.back === 'number' && Number.isFinite(b.torso.back) ? b.torso.back : 0;
  const neck = typeof b.torso?.neckLength === 'number' ? b.torso.neckLength : 0;
  return {
    armL: limb(b.arms?.left?.length),
    armR: limb(b.arms?.right?.length),
    legL: limb(b.legs?.left?.length),
    legR: limb(b.legs?.right?.length),
    handL: ext(b.arms?.left?.hand),
    handR: ext(b.arms?.right?.hand),
    footL: ext(b.legs?.left?.foot),
    footR: ext(b.legs?.right?.foot),
    neck: clampTo(1 + L.neckGain * neck, L.neck.min, L.neck.max),
    backRad: Math.min(1, Math.max(-1, back)) * L.backRad,
    head: 1,
  };
}

/**
 * Sảnh mở chibi (concept D, 09/11/2026): đầu to, thân gọn. Tệp chibi.glb giữ nguyên; chỉ phóng đầu khi hiển thị.
 * Đỉnh đầu cao thêm vài cm (chưa tính vào shapedHeightM: camera và va chạm theo thân, không theo đỉnh đầu).
 */
export const CHIBI_HEAD_SCALE = 1.22;

/** Hệ số xương theo look và tệp mô hình: chibi phóng đầu theo CHIBI_HEAD_SCALE. */
export function boneShapeForModel(look: CharacterLook | null | undefined, model: string): BoneShape {
  const s = boneShapeOf(look);
  if (model === 'chibi') s.head = CHIBI_HEAD_SCALE;
  return s;
}

export function isIdentityBoneShape(s: BoneShape): boolean {
  return s.armL === 1 && s.armR === 1 && s.legL === 1 && s.legR === 1 && s.neck === 1 && s.handL === 1 && s.handR === 1 && s.footL === 1 && s.footR === 1 && s.backRad === 0 && s.head === 1;
}

/** Xương bắt buộc để hỗ trợ hình thể bằng xương. */
export const BONE_SHAPE_BONES: readonly string[] = [
  'upperarm_l', 'upperarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r',
  'neck_01', 'head', 'spine_01', 'spine_02', 'spine_03',
];

export function rigSupportsBoneShape(boneNames: Iterable<string>): boolean {
  const have = new Set(boneNames);
  return BONE_SHAPE_BONES.every((n) => have.has(n));
}

/** Ba tệp MPFB trong repo đều đủ xương (kiểm trong test trên GLB thật). */
export function modelSupportsBoneShape(model: string): boolean {
  return model === 'male_real' || model === 'female_real' || model === 'chibi';
}

interface SpineRest {
  q: THREE.Quaternion;
  parentRest: THREE.Quaternion;
}
const SPINE = ['spine_01', 'spine_02', 'spine_03'] as const;
const CACHES = new WeakMap<THREE.Object3D, Cache>();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _axis = new THREE.Vector3(1, 0, 0);

function scaleY(o: THREE.Object3D | undefined, k: number): void {
  if (o) o.scale.set(1, k, 1);
}

/**
 * Bù ngược cho xương con (bàn tay, bàn chân, đầu) khỏi bị kéo giãn theo xương cha. Hướng giãn d (đơn vị) biểu diễn
 * trong khung xương con; bù đường chéo scale_k = L^(-d_k^2) (đúng khi d trùng một trục, gần đúng khi lệch).
 */
function compensate(o: THREE.Object3D | undefined, k: number, d: readonly [number, number, number], u = 1): void {
  if (!o) return;
  o.scale.set(u * Math.pow(k, -d[0] * d[0]), u * Math.pow(k, -d[1] * d[1]), u * Math.pow(k, -d[2] * d[2]));
}

interface Cache {
  spine: Record<string, SpineRest>;
  /** Hướng giãn trong khung xương con, lấy lúc nghỉ. */
  dir: Record<string, [number, number, number]>;
}
const _wq1 = new THREE.Quaternion();
const _wq2 = new THREE.Quaternion();
const _dv = new THREE.Vector3();

function stretchDir(anc: THREE.Object3D | undefined, child: THREE.Object3D | undefined): [number, number, number] {
  if (!anc || !child) return [0, 1, 0];
  _dv.set(0, 1, 0).applyQuaternion(anc.getWorldQuaternion(_wq1)).applyQuaternion(child.getWorldQuaternion(_wq2).invert()).normalize();
  return [_dv.x, _dv.y, _dv.z];
}

/**
 * Áp hệ số lên rig. Gọi được lặp lại (đặt tuyệt đối, không cộng dồn). Không cấp phát khi đã có cache.
 * Lần gọi đầu phải khi rig còn ở tư thế nghỉ của GLB (ghi hướng nghỉ của cột sống và hướng giãn của bàn chân, đầu).
 * Tay: bàn tay luôn bù theo trục Y (khi hiển thị tay thả thẳng nên cánh tay, cẳng tay, bàn tay gần thẳng hàng).
 */
export function applyBoneShape(root: THREE.Object3D, s: BoneShape): void {
  const get = (n: string) => root.getObjectByName(n) ?? undefined;
  let cache = CACHES.get(root);
  if (!cache) {
    root.updateMatrixWorld(true);
    cache = { spine: {}, dir: {} };
    for (const n of SPINE) {
      const b = get(n);
      if (!b || !b.parent) continue;
      cache.spine[n] = { q: b.quaternion.clone(), parentRest: b.parent.getWorldQuaternion(new THREE.Quaternion()) };
    }
    cache.dir.foot_l = stretchDir(get('thigh_l'), get('foot_l'));
    cache.dir.foot_r = stretchDir(get('thigh_r'), get('foot_r'));
    cache.dir.head = stretchDir(get('neck_01'), get('head'));
    CACHES.set(root, cache);
  }
  const ARM_DIR: [number, number, number] = [0, 1, 0];
  scaleY(get('upperarm_l'), s.armL);
  compensate(get('hand_l'), s.armL, ARM_DIR, s.handL);
  scaleY(get('upperarm_r'), s.armR);
  compensate(get('hand_r'), s.armR, ARM_DIR, s.handR);
  scaleY(get('thigh_l'), s.legL);
  compensate(get('foot_l'), s.legL, cache.dir.foot_l, s.footL);
  scaleY(get('thigh_r'), s.legR);
  compensate(get('foot_r'), s.legR, cache.dir.foot_r, s.footR);
  scaleY(get('neck_01'), s.neck);
  compensate(get('head'), s.neck, cache.dir.head, s.head);

  const each = s.backRad / SPINE.length;
  for (const n of SPINE) {
    const b = get(n);
    const r = cache.spine[n];
    if (!b || !r) continue;
    // local' = Rpar^-1 * Rx(each) * Rpar * local  (xoay quanh trục ngang X của mô hình, trong khung cha lúc nghỉ)
    _r.setFromAxisAngle(_axis, each);
    _q.copy(r.parentRest).invert().multiply(_r).multiply(r.parentRest).multiply(r.q);
    b.quaternion.copy(_q);
  }
}

/** Kích thước nghỉ (m, trước scale tổng) dùng để tính chiều cao và chạm sàn mà không cần nạp rig. */
export interface RestSpans {
  /** Chiều cao mesh thân (maxY - minY). */
  native: number;
  /** Khoảng cao từ gốc đùi tới cổ chân (thigh -> foot) theo trục đứng. */
  legSpan: number;
  /** Khoảng cao từ neck_01 tới head. */
  neckSpan: number;
  /** Độ cao cổ chân (foot_l) so với đáy mesh (= 0 khi pivot ở mặt sàn). Bàn chân scale quanh cổ chân nên đáy dời (k-1)*ankle. */
  ankle: number;
}

/** Đo từ rig tư thế nghỉ (cần updateMatrixWorld). */
export function measureRestSpans(root: THREE.Object3D, native: number): RestSpans {
  root.updateMatrixWorld(true);
  const y = (n: string): number => root.getObjectByName(n)?.getWorldPosition(new THREE.Vector3()).y ?? 0;
  return { native, legSpan: y('thigh_l') - y('foot_l'), neckSpan: y('head') - y('neck_01'), ankle: y('foot_l') };
}

/**
 * Bàn chân thấp nhất (chân dài hơn trong hai chân) xuống thêm bao nhiêu so với tư thế nghỉ (m, đơn vị spans);
 * âm nếu chân ngắn đi (bàn chân lên). Dùng để đặt lại mặt sàn: đáy chân = minY - footDrop.
 */
export function footDrop(spans: RestSpans, s: BoneShape): number {
  return Math.max(legDrop(spans, s.legL) + (s.footL - 1) * spans.ankle, legDrop(spans, s.legR) + (s.footR - 1) * spans.ankle);
}

function legDrop(spans: RestSpans, leg: number): number {
  return (leg - 1) * spans.legSpan;
}

/** Số đo nghỉ của 3 tệp MPFB (đo bằng measureRestSpans, kiểm lại trong test trên GLB thật). */
export const REST_SPANS: Readonly<Record<'male_real' | 'female_real' | 'chibi', RestSpans>> = {
  male_real: { native: 1.86553156375885, legSpan: 0.9324754064586322, neckSpan: 0.10214763747966749, ankle: 0.07723577410197163 },
  female_real: { native: 1.5740147829055786, legSpan: 0.742468531307611, neckSpan: 0.10856492523403927, ankle: 0.0666339363539622 },
  chibi: { native: 0.873990535736084, legSpan: 0.39288453450116023, neckSpan: 0.03213911022805249, ankle: 0.038924127467934166 },
};

/**
 * Độ lệch chiều cao tổng (m, đơn vị spans). Chân dài hơn: chân thấp nhất xuống sâu hơn, người được nâng lên
 * bằng đúng chừng đó. Chân ngắn hơn: bàn chân thấp nhất lên cao, người hạ xuống (theo chân dài nhất, cùng quy ước).
 */
export function heightDelta(spans: RestSpans, s: BoneShape): number {
  const leg = (Math.max(s.legL, s.legR) - 1) * spans.legSpan;
  const neck = (s.neck - 1) * spans.neckSpan;
  return leg + neck;
}

/** Chiều cao hiển thị (m) khi đã tính chân, cổ. baseHeightM = chiều cao mục tiêu của look. */
export function shapedHeightM(baseHeightM: number, spans: RestSpans, s: BoneShape): number {
  return (baseHeightM * (spans.native + heightDelta(spans, s))) / spans.native;
}
