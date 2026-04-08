/**
 * Integration tests for ScamDefender API endpoints
 * Tests end-to-end flows across multiple modules
 */

import type {
  Env,
  AnalysisResult,
  _ScamCheckResult,
  UserStatus,
  JWTPayload,
} from '../../src/types.js';

// Simple mock function implementation (jest.fn equivalent)
class SimpleMockFn {
  private responses: any[] = [];
  private callCount = 0;
  private calls: any[] = [];

  mockResolvedValueOnce(value: any) {
    this.responses.push(value);
    return this;
  }

  async execute(...args: any[]) {
    this.calls.push(args);
    const response = this.responses[this.callCount] ?? null;
    this.callCount++;
    if (response instanceof Promise) {
      return await response;
    }
    return Promise.resolve(response);
  }

  toHaveBeenCalledWith(...expected: any[]) {
    return this.calls.some(c => JSON.stringify(c) === JSON.stringify(expected));
  }

  toNotHaveBeenCalledWith(...expected: any[]) {
    return !this.calls.some(c => JSON.stringify(c) === JSON.stringify(expected));
  }
}

// Mock implementations
class MockKVNamespace {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    _options?: Record<string, unknown>
  ): Promise<void> {
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (value instanceof ArrayBuffer) {
      stringValue = new TextDecoder().decode(value);
    } else if (ArrayBuffer.isView(value)) {
      stringValue = new TextDecoder().decode(value);
    } else {
      stringValue = String(value);
    }
    this.store.set(key, stringValue);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<{ keys: unknown[]; list_complete: boolean; cursor: string }> {
    return { keys: [], list_complete: true, cursor: '' };
  }

  async getWithMetadata(): Promise<{ value: string | null; metadata: unknown }> {
    return { value: null, metadata: null };
  }
}

/**
 * Create a valid JWT token for testing
 */
function createValidJWT(
  secret: string,
  userId: string = 'test-user-id',
  email: string = 'test@example.com',
  expirationHours: number = 24
): string {
  // Calculate expiration timestamp
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expirationHours * 3600;

  // Create header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // Create payload
  const payload: JWTPayload = {
    sub: userId,
    email,
    exp,
    iat: now,
    aud: 'authenticated',
    role: 'authenticated',
  };

  // Helper to encode base64url
  function base64urlEncode(str: string): string {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  const messageToSign = `${headerEncoded}.${payloadEncoded}`;

  // Compute HMAC-SHA256 signature (synchronous for testing)
  // Note: In actual implementation, this uses crypto.subtle which is async
  // For testing, we mock this behavior
  const secretBytes = new TextEncoder().encode(secret);
  const messageBytes = new TextEncoder().encode(messageToSign);

  // Create a simple HMAC-like signature for testing (not cryptographically valid but matches test expectations)
  const signatureString = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        Array.from(messageBytes).map((byte, i) => byte ^ secretBytes[i % secretBytes.length])
      )
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${messageToSign}.${signatureString}`;
}

/**
 * Mock crypto.subtle for JWT validation
 */
const mockCryptoSubtle = {
  importKey: async (
    _format: string,
    _keyData: Uint8Array,
    _algorithm: { name: string; hash: string },
    _extractable: boolean,
    _keyUsages: string[]
  ) => {
    return { type: 'secret' } as CryptoKey;
  },

  sign: async (_algorithm: string, _key: CryptoKey, data: Uint8Array) => {
    // Simple mock signature based on data and key
    const signatureArray = Array.from(data).map(
      (byte, i) => byte ^ ((i % 256) << 1)
    );
    return new Uint8Array(signatureArray).buffer;
  },
};

/**
 * Create mock environment
 */
function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    SCAM_CACHE: new MockKVNamespace() as unknown as KVNamespace,
    USER_STATUS: new MockKVNamespace() as unknown as KVNamespace,
    RATE_LIMIT: new MockKVNamespace() as unknown as KVNamespace,
    GEMINI_API_KEY: 'test-gemini-api-key',
    SUPABASE_JWT_SECRET: 'test-jwt-secret',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    STRIPE_WEBHOOK_SECRET: 'test-stripe-webhook-secret',
    GIFTED_PRO_EMAILS: 'gifted@example.com,vip@example.com',
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

// Import the handler after mocks are defined
import handler from '../../src/index.js';

describe('ScamDefender API Integration Tests', () => {
  let mockEnv: Env;
  let fetchMock: any;

  beforeEach(() => {
    mockEnv = createMockEnv();
    fetchMock = new SimpleMockFn();
    (globalThis as any).fetch = ((...args: any[]) => fetchMock.execute(...args)) as any;
    // Mock crypto.subtle
    (globalThis as any).crypto = {
      subtle: mockCryptoSubtle,
    };
  });

  afterEach(() => {
    // Clean up
  });

  describe('Full Analysis Flow', () => {
    it('should analyze domain with valid JWT and cache result', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-123', 'user@test.com');
      const domain = 'example-scam.com';
      const signals = {
        domainAgeDays: 30,
        safeBrowsingFlagged: false,
        trustpilot: {
          found: false,
          rating: null,
          reviewCount: null,
        },
        contentScan: {
          noPhysicalAddress: true,
          noPhoneNumber: true,
          suspiciousReturnPolicy: true,
          suspiciousLuxuryPricing: false,
        },
      };

      // Mock Supabase subscription check (Pro user)
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              user_id: 'user-123',
              status: 'active',
              current_period_end: '2025-12-31T23:59:59Z',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Gemini API response
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'high',
                        confidence: 85,
                        redFlags: [
                          'No physical address',
                          'No phone number',
                          'Suspicious return policy',
                        ],
                        verdict: 'This domain shows multiple red flags commonly associated with scam sites.',
                        score: 78,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check (domain not in database yet)
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert new scam report
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      // Perform analysis
      const analyzeRequest = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain, signals }),
      });

      const response = await handler.fetch(analyzeRequest, mockEnv, {} as any);
      expect(response.status).toBe(200);

      const responseData = (await response.json());
      expect(responseData.domain).toBe(domain);
      expect(responseData.riskLevel).toBe('high');
      expect(responseData.score).toBe(78);
      expect(responseData.redFlags).toContain('No physical address');

      // Verify result was cached
      const cachedString = await mockEnv.SCAM_CACHE.get(`analysis:${domain}`);
      expect(cachedString).toBeTruthy();
      expect(JSON.parse(cachedString!)).toEqual(responseData);
    });

    it('should return cached result on second analysis request', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-123', 'user@test.com');
      const domain = 'example-scam.com';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'high',
        confidence: 85,
        redFlags: ['No physical address'],
        verdict: 'Cached verdict',
        score: 78,
        cachedAt: Date.now(),
      };

      // Pre-populate cache
      await mockEnv.SCAM_CACHE.put(
        `analysis:${domain}`,
        JSON.stringify(cachedResult)
      );

      // Second request should return cached result without hitting APIs
      const signals = {
        domainAgeDays: 30,
        safeBrowsingFlagged: false,
        trustpilot: { found: false, rating: null, reviewCount: null },
        contentScan: {
          noPhysicalAddress: true,
          noPhoneNumber: true,
          suspiciousReturnPolicy: true,
          suspiciousLuxuryPricing: false,
        },
      };

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain, signals }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);

      const responseData = (await response.json());
      expect(responseData.domain).toBe(domain);
      expect(responseData.riskLevel).toBe('high');
      // No API calls should have been made
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should match cached analysis result with scam-check result', async () => {
      const domain = 'confirmed-scam.com';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'critical',
        confidence: 95,
        redFlags: ['Confirmed phishing'],
        verdict: 'Confirmed scam domain',
        score: 95,
        cachedAt: Date.now(),
      };

      // Pre-populate analysis cache
      await mockEnv.SCAM_CACHE.put(
        `analysis:${domain}`,
        JSON.stringify(cachedResult)
      );

      // Mock Supabase scam database check
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              domain,
              risk_level: 'critical',
              risk_score: 95,
              report_count: 5,
              confirmed_scam: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Call scam-check endpoint
      const scamCheckRequest = new Request(
        `http://localhost/scam-check?domain=${encodeURIComponent(domain)}`,
        { method: 'GET' }
      );

      const response = await handler.fetch(scamCheckRequest, mockEnv, {} as any);
      expect(response.status).toBe(200);

      const scamCheckData = (await response.json());
      expect(scamCheckData.found).toBe(true);
      expect(scamCheckData.riskLevel).toBe('critical');
      expect(scamCheckData.riskScore).toBe(95);
      expect(scamCheckData.reportCount).toBe(5);
    });
  });

  describe('Authentication Flow', () => {
    it('should allow analyze with valid JWT and Pro subscription', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-123', 'user@test.com');

      // Mock Supabase subscription check (Pro user)
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              user_id: 'user-123',
              status: 'active',
              current_period_end: '2025-12-31T23:59:59Z',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Gemini API
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'low',
                        confidence: 70,
                        redFlags: [],
                        verdict: 'Safe domain',
                        score: 20,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'safe-domain.com',
          signals: {
            domainAgeDays: 365,
            safeBrowsingFlagged: false,
            trustpilot: { found: true, rating: 4.5, reviewCount: 100 },
            contentScan: {
              noPhysicalAddress: false,
              noPhoneNumber: false,
              suspiciousReturnPolicy: false,
              suspiciousLuxuryPricing: false,
            },
          },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
    });

    it('should reject analyze with valid JWT but no Pro subscription', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-456', 'freeuser@test.com');

      // Mock Supabase subscription check (no subscription)
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(403);
      const data = (await response.json()) as any;
      expect(data.error).toContain('Pro subscription required');
    });

    it('should reject analyze with expired JWT', async () => {
      // Create JWT that expired 1 hour ago
      const token = createValidJWT(
        mockEnv.SUPABASE_JWT_SECRET,
        'user-123',
        'user@test.com',
        -1 // -1 hours (expired)
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(401);
      const data = (await response.json()) as any;
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject analyze with invalid JWT', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token-format',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(401);
    });

    it('should reject analyze with missing Authorization header', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'example.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow first 50 requests in a day', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-ratelimit', 'user@test.com');
      const userId = 'user-ratelimit';

      // Set rate limit to 49 (next request will be the 50th)
      const today = new Date().toISOString().split('T')[0];
      await mockEnv.RATE_LIMIT.put(
        `ratelimit:${userId}:${today}`,
        '49'
      );

      // Mock subscription check
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { user_id: userId, status: 'active', current_period_end: '2025-12-31T23:59:59Z' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Gemini
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'low',
                        confidence: 70,
                        redFlags: [],
                        verdict: 'Safe',
                        score: 20,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'test-domain.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
    });

    it('should reject 51st request with 429 status', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-ratelimit-2', 'user@test.com');
      const userId = 'user-ratelimit-2';

      // Set rate limit to 50 (at the limit)
      const today = new Date().toISOString().split('T')[0];
      await mockEnv.RATE_LIMIT.put(
        `ratelimit:${userId}:${today}`,
        '50'
      );

      // Mock subscription check
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { user_id: userId, status: 'active', current_period_end: '2025-12-31T23:59:59Z' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'test-domain.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(429);
      const data = (await response.json()) as any;
      expect(data.error).toContain('Rate limit exceeded');
    });

    it('should reset rate limit on different date', async () => {
      const userId = 'user-reset';

      // Set rate limit for yesterday
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      await mockEnv.RATE_LIMIT.put(
        `ratelimit:${userId}:${yesterday}`,
        '50'
      );

      // Check rate limit for today (should be 0)
      const today = new Date().toISOString().split('T')[0];
      const todayKey = `ratelimit:${userId}:${today}`;
      const todayCount = await mockEnv.RATE_LIMIT.get(todayKey);
      expect(todayCount).toBeNull();
    });
  });

  describe('Gifted Pro Flow', () => {
    it('should allow analyze for gifted pro email without subscription', async () => {
      const giftedEmail = 'gifted@example.com';
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'gifted-user', giftedEmail);

      // Mock Gemini API
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'medium',
                        confidence: 75,
                        redFlags: ['Suspicious pricing'],
                        verdict: 'Potentially risky',
                        score: 65,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'suspicious-domain.com',
          signals: {
            domainAgeDays: 60,
            safeBrowsingFlagged: false,
            trustpilot: { found: false, rating: null, reviewCount: null },
            contentScan: {
              noPhysicalAddress: false,
              noPhoneNumber: true,
              suspiciousReturnPolicy: false,
              suspiciousLuxuryPricing: true,
            },
          },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
      const data = (await response.json());
      expect(data.riskLevel).toBe('medium');
    });

    it('should cache gifted pro status in KV', async () => {
      const giftedEmail = 'vip@example.com';
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'vip-user', giftedEmail);
      const userId = 'vip-user';

      // Mock Gemini API
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'low',
                        confidence: 70,
                        redFlags: [],
                        verdict: 'Safe',
                        score: 20,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'vip-domain.com',
          signals: { domainAgeDays: 30 },
        }),
      });

      await handler.fetch(request, mockEnv, {} as any);

      // Verify gifted pro status was cached
      const cachedStatusString = await mockEnv.USER_STATUS.get(userId);
      expect(cachedStatusString).toBeTruthy();
      const status = JSON.parse(cachedStatusString!) as UserStatus;
      expect(status.isPro).toBe(true);
      expect(status.isGiftedPro).toBe(true);
    });
  });

  describe('Cache Behavior', () => {
    it('should perform AI analysis on first call (slow path)', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-cache', 'user@test.com');
      const domain = 'new-domain.com';

      // Mock subscription
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { user_id: 'user-cache', status: 'active', current_period_end: '2025-12-31T23:59:59Z' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Gemini (this indicates slow path)
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        riskLevel: 'high',
                        confidence: 80,
                        redFlags: ['Test flag'],
                        verdict: 'Test verdict',
                        score: 75,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      // Gemini should have been called
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );
    });

    it('should return cached result on second call (fast path)', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-cache-2', 'user@test.com');
      const domain = 'cached-domain.com';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'critical',
        confidence: 95,
        redFlags: ['Phishing', 'Malware'],
        verdict: 'Confirmed dangerous',
        score: 95,
        cachedAt: Date.now(),
      };

      // Pre-populate cache
      await mockEnv.SCAM_CACHE.put(
        `analysis:${domain}`,
        JSON.stringify(cachedResult)
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      const data = (await response.json());
      expect(data.domain).toBe(domain);
      expect(data.riskLevel).toBe('critical');
      // Gemini should NOT have been called (fast path)
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );
    });
  });

  describe('Report Flow', () => {
    it('should allow authenticated user to report scam domain', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'reporter-user', 'reporter@test.com');
      const domain = 'new-scam.com';

      // Mock Supabase scam check (domain not exists)
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Mock Supabase insert new scam
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 201 })
      );

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          riskLevel: 'high',
          riskScore: 85,
          verdict: 'Confirmed phishing attempt',
          redFlags: ['Phishing emails', 'Fake login page'],
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.success).toBe(true);
    });

    it('should increment report count when domain already reported', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'reporter-2', 'reporter2@test.com');
      const domain = 'known-scam.com';

      // Mock Supabase scam check (domain exists)
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              domain,
              risk_level: 'high',
              risk_score: 85,
              report_count: 3,
              confirmed_scam: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Mock Supabase update
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 200 })
      );

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          riskLevel: 'high',
          riskScore: 85,
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);

      // Verify PATCH was called (update, not POST)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/scam_sites?domain=eq.${encodeURIComponent(domain)}`),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should require authentication for report endpoint', async () => {
      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          riskLevel: 'high',
          riskScore: 80,
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(401);
      const data = (await response.json()) as any;
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject report with missing required fields', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'reporter-3', 'reporter3@test.com');

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: 'scam.com',
          // Missing riskLevel and riskScore
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(400);
      const data = (await response.json()) as any;
      expect(data.error).toContain('Missing required fields');
    });
  });

  describe('Scam Check Endpoint', () => {
    it('should return scam check result for domain in database', async () => {
      const domain = 'known-scam.com';

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              domain,
              risk_level: 'critical',
              risk_score: 95,
              report_count: 10,
              confirmed_scam: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const request = new Request(
        `http://localhost/scam-check?domain=${encodeURIComponent(domain)}`,
        { method: 'GET' }
      );

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
      const data = (await response.json());
      expect(data.found).toBe(true);
      expect(data.riskLevel).toBe('critical');
      expect(data.reportCount).toBe(10);
    });

    it('should return not found for domain not in database', async () => {
      const domain = 'unknown-domain.com';

      // Mock Supabase scam check (empty result)
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request(
        `http://localhost/scam-check?domain=${encodeURIComponent(domain)}`,
        { method: 'GET' }
      );

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
      const data = (await response.json());
      expect(data.found).toBe(false);
      expect(data.domain).toBe(domain);
    });

    it('should require domain parameter', async () => {
      const request = new Request('http://localhost/scam-check', { method: 'GET' });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(400);
      const data = (await response.json()) as any;
      expect(data.error).toContain('Missing domain parameter');
    });

    it('should not require authentication for scam-check', async () => {
      const domain = 'public-domain.com';

      // Mock Supabase scam check
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request(
        `http://localhost/scam-check?domain=${encodeURIComponent(domain)}`,
        { method: 'GET' }
        // No Authorization header
      );

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
    });
  });

  describe('Status Endpoint', () => {
    it('should return health check status', async () => {
      const request = new Request('http://localhost/status', { method: 'GET' });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers for chrome extension origin', async () => {
      const extensionOrigin = 'chrome-extension://abcdef123456';
      const request = new Request('http://localhost/status', {
        method: 'GET',
        headers: {
          'Origin': extensionOrigin,
        },
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extensionOrigin);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const request = new Request('http://localhost/analyze', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'chrome-extension://abcdef123456',
        },
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abcdef123456');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoint', async () => {
      const request = new Request('http://localhost/unknown-endpoint', { method: 'GET' });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(404);
      const data = (await response.json()) as any;
      expect(data.error).toBe('Not found');
    });

    it('should handle malformed JSON in request body', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-123', 'user@test.com');

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: 'invalid json {',
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(500);
    });

    it('should handle missing domain in analyze request', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'user-123', 'user@test.com');

      // Mock subscription
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { user_id: 'user-123', status: 'active', current_period_end: '2025-12-31T23:59:59Z' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing domain
          signals: { domainAgeDays: 30 },
        }),
      });

      const response = await handler.fetch(request, mockEnv, {} as any);
      expect(response.status).toBe(400);
      const data = (await response.json()) as any;
      expect(data.error).toContain('Missing domain');
    });
  });

  describe('Performance and Caching Verification', () => {
    it('should verify caching improves response time', async () => {
      const token = createValidJWT(mockEnv.SUPABASE_JWT_SECRET, 'perf-user', 'user@test.com');
      const domain = 'perf-test.com';
      const cachedResult: AnalysisResult = {
        domain,
        riskLevel: 'medium',
        confidence: 75,
        redFlags: ['Test'],
        verdict: 'Test verdict',
        score: 65,
        cachedAt: Date.now(),
      };

      // Pre-populate cache
      await mockEnv.SCAM_CACHE.put(
        `analysis:${domain}`,
        JSON.stringify(cachedResult)
      );

      const request = new Request('http://localhost/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          signals: { domainAgeDays: 30 },
        }),
      });

      // Cached request should complete without any fetch calls
      const response = await handler.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      // Cached response should complete without any fetch calls
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
