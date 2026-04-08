/**
 * Comprehensive unit tests for auth.ts module
 * Tests JWT validation and user status retrieval with mocked crypto operations
 */

import { validateJWT, getUserStatus } from '../src/auth.js';
import { _Result, UserStatus, Env } from '../src/types.js';

// Mock global crypto.subtle for JWT validation
const mockImportKey = jest.fn();
const mockSign = jest.fn();

global.crypto = {
  subtle: {
    importKey: mockImportKey,
    sign: mockSign,
  } as any,
} as any;

// Mock fetch for Supabase API calls
global.fetch = jest.fn();

describe('validateJWT', () => {
  const secret = 'test-secret-key';
  const baseHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Valid JWT with correct signature', () => {
    it('should return Success with userId and email for valid token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
        iat: now,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const messageToVerify = `${baseHeader}.${payloadB64}`;
      const messageBytes = new TextEncoder().encode(messageToVerify);

      // Mock the signature computation
      const expectedSignature = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      mockImportKey.mockResolvedValueOnce({} as CryptoKey);
      mockSign.mockResolvedValueOnce(expectedSignature.buffer);

      const signatureB64 = Buffer.from(expectedSignature).toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: true,
        data: {
          userId: 'user-123',
          email: 'user@example.com',
        },
      });

      expect(mockImportKey).toHaveBeenCalledWith(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      expect(mockSign).toHaveBeenCalledWith('HMAC', {}, messageBytes);
    });

    it('should return Success for token with additional claims', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-456',
        email: 'test@example.com',
        exp,
        iat: now,
        aud: 'authenticated',
        role: 'user',
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const expectedSignature = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      mockImportKey.mockResolvedValueOnce({} as CryptoKey);
      mockSign.mockResolvedValueOnce(expectedSignature.buffer);

      const signatureB64 = Buffer.from(expectedSignature).toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: true,
        data: {
          userId: 'user-456',
          email: 'test@example.com',
        },
      });
    });
  });

  describe('Expired JWT', () => {
    it('should return Failure with "Token expired" for expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now - 3600; // Token expired 1 hour ago
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: 'JWT token has expired',
      });

      // Should not attempt crypto operations for expired tokens
      expect(mockImportKey).not.toHaveBeenCalled();
    });

    it('should handle token expiring at current timestamp', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now; // Token expires now
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('Invalid signature', () => {
    it('should return Failure when signature does not match', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const correctSignature = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const wrongSignature = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]);

      mockImportKey.mockResolvedValueOnce({} as CryptoKey);
      mockSign.mockResolvedValueOnce(correctSignature.buffer);

      const signatureB64 = Buffer.from(wrongSignature).toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('signature verification failed'),
      });
    });

    it('should return Failure for signature length mismatch', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const correctSignature = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const shortSignature = new Uint8Array([1, 2, 3]);

      mockImportKey.mockResolvedValueOnce({} as CryptoKey);
      mockSign.mockResolvedValueOnce(correctSignature.buffer);

      const signatureB64 = Buffer.from(shortSignature).toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('length mismatch'),
      });
    });
  });

  describe('Malformed JWT', () => {
    it('should return Failure for JWT with wrong number of parts', async () => {
      const token = `${baseHeader}.payload-only`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('expected 3 parts separated by dots'),
      });
    });

    it('should return Failure for JWT with too many parts', async () => {
      const token = `${baseHeader}.payload.signature.extra`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('expected 3 parts separated by dots'),
      });
    });

    it('should return Failure for JWT with no parts', async () => {
      const token = '';

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('expected 3 parts separated by dots'),
      });
    });
  });

  describe('Missing required claims', () => {
    it('should return Failure when sub claim is missing', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('sub'),
      });
    });

    it('should return Failure when email claim is missing', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('email'),
      });
    });

    it('should return Failure when exp claim is missing', async () => {
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('exp'),
      });
    });

    it('should return Failure when payload is not an object', async () => {
      const payloadB64 = Buffer.from('"string-payload"').toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('not a valid object'),
      });
    });
  });

  describe('Invalid base64url encoding', () => {
    it('should return Failure for invalid base64url in header', async () => {
      const invalidHeader = '!!!invalid-base64!!!';
      const payloadB64 = Buffer.from(JSON.stringify({ sub: 'user', email: 'test@example.com', exp: 999999999 })).toString('base64url');
      const signatureB64 = Buffer.from('signature').toString('base64url');
      const token = `${invalidHeader}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to decode JWT header'),
      });
    });

    it('should return Failure for invalid base64url in payload', async () => {
      const invalidPayload = '!!!invalid-base64!!!';
      const signatureB64 = Buffer.from('signature').toString('base64url');
      const token = `${baseHeader}.${invalidPayload}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to decode JWT payload'),
      });
    });

    it('should return Failure for invalid JSON in header', async () => {
      const invalidHeaderJson = Buffer.from('not-json').toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify({ sub: 'user', email: 'test@example.com', exp: 999999999 })).toString('base64url');
      const signatureB64 = Buffer.from('signature').toString('base64url');
      const token = `${invalidHeaderJson}.${payloadB64}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to decode JWT header'),
      });
    });

    it('should return Failure for invalid JSON in payload', async () => {
      const invalidPayloadJson = Buffer.from('not-json').toString('base64url');
      const signatureB64 = Buffer.from('signature').toString('base64url');
      const token = `${baseHeader}.${invalidPayloadJson}.${signatureB64}`;

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to decode JWT payload'),
      });
    });
  });

  describe('Crypto operation errors', () => {
    it('should return Failure when importKey fails', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      mockImportKey.mockRejectedValueOnce(new Error('Key import failed'));

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to import HMAC key'),
      });
    });

    it('should return Failure when sign operation fails', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = Buffer.from('fake-signature').toString('base64url');
      const token = `${baseHeader}.${payloadB64}.${signatureB64}`;

      mockImportKey.mockResolvedValueOnce({} as CryptoKey);
      mockSign.mockRejectedValueOnce(new Error('Sign operation failed'));

      const result = await validateJWT(token, secret);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to compute HMAC signature'),
      });
    });
  });

  describe('Unexpected errors', () => {
    it('should handle unexpected errors gracefully', async () => {
      // This test is tricky as we need to cause an unexpected error
      // We'll test that the catch block is reached
      const result = await validateJWT(undefined as any, secret);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error');
    });
  });
});

describe('getUserStatus', () => {
  const mockEnv: Partial<Env> = {
    USER_STATUS: {
      get: jest.fn(),
      put: jest.fn(),
    } as any,
    GIFTED_PRO_EMAILS: 'gifted1@example.com, gifted2@example.com',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Cached user status in KV', () => {
    it('should return cached status without Supabase call', async () => {
      const userId = 'user-123';
      const cachedStatus: UserStatus = {
        isPro: true,
        isGiftedPro: false,
        subscription: {
          status: 'active',
          currentPeriodEnd: 1234567890,
        },
      };

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(cachedStatus)
      );

      const result = await getUserStatus(mockEnv as Env, userId, 'user@example.com');

      expect(result).toEqual(cachedStatus);
      expect(mockEnv.USER_STATUS!.get).toHaveBeenCalledWith(userId);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should continue with fresh lookup if cache is corrupted', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce('invalid-json');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle KV get errors gracefully', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockRejectedValueOnce(
        new Error('KV access failed')
      );
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });
  });

  describe('Gifted Pro email in GIFTED_PRO_EMAILS', () => {
    it('should return isPro=true, isGiftedPro=true for gifted email', async () => {
      const userId = 'user-123';
      const email = 'gifted1@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: true,
        isGiftedPro: true,
      });
      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        userId,
        JSON.stringify({ isPro: true, isGiftedPro: true }),
        { expirationTtl: 3600 }
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle email matching case-insensitively', async () => {
      const userId = 'user-123';
      const email = 'GIFTED1@EXAMPLE.COM';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: true,
        isGiftedPro: true,
      });
    });

    it('should handle whitespace in GIFTED_PRO_EMAILS', async () => {
      const userId = 'user-123';
      const email = 'gifted2@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: true,
        isGiftedPro: true,
      });
    });

    it('should not cache put error prevent return of gifted status', async () => {
      const userId = 'user-123';
      const email = 'gifted1@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (mockEnv.USER_STATUS!.put as jest.Mock).mockRejectedValueOnce(
        new Error('Cache write failed')
      );

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: true,
        isGiftedPro: true,
      });
    });
  });

  describe('Active subscription from Supabase', () => {
    it('should return isPro=true with subscription details for active subscription', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const subscriptionData = [
        {
          status: 'active',
          current_period_end: '2025-12-31T23:59:59Z',
        },
      ];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result.isPro).toBe(true);
      expect(result.isGiftedPro).toBe(false);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe('active');
      expect(typeof result.subscription?.currentPeriodEnd).toBe('number');
    });

    it('should return isPro=true for trialing subscription', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const subscriptionData = [
        {
          status: 'trialing',
          current_period_end: 1735689599,
        },
      ];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result.isPro).toBe(true);
      expect(result.subscription?.status).toBe('trialing');
    });

    it('should return isPro=false for canceled subscription', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const subscriptionData = [
        {
          status: 'canceled',
          current_period_end: 1735689599,
        },
      ];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result.isPro).toBe(false);
      expect(result.isGiftedPro).toBe(false);
    });

    it('should cache subscription status with 3600s TTL', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const subscriptionData = [
        {
          status: 'active',
          current_period_end: 1735689599,
        },
      ];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      await getUserStatus(mockEnv as Env, userId, email);

      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        userId,
        expect.stringContaining('"isPro":true'),
        { expirationTtl: 3600 }
      );
    });

    it('should handle numeric current_period_end', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const periodEnd = 1735689599;
      const subscriptionData = [
        {
          status: 'active',
          current_period_end: periodEnd,
        },
      ];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result.subscription?.currentPeriodEnd).toBe(periodEnd);
    });
  });

  describe('No subscription found', () => {
    it('should return isPro=false when subscription array is empty', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        userId,
        JSON.stringify({ isPro: false, isGiftedPro: false }),
        { expirationTtl: 3600 }
      );
    });

    it('should return isPro=false for invalid subscription object', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';
      const subscriptionData = [null];

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => subscriptionData,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });
  });

  describe('Supabase API error', () => {
    it('should return default status (isPro=false) on API error', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });

    it('should return default status on network error', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });

    it('should return default status on JSON parse error', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('JSON parse error');
        },
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });

    it('should return default status when response is not array', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'Invalid response' }),
      });

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });
  });

  describe('Supabase request construction', () => {
    it('should construct correct Supabase URL and headers', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await getUserStatus(mockEnv as Env, userId, email);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('subscriptions?user_id=eq.user-123'),
        {
          method: 'GET',
          headers: {
            apikey: 'test-key',
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should URL encode userId in Supabase query', async () => {
      const userId = 'user@123+special';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await getUserStatus(mockEnv as Env, userId, email);

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('user_id=eq.');
      expect(callUrl).not.toContain('user@123+special'); // Should be encoded
    });
  });

  describe('Unexpected errors', () => {
    it('should return default status for unexpected errors', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      (mockEnv.USER_STATUS!.get as jest.Mock).mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      const result = await getUserStatus(mockEnv as Env, userId, email);

      expect(result).toEqual({
        isPro: false,
        isGiftedPro: false,
      });
    });
  });
});
