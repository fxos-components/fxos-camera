(define => {define((require,exports,module) => {
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[Video]', ...args) : () => {};

const minRecordSpace = 1024 * 1024 * 2;
const spacePadding = 1024 * 1024 * 1;

var key = Symbol();

/**
 * Exports
 */

module.exports = Video;

function Video(params) {
  var mozCamera = params.mozCamera;

  this[key] = {
    mozCamera: mozCamera,
    complete: new Deferred(),
    storage:params.storage
  };

  this.filePath = params.filePath || this.createFilePath();
  this.maxFileSize = params.maxFileSize;
  this.rotation = params.rotation;
  this.width = params.width;
  this.height = params.height;

  this.poster = {
    width: params.previewSize.width,
    height: params.previewSize.height,
    blob: null,
  };

  mozCamera.addEventListener('recorderstatechange', this);
  mozCamera.addEventListener('poster', this);

  this.complete = this[key].complete.promise;
  debug('created', this);
}

Video.prototype = {
  createConfig() {
    return {
      maxFileSizeBytes: this.maxFileSize,
      rotation: this.rotation
    };
  },

  createFilePath() {
    return Date.now() + '.3gp';
  },

  handleEvent(e) {
    debug('handle event', e.type);
    switch (e.type) {
      case 'recorderstatechange': this.onRecorderStateChange(e); break;
      case 'poster': this.onPoster(e); break;
    }
  },

  onRecorderStateChange(e) {
    debug('recorder state change', e.newState);
    var msg = e.newState;

    switch (msg) {
      case 'Started': break;
      case 'Stopped': this.onStopped(); break;
      case 'FileSizeLimitReached':

      break;
      case 'PosterFailed':
      case 'TrackFailed':
      case 'MediaRecorderFailed':
      case 'MediaServerFailed':
        this.error = new Error(msg);
        this.stop();
    }
  },

  onPoster(e) {
    debug('on poster');
    this.poster.blob = e.data;
  },

  onError(err) {
    debug('on error', err);
    this[key].storage.delete(this.filePath);
    this[key].complete.reject(err);
  },

  onStopped() {
    debug('on stopped');
    if (this.error) return this.onError(this.error);
    this[key].storage.get(this.filePath)
      .then(file => {
        this.file = file;
        var mozCamera = this[key].mozCamera;
        mozCamera.removeEventListener('recorderstatechange', this);
        mozCamera.removeEventListener('poster', this);
        this[key].complete.resolve(this);
      })

      .catch(err => this.onError(err));
  },

  start() {
    return this[key].storage.hasSpace(minRecordSpace)
      .then(result => {
        if (!result.ok) throw new Error('storage-full');
        var remaining = result.remaining - spacePadding;
        this.maxFileSize = this.maxFileSize || remaining;

        return new Promise((resolve, reject) => {
          this[key].mozCamera.startRecording(
            this.createConfig(),
            this[key].storage.storage,
            this.filePath,
            resolve,
            reject);
        });
      });
  },

  stop() {
    debug('stop');
    if (this.stopped) return this[key].complete.promise;
    this[key].mozCamera.stopRecording();
    this.stopped = true;
    return this[key].complete.promise;
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

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./video',this));/*jshint ignore:line*/
