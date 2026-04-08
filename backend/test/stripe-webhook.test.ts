/**
 * Stripe webhook handler unit tests
 * Tests handleStripeWebhook() function with various webhook scenarios
 */

import { handleStripeWebhook } from '../src/stripe-webhook.js';
import type { Env, StripeWebhookEvent } from '../src/types.js';

/**
 * Mock crypto.subtle for signature verification
 */
const _mockCryptoSubtle = {
  importKey: jest.fn(),
  sign: jest.fn(),
};

/**
 * Mock Stripe payload generator
 */
function generateStripePayload(event: StripeWebhookEvent): string {
  return JSON.stringify(event);
}

/**
 * Helper to create a valid Stripe webhook signature
 */
async function createValidSignature(
  payload: string,
  secret: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;

  // Create HMAC signature using the actual crypto.subtle if available
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const sig = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `t=${timestamp},v1=${sig}`;
}

describe('handleStripeWebhook', () => {
  let mockEnv: Partial<Env>;
  let mockKVNamespace: Record<string, string>;

  beforeEach(() => {
    mockKVNamespace = {};
    mockEnv = {
      USER_STATUS: {
        put: jest.fn(async (key: string, value: string) => {
          mockKVNamespace[key] = value;
        }),
        get: jest.fn(async (key: string) => mockKVNamespace[key] || null),
      } as any,
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    };

    jest.clearAllMocks();
  });

  describe('Missing or invalid signature', () => {
    test('returns 400 when stripe-signature header is missing', async () => {
      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        body: JSON.stringify({ type: 'customer.subscription.created' }),
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing signature');
    });

    test('returns 400 when signature is invalid', async () => {
      const payload = JSON.stringify({
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            metadata: { userId: 'user_123' },
          },
        },
      });

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 't=1234567890,v1=invalidsignature',
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid signature');
    });

    test('returns 400 when signature format is malformed', async () => {
      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'malformed-signature',
        },
        body: 'test payload',
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(400);
    });
  });

  describe('subscription.created event', () => {
    test('updates USER_STATUS KV with Pro subscription and returns 200', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_1234567890',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_end: 1735689600,
            metadata: { userId: 'user_abc123' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');

      // Verify KV was updated
      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        'user_abc123',
        expect.stringContaining('"isPro":true'),
        { expirationTtl: 3600 }
      );

      const storedValue = mockKVNamespace['user_abc123'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isPro).toBe(true);
      expect(userStatus.subscription.status).toBe('active');
      expect(userStatus.subscription.currentPeriodEnd).toBe(1735689600);
    });

    test('stores isGiftedPro as false for new subscription', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_1234567890',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_456',
            customer: 'cus_456',
            status: 'active',
            current_period_end: 1735689600,
            metadata: { userId: 'user_xyz789' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      await handleStripeWebhook(request, mockEnv as Env);

      const storedValue = mockKVNamespace['user_xyz789'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isGiftedPro).toBe(false);
    });
  });

  describe('subscription.updated event', () => {
    test('updates USER_STATUS KV with updated subscription and returns 200', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_9876543210',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_789',
            customer: 'cus_789',
            status: 'active',
            current_period_end: 1738368000,
            metadata: { userId: 'user_updated' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);

      const storedValue = mockKVNamespace['user_updated'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isPro).toBe(true);
      expect(userStatus.subscription.currentPeriodEnd).toBe(1738368000);
    });

    test('handles subscription status change to past_due', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_update_pastdue',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_past_due',
            customer: 'cus_past_due',
            status: 'past_due',
            current_period_end: 1738368000,
            metadata: { userId: 'user_pastdue' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      await handleStripeWebhook(request, mockEnv as Env);

      const storedValue = mockKVNamespace['user_pastdue'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isPro).toBe(false);
      expect(userStatus.subscription.status).toBe('past_due');
    });
  });

  describe('subscription.deleted event', () => {
    test('sets isPro to false in USER_STATUS KV and returns 200', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_delete_123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_deleted',
            customer: 'cus_deleted',
            status: 'canceled',
            metadata: { userId: 'user_deleted' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);

      const storedValue = mockKVNamespace['user_deleted'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isPro).toBe(false);
      expect(userStatus.isGiftedPro).toBe(false);
      expect(userStatus.subscription).toBeUndefined();
    });

    test('removes subscription data when subscription is deleted', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_delete_456',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_remove',
            customer: 'cus_remove',
            status: 'canceled',
            metadata: { userId: 'user_nosub' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      await handleStripeWebhook(request, mockEnv as Env);

      const storedValue = mockKVNamespace['user_nosub'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus).not.toHaveProperty('subscription');
    });
  });

  describe('Missing userId in metadata', () => {
    test('logs warning and returns 200 for subscription.created without userId', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event: StripeWebhookEvent = {
        id: 'evt_no_userid_1',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_no_user',
            customer: 'cus_no_user',
            status: 'active',
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith('No userId in subscription metadata');
      expect(mockEnv.USER_STATUS!.put).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('logs warning and returns 200 for subscription.updated without userId', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event: StripeWebhookEvent = {
        id: 'evt_no_userid_2',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_no_user_2',
            customer: 'cus_no_user_2',
            status: 'active',
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith('No userId in subscription metadata');

      consoleSpy.mockRestore();
    });

    test('logs warning and returns 200 for subscription.deleted without userId', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event: StripeWebhookEvent = {
        id: 'evt_no_userid_3',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_no_user_3',
            customer: 'cus_no_user_3',
            status: 'canceled',
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith('No userId in subscription metadata');

      consoleSpy.mockRestore();
    });
  });

  describe('Unknown event types', () => {
    test('ignores unknown event type and returns 200', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_unknown',
        type: 'customer.updated',
        data: {
          object: {
            id: 'cus_123',
            customer: 'cus_123',
            metadata: { userId: 'user_123' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(mockEnv.USER_STATUS!.put).not.toHaveBeenCalled();
    });

    test('ignores charge.failed event and returns 200', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_charge_failed',
        type: 'charge.failed',
        data: {
          object: {
            id: 'ch_123',
            customer: 'cus_123',
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);
      expect(mockEnv.USER_STATUS!.put).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    test('returns 500 on JSON parsing error', async () => {
      const invalidPayload = 'invalid json {';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = `t=${timestamp},v1=fakesig`;

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: invalidPayload,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Webhook error:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test('logs error and returns 500 on KV write failure', async () => {
      const mockKVError = new Error('KV write failed');
      mockEnv.USER_STATUS!.put = jest.fn().mockRejectedValue(mockKVError);

      const event: StripeWebhookEvent = {
        id: 'evt_kv_error',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_error',
            customer: 'cus_error',
            status: 'active',
            metadata: { userId: 'user_error' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Signature verification edge cases', () => {
    test('handles subscription with missing current_period_end gracefully', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_no_period',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_no_period',
            customer: 'cus_no_period',
            status: 'active',
            metadata: { userId: 'user_no_period' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);

      const storedValue = mockKVNamespace['user_no_period'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.isPro).toBe(true);
      expect(userStatus.subscription.currentPeriodEnd).toBe(0);
    });

    test('handles subscription with missing status gracefully', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_no_status',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_no_status',
            customer: 'cus_no_status',
            metadata: { userId: 'user_no_status' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      const response = await handleStripeWebhook(
        request,
        mockEnv as Env
      );

      expect(response.status).toBe(200);

      const storedValue = mockKVNamespace['user_no_status'];
      const userStatus = JSON.parse(storedValue);
      expect(userStatus.subscription.status).toBe('unknown');
    });
  });

  describe('Cache TTL verification', () => {
    test('sets 1 hour TTL when storing subscription created event', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_ttl_test',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_ttl',
            customer: 'cus_ttl',
            status: 'active',
            metadata: { userId: 'user_ttl' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      await handleStripeWebhook(request, mockEnv as Env);

      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        'user_ttl',
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    test('sets 1 hour TTL when storing subscription deleted event', async () => {
      const event: StripeWebhookEvent = {
        id: 'evt_ttl_delete',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_ttl_del',
            customer: 'cus_ttl_del',
            status: 'canceled',
            metadata: { userId: 'user_ttl_del' },
          },
        },
      };

      const payload = generateStripePayload(event);
      const signature = await createValidSignature(
        payload,
        mockEnv.STRIPE_WEBHOOK_SECRET as string
      );

      const request = new Request('http://localhost/webhook/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
        },
        body: payload,
      });

      await handleStripeWebhook(request, mockEnv as Env);

      expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
        'user_ttl_del',
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });
  });
});
