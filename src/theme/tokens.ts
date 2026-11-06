// Bảng màu cho năm giao diện. Mọi giá trị là hex.
//
// Tỉ lệ tương phản đo bằng công thức WCAG 2.x (chữ thường cần >= 4.5:1,
// chữ lớn và thành phần giao diện cần >= 3:1). Các số trong comment là kết quả đã đo.

export type ThemeName = 'office-day' | 'after-work' | 'tet' | 'midautumn' | 'party';

export interface ThemeTokens {
  bg: string; // nền trang
  panel: string; // nền panel và thẻ
  line: string; // đường kẻ, viền
  text: string; // chữ chính
  muted: string; // chữ phụ
  accent: string; // màu nhấn: nút, viền focus
  accentText: string; // chữ trên nền accent
  ok: string; // trạng thái bình thường
  warn: string; // cảnh báo
  down: string; // sự cố
  sceneFloor: string; // sàn cảnh 3D
  sceneWall: string; // tường cảnh 3D
  sceneAccent: string; // điểm nhấn cảnh 3D
}

/**
 * Bảng màu chi tiết của cảnh văn phòng ban ngày (office-day), lấy từ docs/design/REAL_OFFICE_STYLE.md mục 2.
 * Đây là phần mở rộng của office-day cho vật liệu 3D, không phải theme riêng. Mọi giá trị là ước lượng,
 * cần chỉnh lại trên màn hình thật. Màu băng rôn chỉ dùng cho đạo cụ, không dùng làm màu thương hiệu.
 */
export const OFFICE_DAY_SCENE = {
  floorStone: '#a9abaa',
  floorVein: '#cdd0d0',
  floorGrout: '#85888a',
  wallPaint: '#eceef0',
  ceilingTile: '#e4e6e9',
  ceilingGrid: '#d3d6da',
  ceilingVent: '#c9cdd2',
  lightPanel: '#f4f9ff',
  woodDesktop: '#ddd2be',
  woodPedestal: '#d5c6a9',
  woodEdge: '#c9b998',
  metalFrame: '#a2a5a8',
  glassCabinet: '#dde6ea',
  bannerRed: '#e0402c',
  bannerOrange: '#f2713a',
  bannerText: '#ffffff',
  chairSeat: '#1d1d22',
  chairMesh: '#2b2b31',
  waterBottle: '#8db6cc',
  dispenser: '#f1f2f2',
  fireRed: '#b4202c',
  plantLeaf: '#2f5a2c',
  plantLeafLight: '#4f7f3e',
  potWhite: '#f3f3f1',
  binBody: '#5b6066',
  binBag: '#c8262c',
} as const;

export const THEME_NAMES: readonly ThemeName[] = ['office-day', 'after-work', 'tet', 'midautumn', 'party'];

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  // Sáng, dùng trong giờ hành chính.
  // text/panel 17.85, text/bg 15.88, muted/panel 7.56, muted/bg 6.72,
  // accentText(#ffffff)/accent 6.70, accent/panel 6.70, accent/bg 5.96,
  // ok/panel 7.13, ok/bg 6.34, warn/panel 7.09, warn/bg 6.31,
  // down/panel 6.47, down/bg 5.76, line/panel không yêu cầu (trang trí).
  'office-day': {
    bg: '#eef2f7',
    panel: '#ffffff',
    line: '#cfd8e3',
    text: '#0f172a',
    muted: '#4b5563',
    accent: '#1d4ed8',
    accentText: '#ffffff',
    ok: '#166534',
    warn: '#92400e',
    down: '#b91c1c',
    // Cảnh 3D theo văn phòng thật (docs/design/REAL_OFFICE_STYLE.md mục 2): sàn đá xám, tường sơn trắng.
    sceneFloor: '#a9abaa',
    sceneWall: '#eceef0',
    sceneAccent: '#1d4ed8',
  },

  // Tối, giống giao diện hiện tại của ứng dụng.
  // text/panel 14.09, text/bg 15.61, muted/panel 6.93, muted/bg 7.68,
  // accentText(#0b1020)/accent 5.89, accent/panel 5.14, accent/bg 5.70,
  // ok/panel 6.94, ok/bg 7.69, warn/panel 9.07, warn/bg 10.05,
  // down/panel 5.96, down/bg 6.60.
  'after-work': {
    bg: '#0f1424',
    panel: '#171e33',
    line: '#2a3555',
    text: '#e8edf7',
    muted: '#9aa8c7',
    accent: '#4f8cff',
    accentText: '#0b1020',
    ok: '#2fbf71',
    warn: '#f2b632',
    down: '#ff6b6b',
    sceneFloor: '#1b2340',
    sceneWall: '#232c4a',
    sceneAccent: '#4f8cff',
  },

  // Đỏ đậm và vàng, dịp Tết.
  // text/panel 13.53, text/bg 15.43, muted/panel 11.13, muted/bg 12.69,
  // accentText(#3a0b0e)/accent 10.14, accent/panel 8.89, accent/bg 10.14,
  // ok/panel 9.72, ok/bg 11.09, warn/panel 10.35, warn/bg 11.80,
  // down/panel 7.40, down/bg 8.44.
  tet: {
    bg: '#3a0b0e',
    panel: '#4d1116',
    line: '#8a5a1f',
    text: '#fff3d6',
    muted: '#f6dca0',
    accent: '#f2c14e',
    accentText: '#3a0b0e',
    ok: '#8ee3a5',
    warn: '#ffd166',
    down: '#ff9b9b',
    sceneFloor: '#5a1418',
    sceneWall: '#7a1d21',
    sceneAccent: '#f2c14e',
  },

  // Chàm đêm và cam đèn lồng, dịp Trung thu.
  // text/panel 13.85, text/bg 15.83, muted/panel 9.87, muted/bg 11.28,
  // accentText(#1a1640)/accent 8.30, accent/panel 7.26, accent/bg 8.30,
  // ok/panel 10.61, ok/bg 12.13, warn/panel 10.34, warn/bg 11.81,
  // down/panel 7.88, down/bg 9.01.
  midautumn: {
    bg: '#1a1640',
    panel: '#251f56',
    line: '#4d43a0',
    text: '#fff6e0',
    muted: '#d6cdf5',
    accent: '#ff9f1c',
    accentText: '#1a1640',
    ok: '#86efac',
    warn: '#fcd34d',
    down: '#fda4af',
    sceneFloor: '#2a2360',
    sceneWall: '#352c74',
    sceneAccent: '#ffb84d',
  },

  // Tím đậm và hồng, chỉ bật khi ghi đè thủ công.
  // text/panel 15.89, text/bg 17.81, muted/panel 10.89, muted/bg 12.20,
  // accentText(#140a26)/accent 6.27, accent/panel 5.59, accent/bg 6.27,
  // ok/panel 11.89, ok/bg 13.33, warn/panel 13.05, warn/bg 14.63,
  // down/panel 6.81, down/bg 7.63.
  party: {
    bg: '#140a26',
    panel: '#211341',
    line: '#6b2fb0',
    text: '#fbf5ff',
    muted: '#d9c7f5',
    accent: '#ff4fa3',
    accentText: '#140a26',
    ok: '#5ef38c',
    warn: '#ffe066',
    down: '#ff7a8a',
    sceneFloor: '#2b1650',
    sceneWall: '#3b1d6b',
    sceneAccent: '#35e0ff',
  },
};
