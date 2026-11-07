import { describe, expect, it } from 'vitest';
import { shouldRestoreFocus } from './useReturnFocus';

describe('shouldRestoreFocus', () => {
  it('trả focus khi nút mở còn trong DOM và focus đã rơi về body', () => {
    expect(shouldRestoreFocus({ isConnected: true }, { tagName: 'BODY' }, false)).toBe(true);
    expect(shouldRestoreFocus({ isConnected: true }, null, false)).toBe(true);
  });
  it('không cướp focus khi người dùng đã chuyển sang phần tử khác', () => {
    expect(shouldRestoreFocus({ isConnected: true }, { tagName: 'INPUT' }, false)).toBe(false);
  });
  it('không trả khi nút mở đã bị tháo hoặc không có', () => {
    expect(shouldRestoreFocus({ isConnected: false }, { tagName: 'BODY' }, false)).toBe(false);
    expect(shouldRestoreFocus(null, null, false)).toBe(false);
  });
});

describe('BackupPanel: tên truy cập chứa chữ hiển thị (WCAG 2.5.3)', () => {
  it('aria-label của nút xuất và sao lưu chứa chữ hiển thị', async () => {
    const src = (await import('../backup/BackupPanel.tsx?raw')).default;
    const pairs: [string, string][] = [
      ['Xuất toàn bộ dữ liệu ra tệp JSON', 'Xuất toàn bộ dữ liệu'],
      ['Tạo bản sao lưu cục bộ ngay', 'Tạo bản sao lưu cục bộ'],
    ];
    for (const [label, visible] of pairs) {
      expect(label.toLowerCase()).toContain(visible.toLowerCase());
      expect(src).toContain(`aria-label="${label}"`);
      expect(src).toMatch(new RegExp(`^\\s+${visible}$`, 'm'));
    }
  });
});
