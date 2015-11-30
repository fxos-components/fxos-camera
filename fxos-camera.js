(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.FXOSCamera = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* globals define */
;(function(define){'use strict';define(function(require,exports,module){
/**
 * Locals
 */
var textContent = Object.getOwnPropertyDescriptor(Node.prototype,
    'textContent');
var innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
var removeAttribute = Element.prototype.removeAttribute;
var setAttribute = Element.prototype.setAttribute;
var noop  = function() {};

/**
 * Register a new component.
 *
 * @param  {String} name
 * @param  {Object} props
 * @return {constructor}
 * @public
 */
exports.register = function(name, props) {
  var baseProto = getBaseProto(props.extends);
  var template = props.template || baseProto.templateString;

  // Components are extensible by default but can be declared
  // as non extensible as an optimization to avoid
  // storing the template strings
  var extensible = props.extensible = props.hasOwnProperty('extensible')?
    props.extensible : true;

  // Clean up
  delete props.extends;

  // Pull out CSS that needs to be in the light-dom
  if (template) {
    // Stores the string to be reprocessed when
    // a new component extends this one
    if (extensible && props.template) {
      props.templateString = props.template;
    }

    var output = processCss(template, name);

    props.template = document.createElement('template');
    props.template.innerHTML = output.template;
    props.lightCss = output.lightCss;

    props.globalCss = props.globalCss || '';
    props.globalCss += output.globalCss;
  }

  // Inject global CSS into the document,
  // and delete as no longer needed
  injectGlobalCss(props.globalCss);
  delete props.globalCss;

  // Merge base getter/setter attributes with the user's,
  // then define the property descriptors on the prototype.
  var descriptors = mixin(props.attrs || {}, base.descriptors);

  // Store the orginal descriptors somewhere
  // a little more private and delete the original
  props._attrs = props.attrs;
  delete props.attrs;

  // Create the prototype, extended from base and
  // define the descriptors directly on the prototype
  var proto = createProto(baseProto, props);
  Object.defineProperties(proto, descriptors);

  // Register the custom-element and return the constructor
  try {
    return document.registerElement(name, { prototype: proto });
  } catch (e) {
    if (e.name !== 'NotSupportedError') {
      throw e;
    }
  }
};

var base = {
  properties: {
    GaiaComponent: true,
    attributeChanged: noop,
    attached: noop,
    detached: noop,
    created: noop,

    createdCallback: function() {
      if (this.dirObserver) { addDirObserver(); }
      injectLightCss(this);
      this.created();
    },

    /**
     * It is very common to want to keep object
     * properties in-sync with attributes,
     * for example:
     *
     *   el.value = 'foo';
     *   el.setAttribute('value', 'foo');
     *
     * So we support an object on the prototype
     * named 'attrs' to provide a consistent
     * way for component authors to define
     * these properties. When an attribute
     * changes we keep the attr[name]
     * up-to-date.
     *
     * @param  {String} name
     * @param  {String||null} from
     * @param  {String||null} to
     */
    attributeChangedCallback: function(name, from, to) {
      var prop = toCamelCase(name);
      if (this._attrs && this._attrs[prop]) { this[prop] = to; }
      this.attributeChanged(name, from, to);
    },

    attachedCallback: function() {
      if (this.dirObserver) {
        this.setInnerDirAttributes = setInnerDirAttributes.bind(null, this);
        document.addEventListener('dirchanged', this.setInnerDirAttributes);
      }
      this.attached();
    },

    detachedCallback: function() {
      if (this.dirObserver) {
        document.removeEventListener('dirchanged', this.setInnerDirAttributes);
      }
      this.detached();
    },

    /**
     * A convenient method for setting up
     * a shadow-root using the defined template.
     *
     * @return {ShadowRoot}
     */
    setupShadowRoot: function() {
      if (!this.template) { return; }
      var node = document.importNode(this.template.content, true);
      this.createShadowRoot().appendChild(node);
      if (this.dirObserver) { setInnerDirAttributes(this); }
      return this.shadowRoot;
    },

    /**
     * Sets an attribute internally
     * and externally. This is so that
     * we can style internal shadow-dom
     * content.
     *
     * @param {String} name
     * @param {String} value
     */
    setAttr: function(name, value) {
      var internal = this.shadowRoot.firstElementChild;
      setAttribute.call(internal, name, value);
      setAttribute.call(this, name, value);
    },

    /**
     * Removes an attribute internally
     * and externally. This is so that
     * we can style internal shadow-dom
     * content.
     *
     * @param {String} name
     * @param {String} value
     */
    removeAttr: function(name) {
      var internal = this.shadowRoot.firstElementChild;
      removeAttribute.call(internal, name);
      removeAttribute.call(this, name);
    }
  },

  descriptors: {
    textContent: {
      set: function(value) {
        textContent.set.call(this, value);
        if (this.lightStyle) { this.appendChild(this.lightStyle); }
      },

      get: function() {
        return textContent.get();
      }
    },

    innerHTML: {
      set: function(value) {
        innerHTML.set.call(this, value);
        if (this.lightStyle) { this.appendChild(this.lightStyle); }
      },

      get: innerHTML.get
    }
  }
};

/**
 * The default base prototype to use
 * when `extends` is undefined.
 *
 * @type {Object}
 */
var defaultPrototype = createProto(HTMLElement.prototype, base.properties);

/**
 * Returns a suitable prototype based
 * on the object passed.
 *
 * @private
 * @param  {HTMLElementPrototype|undefined} proto
 * @return {HTMLElementPrototype}
 */
function getBaseProto(proto) {
  if (!proto) { return defaultPrototype; }
  proto = proto.prototype || proto;
  return !proto.GaiaComponent ?
    createProto(proto, base.properties) : proto;
}

/**
 * Extends the given proto and mixes
 * in the given properties.
 *
 * @private
 * @param  {Object} proto
 * @param  {Object} props
 * @return {Object}
 */
function createProto(proto, props) {
  return mixin(Object.create(proto), props);
}

/**
 * Detects presence of shadow-dom
 * CSS selectors.
 *
 * @private
 * @return {Boolean}
 */
var hasShadowCSS = (function() {
  var div = document.createElement('div');
  try { div.querySelector(':host'); return true; }
  catch (e) { return false; }
})();

/**
 * Regexs used to extract shadow-css
 *
 * @type {Object}
 */
var regex = {
  shadowCss: /(?:\:host|\:\:content)[^{]*\{[^}]*\}/g,
  ':host': /(?:\:host)/g,
  ':host()': /\:host\((.+)\)(?: \:\:content)?/g,
  ':host-context': /\:host-context\((.+)\)([^{,]+)?/g,
  '::content': /(?:\:\:content)/g
};

/**
 * Extracts the :host and ::content rules
 * from the shadow-dom CSS and rewrites
 * them to work from the <style scoped>
 * injected at the root of the component.
 *
 * @private
 * @return {String}
 */
function processCss(template, name) {
  var globalCss = '';
  var lightCss = '';

  if (!hasShadowCSS) {
    template = template.replace(regex.shadowCss, function(match) {
      var hostContext = regex[':host-context'].exec(match);

      if (hostContext) {
        globalCss += match
          .replace(regex['::content'], '')
          .replace(regex[':host-context'], '$1 ' + name + '$2')
          .replace(/ +/g, ' '); // excess whitespace
      } else {
        lightCss += match
          .replace(regex[':host()'], name + '$1')
          .replace(regex[':host'], name)
          .replace(regex['::content'], name);
      }

      return '';
    });
  }

  return {
    template: template,
    lightCss: lightCss,
    globalCss: globalCss
  };
}

/**
 * Some CSS rules, such as @keyframes
 * and @font-face don't work inside
 * scoped or shadow <style>. So we
 * have to put them into 'global'
 * <style> in the head of the
 * document.
 *
 * @private
 * @param  {String} css
 */
function injectGlobalCss(css) {
  if (!css) {return;}
  var style = document.createElement('style');
  style.innerHTML = css.trim();
  headReady().then(function() {
    document.head.appendChild(style);
  });
}


/**
 * Resolves a promise once document.head is ready.
 *
 * @private
 */
function headReady() {
  return new Promise(function(resolve) {
    if (document.head) { return resolve(); }
    window.addEventListener('load', function fn() {
      window.removeEventListener('load', fn);
      resolve();
    });
  });
}


/**
 * The Gecko platform doesn't yet have
 * `::content` or `:host`, selectors,
 * without these we are unable to style
 * user-content in the light-dom from
 * within our shadow-dom style-sheet.
 *
 * To workaround this, we clone the <style>
 * node into the root of the component,
 * so our selectors are able to target
 * light-dom content.
 *
 * @private
 */
function injectLightCss(el) {
  if (hasShadowCSS) { return; }
  var stylesheet = el.querySelector('style');

  if (!stylesheet) {
    stylesheet = document.createElement('style');
    stylesheet.setAttribute('scoped', '');
    stylesheet.appendChild(document.createTextNode(el.lightCss));
    el.appendChild(stylesheet);
  }

  el.lightStyle = stylesheet;
}

/**
 * Convert hyphen separated
 * string to camel-case.
 *
 * Example:
 *
 *   toCamelCase('foo-bar'); //=> 'fooBar'
 *
 * @private
 * @param  {String} string
 * @return {String}
 */
function toCamelCase(string) {
  return string.replace(/-(.)/g, function replacer(string, p1) {
    return p1.toUpperCase();
  });
}

/**
 * Observer (singleton)
 *
 * @type {MutationObserver|undefined}
 */
var dirObserver;

/**
 * Workaround for bug 1100912: applies a `dir` attribute to all shadowRoot
 * children so that :-moz-dir() selectors work on shadow DOM elements.
 *
 * In order to keep decent performances, the `dir` is the component dir if
 * defined, or the document dir otherwise. This won't work if the component's
 * direction is defined by CSS or inherited from a parent container.
 *
 * This method should be removed when bug 1100912 is fixed.
 *
 * @private
 * @param  {WebComponent}
 */
function setInnerDirAttributes(component) {
  var dir = component.dir || document.dir;
  Array.from(component.shadowRoot.children).forEach(element => {
    if (element.nodeName !== 'STYLE') {
      element.dir = dir;
    }
  });
}

/**
 * Observes the document `dir` (direction) attribute and when it changes:
 *  - dispatches a global `dirchanged` event;
 *  - forces the `dir` attribute of all shadowRoot children.
 *
 * Components can listen to this event and make internal changes if needed.
 *
 * @private
 */
function addDirObserver() {
  if (dirObserver) { return; }

  dirObserver = new MutationObserver(onChanged);
  dirObserver.observe(document.documentElement, {
    attributeFilter: ['dir'],
    attributes: true
  });

  function onChanged(mutations) {
    document.dispatchEvent(new Event('dirchanged'));
  }
}

/**
 * Copy the values of all properties from
 * source object `target` to a target object `source`.
 * It will return the target object.
 *
 * @private
 * @param   {Object} target
 * @param   {Object} source
 * @returns {Object}
 */
function mixin(target, source) {
  for (var key in source) {
    target[key] = source[key];
  }
  return target;
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('gaia-component',this));

},{}],2:[function(require,module,exports){
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

},{"./lib/moz-camera":7,"./lib/viewfinder":11,"gaia-component":1}],3:[function(require,module,exports){
'use strict';

function Cookies() {}

Cookies.prototype = {
  get(key) {
    if (!key) return;
    return decodeURIComponent(document.cookie.replace(new RegExp('(?:(?:^|.*;)\\s*' + encodeURIComponent(key).replace(/[\-\.\+\*]/g, '\\$&') + '\\s*\\=\\s*([^;]*).*$)|^.*$'), '$1')) || undefined; /*jshint ignore:line*/
  },

  set(key, value) {
    var forever = 'Fri, 31 Dec 9999 23:59:59 GMT';
    key = encodeURIComponent(key);
    value = encodeURIComponent(value);
    document.cookie = `${key}=${value}; expires=${forever}; path=/;`;
  },

  clear(key) {
    if (!arguments.length) return this.clearAll();
    if (!this.has(key)) return;
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${encodeURIComponent(key)}=; expires=${past}; path=/;`;
  },

  clearAll() {
    decodeURIComponent(document.cookie)
      .split(';')
      .forEach(cookie => {
        var equal = cookie.indexOf('=');
        var name = ~equal ? cookie.substr(0, equal) : cookie;
        this.clear(name);
      });
  },

  has(key) {
    return !!~document.cookie.indexOf(`${encodeURIComponent(key)}=`);
  }
};

/**
 * Exports
 */

module.exports = new Cookies();

},{}],4:[function(require,module,exports){
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[DeviceStorage]', ...args) : () => {};

/**
 * Exports
 */

module.exports = DeviceStorage;

function DeviceStorage(type) {
  debug('new', type);
  this.storage = navigator.getDeviceStorage(type);
}

DeviceStorage.prototype = {
  add(blob, filePath) {
    var result = {};
    return new Promise((resolve, reject) => {
        debug('add', blob, filePath);
        var req = this.storage.addNamed(blob, filePath);
        req.onerror = reject;
        req.onsuccess = e => resolve(e.target.result);
      })

      .then(absolutePath => {
        debug('added', absolutePath);
        result.absolutePath = absolutePath;
        return this.get(filePath);
      })

      .then(file => {
        result.file = file;
        return result;
      });
  },

  get(filePath) {
    debug('get', filePath);
    return this.storage.get(filePath);
  },

  delete(filePath) {
    return new Promise((resolve, reject) => {
      debug('delete', filePath);
      var req = this.storage.delete(filePath);
      req.onerror = reject;
      req.onsuccess = resolve;
    });
  },

  hasSpace(bytes) {
    return new Promise((resolve, reject) => {
      debug('has space', bytes);
      var req = this.storage.freeSpace();
      req.onerror = reject;
      req.onsuccess = () => {
        var remaining = req.result;
        debug('remaining space', remaining);
        resolve({
          ok: remaining > bytes,
          remaining: remaining
        });
      };
    });
  }
};

},{}],5:[function(require,module,exports){
'use strict';

/**
 * Mini logger
 *
 * @type {Funciton}
 */
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

},{}],6:[function(require,module,exports){
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[format-sizes]', ...args) : () => {};

/**
 * Returns a formatted list of picture
 * sizes ready to be set as setting options.
 *
 * Options:
 *
 *   - `maxPixelSize {Number}`
 *   - `exclude {Array}`
 *
 * @param  {Array} sizes
 * @param  {Object} options
 * @return {Array}
 */
exports.picture = function(sizes, options) {
  debug('picture', sizes);
  var maxPixelSize = options && options.maxPixelSize;
  var exclude = options && options.exclude || {};
  var include = options && options.include;
  var list = [];
  var hash = {};

  exclude.aspects = exclude.aspects || [];
  exclude.keys = exclude.keys || [];

  sizes.forEach(function(size) {
    var w = size.width;
    var h = size.height;
    var key = w + 'x' + h;
    var pixelSize = w * h;

    if (hash[key]) { return; }

    var aspect = getAspect(w, h);

    // Don't include pictureSizes above the maxPixelSize limit
    if (maxPixelSize && pixelSize > maxPixelSize) { return; }

    if (include) {
      if (include.keys && !~include.keys.indexOf(key)) { return; }
      if (include.aspects && !~include.aspects.indexOf(aspect)) { return; }
    }

    if (exclude.keys.indexOf(key) > -1) { return; }
    if (exclude.aspects.indexOf(aspect) > -1) { return; }

    var item = {
      key: key,
      width: w,
      height: h,
      pixelSize: pixelSize,
      mp: getMP(w, h)
    };

    hash[key] = item;
    list.push(item);
  });

  // Sort by pixel size
  list.sort(function(a, b) { return b.pixelSize - a.pixelSize; });
  debug('formatted', list);

  return {
    list: list,
    hash: hash
  };
};

/**
 * Returns a formatted list of recorder
 * profiles ready to be set as setting options.
 *
 * Options:
 *
 *   - `exclude {Array}`
 *
 * @param  {Object} profiles
 * @param  {Object} options
 * @return {Array}
 */
exports.video = function(profiles) {
  debug('video', profiles);
  var exclude = ['high', 'low', 'default'];
  var bySize  = {};
  var hash = {};
  var list = [];

  for (var key in profiles) {
    if (!profiles.hasOwnProperty(key)) { continue; } // Bug 1091820

    var profile = profiles[key];
    var video = profile.video;
    var width = video.width;
    var height = video.height;
    var sizeKey = width + 'x' + height;

    // Don't include profile if marked as excluded
    if (~exclude.indexOf(key)) continue;

    // Guard against duplicate profiles
    if (bySize[sizeKey]) continue;
    bySize[sizeKey] = key;

    var pixelSize = video.width * video.height;
    var aspect = getAspect(video.width, video.height);

    hash[key] = {
      key: key,
      width: width,
      height: height,
      aspect: aspect,
      pixelSize: pixelSize
    };

    list.push(hash[key]);
  }

  // Sort from largest to small but put the default/preferred profile first
  list.sort(function(a, b) { return b.pixelSize - a.pixelSize; });

  return {
    list: list,
    hash: hash
  };
};

/**
 * Utils
 */

/**
 * Returns rounded mega-pixel value.
 *
 * @param  {Number} w
 * @param  {Number} h
 * @return {Number}
 */
function getMP(w, h) {
  return ((w * h) / 1000000).toFixed(1);
}
/**
 * Returns aspect ratio string.
 *
 * Makes use of Euclid's GCD algorithm,
 * http://en.wikipedia.org/wiki/Euclidean_algorithm
 *
 * @param  {Number} w
 * @param  {Number} h
 * @return {String}
 */
function getAspect(w, h) {
  var gcd = function(a, b) { return (b === 0) ? a : gcd(b, a % b); };
  var divisor = gcd(w, h);
  return (w / divisor) + ':' + (h / divisor);
}

},{}],7:[function(require,module,exports){
'use strict';

/**
 * Dependencies
 */

var pickThumbnail = require('./pick-thumbnail-size');
var DeviceStorage = require('./device-storage');
var formatSizes = require('./format-sizes');
var cookies = require('../cookies');
var Picture = require('./picture');
var Focus = require('./focus');
var Video = require('./video');

/**
 * Mini logger
 *
 * @type {Function}
 */
var debug = 0 ? (...args) => console.log('[MozCamera]', ...args) : () => {};

/**
 * Shorthand
 *
 * @type  {Function}
 */
var on = (el, name, fn) => el.addEventListener(name, fn);
var off = (el, name, fn) => el.removeEventListener(name, fn);

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

/**
 * Exports
 */

exports = module.exports = MozCamera;
exports.cookies = cookies; // for testing

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

  /**
   * Update the camera hardware to use
   * the preferred thumbnail size based
   * on the current pictureSize.
   *
   * Preferred: Largest available thumbnail
   * that most closely matches the current
   * aspect ratio.
   *
   * @private
   */
  updateThumbnailSize() {
    var sizes = this.mozCamera.capabilities.thumbnailSizes;
    var picked = pickThumbnail(sizes, this.pictureSize);
    if (picked) this.mozCamera.setThumbnailSize(picked);
  },

  /**
   * Update the locally formatted recorder
   * profiles from the raw list provided
   * by the camera.
   *
   * The camera hardware provides an object.
   * We filter these down to unique profiles
   * and internally store an Array and lookup
   * Object.
   *
   * @param  {Object} raw
   */
  updateRecorderProfiles(raw) {
    var recorderProfiles = formatSizes.video(raw);
    this.recorderProfiles = recorderProfiles.list;
    this.recorderProfiles.hash = recorderProfiles.hash;
  },

  /**
   * Update the locally formatted picture
   * sizes from the raw list provided by
   * the camera.
   *
   * The camera hardware provides an `Array`.
   * We filter these down to a list of unique
   * sizes that match the standard `4:3` aspect.
   *
   * We internally store a formatted `Array` and
   * lookup `Object`. We use keys in the format
   * `<width>x<height>` to identify picture sizes
   * instead of the {width, height} format used
   * by the CameraAPI as it's easier to store,
   * pass arround and make checks against.
   *
   * @param  {Object} raw
   */
  updatePictureSizes(raw) {
    var pictureSizes = formatSizes.picture(raw);
    this.pictureSizes = pictureSizes.list;
    this.pictureSizes.hash = pictureSizes.hash;
  },

  /**
   * Set the picture size.
   *
   * @param {String} key
   */
  setPictureSize(key) {
    return this.ready()
      .then(() => {
        var size = this.getPictureSize(key);
        if (!size) throw error(6);
        debug('setting picture size ...', key);
        this.setCached('pictureSize', key);
        return this.configure({ pictureSize: size });
      })

      .then(() => this.get('pictureSize'));
  },

  /**
   * Set the recorded profile.
   *
   * @param {String} key
   */
  setRecorderProfile(key) {
    return this.ready()
      .then(() => {
        var profile = this.getRecorderProfile(key);
        if (!profile) throw error(7);
        debug('setting recorder profile ...', key);
        this.setCached('recorderProfile', key);
        return this.configure({ recorderProfile: key });
      })

      .then(() => this.get('recorderProfile'));
  },

  /**
   * Get a full recorder profile by key.
   *
   * @param  {String} key
   * @return {Object}
   */
  getRecorderProfile(key) {
    debug('get recorder profile', key);
    return this.recorderProfiles.hash[key];
  },

  /**
   * Get a full picture-size profile by key.
   *
   * @example
   *
   * mozCamera.getPictureSize('1280x720') //=> {...}
   * mozCamera.getPictureSize({ width: 1280, height: 720 }) //=> {...}
   *
   * @param  {(String|Object)} param
   * @return {(Object|undefined)}
   */
  getPictureSize(param) {
    var key = typeof param === 'object'
      ? pictureSize.toKey(param)
      : param;

    return this.pictureSizes.hash[key];
  },

  /**
   * Set the flash mode.
   *
   * @param {String} value
   */
  setFlashMode(value) {
    return this.one('setFlashMode', () => {
      if (!this.hasFlashMode(value)) throw error(8, value);
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
    debug('set flash mode from cache', mode);
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

  /**
   * Get a value from the persistent cache.
   *
   * @param  {String} key
   * @return {(String|null)}
   */
  getCached(key) {
    debug('get cached', this.type, key);
    return cookies.get(`${this.type}:${key}`);
  },

  /**
   * Set a value to the persistent cache.
   *
   * @param  {String} key
   * @param  {String} value
   */
  setCached(key, value) {
    debug('set cached', this.type, key, value);
    cookies.set(`${this.type}:${key}`, value);
  },

  /**
   * Returns a Promise that resolves
   * once the MozCamera has completed
   * any 'blocking' tasks.
   *
   * @return {Promise}
   */
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
  }
};

/**
 * Utils
 */

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
    7: `unknown recorder-profile: ${args[0]}`,
    8: `invalid flash mode: '${args[0]}'`
  }[id]);
}

},{"../cookies":3,"./device-storage":4,"./focus":5,"./format-sizes":6,"./pick-thumbnail-size":8,"./picture":9,"./video":10}],8:[function(require,module,exports){
'use strict';

var debug = 0 ? (...args) => console.log('[pick-thumbnail]', ...args) : ()=> {};

var viewport = {
  width: parent.innerWidth * window.devicePixelRatio,
  height: parent.innerHeight * window.devicePixelRatio
};

/**
 * Picks a thumbnail-size that matches
 * the picture-size aspect-ratio
 * and fills all the devices pixels
 * of the currnet screen.
 *
 * @param  {Array} sizes
 * @param  {Object} pictureSize {width, height}
 * @return {Object} {width, height}
 */
module.exports = function(sizes, pictureSize) {
  debug('pick thumbnail', sizes, pictureSize);
  var pictureAspect = pictureSize.width / pictureSize.height;

  // Removes the sizes with the wrong aspect ratio
  sizes = sizes.filter(size => {
    var aspect = size.width / size.height;
    return Math.abs(aspect - pictureAspect) < 0.05;
  });

  if (sizes.length === 0) {
    console.error('Error while selecting thumbnail size. ' +
      'There are no thumbnail sizes that match the ratio of ' +
      'the selected picture size: ' + JSON.stringify(pictureSize));
    return;
  }

  // Sort sizes from small to large
  sizes.sort((a, b) => {
    return a.width * a.height - b.width * b.height;
  });

  // Find the smallest size that fills the screen
  for (var i = 0; i < sizes.length; ++i) {
    var size = sizes[i];
    if (fillsViewport(size.width, size.height)) return size;
  }

  // Last resort: choose the largest
  return sizes[sizes.length - 1];
};

/**
 * Utils
 */

function fillsViewport(pixelsWidth, pixelsHeight) {
  return (pixelsWidth >= viewport.width || pixelsHeight >= viewport.height)
    && (pixelsWidth >= viewport.height || pixelsHeight >= viewport.width);
}

},{}],9:[function(require,module,exports){
'use strict';

/**
 * Mini logger
 *
 * @type {Funciton}
 */
var debug = 1 ? (...args) => console.log('[Picture]', ...args) : () => {};

/**
 * Key to store 'private' stuff behind
 *
 * @type {Symbol}
 */
var hidden = Symbol();

/**
 * Exports
 */

module.exports = Picture;

function Picture(params) {
  this[hidden] = {
    mozCamera: params.mozCamera,
    storage: params.storage
  };

  this.pictureSize = params.pictureSize;
  this.filePath  = params.filePath;
  this.rotation = params.rotation;
  this.position = params.position;
  this.camera = params.camera;
  this.width = this.pictureSize.width;
  this.height = this.pictureSize.height;
  this.timeStamp = Date.now();

  debug('created', this);
}

Picture.prototype = {

  /**
   * Create a config object to
   * pass to the Camera WebAPI.
   *
   * @return {Object}
   */
  createConfig() {
    var result = {
      dateTime: this.timeStamp / 1000,
      pictureSize: this.pictureSize,
      fileFormat: 'jpeg',
      rotation: this.getRotation()
    };

    // position is optional
    if (this.position) result.position = this.position;
    return result;
  },

  getRotation() {
    return this.camera === 'front'
      ? -this.rotation
      : this.rotation;
  },

  /**
   * Take the Picture.
   *
   * @return {Promise}
   */
  take() {
    var config = this.createConfig();
    debug('take picture', config);

    return this[hidden].mozCamera.takePicture(config)
      .then(blob => {
        debug('taken', blob);
        return this[hidden].storage.add(blob, this.filePath);
      })

      .then(result => {
        debug('stored', result);
        this.file = result.file;
        this.absolutePath = result.absolutePath;
        return this;
      });
  }
};

},{}],10:[function(require,module,exports){
'use strict';

/**
 * Mini logger.
 *
 * @type {Funciton}
 */
var debug = 0 ? (...args) => console.log('[Video]', ...args) : () => {};

/**
 * The min number of bytes required
 * to begin recording a video.
 *
 * @type {Number}
 */
const minRecordSpace = 1024 * 1024 * 2;

/**
 * Number of bytes required on disk
 * to let us stop recording.
 *
 * @type {Number}
 */
const spacePadding = 1024 * 1024 * 1;

/**
 * Hidden key to store private
 * things behind.
 *
 * @type {Symbol}
 */
var key = Symbol();

/**
 * Exports
 */

module.exports = Video;

function Video(params) {
  var mozCamera = params.mozCamera;

  this[key] = {
    mozCamera: mozCamera,
    complete: new Deferred(),
    storage:params.storage
  };

  this.filePath = params.filePath || this.createFilePath();
  this.recorderProfile = params.recorderProfile;
  this.maxFileSize = params.maxFileSize;
  this.rotation = params.rotation;
  this.width = params.width;
  this.height = params.height;

  this.poster = {
    width: params.previewSize.width,
    height: params.previewSize.height,
    blob: null,
  };

  mozCamera.addEventListener('recorderstatechange', this);
  mozCamera.addEventListener('poster', this);

  this.complete = this[key].complete.promise;
  debug('created', this);
}

Video.prototype = {
  createConfig() {
    return {
      maxFileSizeBytes: this.maxFileSize,
      rotation: this.rotation
    };
  },

  createFilePath() {
    return Date.now() + '.3gp';
  },

  handleEvent(e) {
    debug('handle event', e.type);
    switch (e.type) {
      case 'recorderstatechange': this.onRecorderStateChange(e); break;
      case 'poster': this.onPoster(e); break;
    }
  },

  onRecorderStateChange(e) {
    debug('recorder state change', e.newState);
    var msg = e.newState;

    switch (msg) {
      case 'Started': break;
      case 'Stopped': this.onStopped(); break;
      case 'FileSizeLimitReached':

      break;
      case 'PosterFailed':
      case 'TrackFailed':
      case 'MediaRecorderFailed':
      case 'MediaServerFailed':
        this.error = new Error(msg);
        this.stop();
    }
  },

  onPoster(e) {
    debug('on poster');
    this.poster.blob = e.data;
  },

  onError(err) {
    debug('on error', err);
    this[key].storage.delete(this.filePath);
    this[key].complete.reject(err);
  },

  onStopped() {
    debug('on stopped');
    if (this.error) return this.onError(this.error);
    this[key].storage.get(this.filePath)
      .then(file => {
        this.file = file;
        var mozCamera = this[key].mozCamera;
        mozCamera.removeEventListener('recorderstatechange', this);
        mozCamera.removeEventListener('poster', this);
        this[key].complete.resolve(this);
      })

      .catch(err => this.onError(err));
  },

  start() {
    return this[key].storage.hasSpace(minRecordSpace)
      .then(result => {
        if (!result.ok) throw new Error('storage-full');
        var remaining = result.remaining - spacePadding;
        this.maxFileSize = this.maxFileSize || remaining;

        return new Promise((resolve, reject) => {
          this[key].mozCamera.startRecording(
            this.createConfig(),
            this[key].storage.storage,
            this.filePath,
            resolve,
            reject);
        });
      });
  },

  stop() {
    debug('stop');
    if (this.stopped) return this[key].complete.promise;
    this[key].mozCamera.stopRecording();
    this.stopped = true;
    return this[key].complete.promise;
  }
};

/**
 * Utils
 */

function Deferred() {
  this.promise = new Promise((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

},{}],11:[function(require,module,exports){
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

},{}]},{},[2])(2)
});