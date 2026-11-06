import { Box, Cylinder, Sphere, Torus, type Vec3 } from './fallbackParts';
import type { HairStyle } from './appearance';

/** Bán kính đầu (mét). Khớp với FallbackAvatar. */
const HEAD_RADIUS = 0.1;

/** Nắp tóc: nửa cầu phủ trên đầu. thetaLength càng nhỏ thì đường chân tóc càng cao. */
function HairCap({
  color,
  scale,
  thetaLength,
}: {
  color: string;
  scale: Vec3;
  thetaLength: number;
}) {
  return <Sphere radius={HEAD_RADIUS} thetaLength={thetaLength} scale={scale} color={color} />;
}

/** Phần gáy và sau tai: nắp cầu thấp hơn, lùi ra sau để không che mặt. */
function Nape({ color }: { color: string }) {
  return <Sphere radius={HEAD_RADIUS} thetaLength={Math.PI * 0.62} scale={[1.02, 1.1, 1.04]} position={[0, -0.004, -0.02]} color={color} />;
}

/** Tóc mai hai bên thái dương. */
function Sideburns({ color }: { color: string }) {
  return (
    <>
      <Box size={[0.014, 0.05, 0.026]} position={[-0.097, -0.002, 0.03]} color={color} />
      <Box size={[0.014, 0.05, 0.026]} position={[0.097, -0.002, 0.03]} color={color} />
    </>
  );
}

/** Tạo n điểm trên vỏ đầu phía sau và trên đỉnh (z không dương), để gắn các búi tóc xoăn. */
function buildCurlyPoints(count: number): Vec3[] {
  const shellRadius = HEAD_RADIUS + 0.012;
  const golden = 2.399963;
  const points: Vec3[] = [];
  for (let i = 0; points.length < count && i < count * 4; i++) {
    const phi = 0.45 + ((i * 0.37) % 1.3); // độ cao từ đỉnh đầu xuống, trong khoảng 0.45 đến 1.75 rad
    const theta = i * golden;
    const x = shellRadius * Math.sin(phi) * Math.cos(theta);
    const y = shellRadius * Math.cos(phi) * 1.12;
    const z = shellRadius * Math.sin(phi) * Math.sin(theta);
    if (z <= 0.02) points.push([x, y, z]);
  }
  return points;
}

/** Vị trí các búi tóc xoăn. Tính một lần khi nạp module. */
const CURLY_POINTS: readonly Vec3[] = buildCurlyPoints(18);

/** Góc đặt các chóp tóc dựng quanh đỉnh đầu. */
const SPIKE_ANGLES: readonly number[] = [0, 1.05, 2.1, 3.14, 4.19, 5.24];

export interface FallbackHairProps {
  style: HairStyle;
  color: string;
}

/**
 * Tóc cho nhân vật dự phòng. Đặt bên trong group của đầu, gốc tọa độ là tâm đầu.
 * Mặt nhìn về phía +Z, nên phần sau đầu nằm ở z âm.
 */
export function FallbackHair({ style, color }: FallbackHairProps) {
  switch (style) {
    case 'short':
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          <Nape color={color} />
          <Sideburns color={color} />
        </>
      );

    case 'buzz':
      // Lớp mỏng sát đầu.
      return (
        <>
          <HairCap color={color} scale={[1.03, 1.1, 1.03]} thetaLength={Math.PI * 0.42} />
          <Sideburns color={color} />
        </>
      );

    case 'bob':
      // Tóc bob: nắp tóc cộng nửa trụ cong ở sau đầu, dài ngang vai.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          <Cylinder
            radiusTop={0.11}
            radiusBottom={0.115}
            height={0.2}
            thetaStart={Math.PI / 2}
            thetaLength={Math.PI}
            position={[0, -0.06, -0.01]}
            color={color}
          />
        </>
      );

    case 'long':
      // Tóc dài: nắp tóc cộng khối dài sau lưng, rủ xuống quá vai.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          <Box size={[0.24, 0.62, 0.06]} position={[0, -0.2, -0.12]} color={color} />
        </>
      );

    case 'bun':
      // Tóc búi: nắp tóc cộng quả cầu búi phía sau đỉnh đầu.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          <Sphere radius={0.05} position={[0, 0.1, -0.09]} color={color} />
        </>
      );

    case 'spiky':
      // Tóc dựng: nắp tóc cộng các chóp nhọn quanh đỉnh đầu.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          {SPIKE_ANGLES.map((angle, i) => (
            <Cylinder
              key={i}
              radiusTop={0}
              radiusBottom={0.025}
              height={0.09}
              radialSegments={6}
              position={[0.05 * Math.cos(angle), 0.12, 0.05 * Math.sin(angle)]}
              color={color}
            />
          ))}
        </>
      );

    case 'curly':
      // Tóc xoăn: nắp tóc cộng nhiều búi nhỏ phủ phía sau và trên đỉnh.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          {CURLY_POINTS.map((p, i) => (
            <Sphere key={i} radius={0.034} segments={8} position={p} color={color} />
          ))}
        </>
      );

    case 'ponytail':
      // Tóc buộc đuôi ngựa: nắp tóc, dây buộc và đuôi tóc rủ phía sau.
      return (
        <>
          <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />
          <Cylinder
            radiusTop={0.02}
            radiusBottom={0.035}
            height={0.3}
            position={[0, -0.08, -0.12]}
            rotation={[0.25, 0, 0]}
            color={color}
          />
          <Torus
            radius={0.02}
            tube={0.007}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0.07, -0.115]}
            color="#c2185b"
          />
        </>
      );

    default: {
      // Không bao giờ tới đây khi style đúng kiểu. Trả về nắp tóc để đề phòng dữ liệu lạ.
      const unreachable: never = style;
      return <HairCap color={color} scale={[1.08, 1.16, 1.08]} thetaLength={Math.PI * 0.4} />;
    }
  }
}
