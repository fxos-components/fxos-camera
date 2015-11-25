(define => {define((require,exports,module) => {
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[Viewfinder]', ...args) : () => {};

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
    focus: this.createFocusElement(),
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
    var px = this.pointToPx(face.bounds);
    var el = this.els.faces[i];
    var style = el.style;
    var speed = 0.35;
    var scale = px.width / 100;

    requestAnimationFrame(() => {
      style.visibility = 'visible';
      style.transform = `
        translate(-50%,-50%)
        translate(${px.x}px,${px.y}px)
        scale(${scale})`;

      if (el._x) {
        var distance = getDistance(el._x, px.x, el._y, px.y);
        var time = Math.round(distance / speed);
        style.transition = `transform ${time}ms`;
      }

      el._x = px.x;
      el._y = px.y;
    });
  },

  pointToPx(point) {
    debug('point to px', point);
    var gridWidth = 2000;
    var gridHeight = 2000;
    var sensorX = point.x + (point.width / 2);
    var sensorY = point.y + (point.height / 2);
    var relativeX = sensorX / gridWidth;
    var relativeY = sensorY / gridHeight;
    var relativeWidth = point.width / gridWidth;
    var width = relativeWidth * this.size.height;
    var x = relativeX * (this.size.height);
    var y = relativeY * (this.size.width);

    return {
      x: x,
      y: y,
      width: width
    };
  },

  hideFace(el) {
    debug('hide face', el);
    el.style.visibility = 'hidden';
    el.style.transform = '';
    el.style.transition = '';
    el._x = el._y = null;
  },

  setFocus(value, point) {
    debug('set focus', value, point);

    if (!point) return;

    var px = this.pointToPx(point);
    var el = this.els.focus;
    var style = el.style;

    console.log('XXX', px);

    requestAnimationFrame(() => {
      style.visibility = 'visible';
      style.transform = `
        translate(-50%,-50%)
        translate(${px.x}px,${px.y}px)`;
    });
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
      el.style.left = el.style.top = '50%';
      el.style.width = el.style.height = '100px';
      el.style.border = 'solid 2px white';
      el.style.borderRadius = '50%';
      this.hideFace(el);

      this.els.faces.push(el);
      frag.appendChild(el);
    }

    this.el.appendChild(frag);
  },

  createFocusElement() {
    var el = document.createElement('div');
    el.className = 'focus';
    el.style.position = 'absolute';
    el.style.left = el.style.top = '50%';
    el.style.border = 'solid 2px white';
    this.el.appendChild(el);
    return el;
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

function getDistance(x1, x2, y1, y2) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./lib/viewfinder',this));/*jshint ignore:line*/