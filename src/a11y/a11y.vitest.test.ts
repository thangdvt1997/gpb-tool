import { describe, expect, it } from 'vitest';
import { runA11yTests } from './a11y.test';

describe('a11y', () => {
  for (const r of runA11yTests()) {
    it(r.name, () => {
      expect(r.error ?? '').toBe('');
    });
  }
});
