/**
 * Khớp mũ lên đầu thật: từ đỉnh vùng đầu của mesh thân, tính chuỗi vòng elip (ngoài cùng) ôm sọ với lề an toàn,
 * rồi mũ nở thêm theo kiểu (lưỡi trai, mũ len, tai bèo, mũ nồi, mũ tiệc). Thuần, không phụ thuộc three.
 * Mọi vòng luôn chứa sọ cộng lề nên mũ không bao giờ lún vào đầu; test kiểm bằng đỉnh đầu của ba tệp GLB.
 */
import { headSlice, type HeadFrame, type V3 } from './accessoryMeasure';
import type { BodyData, Classification } from './regions';
import type { HatKind } from './accessoryPlan';

export interface HatRing {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}

export interface HatFit {
  kind: HatKind;
  /** Mép dưới của mũ. */
  baseY: number;
  /** Đỉnh mũ (vòng cuối có bán kính 0). */
  apexY: number;
  /** Từ mép dưới lên đỉnh. */
  rings: HatRing[];
  /** Độ dày vỏ (m). */
  thickness: number;
  /** Lề giữa sọ và mặt trong mũ (m). */
  margin: number;
  head: HeadFrame;
}

/** Vị trí mép dưới theo tỉ lệ chiều cao đầu tính từ đáy vùng đầu. */
const BASE_FRAC: Readonly<Record<HatKind, number>> = { cap: 0.67, beanie: 0.61, bucket: 0.64, beret: 0.67, party: 0.68 };

const RING_COUNT = 14;

/** Nở thêm (m) so với sọ + lề tại tỉ lệ s (0 mép dưới, 1 đỉnh sọ), cho từng kiểu. */
function extraRadius(kind: HatKind, s: number, H: number): number {
  switch (kind) {
    case 'cap':
      return 0.012 * H * (1 - s);
    case 'beanie':
      return 0.02 * H * (1 - s * 0.5);
    case 'bucket':
      return 0.03 * H;
    case 'beret':
      return H * 0.26 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.85)), 0.8);
    case 'party':
      return 0;
  }
}

export function fitHat(kind: HatKind, head: HeadFrame, data: BodyData, cls: Classification): HatFit {
  const H = head.height;
  const margin = 0.07 * H;
  const thickness = (kind === 'beanie' ? 0.075 : kind === 'bucket' ? 0.05 : 0.04) * H;
  const baseY = head.minY + BASE_FRAC[kind] * H;
  const skullTop = head.maxY;
  const topPad = kind === 'party' ? H * 1.05 : kind === 'beret' ? 0.1 * H : kind === 'beanie' ? 0.07 * H : 0.04 * H;
  const apexY = skullTop + margin + topPad;
  const band = Math.max(0.0015, H / 9);
  const rings: HatRing[] = [];
  let last: HatRing | null = null;
  let baseR = { rx: 0, rz: 0 };
  for (let j = 0; j <= RING_COUNT; j++) {
    const y = baseY + ((apexY - baseY) * j) / RING_COUNT;
    const sk = y <= skullTop ? headSlice(data, cls, y, band) : { rx: 0, rz: 0, cx: 0, cz: 0, count: 0 };
    const s = Math.min(1, (y - baseY) / Math.max(1e-6, skullTop - baseY));
    let cx = sk.count ? sk.cx : (last?.cx ?? head.cx);
    let cz = sk.count ? sk.cz : (last?.cz ?? head.cz);
    let rx = sk.count ? sk.rx + margin : 0;
    let rz = sk.count ? sk.rz + margin : 0;
    if (j === 0) baseR = { rx, rz };
    if (sk.count) {
      const e = extraRadius(kind, s, H);
      rx += e;
      rz += e;
    }
    if (kind === 'party') {
      const f = Math.max(0, 1 - (y - baseY) / (apexY - baseY));
      rx = Math.max(rx, baseR.rx * f);
      rz = Math.max(rz, baseR.rz * f);
      if (!sk.count) {
        cx = last?.cx ?? head.cx;
        cz = last?.cz ?? head.cz;
      }
    } else if (!sk.count && last) {
      // Trên đỉnh sọ: thu tròn dần về đỉnh.
      const k = Math.max(0, 1 - (y - skullTop) / Math.max(1e-6, apexY - skullTop));
      rx = last.rx * Math.sqrt(k) * 0.9;
      rz = last.rz * Math.sqrt(k) * 0.9;
    }
    const r: HatRing = { y, cx, cz, rx: rx + (rx > 0 ? thickness : 0), rz: rz + (rz > 0 ? thickness : 0) };
    if (j === RING_COUNT) {
      r.rx = 0;
      r.rz = 0;
    }
    rings.push(r);
    last = r;
  }
  return { kind, baseY, apexY, rings, thickness, margin, head };
}

/** Elip ngoài của mũ tại độ cao y (nội suy tuyến tính giữa các vòng). null nếu y ngoài khoảng của mũ. */
export function hatRingAt(fit: HatFit, y: number): HatRing | null {
  const r = fit.rings;
  if (y < r[0].y - 1e-9 || y > r[r.length - 1].y + 1e-9) return null;
  for (let i = 0; i < r.length - 1; i++) {
    if (y <= r[i + 1].y + 1e-9) {
      const k = (y - r[i].y) / Math.max(1e-9, r[i + 1].y - r[i].y);
      const m = (a: number, b: number) => a + (b - a) * k;
      return { y, cx: m(r[i].cx, r[i + 1].cx), cz: m(r[i].cz, r[i + 1].cz), rx: m(r[i].rx, r[i + 1].rx), rz: m(r[i].rz, r[i + 1].rz) };
    }
  }
  return r[r.length - 1];
}

/** Điểm (x, y, z) nằm trong vỏ ngoài của mũ (bao gồm cả sọ). */
export function insideHat(fit: HatFit, p: V3): boolean {
  const e = hatRingAt(fit, p[1]);
  if (!e || e.rx <= 0 || e.rz <= 0) return false;
  const dx = (p[0] - e.cx) / e.rx;
  const dz = (p[2] - e.cz) / e.rz;
  return dx * dx + dz * dz <= 1;
}
