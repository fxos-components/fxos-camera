'use strict';

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
    var sized = fit(container, previewSize);
    var covers = sized.area / container.area;

    // if the fitted size covers more than
    // 90% of the container then instead
    // scale to fill as this is prettier.
    if (covers > 0.9) {
      sized = fill(container, previewSize);
      covers = sized.area / container.area;
    }

    var landscape = sized;
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
    this.els.inner.style.alignItems = covers >= 1
      ? 'center'
      : '';

    this.size = portrait;
    debug('resized', landscape, transform);
  },

  setFaces(faces) {
    debug('set faces', faces.length);
    if (!this.size) return;
    var unused = this.els.faces.slice(faces.length);
    faces.forEach(this.showFace, this);
    unused.forEach(this.hideFace, this);
    this.numFaces = faces.length;
  },

  showFace(face, i) {
    var px = this.pointToPx(face.bounds);
    var width = Math.min(px.width, 300);
    var el = this.els.faces[i];
    var scale = width / 100;

    requestAnimationFrame(() => {
      var largest = i === 0;
      var style = el.style;

      el.classList.add('active');
      el.classList.toggle('largest', largest);
      style.visibility = 'visible';
      style.transform = `
        translate(-50%,-50%)
        translate(${px.x}px,${px.y}px)
        scale(${scale})`;
    });
  },

  pointToPx(point) {
    debug('point to px', point);
    var gridWidth = 2000;
    var gridHeight = 2000;
    var pointWidth = point.width || Math.abs(point.left - point.right);
    var pointHeight = point.height || Math.abs(point.top - point.bottom);
    var sensorX = point.left + (pointWidth / 2);
    var sensorY = point.top + (pointHeight / 2);
    var relativeX = sensorX / gridWidth;
    var relativeY = sensorY / gridHeight;
    var relativeWidth = pointWidth / gridWidth;
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
    el.classList.remove('active');
    el._x = el._y = null;
  },

  setFocus(value, point) {
    debug('set focus', value, point);
    this.els.focus.dataset.state = value;
    this.setFocusPoint(point);
  },

  setFocusPoint(point) {
    if (!point) return;
    if (!this.size) return;
    debug('set focus point');

    var px = this.pointToPx(point);
    var el = this.els.focus;
    var style = el.style;

    style.transform = `
      translate(-50%,-50%)
      translate(${px.x}px,${px.y}px)`;

    debug('focus point set', px, style.transform);
  },

  hide(options) {
    return new Promise((resolve, reject) => {
      debug('hide');
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
    el.style.transform = 'translate(-50%,-50%)';
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
    var area = width * height;

    // Invert dimensions if the camera's
    // `sensorAngle` is 0 or 180 degrees.
    if (sensorAngle % 180 === 0) {
      return {
        width: width,
        height: height,
        aspect: width / height,
        area: area
      };
    } else {
      return {
        width: height,
        height: width,
        aspect: height / width,
        area: area
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
  }
};

/**
 * Utils
 */

function fill(container, image) {
  debug('scaleTo fill', container, image);
  var sw = container.width / image.width;
  var sh = container.height / image.height;

  // Select the larger scale to fill
  // and overflow viewport with image
  var scale = Math.max(sw, sh);

  var w = image.width * scale;
  var h = image.height * scale;

  return {
    width: w,
    height: h,
    area: w * h
  };
}

function fit(container, image) {
  var sw = container.width / image.width;
  var sh = container.height / image.height;

  // Select the smaller scale to fit image
  // completely within the viewport
  var scale = Math.min(sw, sh);

  var w = image.width * scale;
  var h = image.height * scale;

  return {
    width: w,
    height: h,
    area: w * h
  };
}

function once(el, name, fn, max) {
  var timeout = setTimeout(fn, max);
  el.addEventListener('transitionend', function cb() {
    el.removeEventListener('transitionend', cb);
    clearTimeout(timeout);
    fn();
  });
}
