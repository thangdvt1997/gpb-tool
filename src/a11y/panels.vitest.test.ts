/** Kiểm tĩnh trợ năng các panel UI (đọc mã nguồn) và tương phản các cặp màu css mới. */
// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from './contrast';

const FILES = [
  'settings/SettingsPanel', 'library/LibraryPanel', 'backup/BackupPanel', 'editor/EditorPanel',
  'wardrobe/WardrobeRoom', 'tattoo/TattooPainter', 'tattoo/TattooStudio', 'profile/ProfilePanel',
  'help/HelpCenter', 'emotes/social/SocialPrompt', 'emotes/social/SocialBar', 'net/ChatPanel',
  'net/ConnectionBanner', 'net/MemberPanel', 'quality/QualityPicker', 'photo/PhotoMode',
].map((f) => `src/${f}.tsx`);

const src = (p: string) => readFileSync(p, 'utf8');
const css = (p: string) => src(p);

describe('panel: ngữ nghĩa hộp thoại', () => {
  it('đọc được đủ 16 file', () => {
    expect(FILES.length).toBe(16);
    for (const f of FILES) expect(src(f).length).toBeGreaterThan(100);
  });
  for (const f of FILES) {
    const s = src(f);
    // Tách từng thẻ mở có role="dialog" (cho phép xuống dòng).
    const tags = s.match(/<[a-zA-Z][^<>]*?role="dialog"(?:[^<>]|=>)*?>/g) ?? [];
    it(`${f}: role=dialog có aria-modal và nhãn`, () => {
      for (const t of tags) {
        expect(t, t).toMatch(/aria-modal=/);
        expect(t, t).toMatch(/aria-labelledby=|aria-label=/);
      }
    });
  }
  it('không có <div onClick> thiếu role và tabIndex', () => {
    for (const f of FILES) {
      const tags = src(f).match(/<div\b(?:[^<>]|=>)*?onClick(?:[^<>]|=>)*?>/g) ?? [];
      for (const t of tags) {
        expect(t, `${f}: ${t}`).toMatch(/role=/);
        expect(t, `${f}: ${t}`).toMatch(/tabIndex=/);
      }
    }
  });
  it('không có <span onClick> trần', () => {
    for (const f of FILES) expect(src(f)).not.toMatch(/<span\b[^<>]*?onClick(?![^<>]*role=)/);
  });
  it('alertdialog có aria-labelledby hoặc aria-label', () => {
    for (const f of FILES) {
      for (const t of src(f).match(/<[a-zA-Z][^<>]*?role="alertdialog"(?:[^<>]|=>)*?>/g) ?? [])
        expect(t).toMatch(/aria-labelledby=|aria-label=/);
    }
  });
  it('mỗi <input type="range|text|search"> có nhãn (label bao quanh, aria-label hoặc id)', () => {
    for (const f of FILES) {
      const lines = src(f).split('\n');
      lines.forEach((l: string, i: number) => {
        if (!/<input[^>]*type="(range|text|search)"/.test(l)) return;
        const ctx = lines.slice(Math.max(0, i - 3), i + 2).join('\n');
        expect(ctx, `${f}:${i + 1}`).toMatch(/<label|aria-label=|aria-labelledby=|htmlFor=/);
      });
    }
  });
  it('nút chỉ có icon (một ký tự) phải có aria-label', () => {
    for (const f of FILES) {
      for (const m of src(f).matchAll(/<button\b([^<>]*)>\s*([^<>\s{])\s*<\/button>/g))
        expect(m[1], `${f}: ${m[0]}`).toMatch(/aria-label=/);
    }
  });
});

describe('panel: trạng thái động', () => {
  it('các panel có thông báo trạng thái dùng aria-live hoặc role=status/alert', () => {
    for (const f of ['settings/SettingsPanel', 'backup/BackupPanel', 'tattoo/TattooStudio', 'profile/ProfilePanel', 'net/ConnectionBanner', 'emotes/social/SocialPrompt', 'photo/PhotoMode']) {
      expect(src(`src/${f}.tsx`)).toMatch(/aria-live=|role="status"|role="alert"|role=\{/);
    }
  });
  it('dialog modal trong SettingsPanel và WardrobeRoom đóng bằng Esc', () => {
    expect(src('src/settings/SettingsPanel.tsx')).toMatch(/Escape|useFocusTrap|shouldCloseOnKey|wardrobeKey/);
    expect(src('src/wardrobe/WardrobeRoom.tsx')).toMatch(/Escape|useFocusTrap|shouldCloseOnKey|wardrobeKey/);
  });
});

describe('css: tương phản và chuyển động', () => {
  const ratio = (fg: string, bg: string) => contrastRatio(parseColor(fg)!, parseColor(bg)!);
  const pairs: Array<[string, string, string]> = [
    ['lỗi hồ sơ trên nền trắng', '#b42318', '#ffffff'],
    ['thành công hồ sơ trên nền trắng', '#067647', '#ffffff'],
    ['chữ settings trên nền hộp thoại', '#eeeeff', '#1e2127'],
    ['tab chọn settings', '#ffffff', '#2563eb'],
    ['ghi chú settings', '#99aaaa', '#1e2127'],
    ['cảnh báo settings', '#eeeeff', '#4a3a12'],
    ['việc cần làm settings', '#ff77dd', '#1e2127'],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name} đạt 4.5:1`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('màu css khai báo khớp các cặp trên', () => {
    expect(css('src/profile/profile.css')).toContain('#b42318');
    expect(css('src/settings/settings.css')).toContain('#1e2127');
  });
  it('settings.css tôn trọng prefers-reduced-motion', () => {
    expect(css('src/settings/settings.css')).toMatch(/prefers-reduced-motion/);
  });
  it('css có animation thì có prefers-reduced-motion', () => {
    for (const f of ['help/help.css', 'profile/profile.css', 'emotes/emotes.css', 'settings/settings.css']) {
      const c = css(`src/${f}`);
      if (/animation\s*:|@keyframes/.test(c)) expect(c, f).toMatch(/prefers-reduced-motion/);
    }
  });
});
