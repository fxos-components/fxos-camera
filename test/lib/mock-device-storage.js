/*global sinon, File*/
/*jshint maxlen:false*/

window.MockDeviceStorage = (function() {

  function MockDeviceStorage(type) {
    this.type = type;
    sinon.spy(this, 'get');
    sinon.spy(this, 'delete');
    sinon.spy(this, 'freeSpace');
    sinon.spy(this, 'addNamed');
    this.space = 100000000;
    this.files = {};
  }

  MockDeviceStorage.prototype = {
    get(filePath) {
      var defer = new Deferred();

      setTimeout(() => {
        defer.resolve(this.files[filePath]);
      });

      return defer.promise;
    },

    addNamed(blob, filePath) {
      var request = {};

      setTimeout(() => {
        request.result = `/absolute/path/${filePath}`;
        this.files[filePath] = new File([''], filePath);
        request.onsuccess({ target: request });
      });

      return request;
    },

    delete(filePath) {
      var defer = new Deferred();
      return defer.promise;
    },

    freeSpace() {
      var request = {};

      setTimeout(() => {
        request.result = this.space;
        request.onsuccess();
      });

      return request;
    }
  };

  /**
   * Utils
   */

  function Deferred() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  return MockDeviceStorage;
})();