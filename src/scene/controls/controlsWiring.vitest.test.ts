import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, getSettings, resetSettings, updateSettings as updateCentral } from '../../settings';
import { getInteractSettings, updateInteractSettings } from '../interact/settings';
import { chairInteractables } from '../interact/chairs';
import { ARROW_KEYS, isAction, keyFor, trackedCodes } from './bindings';
import { getControls, updateSettings } from './session';
import type { ZoneObject } from '../../content/types';

describe('bindings mặc định', () => {
  it('khớp phím cứng cũ', () => {
    resetSettings();
    expect(keyFor('interact')).toBe('KeyE');
    expect(keyFor('firstPerson')).toBe('KeyV');
    expect(keyFor('cancel')).toBe('Escape');
    const t = trackedCodes();
    for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', ...Object.values(ARROW_KEYS)]) expect(t.has(c)).toBe(true);
    expect(t.has('KeyE')).toBe(false);
  });
  it('đổi phím thì isAction theo phím mới', () => {
    updateCentral({ bindings: { ...DEFAULT_BINDINGS, interact: 'KeyF' } });
    expect(isAction('KeyF', 'interact')).toBe(true);
    expect(isAction('KeyE', 'interact')).toBe(false);
    resetSettings();
  });
});

describe('session đọc từ settings trung tâm', () => {
  it('mặc định không đổi', () => {
    resetSettings();
    expect(getControls().settings).toEqual({ sensitivity: 1, volume: 0.5, helpHidden: false });
  });
  it('updateSettings ghi vào kho trung tâm và kẹp khoảng', () => {
    updateSettings({ sensitivity: 99, helpHidden: true });
    expect(getSettings().mouse.sensitivity).toBe(3);
    expect(getSettings().hintsEnabled).toBe(false);
    expect(getControls().settings.sensitivity).toBe(3);
    expect(getControls().settings.helpHidden).toBe(true);
    resetSettings();
    expect(getControls().settings.helpHidden).toBe(false);
  });
  it('interact settings dùng chung hintsEnabled và highlightEnabled', () => {
    resetSettings();
    updateInteractSettings({ keyHints: false, highlight: false });
    expect(getSettings().hintsEnabled).toBe(false);
    expect(getSettings().highlightEnabled).toBe(false);
    expect(getControls().settings.helpHidden).toBe(true);
    const a = getInteractSettings();
    expect(getInteractSettings()).toBe(a);
    resetSettings();
    expect(getInteractSettings()).toEqual({ highlight: true, keyHints: true });
  });
});

describe('chairInteractables', () => {
  it('tạo ghế từ khối bàn, mỗi ghế một hành động ngồi', () => {
    const desk = { id: 'd1', kind: 'desk', label: 'Bàn', position: [0, 0.4, 0], size: [2.4, 0.8, 1.2], action: 'x' } as unknown as ZoneObject;
    const chairs = chairInteractables([desk]);
    expect(chairs.length).toBe(2);
    expect(chairs[0].kind).toBe('chair');
    expect(chairs[0].actions.map((a) => a.id)).toEqual(['sit']);
    expect(new Set(chairs.map((c) => c.id)).size).toBe(2);
  });
});
