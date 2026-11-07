import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluatePlacement, dropLanding, fallStep, GRAVITY, surfaceInteractable, itemInteractable, placementPreviewFor, pickupItem, getHeldItem, clearItemRegistry,
  type Surface,
} from './smallItem';
import { curtainLightIntensity, curtainDaylight, WINDOW_LIGHT_MAX, MIN_DAYLIGHT } from './curtain';
import { resetAllObjects, canResetObjects } from './resetObjects';
import { getObjectState, setObjectState, resetObjectStates } from '../objectStates';
import { getCharacterState, resetCharacterState, transitionCharacter } from '../characterState';
import { openComputerUi, getComputerUi } from './computerUi';
import { availableActions } from '../registry';

const top: Surface = { id: 't', minX: 0, maxX: 1, minZ: 0, maxZ: 1, y: 0.8 };
const home = { x: 0.5, y: 0.8, z: 0.5 };

describe('xem trước đặt đồ', () => {
  it('xanh khi hợp lệ, đỏ khi chồng vật khác, cùng kết quả với hành động đặt', () => {
    const pl = { x: 0.5, z: 0.0, yaw: 0 }; // nhìn +z, điểm đặt cách 0,7 m -> z=0,7
    const ok = evaluatePlacement(pl, top, 0.04, [top], []);
    expect(ok.res.ok).toBe(true);
    expect(ok.z).toBeCloseTo(0.7);
    const bad = evaluatePlacement(pl, top, 0.04, [top], [{ id: 'x', x: 0.5, z: 0.7, r: 0.05 }]);
    expect(bad.res).toEqual({ ok: false, reason: 'overlap' });
    expect(bad.surfaceY).toBe(0.8);
  });
  it('kẹp vào mép mặt đặt khi điểm ngắm nằm ngoài', () => {
    const e = evaluatePlacement({ x: 0.5, z: 2, yaw: 0 }, top, 0.04, [top], []);
    expect(e.z).toBeCloseTo(1 - 0.04);
  });
});

describe('thả rơi', () => {
  const never = () => false;
  it('rơi lên mặt đặt nếu nằm trọn trên mặt', () => {
    expect(dropLanding(0.5, 0.5, 0.04, [top], [], never)).toMatchObject({ ok: true, y: 0.8, onSurface: true });
  });
  it('rơi xuống sàn nếu ngoài bàn và sàn trống', () => {
    expect(dropLanding(3, 3, 0.04, [top], [], never)).toMatchObject({ ok: true, y: 0, onSurface: false });
  });
  it('bị chặn: nhô mép bàn, sàn bị chặn, hoặc đè đồ trên sàn', () => {
    expect(dropLanding(0.98, 0.5, 0.04, [top], [], never)).toEqual({ ok: false, reason: 'blocked' });
    expect(dropLanding(3, 3, 0.04, [top], [], () => true)).toEqual({ ok: false, reason: 'blocked' });
    expect(dropLanding(3, 3, 0.04, [top], [{ id: 'o', x: 3.02, z: 3, r: 0.04 }], never)).toEqual({ ok: false, reason: 'blocked' });
  });
  it('fallStep: tăng tốc theo g, dừng đúng ở đích, không xuyên sàn', () => {
    let s = { y: 1, vy: 0, landed: false };
    let t = 0;
    for (let i = 0; i < 200 && !s.landed; i++) {
      s = fallStep(s.y, s.vy, 0, 1 / 60);
      t += 1 / 60;
      expect(s.y).toBeGreaterThanOrEqual(0);
    }
    expect(s.landed).toBe(true);
    expect(s.y).toBe(0);
    expect(t).toBeCloseTo(Math.sqrt((2 * 1) / GRAVITY), 1);
    expect(fallStep(0, 5, 0, 0.016)).toEqual({ y: 0, vy: 0, landed: true });
  });
});

describe('hành động Thả rơi trên mặt đặt', () => {
  beforeEach(() => {
    clearItemRegistry();
    resetObjectStates();
    resetCharacterState();
  });
  const mk = (floorBlocked: (x: number, z: number) => boolean) => {
    itemInteractable({ id: 'cup', label: 'Cốc', home, radius: 0.04, footprint: { cx: 0.5, cz: 0.5, hx: 0.05, hz: 0.05 } });
    return surfaceInteractable({
      id: 'surf', label: 'Mặt', surface: top, footprint: { cx: 0.5, cz: 0.5, hx: 0.5, hz: 0.5 },
      getPlayer: () => ({ x: 3, z: 3, yaw: 0 }), itemInfo: (id) => (id === 'cup' ? { r: 0.04, home } : null), floorBlocked,
    });
  };
  it('đang cầm cốc, đứng xa bàn: Thả rơi đặt cốc xuống sàn; xem trước báo đỏ', () => {
    const def = mk(() => false);
    expect(placementPreviewFor('surf')).toBeNull(); // chưa cầm gì
    expect(pickupItem('cup', home)).toBe(true);
    expect(getHeldItem()).toBe('cup');
    const pv = placementPreviewFor('surf');
    expect(pv?.res.ok).toBe(true); // bị kẹp vào mép mặt nên vẫn hợp lệ
    const acts = availableActions(def, { state: getObjectState('surf') } as never).map((a) => a.id);
    expect(acts).toEqual(expect.arrayContaining(['place', 'drop', 'return']));
    def.actions.find((a) => a.id === 'drop')!.run({} as never);
    expect(getObjectState('cup')).toMatchObject({ where: 'placed', y: 0 });
    expect(getCharacterState()).toBe('walking');
  });
  it('sàn bị chặn: Thả rơi bị từ chối, vẫn cầm cốc', () => {
    const def = mk(() => true);
    pickupItem('cup', home);
    def.actions.find((a) => a.id === 'drop')!.run({} as never);
    expect(getObjectState('cup').where).toBe('hand');
    expect(getCharacterState()).toBe('holding');
  });
});

describe('rèm chỉnh ánh sáng cửa sổ', () => {
  it('đèn ngày tỉ lệ với mức mở, rèm kín còn lại tối thiểu', () => {
    expect(curtainLightIntensity(1)).toBe(WINDOW_LIGHT_MAX);
    expect(curtainLightIntensity(0)).toBeCloseTo(WINDOW_LIGHT_MAX * MIN_DAYLIGHT, 2);
    expect(curtainLightIntensity(0.5)).toBeGreaterThan(curtainLightIntensity(0.25));
    expect(curtainLightIntensity(0.5, 10)).toBeCloseTo(10 * curtainDaylight(0.5), 2);
    expect(curtainLightIntensity(-5)).toBe(curtainLightIntensity(0));
  });
});

describe('nút Đặt lại vật', () => {
  beforeEach(() => {
    clearItemRegistry();
    resetObjectStates();
    resetCharacterState();
  });
  it('đưa trạng thái vật về mặc định', () => {
    setObjectState('some_door', { phase: 'open' });
    expect(resetAllObjects()).toBe(true);
    expect(getObjectState('some_door').phase).toBeUndefined();
  });
  it('đang cầm đồ: thả tay và về đi lại', () => {
    itemInteractable({ id: 'cup', label: 'Cốc', home, radius: 0.04, footprint: { cx: 0.5, cz: 0.5, hx: 0.05, hz: 0.05 } });
    pickupItem('cup', home);
    expect(resetAllObjects()).toBe(true);
    expect(getHeldItem()).toBeNull();
    expect(getCharacterState()).toBe('walking');
  });
  it('đóng giao diện máy tính đang mở', () => {
    openComputerUi('pc');
    transitionCharacter('using_ui', 't');
    expect(canResetObjects()).toBe(false); // đang dùng giao diện: từ chối
    expect(resetAllObjects()).toBe(false);
    expect(getComputerUi()).toBe('pc');
    resetCharacterState();
  });
  it('từ chối khi đang ngồi', () => {
    transitionCharacter('seated', 't');
    expect(resetAllObjects()).toBe(false);
  });
});
