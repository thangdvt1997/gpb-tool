import { THEME_TOKENS } from './tokens';
import type { ThemeName } from './tokens';

// Ngày mùng 1 Tết Nguyên Đán (dương lịch), dạng [tháng, ngày].
// Đối chiếu lịch âm dương thông dụng cho 2026-2030. Nên kiểm lại với lịch chính thức hằng năm.
const TET_FIRST_DAY: Record<number, [number, number]> = {
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
};

// Ngày rằm tháng 8 âm lịch (Tết Trung thu), dạng [tháng, ngày].
// Chỉ điền các năm chắc chắn. Năm chưa có trong bảng thì không bật theme Trung thu.
// Cần bổ sung 2027 trở đi sau khi kiểm lịch âm.
const MIDAUTUMN_FULL_MOON: Record<number, [number, number]> = {
  2025: [10, 6],
  2026: [9, 25],
};

// Số ngày trước và sau mốc được dùng để bật theme. Đây là ước lượng.
const TET_WINDOW = { before: 20, after: 5 };
const MIDAUTUMN_WINDOW = { before: 7, after: 1 };

const OFFICE_START_MINUTES = 8 * 60; // 08:00
const OFFICE_END_MINUTES = 17 * 60 + 30; // 17:30

// Số ngày kể từ epoch, tính theo ngày dương lịch và không phụ thuộc giờ hay múi giờ.
function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function inWindow(today: number, anchor: number, range: { before: number; after: number }): boolean {
  const diff = today - anchor;
  return diff >= -range.before && diff <= range.after;
}

// Ước lượng độ sáng của hex để chọn color-scheme cho form control và thanh cuộn.
function isDarkHex(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// Đặt các biến CSS và thuộc tính data-theme lên phần tử gốc. Không lưu gì vào localStorage.
export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement): void {
  const t = THEME_TOKENS[name];
  const style = root.style;
  style.setProperty('--bg', t.bg);
  style.setProperty('--panel', t.panel);
  style.setProperty('--line', t.line);
  style.setProperty('--text', t.text);
  style.setProperty('--muted', t.muted);
  style.setProperty('--accent', t.accent);
  style.setProperty('--accent-text', t.accentText);
  style.setProperty('--ok', t.ok);
  style.setProperty('--warn', t.warn);
  style.setProperty('--down', t.down);
  style.setProperty('color-scheme', isDarkHex(t.bg) ? 'dark' : 'light');
  root.dataset.theme = name;
}

// Chọn theme theo lịch. Ước lượng, không phải lịch chính thức.
// Thứ tự ưu tiên: Tết, Trung thu, giờ hành chính, ngoài giờ.
// Theme 'party' không tự chọn, chỉ được đặt khi ghi đè thủ công.
export function currentTheme(date: Date = new Date()): ThemeName {
  const year = date.getFullYear();
  const today = dayNumber(year, date.getMonth() + 1, date.getDate());

  const tet = TET_FIRST_DAY[year];
  if (tet && inWindow(today, dayNumber(year, tet[0], tet[1]), TET_WINDOW)) {
    return 'tet';
  }

  const moon = MIDAUTUMN_FULL_MOON[year];
  if (moon && inWindow(today, dayNumber(year, moon[0], moon[1]), MIDAUTUMN_WINDOW)) {
    return 'midautumn';
  }

  // Giờ theo múi giờ của trình duyệt. Người dùng ở Việt Nam sẽ dùng UTC+7.
  const weekday = date.getDay();
  const isWeekday = weekday >= 1 && weekday <= 5;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const isOfficeHours = minutes >= OFFICE_START_MINUTES && minutes < OFFICE_END_MINUTES;

  return isWeekday && isOfficeHours ? 'office-day' : 'after-work';
}
