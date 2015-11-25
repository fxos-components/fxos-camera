(define => {define((require,exports,module) => {
'use strict';

/**
 * Mini logger
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[Picture]', ...args) : () => {};

/**
 * Key to store 'private' stuff behind
 *
 * @type {Symbol}
 */
var hidden = Symbol();

/**
 * Exports
 */

module.exports = Picture;

function Picture(params) {
  this[hidden] = {
    mozCamera: params.mozCamera,
    storage: params.storage
  };

  this.pictureSize = params.pictureSize;
  this.filePath  = params.filePath;
  this.rotation = params.rotation;
  this.position = params.position;
  this.camera = params.camera;
  this.width = this.pictureSize.width;
  this.height = this.pictureSize.height;
  this.timeStamp = Date.now();

  debug('created', this);
}

Picture.prototype = {

  /**
   * Create a config object to
   * pass to the Camera WebAPI.
   *
   * @return {Object}
   */
  createConfig() {
    var result = {
      dateTime: this.timeStamp / 1000,
      pictureSize: this.pictureSize,
      fileFormat: 'jpeg',
      rotation: this.getRotation()
    };

    // position is optional
    if (this.position) result.position = this.position;
    return result;
  },

  getRotation() {
    return this.camera === 'front'
      ? -this.rotation
      : this.rotation;
  },

  /**
   * Take the Picture.
   *
   * @return {Promise}
   */
  take() {
    var config = this.createConfig();
    debug('take picture', config);

    return this[hidden].mozCamera.takePicture(config)
      .then(blob => {
        debug('taken', blob);
        return this[hidden].storage.add(blob, this.filePath);
      })

      .then(result => {
        debug('stored', result);
        this.file = result.file;
        this.absolutePath = result.absolutePath;
        return this;
      });
  }
};

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./picture',this));/*jshint ignore:line*/
