import { jest } from '@jest/globals';
import { getDomainAge } from './rdap.js';

describe('getDomainAge', () => {
  beforeEach(() => {
    // Initialize fetch mock before each test
    global.fetch = jest.fn();
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('returns correct age in days for a registered domain', async () => {
    // Create a date 365 days ago
    const registrationDate = new Date();
    registrationDate.setDate(registrationDate.getDate() - 365);

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: registrationDate.toISOString(),
        },
        {
          eventAction: 'last changed',
          eventDate: new Date().toISOString(),
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(fetch).toHaveBeenCalledWith('https://rdap.org/domain/example.com');
    expect(age).toBe(365);
  });

  test('returns -1 for 404 response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const age = await getDomainAge('nonexistent.com');

    expect(fetch).toHaveBeenCalledWith(
      'https://rdap.org/domain/nonexistent.com'
    );
    expect(age).toBe(-1);
  });

  test('returns -1 for network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const age = await getDomainAge('example.com');

    expect(fetch).toHaveBeenCalledWith('https://rdap.org/domain/example.com');
    expect(age).toBe(-1);
  });

  test('returns -1 for malformed response (missing events field)', async () => {
    const mockResponse = {
      handle: 'example.com',
      // Missing events field
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('returns -1 when events field is not an array', async () => {
    const mockResponse = {
      events: 'not an array',
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('returns -1 when registration event is missing', async () => {
    const mockResponse = {
      events: [
        {
          eventAction: 'last changed',
          eventDate: new Date().toISOString(),
        },
        {
          eventAction: 'expiration',
          eventDate: new Date().toISOString(),
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('returns -1 when registration event has no eventDate', async () => {
    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          // Missing eventDate
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('parses ISO 8601 date format correctly', async () => {
    const isoDate = '2024-01-01T00:00:00Z';
    const registrationDate = new Date(isoDate);
    const today = new Date();
    const expectedAge = Math.floor(
      (today - registrationDate) / (1000 * 60 * 60 * 24)
    );

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: isoDate,
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(expectedAge);
  });

  test('parses RFC 3339 date format with timezone correctly', async () => {
    const rfc3339Date = '2023-06-15T14:30:00+00:00';
    const registrationDate = new Date(rfc3339Date);
    const today = new Date();
    const expectedAge = Math.floor(
      (today - registrationDate) / (1000 * 60 * 60 * 24)
    );

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: rfc3339Date,
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(expectedAge);
  });

  test('parses date format with milliseconds correctly', async () => {
    const dateWithMs = '2023-12-25T12:00:00.000Z';
    const registrationDate = new Date(dateWithMs);
    const today = new Date();
    const expectedAge = Math.floor(
      (today - registrationDate) / (1000 * 60 * 60 * 24)
    );

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: dateWithMs,
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(expectedAge);
  });

  test('returns -1 for invalid date format', async () => {
    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: 'invalid-date-string',
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('returns -1 when JSON parsing fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const age = await getDomainAge('example.com');

    expect(age).toBe(-1);
  });

  test('calculates age correctly for domain registered today', async () => {
    const today = new Date();

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: today.toISOString(),
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('newdomain.com');

    expect(age).toBe(0);
  });

  test('calculates age correctly for old domain (10 years)', async () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    const expectedAge = Math.floor(
      (new Date() - tenYearsAgo) / (1000 * 60 * 60 * 24)
    );

    const mockResponse = {
      events: [
        {
          eventAction: 'registration',
          eventDate: tenYearsAgo.toISOString(),
        },
      ],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const age = await getDomainAge('olddomain.com');

    expect(age).toBe(expectedAge);
  });
});
