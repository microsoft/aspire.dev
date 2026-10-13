import { expect, test } from 'vitest';
import { median, transferPenaltyMs } from '../../scripts/profile-static-host-compression.mjs';

test('profile summaries use medians without mutating source observations', () => {
  const values = [10, 3, 6];
  expect(median(values)).toBe(6);
  expect(values).toEqual([10, 3, 6]);
  expect(median([2, 8, 4, 6])).toBe(5);
  expect(() => median([])).toThrow();
  expect(() => median([Number.NaN])).toThrow();
});

test('byte-to-bandwidth model reports signed transfer deltas in milliseconds', () => {
  expect(transferPenaltyMs(125000, 1)).toBe(1000);
  expect(transferPenaltyMs(125000, 5)).toBe(200);
  expect(transferPenaltyMs(-125000, 5)).toBe(-200);
  expect(() => transferPenaltyMs(1, 0)).toThrow();
  expect(() => transferPenaltyMs(Number.NaN, 1)).toThrow();
});
