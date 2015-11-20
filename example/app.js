var camera = document.querySelector('fxos-camera');

camera.complete.then(() => {
  performance.mark('camera-ready');
  performance.measure('visually-complete', 'domLoading', 'camera-ready');
  console.log(performance.getEntries());
});