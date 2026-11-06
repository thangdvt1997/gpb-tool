import { describe, expect, it } from 'vitest';
import { analogCurve, applyDeadzone, mapGamepad, type PadState } from './gamepad';
import { confirmSwap, keyLabel, resetAll, resetOne, resolveCapture } from './rebindFlow';
import { DEFAULT_BINDINGS, defaultSettings, findConflicts, sanitize } from './schema';

const cfg = { deadzone: 0.2, sensitivity: 1, invertX: false, invertY: false };
function pad(axes: number[], pressed: number[] = []): PadState {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { mapping: 'standard', axes, buttons };
}

describe('vùng chết', () => {
  it('dưới ngưỡng bằng 0', () => expect(applyDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 }));
  it('co giãn từ 0 sau ngưỡng', () => {
    const r = applyDeadzone(0.6, 0, 0.2);
    expect(r.x).toBeCloseTo(0.5);
  });
  it('tối đa 1 theo đường chéo', () => {
    const r = applyDeadzone(1, 1, 0.2);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(1);
  });
  it('NaN coi như 0', () => expect(applyDeadzone(NaN, 1, 0.2)).toEqual({ x: 0, y: 0 }));
  it('đường cong giữ dấu', () => {
    expect(analogCurve(-0.5)).toBeCloseTo(-0.25);
    expect(analogCurve(0.5)).toBeCloseTo(0.25);
  });
});

describe('map gamepad', () => {
  it('cần trái lên là tiến', () => {
    const a = mapGamepad(pad([0, -1, 0, 0]), cfg)!;
    expect(a.move.forward).toBeCloseTo(1);
    expect(a.move.strafe).toBeCloseTo(0);
  });
  it('cần trái phải là strafe dương', () => expect(mapGamepad(pad([1, 0, 0, 0]), cfg)!.move.strafe).toBeCloseTo(1));
  it('trong vùng chết không di chuyển', () => {
    const a = mapGamepad(pad([0.1, -0.1, 0.1, 0.1]), cfg)!;
    expect(a.move).toEqual({ forward: -0, strafe: 0 });
    expect(a.look).toEqual({ x: 0, y: 0 });
  });
  it('mapping lạ trả null', () => expect(mapGamepad({ ...pad([0, 0, 0, 0]), mapping: '' }, cfg)).toBeNull());
  it('nút A nhảy, X tương tác, RT chạy', () => {
    const a = mapGamepad(pad([0, 0, 0, 0], [0, 2, 7]), cfg)!;
    expect(a.jump && a.interact && a.run).toBe(true);
    expect(a.cancel).toBe(false);
  });
  it('d-pad kẹp độ dài 1', () => {
    const a = mapGamepad(pad([0, 0, 0, 0], [12, 15]), cfg)!;
    expect(Math.hypot(a.move.forward, a.move.strafe)).toBeCloseTo(1);
  });
  it('đảo trục Y và độ nhạy cho look', () => {
    const base = mapGamepad(pad([0, 0, 0, 1]), { ...cfg, sensitivity: 2 })!;
    const inv = mapGamepad(pad([0, 0, 0, 1]), { ...cfg, sensitivity: 2, invertY: true })!;
    expect(base.look.y).toBeCloseTo(2);
    expect(inv.look.y).toBeCloseTo(-2);
  });
});

describe('luồng đổi phím', () => {
  const b = defaultSettings().bindings;
  it('Esc hủy', () => expect(resolveCapture(b, 'jump', 'Escape').kind).toBe('cancelled'));
  it('phím giữ riêng không hợp lệ', () => expect(resolveCapture(b, 'jump', 'F5').kind).toBe('invalid'));
  it('gán phím trống', () => {
    const r = resolveCapture(b, 'jump', 'KeyJ');
    expect(r.kind === 'applied' && r.bindings.jump).toBe('KeyJ');
  });
  it('cùng phím là unchanged', () => expect(resolveCapture(b, 'jump', 'Space').kind).toBe('unchanged'));
  it('xung đột báo action kia', () => {
    const r = resolveCapture(b, 'jump', 'KeyW');
    expect(r).toEqual({ kind: 'conflict', code: 'KeyW', with: 'moveForward' });
  });
  it('hoán đổi không còn xung đột', () => {
    const n = confirmSwap(b, 'jump', 'moveForward');
    expect(n.jump).toBe('KeyW');
    expect(n.moveForward).toBe('Space');
    expect(findConflicts(n)).toEqual([]);
  });
  it('khác ngữ cảnh không xung đột', () => {
    expect(resolveCapture(b, 'cancel', 'KeyW').kind).toBe('applied');
  });
  it('đặt lại một phím khi phím mặc định bị chiếm thì hoán đổi', () => {
    const n = resetOne({ ...b, jump: 'KeyW', moveForward: 'Space' }, 'jump');
    expect(n.jump).toBe('Space');
    expect(n.moveForward).toBe('KeyW');
  });
  it('đặt lại tất cả', () => expect(resetAll()).toEqual(DEFAULT_BINDINGS));
  it('nhãn phím', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowUp')).toBe('Mũi tên lên');
  });
});

describe('schema gamepad/display', () => {
  it('kẹp vùng chết và độ nhạy, sai kiểu dùng mặc định', () => {
    const s = sanitize({ gamepad: { deadzone: 9, sensitivity: 'x' }, display: { reducedMotion: 1 } });
    expect(s.gamepad.deadzone).toBe(0.5);
    expect(s.gamepad.sensitivity).toBe(1);
    expect(s.display.reducedMotion).toBe(false);
  });
});
