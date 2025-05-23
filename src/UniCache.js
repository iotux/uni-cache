// src/UniCache.js

/**
 * Get properties from an object using a key string with dot notation.
 * @param {object} obj - The object containing the properties.
 * @param {string|string[]} key - The key string in dot notation or an array of properties.
 * @returns {*} The value at the specified key or undefined.
 */
const getProperties = (obj, key) => {
  const props = Array.isArray(key) ? key : key.split('.');
  let current = obj;
  for (const prop of props) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, prop)) return undefined;
    current = current[prop];
  }
  return current;
};

/**
 * Set properties on an object using a key string with dot notation.
 * Creates intermediate objects if they don't exist.
 * @param {object} obj - The object to set the properties on.
 * @param {string|string[]} key - The key string in dot notation or an array of properties.
 * @param {*} val - The value to set at the specified key.
 */
const setProperties = (obj, key, val) => {
  const props = Array.isArray(key) ? key : key.split('.');
  let target = obj;
  for (let i = 0; i < props.length - 1; ++i) {
    const prop = props[i];
    if (target[prop] === undefined || target[prop] === null || typeof target[prop] !== 'object') {
      target[prop] = {};
    }
    target = target[prop];
  }
  if (props.length > 0) {
    target[props[props.length - 1]] = val;
  }
};

class UniCache {
  constructor(cacheName, options = {}) {
    // ... (constructor logic, including revised this.log setup from previous responses)
    if (!cacheName || typeof cacheName !== 'string') {
      throw new Error('UniCache constructor requires a valid cacheName string.');
    }
    this.cacheName = cacheName;
    this.options = options;
    this.cacheType = options.cacheType || 'memory';
    this.inMemoryData = {};
    this.backend = null;
    this.isDirty = false; // Initialize dirty flag

    if (options.logFunction) {
      this.log = (...args) => options.logFunction('[UniCache]', ...args);
    } else {
      this.log = this.options.debug ? (...args) => console.log('[UniCache]', ...args) : () => {};
    }

    this.log(`Initializing cache "${cacheName}" with type "${this.cacheType}"`);

    const syncIntervalSeconds = this.options.syncInterval || 86400;
    this.syncIntervalId = setInterval(() => this.sync(), syncIntervalSeconds * 1000);
    this.log(`Sync interval set to: ${syncIntervalSeconds} seconds`);

    if (this.options.syncOnBreak) {
      this.setupSignalHandlers(); // Ensure this uses the version that exits correctly
    }
  }

  async init() {
    this.log(`Starting initialization for "${this.cacheName}"...`);
    await this.initializeBackend(); // This calls _loadInitialDataFromBackend internally
    this.log(`Initialization complete for "${this.cacheName}".`);
  }

  async initializeBackend() {
    this.log(`Entering initializeBackend. Current cacheType: "${this.cacheType}"`);

    if (this.cacheType === 'memory') {
      this.isDirty = false;
      this.log('[UniCache] Using in-memory cache only.');
      this.backend = null;
      return;
    }

    try {
      this.log(`Attempting to setup backend for cacheType: "${this.cacheType}".`);
      let BackendConstructor; // To hold the required constructor

      switch (this.cacheType) {
        case 'file':
          this.log('Backend type selected: file. Attempting to require FileBackend...');
          // The require call is specific to this case
          BackendConstructor = require('./backends/FileBackend');
          this.log('FileBackend required. Instantiating...');
          this.backend = new BackendConstructor({
            cacheName: this.cacheName,
            savePath: this.options.savePath,
            debug: this.options.debug,
            logFunction: this.log,
          });
          this.log('[UniCache] Using FileBackend.');
          break;

        case 'redis':
        case 'valkey':
          this.log(`Backend type selected: ${this.cacheType} (using RedisBackend). Attempting to require RedisBackend...`);
          // The require call is specific to this case
          BackendConstructor = require('./backends/RedisBackend');
          this.log('RedisBackend required. Instantiating...');
          this.backend = new BackendConstructor({
            // ... redis config ...
          });
          this.log(`[UniCache] Using RedisBackend (for ${this.cacheType}).`);
          break;

        case 'mongodb':
          this.log('Backend type selected: mongodb. Attempting to require MongoDBBackend...');
          BackendConstructor = require('./backends/MongoDBBackend');
          this.log('MongoDBBackend required. Instantiating...');
          this.backend = new BackendConstructor({
            collectionName: this.cacheName,
            dbName: this.options.dbName,
            dbHost: this.options.dbHost,
            dbPort: this.options.dbPort,
            debug: this.options.debug,
            logFunction: this.log,
          });
          this.log('[UniCache] Using MongoDBBackend.');
          break;

        case 'sqlite':
          this.log('Backend type selected: sqlite. Attempting to require SQLiteBackend...');
          BackendConstructor = require('./backends/SQLiteBackend');
          this.log('SQLiteBackend required. Instantiating...');
          this.backend = new BackendConstructor({
            cacheName: this.cacheName,
            savePath: this.options.savePath,
            debug: this.options.debug,
            logFunction: this.log,
          });
          this.log('[UniCache] Using SQLiteBackend.');
          break;

        default:
          this.log(`cacheType "${this.cacheType}" is unknown or not explicitly handled.`);
          this.log(`[UniCache] Unknown cacheType: "${this.cacheType}". Operating in memory-only mode.`);
          this.cacheType = 'memory';
          this.backend = null;
          this.isDirty = false;
          return; // Exit initializeBackend
      }

      this.log(`Backend instantiation for type "${this.options.cacheType}" finished. this.backend is ${this.backend ? 'set' : 'null'}.`);

      if (this.backend) {
        // If backend was successfully created
        if (typeof this.backend.connect === 'function') {
          this.log(`Attempting to connect to ${this.cacheType} backend...`);
          await this.backend.connect();
          this.log(`Backend ${this.cacheType} connected successfully.`);
        } else {
          this.log(`Backend ${this.cacheType} does not have a connect method (or this.backend is null).`);
        }

        this.log('Backend is set. Calling _loadInitialDataFromBackend...');
        const loaded = await this._loadInitialDataFromBackend(); // Sets inMemoryData and isDirty
        if (loaded) {
          this.log(`_loadInitialDataFromBackend: Cache "${this.cacheName}" data loaded. isDirty: ${this.isDirty}`);
        } else {
          this.log(`_loadInitialDataFromBackend: Cache "${this.cacheName}" fresh/empty. isDirty: ${this.isDirty}`);
        }
      } else if (this.cacheType !== 'memory') {
        // This condition implies a known cacheType was matched in the switch,
        // but this.backend somehow didn't get assigned (e.g., require failed silently, constructor didn't assign)
        // AND it didn't throw an error into the main catch block. This is highly defensive.
        this.log(`CRITICAL: After known backend type selection ("${this.options.cacheType}"), this.backend is unexpectedly NULL and no error was caught during instantiation. Falling back to memory-only.`);
        this.cacheType = 'memory';
        this.backend = null;
        this.isDirty = false;
      }
    } catch (error) {
      // Prominent error logging
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error(`[UniCache] CRITICAL ERROR IN initializeBackend for cache "${this.cacheName}", original type "${this.options.cacheType}":`, error);
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

      this.log(`[UniCache] Error initializing backend (original type "${this.options.cacheType}") for cache "${this.cacheName}": ${error.message}. Falling back to memory-only mode.`);
      this.backend = null;
      this.cacheType = 'memory';
      this.isDirty = false;
    }
    this.log(`Exiting initializeBackend. Final this.backend is: ${this.backend ? 'set (object)' : 'null'}, Final this.cacheType is: "${this.cacheType}"`);
  }

  async _loadInitialDataFromBackend() {
    if (!this.backend) {
      this.inMemoryData = {}; // Should already be {}
      this.isDirty = false;
      return false;
    }
    try {
      this.log(`Workspaceing initial data for "${this.cacheName}" from backend.`);
      const data = await this.backend.fetch();
      if (data && Object.keys(data).length > 0) {
        this.inMemoryData = data;
        this.isDirty = false; // Data loaded from backend, consistent state
        return true;
      }
      this.inMemoryData = {}; // Ensure it's empty if backend is empty
      this.isDirty = false; // Empty in-memory matches empty backend, so not dirty
      return false;
    } catch (error) {
      this.log(`Error fetching initial data from backend for "${this.cacheName}": ${error.message}`);
      if (this.options.debug) console.error(error);
      this.inMemoryData = {}; // On error, start with empty in-memory
      this.isDirty = false; // Not dirty relative to this (failed) load attempt, considered fresh/empty
      return false;
    }
  }

  // Signal handler (ensure you're using the version that exits correctly)
  setupSignalHandlers() {
    // ... (Use the version from the previous response that correctly saves AND exits)
    const handlerAttachedSymbol = Symbol.for(`uniCache_${this.cacheName}_SIGINT_HandlerAttached`);
    if (process[handlerAttachedSymbol]) {
      this.log(`Signal handlers for cache "${this.cacheName}" already attached by another instance or run.`);
      return;
    }
    const gracefulShutdown = async (signal) => {
      console.log(`\n[UniCache] Received ${signal} for cache "${this.cacheName}", initiating graceful shutdown...`);
      process[handlerAttachedSymbol] = true;
      clearInterval(this.syncIntervalId);
      let exitCode = 0;
      if (this.options.syncOnBreak) {
        try {
          this.log(`Attempting to sync cache "${this.cacheName}" before exit due to ${signal}...`);
          await this.sync();
          this.log(`Cache "${this.cacheName}" sync attempt completed successfully.`);
        } catch (error) {
          console.error(`[UniCache] Error syncing cache "${this.cacheName}" during shutdown:`, error);
          exitCode = 1;
        }
      } else {
        this.log(`syncOnBreak is false for "${this.cacheName}", no sync will be performed on ${signal}.`);
      }
      console.log(`[UniCache] Graceful shutdown sync processed for cache "${this.cacheName}". Exiting with code ${exitCode}.`);
      setTimeout(() => {
        process.exit(exitCode);
      }, 100);
    };
    const signalListener = (signalType) => {
      if (process[`uniCache_${this.cacheName}_ShutdownInProgress`]) {
        console.log(`[UniCache] Shutdown for "${this.cacheName}" already in progress. Ignoring additional ${signalType}.`);
        return;
      }
      process[`uniCache_${this.cacheName}_ShutdownInProgress`] = true;
      gracefulShutdown(signalType).catch((internalError) => {
        console.error(`[UniCache] CRITICAL UNHANDLED ERROR in gracefulShutdown itself for ${signalType}:`, internalError);
        if (!process.exitCode) {
          process.exit(2);
        }
      });
    };
    process.on('SIGINT', () => signalListener('SIGINT'));
    process.on('SIGTERM', () => signalListener('SIGTERM'));
    process[handlerAttachedSymbol] = true;
    this.log('Signal handlers (SIGINT, SIGTERM) set up.');
  }

  /**
   * Checks if the in-memory cache currently contains any data (i.e., is not empty).
   * This method is typically called after `this.init()` has populated the in-memory cache.
   * @returns {Promise<boolean>} True if in-memory data exists (cache has one or more keys), false otherwise.
   */
  async existsObject() {
    // `this.inMemoryData` is populated by `init()`
    const hasData = this.inMemoryData && Object.keys(this.inMemoryData).length > 0;
    this.log(`existsObject (in-memory check): Cache "${this.cacheName}" ${hasData ? 'contains data' : 'is empty'}. In-memory keys: ${Object.keys(this.inMemoryData).length}`);
    return hasData;
  }

  /**
   * Checks if the in-memory cache currently contains any data.
   * @returns {boolean} True if the cache is empty, false otherwise.
   */
  isEmpty() {
    return Object.keys(this.inMemoryData).length === 0;
  }

  // ... (get, set, save, fetch, delete, has, clear, keys, count, add, subtract, push, retrieveObject, sync, close methods remain the same, using this.isDirty)
  // Ensure their JSDoc is clear. For example, count() is async.
  // If a synchronous count is desired for in-memory:
  /**
   * Gets the number of top-level keys in the in-memory cache. (Synchronous)
   * @returns {number}
   */
  getInMemorySize() {
    return Object.keys(this.inMemoryData).length;
  }

  async get(key) {
    return getProperties(this.inMemoryData, key);
  }

  async set(key, value, syncNow = this.options.syncOnWrite) {
    setProperties(this.inMemoryData, key, value);
    this.isDirty = true; // Mark as dirty
    if (syncNow) {
      await this.sync(); // sync() will check isDirty
    }
  }

  async save(data, syncNow = this.options.syncOnWrite) {
    Object.assign(this.inMemoryData, data);
    this.isDirty = true; // Mark as dirty
    if (syncNow) {
      await this.sync();
    }
  }

  async fetch() {
    return { ...this.inMemoryData };
  }

  async delete(key, syncNow = this.options.syncOnWrite) {
    // ... (delete logic from your last provided version)
    const props = Array.isArray(key) ? key : key.split('.');
    let current = this.inMemoryData;
    let parent = null;
    let lastProp = null;

    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, prop)) {
        this.log(`Key path not found for deletion: ${key}`);
        return; // Key not found, nothing to delete or mark dirty
      }
      if (i === props.length - 1) {
        parent = current;
        lastProp = prop;
      } else {
        current = current[prop];
      }
    }

    if (parent && lastProp) {
      delete parent[lastProp];
      this.isDirty = true; // Mark as dirty
      if (syncNow) {
        await this.sync();
      }
    }
  }

  async has(key) {
    return getProperties(this.inMemoryData, key) !== undefined;
  }

  async clear(syncNow = this.options.syncOnWrite) {
    if (Object.keys(this.inMemoryData).length > 0) {
      this.isDirty = true; // Mark as dirty only if it wasn't already empty
    }
    this.inMemoryData = {};
    // If backend might not be empty, clearing in-memory makes it dirty relative to backend.
    // So, always consider a clear operation as making it dirty if sync is intended.
    if (Object.keys(this.inMemoryData).length === 0 && !this.isDirty) {
      // Check if it was already clean and empty
      // If you want to ensure sync for clear even if it was empty, always set dirty.
      // For now, if it was already empty and clean, clearing it again doesn't make it "more" dirty.
      // This might need refinement based on exact desired behavior.
      // Let's simplify: if a clear is performed, it should be synced.
    }
    this.isDirty = true; // A clear operation means the state (empty) should be persisted.

    if (syncNow) {
      await this.sync();
    } else if (this.isDirty) {
      // Log if not syncing now but it is dirty
      this.log(`Cache "${this.cacheName}" cleared in memory and marked as dirty.`);
    }
  }

  async keys() {
    return Object.keys(this.inMemoryData);
  }

  /**
   * Gets the number of top-level keys in the in-memory cache.
   * @returns {Promise<number>}
   */
  async count() {
    return Object.keys(this.inMemoryData).length;
  }

  async add(key, count, syncNow = this.options.syncOnWrite) {
    const currentValue = Number(getProperties(this.inMemoryData, key)) || 0;
    setProperties(this.inMemoryData, key, currentValue + Number(count));
    this.isDirty = true; // Mark as dirty
    if (syncNow) {
      await this.sync();
    }
  }

  async subtract(key, count, syncNow = this.options.syncOnWrite) {
    const currentValue = Number(getProperties(this.inMemoryData, key)) || 0;
    setProperties(this.inMemoryData, key, currentValue - Number(count));
    this.isDirty = true; // Mark as dirty
    if (syncNow) {
      await this.sync();
    }
  }

  async push(key, element, syncNow = this.options.syncOnWrite) {
    let arr = getProperties(this.inMemoryData, key);
    if (!Array.isArray(arr)) {
      arr = [];
      setProperties(this.inMemoryData, key, arr); // This setProperties call will also mark dirty if it creates path
    }
    arr.push(element);
    this.isDirty = true; // Mark as dirty
    if (syncNow) {
      await this.sync();
    }
  }

  async retrieveObject(key) {
    return this.get(key);
  }

  /**
   * Synchronize in-memory cache to backend.
   * Only performs sync if data is marked as dirty or if forceSync is true.
   * @param {boolean} [forceSync=false] - If true, sync will be performed even if not marked dirty.
   */
  async sync(forceSync = false) {
    if (!this.backend) {
      this.log(`In-memory mode for "${this.cacheName}"; no sync performed.`);
      return;
    }
    if (!this.isDirty && !forceSync) {
      this.log(`No changes (isDirty=false) in "${this.cacheName}" to sync to backend. Skipping.`);
      return;
    }
    try {
      this.log(`Syncing "${this.cacheName}" (isDirty=${this.isDirty}, forceSync=${forceSync}) to backend: ${this.cacheType}`);
      await this.backend.save({ ...this.inMemoryData }); // Save a shallow copy
      this.isDirty = false; // Reset dirty flag *after* successful save
      this.log(`Synced "${this.cacheName}" to backend. Dirty flag reset.`);
    } catch (error) {
      this.log(`Error syncing "${this.cacheName}" to backend: ${error.message}. Dirty flag remains true.`);
      // Do not reset isDirty on error, as data is still out of sync.
      if (this.options.debug) console.error(error);
      throw error; // Rethrow to allow caller to handle sync errors
    }
  }

  async close() {
    // ... (same as before, ensures syncOnClose uses the dirty flag aware sync)
    this.log(`Closing cache "${this.cacheName}"...`);
    clearInterval(this.syncIntervalId);

    if (this.options.syncOnClose && this.backend) {
      this.log(`Performing final sync for "${this.cacheName}" on close (if dirty)...`);
      await this.sync(); // Will respect dirty flag unless syncOnClose implies force
    }

    if (this.backend && typeof this.backend.close === 'function') {
      try {
        this.log(`Closing backend for "${this.cacheName}"...`);
        await this.backend.close();
        this.log(`Backend for "${this.cacheName}" closed.`);
      } catch (error) {
        this.log(`Error closing backend for "${this.cacheName}": ${error.message}`);
        if (this.options.debug) console.error(error);
      }
    }
    this.log(`Cache "${this.cacheName}" closed.`);
  }
}

module.exports = UniCache;
