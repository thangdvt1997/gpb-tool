import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../settings/schema';
import { resetSettings, updateSettings } from '../settings';
import { HelpCenter, closeHelpCenter, openHelpCenter } from './HelpCenter';
import { HelpLayer } from './HelpLayer';
import { closeTour, openTour } from './helpState';

const center = (role?: string): string => renderToStaticMarkup(createElement(HelpCenter, { role }));

beforeEach(() => {
  closeHelpCenter();
  closeTour();
  resetSettings();
});

describe('HelpCenter render', () => {
  it('đóng thì không ra gì', () => {
    expect(center()).toBe('');
  });
  it('có tiêu đề, hộp thoại có aria-modal và nhãn trỏ tới tiêu đề', () => {
    openHelpCenter();
    const html = center();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal=');
    expect(html).toContain('aria-labelledby="help-center-title"');
    expect(html).toMatch(/<h2 id="help-center-title"[^>]*>\s*Trợ giúp\s*<\/h2>/);
    expect(html).toContain('for="help-search"');
    expect(html).toContain('id="help-search"');
  });
  it('tên phím lấy từ cài đặt: đổi phím thì chuỗi đổi', () => {
    openHelpCenter();
    expect(center()).toContain('nhấn E');
    updateSettings({ bindings: { ...DEFAULT_BINDINGS, interact: 'KeyF' } });
    const html = center();
    expect(html).toContain('nhấn F');
    expect(html).not.toContain('nhấn E');
  });
  it('vai trò thường không thấy chủ đề dành cho it/admin, it thì thấy', () => {
    openHelpCenter();
    const count = (h: string): number => Number(/(\d+) chủ đề/.exec(h)?.[1]);
    const staff = center('staff');
    const it = center('it');
    expect(count(it)).toBeGreaterThan(count(staff));
  });
});

describe('các bước hướng dẫn render', () => {
  it('bước đầu có tiêu đề, nhãn và nút; phím theo cài đặt', () => {
    openTour();
    const html = renderToStaticMarkup(createElement(HelpLayer, {}));
    expect(html).toContain('aria-labelledby="help-tour-title"');
    expect(html).toContain('Chào mừng bạn đến văn phòng');
    expect(html).toContain('Tiếp');
  });
});
