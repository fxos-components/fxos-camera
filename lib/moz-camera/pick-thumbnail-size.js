(define => {define((require,exports,module) => {
'use strict';

var debug = 0 ? (...args) => console.log('[pick-thumbnail]', ...args) : ()=> {};

var screen = {
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
    if (fillsScreen(size.width, size.height)) return size;
  }

  // Last resort: choose the largest
  return sizes[sizes.length - 1];
};

/**
 * Utils
 */

function fillsScreen(pixelsWidth, pixelsHeight) {
  return (pixelsWidth >= screen.width || pixelsHeight >= screen.height)
    && (pixelsWidth >= screen.height || pixelsHeight >= screen.width);
}

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('./pick-thumbnail-size',this));/*jshint ignore:line*/
