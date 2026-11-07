import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Vector3, type Group, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { playerPose } from '../../controls/playerPose';
import { ikHold } from '../../../avatar/ik/holdState';
import { useObjectState } from '../objectStates';
import { doorOf } from './door';
import { computerOf, screenGlow } from './computer';
import { drawerOf, drawerId, drawerOffset } from './drawer';
import { lightTarget, useLightGroup } from './lightSwitch';
import { TV_CHANNELS, tvOf, VOLUME_MAX } from './tv';
import { curtainOf } from './curtain';
import { itemOf } from './smallItem';
import { printerOf } from './printer';
import { waterOf } from './waterCooler';
import { tickAll } from './tickers';

/**
 * Component 3D bằng primitive đơn giản. Quy tắc:
 * - Chỉ đọc trạng thái (useObjectState), animation bằng MathUtils.damp trong useFrame; không giữ logic.
 * - Ước lượng draw call mỗi vật ghi ở docs/design/INTERACT_OBJECTS.md.
 */

/** Một lần duy nhất trong cảnh: chạy mọi tickers (tự đóng cửa, đang rót, đang in...). */
export function ObjectsTicker() {
  useFrame((_, dt) => tickAll(dt));
  return null;
}

type P3 = [number, number, number];

/** Cửa: group ở bản lề, lá kéo dài theo local +x. 1 draw call (1 box) + 1 tay nắm. */
export function DoorMesh(p: { id: string; hinge: { x: number; z: number }; yaw: number; length: number; height?: number; color?: string }) {
  const ref = useRef<Group>(null);
  const st = doorOf(useObjectState(p.id));
  const h = p.height ?? 2.1;
  const cur = useRef(st.angle);
  useFrame((_, dt) => {
    // Góc thực đã được logic (doorTick) làm mượt theo tốc độ; damp nhẹ chỉ để khử bậc.
    cur.current = MathUtils.damp(cur.current, st.angle, 30, dt);
    if (ref.current) ref.current.rotation.y = p.yaw + cur.current;
  });
  return (
    <group ref={ref} position={[p.hinge.x, 0, p.hinge.z]} rotation={[0, p.yaw, 0]}>
      <mesh position={[p.length / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[p.length, h, 0.05]} />
        <meshStandardMaterial color={p.color ?? '#9a7b5a'} roughness={0.7} />
      </mesh>
      <mesh position={[p.length - 0.1, 1.0, 0.05]}>
        <boxGeometry args={[0.12, 0.03, 0.05]} />
        <meshStandardMaterial color="#c9c9c9" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Máy tính: thân + màn hình emissive. Màn hình phát sáng damp theo bật/tắt. */
export function ComputerMesh(p: { id: string; position: P3; yaw: number }) {
  const mat = useRef<MeshStandardMaterial>(null);
  const s = computerOf(useObjectState(p.id));
  const glow = screenGlow(s);
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    m.emissive.setHex(glow.color);
    m.emissiveIntensity = MathUtils.damp(m.emissiveIntensity, glow.intensity, 8, dt);
  });
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.16]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.52, 0.32, 0.03]} />
        <meshStandardMaterial ref={mat} color="#111" emissive="#000" emissiveIntensity={0} />
      </mesh>
    </group>
  );
}

/**
 * Tủ ngăn kéo: thân + n mặt ngăn. Ngăn trượt dọc local +z (ra phía trước). Vật bên trong (children của
 * DrawerSlot) là con của nhóm ngăn nên đi theo ngăn.
 */
export function DrawerCabinetMesh(p: { id: string; position: P3; yaw: number; count: number; size?: [number, number, number]; travel?: number; children?: (i: number) => React.ReactNode }) {
  const [w, h, d] = p.size ?? [0.5, 0.7, 0.5];
  const travel = p.travel ?? 0.3;
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#8d949b" roughness={0.6} />
      </mesh>
      {Array.from({ length: p.count }, (_, i) => (
        <DrawerFront key={i} id={drawerId(p.id, i)} w={w} h={h / p.count} y={(i + 0.5) * (h / p.count)} z={d / 2} travel={travel}>
          {p.children?.(i)}
        </DrawerFront>
      ))}
    </group>
  );
}

function DrawerFront(p: { id: string; w: number; h: number; y: number; z: number; travel: number; children?: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const open = drawerOf(useObjectState(p.id)).open;
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = MathUtils.damp(t.current, open ? 1 : 0, 9, dt);
    if (ref.current) ref.current.position.z = p.z + drawerOffset(t.current, p.travel);
  });
  return (
    <group ref={ref} position={[0, p.y, p.z]}>
      <mesh>
        <boxGeometry args={[p.w - 0.04, p.h - 0.03, 0.03]} />
        <meshStandardMaterial color="#b0b6bc" roughness={0.5} />
      </mesh>
      {p.children}
    </group>
  );
}

/** Đèn theo nhóm: cường độ damp tới mức đích. Đặt một PointLight cạnh vật thể đèn có sẵn. */
export function GroupLight(p: { group: string; position: P3; intensity?: number; distance?: number; color?: string }) {
  const on = useLightGroup(p.group);
  const ref = useRef<PointLight>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.intensity = MathUtils.damp(ref.current.intensity, lightTarget(on, p.intensity ?? 8), 6, dt);
  });
  return <pointLight ref={ref} position={p.position} distance={p.distance ?? 9} color={p.color ?? '#fff4e0'} intensity={0} />;
}

/** Công tắc treo tường: tấm nhỏ + phím gạt xoay theo bật/tắt. */
export function SwitchMesh(p: { group: string; position: P3; yaw: number }) {
  const on = useLightGroup(p.group);
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh>
        <boxGeometry args={[0.08, 0.12, 0.015]} />
        <meshStandardMaterial color="#eeeeee" />
      </mesh>
      <mesh position={[0, on ? 0.015 : -0.015, 0.012]}>
        <boxGeometry args={[0.03, 0.04, 0.01]} />
        <meshStandardMaterial color={on ? '#ffd24a' : '#999'} emissive={on ? '#ffb300' : '#000'} emissiveIntensity={on ? 0.6 : 0} />
      </mesh>
    </group>
  );
}

/** TV: màn hình emissive theo kênh, độ sáng nhỏ theo âm lượng không dùng (âm thanh do hệ âm thanh). */
export function TvMesh(p: { id: string; position: P3; yaw: number; size?: [number, number] }) {
  const mat = useRef<MeshStandardMaterial>(null);
  const s = tvOf(useObjectState(p.id));
  const [w, h] = p.size ?? [1.68, 0.97];
  const color = TV_CHANNELS[s.channel % TV_CHANNELS.length].color;
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    m.emissive.setHex(color);
    m.emissiveIntensity = MathUtils.damp(m.emissiveIntensity, s.on ? 0.8 : 0, 8, dt);
  });
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh>
        <boxGeometry args={[w, h, 0.06]} />
        <meshStandardMaterial ref={mat} color="#050505" emissive="#000" emissiveIntensity={0} />
      </mesh>
      {s.on && (
        // Thanh âm lượng: một mảnh emissive ở góc dưới, chiều dài theo mức.
        <mesh position={[-w / 2 + 0.1 + (s.volume / VOLUME_MAX) * 0.2, -h / 2 + 0.06, 0.035]}>
          <boxGeometry args={[(s.volume / VOLUME_MAX) * 0.4 + 0.001, 0.015, 0.002]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

/** Rèm: một tấm vải co về một bên theo tỷ lệ mở (scale.x damp). 1 draw call. */
export function CurtainMesh(p: { id: string; position: P3; yaw: number; width: number; height?: number; color?: string }) {
  const ref = useRef<Mesh>(null);
  const open = curtainOf(useObjectState(p.id));
  const h = p.height ?? 2.4;
  const k = useRef(open);
  useFrame((_, dt) => {
    k.current = MathUtils.damp(k.current, open, 5, dt);
    const m = ref.current;
    if (!m) return;
    const sx = Math.max(0.08, 1 - k.current * 0.92);
    m.scale.x = sx;
    // Neo mép trái: kéo gọn về phía -x.
    m.position.x = -p.width / 2 + (p.width * sx) / 2;
  });
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh ref={ref} position={[0, h / 2, 0]}>
        <boxGeometry args={[p.width, h, 0.04]} />
        <meshStandardMaterial color={p.color ?? '#7a8fa8'} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Đồ nhỏ: ở chỗ gốc/đã đặt thì tại vị trí lưu; trên tay thì bám điểm cầm trước-phải người chơi, damp mượt. */
export function ItemMesh(p: { id: string; home: { x: number; y: number; z: number }; radius?: number; height?: number; color?: string; preview?: 'ok' | 'bad' | null }) {
  const ref = useRef<Group>(null);
  const st = itemOf(useObjectState(p.id), p.home);
  const r = p.radius ?? 0.05;
  const h = p.height ?? 0.1;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    let tx = st.x;
    let ty = st.y;
    let tz = st.z;
    if (st.where === 'hand') {
      const sy = Math.sin(playerPose.yaw);
      const cy = Math.cos(playerPose.yaw);
      // Điểm cầm: 0,35 m phía trước, 0,18 m bên phải, cao 1,0 m.
      tx = playerPose.x + sy * 0.35 + cy * 0.18;
      tz = playerPose.z + cy * 0.35 - sy * 0.18;
      ty = 1.0;
      // Tay phải đã với tới cốc bằng IK: cốc bám socket bàn tay (tâm cốc ở socket).
      if (ikHold.active) {
        tx = ikHold.handSocket.x;
        ty = ikHold.handSocket.y - h / 2;
        tz = ikHold.handSocket.z;
      }
    }
    g.position.x = MathUtils.damp(g.position.x, tx, 18, dt);
    g.position.y = MathUtils.damp(g.position.y, ty, 18, dt);
    g.position.z = MathUtils.damp(g.position.z, tz, 18, dt);
    g.rotation.y = st.yaw;
    if (st.where === 'hand') {
      (ikHold.itemPos ??= new Vector3()).set(g.position.x, g.position.y + h / 2, g.position.z);
    } else if (ikHold.itemPos && ikHold.active === false) ikHold.itemPos = null;
  });
  return (
    <group ref={ref} position={[st.x, st.y, st.z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[r, r, h, 12]} />
        <meshStandardMaterial color={p.preview === 'bad' ? '#e04040' : p.preview === 'ok' ? '#40c060' : p.color ?? '#d9d9d9'} transparent={!!p.preview} opacity={p.preview ? 0.55 : 1} />
      </mesh>
    </group>
  );
}

/** Máy in: thân + khay giấy; tấm giấy trượt ra theo tiến độ, đèn báo đỏ khi kẹt. */
export function PrinterMesh(p: { id: string; position: P3; yaw: number }) {
  const sheet = useRef<Mesh>(null);
  const s = printerOf(useObjectState(p.id));
  const out = s.queue > 0 && !s.jam ? s.progress : 0;
  useFrame((_, dt) => {
    if (sheet.current) sheet.current.position.z = MathUtils.damp(sheet.current.position.z, 0.2 + out * 0.15, 10, dt);
  });
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.5, 0.4, 0.45]} />
        <meshStandardMaterial color="#cfd3d6" />
      </mesh>
      <mesh ref={sheet} position={[0, 0.3, 0.2]}>
        <boxGeometry args={[0.21, 0.004, 0.297]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.2, 0.36, 0.23]}>
        <boxGeometry args={[0.03, 0.02, 0.01]} />
        <meshStandardMaterial color={s.jam ? '#ff2020' : '#20c040'} emissive={s.jam ? '#ff0000' : '#00aa30'} emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

/** Cây nước: thân, bình, khay; cốc trên khay có mực nước dâng theo tiến độ rót. */
export function WaterCoolerMesh(p: { id: string; position: P3; yaw: number }) {
  const lvl = useRef<Mesh>(null);
  const s = waterOf(useObjectState(p.id));
  useFrame((_, dt) => {
    const m = lvl.current;
    if (!m) return;
    const f = MathUtils.damp(m.scale.y, Math.max(0.001, s.tray === '' ? 0.001 : s.fill), 12, dt);
    m.scale.y = f;
    m.position.y = 0.555 + 0.045 * f;
  });
  return (
    <group position={p.position} rotation={[0, p.yaw, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.32, 1.0, 0.32]} />
        <meshStandardMaterial color="#e8eaec" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.4, 14]} />
        <meshStandardMaterial color="#7fc4e8" transparent opacity={0.6} />
      </mesh>
      {s.tray !== '' && (
        <group position={[0, 0, 0.2]}>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.035, 0.03, 0.09, 10]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
          <mesh ref={lvl} position={[0, 0.55, 0]} scale={[1, 0.001, 1]}>
            <cylinderGeometry args={[0.03, 0.026, 0.09, 10]} />
            <meshStandardMaterial color={s.temp === 'hot' ? '#ff9a4a' : '#6cc6ff'} />
          </mesh>
        </group>
      )}
    </group>
  );
}
