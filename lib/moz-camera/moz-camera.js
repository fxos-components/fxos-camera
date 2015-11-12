(define => {define((require,exports,module) => {
'use strict';

/**
 * Dependencies
 */

var formatSizes = require('./format-sizes');
var storage = require('../storage');
var Picture = require('./picture');
var Video = require('./video');

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[MozCamera]', ...args) : () => {};

/**
 * Exports
 */

module.exports = MozCamera;

function MozCamera(type, config) {
  if (!this.knownType(type)) return Promise.reject('unknown type');
  this.type = type;
  this.config = config;
  this.attempts = 3;
  this.queued = {};
  this.ready = this.load();

  this.recorderProfile = this.getCached('recorderProfile');
  this.pictureSize = this.getCached('pictureSize');
  this.flashMode = this.getCached('flashMode');
}

MozCamera.prototype = {

  /**
   * Request the camera hardware.
   *
   * If the hardware is 'closed' we attempt
   * to re-request it one second later, until
   * all our attempts have run out.
   *
   * @returns {Promise}
   * @private
   */
  load() {
    debug('load');
    return this.getCamera()
      .then(result => {
        var config = result.configuration;
        var mozCamera = result.camera;
        var capabilities = mozCamera.capabilities;

        this.sensorAngle = mozCamera.sensorAngle;
        this.mozCamera = this.stream = mozCamera;
        this.storeConfig(config);

        this.recorderProfiles = formatSizes.video(capabilities.recorderProfiles);
        this.pictureSizes = formatSizes.picture(capabilities.pictureSizes);

        this.effectModes = capabilities.effectModes;
        this.sceneModes = capabilities.sceneModes;
        this.flashModes = capabilities.flashModes;
      });
  },

  getCamera() {
    debug('get camera');
    var config = this.createConfig();
    var interval = 1000;

    return navigator.mozCameras.getCamera(this.type, config)
      .catch(err => {
        return new Promise((resolve, reject) => {
          debug('error requesting camera', err);
          if (err !== 'HardwareClosed') return reject(err);

          if (!(this.attempts--)) reject(new Error('hardware unavailable'));

          // try again one second later ...
          this.getCameraTimeout = setTimeout(() => {
            this.getMozCamera(this.camera, this.config)
              .then(resolve, reject);
          }, interval);
        });
      });
  },

  getTypes() {
    return navigator.mozCameras.getListOfCameras();
  },

  knownType(type) {
    return !!~this.getTypes().indexOf(type);
  },

  setPictureSize(value) {
    return this.ready
      .then(() => {
        if (!this.hasPictureSize(value)) throw 'unknown size';
        debug('setting picture size ...', value);
        return this.configure({ pictureSize: value });
      });
  },

  setRecorderProfile(value) {
    return this.ready
      .then(() => {
        if (!this.hasRecorderProdile(value)) throw 'unknown size';
        debug('setting picture size ...', value);
        return this.configure({ recorderProfile: value });
      });
  },

  hasPictureSize(size) {
    return this.pictureSizes.some(item => {
      return item.width === size.width
        && item.height === size.height;
    });
  },

  hasRecorderProdile(profile) {
    return !!~this.recorderProfiles.indexOf(profile);
  },

  getRecorderProfileDetail() {
    var capabilities = this.mozCamera.capabilities;
    var recorderProfiles = capabilities.recorderProfiles;
    return recorderProfiles[this.recorderProfile];
  },

  configure(params) {
    return this.queue('configure', () => {
      var config = this.createConfig(params);
      debug('configuring...', params, config);

      if (!this.needsConfig(config)) {
        debug('no config required');
        return;
      }

      return this.mozCamera.setConfiguration(config)
        .then(config => {
          debug('configured', config);
          this.storeConfig(config);
        });
    });
  },

  setFlashMode(value) {
    return this.queue('setFlashMode', () => {
      var hasFlashMode = !!~this.flashModes.indexOf(value);
      if (!hasFlashMode) return this.get('flashMode');
      this.setCached('flashMode', value);
      this.mozCamera.flashMode = value;
      debug('flash mode set', value);
      return value;
    });
  },

  setSceneMode(value) {
    return this.queue('setSceneMode', () => {
      var hasSceneMode = !!~this.sceneModes.indexOf(value);
      if (!hasSceneMode) return this.get('sceneMode');
      this.mozCamera.sceneMode = value;
      debug('scene mode set', value);
      return value;
    });
  },

  createConfig(params) {
    return Object.assign({
      recorderProfile: this.recorderProfile,
      pictureSize: this.pictureSize,
      previewSize: this.previewSize,
      mode: this.mode
    }, params || {});
  },

  storeConfig(config) {
    debug('store config', config);
    this.recorderProfile = config.recorderProfile;
    this.pictureSize = config.pictureSize;
    this.previewSize = config.previewSize;
    this.mode = config.mode;
  },

  needsConfig(config) {
    return [
      'mode',
      'pictureSize',
      'recorderProfile',
      'previewSize'
    ].some(key => config[key] && config[key] !== this[key]);
  },

  takePicture(options) {
    return this.queue('takePicture', () => {
      debug('taking picture ...');
      options = options || {};

      var picture = new Picture({
        camera: this.type,
        mozCamera: this.mozCamera,
        pictureSize: this.pictureSize,
        rotation: options.rotation,
        position: options.position
      });

      return picture.take();
    });
  },

  /**
   * Start recording a video.
   *
   * @public
   */
  startRecording(options) {
    debug('start recording', options);

    var recorderProfile = this.getRecorderProfileDetail();
    var frontCamera = this.type === 'front';
    var rotation = options && options.rotation;
    var filePath = options && options.filePath;
    var storage = options && options.storage;

    // Rotation is flipped for front camera
    if (frontCamera) rotation = -rotation;

    this.video = new Video({
      maxFileSize: this.maxFileSize,
      previewSize: this.previewSize,
      mozCamera: this.mozCamera,
      filePath: filePath,
      rotation: rotation,
      storage: storage
    });

    this.video.complete
      .catch(err => this.onError(err));

    return this.video.start();
  },

  stopRecording() {
    debug('stop recording');
    return this.video.stop();
  },

  setMaxFileSize(value) {
    debug('set max file size', value);
    this.maxFileSize = value;
  },

  createTakePictureConfig(options) {
    var rotation = options && options.rotation;
    var position = options && options.position;
    var result = {
      dateTime: Date.now() / 1000,
      pictureSize: this.pictureSize,
      fileFormat: 'jpeg'
    };

    // Position is optionally provided by user
    if (position) result.position = position;

    // Front camera is inverted, so flip rotation
    result.rotation = this.type === 'front'
      ? -rotation
      : rotation;

    return result;
  },

  destroy() {
    return this.queue('destroy', () => {

      // Clear any queued hardware requests
      clearTimeout(this.getCameraTimeout);

      // Ignore if there is no loaded camera
      if (!this.mozCamera) return;

      // this.stopRecording();
      // this.set('focus', 'none');

      return this.mozCamera.release()
        .then(() => {
          debug('destroyed');
          this.destroyed = true;
          delete this.mozCamera;
          delete this.pictureSize;
          delete this.recorderProfile;
          delete this.queued.release;
        })

        .catch(err => {
          debug('failed to release hardware');
        });
    });
  },

  get(key) {
    return this[key] || (this.mozCamera && this.mozCamera[key]);
  },

  getCached(key) {
    return storage.get(`${this.mode}:${key}`);
  },

  setCached(key, value) {
    return storage.set(`${this.mode}:${key}`, value);
  },

  queue(name, fn) {
    if (this.queued[name]) return this.queued[name];

    var promise = this.ready
      .then(() => {
        if (this.destroyed) return;
        return fn();
      })

      .then(result => {
        delete this.queued[name];
        return result;
      });

    this.ready = this.queued[name] = promise;
    return promise;
  },

  // to overwrite
  onError() {}
};

/**
 * Utils
 */



})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./lib/moz-camera',this));/*jshint ignore:line*/