(define => {define((require,exports,module) => {
'use strict';

var debug = 0 ? (...args) => console.log('[Focus]', ...args) : () => {};

/**
 * Exports
 */

module.exports = Focus;

var on = (el, name, fn) => el.addEventListener(name, fn);
var off = (el, name, fn) => el.removeEventListener(name, fn);

function Focus(camera) {
  debug('create');
  this.mozCamera = camera.mozCamera;
  this.cameraMode = camera.mode;
  this.modes = this.mozCamera.capabilities.focusModes;
  this.faces = [];
  this.callbacks = {
    onFacesChanged: camera.onFacesChanged,
    onFocusChanged: camera.onFocusChanged
  };

  this.hasPointFocus = hasPointFocus(this.mozCamera);
  this.continuousMode = this.getContinuousMode();
  this.maxFaces = getMaxFaces(this.mozCamera);
  this.hasFaceDetection = !!this.maxFaces;
  this.defaultMode = this.getDefaultMode();

  this.onFacesDetected = this.onFacesDetected.bind(this);
  this.onFocusChange = this.onFocusChange.bind(this);

  this.start();
  debug('created', this.defaultMode);
}

Focus.prototype = {
  start() {
    debug('start');
    on(this.mozCamera, 'focus', this.onFocusChange);
    this.setMode(this.defaultMode);
    this.startContinuousFocus();
    this.startFaceDetection();
  },

  stop() {
    debug('stop');
    off(this.mozCamera, 'focus', this.onFocusChange);
    this.stopContinuousFocus();
    this.stopFaceDetection();
  },

  destroy() {
    if (this.destroyed) return;
    debug('destroy');
    this.stop();
    this.destroyed = true;
  },

  /**
   * In either focus mode, we call autoFocus()
   * to ensure that the user gets a sharp picture.
   *
   * The difference between the two modes is
   * that if C-AF is on, it is likely that the
   * camera is already focused, so the call to
   * .autoFocus() invokes its callback very
   * quickly and we get much better
   * response time.
   *
   * In either case, the callback is passed
   * a boolean specifying whether focus was
   * successful or not, and we display a
   * green or red focus ring then call
   * the done callback, which takes the
   * picture and clears the focus ring.
   *
   * @return {Promise}
   */
  focus() {
    if (this.destroyed) return Promise.resolve();
    debug('focus');

    this.setState('focusing');
    this.mozCamera.autoFocus()
      .then(result => {
        this.focused = !!result;
        return result;
      })

      .catch(err => {
        this.focused = false;
        throw err;
      });
  },

  startContinuousFocus() {
    if (!this.continuousMode) return;
    this.setMode(this.continuousMode);
    this.resetFocusAreas();
  },

  stopContinuousFocus() {
    if (!this.continuousMode) return;
    this.setMode(this.modes[0]);
  },

  focusPoint(rect) {
    if (!this.hasPointFocus) return;

    this.setState('focusing');
    this.stopContinuousFocus();
    this.suspendFaceDetection(10000);
    this.mozCamera.setFocusAreas([rect]);
    this.mozCamera.setMeteringAreas([rect]);

    return this.focus();
  },

  resetFocusAreas() {
    if (!this.hasPointFocus) return;
    this.mozCamera.setFocusAreas([]);
    this.mozCamera.setMeteringAreas([]);
  },

  getDefaultMode() {
    return this.getContinuousMode() || this.modes[0];
  },

  getContinuousMode() {
    var mode = `continuous-${this.cameraMode}`;
    return this.hasMode(mode) && mode;
  },

  setMode(mode) {
    debug('set mode', mode);
    if (this.mode === mode) return;
    this.mozCamera.focusMode = mode;
    this.mode = mode;
  },

  hasMode(mode) {
    return !!~this.modes.indexOf(mode);
  },

  startFaceDetection() {
    if (!this.hasFaceDetection) return;
    if (this.faceDetectionOn) return;
    debug('start face detection');
    on(this.mozCamera, 'facesdetected', this.onFacesDetected);
    this.mozCamera.startFaceDetection();
    this.faceDetectionOn = true;
  },

  stopFaceDetection() {
    if (!this.hasFaceDetection) return;
    if (!this.faceDetectionOn) return;
    debug('stop face detection');
    off(this.mozCamera, 'facesdetected', this.onFacesDetected);
    this.mozCamera.stopFaceDetection();
    this.clearFaces();
    this.faceDetectionOn = false;
  },

  clearFaces() {
    this.setFaces([]);
  },

  setFaces(faces) {
    this.faces = faces;
    this.callbacks.onFacesChanged(faces);
  },

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.callbacks.onFocusChanged(state);
  },

  onFocusChange(e) {
    this.setState(e.newState);
  },

  onFacesDetected(e) {
    if (!this.faceDetectionOn) return;
    debug('faces detected', e.faces.length);
    this.setFaces(e.faces);
  }
};

/**
 * Utils
 */

function hasPointFocus(mozCamera) {
  var maxFocusAreas = mozCamera.capabilities.maxFocusAreas;
  return maxFocusAreas > 0;
}

function getMaxFaces(mozCamera) {
  var maxFaces = mozCamera.capabilities.maxDetectedFaces;
  var hasApi = !!mozCamera.startFaceDetection;
  return hasApi ? maxFaces : 0;
}

function getFaceGeometry(face) {
  var diameter = Math.max(face.width, face.height);
  var radius = diameter / 2;

  return {
    x: Math.round(face.left + face.width / 2 - radius),
    y: Math.round(face.top + face.height / 2 - radius),
    diameter: diameter
  };
}

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./focus',this));/*jshint ignore:line*/
