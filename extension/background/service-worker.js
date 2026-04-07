// ScamDefender Service Worker
// Handles background tasks and event listeners for the extension

import { extractDomain, isCheckableUrl, isHttps } from '../utils/url.js';
import { isTrusted } from '../utils/whitelist.js';
import { getCached, setCached } from '../utils/cache.js';
import { getDomainAge } from '../utils/rdap.js';
import { checkSafeBrowsing } from '../utils/safebrowsing.js';
import { calculateRiskScore } from '../utils/scoring.js';
import { getRiskLabel, getBadgeText } from '../utils/risk.js';
import { getTrustpilotData } from '../utils/trustpilot.js';
import { analyzeWithAI } from '../utils/ai.js';

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

// Install event listener
chrome.runtime.onInstalled.addListener(() => {
  console.log("ScamDefender service worker installed");
});

/**
 * Updates the extension badge for a given tab.
 * @param {number} tabId - The ID of the tab to update
 * @param {string} text - The badge text to display
 * @param {string} color - The badge background color
 */
async function updateBadge(tabId, text, color) {
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
}

/**
 * Main function to check a URL for scam indicators.
 * @param {number} tabId - The ID of the tab being checked
 * @param {string} url - The URL to check
 */
async function checkUrl(tabId, url) {
  try {
    console.log('[ScamDefender] Checking URL:', url);

    // Step 1: Extract domain from URL
    const domain = extractDomain(url);
    console.log('[ScamDefender] Extracted domain:', domain);

    // Step 2: Skip if not checkable
    if (!isCheckableUrl(url)) {
      console.log('[ScamDefender] URL is not checkable, skipping');
      return;
    }

    // Step 3: Check if domain is trusted
    if (isTrusted(domain)) {
      console.log('[ScamDefender] Domain is trusted, setting safe badge');
      await updateBadge(tabId, '✓', '#00b894');

      // Store result for popup
      await chrome.storage.local.set({
        current_result: {
          domain,
          url,
          score: 0,
          label: 'SAFE',
          trusted: true,
          timestamp: Date.now()
        }
      });
      return;
    }

    // Step 4: Check cache
    const cached = await getCached(domain);
    if (cached) {
      console.log('[ScamDefender] Using cached result:', cached);
      const { color } = getRiskLabel(cached.score);
      const badgeText = getBadgeText(cached.score);
      await updateBadge(tabId, badgeText, color);

      // Update current result for popup
      await chrome.storage.local.set({
        current_result: {
          ...cached,
          domain,
          url,
          timestamp: Date.now()
        }
      });
      return;
    }

    // Step 5: Read Safe Browsing API key from storage
    const storage = await chrome.storage.local.get('safe_browsing_key');
    const apiKey = storage.safe_browsing_key;

    if (!apiKey) {
      console.warn('[ScamDefender] No Safe Browsing API key configured');
      // Continue without Safe Browsing check
    }

    // Step 6: Run domain age, Safe Browsing, and Trustpilot checks in parallel
    console.log('[ScamDefender] Running API checks in parallel...');
    const [domainAgeDays, safeBrowsingFlagged, trustpilot] = await Promise.all([
      getDomainAge(domain),
      apiKey ? checkSafeBrowsing(url, apiKey) : Promise.resolve(false),
      getTrustpilotData(domain)
    ]);

    console.log('[ScamDefender] Domain age (days):', domainAgeDays);
    console.log('[ScamDefender] Safe Browsing flagged:', safeBrowsingFlagged);
    console.log('[ScamDefender] Trustpilot data:', trustpilot);

    // Step 7: Check HTTPS
    const noHttps = !isHttps(url);
    console.log('[ScamDefender] No HTTPS:', noHttps);

    // Step 8: Calculate risk score with all signals
    const score = calculateRiskScore({
      domainAgeDays,
      safeBrowsingFlagged,
      noHttps,
      trustpilot
    });
    console.log('[ScamDefender] Calculated risk score:', score);

    // Step 9: Store result in cache (24 hour TTL)
    const result = {
      score,
      domainAgeDays,
      safeBrowsingFlagged,
      noHttps,
      trustpilot,
      checkedAt: Date.now()
    };
    await setCached(domain, result, 24);
    console.log('[ScamDefender] Result cached for 24 hours');

    // Step 10: Update badge
    const { label, color } = getRiskLabel(score);
    const badgeText = getBadgeText(score);
    await updateBadge(tabId, badgeText, color);
    console.log('[ScamDefender] Badge updated:', { label, badgeText, color });

    // Step 11: Store current result for popup
    await chrome.storage.local.set({
      current_result: {
        domain,
        url,
        score,
        label,
        domainAgeDays,
        safeBrowsingFlagged,
        noHttps,
        trustpilot,
        timestamp: Date.now()
      }
    });
    console.log('[ScamDefender] Current result stored for popup');

    // Step 12: Run AI analysis in background (non-blocking)
    runAIAnalysisInBackground(domain, url, tabId, {
      domainAgeDays,
      safeBrowsingFlagged,
      noHttps,
      trustpilot
    });

  } catch (error) {
    console.error('[ScamDefender] Error checking URL:', error);
    // Set error badge
    await updateBadge(tabId, '?', '#95a5a6');
  }
}

/**
 * Run AI analysis in the background (non-blocking)
 * @param {string} domain - Domain name
 * @param {string} url - Full URL
 * @param {number} tabId - Tab ID
 * @param {Object} signals - Current signals
 */
async function runAIAnalysisInBackground(domain, url, tabId, signals) {
  try {
    // Get Gemini API key from storage
    const storage = await chrome.storage.local.get('gemini_api_key');
    const obfuscatedKey = storage.gemini_api_key;

    if (!obfuscatedKey) {
      console.log('[ScamDefender] No Gemini API key configured, skipping AI analysis');
      return;
    }

    // Deobfuscate the API key
    const apiKey = deobfuscate(obfuscatedKey);

    // Get page excerpts from content scan if available
    const result = await chrome.storage.local.get('current_result');
    const pageExcerpts = result.current_result?.pageExcerpts || {};

    console.log('[ScamDefender] Running AI analysis...');
    const aiResult = await analyzeWithAI(signals, pageExcerpts, apiKey);

    if (aiResult) {
      console.log('[ScamDefender] AI analysis completed:', aiResult);

      // Update current result with AI analysis
      const currentResult = await chrome.storage.local.get('current_result');
      if (currentResult.current_result) {
        await chrome.storage.local.set({
          current_result: {
            ...currentResult.current_result,
            aiResult,
            aiAnalysisCompleted: true
          }
        });

        // Update cache with AI result
        await setCached(domain, {
          ...currentResult.current_result,
          aiResult
        }, 24);
      }
    }
  } catch (error) {
    console.error('[ScamDefender] Error running AI analysis:', error);
  }
}

// Tab update event listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkUrl(tabId, tab.url);
  }
});

// Message listener for content script results
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'CONTENT_SCAN_RESULT') {
    console.log("Content scan result received:", message.data);

    // Only process if message is from a tab
    if (sender.tab && sender.tab.id) {
      const tabId = sender.tab.id;

      // Get current tab's analysis result
      chrome.storage.local.get(['current_result'], async (items) => {
        const currentResult = items.current_result;

        if (!currentResult) {
          console.warn(`No analysis result found for tab ${tabId}`);
          return;
        }

        // Add content scan data to the result
        const updatedSignals = {
          domainAgeDays: currentResult.domainAgeDays,
          safeBrowsingFlagged: currentResult.safeBrowsingFlagged,
          noHttps: currentResult.noHttps,
          trustpilot: currentResult.trustpilot,
          contentScan: message.data
        };

        // Recalculate score with all signals including content scan
        const newScore = calculateRiskScore(updatedSignals);

        // Update result
        const updatedResult = {
          ...currentResult,
          ...updatedSignals,
          score: newScore,
          contentScanCompleted: true,
          pageExcerpts: message.pageExcerpts,
          timestamp: Date.now()
        };

        // Store updated result
        await chrome.storage.local.set({ current_result: updatedResult });

        // Update cache with content scan data if not trusted
        if (!currentResult.trusted) {
          await setCached(currentResult.domain, updatedResult, 24);
        }

        // Update badge with new score
        const { color } = getRiskLabel(newScore);
        const badgeText = getBadgeText(newScore);
        await updateBadge(tabId, badgeText, color);

        console.log(`Updated analysis for tab ${tabId} with content scan: score=${newScore}`, updatedSignals);

        // Trigger AI analysis with updated signals and page excerpts
        runAIAnalysisInBackground(currentResult.domain, currentResult.url, tabId, updatedSignals);
      });
    }
  }
});
