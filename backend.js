// src/backends/CacheBackend.js
class CacheBackend {
  /**
   * Save data to the cache.
   * @param {Object} data - Data to save.
   * @throws {Error} If not implemented.
   */
  async save(data) {
    throw new Error('save() not implemented.');
  }

  /**
   * Fetch data from the cache.
   * @returns {Promise<Object>} The cached data.
   * @throws {Error} If not implemented.
   */
  async fetch() {
    throw new Error('fetch() not implemented.');
  }

  /**
   * Delete a specific key from the cache.
   * @param {string} key - The key to delete.
   * @throws {Error} If not implemented.
   */
  async delete(key) {
    throw new Error('delete() not implemented.');
  }

  /**
   * Check if a key exists in the cache.
   * @param {string} key - The key to check.
   * @returns {Promise<boolean>} True if the key exists, otherwise false.
   * @throws {Error} If not implemented.
   */
  async has(key) {
    throw new Error('has() not implemented.');
  }

  /**
   * Clear all data from the cache.
   * @throws {Error} If not implemented.
   */
  async clear() {
    throw new Error('clear() not implemented.');
  }

  /**
   * Get all keys stored in the cache.
   * @returns {Promise<string[]>} Array of keys.
   * @throws {Error} If not implemented.
   */
  async keys() {
    throw new Error('keys() not implemented.');
  }

  /**
   * Get the count of items in the cache.
   * @returns {Promise<number>} The number of items.
   * @throws {Error} If not implemented.
   */
  async count() {
    throw new Error('count() not implemented.');
  }
}

module.exports = CacheBackend;

// src/backends/RedisBackend.js
const { createClient } = require('redis');
const CacheBackend = require('./CacheBackend');

class RedisBackend extends CacheBackend {
  constructor(config) {
    super();
    this.client = createClient(config);
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.redisKey = config.key;
  }

  async connect() {
    await this.client.connect();
  }

  async save(data) {
    await this.client.set(this.redisKey, JSON.stringify(data));
  }

  async fetch() {
    const data = await this.client.get(this.redisKey);
    return JSON.parse(data);
  }

  async delete(key) {
    await this.client.del(key);
  }

  async has(key) {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async clear() {
    await this.client.flushAll();
  }

  async keys() {
    return await this.client.keys('*');
  }

  async count() {
    const keys = await this.keys();
    return keys.length;
  }
}

module.exports = RedisBackend;

// src/backends/FileBackend.js
const fs = require('fs').promises;
const CacheBackend = require('./CacheBackend');

class FileBackend extends CacheBackend {
  constructor(config) {
    super();
    this.filePath = config.filePath;
  }

  async save(data) {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async fetch() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null; // File does not exist
      }
      throw err;
    }
  }

  async delete() {
    try {
      await fs.unlink(this.filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async has() {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  async clear() {
    await this.delete();
  }

  async keys() {
    return [this.filePath];
  }

  async count() {
    const exists = await this.has();
    return exists ? 1 : 0;
  }
}

module.exports = FileBackend;

// src/UniCache.js
const RedisBackend = require('./backends/RedisBackend');
const FileBackend = require('./backends/FileBackend');

class UniCache {
  constructor(options) {
    this.backend =
      options.cacheType === 'redis'
        ? new RedisBackend(options.redisConfig)
        : new FileBackend(options.fileConfig);
  }

  async save(data) {
    await this.backend.save(data);
  }

  async fetch() {
    return await this.backend.fetch();
  }

  async delete(key) {
    await this.backend.delete(key);
  }

  async has(key) {
    return await this.backend.has(key);
  }

  async clear() {
    await this.backend.clear();
  }

  async keys() {
    return await this.backend.keys();
  }

  async count() {
    return await this.backend.count();
  }
}

module.exports = UniCache;


