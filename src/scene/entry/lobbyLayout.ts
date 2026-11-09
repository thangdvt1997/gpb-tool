// Sảnh mở chibi (concept D, chủ dự án chọn 09/11/2026). Spec: /home/cc/handoff-20261107/design/SPEC_sanh_mo_chibi.md.
// Thuần dữ liệu (không React): bảng màu, thảm tròn, hai cây lớn ở góc, dải cửa sổ trên hai mặt lõi thang nhìn vào sảnh.
// OpenLobby.tsx vẽ, ITOffice lấy ô chặn của cây từ lobbyBlockers.
//
// Sảnh theo bản vẽ (docs/FLOORPLAN_IT.md, hành lang 'lobby'): x 20.5–30.5, y 15.5–18.9.
// - Mặt Tây x 20.5: lõi core_lift1, cửa thang lift7_west (y 15.7–18.1). Mặt Đông x 30.5: lõi core_lift2,
//   bảng ghi danh checkin_board (y 16.1–17.9, cao 1,2 m). Mặt Bắc mở ra hành lang giữa qua lối link (x 25.6–27.0).
// - Quầy service_desk (x 23.0–27.5, y 16.0–17.2) giữ nguyên chỗ: vị trí gốc của nó còn nằm trong service layout
//   (defaults) và các tính năng tương tác, sắp xếp nội thất dùng nó. Người dùng vẫn dời được bằng chế độ sắp xếp.

import { toWorldX, toWorldZ, type Rect } from '../layout';

/** Bảng màu concept D (hex), lấy nguyên từ spec. */
export const LOBBY_PALETTE = {
  wall: '#EAF6FF',
  sky: '#CFEFFF',
  hill: '#B8E8C4',
  cloud: '#FFFFFF',
  sun: '#FFE58F',
  floor: '#F9E0BF',
  floorGrain: '#EFCFA6',
  rug: '#BDEBDD',
  rugCore: '#D9F4EA',
  pot: '#FF8A7A',
  leaf: '#7ED6B8',
  leafDark: '#5CC6A0',
} as const;

/** Sảnh theo bản vẽ (m): x0, x1, y0, y1. */
export const LOBBY_PLAN = [20.5, 30.5, 15.5, 18.9] as const;

/** Thảm tròn giữa sảnh (bản vẽ, m). Chỉ là lớp phủ sàn, không chặn đi lại; nằm dưới mép Nam quầy. */
export const LOBBY_RUG = { x: 25.5, y: 17.35, r: 1.45, core: 1.0 } as const;

/** Cây lớn: tâm chậu (bản vẽ, m), bán kính chậu và tán (m). */
export interface LobbyPlant {
  x: number;
  y: number;
  pot: number;
  crown: number;
}

/**
 * Hai cây lớn ở hai góc Nam của sảnh, sát hai lõi thang. Góc Bắc không đặt: cửa lift7_west (y 15.7–18.1)
 * và lối link phía Bắc cần trống. Chậu ở y 18.45: Nam cửa thang Tây (18.1) và bảng ghi danh (17.9).
 * Chậu Tây dừng ở x 21.18, sát Tây cây plant_lobby (itFixtures.ts, x 21.2–22.0, chỉ hiện khi bật chủ đề).
 */
export const LOBBY_PLANTS: readonly LobbyPlant[] = [
  { x: 20.9, y: 18.45, pot: 0.28, crown: 0.5 },
  { x: 30.1, y: 18.45, pot: 0.28, crown: 0.5 },
];

/** Ô chặn của chậu cây (thế giới). Tán cao trên đầu gối nên chỉ chặn theo chậu. */
export function lobbyBlockers(): Rect[] {
  return LOBBY_PLANTS.map((p) => ({
    minX: toWorldX(p.x - p.pot),
    maxX: toWorldX(p.x + p.pot),
    minZ: toWorldZ(p.y - p.pot),
    maxZ: toWorldZ(p.y + p.pot),
  }));
}

/**
 * Dải cửa sổ trời trên mặt lõi nhìn vào sảnh (tranh tường kiểu cửa sổ, dày 2 cm, không chặn đi lại).
 * Đặt trên cửa thang (cao 2,6 m) và bảng ghi danh (đỉnh 2,15 m), dưới trần 2,97 m nên không che chi tiết nào. Đơn vị bản vẽ cho trục dọc tường.
 * wallX: mặt tường (bản vẽ), dir: hướng pháp tuyến vào sảnh (+1 là Đông).
 */
export interface LobbyWindow {
  wallX: number;
  dir: 1 | -1;
  y0: number;
  y1: number;
  /** Đáy và đỉnh dải (m, theo chiều cao). */
  bottom: number;
  top: number;
  /** Số ô (thanh dọc chia đều). */
  panes: number;
}

export const LOBBY_WINDOWS: readonly LobbyWindow[] = [
  { wallX: 20.5, dir: 1, y0: 15.6, y1: 18.4, bottom: 2.64, top: 2.93, panes: 3 },
  { wallX: 30.5, dir: -1, y0: 15.6, y1: 18.4, bottom: 2.24, top: 2.93, panes: 4 },
];

/**
 * Lối đi chính trong sảnh và hành lang (bản vẽ, m), phải trống mọi vật đặc. Bề rộng tính cả bán kính nhân vật.
 * - spawnSouth: dải Nam sảnh từ cửa thang Tây tới bảng ghi danh, chứa điểm xuất hiện (25.0, 18.0).
 * - link: lối nối sảnh lên hành lang giữa.
 * - central: hành lang giữa (đường chuỗi cảnh y 13.4), trừ đầu Tây nơi đặt máy in phòng In ấn.
 */
export const LOBBY_MAIN_PATHS: ReadonlyArray<{ id: string; rect: readonly [number, number, number, number] }> = [
  { id: 'spawnSouth', rect: [21.3, 29.7, 17.25, 18.15] },
  { id: 'link', rect: [25.6, 27.0, 13.9, 16.0] },
  { id: 'central', rect: [19.4, 29.9, 12.9, 13.9] },
];
