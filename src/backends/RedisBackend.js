// src/backends/RedisBackend.js
const { createClient } = require('redis');
const CacheBackend = require('./CacheBackend');

class RedisBackend extends CacheBackend {
  constructor(config) {
    super();
    this.dbHost = config.dbHost || 'localhost';
    this.dbPort = config.dbPort || 6379;
    this.cacheName = config.cacheName; // Used as a namespace/prefix for keys
    this.keyPrefix = `${this.cacheName}:`;

    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {}); // UniCache will pass its own logger

    this.uri = `redis://${this.dbHost}:${this.dbPort}`;
    this.client = createClient({ url: this.uri });

    this.client.on('error', (err) => {
      this.log(`Redis Client Error for cache "${this.cacheName}":`, err.message);
      if (this.debug) console.error(`[RedisBackend][${this.cacheName}] Client Error:`, err);
    });
  }

  _getKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  _getLogicalKey(redisKey) {
    if (redisKey.startsWith(this.keyPrefix)) {
      return redisKey.substring(this.keyPrefix.length);
    }
    return redisKey;
  }

  _stringifyValue(value) {
    if (value === undefined || value === null) {
      return JSON.stringify(null);
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  _parseValue(value) {
    if (value === null || value === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(value);
    } catch (e) {
      this.log(`_parseValue: Failed to parse JSON, returning raw value for key. Value: "${value && value.substring(0, 50)}"`);
      return value;
    }
  }

  async connect() {
    if (!this.client.isOpen) {
      try {
        await this.client.connect();
        this.log(`Connected to Redis at ${this.uri} for cache "${this.cacheName}".`);
      } catch (err) {
        this.log(`Failed to connect to Redis for cache "${this.cacheName}" at ${this.uri}: ${err.message}`);
        if (this.debug) console.error(`[RedisBackend][${this.cacheName}] Connection Error:`, err);
        throw err;
      }
    } else {
      this.log(`Already connected to Redis for cache "${this.cacheName}".`);
    }
  }

  // storeExists() method is REMOVED as per our previous decision

  async save(data) {
    if (!this.client.isOpen) await this.connect();
    if (Object.keys(data).length === 0) {
      this.log(`Save for "${this.cacheName}": Data object is empty. If clearing is intended, use clear().`);
      // To represent an empty cache after a save operation, you might want to clear existing keys first.
      // For now, an empty data object results in no keys being set by MSET.
      // If you want `save({})` to mean "delete all keys for this cache",
      // then you should call `await this.clear()` here.
      // However, typically `save({})` might mean "there are no keys to assert right now".
      // Let's assume `save({})` means no operation on Redis keys.
      return;
    }

    const multiSetArgs = [];
    for (const [key, value] of Object.entries(data)) {
      multiSetArgs.push(this._getKey(key), this._stringifyValue(value));
    }

    try {
      await this.client.mSet(multiSetArgs);
      if (this.debug) this.log(`Data saved to Redis for cache "${this.cacheName}" using MSET. Keys: ${Object.keys(data).join(', ')}`);
    } catch (err) {
      this.log(`Error saving data to Redis for "${this.cacheName}" using MSET: ${err.message}`);
      throw err;
    }
  }

  async fetch() {
    if (!this.client.isOpen) await this.connect();
    const cacheData = {};
    let cursor = 0;
    const keysToFetch = [];

    try {
      do {
        const scanResult = await this.client.scan(cursor, { MATCH: `${this.keyPrefix}*`, COUNT: 100 });
        cursor = scanResult.cursor;
        keysToFetch.push(...scanResult.keys);
      } while (cursor !== 0);

      if (keysToFetch.length === 0) {
        if (this.debug) this.log(`Workspace for "${this.cacheName}": No keys found matching prefix.`);
        return {};
      }

      const values = await this.client.mGet(keysToFetch);

      keysToFetch.forEach((redisKey, index) => {
        const logicalKey = this._getLogicalKey(redisKey);
        if (values[index] !== null) {
          cacheData[logicalKey] = this._parseValue(values[index]);
        }
      });

      if (this.debug) this.log(`Data fetched from Redis for cache "${this.cacheName}". Keys found: ${keysToFetch.length}`);
      return cacheData;
    } catch (err) {
      this.log(`Error fetching data from Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async delete(key) {
    if (!this.client.isOpen) await this.connect();
    try {
      const result = await this.client.del(this._getKey(key));
      if (this.debug) this.log(`Key "${key}" (redis key: ${this._getKey(key)}) deleted from Redis for cache "${this.cacheName}". Result: ${result}`);
      return result > 0;
    } catch (err) {
      this.log(`Error deleting key "${key}" from Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async has(key) {
    if (!this.client.isOpen) await this.connect();
    try {
      const result = await this.client.exists(this._getKey(key));
      if (this.debug) this.log(`Key "${key}" (redis key: ${this._getKey(key)}) exists check for cache "${this.cacheName}": ${result === 1}`);
      return result === 1;
    } catch (err) {
      this.log(`Error checking existence of key "${key}" in Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async clear() {
    if (!this.client.isOpen) await this.connect();
    let cursor = 0;
    const keysToDelete = [];
    try {
      do {
        const scanResult = await this.client.scan(cursor, { MATCH: `${this.keyPrefix}*`, COUNT: 100 });
        cursor = scanResult.cursor;
        keysToDelete.push(...scanResult.keys);
      } while (cursor !== 0);

      if (keysToDelete.length > 0) {
        await this.client.del(keysToDelete);
        if (this.debug) this.log(`Cache "${this.cacheName}" cleared from Redis. ${keysToDelete.length} keys deleted.`);
      } else {
        if (this.debug) this.log(`Cache "${this.cacheName}" clear: No keys found matching prefix to delete.`);
      }
    } catch (err) {
      this.log(`Error clearing cache "${this.cacheName}" from Redis: ${err.message}`);
      throw err;
    }
  }

  async keys() {
    if (!this.client.isOpen) await this.connect();
    const logicalKeys = [];
    let cursor = 0;
    try {
      do {
        const scanResult = await this.client.scan(cursor, { MATCH: `${this.keyPrefix}*`, COUNT: 100 });
        cursor = scanResult.cursor;
        scanResult.keys.forEach((redisKey) => logicalKeys.push(this._getLogicalKey(redisKey)));
      } while (cursor !== 0);
      if (this.debug) this.log(`Keys retrieved for cache "${this.cacheName}": ${logicalKeys.length} keys.`);
      return logicalKeys;
    } catch (err) {
      this.log(`Error retrieving keys for cache "${this.cacheName}" from Redis: ${err.message}`);
      throw err;
    }
  }

  async count() {
    const keysArray = await this.keys(); // Relies on the above keys() method
    return keysArray.length;
  }

  async add(key, count) {
    if (!this.client.isOpen) await this.connect();
    const redisKey = this._getKey(key);
    try {
      const numericCount = parseInt(count, 10);
      if (isNaN(numericCount)) {
        throw new Error('Count for add operation must be an integer.');
      }
      await this.client.incrBy(redisKey, numericCount);
      if (this.debug) this.log(`Value for key "${key}" incremented by ${numericCount} in cache "${this.cacheName}".`);
    } catch (err) {
      this.log(`Error incrementing key "${key}" in Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async subtract(key, count) {
    if (!this.client.isOpen) await this.connect();
    const redisKey = this._getKey(key);
    try {
      const numericCount = parseInt(count, 10);
      if (isNaN(numericCount)) {
        throw new Error('Count for subtract operation must be an integer.');
      }
      await this.client.decrBy(redisKey, numericCount);
      if (this.debug) this.log(`Value for key "${key}" decremented by ${numericCount} in cache "${this.cacheName}".`);
    } catch (err) {
      this.log(`Error decrementing key "${key}" in Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async push(key, element) {
    if (!this.client.isOpen) await this.connect();
    const redisKey = this._getKey(key);
    try {
      await this.client.rPush(redisKey, this._stringifyValue(element));
      if (this.debug) this.log(`Element pushed to list at key "${key}" in cache "${this.cacheName}".`);
    } catch (err) {
      this.log(`Error pushing to list at key "${key}" in Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async retrieveObject(key) {
    if (!this.client.isOpen) await this.connect();
    const redisKey = this._getKey(key);
    try {
      const value = await this.client.get(redisKey);
      if (value === null) {
        if (this.debug) this.log(`retrieveObject: Key "${key}" not found in cache "${this.cacheName}".`);
        return undefined;
      }
      if (this.debug) this.log(`retrieveObject: Value retrieved for key "${key}" in cache "${this.cacheName}".`);
      return this._parseValue(value);
    } catch (err) {
      this.log(`Error retrieving object for key "${key}" in Redis for "${this.cacheName}": ${err.message}`);
      throw err;
    }
  }

  async close() {
    if (this.client.isOpen) {
      try {
        await this.client.quit();
        this.log(`Redis connection closed for cache "${this.cacheName}".`);
      } catch (err) {
        this.log(`Error closing Redis connection for cache "${this.cacheName}": ${err.message}`);
        throw err;
      }
    } else {
      this.log(`Redis connection already closed or never opened for cache "${this.cacheName}".`);
    }
  }
}

module.exports = RedisBackend;
