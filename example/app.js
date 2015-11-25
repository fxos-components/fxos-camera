/*global performance*/

var camera = document.querySelector('fxos-camera');
var controls = document.querySelector('.controls');

camera.started.then(() => {
  performance.mark('camera-ready');
  performance.measure('visually-complete', 'domLoading', 'camera-ready');
  console.log(performance.getEntries());
  updateControls();
}).catch(e => console.error(e));

camera.addEventListener('click', camera.focus.bind(camera));


function updateControls() {
  camera.get('viewfinderSize')
    .then(size => {
      controls.style.height = (window.innerHeight - size.height) + 'px';
    });
}
