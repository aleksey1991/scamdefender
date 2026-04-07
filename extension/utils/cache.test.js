import { jest } from '@jest/globals';
import { getCached, setCached } from './cache.js';

describe('cache', () => {
  // Mock chrome.storage.local with in-memory storage
  let mockStorage;

  beforeEach(() => {
    // Clear mock storage before each test
    mockStorage = {};

    // Initialize chrome mock before each test
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((key) => {
            return Promise.resolve({ [key]: mockStorage[key] });
          }),
          set: jest.fn((data) => {
            Object.assign(mockStorage, data);
            return Promise.resolve();
          }),
          remove: jest.fn((key) => {
            delete mockStorage[key];
            return Promise.resolve();
          })
        }
      }
    };

    jest.clearAllMocks();
  });

  describe('setCached and getCached', () => {
    test('setCached then getCached returns the value', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', count: 42 };

      await setCached(key, value, 24);
      const result = await getCached(key);

      expect(result).toEqual(value);
    });

    test('setCached stores value with correct structure', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await setCached(key, value, 24);

      expect(mockStorage[key]).toHaveProperty('value', value);
      expect(mockStorage[key]).toHaveProperty('expiresAt');
      expect(typeof mockStorage[key].expiresAt).toBe('number');
    });

    test('setCached uses default TTL of 24 hours', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const beforeTime = Date.now();

      await setCached(key, value);

      const afterTime = Date.now();
      const expectedExpiry = beforeTime + (24 * 60 * 60 * 1000);
      const actualExpiry = mockStorage[key].expiresAt;

      // Allow small time difference for test execution
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
      expect(actualExpiry).toBeLessThanOrEqual(afterTime + (24 * 60 * 60 * 1000));
    });

    test('setCached respects custom TTL', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const ttlHours = 12;
      const beforeTime = Date.now();

      await setCached(key, value, ttlHours);

      const afterTime = Date.now();
      const expectedExpiry = beforeTime + (ttlHours * 60 * 60 * 1000);
      const actualExpiry = mockStorage[key].expiresAt;

      // Allow small time difference for test execution
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
      expect(actualExpiry).toBeLessThanOrEqual(afterTime + (ttlHours * 60 * 60 * 1000));
    });
  });

  describe('getCached', () => {
    test('expired entry returns null', async () => {
      const key = 'expired-key';
      const value = 'expired-value';

      // Manually set an expired entry
      mockStorage[key] = {
        value,
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      };

      const result = await getCached(key);

      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(key);
    });

    test('missing key returns null', async () => {
      const result = await getCached('non-existent-key');

      expect(result).toBeNull();
    });

    test('does not remove non-expired entries', async () => {
      const key = 'valid-key';
      const value = 'valid-value';

      await setCached(key, value, 24);
      await getCached(key);

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });

  describe('different keys', () => {
    test('different keys do not interfere', async () => {
      const key1 = 'key-1';
      const value1 = 'value-1';
      const key2 = 'key-2';
      const value2 = 'value-2';

      await setCached(key1, value1, 24);
      await setCached(key2, value2, 24);

      const result1 = await getCached(key1);
      const result2 = await getCached(key2);

      expect(result1).toBe(value1);
      expect(result2).toBe(value2);
    });

    test('updating one key does not affect another', async () => {
      const key1 = 'key-1';
      const value1 = 'value-1';
      const key2 = 'key-2';
      const value2 = 'value-2';
      const value2Updated = 'value-2-updated';

      await setCached(key1, value1, 24);
      await setCached(key2, value2, 24);
      await setCached(key2, value2Updated, 24);

      const result1 = await getCached(key1);
      const result2 = await getCached(key2);

      expect(result1).toBe(value1);
      expect(result2).toBe(value2Updated);
    });
  });

  describe('complex data types', () => {
    test('caches and retrieves objects', async () => {
      const key = 'object-key';
      const value = {
        name: 'Test',
        nested: { data: [1, 2, 3] },
        flag: true
      };

      await setCached(key, value, 24);
      const result = await getCached(key);

      expect(result).toEqual(value);
    });

    test('caches and retrieves arrays', async () => {
      const key = 'array-key';
      const value = [1, 'two', { three: 3 }, [4, 5]];

      await setCached(key, value, 24);
      const result = await getCached(key);

      expect(result).toEqual(value);
    });

    test('caches and retrieves primitives', async () => {
      const testCases = [
        { key: 'string-key', value: 'test string' },
        { key: 'number-key', value: 42 },
        { key: 'boolean-key', value: true },
        { key: 'null-key', value: null }
      ];

      for (const { key, value } of testCases) {
        await setCached(key, value, 24);
        const result = await getCached(key);
        expect(result).toEqual(value);
      }
    });
  });
});
