import { getRiskLabel } from '../utils/risk.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Get UI elements
    const loadingState = document.getElementById('loading-state');
    const trustedIndicator = document.getElementById('trusted-indicator');
    const mainContent = document.getElementById('main-content');
    const domainName = document.getElementById('domain-name');
    const riskScore = document.getElementById('risk-score');
    const riskLabelEl = document.getElementById('risk-label');
    const domainAgeIcon = document.getElementById('domain-age-icon');
    const domainAgeText = document.getElementById('domain-age-text');
    const safeBrowsingIcon = document.getElementById('safe-browsing-icon');
    const safeBrowsingText = document.getElementById('safe-browsing-text');
    const httpsIcon = document.getElementById('https-icon');
    const httpsText = document.getElementById('https-text');

    try {
        // Query the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url) {
            showError('No active tab found');
            return;
        }

        // Read current_result from chrome.storage.local
        chrome.storage.local.get(['current_result'], (data) => {
            const result = data.current_result;

            if (!result) {
                // No result yet, show loading
                showLoading();
                return;
            }

            // Check if trusted domain
            if (result.is_trusted) {
                showTrustedSite();
                return;
            }

            // Show main content with risk analysis
            showRiskAnalysis(result);
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

    function showRiskAnalysis(result) {
        loadingState.classList.add('hidden');
        trustedIndicator.classList.add('hidden');
        mainContent.classList.remove('hidden');

        // Display domain name
        domainName.textContent = result.domain || '-';

        // Display risk score
        const score = result.risk_score || 0;
        riskScore.textContent = score;

        // Display risk label with color
        const { label, color } = getRiskLabel(score);
        riskLabelEl.textContent = label;
        riskLabelEl.style.color = color;

        // Add appropriate class for background color
        riskLabelEl.classList.remove('safe', 'caution', 'suspicious', 'danger');
        riskLabelEl.classList.add(label.toLowerCase());

        // Display signal indicators
        displaySignals(result);
    }

    function displaySignals(result) {
        const signals = result.signals || {};

        // Domain Age Signal
        if (signals.domain_age !== undefined) {
            const domainAge = signals.domain_age;
            const isPassed = domainAge > 180; // Pass if domain is older than 180 days

            domainAgeIcon.textContent = isPassed ? '✓' : '✗';
            domainAgeIcon.classList.remove('pass', 'fail');
            domainAgeIcon.classList.add(isPassed ? 'pass' : 'fail');
            domainAgeText.textContent = `Domain Age: ${domainAge} days`;
        } else {
            domainAgeIcon.textContent = '✗';
            domainAgeIcon.classList.remove('pass', 'fail');
            domainAgeIcon.classList.add('fail');
            domainAgeText.textContent = 'Domain Age: Unknown';
        }

        // Safe Browsing Signal
        if (signals.safe_browsing !== undefined) {
            const isSafe = signals.safe_browsing === true;

            safeBrowsingIcon.textContent = isSafe ? '✓' : '✗';
            safeBrowsingIcon.classList.remove('pass', 'fail');
            safeBrowsingIcon.classList.add(isSafe ? 'pass' : 'fail');
            safeBrowsingText.textContent = `Safe Browsing: ${isSafe ? 'Clean' : 'Flagged'}`;
        } else {
            safeBrowsingIcon.textContent = '✓';
            safeBrowsingIcon.classList.remove('pass', 'fail');
            safeBrowsingIcon.classList.add('pass');
            safeBrowsingText.textContent = 'Safe Browsing: Clean';
        }

        // HTTPS Signal
        if (signals.https !== undefined) {
            const isSecure = signals.https === true;

            httpsIcon.textContent = isSecure ? '✓' : '✗';
            httpsIcon.classList.remove('pass', 'fail');
            httpsIcon.classList.add(isSecure ? 'pass' : 'fail');
            httpsText.textContent = `HTTPS: ${isSecure ? 'Secure' : 'Not Secure'}`;
        } else {
            httpsIcon.textContent = '✗';
            httpsIcon.classList.remove('pass', 'fail');
            httpsIcon.classList.add('fail');
            httpsText.textContent = 'HTTPS: Not Secure';
        }
    }

    function showError(message) {
        loadingState.classList.add('hidden');
        trustedIndicator.classList.add('hidden');
        mainContent.classList.remove('hidden');
        domainName.textContent = message;
    }
});
