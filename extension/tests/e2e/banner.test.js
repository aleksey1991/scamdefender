/**
 * E2E tests for warning banner functionality
 * Requires Puppeteer to be installed: npm install --save-dev puppeteer
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe.skip('Banner E2E Tests (Puppeteer)', () => {
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

    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('banner element exists in DOM when score >= 70', async () => {
    // Navigate to test page
    const testPagePath = path.join(__dirname, '../fixtures/high-risk-page.html');
    await page.goto(`file://${testPagePath}`);

    // Inject mock score into storage
    await page.evaluate(() => {
      const tabId = 1; // Mock tab ID
      const mockResult = {
        domain: 'test.com',
        score: 75,
        signals: {},
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [`result_${tabId}`]: mockResult });
    });

    // Trigger banner via message
    await page.evaluate(() => {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SHOW_BANNER' && message.score >= 70) {
          // Banner injection will be triggered by content script
        }
      });

      // Simulate message from background
      chrome.runtime.sendMessage({
        type: 'SHOW_BANNER',
        score: 75,
        label: 'HIGH'
      });
    });

    // Wait for banner to appear
    await page.waitForSelector('#scamdefender-banner', { timeout: 5000 });

    // Verify banner exists
    const banner = await page.$('#scamdefender-banner');
    expect(banner).toBeTruthy();
  }, 10000);

  test('dismiss button removes banner', async () => {
    const testPagePath = path.join(__dirname, '../fixtures/high-risk-page.html');
    await page.goto(`file://${testPagePath}`);

    // Trigger banner
    await page.evaluate(() => {
      chrome.runtime.sendMessage({
        type: 'SHOW_BANNER',
        score: 80,
        label: 'HIGH'
      });
    });

    // Wait for banner
    await page.waitForSelector('#scamdefender-banner', { timeout: 5000 });

    // Click dismiss button
    await page.click('#scamdefender-banner-dismiss');

    // Wait for banner to be removed
    await page.waitForFunction(
      () => !document.getElementById('scamdefender-banner'),
      { timeout: 2000 }
    );

    // Verify banner is gone
    const banner = await page.$('#scamdefender-banner');
    expect(banner).toBeNull();
  }, 10000);

  test('banner does not reappear after dismissal in same session', async () => {
    const testPagePath = path.join(__dirname, '../fixtures/high-risk-page.html');
    await page.goto(`file://${testPagePath}`);

    // Try to show banner again
    await page.evaluate(() => {
      chrome.runtime.sendMessage({
        type: 'SHOW_BANNER',
        score: 85,
        label: 'CRITICAL'
      });
    });

    // Wait a moment
    await page.waitForTimeout(1000);

    // Verify banner did not reappear (sessionStorage flag should prevent it)
    const banner = await page.$('#scamdefender-banner');
    expect(banner).toBeNull();
  }, 10000);
});
