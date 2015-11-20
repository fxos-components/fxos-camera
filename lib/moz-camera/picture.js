(define => {define((require,exports,module) => {
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[Picture]', ...args) : () => {};

var hidden = Symbol();

/**
 * Exports
 */

module.exports = Picture;

function Picture(params) {
  this[hidden] = { mozCamera: params.mozCamera };
  this.pictureSize = params.pictureSize;
  this.rotation = params.rotation;
  this.position = params.position;
  this.camera = params.camera;
  this.width = this.pictureSize.width;
  this.height = this.pictureSize.height;
  this.timeStamp = Date.now();

  debug('created', this);
}

Picture.prototype = {
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

  take() {
    return new Promise((resolve, reject) => {
      debug('take picture');
      var config = this.createConfig();
      this[hidden].mozCamera.takePicture(config, blob => {
        this.blob = blob;
        resolve(this);
      }, reject);
    });
  }
};

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./picture',this));/*jshint ignore:line*/
