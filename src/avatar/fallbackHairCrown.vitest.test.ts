import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, type HairStyle } from './appearance';
import { FallbackHair } from './fallbackHair';
import { hairUnderHat } from './outfit/hairHat';

const count = (style: HairStyle, crown?: { scale: number; hide: boolean }) =>
  (renderToStaticMarkup(createElement(FallbackHair, { style, color: '#333333', crown })).match(/<mesh/g) ?? []).length;

describe('tóc dự phòng né mũ', () => {
  it('mọi kiểu tóc cũ đều có quy tắc nén dưới mũ', () => {
    for (const s of HAIR_STYLES) {
      const u = hairUnderHat(s, 'party');
      expect(u.crownScale, s).toBeLessThan(1);
    }
  });
  it('tóc húi cua: ẩn hẳn phần đỉnh dưới mũ, giữ tóc mai', () => {
    const u = hairUnderHat('buzz', 'cap');
    expect(u.hideCrown).toBe(true);
    const base = count('buzz');
    const hidden = count('buzz', { scale: u.crownScale, hide: u.hideCrown });
    expect(hidden).toBeLessThan(base);
    expect(hidden).toBeGreaterThan(0); // tóc mai còn
  });
  it('tóc xoăn, dựng, búi: phần chóp/búi trên đỉnh ẩn khi hide, còn khi chỉ nén', () => {
    for (const s of ['curly', 'spiky', 'bun'] as const) {
      const base = count(s);
      expect(count(s, { scale: 0.45, hide: false }), s).toBe(base);
      expect(count(s, { scale: 0, hide: true }), s).toBeLessThan(base);
    }
  });
  it('nén: nắp tóc thấp hơn (scale y nhỏ hơn) và dời lên giữ chân tóc', () => {
    const none = renderToStaticMarkup(createElement(FallbackHair, { style: 'short', color: '#333333' }));
    const squashed = renderToStaticMarkup(createElement(FallbackHair, { style: 'short', color: '#333333', crown: { scale: 0.55, hide: false } }));
    expect(squashed).not.toBe(none);
  });
});
