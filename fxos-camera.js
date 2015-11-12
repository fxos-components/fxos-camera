(define => {define((require,exports,module) => {
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
var debug = 1 ? (...args) => console.log('[FXOSCamera]', ...args) : () => {};

/**
 * Private internal key.
 *
 * @type {Symbol}
 */
var internal = Symbol();

/**
 * Public class.
 *
 * @type {Object}
 */
var FXOSCameraPrototype = {
  created() {
    debug('created');
    this.setupShadowRoot();
    this[internal] = new Internal(this);
    this.complete = this[internal].complete.promise;
  },

  attached() {
    debug('attached');
    this[internal].setup();
  },

  detached() {
    debug('detached');
    this[internal].teardown();
  },

  setup() {
    return this[internal].setup();
  },

  teardown() {
    return this[internal].teardown();
  },

  setCamera(value) {
    return this[internal].setType(value);
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

  setSceneMode(value) {
    return this[internal].setSceneMode(value);
  },

  takePicture(options) {
    return this[internal].takePicture(options);
  },

  startRecording(options) {
    return this[internal].startRecording(options);
  },

  stopRecording() {
    return this[internal].stopRecording();
  },

  attrs: {
    camera: { get() { return this[internal].type; }},
    flashMode: { get() { return this[internal].get('flashMode'); }},
    sceneMode: { get() { return this[internal].get('sceneMode'); }},
    effect: { get() { return this[internal].get('effect'); }},
    mode: { get() { return this[internal].mode; }},
    maxFileSize: {
      set(value) { this[internal].setMaxFileSize(value); },
      get() { return this[internal].maxFileSize; }
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
    }
  },

  template: `<div class="inner">
    <div class="frame">
      <div class="wrapper">
        <video></video>
      </div>
      <content></content>
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
  this.complete = new Deferred();
  this.pending = {};

  this.mode = 'picture';
  this.type = 'back';
}

Internal.prototype = {
  setup() {
    if (this.isSetup) return this.isSetup;
    debug('setting up ...');

    delete this.isTorndown;

    return this.isSetup =
      this.viewfinder.hide({ instant: true })
        .then(() => this.load())
        .then(() => this.viewfinder.show())
        .then(this.complete.resolve)
        .catch(this.complete.reject);
  },

  teardown() {
    if (this.isTorndown) return this.isTorndown;
    debug('tearing down ...');

    this.complete = new Deferred();
    delete this.isSetup;

    return this.isTorndown = this.release()
      .then(() => {
        debug('torndown');
        delete this._loaded;
      });
  },

  loaded() {
    return this._loaded || Promise.reject('no camera');
  },

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
        var config = this.createConfig();
        this.camera = new MozCamera(this.type, config);
        this.camera.setMaxFileSize(this.maxFileSize);
        this.camera.onError = err => this.onError(err);
        return this.camera.ready;
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

        this.viewfinder.resize(this.camera);
        this.viewfinder.setStream(this.camera.stream);
        return this.camera;
      });

    return this._loaded = this.loading = loaded;
  },

  setType(type) {
    debug('set type', type);
    this.type = type;
    this.viewfinder.hide();
    return this.load()
      .then(() => this.viewfinder.show());
  },

  setMode(mode) {
    debug('set mode', mode);
    if (!this.knownMode(mode)) return Promise.reject('unknown mode');

    this.mode = mode;

    return this.loaded()
      .then(() => this.viewfinder.hide())
      .then(() => {
        debug('setting mode', this.mode);
        return this.camera.configure({ mode: this.mode });
      })

      .then(() => {
        debug('mode set', this.camera.mode);
        if (this.camera.mode !== this.mode) {
          debug('mode changed during config', this.mode);
          return this.camera.configure({ mode: this.mode });
        }
      })

      .then(() => this.viewfinder.show());
  },

  setMaxFileSize(value) {
    this.maxFileSize = value;
    return this.loaded()
      .then(() => this.camera.setMaxFileSize(value));
  },

  takePicture(options) {
    return this.loaded()
      .then(() => this.camera.takePicture(options));
  },

  startRecording(options) {
    return this.loaded()
      .then(() => this.camera.startRecording(options));
  },

  stopRecording() {
    return this.loaded()
      .then(() => this.camera.stopRecording());
  },

  setPictureSize(value) {
    debug('set picture size', value);
    this.pictureSize = value;
    return this.loaded()
      .then(() => this.camera.setPictureSize(this.pictureSize))
      .then(() => {
        if (this.camera.pictureSize !== this.pictureSize) {
          return this.camera.setPictureSize(this.pictureSize);
        }
      });
  },

  getPictureSizes() {

  },

  setRecorderProfile(value) {
    debug('set recorder profile', value);
    this.recorderProfile = value;
    return this.loaded()
      .then(() => this.camera.setRecorderProfile(this.recorderProfile))
      .then(() => {
        if (this.camera.recorderProfile !== this.recorderProfile) {
          return this.camera.setRecorderProfile(this.recorderProfile);
        }
      });
  },

  setSceneMode(value) {
    debug('set scene mode', value);
    this.sceneMode = value;
    return this.loaded()
      .then(() => this.camera.setSceneMode(this.sceneMode))
      .then(result => this.sceneMode = result);
  },

  setFlashMode(value) {
    debug('set flash mode', value);
    this.flashMode = value;
    return this.loaded()
      .then(() => this.camera.setFlashMode(this.flashMode))
      .then(result => this.flashMode = result);
  },

  setEffect() {},

  knownMode(type) {
    return !!{
      'video': 1,
      'picture': 1
    }[type];
  },

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

  createConfig(params) {
    var result = {};

    [
      'mode',
      'pictureSize',
      'recorderProfile',
      'previewSize'
    ].forEach(key => {
      if (this[key]) result[key] = this[key];
    });

    return result;
  },

  get(key) {
    return this.loaded()
      .then(() => this.camera.get(key));
  },

  emit(name, detail) {
    this.el.dispatchEvent(new CustomEvent(name, {
      bubbles: false,
      detail: detail
    }));
  },

  onError(err) {
    this.emit('error', err);
  }
};

/**
 * Exports
 */

var FXOSCamera = component.register('fxos-camera', FXOSCameraPrototype);
FXOSCamera.Internal = Internal;
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

})})(((n1,n2,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n1]=w[n2]=c(r,m.exports,m)||m.exports;};})('fxos-camera','FXOSCamera',this));/*jshint ignore:line*/