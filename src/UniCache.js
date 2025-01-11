// Source: ./src/UniCache.js
/**
 * Get properties from an object using a key string with dot notation.
 * @param {object} obj - The object containing the properties.
 * @param {string} key - The key string in dot notation.
 * @returns {*} The value at the specified key or undefined.
 */
const getProperties = (obj, key) => {
  const props = Array.isArray(key) ? key : key.split('.');
  for (const prop of props) {
    if (obj === null || obj === undefined) return undefined;
    obj = obj[prop];
  }
  return obj;
};

/**
 * Set properties on an object using a key string with dot notation.
 * @param {object} obj - The object to set the properties on.
 * @param {string} key - The key string in dot notation.
 * @param {*} val - The value to set at the specified key.
 */
const setProperties = (obj, key, val) => {
  const props = Array.isArray(key) ? key : key.split('.');
  let target = obj;
  for (let i = 0; i < props.length - 1; ++i) {
    if (target[props[i]] === undefined || target[props[i]] === null) {
      target[props[i]] = {};
    }
    target = target[props[i]];
  }
  target[props[props.length - 1]] = val;
};

class UniCache {
  constructor(cacheName, options = {}) {
    this.cacheName = cacheName;
    this.options = options;
    this.cacheType = options.cacheType || 'memory'; // Default to in-memory only
    this.inMemoryData = {}; // Primary in-memory cache
    this.backend = null; // Backend initialized if needed

    // Set up logging function
    this.log = options.logFunction || (() => {}); // Default to a no-op

    // Initialize backend if required
    this.initializeBackend();

    //if (options.syncInterval) {
    setInterval(() => this.sync(), options.syncInterval * 1000 || 86400000);
    //}
    if (this.options.debug) {
      this.log(`UniCache sync interval: ${this.options.syncInterval || 86400} seconds`);
    }
  }
// Dynamically load and initialize the appropriate backend
  async initializeBackend() {
    if (this.cacheType === 'file') {
      const FileBackend = require('./backends/FileBackend');
      this.backend = new FileBackend({
        cacheName: this.cacheName,
        savePath: this.options.savePath || './data',
        debug: this.options.debug,
        logFunction: this.log,
      });
      if (this.debug) {
        this.log('[UniCache] Using FileBackend');
        this.log('FileBackend is considered beta software and may not work as expected.');
      }
    } else if (this.cacheType === 'redis' || this.cacheType === 'valkey') {
      const RedisBackend = require('./backends/RedisBackend');
      this.backend = new RedisBackend({
        cacheName: this.cacheName,
        dbHost: this.options.dbHost,
        dbPort: this.options.dbPort,
        debug: this.options.debug,
        logFunction: this.log,
      });
      if (this.debug) {
        if (this.cacheType === 'valkey') {
          this.log('[UniCache] Using RedisBackend for ValKey');
        } else {
          this.log('[UniCache] Using RedisBackend');
        }
        this.log('RedisBackend is highly experimental and may not work as expected.');
      }
    } else if (this.cacheType === 'mongodb') {
      const MongoDBBackend = require('./backends/MongoDBBackend');
      this.backend = new MongoDBBackend({
        collectionName: this.cacheName,
        dbName: this.options.dbName,
        dbHost: this.options.dbHost,
        dbPort: this.options.dbPort,
        debug: this.options.debug,
        logFunction: this.log,
      });
      if (this.debug) {
        this.log('[UniCache] Using MongoDBBackend');
        this.log('MongoDBBackend is highly experimental and may not work as expected.');
      }
    }

    if (await this.existsObject(this.cacheName)) {
      this.log(`[UniCache] Cache ${this.cacheName} exists. Populating inMemoryData.`);
    } else {
      this.log(`[UniCache] Cache ${this.cacheName} does not exist. Starting fresh.`);
    }
  }

  // Check if the cache object exists in the backend and populate inMemoryData if it does
  async existsObject(cacheName) {
    if (cacheName === this.cacheName && this.backend) {
      const data = await this.backend.fetch();
      if (data && Object.keys(data).length > 0) {
        this.inMemoryData = data;
        return true;
      }
    }
    return false;
  }

  // Public method to get a property using dot notation
  async get(key) {
    return await getProperties(this.inMemoryData, key);
  }

  // Public method to set a property using dot notation
  async set(key, value, sync = false) {
    await setProperties(this.inMemoryData, key, value);
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  // Save to in-memory cache and optionally sync
  async save(data, sync = false) {
    Object.assign(this.inMemoryData, data);
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  // Fetch data from in-memory cache
  async fetch() {
    return this.inMemoryData;
  }

  // Delete key from in-memory cache and optionally sync
  async delete(key, sync = false) {
    delete this.inMemoryData[key];
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  async has(key) {
    return Object.prototype.hasOwnProperty.call(this.inMemoryData, key);
  }

  async clear(sync = false) {
    this.inMemoryData = {};
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  async keys() {
    return Object.keys(this.inMemoryData);
  }

  async count() {
    return Object.keys(this.inMemoryData).length;
  }

  async add(key, count, sync = false) {
    this.inMemoryData[key] = (this.inMemoryData[key] || 0) + count;
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  async subtract(key, count, sync = false) {
    this.inMemoryData[key] = (this.inMemoryData[key] || 0) - count;
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  async push(key, element, sync = false) {
    if (!Array.isArray(this.inMemoryData[key])) {
      this.inMemoryData[key] = [];
    }
    this.inMemoryData[key].push(element);
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  async retrieveObject(key) {
    return this.inMemoryData[key];
  }

  // Synchronize in-memory cache to backend
  async sync() {
    if (!this.backend && this.options.debug) {
      this.log('[UniCache] In-memory mode; no sync performed.');
      return;
    }
    await this.backend.save(this.inMemoryData);
    if (this.options.debug) {
      this.log(`[UniCache] Synced to backend: ${this.cacheType}`);
    } 
  }

  async close() {
    if (!this.backend) {
      return; // Nothing to close
    }

    if (this.options.syncOnClose) {
      await this.sync();
    }
    await this.backend.close();
  }
}

module.exports = UniCache;
