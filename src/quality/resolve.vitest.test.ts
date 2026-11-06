import { describe, expect, it } from 'vitest';
import { effectiveConfig, resolveQuality } from './resolve';
import { QUALITY_TABLE } from './levels';

describe('resolveQuality', () => {
  it('auto dùng mức đề xuất từ thiết bị và bật tự thích nghi', () => {
    expect(resolveQuality({ mode: 'auto', adaptive: true }, { deviceMemoryGb: 2, hardwareConcurrency: 4 })).toEqual({ level: 'low', ceiling: 'low', adaptive: true });
    expect(resolveQuality({ mode: 'auto', adaptive: false }, {})).toEqual({ level: 'high', ceiling: 'high', adaptive: false });
  });
  it('chế độ thủ công khóa mức và tắt tự thích nghi', () => {
    expect(resolveQuality({ mode: 'low', adaptive: true }, {})).toEqual({ level: 'low', ceiling: 'low', adaptive: false });
    expect(resolveQuality({ mode: 'high', adaptive: true }, { deviceMemoryGb: 1 })).toEqual({ level: 'high', ceiling: 'high', adaptive: false });
  });
  it('custom gộp ghi đè lên medium', () => {
    const s = { mode: 'custom' as const, adaptive: true, custom: { shadows: false } };
    expect(resolveQuality(s, {}).level).toBe('medium');
    expect(effectiveConfig(s, 'medium')).toEqual({ ...QUALITY_TABLE.medium, shadows: false });
  });
  it('không phải custom thì bỏ qua ghi đè', () => {
    expect(effectiveConfig({ mode: 'high', adaptive: false, custom: { shadows: false } }, 'high').shadows).toBe(true);
  });
});
