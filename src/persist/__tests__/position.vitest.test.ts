// Khôi phục vị trí nhân vật (TASK 06): lưu vị trí, đọc lại thì gọi placeCharacter đúng điểm;
// vị trí nằm trên vật cản thì đưa về sảnh. Dùng memory store, không cần IndexedDB.
import { describe, expect, it } from 'vitest';
import { createPersistManager } from '../manager';
import { createMemoryStore } from '../core';
import type { SavedPosition } from '../types';
import { makeDefaultLook } from '../../fashion';
import { SPAWN } from '../../scene/layout';

function setup(colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []) {
  const store = createMemoryStore();
  let pos: SavedPosition = { x: 9.25, z: 13.63, yaw: 0 };
  const placed: SavedPosition[] = [];
  const mk = () =>
    createPersistManager(
      { getLook: () => makeDefaultLook(), getLayoutOverrides: () => ({}), getColliders: () => colliders, getPosition: () => pos },
      { applyLook: () => undefined, applyLayoutOverrides: () => undefined, placeCharacter: (p) => placed.push(p) },
      { store, delayMs: 10_000 },
    );
  return { mk, placed, move: (p: SavedPosition) => (pos = p) };
}

describe('persist: vị trí nhân vật', () => {
  it('lưu rồi đọc lại thì đặt nhân vật đúng chỗ', async () => {
    const s = setup();
    const a = s.mk();
    expect((await a.saveSnapshot()).ok).toBe(true);
    const b = s.mk();
    expect((await b.loadSnapshot()).ok).toBe(true);
    expect(s.placed[s.placed.length - 1]).toEqual({ x: 9.25, z: 13.63, yaw: 0 });
  });

  it('vị trí lưu bị vật cản chiếm thì về điểm xuất hiện', async () => {
    const s = setup([{ minX: 9, maxX: 9.5, minZ: 13.4, maxZ: 13.8 }]);
    await s.mk().saveSnapshot();
    const b = s.mk();
    await b.loadSnapshot();
    expect(s.placed[s.placed.length - 1]).toMatchObject({ x: SPAWN.x, z: SPAWN.z });
  });
});
