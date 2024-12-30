// src/backends/FileBackend.js
const fs = require('fs').promises;
const CacheBackend = require('./CacheBackend');

class FileBackend extends CacheBackend {
  constructor(config) {
    super();
    this.filePath = `${config.savePath}/${config.cacheName}.json`;
    this.syncInterval = config.syncInterval || 86400; // Default 24 hours
    this.syncOnWrite = config.syncOnWrite || false;
    this.syncOnClose = config.syncOnClose || false;
    this.debug = config.debug || false;

    if (this.syncInterval) {
      setInterval(() => {
        const data = this.fetch();
        this.save(data);
      }, this.syncInterval * 1000);
    }
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
        return {}; // File does not exist
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

  async add(key, count) {
    const data = await this.fetch() || {};
    data[key] = (data[key] || 0) + count;
    await this.save(data);
  }

  async subtract(key, count) {
    const data = await this.fetch() || {};
    data[key] = (data[key] || 0) - count;
    await this.save(data);
  }

  async push(key, element) {
    const data = await this.fetch() || {};
    if (!Array.isArray(data[key])) {
      data[key] = [];
    }
    data[key].push(element);
    await this.save(data);
  }

  async retrieveObject(key) {
    const data = await this.fetch();
    return data ? data[key] : null;
  }

  async close() {
    if (this.syncOnClose) {
      const data = await this.fetch();
      await this.save(data);
    }
  }
}

module.exports = FileBackend;
