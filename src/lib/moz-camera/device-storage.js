'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[DeviceStorage]', ...args) : () => {};

/**
 * Exports
 */

module.exports = DeviceStorage;

function DeviceStorage(type) {
  debug('new', type);
  this.storage = navigator.getDeviceStorage(type);
}

DeviceStorage.prototype = {
  add(blob, filePath) {
    var result = {};
    return new Promise((resolve, reject) => {
        debug('add', blob, filePath);
        var req = this.storage.addNamed(blob, filePath);
        req.onerror = reject;
        req.onsuccess = e => resolve(e.target.result);
      })

      .then(absolutePath => {
        debug('added', absolutePath);
        result.absolutePath = absolutePath;
        return this.get(filePath);
      })

      .then(file => {
        result.file = file;
        return result;
      });
  },

  get(filePath) {
    debug('get', filePath);
    return this.storage.get(filePath);
  },

  delete(filePath) {
    return new Promise((resolve, reject) => {
      debug('delete', filePath);
      var req = this.storage.delete(filePath);
      req.onerror = reject;
      req.onsuccess = resolve;
    });
  },

  hasSpace(bytes) {
    return new Promise((resolve, reject) => {
      debug('has space', bytes);
      var req = this.storage.freeSpace();
      req.onerror = reject;
      req.onsuccess = () => {
        var remaining = req.result;
        debug('remaining space', remaining);
        resolve({
          ok: remaining > bytes,
          remaining: remaining
        });
      };
    });
  }
};
