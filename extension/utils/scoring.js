/**
 * Calculate a risk score 0-100 based on collected signals.
 * Higher score = more risky.
 * @param {Object} signals
 * @param {number} signals.domainAgeDays - domain age in days, -1 if unknown
 * @param {boolean} signals.safeBrowsingFlagged - true if Google flagged it
 * @param {boolean} signals.noHttps - true if site is HTTP (not HTTPS)
 * @param {Object} signals.trustpilot - Trustpilot review data
 * @param {boolean} signals.trustpilot.found - whether Trustpilot review was found
 * @param {number} signals.trustpilot.rating - Trustpilot rating (1.0-5.0)
 * @param {number} signals.trustpilot.reviewCount - number of reviews
 * @param {Object} signals.contentScan - content analysis results
 * @param {boolean} signals.contentScan.noPhysicalAddress - missing physical address
 * @param {boolean} signals.contentScan.noPhoneNumber - missing phone number
 * @param {boolean} signals.contentScan.suspiciousReturnPolicy - suspicious return policy
 * @param {boolean} signals.contentScan.suspiciousLuxuryPricing - suspicious luxury pricing
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

  // Trustpilot scoring
  if (signals.trustpilot) {
    if (signals.trustpilot.found === false) {
      // No Trustpilot review found
      score += 10;
    } else if (signals.trustpilot.found === true) {
      // Trustpilot review exists - check rating
      if (signals.trustpilot.rating !== undefined) {
        if (signals.trustpilot.rating < 2.0) {
          score += 30;
        } else if (signals.trustpilot.rating >= 2.0 && signals.trustpilot.rating < 3.4) {
          score += 15;
        }
        // Rating >= 3.4 adds 0 points
      }

      // Check review count
      if (signals.trustpilot.reviewCount !== undefined && signals.trustpilot.reviewCount < 10) {
        score += 10;
      }
    }
  }

  // Content scan scoring
  if (signals.contentScan) {
    if (signals.contentScan.noPhysicalAddress === true) {
      score += 10;
    }

    if (signals.contentScan.noPhoneNumber === true) {
      score += 5;
    }

    if (signals.contentScan.suspiciousReturnPolicy === true) {
      score += 10;
    }

    if (signals.contentScan.suspiciousLuxuryPricing === true) {
      score += 15;
    }
  }

  // Cap final score at 100
  return Math.min(score, 100);
}
