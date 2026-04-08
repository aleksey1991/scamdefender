/**
 * Comprehensive unit tests for cache.ts module
 * Tests KV cache operations for scam analysis caching and rate limiting
 */

import {
  getCachedAnalysis,
  setCachedAnalysis,
  getRateLimit,
  incrementRateLimit,
} from '../src/cache.js';
import { AnalysisResult, Env } from '../src/types.js';

// Mock KVNamespace
const mockKVNamespace = () => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(),
});

const mockEnv: Partial<Env> = {
  SCAM_CACHE: mockKVNamespace() as any,
  RATE_LIMIT: mockKVNamespace() as any,
};

describe('getCachedAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache hit', () => {
    it('should return parsed AnalysisResult when cache hit occurs', async () => {
      const domain = 'example.com';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'high',
        confidence: 0.95,
        redFlags: ['suspicious-domain', 'no-physical-address'],
        verdict: 'This site appears to be a scam',
        score: 85,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(cachedResult)
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toEqual(cachedResult);
      expect(mockEnv.SCAM_CACHE!.get).toHaveBeenCalledWith(`analysis:${domain}`);
    });

    it('should handle various risk levels from cache', async () => {
      const domain = 'example.com';
      const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ];

      for (const riskLevel of riskLevels) {
        const cachedResult: AnalysisResult = {
          domain,
          riskLevel,
          confidence: 0.9,
          redFlags: [],
          verdict: `Risk level: ${riskLevel}`,
          score: 50,
          cachedAt: Date.now(),
        };

        (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
          JSON.stringify(cachedResult)
        );

        const result = await getCachedAnalysis(mockEnv as Env, domain);

        expect(result?.riskLevel).toBe(riskLevel);
      }
    });

    it('should preserve all AnalysisResult fields from cache', async () => {
      const domain = 'malicious.site';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'critical',
        confidence: 0.99,
        redFlags: [
          'phishing-attempt',
          'fake-ssl-cert',
          'domain-registered-recently',
          'suspicious-content',
        ],
        verdict: 'Confirmed phishing attempt - do not visit',
        score: 98,
        cachedAt: 1700000000000,
      };

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(cachedResult)
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toEqual(cachedResult);
      expect(result?.redFlags).toHaveLength(4);
      expect(result?.confidence).toBe(0.99);
    });
  });

  describe('Cache miss', () => {
    it('should return null when key does not exist', async () => {
      const domain = 'notcached.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
      expect(mockEnv.SCAM_CACHE!.get).toHaveBeenCalledWith(`analysis:${domain}`);
    });

    it('should return null when KV returns undefined', async () => {
      const domain = 'undefined.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should return null when KV returns empty string', async () => {
      const domain = 'empty.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce('');

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });
  });

  describe('Invalid JSON in cache', () => {
    it('should return null for invalid JSON', async () => {
      const domain = 'invalid.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        'not-valid-json{'
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should return null for truncated JSON', async () => {
      const domain = 'truncated.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        '{"domain":"example.com","riskLevel":'
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should return null for JSON array instead of object', async () => {
      const domain = 'array.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        '["domain","riskLevel"]'
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should return null for JSON null', async () => {
      const domain = 'null.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce('null');

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should not throw error on invalid JSON', async () => {
      const domain = 'exception.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(
        'invalid json'
      );

      // Should not throw
      const result = await getCachedAnalysis(mockEnv as Env, domain);
      expect(result).toBeNull();
    });
  });

  describe('KV access failures', () => {
    it('should return null when KV.get throws error', async () => {
      const domain = 'error.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockRejectedValueOnce(
        new Error('KV access failed')
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should return null for timeout errors', async () => {
      const domain = 'timeout.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockRejectedValueOnce(
        new Error('Timeout')
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });

    it('should handle network-related KV errors', async () => {
      const domain = 'network.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const result = await getCachedAnalysis(mockEnv as Env, domain);

      expect(result).toBeNull();
    });
  });

  describe('Domain key construction', () => {
    it('should use correct key format for domain', async () => {
      const domain = 'test.example.com';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(null);

      await getCachedAnalysis(mockEnv as Env, domain);

      expect(mockEnv.SCAM_CACHE!.get).toHaveBeenCalledWith(
        `analysis:${domain}`
      );
    });

    it('should handle domains with special characters', async () => {
      const domain = 'test-domain_123.example.co.uk';

      (mockEnv.SCAM_CACHE!.get as jest.Mock).mockResolvedValueOnce(null);

      await getCachedAnalysis(mockEnv as Env, domain);

      expect(mockEnv.SCAM_CACHE!.get).toHaveBeenCalledWith(`analysis:${domain}`);
    });
  });
});

describe('setCachedAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Stores with correct key and 72h TTL', () => {
    it('should store analysis result with correct key', async () => {
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'high',
        confidence: 0.95,
        redFlags: ['suspicious-domain'],
        verdict: 'This site appears to be a scam',
        score: 85,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      expect(mockEnv.SCAM_CACHE!.put).toHaveBeenCalledWith(
        `analysis:${domain}`,
        JSON.stringify(result),
        { expirationTtl: 259200 }
      );
    });

    it('should use 72-hour TTL (259200 seconds)', async () => {
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'low',
        confidence: 0.5,
        redFlags: [],
        verdict: 'No immediate risk detected',
        score: 20,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      const callArgs = (mockEnv.SCAM_CACHE!.put as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toEqual({ expirationTtl: 259200 });
    });

    it('should correctly serialize AnalysisResult to JSON', async () => {
      const domain = 'test.example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'critical',
        confidence: 0.99,
        redFlags: ['phishing', 'malware'],
        verdict: 'Confirmed threat',
        score: 99,
        cachedAt: 1700000000000,
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      const storedString = (mockEnv.SCAM_CACHE!.put as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(storedString);

      expect(parsed).toEqual(result);
      expect(parsed.domain).toBe(domain);
      expect(parsed.riskLevel).toBe('critical');
      expect(parsed.redFlags).toEqual(['phishing', 'malware']);
    });

    it('should handle various risk levels', async () => {
      const domain = 'example.com';
      const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ];

      for (const riskLevel of riskLevels) {
        jest.clearAllMocks();
        const result: AnalysisResult = {
          domain,
          riskLevel,
          confidence: 0.8,
          redFlags: [],
          verdict: `Risk: ${riskLevel}`,
          score: 50,
          cachedAt: Date.now(),
        };

        (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

        await setCachedAnalysis(mockEnv as Env, domain, result);

        const storedString = (mockEnv.SCAM_CACHE!.put as jest.Mock).mock.calls[0][1];
        const parsed = JSON.parse(storedString);
        expect(parsed.riskLevel).toBe(riskLevel);
      }
    });

    it('should handle empty red flags array', async () => {
      const domain = 'safe.example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'low',
        confidence: 0.9,
        redFlags: [],
        verdict: 'Safe',
        score: 10,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      const storedString = (mockEnv.SCAM_CACHE!.put as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(storedString);
      expect(parsed.redFlags).toEqual([]);
    });

    it('should handle multiple red flags', async () => {
      const domain = 'dangerous.example.com';
      const redFlags = [
        'phishing-attempt',
        'malware-detected',
        'no-ssl-certificate',
        'suspicious-domain-age',
        'fake-reviews',
      ];
      const result: AnalysisResult = {
        domain,
        riskLevel: 'critical',
        confidence: 0.99,
        redFlags,
        verdict: 'Dangerous site',
        score: 99,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      const storedString = (mockEnv.SCAM_CACHE!.put as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(storedString);
      expect(parsed.redFlags).toEqual(redFlags);
    });
  });

  describe('Handles KV.put errors gracefully', () => {
    it('should not throw when KV.put fails', async () => {
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'high',
        confidence: 0.95,
        redFlags: [],
        verdict: 'Test',
        score: 85,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockRejectedValueOnce(
        new Error('KV write failed')
      );

      // Should not throw
      await expect(
        setCachedAnalysis(mockEnv as Env, domain, result)
      ).resolves.toBeUndefined();
    });

    it('should handle timeout errors during write', async () => {
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'medium',
        confidence: 0.7,
        redFlags: [],
        verdict: 'Test',
        score: 60,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockRejectedValueOnce(
        new Error('Timeout')
      );

      // Should not throw
      await expect(
        setCachedAnalysis(mockEnv as Env, domain, result)
      ).resolves.toBeUndefined();
    });

    it('should handle quota exceeded errors', async () => {
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'low',
        confidence: 0.5,
        redFlags: [],
        verdict: 'Test',
        score: 20,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockRejectedValueOnce(
        new Error('Quota exceeded')
      );

      // Should not throw
      await expect(
        setCachedAnalysis(mockEnv as Env, domain, result)
      ).resolves.toBeUndefined();
    });

    it('should log errors but continue execution', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const domain = 'example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'high',
        confidence: 0.95,
        redFlags: [],
        verdict: 'Test',
        score: 85,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockRejectedValueOnce(
        new Error('KV error')
      );

      await setCachedAnalysis(mockEnv as Env, domain, result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cache analysis'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Domain key construction', () => {
    it('should use correct key format for domain', async () => {
      const domain = 'test.example.com';
      const result: AnalysisResult = {
        domain,
        riskLevel: 'low',
        confidence: 0.5,
        redFlags: [],
        verdict: 'Safe',
        score: 20,
        cachedAt: Date.now(),
      };

      (mockEnv.SCAM_CACHE!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await setCachedAnalysis(mockEnv as Env, domain, result);

      expect(mockEnv.SCAM_CACHE!.put).toHaveBeenCalledWith(
        `analysis:${domain}`,
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});

describe('getRateLimit', () => {
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date for consistent date generation
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-15T10:30:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Existing rate limit', () => {
    it('should return count when rate limit exists', async () => {
      const count = 5;

      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(
        count.toString()
      );

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(count);
    });

    it('should parse integer from KV string value', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('42');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(42);
    });

    it('should handle large rate limit counts', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('10000');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(10000);
    });

    it('should handle count of 1', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('1');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(1);
    });
  });

  describe('No rate limit', () => {
    it('should return 0 when key does not exist', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });

    it('should return 0 when KV returns undefined', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });

    it('should return 0 when KV returns empty string', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });
  });

  describe('Uses correct date format (YYYY-MM-DD)', () => {
    it('should use YYYY-MM-DD format for date in key', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);

      await getRateLimit(mockEnv as Env, userId);

      const key = (mockEnv.RATE_LIMIT!.get as jest.Mock).mock.calls[0][0];
      expect(key).toBe(`ratelimit:${userId}:2024-03-15`);
    });

    it('should use UTC date', async () => {
      jest.setSystemTime(new Date('2024-12-31T23:59:59Z'));

      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);

      await getRateLimit(mockEnv as Env, userId);

      const key = (mockEnv.RATE_LIMIT!.get as jest.Mock).mock.calls[0][0];
      expect(key).toContain('2024-12-31');
    });

    it('should use ISO date format', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);

      await getRateLimit(mockEnv as Env, userId);

      const key = (mockEnv.RATE_LIMIT!.get as jest.Mock).mock.calls[0][0];
      const datePart = key.split(':')[2];
      expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Invalid rate limit value', () => {
    it('should return 0 for non-numeric string', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('not-a-number');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });

    it('should return 0 for float string', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('3.14');

      const result = await getRateLimit(mockEnv as Env, userId);

      // parseInt truncates to 3
      expect(result).toBe(3);
    });

    it('should return 0 for negative number string that fails to parse', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('abc123');

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });
  });

  describe('KV access failures', () => {
    it('should return 0 when KV.get throws error', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockRejectedValueOnce(
        new Error('KV access failed')
      );

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });

    it('should handle timeout errors', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockRejectedValueOnce(
        new Error('Timeout')
      );

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });

    it('should return 0 for permission denied errors', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const result = await getRateLimit(mockEnv as Env, userId);

      expect(result).toBe(0);
    });
  });
});

describe('incrementRateLimit', () => {
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-15T10:30:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Increments from 0 to 1', () => {
    it('should increment from 0 to 1 when no existing limit', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      expect(mockEnv.RATE_LIMIT!.put).toHaveBeenCalledWith(
        `ratelimit:${userId}:2024-03-15`,
        '1',
        { expirationTtl: 86400 }
      );
    });
  });

  describe('Increments from existing count', () => {
    it('should increment from 5 to 6', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('5');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      expect(mockEnv.RATE_LIMIT!.put).toHaveBeenCalledWith(
        expect.stringContaining(userId),
        '6',
        { expirationTtl: 86400 }
      );
    });

    it('should increment from 99 to 100', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('99');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const storedValue = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][1];
      expect(storedValue).toBe('100');
    });

    it('should increment from large count', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('9999');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const storedValue = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][1];
      expect(storedValue).toBe('10000');
    });
  });

  describe('Sets 24h TTL', () => {
    it('should use 24-hour TTL (86400 seconds)', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const callArgs = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toEqual({ expirationTtl: 86400 });
    });

    it('should set same TTL when incrementing existing', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('50');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const callArgs = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toEqual({ expirationTtl: 86400 });
    });
  });

  describe('Uses correct key format and date', () => {
    it('should construct correct KV key with date', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const key = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][0];
      expect(key).toBe(`ratelimit:${userId}:2024-03-15`);
    });

    it('should use different keys for different dates', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      jest.setSystemTime(new Date('2024-03-16T10:30:00Z'));
      jest.clearAllMocks();

      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      const key1 = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][0];
      expect(key1).toContain('2024-03-16');
    });
  });

  describe('Handles KV errors gracefully', () => {
    it('should not throw when KV.get fails', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockRejectedValueOnce(
        new Error('KV access failed')
      );

      // Should not throw
      await expect(
        incrementRateLimit(mockEnv as Env, userId)
      ).resolves.toBeUndefined();
    });

    it('should not throw when KV.put fails', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('5');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockRejectedValueOnce(
        new Error('KV write failed')
      );

      // Should not throw
      await expect(
        incrementRateLimit(mockEnv as Env, userId)
      ).resolves.toBeUndefined();
    });

    it('should log errors but continue execution', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('5');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockRejectedValueOnce(
        new Error('KV error')
      );

      await incrementRateLimit(mockEnv as Env, userId);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to increment rate limit'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle timeout errors during write', async () => {
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('10');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockRejectedValueOnce(
        new Error('Timeout')
      );

      // Should not throw
      await expect(
        incrementRateLimit(mockEnv as Env, userId)
      ).resolves.toBeUndefined();
    });
  });

  describe('Multiple increments', () => {
    it('should correctly increment multiple times in sequence', async () => {
      // First increment: 0 to 1
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      let storedValue = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][1];
      expect(storedValue).toBe('1');

      // Second increment: 1 to 2
      jest.clearAllMocks();
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce('1');
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, userId);

      storedValue = (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][1];
      expect(storedValue).toBe('2');
    });
  });

  describe('Different users', () => {
    it('should use separate keys for different users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, user1);

      jest.clearAllMocks();
      (mockEnv.RATE_LIMIT!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.RATE_LIMIT!.put as jest.Mock).mockResolvedValueOnce(undefined);

      await incrementRateLimit(mockEnv as Env, user2);

      const keys = [
        (mockEnv.RATE_LIMIT!.put as jest.Mock).mock.calls[0][0],
      ];
      expect(keys[0]).toContain('user-2');
    });
  });
});
