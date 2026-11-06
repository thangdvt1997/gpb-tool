// Cụm lối vào tầng 7: hai cửa thang máy (thép chải, bảng số tầng LED), cabin thang Đông, bàn an ninh với cổng xoay
// và thiết bị quét, bàn kiểm duyệt, NPC bảo vệ. Vị trí lấy từ it.json qua placement.ts.
//
// Draw call (cả cụm, ngoài bảo vệ): thép 1, mặt mờ 1, đèn 1, đèn cổng 1, cánh cửa thang 1, cánh cổng kính 1,
// bảng số tầng 1, ảnh cabin 1. Tổng 8. Bảo vệ thêm 3 (và 1 khi đang quét). Không đổ bóng để giữ ngân sách.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ZoneObject } from '../../content/types';
import type { ThemeName } from '../../theme/tokens';
import { instanced, UNIT_BOX, UNIT_CYL, UNIT_PLANE, UNIT_SPHERE, type Inst } from '../../env/shared';
import { entryColors, type EntryColors } from './colors';
import { Guard } from './Guard';
import { Batch } from './merge';
import { GATE, LIFT, gateFrame, liftFrames, liftPoint, modDeskOf, type GateFrame, type LiftFrame } from './placement';
import { rig } from './rig';
import { brushedTexture, cabinTexture, indicatorTexture } from './textures';

const ease = (x: number) => x * x * (3 - 2 * x);
const IDENTITY_Q = new THREE.Quaternion();

function approach(cur: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (Math.abs(target - cur) <= step) return target;
  return cur + Math.sign(target - cur) * step;
}

/** Bản đồ phản chiếu nhẹ cho thép (RoomEnvironment qua PMREM), chỉ gán cho vật liệu của cụm này. */
function useEnvMap(): THREE.Texture {
  const gl = useThree((s) => s.gl);
  const target = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    (room as unknown as { dispose?: () => void }).dispose?.();
    pmrem.dispose();
    return rt;
  }, [gl]);
  useEffect(() => () => target.dispose(), [target]);
  return target.texture;
}

interface StaticGeo {
  steel: THREE.BufferGeometry | null;
  matte: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  led: THREE.BufferGeometry | null;
}

function buildLift(L: LiftFrame, c: EntryColors, steel: Batch, matte: Batch, glow: Batch): void {
  const F = L.matrix;
  const hw = LIFT.openW / 2;
  const jx = hw + LIFT.jambW / 2;
  const top = 2.6;
  const fz = LIFT.depth / 2 + 0.01;

  // Ốp đá quanh khung cửa.
  matte.add(UNIT_BOX, F, [-jx, top / 2, 0], [LIFT.jambW, top, LIFT.depth], c.stone);
  matte.add(UNIT_BOX, F, [jx, top / 2, 0], [LIFT.jambW, top, LIFT.depth], c.stone);
  matte.add(UNIT_BOX, F, [0, (LIFT.openH + top) / 2, 0], [LIFT.openW, top - LIFT.openH, LIFT.depth], c.stone);

  // Viền thép quanh ô cửa, ngưỡng cửa, khung bảng số tầng, bảng nút gọi.
  steel.add(UNIT_BOX, F, [-hw - 0.02, LIFT.openH / 2, fz], [0.04, LIFT.openH + 0.04, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [hw + 0.02, LIFT.openH / 2, fz], [0.04, LIFT.openH + 0.04, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [0, LIFT.openH + 0.02, fz], [LIFT.openW + 0.08, 0.04, 0.02], c.steel);
  // Ngưỡng cửa nổi trên lớp sàn hành lang (mặt trên 0,032, xem Corridors.tsx).
  steel.add(UNIT_BOX, F, [0, 0.036, 0.02], [LIFT.openW + 0.1, 0.012, LIFT.depth + 0.04], c.steelDark);
  steel.add(UNIT_BOX, F, [0, 2.38, fz], [0.58, 0.2, 0.012], c.steelDark);
  steel.add(UNIT_BOX, F, [jx, 1.1, fz], [0.12, 0.26, 0.012], c.steel);
  glow.add(UNIT_SPHERE, F, [jx, 1.15, fz + 0.008], [0.018, 0.018, 0.006], c.led);
  glow.add(UNIT_SPHERE, F, [jx, 1.05, fz + 0.008], [0.018, 0.018, 0.006], c.led);

  if (!L.cabin) return;
  // Cabin thật (chỉ thang Đông), nằm trong khối lõi thang. Mặt trong khối lõi không vẽ nên nhìn được từ trong.
  const zf = -LIFT.depth / 2;
  const zb = zf - LIFT.cabinD;
  const zc = (zf + zb) / 2;
  const cw = LIFT.cabinW / 2;
  const H = LIFT.cabinH;
  steel.add(UNIT_BOX, F, [0, H / 2, zb - 0.01], [LIFT.cabinW + 0.02, H, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [-cw - 0.01, H / 2, zc], [0.02, H, LIFT.cabinD], c.steel);
  steel.add(UNIT_BOX, F, [cw + 0.01, H / 2, zc], [0.02, H, LIFT.cabinD], c.steel);
  steel.add(UNIT_BOX, F, [-(hw + cw) / 2, H / 2, zf - 0.01], [cw - hw, H, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [(hw + cw) / 2, H / 2, zf - 0.01], [cw - hw, H, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [0, (LIFT.openH + H) / 2, zf - 0.01], [LIFT.openW, H - LIFT.openH, 0.02], c.steel);
  steel.add(UNIT_BOX, F, [0, H + 0.01, zc], [LIFT.cabinW + 0.02, 0.02, LIFT.cabinD + 0.02], c.steelDark);
  steel.add(UNIT_BOX, F, [0, 1.45, zb + 0.005], [1.0, 1.3, 0.008], c.steelLight);
  steel.add(UNIT_BOX, F, [0, 0.92, zb + 0.06], [1.2, 0.035, 0.035], c.steelLight);
  steel.add(UNIT_BOX, F, [-cw + 0.05, 0.92, zc - 0.1], [0.035, 0.035, 1.1], c.steelLight);
  steel.add(UNIT_BOX, F, [cw - 0.05, 0.92, zc - 0.1], [0.035, 0.035, 1.1], c.steelLight);
  matte.add(UNIT_BOX, F, [0, 0.012, zc], [LIFT.cabinW, 0.02, LIFT.cabinD], c.cabinFloor);
  glow.add(UNIT_BOX, F, [0, H - 0.003, zc], [1.1, 0.006, 1.1], c.light);
}

function buildGate(g: GateFrame, c: EntryColors, steel: Batch, matte: Batch, glow: Batch, led: Batch): void {
  const F = new THREE.Matrix4().makeTranslation(g.x, 0, g.z);
  const d = GATE.desk;
  const dcx = (d.x0 + d.x1) / 2;
  const dcz = (d.z0 + d.z1) / 2;
  const dw = d.x1 - d.x0;
  const dd = d.z1 - d.z0;

  // Bàn an ninh: thân tối, mặt bàn sáng, chân lùi vào, dải đèn mặt trước hướng ra làn.
  matte.add(UNIT_BOX, F, [dcx, (0.08 + d.h - 0.05) / 2, dcz], [dw, d.h - 0.05 - 0.08, dd], c.deskBody);
  matte.add(UNIT_BOX, F, [dcx, d.h - 0.025, dcz - 0.04], [dw + 0.1, 0.05, dd + 0.12], c.deskTop);
  steel.add(UNIT_BOX, F, [dcx, 0.04, dcz - 0.03], [dw - 0.06, 0.08, dd - 0.08], c.steelDark);
  glow.add(UNIT_BOX, F, [dcx, 0.8, d.z1 + 0.003], [dw - 0.1, 0.04, 0.006], c.led);
  // Màn hình quay về phía bảo vệ, bàn phím, giá đặt máy quét.
  steel.add(UNIT_BOX, F, [0.25, d.h + 0.07, -0.42], [0.04, 0.14, 0.04], c.steelDark);
  matte.add(UNIT_BOX, F, [0.25, d.h + 0.25, -0.4], [0.44, 0.27, 0.025], c.dark);
  glow.add(UNIT_BOX, F, [0.25, d.h + 0.25, -0.4135], [0.4, 0.23, 0.004], c.screen);
  matte.add(UNIT_BOX, F, [0.25, d.h + 0.008, -0.56], [0.36, 0.015, 0.12], c.dark);
  matte.add(UNIT_BOX, F, [-0.6, d.h + 0.015, -0.45], [0.12, 0.03, 0.1], c.dark);
  // Ghế bảo vệ.
  const s = GATE.stool;
  matte.add(UNIT_CYL, F, [s.x, 0.47, s.z], [0.19, 0.05, 0.19], c.dark);
  steel.add(UNIT_CYL, F, [s.x, 0.23, s.z], [0.025, 0.44, 0.025], c.steel);
  steel.add(UNIT_CYL, F, [s.x, 0.045, s.z], [0.22, 0.03, 0.22], c.steelDark);

  // Hai bệ cổng xoay, đầu đọc huy hiệu ở đầu phía Đông, dải đèn trạng thái hướng vào làn.
  const px = (GATE.pedestalX0 + GATE.pedestalX1) / 2;
  const pl = GATE.pedestalX1 - GATE.pedestalX0;
  GATE.pedestalZ.forEach((pz, i) => {
    const inner = i === 0 ? 1 : -1;
    steel.add(UNIT_BOX, F, [px, GATE.pedestalH / 2 - 0.01, pz], [pl, GATE.pedestalH - 0.02, GATE.pedestalW], c.steel);
    matte.add(UNIT_BOX, F, [px, GATE.pedestalH - 0.005, pz], [pl, 0.012, GATE.pedestalW + 0.01], c.dark);
    glow.add(UNIT_BOX, F, [GATE.pedestalX1 - 0.14, GATE.pedestalH + 0.003, pz], [0.18, 0.004, 0.12], c.screen);
    led.add(UNIT_BOX, F, [px, 0.9, pz + inner * (GATE.pedestalW / 2 + 0.003)], [pl - 0.1, 0.03, 0.006], c.shirt);
    led.add(UNIT_BOX, F, [GATE.pedestalX1 + 0.003, 0.86, pz], [0.006, 0.1, 0.12], c.shirt);
  });
  // Tấm sàn kim loại dọc làn.
  steel.add(UNIT_BOX, F, [px, 0.036, GATE.laneZ], [pl + 0.2, 0.008, 0.98], c.steelDark);
}

/** Bàn kiểm duyệt: bàn điều khiển hai màn hình, mặt màn hình hướng Bắc (người ngồi phía Bắc). */
function buildModDesk(o: ZoneObject, c: EntryColors, steel: Batch, matte: Batch, glow: Batch): void {
  const F = new THREE.Matrix4().makeTranslation(o.position[0], 0, o.position[2]);
  const [w, , d] = o.size;
  matte.add(UNIT_BOX, F, [0, 0.5, 0.05], [w, 0.92, d - 0.1], c.deskBody);
  matte.add(UNIT_BOX, F, [0, 1.0, 0], [w + 0.05, 0.05, d], c.deskTop);
  steel.add(UNIT_BOX, F, [0, 0.04, 0.05], [w - 0.06, 0.08, d - 0.16], c.steelDark);
  glow.add(UNIT_BOX, F, [0, 0.8, d / 2 + 0.003], [w - 0.1, 0.04, 0.006], c.led);
  for (const side of [-1, 1]) {
    steel.add(UNIT_BOX, F, [0.45 * side, 1.1, 0.17], [0.04, 0.16, 0.04], c.steelDark);
    matte.add(UNIT_BOX, F, [0.45 * side, 1.33, 0.15], [0.55, 0.32, 0.03], c.dark);
    glow.add(UNIT_BOX, F, [0.45 * side, 1.33, 0.132], [0.5, 0.28, 0.004], c.screen);
  }
}

function buildStatic(
  lifts: LiftFrame[],
  gate: GateFrame | null,
  mod: ZoneObject | null,
  c: EntryColors,
): StaticGeo {
  const steel = new Batch();
  const matte = new Batch();
  const glow = new Batch();
  const led = new Batch();
  for (const L of lifts) buildLift(L, c, steel, matte, glow);
  if (gate) buildGate(gate, c, steel, matte, glow, led);
  if (mod) buildModDesk(mod, c, steel, matte, glow);
  return { steel: steel.build(), matte: matte.build(), glow: glow.build(), led: led.build() };
}

export interface EntryFixturesProps {
  objects: readonly ZoneObject[];
  theme: ThemeName;
}

export function EntryFixtures({ objects, theme }: EntryFixturesProps) {
  const envMap = useEnvMap();
  const colors = useMemo(() => entryColors(theme), [theme]);
  const lifts = useMemo(() => liftFrames(objects), [objects]);
  const gate = useMemo(() => gateFrame(objects), [objects]);
  const mod = useMemo(() => modDeskOf(objects), [objects]);

  const brush = useMemo(() => brushedTexture(), []);
  useEffect(() => () => brush.dispose(), [brush]);

  const geo = useMemo(() => buildStatic(lifts, gate, mod, colors), [lifts, gate, mod, colors]);
  useEffect(
    () => () => {
      geo.steel?.dispose();
      geo.matte?.dispose();
      geo.glow?.dispose();
      geo.led?.dispose();
    },
    [geo],
  );

  const mats = useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: brush,
      metalness: 0.8,
      roughness: 0.34,
      envMap,
      envMapIntensity: 0.9,
    });
    const matte = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.05,
      envMap,
      envMapIntensity: 0.3,
    });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const led = new THREE.MeshBasicMaterial({ color: colors.led, toneMapped: false });
    const door = new THREE.MeshStandardMaterial({
      color: colors.steelLight,
      map: brush,
      metalness: 0.85,
      roughness: 0.26,
      envMap,
      envMapIntensity: 1.1,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: colors.glass,
      transparent: true,
      opacity: 0.38,
      roughness: 0.06,
      metalness: 0,
      envMap,
      envMapIntensity: 0.6,
      depthWrite: false,
    });
    const indTex = indicatorTexture(colors);
    const indicator = new THREE.MeshBasicMaterial({ map: indTex, toneMapped: false });
    const cabTex = cabinTexture(colors);
    const cabin = new THREE.MeshBasicMaterial({ map: cabTex });
    return { steel, matte, glow, led, door, glass, indTex, indicator, cabTex, cabin };
  }, [brush, envMap, colors]);
  useEffect(
    () => () => {
      for (const m of [mats.steel, mats.matte, mats.glow, mats.led, mats.door, mats.glass, mats.indicator, mats.cabin]) {
        m.dispose();
      }
      mats.indTex.dispose();
      mats.cabTex.dispose();
    },
    [mats],
  );

  // Bảng số tầng (ngoài mỗi cửa, và một bảng trong cabin Đông) và ảnh cabin sau cánh cửa: hai lô instanced tĩnh.
  const planes = useMemo(() => {
    const ind: Inst[] = [];
    const cab: Inst[] = [];
    const fz = LIFT.depth / 2 + 0.017;
    for (const L of lifts) {
      const out = liftPoint(L, 0, fz);
      ind.push({ p: [out.x, 2.38, out.z], s: [0.5, 0.16, 1], r: [0, L.rotY, 0] });
      const back = liftPoint(L, 0, -0.12);
      cab.push({ p: [back.x, LIFT.openH / 2, back.z], s: [LIFT.openW, LIFT.openH, 1], r: [0, L.rotY, 0] });
      if (L.cabin) {
        const inside = liftPoint(L, 0, -LIFT.depth / 2 - 0.025);
        ind.push({ p: [inside.x, 2.29, inside.z], s: [0.33, 0.11, 1], r: [0, L.rotY + Math.PI, 0] });
      }
    }
    return { ind: instanced(UNIT_PLANE, mats.indicator, ind), cab: instanced(UNIT_PLANE, mats.cabin, cab) };
  }, [lifts, mats]);
  useEffect(
    () => () => {
      planes.ind?.dispose();
      planes.cab?.dispose();
    },
    [planes],
  );

  // Phần động: cánh cửa thang (2 cánh mỗi thang) và hai cánh kính cổng xoay.
  const doors = useMemo(() => {
    const m = new THREE.InstancedMesh(UNIT_BOX, mats.door, Math.max(1, lifts.length * 2));
    m.count = lifts.length * 2;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }, [lifts, mats]);
  const flaps = useMemo(() => {
    const m = new THREE.InstancedMesh(UNIT_BOX, mats.glass, 2);
    m.count = gate ? 2 : 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.renderOrder = 1;
    return m;
  }, [gate, mats]);
  useEffect(() => () => { doors.dispose(); }, [doors]);
  useEffect(() => () => { flaps.dispose(); }, [flaps]);

  const cur = useRef({ east: 0, west: 0, gate: 0, drawn: '' });
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), l: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }),
    [],
  );
  const ledState = useRef<'idle' | 'open' | 'error' | ''>('');

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = cur.current;
    if (rig.snap) {
      c.east = rig.eastDoor;
      c.west = rig.westDoor;
      c.gate = rig.gate;
    } else {
      c.east = approach(c.east, rig.eastDoor, 1 / 1.3, dt);
      c.west = approach(c.west, rig.westDoor, 1 / 1.3, dt);
      c.gate = approach(c.gate, rig.gate, 1 / 0.7, dt);
    }
    const key = `${c.east.toFixed(4)}|${c.west.toFixed(4)}|${c.gate.toFixed(4)}`;
    if (key !== c.drawn) {
      c.drawn = key;
      const { m, l, q, p, s } = tmp;
      lifts.forEach((L, i) => {
        const open = ease(L.cabin ? c.east : c.west);
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? -1 : 1;
          l.compose(
            p.set(side * (LIFT.leafW / 2 + open * LIFT.leafW), LIFT.openH / 2, LIFT.leafZ),
            IDENTITY_Q,
            s.set(LIFT.leafW - 0.005, LIFT.openH, LIFT.leafT),
          );
          doors.setMatrixAt(i * 2 + k, m.multiplyMatrices(L.matrix, l));
        }
      });
      doors.instanceMatrix.needsUpdate = true;

      if (gate) {
        const open = ease(c.gate);
        const halfGap = (GATE.pedestalZ[1] - GATE.pedestalZ[0] - GATE.pedestalW) / 2;
        const flapW = halfGap - 0.01;
        GATE.pedestalZ.forEach((pz, k) => {
          // Cánh Bắc: đóng hướng +z, mở quay về -x. Cánh Nam: đóng hướng -z, mở quay về -x.
          const hingeZ = gate.z + pz + (k === 0 ? 1 : -1) * (GATE.pedestalW / 2);
          const yaw = k === 0 ? -open * (Math.PI / 2) : Math.PI + open * (Math.PI / 2);
          q.setFromAxisAngle(p.set(0, 1, 0), yaw);
          m.compose(p.set(gate.x + GATE.hingeX, 0, hingeZ), q, s.set(1, 1, 1));
          l.compose(p.set(0, 0.72, flapW / 2), IDENTITY_Q, s.set(0.012, 0.5, flapW));
          flaps.setMatrixAt(k, m.multiply(l));
        });
        flaps.instanceMatrix.needsUpdate = true;
      }
    }

    const nextLed = c.gate > 0.5 ? 'open' : rig.gateError ? 'error' : 'idle';
    if (nextLed !== ledState.current) {
      ledState.current = nextLed;
      mats.led.color.set(nextLed === 'open' ? colors.ok : nextLed === 'error' ? colors.down : colors.led);
    }
  });

  return (
    <group>
      {geo.steel && <mesh geometry={geo.steel} material={mats.steel} receiveShadow />}
      {geo.matte && <mesh geometry={geo.matte} material={mats.matte} receiveShadow />}
      {geo.glow && <mesh geometry={geo.glow} material={mats.glow} />}
      {geo.led && <mesh geometry={geo.led} material={mats.led} />}
      {planes.ind && <primitive object={planes.ind} />}
      {planes.cab && <primitive object={planes.cab} />}
      {lifts.length > 0 && <primitive object={doors} frustumCulled={false} />}
      {gate && <primitive object={flaps} frustumCulled={false} />}
      {gate && <Guard gate={gate} colors={colors} />}
    </group>
  );
}
