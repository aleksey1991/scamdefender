/**
 * Analyzes signals and page excerpts using Gemini AI to detect scam websites.
 *
 * @param {Object} signals - An object containing risk signals from the webpage
 * @param {string} signals.domain - The domain being analyzed
 * @param {number} signals.domainAgeDays - Age of the domain in days
 * @param {boolean} signals.safeBrowsingFlagged - Whether Google Safe Browsing flagged the site
 * @param {Object} signals.trustpilot - Trustpilot data
 * @param {boolean} signals.trustpilot.found - Whether site was found on Trustpilot
 * @param {number} signals.trustpilot.rating - Star rating (if found)
 * @param {number} signals.trustpilot.reviewCount - Number of reviews (if found)
 * @param {Array<string>} signals.contentFlags - Array of content scan flags that fired
 * @param {Object} pageExcerpts - Excerpts from key pages
 * @param {string} pageExcerpts.aboutUs - About Us page excerpt (max 500 chars)
 * @param {string} pageExcerpts.returnPolicy - Return policy excerpt (max 500 chars)
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object|null>} Analysis result with risk_level, confidence, red_flags, and verdict, or null on error
 */
export async function analyzeWithAI(signals, pageExcerpts, apiKey) {
  // Return null if API key is missing or empty
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  // Build the prompt
  const contentFlagsText = signals.contentFlags && signals.contentFlags.length > 0
    ? signals.contentFlags.join(', ')
    : 'None';

  const trustpilotText = signals.trustpilot.found
    ? `${signals.trustpilot.rating} stars, ${signals.trustpilot.reviewCount} reviews`
    : 'Not found';

  const prompt = `You are a scam website detection assistant helping consumers avoid fake retail sites.
Analyze the signals below and return ONLY valid JSON — no markdown, no explanation.

Domain: ${signals.domain}
Domain age: ${signals.domainAgeDays} days
Google Safe Browsing: ${signals.safeBrowsingFlagged ? 'FLAGGED' : 'Clean'}
Trustpilot: ${trustpilotText}
Page red flags: ${contentFlagsText}
About Us excerpt (max 500 chars): "${pageExcerpts.aboutUs}"
Return policy excerpt (max 500 chars): "${pageExcerpts.returnPolicy}"

Respond with exactly this JSON structure:
{
  "risk_level": "low" | "medium" | "high" | "critical",
  "confidence": 0-100,
  "red_flags": ["specific concern 1", "specific concern 2"],
  "verdict": "2-3 sentence plain English verdict a non-technical consumer can understand"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Check if response is not OK (includes 429 rate limit)
    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Extract the text from the response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return null;
    }

    // Parse the JSON response
    const result = JSON.parse(text);

    // Validate required fields
    if (
      !result.risk_level ||
      typeof result.confidence !== 'number' ||
      !Array.isArray(result.red_flags) ||
      !result.verdict
    ) {
      return null;
    }

    return result;
  } catch (error) {
    // Return null on any error (network, timeout, malformed JSON, etc.)
    return null;
  }
}
