/*global sinon*/
/*jshint maxlen:false*/

window.MockDeviceStorage = (function() {

  function MockDeviceStorage() {
    sinon.spy(this, 'get');
    sinon.spy(this, 'delete');
    sinon.spy(this, 'freeSpace');
    this.space = 100000000;
  }

  MockDeviceStorage.prototype = {
    get(filePath) {
      var defer = new Deferred();

      setTimeout(() => {
        defer.resolve(new Blob(['']));
      });

      return defer.promise;
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