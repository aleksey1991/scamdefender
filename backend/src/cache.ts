/**
 * KV Namespace wrapper functions for cache operations
 * Handles scam analysis caching and rate limiting with graceful error handling
 */

import { Env, AnalysisResult } from './types';

/**
 * Retrieves a cached analysis result from KV storage
 * @param env - Cloudflare Workers environment bindings
 * @param domain - Domain name to retrieve cache for
 * @returns Cached AnalysisResult if found, null otherwise (never throws)
 */
export async function getCachedAnalysis(
  env: Env,
  domain: string
): Promise<AnalysisResult | null> {
  const key = `analysis:${domain}`;

  try {
    const cached = await env.SCAM_CACHE.get(key);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as AnalysisResult;
    return parsed;
  } catch {
    // Silently handle parsing errors or KV access failures
    return null;
  }
}

/**
 * Stores an analysis result in KV storage with 72-hour TTL
 * @param env - Cloudflare Workers environment bindings
 * @param domain - Domain name to cache analysis for
 * @param result - AnalysisResult to store
 * @returns Promise<void> (never throws)
 */
export async function setCachedAnalysis(
  env: Env,
  domain: string,
  result: AnalysisResult
): Promise<void> {
  const key = `analysis:${domain}`;
  const TTL_SECONDS = 259200; // 72 hours

  try {
    const serialized = JSON.stringify(result);
    await env.SCAM_CACHE.put(key, serialized, {
      expirationTtl: TTL_SECONDS,
    });
  } catch {
    // Log error but don't throw - caching failure shouldn't break the flow
    console.error(`Failed to cache analysis for domain ${domain}:`, error);
  }
}

/**
 * Retrieves the rate limit count for a user on the current day
 * @param env - Cloudflare Workers environment bindings
 * @param userId - User ID to check rate limit for
 * @returns Number of requests made today (0 if not found, never throws)
 */
export async function getRateLimit(env: Env, userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = `ratelimit:${userId}:${today}`;

  try {
    const count = await env.RATE_LIMIT.get(key);

    if (!count) {
      return 0;
    }

    const parsed = parseInt(count, 10);
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    // Silently handle KV access failures
    return 0;
  }
}

/**
 * Increments the rate limit counter for a user by 1
 * @param env - Cloudflare Workers environment bindings
 * @param userId - User ID to increment rate limit for
 * @returns Promise<void> (never throws)
 */
export async function incrementRateLimit(
  env: Env,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `ratelimit:${userId}:${today}`;
  const TTL_SECONDS = 86400; // 24 hours

  try {
    const currentCount = await getRateLimit(env, userId);
    const newCount = currentCount + 1;

    await env.RATE_LIMIT.put(key, newCount.toString(), {
      expirationTtl: TTL_SECONDS,
    });
  } catch {
    // Log error but don't throw - rate limit failure shouldn't break the flow
    console.error(`Failed to increment rate limit for user ${userId}:`, error);
  }
}
