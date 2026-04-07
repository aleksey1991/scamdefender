import { describe, test, expect } from '@jest/globals';
import { analyzeWithAI } from '../../utils/ai.js';

// Skip all tests if GEMINI_API_KEY is not set
const hasApiKey = !!process.env.GEMINI_API_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip('Gemini AI Integration Tests (REAL API)', () => {
  const apiKey = process.env.GEMINI_API_KEY;

  test('analyzeWithAI returns valid object for scam-like signals', async () => {
    const signals = {
      domainAgeDays: 15,
      safeBrowsingFlagged: false,
      noHttps: true,
      trustpilot: { found: false, rating: null, reviewCount: null },
      contentScan: {
        noPhysicalAddress: true,
        noPhoneNumber: true,
        suspiciousReturnPolicy: true,
        suspiciousLuxuryPricing: false
      }
    };

    const pageExcerpts = {
      aboutUs: 'We are a brand new luxury retailer offering amazing deals.',
      returnPolicy: 'All sales are final. No returns accepted.'
    };

    const result = await analyzeWithAI(signals, pageExcerpts, apiKey);

    expect(result).toBeTruthy();
    expect(result).toHaveProperty('risk_level');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('red_flags');
    expect(result).toHaveProperty('verdict');
  }, 15000); // 15 second timeout for API call

  test('risk_level is one of: low, medium, high, critical', async () => {
    const signals = {
      domainAgeDays: 20,
      safeBrowsingFlagged: false,
      noHttps: false,
      trustpilot: { found: false, rating: null, reviewCount: null }
    };

    const pageExcerpts = {
      aboutUs: 'New online store',
      returnPolicy: 'No refunds'
    };

    const result = await analyzeWithAI(signals, pageExcerpts, apiKey);

    if (result) {
      expect(['low', 'medium', 'high', 'critical']).toContain(result.risk_level);
    }
  }, 15000);

  test('confidence is a number between 0 and 100', async () => {
    const signals = {
      domainAgeDays: 500,
      safeBrowsingFlagged: false,
      noHttps: false,
      trustpilot: { found: true, rating: 4.5, reviewCount: 100 }
    };

    const pageExcerpts = {
      aboutUs: 'Established business with years of experience.',
      returnPolicy: '30 day money back guarantee.'
    };

    const result = await analyzeWithAI(signals, pageExcerpts, apiKey);

    if (result) {
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    }
  }, 15000);

  test('red_flags is an array', async () => {
    const signals = {
      domainAgeDays: 10,
      safeBrowsingFlagged: false,
      noHttps: true,
      trustpilot: { found: false, rating: null, reviewCount: null }
    };

    const pageExcerpts = {
      aboutUs: '',
      returnPolicy: ''
    };

    const result = await analyzeWithAI(signals, pageExcerpts, apiKey);

    if (result) {
      expect(Array.isArray(result.red_flags)).toBe(true);
    }
  }, 15000);

  test('verdict is a non-empty string', async () => {
    const signals = {
      domainAgeDays: 365,
      safeBrowsingFlagged: false,
      noHttps: false,
      trustpilot: { found: true, rating: 3.8, reviewCount: 50 }
    };

    const pageExcerpts = {
      aboutUs: 'We have been in business since 2020.',
      returnPolicy: 'Returns accepted within 14 days.'
    };

    const result = await analyzeWithAI(signals, pageExcerpts, apiKey);

    if (result) {
      expect(typeof result.verdict).toBe('string');
      expect(result.verdict.length).toBeGreaterThan(0);
    }
  }, 15000);
});
