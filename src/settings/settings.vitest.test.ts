import { expect, it } from 'vitest';
import { runSettingsSelfTest } from './selftest';

it('settings selftest không có lỗi', () => {
  const { passed, failures } = runSettingsSelfTest();
  expect(failures).toEqual([]);
  expect(passed).toBeGreaterThan(0);
});
