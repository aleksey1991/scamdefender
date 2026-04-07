/**
 * E2E tests for popup functionality
 * Requires Puppeteer to be installed: npm install --save-dev puppeteer
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe.skip('Popup E2E Tests (Puppeteer)', () => {
  let browser;
  let page;
  const extensionPath = path.join(__dirname, '../..');

  beforeAll(async () => {
    // Launch browser with extension loaded
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    // Create new page for each test
    page = await browser.newPage();

    // Navigate to popup page
    const popupPath = path.join(__dirname, '../../popup/popup.html');
    await page.goto(`file://${popupPath}`);
  });

  test('popup displays domain name', async () => {
    // Inject mock result
    await page.evaluate(() => {
      const tabId = 1;
      const mockResult = {
        domain: 'example.com',
        url: 'https://example.com',
        score: 45,
        signals: {
          domainAgeDays: 500,
          safeBrowsingFlagged: false,
          noHttps: false,
          trustpilot: { found: false, rating: null, reviewCount: null },
          contentScan: {
            noPhysicalAddress: false,
            noPhoneNumber: false,
            suspiciousReturnPolicy: false,
            suspiciousLuxuryPricing: false
          }
        },
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Wait for domain name to be populated
    await page.waitForSelector('#domain-name', { timeout: 5000 });

    // Get domain text
    const domainText = await page.$eval('#domain-name', el => el.textContent);
    expect(domainText).toContain('example.com');
  }, 10000);

  test('gauge width reflects the score', async () => {
    // Inject mock result with score of 60
    await page.evaluate(() => {
      const tabId = 1;
      const mockResult = {
        domain: 'test.com',
        score: 60,
        signals: {},
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Wait for gauge to be populated
    await page.waitForSelector('#gauge-fill', { timeout: 5000 });

    // Get gauge width
    const gaugeWidth = await page.$eval('#gauge-fill', el => {
      return window.getComputedStyle(el).width;
    });

    // Gauge should be 60% of container width
    // Exact pixel value depends on container width, but should be > 0
    expect(gaugeWidth).not.toBe('0px');
  }, 10000);

  test('all signal rows are populated', async () => {
    // Inject mock result
    await page.evaluate(() => {
      const tabId = 1;
      const mockResult = {
        domain: 'scam-site.com',
        score: 85,
        signals: {
          domainAgeDays: 15,
          safeBrowsingFlagged: true,
          noHttps: true,
          trustpilot: { found: false, rating: null, reviewCount: null },
          contentScan: {
            noPhysicalAddress: true,
            noPhoneNumber: true,
            suspiciousReturnPolicy: true,
            suspiciousLuxuryPricing: true
          }
        },
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Wait for signals section
    await page.waitForSelector('#signals-section', { timeout: 5000 });

    // Verify signal rows exist
    const domainAgeSignal = await page.$('#signal-domain-age');
    const safeBrowsingSignal = await page.$('#signal-safe-browsing');
    const trustpilotSignal = await page.$('#signal-trustpilot');
    const pageScanSignal = await page.$('#signal-page-scan');

    expect(domainAgeSignal).toBeTruthy();
    expect(safeBrowsingSignal).toBeTruthy();
    expect(trustpilotSignal).toBeTruthy();
    expect(pageScanSignal).toBeTruthy();
  }, 10000);

  test('displays trusted site badge for whitelisted domains', async () => {
    // Inject mock result for whitelisted domain
    await page.evaluate(() => {
      const tabId = 1;
      const mockResult = {
        domain: 'google.com',
        score: 0,
        whitelisted: true,
        signals: {},
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Wait for trusted badge
    await page.waitForSelector('#trusted-badge', { timeout: 5000 });

    // Verify badge text
    const badgeText = await page.$eval('#trusted-badge', el => el.textContent);
    expect(badgeText).toContain('TRUSTED SITE');
  }, 10000);

  test('AI verdict section appears when aiResult exists', async () => {
    // Inject mock result with AI analysis
    await page.evaluate(() => {
      const tabId = 1;
      const mockResult = {
        domain: 'suspicious-site.com',
        score: 70,
        signals: {},
        aiResult: {
          risk_level: 'high',
          confidence: 85,
          red_flags: ['New domain', 'No reviews'],
          verdict: 'This site shows signs of being a scam.'
        },
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Wait for AI section
    await page.waitForSelector('#ai-section', { timeout: 5000 });

    // Verify AI content exists
    const aiSection = await page.$('#ai-section');
    expect(aiSection).toBeTruthy();

    // Verify confidence is displayed
    const aiContent = await page.$eval('#ai-section', el => el.textContent);
    expect(aiContent).toContain('85%');
    expect(aiContent).toContain('confident');
  }, 10000);
});
