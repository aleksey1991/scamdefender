import { isTrusted, TRUSTED_DOMAINS } from './whitelist.js';

describe('TRUSTED_DOMAINS', () => {
  test('is a Set', () => {
    expect(TRUSTED_DOMAINS instanceof Set).toBe(true);
  });

  test('contains expected domains', () => {
    expect(TRUSTED_DOMAINS.has('google.com')).toBe(true);
    expect(TRUSTED_DOMAINS.has('amazon.com')).toBe(true);
    expect(TRUSTED_DOMAINS.has('github.com')).toBe(true);
  });
});

describe('isTrusted', () => {
  test('exact match returns true', () => {
    expect(isTrusted('google.com')).toBe(true);
    expect(isTrusted('amazon.com')).toBe(true);
    expect(isTrusted('github.com')).toBe(true);
    expect(isTrusted('paypal.com')).toBe(true);
  });

  test('subdomain match returns true', () => {
    expect(isTrusted('mail.google.com')).toBe(true);
    expect(isTrusted('www.amazon.com')).toBe(true);
    expect(isTrusted('api.github.com')).toBe(true);
    expect(isTrusted('www.paypal.com')).toBe(true);
  });

  test('multi-level subdomain returns true', () => {
    expect(isTrusted('a.b.google.com')).toBe(true);
    expect(isTrusted('deep.subdomain.github.com')).toBe(true);
    expect(isTrusted('x.y.z.amazon.com')).toBe(true);
  });

  test('unknown domain returns false', () => {
    expect(isTrusted('malicious.com')).toBe(false);
    expect(isTrusted('scam-site.net')).toBe(false);
    expect(isTrusted('fake-bank.com')).toBe(false);
  });

  test('empty string returns false', () => {
    expect(isTrusted('')).toBe(false);
    expect(isTrusted('   ')).toBe(false);
  });

  test('handles null and undefined', () => {
    expect(isTrusted(null)).toBe(false);
    expect(isTrusted(undefined)).toBe(false);
  });

  test('handles non-string input', () => {
    expect(isTrusted(123)).toBe(false);
    expect(isTrusted({})).toBe(false);
    expect(isTrusted([])).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(isTrusted('GOOGLE.COM')).toBe(true);
    expect(isTrusted('Google.Com')).toBe(true);
    expect(isTrusted('MAIL.GOOGLE.COM')).toBe(true);
  });

  test('similar but different domains return false', () => {
    expect(isTrusted('google.com.malicious.com')).toBe(false);
    expect(isTrusted('notgoogle.com')).toBe(false);
    expect(isTrusted('googl.com')).toBe(false);
  });
});
