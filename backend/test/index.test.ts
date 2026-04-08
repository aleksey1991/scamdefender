/**
 * Main router endpoint tests
 * Tests all HTTP endpoints and request handlers
 */

import handler from '../src/index.js';
import * as auth from '../src/auth.js';
import * as cache from '../src/cache.js';
import * as analyze from '../src/analyze.js';
import * as supabase from '../src/supabase.js';
import * as stripeWebhook from '../src/stripe-webhook.js';
import type { Env, AnalysisResult, ScamCheckResult } from '../src/types.js';

/**
 * Mock all imported modules
 */
jest.mock('../src/auth.js');
jest.mock('../src/cache.js');
jest.mock('../src/analyze.js');
jest.mock('../src/supabase.js');
jest.mock('../src/stripe-webhook.js');

const mockValidateJWT = auth.validateJWT as jest.MockedFunction<typeof auth.validateJWT>;
const mockGetUserStatus = auth.getUserStatus as jest.MockedFunction<typeof auth.getUserStatus>;
const mockGetCachedAnalysis = cache.getCachedAnalysis as jest.MockedFunction<typeof cache.getCachedAnalysis>;
const mockSetCachedAnalysis = cache.setCachedAnalysis as jest.MockedFunction<typeof cache.setCachedAnalysis>;
const mockGetRateLimit = cache.getRateLimit as jest.MockedFunction<typeof cache.getRateLimit>;
const mockIncrementRateLimit = cache.incrementRateLimit as jest.MockedFunction<typeof cache.incrementRateLimit>;
const mockAnalyzeWithAI = analyze.analyzeWithAI as jest.MockedFunction<typeof analyze.analyzeWithAI>;
const mockCheckScamDatabase = supabase.checkScamDatabase as jest.MockedFunction<typeof supabase.checkScamDatabase>;
const mockReportScam = supabase.reportScam as jest.MockedFunction<typeof supabase.reportScam>;
const mockHandleStripeWebhook = stripeWebhook.handleStripeWebhook as jest.MockedFunction<typeof stripeWebhook.handleStripeWebhook>;

describe('Main Router (index.ts)', () => {
  let mockEnv: Partial<Env>;
  let mockContext: { waitUntil: jest.Mock };

  beforeEach(() => {
    mockEnv = {
      SCAM_CACHE: {} as KVNamespace,
      USER_STATUS: {} as KVNamespace,
      RATE_LIMIT: {} as KVNamespace,
      GEMINI_API_KEY: 'test_key',
      SUPABASE_JWT_SECRET: 'test_secret',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test_role_key',
      STRIPE_WEBHOOK_SECRET: 'test_stripe_secret',
      GIFTED_PRO_EMAILS: 'test@example.com',
      ENVIRONMENT: 'test',
    };

    mockContext = {
      waitUntil: jest.fn(),
    };

    jest.clearAllMocks();
  });

  describe('GET /status', () => {
    test('returns 200 with status=ok and timestamp', async () => {
      const request = new Request('http://localhost/status', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(typeof data.timestamp).toBe('number');
      expect(data.timestamp).toBeGreaterThan(0);
    });

    test('includes CORS headers in status response', async () => {
      const request = new Request('http://localhost/status', {
        method: 'GET',
        headers: {
          Origin: 'https://example.com',
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('returns chrome-extension origin in CORS header for extension origins', async () => {
      const extensionOrigin = 'chrome-extension://abcdefghijklmnop';
      const request = new Request('http://localhost/status', {
        method: 'GET',
        headers: {
          Origin: extensionOrigin,
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        extensionOrigin
      );
    });
  });

  describe('POST /analyze', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    test('returns 401 when JWT is invalid', async () => {
      mockValidateJWT.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    test('returns 400 when domain is missing', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing domain or signals');
    });

    test('returns 400 when signals is missing', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing domain or signals');
    });

    test('returns 403 when user is not Pro', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: false,
        isGiftedPro: false,
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Pro subscription required');
    });

    test('returns 429 when rate limit exceeded (50+ requests)', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(50);

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toContain('Rate limit exceeded');
    });

    test('returns 429 when rate limit exceeded (51 requests)', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(51);

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(429);
    });

    test('returns cached result without calling AI', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const cachedResult: AnalysisResult = {
        domain: 'example.com',
        riskLevel: 'high',
        confidence: 95,
        redFlags: ['No HTTPS', 'Suspicious domain'],
        verdict: 'This is suspicious',
        score: 85,
        cachedAt: Date.now(),
      };

      mockGetCachedAnalysis.mockResolvedValue(cachedResult);

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(cachedResult);

      // Verify AI was not called
      expect(mockAnalyzeWithAI).not.toHaveBeenCalled();
      // Verify KV write and rate limit increment were not called
      expect(mockSetCachedAnalysis).not.toHaveBeenCalled();
      expect(mockIncrementRateLimit).not.toHaveBeenCalled();
    });

    test('calls AI, caches result, increments rate limit and returns 200 for valid request', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(10);

      const analysisResult: AnalysisResult = {
        domain: 'example.com',
        riskLevel: 'high',
        confidence: 92,
        redFlags: ['No HTTPS'],
        verdict: 'High risk domain',
        score: 82,
        cachedAt: Date.now(),
      };

      mockAnalyzeWithAI.mockResolvedValue({
        success: true,
        data: analysisResult,
      });

      mockSetCachedAnalysis.mockResolvedValue(undefined);
      mockIncrementRateLimit.mockResolvedValue(undefined);
      mockReportScam.mockResolvedValue({ success: true, data: undefined });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(analysisResult);

      // Verify AI was called
      expect(mockAnalyzeWithAI).toHaveBeenCalledWith(
        mockEnv,
        'example.com',
        { safeBrowsingFlagged: true }
      );

      // Verify cache was set
      expect(mockSetCachedAnalysis).toHaveBeenCalledWith(
        mockEnv,
        'example.com',
        analysisResult
      );

      // Verify rate limit was incremented
      expect(mockIncrementRateLimit).toHaveBeenCalledWith(mockEnv, 'user_123');

      // Verify report was submitted
      expect(mockReportScam).toHaveBeenCalledWith(
        mockEnv,
        'example.com',
        'high',
        82,
        'High risk domain',
        ['No HTTPS']
      );
    });

    test('allows gifted Pro users to use AI analysis', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_gifted', email: 'gifted@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: true,
      });

      mockGetRateLimit.mockResolvedValue(5);

      const analysisResult: AnalysisResult = {
        domain: 'test.com',
        riskLevel: 'low',
        confidence: 88,
        redFlags: [],
        verdict: 'Legitimate domain',
        score: 15,
        cachedAt: Date.now(),
      };

      mockAnalyzeWithAI.mockResolvedValue({
        success: true,
        data: analysisResult,
      });

      mockSetCachedAnalysis.mockResolvedValue(undefined);
      mockIncrementRateLimit.mockResolvedValue(undefined);
      mockReportScam.mockResolvedValue({ success: true, data: undefined });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'test.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      expect(mockAnalyzeWithAI).toHaveBeenCalled();
    });

    test('returns 500 when AI analysis fails', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(10);

      mockAnalyzeWithAI.mockResolvedValue({
        success: false,
        error: 'AI API timeout',
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { safeBrowsingFlagged: true },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('AI API timeout');
    });

    test('handles malformed JSON in request body', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: 'invalid json {',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('GET /scam-check', () => {
    test('returns 400 when domain parameter is missing', async () => {
      const request = new Request('http://localhost/scam-check', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing domain parameter');
    });

    test('returns 200 with found=false when domain is not in database', async () => {
      const scamCheckResult: ScamCheckResult = {
        found: false,
        domain: 'legitimate.com',
      };

      mockCheckScamDatabase.mockResolvedValue({
        success: true,
        data: scamCheckResult,
      });

      const request = new Request(
        'http://localhost/scam-check?domain=legitimate.com',
        {
          method: 'GET',
        }
      );

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.found).toBe(false);
      expect(data.domain).toBe('legitimate.com');
    });

    test('returns 200 with ScamCheckResult when domain is found', async () => {
      const scamCheckResult: ScamCheckResult = {
        found: true,
        domain: 'scam.com',
        riskLevel: 'critical',
        riskScore: 95,
        reportCount: 42,
        confirmedScam: true,
      };

      mockCheckScamDatabase.mockResolvedValue({
        success: true,
        data: scamCheckResult,
      });

      const request = new Request(
        'http://localhost/scam-check?domain=scam.com',
        {
          method: 'GET',
        }
      );

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.found).toBe(true);
      expect(data.domain).toBe('scam.com');
      expect(data.riskLevel).toBe('critical');
      expect(data.riskScore).toBe(95);
      expect(data.reportCount).toBe(42);
      expect(data.confirmedScam).toBe(true);
    });

    test('does not require authentication', async () => {
      const scamCheckResult: ScamCheckResult = {
        found: false,
        domain: 'test.com',
      };

      mockCheckScamDatabase.mockResolvedValue({
        success: true,
        data: scamCheckResult,
      });

      const request = new Request('http://localhost/scam-check?domain=test.com', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      expect(mockValidateJWT).not.toHaveBeenCalled();
    });

    test('returns 500 on database error', async () => {
      mockCheckScamDatabase.mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      });

      const request = new Request('http://localhost/scam-check?domain=test.com', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Database connection failed');
    });

    test('handles URL encoded domain parameter', async () => {
      const scamCheckResult: ScamCheckResult = {
        found: false,
        domain: 'test-domain.com',
      };

      mockCheckScamDatabase.mockResolvedValue({
        success: true,
        data: scamCheckResult,
      });

      const request = new Request(
        'http://localhost/scam-check?domain=test%2Ddomain.com',
        {
          method: 'GET',
        }
      );

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
    });
  });

  describe('POST /report', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    test('returns 401 when JWT is invalid', async () => {
      mockValidateJWT.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
    });

    test('returns 400 when domain is missing', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          riskLevel: 'high',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    test('returns 400 when riskLevel is missing', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    test('returns 400 when riskScore is missing', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    test('returns 200 and calls reportScam with valid request', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockReportScam.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
          riskScore: 85,
          verdict: 'This is a scam',
          redFlags: ['No HTTPS', 'Fake reviews'],
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      expect(mockReportScam).toHaveBeenCalledWith(
        mockEnv,
        'scam.com',
        'high',
        85,
        'This is a scam',
        ['No HTTPS', 'Fake reviews']
      );
    });

    test('calls reportScam without optional fields', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockReportScam.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'medium',
          riskScore: 65,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);

      expect(mockReportScam).toHaveBeenCalledWith(
        mockEnv,
        'scam.com',
        'medium',
        65,
        undefined,
        undefined
      );
    });

    test('returns 500 when reportScam fails', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockReportScam.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Database error');
    });
  });

  describe('POST /webhook/stripe', () => {
    test('delegates to handleStripeWebhook', async () => {
      mockHandleStripeWebhook.mockResolvedValue(
        new Response('OK', { status: 200 })
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify({
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              status: 'active',
              metadata: { userId: 'user_123' },
            },
          },
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(mockHandleStripeWebhook).toHaveBeenCalledWith(request, mockEnv);
      expect(response.status).toBe(200);
    });

    test('returns response from handleStripeWebhook on error', async () => {
      mockHandleStripeWebhook.mockResolvedValue(
        new Response('Invalid signature', { status: 400 })
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        body: 'test',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid signature');
    });
  });

  describe('OPTIONS preflight requests', () => {
    test('returns 204 with CORS headers for OPTIONS request', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, OPTIONS'
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        'Content-Type, Authorization'
      );
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    test('returns chrome-extension origin in preflight for extension origins', async () => {
      const extensionOrigin = 'chrome-extension://test123';
      const request = new Request('http://localhost/scam-check', {
        method: 'OPTIONS',
        headers: {
          Origin: extensionOrigin,
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        extensionOrigin
      );
    });
  });

  describe('404 Not Found', () => {
    test('returns 404 for unknown route', async () => {
      const request = new Request('http://localhost/unknown-route', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for POST to GET-only endpoint', async () => {
      const request = new Request('http://localhost/status', {
        method: 'POST',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for GET to POST-only endpoint', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(404);
    });

    test('includes CORS headers in 404 response', async () => {
      const request = new Request('http://localhost/unknown', {
        method: 'GET',
        headers: {
          Origin: 'https://example.com',
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(404);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('CORS headers', () => {
    test('returns wildcard origin for non-extension origins', async () => {
      const request = new Request('http://localhost/status', {
        method: 'GET',
        headers: {
          Origin: 'https://example.com',
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('returns wildcard origin for requests without Origin header', async () => {
      const request = new Request('http://localhost/status', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('returns same origin for chrome-extension:// origins', async () => {
      const extensionOrigin = 'chrome-extension://abcdefghijklmnopqrstuvwxyz';
      const request = new Request('http://localhost/status', {
        method: 'GET',
        headers: {
          Origin: extensionOrigin,
        },
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        extensionOrigin
      );
    });

    test('returns Content-Type header in JSON responses', async () => {
      const request = new Request('http://localhost/status', {
        method: 'GET',
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Authentication header parsing', () => {
    test('handles Bearer token correctly', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(5);

      const analysisResult: AnalysisResult = {
        domain: 'example.com',
        riskLevel: 'low',
        confidence: 90,
        redFlags: [],
        verdict: 'Safe',
        score: 20,
        cachedAt: Date.now(),
      };

      mockAnalyzeWithAI.mockResolvedValue({
        success: true,
        data: analysisResult,
      });

      mockSetCachedAnalysis.mockResolvedValue(undefined);
      mockIncrementRateLimit.mockResolvedValue(undefined);
      mockReportScam.mockResolvedValue({ success: true, data: undefined });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      await handler.fetch(request, mockEnv as Env, mockContext as ExecutionContext);

      expect(mockValidateJWT).toHaveBeenCalledWith(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        mockEnv.SUPABASE_JWT_SECRET
      );
    });

    test('rejects malformed Bearer token', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
      expect(mockValidateJWT).not.toHaveBeenCalled();
    });

    test('rejects non-Bearer authorization', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic dXNlcjpwYXNz',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(401);
      expect(mockValidateJWT).not.toHaveBeenCalled();
    });
  });

  describe('Rate limit boundary conditions', () => {
    test('allows request at exactly 49 limit', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(49);

      const analysisResult: AnalysisResult = {
        domain: 'example.com',
        riskLevel: 'low',
        confidence: 90,
        redFlags: [],
        verdict: 'Safe',
        score: 20,
        cachedAt: Date.now(),
      };

      mockAnalyzeWithAI.mockResolvedValue({
        success: true,
        data: analysisResult,
      });

      mockSetCachedAnalysis.mockResolvedValue(undefined);
      mockIncrementRateLimit.mockResolvedValue(undefined);
      mockReportScam.mockResolvedValue({ success: true, data: undefined });

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(200);
    });

    test('blocks request at exactly 50 limit', async () => {
      mockValidateJWT.mockResolvedValue({
        success: true,
        data: { userId: 'user_123', email: 'test@example.com' },
      });

      mockGetCachedAnalysis.mockResolvedValue(null);

      mockGetUserStatus.mockResolvedValue({
        isPro: true,
        isGiftedPro: false,
      });

      mockGetRateLimit.mockResolvedValue(50);

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid.token.here',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: {},
        }),
      });

      const response = await handler.fetch(
        request,
        mockEnv as Env,
        mockContext as ExecutionContext
      );

      expect(response.status).toBe(429);
    });
  });
});
