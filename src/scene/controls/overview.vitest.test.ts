import { describe, expect, it } from 'vitest';
import { createCameraModeController, MODE_POLICY, createComfortStore } from './cameraModes';
import { ceilingVisible } from './overviewState';
import { ACTION_IDS, DEFAULT_BINDINGS, findConflicts, rebind, sanitize, defaultSettings } from '../../settings/schema';
import { keyNamesFrom } from '../../help/keys';
import { TOPICS } from '../../help/topics';
import type { StepCtx } from '../../help/steps';

const ctx = (b = DEFAULT_BINDINGS, touch = false): StepCtx => ({ touch, keys: keyNamesFrom(b), role: undefined, gamepad: false });

describe('Xem tổng thể: phím', () => {
  it('có action overview, mặc định O, không trùng phím nào', () => {
    expect(ACTION_IDS).toContain('overview');
    expect(DEFAULT_BINDINGS.overview).toBe('KeyO');
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([]);
  });
  it('đổi được phím; trùng phím khác thì báo xung đột', () => {
    const ok = rebind(DEFAULT_BINDINGS, 'overview', 'KeyT');
    expect(ok.ok && ok.bindings.overview).toBe('KeyT');
    const bad = rebind(DEFAULT_BINDINGS, 'overview', 'KeyV');
    expect(bad.ok).toBe(false);
  });
  it('cài đặt cũ không có overview vẫn nạp được và nhận phím mặc định', () => {
    const old = JSON.parse(JSON.stringify(defaultSettings())) as { bindings: Record<string, string> };
    delete old.bindings.overview;
    const s = sanitize(old);
    expect(s.bindings.overview).toBe('KeyO');
  });
});

describe('Xem tổng thể: camera và trần', () => {
  it('vào overview, thoát thì trả về chế độ nền cũ (kể cả góc nhìn thứ nhất)', () => {
    const c = createCameraModeController();
    c.setBase('firstPerson');
    c.request('overview', 'user:overview', { escapable: true });
    expect(c.getMode()).toBe('overview');
    expect(c.canEscape()).toBe(true);
    c.escape();
    expect(c.getMode()).toBe('firstPerson');
    c.request('overview', 'user:overview', { escapable: true });
    c.release('user:overview');
    expect(c.getMode()).toBe('firstPerson');
  });
  it('overview nhìn từ trên cao: góc chúi >= 0,9 rad, khoảng cách >= 10 m, không đặt ở mắt', () => {
    const p = MODE_POLICY.overview;
    expect(p.eye).toBe(false);
    expect(p.minPitch).toBeGreaterThanOrEqual(0.9);
    expect(p.minDist).toBeGreaterThanOrEqual(10);
  });
  it('trần ẩn chỉ khi overview', () => {
    expect(ceilingVisible('overview')).toBe(false);
    for (const m of ['thirdPerson', 'firstPerson', 'seated', 'inspect']) expect(ceilingVisible(m)).toBe(true);
  });
  it('giảm chuyển động: cắt thẳng, không rung', () => {
    const st = createComfortStore({ getItem: () => null, setItem: () => undefined }, true);
    expect(st.get().reduceMotion).toBe(true);
  });
});

describe('Xem tổng thể: HelpCenter', () => {
  const topic = TOPICS.find((t) => t.id === 'overview');
  it('có chủ đề, hiện đúng tên phím theo cài đặt', () => {
    expect(topic).toBeDefined();
    expect(topic!.body(ctx())).toContain('O');
    const b = { ...DEFAULT_BINDINGS, overview: 'KeyT' };
    expect(topic!.body(ctx(b))).toContain('T');
  });
  it('bản cảm ứng chỉ dẫn qua menu tạm dừng', () => {
    expect(topic!.body(ctx(DEFAULT_BINDINGS, true))).toContain('Toàn cảnh');
  });
});
