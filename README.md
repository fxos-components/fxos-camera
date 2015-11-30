[![](https://travis-ci.org/gaia-components/fxos-camera.svg)](https://travis-ci.org/gaia-components/fxos-camera) [![Coverage Status](https://coveralls.io/repos/gaia-components/fxos-camera/badge.svg?branch=master&service=github)](https://coveralls.io/github/gaia-components/fxos-camera?branch=master)

> A Web Component that makes writing camera applications for *FirefoxOS* easy.

```bash
$ npm install fxos-camera
```

## Usage

1. Include `fxos-camera.js` in your app
2. Place `<fxos-camera>` in your document.
3. Add `webapp.manifest` permissions ([see example](examples/app/manifest.webapp)):
  - `"camera"`
  - `"device-storage:pictures"`
  - `"device-storage:videos"`

### Taking pictures

```js
camera.takePicture('path/to/picture.jpeg')
  .then(picture => ...);
```

### Recording videos

```js
camera.set('mode', 'video')
  .then(() => camera.startRecording('path/to/my-video.3gp'))
  .then(() => {
    // recording has started
  });

// ... later

camera.stopRecording()
  .then(video => ...);
```

### Changing cameras

By default `FXOSCamera` boots in with the `'back'` camera.

```js
// switch to 'front'
camera.set('camera', 'front')
  .then(...);
```

```js
// switch to 'back'
camera.set('camera', 'back')
  .then(...);
```

### Get available cameras

Most devices today have two cameras: `'front'` and `'back`'. You can use the result of this query to determine whether to show a camera 'toggle' button in your app or not.

```js
camera.get('cameras')
  .then(list => {
    console.log(list); //=> ['front', 'back']
  });
```

### Set focus

`FXOSCamera` will run continuous-auto-focus (CAF) if available on the hardware. You have the ability to override this by by focusing on a specific point. It is common for camera apps to support a 'tap to focus' feature.

```js
// pass specific coordinates
camera.focus({ clientX: 50, clientY: 50 }).then(...);

// or wire-up a 'click' hander directly
camera.addEventListener('click', e => camera.focus(e));
```

### Set flash mode

```js
camera.get('flashModes')
  .then(modes => ...)
```

```js
camera.set('flashMode', mode)
  .then(...)
```

### Set scene mode

```js
camera.get('sceneModes')
  .then(modes => ...)
```

```js
camera.set('sceneMode', mode)
  .then(...)
```

### Set HDR mode (hyper-dynamic-range)

```js
camera.get('hdrModes')
  .then(modes => ...)
```

```js
camera.set('hdrMode', mode)
  .then(...)
```

### Set picture size

```js
camera.get('pictureSizes')
  .then(sizes => ...)
```

```js
camera.set('pictureSize', size.key)
  .then(...)
```

### Set recorder profile (video size)

```js
camera.get('recorderProfiles')
  .then(profiles => ...)
```

```js
camera.set('recorderProfile', profile.key)
  .then(...)
```

### Get the viewfinder sizes

```js
camera.get('viewfinderSize')
  .then(size => ...)
```

### Styling detected faces

Faces detected by the camera hardware will be inserted as `.face` elements inside `<fxos-camera>`. You can use CSS in your app to style these as you wish.

```css
fxos-camera .face {
  border: solid 1px;
  border-radius: 50%;
  color: white
  opacity: 0;
}

fxos-camera .face.active {
  opacity: 1;
}

fxos-camera .face.largest {
  color: green;
}
```

### Styling the focus ring

A `.focus` ring element is placed inside `<fxos-camera>`. You can use CSS in your app to style these as you wish. If you wish to do more advanced things with icons or transforms, we recommend using [pseudo elements](examples/app/app.css) so as not to interfere with the internal placement styling.

```css
fxos-camera .focus {
  width: 80px;
  height: 80px;
  border: solid 1px;
  border-radius: 50%;
  opacity: 0;
}

fxos-camera .focus[data-state="focusing"] { color: grey; }
fxos-camera .focus[data-state="focused"] { color: green; }
fxos-camera .focus[data-state="failed"] { color: red; }
```

## Tests

1. Ensure Firefox Nightly is installed on your machine.
2. `$ npm install`
3. `$ npm test`

If your would like tests to run on file change use:

`$ npm run test-dev`

## Lint check

Run lint check with command:

`$ npm run lint`
