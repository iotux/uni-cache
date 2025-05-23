// src/backends/SQLiteBackend.js
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs').promises;
const { Mutex } = require('async-mutex'); // Import the Mutex
const CacheBackend = require('./CacheBackend');

class SQLiteBackend extends CacheBackend {
  constructor(config) {
    super();
    this.cacheName = config.cacheName;
    this.savePath = config.savePath || './data';
    this.dbFilePath = path.join(this.savePath, `${this.cacheName}.sqlite`);
    this.tableName = 'cache_data';

    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {});
    this.db = null;

    this.mutex = new Mutex(); // Create a Mutex instance for serializing transactions
  }

  // _stringifyValue, _parseValue, _ensureDirectoryExists remain the same
  _stringifyValue(value) {
    if (value === undefined) return JSON.stringify(null);
    return JSON.stringify(value);
  }

  _parseValue(value) {
    if (value === null || value === undefined) return undefined;
    try {
      return JSON.parse(value);
    } catch (e) {
      this.log(`[SQLiteBackend][${this.cacheName}] _parseValue: Failed to parse JSON for: "${value ? value.substring(0, 50) : value}"`);
      return value;
    }
  }

  async _ensureDirectoryExists() {
    try {
      await fs.access(this.savePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.log(`[SQLiteBackend][${this.cacheName}] Directory ${this.savePath} does not exist. Creating...`);
        await fs.mkdir(this.savePath, { recursive: true });
        this.log(`[SQLiteBackend][${this.cacheName}] Directory created: ${this.savePath}`);
      } else {
        this.log(`[SQLiteBackend][${this.cacheName}] Error accessing directory ${this.savePath}: ${error.message}`);
        throw error;
      }
    }
  }

  async connect() {
    // Connection logic needs to be careful if called concurrently by operations waiting on the mutex
    // The mutex should ideally be acquired *before* calling connect if connect itself isn't idempotent
    // or if opening the DB is part of the transactional work.
    // For simplicity, we'll let connect be called, and it's idempotent.
    // The actual DB operations inside the transaction will be serialized by the mutex.

    if (this.db) {
      // this.log(`[SQLiteBackend][${this.cacheName}] Already connected to SQLite: ${this.dbFilePath}`);
      return;
    }
    // Ensure only one connect attempt happens if multiple ops trigger it nearly simultaneously
    // This specific connect lock is for the this.db assignment.
    const connectRelease = await this.mutex.acquire();
    try {
      if (this.db) {
        // Double check after acquiring lock
        this.log(`[SQLiteBackend][${this.cacheName}] Already connected (checked after lock).`);
        return;
      }
      await this._ensureDirectoryExists();
      this.db = await sqlite.open({
        filename: this.dbFilePath,
        driver: sqlite3.Database,
      });
      await this.db.run('PRAGMA journal_mode = WAL;');
      await this.db.run(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
            key TEXT PRIMARY KEY,
            value TEXT,
            updatedAt DATETIME
            )
        `);
      this.log(`[SQLiteBackend][${this.cacheName}] Connected to SQLite: ${this.dbFilePath}. Table "${this.tableName}" ensured.`);
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Failed to connect/setup SQLite DB at ${this.dbFilePath}: ${err.message}`);
      if (this.debug) console.error(`[SQLiteBackend][${this.cacheName}] Connection Error:`, err);
      this.db = null; // Ensure db is null on failure
      throw err;
    } finally {
      connectRelease();
    }
  }

  // Helper to run operations within a transaction, serialized by the mutex
  async _withTransaction(operation) {
    const release = await this.mutex.acquire();
    this.log(`[SQLiteBackend][${this.cacheName}] Mutex acquired for transaction.`);
    try {
      await this.connect(); // Ensure DB is connected
      if (!this.db) throw new Error('SQLite database is not connected.');

      await this.db.exec('BEGIN IMMEDIATE TRANSACTION');
      this.log(`[SQLiteBackend][${this.cacheName}] Transaction started.`);
      const result = await operation(this.db); // Pass the db connection to the operation
      await this.db.exec('COMMIT');
      this.log(`[SQLiteBackend][${this.cacheName}] Transaction committed.`);
      return result;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Transaction error: ${err.message}. Attempting rollback.`);
      if (this.db) {
        // Only attempt rollback if db object exists
        try {
          await this.db.exec('ROLLBACK');
          this.log(`[SQLiteBackend][${this.cacheName}] Transaction rolled back.`);
        } catch (rbErr) {
          this.log(`[SQLiteBackend][${this.cacheName}] CRITICAL: Rollback failed: ${rbErr.message}`);
          // This state is problematic; the connection might be broken.
        }
      }
      throw err; // Re-throw original error
    } finally {
      release();
      this.log(`[SQLiteBackend][${this.cacheName}] Mutex released.`);
    }
  }

  async save(data) {
    return this._withTransaction(async (db) => {
      const dataToSave = data || {};
      const entries = Object.entries(dataToSave);
      this.log(`[SQLiteBackend][${this.cacheName}] save() transaction active. Saving ${entries.length} entries. Keys: ${Object.keys(dataToSave).join(', ')}`);

      const deleteResult = await db.run(`DELETE FROM ${this.tableName}`);
      this.log(`[SQLiteBackend][${this.cacheName}] Cleared existing data. Rows deleted: ${deleteResult.changes}`);

      if (entries.length > 0) {
        const stmt = await db.prepare(`INSERT INTO ${this.tableName} (key, value, updatedAt) VALUES (?, ?, datetime('now'))`);
        for (const [key, value] of entries) {
          await stmt.run(key, this._stringifyValue(value));
        }
        await stmt.finalize();
        this.log(`[SQLiteBackend][${this.cacheName}] Inserted ${entries.length} new rows.`);
      } else {
        this.log(`[SQLiteBackend][${this.cacheName}] Provided data object was empty, table is now empty.`);
      }
      this.log(`[SQLiteBackend][${this.cacheName}] Save transaction complete. Final table state reflects ${entries.length} items.`);
    });
  }

  async _atomicUpdate(key, updateCallback) {
    return this._withTransaction(async (db) => {
      this.log(`[SQLiteBackend][${this.cacheName}] _atomicUpdate() transaction active for key "${key}".`);
      const row = await db.get(`SELECT value FROM ${this.tableName} WHERE key = ?`, key);
      const currentValue = row ? this._parseValue(row.value) : undefined;
      const newValue = updateCallback(currentValue);
      await db.run(`INSERT OR REPLACE INTO ${this.tableName} (key, value, updatedAt) VALUES (?, ?, datetime('now'))`, key, this._stringifyValue(newValue));
      this.log(`[SQLiteBackend][${this.cacheName}] Atomic update for key "${key}" successful.`);
      return newValue;
    });
  }

  // fetch, delete, has, clear, keys, count, retrieveObject do not start their own transactions,
  // so they don't strictly need the _withTransaction wrapper unless you want all DB access serialized.
  // The sqlite driver itself serializes individual commands. For read operations or single command writes,
  // direct calls are usually fine. The mutex is critical for multi-statement transactions.
  // We will call connect at the beginning of these methods.

  async fetch() {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for fetch.');
    // ... (rest of fetch logic, using this.db directly)
    try {
      const rows = await this.db.all(`SELECT key, value FROM ${this.tableName}`);
      const cacheData = rows.reduce((acc, row) => {
        acc[row.key] = this._parseValue(row.value);
        return acc;
      }, {});
      this.log(`[SQLiteBackend][${this.cacheName}] Fetched ${rows.length} rows from SQLite.`);
      return cacheData;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error fetching data from SQLite: ${err.message}`);
      throw err;
    }
  }

  async delete(key) {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for delete.');
    // ... (rest of delete logic)
    try {
      const result = await this.db.run(`DELETE FROM ${this.tableName} WHERE key = ?`, key);
      this.log(`[SQLiteBackend][${this.cacheName}] Delete operation for key "${key}". Changes: ${result.changes}`);
      return result.changes > 0;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error deleting key "${key}" from SQLite: ${err.message}`);
      throw err;
    }
  }

  async has(key) {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for has.');
    // ... (rest of has logic)
    try {
      const row = await this.db.get(`SELECT 1 FROM ${this.tableName} WHERE key = ? LIMIT 1`, key);
      const exists = !!row;
      this.log(`[SQLiteBackend][${this.cacheName}] Has check for key "${key}". Found: ${exists}`);
      return exists;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error checking key "${key}" in SQLite: ${err.message}`);
      throw err;
    }
  }

  async clear() {
    // clear is a write operation that benefits from the transaction wrapper for consistency
    return this._withTransaction(async (db) => {
      this.log(`[SQLiteBackend][${this.cacheName}] clear() transaction active.`);
      const result = await db.run(`DELETE FROM ${this.tableName}`);
      this.log(`[SQLiteBackend][${this.cacheName}] All rows cleared from table. Changes: ${result.changes}`);
    });
  }

  async keys() {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for keys.');
    // ... (rest of keys logic)
    try {
      const rows = await this.db.all(`SELECT key FROM ${this.tableName}`);
      const keyList = rows.map((row) => row.key);
      this.log(`[SQLiteBackend][${this.cacheName}] Retrieved ${keyList.length} keys.`);
      return keyList;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error retrieving keys from SQLite: ${err.message}`);
      throw err;
    }
  }

  async count() {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for count.');
    // ... (rest of count logic)
    try {
      const row = await this.db.get(`SELECT COUNT(*) as count FROM ${this.tableName}`);
      const numRows = row ? row.count : 0;
      this.log(`[SQLiteBackend][${this.cacheName}] Table contains ${numRows} rows.`);
      return numRows;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error counting rows in SQLite: ${err.message}`);
      throw err;
    }
  }

  async retrieveObject(key) {
    await this.connect();
    if (!this.db) throw new Error('SQLite database is not connected for retrieveObject.');
    // ... (rest of retrieveObject logic)
    try {
      const row = await this.db.get(`SELECT value FROM ${this.tableName} WHERE key = ?`, key);
      this.log(`[SQLiteBackend][${this.cacheName}] retrieveObject for key "${key}". Row ${row ? 'found' : 'not found'}.`);
      return row ? this._parseValue(row.value) : undefined;
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error retrieving object for key "${key}" from SQLite: ${err.message}`);
      throw err;
    }
  }

  // add, subtract, push will call _atomicUpdate, which is now wrapped by _withTransaction
  async add(key, count) {
    const numericCount = parseInt(count, 10);
    if (isNaN(numericCount)) {
      const errMsg = `[SQLiteBackend][${this.cacheName}] Add: Count for key "${key}" is not an integer: ${count}`;
      this.log(errMsg);
      throw new Error(errMsg);
    }
    await this._atomicUpdate(key, (currentValue) => {
      const numCurrent = typeof currentValue === 'number' && isFinite(currentValue) ? currentValue : 0;
      return numCurrent + numericCount;
    });
    this.log(`[SQLiteBackend][${this.cacheName}] Add operation for key "${key}" (incremented by ${numericCount}) has completed.`);
  }

  async subtract(key, count) {
    const numericCount = parseInt(count, 10);
    if (isNaN(numericCount)) {
      const errMsg = `[SQLiteBackend][${this.cacheName}] Subtract: Count for key "${key}" is not an integer: ${count}`;
      this.log(errMsg);
      throw new Error(errMsg);
    }
    await this._atomicUpdate(key, (currentValue) => {
      const numCurrent = typeof currentValue === 'number' && isFinite(currentValue) ? currentValue : 0;
      return numCurrent - numericCount;
    });
    this.log(`[SQLiteBackend][${this.cacheName}] Subtract operation for key "${key}" (decremented by ${numericCount}) has completed.`);
  }

  async push(key, element) {
    await this._atomicUpdate(key, (currentValue) => {
      const arr = Array.isArray(currentValue) ? currentValue : [];
      arr.push(element);
      return arr;
    });
    this.log(`[SQLiteBackend][${this.cacheName}] Push operation for array at key "${key}" has completed.`);
  }

  async close() {
    // Ensure any pending transaction operations complete before closing
    const release = await this.mutex.acquire(); // Acquire mutex to ensure no transaction is ongoing
    try {
      if (this.db) {
        this.log(`[SQLiteBackend][${this.cacheName}] Attempting to close SQLite connection: ${this.dbFilePath}`);
        await this.db.close();
        this.db = null;
        this.log(`[SQLiteBackend][${this.cacheName}] SQLite connection closed.`);
      } else {
        this.log(`[SQLiteBackend][${this.cacheName}] SQLite connection already closed or never opened.`);
      }
    } catch (err) {
      this.log(`[SQLiteBackend][${this.cacheName}] Error closing SQLite connection: ${err.message}`);
      throw err;
    } finally {
      release();
    }
  }
}

module.exports = SQLiteBackend;
