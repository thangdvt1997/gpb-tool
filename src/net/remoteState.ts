// Nội suy vị trí người khác bằng buffer theo thời gian server.
// Vẽ ở thời điểm (giờ server ước lượng - interpDelay) để luôn có hai mẫu bao quanh; gói trễ/đảo thứ tự
// được chèn đúng chỗ theo t; mẫu cùng t bị bỏ. Khoảng cách lớn giữa hai mẫu coi là teleport (không nội suy).

import { normalizeAppearance, type Appearance } from '../avatar/appearance';
import { RemoteActions } from './remoteActions';
import type { PlayerState } from './protocol';

export interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
  anim: string;
}

export interface RemoteOptions {
  /** Độ trễ vẽ (ms). Mặc định 150 = 1.5 tick của server. */
  interpDelayMs?: number;
  /** Giữa hai mẫu xa hơn ngưỡng này (m) thì nhảy thẳng, không nội suy. */
  teleportMeters?: number;
  /** Số mẫu tối đa mỗi người. */
  maxSamples?: number;
}

export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class RemoteStore {
  private buf = new Map<string, Sample[]>();
  private names = new Map<string, string>();
  private looks = new Map<string, Appearance>();
  /** Hành động xã hội đang chạy trên avatar từ xa. */
  readonly actions = new RemoteActions();
  private offset: number | null = null; // serverTime - clientNow (ms), làm mượt
  readonly interpDelayMs: number;
  readonly teleportMeters: number;
  readonly maxSamples: number;

  constructor(o: RemoteOptions = {}) {
    this.interpDelayMs = o.interpDelayMs ?? 150;
    this.teleportMeters = o.teleportMeters ?? 6;
    this.maxSamples = o.maxSamples ?? 24;
  }

  /** Cập nhật ước lượng chênh lệch đồng hồ từ một mốc serverTime vừa nhận. */
  syncClock(serverTime: number, clientNow: number): void {
    const o = serverTime - clientNow;
    this.offset = this.offset === null ? o : this.offset * 0.9 + o * 0.1;
  }

  /** Giờ server ước lượng tại thời điểm clientNow. */
  serverNow(clientNow: number): number {
    return clientNow + (this.offset ?? 0);
  }

  /** Thay toàn bộ (snapshot): bỏ người không còn trong danh sách, xóa lịch sử cũ. */
  reset(players: PlayerState[]): void {
    this.buf.clear();
    this.names.clear();
    this.looks.clear();
    this.actions.clearAll();
    for (const p of players) this.push(p);
  }

  push(p: PlayerState): void {
    this.names.set(p.id, p.name);
    // Ngoại hình: chỉ khi world gửi kèm (trường tùy chọn); chuẩn hóa để dữ liệu lạ không làm hỏng avatar.
    if (p.appearance !== undefined && p.appearance !== null) this.looks.set(p.id, normalizeAppearance(p.appearance));
    let list = this.buf.get(p.id);
    if (!list) this.buf.set(p.id, (list = []));
    const s: Sample = { t: p.t, x: p.x, z: p.z, yaw: p.yaw, anim: p.anim };
    // Chèn giữ thứ tự theo t; bỏ mẫu trùng t.
    let i = list.length;
    while (i > 0 && list[i - 1].t > s.t) i -= 1;
    if (i > 0 && list[i - 1].t === s.t) return;
    list.splice(i, 0, s);
    if (list.length > this.maxSamples) list.shift();
  }

  remove(id: string): void {
    this.buf.delete(id);
    this.names.delete(id);
    this.looks.delete(id);
    this.actions.clear(id);
  }

  ids(): string[] {
    return [...this.buf.keys()];
  }

  nameOf(id: string): string {
    return this.names.get(id) ?? '';
  }

  /** Ngoại hình nếu world đã gửi; undefined thì dùng mặc định. */
  appearanceOf(id: string): Appearance | undefined {
    return this.looks.get(id);
  }

  /** Vị trí tại giờ server `renderT` (đã trừ độ trễ nếu dùng sampleAt). */
  sample(id: string, renderT: number): Sample | null {
    const list = this.buf.get(id);
    if (!list || list.length === 0) return null;
    if (renderT <= list[0].t) return list[0];
    const last = list[list.length - 1];
    if (renderT >= last.t) {
      // Quá mẫu cuối: đứng yên (không đoán hướng đi, tránh xuyên tường vì server kẹp sàn).
      return last;
    }
    let i = list.length - 1;
    while (i > 0 && list[i - 1].t > renderT) i -= 1;
    const a = list[i - 1];
    const b = list[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > this.teleportMeters) return renderT >= b.t ? b : a;
    const k = (renderT - a.t) / (b.t - a.t);
    return {
      t: renderT,
      x: a.x + (b.x - a.x) * k,
      z: a.z + (b.z - a.z) * k,
      yaw: lerpAngle(a.yaw, b.yaw, k),
      anim: k < 0.5 ? a.anim : b.anim,
    };
  }

  /** Tiện lợi: lấy mẫu tại giờ máy khách `clientNow`, đã áp độ trễ nội suy. */
  sampleNow(id: string, clientNow: number): Sample | null {
    return this.sample(id, this.serverNow(clientNow) - this.interpDelayMs);
  }
}
