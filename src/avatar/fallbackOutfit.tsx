import { useMemo, type ReactNode } from 'react';
import { Box, Cylinder, Sphere, Torus, mixHex, shade, type Vec3 } from './fallbackParts';
import type { Accessory, Outfit, ShoeStyle } from './appearance';
import {
  BELT_Y,
  HIP_Y,
  NECK_BASE_Y,
  NECK_Z,
  Loft,
  SurfaceLine,
  onSurface,
  skirtRings,
  surfaceZ,
  type BodyShape,
  type Ring,
} from './fallbackBody';

/** Kiểu tay áo: ngắn tới khuỷu, dài tới cổ tay, hoặc rộng tay dài (áo bà ba). */
export type SleeveKind = 'short' | 'long' | 'wide';

export function outfitSleeve(outfit: Outfit): SleeveKind {
  switch (outfit) {
    case 'shirt-tie':
    case 'blazer':
    case 'party-suit':
    case 'ao-dai':
    case 'ao-dai-nam':
    case 'ao-dai-nu':
    case 'shirt-white':
    case 'shirt-blue':
    case 'vest-navy':
    case 'cardigan-gray':
    case 'tracksuit':
    case 'evening-gown':
    case 'tuxedo':
      return 'long';
    case 'ao-ba-ba':
      return 'wide';
    case 'dress':
    case 'casual':
    case 'uniform-karaoke':
    case 'polo-office':
    case 'trousers-dark':
    case 'skirt-office':
    case 'security-uniform':
    case 'sport-jersey':
      return 'short';
  }
}

/** Váy dài tới gối: chân để trần hoặc đi tất, không có quần. */
export function outfitHasSkirt(outfit: Outfit): boolean {
  return outfit === 'dress' || outfit === 'skirt-office' || outfit === 'evening-gown';
}

/** Hệ số độ rộng ống chân. Áo dài và bà ba có quần ống rộng, quần tây ống đứng hơi rộng hơn quần thường. */
export function outfitLegWidth(outfit: Outfit): number {
  switch (outfit) {
    case 'ao-dai':
    case 'ao-dai-nam':
    case 'ao-dai-nu':
      return 1.3;
    case 'ao-ba-ba':
      return 1.25;
    case 'tracksuit':
      return 1.08;
    case 'tuxedo':
    case 'polo-office':
    case 'shirt-white':
    case 'shirt-blue':
    case 'vest-navy':
    case 'cardigan-gray':
    case 'trousers-dark':
    case 'security-uniform':
      return 1.04;
    default:
      return 1;
  }
}

/** Quần tây có nếp ly trước ống. */
export function outfitHasCrease(outfit: Outfit): boolean {
  switch (outfit) {
    case 'polo-office':
    case 'shirt-white':
    case 'shirt-blue':
    case 'vest-navy':
    case 'cardigan-gray':
    case 'trousers-dark':
    case 'security-uniform':
    case 'tuxedo':
      return true;
    default:
      return false;
  }
}

// Màu cố định của các bộ công sở (REAL_OFFICE_STYLE mục 2 và 6). Hex là ước lượng, cần chỉnh trên màn hình thật.
const POLO_WHITE = '#f4f4f2';
const NAVY_TRIM = '#1e2636';
const TROUSER_DARK = '#22272e';
const SHIRT_BLUE = '#cfe3ec';
const VEST_NAVY = '#243252';
const CARDIGAN_GRAY = '#8b9099';
const SECURITY_NAVY = '#1e2a44';
const SECURITY_PANTS = '#161c2b';
const BELT_LEATHER = '#17191d';
const BUCKLE_SILVER = '#aeb8c4';
const TUX_BLACK = '#15171c';
const TUX_TROUSER = '#101216';
const SATIN = '#2b2e36';

/** Màu thân áo thực tế. Các bộ có bảng màu riêng bỏ qua topColor của người dùng. */
export function outfitTopColor(outfit: Outfit, topColor: string): string {
  switch (outfit) {
    case 'polo-office':
    case 'shirt-white':
      return POLO_WHITE;
    case 'shirt-blue':
      return SHIRT_BLUE;
    case 'vest-navy':
      return VEST_NAVY;
    case 'cardigan-gray':
      return CARDIGAN_GRAY;
    case 'security-uniform':
      return SECURITY_NAVY;
    case 'tuxedo':
      return TUX_BLACK;
    default:
      return topColor;
  }
}

/** Màu quần hoặc váy thực tế. Quần tây tối, váy công sở tối và đồng phục bảo vệ có màu cố định. */
export function outfitBottomColor(outfit: Outfit, bottomColor: string): string {
  switch (outfit) {
    case 'trousers-dark':
    case 'skirt-office':
      return TROUSER_DARK;
    case 'security-uniform':
      return SECURITY_PANTS;
    case 'tuxedo':
      return TUX_TROUSER;
    default:
      return bottomColor;
  }
}

/** Màu bo tay áo, nếu bộ có bo. */
export function outfitCuffColor(outfit: Outfit): string | undefined {
  switch (outfit) {
    case 'polo-office':
      return NAVY_TRIM;
    case 'vest-navy':
      return POLO_WHITE;
    case 'cardigan-gray':
      return shade(CARDIGAN_GRAY, -0.22);
    case 'ao-dai-nam':
      return '#c9a227';
    case 'tracksuit':
      return shade(POLO_WHITE, -0.4);
    default:
      return undefined;
  }
}

/** Quần short thể thao: màu quần short và độ dài (m) tính từ hông. Chân phía dưới để trần. */
export function outfitShorts(outfit: Outfit, bottomColor: string): { color: string; length: number } | undefined {
  return outfit === 'sport-jersey' ? { color: bottomColor, length: 0.42 } : undefined;
}

/** Sọc dọc hai bên ống quần (bộ đồ thể thao, quần tuxedo). */
export function outfitLegStripe(outfit: Outfit): string | undefined {
  if (outfit === 'tracksuit') return POLO_WHITE;
  if (outfit === 'tuxedo') return SATIN;
  return undefined;
}

/** Phụ kiện đi kèm bộ, gộp vào danh sách phụ kiện của người dùng khi vẽ. Polo luôn có dây đeo thẻ. */
export function outfitImpliedAccessories(outfit: Outfit): readonly Accessory[] {
  return outfit === 'polo-office' ? ['lanyard'] : [];
}

/**
 * Độ cao gấu áo (m gốc): trên đó thân mang màu áo, dưới là màu quần. Áo sơ vin dừng ở thắt lưng,
 * áo thả ngoài (thun, thể thao, cardigan) phủ xuống hông, áo dài và bà ba phủ qua hông.
 */
export function outfitHemY(outfit: Outfit): number {
  switch (outfit) {
    case 'casual':
    case 'tracksuit':
      return 0.9;
    case 'sport-jersey':
      return 0.89;
    case 'cardigan-gray':
      return 0.93;
    case 'ao-dai':
    case 'ao-dai-nam':
    case 'ao-dai-nu':
      return 0.88;
    case 'ao-ba-ba':
      return 0.86;
    default:
      return 0.955;
  }
}

/** Độ phồng thân áo so với thân (m): áo bà ba rộng, áo khoác thể thao dày hơn. */
function outfitTopInflate(outfit: Outfit): number {
  if (outfit === 'ao-ba-ba') return 0.01;
  if (outfit === 'tracksuit') return 0.005;
  return 0;
}

const SHIRT_WHITE = '#f7f7f7';
const TIE_RED = '#7a1f2b';
const GOLD = '#c9a227';
const BELT_BLACK = '#222222';
const STRIPE_YELLOW = '#ffd166';

/** Độ cao cúc áo: cách nhau 0,05 m, cúc đầu cách cổ áo khoảng 3 cm (AVATAR_SPEC mục 5.2). */
const BUTTON_YS: readonly number[] = [1.405, 1.355, 1.305, 1.255, 1.205, 1.155];

/** Đỉnh thân (chân cổ), khớp vòng cuối trong fallbackBody. */
const TORSO_TOP_Y = 1.475;

/** Gom các chi tiết phẳng vào một group nằm áp mặt trước thân tại (x, y). Con đặt quanh gốc, mặt hướng +Z. */
function OnBody({
  rings,
  x,
  y,
  lift = 0.003,
  inflate = 0,
  children,
}: {
  rings: readonly Ring[];
  x: number;
  y: number;
  lift?: number;
  inflate?: number;
  children: ReactNode;
}) {
  const p = onSurface(rings, x, y, lift, inflate);
  return (
    <group position={p.position} rotation={p.rotation}>
      {children}
    </group>
  );
}

/** Dãy cúc áo dọc giữa ngực, nằm sát bề mặt (cách 1 đến 2 mm). */
function ShirtButtons({
  rings,
  count,
  color = '#f0f0f0',
  inflate = 0,
}: {
  rings: readonly Ring[];
  count: number;
  color?: string;
  inflate?: number;
}) {
  return (
    <>
      {BUTTON_YS.slice(0, count).map((y) => (
        <Sphere
          key={y}
          radius={0.0045}
          segments={8}
          scale={[1, 1, 0.5]}
          position={[0, y, surfaceZ(rings, 0, y, inflate) + 0.0035]}
          color={color}
        />
      ))}
    </>
  );
}

/** Cổ bẻ: chân cổ ôm quanh cổ và hai vạt nhọn chĩa xuống giữa ngực. */
function ShirtCollar({ shape, color }: { shape: BodyShape; color: string }) {
  const r = shape.neckR;
  return (
    <>
      <Cylinder radiusTop={r + 0.005} radiusBottom={r + 0.009} height={0.03} position={[0, NECK_BASE_Y + 0.012, NECK_Z]} color={color} />
      {[-1, 1].map((side) => (
        <OnBody key={side} rings={shape.rings} x={side * 0.03} y={1.432} lift={0.004}>
          <Box size={[0.03, 0.05, 0.005]} rotation={[0, 0, -side * 0.45]} color={color} />
        </OnBody>
      ))}
    </>
  );
}

/** Viền cổ tròn của áo thun, áo cánh, áo bà ba. */
function CrewNeck({ shape, color, tube = 0.008 }: { shape: BodyShape; color: string; tube?: number }) {
  return (
    <Torus
      radius={shape.neckR + 0.007}
      tube={tube}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, NECK_BASE_Y, NECK_Z]}
      color={color}
    />
  );
}

/** Cổ đứng (áo dài, áo khoác thể thao): ống ngắn ôm cổ. */
function StandCollar({ shape, color, height = 0.045 }: { shape: BodyShape; color: string; height?: number }) {
  const r = shape.neckR;
  return (
    <Cylinder
      radiusTop={r + 0.007}
      radiusBottom={r + 0.012}
      height={height}
      position={[0, NECK_BASE_Y + height / 2 - 0.005, NECK_Z]}
      color={color}
    />
  );
}

/** Thắt lưng da đen khoá bạc, quấn quanh eo sơ vin. thick là bản rộng (đồng phục bảo vệ). */
function Belt({ rings, thick = false }: { rings: readonly Ring[]; thick?: boolean }) {
  const h = thick ? 0.05 : 0.035;
  const inflate = 0.005;
  return (
    <>
      <Loft rings={rings} y0={BELT_Y - h / 2} y1={BELT_Y + h / 2} inflate={inflate} color={BELT_LEATHER} />
      <Box
        size={[0.04, h * 0.8, 0.008]}
        position={[0, BELT_Y, surfaceZ(rings, 0, BELT_Y, inflate) + 0.004]}
        color={BUCKLE_SILVER}
        metallic
      />
    </>
  );
}

/** Nẹp áo sơ mi lộ ra giữa hai vạt vest. */
function ShirtFront({ rings, color }: { rings: readonly Ring[]; color: string }) {
  return <Loft rings={rings} y0={1.1} y1={1.445} inflate={0.002} thetaStart={-0.55} thetaLength={1.1} radial={8} color={color} />;
}

/** Hai ve áo vest hình chữ V, bám theo độ cong ngực. trim là viền mép ngoài (vest tiệc). */
function Lapels({ rings, color, trim }: { rings: readonly Ring[]; color: string; trim?: string }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <SurfaceLine rings={rings} from={[side * 0.028, 1.1]} to={[side * 0.072, 1.43]} width={0.045} thick={0.008} lift={0.004} color={color} />
          {trim && (
            <SurfaceLine rings={rings} from={[side * 0.052, 1.1]} to={[side * 0.096, 1.43]} width={0.008} thick={0.01} lift={0.006} color={trim} metallic />
          )}
        </group>
      ))}
    </>
  );
}

/** Cầu vai đặt trên dốc vai: một miếng vải và một vạch. */
function Epaulette({ shape, side, color, stripe }: { shape: BodyShape; side: number; color: string; stripe: string }) {
  return (
    <group position={[side * (shape.shoulderHalf - 0.055), 1.415, -0.01]} rotation={[0, 0, -side * 0.35]}>
      <Box size={[0.085, 0.012, 0.075]} color={color} />
      <Box size={[0.085, 0.014, 0.01]} position={[0, 0.002, 0.02]} color={stripe} metallic />
    </group>
  );
}

/**
 * Tà áo dài trước và sau: ôm hông từ eo rồi rủ thẳng tới gần mắt cá. halfW là nửa bề ngang tà ở hông.
 * Tà là dải cong theo hông nên mép trên khớp với thân, không hở.
 */
function AoDaiPanels({
  shape,
  rings,
  halfW,
  color,
  trim,
  trimMetallic = false,
}: {
  shape: BodyShape;
  rings: readonly Ring[];
  halfW: number;
  color: string;
  trim: string;
  trimMetallic?: boolean;
}) {
  const theta = Math.asin(Math.min(0.97, halfW / shape.hipA));
  return (
    <>
      {[0, Math.PI].map((center) => (
        <group key={center}>
          <Loft rings={rings} y0={0.15} y1={1.0} thetaStart={center - theta} thetaLength={2 * theta} radial={12} color={color} doubleSide />
          <Loft rings={rings} y0={0.15} y1={0.18} inflate={0.002} thetaStart={center - theta} thetaLength={2 * theta} radial={12} color={trim} metallic={trimMetallic} />
        </group>
      ))}
    </>
  );
}

export interface FallbackOutfitProps {
  outfit: Outfit;
  topColor: string;
  bottomColor: string;
  shape: BodyShape;
}

/**
 * Thân và trang phục: thân trơn theo mặt cắt (hông, eo, ngực, dốc vai), rồi các chi tiết riêng của từng kiểu.
 * Gốc tọa độ là gốc nhân vật (chân tại y = 0); thân nằm giữa y 0,80 và chân cổ 1,475. Mặt trước hướng về +Z.
 * Chi tiết trước ngực đặt theo surfaceZ nên áp sát thân mới. Không có texture hay logo.
 */
export function FallbackOutfit({ outfit, topColor, bottomColor, shape }: FallbackOutfitProps) {
  const rings = shape.rings;
  const top = outfitTopColor(outfit, topColor);
  const bottom = outfitBottomColor(outfit, bottomColor);
  const buttonOnTop = mixHex(top, '#ffffff', 0.7);
  // Đầm dạ hội một màu từ ngực xuống gấu: phần hông cũng lấy màu thân áo.
  const hipColor = outfit === 'evening-gown' ? top : bottom;
  const hemY = outfitHemY(outfit);
  const topInflate = outfitTopInflate(outfit);
  const { hipA } = shape;

  // Mặt cắt của váy và tà áo, theo hình thể. shape là đối tượng cố định cho mỗi kiểu dáng.
  const dressRings = useMemo(() => skirtRings(shape, 1.02, 0.4, 1.16, 0.008), [shape]);
  const pencilRings = useMemo(() => skirtRings(shape, 0.99, 0.44, 0.93, 0.006), [shape]);
  const gownRings = useMemo(() => skirtRings(shape, 1.1, 0.03, 1.5, 0.006), [shape]);
  const panelRings = useMemo(() => skirtRings(shape, 1.0, 0.15, 1.02, 0.005), [shape]);

  return (
    <>
      {/* Thân: phần dưới màu quần (hông), phần trên màu áo */}
      <Loft rings={rings} y0={0.8} y1={hemY} color={hipColor} />
      <Loft rings={rings} y0={hemY} y1={TORSO_TOP_Y} inflate={topInflate} color={top} />

      {outfit === 'shirt-tie' && (
        <>
          <ShirtButtons rings={rings} count={5} />
          <ShirtCollar shape={shape} color={SHIRT_WHITE} />
          <SurfaceLine rings={rings} from={[0, 1.42]} to={[0, 1.07]} width={0.04} thick={0.006} lift={0.005} steps={4} color={TIE_RED} />
          <OnBody rings={rings} x={0} y={1.435} lift={0.01}>
            <Box size={[0.042, 0.035, 0.02]} color={TIE_RED} />
          </OnBody>
        </>
      )}

      {outfit === 'blazer' && (
        <>
          <ShirtFront rings={rings} color={SHIRT_WHITE} />
          <Lapels rings={rings} color={top} />
        </>
      )}

      {outfit === 'party-suit' && (
        <>
          <ShirtFront rings={rings} color={SHIRT_WHITE} />
          {/* Ve áo có viền vàng ở mép ngoài */}
          <Lapels rings={rings} color={top} trim={GOLD} />
          {/* Dây lưng vàng */}
          <Loft rings={rings} y0={0.925} y1={0.995} inflate={0.006} color={GOLD} metallic />
        </>
      )}

      {outfit === 'dress' && (
        // Thân váy: ôm eo và hông rồi xoè nhẹ tới quá gối.
        <Loft rings={dressRings} y0={0.4} y1={1.02} radial={28} color={bottom} doubleSide />
      )}

      {outfit === 'casual' && (
        // Áo thun cổ tròn: viền cổ là vòng nằm ngang quanh chân cổ.
        <CrewNeck shape={shape} color={SHIRT_WHITE} />
      )}

      {outfit === 'uniform-karaoke' && (
        <>
          <ShirtButtons rings={rings} count={3} />
          <Loft rings={rings} y0={1.285} y1={1.315} inflate={0.002} thetaStart={-1.3} thetaLength={2.6} radial={14} color={STRIPE_YELLOW} />
          <Loft rings={rings} y0={0.975} y1={1.005} inflate={0.005} color={BELT_BLACK} />
        </>
      )}

      {/* ---- Công sở ---- */}

      {outfit === 'polo-office' && (
        <>
          {/* Cổ bẻ và nẹp cúc xanh đậm */}
          <ShirtCollar shape={shape} color={NAVY_TRIM} />
          <SurfaceLine rings={rings} from={[0, 1.445]} to={[0, 1.325]} width={0.028} thick={0.004} lift={0.001} steps={2} color={shade(POLO_WHITE, -0.06)} />
          {[1.425, 1.385, 1.345].map((y) => (
            <Sphere key={y} radius={0.0045} segments={8} scale={[1, 1, 0.5]} position={[0, y, surfaceZ(rings, 0, y) + 0.0075]} color="#c9ced6" />
          ))}
          {/* Viền raglan xanh đậm từ chân cổ tới nách, hai mặt trước và sau */}
          {[-1, 1].map((side) => (
            <group key={`raglan-${side}`}>
              <SurfaceLine rings={rings} from={[side * 0.05, 1.445]} to={[side * (shape.chestA - 0.01), 1.31]} width={0.009} thick={0.004} lift={0.0015} color={NAVY_TRIM} />
              <SurfaceLine rings={rings} from={[side * 0.05, 1.445]} to={[side * (shape.chestA - 0.01), 1.31]} width={0.009} thick={0.004} lift={0.0015} back color={NAVY_TRIM} />
            </group>
          ))}
          {/* Biểu tượng ngực trái: chấm tròn trung tính, không phải logo */}
          <OnBody rings={rings} x={0.075} y={1.36} lift={0.002}>
            <Cylinder radiusTop={0.011} radiusBottom={0.011} height={0.004} rotation={[Math.PI / 2, 0, 0]} color={NAVY_TRIM} />
          </OnBody>
          <Belt rings={rings} />
        </>
      )}

      {(outfit === 'shirt-white' || outfit === 'shirt-blue') && (
        <>
          <ShirtCollar shape={shape} color={shade(top, -0.04)} />
          <ShirtButtons rings={rings} count={5} color={shade(top, -0.18)} />
          <Belt rings={rings} />
        </>
      )}

      {outfit === 'vest-navy' && (
        <>
          {/* Vạt dưới của vest phủ qua hông */}
          <Loft rings={rings} y0={0.88} y1={0.99} inflate={0.008} color={top} />
          {/* Áo sơ mi trắng bên trong, cổ bẻ */}
          <ShirtFront rings={rings} color={POLO_WHITE} />
          <ShirtCollar shape={shape} color={POLO_WHITE} />
          <Lapels rings={rings} color={shade(top, 0.1)} />
          {/* Hai cúc vest và nắp túi ngực bên phải của nhân vật */}
          <Sphere radius={0.009} segments={8} scale={[1, 1, 0.5]} position={[0.02, 1.05, surfaceZ(rings, 0.02, 1.05) + 0.005]} color="#10151f" />
          <Sphere radius={0.009} segments={8} scale={[1, 1, 0.5]} position={[0.02, 0.985, surfaceZ(rings, 0.02, 0.985, 0.008) + 0.005]} color="#10151f" />
          <OnBody rings={rings} x={-0.085} y={1.22}>
            <Box size={[0.06, 0.012, 0.006]} color={shade(top, 0.14)} />
          </OnBody>
        </>
      )}

      {outfit === 'cardigan-gray' && (
        <>
          {/* Áo thun trắng bên trong, hai nẹp cúc hai bên, gấu bo */}
          <Loft rings={rings} y0={1.12} y1={1.445} inflate={0.002} thetaStart={-0.42} thetaLength={0.84} radial={8} color={POLO_WHITE} />
          <CrewNeck shape={shape} color={POLO_WHITE} />
          {[-1, 1].map((side) => (
            <SurfaceLine key={side} rings={rings} from={[side * 0.05, 1.43]} to={[side * 0.055, 0.91]} width={0.028} thick={0.006} lift={0.002} steps={4} color={shade(top, -0.12)} />
          ))}
          {[1.36, 1.25, 1.14, 1.03].map((y) => (
            <Sphere key={y} radius={0.007} segments={8} scale={[1, 1, 0.5]} position={[0.052, y, surfaceZ(rings, 0.052, y) + 0.01]} color="#4d5158" />
          ))}
          <Loft rings={rings} y0={0.905} y1={0.95} inflate={0.006} color={shade(top, -0.12)} />
        </>
      )}

      {outfit === 'trousers-dark' && (
        <>
          <ShirtCollar shape={shape} color={shade(top, 0.12)} />
          <ShirtButtons rings={rings} count={5} color={buttonOnTop} />
          <Belt rings={rings} />
        </>
      )}

      {outfit === 'skirt-office' && (
        <>
          {/* Áo cánh cổ tròn */}
          <CrewNeck shape={shape} color={shade(top, 0.15)} />
          <ShirtButtons rings={rings} count={3} color={buttonOnTop} />
          {/* Chân váy bút chì ôm hông, thon nhẹ về gối, cạp đậm hơn */}
          <Loft rings={pencilRings} y0={0.44} y1={0.99} radial={28} color={bottom} doubleSide />
          <Loft rings={pencilRings} y0={0.955} y1={0.99} inflate={0.003} radial={28} color={shade(bottom, -0.25)} />
        </>
      )}

      {outfit === 'security-uniform' && (
        <>
          <ShirtCollar shape={shape} color={shade(top, 0.14)} />
          <ShirtButtons rings={rings} count={5} color={BUCKLE_SILVER} />
          <Epaulette shape={shape} side={1} color={shade(top, 0.16)} stripe={GOLD} />
          <Epaulette shape={shape} side={-1} color={shade(top, 0.16)} stripe={GOLD} />
          {/* Huy hiệu hình khiên ngực trái: sáu cạnh phẳng bằng bạc, lõi vàng, không chữ */}
          <OnBody rings={rings} x={0.075} y={1.335} lift={0.003}>
            <Cylinder radiusTop={0.027} radiusBottom={0.027} height={0.006} radialSegments={6} rotation={[Math.PI / 2, 0, 0]} color={BUCKLE_SILVER} metallic />
            <Cylinder radiusTop={0.013} radiusBottom={0.013} height={0.006} radialSegments={6} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.004]} color={GOLD} metallic />
          </OnBody>
          {/* Bảng tên trống ngực phải và hai nắp túi */}
          <OnBody rings={rings} x={-0.075} y={1.335}>
            <Box size={[0.06, 0.02, 0.006]} color="#e8ebef" />
          </OnBody>
          <OnBody rings={rings} x={-0.075} y={1.27} lift={0.004}>
            <Box size={[0.065, 0.035, 0.008]} color={shade(top, 0.08)} />
          </OnBody>
          <OnBody rings={rings} x={0.075} y={1.25} lift={0.004}>
            <Box size={[0.065, 0.035, 0.008]} color={shade(top, 0.08)} />
          </OnBody>
          <Belt rings={rings} thick />
        </>
      )}

      {/* ---- Thể thao ---- */}

      {outfit === 'sport-jersey' && (
        <>
          {/* Áo thi đấu cổ tròn có gân, sọc dọc hai bên sườn, vạch ngang ngực trơn (không số, không chữ). */}
          <CrewNeck shape={shape} color={shade(top, -0.25)} tube={0.009} />
          {[-1, 1].map((side) => (
            <Loft key={side} rings={rings} y0={0.92} y1={1.36} inflate={0.002} thetaStart={side * (Math.PI / 2) - 0.1} thetaLength={0.2} radial={4} color={POLO_WHITE} />
          ))}
          <Loft rings={rings} y0={1.325} y1={1.355} inflate={0.002} thetaStart={-1.1} thetaLength={2.2} radial={12} color={shade(top, 0.4)} />
          <Loft rings={rings} y0={0.89} y1={0.91} inflate={0.003} color={shade(top, -0.2)} />
        </>
      )}

      {outfit === 'tracksuit' && (
        <>
          {/* Áo khoác thể thao: cổ đứng, khoá kéo giữa, gấu bo. Sọc trắng ở tay áo là bo tay (outfitCuffColor). */}
          <StandCollar shape={shape} color={shade(top, -0.1)} />
          <SurfaceLine rings={rings} from={[0, 1.45]} to={[0, 0.905]} width={0.008} thick={0.004} lift={0.002} inflate={topInflate} steps={5} color={BUCKLE_SILVER} metallic />
          <OnBody rings={rings} x={0} y={1.43} lift={0.008} inflate={topInflate}>
            <Box size={[0.012, 0.04, 0.008]} color={BUCKLE_SILVER} metallic />
          </OnBody>
          <Loft rings={rings} y0={0.9} y1={0.94} inflate={topInflate + 0.003} color={shade(top, -0.2)} />
        </>
      )}

      {/* ---- Dạ hội ---- */}

      {outfit === 'evening-gown' && (
        <>
          {/* Đầm dạ hội kín đáo: cổ tròn cao, tay dài, thắt eo bằng dải vàng, váy xoè nhẹ dài chấm gấu sát đất. */}
          <CrewNeck shape={shape} color={shade(top, 0.2)} tube={0.009} />
          <Loft rings={gownRings} y0={0.03} y1={1.1} radial={32} color={top} doubleSide />
          <Loft rings={rings} y0={1.06} y1={1.1} inflate={0.01} color={GOLD} metallic />
        </>
      )}

      {outfit === 'tuxedo' && (
        <>
          {/* Vest đen ve satin, sơ mi trắng, nơ đen, vạt dưới phủ hông. */}
          <Loft rings={rings} y0={0.88} y1={0.99} inflate={0.008} color={top} />
          <ShirtFront rings={rings} color={POLO_WHITE} />
          <ShirtCollar shape={shape} color={POLO_WHITE} />
          <Lapels rings={rings} color={SATIN} />
          <group position={[0, 1.445, NECK_Z + shape.neckR + 0.02]}>
            <Cylinder radiusTop={0} radiusBottom={0.02} height={0.036} rotation={[0, 0, Math.PI / 2]} position={[0.028, 0, 0]} color="#0b0c0e" />
            <Cylinder radiusTop={0} radiusBottom={0.02} height={0.036} rotation={[0, 0, -Math.PI / 2]} position={[-0.028, 0, 0]} color="#0b0c0e" />
            <Sphere radius={0.01} segments={8} color="#0b0c0e" />
          </group>
          <Sphere radius={0.009} segments={8} scale={[1, 1, 0.5]} position={[0.02, 1.05, surfaceZ(rings, 0.02, 1.05) + 0.005]} color={SATIN} />
          <Belt rings={rings} />
        </>
      )}

      {/* ---- Truyền thống ---- */}

      {(outfit === 'ao-dai' || outfit === 'ao-dai-nu') && (
        <>
          {/* Áo dài nữ: thân ôm, cổ đứng, cổ chéo cài xuống nách, hai tà trước và sau rủ tới gần mắt cá. */}
          <StandCollar shape={shape} color={shade(top, 0.25)} />
          <SurfaceLine rings={rings} from={[-0.015, 1.45]} to={[-(shape.chestA - 0.012), 1.31]} width={0.008} thick={0.004} lift={0.002} color="#e3d08c" />
          <AoDaiPanels shape={shape} rings={panelRings} halfW={hipA * 0.74} color={top} trim={shade(top, 0.3)} />
        </>
      )}

      {outfit === 'ao-dai-nam' && (
        <>
          {/* Áo dài nam: cổ đứng, cài cúc vàng chéo từ cổ xuống nách phải, hai tà thẳng, viền vàng ở gấu. */}
          <StandCollar shape={shape} color={shade(top, 0.12)} />
          {[0.15, 0.38, 0.61, 0.84].map((t) => {
            const x = -0.015 - (shape.chestA - 0.027) * t;
            const y = 1.45 - 0.14 * t;
            return <Sphere key={t} radius={0.008} segments={8} position={[x, y, surfaceZ(rings, x, y) + 0.005]} color={GOLD} metallic />;
          })}
          <AoDaiPanels shape={shape} rings={panelRings} halfW={hipA * 0.93} color={top} trim={GOLD} trimMetallic />
          <Loft rings={rings} y0={1.15} y1={1.17} inflate={0.003} color={GOLD} metallic />
        </>
      )}

      {outfit === 'ao-ba-ba' && (
        <>
          {/* Áo bà ba: cổ tròn thấp, cài cúc vải giữa thân, tà ngắn phủ hông, hai túi vá, tay rộng. */}
          <CrewNeck shape={shape} color={shade(top, 0.2)} tube={0.01} />
          <SurfaceLine rings={rings} from={[0, 1.44]} to={[0, 0.87]} width={0.006} thick={0.003} lift={0.001} inflate={topInflate} steps={5} color={shade(top, -0.3)} />
          <ShirtButtons rings={rings} count={5} color={shade(top, -0.25)} inflate={topInflate} />
          {[-1, 1].map((side) => (
            <OnBody key={side} rings={rings} x={side * 0.1} y={0.95} inflate={topInflate}>
              <Box size={[0.075, 0.085, 0.006]} color={shade(top, -0.1)} />
            </OnBody>
          ))}
        </>
      )}
    </>
  );
}

export interface FallbackShoeProps {
  style: ShoeStyle;
  shape: BodyShape;
}

/** Mũi giày hướng về +Z. Màu da giày đen theo REAL_OFFICE_STYLE mục 6. */
const OXFORD_BLACK = '#17191d';

/**
 * Giày trong hệ tọa độ của chân (gốc tại hông, đất ở y = -HIP_Y). Đế chạm đất khi chân ở tư thế nghỉ.
 * Bàn chân dài khoảng 0,24 m (giày 0,255 m gốc), gót ở sau trục chân khoảng 7 cm. Mũi giày hướng về +Z.
 */
export function FallbackShoe({ style, shape }: FallbackShoeProps) {
  const s = shape.limb;
  const ground = -HIP_Y;
  switch (style) {
    case 'oxford': {
      const toeCap: Vec3 = [0, ground + 0.05, 0.135];
      return (
        <>
          {/* Thân giày bóng (roughness 0,35, clearcoat 0,2), mũi tròn, đế mỏng đậm hơn */}
          <Box size={[0.095 * s, 0.062, 0.2]} position={[0, ground + 0.049, 0.03]} color={OXFORD_BLACK} glossy />
          <Sphere radius={0.047 * s} segments={10} scale={[1, 0.62, 1.1]} position={toeCap} color={OXFORD_BLACK} />
          <Box size={[0.1 * s, 0.018, 0.255]} position={[0, ground + 0.009, 0.06]} color="#0b0c0e" />
        </>
      );
    }
    case 'heels': {
      return (
        <>
          <Box size={[0.085 * s, 0.06, 0.19]} position={[0, ground + 0.045, 0.035]} color="#8e1b3a" />
          <Sphere radius={0.042 * s} segments={10} scale={[1, 0.6, 1.1]} position={[0, ground + 0.035, 0.125]} color="#8e1b3a" />
          <Box size={[0.03, 0.07, 0.03]} position={[0, ground + 0.035, -0.045]} color="#1a1a1a" />
        </>
      );
    }
    case 'sneakers':
      return (
        <>
          <Box size={[0.105 * s, 0.075, 0.255]} position={[0, ground + 0.055, 0.055]} color="#f4f4f4" />
          <Box size={[0.11 * s, 0.026, 0.262]} position={[0, ground + 0.013, 0.055]} color="#333333" />
        </>
      );
  }
}

