import { jest } from '@jest/globals';
import { getTrustpilotData } from './trustpilot.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getTrustpilotData', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns correct rating and reviewCount for valid page', async () => {
    const fixtureHtml = await readFile(
      join(__dirname, '../tests/fixtures/trustpilot-found.html'),
      'utf-8'
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => fixtureHtml,
    });

    const result = await getTrustpilotData('example.com');

    expect(result).toEqual({
      found: true,
      rating: 4.2,
      reviewCount: 1847,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.trustpilot.com/review/example.com'
    );
  });

  test('returns not found for 404 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await getTrustpilotData('nonexistent.com');

    expect(result).toEqual({
      found: false,
      rating: null,
      reviewCount: null,
    });
  });

  test('returns not found for page with no JSON-LD aggregateRating', async () => {
    const fixtureHtml = await readFile(
      join(__dirname, '../tests/fixtures/trustpilot-not-found.html'),
      'utf-8'
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => fixtureHtml,
    });

    const result = await getTrustpilotData('nobusiness.com');

    expect(result).toEqual({
      found: false,
      rating: null,
      reviewCount: null,
    });
  });

  test('returns not found for malformed JSON-LD', async () => {
    const malformedHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <script type="application/ld+json">
        {invalid json}
        </script>
      </body>
      </html>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => malformedHtml,
    });

    const result = await getTrustpilotData('malformed.com');

    expect(result).toEqual({
      found: false,
      rating: null,
      reviewCount: null,
    });
  });

  test('returns not found for network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await getTrustpilotData('error.com');

    expect(result).toEqual({
      found: false,
      rating: null,
      reviewCount: null,
    });
  });

  test('handles JSON-LD with missing aggregateRating fields', async () => {
    const incompleteHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <script type="application/ld+json">
        {"@type":"LocalBusiness","aggregateRating":{"ratingValue":"4.5"}}
        </script>
      </body>
      </html>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => incompleteHtml,
    });

    const result = await getTrustpilotData('incomplete.com');

    expect(result).toEqual({
      found: false,
      rating: null,
      reviewCount: null,
    });
  });

  test('parses numeric strings correctly', async () => {
    const numericHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <script type="application/ld+json">
        {"@type":"LocalBusiness","aggregateRating":{"ratingValue":"3.7","reviewCount":"500"}}
        </script>
      </body>
      </html>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => numericHtml,
    });

    const result = await getTrustpilotData('numeric.com');

    expect(result).toEqual({
      found: true,
      rating: 3.7,
      reviewCount: 500,
    });
    expect(typeof result.rating).toBe('number');
    expect(typeof result.reviewCount).toBe('number');
  });

  test('handles multiple JSON-LD blocks and finds the correct one', async () => {
    const multipleJsonLdHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <script type="application/ld+json">
        {"@type":"WebPage","name":"Test Page"}
        </script>
        <script type="application/ld+json">
        {"@type":"LocalBusiness","aggregateRating":{"ratingValue":"4.9","reviewCount":"2500"}}
        </script>
      </body>
      </html>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => multipleJsonLdHtml,
    });

    const result = await getTrustpilotData('multiple.com');

    expect(result).toEqual({
      found: true,
      rating: 4.9,
      reviewCount: 2500,
    });
  });
});
