import { analyzeWithAI } from '../src/analyze.js';
import type { Env, AnalysisResult } from '../src/types.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock AbortController
const mockAbort = jest.fn();
class MockAbortController {
  signal = new AbortSignal();
  abort = mockAbort;
}

(global as any).AbortController = MockAbortController;

describe('analyzeWithAI', () => {
  const mockEnv: Env = {
    SCAM_CACHE: {} as KVNamespace,
    USER_STATUS: {} as KVNamespace,
    RATE_LIMIT: {} as KVNamespace,
    GEMINI_API_KEY: 'test-api-key-12345',
    SUPABASE_JWT_SECRET: 'test-secret',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-role-key',
    STRIPE_WEBHOOK_SECRET: 'test-webhook',
    GIFTED_PRO_EMAILS: 'test@example.com',
    ENVIRONMENT: 'test',
  };

  const testDomain = 'suspicious-domain.com';
  const testSignals = {
    domainAgeDays: 5,
    safeBrowsingFlagged: true,
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

  const _mockValidResponse: AnalysisResult = {
    domain: testDomain,
    riskLevel: 'high',
    confidence: 92,
    redFlags: [
      'Very young domain (5 days)',
      'No physical address',
      'Flagged by Safe Browsing',
    ],
    verdict:
      'This domain shows multiple indicators of malicious activity. The young age combined with missing contact information and Safe Browsing flagging suggests potential scam or phishing activity.',
    score: 85,
    cachedAt: expect.any(Number),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Successful API calls', () => {
    it('should return Success with AnalysisResult on valid Gemini API response', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 92,
                    redFlags: [
                      'Very young domain (5 days)',
                      'No physical address',
                      'Flagged by Safe Browsing',
                    ],
                    verdict:
                      'This domain shows multiple indicators of malicious activity. The young age combined with missing contact information and Safe Browsing flagging suggests potential scam or phishing activity.',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.domain).toBe(testDomain);
        expect(result.data.riskLevel).toBe('high');
        expect(result.data.confidence).toBe(92);
        expect(result.data.score).toBe(85);
        expect(result.data.redFlags).toHaveLength(3);
        expect(typeof result.data.cachedAt).toBe('number');
      }
    });

    it('should parse JSON wrapped in markdown code block', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Here is the analysis:\n\n```json\n{\n  "riskLevel": "medium",\n  "confidence": 75,\n  "redFlags": ["suspicious pricing"],\n  "verdict": "Moderate risk detected",\n  "score": 65\n}\n```\n\nThis is a suspicious site.',
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.riskLevel).toBe('medium');
        expect(result.data.confidence).toBe(75);
        expect(result.data.score).toBe(65);
      }
    });

    it('should parse raw JSON without markdown formatting', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Before JSON object { "riskLevel": "low", "confidence": 45, "redFlags": [], "verdict": "Low risk", "score": 20 } After text',
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.riskLevel).toBe('low');
        expect(result.data.confidence).toBe(45);
        expect(result.data.score).toBe(20);
      }
    });

    it('should parse entire response as JSON when it is pure JSON', async () => {
      const jsonResponse = {
        riskLevel: 'critical',
        confidence: 99,
        redFlags: ['confirmed malware', 'phishing detected'],
        verdict: 'Definitely malicious',
        score: 98,
      };

      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(jsonResponse),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.riskLevel).toBe('critical');
        expect(result.data.score).toBe(98);
      }
    });
  });

  describe('HTTP Error handling', () => {
    it('should return Failure when API returns non-200 status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: jest.fn().mockResolvedValueOnce('Invalid API key'),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('401');
        expect(result.error).toContain('Unauthorized');
      }
    });

    it('should handle 500 server error from Gemini API', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValueOnce('Server error'),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('500');
      }
    });

    it('should handle API error when text() call fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: jest.fn().mockRejectedValueOnce(new Error('Read error')),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('503');
        expect(result.error).toContain('Unknown error');
      }
    });
  });

  describe('Timeout handling', () => {
    it('should return Failure with timeout message when request exceeds 30 seconds', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(abortError), 100);
          })
      );

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timeout');
        expect(result.error).toContain('30 seconds');
      }
    });

    it('should clear timeout when request completes successfully', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 50,
                    redFlags: [],
                    verdict: 'Safe',
                    score: 10,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clear timeout when request fails with error', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('JSON Parsing errors', () => {
    it('should return Failure when response contains no text', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [{}],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No text content');
      }
    });

    it('should return Failure when JSON cannot be extracted', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This is just plain text with no JSON data at all',
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to extract JSON');
      }
    });

    it('should return Failure when markdown JSON is malformed', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Analysis:\n\n```json\n{ invalid json here\n```',
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to extract JSON');
      }
    });
  });

  describe('Response validation', () => {
    it('should return Failure when riskLevel is missing', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    confidence: 90,
                    redFlags: ['flag'],
                    verdict: 'Bad site',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when riskLevel has invalid value', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'extreme',
                    confidence: 90,
                    redFlags: ['flag'],
                    verdict: 'Bad',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when confidence is missing', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    redFlags: ['flag'],
                    verdict: 'Bad',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when confidence is out of range (>100)', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 150,
                    redFlags: ['flag'],
                    verdict: 'Bad',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when redFlags is not an array', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 90,
                    redFlags: 'flag1, flag2',
                    verdict: 'Bad',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when redFlags contains non-string elements', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 90,
                    redFlags: ['flag1', 123, 'flag2'],
                    verdict: 'Bad',
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when verdict is missing', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 90,
                    redFlags: ['flag'],
                    score: 85,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when score is missing', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 90,
                    redFlags: ['flag'],
                    verdict: 'Bad',
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should return Failure when score is out of range (>100)', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 90,
                    redFlags: ['flag'],
                    verdict: 'Bad',
                    score: 150,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('missing required fields');
      }
    });

    it('should accept all valid riskLevels', async () => {
      const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ];

      for (const riskLevel of riskLevels) {
        const geminiResponse = {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      riskLevel,
                      confidence: 50,
                      redFlags: [],
                      verdict: 'Test',
                      score: 50,
                    }),
                  },
                ],
              },
            },
          ],
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(geminiResponse),
        });

        const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.riskLevel).toBe(riskLevel);
        }
      }
    });
  });

  describe('Network error handling', () => {
    it('should return Failure on generic network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Failed to fetch: ECONNREFUSED')
      );

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to analyze domain');
        expect(result.error).toContain('ECONNREFUSED');
      }
    });

    it('should return Failure on DNS resolution error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('getaddrinfo ENOTFOUND api.example.com')
      );

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to analyze domain');
      }
    });

    it('should return Failure on non-Error network exception', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce('String error');

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unexpected error');
      }
    });
  });

  describe('Request construction', () => {
    it('should construct correct API URL with API key', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 50,
                    redFlags: [],
                    verdict: 'Safe',
                    score: 10,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('test-api-key-12345'),
        expect.any(Object)
      );
    });

    it('should send POST request with correct headers and body', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 50,
                    redFlags: [],
                    verdict: 'Safe',
                    score: 10,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      await analyzeWithAI(mockEnv, testDomain, testSignals);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const options = callArgs[1];

      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.contents).toBeDefined();
      expect(body.contents[0].parts[0].text).toContain(testDomain);
      expect(body.contents[0].parts[0].text).toContain('riskLevel');
    });

    it('should include signals in the prompt', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 50,
                    redFlags: [],
                    verdict: 'Safe',
                    score: 10,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      await analyzeWithAI(mockEnv, testDomain, testSignals);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      const body = JSON.parse(options.body);
      const prompt = body.contents[0].parts[0].text;

      expect(prompt).toContain('domainAgeDays');
      expect(prompt).toContain('5');
      expect(prompt).toContain('safeBrowsingFlagged');
    });
  });

  describe('Response caching timestamp', () => {
    it('should include cachedAt timestamp in result', async () => {
      const now = Date.now();
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 50,
                    redFlags: [],
                    verdict: 'Safe',
                    score: 10,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cachedAt).toBeGreaterThanOrEqual(now);
        expect(typeof result.data.cachedAt).toBe('number');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty redFlags array', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 30,
                    redFlags: [],
                    verdict: 'Appears safe',
                    score: 5,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.redFlags).toEqual([]);
      }
    });

    it('should handle confidence at boundary (0)', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 0,
                    redFlags: [],
                    verdict: 'Unknown',
                    score: 50,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBe(0);
      }
    });

    it('should handle confidence at boundary (100)', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'critical',
                    confidence: 100,
                    redFlags: ['flag'],
                    verdict: 'Definitely bad',
                    score: 100,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBe(100);
      }
    });

    it('should handle score at boundary (0)', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'low',
                    confidence: 95,
                    redFlags: [],
                    verdict: 'Very safe',
                    score: 0,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(0);
      }
    });

    it('should handle very long verdict text', async () => {
      const longVerdict =
        'This is a very long verdict. '.repeat(100) + 'Final verdict.';

      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'high',
                    confidence: 85,
                    redFlags: ['flag1', 'flag2', 'flag3'],
                    verdict: longVerdict,
                    score: 75,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verdict).toBe(longVerdict);
      }
    });

    it('should handle many redFlags', async () => {
      const manyFlags = Array.from(
        { length: 50 },
        (_, i) => `Flag ${i + 1}`
      );

      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskLevel: 'critical',
                    confidence: 99,
                    redFlags: manyFlags,
                    verdict: 'Extremely suspicious',
                    score: 99,
                  }),
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(geminiResponse),
      });

      const result = await analyzeWithAI(mockEnv, testDomain, testSignals);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.redFlags).toHaveLength(50);
      }
    });
  });
});
