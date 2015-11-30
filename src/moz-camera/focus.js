(define => {define((require,exports,module) => {
'use strict';

/**
 * Mini logger
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[Focus]', ...args) : () => {};

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
  debug('created', this.maxFaces);
}

Focus.prototype = {

  start() {
    if (this.started) return;
    debug('start');

    this.setMode(this.defaultMode);
    this.startContinuousFocus();
    this.startFaceDetection();
    this.listen();
    this.reset();

    this.started = true;
  },

  stop() {
    if (!this.started) return;
    debug('stop');

    this.stopContinuousFocus();
    this.stopFaceDetection();
    this.unlisten();

    this.started = false;
  },

  listen() {
    if (this.listening) return;
    on(this.mozCamera, 'focus', this.onFocusChange);
    this.listening = true;
    debug('started listening');
  },

  unlisten() {
    if (!this.listening) return;
    off(this.mozCamera, 'focus', this.onFocusChange);
    this.listening = false;
    debug('stopped listening');
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
   * @return {Promise}
   */
  set(rect) {
    if (this.destroyed) return Promise.resolve();
    debug('focus', rect);

    if (rect) {
      this.suspendContinuousFocus(10000);
      this.suspendFaceDetection(10000);
      this.setPoint(rect);
    }

    this.setState('focusing');

    return this.mozCamera.autoFocus()
      .catch(err => {
        debug('focus failed');
        this.setState('failed');
      });
  },

  setPoint(rect) {
    if (!this.hasPointFocus) return;
    debug('focus on point', rect);
    this.mozCamera.setFocusAreas([rect]);
    this.mozCamera.setMeteringAreas([rect]);
  },

  startContinuousFocus() {
    if (!this.continuousMode) return;
    debug('start continuous focus');
    this.setMode(this.continuousMode);
    clearTimeout(this.continuousFocusTimeout);
    this.resetFocusAreas();
  },

  stopContinuousFocus() {
    if (!this.continuousMode) return;
    debug('stop continuous focus');
    clearTimeout(this.continuousFocusTimeout);
    this.setMode(this.modes[0]);
  },

  suspendContinuousFocus(ms) {
    this.stopContinuousFocus();
    clearTimeout(this.continuousFocusTimeout);
    this.continuousFocusTimeout = setTimeout(() => {
      this.startContinuousFocus();
    }, ms);
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
    if (this.faceDetectionStarted) return;
    debug('start face detection');
    clearTimeout(this.faceDetectionTimeout);
    on(this.mozCamera, 'facesdetected', this.onFacesDetected);
    this.mozCamera.startFaceDetection();
    this.faceDetectionStarted = true;
  },

  stopFaceDetection() {
    if (!this.hasFaceDetection) return;
    if (!this.faceDetectionStarted) return;
    debug('stop face detection');

    clearTimeout(this.faceDetectionTimeout);
    off(this.mozCamera, 'facesdetected', this.onFacesDetected);
    this.mozCamera.stopFaceDetection();
    this.clearFaces();

    this.faceDetectionStarted = false;
  },

  clearFaces() {
    this.callbacks.onFacesChanged([]);
  },

  reset() {
    debug('reset');
    this.setPoint();
    this.clearFaces();
    this.setState('unfocused');
  },

  suspendFaceDetection(ms) {
    this.stopFaceDetection();
    clearTimeout(this.faceDetectionTimeout);
    this.faceDetectionTimeout = setTimeout(() => {
      this.startFaceDetection();
    }, ms);
  },

  setState(state) {
    if (state === this.state) return;
    var focusArea = this.mozCamera.getFocusAreas()[0];
    debug('set state', state, this.mozCamera.getFocusAreas());
    this.state = state;
    this.callbacks.onFocusChanged(state, focusArea);
  },

  onFocusChange(e) {
    debug('focus change', e);
    this.setState(e.newState);
  },

  onFacesDetected(e) {
    if (!this.faceDetectionStarted) return;
    debug('faces detected', e.faces.length);
    var faces = e.faces;
    var winner = faces[0];

    if (winner) this.setPoint(winner.bounds);
    this.callbacks.onFacesChanged(faces);
    this.unlisten();

    clearTimeout(this.faceDetectionTimeout);
    this.faceDetectionTimeout = setTimeout(() => {
    console.log('XXX');
      this.onFaceDetectionEnd();
    }, 1000);
  },

  onFaceDetectionEnd() {
    debug('face detection ended');
    this.clearFaces();
    this.listen();
    this.reset();
  },

  destroy() {
    if (this.destroyed) return;
    debug('destroy');
    this.stop();
    this.destroyed = true;
  },
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

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./focus',this));/*jshint ignore:line*/
