/**
 * Stripe webhook handler
 * Processes subscription lifecycle events
 */

import type { Env, StripeWebhookEvent, UserStatus } from './types.js';

/**
 * Verify Stripe webhook signature
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Parse signature header
    const elements = signature.split(',');
    const timestamp = elements.find((e) => e.startsWith('t='))?.split('=')[1];
    const sig = elements.find((e) => e.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !sig) {
      return false;
    }

    // Construct signed payload
    const signedPayload = `${timestamp}.${payload}`;

    // Compute expected signature using HMAC-SHA256
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

    // Convert to hex string
    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return expectedSig === sig;
  } catch {
    return false;
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Get raw body and signature
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }

    // Verify signature
    const isValid = await verifyStripeSignature(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    if (!isValid) {
      return new Response('Invalid signature', { status: 400 });
    }

    // Parse event
    const event = JSON.parse(payload) as StripeWebhookEvent;

    // Handle subscription events
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          console.warn('No userId in subscription metadata');
          return new Response('OK', { status: 200 });
        }

        // Update user status in KV
        const userStatus: UserStatus = {
          isPro: subscription.status === 'active',
          isGiftedPro: false,
          subscription: {
            status: subscription.status || 'unknown',
            currentPeriodEnd: subscription.current_period_end || 0,
          },
        };

        await env.USER_STATUS.put(
          userId,
          JSON.stringify(userStatus),
          { expirationTtl: 3600 } // 1 hour cache
        );

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          console.warn('No userId in subscription metadata');
          return new Response('OK', { status: 200 });
        }

        // Update user status to non-Pro
        const userStatus: UserStatus = {
          isPro: false,
          isGiftedPro: false,
        };

        await env.USER_STATUS.put(
          userId,
          JSON.stringify(userStatus),
          { expirationTtl: 3600 }
        );

        break;
      }

      default:
        // Ignore other event types
        break;
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Webhook error', { status: 500 });
  }
}
