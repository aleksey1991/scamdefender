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

  describe('Trustpilot scoring', () => {
    test('Trustpilot not found adds 10 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: false } })).toBe(10);
    });

    test('Trustpilot rating < 2.0 adds 30 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 1.9 } })).toBe(30);
    });

    test('Trustpilot rating exactly 2.0 adds 15 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 2.0 } })).toBe(15);
    });

    test('Trustpilot rating >= 2.0 and < 3.4 adds 15 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 3.0 } })).toBe(15);
    });

    test('Trustpilot rating exactly 3.4 adds 0 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 3.4 } })).toBe(0);
    });

    test('Trustpilot rating >= 3.4 adds 0 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 4.5 } })).toBe(0);
    });

    test('Trustpilot review count < 10 adds 10 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 4.0, reviewCount: 5 } })).toBe(10);
    });

    test('Trustpilot review count exactly 10 adds 0 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 4.0, reviewCount: 10 } })).toBe(0);
    });

    test('Trustpilot review count > 10 adds 0 points', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 4.0, reviewCount: 50 } })).toBe(0);
    });

    test('Trustpilot found with low rating and low review count combines scores', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 1.5, reviewCount: 3 } })).toBe(40);
    });

    test('Trustpilot found with medium-low rating and low review count combines scores', () => {
      expect(calculateRiskScore({ trustpilot: { found: true, rating: 2.5, reviewCount: 8 } })).toBe(25);
    });
  });

  describe('Content scan scoring', () => {
    test('noPhysicalAddress true adds 10 points', () => {
      expect(calculateRiskScore({ contentScan: { noPhysicalAddress: true } })).toBe(10);
    });

    test('noPhysicalAddress false adds 0 points', () => {
      expect(calculateRiskScore({ contentScan: { noPhysicalAddress: false } })).toBe(0);
    });

    test('noPhoneNumber true adds 5 points', () => {
      expect(calculateRiskScore({ contentScan: { noPhoneNumber: true } })).toBe(5);
    });

    test('noPhoneNumber false adds 0 points', () => {
      expect(calculateRiskScore({ contentScan: { noPhoneNumber: false } })).toBe(0);
    });

    test('suspiciousReturnPolicy true adds 10 points', () => {
      expect(calculateRiskScore({ contentScan: { suspiciousReturnPolicy: true } })).toBe(10);
    });

    test('suspiciousReturnPolicy false adds 0 points', () => {
      expect(calculateRiskScore({ contentScan: { suspiciousReturnPolicy: false } })).toBe(0);
    });

    test('suspiciousLuxuryPricing true adds 15 points', () => {
      expect(calculateRiskScore({ contentScan: { suspiciousLuxuryPricing: true } })).toBe(15);
    });

    test('suspiciousLuxuryPricing false adds 0 points', () => {
      expect(calculateRiskScore({ contentScan: { suspiciousLuxuryPricing: false } })).toBe(0);
    });

    test('all content scan flags combine correctly', () => {
      const signals = {
        contentScan: {
          noPhysicalAddress: true, // 10 points
          noPhoneNumber: true, // 5 points
          suspiciousReturnPolicy: true, // 10 points
          suspiciousLuxuryPricing: true, // 15 points
        },
      };
      expect(calculateRiskScore(signals)).toBe(40);
    });
  });

  describe('combined signals', () => {
    test('combined Phase 1 signals are capped at 100', () => {
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

    test('combined Phase 1 and Phase 2 signals cap at 100', () => {
      const signals = {
        domainAgeDays: 29, // 40 points
        safeBrowsingFlagged: true, // 50 points
        noHttps: true, // 20 points
        trustpilot: { found: true, rating: 1.5, reviewCount: 5 }, // 30 + 10 = 40 points
        contentScan: {
          noPhysicalAddress: true, // 10 points
          noPhoneNumber: true, // 5 points
          suspiciousReturnPolicy: true, // 10 points
          suspiciousLuxuryPricing: true, // 15 points
        }, // 40 points
        // Total would be 190, but should cap at 100
      };
      expect(calculateRiskScore(signals)).toBe(100);
    });

    test('Phase 2 signals only below cap sum correctly', () => {
      const signals = {
        trustpilot: { found: true, rating: 2.5, reviewCount: 8 }, // 15 + 10 = 25 points
        contentScan: {
          noPhysicalAddress: true, // 10 points
          noPhoneNumber: true, // 5 points
        }, // 15 points
        // Total: 40 points
      };
      expect(calculateRiskScore(signals)).toBe(40);
    });

    test('mixed Phase 1 and Phase 2 signals below cap', () => {
      const signals = {
        domainAgeDays: 180, // 10 points
        trustpilot: { found: false }, // 10 points
        contentScan: {
          suspiciousReturnPolicy: true, // 10 points
        },
        // Total: 30 points
      };
      expect(calculateRiskScore(signals)).toBe(30);
    });
  });
});
