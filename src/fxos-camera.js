'use strict';

/**
 * Dependencies
 */

var Viewfinder = require('./lib/viewfinder');
var MozCamera = require('./lib/moz-camera');
var component = require('gaia-component');

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[FXOSCamera]', ...args) : () => {};

/**
 * Private internal key.
 *
 * @type {Symbol}
 */
var internal = 0 ? 'internal' : Symbol();

/**
 * Shorthand
 *
 * @type  {Function}
 */
var on = (el, name, fn) => el.addEventListener(name, fn);
var off = (el, name, fn) => el.removeEventListener(name, fn);

/**
 * Public class.
 *
 * @type {Object}
 */
var FXOSCameraPrototype = {
  extensible: false,

  created() {
    debug('created');
    this.setupShadowRoot();
    this[internal] = new Internal(this);
  },

  attached() {
    debug('attached');
    this[internal].attached();
  },

  detached() {
    debug('detached');
    this[internal].detached();
  },

  start() {
    return this[internal].start();
  },

  stop() {
    return this[internal].stop();
  },

  setCamera(value) {
    return this[internal].setCamera(value);
  },

  setMode(value) {
    return this[internal].setMode(value);
  },

  setFlashMode(value) {
    return this[internal].setFlashMode(value);
  },

  setPictureSize(value) {
    return this[internal].setPictureSize(value);
  },

  get(value) {
    return this[internal].get(value);
  },

  set(key, value) {
    return this[internal].set(key, value);
  },

  setSceneMode(value) {
    return this[internal].setSceneMode(value);
  },

  takePicture(filePath, options) {
    return this[internal].takePicture(filePath, options);
  },

  startRecording(filePath, options) {
    return this[internal].startRecording(filePath, options);
  },

  stopRecording() {
    return this[internal].stopRecording();
  },

  focus(point) {
    return this[internal].focus(point);
  },

  attrs: {
    maxFileSize: {
      set(value) { this[internal].setMaxFileSize(value); }
    },

    flush: {
      get() { return !!this[internal].flush; },
      set(value) {
        value = !!value || value === '';
        if (this.flush === value) return;
        if (value) this.el.setAttribute('flush', '');
        else this.el.removeAttribute('flush');
        this[internal].flush = value;
      },
    },

    started: { get() { return this[internal].started.promise; }},
    stopped: { get() { return this[internal].stopped.promise; }}
  },

  template: `<div class="inner">
    <div class="frame">
      <div class="wrapper">
        <video></video>
        <content></content>
      </div>
    </div>
  </div>
  <style>
    :host {
      position: relative;

      display: block;
      width: 100%;
      height: 100%;
    }

    .inner {
      position: absolute;
      top: 0;
      left: 0;

      display: flex;
      width: 100%;
      height: 100%;

      justify-content: center;
      overflow: hidden;
    }

    /**
     * 1. Should never overflow the viewport.
     */

    .frame {
      display: flex;
      position: relative;
      max-width: 100%; /* 1 */
      max-height: 100%; /* 1 */
      justify-content: center;
      align-items: center;
    }

    .wrapper {
      flex-shrink: 0;
    }

    /**
     * .shutter
     */

    .wrapper.shutter {
      animation: 400ms shutter-animation;
    }

    video {
      width: 100%;
      height: 100%;
      outline: none;
    }
  </style>`,

  globalCss: `
    @keyframes shutter-animation {
      0% { opacity: 1; }
      1% { opacity: 0.25; }
      100% { opacity: 1 }
    }`
};

/**
 * Private class.
 *
 * @constructor
 */
function Internal(el) {
  var shadow = el.shadowRoot;

  this.el = el;
  this.els = {
    inner: shadow.querySelector('.inner'),
    frame: shadow.querySelector('.frame'),
    wrapper: shadow.querySelector('.wrapper'),
    video: shadow.querySelector('video')
  };

  this.viewfinder = new Viewfinder(this);
  this.started = new Deferred();
  this.pending = {};

  // defaults
  this.mode = 'picture';
  this.type = 'back';

  // bind helps removeEventListener()
  this.onVisibilityChange = this.onVisibilityChange.bind(this);
  this.onFocusChanged = this.onFocusChanged.bind(this);
  this.onFacesChanged = this.onFacesChanged.bind(this);
  this.onShutter = this.onShutter.bind(this);
}

Internal.prototype = {

  /**
   * As soon as the component is
   * attached to the DOM we start
   * up the camera.
   *
   * @private
   */
  attached() {
    this.start();
    on(document, 'visibilitychange', this.onVisibilityChange);
  },

  /**
   * As soon as the component is
   * detached from the DOM we stop
   * the camera.
   *
   * @private
   */
  detached() {
    this.stop();
    off(document, 'visibilitychange', this.onVisibilityChange);
  },

  /**
   * Start the camera.
   *
   * The viewfinder will be displayed
   * and the camera will be setup ready
   * to capture.
   *
   * @return {Promise}
   */
  start() {
    if (this._started) return this._started;
    debug('starting ...');

    delete this._stopped;
    this.stopped = new Deferred();

    return this._started = this.viewfinder.hide({ instant: true })
        .then(() => this.load())
        .then(() => this.viewfinder.show())
        .then(() => {
          debug('started');
          this.started.resolve();
        })

        .catch(this.started.reject);
  },

  /**
   * Stop the camera.
   *
   * The viewfinder will stop streaming
   * and the camera will be released.
   *
   * @return {Promise}
   */
  stop() {
    if (this._stopped) return this._stopped;
    debug('stopping ...');

    delete this._started;
    this.started = new Deferred();

    return this._stopped = this.release()
      .then(() => {
        debug('torndown');
        delete this._loaded;
      })

      .then(this.stopped.resolve)
      .catch(err => {
        this.stopped.reject(err);
        throw err;
      });
  },

  /**
   * Resolves when the camera has
   * fully started and any hardware
   * aquisition is complete.
   *
   * @return {Promise}
   */
  loaded() {
    return Promise.all([
      this.started.promise,
      this._loaded
    ]);
  },

  /**
   * Load the currently chosen camera type.
   *
   * 1. Acquired hardware is released
   * 2. Viewfinder updated to match the latest preview-size
   * 3. Camera set to stream into <video>
   *
   * We before we resolve the original Promise
   * we check to make sure that the Camera
   * type wasn't changed whilst the operation
   * was in progress, if it has: repeat.
   *
   * @return {Promise}
   */
  load() {
    debug('load');
    if (this.loading) return this.loading;

    // don't reload unnecessarily
    if (this.camera && this.camera.type === this.type) {
      return Promise.resolve(this.camera);
    }

    var loaded = this.release()
      .then(() => {
        debug('loading ...');

        // TODO: We could pass an emitter
        // instead of callbacks here ...?
        this.camera = new MozCamera({
          type: this.type,
          mode: this.mode,
          onFocusChanged: this.onFocusChanged,
          onFacesChanged: this.onFacesChanged,
          onError: e => this.onError(e),
          onShutter: this.onShutter
        });

        return this.camera._ready;
      })

      .then(() => {
        debug('loaded', this.camera.type, this.type);
        delete this.loading;

        // If the camera was changed since the call
        // to loadCamera() we need to .setCamera()
        // again to get the hardware in sync.
        if (this.type !== this.camera.type) {
          debug('type changed during load');
          return this.load();
        }

        this.viewfinder.update(this.camera);
        return this.camera.streamInto(this.viewfinder.els.video);
      });

    return this._loaded = this.loading = loaded;
  },

  /**
   * Set the camera 'type'.
   *
   * @param {String} type ['front'|'back']
   */
  setCamera(camera) {
    debug('set camera', camera);
    if (!this.knownType(camera)) return Promise.reject(error(4, camera));
    this.type = camera;
    this.viewfinder.hide();
    return this.load()
      .then(() => this.viewfinder.show());
  },

  /**
   * Test if given type is valid.
   *
   * @param  {String} type
   * @return {Boolean}
   */
  knownType(type) {
    return !!~this.getCameras().indexOf(type);
  },

  /**
   * Get list of available camera 'types'.
   *
   * @return {Array}
   */
  getCameras() {
    return navigator.mozCameras.getListOfCameras();
  },

  /**
   * Test if given camera mode is known.
   *
   * @param  {String} type
   * @return {Boolean}
   */
  knownMode(type) {
    return !!{
      'video': 1,
      'picture': 1
    }[type];
  },

  /**
   * Set the mode.
   *
   * @param {String} value
   * @param {Object} [options]
   * @param {Boolean} [options.hide]
   */
  setMode(value, options={}) {
    debug('set mode', value);
    if (!this.knownMode(value)) return Promise.reject(error(3, value));
    var hide = options.hide !== false;

    this.mode = value;
    return this.loaded()
      .then(() => hide && this.viewfinder.hide())

      .then(() => {
        debug('setting mode', this.mode);
        return this.camera.configure({ mode: this.mode });
      })

      // If the camera was 'destroyed' before
      // we could configure, we can try again.
      // Any other error gets thrown back up
      // the promise chain for the user to catch.
      .catch(err => {
        if (err.message !== 'destroyed') throw err;
        return this.setMode(this.mode, { hide: false });
      })

      .then(() => this.viewfinder.update(this.camera))
      .then(() => hide && this.viewfinder.show());
  },

  /**
   * Set the maximum file size the
   * Camera should record up to.
   *
   * When in video mode the camera hardware
   * will automatically stop recording
   * if/when this size is reached.
   *
   * In picture mode, the picture will
   * no be taken if there is not enough
   * space.
   *
   * @param {[type]} value [description]
   */
  setMaxFileSize(value) {
    this.maxFileSize = value;
    return this.loaded()
      .then(() => this.camera.setMaxFileSize(value));
  },

  /**
   * Take a picture.
   *
   * Throws if called when picture
   * taking is in progress.
   *
   * @param  {String} filePath
   * @param  {Object} [options]
   * @param  {Object} [options.position]
   * @param  {Object} [options.rotation]
   * @return {Promise<Picture>}
   */
  takePicture(filePath, options) {
    return this.loaded()
      .then(() => {
        if (typeof filePath !== 'string') throw error(1);
        return this.camera.takePicture(filePath, options);
      });
  },

  /**
   * Starts recording.
   *
   * @param  {String} filePath
   * @param  {Object} options
   * @param  {Object} [options.position]
   * @param  {Object} [options.rotation]
   * @return {Promise}
   */
  startRecording(filePath, options) {
    return this.loaded()
      .then(() => {
        if (typeof filePath !== 'string') throw error(1);
        return this.camera.startRecording(filePath, options);
      });
  },

  /**
   * Stops recording and returns a `Video`.
   *
   * @return {Promise<Video>}
   */
  stopRecording() {
    return this.loaded()
      .then(() => this.camera.stopRecording());
  },

  /**
   * Focuses the camera on a specific point.
   *
   * @param  {Event} e
   * @return {Promise}
   */
  focus(e) {
    return this.loaded()
      .then(() => {
        debug('focus', e);
        var point = pxToPoint({
          frame: this.els.video.getBoundingClientRect(),
          angle: this.camera.sensorAngle,
          mirrored: this.type === 'front',
          x: e.clientX,
          y: e.clientY,
          diameter: 1
        });

        return this.camera.setFocus(point);
      });
  },

  // TODO should only fade out if in picture mode
  setPictureSize(value) {
    debug('setting picture size ...', value);
    var hide;

    return this.loaded()
      .then(() => this.get('mode'))
      .then(mode => {
        hide = mode === 'picture';
        return hide && this.viewfinder.hide();
      })

      .then(() => this.camera.setPictureSize(value))
      .then(result => {
        debug('picture size set', result);
        if (!hide) return result;

        // only update viewfinder when
        // current mode is impacted
        this.viewfinder.update(this.camera);
        return this.viewfinder.show()
          .then(() => result);
      });
  },

  // TODO should only fade out if in video mode
  setRecorderProfile(key) {
    debug('set recorder profile', key);
    var hide;

    return this.loaded()
      .then(() => this.get('mode'))
      .then(mode => {
        hide = mode === 'video';
        return hide && this.viewfinder.hide();
      })

      .then(() => this.camera.setRecorderProfile(key))
      .then(result => {
        debug('recorder profile set', result);
        if (!hide) return result;

        // only update viewfinder when
        // current mode is impacted
        this.viewfinder.update(this.camera);
        return this.viewfinder.show()
          .then(() => result);
      });
  },

  setSceneMode(value) {
    debug('set scene mode', value);
    this.sceneMode = value;
    return this.loaded()
      .then(() => this.camera.setSceneMode(this.sceneMode))
      .then(result => this.sceneMode = result);
  },

  /**
   * Set the flash mode.
   *
   * @param {String} value
   */
  setFlashMode(value) {
    debug('setting flash mode', value);
    return this.loaded()
      .then(() => this.camera.setFlashMode(value));
  },

  /**
   * Set the HDR mode.
   *
   * @param {String} value
   */
  setHdrMode(value) {
    debug('set flash mode', value);
    this.hdrMode = value;
    return this.loaded()
      .then(() => this.camera.setHdrMode(this.hdrMode))
      .then(result => this.hdrMode = result);
  },

  /**
   * Set the zoom level.
   *
   * @param {String} value
   */
  setZoom(value) {
    debug('set zoom', value);
    this.zoom = value;
    return this.loaded()
      .then(() => this.camera.setZoom(value))
      .then(result => this.zoom = result.value);
  },

  setEffect() {},

  /**
   * Releases the camera hardware.
   *
   * @param  {Function} done
   */
  release() {
    if (!this.camera) return Promise.resolve();
    debug('releasing...');
    return this.camera.destroy()
      .then(() => {
        debug('released');
        delete this.camera;
      });
  },

  /**
   * Get something.
   *
   * @param  {String} key
   * @return {Promise}
   */
  get(key) {
    return this.loaded()
      .then(() => {
        switch (key) {
          case 'viewfinderSize': return this.viewfinder.size;
          case 'cameras': return this.getCameras();
          case 'camera': return this.camera.get('type');
          default: return this.camera.get(key);
        }
      });
  },

  /**
   * Set something.
   *
   * @param {String} key
   * @param {*} value
   */
  set(key, value) {
    debug('set', key, value);
    switch (key) {
      case 'recorderProfile': return this.setRecorderProfile(value);
      case 'pictureSize': return this.setPictureSize(value);
      case 'maxFileSize': return this.setMaxFileSize(value);
      case 'sceneMode': return this.setSceneMode(value);
      case 'flashMode': return this.setFlashMode(value);
      case 'hdrMode': return this.setHdrMode(value);
      case 'camera': return this.setCamera(value);
      case 'mode': return this.setMode(value);
      case 'zoom': return this.setZoom(value);
      default: return Promise.reject(new Error('unknown setting'));
    }
  },

  /**
   * Dispatch an event on <fxos-camera>.
   *
   * @param  {String]} name
   * @param  {*} [detail]
   */
  emit(name, detail) {
    this.el.dispatchEvent(new CustomEvent(name, {
      bubbles: false,
      detail: detail
    }));
  },

  /**
   * Called by MozCamera when an error
   * occurs that is not covered by
   * a Promise.
   *
   * @param  {Error} err
   * @private
   */
  onError(err) {
    this.emit('error', err);
  },

  /**
   * Called by MozCamera when focus changes.
   *
   * @param  {String} value  'focusing'|'focused'|'failed'
   * @param  {Object} point  the current point of focus
   * @private
   */
  onFocusChanged(value, point) {
    debug('focus changed', value, point);
    this.viewfinder.setFocus(value, point);
  },

  /**
   * Called by MozCamera faces are detected.
   *
   * @param  {Array} faces
   * @private
   */
  onFacesChanged(faces) {
    debug('faces changed', faces);
    this.viewfinder.setFaces(faces);
  },

  /**
   * Handles when the app/tab is shown/hidden.
   *
   * We must stop the camera when the app
   * is sent to the background so that
   * other apps may have the chance to
   * acquire the hardware.
   *
   * @private
   */
  onVisibilityChange() {
    debug('visibilitychange', document.hidden);
    if (document.hidden) this.stop();
    else this.start();
  },

  /**
   * Called by the MozCamera when the
   * hardware indicates the precise
   * moment the image is captured.
   *
   * This gives the app the opportunity
   * to provide some kind of visual/audio
   * feedback.
   *
   * @private
   */
  onShutter() {
    this.emit('shutter');
  }
};

/**
 * Exports
 */

var FXOSCamera = component.register('fxos-camera', FXOSCameraPrototype);
FXOSCamera.Viewfinder = Viewfinder;
FXOSCamera.MozCamera = MozCamera;
module.exports = FXOSCamera;

/**
 * Utils
 */

function Deferred() {
  this.promise = new Promise((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

function pxToPoint({x, y, diameter, frame, angle, mirrored}) {
  var zeroX = frame.width / 2;
  var zeroY = frame.height / 2;

  // relative to frame edge
  x -= frame.x;
  y -= frame.y;

  // offset by the point diameter
  x -= diameter / 2;
  y -= diameter / 2;

  // relative to viewfinder center
  x -= zeroX;
  y -= zeroY;

  // to relative percentage
  x /= zeroX;
  y /= zeroY;

  // scale to camera size
  x *= 1000;
  y *= 1000;

  // relative to frame
  diameter /= frame.width;

  // scale to camera size
  diameter *= 2000;

  // front camera needs flipping
  if (mirrored) {
    x = -x;
    y = -y;
  }

  // rotate point to match sensor angle
  var rotated = rotatePoint(x, y, angle);
  x = rotated.x;
  y = rotated.y;

  return {
    x: x,
    y: y,
    left: x,
    top: y,
    bottom: y + diameter,
    right: x + diameter,
    width: diameter,
    height: diameter
  };
}

function rotatePoint(x, y, angle) {
  switch (angle) {
    case 0: return { x: x, y: y };
    case 90: case -270: return { x: y, y: -x };
    case 180: case -180: return { x: -x, y: -y };
    case 270: case -90: return { x: -y, y: x };
  }
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
    1: `invalid arguments - FXOSCamera#takePicture(filePath, [options])`,
    2: `invalid arguments - FXOSCamera#startRecording(filePath, [options])`,
    3: `invalid mode: '${args[0]}' - FXOSCamera#set('mode', 'picture'|'video')`,
    4: `invalid camera type: '${args[0]}'`
  }[id]);
}
