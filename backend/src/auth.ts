/**
 * Authentication and authorization utilities for ScamDefender Backend
 *
 * Handles JWT validation using Web Crypto API (HMAC-SHA256)
 * Manages user status checking including subscription validation
 */

import { Result, Env, UserStatus, JWTPayload } from './types';

/**
 * Decodes a base64url encoded string
 */
function base64urlDecode(input: string): Uint8Array {
  // Add padding if needed
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) {
    str += '='.repeat(4 - pad);
  }

  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Validates a JWT token and extracts user information
 *
 * Uses Web Crypto API (crypto.subtle) for HMAC-SHA256 validation
 * Compatible with Supabase's legacy HMAC-SHA256 algorithm
 *
 * @param token - The JWT token to validate
 * @param secret - The secret key for HMAC verification
 * @returns Promise<Result<{ userId: string; email: string }>>
 */
export async function validateJWT(
  token: string,
  secret: string
): Promise<Result<{ userId: string; email: string }>> {
  try {
    // Split the token into three parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'Invalid JWT format: expected 3 parts separated by dots'
      };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    let payloadData: unknown;

    try {
      const headerBytes = base64urlDecode(headerB64);
      const headerStr = new TextDecoder().decode(headerBytes);
      // Verify header can be parsed (validates JWT format)
      JSON.parse(headerStr) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        error: 'Failed to decode JWT header'
      };
    }

    try {
      const payloadBytes = base64urlDecode(payloadB64);
      const payloadStr = new TextDecoder().decode(payloadBytes);
      payloadData = JSON.parse(payloadStr);
    } catch {
      return {
        success: false,
        error: 'Failed to decode JWT payload'
      };
    }

    // Validate payload structure
    if (!payloadData || typeof payloadData !== 'object') {
      return {
        success: false,
        error: 'Invalid JWT payload: not a valid object'
      };
    }

    const payload = payloadData as JWTPayload;

    // Check expiration
    if (typeof payload.exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          success: false,
          error: 'JWT token has expired'
        };
      }
    } else {
      return {
        success: false,
        error: 'JWT payload missing exp claim'
      };
    }

    // Validate required claims
    if (!payload.sub) {
      return {
        success: false,
        error: 'JWT payload missing sub (userId) claim'
      };
    }

    if (!payload.email) {
      return {
        success: false,
        error: 'JWT payload missing email claim'
      };
    }

    // Verify signature
    const messageToVerify = `${headerB64}.${payloadB64}`;
    const messageBytes = new TextEncoder().encode(messageToVerify);
    const secretBytes = new TextEncoder().encode(secret);

    // Import the secret as a HMAC key
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
    } catch {
      return {
        success: false,
        error: 'Failed to import HMAC key'
      };
    }

    // Compute HMAC-SHA256 signature
    let computedSignatureBytes: ArrayBuffer;
    try {
      computedSignatureBytes = await crypto.subtle.sign(
        'HMAC',
        key,
        messageBytes
      );
    } catch {
      return {
        success: false,
        error: 'Failed to compute HMAC signature'
      };
    }

    // Decode the provided signature from base64url
    const providedSignatureBytes = base64urlDecode(signatureB64);

    // Compare signatures in constant time
    const computedSignature = new Uint8Array(computedSignatureBytes);
    if (computedSignature.length !== providedSignatureBytes.length) {
      return {
        success: false,
        error: 'JWT signature verification failed: length mismatch'
      };
    }

    let signaturesMatch = true;
    for (let i = 0; i < computedSignature.length; i++) {
      if (computedSignature[i] !== providedSignatureBytes[i]) {
        signaturesMatch = false;
      }
    }

    if (!signaturesMatch) {
      return {
        success: false,
        error: 'JWT signature verification failed: signature does not match'
      };
    }

    // Extract userId and email
    const userId = payload.sub;
    const email = payload.email;

    return {
      success: true,
      data: { userId, email }
    };
  } catch {
    return {
      success: false,
      error: `Unexpected error during JWT validation: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}

/**
 * Retrieves the subscription status for a user
 *
 * Checks KV cache first, then queries Supabase for subscription data
 * Caches the result with a 3600 second TTL
 *
 * @param env - Cloudflare Worker environment bindings
 * @param userId - The user's unique identifier
 * @param email - The user's email address
 * @returns Promise<UserStatus>
 */
export async function getUserStatus(
  env: Env,
  userId: string,
  email: string
): Promise<UserStatus> {
  try {
    // Check KV cache first
    const cachedStatus = await env.USER_STATUS.get(userId);
    if (cachedStatus) {
      try {
        const status = JSON.parse(cachedStatus) as UserStatus;
        return status;
      } catch {
        // If cache is corrupted, continue to fresh lookup
      }
    }

    // Check if email is in gifted pro list
    const giftedEmails = env.GIFTED_PRO_EMAILS
      .split(',')
      .map(e => e.trim().toLowerCase());

    if (giftedEmails.includes(email.toLowerCase())) {
      const giftedStatus: UserStatus = {
        isPro: true,
        isGiftedPro: true
      };

      try {
        await env.USER_STATUS.put(userId, JSON.stringify(giftedStatus), {
          expirationTtl: 3600
        });
      } catch {
        // If cache write fails, we still return the status
      }

      return giftedStatus;
    }

    // Query Supabase for subscription status
    const subscriptionUrl = `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`;

    let subscriptionResponse: Response;
    try {
      subscriptionResponse = await fetch(subscriptionUrl, {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
    } catch {
      // Network error - return default status
      const defaultStatus: UserStatus = {
        isPro: false,
        isGiftedPro: false
      };
      return defaultStatus;
    }

    if (!subscriptionResponse.ok) {
      // API error - return default status
      const defaultStatus: UserStatus = {
        isPro: false,
        isGiftedPro: false
      };
      return defaultStatus;
    }

    let subscriptions: unknown;
    try {
      subscriptions = await subscriptionResponse.json();
    } catch {
      // JSON parse error - return default status
      const defaultStatus: UserStatus = {
        isPro: false,
        isGiftedPro: false
      };
      return defaultStatus;
    }

    // Validate subscriptions response
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      // No subscription found
      const noSubStatus: UserStatus = {
        isPro: false,
        isGiftedPro: false
      };

      try {
        await env.USER_STATUS.put(userId, JSON.stringify(noSubStatus), {
          expirationTtl: 3600
        });
      } catch {
        // If cache write fails, we still return the status
      }

      return noSubStatus;
    }

    // Parse the first subscription record
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const subscription = subscriptions[0];
    if (typeof subscription !== 'object' || subscription === null) {
      // Invalid subscription object
      const defaultStatus: UserStatus = {
        isPro: false,
        isGiftedPro: false
      };
      return defaultStatus;
    }

    const subscriptionObj = subscription as Record<string, unknown>;
    const status = subscriptionObj.status as string | undefined;
    const currentPeriodEnd = subscriptionObj.current_period_end as string | number | undefined;

    // Determine if subscription is active
    const isPro = status === 'active' || status === 'trialing';

    // Parse expiration timestamp
    let periodEndTimestamp: number | undefined;
    if (currentPeriodEnd) {
      if (typeof currentPeriodEnd === 'string') {
        periodEndTimestamp = Math.floor(new Date(currentPeriodEnd).getTime() / 1000);
      } else if (typeof currentPeriodEnd === 'number') {
        periodEndTimestamp = currentPeriodEnd;
      }
    }

    const userStatus: UserStatus = {
      isPro,
      isGiftedPro: false,
      ...(isPro && periodEndTimestamp && {
        subscription: {
          status: status || 'unknown',
          currentPeriodEnd: periodEndTimestamp
        }
      })
    };

    // Cache the result
    try {
      await env.USER_STATUS.put(userId, JSON.stringify(userStatus), {
        expirationTtl: 3600
      });
    } catch {
      // If cache write fails, we still return the status
    }

    return userStatus;
  } catch {
    // Unexpected error - return default safe status
    const defaultStatus: UserStatus = {
      isPro: false,
      isGiftedPro: false
    };
    return defaultStatus;
  }
}
