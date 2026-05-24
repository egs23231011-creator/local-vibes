// Simple in-memory cache for Next.js API routes
// Safe for serverless environments (per-instance cache)

const cache = new Map();

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return entry.value;
}

/**
 * Set a value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlMs - Time-to-live in milliseconds
 */
export function setCache(key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  cache.set(key, { value, expiresAt });
}

/**
 * Clear all cache entries (optional utility)
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache size (optional utility for debugging)
 */
export function getCacheSize() {
  return cache.size;
}
