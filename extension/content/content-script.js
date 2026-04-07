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
 * Extract text excerpt from "About Us" section
 * @returns {string} First 500 chars of About Us text, or empty string if not found
 */
function extractAboutUsExcerpt() {
  // Try multiple selectors for About Us section
  const selectors = [
    '#about',
    '.about',
    '[id*="about"]',
    '[class*="about"]'
  ];

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.innerText || element.textContent || '';
        return text.trim().substring(0, 500);
      }
    } catch (e) {
      // Continue to next selector if this one fails
      continue;
    }
  }

  return '';
}

/**
 * Extract text excerpt from Return Policy section
 * @returns {string} First 500 chars of return policy text, or empty string if not found
 */
function extractReturnPolicyExcerpt() {
  // Try multiple selectors for Return Policy section
  const selectors = [
    '#returns',
    '.returns',
    '#refund',
    '.refund',
    '[id*="return"]',
    '[id*="refund"]'
  ];

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.innerText || element.textContent || '';
        return text.trim().substring(0, 500);
      }
    } catch (e) {
      // Continue to next selector if this one fails
      continue;
    }
  }

  return '';
}

/**
 * Inject warning banner for high-risk sites
 * @param {number} score - Risk score (0-100)
 * @param {string} label - Risk label (HIGH or CRITICAL)
 */
function injectWarningBanner(score, label) {
  // Do NOT inject on chrome:// or chrome-extension:// URLs
  if (typeof window !== 'undefined' && window.location) {
    const url = window.location.href;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return;
    }
  }

  // Check if banner was dismissed in this session
  if (typeof sessionStorage !== 'undefined') {
    if (sessionStorage.getItem('scamdefender_dismissed')) {
      return;
    }
  }

  // Check if banner already exists
  if (document.getElementById('scamdefender-banner')) {
    return;
  }

  // Create banner elements
  const banner = document.createElement('div');
  banner.id = 'scamdefender-banner';

  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  icon.style.fontSize = '20px';

  const text = document.createElement('span');
  text.textContent = `Warning: This site has been flagged as ${label} RISK (Score: ${score}/100)`;
  text.style.flex = '1';

  const detailsButton = document.createElement('button');
  detailsButton.textContent = 'See Details';
  detailsButton.id = 'scamdefender-details-btn';
  detailsButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  });

  const dismissButton = document.createElement('button');
  dismissButton.textContent = '✕';
  dismissButton.id = 'scamdefender-dismiss-btn';
  dismissButton.addEventListener('click', () => {
    banner.remove();
    const style = document.getElementById('scamdefender-banner-style');
    if (style) {
      style.remove();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('scamdefender_dismissed', '1');
    }
  });

  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(detailsButton);
  banner.appendChild(dismissButton);

  // Inject CSS
  const style = document.createElement('style');
  style.id = 'scamdefender-banner-style';
  style.textContent = `
    #scamdefender-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: #d63031;
      color: white;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #scamdefender-details-btn {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #scamdefender-details-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    #scamdefender-dismiss-btn {
      background: transparent;
      color: white;
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #scamdefender-dismiss-btn:hover {
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
    }
  `;

  // Insert style and banner at the top of document
  if (document.head) {
    document.head.appendChild(style);
  }
  if (document.body) {
    document.body.insertBefore(banner, document.body.firstChild);
  }
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

  const pageExcerpts = {
    aboutUs: extractAboutUsExcerpt(),
    returnPolicy: extractReturnPolicyExcerpt()
  };

  // Send results to background service worker
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCAN_RESULT',
    data: { ...results, pageExcerpts }
  });
}

// Message listener for SHOW_BANNER
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_BANNER' && message.score >= 70) {
      injectWarningBanner(message.score, message.label);
    }
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
  extractAboutUsExcerpt,
  extractReturnPolicyExcerpt,
  scanPage,
  injectWarningBanner
};
