const { MongoClient } = require('mongodb');
const CacheBackend = require('./CacheBackend');

class MongoDBBackend extends CacheBackend {
  constructor(config) {
    super();
    this.dbHost = config.dbHost || 'localhost';
    this.dbPort = config.dbPort || 27017;
    this.uri = `mongodb://${this.dbHost}:${this.dbPort}`;
    this.dbName = config.dbName || 'cacheDB';
    this.collectionName = config.collectionName || 'cache';
    this.debug = config.debug || false;
    this.log = config.logFunction || (() => {});

    this.client = null;
    this.collection = null;
  }

  async connect() {
    if (this.client) return;
    this.client = new MongoClient(this.uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await this.client.connect();
    this.collection = this.client.db(this.dbName).collection(this.collectionName);
    if (this.debug) this.log('[MongoDBBackend] Connected to MongoDB.');
  }

  async save(data) {
    await this.connect();
    const updates = Object.entries(data).map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { $set: { key, value, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    await this.collection.bulkWrite(updates);
    if (this.debug) this.log('[MongoDBBackend] Cache saved to MongoDB.');
  }

  async fetch() {
    await this.connect();
    const docs = await this.collection.find().toArray();
    return docs.reduce((acc, doc) => {
      acc[doc.key] = doc.value;
      return acc;
    }, {});
  }

  async delete(key) {
    await this.connect();
    await this.collection.deleteOne({ key });
    if (this.debug) this.log(`[MongoDBBackend] Key ${key} deleted.`);
  }

  async has(key) {
    await this.connect();
    const count = await this.collection.countDocuments({ key });
    return count > 0;
  }

  async clear() {
    await this.connect();
    await this.collection.deleteMany({});
    if (this.debug) this.log('[MongoDBBackend] All keys cleared.');
  }

  async keys() {
    await this.connect();
    const keys = await this.collection.find().project({ key: 1, _id: 0 }).toArray();
    return keys.map((doc) => doc.key);
  }

  async count() {
    await this.connect();
    return await this.collection.countDocuments();
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      if (this.debug) this.log('[MongoDBBackend] Connection closed.');
    }
  }
}

module.exports = MongoDBBackend;

