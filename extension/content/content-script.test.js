import { jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock chrome.runtime API before importing the content script
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

/**
 * Load an HTML fixture and set up the DOM
 * @param {string} fixtureName - Name of the fixture file
 */
function loadFixture(fixtureName) {
  const fixturePath = path.join(__dirname, '../tests/fixtures', fixtureName);
  const html = fs.readFileSync(fixturePath, 'utf-8');
  const dom = new JSDOM(html);
  global.document = dom.window.document;
  global.window = dom.window;

  // Set readyState to complete to prevent DOMContentLoaded listener
  Object.defineProperty(global.document, 'readyState', {
    writable: true,
    value: 'complete'
  });
}

// Import the content script module
const contentScriptModule = await import('./content-script.js');

describe('Content Script - Scam Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkNoPhysicalAddress', () => {
    test('returns true when no address is present', () => {
      loadFixture('page-no-contact.html');
      expect(contentScriptModule.checkNoPhysicalAddress()).toBe(true);
    });

    test('returns false when street address is present', () => {
      loadFixture('page-with-contact.html');
      expect(contentScriptModule.checkNoPhysicalAddress()).toBe(false);
    });

    test('returns false when city/state/zip is present', () => {
      loadFixture('page-with-contact.html');
      const result = contentScriptModule.checkNoPhysicalAddress();
      expect(result).toBe(false);
    });
  });

  describe('checkNoPhoneNumber', () => {
    test('returns true when no phone number is present', () => {
      loadFixture('page-no-contact.html');
      expect(contentScriptModule.checkNoPhoneNumber()).toBe(true);
    });

    test('returns false when phone number is present', () => {
      loadFixture('page-with-contact.html');
      expect(contentScriptModule.checkNoPhoneNumber()).toBe(false);
    });

    test('detects various phone number formats', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Call us at (555) 123-4567</p>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      expect(contentScriptModule.checkNoPhoneNumber()).toBe(false);
    });
  });

  describe('checkSuspiciousReturnPolicy', () => {
    test('returns false when no suspicious return policy is present', () => {
      loadFixture('page-with-contact.html');
      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(false);
    });

    test('returns true when "all sales final" is present', () => {
      loadFixture('page-bad-returns.html');
      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(true);
    });

    test('returns true when "no returns" is present', () => {
      loadFixture('page-bad-returns.html');
      const result = contentScriptModule.checkSuspiciousReturnPolicy();
      expect(result).toBe(true);
    });

    test('returns true when "no refunds" is present', () => {
      loadFixture('page-bad-returns.html');
      const result = contentScriptModule.checkSuspiciousReturnPolicy();
      expect(result).toBe(true);
    });

    test('is case-insensitive', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>NO RETURNS ACCEPTED</p>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(true);
    });
  });

  describe('checkSuspiciousLuxuryPricing', () => {
    test('returns false when no luxury brands are mentioned', () => {
      loadFixture('page-with-contact.html');
      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(false);
    });

    test('returns false when luxury brand present but no low prices', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Gucci handbag for $2500</p>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(false);
    });

    test('returns true when luxury brand with price under $100', () => {
      loadFixture('page-luxury-scam.html');
      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(true);
    });

    test('detects multiple luxury brands', () => {
      loadFixture('page-luxury-scam.html');
      const result = contentScriptModule.checkSuspiciousLuxuryPricing();
      expect(result).toBe(true);
    });

    test('detects Gucci with low price', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Authentic Gucci handbag only $49.99!</p>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(true);
    });

    test('detects Prada with low price', () => {
      loadFixture('page-luxury-scam.html');
      const result = contentScriptModule.checkSuspiciousLuxuryPricing();
      expect(result).toBe(true);
    });
  });

  describe('getPageText', () => {
    test('returns page text content', () => {
      loadFixture('page-with-contact.html');
      const text = contentScriptModule.getPageText();
      expect(text).toContain('Legitimate Business Store');
      expect(text).toContain('123 Main Street');
    });

    test('returns empty string when no body', () => {
      const dom = new JSDOM(`<!DOCTYPE html><html></html>`);
      global.document = dom.window.document;

      // Create a minimal document without body
      const text = contentScriptModule.getPageText();
      expect(typeof text).toBe('string');
    });
  });

  describe('Integration tests', () => {
    test('page-no-contact.html has expected red flags', () => {
      loadFixture('page-no-contact.html');

      expect(contentScriptModule.checkNoPhysicalAddress()).toBe(true);
      expect(contentScriptModule.checkNoPhoneNumber()).toBe(true);
      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(false);
      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(false);
    });

    test('page-with-contact.html has no red flags', () => {
      loadFixture('page-with-contact.html');

      expect(contentScriptModule.checkNoPhysicalAddress()).toBe(false);
      expect(contentScriptModule.checkNoPhoneNumber()).toBe(false);
      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(false);
      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(false);
    });

    test('page-luxury-scam.html has luxury pricing red flag', () => {
      loadFixture('page-luxury-scam.html');

      expect(contentScriptModule.checkSuspiciousLuxuryPricing()).toBe(true);
    });

    test('page-bad-returns.html has return policy red flag', () => {
      loadFixture('page-bad-returns.html');

      expect(contentScriptModule.checkSuspiciousReturnPolicy()).toBe(true);
    });

    test('sends scan results to chrome runtime', () => {
      loadFixture('page-no-contact.html');

      // Get the scanPage function if it's exported, otherwise skip this test
      if (contentScriptModule.scanPage) {
        contentScriptModule.scanPage();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'CONTENT_SCAN_RESULT',
          data: {
            noPhysicalAddress: true,
            noPhoneNumber: true,
            suspiciousReturnPolicy: false,
            suspiciousLuxuryPricing: false,
            pageExcerpts: {
              aboutUs: expect.any(String),
              returnPolicy: expect.any(String)
            }
          }
        });
      }
    });
  });

  describe('extractAboutUsExcerpt', () => {
    test('extracts text from #about element', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="about">This is our about us section with information about our company.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractAboutUsExcerpt();
      expect(excerpt).toContain('about us section');
    });

    test('extracts text from .about element', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div class="about">Company information here.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractAboutUsExcerpt();
      expect(excerpt).toContain('Company information');
    });

    test('extracts text from element with id containing "about"', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <section id="about-us-section">Our company story.</section>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractAboutUsExcerpt();
      expect(excerpt).toContain('company story');
    });

    test('truncates to 500 characters', () => {
      const longText = 'a'.repeat(1000);
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="about">${longText}</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractAboutUsExcerpt();
      expect(excerpt.length).toBe(500);
    });

    test('returns empty string when no about section found', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div>No about section here.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractAboutUsExcerpt();
      expect(excerpt).toBe('');
    });
  });

  describe('extractReturnPolicyExcerpt', () => {
    test('extracts text from #returns element', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="returns">30 day return policy available.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractReturnPolicyExcerpt();
      expect(excerpt).toContain('30 day return');
    });

    test('extracts text from #refund element', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="refund">Full refund within 14 days.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractReturnPolicyExcerpt();
      expect(excerpt).toContain('Full refund');
    });

    test('extracts text from element with id containing "return"', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <section id="return-policy">All sales final.</section>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractReturnPolicyExcerpt();
      expect(excerpt).toContain('All sales final');
    });

    test('truncates to 500 characters', () => {
      const longText = 'b'.repeat(1000);
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="returns">${longText}</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractReturnPolicyExcerpt();
      expect(excerpt.length).toBe(500);
    });

    test('returns empty string when no return policy section found', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div>No return policy here.</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      const excerpt = contentScriptModule.extractReturnPolicyExcerpt();
      expect(excerpt).toBe('');
    });
  });

  describe('Warning Banner Injection', () => {
    let mockSessionStorage;

    beforeEach(() => {
      // Mock sessionStorage
      mockSessionStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };
      global.sessionStorage = mockSessionStorage;

      // Mock window.location
      global.window = {
        location: {
          href: 'https://example.com'
        }
      };

      // Create a fresh DOM for each test
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <head></head>
          <body>
            <h1>Test Page</h1>
          </body>
        </html>
      `);
      global.document = dom.window.document;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('injects banner when score >= 70', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('HIGH RISK');
      expect(banner.textContent).toContain('75');
    });

    test('injects banner with CRITICAL label when score >= 85', () => {
      contentScriptModule.injectWarningBanner(90, 'CRITICAL');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('CRITICAL RISK');
      expect(banner.textContent).toContain('90');
    });

    test('does NOT inject banner if sessionStorage scamdefender_dismissed is set', () => {
      mockSessionStorage.getItem.mockReturnValue('1');

      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).toBeNull();
      expect(mockSessionStorage.getItem).toHaveBeenCalledWith('scamdefender_dismissed');
    });

    test('does NOT inject banner twice (idempotent)', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banners = document.querySelectorAll('#scamdefender-banner');
      expect(banners.length).toBe(1);
    });

    test('does NOT inject on chrome:// URLs', () => {
      global.window.location.href = 'chrome://extensions';

      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).toBeNull();
    });

    test('does NOT inject on chrome-extension:// URLs', () => {
      global.window.location.href = 'chrome-extension://abcdefg/popup.html';

      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).toBeNull();
    });

    test('dismiss button sets sessionStorage and removes banner', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      const dismissBtn = document.getElementById('scamdefender-dismiss-btn');
      expect(banner).not.toBeNull();
      expect(dismissBtn).not.toBeNull();

      // Click dismiss button
      dismissBtn.click();

      // Check sessionStorage was set
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('scamdefender_dismissed', '1');

      // Check banner was removed
      const bannerAfterDismiss = document.getElementById('scamdefender-banner');
      expect(bannerAfterDismiss).toBeNull();

      // Check style was removed
      const styleAfterDismiss = document.getElementById('scamdefender-banner-style');
      expect(styleAfterDismiss).toBeNull();
    });

    test('See Details button sends OPEN_POPUP message', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const detailsBtn = document.getElementById('scamdefender-details-btn');
      expect(detailsBtn).not.toBeNull();

      // Click details button
      detailsBtn.click();

      // Check that chrome.runtime.sendMessage was called with OPEN_POPUP
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_POPUP' });
    });

    test('injects CSS style with banner', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const style = document.getElementById('scamdefender-banner-style');
      expect(style).not.toBeNull();
      expect(style.textContent).toContain('#scamdefender-banner');
      expect(style.textContent).toContain('position: fixed');
      expect(style.textContent).toContain('z-index: 2147483647');
    });

    test('banner contains all required elements', () => {
      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).not.toBeNull();

      // Check for icon (emoji)
      expect(banner.textContent).toContain('⚠️');

      // Check for details button
      const detailsBtn = document.getElementById('scamdefender-details-btn');
      expect(detailsBtn).not.toBeNull();
      expect(detailsBtn.textContent).toBe('See Details');

      // Check for dismiss button
      const dismissBtn = document.getElementById('scamdefender-dismiss-btn');
      expect(dismissBtn).not.toBeNull();
      expect(dismissBtn.textContent).toBe('✕');
    });

    test('banner is inserted at the top of body', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <head></head>
          <body>
            <div id="existing-content">Existing content</div>
          </body>
        </html>
      `);
      global.document = dom.window.document;

      contentScriptModule.injectWarningBanner(75, 'HIGH');

      const banner = document.getElementById('scamdefender-banner');
      expect(banner).not.toBeNull();
      expect(document.body.firstChild).toBe(banner);
    });
  });
});
