// Vẽ bản đồ 2D lên canvas từ MapModel (dữ liệu layout thật). Dùng chung cho minimap và bản đồ lớn.
// Mọi điểm đi qua view.worldToMap, nên chế độ xoay theo người chỉ đổi phép biến đổi, không đổi dữ liệu.

import type { MapCategory, MapModel, Rect, RouteResult, UV, XZ } from './core/index.js';

export interface View {
  worldToMap(x: number, z: number): UV;
  /** pixel trên mét */
  scale: number;
}

export interface DrawOptions {
  model: MapModel;
  view: View;
  width: number;
  height: number;
  player: XZ;
  /** Góc icon nhân vật (iconAngle), theo chiều kim đồng hồ từ lên trên. */
  playerAngle: number;
  /** Góc mũi tên Bắc (northAngle). */
  northAngle: number;
  route: RouteResult | null;
  showRoute: boolean;
  dest: { x: number; z: number; rect?: Rect } | null;
  /** Ẩn nhãn khi thu nhỏ quá (pixel trên mét dưới ngưỡng). */
  labelMinScale?: number;
  highlightId?: string | null;
}

const C = {
  bg: '#0d1220',
  floor: '#1d2436',
  walk: 'rgba(120, 190, 140, 0.16)',
  boundary: 'rgba(140, 200, 255, 0.85)',
  wall: '#c9d3e6',
  room: 'rgba(156, 201, 255, 0.22)',
  roomStroke: '#9cc9ff',
  desk: '#8a6e4b',
  core: '#3b4660',
  amenity: 'rgba(79, 93, 122, 0.8)',
  fixture: '#5b6b8c',
  door: '#2fbf71',
  gate: '#f2b632',
  label: '#e8eefb',
  labelShadow: 'rgba(0, 0, 0, 0.75)',
  route: '#4fb3ff',
  dest: '#ff6b6b',
  player: '#ffd166',
  highlight: '#ffd166',
};

function fillFor(cat: MapCategory): string {
  switch (cat) {
    case 'room':
      return C.room;
    case 'desk':
      return C.desk;
    case 'core':
      return C.core;
    case 'amenity':
      return C.amenity;
    case 'door':
      return C.door;
    case 'gate':
      return C.gate;
    default:
      return C.fixture;
  }
}

function rectPath(ctx: CanvasRenderingContext2D, view: View, r: Rect): void {
  const a = view.worldToMap(r.minX, r.minZ);
  const b = view.worldToMap(r.maxX, r.minZ);
  const c = view.worldToMap(r.maxX, r.maxZ);
  const d = view.worldToMap(r.minX, r.maxZ);
  ctx.moveTo(a.u, a.v);
  ctx.lineTo(b.u, b.v);
  ctx.lineTo(c.u, c.v);
  ctx.lineTo(d.u, d.v);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, u: number, v: number, size: number): void {
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.labelShadow;
  ctx.strokeText(text, u, v);
  ctx.fillStyle = C.label;
  ctx.fillText(text, u, v);
}

/** Mũi tên tam giác tại (u, v), góc a theo chiều kim đồng hồ từ lên trên. */
function arrow(ctx: CanvasRenderingContext2D, u: number, v: number, a: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(u, v);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.65, size * 0.7);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.65, size * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
  ctx.restore();
}

export function drawMap(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const { model, view, width, height } = o;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  // Sàn: chỉ phần chữ L (OFFICE_L_RECTS). Khu ngoài L để trống.
  ctx.beginPath();
  for (const r of model.floor) rectPath(ctx, view, r);
  ctx.fillStyle = C.floor;
  ctx.fill();

  // Khu đi lại: ô của lưới dẫn đường (đã trừ vật cản và clearance nhân vật).
  ctx.beginPath();
  for (const r of model.walkable) rectPath(ctx, view, r);
  ctx.fillStyle = C.walk;
  ctx.fill();

  // Vật thể trong L.
  for (const it of model.items) {
    if (it.category === 'door' || it.category === 'gate' || it.isEntrance) continue;
    ctx.beginPath();
    rectPath(ctx, view, it.rect);
    ctx.fillStyle = fillFor(it.category);
    ctx.fill();
    if (it.category === 'room') {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.roomStroke;
      ctx.stroke();
    }
    if (o.highlightId === it.id) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.highlight;
      ctx.stroke();
    }
  }

  // Tường ngoài thật.
  ctx.beginPath();
  for (const w of model.walls) rectPath(ctx, view, w);
  ctx.fillStyle = C.wall;
  ctx.fill();

  // Cạnh chữ L: đường phạm vi (không phải tường), nét đứt.
  ctx.beginPath();
  model.polygon.forEach(([x, z], i) => {
    const p = view.worldToMap(x, z);
    if (i === 0) ctx.moveTo(p.u, p.v);
    else ctx.lineTo(p.u, p.v);
  });
  ctx.closePath();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.boundary;
  ctx.stroke();
  ctx.setLineDash([]);

  // Cửa: cửa thang máy, lối vào chính, làn cổng an ninh.
  for (const d of model.doors) {
    ctx.beginPath();
    rectPath(ctx, view, d.rect);
    ctx.fillStyle = d.category === 'gate' ? 'rgba(242, 182, 50, 0.45)' : C.door;
    ctx.fill();
  }

  // Tuyến.
  if (o.showRoute && o.route && o.route.status === 'ok' && o.route.points.length > 1) {
    ctx.beginPath();
    o.route.points.forEach((p, i) => {
      const m = view.worldToMap(p.x, p.z);
      if (i === 0) ctx.moveTo(m.u, m.v);
      else ctx.lineTo(m.u, m.v);
    });
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, Math.min(6, view.scale * 0.35));
    ctx.strokeStyle = C.route;
    ctx.stroke();
  }

  // Đích.
  if (o.dest) {
    if (o.dest.rect) {
      ctx.beginPath();
      rectPath(ctx, view, o.dest.rect);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.dest;
      ctx.stroke();
    }
    const end = o.route?.status === 'ok' && o.route.goal ? o.route.goal : o.dest;
    const m = view.worldToMap(end.x, end.z);
    ctx.beginPath();
    ctx.arc(m.u, m.v, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.dest;
    ctx.fill();
  }

  // Nhãn: luôn đứng thẳng, chỉ vị trí đi theo phép xoay.
  if (view.scale >= (o.labelMinScale ?? 6)) {
    const size = Math.max(10, Math.min(14, view.scale * 0.9));
    for (const it of model.items) {
      if (it.category !== 'room' && it.category !== 'core' && it.category !== 'desk' && it.category !== 'amenity') continue;
      const m = view.worldToMap(it.center.x, it.center.z);
      if (m.u < -40 || m.v < -20 || m.u > width + 40 || m.v > height + 20) continue;
      label(ctx, it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label, m.u, m.v, size);
    }
  }

  // Nhân vật.
  const pm = view.worldToMap(o.player.x, o.player.z);
  arrow(ctx, pm.u, pm.v, o.playerAngle, 9, C.player);

  // Mũi tên Bắc (đỏ) ở góc trên-phải; chữ "B" ở đầu mũi tên, trong vòng tròn.
  const nu = width - 20;
  const nv = 20;
  ctx.beginPath();
  ctx.arc(nu, nv, 15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fill();
  arrow(ctx, nu, nv, o.northAngle, 7, '#ff6b6b');
  label(ctx, 'B', nu + Math.sin(o.northAngle) * 10.5, nv - Math.cos(o.northAngle) * 10.5, 9);
}
