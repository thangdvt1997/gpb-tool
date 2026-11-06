import { LEVELS, type QualityLevel } from './levels';

export interface AdaptiveOptions {
  initial?: QualityLevel;
  /** Mức tối đa tự lên tới (vd do detect). */
  ceiling?: QualityLevel;
  /** Số mẫu trong cửa sổ trượt. */
  windowSize?: number;
  /** Hạ mức khi p90 frame time vượt ngưỡng này (ms). */
  downMs?: number;
  /** Chỉ cân nhắc nâng khi p90 dưới ngưỡng này (ms); phải < downMs (hysteresis). */
  upMs?: number;
  /** Tối thiểu giữa hai lần hạ. */
  downCooldownMs?: number;
  /** Tối thiểu giữa lần đổi gần nhất và một lần nâng. */
  upCooldownMs?: number;
  /** Trần draw call (tham số, không đặt cứng); vượt thì tính là mẫu xấu. */
  maxDrawCalls?: number;
  /** Mẫu dt lớn hơn (tab nền, hitch) bị bỏ qua. */
  ignoreAboveMs?: number;
}

export interface FrameSample { ms: number; drawCalls?: number }
export interface Change { from: QualityLevel; to: QualityLevel; reason: 'slow' | 'headroom' }

const p90 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; };

export function createAdaptiveController(o: AdaptiveOptions = {}) {
  const windowSize = o.windowSize ?? 90;
  const downMs = o.downMs ?? 24;
  const upMs = o.upMs ?? 14;
  if (upMs >= downMs) throw new Error('upMs phải nhỏ hơn downMs (hysteresis)');
  const downCd = o.downCooldownMs ?? 3000;
  const baseUpCd = o.upCooldownMs ?? 15000;
  const ignoreAbove = o.ignoreAboveMs ?? 250;
  let ceiling = o.ceiling ?? 'high';
  let level: QualityLevel = clampTo(o.initial ?? 'medium', ceiling);
  let enabled = true;
  let samples: number[] = [];
  let overDraw = 0;
  let lastChangeAt = -Infinity;
  let lastDir: 'down' | 'up' | null = null;
  /** Mỗi lần nâng rồi bị hạ lại nhanh thì nhân đôi thời gian chờ nâng (chống dao động). */
  let upPenalty = 1;

  function clampTo(l: QualityLevel, c: QualityLevel): QualityLevel {
    return LEVELS.indexOf(l) > LEVELS.indexOf(c) ? c : l;
  }
  const reset = () => { samples = []; overDraw = 0; };

  function change(to: QualityLevel, reason: Change['reason'], now: number): Change {
    const c = { from: level, to, reason };
    if (reason === 'slow' && lastDir === 'up' && now - lastChangeAt < baseUpCd * 2) upPenalty = Math.min(upPenalty * 2, 8);
    if (reason === 'headroom' && lastDir === 'down') { /* giữ penalty */ }
    level = to;
    lastChangeAt = now;
    lastDir = reason === 'slow' ? 'down' : 'up';
    reset();
    return c;
  }

  return {
    get level() { return level; },
    get enabled() { return enabled; },
    /** false khi người dùng khóa preset thủ công: không đổi mức, không thu mẫu. */
    setEnabled(v: boolean) { enabled = v; reset(); },
    setLevel(l: QualityLevel, now = 0) { level = clampTo(l, ceiling); lastChangeAt = now; lastDir = null; reset(); },
    setCeiling(c: QualityLevel) { ceiling = c; level = clampTo(level, c); },
    /** Đẩy một frame; trả Change nếu đổi mức. */
    push(s: FrameSample, now: number): Change | null {
      if (!enabled || s.ms <= 0 || s.ms > ignoreAbove) return null;
      samples.push(s.ms);
      if (o.maxDrawCalls !== undefined && s.drawCalls !== undefined && s.drawCalls > o.maxDrawCalls) overDraw++;
      if (samples.length > windowSize) samples.shift();
      if (samples.length < windowSize) return null;
      const v = p90(samples);
      const idx = LEVELS.indexOf(level);
      const slow = v > downMs || (o.maxDrawCalls !== undefined && overDraw > windowSize * 0.5);
      if (slow && idx > 0 && now - lastChangeAt >= downCd) return change(LEVELS[idx - 1], 'slow', now);
      if (!slow && v < upMs && idx < LEVELS.indexOf(ceiling) && now - lastChangeAt >= baseUpCd * upPenalty) {
        return change(LEVELS[idx + 1], 'headroom', now);
      }
      return null;
    },
    /** Tab ẩn/quay lại: bỏ mẫu cũ để không đánh giá sai. */
    resetWindow: reset,
  };
}
export type AdaptiveController = ReturnType<typeof createAdaptiveController>;
