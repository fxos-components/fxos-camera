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
