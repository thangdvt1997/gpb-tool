// Kiểm tra và chuẩn hóa pose client gửi lên. Thuần, không phụ thuộc express, để test bằng node:test.

import { ANIM_STATES, MAX_SPEED, MAX_STEP_DT_MS, PROTOCOL_VERSION, STEP_SLACK } from './config.js';

// Sàn chữ L theo tọa độ three.js (x, z), chép từ src/scene/officeBounds.ts (OFFICE_L_PLAN_RECTS)
// đổi sang thế giới bằng worldX = x - 29, worldZ = y - 15 (src/scene/layout.ts, sàn 58 x 30 m).
// Khi client đổi chữ L, phải cập nhật bảng này. Thứ tự: minX, maxX, minZ, maxZ.
const PLAN_RECTS = [
  [0, 14.5, 0, 30],
  [14.5, 18.6, 15.2, 30],
  [18.6, 29.9, 12.4, 30],
  [29.9, 35.9, 8.1, 30],
  [35.9, 45.1, 18.5, 30],
];
export const FLOOR_RECTS = PLAN_RECTS.map(([x0, x1, y0, y1]) => ({
  minX: x0 - 29,
  maxX: x1 - 29,
  minZ: y0 - 15,
  maxZ: y1 - 15,
}));

const SEQ_MAX = 2 ** 31 - 1;
const round3 = (n) => Math.round(n * 1000) / 1000;

export class PoseError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Đưa yaw (radian) về [-π, π). */
export function normalizeYaw(yaw) {
  const twoPi = Math.PI * 2;
  let a = (yaw + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return round3(a - Math.PI);
}

/** Điểm gần nhất trong hợp các hình chữ nhật sàn. Điểm đã ở trong sàn giữ nguyên. */
export function clampToFloor(x, z, rects = FLOOR_RECTS) {
  let best = null;
  let bestD = Infinity;
  for (const r of rects) {
    const cx = Math.min(Math.max(x, r.minX), r.maxX);
    const cz = Math.min(Math.max(z, r.minZ), r.maxZ);
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: cx, z: cz };
      if (d === 0) break;
    }
  }
  return { x: best.x, z: best.z, clamped: bestD > 0 };
}

/**
 * Giới hạn quãng đường từ pose trước tới pose mới theo thời gian server.
 * Vượt quá thì dừng ở điểm cho phép trên đoạn thẳng (client không tự teleport được).
 */
export function limitStep(prev, next, dtMs) {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_DT_MS) / 1000;
  const maxDist = MAX_SPEED * dt + STEP_SLACK;
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDist) return { x: next.x, z: next.z, limited: false };
  const k = maxDist / dist;
  return { x: prev.x + dx * k, z: prev.z + dz * k, limited: true };
}

/**
 * Đọc body pose: {v, seq, x, z, yaw, anim?}. Trường lạ bị bỏ.
 * Ném PoseError với mã cố định khi sai. Chưa kẹp sàn, chưa kiểm tốc độ.
 */
export function parsePose(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PoseError('invalid_body');
  if (body.v !== PROTOCOL_VERSION) throw new PoseError('protocol_version');
  if (!Number.isInteger(body.seq) || body.seq < 0 || body.seq > SEQ_MAX) throw new PoseError('invalid_seq');
  if (!isFiniteNumber(body.x) || !isFiniteNumber(body.z)) throw new PoseError('invalid_position');
  if (!isFiniteNumber(body.yaw)) throw new PoseError('invalid_yaw');
  const anim = body.anim === undefined ? 'idle' : body.anim;
  if (typeof anim !== 'string' || !ANIM_STATES.includes(anim)) throw new PoseError('invalid_anim');
  return { seq: body.seq, x: body.x, z: body.z, yaw: normalizeYaw(body.yaw), anim };
}

/**
 * Áp luật server lên pose đã parse: giới hạn tốc độ (nếu có pose trước), kẹp trong sàn, làm tròn mm.
 * prev: {x, z, at} hoặc null (người mới vào: chấp nhận mọi điểm trong sàn).
 */
export function authorizePose(prev, pose, now) {
  let { x, z } = pose;
  let corrected = false;
  // Kẹp trước để điểm xa vô lý (1e9) không làm hỏng phép tính tốc độ.
  const first = clampToFloor(x, z);
  x = first.x;
  z = first.z;
  corrected = first.clamped;
  if (prev) {
    const step = limitStep(prev, { x, z }, now - prev.at);
    if (step.limited) {
      // Điểm trên đoạn thẳng có thể đi qua chỗ lõm của chữ L, nên kẹp lại lần nữa.
      const again = clampToFloor(step.x, step.z);
      x = again.x;
      z = again.z;
      corrected = true;
    }
  }
  return { seq: pose.seq, x: round3(x), z: round3(z), yaw: pose.yaw, anim: pose.anim, corrected };
}
