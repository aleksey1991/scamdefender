/**
 * Calculate a risk score 0-100 based on collected signals.
 * Higher score = more risky.
 * @param {Object} signals
 * @param {number} signals.domainAgeDays - domain age in days, -1 if unknown
 * @param {boolean} signals.safeBrowsingFlagged - true if Google flagged it
 * @param {boolean} signals.noHttps - true if site is HTTP (not HTTPS)
 * @returns {number} risk score 0-100
 */
export function calculateRiskScore(signals) {
  // Return 0 if signals object is empty or undefined
  if (!signals || Object.keys(signals).length === 0) {
    return 0;
  }

  let score = 0;

  // Domain age scoring
  if (signals.domainAgeDays !== undefined) {
    if (signals.domainAgeDays === -1) {
      // Unknown domain age
      score += 5;
    } else if (signals.domainAgeDays >= 0 && signals.domainAgeDays < 30) {
      // Very new domain (less than 30 days)
      score += 40;
    } else if (signals.domainAgeDays >= 30 && signals.domainAgeDays < 180) {
      // New domain (30-179 days)
      score += 25;
    } else if (signals.domainAgeDays >= 180 && signals.domainAgeDays < 365) {
      // Moderately new domain (180-364 days)
      score += 10;
    }
    // Domains 365+ days old add 0 points
  }

  // Safe Browsing flag
  if (signals.safeBrowsingFlagged === true) {
    score += 50;
  }

  // HTTP (no HTTPS) flag
  if (signals.noHttps === true) {
    score += 20;
  }

  // Cap final score at 100
  return Math.min(score, 100);
}
