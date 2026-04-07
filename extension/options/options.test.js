/**
 * @jest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { obfuscate, validateKey, loadKeys, saveKeys, loadSettings, saveSettings, showStatus, initializePage } from './options.js';

describe('obfuscate', () => {
    test('obfuscate then deobfuscate returns original string', () => {
        const original = 'AIzaSyDTestKey12345';
        const obfuscated = obfuscate(original);
        const deobfuscated = obfuscate(obfuscated);
        expect(deobfuscated).toBe(original);
    });

    test('obfuscate changes the string', () => {
        const original = 'AIzaSyDTestKey12345';
        const obfuscated = obfuscate(original);
        expect(obfuscated).not.toBe(original);
    });

    test('obfuscate handles empty string', () => {
        const original = '';
        const obfuscated = obfuscate(original);
        expect(obfuscated).toBe('');
    });

    test('obfuscate produces different output for different inputs', () => {
        const key1 = 'key1';
        const key2 = 'key2';
        expect(obfuscate(key1)).not.toBe(obfuscate(key2));
    });
});

describe('validateKey', () => {
    test('empty key fails validation', () => {
        expect(validateKey('')).toBe(false);
    });

    test('whitespace-only key fails validation', () => {
        expect(validateKey('   ')).toBe(false);
    });

    test('null key fails validation', () => {
        expect(validateKey(null)).toBe(false);
    });

    test('undefined key fails validation', () => {
        expect(validateKey(undefined)).toBe(false);
    });

    test('valid key passes validation', () => {
        expect(validateKey('AIzaSyDTestKey12345')).toBe(true);
    });

    test('key with leading/trailing spaces passes validation', () => {
        expect(validateKey('  AIzaSyDTestKey12345  ')).toBe(true);
    });
});

describe('loadKeys', () => {
    beforeEach(() => {
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn()
                }
            }
        };
    });

    test('loads and deobfuscates stored keys', async () => {
        const originalGemini = 'GeminiKey123';
        const originalSafeBrowsing = 'SafeBrowsingKey456';
        const obfuscatedGemini = obfuscate(originalGemini);
        const obfuscatedSafeBrowsing = obfuscate(originalSafeBrowsing);

        global.chrome.storage.local.get.mockResolvedValue({
            geminiKey: obfuscatedGemini,
            safeBrowsingKey: obfuscatedSafeBrowsing
        });

        const keys = await loadKeys();
        expect(keys.geminiKey).toBe(originalGemini);
        expect(keys.safeBrowsingKey).toBe(originalSafeBrowsing);
    });

    test('returns empty strings when no keys stored', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        const keys = await loadKeys();
        expect(keys.geminiKey).toBe('');
        expect(keys.safeBrowsingKey).toBe('');
    });

    test('handles missing geminiKey', async () => {
        const originalSafeBrowsing = 'SafeBrowsingKey456';
        const obfuscatedSafeBrowsing = obfuscate(originalSafeBrowsing);

        global.chrome.storage.local.get.mockResolvedValue({
            safeBrowsingKey: obfuscatedSafeBrowsing
        });

        const keys = await loadKeys();
        expect(keys.geminiKey).toBe('');
        expect(keys.safeBrowsingKey).toBe(originalSafeBrowsing);
    });

    test('handles missing safeBrowsingKey', async () => {
        const originalGemini = 'GeminiKey123';
        const obfuscatedGemini = obfuscate(originalGemini);

        global.chrome.storage.local.get.mockResolvedValue({
            geminiKey: obfuscatedGemini
        });

        const keys = await loadKeys();
        expect(keys.geminiKey).toBe(originalGemini);
        expect(keys.safeBrowsingKey).toBe('');
    });
});

describe('saveKeys', () => {
    beforeEach(() => {
        global.chrome = {
            storage: {
                local: {
                    set: jest.fn().mockResolvedValue(undefined)
                }
            }
        };
    });

    test('saves obfuscated keys', async () => {
        const geminiKey = 'GeminiKey123';
        const safeBrowsingKey = 'SafeBrowsingKey456';

        await saveKeys(geminiKey, safeBrowsingKey);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            geminiKey: obfuscate(geminiKey),
            safeBrowsingKey: obfuscate(safeBrowsingKey)
        });
    });

    test('saves only geminiKey when safeBrowsingKey is empty', async () => {
        const geminiKey = 'GeminiKey123';

        await saveKeys(geminiKey, '');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            geminiKey: obfuscate(geminiKey)
        });
    });

    test('saves only safeBrowsingKey when geminiKey is empty', async () => {
        const safeBrowsingKey = 'SafeBrowsingKey456';

        await saveKeys('', safeBrowsingKey);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            safeBrowsingKey: obfuscate(safeBrowsingKey)
        });
    });

    test('saves nothing when both keys are empty', async () => {
        await saveKeys('', '');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({});
    });

    test('trims whitespace before saving', async () => {
        const geminiKey = '  GeminiKey123  ';
        const safeBrowsingKey = '  SafeBrowsingKey456  ';

        await saveKeys(geminiKey, safeBrowsingKey);

        expect(global.chrome.storage.local.set).toHaveBeenCalled();
    });

    test('handles null keys', async () => {
        await saveKeys(null, null);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({});
    });

    test('handles undefined keys', async () => {
        await saveKeys(undefined, undefined);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({});
    });
});

describe('showStatus', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="status-message"></div>';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('displays success message', () => {
        showStatus('Saved!', 'success');

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Saved!');
        expect(statusDiv.className).toBe('success');
        expect(statusDiv.style.display).toBe('block');
    });

    test('displays error message', () => {
        showStatus('Error saving settings', 'error');

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Error saving settings');
        expect(statusDiv.className).toBe('error');
        expect(statusDiv.style.display).toBe('block');
    });

    test('hides message after 3 seconds', () => {
        showStatus('Test message', 'success');

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.style.display).toBe('block');

        jest.advanceTimersByTime(3000);

        expect(statusDiv.style.display).toBe('none');
    });

    test('multiple status messages override previous ones', () => {
        showStatus('First message', 'success');
        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('First message');

        showStatus('Second message', 'error');
        expect(statusDiv.textContent).toBe('Second message');
        expect(statusDiv.className).toBe('error');
    });
});

describe('loadSettings', () => {
    beforeEach(() => {
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn()
                }
            }
        };
    });

    test('loads all settings when stored', async () => {
        global.chrome.storage.local.get.mockResolvedValue({
            bannerEnabled: false,
            scanMode: 'shopping',
            userWhitelist: 'example.com\ntest.org'
        });

        const settings = await loadSettings();
        expect(settings.bannerEnabled).toBe(false);
        expect(settings.scanMode).toBe('shopping');
        expect(settings.userWhitelist).toBe('example.com\ntest.org');
    });

    test('returns default values when storage is empty', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        const settings = await loadSettings();
        expect(settings.bannerEnabled).toBe(true);
        expect(settings.scanMode).toBe('all');
        expect(settings.userWhitelist).toBe('');
    });

    test('handles bannerEnabled=true explicitly', async () => {
        global.chrome.storage.local.get.mockResolvedValue({
            bannerEnabled: true
        });

        const settings = await loadSettings();
        expect(settings.bannerEnabled).toBe(true);
    });

    test('handles bannerEnabled=false explicitly', async () => {
        global.chrome.storage.local.get.mockResolvedValue({
            bannerEnabled: false
        });

        const settings = await loadSettings();
        expect(settings.bannerEnabled).toBe(false);
    });

    test('handles partial settings', async () => {
        global.chrome.storage.local.get.mockResolvedValue({
            scanMode: 'shopping'
        });

        const settings = await loadSettings();
        expect(settings.bannerEnabled).toBe(true);
        expect(settings.scanMode).toBe('shopping');
        expect(settings.userWhitelist).toBe('');
    });
});

describe('saveSettings', () => {
    beforeEach(() => {
        global.chrome = {
            storage: {
                local: {
                    set: jest.fn().mockResolvedValue(undefined)
                }
            }
        };
    });

    test('saves all settings correctly', async () => {
        await saveSettings(true, 'all', 'example.com\ntest.org');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: true,
            scanMode: 'all',
            userWhitelist: 'example.com\ntest.org'
        });
    });

    test('saves bannerEnabled=false', async () => {
        await saveSettings(false, 'shopping', '');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: false,
            scanMode: 'shopping',
            userWhitelist: ''
        });
    });

    test('trims whitelist', async () => {
        await saveSettings(true, 'all', '  example.com\ntest.org  ');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: true,
            scanMode: 'all',
            userWhitelist: 'example.com\ntest.org'
        });
    });

    test('handles empty whitelist', async () => {
        await saveSettings(true, 'all', '');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: true,
            scanMode: 'all',
            userWhitelist: ''
        });
    });

    test('handles whitelist with multiple newlines', async () => {
        await saveSettings(true, 'all', 'domain1.com\ndomain2.com\ndomain3.com');

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: true,
            scanMode: 'all',
            userWhitelist: 'domain1.com\ndomain2.com\ndomain3.com'
        });
    });
});

describe('DOM initialization', () => {
    let windowCloseSpy;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="password" id="gemini-key" />
            <input type="password" id="safe-browsing-key" />
            <input type="checkbox" id="banner-enabled" />
            <input type="radio" id="scan-mode-all" name="scanMode" value="all" />
            <input type="radio" id="scan-mode-shopping" name="scanMode" value="shopping" />
            <textarea id="user-whitelist"></textarea>
            <button id="save-button">Save</button>
            <a href="#" id="back-link">Back</a>
            <div id="status-message"></div>
        `;
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn(),
                    set: jest.fn().mockResolvedValue(undefined)
                }
            }
        };
        windowCloseSpy = jest.fn();
        global.window.close = windowCloseSpy;
    });

    test('loads keys on initialization', async () => {
        const originalGemini = 'GeminiKey123';
        const originalSafeBrowsing = 'SafeBrowsingKey456';

        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (keys.includes('geminiKey') || keys.includes('safeBrowsingKey')) {
                return Promise.resolve({
                    geminiKey: obfuscate(originalGemini),
                    safeBrowsingKey: obfuscate(originalSafeBrowsing)
                });
            }
            if (keys.includes('bannerEnabled') || keys.includes('scanMode') || keys.includes('userWhitelist')) {
                return Promise.resolve({
                    bannerEnabled: true,
                    scanMode: 'all',
                    userWhitelist: ''
                });
            }
            return Promise.resolve({});
        });

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');

        expect(geminiKeyInput.value).toBe(originalGemini);
        expect(safeBrowsingKeyInput.value).toBe(originalSafeBrowsing);
    });

    test('handles load error gracefully', async () => {
        global.chrome.storage.local.get.mockRejectedValue(new Error('Load failed'));

        await initializePage();

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Error loading settings');
        expect(statusDiv.className).toBe('error');
    });

    test('loads keys when only geminiKey exists', async () => {
        const originalGemini = 'GeminiKey123';

        global.chrome.storage.local.get.mockResolvedValue({
            geminiKey: obfuscate(originalGemini)
        });

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');

        expect(geminiKeyInput.value).toBe(originalGemini);
        expect(safeBrowsingKeyInput.value).toBe('');
    });

    test('loads keys when only safeBrowsingKey exists', async () => {
        const originalSafeBrowsing = 'SafeBrowsingKey456';

        global.chrome.storage.local.get.mockResolvedValue({
            safeBrowsingKey: obfuscate(originalSafeBrowsing)
        });

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');

        expect(geminiKeyInput.value).toBe('');
        expect(safeBrowsingKeyInput.value).toBe(originalSafeBrowsing);
    });

    test('save button saves both keys successfully', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');
        const saveButton = document.getElementById('save-button');

        geminiKeyInput.value = 'NewGeminiKey';
        safeBrowsingKeyInput.value = 'NewSafeBrowsingKey';

        const clickPromise = new Promise((resolve) => {
            saveButton.addEventListener('click', async () => {
                await new Promise(r => setTimeout(r, 0));
                resolve();
            });
        });

        saveButton.click();
        await clickPromise;

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            geminiKey: obfuscate('NewGeminiKey'),
            safeBrowsingKey: obfuscate('NewSafeBrowsingKey')
        });

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Saved!');
        expect(statusDiv.className).toBe('success');
    });

    test('save button shows error when no keys provided', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        await initializePage();

        const saveButton = document.getElementById('save-button');

        const clickPromise = new Promise((resolve) => {
            saveButton.addEventListener('click', async () => {
                await new Promise(r => setTimeout(r, 0));
                resolve();
            });
        });

        saveButton.click();
        await clickPromise;

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Please enter at least one API key');
        expect(statusDiv.className).toBe('error');
    });

    test('save button handles save error', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});
        global.chrome.storage.local.set.mockRejectedValue(new Error('Save failed'));

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const saveButton = document.getElementById('save-button');

        geminiKeyInput.value = 'NewGeminiKey';

        const clickPromise = new Promise((resolve) => {
            saveButton.addEventListener('click', async () => {
                await new Promise(r => setTimeout(r, 0));
                resolve();
            });
        });

        saveButton.click();
        await clickPromise;

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Error saving settings');
        expect(statusDiv.className).toBe('error');
    });

    test('back link closes window', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        await initializePage();

        const backLink = document.getElementById('back-link');
        backLink.click();

        expect(windowCloseSpy).toHaveBeenCalled();
    });

    test('loads settings on initialization with defaults', async () => {
        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (keys.includes('geminiKey') || keys.includes('safeBrowsingKey')) {
                return Promise.resolve({});
            }
            if (keys.includes('bannerEnabled') || keys.includes('scanMode') || keys.includes('userWhitelist')) {
                return Promise.resolve({});
            }
            return Promise.resolve({});
        });

        await initializePage();

        const bannerEnabledCheckbox = document.getElementById('banner-enabled');
        const scanModeAllRadio = document.getElementById('scan-mode-all');
        const userWhitelistTextarea = document.getElementById('user-whitelist');

        expect(bannerEnabledCheckbox.checked).toBe(true);
        expect(scanModeAllRadio.checked).toBe(true);
        expect(userWhitelistTextarea.value).toBe('');
    });

    test('loads settings on initialization with stored values', async () => {
        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (keys.includes('geminiKey') || keys.includes('safeBrowsingKey')) {
                return Promise.resolve({});
            }
            if (keys.includes('bannerEnabled') || keys.includes('scanMode') || keys.includes('userWhitelist')) {
                return Promise.resolve({
                    bannerEnabled: false,
                    scanMode: 'shopping',
                    userWhitelist: 'example.com\ntest.org'
                });
            }
            return Promise.resolve({});
        });

        await initializePage();

        const bannerEnabledCheckbox = document.getElementById('banner-enabled');
        const scanModeShoppingRadio = document.getElementById('scan-mode-shopping');
        const userWhitelistTextarea = document.getElementById('user-whitelist');

        expect(bannerEnabledCheckbox.checked).toBe(false);
        expect(scanModeShoppingRadio.checked).toBe(true);
        expect(userWhitelistTextarea.value).toBe('example.com\ntest.org');
    });

    test('save button saves all settings including new toggles', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const safeBrowsingKeyInput = document.getElementById('safe-browsing-key');
        const bannerEnabledCheckbox = document.getElementById('banner-enabled');
        const scanModeShoppingRadio = document.getElementById('scan-mode-shopping');
        const userWhitelistTextarea = document.getElementById('user-whitelist');
        const saveButton = document.getElementById('save-button');

        geminiKeyInput.value = 'NewGeminiKey';
        safeBrowsingKeyInput.value = 'NewSafeBrowsingKey';
        bannerEnabledCheckbox.checked = false;
        scanModeShoppingRadio.checked = true;
        userWhitelistTextarea.value = 'trusted1.com\ntrusted2.com';

        const clickPromise = new Promise((resolve) => {
            saveButton.addEventListener('click', async () => {
                await new Promise(r => setTimeout(r, 0));
                resolve();
            });
        });

        saveButton.click();
        await clickPromise;

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            geminiKey: obfuscate('NewGeminiKey'),
            safeBrowsingKey: obfuscate('NewSafeBrowsingKey')
        });

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: false,
            scanMode: 'shopping',
            userWhitelist: 'trusted1.com\ntrusted2.com'
        });

        const statusDiv = document.getElementById('status-message');
        expect(statusDiv.textContent).toBe('Saved!');
        expect(statusDiv.className).toBe('success');
    });

    test('save button saves with scanMode=all when all radio is checked', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});

        await initializePage();

        const geminiKeyInput = document.getElementById('gemini-key');
        const bannerEnabledCheckbox = document.getElementById('banner-enabled');
        const scanModeAllRadio = document.getElementById('scan-mode-all');
        const userWhitelistTextarea = document.getElementById('user-whitelist');
        const saveButton = document.getElementById('save-button');

        geminiKeyInput.value = 'GeminiKey';
        bannerEnabledCheckbox.checked = true;
        scanModeAllRadio.checked = true;
        userWhitelistTextarea.value = '';

        const clickPromise = new Promise((resolve) => {
            saveButton.addEventListener('click', async () => {
                await new Promise(r => setTimeout(r, 0));
                resolve();
            });
        });

        saveButton.click();
        await clickPromise;

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
            bannerEnabled: true,
            scanMode: 'all',
            userWhitelist: ''
        });
    });
});
