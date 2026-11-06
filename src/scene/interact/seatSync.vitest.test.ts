import { describe, expect, it } from 'vitest';
import { getCharacterState, resetCharacterState } from './characterState';
import { setSeated } from '../controls/session';
import { attachSeatSync } from './seatSync';

describe('seatSync', () => {
  it('điều khiển ngồi thì nhân vật sang seated, đứng dậy về walking', () => {
    resetCharacterState();
    const off = attachSeatSync();
    setSeated(true);
    expect(getCharacterState()).toBe('seated');
    setSeated(false);
    expect(getCharacterState()).toBe('walking');
    off();
    setSeated(true);
    expect(getCharacterState()).toBe('walking');
    setSeated(false);
  });
});
