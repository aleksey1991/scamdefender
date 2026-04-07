import { describe, test, expect } from '@jest/globals';

// Skip all tests if SAFE_BROWSING_KEY is not set
const hasApiKey = !!process.env.SAFE_BROWSING_KEY;
const describeOrSkip = hasApiKey ? describe : describe.skip;

/**
 * Check URL against Google Safe Browsing API
 * @param {string} url - URL to check
 * @param {string} apiKey - Safe Browsing API key
 * @returns {Promise<boolean>} - True if flagged
 */
async function checkSafeBrowsing(url, apiKey) {
  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client: {
            clientId: 'scamshield',
            clientVersion: '0.3.0'
          },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION'
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }]
          }
        })
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.matches && data.matches.length > 0;
  } catch (error) {
    return false;
  }
}

describeOrSkip('Google Safe Browsing Integration Tests (REAL API)', () => {
  const apiKey = process.env.SAFE_BROWSING_KEY;

  test('a known clean URL returns false', async () => {
    const result = await checkSafeBrowsing('https://www.google.com/', apiKey);
    expect(result).toBe(false);
  }, 10000);

  test('Google test malware URL returns true', async () => {
    // Google's official test URL for Safe Browsing
    const testUrl = 'http://testsafebrowsing.appspot.com/s/malware.html';
    const result = await checkSafeBrowsing(testUrl, apiKey);
    expect(result).toBe(true);
  }, 10000);

  test('handles invalid URL gracefully', async () => {
    const result = await checkSafeBrowsing('not-a-valid-url', apiKey);
    expect(typeof result).toBe('boolean');
  }, 10000);

  test('handles network errors gracefully', async () => {
    // Use an invalid API key to trigger error handling
    const result = await checkSafeBrowsing('https://www.example.com/', 'invalid-key');
    expect(result).toBe(false);
  }, 10000);
});
