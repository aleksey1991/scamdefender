/**
 * XOR obfuscation for API keys
 * Note: This is NOT encryption, just simple obfuscation to prevent casual viewing
 * @param {string} str - String to obfuscate/deobfuscate
 * @returns {string} Obfuscated/deobfuscated string
 */
export function obfuscate(str) {
    return str.split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ (42 + i % 13))
    ).join('');
}

/**
 * Validates that a key is not empty
 * @param {string} key - Key to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function validateKey(key) {
    return key !== null && key !== undefined && key.trim().length > 0;
}

/**
 * Loads keys from chrome.storage.local
 * @returns {Promise<{geminiKey: string, safeBrowsingKey: string}>}
 */
export async function loadKeys() {
    const result = await chrome.storage.local.get(['geminiKey', 'safeBrowsingKey']);
    return {
        geminiKey: result.geminiKey ? obfuscate(result.geminiKey) : '',
        safeBrowsingKey: result.safeBrowsingKey ? obfuscate(result.safeBrowsingKey) : ''
    };
}

/**
 * Saves keys to chrome.storage.local
 * @param {string} geminiKey - Gemini API key
 * @param {string} safeBrowsingKey - Safe Browsing API key
 * @returns {Promise<void>}
 */
export async function saveKeys(geminiKey, safeBrowsingKey) {
    const data = {};

    if (geminiKey && geminiKey.trim().length > 0) {
        data.geminiKey = obfuscate(geminiKey);
    }

    if (safeBrowsingKey && safeBrowsingKey.trim().length > 0) {
        data.safeBrowsingKey = obfuscate(safeBrowsingKey);
    }

    await chrome.storage.local.set(data);
}

/**
 * Shows a status message
 * @param {string} message - Message to display
 * @param {string} type - Type of message ('success' or 'error')
 */
export function showStatus(message, type) {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

/**
 * Initialize the options page
 * @returns {Promise<void>}
 */
export async function initializePage() {
    const geminiKeyInput = document.getElementById('gemini-key');
    const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');
    const saveButton = document.getElementById('save-button');
    const backLink = document.getElementById('back-link');

    // Load existing keys
    try {
        const keys = await loadKeys();
        if (keys.geminiKey) {
            geminiKeyInput.value = keys.geminiKey;
        }
        if (keys.safeBrowsingKey) {
            safeBrowsingKeyInput.value = keys.safeBrowsingKey;
        }
    } catch (error) {
        showStatus('Error loading settings', 'error');
    }

    // Save button handler
    saveButton.addEventListener('click', async () => {
        const geminiKey = geminiKeyInput.value;
        const safeBrowsingKey = safeBrowsingKeyInput.value;

        // Validate at least one key is provided
        if (!validateKey(geminiKey) && !validateKey(safeBrowsingKey)) {
            showStatus('Please enter at least one API key', 'error');
            return;
        }

        try {
            await saveKeys(geminiKey, safeBrowsingKey);
            showStatus('Saved!', 'success');
        } catch (error) {
            showStatus('Error saving settings', 'error');
        }
    });

    // Back link handler
    backLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.close();
    });
}

// Initialize page when DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initializePage);
}
