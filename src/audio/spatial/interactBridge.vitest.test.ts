import { describe, expect, it } from 'vitest';
import { bridgeInteractAudio, positionForInteract, sfxForInteract } from './interactBridge';
import type { InteractEvent } from '../../scene/interact/objects/interactEvents';

describe('cầu nối âm thanh tương tác', () => {
  it('ánh xạ theo loại vật', () => {
    expect(sfxForInteract('door.open')).toBe('door');
    expect(sfxForInteract('drawer.close')).toBe('drawer');
    expect(sfxForInteract('light.switch')).toBe('switch');
    expect(sfxForInteract('water.pour')).toBe('waterCooler');
    expect(sfxForInteract('printer.jam')).toBe('printer');
    expect(sfxForInteract('computer.on')).toBe('uiClick');
  });
  it('sự kiện không có âm trả null', () => {
    expect(sfxForInteract('door.blocked')).toBeNull();
    expect(sfxForInteract('computer.login')).toBeNull();
    expect(sfxForInteract('tv.volume')).toBeNull();
  });
  it('vị trí 3D chỉ khi có tọa độ', () => {
    expect(positionForInteract({ type: 'door.open', id: 'd', x: 2, z: -3 })).toEqual([2, 1, -3]);
    expect(positionForInteract({ type: 'door.open', id: 'd' })).toBeUndefined();
  });
  it('bridge phát đúng âm, kèm vùng, và hủy được', () => {
    let cb: ((e: InteractEvent) => void) | null = null;
    const played: unknown[] = [];
    const off = bridgeInteractAudio(
      (f) => {
        cb = f;
        return () => {
          cb = null;
        };
      },
      { play: (ev, o) => (played.push([ev, o]), true) },
      () => 'pantry',
    );
    cb!({ type: 'drawer.open', id: 'c:d0', x: 1, z: 1 });
    cb!({ type: 'computer.login', id: 'pc' });
    expect(played).toEqual([['drawer', { position: [1, 1, 1], zone: 'pantry' }]]);
    off();
    expect(cb).toBeNull();
  });
});
