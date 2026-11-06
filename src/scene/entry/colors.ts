// Màu của cụm lối vào tầng 7. Mọi màu lấy từ src/theme/tokens.ts.
// Vật liệu trung tính (thép, đá, đồng phục) lấy từ bảng 'office-day' cho mọi theme để thang máy và bảo vệ
// trông giống nhau quanh năm. Màu nhấn (đèn, tia quét, kính) đi theo theme đang bật.

import * as THREE from 'three';
import { SKIN_TONES } from '../../avatar/appearance';
import { THEME_TOKENS, type ThemeName } from '../../theme/tokens';

const BASE = THEME_TOKENS['office-day'];
const NIGHT = THEME_TOKENS['after-work'];
const GOLD = THEME_TOKENS.tet.accent;

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Trộn hai màu hex theo tỉ lệ k (0: a, 1: b). Trả hex. */
export function mix(a: string, b: string, k: number): string {
  return `#${tmpA.set(a).lerp(tmpB.set(b), k).getHexString()}`;
}

export interface EntryColors {
  steel: string;
  steelLight: string;
  steelDark: string;
  stone: string;
  dark: string;
  deskBody: string;
  deskTop: string;
  cabinFloor: string;
  uniform: string;
  uniformDark: string;
  shirt: string;
  gold: string;
  skin: string;
  led: string;
  ok: string;
  down: string;
  light: string;
  screen: string;
  glass: string;
  beam: string;
  indicatorBg: string;
  indicatorGlyph: string;
  cabinWall: string;
}

export function entryColors(theme: ThemeName): EntryColors {
  const t = THEME_TOKENS[theme];
  return {
    steel: BASE.line,
    steelLight: mix(BASE.line, BASE.panel, 0.45),
    steelDark: mix(BASE.muted, BASE.line, 0.25),
    stone: mix(t.sceneWall, BASE.text, 0.4),
    dark: mix(BASE.text, BASE.muted, 0.15),
    deskBody: mix(BASE.text, t.sceneWall, 0.2),
    deskTop: mix(BASE.line, BASE.panel, 0.35),
    cabinFloor: mix(BASE.text, BASE.muted, 0.3),
    uniform: mix(BASE.text, BASE.muted, 0.2),
    uniformDark: BASE.text,
    shirt: BASE.panel,
    gold: GOLD,
    skin: SKIN_TONES[2],
    led: mix(t.sceneAccent, BASE.panel, 0.25),
    ok: mix(t.ok, BASE.panel, 0.2),
    down: mix(t.down, BASE.panel, 0.15),
    light: mix(BASE.panel, THEME_TOKENS.tet.text, 0.5),
    screen: mix(t.sceneAccent, BASE.panel, 0.5),
    glass: mix(t.sceneAccent, BASE.panel, 0.7),
    beam: mix(t.sceneAccent, BASE.panel, 0.35),
    indicatorBg: NIGHT.bg,
    indicatorGlyph: mix(NIGHT.warn, BASE.panel, 0.1),
    cabinWall: mix(NIGHT.panel, BASE.line, 0.15),
  };
}
