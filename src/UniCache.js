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
    
    if (options.syncInterval) {
      setInterval(() => this.sync(), options.syncInterval * 1000);
    }
  }
// Dynamically load and initialize the appropriate backend
async initializeBackend() {
  if (this.cacheType === 'redis' || this.cacheType === 'valkey') {
    const RedisBackend = require('./backends/RedisBackend');
    this.backend = new RedisBackend({
      redisConfig: this.options.redisConfig,
      cacheName: this.cacheName,
      syncInterval: this.options.syncInterval,
      syncOnWrite: this.options.syncOnWrite,
      syncOnClose: this.options.syncOnClose,
      debug: this.options.debug,
      logFunction: this.log,
    });

    if (this.cacheType === 'valkey') {
      this.log('[UniCache] Using RedisBackend as the backend for ValKey.');
    }
  } else if (this.cacheType === 'file') {
    const FileBackend = require('./backends/FileBackend');
    this.backend = new FileBackend({
      savePath: this.options.savePath,
      cacheName: this.cacheName,
      syncInterval: this.options.syncInterval,
      syncOnWrite: this.options.syncOnWrite,
      syncOnClose: this.options.syncOnClose,
      debug: this.options.debug,
      logFunction: this.log,
    });
  } else if (this.cacheType === 'mongodb') {
    const MongoDBBackend = require('./backends/MongoDBBackend');
    this.backend = new MongoDBBackend({
      mongoUri: this.options.mongoUri,
      dbName: this.options.dbName,
      collectionName: this.options.collectionName,
      debug: this.options.debug,
      logFunction: this.log,
    });
  }
}



  // Public method to get a property using dot notation
  get(key) {
    return this.getProperties(this.inMemoryData, key);
  }

  // Public method to set a property using dot notation
  async set(key, value, sync = false) {
    this.setProperties(this.inMemoryData, key, value);
    if (sync || this.options.syncOnWrite) {
      await this.sync();
    }
  }

  // Private method to get nested properties using dot notation
  getProperties(obj, key) {
    const keys = key.split('.');
    let result = obj;
    for (const k of keys) {
      if (result[k] === undefined) {
        return undefined;
      }
      result = result[k];
    }
    return result;
  }

  // Private method to set nested properties using dot notation
  setProperties(obj, key, value) {
    const keys = key.split('.');
    let target = obj;
    keys.forEach((k, index) => {
      if (index === keys.length - 1) {
        target[k] = value;
      } else {
        target[k] = target[k] || {};
        target = target[k];
      }
    });
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
    if (!this.backend) {
      this.log('[UniCache] In-memory mode; no sync performed.');
      return;
    }

    await this.backend.save(this.inMemoryData);
    this.log(`[UniCache] Synced to backend: ${this.cacheType}`);
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
