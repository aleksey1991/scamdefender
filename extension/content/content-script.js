// ScamShield Content Script
// This script is injected into web pages to scan for scam indicators

/**
 * Get all visible text content from the page
 * @returns {string} The page's text content
 */
function getPageText() {
  return document.body.innerText || document.body.textContent || '';
}

/**
 * Check if page is missing a physical address
 * @returns {boolean} True if no physical address found (red flag)
 */
function checkNoPhysicalAddress() {
  const text = getPageText();

  // Patterns for physical addresses
  // Look for street numbers + street names (e.g., "123 Main St", "456 Oak Avenue")
  const streetPattern = /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Parkway|Pkwy)/i;

  // Look for city, state, zip patterns (e.g., "New York, NY 10001")
  const cityStateZipPattern = /[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(-\d{4})?/;

  // If either pattern is found, we have an address
  const hasAddress = streetPattern.test(text) || cityStateZipPattern.test(text);

  return !hasAddress;
}

/**
 * Check if page is missing a phone number
 * @returns {boolean} True if no phone number found (red flag)
 */
function checkNoPhoneNumber() {
  const text = getPageText();

  // Phone number pattern: supports various formats
  // (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890, +1 123 456 7890
  const phonePattern = /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;

  return !phonePattern.test(text);
}

/**
 * Check for suspicious return policy language
 * @returns {boolean} True if suspicious return policy found (red flag)
 */
function checkSuspiciousReturnPolicy() {
  const text = getPageText().toLowerCase();

  // Suspicious return policy phrases
  const suspiciousPhrases = [
    'no returns',
    'no refunds',
    'all sales final',
    '7 days only',
    'no exchanges',
    'no cancellations'
  ];

  return suspiciousPhrases.some(phrase => text.includes(phrase));
}

/**
 * Check for suspiciously low luxury brand pricing
 * @returns {boolean} True if luxury items priced under $100 (red flag)
 */
function checkSuspiciousLuxuryPricing() {
  const text = getPageText().toLowerCase();

  // Luxury brand keywords
  const luxuryBrands = [
    'gucci',
    'prada',
    'louis vuitton',
    'chanel',
    'hermes',
    'versace',
    'balenciaga',
    'burberry',
    'dior',
    'fendi',
    'givenchy',
    'valentino',
    'bottega veneta'
  ];

  // Check if any luxury brand is mentioned
  const hasLuxuryBrand = luxuryBrands.some(brand => text.includes(brand));

  if (!hasLuxuryBrand) {
    return false;
  }

  // Look for prices in the format $XX or $XX.XX
  const pricePattern = /\$(\d+)(?:\.\d{2})?/g;
  const prices = [];
  let match;

  while ((match = pricePattern.exec(text)) !== null) {
    prices.push(parseInt(match[1], 10));
  }

  // If any price is under $100 and luxury brand is mentioned, it's suspicious
  return prices.some(price => price < 100);
}

/**
 * Run all scam detection checks and send results to background worker
 */
function scanPage() {
  const results = {
    noPhysicalAddress: checkNoPhysicalAddress(),
    noPhoneNumber: checkNoPhoneNumber(),
    suspiciousReturnPolicy: checkSuspiciousReturnPolicy(),
    suspiciousLuxuryPricing: checkSuspiciousLuxuryPricing()
  };

  // Send results to background service worker
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCAN_RESULT',
    data: results
  });
}

// Run scan when page loads (only in browser context, not during testing)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanPage);
  } else {
    scanPage();
  }
}

// Export functions for testing (ES modules)
export {
  checkNoPhysicalAddress,
  checkNoPhoneNumber,
  checkSuspiciousReturnPolicy,
  checkSuspiciousLuxuryPricing,
  getPageText,
  scanPage
};
