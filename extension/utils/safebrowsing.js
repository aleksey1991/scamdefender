/**
 * Checks if a URL is flagged by Google Safe Browsing API.
 *
 * This function queries the Google Safe Browsing API v4 to determine if a URL
 * is known to be malicious. It checks for multiple threat types including
 * malware, social engineering, unwanted software, and potentially harmful
 * applications.
 *
 * @param {string} url - The URL to check against Google Safe Browsing
 * @param {string} apiKey - The Google Safe Browsing API key
 * @returns {Promise<boolean>} True if the URL is flagged as dangerous, false if safe or on error
 */
export async function checkSafeBrowsing(url, apiKey) {
  try {
    const requestBody = {
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
        threatEntries: [{ url: url }],
      },
    };

    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      // On HTTP error, return false (safe)
      return false;
    }

    const data = await response.json();

    // Check if matches array exists and has any entries
    if (data.matches && Array.isArray(data.matches) && data.matches.length > 0) {
      return true; // URL is flagged
    }

    return false; // URL is safe
  } catch (error) {
    // Never throw - always return false on any error
    return false;
  }
}
