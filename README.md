# Uni-Cache

**Uni-Cache** is a versatile caching library for Node.js that supports in-memory, file-based, Redis, MongoDB, and ValKey backends. It provides flexible storage and synchronization options for key-value pairs, enabling efficient data management for a variety of applications.

---

## Table of Contents
- [Uni-Cache](#uni-cache)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Initialization](#initialization)
  - [API](#api)
    - [Public Methods](#public-methods)
  - [Examples](#examples)
    - [In-Memory Cache](#in-memory-cache)
    - [File Backend](#file-backend)
    - [Redis Backend](#redis-backend)
    - [MongoDB Backend](#mongodb-backend)
    - [ValKey Backend](#valkey-backend)
    - [SQLite Backend](#sqlite-backend)
  - [License](#license)
  - [Contributing](#contributing)

---

## Features

- **In-Memory Cache**: Fast and lightweight storage for ephemeral data.
- **File Backend**: Persistent storage using JSON files.
- **Redis Backend**: High-performance distributed caching.
- **ValKey Backend**: Compatible with Redis, offering a lightweight alternative. (Uses RedisBackend currently.)
- **MongoDB Backend**: Durable and scalable database-backed caching.
- **SQLiteBackend**: A light weight SQL database, readily available on most Linux systems
- **Flexible Synchronization**: Choose between direct, timed, or on-demand sync to storage backends.
- **Custom Logging**: Integrate with your own logging solution.

---

## Installation

Install the package using npm:

```bash
npm install @iotux/uni-cache
```

---

## Usage

### Initialization

```javascript
const Uni-Cache = require('uni-cache');

// Create an in-memory cache
const cache = new Uni-Cache('myCache', {
  cacheType: 'memory', // Options: 'memory', 'file', 'redis', 'mongodb', 'valkey'
  syncOnWrite: true,
  debug: true,
  logFunction: console.log, // Use custom logging
});
```

---

## API

### Public Methods

- **`set(key, value, sync)`**: Set a value in the cache.
  - `key`: String (supports dot notation for nested keys)
  - `value`: Any
  - `sync`: Boolean (optional, syncs to backend immediately if true)

- **`get(key)`**: Retrieve a value from the cache.
  - `key`: String (supports dot notation)

- **`delete(key, sync)`**: Delete a key from the cache.
  - `key`: String
  - `sync`: Boolean (optional)

- **`has(key)`**: Check if a key exists in the cache.
  - `key`: String

- **`clear(sync)`**: Clear all data from the cache.
  - `sync`: Boolean (optional)

- **`keys()`**: Get all keys stored in the cache.

- **`count()`**: Get the total number of keys in the cache.

- **`add(key, count, sync)`**: Increment a numeric value.
  - `key`: String
  - `count`: Number
  - `sync`: Boolean (optional)

- **`subtract(key, count, sync)`**: Decrement a numeric value.
  - `key`: String
  - `count`: Number
  - `sync`: Boolean (optional)

- **`push(key, element, sync)`**: Add an element to an array.
  - `key`: String
  - `element`: Any
  - `sync`: Boolean (optional)

- **`retrieveObject(key)`**: Retrieve a nested object.
  - `key`: String

- **`sync()`**: Synchronize in-memory cache to the backend.

- **`close()`**: Close the backend connection (if applicable).

---

## Examples

### In-Memory Cache

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'memory',
  debug: true,
});

await cache.set('user.name', 'Alice');
console.log(await cache.get('user.name')); // 'Alice'

await cache.add('user.age', 1);
console.log(await cache.get('user.age')); // 1

await cache.push('user.hobbies', 'Reading');
console.log(await cache.get('user.hobbies')); // ['Reading']
```

### File Backend

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'file',
  savePath: './cache',
  syncOnWrite: true,
});

await cache.set('config.theme', 'dark', true); // Sync to file immediately
console.log(await cache.get('config.theme')); // 'dark'
await cache.sync(); // Force sync to backend
```

### Redis Backend

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'redis',
  redisConfig: { host: '127.0.0.1', port: 6379 },
});

await cache.set('session.token', 'abc123', true);
console.log(await cache.get('session.token')); // 'abc123'
await cache.close(); // Close Redis connection
```

### MongoDB Backend

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'mongodb',
  mongoUri: 'mongodb://localhost:27017',
  dbName: 'cacheDB',
  collectionName: 'cacheCollection',
  debug: true,
});

await cache.set('settings.language', 'en', true);
console.log(await cache.get('settings.language')); // 'en'
await cache.sync(); // Sync to MongoDB backend
await cache.close(); // Close MongoDB connection
```

### ValKey Backend

The ValKey backend currently shares its implementation with RedisBackend but is ready for future changes as ValKey matures.

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'valkey',
  redisConfig: { host: '127.0.0.1', port: 6379 }, // Compatible with ValKey
  debug: true,
});

await cache.set('preferences.theme', 'light', true);
console.log(await cache.get('preferences.theme')); // 'light'
await cache.sync(); // Sync to ValKey backend
```
### SQLite Backend

```javascript
const cache = new Uni-Cache('myCache', {
  cacheType: 'sqlite',
  savePath: './data',
  syncOnWrite: true,
});

await cache.set('config.theme', 'dark', true); // Sync to file immediately
console.log(await cache.get('config.theme')); // 'dark'
await cache.sync(); // Force sync to backend
```
---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.
