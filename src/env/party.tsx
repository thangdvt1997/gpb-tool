// Trang trí lễ hội theo chủ đề: dây đèn (TubeGeometry và các bóng đèn nhỏ phát sáng),
// đèn lồng, bóng bay và băng rôn treo.
// theme: 'tet' (đèn lồng đỏ, vàng), 'midautumn' (đèn lồng cam, vàng), 'party' (bóng bay nhiều màu), 'none' (không vẽ gì).
// Gốc = tâm khu trên sàn. Khu mặc định 20 x 12 m. Mọi độ cao tính từ sàn.
// Khoảng 7 draw call cố định. Bóng đèn và đèn lồng dùng chung một InstancedMesh phát sáng (MeshBasicMaterial).

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  canvasTexture,
  DecorBase,
  Disposable,
  fitFont,
  Inst,
  instanced,
  makeRng,
  pick,
  UNIT_PLANE,
  UNIT_CYL,
  UNIT_SPHERE,
  useDisposeOnChange,
} from './shared';

export type PartyTheme = 'tet' | 'midautumn' | 'party' | 'none';

export interface PartyDecorProps extends DecorBase {
  /** Chủ đề. 'none' không vẽ gì. */
  theme?: PartyTheme;
  /** Chiều x của khu trang trí (m). Mặc định 20. */
  width?: number;
  /** Chiều z của khu trang trí (m). Mặc định 12. */
  depth?: number;
  seed?: number;
}

type ActiveTheme = Exclude<PartyTheme, 'none'>;

interface ThemeCfg {
  lanterns: string[];
  bulbs: string[];
  balloons: string[];
  bannerBg: string;
  bannerText: string;
  bannerLabel: string;
}

const CFG: Record<ActiveTheme, ThemeCfg> = {
  tet: {
    lanterns: ['#d7263d', '#f4c430', '#ff7f50'],
    bulbs: ['#ffd23f', '#ff4d4d'],
    balloons: [],
    bannerBg: '#b91c1c',
    bannerText: '#fde68a',
    bannerLabel: 'CHÚC MỪNG NĂM MỚI',
  },
  midautumn: {
    lanterns: ['#f4a261', '#e76f51', '#e9c46a'],
    bulbs: ['#ffd27a', '#ffb347'],
    balloons: [],
    bannerBg: '#c2410c',
    bannerText: '#fff7ed',
    bannerLabel: 'TRUNG THU VUI VẺ',
  },
  party: {
    lanterns: [],
    bulbs: ['#f472b6', '#22d3ee', '#facc15', '#a3e635'],
    balloons: ['#f43f5e', '#22d3ee', '#facc15', '#a78bfa', '#34d399'],
    bannerBg: '#4c1d95',
    bannerText: '#facc15',
    bannerLabel: 'GIAO LƯU VĂN NGHỆ',
  },
};

const GOLD = '#c9a227';
const ROPE = '#374151';
const WIRE = '#1f2937';
const NO_OWNED: Disposable[] = [];

// Đèn lồng: bán kính 0,15 m, nửa chiều cao 0,18 m, nắp Ø 0,12 m, treo 0,45 m dưới dây.
const LANTERN_R = 0.15;
const LANTERN_H = 0.18;
const LANTERN_HANG = 0.45;

/** Băng rôn: nền màu, viền mảnh và dòng chữ căn giữa. */
function drawBanner(bg: string, fg: string, label: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, label, w - 100, 120);
    ctx.fillText(label, w / 2, h / 2);
  };
}

interface Built {
  meshes: THREE.InstancedMesh[];
  wires: THREE.TubeGeometry[];
  wireMat: THREE.MeshBasicMaterial;
  bannerMat: THREE.MeshBasicMaterial;
  owned: Disposable[];
}

function buildParty(theme: ActiveTheme, width: number, depth: number, seed: number): Built {
  const rng = makeRng(seed);
  const cfg = CFG[theme];
  const glow: Inst[] = [];
  const cyl: Inst[] = [];
  const balloons: Inst[] = [];
  const wires: THREE.TubeGeometry[] = [];

  // Ba dây đèn song song dọc trục x, võng ở giữa. Mỗi dây có 24 bóng đèn nhỏ.
  const top = 2.6;
  const sag = 2.15;
  for (let i = 0; i < 3; i++) {
    const z = -depth / 2 + 1 + (i * (depth - 2)) / 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-width / 2, top, z),
      new THREE.Vector3(0, sag, z),
      new THREE.Vector3(width / 2, top, z),
    ]);
    wires.push(new THREE.TubeGeometry(curve, 48, 0.008, 6, false));
    for (let k = 0; k < 24; k++) {
      const p = curve.getPointAt((k + 0.5) / 24);
      glow.push({ p: [p.x, p.y - 0.04, p.z], s: [0.05, 0.05, 0.05], c: cfg.bulbs[k % cfg.bulbs.length] });
    }

    // Đèn lồng treo dưới dây (chỉ chủ đề có đèn lồng). Dây treo nối từ dây đèn xuống nắp trên.
    if (cfg.lanterns.length > 0) {
      for (let k = 0; k < 4; k++) {
        const p = curve.getPointAt((k + 1) / 5);
        const yc = p.y - LANTERN_HANG;
        glow.push({ p: [p.x, yc, p.z], s: [LANTERN_R, LANTERN_H, LANTERN_R], c: pick(rng, cfg.lanterns) });
        cyl.push({ p: [p.x, yc + LANTERN_H + 0.015, p.z], s: [0.06, 0.03, 0.06], c: GOLD });
        cyl.push({ p: [p.x, yc - LANTERN_H - 0.015, p.z], s: [0.06, 0.03, 0.06], c: GOLD });
        const ropeLen = p.y - (yc + LANTERN_H + 0.03);
        cyl.push({ p: [p.x, p.y - ropeLen / 2, p.z], s: [0.003, ropeLen, 0.003], c: ROPE });
      }
    }
  }

  // Bóng bay (chỉ chủ đề party): quả Ø 0,36 m, dây dài 0,45 m dưới quả.
  if (cfg.balloons.length > 0) {
    for (let k = 0; k < 14; k++) {
      const x = (rng() - 0.5) * width * 0.9;
      const z = (rng() - 0.5) * depth * 0.9;
      const y = 1.9 + rng() * 0.9;
      balloons.push({ p: [x, y, z], s: [0.18, 0.22, 0.18], c: pick(rng, cfg.balloons) });
      cyl.push({ p: [x, y - 0.22 - 0.225, z], s: [0.002, 0.45, 0.002], c: ROPE });
    }
  }

  const cylMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial();
  const balloonMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0 });
  const wireMat = new THREE.MeshBasicMaterial({ color: WIRE });
  const bannerTex = canvasTexture(1024, 256, drawBanner(cfg.bannerBg, cfg.bannerText, cfg.bannerLabel));
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });

  const meshes = [
    instanced(UNIT_CYL, cylMat, cyl),
    instanced(UNIT_SPHERE, glowMat, glow),
    instanced(UNIT_SPHERE, balloonMat, balloons),
  ].filter((m): m is THREE.InstancedMesh => m !== null);

  const owned: Disposable[] = [cylMat, glowMat, balloonMat, wireMat, bannerTex, bannerMat, ...wires];
  return { meshes, wires, wireMat, bannerMat, owned };
}

/** Trang trí chủ đề lễ hội. Trả về null khi theme là 'none'. */
export function PartyDecor({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  theme = 'none',
  width = 20,
  depth = 12,
  seed = 9,
}: PartyDecorProps) {
  const built = useMemo(
    () => (theme === 'none' ? null : buildParty(theme, width, depth, seed)),
    [theme, width, depth, seed],
  );
  useDisposeOnChange(built ? built.owned : NO_OWNED);
  if (!built) return null;
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.wires.map((g, i) => (
        <mesh key={i} geometry={g} material={built.wireMat} />
      ))}
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <mesh geometry={UNIT_PLANE} material={built.bannerMat} position={[0, 2.3, -depth / 2 + 0.2]} scale={[3.6, 0.9, 1]} />
    </group>
  );
}
