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
var internal = 0 ? 'internal' : Symbol();

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

  set(key, value) {
    return this[internal].set(key, value);
  },

  setSceneMode(value) {
    return this[internal].setSceneMode(value);
  },

  takePicture(filePath, options) {
    return this[internal].takePicture(filePath, options);
  },

  startRecording(options) {
    return this[internal].startRecording(options);
  },

  stopRecording() {
    return this[internal].stopRecording();
  },

  focus(point) {
    return this[internal].focus(point);
  },

  attrs: {
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

  this.mode = 'picture';
  this.type = 'back';

  this.onVisibilityChange = this.onVisibilityChange.bind(this);
  this.onFocusChanged = this.onFocusChanged.bind(this);
  this.onFacesChanged = this.onFacesChanged.bind(this);
}

Internal.prototype = {
  attached() {
    this.start();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  },

  detached() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  },

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
      .catch(this.stopped.reject);
  },

  loaded() {
    return Promise.all([
      this.started.promise,
      this._loaded
    ]);
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

        this.camera = new MozCamera({
          type: this.type,
          mode: this.mode,
          onFocusChanged: this.onFocusChanged,
          onFacesChanged: this.onFacesChanged,
          onError: e => this.onError(e)
        });

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

        this.viewfinder.update(this.camera);
        return this.camera.streamInto(this.viewfinder.els.video);
      });

    return this._loaded = this.loading = loaded;
  },

  setType(type) {
    debug('set type', type);
    if (!this.knownType(type)) return Promise.reject('unknown type');
    this.type = type;
    this.viewfinder.hide();
    return this.load()
      .then(() => this.viewfinder.show());
  },

  knownType(type) {
    return !!~navigator.mozCameras
      .getListOfCameras()
      .indexOf(type);
  },

  setMode(mode, options={}) {
    debug('set mode', mode);
    if (!this.knownMode(mode)) return Promise.reject('unknown mode');
    var hide = options.hide !== false;

    this.mode = mode;
    return this.loaded()
      .then(() => hide && this.viewfinder.hide())

      .then(() => {
        debug('setting mode', this.mode);
        return this.camera.configure({ mode: this.mode });
      })

      .then(() => {
        debug('mode set', this.camera.mode);
        if (this.camera.mode !== this.mode) {
          debug('mode changed during config', this.mode);
          return this.setMode(this.mode, { hide: false });
        }
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

  setMaxFileSize(value) {
    this.maxFileSize = value;
    return this.loaded()
      .then(() => this.camera.setMaxFileSize(value));
  },

  takePicture(filePath, options) {
    return this.loaded()
      .then(() => {
        if (!filePath) throw error(1);
        return this.camera.takePicture(filePath, options);
      });
  },

  startRecording(options) {
    return this.loaded()
      .then(() => this.camera.startRecording(options));
  },

  stopRecording() {
    return this.loaded()
      .then(() => this.camera.stopRecording());
  },

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
          diameter: 10
        });

        return this.camera.setFocus(point);
      });
  },

  // TODO should onnly fade out if in picture mode
  setPictureSize(value) {
    debug('set picture size', value);
    this.pictureSize = value;
    return this.loaded()
      .then(() => this.camera.setPictureSize(this.pictureSize))
      .then(() => {
        if (this.camera.pictureSize !== this.pictureSize) {
          return this.camera.setPictureSize(this.pictureSize);
        }
      })

      .then(() => this.viewfinder.update(this.camera));
  },

  // TODO should only fade out if in video mode
  setRecorderProfile(value) {
    debug('set recorder profile', value);
    this.recorderProfile = value;
    return this.loaded()
      .then(() => this.camera.setRecorderProfile(this.recorderProfile))
      .then(() => {
        if (this.camera.recorderProfile !== this.recorderProfile) {
          return this.camera.setRecorderProfile(this.recorderProfile);
        }
      })

      .then(() => this.viewfinder.update(this.camera));
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

  setHdrMode(value) {
    debug('set flash mode', value);
    this.hdrMode = value;
    return this.loaded()
      .then(() => this.camera.setHdrMode(this.hdrMode))
      .then(result => this.hdrMode = result);
  },

  setZoom(value) {
    debug('set zoom', value);
    this.zoom = value;
    return this.loaded()
      .then(() => this.camera.setZoom(value))
      .then(result => {
        debug('zoom set', result, value, this.zoom);

        // FIXME: This is a bit gross
        if (this.zoom !== value || result.input !== value) {
          debug('zoom since changed', this.zoom);
          return this.setZoom(this.zoom);
        }

        return this.zoom = result.value;
      });
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

  get(key) {
    return this.loaded()
      .then(() => {
        switch (key) {
          case 'viewfinderSize': return this.viewfinder.size;
          case 'camera': return this.camera.get('type');
          default: return this.camera.get(key);
        }
      });
  },

  set(key, value) {
    debug('set', key, value);
    switch (key) {
      case 'recorderProfile': return this.setRecorderProfile(value);
      case 'pictureSize': return this.setPictureSize(value);
      case 'maxFileSize': return this.setMaxFileSize(value);
      case 'sceneMode': return this.setSceneMode(value);
      case 'flashMode': return this.setFlashMode(value);
      case 'hdrMode': return this.setHdrMode(value);
      case 'camera': return this.setType(value);
      case 'mode': return this.setMode(value);
      case 'zoom': return this.setZoom(value);
      default: return Promise.reject(new Error('unknown setting'));
    }
  },

  emit(name, detail) {
    this.el.dispatchEvent(new CustomEvent(name, {
      bubbles: false,
      detail: detail
    }));
  },

  onError(err) {
    this.emit('error', err);
  },

  onFocusChanged(value, point) {
    debug('focus changed', value, point);
    this.viewfinder.setFocus(value, point);
  },

  onFacesChanged(faces) {
    debug('faces changed', faces);
    this.viewfinder.setFaces(faces);
  },

  onVisibilityChange() {
    debug('visibilitychange', document.hidden);
    if (document.hidden) this.stop();
    else this.start();
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
    1: `please provide a path (eg. 'path/to/my-image.jpg')`
  }[id]);
}

})})(((n1,n2,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n1]=w[n2]=c(r,m.exports,m)||m.exports;};})('fxos-camera','FXOSCamera',this));/*jshint ignore:line*/