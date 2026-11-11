import { describe, expect, it } from 'vitest';
import { mergeChatHistory, needsChatHistory } from './chatResync';

describe('bù chat sau kết nối lại', () => {
  it('lần kết nối đầu không tải lịch sử; kết nối lại không bù được thì tải', () => {
    expect(needsChatHistory(0, null)).toBe(false);
    expect(needsChatHistory(1, { ok: true, full: false, restored: [], lost: [], spawn: null, events: [] })).toBe(false);
    expect(needsChatHistory(1, { ok: true, full: true, restored: [], lost: [], spawn: null, events: [] })).toBe(true);
    expect(needsChatHistory(1, { ok: false, reason: 'expired', full: true })).toBe(true);
    expect(needsChatHistory(2, null)).toBe(true);
    expect(needsChatHistory(1, undefined)).toBe(true);
  });

  it('gộp lịch sử: bỏ trùng id, tin bị lỡ nằm đúng chỗ theo thời điểm, giữ max tin cuối', () => {
    const prev = [{ id: 'a', at: 1 }, { id: 'c', at: 5 }];
    const hist = [{ id: 'a', at: 1 }, { id: 'b', at: 3 }, { id: 'd', at: 7 }];
    expect(mergeChatHistory(prev, hist, 10).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeChatHistory(prev, hist, 2).map((x) => x.id)).toEqual(['c', 'd']);
  });
});
