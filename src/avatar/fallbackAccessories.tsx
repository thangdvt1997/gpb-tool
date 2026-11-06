import * as THREE from 'three';
import { Box, Cylinder, Sphere, Torus, useOwned, type Vec3 } from './fallbackParts';
import type { Accessory } from './appearance';
import { NECK_BASE_Y, NECK_Z, SurfaceLine, onSurface, surfaceZ, type BodyShape } from './fallbackBody';

/** Nhãn mặc định khi không truyền tên. */
const DEFAULT_BADGE_TEXT = 'Nhân viên';

/** Vẽ thẻ tên lên canvas: nền trắng, dải xanh phía trên, tên căn giữa, tự thu nhỏ chữ khi quá dài. */
function makeNameTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f3a5f';
    ctx.fillRect(0, 0, canvas.width, 70);

    ctx.fillStyle = '#1b1b1b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 96;
    ctx.font = `bold ${size}px sans-serif`;
    while (size > 28 && ctx.measureText(text).width > 460) {
      size -= 6;
      ctx.font = `bold ${size}px sans-serif`;
    }
    ctx.fillText(text, canvas.width / 2, 200);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Thẻ tên: mặt phẳng nhỏ có texture chữ, đặt trên ngực. */
function NameBadge({ text, position, rotation }: { text: string; position: Vec3; rotation: Vec3 }) {
  const texture = useOwned(() => makeNameTexture(text), [text]);
  const geometry = useOwned(() => new THREE.PlaneGeometry(BADGE_W, BADGE_H), []);
  const material = useOwned(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }), [texture]);
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} />;
}

export interface HeadAccessoriesProps {
  accessories: readonly Accessory[];
}

/**
 * Phụ kiện gắn vào đầu: kính cận và mũ tiệc.
 * Gốc tọa độ là tâm đầu, đồng nhất với FallbackHair.
 */
export function HeadAccessories({ accessories }: HeadAccessoriesProps) {
  const hasGlasses = accessories.includes('glasses');
  const hasHat = accessories.includes('hat-party');
  return (
    <>
      {hasGlasses && (
        <>
          {/* Tròng Ø 4,4 cm trước hai mắt (tâm cách nhau 6,3 cm), cầu mũi, bản lề và hai càng về phía tai. Gọng rộng khoảng 14 cm. */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <Torus radius={0.022} tube={0.003} position={[0.032 * side, -0.003, 0.099]} color="#222222" metallic />
              <Box size={[0.016, 0.004, 0.004]} position={[0.062 * side, 0.002, 0.097]} color="#222222" metallic />
              <Box size={[0.004, 0.004, 0.1]} position={[0.07 * side, 0.002, 0.047]} color="#222222" metallic />
            </group>
          ))}
          <Box size={[0.02, 0.004, 0.004]} position={[0, 0.002, 0.1]} color="#222222" metallic />
        </>
      )}
      {hasHat && (
        <>
          {/* Nón tiệc: đáy nằm trên đỉnh đầu (đỉnh đầu cách tâm 0,11 m, đầu rộng 0,15 m). */}
          <Cylinder radiusTop={0} radiusBottom={0.07} height={0.22} radialSegments={16} position={[0, 0.22, 0]} color="#e83e8c" />
          <Sphere radius={0.015} segments={8} position={[0, 0.33, 0]} color="#ffd166" />
        </>
      )}
    </>
  );
}

export interface BodyAccessoriesProps {
  accessories: readonly Accessory[];
  /** Tên hiển thị trên thẻ tên. Rỗng hoặc thiếu thì dùng 'Nhân viên'. */
  displayName?: string;
  /** Hình thể, để đặt phụ kiện áp sát mặt thân (surfaceZ) thay cho một mặt phẳng z cố định. */
  shape: BodyShape;
}

/**
 * Vị trí thẻ tên trên ngực trái (m gốc). Dây đeo và thẻ trống dùng chung. Giữ gần (0,09; 1,3) vì
 * src/scene/entry/EntrySequence.tsx nhắm tia quét vào điểm đó.
 */
const badgeX = 0.085;
const badgeY = 1.29;
/** Thẻ tên kích thước thẻ nhân viên 9 × 5,6 cm, cùng tỉ lệ 1,6 với texture 512 × 320. */
const BADGE_W = 0.09;
const BADGE_H = 0.056;

/** Màu dây đeo thẻ đỏ cam, REAL_OFFICE_STYLE mục 6. */
const LANYARD_ORANGE = '#e8502e';

interface StrapProps {
  from: Vec3;
  to: Vec3;
}

/**
 * Một nhánh dây đeo bản dẹt 2 cm đi từ cổ xuống móc thẻ, có vạch trắng chạy dọc (không có chữ đọc được).
 * Dây nghiêng trong mặt phẳng XY (xoay Z) rồi chúi về phía trước (xoay X trong hệ đã xoay).
 */
function Strap({ from, to }: StrapProps) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const planar = Math.hypot(dx, dy);
  const length = Math.hypot(planar, dz);
  const roll = Math.atan2(-dx, dy);
  // Sau khi xoay Z, đầu +Y của hộp hướng về điểm kết thúc (ở dưới, z lớn hơn) nên góc chúi dương.
  const pitch = Math.atan2(dz, planar);
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return (
    <group position={mid} rotation={[0, 0, roll]}>
      <group rotation={[pitch, 0, 0]}>
        <Box size={[0.02, length, 0.003]} color={LANYARD_ORANGE} />
        <Box size={[0.004, length * 0.92, 0.0036]} color="#ffffff" />
      </group>
    </group>
  );
}

/**
 * Đường dây đeo từ sau gáy (một bên cổ) xuống móc thẻ, chia ba đoạn và đẩy ra ngoài mặt ngực
 * để dây nằm trên áo, không xuyên vào ngực.
 */
function lanyardPath(shape: BodyShape, side: number, end: Vec3): Vec3[] {
  const r = shape.neckR + 0.004;
  const nx = side * 0.04;
  const start: Vec3 = [nx, NECK_BASE_Y + 0.002, NECK_Z + Math.sqrt(Math.max(0, r * r - nx * nx))];
  const points: Vec3[] = [start];
  for (const t of [0.35, 0.7]) {
    const x = start[0] + (end[0] - start[0]) * t;
    const y = start[1] + (end[1] - start[1]) * t;
    const z = start[2] + (end[2] - start[2]) * t;
    points.push([x, y, Math.max(z, surfaceZ(shape.rings, x, y) + 0.004)]);
  }
  points.push(end);
  return points;
}

/**
 * Phụ kiện gắn vào thân: nơ, khăn, thẻ tên, dây đeo, ghim cài áo.
 * Gốc tọa độ là gốc nhân vật (chân tại y = 0). Vị trí lấy theo mặt thân của shape nên áp sát áo ở mọi kiểu dáng.
 */
export function BodyAccessories({ accessories, displayName, shape }: BodyAccessoriesProps) {
  const hasBowtie = accessories.includes('bowtie');
  const hasScarf = accessories.includes('scarf');
  const hasBadge = accessories.includes('name-badge');
  const hasLanyard = accessories.includes('lanyard');
  const hasPin = accessories.includes('pin-brooch');
  const rings = shape.rings;

  // Thẻ treo ở (cardX, badgeY). Có thẻ tên thì thẻ lệch trái nhân vật như cũ; không có thì thẻ trống nằm giữa ngực.
  const cardX = hasBadge ? badgeX : 0;
  const clipY = badgeY + BADGE_H / 2 + 0.005;
  const clip = onSurface(rings, cardX, clipY, 0.006);
  const badge = onSurface(rings, badgeX, badgeY, 0.004);
  // Thẻ trống dọc 5,4 × 8,6 cm, mép trên ngang mép trên thẻ tên.
  const blankY = badgeY + BADGE_H / 2 - 0.043;
  const blank = onSurface(rings, cardX, blankY, 0.005);
  const pin = onSurface(rings, 0.065, 1.4, 0.004);
  // Nơ nằm trước chân cổ áo.
  const bowZ = NECK_Z + shape.neckR + 0.02;

  return (
    <>
      {hasBowtie && (
        <group position={[0, NECK_BASE_Y - 0.01, bowZ]}>
          {/* Hai cánh nơ, đỉnh hướng vào giữa. Rộng khoảng 7 cm. */}
          <Cylinder radiusTop={0} radiusBottom={0.022} height={0.036} rotation={[0, 0, Math.PI / 2]} position={[0.026, 0, 0]} color="#7a1f2b" />
          <Cylinder radiusTop={0} radiusBottom={0.022} height={0.036} rotation={[0, 0, -Math.PI / 2]} position={[-0.026, 0, 0]} color="#7a1f2b" />
          <Sphere radius={0.011} segments={8} position={[0, 0, 0.002]} color="#7a1f2b" />
        </group>
      )}
      {hasScarf && (
        <>
          <Torus radius={shape.neckR + 0.02} tube={0.02} rotation={[Math.PI / 2, 0, 0]} position={[0, NECK_BASE_Y + 0.005, NECK_Z]} color="#b03a48" />
          <SurfaceLine rings={rings} from={[0.03, 1.43]} to={[0.04, 1.19]} width={0.05} thick={0.012} lift={0.006} color="#b03a48" />
        </>
      )}
      {hasLanyard && (
        <>
          {[-1, 1].flatMap((side) => {
            const pts = lanyardPath(shape, side, clip.position);
            return pts.slice(1).map((p, i) => <Strap key={`${side}-${i}`} from={pts[i]} to={p} />);
          })}
          <group position={clip.position} rotation={clip.rotation}>
            <Box size={[0.014, 0.012, 0.006]} position={[0, -0.002, 0]} color="#aeb8c4" metallic />
          </group>
          {/* Thẻ trống màu xanh nhạt, không tên, ảnh hay số. Khi có thẻ tên thì thẻ tên thay thế. */}
          {!hasBadge && (
            <group position={blank.position} rotation={blank.rotation}>
              <Box size={[0.054, 0.086, 0.004]} color="#cfe3ec" />
            </group>
          )}
        </>
      )}
      {hasBadge && (
        <NameBadge
          text={displayName && displayName.trim() !== '' ? displayName : DEFAULT_BADGE_TEXT}
          position={badge.position}
          rotation={badge.rotation}
        />
      )}
      {hasPin && (
        <group position={pin.position} rotation={pin.rotation}>
          <Cylinder radiusTop={0.007} radiusBottom={0.007} height={0.008} rotation={[Math.PI / 2, 0, 0]} color="#c9a227" metallic />
        </group>
      )}
    </>
  );
}
