import { describe, expect, it } from 'vitest';
import { getControls, holdPause, setPaused } from './session';

describe('holdPause', () => {
  it('nhiều lý do: chỉ hết dừng khi mọi nơi nhả', () => {
    const a = holdPause('photo');
    const b = holdPause('wardrobe');
    expect(getControls().paused).toBe(true);
    a();
    expect(getControls().paused).toBe(true);
    b();
    expect(getControls().paused).toBe(false);
  });
  it('nhả hai lần vô hại', () => {
    const a = holdPause('x');
    const b = holdPause('y');
    a();
    a();
    expect(getControls().paused).toBe(true);
    b();
    expect(getControls().paused).toBe(false);
  });
  it('đóng menu Esc không gỡ lý do khác đang giữ', () => {
    const w = holdPause('wardrobe');
    setPaused(true);
    setPaused(false);
    expect(getControls().paused).toBe(true);
    w();
    expect(getControls().paused).toBe(false);
  });
});
