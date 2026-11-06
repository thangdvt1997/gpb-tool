import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { toWorldX, toWorldZ } from '../scene/layout';
import { LIGHT_PRESETS, OFFICE_KELVIN, type LightPreset, type ThemeName } from './presets';

/** Khu có bộ đèn riêng. game, karaoke, events chưa có vị trí trong FLOORPLAN_IT.md (tạm đặt ở khu dự phòng). */
export type LightZone = 'office' | 'lounge' | 'game' | 'karaoke' | 'events' | 'meeting' | 'server' | 'soc';

export interface ZoneLightsProps {
  zone: LightZone;
  /** Độ sáng tổng, 0 đến 1. Mặc định 1. */
  intensity?: number;
  /** Chủ đề. Mặc định office-day. */
  theme?: ThemeName;
}

type V3 = [number, number, number];

/** Hệ số phát sáng của mảnh emissive. Mảnh sáng gấp (1 + GLOW_STRENGTH * level) lần màu gốc. */
const GLOW_STRENGTH = 2;
/** Số đèn có bóng đổ tối đa trên toàn scene. */
const SHADOW_BUDGET = 2;

/**
 * Nhiệt độ màu (Kelvin) sang RGB 0 đến 255, công thức xấp xỉ của Tanner Helland.
 * Hợp lệ từ 1000 K đến 40000 K, ngoài khoảng sẽ bị kẹp lại.
 */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) b = 255;
  else if (temp <= 19) b = 0;
  else b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;

  const clamp = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));
  return [clamp(r), clamp(g), clamp(b)];
}

/** Màu THREE theo nhiệt độ màu. setRGB với SRGBColorSpace tự đổi sang không gian làm việc của three. */
function kelvinColor(kelvin: number): THREE.Color {
  const [r, g, b] = kelvinToRgb(kelvin);
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

const hex = (value: string): THREE.Color => new THREE.Color(value);

/** Ánh sáng chính của khu: nhiệt độ màu pha với màu chủ đề theo keyMix. */
function tint(kelvin: number, preset: LightPreset): THREE.Color {
  return kelvinColor(kelvin).lerp(hex(preset.keyColor), preset.keyMix);
}

/** Đổi toạ độ bản vẽ (mét, gốc trên-trái) và độ cao sang toạ độ three.js. */
const at = (x: number, y: number, h: number): V3 => [toWorldX(x), h, toWorldZ(y)];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Số slot bóng đổ đang dùng. Module-level để đếm chung giữa mọi khu. */
let shadowSlotsInUse = 0;

/**
 * Xin một slot bóng đổ toàn cục. Được cấp thì trả về true, hết slot thì false.
 * Slot được trả khi khu unmount. Không tự cấp lại cho khu đang chờ, nên khu mount sớm được ưu tiên.
 */
function useShadowSlot(wanted: boolean): boolean {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    if (!wanted) return undefined;
    const got = shadowSlotsInUse < SHADOW_BUDGET;
    if (got) shadowSlotsInUse += 1;
    setGranted(got);
    return () => {
      if (got) shadowSlotsInUse -= 1;
    };
  }, [wanted]);
  return granted;
}

interface BulbProps {
  position: V3;
  color: THREE.Color;
  level: number;
  cd: number;
  range: number;
}

/** Đèn điểm, không bóng. */
function Bulb({ position, color, level, cd, range }: BulbProps) {
  return <pointLight position={position} color={color} intensity={cd * level} distance={range} decay={2} />;
}

interface SpotProps {
  position: V3;
  /** Điểm đèn chiếu tới, toạ độ mặt sàn (y = 0). */
  aim: V3;
  color: THREE.Color;
  level: number;
  cd: number;
  range: number;
  /** Nửa góc côn sáng (rad), tối đa π/2. */
  angle: number;
  /** Tỉ lệ viền mờ của côn sáng, 0 đến 1. */
  penumbra: number;
  /** Đèn này có xin slot bóng đổ hay không. */
  shadow: boolean;
}

/** Đèn chiếu có target. Chỉ đèn này được đổ bóng khi còn slot. */
function Spot({ position, aim, color, level, cd, range, angle, penumbra, shadow }: SpotProps) {
  const castShadow = useShadowSlot(shadow);
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={aim} />
      <spotLight
        position={position}
        target={target}
        color={color}
        intensity={cd * level}
        distance={range}
        decay={2}
        angle={angle}
        penumbra={penumbra}
        castShadow={castShadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
    </>
  );
}

/** Một mảnh phát sáng: hộp emissive, không phải đèn. */
interface GlowSpec {
  pos: V3;
  size: V3;
  color: THREE.Color;
  /** Tần số nhấp nháy (Hz). 0 là không nhấp nháy. */
  pulseHz: number;
}

/** Đèn thực duy nhất của một khu: đèn điểm, hoặc đèn chiếu (chỉ đèn chiếu mới có thể đổ bóng). */
type MainLight =
  | { kind: 'point'; pos: V3; color: THREE.Color; cd: number; range: number }
  | {
      kind: 'spot';
      pos: V3;
      aim: V3;
      color: THREE.Color;
      cd: number;
      range: number;
      angle: number;
      penumbra: number;
      shadow: boolean;
    };

/** Đèn bán cầu (trời, đất) không bóng: lấp sáng đều từ trần, mặt trên sáng hơn mặt dưới. */
interface HemiSpec {
  sky: THREE.Color;
  ground: THREE.Color;
  intensity: number;
}

interface ZoneSpec {
  main: MainLight;
  glows: GlowSpec[];
  hemi?: HemiSpec;
}

const glow = (pos: V3, size: V3, color: THREE.Color, pulseHz = 0): GlowSpec => ({ pos, size, color, pulseHz });

/**
 * Cấu hình đèn của một khu. Toạ độ bản vẽ lấy từ docs/FLOORPLAN_IT.md (tâm của mỗi vùng).
 * Mỗi khu chỉ có một đèn thực. Đèn bàn, đèn trang trí và dải LED là mảnh emissive trong GlowField.
 * Cường độ cd và tầm range của đèn thực được ước lượng để khớp đỉnh sáng sàn của cấu hình cũ.
 * Cần kiểm lại trên màn hình thật.
 */
function zoneSpec(zone: LightZone, preset: LightPreset): ZoneSpec {
  switch (zone) {
    case 'office': {
      // Đèn chính có bóng, mở rộng trung tâm văn phòng. Đèn trần OFFICE_KELVIN (6500 K, trắng trung tính theo ảnh
      // văn phòng thật, room.txt mục 6). Số đèn có bóng không đổi (một spot, SHADOW_BUDGET 2).
      // Đèn bán cầu trắng hơi lạnh thay phần ambient bị giảm (presets.ts): lưới panel trần chiếu đều từ trên xuống,
      // nền gạch xám hắt lên. Không thêm draw call, không thêm shadow map.
      // Không còn mảnh phát sáng: ảnh thật không có đèn bàn, và hai dải đèn trần cũ đã thay bằng lưới đèn panel
      // của trần (src/scene/OfficeCeiling.tsx). GlowField rỗng không vẽ, bớt 1 draw call.
      const light = tint(OFFICE_KELVIN, preset);
      return {
        main: {
          kind: 'spot',
          pos: at(22.5, 12.5, 2.9),
          aim: at(22.5, 12.5, 0),
          color: light,
          cd: 70,
          range: 14,
          angle: 1.35,
          penumbra: 0.5,
          shadow: true,
        },
        glows: [],
        hemi: { sky: hex('#f4f7fb'), ground: hex('#a9abaa'), intensity: 0.55 },
      };
    }
    case 'lounge': {
      // Lounge (46.5 đến 57.9, 4.7 đến 21.0): đèn ấm 2700 K có bóng, đèn bàn sofa, LED hắt sáng phía Bắc.
      const warm = tint(2700, preset);
      const tableLamp = kelvinColor(2200);
      return {
        main: {
          kind: 'spot',
          pos: at(52.2, 12.85, 2.9),
          aim: at(52.2, 12.85, 0),
          color: warm,
          cd: 71,
          range: 10,
          angle: 1.2,
          penumbra: 0.5,
          shadow: true,
        },
        glows: [
          glow(at(50.4, 15.5, 1.0), [0.22, 0.05, 0.22], tableLamp),
          glow(at(56, 15.5, 1.0), [0.22, 0.05, 0.22], tableLamp),
          glow(at(52.2, 5.3, 2.7), [10, 0.03, 0.06], warm),
        ],
      };
    }
    case 'game': {
      // Khu game (vị trí tạm, x 14.5 đến 20.5): đèn 3500 K, LED sàn xen kẽ hai màu chủ đề.
      const light = tint(3500, preset);
      return {
        main: { kind: 'point', pos: at(17.5, 7.5, 2.9), color: light, cd: 24, range: 12 },
        glows: [
          glow(at(17.5, 6, 0.03), [5, 0.02, 0.2], hex(preset.accentColor), 0.5),
          glow(at(17.5, 9, 0.03), [5, 0.02, 0.2], hex(preset.accentColor2), 0.7),
        ],
      };
    }
    case 'karaoke': {
      // Karaoke (vị trí tạm, x 20.5 đến 25.5): đèn trung tâm pha tím và hồng. Đèn sân khấu tím, hồng và neon là mảnh phát sáng.
      const purple = hex('#9b5cff');
      const pink = hex('#ff4fa3');
      return {
        main: { kind: 'point', pos: at(23, 4, 2.9), color: purple.clone().lerp(pink, 0.5), cd: 64, range: 9 },
        glows: [
          glow(at(21.5, 1.5, 2.9), [0.25, 0.1, 0.25], purple),
          glow(at(24.5, 1.5, 2.9), [0.25, 0.1, 0.25], pink),
          glow(at(23, 12.5, 0.03), [4, 0.02, 0.05], pink, 1),
        ],
      };
    }
    case 'events': {
      // Sự kiện (vị trí tạm, x 25.5 đến 29.9): đèn 3000 K, điểm nhấn vàng là mảnh phát sáng.
      const warm = tint(3000, preset);
      const gold = hex('#ffb83f');
      return {
        main: { kind: 'point', pos: at(27.7, 6.5, 2.9), color: warm, cd: 73, range: 10 },
        glows: [glow(at(26, 1, 2.9), [0.25, 0.1, 0.25], gold), glow(at(27.7, 0.7, 2.7), [4, 0.03, 0.04], gold)],
      };
    }
    case 'meeting': {
      // Phòng họp mr1, mr2, mr3: một đèn 4500 K phủ cả ba phòng kính, vạch trạng thái màu nhấn.
      const neutral = tint(4500, preset);
      const accent = hex(preset.accentColor);
      // Tâm mr1, mr2, mr3 (bản vẽ).
      const rooms: { x: number; y: number }[] = [
        { x: 11, y: 12.85 },
        { x: 7.05, y: 27 },
        { x: 11.7, y: 27 },
      ];
      return {
        main: { kind: 'point', pos: at(9.5, 20, 2.5), color: neutral, cd: 79, range: 9 },
        glows: rooms.map((r) => glow(at(r.x, r.y, 2.75), [3, 0.03, 0.05], accent)),
      };
    }
    case 'server': {
      // Phòng máy chủ (21.3 đến 24.1, 25.5 đến 28.5): đèn trắng lạnh 6500 K, LED rack nhấp nháy.
      const ledGreen = hex('#2fbf71');
      const ledAmber = hex('#f2b632');
      // Rack đặt tại x = 22.7 + dx, mặt trước cách tường 0.31 m (xem roomInterior trong layout.ts).
      const rackOffsets = [-0.8, 0, 0.8];
      return {
        main: { kind: 'point', pos: at(22.7, 27, 2.6), color: kelvinColor(6500), cd: 15, range: 6 },
        glows: [
          ...rackOffsets.map((dx) => glow(at(22.7 + dx, 26.27, 1.5), [0.4, 0.04, 0.02], ledGreen, 0.5)),
          ...rackOffsets.map((dx) => glow(at(22.7 + dx, 26.27, 0.7), [0.4, 0.04, 0.02], ledAmber, 0.5)),
        ],
      };
    }
    case 'soc': {
      // Phòng SOC (26.5 đến 31.1, 25.5 đến 28.5): ánh sáng xanh mờ, màn hình phát sáng, vạch cảnh báo đỏ.
      const blue = hex('#8fb4ff');
      const screen = hex('#2a6fdb');
      const alert = hex('#ff4d4d');
      // Màn hình đặt tại x = 28.8 + dx, mặt trước ở bản vẽ y = 25.74.
      const screenXs = [27.6, 28.8, 30.0];
      return {
        main: { kind: 'point', pos: at(28.75, 27.5, 2.6), color: blue, cd: 7, range: 6 },
        glows: [
          glow(at(28.8, 27.2, 1.0), [0.22, 0.05, 0.22], blue),
          ...screenXs.map((x) => glow(at(x, 25.74, 1.5), [1.0, 0.65, 0.02], screen, 0.3)),
          glow(at(28.8, 25.6, 2.75), [3.5, 0.03, 0.04], alert, 0.2),
        ],
      };
    }
  }
}

/**
 * Mọi mảnh phát sáng của một khu gom vào một InstancedMesh, tức một lệnh vẽ.
 * Màu gốc và độ sáng (nhấp nháy) từng mảnh đi qua instanceColor. Vật liệu dùng chung, dispose khi unmount.
 */
function GlowField({ items, level }: { items: GlowSpec[]; level: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Vị trí, kích thước và màu gốc của từng mảnh. Chỉ ghi lại khi danh sách đổi.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    items.forEach((it, i) => {
      p.set(it.pos[0], it.pos[1], it.pos[2]);
      s.set(it.size[0], it.size[1], it.size[2]);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);

  // Mỗi khung hình chỉ đổi màu, không đổi ma trận. Số mảnh nhỏ nên chi phí không đáng kể.
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor || level <= 0) return;
    const t = clock.elapsedTime;
    items.forEach((it, i) => {
      const wave = it.pulseHz > 0 ? 0.75 + 0.25 * Math.sin(t * 2 * Math.PI * it.pulseHz) : 1;
      tmp.copy(it.color).multiplyScalar(1 + GLOW_STRENGTH * level * wave);
      mesh.setColorAt(i, tmp);
    });
    mesh.instanceColor.needsUpdate = true;
  });

  // Không có mảnh nào thì không tạo mesh (không tốn draw call).
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[geometry, material, items.length]} frustumCulled={false} visible={level > 0} />
  );
}

/**
 * Bộ đèn của một khu. Đặt trong Canvas (toạ độ three.js, xem src/scene/layout.ts).
 * Canvas cần bật shadows để đèn có bóng hoạt động.
 * Mỗi khu có tối đa một đèn thực và một InstancedMesh phát sáng. Tổng số đèn có bóng bị giới hạn bởi SHADOW_BUDGET.
 */
export function ZoneLights({ zone, intensity = 1, theme = 'office-day' }: ZoneLightsProps) {
  const preset = LIGHT_PRESETS[theme];
  const level = clamp01(intensity) * preset.lightScale;
  const spec = useMemo(() => zoneSpec(zone, preset), [zone, preset]);
  const { main, glows } = spec;
  return (
    <group name={`lights-${zone}`}>
      {main.kind === 'spot' ? (
        <Spot
          position={main.pos}
          aim={main.aim}
          color={main.color}
          level={level}
          cd={main.cd}
          range={main.range}
          angle={main.angle}
          penumbra={main.penumbra}
          shadow={main.shadow}
        />
      ) : (
        <Bulb position={main.pos} color={main.color} level={level} cd={main.cd} range={main.range} />
      )}
      {spec.hemi && (
        <hemisphereLight color={spec.hemi.sky} groundColor={spec.hemi.ground} intensity={spec.hemi.intensity * level} />
      )}
      <GlowField items={glows} level={level} />
    </group>
  );
}
