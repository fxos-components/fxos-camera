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
