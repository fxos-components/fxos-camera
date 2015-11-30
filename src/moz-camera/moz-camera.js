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
 * Mini logger
 *
 * @type {Function}
 */
var debug = 1 ? (...args) => console.log('[MozCamera]', ...args) : () => {};

/**
 * Shorthand
 *
 * @type  {Function}
 */
var on = (el, name, fn) => el.addEventListener(name, fn);
var off = (el, name, fn) => el.removeEventListener(name, fn);

/**
 * Exports
 */

module.exports = MozCamera;

function MozCamera(options) {
  debug('new', options);
  Object.assign(this, options);
  this.pictureSize = pictureSize.toConfig(this.getCached('pictureSize'));
  this.recorderProfile = this.getCached('recorderProfile');
  this._ready = this.load();
  this.attempts = 3;
  this.queued = {};
  this.pending = {};
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
    // return this.block('load', () => {
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

          on(camera, 'shutter', this.onShutter);
          this.onConfigured(configuration);
        });
      // });
  },

  configure(params) {
    return this.one('configure', () => {
      if (this.recording) throw error(2);

      var config = this.createConfig(params);
      debug('configuring...', params, config);

      if (!this.needsConfig(config)) {
        debug('no config required');
        return;
      }

      this.focus.stop();

      return this.mozCamera.setConfiguration(config)
        .then(result => this.onConfigured(result))
        .then(() => this.oncePreviewStarted())
        .then(() => this.focus.start());
    });
  },

  /**
   * Stores some configuration state
   * whenever the mozCamera configuration
   * changes.
   *
   * The camera can be configured at two
   * deferrent stages:
   *
   *   - mozCamera.setConfiguration();
   *   - navigator.mozCameras.getCamera();
   *
   * @param  {Object} config
   */
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

  /**
   * Gets a reference to the mozCamera.
   *
   * Sometimes the camera can still be
   * busy being released from another
   * app, so on failure we re-attempt
   * until all attempts have been exhausted.
   *
   * @return {Promise}
   */
  getCamera() {
    var config = this.createConfig();
    var interval = 1000;

    debug('get camera', this.type, config);
    return navigator.mozCameras.getCamera(this.type, config)
      .catch(err => {
        debug('error requesting camera', err);
        var defer = new Deferred();

        if (!(this.attempts--)) {
          debug('no attempts left');
          defer.reject(new Error('hardware-unavailable'));
          return defer.promise;
        }

        // try again one second later ...
        this.getCameraTimeout = setTimeout(() => {
          debug('re-requesting camera', this.attempts);
          var config = this.createConfig();
          this.getCamera(this.camera, config)
            .then(defer.resolve, defer.reject);
        }, interval);

        return defer.promise;
      });
  },

  /**
   * Stream the camera's preview
   * stream into a <video> element.
   *
   * Teh returned Promise resolves
   * when the preview stream has
   * actually 'started'.
   *
   * @param  {HTMLVideoElement} el
   * @return {Promise}
   */
  streamInto(el) {
    debug('stream into');
    el.mozSrcObject = this.mozCamera;
    el.play();
    return this.oncePreviewStarted();
  },

  /**
   * Resolves when the preview
   * stream is 'started'.
   *
   * We use a setTimeout() to give
   * Gecko a chance to layout any
   * changes that have been made
   * to the viewfinder before
   * revealing it.
   *
   * @return {Promise}
   */
  oncePreviewStarted() {
    return new Promise(resolve => {
      var mozCamera = this.mozCamera;
      on(mozCamera, 'previewstatechange', function fn(e) {
        if (e.newState === 'started') {
          debug('preview state change', e);
          off(mozCamera, 'previewstatechange', fn);
          setTimeout(resolve);
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
    return this.ready()
      .then(() => {
        var size = this.getPictureSize(key);
        if (!size) throw error(6);
        debug('setting picture size ...', key);
        this.setCached('pictureSize', key);
        return this.configure({ pictureSize: size });
      });
  },

  setRecorderProfile(key) {
    return this.ready()
      .then(() => {
        var profile = this.getRecorderProfile(key);
        if (!profile) throw error(7);
        debug('setting recorder profile ...', key);
        this.setCached('recorderProfile', key);
        return this.configure({ recorderProfile: key });
      });
  },

  getRecorderProfile(key) {
    debug('get recorder profile', key);
    return this.recorderProfiles.hash[key];
  },

  getPictureSize(param) {
    var key = typeof param === 'object'
      ? pictureSize.toKey(param)
      : param;

    return this.pictureSizes.hash[key];
  },

  setFlashMode(value) {
    return this.ready()
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
    return this.ready()
      .then(() => {
        var hasSceneMode = !!~this.sceneModes.indexOf(value);
        if (!hasSceneMode) return this.get('sceneMode');
        this.mozCamera.sceneMode = value;
        debug('scene mode set', value);
        return value;
      });
  },

  /**
   * Get the current `sceneMode`.
   *
   * Returns `null` when HDR is `on`
   * to aide the illusion that HDR
   * is its own setting.
   *
   * @return {String|null}
   */
  getSceneMode() {
    var result = this.mozCamera.sceneMode;
    return result === 'hdr' ? null : result;
  },

  /**
   * Returns the currently available scene-modes.
   *
   * HDR is excluded from this list to
   * create the illusion that HDR is
   * its own setting, when in fact its
   * a scene-mode.
   *
   * @return {Array}
   */
  getSceneModes() {
    return this.sceneModes.filter(mode => mode !== 'hdr');
  },

  /**
   * Get the available HDR modes.
   *
   * @return {Array|null}
   */
  getHdrModes() {
    if (!this.hasHdr()) return null;
    return ['on', 'off'];
  },

  /**
   * Test if this camera has HDR
   * @return {Boolean}
   */
  hasHdr() {
    return !!~this.sceneModes.indexOf('hdr');
  },

  /**
   * Get the current hdr-mode
   *
   * @return {String|null}
   */
  getHdrMode() {
    if (!this.hasHdr()) return null;
    return this.mozCamera.sceneMode === 'hdr'
      ? 'on' : 'off';
  },

  /**
   * Set the HDR mode
   *
   * @param {String} value ['on','off']
   * @returns {Promise}
   */
  setHdrMode(value) {
    return this.ready()
      .then(() => {
        if (!this.hasHdr()) return null;
        switch (value) {
          case 'on': return this.setHdrOn();
          case 'off': return this.setHdrOff();
        }
      });
  },

  /**
   * Turn HDR mode 'on'
   *
   * @returns {Promise}
   */
  setHdrOn() {
    this.lastSceneMode = this.mozCamera.sceneMode;
    return this.setSceneMode('hdr')
      .then(result => 'on');
  },

  /**
   * Turn HDR mode 'off'
   *
   * @returns {Promise}
   */
  setHdrOff() {
    return this.setSceneMode(this.lastSceneMode)
      .then(result => 'off');
  },

  /**
   * Create a camera configuration object
   * based on the currently set state.
   * @param  {Object} [config]
   * @return {Object} {mode, pictureSize, recorderProfile}
   */
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

  /**
   * Tests if the passed configuration
   * matches the current camera configuration.
   *
   * We use this test to determine if we
   * need to go re-configure the camera.
   *
   * @param  {Object} config {mode, pictureSize, recorderProfile}
   * @return {Boolean}
   */
  needsConfig(config) {
    return [
      'mode',
      'pictureSize',
      'recorderProfile'
    ].some(key => config[key] && config[key] !== this[key]);
  },

  /**
   * Take a Picture.
   *
   * @param  {String} filePath
   * @param  {Object} [options]
   * @param  {Number} [options.rotation] device orientation (deg)
   * @param  {Array}  [options.position] [String,String] geolocation position
   * @return {Promise}
   */
  takePicture(filePath, options={}) {
    return this.block('takePicture', () => {
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
        .then(() => this.focus.stop())
        .then(() => picture.take())
        .then(result => {
          this.focus.start();
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
  startRecording(filePath, options={}) {
    return this.ready()
      .then(() => {
        if (this.mode !== 'video') return Promise.reject(error(3));
        if (this.recording) return Promise.reject(error(2));
        debug('start recording', options);

        var rotation = options.rotation;
        var frontCamera = this.type === 'front';
        var profile = this.getRecorderProfile(this.recorderProfile);

        // Rotation is flipped for front camera
        if (frontCamera) rotation = -rotation;

        this.video = new Video({
          maxFileSize: this.maxFileSize,
          previewSize: this.previewSize,
          mozCamera: this.mozCamera,
          filePath: filePath,
          rotation: rotation,
          storage: this.storage,
          width: profile.width,
          height: profile.height,
          recorderProfile: this.recorderProfile
        });

        // When recording is complete
        this.video.complete
          .catch(err => this.onError(err))
          .then(() => {
            this.recording = false;
            delete this.video;
          });

        this.recording = true;
        return this.video.start();
      });
  },

  stopRecording() {
    debug('stop recording');
    if (!this.recording) return Promise.resolve();
    return this.video.stop();
  },

  setMaxFileSize(value) {
    debug('set max file size', value);
    this.maxFileSize = value;
  },

  setFocus(rect) {
    return this.ready()
      .then(() => {
        debug('focus', rect);
        return this.focus.set(rect);
      });
  },

  getMaxZoom() {
    var ratios = this.mozCamera.capabilities.zoomRatios;
    return ratios[ratios.length - 1];
  },

  setZoom(value) {
    return this.one('setZoom', () => {
      var clamped = this.clampZoomToRange(value);
      var defer = new Deferred();

      // Gecko validates this and adjusts
      // the value to an exact zoom-ratio
      this.mozCamera.zoom = clamped;

      var result = {
        input: value,
        value: this.mozCamera.zoom
      };

      debug('set zoom', this.mozCamera.zoom);
      setTimeout(() => defer.resolve(result), 150);
      return defer.promise;
    });
  },

  clampZoomToRange(value) {
    var ratios = this.mozCamera.capabilities.zoomRatios;
    var max = ratios[ratios.length - 1];
    var min = ratios[0];

    return Math.max(min, Math.min(value, max));
  },

  destroy() {
    return this.block('destroy', () => {

      // Clear any queued hardware requests
      clearTimeout(this.getCameraTimeout);

      // Ignore if there is no loaded camera
      if (!this.mozCamera) return;

      off(this.mozCamera, 'shutter', this.onShutter);
      this.focus.stop();

      return this.stopRecording()
        .then(() => this.mozCamera.release())
        .then(() => {
          debug('destroyed');
          this.destroyed = true;
          delete this.mozCamera;
          delete this.pictureSize;
          delete this.recorderProfile;
        })

        .catch(err => {
          debug('failed to release hardware');
        });
    });
  },

  get(key) {
    return this.ready()
      .then(() => {
        debug('get', key);
        switch (key) {
          case 'recorderProfile': return this.recorderProfile;
          case 'pictureSize': return this.pictureSize.key;
          case 'sceneModes': return this.getSceneModes();
          case 'sceneMode': return this.getSceneMode();
          case 'hdrModes': return this.getHdrModes();
          case 'hdrMode': return this.getHdrMode();
          case 'maxZoom': return this.getMaxZoom();
          default: return this.mozCamera[key] || this[key];
        }
      });
  },

  getCached(key) {
    debug('set cached', this.type, key);
    return storage.get(`${this.type}:${key}`);
  },

  setCached(key, value) {
    debug('set cached', this.type, key, value);
    return storage.set(`${this.type}:${key}`, value);
  },

  ready() {
    return this._ready
      .catch(err => {
        debug('the last block() threw', err.lineNumber);
      })

      .then(() => {
        if (this.destroyed) throw error(4);
      });
  },

  block(name, fn) {
    debug('block', name, !!this.pending[name]);
    if (this.pending[name]) return Promise.reject(error(5));

    var promise = this.ready()
      .then(() => fn())
      .then(result => {
        debug('blocking task done', name);
        delete this.pending[name];
        return result;
      });

    return this._ready = this.pending[name] = promise;
  },

  one(name, fn, options={}) {
    debug('one', name);

    if (this.pending[name]) {
      debug('one pending', name);
      this.queued[name] = fn;
      return this.pending[name];
    }

    var ready = options.ready
      ? Promise.resolve()
      : this.ready();

    return this._ready = this.pending[name] = ready
      .then(() => fn())
      .then(result => {
        delete this.pending[name];
        var queued = this.queued[name];
        if (!queued) return result;

        debug('one queued', name);
        delete this.queued[name];
        return this.one(name, queued, { ready: true });
      })

      .then(result => {
        debug('one task done', name);
        return result;
      });
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

function Deferred() {
  this.promise = new Promise((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

/**
 * Creates new `Error` from registery.
 *
 * @param  {Number} id Error Id
 * @return {Error}
 * @private
 */
function error(id, ...args) {
  /*jshint maxlen:false*/
  return new Error({
    1: `picture taking in progress`,
    2: `video recording in progress`,
    3: `switch to 'video' mode before recording`,
    4: `destroyed`,
    5: `in-progress`,
    6: `unknown picture-size: ${args[0]}`,
    7: `unknown recorder-profile: ${args[0]}`
  }[id]);
}

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./lib/moz-camera',this));/*jshint ignore:line*/