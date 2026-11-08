import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReducedMotion, mergeReducedMotion } from './reducedMotion';
import { resetSettings, updateSettings } from './store';
import { SpatialAudioManager } from '../audio/spatial/manager';

afterEach(() => { vi.unstubAllGlobals(); resetSettings(); });

describe('giảm chuyển động gộp cài đặt và hệ thống', () => {
  it('merge: bật nếu một nguồn bật', () => {
    expect(mergeReducedMotion(false, false)).toBe(false);
    expect(mergeReducedMotion(true, false)).toBe(true);
    expect(mergeReducedMotion(false, true)).toBe(true);
  });
  it('isReducedMotion theo display.reducedMotion dù hệ thống tắt', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(isReducedMotion()).toBe(false);
    updateSettings({ display: { reducedMotion: true } });
    expect(isReducedMotion()).toBe(true);
  });
  it('isReducedMotion theo hệ thống khi cài đặt tắt', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(isReducedMotion()).toBe(true);
  });
  it('âm thanh nhận hàm đọc động', () => {
    let v = false;
    const m = new SpatialAudioManager({ reducedMotion: () => v, storage: null });
    expect(m).toBeTruthy();
    v = true;
  });
});
