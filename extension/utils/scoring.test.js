import { calculateRiskScore } from './scoring.js';

describe('calculateRiskScore', () => {
  test('returns 0 for empty signals', () => {
    expect(calculateRiskScore({})).toBe(0);
  });

  test('returns a number', () => {
    expect(typeof calculateRiskScore({})).toBe('number');
  });

  test('score is between 0 and 100', () => {
    const score = calculateRiskScore({});
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
