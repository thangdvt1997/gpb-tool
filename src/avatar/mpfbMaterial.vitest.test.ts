import { describe, expect, it } from 'vitest';
import { EYEBROW_ALPHA_CUTOFF, materialAlphaMode, mpfbModelFor, targetHeightM } from './MpfbAvatar';

describe('MpfbAvatar', () => {
  it('thân và mắt OPAQUE, lông mày MASK', () => {
    expect(materialAlphaMode('male_real.body')).toBe('OPAQUE');
    expect(materialAlphaMode('female_real.low-poly')).toBe('OPAQUE');
    expect(materialAlphaMode('male_real.eyebrow001')).toBe('MASK');
    expect(EYEBROW_ALPHA_CUTOFF).toBe(0.4);
  });
  it('chọn tệp theo kiểu và mesh gốc', () => {
    expect(mpfbModelFor('chibi', 'female')).toBe('chibi');
    expect(mpfbModelFor('realistic', 'female')).toBe('female_real');
    expect(mpfbModelFor('realistic', 'male')).toBe('male_real');
  });
  it('chiều cao được kẹp theo giới hạn', () => {
    const h = targetHeightM('realistic', 'male', 999);
    expect(h).toBeLessThan(2.5);
    expect(h).toBeGreaterThan(1.5);
  });
});
