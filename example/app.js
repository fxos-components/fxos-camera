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
controls.addEventListener('click', e => {
  camera.takePicture()
    .then(picture => console.log('PICTURE', picture))
    .catch(err => console.error(err));
});

function updateControls() {
  camera.get('viewfinderSize')
    .then(size => {
      controls.style.height = (window.innerHeight - size.height) + 'px';
    });
}
