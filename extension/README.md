# ScamDefender Extension
Chrome Manifest V3 extension — Vanilla JavaScript.

## Overview
ScamDefender is a Chrome extension that detects potentially malicious websites using:
- Domain age analysis (RDAP)
- Google Safe Browsing API
- HTTPS security check
- Trusted domain whitelist

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Keys (Optional)
The extension works without API keys, but for full functionality:

1. Get a Google Safe Browsing API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your API key to `.env`:
   ```
   SAFE_BROWSING_KEY=your_actual_key_here
   ```

**Note**: The Safe Browsing API key is stored in the extension's local storage. To set it:
1. Load the extension in Chrome (see below)
2. Open Chrome DevTools Console
3. Run:
   ```javascript
   chrome.storage.local.set({ safe_browsing_key: 'YOUR_API_KEY_HERE' });
   ```

Without the API key, the extension will still check domain age and HTTPS but skip Safe Browsing checks.

### 3. Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension/` directory
5. The ScamDefender icon should appear in your toolbar

### 4. Development Commands

```bash
# Run linter
npm run lint

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## How It Works

When you visit a website, ScamDefender:
1. Checks if the domain is on the trusted whitelist (e.g., google.com, amazon.com)
2. Queries the domain registration date via RDAP
3. Checks Google Safe Browsing for known threats (if API key configured)
4. Verifies HTTPS usage
5. Calculates a risk score (0-100)
6. Updates the extension badge with a color-coded indicator:
   - ✓ Green = Safe (0-29)
   - ! Yellow = Caution (30-59)
   - !! Orange = Suspicious (60-79)
   - ✕ Red = Danger (80-100)

Click the extension icon to see detailed results.

## Testing

All modules include comprehensive Jest unit tests:
- `utils/rdap.test.js` - Domain age lookup tests
- `utils/safebrowsing.test.js` - Safe Browsing API tests
- `utils/whitelist.test.js` - Trusted domain tests
- `utils/cache.test.js` - Caching layer tests
- `utils/url.test.js` - URL parsing tests
- `utils/scoring.test.js` - Risk scoring tests
- `utils/risk.test.js` - Risk label tests

Minimum 80% code coverage is enforced by CI.
