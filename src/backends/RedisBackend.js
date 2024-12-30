// src/backends/RedisBackend.js
const { createClient } = require('redis');
const CacheBackend = require('./CacheBackend');

class RedisBackend extends CacheBackend {
  constructor(config) {
    super();
    this.client = createClient(config.redisConfig);
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.redisKey = config.cacheName;
    this.syncInterval = config.syncInterval || 86400; // Default 24 hours
    this.syncOnWrite = config.syncOnWrite || false;
    this.syncOnClose = config.syncOnClose || false;
    this.debug = config.debug || false;

    if (this.syncInterval) {
      setInterval(() => {
        this.save();
      }, this.syncInterval * 1000);
    }
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
