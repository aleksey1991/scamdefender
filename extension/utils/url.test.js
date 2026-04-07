import { extractDomain, isCheckableUrl, isHttps } from './url.js';

describe('extractDomain', () => {
  test('extracts domain from https URL', () => {
    expect(extractDomain('https://example.com')).toBe('example.com');
  });

  test('extracts domain from http URL', () => {
    expect(extractDomain('http://example.com')).toBe('example.com');
  });

  test('removes www prefix', () => {
    expect(extractDomain('https://www.example.com')).toBe('example.com');
  });

  test('preserves subdomains', () => {
    expect(extractDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
  });

  test('removes path from URL', () => {
    expect(extractDomain('https://example.com/path/to/page')).toBe('example.com');
  });

  test('removes query string from URL', () => {
    expect(extractDomain('https://example.com?q=search&foo=bar')).toBe('example.com');
  });

  test('handles URL with path and query string', () => {
    expect(extractDomain('https://www.example.com/path?q=1')).toBe('example.com');
  });

  test('handles URL with fragment', () => {
    expect(extractDomain('https://example.com/page#section')).toBe('example.com');
  });

  test('returns empty string for malformed URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(extractDomain('')).toBe('');
  });
});

describe('isCheckableUrl', () => {
  describe('returns false for excluded protocols', () => {
    test('chrome:// URLs', () => {
      expect(isCheckableUrl('chrome://settings')).toBe(false);
      expect(isCheckableUrl('chrome://extensions')).toBe(false);
    });

    test('chrome-extension:// URLs', () => {
      expect(isCheckableUrl('chrome-extension://abcdefghijklmnop/popup.html')).toBe(false);
    });

    test('about: URLs', () => {
      expect(isCheckableUrl('about:blank')).toBe(false);
      expect(isCheckableUrl('about:config')).toBe(false);
    });

    test('file:// URLs', () => {
      expect(isCheckableUrl('file:///Users/test/file.html')).toBe(false);
      expect(isCheckableUrl('file://C:/Users/test/file.html')).toBe(false);
    });
  });

  describe('returns false for localhost', () => {
    test('localhost hostname', () => {
      expect(isCheckableUrl('http://localhost')).toBe(false);
      expect(isCheckableUrl('http://localhost:3000')).toBe(false);
      expect(isCheckableUrl('https://localhost:8080')).toBe(false);
    });

    test('127.0.0.1 IP address', () => {
      expect(isCheckableUrl('http://127.0.0.1')).toBe(false);
      expect(isCheckableUrl('http://127.0.0.1:3000')).toBe(false);
    });
  });

  describe('returns false for IP addresses', () => {
    test('IPv4 addresses', () => {
      expect(isCheckableUrl('http://192.168.1.1')).toBe(false);
      expect(isCheckableUrl('https://10.0.0.1')).toBe(false);
      expect(isCheckableUrl('http://8.8.8.8')).toBe(false);
    });

    test('IPv6 addresses', () => {
      expect(isCheckableUrl('http://[2001:db8::1]')).toBe(false);
      expect(isCheckableUrl('http://[::1]')).toBe(false);
    });
  });

  describe('returns true for normal websites', () => {
    test('standard http URLs', () => {
      expect(isCheckableUrl('http://example.com')).toBe(true);
      expect(isCheckableUrl('http://www.example.com')).toBe(true);
    });

    test('standard https URLs', () => {
      expect(isCheckableUrl('https://example.com')).toBe(true);
      expect(isCheckableUrl('https://www.example.com')).toBe(true);
    });

    test('URLs with subdomains', () => {
      expect(isCheckableUrl('https://subdomain.example.com')).toBe(true);
      expect(isCheckableUrl('https://api.example.com')).toBe(true);
    });

    test('URLs with paths and queries', () => {
      expect(isCheckableUrl('https://example.com/path')).toBe(true);
      expect(isCheckableUrl('https://example.com?query=value')).toBe(true);
    });
  });

  describe('handles edge cases', () => {
    test('returns false for empty string', () => {
      expect(isCheckableUrl('')).toBe(false);
    });

    test('returns false for null', () => {
      expect(isCheckableUrl(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(isCheckableUrl(undefined)).toBe(false);
    });

    test('returns false for malformed URL', () => {
      expect(isCheckableUrl('not-a-valid-url')).toBe(false);
    });
  });
});

describe('isHttps', () => {
  test('returns true for https URL', () => {
    expect(isHttps('https://example.com')).toBe(true);
  });

  test('returns true for https URL with path', () => {
    expect(isHttps('https://example.com/path')).toBe(true);
  });

  test('returns true for https URL with query', () => {
    expect(isHttps('https://example.com?q=1')).toBe(true);
  });

  test('returns false for http URL', () => {
    expect(isHttps('http://example.com')).toBe(false);
  });

  test('returns false for ftp URL', () => {
    expect(isHttps('ftp://example.com')).toBe(false);
  });

  test('returns false for chrome:// URL', () => {
    expect(isHttps('chrome://settings')).toBe(false);
  });

  test('returns false for malformed URL', () => {
    expect(isHttps('not-a-url')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isHttps('')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isHttps(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isHttps(undefined)).toBe(false);
  });

  test('returns false for URL starting with https but malformed', () => {
    expect(isHttps('https-example.com')).toBe(false);
  });
});
