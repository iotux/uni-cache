// src/backends/FileBackend.js
const fs = require('fs').promises;
const CacheBackend = require('./CacheBackend');

class FileBackend extends CacheBackend {
  constructor(config) {
    super();
    this.filePath = `${config.savePath}/${config.cacheName}.json`;
    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {});
    this.ensureDirectoryExists(config.savePath || './data');
    if (this.debug) {
      this.log(`[UniCache] Using FileBackend for ${config.cacheName}`);
    }
  }

  async ensureDirectoryExists(dir) {
    try {
      await fs.access(dir);
      //if (this.debug) this.log(`[FileBackend] Directory already exists: ${dir}`);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      if (this.debug) this.log(`[FileBackend] Directory created: ${dir}`);
    }
  }

  async existsObject(key) {
    //const fileName = path.join(path.dirname(this.filePath), `${key}.json`);
    const fileName = `${this.savePath}/${key}.json`;
    this.log('FileBackend existsObject', fileName);
    try {
      await fs.access(fileName);
      if (this.debug) this.log(`[FileBackend] File exists: ${fileName}`);
      return true;
    } catch {
      if (this.debug) this.log(`[FileBackend] File does not exist: ${fileName}`);
      return false;
    }
  }

  async save(data) {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    if (this.debug) this.log(`[FileBackend] Data saved to ${this.filePath}`);
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
