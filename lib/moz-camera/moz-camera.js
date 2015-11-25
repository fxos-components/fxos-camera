(define => {define((require,exports,module) => {
'use strict';

/**
 * Dependencies
 */

var pickThumbnail = require('./pick-thumbnail-size');
var DeviceStorage = require('./device-storage');
var formatSizes = require('./format-sizes');
var storage = require('../storage');
var Picture = require('./picture');
var Focus = require('./focus');
var Video = require('./video');

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[MozCamera]', ...args) : () => {};

var on = (el, name, fn) => el.addEventListener(name, fn);
var off = (el, name, fn) => el.removeEventListener(name, fn);

var key = Symbol();

/**
 * Exports
 */

module.exports = MozCamera;

function MozCamera(options) {
  debug('new', options);
  Object.assign(this, options);
  this.pictureSize = pictureSize.toConfig(this.getCached('pictureSize'));
  this.recorderProfile = this.getCached('recorderProfile');
  this.attempts = 3;
  this.queued = {};
  this.ready = this.load();
  this[key] = {};
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
      .then(({camera, configuration}) => {
        debug('got camera');
        var capabilities = camera.capabilities;

        this.sensorAngle = camera.sensorAngle;
        this.mozCamera = camera;

        this.effectModes = capabilities.effectModes;
        this.sceneModes = capabilities.sceneModes;
        this.flashModes = capabilities.flashModes;

        this.updateRecorderProfiles(capabilities.recorderProfiles);
        this.updatePictureSizes(capabilities.pictureSizes);
        this.onConfigured(configuration);
      });
  },

  configure(params) {
    return this.queue('configure', () => {
      var config = this.createConfig(params);
      debug('configuring...', params, config);

      if (!this.needsConfig(config)) {
        debug('no config required');
        return;
      }

      // TODO: stop focus

      return this.mozCamera.setConfiguration(config)
        .then(result => this.onConfigured(result))
        .then(() => this.oncePreviewStarted());
    });
  },

  onConfigured(config) {
    debug('configured', config);
    this.setFlashModeFromCache();

    this.pictureSize = this.getPictureSize(config.pictureSize);
    this.recorderProfile = config.recorderProfile;
    this.previewSize = config.previewSize;
    this.mode = config.mode;

    this.updateThumbnailSize();
    this.focus = new Focus(this);
    this.storage = new DeviceStorage(`${this.mode}s`);
  },

  getCamera() {
    var config = this.createConfig();
    var interval = 1000;

    debug('get camera', this.type, config);
    return navigator.mozCameras.getCamera(this.type, config)
      .catch(err => {
        return new Promise((resolve, reject) => {
          debug('error requesting camera', err);

          if (!(this.attempts--)) {
            reject(new Error('hardware-unavailable'));
            return;
          }

          // try again one second later ...
          this.getCameraTimeout = setTimeout(() => {
            debug('re-requesting camera', this.attempts);
            var config = this.createConfig();
            this.getCamera(this.camera, config)
              .then(resolve, reject);
          }, interval);
        });
      });
  },

  streamInto(el) {
    debug('stream into');
    el.mozSrcObject = this.mozCamera;
    el.play();
    return this.oncePreviewStarted();
  },

  oncePreviewStarted() {
    return new Promise(resolve => {
      var mozCamera = this.mozCamera;
      on(mozCamera, 'previewstatechange', function fn(e) {
        if (e.newState === 'started') {
          debug('preview state change', e);
          off(mozCamera, 'previewstatechange', fn);
          resolve();
        }
      });
    });
  },

  updateThumbnailSize() {
    var sizes = this.mozCamera.capabilities.thumbnailSizes;
    var picked = pickThumbnail(sizes, this.pictureSize);
    if (picked) this.mozCamera.setThumbnailSize(picked);
  },

  updateRecorderProfiles(raw) {
    var recorderProfiles = formatSizes.video(raw);
    this.recorderProfiles = recorderProfiles.list;
    this.recorderProfiles.hash = recorderProfiles.hash;
  },

  updatePictureSizes(raw) {
    var pictureSizes = formatSizes.picture(raw);
    this.pictureSizes = pictureSizes.list;
    this.pictureSizes.hash = pictureSizes.hash;
  },

  setPictureSize(key) {
    return this.ready
      .then(() => {
        var size = this.getPictureSize(key);
        if (!size) throw new Error(`unknown size: ${key}`);
        debug('setting picture size ...', key);
        this.setCached('pictureSize', key);
        return this.configure({ pictureSize: size });
      });
  },

  setRecorderProfile(key) {
    return this.ready
      .then(() => {
        var profile = this.getRecorderProfile(key);
        if (!profile) throw new Error('unknown profile');
        debug('setting recorder profile ...', key);
        this.setCached('recorderProfile', key);
        return this.configure({ recorderProfile: key });
      });
  },

  getRecorderProfile(key) {
    return this.recorderProfiles.hash[key];
  },

  getPictureSize(param) {
    var key = typeof param === 'object'
      ? pictureSize.toKey(param)
      : param;

    return this.pictureSizes.hash[key];
  },

  setFlashMode(value) {
    return this.ready
      .then(() => {
        if (!this.hasFlashMode(value)) return this.get('flashMode');
        this.setCached(`${this.mode}:flashMode`, value);
        this.mozCamera.flashMode = value;
        debug('flash mode set', value);
        return value;
      });
  },

  hasFlashMode(value) {
    return !!~this.flashModes.indexOf(value);
  },

  setFlashModeFromCache() {
    var mode = this.getCached(`${this.mode}:flashMode`);
    if (!this.hasFlashMode(mode)) return;
    this.mozCamera.flashMode = mode;
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

  createConfig(config={}) {
    return [
      'mode',
      'pictureSize',
      'recorderProfile'
    ].reduce((result, key) => {
      var value = config[key] || this[key];
      if (value) result[key] = value;
      return result;
    }, {});
  },

  needsConfig(config) {
    return [
      'mode',
      'pictureSize',
      'recorderProfile'
    ].some(key => config[key] && config[key] !== this[key]);
  },

  takePicture(filePath, options={}) {
    return this.queue('takePicture', () => {
      debug('taking picture ...', options);

      var picture = new Picture({
        filePath: filePath,
        camera: this.type,
        mozCamera: this.mozCamera,
        pictureSize: this.pictureSize,
        rotation: options.rotation,
        position: options.position,
        storage: this.storage
      });

      return this.focus.set()
        .then(() => picture.take())
        .then(result => {
          this.mozCamera.resumePreview();
          return result;
        });
    });
  },

  /**
   * Start recording a video.
   *
   * @public
   */
  startRecording(options) {
    debug('start recording', options);

    var rotation = options && options.rotation;
    var filePath = options && options.filePath;
    var frontCamera = this.type === 'front';

    // Rotation is flipped for front camera
    if (frontCamera) rotation = -rotation;

    this.video = new Video({
      maxFileSize: this.maxFileSize,
      previewSize: this.previewSize,
      mozCamera: this.mozCamera,
      filePath: filePath,
      rotation: rotation,
      storage: this.storage
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

  setFocus(rect) {
    this.ready
      .then(() => {
        debug('focus', rect);
        return this.focus.set(rect);
      });
  },

  destroy() {
    return this.queue('destroy', () => {

      // Clear any queued hardware requests
      clearTimeout(this.getCameraTimeout);

      // Ignore if there is no loaded camera
      if (!this.mozCamera) return;

      // this.stopRecording();
      this.focus.stop();

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
    debug('get', key);
    switch (key) {
      case 'recorderProfile': return this.recorderProfile;
      case 'pictureSize': return this.pictureSize.key;
      default: return this.mozCamera[key] || this[key];
    }
  },

  getCached(key) {
    debug('set cached', this.type, key);
    return storage.get(`${this.type}:${key}`);
  },

  setCached(key, value) {
    debug('set cached', this.type, key, value);
    return storage.set(`${this.type}:${key}`, value);
  },

  queue(name, fn) {
    debug('queue', name, !!this.queued[name]);
    if (this.queued[name]) return this.queued[name];

    var promise = this.ready
      .catch(err => {
        debug('the last task threw', err.message);
      })

      .then(() => {
        if (this.destroyed) {
          debug('noop: destroyed');
          throw new Error('destroyed');
        }

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

var pictureSize = {
  toConfig(key) {
    if (!key) return;
    var parts = key.split('x');
    return {
      key: key,
      width: Number(parts[0]),
      height: Number(parts[1])
    };
  },

  toKey(config) {
    if (!config) return;
    return `${config.width}x${config.height}`;
  }
};

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./lib/moz-camera',this));/*jshint ignore:line*/