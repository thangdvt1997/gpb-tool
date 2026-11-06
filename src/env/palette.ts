// Bảng màu hex cho các phong cách trang trí. Dùng chung cho mọi module trong src/env.
// Mỗi phong cách có: tường, sàn, gỗ, kim loại và ba màu điểm nhấn.

export type ThemeName = 'office-day' | 'after-work' | 'tet' | 'midautumn' | 'party';

export interface Palette {
  wall: string;
  floor: string;
  wood: string;
  metal: string;
  accent: string;
  accent2: string;
  accent3: string;
  glass: string;
  fabric: string;
  plant: string;
  ink: string;
}

export const palettes: Record<ThemeName, Palette> = {
  'office-day': {
    wall: '#f3f4f6',
    floor: '#d9dde3',
    wood: '#d9b07c',
    metal: '#9aa3ad',
    accent: '#2b6cb0',
    accent2: '#2f855a',
    accent3: '#dd6b20',
    glass: '#cfe8f5',
    fabric: '#3b5b7a',
    plant: '#3f9b4f',
    ink: '#1f2937',
  },
  'after-work': {
    wall: '#2a2633',
    floor: '#3a3340',
    wood: '#7a4f2e',
    metal: '#6b7280',
    accent: '#f59e0b',
    accent2: '#ec4899',
    accent3: '#8b5cf6',
    glass: '#3b4a5e',
    fabric: '#4a3f5c',
    plant: '#2f6b4f',
    ink: '#f8fafc',
  },
  tet: {
    wall: '#fbeedb',
    floor: '#e0b98a',
    wood: '#8b4a2b',
    metal: '#c9a227',
    accent: '#d7263d',
    accent2: '#f4c430',
    accent3: '#ff7f50',
    glass: '#f7d9b0',
    fabric: '#9b1c1c',
    plant: '#2e7d32',
    ink: '#3b1f1f',
  },
  midautumn: {
    wall: '#f5e6c8',
    floor: '#d8b98a',
    wood: '#7b5a3a',
    metal: '#b08d57',
    accent: '#e76f51',
    accent2: '#f4a261',
    accent3: '#e9c46a',
    glass: '#fbe9c6',
    fabric: '#7c4a2d',
    plant: '#4b7f52',
    ink: '#2d1b10',
  },
  party: {
    wall: '#1e1b3a',
    floor: '#2b2650',
    wood: '#6d4c41',
    metal: '#94a3b8',
    accent: '#f43f5e',
    accent2: '#22d3ee',
    accent3: '#facc15',
    glass: '#312e81',
    fabric: '#4c1d95',
    plant: '#16a34a',
    ink: '#f5f3ff',
  },
};
