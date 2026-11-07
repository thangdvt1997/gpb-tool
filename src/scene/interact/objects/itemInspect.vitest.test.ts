import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { itemInteractable, pickupItem, returnItem, clearItemRegistry, getHeldItem } from './smallItem';
import { startInspect, stopInspect, getInspect, rotateInspect, toggleInspect, inspectKeyAxis, inspectAnchor, INSPECT_VIEW } from './itemInspect';
import { resetCharacterState, getCharacterState } from '../characterState';
import { resetObjectStates } from '../objectStates';
import { getControls } from '../../controls/session';
import { DEFAULT_BINDINGS } from '../../../settings/schema';

const home = { x: 0.5, y: 0.8, z: 0.5 };

describe('quan sát đồ nhỏ đang cầm', () => {
  beforeEach(() => {
    clearItemRegistry();
    resetObjectStates();
    resetCharacterState();
    itemInteractable({ id: 'cup', label: 'Cốc', home, footprint: { cx: 0.5, cz: 0.5, hx: 0.05, hz: 0.05 } });
  });
  afterEach(() => stopInspect());

  it('không bắt đầu khi không cầm gì', () => {
    expect(startInspect()).toBe(false);
    expect(getInspect().active).toBe(false);
  });

  it('cầm vật thì vào được, khóa nhân vật, thoát thì nhả khóa (camera không bị di chuyển)', () => {
    expect(pickupItem('cup', home)).toBe(true);
    expect(getControls().paused).toBe(false);
    expect(startInspect()).toBe(true);
    expect(getControls().paused).toBe(true);
    stopInspect();
    expect(getControls().paused).toBe(false);
    expect(getHeldItem()).toBe('cup');
    expect(getCharacterState()).toBe('holding');
  });

  it('xoay: yaw quấn vòng, pitch kẹp; ngoài chế độ thì bỏ qua', () => {
    rotateInspect(1, 1);
    expect(getInspect().yaw).toBe(0);
    pickupItem('cup', home);
    startInspect();
    rotateInspect(Math.PI * 2 + 0.5, 9);
    expect(getInspect().yaw).toBeCloseTo(0.5);
    expect(getInspect().pitch).toBe(INSPECT_VIEW.maxPitch);
  });

  it('toggle bật rồi tắt', () => {
    pickupItem('cup', home);
    expect(toggleInspect()).toBe(true);
    expect(toggleInspect()).toBe(false);
    expect(getInspect().active).toBe(false);
  });

  it('tự thoát khi vật không còn trên tay (trả về chỗ cũ)', () => {
    pickupItem('cup', home);
    startInspect();
    returnItem('cup', home);
    expect(getInspect().active).toBe(false);
    expect(getControls().paused).toBe(false);
  });

  it('phím xoay và điểm đặt trước camera', () => {
    expect(inspectKeyAxis('ArrowLeft')).toEqual({ yaw: -1, pitch: 0 });
    expect(inspectKeyAxis('KeyS')).toEqual({ yaw: 0, pitch: 1 });
    expect(inspectKeyAxis('KeyQ')).toBeNull();
    expect(inspectAnchor({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 0.5)).toEqual({ x: 1, y: 2, z: 3.5 });
  });

  it('phím mặc định gợi ý là R, không trùng phím gameplay khác', () => {
    expect(DEFAULT_BINDINGS.inspectItem).toBe('KeyR');
    const others = Object.entries(DEFAULT_BINDINGS).filter(([k]) => k !== 'inspectItem').map(([, v]) => v);
    expect(others).not.toContain('KeyR');
  });
});
