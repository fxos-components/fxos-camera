(define => {define((require,exports,module) => {
'use strict';

/**
 * Dependencies
 */

var coordinates = require('./camera-coordinates');

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[Viewfinder]', ...args) : () => {};

/**
 * Exports
 */

module.exports = Viewfinder;

function Viewfinder(params) {
  var shadow = params.el.shadowRoot;

  this.el = params.el;
  this.hidden = 0;

  this.els = {
    inner: shadow.querySelector('.inner'),
    frame: shadow.querySelector('.frame'),
    wrapper: shadow.querySelector('.wrapper'),
    video: shadow.querySelector('video'),
    faces: []
  };
}

Viewfinder.prototype = {
  fadeDuration: 200,

  update(camera) {
    debug('update');
    this.resize(camera);
    this.createFaces(camera.focus.maxFaces);
    this.camera = camera;
  },

  resize(camera) {
    debug('resize', camera.previewSize);
    var sensorAngle = camera.sensorAngle;
    var container = this.getContainerGeometry(sensorAngle);
    var previewSize = camera.previewSize;
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

    this.mirrored = camera.type === 'front';

    // Set the size of the frame to match 'portrait' dimensions
    this.els.frame.style.width = portrait.width + 'px';
    this.els.frame.style.height = portrait.height + 'px';

    var transform = '';
    if (this.mirrored) transform += 'scale(-1, 1) ';
    transform += `rotate(${sensorAngle}deg)`;

    // Set the size of the video container to match the
    // 'landscape' dimensions (CSS is used to rotate
    // the 'landscape' video stream to 'portrait')
    this.els.wrapper.style.width = landscape.width + 'px';
    this.els.wrapper.style.height = landscape.height + 'px';
    this.els.wrapper.style.transform = transform;

    // The wrapper is vertically centered when 'fill'
    this.els.inner.style.alignItems = scaleType == 'fill'
      ? 'center' : '';

    this.size = portrait;
    debug('resized', landscape, transform);
  },

  setFaces(faces) {
    debug('set faces', faces);
    var unused = this.els.faces.slice(faces.length);
    faces.forEach(this.setFace, this);
    unused.forEach(this.hideFace, this);
  },

  setFace(face, i) {
    var style = this.els.faces[i].style;
    var px = coordinates.faceToPixels({
      bounds: face.bounds,
      viewport: this.size,
      sensorAngle: this.camera.sensorAngle,
      mirrored: this.mirrored
    });

    var scale = px.width / 100;
    style.transform = `translate(${px.left}px, ${px.top}px) scale(${scale})`;
    style.visibility = 'visible';

    debug('set face', px);
  },

  hideFace(el) {
    debug('hide face', el);
    el.style.visibility = 'hidden';
  },

  setFocus(value) {
    debug('set focus', value);
  },

  hide(options) {
    return new Promise((resolve, reject) => {
      if (this.hidden++) return resolve();
      debug('hiding ...');

      var instant = options && options.instant;
      var duration = instant ? 0 : this.fadeDuration;
      var el = this.els.frame;

      el.style.transition = `opacity ${duration}ms`;
      el.style.opacity = 0;

      if (instant) resolve();
      else once(this.el, 'transitionend', resolve, 280);
    }).then(() => debug('hidden'));
  },

  show(options) {
    return new Promise((resolve, reject) => {
      debug('showing ...');
      if (--this.hidden !== 0) return resolve();

      var instant = options && options.instant;
      var duration = instant ? 0 : this.fadeDuration;
      var el = this.els.frame;

      el.style.transition = `opacity ${duration}ms`;
      el.style.opacity = 1;

      if (instant) resolve();
      else once(this.el, 'transitionend', resolve, 280);
    }).then(() => debug('shown'));
  },

  createFaces(count) {
    debug('create faces', count);
    this.clearFaces();
    var frag = document.createDocumentFragment();

    while (count--) {
      var el = document.createElement('div');

      el.className = 'face';
      el.style.position = 'absolute';
      el.style.left = el.style.top = 0;
      el.style.width = el.style.height = '100px';
      el.style.background = 'grey';
      el.style.borderRadius = '50%';
      this.hideFace(el);

      this.els.faces.push(el);
      frag.appendChild(el);
    }

    this.el.appendChild(frag);
  },

  clearFaces() {
    this.els.faces.forEach(el => el.remove());
    this.els.faces.length = 0;
  },

  getContainerGeometry(sensorAngle) {
    var width = this.getWidth();
    var height = this.getHeight();

    // Invert dimensions if the camera's
    // `sensorAngle` is 0 or 180 degrees.
    if (sensorAngle % 180 === 0) {
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

  getWidth() {
    return this.el.flush
      ? parent.innerWidth
      : this.el.clientWidth;
  },

  getHeight() {
    return this.el.flush
      ? parent.innerHeight
      : this.el.clientHeight;
  },

  getScaleType(sizes) {
    debug('get scale type', sizes);
    return typeof this.el.scaleType === 'function'
      ? this.el.scaleType(sizes)
      : this.el.scaleType || 'fit';
  }
};

/**
 * Utils
 */

var scaleTo = {
  fill(container, image) {
    debug('scaleTo fill', container, image);
    var sw = container.width / image.width;
    var sh = container.height / image.height;

    // Select the larger scale to fill
    // and overflow viewport with image
    var scale = Math.max(sw, sh);

    return {
      width: image.width * scale,
      height: image.height * scale
    };
  },

  fit(container, image) {
    var sw = container.width / image.width;
    var sh = container.height / image.height;

    // Select the smaller scale to fit image
    // completely within the viewport
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

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./lib/viewfinder',this));/*jshint ignore:line*/