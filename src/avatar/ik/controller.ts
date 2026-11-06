import * as THREE from 'three';
import { LIMB_IDS, mapLimbBones, type LimbId, type LimbRigBones } from './boneMap';
import { defaultLimits, LimbChain } from './limbChain';

/** Mục tiêu của một chi. Các trường được sửa tại chỗ mỗi khung, không tạo đối tượng mới. */
export interface LimbTarget {
  /** false: trọng số mục tiêu = 0, blend về tư thế animation (vị trí cuối được giữ, không giật về gốc). */
  active: boolean;
  /** Vị trí đầu mút (bàn tay/bàn chân) trong không gian thế giới. */
  position: THREE.Vector3;
  usePole: boolean;
  /** Điểm pole thế giới: khuỷu/gối hướng về điểm này. */
  pole: THREE.Vector3;
  useOrientation: boolean;
  quaternion: THREE.Quaternion;
  /** Trọng số mong muốn 0..1; trọng số thực được làm mượt theo thời gian. */
  weight: number;
}

export function createLimbTarget(): LimbTarget {
  return {
    active: false,
    position: new THREE.Vector3(),
    usePole: false,
    pole: new THREE.Vector3(),
    useOrientation: false,
    quaternion: new THREE.Quaternion(),
    weight: 1,
  };
}

/** Mục tiêu hông (ngồi): kéo xương pelvis tới điểm này. */
export interface PelvisTarget {
  active: boolean;
  position: THREE.Vector3;
  weight: number;
}

export interface GroundSample {
  y: number;
  nx: number;
  ny: number;
  nz: number;
}
/** Lấy độ cao và pháp tuyến sàn tại (x,z); trả về false nếu không có sàn (chân sẽ không được căn). */
export type GroundSampler = (x: number, z: number, out: GroundSample) => boolean;

export interface FootGroundOptions {
  sampler: GroundSampler;
  /** Hạ hông tối đa (m). */
  maxPelvisDrop: number;
  /** Nâng hông tối đa (m). */
  maxPelvisRaise: number;
  /** Góc nghiêng bàn chân tối đa theo pháp tuyến (rad); 0 để không nghiêng. */
  maxFootTilt: number;
  /** Tốc độ làm mượt độ lệch sàn (1/s). */
  smoothRate: number;
  /** Độ cao mắt cá so với gốc rig khi đứng thẳng; mặc định đo lúc dựng. */
  ankleHeight?: number;
}

export interface LimbIKOptions {
  /** Tốc độ blend trọng số (1/s). */
  blendRate: number;
  /** Làm mượt vị trí mục tiêu (1/s); 0 = tắt. */
  positionSmoothing: number;
}

const DEFAULTS: LimbIKOptions = { blendRate: 10, positionSmoothing: 0 };

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qid = new THREE.Quaternion();
const _lens = { l1: 0, l2: 0 };
const _gs: GroundSample = { y: 0, nx: 0, ny: 1, nz: 0 };

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Điều phối IK các chi, chạy SAU khi animation đã ghi tư thế.
 * Thứ tự trong update(): cập nhật ma trận → hông (ngồi/sàn) → từng chi.
 */
export class LimbIKController {
  readonly bones: LimbRigBones;
  readonly targets: Record<LimbId, LimbTarget> = {
    armL: createLimbTarget(),
    armR: createLimbTarget(),
    legL: createLimbTarget(),
    legR: createLimbTarget(),
  };
  readonly pelvisTarget: PelvisTarget = { active: false, position: new THREE.Vector3(), weight: 1 };
  /** Bật để chân tự bám sàn (khi chi chân không có mục tiêu thủ công). */
  ground: FootGroundOptions | null = null;
  /** Công tắc từng solver để đối chiếu animation gốc. */
  readonly enabled: Record<LimbId, boolean> = { armL: true, armR: true, legL: true, legR: true };
  /** Trọng số tổng 0..1 nhân vào tất cả. */
  globalWeight = 1;
  readonly options: LimbIKOptions;

  /** Trọng số đã làm mượt (đọc để debug). */
  readonly weights: Record<LimbId, number> = { armL: 0, armR: 0, legL: 0, legR: 0 };
  pelvisWeight = 0;

  private readonly chains: Partial<Record<LimbId, LimbChain>> = {};
  private readonly smoothed: Record<LimbId, THREE.Vector3> = {
    armL: new THREE.Vector3(),
    armR: new THREE.Vector3(),
    legL: new THREE.Vector3(),
    legR: new THREE.Vector3(),
  };
  private readonly smoothedInit: Record<LimbId, boolean> = { armL: false, armR: false, legL: false, legR: false };
  private readonly autoTarget: Record<'legL' | 'legR', LimbTarget> = { legL: createLimbTarget(), legR: createLimbTarget() };
  private readonly footOffset = { legL: 0, legR: 0 };
  private readonly footStance = { legL: 1, legR: 1 };
  private readonly footNormal = { legL: new THREE.Vector3(0, 1, 0), legR: new THREE.Vector3(0, 1, 0) };
  private pelvisOffset = 0;
  private readonly pelvisBase = new THREE.Vector3();
  private readonly pelvisWrittenPos = new THREE.Vector3();
  private pelvisWritten = false;
  private ankleRest = { legL: 0, legR: 0 };
  private readonly smoothPelvis = new THREE.Vector3();
  private smoothPelvisInit = false;

  constructor(
    readonly root: THREE.Object3D,
    options: Partial<LimbIKOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.bones = mapLimbBones(root);
    for (const id of LIMB_IDS) {
      const b = this.bones.limbs[id];
      if (b) this.chains[id] = new LimbChain(b, defaultLimits(id));
    }
    this.recalibrate();
  }

  /** Đo lại độ cao mắt cá (gọi khi hình thể/tỷ lệ đổi). */
  recalibrate(): void {
    this.root.updateWorldMatrix(true, true);
    const ry = _tmp.setFromMatrixPosition(this.root.matrixWorld).y;
    for (const id of ['legL', 'legR'] as const) {
      const c = this.chains[id];
      this.ankleRest[id] = c ? _tmp2.setFromMatrixPosition(c.bones.end.matrixWorld).y - ry : 0;
    }
  }

  hasLimb(id: LimbId): boolean {
    return !!this.chains[id];
  }
  chain(id: LimbId): LimbChain | undefined {
    return this.chains[id];
  }

  /** Vị trí gốc chuỗi (vai/hông) thế giới. Cần ma trận thế giới hiện hành. */
  limbRootPosition(id: LimbId, out: THREE.Vector3): THREE.Vector3 | null {
    const c = this.chains[id];
    return c ? out.setFromMatrixPosition(c.bones.root.matrixWorld) : null;
  }

  /** Tổng chiều dài chi (tầm với tối đa tính từ vai/hông), m. */
  limbLength(id: LimbId): number {
    const c = this.chains[id];
    if (!c) return 0;
    c.lengths(_lens);
    return _lens.l1 + _lens.l2;
  }

  /** Điểm có nằm trong tầm với (có chừa biên margin m) không. */
  canReach(id: LimbId, point: THREE.Vector3, margin = 0.02): boolean {
    this.root.updateWorldMatrix(true, true);
    const c = this.chains[id];
    if (!c) return false;
    c.lengths(_lens);
    _tmp.setFromMatrixPosition(c.bones.root.matrixWorld);
    const d = _tmp.distanceTo(point);
    return Number.isFinite(d) && d <= _lens.l1 + _lens.l2 - margin;
  }

  /** Mức độ sai số đầu mút lần giải gần nhất (m). */
  lastError(id: LimbId): number {
    return this.chains[id]?.result.error ?? 0;
  }
  /** true nếu lần giải gần nhất với tới được mục tiêu. */
  lastReachable(id: LimbId): boolean {
    return this.chains[id]?.result.reachable ?? true;
  }

  private blendWeight(cur: number, goal: number, dt: number): number {
    const k = 1 - Math.exp(-this.options.blendRate * dt);
    const v = cur + (goal - cur) * k;
    return Math.abs(v - goal) < 1e-4 ? goal : v;
  }

  /** Chạy một lần mỗi khung sau animation. dt tính bằng giây. */
  update(dt: number): void {
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.25) dt = 0.25;
    // Khôi phục tư thế gốc (nếu animation không ghi đè) rồi mới cập nhật ma trận.
    for (const id of LIMB_IDS) this.chains[id]?.restore();
    if (this.pelvisWritten && this.bones.pelvis?.position.equals(this.pelvisWrittenPos)) {
      this.bones.pelvis.position.copy(this.pelvisBase);
    }
    this.pelvisWritten = false;
    if (this.bones.pelvis) this.pelvisBase.copy(this.bones.pelvis.position);
    this.root.updateWorldMatrix(true, true);
    const gw = Math.min(1, Math.max(0, this.globalWeight));

    // 1) Hông: ưu tiên mục tiêu ngồi, nếu không thì bù theo sàn.
    const pelvis = this.bones.pelvis;
    let groundActive = false;
    if (pelvis) {
      const pt = this.pelvisTarget;
      const goal = pt.active ? Math.min(1, Math.max(0, pt.weight)) * gw : 0;
      this.pelvisWeight = this.blendWeight(this.pelvisWeight, goal, dt);
      if (pt.active && !this.smoothPelvisInit) {
        this.smoothPelvis.copy(pt.position);
        this.smoothPelvisInit = true;
      }
      if (pt.active && this.options.positionSmoothing > 0 && this.pelvisWeight > 0.01) {
        this.smoothPelvis.lerp(pt.position, 1 - Math.exp(-this.options.positionSmoothing * dt));
      } else if (pt.active) this.smoothPelvis.copy(pt.position);
      if (this.pelvisWeight > 1e-4 && this.smoothPelvisInit) {
        _tmp.setFromMatrixPosition(pelvis.matrixWorld);
        _tmp2.subVectors(this.smoothPelvis, _tmp).multiplyScalar(this.pelvisWeight);
        this.movePelvis(pelvis, _tmp, _tmp2);
      } else if (this.ground && gw > 0) {
        groundActive = true;
        this.updateGround(pelvis, dt, gw);
      }
    }

    // 2) Từng chi.
    for (const id of LIMB_IDS) {
      const chain = this.chains[id];
      if (!chain) continue;
      let t = this.targets[id];
      let extraW = 1;
      if (!t.active && groundActive && (id === 'legL' || id === 'legR')) {
        t = this.autoTarget[id];
        extraW = 1;
      }
      const goal = this.enabled[id] && t.active ? Math.min(1, Math.max(0, t.weight)) * gw * extraW : 0;
      this.weights[id] = this.blendWeight(this.weights[id], goal, dt);
      const w = this.weights[id];
      if (w <= 1e-5) {
        this.smoothedInit[id] = false;
        continue;
      }
      const sp = this.smoothed[id];
      if (!this.smoothedInit[id] || this.options.positionSmoothing <= 0 || w < 0.02) {
        sp.copy(t.position);
        this.smoothedInit[id] = true;
      } else {
        sp.lerp(t.position, 1 - Math.exp(-this.options.positionSmoothing * dt));
      }
      if (!Number.isFinite(sp.x + sp.y + sp.z)) continue;
      chain.apply(sp, t.usePole ? t.pole : null, w, t.useOrientation ? t.quaternion : null, 1);
    }
  }

  /** Dịch hông theo vector thế giới delta, đổi sang không gian cục bộ của cha. */
  private movePelvis(pelvis: THREE.Object3D, world: THREE.Vector3, delta: THREE.Vector3): void {
    _tmp.copy(world).add(delta);
    if (pelvis.parent) pelvis.parent.worldToLocal(_tmp);
    pelvis.position.copy(_tmp);
    this.pelvisWrittenPos.copy(_tmp);
    this.pelvisWritten = true;
    pelvis.updateMatrixWorld(true);
  }

  /** Foot IK theo sàn: tính chênh lệch sàn từng chân, hạ hông và đặt mục tiêu tự động cho chân. */
  private updateGround(pelvis: THREE.Object3D, dt: number, gw: number): void {
    const g = this.ground as FootGroundOptions;
    const rootPos = _tmp.setFromMatrixPosition(this.root.matrixWorld);
    const rootX = rootPos.x;
    const rootY = rootPos.y;
    const rootZ = rootPos.z;
    if (!g.sampler(rootX, rootZ, _gs)) return;
    const baseFloor = _gs.y;
    const k = 1 - Math.exp(-g.smoothRate * dt);
    let minOff = Infinity;
    for (const id of ['legL', 'legR'] as const) {
      const c = this.chains[id];
      const at = this.autoTarget[id];
      at.active = false;
      if (!c) continue;
      const a = _tmp2.setFromMatrixPosition(c.bones.end.matrixWorld);
      const has = g.sampler(a.x, a.z, _gs);
      const off = has ? _gs.y - baseFloor : 0;
      this.footOffset[id] += (off - this.footOffset[id]) * k;
      if (has) this.footNormal[id].set(_gs.nx, _gs.ny, _gs.nz);
      minOff = Math.min(minOff, this.footOffset[id]);
      // Pha chạm đất/vung: chân nhấc cao hơn mắt cá nghỉ thì giảm dần trọng số.
      const ankleRest = g.ankleHeight ?? this.ankleRest[id];
      const lift = a.y - (rootY + ankleRest);
      const stance = has ? 1 - smoothstep(0.02, 0.08, lift) : 0;
      this.footStance[id] += (stance - this.footStance[id]) * Math.min(1, k * 2);
      at.position.set(a.x, a.y + this.footOffset[id], a.z);
      at.usePole = false;
      at.weight = this.footStance[id];
      at.active = has && at.weight > 1e-3;
    }
    if (!Number.isFinite(minOff)) minOff = 0;
    const goal = Math.min(g.maxPelvisRaise, Math.max(-g.maxPelvisDrop, minOff)) * gw;
    this.pelvisOffset += (goal - this.pelvisOffset) * k;

    // Hông dịch theo độ lệch; mục tiêu bàn chân đã tính từ vị trí animation trước khi dịch.
    _tmp.setFromMatrixPosition(pelvis.matrixWorld);
    _tmp2.set(0, this.pelvisOffset, 0);
    this.movePelvis(pelvis, _tmp, _tmp2);

    // Nghiêng bàn chân theo pháp tuyến (giới hạn góc) qua hướng mục tiêu.
    for (const id of ['legL', 'legR'] as const) {
      const at = this.autoTarget[id];
      at.useOrientation = false;
      const c = this.chains[id];
      if (!c || !at.active || g.maxFootTilt <= 0) continue;
      _n.copy(this.footNormal[id]);
      if (_n.lengthSq() < 0.5) continue;
      _qa.setFromUnitVectors(_up, _n);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_qa.w)));
      if (ang > g.maxFootTilt) _qa.slerp(_qid, 1 - g.maxFootTilt / ang);
      c.bones.end.matrixWorld.decompose(_tmp, _qb, _tmp2);
      at.quaternion.copy(_qa).multiply(_qb);
      at.useOrientation = true;
    }
  }
}
