// Logic panel máy tính: dùng máy tự bật/đăng nhập, đóng panel đưa máy về nghỉ, ghi chú localStorage, đồng hồ.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getObjectState, resetObjectStates } from '../objectStates';
import { getInteractable } from '../registry';
import { registerObjects } from './index';
import { computerOf, computerSleep, computerWake, NOTE_MAX } from './computer';
import { closeComputerUi, formatClock, getComputerUi, loadNote, noteStorageKey, openComputerUi, saveNote, subscribeComputerUi } from './computerUi';
import { buildSampleConfig } from './InteractObjects';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('reducer máy tính cho panel', () => {
  const idle = { on: false, user: '', wallpaper: 0, note: '', doc: 0 };
  it('computerWake: tắt thì bật và đăng nhập, bật chưa đăng nhập thì chỉ đăng nhập, sẵn sàng thì null', () => {
    expect(computerWake(idle, 'an')).toEqual({ on: true, user: 'an' });
    expect(computerWake({ ...idle, on: true }, ' ')).toEqual({ user: 'khach' });
    expect(computerWake({ ...idle, on: true, user: 'an' }, 'bo')).toBeNull();
  });
  it('computerSleep: về nghỉ, giữ ghi chú; đã nghỉ thì null', () => {
    expect(computerSleep({ ...idle, on: true, user: 'an', note: 'x' })).toEqual({ on: false, user: '' });
    expect(computerSleep(idle)).toBeNull();
  });
});

describe('panel máy tính: mở và đóng', () => {
  beforeEach(() => {
    closeComputerUi();
    resetObjectStates();
  });

  it('hành động "Dùng máy tính" bật máy, đăng nhập và mở giao diện; đóng thì máy về nghỉ', () => {
    const off = registerObjects(buildSampleConfig([], () => false));
    try {
      const def = getInteractable('sample_computer')!;
      const use = def.actions.find((a) => a.id === 'use')!;
      expect(use.label).toBe('Dùng máy tính');
      const calls = vi.fn();
      const unsub = subscribeComputerUi(calls);
      use.run({ id: def.id, def, state: getObjectState(def.id), character: 'walking', setState: () => {} } as never);
      expect(getComputerUi()).toBe('sample_computer');
      expect(computerOf(getObjectState('sample_computer'))).toMatchObject({ on: true });
      expect(computerOf(getObjectState('sample_computer')).user).not.toBe('');
      closeComputerUi();
      expect(getComputerUi()).toBeNull();
      expect(computerOf(getObjectState('sample_computer'))).toMatchObject({ on: false, user: '' });
      expect(calls).toHaveBeenCalledTimes(2);
      closeComputerUi();
      expect(calls).toHaveBeenCalledTimes(2);
      unsub();
    } finally {
      off();
    }
  });

  it('mở máy khác thì máy đang mở về nghỉ', () => {
    openComputerUi('a');
    openComputerUi('b');
    expect(getComputerUi()).toBe('b');
    closeComputerUi();
  });
});

describe('ghi chú localStorage và đồng hồ', () => {
  it('lưu rồi đọc lại, cắt NOTE_MAX', () => {
    const s = mem();
    expect(loadNote('m', s)).toBe('');
    expect(saveNote('m', 'x'.repeat(NOTE_MAX + 20), s)).toBe(true);
    expect(s.m.has(noteStorageKey('m'))).toBe(true);
    expect(loadNote('m', s)).toHaveLength(NOTE_MAX);
  });
  it('không có hoặc lỗi storage thì không ném', () => {
    expect(saveNote('m', 'a', null)).toBe(false);
    expect(loadNote('m', null)).toBe('');
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(saveNote('m', 'a', bad)).toBe(false);
    expect(loadNote('m', bad)).toBe('');
  });
  it('formatClock: HH:MM:SS và dd/mm/yyyy', () => {
    expect(formatClock(new Date(2026, 10, 7, 9, 5, 3))).toEqual({ time: '09:05:03', date: '07/11/2026' });
  });
});
