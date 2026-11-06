// Chuỗi cảnh ghi danh cổng tầng 7 (docs/design/CHECKIN_ENTRY.md mục 1 và 4).
//
// Dòng thời gian (bình thường, khoảng 17 giây cộng thời gian chờ API):
//   0,0  mờ dần vào, nhân vật trong cabin thang Đông, bảng số "7".
//   1,0  chuông, cửa mở (1,3 s).
//   2,4  bước ra, rẽ trái tới trước làn cổng xoay (khoảng 3,7 m, 2,8 s), quay mặt về bảo vệ (0,5 s).
//   5,7  bảo vệ đứng dậy, đưa máy quét, tia quét chạy qua huy hiệu. Gọi postCheckin(). Tối thiểu 2,6 s.
//   8,3  "Đã ghi danh lúc HH:mm", bảo vệ gật, cổng mở (1,4 s).
//   9,7  đi qua cổng, dọc hành lang giữa về phía Tây tới điểm thả ENTRY_DROP (khoảng 13 m, 7,1 s).
//  16,8  onFinish('checked').
// prefers-reduced-motion: không đi bộ, không lia camera. Hai cảnh tĩnh nối bằng mờ dần, vẫn gọi API. Khoảng 6 giây.
// Nút "Bỏ qua" luôn hiện (trước khi quét là nút riêng, từ lúc quét là nút của CheckinScanOverlay). Esc, Enter cũng bỏ qua.
// Lỗi API: pha 'error', có nút Thử lại. Bỏ qua lúc lỗi trả 'error'.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar } from '../../avatar/Avatar';
import { DEFAULT_APPEARANCE, type Appearance } from '../../avatar/appearance';
import type { AvatarAnimation } from '../../avatar/animation';
import { postCheckin } from '../../checkin/api';
import { CheckinScanOverlay } from '../../checkin/CheckinScanOverlay';
import type { ZoneDef, ZoneObject } from '../../content/types';
import itZone from '../../content/zones/it.json';
import { playLiftChime } from './chime';
import { ENTRY_DROP, GATE, LIFT, gateFrame, liftFrames, liftPoint } from './placement';
import { GUARD_IDLE_YAW, resetRig, rig } from './rig';

export type EntryResult = 'checked' | 'skipped' | 'error';
type OverlayPhase = 'scanning' | 'done' | 'already' | 'error';
type ApiState = 'idle' | 'pending' | 'ok' | 'already' | 'error';
type Step = 'intro' | 'doors' | 'walkIn' | 'turn' | 'scan' | 'result' | 'error' | 'walkOut' | 'fadeA' | 'fadeB' | 'end';

export interface EntrySequenceProps {
  userName: string;
  checkedIn: boolean;
  onFinish: (result: EntryResult) => void;
  /** Tùy chọn, ngoài hợp đồng: ngoại hình nhân vật. Mặc định DEFAULT_APPEARANCE. */
  appearance?: Appearance;
  /** Tùy chọn, ngoài hợp đồng: vật thể của khu. Mặc định đọc src/content/zones/it.json. */
  objects?: readonly ZoneObject[];
}

const T = {
  intro: 1.0,
  doors: 1.4,
  walkInSpeed: 1.35,
  closeEastAt: 1.9,
  turn: 0.5,
  armAt: 0.5,
  beamAt: 0.9,
  scanMin: 2.6,
  result: 1.4,
  walkOutSpeed: 1.85,
  gateCloseAt: 2.1,
  guardSitAt: 2.6,
} as const;

/** Thời lượng khi giảm chuyển động. FADE khớp với transition CSS của lớp mờ. */
const R = { intro: 1.6, scanMin: 1.2, hold: 1.8 } as const;
const FADE_MS = 450;
const FADE = FADE_MS / 1000;

/** Vị trí thẻ tên trên ngực FallbackAvatar (xem fallbackAccessories.tsx). */
const BADGE_LOCAL = new THREE.Vector3(0.09, 1.3, 0.125);

const DEFAULT_OBJECTS = (itZone as unknown as ZoneDef).objects;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Lớp DOM riêng (gắn vào body) cho lớp phủ và lớp mờ. Cảnh nằm trong Canvas nên không render DOM trực tiếp được. */
function useDomLayer(node: ReactNode): void {
  const ref = useRef<{ root: Root; el: HTMLDivElement } | null>(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-entry-layer', '');
    document.body.appendChild(el);
    const root = createRoot(el);
    ref.current = { root, el };
    return () => {
      ref.current = null;
      // Không unmount đồng bộ trong lúc React đang commit cây khác.
      setTimeout(() => {
        root.unmount();
        el.remove();
      }, 0);
    };
  }, []);
  useEffect(() => {
    ref.current?.root.render(node);
  });
}

const fadeStyle = (opacity: number): CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: 'var(--bg)',
  opacity,
  transition: `opacity ${FADE_MS}ms ease`,
  pointerEvents: 'none',
  zIndex: 29,
});

const skipBarStyle: CSSProperties = {
  position: 'fixed',
  left: 'max(16px, env(safe-area-inset-left, 0px))',
  bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
  zIndex: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 10px 10px 18px',
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.22)',
  fontSize: 14,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
};

interface LayerProps {
  fade: number;
  overlay: OverlayPhase | null;
  name: string;
  at?: string;
  onSkip: () => void;
  onRetry: () => void;
}

function EntryLayer({ fade, overlay, name, at, onSkip, onRetry }: LayerProps) {
  return (
    <>
      <div aria-hidden="true" style={fadeStyle(fade)} />
      {overlay ? (
        <CheckinScanOverlay
          phase={overlay}
          name={name}
          at={at}
          onSkip={onSkip}
          onRetry={overlay === 'error' ? onRetry : undefined}
        />
      ) : (
        <div style={skipBarStyle} role="region" aria-label="Vào tầng 7">
          <span role="status" aria-live="polite">
            Đang vào tầng 7…
          </span>
          <button type="button" className="ci-btn ci-btn-ghost" onClick={onSkip}>
            Bỏ qua
          </button>
        </div>
      )}
    </>
  );
}

export function EntrySequence({ userName, checkedIn, onFinish, appearance, objects }: EntrySequenceProps) {
  const reduced = useMemo(prefersReducedMotion, []);
  const objs = objects ?? DEFAULT_OBJECTS;

  // Ngoại hình trong chuỗi cảnh luôn có thẻ tên để tia quét có chỗ chạy qua.
  const look = useMemo<Appearance>(() => {
    const a = appearance ?? DEFAULT_APPEARANCE;
    return a.accessories.includes('name-badge') ? a : { ...a, accessories: [...a.accessories, 'name-badge'] };
  }, [appearance]);

  const plan = useMemo(() => {
    const east = liftFrames(objs).find((l) => l.cabin);
    const g = gateFrame(objs);
    if (!east || !g) return null;
    const start = liftPoint(east, 0, -LIFT.depth / 2 - 0.75);
    const door = liftPoint(east, 0, 0.05);
    const out = liftPoint(east, 0, 1.1);
    const stop = new THREE.Vector3(g.x + GATE.stop.x, 0, g.z + GATE.stop.z);
    const bend = new THREE.Vector3(out.x + (stop.x - out.x) * 0.3, 0, out.z + (stop.z - out.z) * 0.8);
    const laneExit = new THREE.Vector3(g.x + GATE.laneExitX, 0, g.z + GATE.laneZ);
    const drop = new THREE.Vector3(ENTRY_DROP.x, 0, ENTRY_DROP.z);
    const walkIn = new THREE.CatmullRomCurve3([start, door, out, bend, stop], false, 'centripetal');
    const walkOut = new THREE.CatmullRomCurve3([stop, laneExit, drop], false, 'centripetal');
    const guard = new THREE.Vector3(g.x + GATE.guard.x, 0, g.z + GATE.guard.z);
    const faceGuard = Math.atan2(guard.x - stop.x, guard.z - stop.z);
    const guardYaw = Math.atan2(stop.x - guard.x, stop.z - guard.z);
    // Cảnh quét: camera vuông góc với đường nối nhân vật và bảo vệ, phía Đông-Bắc, thấy cả hai và tia quét.
    const mid = stop.clone().add(guard).multiplyScalar(0.5);
    const d = guard.clone().sub(stop).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x);
    if (side.x < 0) side.negate();
    const scanCam = mid.clone().addScaledVector(side, 3.0).setY(2.1);
    const scanLook = mid.clone().setY(1.3);
    return {
      start,
      startYaw: east.rotY,
      stop,
      walkIn,
      walkInLen: walkIn.getLength(),
      walkOut,
      walkOutLen: walkOut.getLength(),
      faceGuard,
      guardYaw,
      scanCam,
      scanLook,
    };
  }, [objs]);

  const [overlay, setOverlay] = useState<OverlayPhase | null>(null);
  const [fade, setFade] = useState(1);
  const [at, setAt] = useState<string | undefined>(undefined);
  const [anim, setAnimState] = useState<AvatarAnimation>('idle');

  const avatarRef = useRef<THREE.Group>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const overlayRef = useRef<OverlayPhase | null>(null);
  overlayRef.current = overlay;
  const apiRef = useRef<ApiState>('idle');
  const reqId = useRef(0);
  const animRef = useRef<AvatarAnimation>('idle');

  const seq = useRef({
    step: 'intro' as Step,
    t: 0,
    traveled: 0,
    yaw: plan?.startYaw ?? 0,
    camYaw: plan?.startYaw ?? 0,
    first: true,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
  });
  const tmp = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), tan: new THREE.Vector3() }),
    [],
  );

  const setAnim = (a: AvatarAnimation) => {
    if (animRef.current === a) return;
    animRef.current = a;
    setAnimState(a);
  };

  const finish = useCallback((result: EntryResult) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    seq.current.step = 'end';
    reqId.current++;
    onFinishRef.current(result);
  }, []);

  const skip = useCallback(() => {
    const api = apiRef.current;
    if (api === 'ok' || api === 'already') finish('checked');
    else finish(seq.current.step === 'error' ? 'error' : 'skipped');
  }, [finish]);

  const callApi = useCallback(() => {
    apiRef.current = 'pending';
    const id = ++reqId.current;
    postCheckin().then(
      (r) => {
        if (id !== reqId.current) return;
        if (r.ok) {
          apiRef.current = r.data.alreadyCheckedIn ? 'already' : 'ok';
          setAt(r.data.checkin.at);
        } else {
          apiRef.current = 'error';
        }
      },
      () => {
        if (id === reqId.current) apiRef.current = 'error';
      },
    );
  }, []);

  const goto = (step: Step) => {
    seq.current.step = step;
    seq.current.t = 0;
  };

  const startScan = useCallback(() => {
    seq.current.step = 'scan';
    seq.current.t = 0;
    rig.gateError = false;
    rig.guardStand = 1;
    if (plan) rig.guardYaw = plan.guardYaw;
    if (reduced) {
      rig.guardArm = 1;
      rig.beam = 1;
    }
    setOverlay('scanning');
    callApi();
  }, [callApi, plan, reduced]);

  const retry = useCallback(() => {
    if (seq.current.step !== 'error') return;
    startScan();
  }, [startScan]);

  // Đã ghi danh, hoặc không dựng được đường đi: kết thúc ngay, không chặn vào tầng.
  useEffect(() => {
    if (checkedIn) finish('checked');
    else if (!plan) finish('skipped');
  }, [checkedIn, plan, finish]);

  useEffect(() => {
    rig.snap = reduced;
    const id = setTimeout(() => setFade(0), 60);
    return () => {
      clearTimeout(id);
      reqId.current++;
      resetRig();
    };
  }, [reduced]);

  // Esc hoặc Enter bỏ qua khi lớp phủ chưa hiện. Khi lớp phủ hiện, CheckinScanOverlay tự nghe phím.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayRef.current) return;
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      const target = e.target;
      if (e.key === 'Enter' && target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  useDomLayer(<EntryLayer fade={fade} overlay={overlay} name={userName} at={at} onSkip={skip} onRetry={retry} />);

  useFrame((state, rawDt) => {
    const s = seq.current;
    const av = avatarRef.current;
    if (finishedRef.current || !plan || !av) return;
    const dt = Math.min(rawDt, 0.05);
    s.t += dt;
    const cam = state.camera;
    const { a: pos, b: desired, c: lookAt, tan } = tmp;
    const k = 1 - Math.exp(-dt * 3.2);

    /** Camera bám sau lưng theo hướng camYaw, lùi trail mét, cao height mét, lệch lateralZ theo trục z thế giới. */
    const chase = (p: THREE.Vector3, trail: number, height: number, lateralZ: number, rate: number) => {
      const fx = Math.sin(s.camYaw);
      const fz = Math.cos(s.camYaw);
      desired.set(p.x - fx * trail, height, p.z - fz * trail + lateralZ);
      lookAt.set(p.x + fx * 2, 1.15, p.z + fz * 2);
      if (s.first || reduced) {
        s.camPos.copy(desired);
        s.camLook.copy(lookAt);
        s.first = false;
      } else {
        const kk = 1 - Math.exp(-dt * rate);
        s.camPos.lerp(desired, kk);
        s.camLook.lerp(lookAt, kk);
      }
    };
    const holdShot = (p: THREE.Vector3, l: THREE.Vector3) => {
      if (reduced) {
        s.camPos.copy(p);
        s.camLook.copy(l);
      } else {
        s.camPos.lerp(p, k);
        s.camLook.lerp(l, k);
      }
    };
    const turnTo = (target: number, rate: number) => {
      s.yaw += wrapAngle(target - s.yaw) * (reduced ? 1 : 1 - Math.exp(-dt * rate));
    };

    switch (s.step) {
      case 'intro': {
        pos.copy(plan.start);
        s.yaw = plan.startYaw;
        s.camYaw = plan.startYaw;
        chase(pos, 0.85, 1.95, 0, 3.2);
        if (reduced && s.t <= dt) {
          // Cảnh tĩnh: cửa đã mở sẵn, chỉ có chuông.
          rig.eastDoor = 1;
          playLiftChime();
        }
        if (reduced && s.t >= R.intro) {
          goto('fadeA');
          setFade(1);
        } else if (!reduced && s.t >= T.intro) {
          playLiftChime();
          rig.eastDoor = 1;
          goto('doors');
        }
        break;
      }
      case 'doors': {
        pos.copy(plan.start);
        chase(pos, 0.85, 1.95, 0, 3.2);
        if (s.t >= T.doors) {
          goto('walkIn');
          s.traveled = 0;
          setAnim('walk');
        }
        break;
      }
      case 'walkIn': {
        s.traveled += T.walkInSpeed * dt;
        const u = Math.min(1, s.traveled / plan.walkInLen);
        plan.walkIn.getPointAt(u, pos);
        plan.walkIn.getTangentAt(u, tan);
        turnTo(Math.atan2(tan.x, tan.z), 7);
        s.camYaw += wrapAngle(s.yaw - s.camYaw) * (1 - Math.exp(-dt * 2.2));
        if (s.t >= T.closeEastAt) rig.eastDoor = 0;
        // Trong cabin, camera lùi theo quãng đã đi để không ra sau vách cabin.
        chase(pos, Math.min(2.3, s.traveled + 0.85), 1.95, 0, 3.2);
        if (u >= 1) {
          goto('turn');
          setAnim('idle');
        }
        break;
      }
      case 'turn': {
        pos.copy(plan.stop);
        turnTo(plan.faceGuard, 6);
        holdShot(plan.scanCam, plan.scanLook);
        if (s.t >= T.turn) startScan();
        break;
      }
      case 'fadeA': {
        pos.copy(plan.start);
        if (s.t >= FADE) {
          // Cảnh tĩnh thứ hai: đứng sẵn trước cổng, bảo vệ đã đứng và đưa máy quét.
          rig.eastDoor = 0;
          s.yaw = plan.faceGuard;
          s.camPos.copy(plan.scanCam);
          s.camLook.copy(plan.scanLook);
          pos.copy(plan.stop);
          setFade(0);
          startScan();
        }
        break;
      }
      case 'scan': {
        pos.copy(plan.stop);
        turnTo(plan.faceGuard, 6);
        holdShot(plan.scanCam, plan.scanLook);
        if (!reduced) {
          if (s.t >= T.armAt) rig.guardArm = 1;
          rig.beam = s.t >= T.beamAt ? Math.min(1, (s.t - T.beamAt) / 0.3) : 0;
        }
        const minT = reduced ? R.scanMin : T.scanMin;
        const api = apiRef.current;
        if (s.t >= minT && api !== 'pending') {
          rig.beam = 0;
          rig.guardArm = 0;
          if (api === 'error' || api === 'idle') {
            rig.gateError = true;
            goto('error');
            setOverlay('error');
          } else {
            goto('result');
            setOverlay(api === 'already' ? 'already' : 'done');
            if (reduced) rig.gate = 1;
          }
        }
        break;
      }
      case 'error': {
        pos.copy(plan.stop);
        holdShot(plan.scanCam, plan.scanLook);
        break;
      }
      case 'result': {
        pos.copy(plan.stop);
        holdShot(plan.scanCam, plan.scanLook);
        rig.guardNod = !reduced && s.t >= 0.15 && s.t <= 1.05 ? (s.t - 0.15) / 0.9 : 0;
        if (s.t >= 0.5) rig.gate = 1;
        if (reduced && s.t >= R.hold) {
          goto('fadeB');
          setFade(1);
        } else if (!reduced && s.t >= T.result) {
          rig.guardNod = 0;
          goto('walkOut');
          s.traveled = 0;
          s.camYaw = s.yaw;
          setAnim('walk');
        }
        break;
      }
      case 'walkOut': {
        s.traveled += T.walkOutSpeed * dt;
        const u = Math.min(1, s.traveled / plan.walkOutLen);
        plan.walkOut.getPointAt(u, pos);
        plan.walkOut.getTangentAt(u, tan);
        turnTo(Math.atan2(tan.x, tan.z), 6);
        s.camYaw += wrapAngle(s.yaw - s.camYaw) * (1 - Math.exp(-dt * 1.8));
        if (s.t >= T.gateCloseAt) rig.gate = 0;
        if (s.t >= T.guardSitAt) {
          rig.guardStand = 0;
          rig.guardYaw = GUARD_IDLE_YAW;
        }
        chase(pos, 2.4, 1.9, 0.8, 2.5);
        if (u >= 1) {
          setAnim('idle');
          finish('checked');
        }
        break;
      }
      case 'fadeB': {
        pos.copy(plan.stop);
        if (s.t >= FADE) finish('checked');
        break;
      }
      case 'end':
        return;
    }

    av.position.set(pos.x, 0, pos.z);
    av.rotation.y = s.yaw;
    cam.position.copy(s.camPos);
    cam.lookAt(s.camLook);
    // Điểm cuối tia quét: huy hiệu tên trên ngực nhân vật (hệ thế giới).
    av.updateMatrixWorld();
    rig.beamTarget.copy(BADGE_LOCAL).applyMatrix4(av.matrixWorld);
  });

  if (!plan) return null;
  return (
    <group ref={avatarRef} position={[plan.start.x, 0, plan.start.z]} rotation={[0, plan.startYaw, 0]}>
      <Avatar appearance={look} displayName={userName} animation={anim} />
    </group>
  );
}

/** Có bật prefers-reduced-motion không. Đọc một lần khi gọi. */
export { prefersReducedMotion };
