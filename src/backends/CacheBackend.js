// src/backends/CacheBackend.js
class CacheBackend {
  /**
   * Save data to the cache.
   * @param {Object} data - Data to save.
   * @throws {Error} If not implemented.
   */
  async save(data) {
    throw new Error('save() not implemented.');
  }

  /**
   * Fetch data from the cache.
   * @returns {Promise<Object>} The cached data.
   * @throws {Error} If not implemented.
   */
  async fetch() {
    throw new Error('fetch() not implemented.');
  }

  /**
   * Delete a specific key from the cache.
   * @param {string} key - The key to delete.
   * @throws {Error} If not implemented.
   */
  async delete(key) {
    throw new Error('delete() not implemented.');
  }

  /**
   * Check if a key exists in the cache.
   * @param {string} key - The key to check.
   * @returns {Promise<boolean>} True if the key exists, otherwise false.
   * @throws {Error} If not implemented.
   */
  async has(key) {
    throw new Error('has() not implemented.');
  }

  /**
   * Clear all data from the cache.
   * @throws {Error} If not implemented.
   */
  async clear() {
    throw new Error('clear() not implemented.');
  }

  /**
   * Get all keys stored in the cache.
   * @returns {Promise<string[]>} Array of keys.
   * @throws {Error} If not implemented.
   */
  async keys() {
    throw new Error('keys() not implemented.');
  }

  /**
   * Get the count of items in the cache.
   * @returns {Promise<number>} The number of items.
   * @throws {Error} If not implemented.
   */
  async count() {
    throw new Error('count() not implemented.');
  }

  /**
   * Increment a value by a given count.
   * @param {string} key - The key to increment.
   * @param {number} count - The amount to increment by.
   * @throws {Error} If not implemented.
   */
  async add(key, count) {
    throw new Error('add() not implemented.');
  }

  /**
   * Decrement a value by a given count.
   * @param {string} key - The key to decrement.
   * @param {number} count - The amount to decrement by.
   * @throws {Error} If not implemented.
   */
  async subtract(key, count) {
    throw new Error('subtract() not implemented.');
  }

  /**
   * Push a new element into an array at a given key.
   * @param {string} key - The key to push the element into.
   * @param {*} element - The element to push.
   * @throws {Error} If not implemented.
   */
  async push(key, element) {
    throw new Error('push() not implemented.');
  }

  /**
   * Retrieve an object by key.
   * @param {string} key - The key of the object to retrieve.
   * @returns {Promise<Object>} The retrieved object.
   * @throws {Error} If not implemented.
   */
  async retrieveObject(key) {
    throw new Error('retrieveObject() not implemented.');
  }
}

module.exports = CacheBackend;
