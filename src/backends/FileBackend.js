// src/backends/FileBackend.js
const fs = require('fs').promises;
const path = require('path');
const CacheBackend = require('./CacheBackend');

class FileBackend extends CacheBackend {
  // ... constructor, _ensureDirectoryExists, connect, _loadData, _saveData ...
  // (These remain the same as in the previous accepted answer)
  constructor(config) {
    super();
    this.cacheName = config.cacheName;
    this.savePath = config.savePath || './data';
    this.filePath = path.join(this.savePath, `${this.cacheName}.json`);
    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {});
  }

  async _ensureDirectoryExists() {
    try {
      await fs.access(this.savePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        if (this.debug) this.log(`[FileBackend] Directory ${this.savePath} does not exist. Creating...`);
        await fs.mkdir(this.savePath, { recursive: true });
        if (this.debug) this.log(`[FileBackend] Directory created: ${this.savePath}`);
      } else {
        this.log(`[FileBackend] Error accessing directory ${this.savePath}:`, error.message);
        throw error;
      }
    }
  }

  async connect() {
    await this._ensureDirectoryExists();
    if (this.debug) {
      this.log(`[FileBackend] Initialized for ${this.cacheName} at ${this.filePath}`);
    }
  }

  async _loadData() {
    try {
      const jsonData = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(jsonData);
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (this.debug) this.log(`[FileBackend] Cache file ${this.filePath} not found. Returning empty object.`);
        return {};
      } else if (err instanceof SyntaxError) {
        this.log(`[FileBackend] Error parsing JSON from ${this.filePath}: ${err.message}. Returning empty object.`);
        return {};
      }
      this.log(`[FileBackend] Error reading cache file ${this.filePath}: ${err.message}`);
      throw err;
    }
  }

  async _saveData(data) {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      if (this.debug) this.log(`[FileBackend] Data saved to ${this.filePath}`);
    } catch (err) {
      this.log(`[FileBackend] Error writing cache file ${this.filePath}: ${err.message}`);
      throw err;
    }
  }

  async save(data) {
    await this._saveData(data);
  }

  async fetch() {
    return await this._loadData();
  }

  async delete(key) {
    const data = await this._loadData();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
      await this._saveData(data);
      if (this.debug) this.log(`[FileBackend] Key "${key}" deleted from ${this.filePath}`);
      return true;
    }
    if (this.debug) this.log(`[FileBackend] Key "${key}" not found in ${this.filePath}. No deletion.`);
    return false;
  }

  async has(key) {
    const data = await this._loadData();
    return Object.prototype.hasOwnProperty.call(data, key);
  }

  async clear() {
    await this._saveData({});
    if (this.debug) this.log(`[FileBackend] Cache ${this.filePath} cleared (saved as {}).`);
  }

  async keys() {
    const data = await this._loadData();
    return Object.keys(data);
  }

  async count() {
    const data = await this._loadData();
    return Object.keys(data).length;
  }

  async add(key, count) {
    const data = await this._loadData();
    data[key] = (Number(data[key]) || 0) + Number(count);
    await this._saveData(data);
  }

  async subtract(key, count) {
    const data = await this._loadData();
    data[key] = (Number(data[key]) || 0) - Number(count);
    await this._saveData(data);
  }

  async push(key, element) {
    const data = await this._loadData();
    if (!Array.isArray(data[key])) {
      data[key] = [];
    }
    data[key].push(element);
    await this._saveData(data);
  }

  async retrieveObject(key) {
    const data = await this._loadData();
    return data[key];
  }

  async close() {
    if (this.debug) this.log(`[FileBackend] Close called for ${this.cacheName}. No action needed.`);
  }
}

module.exports = FileBackend;
