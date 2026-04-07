/**
 * A set of trusted domains that are considered safe by default.
 * These domains are well-known, reputable websites with strong security practices.
 */
export const TRUSTED_DOMAINS = new Set([
  'google.com',
  'amazon.com',
  'apple.com',
  'microsoft.com',
  'paypal.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'netflix.com',
  'spotify.com',
  'github.com',
  'stackoverflow.com'
]);

/**
 * Checks if a domain is in the trusted domains whitelist.
 * Supports exact matches and parent domain matching for subdomains.
 *
 * For example:
 * - "google.com" returns true (exact match)
 * - "mail.google.com" returns true (parent domain match)
 * - "a.b.google.com" returns true (multi-level subdomain match)
 * - "malicious.com" returns false (not in whitelist)
 *
 * @param {string} domain - The domain to check (e.g., "mail.google.com")
 * @returns {boolean} True if the domain or any parent domain is trusted, false otherwise
 */
export function isTrusted(domain) {
  // Handle empty or invalid input
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  // Normalize domain to lowercase
  const normalizedDomain = domain.toLowerCase().trim();

  // Check if domain is empty after trimming
  if (normalizedDomain === '') {
    return false;
  }

  // Check exact match first
  if (TRUSTED_DOMAINS.has(normalizedDomain)) {
    return true;
  }

  // Check parent domains by progressively removing subdomains
  const parts = normalizedDomain.split('.');

  // Need at least 2 parts for a valid domain (e.g., "google.com")
  if (parts.length < 2) {
    return false;
  }

  // Try each parent domain level
  // For "a.b.google.com", try "b.google.com", then "google.com"
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join('.');
    if (TRUSTED_DOMAINS.has(parentDomain)) {
      return true;
    }
  }

  return false;
}
