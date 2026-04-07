import { jest } from '@jest/globals';
import { checkSafeBrowsing } from './safebrowsing.js';

describe('checkSafeBrowsing', () => {
  const mockApiKey = 'test-api-key-123';
  const testUrl = 'https://example.com';

  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('flagged URL returns true', async () => {
    // Mock response with matches
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          {
            threatType: 'MALWARE',
            platformType: 'ANY_PLATFORM',
            threat: { url: testUrl },
          },
        ],
      }),
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(true);
  });

  test('clean URL returns false', async () => {
    // Mock response with no matches
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });

  test('empty matches array returns false', async () => {
    // Mock response with empty matches array
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [],
      }),
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });

  test('network error returns false', async () => {
    // Mock network error
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });

  test('API key is included in the request URL', async () => {
    // Mock successful response
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await checkSafeBrowsing(testUrl, mockApiKey);

    // Verify fetch was called with correct URL including API key
    expect(global.fetch).toHaveBeenCalledWith(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${mockApiKey}`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  });

  test('HTTP error response returns false', async () => {
    // Mock HTTP error (non-ok response)
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });

  test('request body contains correct structure', async () => {
    // Mock successful response
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await checkSafeBrowsing(testUrl, mockApiKey);

    // Verify fetch was called with correct request body
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client: {
            clientId: 'scamdefender',
            clientVersion: '0.2.0',
          },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: testUrl }],
          },
        }),
      })
    );
  });

  test('malformed JSON response returns false', async () => {
    // Mock response that throws when parsing JSON
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });

  test('multiple matches returns true', async () => {
    // Mock response with multiple threat matches
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          {
            threatType: 'MALWARE',
            platformType: 'ANY_PLATFORM',
            threat: { url: testUrl },
          },
          {
            threatType: 'SOCIAL_ENGINEERING',
            platformType: 'ANY_PLATFORM',
            threat: { url: testUrl },
          },
        ],
      }),
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(true);
  });

  test('non-array matches returns false', async () => {
    // Mock response with matches that is not an array
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: 'not-an-array',
      }),
    });

    const result = await checkSafeBrowsing(testUrl, mockApiKey);
    expect(result).toBe(false);
  });
});
