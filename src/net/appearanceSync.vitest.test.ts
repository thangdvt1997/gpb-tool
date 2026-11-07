import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, normalizeAppearance } from '../avatar/appearance';
// @ts-expect-error JS của service world không có khai báo kiểu
import { ACCESSORIES as SA, BODY_TYPES as SB, HAIR_STYLES as SH, OUTFITS as SO, SHOE_STYLES as SS, SKIN_TONE_COUNT, DEFAULT_APPEARANCE as SD, sanitizeAppearance } from '../../services/world/src/appearance.js';
import * as A from '../avatar/appearance';
import { createAppearanceSender } from './appearanceSync';

function rig(minIntervalMs = 5000) {
  let t = 0;
  const sent: unknown[] = [];
  const timers: { fn: () => void; at: number }[] = [];
  const s = createAppearanceSender({
    send: (m) => (sent.push(m), true),
    now: () => t,
    minIntervalMs,
    setTimer: (fn, ms) => {
      const h = { fn, at: t + ms };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    t += ms;
    for (const h of [...timers]) if (h.at <= t) (timers.splice(timers.indexOf(h), 1), h.fn());
  };
  return { s, sent, advance };
}

const look = (o: object = {}) => ({ ...DEFAULT_APPEARANCE, ...o });

describe('appearanceSender', () => {
  it('chưa vào phòng thì không gửi; vào phòng thì gửi bản chuẩn hóa', () => {
    const { s, sent } = rig();
    s.set(look());
    expect(sent).toHaveLength(0);
    s.joined();
    expect(sent).toEqual([{ type: 'appearance', appearance: DEFAULT_APPEARANCE }]);
  });

  it('không gửi lại khi không đổi; gửi lại sau snapshot mới (kết nối lại)', () => {
    const { s, sent, advance } = rig();
    s.joined();
    s.set(look());
    s.set(look());
    expect(sent).toHaveLength(1);
    advance(100);
    s.joined();
    expect(sent).toHaveLength(2);
  });

  it('đổi dồn dập: giãn cách tối thiểu, chỉ gửi bản cuối', () => {
    const { s, sent, advance } = rig();
    s.joined();
    s.set(look({ outfit: 'blazer' }));
    s.set(look({ outfit: 'tuxedo' }));
    s.set(look({ outfit: 'dress' }));
    expect(sent).toHaveLength(1);
    advance(4999);
    expect(sent).toHaveLength(1);
    advance(1);
    expect(sent).toHaveLength(2);
    expect((sent[1] as { appearance: { outfit: string } }).appearance.outfit).toBe('dress');
  });

  it('dispose hủy gửi chờ', () => {
    const { s, sent, advance } = rig();
    s.joined();
    s.set(look({ outfit: 'blazer' }));
    s.set(look({ outfit: 'dress' }));
    s.dispose();
    advance(10000);
    expect(sent).toHaveLength(1);
  });
});

describe('đồng bộ whitelist client và server', () => {
  it('danh sách giá trị khớp nhau', () => {
    expect(SB).toEqual([...A.BODY_TYPES]);
    expect(SH).toEqual([...A.HAIR_STYLES]);
    expect(SO).toEqual([...A.OUTFITS]);
    expect(SS).toEqual([...A.SHOE_STYLES]);
    expect(SA).toEqual([...A.ACCESSORIES]);
    expect(SKIN_TONE_COUNT).toBe(A.SKIN_TONES.length);
    expect(SD).toEqual(DEFAULT_APPEARANCE);
  });
  it('server sanitize cho kết quả giống normalizeAppearance', () => {
    const inputs: unknown[] = [
      {},
      { bodyType: 'broad', hairColor: '#ABCDEF', accessories: ['watch', 'glasses', 'x'], outfit: 'zzz', skinTone: 5 },
      { skinTone: 6, topColor: 'red', accessories: 'no' },
    ];
    for (const i of inputs) expect(sanitizeAppearance(i)).toEqual(normalizeAppearance(i));
  });
});
