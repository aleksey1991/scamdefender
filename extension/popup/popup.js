/**
 * ScamDefender Popup UI - Phase 4
 * Displays comprehensive risk analysis with scoring, signals, and AI verdict
 */

// Signal explanations for plain English display
const SIGNAL_EXPLANATIONS = {
    domainAge: {
        pass: (days) => `Registered ${formatAge(days)} ago`,
        fail: (days) => `Only ${formatAge(days)} old (very new)`
    },
    safeBrowsing: {
        pass: 'No threats detected by Google',
        fail: 'Flagged by Google Safe Browsing'
    },
    trustpilot: {
        found: (rating, count) => `${rating.toFixed(1)} stars (${count} reviews)`,
        notFound: 'Not found on Trustpilot'
    },
    pageScan: {
        clean: 'No suspicious patterns detected',
        redFlags: (count) => `${count} suspicious pattern${count > 1 ? 's' : ''} found`
    },
    https: {
        pass: 'Uses secure HTTPS encryption',
        fail: 'No HTTPS encryption (insecure)'
    }
};

/**
 * Format age in days to human-readable string
 */
function formatAge(days) {
    if (days < 0) return 'unknown time';
    if (days < 365) return `${days} days`;
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? 's' : ''}`;
}

/**
 * Get risk level info based on score
 */
function getRiskLevelInfo(score) {
    if (score === 0) {
        return { level: 'safe', label: 'Trusted', color: 'var(--color-safe)' };
    } else if (score < 30) {
        return { level: 'low', label: 'Low Risk', color: 'var(--color-low)' };
    } else if (score < 60) {
        return { level: 'medium', label: 'Medium Risk', color: 'var(--color-medium)' };
    } else if (score < 85) {
        return { level: 'high', label: 'High Risk', color: 'var(--color-high)' };
    } else {
        return { level: 'critical', label: 'Critical Risk', color: 'var(--color-critical)' };
    }
}

/**
 * Update the score gauge display
 */
function updateScoreGauge(score) {
    const gaugeFill = document.getElementById('gauge-fill');
    const scoreNumber = document.getElementById('score-number');
    const riskLabel = document.getElementById('risk-label');

    const percentage = Math.min(100, Math.max(0, score));
    const riskInfo = getRiskLevelInfo(score);

    // Update gauge fill
    gaugeFill.style.width = `${percentage}%`;
    gaugeFill.style.backgroundColor = riskInfo.color;

    // Update score number
    scoreNumber.textContent = score;
    scoreNumber.className = `score-number risk-${riskInfo.level}`;

    // Update risk label
    riskLabel.textContent = riskInfo.label;
    riskLabel.className = `risk-label risk-${riskInfo.level}`;
}

/**
 * Create a signal row element
 */
function createSignalRow(signal) {
    const row = document.createElement('div');
    row.className = 'signal-row';

    const icon = document.createElement('div');
    icon.className = `signal-icon ${signal.passed ? 'pass' : 'fail'}`;
    icon.textContent = signal.passed ? '✓' : '✗';

    const content = document.createElement('div');
    content.className = 'signal-content';

    const name = document.createElement('div');
    name.className = 'signal-name';
    name.textContent = signal.name;

    const value = document.createElement('div');
    value.className = 'signal-value';
    value.textContent = signal.value;

    content.appendChild(name);
    content.appendChild(value);

    // Add sub-items if present (for page scan red flags)
    if (signal.subItems && signal.subItems.length > 0) {
        const subItems = document.createElement('div');
        subItems.className = 'signal-subitems';
        signal.subItems.forEach(item => {
            const subItem = document.createElement('div');
            subItem.className = 'signal-subitem';
            subItem.textContent = item;
            subItems.appendChild(subItem);
        });
        content.appendChild(subItems);
    }

    const points = document.createElement('div');
    points.className = 'signal-points';
    points.textContent = signal.points;

    row.appendChild(icon);
    row.appendChild(content);
    row.appendChild(points);

    return row;
}

/**
 * Extract red flags from content scan
 */
function extractRedFlags(contentScan) {
    const flags = [];
    if (contentScan.noPhysicalAddress) flags.push('No physical address');
    if (contentScan.noPhoneNumber) flags.push('No phone number');
    if (contentScan.suspiciousReturnPolicy) flags.push('Suspicious return policy');
    if (contentScan.suspiciousLuxuryPricing) flags.push('Suspicious luxury pricing');
    return flags;
}

/**
 * Render all signals
 */
function renderSignals(signals, url) {
    const signalsList = document.getElementById('signals-list');
    signalsList.innerHTML = '';

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';

    const signalsToRender = [];

    // 1. HTTPS Signal
    signalsToRender.push({
        name: 'HTTPS Encryption',
        value: isHttps ? SIGNAL_EXPLANATIONS.https.pass : SIGNAL_EXPLANATIONS.https.fail,
        passed: isHttps,
        points: isHttps ? '+0' : '+15'
    });

    // 2. Domain Age Signal
    if (signals.domainAgeDays !== undefined && signals.domainAgeDays >= 0) {
        const days = signals.domainAgeDays;
        const passed = days >= 180;
        signalsToRender.push({
            name: 'Domain Age',
            value: passed
                ? SIGNAL_EXPLANATIONS.domainAge.pass(days)
                : SIGNAL_EXPLANATIONS.domainAge.fail(days),
            passed: passed,
            points: passed ? '+0' : `+${Math.min(30, Math.floor((180 - days) / 6))}`
        });
    }

    // 3. Safe Browsing Signal
    const safeBrowsingFlagged = signals.safeBrowsingFlagged === true;
    signalsToRender.push({
        name: 'Google Safe Browsing',
        value: safeBrowsingFlagged
            ? SIGNAL_EXPLANATIONS.safeBrowsing.fail
            : SIGNAL_EXPLANATIONS.safeBrowsing.pass,
        passed: !safeBrowsingFlagged,
        points: safeBrowsingFlagged ? '+40' : '+0'
    });

    // 4. Trustpilot Signal
    if (signals.trustpilot) {
        const { found, rating, reviewCount } = signals.trustpilot;
        if (found) {
            const passed = rating >= 3.4 && reviewCount >= 10;
            signalsToRender.push({
                name: 'Trustpilot Rating',
                value: SIGNAL_EXPLANATIONS.trustpilot.found(rating, reviewCount),
                passed: passed,
                points: passed ? '+0' : '+10'
            });
        } else {
            signalsToRender.push({
                name: 'Trustpilot Rating',
                value: SIGNAL_EXPLANATIONS.trustpilot.notFound,
                passed: true,
                points: '+0'
            });
        }
    }

    // 5. Page Scan Signal
    if (signals.contentScan) {
        const redFlags = extractRedFlags(signals.contentScan);
        const passed = redFlags.length === 0;
        signalsToRender.push({
            name: 'Page Content Scan',
            value: passed
                ? SIGNAL_EXPLANATIONS.pageScan.clean
                : SIGNAL_EXPLANATIONS.pageScan.redFlags(redFlags.length),
            passed: passed,
            points: passed ? '+0' : `+${redFlags.length * 5}`,
            subItems: redFlags
        });
    }

    // Render all signals
    signalsToRender.forEach(signal => {
        signalsList.appendChild(createSignalRow(signal));
    });
}

/**
 * Render "What to do" section for high/critical risk
 */
// eslint-disable-next-line no-unused-vars
function renderWhatToDo(score, domain) {
    const section = document.getElementById('what-to-do-section');
    const actionList = document.getElementById('action-list');

    if (score < 60) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    actionList.innerHTML = '';

    const actions = [];

    if (score >= 60 && score < 85) {
        // High risk (60-84)
        actions.push('Do not enter payment information or personal details');
        actions.push('Verify the company through independent sources');
        actions.push(`Report to <a href="https://reportfraud.ftc.gov" target="_blank">reportfraud.ftc.gov</a> if you suspect fraud`);
    } else if (score >= 85) {
        // Critical risk (85+)
        actions.push('Close this page immediately');
        actions.push('Do not interact with any forms or links');
        actions.push('If you entered payment info, contact your bank immediately');
        actions.push(`Report to <a href="https://reportfraud.ftc.gov" target="_blank">reportfraud.ftc.gov</a>`);
    }

    actions.forEach(action => {
        const li = document.createElement('li');
        li.innerHTML = action;
        actionList.appendChild(li);
    });
}

/**
 * Render AI verdict section
 */
function renderAIVerdict(aiResult) {
    const section = document.getElementById('ai-section');
    const card = document.getElementById('ai-verdict-card');

    if (!aiResult || !aiResult.verdict) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    card.innerHTML = '';

    // Confidence
    const confidence = document.createElement('div');
    confidence.className = 'ai-confidence';
    confidence.textContent = `Confidence: ${aiResult.confidence || 0}%`;
    card.appendChild(confidence);

    // Red flags
    if (aiResult.red_flags && aiResult.red_flags.length > 0) {
        const redFlags = document.createElement('div');
        redFlags.className = 'ai-red-flags';

        const title = document.createElement('div');
        title.className = 'ai-red-flags-title';
        title.textContent = 'AI-Detected Concerns:';
        redFlags.appendChild(title);

        const list = document.createElement('ul');
        list.className = 'ai-red-flags-list';
        aiResult.red_flags.forEach(flag => {
            const li = document.createElement('li');
            li.textContent = flag;
            list.appendChild(li);
        });
        redFlags.appendChild(list);
        card.appendChild(redFlags);
    }

    // Verdict
    const verdictText = document.createElement('div');
    verdictText.className = 'ai-verdict-text';
    verdictText.textContent = aiResult.verdict;
    card.appendChild(verdictText);
}

/**
 * Update external links
 */
function updateExternalLinks(domain) {
    const externalLinks = document.getElementById('external-links');
    const trustpilotLink = document.getElementById('trustpilot-link');
    const scamadviserLink = document.getElementById('scamadviser-link');
    const reportLink = document.getElementById('report-link');

    externalLinks.style.display = 'block';

    trustpilotLink.href = `https://www.trustpilot.com/review/${domain}`;
    scamadviserLink.href = `https://www.scamadviser.com/check-website/${domain}`;

    const reportSection = document.getElementById('report-section');
    reportSection.style.display = 'block';
    reportLink.href = `mailto:reports@scamdefender.app?subject=Scam Site Report&body=Domain: ${domain}`;
}

/**
 * Show trusted site badge
 */
function showTrustedSite() {
    const loadingState = document.getElementById('loading-state');
    const trustedBadge = document.getElementById('trusted-badge');
    const scoreSection = document.getElementById('score-section');
    const signalsSection = document.getElementById('signals-section');

    loadingState.style.display = 'none';
    trustedBadge.style.display = 'block';
    scoreSection.style.display = 'none';
    signalsSection.style.display = 'none';
}

/**
 * Display analysis results
 */
function displayAnalysis(result, domain, url) {
    const loadingState = document.getElementById('loading-state');
    const scoreSection = document.getElementById('score-section');
    const signalsSection = document.getElementById('signals-section');

    loadingState.style.display = 'none';

    // Check if this is a whitelisted/trusted site (score = 0)
    if (result.score === 0) {
        showTrustedSite();
        updateExternalLinks(domain);
        return;
    }

    // Show score section
    scoreSection.style.display = 'block';
    updateScoreGauge(result.score);

    // Show signals
    signalsSection.style.display = 'block';
    renderSignals(result.signals || {}, url);

    // Show "What to do" if high/critical risk
    renderWhatToDo(result.score, domain);

    // Show AI verdict if available
    if (result.aiResult) {
        renderAIVerdict(result.aiResult);
    }

    // Show external links
    updateExternalLinks(domain);
}

/**
 * Initialize popup
 */
async function initPopup() {
    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url) {
            document.getElementById('domain-name').textContent = 'No active tab';
            document.getElementById('loading-state').style.display = 'none';
            return;
        }

        // Extract domain
        const url = new URL(tab.url);
        const domain = url.hostname;

        // Update domain bar
        document.getElementById('domain-name').textContent = domain;

        // Try to get stored analysis results
        const storageKey = `result_${tab.id}`;
        const result = await chrome.storage.local.get(storageKey);

        if (result[storageKey]) {
            // Display stored results
            displayAnalysis(result[storageKey], domain, tab.url);
        } else {
            // No results yet - show analyzing state
            document.getElementById('loading-state').style.display = 'block';

            // For demo purposes, show mock data after a short delay
            setTimeout(() => {
                const mockResult = {
                    score: 0,
                    signals: {
                        domainAgeDays: 3650,
                        safeBrowsingFlagged: false,
                        trustpilot: { found: false, rating: null, reviewCount: null },
                        contentScan: {
                            noPhysicalAddress: false,
                            noPhoneNumber: false,
                            suspiciousReturnPolicy: false,
                            suspiciousLuxuryPricing: false
                        }
                    },
                    aiResult: null
                };
                displayAnalysis(mockResult, domain, tab.url);
            }, 1000);
        }
    } catch (error) {
        console.error('Error initializing popup:', error);
        document.getElementById('domain-name').textContent = 'Error loading page';
        document.getElementById('loading-state').style.display = 'none';
    }
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Initialize popup
    initPopup();
});
