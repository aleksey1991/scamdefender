import { getRiskLabel } from '../utils/risk.js';

/**
 * Update a signal item's display
 * @param {string} signalId - The signal element ID
 * @param {boolean} pass - Whether the signal passed
 * @param {string} value - The value to display
 */
function updateSignal(signalId, pass, value) {
    const signalElement = document.getElementById(signalId);
    if (!signalElement) return;

    const iconElement = signalElement.querySelector('.signal-icon');
    const valueElement = signalElement.querySelector('.signal-value');

    // Update icon based on pass/fail
    iconElement.textContent = pass ? '✓' : '✗';

    // Update value
    valueElement.textContent = value;

    // Add pass/fail class
    signalElement.classList.remove('pass', 'fail');
    signalElement.classList.add(pass ? 'pass' : 'fail');
}

/**
 * Get the red flag descriptions for display
 * @param {Object} contentScan - The content scan results
 * @returns {Array<string>} Array of red flag descriptions
 */
function getRedFlags(contentScan) {
    const flags = [];
    if (contentScan.noPhysicalAddress) {
        flags.push('No physical address');
    }
    if (contentScan.noPhoneNumber) {
        flags.push('No phone number');
    }
    if (contentScan.suspiciousReturnPolicy) {
        flags.push('Suspicious return policy');
    }
    if (contentScan.suspiciousLuxuryPricing) {
        flags.push('Suspicious luxury pricing');
    }
    return flags;
}

/**
 * Display AI analysis verdict
 * @param {Object|null} aiResult - The AI analysis result
 * @param {boolean} hasApiKey - Whether user has configured an API key
 */
function displayAIAnalysis(aiResult, hasApiKey) {
    const aiSection = document.getElementById('ai-section');
    const aiContent = document.getElementById('ai-content');

    if (!hasApiKey) {
        // No API key configured
        aiSection.style.display = 'block';
        aiContent.innerHTML = `
            <div class="ai-cta">
                <p>🔒 Unlock AI Analysis</p>
                <button id="add-api-key-btn">Add API Key</button>
            </div>
        `;

        // Add click handler for button
        document.getElementById('add-api-key-btn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
        return;
    }

    if (aiResult === null) {
        // API key configured but analysis not ready yet
        aiSection.style.display = 'none';
        return;
    }

    if (aiResult) {
        // AI analysis available
        aiSection.style.display = 'block';

        // Color coding for risk levels
        const riskColors = {
            low: '#10B981',      // Green
            medium: '#FBBF24',   // Yellow
            high: '#F59E0B',     // Orange
            critical: '#DC2626'  // Red
        };

        const riskColor = riskColors[aiResult.risk_level] || '#6B7280';

        const redFlagsList = aiResult.red_flags && aiResult.red_flags.length > 0
            ? `<ul>${aiResult.red_flags.map(flag => `<li>${flag}</li>`).join('')}</ul>`
            : '<p>No specific concerns identified</p>';

        aiContent.innerHTML = `
            <div class="ai-verdict">
                <div class="risk-badge" style="background-color: ${riskColor};">
                    ${aiResult.risk_level.toUpperCase()}
                </div>
                <div class="ai-confidence">
                    ${aiResult.confidence}% confident
                </div>
                <div class="ai-red-flags">
                    <h3>Concerns:</h3>
                    ${redFlagsList}
                </div>
                <div class="ai-verdict-text">
                    <h3>Verdict:</h3>
                    <p>${aiResult.verdict}</p>
                </div>
            </div>
        `;
    }
}

/**
 * Display all signals in the popup
 * @param {Object} result - The analysis result object
 */
function displaySignals(result) {
    // 1. HTTPS Signal
    const isHttps = !result.noHttps;
    updateSignal('signal-https', isHttps, isHttps ? 'Secure' : 'Not Secure');

    // 2. Domain Age Signal
    if (result.domainAgeDays !== undefined) {
        const days = result.domainAgeDays;
        if (days === -1) {
            updateSignal('signal-domain-age', false, 'Unknown');
        } else {
            const pass = days > 180;
            updateSignal('signal-domain-age', pass, `${days} days`);
        }
    } else {
        updateSignal('signal-domain-age', false, 'Unknown');
    }

    // 3. Safe Browsing Signal
    const safeBrowsingFlagged = result.safeBrowsingFlagged === true;
    updateSignal('signal-safe-browsing', !safeBrowsingFlagged, safeBrowsingFlagged ? 'Flagged' : 'Clean');

    // 4. Trustpilot Signal
    if (result.trustpilot) {
        const { found, rating, reviewCount } = result.trustpilot;
        if (found) {
            const pass = rating >= 3.4 && reviewCount >= 10;
            const displayValue = `${rating.toFixed(1)} ★ (${reviewCount} reviews)`;
            updateSignal('signal-trustpilot', pass, displayValue);
        } else {
            // Not found is considered a pass (neutral)
            updateSignal('signal-trustpilot', true, 'Not on Trustpilot');
        }
    } else {
        updateSignal('signal-trustpilot', true, 'Not on Trustpilot');
    }

    // 5. Page Scan Signal
    if (result.contentScan) {
        const redFlags = getRedFlags(result.contentScan);
        const pass = redFlags.length === 0;

        if (pass) {
            updateSignal('signal-page-scan', true, '0 red flags');
        } else {
            const flagsList = redFlags.join(', ');
            updateSignal('signal-page-scan', false, `${redFlags.length} red flags: ${flagsList}`);
        }
    } else {
        updateSignal('signal-page-scan', true, '0 red flags');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Get UI elements
    const loadingState = document.getElementById('loading-state');
    const trustedIndicator = document.getElementById('trusted-indicator');
    const mainContent = document.getElementById('main-content');
    const domainName = document.getElementById('domain-name');
    const riskScore = document.getElementById('risk-score');
    const riskLabelEl = document.getElementById('risk-label');

    try {
        // Query the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url) {
            showError('No active tab found');
            return;
        }

        // Read current_result and API keys from chrome.storage.local
        chrome.storage.local.get(['current_result', 'gemini_api_key'], (data) => {
            const result = data.current_result;
            const hasGeminiKey = !!data.gemini_api_key;

            if (!result) {
                // No result yet, show loading
                showLoading();
                return;
            }

            // Check if trusted domain
            if (result.trusted) {
                showTrustedSite();
                return;
            }

            // Show main content with risk analysis
            showRiskAnalysis(result, hasGeminiKey);
        });

    } catch (error) {
        console.error('Error:', error);
        showError('Error loading page info');
    }

    function showLoading() {
        loadingState.classList.remove('hidden');
        trustedIndicator.classList.add('hidden');
        mainContent.classList.add('hidden');
    }

    function showTrustedSite() {
        loadingState.classList.add('hidden');
        trustedIndicator.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }

    function showRiskAnalysis(result, hasGeminiKey) {
        loadingState.classList.add('hidden');
        trustedIndicator.classList.add('hidden');
        mainContent.classList.remove('hidden');

        // Display domain name
        domainName.textContent = result.domain || '-';

        // Display risk score
        const score = result.score || 0;
        riskScore.textContent = score;

        // Display risk label with color
        const { label } = getRiskLabel(score);
        riskLabelEl.textContent = label;

        // Add appropriate class for background color
        riskLabelEl.classList.remove('safe', 'caution', 'suspicious', 'danger');
        if (score < 30) {
            riskLabelEl.classList.add('safe');
        } else if (score < 60) {
            riskLabelEl.classList.add('caution');
        } else if (score < 80) {
            riskLabelEl.classList.add('suspicious');
        } else {
            riskLabelEl.classList.add('danger');
        }

        // Display all signals
        displaySignals(result);

        // Display AI analysis if available
        displayAIAnalysis(result.aiResult || null, hasGeminiKey);
    }

    function showError(message) {
        loadingState.classList.add('hidden');
        trustedIndicator.classList.add('hidden');
        mainContent.classList.remove('hidden');
        domainName.textContent = message;
    }
});
