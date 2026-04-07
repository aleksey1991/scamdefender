// ScamShield Service Worker
// Handles background tasks and event listeners for the extension

import { getTrustpilotData } from '../utils/trustpilot.js';
import { calculateRiskScore } from '../utils/scoring.js';
import { analyzeWithAI } from '../utils/ai.js';

// Cache TTL: 24 hours in milliseconds
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Deobfuscate API key (XOR symmetric operation)
 * @param {string} str - Obfuscated string
 * @returns {string} - Deobfuscated string
 */
function deobfuscate(str) {
  if (!str) return '';
  return str.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ (42 + i % 13))
  ).join('');
}

// Whitelist of trusted domains (bypass all checks)
const WHITELIST = [
  'google.com',
  'youtube.com',
  'facebook.com',
  'amazon.com',
  'twitter.com',
  'github.com',
  'stackoverflow.com',
  'wikipedia.org',
  'reddit.com',
  'linkedin.com'
];

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string|null} - Domain or null if invalid
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

/**
 * Check if domain is whitelisted
 * @param {string} domain - Domain to check
 * @param {string[]} userWhitelist - User-defined whitelist
 * @returns {boolean} - True if whitelisted
 */
function isWhitelisted(domain, userWhitelist = []) {
  const allWhitelisted = [...WHITELIST, ...userWhitelist];
  return allWhitelisted.some(trusted =>
    domain === trusted || domain.endsWith(`.${trusted}`)
  );
}

/**
 * Check if URL uses HTTPS
 * @param {string} url - Full URL
 * @returns {boolean} - True if HTTP (not HTTPS)
 */
function isNotHttps(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:';
  } catch (error) {
    return false;
  }
}

/**
 * Get domain age from RDAP (placeholder for Phase 1)
 * @param {string} domain - Domain to check
 * @returns {Promise<number>} - Domain age in days, -1 if unknown
 */
// eslint-disable-next-line no-unused-vars
async function getDomainAge(domain) {
  // TODO: Implement RDAP lookup in Phase 1
  // For now, return -1 (unknown)
  return -1;
}

/**
 * Check Google Safe Browsing (placeholder for Phase 2)
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} - True if flagged
 */
// eslint-disable-next-line no-unused-vars
async function checkSafeBrowsing(url) {
  // TODO: Implement Google Safe Browsing API in Phase 2
  // For now, return false (not flagged)
  return false;
}

/**
 * Get cached result for domain
 * @param {string} domain - Domain to check
 * @returns {Promise<Object|null>} - Cached result or null
 */
async function getCachedResult(domain) {
  const cacheKey = `cache_${domain}`;
  const result = await chrome.storage.local.get(cacheKey);

  if (result[cacheKey]) {
    const { data, timestamp } = result[cacheKey];
    const age = Date.now() - timestamp;

    // Check if cache is still valid (within 24 hours)
    if (age < CACHE_TTL) {
      console.log(`Cache hit for ${domain} (age: ${Math.round(age / 1000 / 60)} minutes)`);
      return data;
    } else {
      console.log(`Cache expired for ${domain}`);
    }
  }

  return null;
}

/**
 * Store result in cache
 * @param {string} domain - Domain
 * @param {Object} data - Result data
 */
async function cacheResult(domain, data) {
  const cacheKey = `cache_${domain}`;
  await chrome.storage.local.set({
    [cacheKey]: {
      data,
      timestamp: Date.now()
    }
  });
  console.log(`Cached result for ${domain}`);
}

/**
 * Update extension badge based on risk score
 * @param {number} tabId - Tab ID
 * @param {number} score - Risk score 0-100
 */
function updateBadge(tabId, score) {
  let badgeColor;
  let badgeText;

  if (score >= 70) {
    badgeColor = '#DC2626'; // Red
    badgeText = 'HIGH';
  } else if (score >= 40) {
    badgeColor = '#F59E0B'; // Orange
    badgeText = 'MED';
  } else if (score >= 20) {
    badgeColor = '#FBBF24'; // Yellow
    badgeText = 'LOW';
  } else {
    badgeColor = '#10B981'; // Green
    badgeText = 'SAFE';
  }

  chrome.action.setBadgeText({ tabId, text: badgeText });
  chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
}

/**
 * Check if URL is a shopping page
 * @param {string} url - URL to check
 * @returns {boolean} - True if shopping page
 */
function isShoppingPage(url) {
  const shoppingPatterns = ['/cart', '/checkout', '/product', '/shop', '/buy', '/order'];
  const urlLower = url.toLowerCase();
  return shoppingPatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Analyze a tab's URL for scam indicators
 * @param {number} tabId - Tab ID
 * @param {string} url - Tab URL
 */
async function analyzeTab(tabId, url) {
  const domain = extractDomain(url);

  if (!domain) {
    console.log('Invalid URL, skipping analysis');
    return;
  }

  // Skip analysis for internal/extension pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }

  console.log(`Analyzing tab ${tabId}: ${domain}`);

  // Get settings
  const settings = await chrome.storage.local.get(['scanMode', 'userWhitelist']);
  const scanMode = settings.scanMode || 'all';
  const userWhitelistStr = settings.userWhitelist || '';
  const userWhitelist = userWhitelistStr.split('\n').map(d => d.trim()).filter(d => d.length > 0);

  // Check scan mode
  if (scanMode === 'shopping' && !isShoppingPage(url)) {
    console.log(`Scan mode is 'shopping' but URL is not a shopping page, skipping analysis`);
    return;
  }

  // Check whitelist
  if (isWhitelisted(domain, userWhitelist)) {
    console.log(`Domain ${domain} is whitelisted, skipping analysis`);
    const result = {
      domain,
      url,
      whitelisted: true,
      score: 0,
      signals: {},
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ [`result_${tabId}`]: result });
    updateBadge(tabId, 0);
    return;
  }

  // Check cache
  const cached = await getCachedResult(domain);
  if (cached) {
    const result = {
      ...cached,
      url,
      fromCache: true,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ [`result_${tabId}`]: result });
    updateBadge(tabId, cached.score);
    return;
  }

  // Perform all checks in parallel
  const [domainAgeDays, safeBrowsingFlagged, trustpilot] = await Promise.all([
    getDomainAge(domain),
    checkSafeBrowsing(url),
    getTrustpilotData(domain)
  ]);

  const noHttps = isNotHttps(url);

  // Build signals object
  const signals = {
    domainAgeDays,
    safeBrowsingFlagged,
    noHttps,
    trustpilot
  };

  // Calculate initial score (before content scan)
  const score = calculateRiskScore(signals);

  const result = {
    domain,
    url,
    whitelisted: false,
    score,
    signals,
    timestamp: Date.now()
  };

  // Store result
  await chrome.storage.local.set({ [`result_${tabId}`]: result });

  // Cache result
  await cacheResult(domain, result);

  // Update badge
  updateBadge(tabId, score);

  console.log(`Analysis complete for ${domain}: score=${score}`, signals);
}

// Install event listener
chrome.runtime.onInstalled.addListener(() => {
  console.log("ScamShield service worker installed");
});

// Tab update event listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    analyzeTab(tabId, tab.url);
  }
});

// Message listener for content script results and OPEN_POPUP
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'OPEN_POPUP') {
    chrome.action.openPopup();
    return;
  }

  if (message.type === 'CONTENT_SCAN_RESULT') {
    console.log("Content scan result received:", message.data);

    // Only process if message is from a tab
    if (sender.tab && sender.tab.id) {
      const tabId = sender.tab.id;

      // Get current tab's analysis result and settings
      chrome.storage.local.get([`result_${tabId}`, 'scanMode'], async (items) => {
        const currentResult = items[`result_${tabId}`];
        const scanMode = items.scanMode || 'all';

        // Check if we should process this based on scan mode
        if (scanMode === 'shopping' && sender.tab && sender.tab.url) {
          const hasShoppingUrl = isShoppingPage(sender.tab.url);
          const hasPrice = message.data.pageExcerpts && /\$(\d+)(?:\.\d{2})?/.test(
            message.data.pageExcerpts.priceText || ''
          );

          if (!hasShoppingUrl && !hasPrice) {
            console.log('Scan mode is shopping but page is not a shopping page, skipping content scan');
            return;
          }
        }

        if (!currentResult) {
          console.warn(`No analysis result found for tab ${tabId}`);
          return;
        }

        // Extract page excerpts from content scan data
        const { pageExcerpts, ...contentScanFlags } = message.data;

        // Add content scan data to signals
        const updatedSignals = {
          ...currentResult.signals,
          contentScan: contentScanFlags
        };

        // Recalculate score with all signals
        const newScore = calculateRiskScore(updatedSignals);

        // Update result with content scan
        const updatedResult = {
          ...currentResult,
          signals: updatedSignals,
          score: newScore,
          contentScanCompleted: true,
          timestamp: Date.now()
        };

        // Store updated result (don't wait for AI)
        await chrome.storage.local.set({ [`result_${tabId}`]: updatedResult });

        // Update cache with content scan data
        if (!currentResult.whitelisted && !currentResult.fromCache) {
          await cacheResult(currentResult.domain, updatedResult);
        }

        // Update badge with new score (don't wait for AI)
        updateBadge(tabId, newScore);

        console.log(`Updated analysis for tab ${tabId} with content scan: score=${newScore}`, updatedSignals);

        // Show banner if score >= 70 and bannerEnabled
        chrome.storage.local.get(['bannerEnabled'], (settings) => {
          const bannerEnabled = settings.bannerEnabled !== undefined ? settings.bannerEnabled : true;

          if (newScore >= 70 && bannerEnabled) {
            const label = newScore >= 85 ? 'CRITICAL' : 'HIGH';
            chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_BANNER',
              score: newScore,
              label: label
            }).catch((err) => {
              console.log('Failed to send SHOW_BANNER message:', err);
            });
          }
        });

        // Try to get AI analysis (non-blocking)
        chrome.storage.local.get(['gemini_api_key'], async (keyData) => {
          const obfuscatedKey = keyData.gemini_api_key;

          if (!obfuscatedKey) {
            console.log('No Gemini API key configured, skipping AI analysis');
            return;
          }

          const apiKey = deobfuscate(obfuscatedKey);

          if (!apiKey) {
            console.log('Failed to deobfuscate Gemini API key');
            return;
          }

          console.log('Running AI analysis...');
          const aiResult = await analyzeWithAI(updatedSignals, pageExcerpts || {}, apiKey);

          if (aiResult) {
            console.log('AI analysis complete:', aiResult);
          } else {
            console.log('AI analysis returned null (error or timeout)');
          }

          // Store AI result alongside existing data
          const resultWithAI = {
            ...updatedResult,
            aiResult,
            aiAnalysisCompleted: true
          };

          await chrome.storage.local.set({ [`result_${tabId}`]: resultWithAI });

          // Update cache with AI result
          if (!currentResult.whitelisted && !currentResult.fromCache) {
            await cacheResult(currentResult.domain, resultWithAI);
          }

          // Check if AI analysis changes the score significantly and update banner if needed
          if (aiResult && aiResult.score !== undefined) {
            const finalScore = aiResult.score;
            chrome.storage.local.get(['bannerEnabled'], (settings) => {
              const bannerEnabled = settings.bannerEnabled !== undefined ? settings.bannerEnabled : true;

              if (finalScore >= 70 && bannerEnabled && finalScore !== newScore) {
                const label = finalScore >= 85 ? 'CRITICAL' : 'HIGH';
                chrome.tabs.sendMessage(tabId, {
                  type: 'SHOW_BANNER',
                  score: finalScore,
                  label: label
                }).catch((err) => {
                  console.log('Failed to send SHOW_BANNER message after AI:', err);
                });
              }
            });
          }
        });
      });
    }
  }
});
