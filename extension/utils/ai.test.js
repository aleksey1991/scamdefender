import { jest } from '@jest/globals';
import { analyzeWithAI } from './ai.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('analyzeWithAI', () => {
  const validSignals = {
    domain: 'example.com',
    domainAgeDays: 21,
    safeBrowsingFlagged: false,
    trustpilot: {
      found: false
    },
    contentFlags: []
  };

  const validPageExcerpts = {
    aboutUs: 'We are a legitimate business.',
    returnPolicy: '30-day money back guarantee.'
  };

  const validApiKey = 'test-api-key-12345';

  const validGeminiResponse = {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            risk_level: 'high',
            confidence: 85,
            red_flags: ['Domain registered 3 weeks ago', 'Not found on Trustpilot'],
            verdict: 'This site shows several hallmarks of a scam operation. The domain is extremely new and has no customer review history anywhere online. Exercise extreme caution before purchasing.'
          })
        }]
      }
    }]
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('returns null when apiKey is null', async () => {
    const result = await analyzeWithAI(validSignals, validPageExcerpts, null);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns null when apiKey is empty string', async () => {
    const result = await analyzeWithAI(validSignals, validPageExcerpts, '');
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns null when apiKey is whitespace only', async () => {
    const result = await analyzeWithAI(validSignals, validPageExcerpts, '   ');
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('valid response returns parsed object with all 4 fields', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => validGeminiResponse
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);

    expect(result).toEqual({
      risk_level: 'high',
      confidence: 85,
      red_flags: ['Domain registered 3 weeks ago', 'Not found on Trustpilot'],
      verdict: 'This site shows several hallmarks of a scam operation. The domain is extremely new and has no customer review history anywhere online. Exercise extreme caution before purchasing.'
    });
  });

  test('malformed JSON response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: 'not valid json {{'
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing risk_level field in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                confidence: 85,
                red_flags: ['test'],
                verdict: 'test verdict'
              })
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing confidence field in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                risk_level: 'high',
                red_flags: ['test'],
                verdict: 'test verdict'
              })
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing red_flags field in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                risk_level: 'high',
                confidence: 85,
                verdict: 'test verdict'
              })
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing verdict field in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                risk_level: 'high',
                confidence: 85,
                red_flags: ['test']
              })
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('red_flags is not an array returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                risk_level: 'high',
                confidence: 85,
                red_flags: 'not an array',
                verdict: 'test verdict'
              })
            }]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('network error returns null', async () => {
    fetch.mockRejectedValue(new Error('Network error'));

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('timeout returns null', async () => {
    // Mock a fetch that respects the abort signal
    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({
          ok: true,
          json: async () => validGeminiResponse
        });
      }, 10000);

      // Listen for abort signal
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('The operation was aborted'));
        });
      }
    }));

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  }, 15000);

  test('429 rate limit response returns null', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('500 server error response returns null', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('prompt is constructed correctly', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => validGeminiResponse
    });

    const signals = {
      domain: 'scamsite.com',
      domainAgeDays: 15,
      safeBrowsingFlagged: true,
      trustpilot: {
        found: true,
        rating: 4.5,
        reviewCount: 120
      },
      contentFlags: ['Urgency tactics', 'Too good to be true']
    };

    const pageExcerpts = {
      aboutUs: 'About us content here',
      returnPolicy: 'Return policy content here'
    };

    await analyzeWithAI(signals, pageExcerpts, validApiKey);

    expect(fetch).toHaveBeenCalledTimes(1);
    const callArgs = fetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);

    const promptText = requestBody.contents[0].parts[0].text;

    // Verify key elements in the prompt
    expect(promptText).toContain('Domain: scamsite.com');
    expect(promptText).toContain('Domain age: 15 days');
    expect(promptText).toContain('Google Safe Browsing: FLAGGED');
    expect(promptText).toContain('Trustpilot: 4.5 stars, 120 reviews');
    expect(promptText).toContain('Page red flags: Urgency tactics, Too good to be true');
    expect(promptText).toContain('"About us content here"');
    expect(promptText).toContain('"Return policy content here"');
  });

  test('prompt handles missing content flags correctly', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => validGeminiResponse
    });

    const signals = {
      domain: 'example.com',
      domainAgeDays: 100,
      safeBrowsingFlagged: false,
      trustpilot: {
        found: false
      },
      contentFlags: []
    };

    await analyzeWithAI(signals, validPageExcerpts, validApiKey);

    const callArgs = fetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);
    const promptText = requestBody.contents[0].parts[0].text;

    expect(promptText).toContain('Page red flags: None');
    expect(promptText).toContain('Trustpilot: Not found');
    expect(promptText).toContain('Google Safe Browsing: Clean');
  });

  test('API key appears in URL, not in body', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => validGeminiResponse
    });

    await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);

    expect(fetch).toHaveBeenCalledTimes(1);
    const callArgs = fetch.mock.calls[0];
    const url = callArgs[0];
    const requestBody = callArgs[1].body;

    // API key should be in URL
    expect(url).toContain(`key=${validApiKey}`);
    expect(url).toContain('gemini-2.5-flash-lite:generateContent');

    // API key should NOT be in body
    expect(requestBody).not.toContain(validApiKey);
  });

  test('request body has correct structure', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => validGeminiResponse
    });

    await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);

    const callArgs = fetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);

    expect(requestBody).toHaveProperty('contents');
    expect(requestBody).toHaveProperty('generationConfig');
    expect(requestBody.generationConfig.responseMimeType).toBe('application/json');
    expect(Array.isArray(requestBody.contents)).toBe(true);
    expect(requestBody.contents[0]).toHaveProperty('parts');
  });

  test('missing candidates in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing content in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{}]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing parts in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {}
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });

  test('missing text in response returns null', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{}]
          }
        }]
      })
    });

    const result = await analyzeWithAI(validSignals, validPageExcerpts, validApiKey);
    expect(result).toBeNull();
  });
});
