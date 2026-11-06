import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { SKIN_TONES, type Appearance } from './appearance';
import { computePose, createPoseScratch, type AvatarAnimation, type AvatarPose } from './animation';
import { sampleEmotePose } from '../emotes/player';
import { FallbackHair } from './fallbackHair';
import { BodyAccessories, HeadAccessories } from './fallbackAccessories';
import {
  FallbackOutfit,
  FallbackShoe,
  outfitBottomColor,
  outfitCuffColor,
  outfitHasCrease,
  outfitHasSkirt,
  outfitImpliedAccessories,
  outfitLegStripe,
  outfitLegWidth,
  outfitShorts,
  outfitSleeve,
  outfitTopColor,
  type SleeveKind,
} from './fallbackOutfit';
import {
  BODY_HEIGHT_SCALE,
  FOREARM,
  HEAD_SCALE,
  HEAD_Y,
  HIP_Y,
  NECK_Z,
  SHIN,
  SHOULDER_Y,
  Segment,
  THIGH,
  UPPER_ARM,
  bodyShapeOf,
  type BodyShape,
} from './fallbackBody';
import { Box, Cylinder, Sphere, Torus, mixHex, shade } from './fallbackParts';

/** Bán kính hộp sọ gốc trước khi scale theo HEAD_SCALE. Phải khớp với FallbackHair (HEAD_RADIUS). */
const HEAD_RADIUS = 0.1;
const SKIN_HEAD_Y_SCALE = 1.12;

/**
 * Đo chiều cao gốc (chưa scale, xem BASE_HEIGHT trong fallbackBody): chân đặt tại y = 0, đỉnh đầu = HEAD_Y +
 * HEAD_RADIUS × 1,12 = 1,712 m, đỉnh tóc ngắn 1,716 m. Đầu cao từ cằm (1,488 m) tới đỉnh là 0,224 m, tức 7,6 đầu.
 * Đầu rộng 0,15 m và sâu 0,19 m nhờ HEAD_SCALE. Chân (khớp hông tới đất) 0,86 m.
 */

/** Ống quần dài từ hông tới gần đất (chừa 2 cm cho giày). */
const TROUSER_LENGTH = HIP_Y - 0.02;

/** Các ref để cập nhật tư thế mỗi khung hình. */
interface PoseRefs {
  root: RefObject<THREE.Group>;
  head: RefObject<THREE.Group>;
  armL: RefObject<THREE.Group>;
  armR: RefObject<THREE.Group>;
  legL: RefObject<THREE.Group>;
  legR: RefObject<THREE.Group>;
  /** Khớp gối (dùng cho tư thế ngồi, nhảy, chạy). */
  kneeL: RefObject<THREE.Group>;
  kneeR: RefObject<THREE.Group>;
}

/** Ghi tư thế vào các group. Không tạo đối tượng mới, không setState. */
function applyPose(refs: PoseRefs, p: AvatarPose): void {
  const { root, head, armL, armR, legL, legR, kneeL, kneeR } = refs;
  if (root.current) {
    root.current.position.y = p.rootY;
    root.current.rotation.y = p.rootRotY;
  }
  if (head.current) {
    head.current.rotation.z = p.headRotZ;
    head.current.rotation.y = p.headRotY + p.neckRotY;
  }
  if (armL.current) {
    armL.current.rotation.x = p.armLX;
    armL.current.rotation.z = p.armLZ;
  }
  if (armR.current) {
    armR.current.rotation.x = p.armRX;
    armR.current.rotation.z = p.armRZ;
  }
  if (legL.current) legL.current.rotation.x = p.legLX;
  if (legR.current) legR.current.rotation.x = p.legRX;
  if (kneeL.current) kneeL.current.rotation.x = p.kneeLX;
  if (kneeR.current) kneeR.current.rotation.x = p.kneeRX;
}

interface ArmProps {
  pivotRef: RefObject<THREE.Group>;
  /** 1 là tay trái nhân vật (x dương), -1 là tay phải. */
  side: 1 | -1;
  shape: BodyShape;
  sleeve: SleeveKind;
  sleeveColor: string;
  skinColor: string;
  showWatch: boolean;
  showCufflink: boolean;
  /** Màu bo tay áo, nếu có (polo xanh đậm, cardigan). */
  cuffColor?: string;
}

/**
 * Một cánh tay: mỏm vai tròn, cánh tay trên 0,29, cẳng tay 0,26, bàn tay 0,18 (m gốc), tay áo và phụ kiện cổ tay.
 * Gốc tại khớp vai, nhận góc xoay của animation. Bên trong có một group dạng tay ra nhẹ (shape.abduct)
 * để tay thả không xuyên hông; group này cố định nên rig không đổi.
 */
function Arm({ pivotRef, side, shape, sleeve, sleeveColor, skinColor, showWatch, showCufflink, cuffColor }: ArmProps) {
  const { upperArmR: ur, forearmR: fr, wristR: wr, handW } = shape;
  const elbowY = -UPPER_ARM;
  const wristY = -(UPPER_ARM + FOREARM);
  const elbowR = ur * 0.8;
  // Bắp tay dưới khuỷu to nhất, cách khuỷu 7 cm.
  const forearmTopY = elbowY - 0.07;
  // Tay áo: dài dừng trên cổ tay 1,5 cm, rộng (bà ba) phủ qua cổ tay.
  const ease = sleeve === 'wide' ? 0.02 : 0.009;
  const cuffY = sleeve === 'wide' ? wristY - 0.01 : wristY + 0.015;
  const sleeveTopR = ur + ease;
  const sleeveElbowR = elbowR + ease + 0.002;
  const sleeveCuffR = wr + ease + (sleeve === 'wide' ? 0.014 : 0.004);
  const shortEnd = -0.15;
  const shortEndR = ur + (elbowR - ur) * (-shortEnd / UPPER_ARM) + ease + 0.004;
  const sleeveEnd = sleeve === 'short' ? shortEnd : cuffY;
  const sleeveEndR = sleeve === 'short' ? shortEndR : sleeveCuffR;
  // Bàn tay thả tự nhiên: lòng bàn tay hướng vào đùi, nên bề ngang bàn tay nằm theo trục Z, ngón cái phía trước.
  const handK = handW / 0.086;
  const inward = -side;

  return (
    <group ref={pivotRef} position={[side * shape.armX, SHOULDER_Y, 0]}>
      <group rotation={[0, 0, side * shape.abduct]}>
        {/* Mỏm vai tròn nối thân với tay, cùng màu tay áo */}
        <Sphere radius={Math.max(ur * 1.15, sleeveTopR)} segments={12} scale={[1, 1, 0.95]} position={[0, -0.014, 0]} color={sleeveColor} />

        {/* Cánh tay trên thon về khuỷu, khuỷu tròn, cẳng tay to dưới khuỷu rồi thon về cổ tay */}
        <Cylinder radiusTop={ur} radiusBottom={elbowR} height={UPPER_ARM} position={[0, -UPPER_ARM / 2, 0]} color={skinColor} />
        <Sphere radius={elbowR} segments={10} position={[0, elbowY, 0]} color={skinColor} />
        <Cylinder radiusTop={elbowR} radiusBottom={fr} height={elbowY - forearmTopY} position={[0, (elbowY + forearmTopY) / 2, 0]} color={skinColor} />
        <Cylinder radiusTop={fr} radiusBottom={wr} height={forearmTopY - wristY} position={[0, (forearmTopY + wristY) / 2, 0]} color={skinColor} />

        {/* Bàn tay: lòng bàn tay, bốn ngón khép hơi cong vào trong, ngón cái phía trước */}
        <Sphere radius={1} segments={10} scale={[0.017 * handK, 0.052, handW / 2]} position={[inward * 0.002, wristY - 0.048, 0.004]} color={skinColor} />
        <Sphere radius={1} segments={10} scale={[0.012 * handK, 0.05, (handW / 2) * 0.86]} rotation={[0, 0, -side * 0.1]} position={[inward * 0.006, wristY - 0.13, -0.002]} color={skinColor} />
        <Sphere radius={1} segments={8} scale={[0.011 * handK, 0.03, 0.011 * handK]} rotation={[-0.35, 0, 0]} position={[inward * 0.008, wristY - 0.06, (handW / 2) * 0.92]} color={skinColor} />

        {sleeve === 'short' && (
          <Cylinder radiusTop={sleeveTopR} radiusBottom={shortEndR} height={-shortEnd} position={[0, shortEnd / 2, 0]} color={sleeveColor} />
        )}
        {sleeve !== 'short' && (
          <>
            <Cylinder radiusTop={sleeveTopR} radiusBottom={sleeveElbowR} height={UPPER_ARM} position={[0, -UPPER_ARM / 2, 0]} color={sleeveColor} />
            <Cylinder radiusTop={sleeveElbowR} radiusBottom={sleeveCuffR} height={elbowY - cuffY} position={[0, (elbowY + cuffY) / 2, 0]} color={sleeveColor} />
          </>
        )}

        {cuffColor && (
          <Cylinder
            radiusTop={sleeveEndR * 1.03}
            radiusBottom={sleeveEndR * 1.03}
            height={0.025}
            position={[0, sleeveEnd + 0.0125, 0]}
            color={cuffColor}
          />
        )}

        {showCufflink && sleeve !== 'short' && (
          <Sphere radius={0.005} segments={8} position={[0, cuffY + 0.012, sleeveCuffR + 0.003]} color="#c9a227" metallic />
        )}
        {showWatch && (
          <>
            {/* Dây đồng hồ ngay dưới măng sét, mặt đồng hồ ở mu cổ tay (phía ngoài) */}
            <Torus radius={wr + 0.006} tube={0.005} rotation={[Math.PI / 2, 0, 0]} position={[0, wristY + 0.008, 0]} color="#c0c0c0" metallic />
            <Cylinder radiusTop={0.017} radiusBottom={0.017} height={0.006} rotation={[0, 0, Math.PI / 2]} position={[side * (wr + 0.009), wristY + 0.008, 0]} color="#c0c0c0" metallic />
          </>
        )}
      </group>
    </group>
  );
}

interface LegProps {
  pivotRef: RefObject<THREE.Group>;
  /** Khớp gối: mọi phần dưới gối (cẳng chân, ống quần dưới, giày) xoay quanh đây. */
  kneeRef: RefObject<THREE.Group>;
  side: 1 | -1;
  shape: BodyShape;
  widthFactor: number;
  color: string;
  /** true: chân trần (dưới váy hoặc quần short), vẽ dáng đùi, gối, bắp chân thật. */
  bare: boolean;
  shoes: Appearance['shoes'];
  /** true: vẽ nếp ly mảnh ở mặt trước ống quần. */
  crease?: boolean;
  /** Quần short: phủ phần trên đùi, chân dưới để trần. */
  shorts?: { color: string; length: number };
  /** Màu sọc dọc ngoài ống quần. */
  stripeColor?: string;
}

/**
 * Một chân, gốc tại khớp hông. Đùi 0,43 thon dần về gối, cẳng chân 0,37 tới mắt cá (cách đất 0,06), rồi giày.
 * Chân trần có bắp chân; quần dài là hai ống nón cụt nối ở gối, ống đứng.
 */
function Leg({ pivotRef, kneeRef, side, shape, widthFactor, color, bare, shoes, crease = false, shorts, stripeColor }: LegProps) {
  const { thighR, kneeR, calfR, ankleR } = shape;
  const kneeY = -THIGH;
  const ankleY = -(THIGH + SHIN);
  const calfY = kneeY - 0.11;
  // Ống quần: rộng ở đùi, đứng từ gối xuống. Quần ống rộng (áo dài, bà ba) loe thêm ở gấu.
  const wf = widthFactor;
  const tTop = thighR * 1.06 * wf;
  const tKnee = (kneeR + 0.016) * wf;
  const tHem = (kneeR + 0.012) * (wf > 1.1 ? wf * 1.08 : wf);
  const hemY = -TROUSER_LENGTH;

  return (
    <group ref={pivotRef} position={[side * shape.legX, HIP_Y, 0]}>
      {bare ? (
        <>
          <Sphere radius={thighR} segments={12} color={color} />
          <Cylinder radiusTop={thighR} radiusBottom={kneeR * 1.04} height={THIGH} position={[0, -THIGH / 2, 0]} color={color} />
        </>
      ) : (
        <>
          <Sphere radius={tTop} segments={12} color={color} />
          <Cylinder radiusTop={tTop} radiusBottom={tKnee} height={THIGH} position={[0, -THIGH / 2, 0]} color={color} />
        </>
      )}
      {shorts && (
        <>
          <Sphere radius={thighR * 1.12} segments={12} color={shorts.color} />
          <Cylinder
            radiusTop={thighR * 1.12}
            radiusBottom={(thighR + (kneeR - thighR) * (shorts.length / THIGH)) * 1.15}
            height={shorts.length}
            position={[0, -shorts.length / 2, 0]}
            color={shorts.color}
          />
        </>
      )}
      {!bare && stripeColor && (
        <Segment from={[side * (tTop + 0.002), -0.03, 0]} to={[side * (tKnee + 0.002), kneeY, 0]} width={0.006} thick={0.03} color={stripeColor} />
      )}
      {!bare && crease && (
        <Segment from={[0, -0.03, tTop + 0.001]} to={[0, kneeY, tKnee + 0.001]} width={0.007} thick={0.004} color={shade(color, 0.14)} />
      )}
      {/* Khớp gối. Group trong bù lại kneeY nên các phần dưới giữ nguyên tọa độ theo khớp hông như trước. */}
      <group ref={kneeRef} position={[0, kneeY, 0]}>
        <group position={[0, -kneeY, 0]}>
          {bare ? (
            <>
              <Sphere radius={kneeR * 1.04} segments={10} position={[0, kneeY, 0.004]} color={color} />
              <Cylinder radiusTop={kneeR} radiusBottom={calfR} height={kneeY - calfY} position={[0, (kneeY + calfY) / 2, -0.008]} color={color} />
              <Cylinder radiusTop={calfR} radiusBottom={ankleR} height={calfY - ankleY} position={[0, (calfY + ankleY) / 2, -0.008]} color={color} />
              <Sphere radius={ankleR} segments={8} position={[0, ankleY, -0.004]} color={color} />
            </>
          ) : (
            <>
              {/* Nối gối để ống quần không hở khi gập. */}
              <Sphere radius={tKnee} segments={10} position={[0, kneeY, 0]} color={color} />
              <Cylinder radiusTop={tKnee} radiusBottom={tHem} height={hemY - kneeY} position={[0, (kneeY + hemY) / 2, 0]} color={color} />
            </>
          )}
          {!bare && stripeColor && (
            <Segment from={[side * (tKnee + 0.002), kneeY, 0]} to={[side * (tHem + 0.002), hemY + 0.02, 0]} width={0.006} thick={0.03} color={stripeColor} />
          )}
          {!bare && crease && (
            <Segment from={[0, kneeY, tKnee + 0.001]} to={[0, hemY + 0.01, tHem + 0.001]} width={0.007} thick={0.004} color={shade(color, 0.14)} />
          )}
          <FallbackShoe style={shoes} shape={shape} />
        </group>
      </group>
    </group>
  );
}

export interface FallbackAvatarProps {
  appearance: Appearance;
  /** Tên in trên thẻ tên, nếu có. */
  displayName?: string;
  /** Hoạt ảnh đang chạy. Mặc định là idle. */
  animation?: AvatarAnimation;
  /**
   * true: tư thế lấy từ bộ phát emote khi đang có emote (chỉ truyền cho nhân vật của chính người chơi,
   * vì bộ phát emote là của riêng họ). Mặc định false.
   */
  emote?: boolean;
}

/**
 * Nhân vật dự phòng bằng hình học, cao 1,60 m (slim, dáng nữ), 1,70 m (regular, dáng nam) hoặc 1,74 m (broad),
 * chân đặt tại y = 0. Dùng khi không có file mô hình. Mặt hướng về +Z. Số đo thân ở fallbackBody.
 */
export function FallbackAvatar({ appearance, displayName, animation = 'idle', emote = false }: FallbackAvatarProps) {
  const scratch = useMemo(createPoseScratch, []);
  const shape = bodyShapeOf(appearance.bodyType);
  const skin = SKIN_TONES[appearance.skinTone];
  const outfit = appearance.outfit;
  const sleeve = outfitSleeve(outfit);
  // Váy: chân để trần (có thể đi tất), không có quần.
  const bottomColor = outfitBottomColor(outfit, appearance.bottomColor);
  const topColor = outfitTopColor(outfit, appearance.topColor);
  const shorts = outfitShorts(outfit, bottomColor);
  const bare = outfitHasSkirt(outfit) || shorts !== undefined;
  const legColor = bare ? skin : bottomColor;
  const heightScale = BODY_HEIGHT_SCALE[appearance.bodyType];
  const legWidth = outfitLegWidth(outfit);
  // Một số bộ kèm sẵn phụ kiện (polo có dây đeo thẻ). Gộp vào danh sách người dùng chọn.
  const accessories = useMemo(
    () => Array.from(new Set([...appearance.accessories, ...outfitImpliedAccessories(outfit)])),
    [appearance.accessories, outfit],
  );
  const hasWatch = accessories.includes('watch');
  const hasCufflinks = accessories.includes('cufflinks');
  const cuffColor = outfitCuffColor(outfit);
  const crease = outfitHasCrease(outfit);
  const stripeColor = outfitLegStripe(outfit);
  const lip = mixHex(skin, '#a8454f', 0.5);
  const noseColor = shade(skin, -0.06);

  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const legLRef = useRef<THREE.Group>(null);
  const legRRef = useRef<THREE.Group>(null);
  const kneeLRef = useRef<THREE.Group>(null);
  const kneeRRef = useRef<THREE.Group>(null);

  const refs: PoseRefs = {
    root: rootRef,
    head: headRef,
    armL: armLRef,
    armR: armRRef,
    legL: legLRef,
    legR: legRRef,
    kneeL: kneeLRef,
    kneeR: kneeRRef,
  };

  useFrame((state) => {
    applyPose(refs, emote && sampleEmotePose(scratch) ? scratch : computePose(animation, state.clock.elapsedTime));
  });

  const armProps = { shape, sleeve, sleeveColor: topColor, skinColor: skin, showCufflink: hasCufflinks, cuffColor };
  const legProps = {
    shape,
    widthFactor: legWidth,
    color: legColor,
    bare,
    shoes: appearance.shoes,
    crease,
    shorts,
    stripeColor,
  };

  return (
    <group scale={heightScale}>
    <group ref={rootRef}>
      <FallbackOutfit outfit={outfit} topColor={appearance.topColor} bottomColor={appearance.bottomColor} shape={shape} />

      {/* Cổ: hơi loe ở chân, lùi nhẹ ra sau; phần lộ ra giữa vai và hàm khoảng 8 cm */}
      <Cylinder
        radiusTop={shape.neckR * 0.95}
        radiusBottom={shape.neckR * 1.06}
        height={0.14}
        position={[0, 1.49, NECK_Z]}
        color={skin}
      />

      <BodyAccessories accessories={accessories} displayName={displayName} shape={shape} />

      <Arm pivotRef={armLRef} side={1} showWatch={hasWatch} {...armProps} />
      <Arm pivotRef={armRRef} side={-1} showWatch={false} {...armProps} />

      <Leg pivotRef={legLRef} kneeRef={kneeLRef} side={1} {...legProps} />
      <Leg pivotRef={legRRef} kneeRef={kneeRRef} side={-1} {...legProps} />

      {/* Đầu: group riêng để có thể nghiêng. Group con co hộp sọ, mặt và tóc về rộng 0,15, sâu 0,19. */}
      <group ref={headRef} position={[0, HEAD_Y, 0]}>
        <group scale={HEAD_SCALE}>
          <Sphere radius={HEAD_RADIUS} segments={20} scale={[1, SKIN_HEAD_Y_SCALE, 1]} color={skin} />

          {/* Hàm và cằm thon (đáy cằm ngang đáy đầu), tai, mũi */}
          <Sphere radius={0.055} segments={14} scale={[1.05, 0.9, 0.95]} position={[0, -0.066, 0.03]} color={skin} />
          {[-1, 1].map((side) => (
            <Sphere key={`ear-${side}`} radius={0.02} segments={8} scale={[0.6, 1.15, 0.8]} position={[0.099 * side, -0.004, -0.004]} color={skin} />
          ))}
          <Sphere radius={0.012} segments={8} scale={[1, 1.25, 1.1]} position={[0, -0.018, 0.099]} color={noseColor} />

          {/* Mắt: lòng trắng, mống mắt, mí trên mảnh, lông mày hơi nghiêng. Hai tâm mắt cách nhau khoảng 6,3 cm. */}
          {[-1, 1].map((side) => (
            <group key={`eye-${side}`}>
              {/* Lòng trắng và mí xoay theo độ cong mặt để đuôi mắt không nhô khỏi đầu */}
              <Sphere radius={0.0185} segments={10} scale={[1, 0.62, 0.45]} rotation={[0, side * 0.42, 0]} position={[0.042 * side, 0, 0.0895]} color="#f4f0ea" />
              <Sphere radius={0.0095} segments={8} scale={[1.2, 1, 0.5]} position={[0.042 * side, 0, 0.0955]} color={appearance.eyeColor} />
              <Box size={[0.042, 0.004, 0.006]} rotation={[0, side * 0.42, 0]} position={[0.042 * side, 0.012, 0.0925]} color={shade(appearance.hairColor, -0.2)} />
            </group>
          ))}
          {[-1, 1].map((side) => (
            <Box
              key={`brow-${side}`}
              size={[0.046, 0.008, 0.01]}
              position={[0.042 * side, 0.027, 0.0895]}
              rotation={[0, side * 0.42, 0.08 * side]}
              color={appearance.hairColor}
            />
          ))}

          {/* Môi trên mỏng, môi dưới đầy hơn, màu pha từ màu da */}
          <Sphere radius={0.011} segments={8} scale={[2.5, 0.5, 0.7]} position={[0, -0.046, 0.0915]} color={lip} />
          <Sphere radius={0.012} segments={8} scale={[2.25, 0.6, 0.7]} position={[0, -0.053, 0.0905]} color={shade(lip, 0.06)} />

          <FallbackHair style={appearance.hairStyle} color={appearance.hairColor} />
        </group>
        {/* Kính và mũ đặt ngoài group co để tròng kính tròn, không bị bóp méo */}
        <HeadAccessories accessories={accessories} />
      </group>
    </group>
    </group>
  );
}
