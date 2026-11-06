import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../settings/schema';
import { foldVi, keyNamesFrom } from './keys';
import { TUTORIAL_VERSION, initialSnapshot, parseStored } from './helpState';
import { HINTS, STEPS, hintKindOf, visibleSteps, type StepCtx } from './steps';
import { TOPICS, availableTopics, isHelpKey, searchTopics } from './topics';

const keys = keyNamesFrom(DEFAULT_BINDINGS);
const ctx = (o: Partial<StepCtx> = {}): StepCtx => ({ touch: false, keys, gamepad: false, ...o });

describe('tên phím động', () => {
  it('mặc định ra W A S D / E / M', () => {
    expect(keys.move).toBe('W A S D');
    expect(keys.interact).toBe('E');
    expect(keys.map).toBe('M');
    expect(keys.look).toBe('chuột phải');
  });
  it('đổi phím thì bước hướng dẫn đổi theo', () => {
    const k = keyNamesFrom({ ...DEFAULT_BINDINGS, interact: 'KeyF', map: 'KeyN' });
    const inter = STEPS.find((s) => s.id === 'interact')!;
    expect(inter.body(ctx({ keys: k }))).toContain('nhấn F');
    expect(inter.body(ctx({ keys: k }))).not.toContain('nhấn E');
    expect(STEPS.find((s) => s.id === 'map')!.body(ctx({ keys: k }))).toContain('N');
  });
  it('gợi ý ngữ cảnh dùng phím đã đổi', () => {
    const k = keyNamesFrom({ ...DEFAULT_BINDINGS, interact: 'KeyG' });
    expect(HINTS.drawer(ctx({ keys: k }))).toContain('nhấn G');
  });
  it('chế độ chuột trái đổi chữ xoay camera', () => {
    expect(keyNamesFrom(DEFAULT_BINDINGS, 'leftMouse').look).toBe('chuột trái');
  });
});

describe('lọc bước', () => {
  it('bước sắp xếp nội thất chỉ có với it/admin', () => {
    expect(visibleSteps(ctx({ role: 'it' })).some((s) => s.id === 'layout')).toBe(true);
    expect(visibleSteps(ctx({ role: 'admin' })).some((s) => s.id === 'layout')).toBe(true);
    expect(visibleSteps(ctx({ role: 'staff' })).some((s) => s.id === 'layout')).toBe(false);
    expect(visibleSteps(ctx()).some((s) => s.id === 'layout')).toBe(false);
  });
  it('bước tay cầm chỉ khi có kết nối', () => {
    expect(visibleSteps(ctx({ gamepad: true })).some((s) => s.id === 'gamepad')).toBe(true);
    expect(visibleSteps(ctx()).some((s) => s.id === 'gamepad')).toBe(false);
  });
  it('cảm ứng bỏ bước chỉ có bàn phím', () => {
    const ids = visibleSteps(ctx({ touch: true })).map((s) => s.id);
    expect(ids).not.toContain('view');
    expect(ids).not.toContain('pause');
  });
  it('chỉ bước mới khi người dùng cũ đã xem bản 1', () => {
    const ids = visibleSteps(ctx({ role: 'it' }), 1).map((s) => s.id);
    expect(ids).toEqual(['map', 'photo', 'settings', 'layout', 'done']);
    expect(ids).not.toContain('move');
  });
  it('mọi bước đều có since hợp lệ không vượt version', () => {
    for (const s of STEPS) expect(s.since ?? 1).toBeLessThanOrEqual(TUTORIAL_VERSION);
  });
});

describe('trạng thái đã xem có version', () => {
  it('chưa có dữ liệu: mở đủ bước', () => {
    const s = initialSnapshot(parseStored(null));
    expect(s).toMatchObject({ open: true, onlyNewSince: 0, completed: false });
  });
  it('dạng cũ completed ở v1: mở, chỉ bước mới', () => {
    const st = parseStored(JSON.stringify({ version: 1, completed: true, hints: { door: true } }));
    expect(st.seenVersion).toBe(1);
    expect(st.hints.door).toBe(true);
    expect(initialSnapshot(st)).toMatchObject({ open: true, onlyNewSince: 1 });
  });
  it('đã xem version hiện tại: không mở', () => {
    const st = parseStored(JSON.stringify({ seenVersion: TUTORIAL_VERSION, hints: {} }));
    expect(initialSnapshot(st)).toMatchObject({ open: false, completed: true });
  });
  it('dữ liệu hỏng hoặc version quá lớn không làm hỏng', () => {
    expect(parseStored('{xx').seenVersion).toBe(0);
    expect(parseStored(JSON.stringify({ seenVersion: 999 })).seenVersion).toBe(TUTORIAL_VERSION);
    expect(parseStored('"abc"').seenVersion).toBe(0);
  });
  it('đọc gợi ý vật mới đã xem', () => {
    const st = parseStored(JSON.stringify({ seenVersion: 2, hints: { printer: true, bogus: true } }));
    expect(st.hints).toEqual({ printer: true });
  });
});

describe('gợi ý ngữ cảnh vật mới', () => {
  it('nhận kind và nhãn', () => {
    expect(hintKindOf('', null, 'drawer')).toBe('drawer');
    expect(hintKindOf('Cây nước', null, null)).toBe('water');
    expect(hintKindOf('Máy in', null, null)).toBe('printer');
    expect(hintKindOf('Công tắc đèn', null, null)).toBe('switch');
    expect(hintKindOf('Bàn', null, null)).toBeNull();
  });
});

describe('trang trợ giúp tra cứu', () => {
  it('foldVi bỏ dấu và đ', () => {
    expect(foldVi('  Bản Đồ  nhỏ ')).toBe('ban do nho');
  });
  it('tìm không dấu ra bản đồ', () => {
    expect(searchTopics('ban do', ctx()).map((t) => t.id)).toContain('map');
  });
  it('tìm "may in" ra tương tác vật; ô trống ra tất cả', () => {
    expect(searchTopics('may in', ctx()).map((t) => t.id)).toContain('interact');
    expect(searchTopics('  ', ctx())).toHaveLength(availableTopics(ctx()).length);
  });
  it('không khớp thì rỗng', () => {
    expect(searchTopics('zzzqqq', ctx())).toHaveLength(0);
  });
  it('chủ đề nội thất ẩn với người thường', () => {
    expect(searchTopics('noi that', ctx({ role: 'staff' })).map((t) => t.id)).not.toContain('layout');
    expect(searchTopics('noi that', ctx({ role: 'it' })).map((t) => t.id)).toContain('layout');
    expect(TOPICS.length).toBeGreaterThan(8);
  });
  it('tìm theo phím động', () => {
    const k = keyNamesFrom({ ...DEFAULT_BINDINGS, interact: 'KeyF' });
    expect(searchTopics('nhan f', ctx({ keys: k })).length).toBeGreaterThan(0);
  });
  it('F1 và ? mở trợ giúp, không khi gõ trong ô nhập', () => {
    expect(isHelpKey({ key: 'F1' })).toBe(true);
    expect(isHelpKey({ key: '?', target: { tagName: 'DIV' } })).toBe(true);
    expect(isHelpKey({ key: '?', target: { tagName: 'INPUT' } })).toBe(false);
    expect(isHelpKey({ key: 'a' })).toBe(false);
    expect(isHelpKey({ key: 'F1', ctrlKey: true })).toBe(false);
  });
});
