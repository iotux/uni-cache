// src/backends/RedisBackend.js
const { createClient } = require('redis');
const CacheBackend = require('./CacheBackend');

class RedisBackend extends CacheBackend {
  constructor(config) {
    super();
    this.dbHost = config.dbHost || 'localhost';
    this.dbPort = config.dbPort || 6379;
    this.cacheName = config.cacheName;

    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {});

    this.uri = `redis://${this.dbHost}:${this.dbPort}`;
    this.client = createClient({ url: this.uri });
    this.client.on('error', (err) => console.error('Redis Client Error', err));
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
      if (this.debug) this.log(`[RedisBackend] Connected to Redis at ${this.uri}`);
    }
  }

  async save(data) {
    await this.client.set(this.cacheName, JSON.stringify(data));
    if (this.debug) this.log(`[RedisBackend] Data saved to Redis`);
  }

  async fetch() {
    const data = await this.client.get(this.cacheName);
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

  async add(key, count) {
    const current = parseInt(await this.client.get(key), 10) || 0;
    await this.client.set(key, current + count);
  }

  async subtract(key, count) {
    const current = parseInt(await this.client.get(key), 10) || 0;
    await this.client.set(key, current - count);
  }

  async push(key, element) {
    await this.client.rPush(key, JSON.stringify(element));
  }

  async retrieveObject(key) {
    const data = await this.client.get(key);
    return JSON.parse(data);
  }

  async close() {
    if (this.syncOnClose) {
      const data = await this.fetch();
      await this.save(data);
    }
    await this.client.quit();
  }
}

module.exports = RedisBackend;
