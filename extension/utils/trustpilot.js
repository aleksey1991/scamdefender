/**
 * Fetches Trustpilot rating data for a given domain.
 *
 * This function retrieves business rating information from Trustpilot by:
 * 1. Fetching the Trustpilot review page for the domain
 * 2. Parsing JSON-LD structured data from the page
 * 3. Extracting aggregateRating data (rating value and review count)
 *
 * @param {string} domain - The domain to look up (e.g., "example.com")
 * @returns {Promise<{found: boolean, rating: number|null, reviewCount: number|null}>}
 *   An object containing:
 *   - found: true if valid rating data was found, false otherwise
 *   - rating: The rating value (e.g., 4.2) or null if not found
 *   - reviewCount: The number of reviews or null if not found
 *
 * @example
 * const result = await getTrustpilotData("example.com");
 * // { found: true, rating: 4.2, reviewCount: 1847 }
 */
export async function getTrustpilotData(domain) {
  const notFoundResult = { found: false, rating: null, reviewCount: null };

  try {
    const url = `https://www.trustpilot.com/review/${domain}`;
    const response = await fetch(url);

    // Handle 404 or other error responses
    if (!response.ok) {
      return notFoundResult;
    }

    const html = await response.text();

    // Extract all JSON-LD script tags
    const jsonLdMatches = html.matchAll(
      /<script type="application\/ld\+json">(.*?)<\/script>/gs
    );

    // Search through all JSON-LD blocks for aggregateRating
    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);

        // Check if this JSON-LD block contains aggregateRating
        if (jsonData.aggregateRating) {
          const { ratingValue, reviewCount } = jsonData.aggregateRating;

          // Validate that we have the required fields
          if (ratingValue !== undefined && reviewCount !== undefined) {
            return {
              found: true,
              rating: parseFloat(ratingValue),
              reviewCount: parseInt(reviewCount, 10),
            };
          }
        }
      } catch (parseError) {
        // Continue to next JSON-LD block if this one is malformed
        continue;
      }
    }

    // No valid aggregateRating found
    return notFoundResult;
  } catch (error) {
    // Network errors or other exceptions
    return notFoundResult;
  }
}
