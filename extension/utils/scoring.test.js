import { calculateRiskScore } from './scoring.js';

describe('calculateRiskScore', () => {
  test('returns 0 for empty signals', () => {
    expect(calculateRiskScore({})).toBe(0);
  });

  test('returns 0 for undefined signals', () => {
    expect(calculateRiskScore(undefined)).toBe(0);
  });

  describe('domain age scoring', () => {
    test('domain age < 30 days (29 days) adds 40 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 29 })).toBe(40);
    });

    test('domain age exactly 30 days adds 25 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 30 })).toBe(25);
    });

    test('domain age < 180 days (179 days) adds 25 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 179 })).toBe(25);
    });

    test('domain age exactly 180 days adds 10 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 180 })).toBe(10);
    });

    test('domain age < 365 days (364 days) adds 10 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 364 })).toBe(10);
    });

    test('domain age exactly 365 days adds 0 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 365 })).toBe(0);
    });

    test('domain age unknown (-1) adds 5 points', () => {
      expect(calculateRiskScore({ domainAgeDays: -1 })).toBe(5);
    });

    test('domain age over 365 days adds 0 points', () => {
      expect(calculateRiskScore({ domainAgeDays: 500 })).toBe(0);
    });
  });

  describe('Safe Browsing scoring', () => {
    test('safeBrowsingFlagged true adds 50 points', () => {
      expect(calculateRiskScore({ safeBrowsingFlagged: true })).toBe(50);
    });

    test('safeBrowsingFlagged false adds 0 points', () => {
      expect(calculateRiskScore({ safeBrowsingFlagged: false })).toBe(0);
    });
  });

  describe('HTTPS scoring', () => {
    test('noHttps true adds 20 points', () => {
      expect(calculateRiskScore({ noHttps: true })).toBe(20);
    });

    test('noHttps false adds 0 points', () => {
      expect(calculateRiskScore({ noHttps: false })).toBe(0);
    });
  });

  describe('combined signals', () => {
    test('combined signals are capped at 100', () => {
      const signals = {
        domainAgeDays: 29, // 40 points
        safeBrowsingFlagged: true, // 50 points
        noHttps: true, // 20 points
        // Total would be 110, but should cap at 100
      };
      expect(calculateRiskScore(signals)).toBe(100);
    });

    test('multiple signals below cap are summed correctly', () => {
      const signals = {
        domainAgeDays: 180, // 10 points
        noHttps: true, // 20 points
        // Total: 30 points
      };
      expect(calculateRiskScore(signals)).toBe(30);
    });

    test('old domain with Safe Browsing flag', () => {
      const signals = {
        domainAgeDays: 500, // 0 points
        safeBrowsingFlagged: true, // 50 points
      };
      expect(calculateRiskScore(signals)).toBe(50);
    });
  });
});
