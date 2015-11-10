(define => {define((require,exports,module) => {
'use strict';

/**
 * Dependencies
 */

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

      opacity: 1;
      transition: opacity 200ms ease-in-out;
      background: black;
    }

    :host.hidden {
      opacity: 0;
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
      transition: opacity 360ms ease-in-out;
    }

    /**
     * scale-type=fill
     */

    .inner[scale-type=fill] {
      align-items: center;
    }

    /** Frame
     ---------------------------------------------------------*/

    /**
     * 1. The grid should never overflow the viewport.
     */

    .frame {
      display: flex;
      position: relative;
      max-width: 100%; /* 1 */
      max-height: 100%; /* 1 */
      justify-content: center;
      align-items: center;
    }

    /** Video wrapper
     ---------------------------------------------------------*/

    .wrapper {
      flex-shrink: 0;
    }

    /**
     * .shutter
     */

    .wrapper.shutter {
      animation: 400ms shutter-animation;
    }

    /** Video
     ---------------------------------------------------------*/

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

  this.complete = new Deferred();
  this.fadeRequests = 0;
  this.pending = {};

  this.mode = 'picture';
  this.type = 'back';
}

Internal.prototype = {
  setup() {
    if (this.isSetup) return this.isSetup;
    debug('setting up ...');

    delete this.isTorndown;

    return this.isSetup = this.fadeOut({ instant: true })
      .then(() => this.load())
      .then(() => this.fadeIn())
      .then(this.complete.resolve);
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
    debug('load', this.loading);
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

        this.updatePreview(this.camera.previewSize);
        this.setStream(this.camera.mozCamera);
        return this.camera;
      });

    return this._loaded = this.loading = loaded;
  },

  setStream(src) {
    debug('set stream');
    this.els.video.mozSrcObject = src;
    this.els.video.play();
  },

  setType(type) {
    debug('set type', type);
    this.type = type;
    this.fadeOut();
    return this.load()
      .then(() => this.fadeIn());
  },

  setMode(mode) {
    debug('set mode', mode);
    if (!this.knownMode(mode)) return Promise.reject('unknown mode');

    this.mode = mode;

    return this.loaded()
      .then(() => this.fadeOut())
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

      .then(() => this.fadeIn());
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

  fadeOut(options) {
    return new Promise((resolve, reject) => {
      this.fadeRequests++;
      if (this.hidden) return resolve();
      debug('fading out');

      var instant = options && options.instant;
      this.el.style.transitionDuration = instant ? '0ms' : '';
      this.el.style.opacity = 0;

      if (instant) resolve();
      else once(this.el, 'transitionend', resolve, 200);

      this.hidden = true;
    });
  },

  fadeIn(options) {
    return new Promise((resolve, reject) => {
      if (--this.fadeRequests) return resolve();
      if (!this.hidden) return resolve();
      debug('fading in');

      var instant = options && options.instant;
      this.el.style.transitionDuration = instant ? '0ms' : '';
      this.el.style.opacity = 1;

      if (instant) resolve();
      else once(this.el, 'transitionend', resolve, 200);

      this.hidden = false;
    });
  },

  updatePreview(previewSize) {
    debug('update preview');
    var mirrored = this.type === 'front';
    var container = this.getContainerGeometry();
    var sizes = {
      fill: scaleTo.fill(container, previewSize),
      fit: scaleTo.fit(container, previewSize)
    };

    var scaleType = this.getScaleType(sizes);
    var landscape = sizes[scaleType];
    var portrait = {
      width: landscape.height,
      height: landscape.width
    };

    // Set the size of the frame to match 'portrait' dimensions
    this.els.frame.style.width = portrait.width + 'px';
    this.els.frame.style.height = portrait.height + 'px';

    var transform = '';
    if (mirrored) transform += 'scale(-1, 1) ';
    transform += `rotate(${this.get('sensorAngle')}deg)`;

    // Set the size of the video container to match the
    // 'landscape' dimensions (CSS is used to rotate
    // the 'landscape' video stream to 'portrait')
    this.els.wrapper.style.width = landscape.width + 'px';
    this.els.wrapper.style.height = landscape.height + 'px';
    this.els.wrapper.style.transform = transform;

    // CSS aligns the contents slightly
    // differently depending on the scaleType
    this.el.setAttr('scaleType', scaleType);
    this.viewfinderSize = portrait;

    debug('updated preview size/position', landscape, transform);
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

  getWidth() {
    return this.el.clientWidth;
  },

  getHeight() {
    return this.el.clientHeight;
  },

  getContainerGeometry() {
    var width = this.getWidth();
    var height = this.getHeight();

    // Invert dimensions if the camera's
    // `sensorAngle` is 0 or 180 degrees.
    if (this.get('sensorAngle') % 180 === 0) {
      return {
        width: width,
        height: height,
        aspect: width / height
      };
    } else {
      return {
        width: height,
        height: width,
        aspect: height / width
      };
    }
  },

  getScaleType(sizes) {
    debug('get scale type', sizes);
    return typeof this.el.scaleType === 'function'
      ? this.el.scaleType(sizes)
      : this.el.scaleType || 'fit';
  },

  get(key) {
    return this[key] || this.camera.get(key);
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

var scaleTo = {
  fill(container, image) {
    debug('scaleTo fill', container, image);
    var sw = container.width / image.width;
    var sh = container.height / image.height;

    // Select the larger scale to fill and overflow viewport with image
    var scale = Math.max(sw, sh);

    return {
      width: image.width * scale,
      height: image.height * scale
    };
  },

  fit(container, image) {
    var sw = container.width / image.width;
    var sh = container.height / image.height;

    // Select the smaller scale to fit image completely within the viewport
    var scale = Math.min(sw, sh);

    return {
      width: image.width * scale,
      height: image.height * scale
    };
  }
};

function once(el, name, fn, max) {
  var timeout = setTimeout(fn, max);
  el.addEventListener('transitionend', function cb() {
    el.removeEventListener('transitionend', cb);
    clearTimeout(timeout);
    fn();
  });
}

function Deferred() {
  this.promise = new Promise((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

})})(((n1,n2,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n1]=w[n2]=c(r,m.exports,m)||m.exports;};})('fxos-camera','FXOSCamera',this));/*jshint ignore:line*/