/**
 * Cache utility for storing and retrieving data with expiration support.
 * Uses chrome.storage.local for persistent storage across browser sessions.
 */

/**
 * Retrieves a cached value by key.
 * Returns null if the key doesn't exist or if the cached value has expired.
 *
 * @param {string} key - The cache key to retrieve
 * @returns {Promise<any|null>} The cached value, or null if missing or expired
 */
export async function getCached(key) {
  const result = await chrome.storage.local.get(key);

  if (!result[key]) {
    return null;
  }

  const { value, expiresAt } = result[key];
  const now = Date.now();

  if (now >= expiresAt) {
    // Entry has expired, remove it
    await chrome.storage.local.remove(key);
    return null;
  }

  return value;
}

/**
 * Stores a value in the cache with a time-to-live (TTL).
 * The value will automatically expire after the specified number of hours.
 *
 * @param {string} key - The cache key to store the value under
 * @param {any} value - The value to cache (must be JSON-serializable)
 * @param {number} ttlHours - Time-to-live in hours (default: 24 hours for domain checks)
 * @returns {Promise<void>}
 */
export async function setCached(key, value, ttlHours = 24) {
  const now = Date.now();
  const expiresAt = now + (ttlHours * 60 * 60 * 1000);

  await chrome.storage.local.set({
    [key]: {
      value,
      expiresAt
    }
  });
}
