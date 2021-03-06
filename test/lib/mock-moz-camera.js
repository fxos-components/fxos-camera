/*global capabilities, sinon*/
/*jshint maxlen:false*/

window.MockMozCamera = (function() {
  var id = 0;

  function MockMozCamera(camera, config) {
    this.id = ++id;
    this.sensorAngle = 270;
    this.sceneMode = 'auto';
    this.effect = 'none';

    this.camera = camera;
    this.capabilities = capabilities.flame[camera];
    this.zoom = this.capabilities.zoomRatios[0];
    this.emitter = document.createElement('div');

    var pictureSize;

    this.flashMode = camera === 'back'
      ? 'auto'
      : this.capabilities.flashModes[0];

    // Look for matching pictureSize
    if (config.pictureSize) {
      this.capabilities.pictureSizes.forEach(size => {
        if (size.width !== config.pictureSize.width) return;
        if (size.height !== config.pictureSize.height) return;
        pictureSize = size;
      });
    }

    var thumbnailSizes = this.capabilities.thumbnailSizes;
    this.thumbnailSize = thumbnailSizes[thumbnailSizes.length - 1];

    pictureSize = pictureSize || this.capabilities.pictureSizes[0];

    // Look for matching recorder profile
    var recorderProfiles = this.capabilities.recorderProfiles;
    var recorderProfile = recorderProfiles[config.recorderProfile]
      ? config.recorderProfile
      : recorderProfiles.default.name;

    this.configuration = {
      previewSize: {
        height: 480,
        width: 640
      },

      pictureSize: pictureSize,
      recorderProfile: recorderProfile,
      mode: config.mode
    };

    sinon.spy(this, 'setThumbnailSize');
    sinon.spy(this, 'addEventListener');
    sinon.spy(this, 'removeEventListener');
    sinon.spy(this, 'startFaceDetection');
    sinon.spy(this, 'stopFaceDetection');
    sinon.spy(this, 'setConfiguration');
    sinon.spy(this, 'startRecording');
    sinon.spy(this, 'setFocusAreas');
    sinon.spy(this, 'getFocusAreas');
    sinon.spy(this, 'stopRecording');
    sinon.spy(this, 'resumePreview');
    sinon.spy(this, 'takePicture');
    sinon.spy(this, 'autoFocus');
    sinon.spy(this, 'release');
  }

  MockMozCamera.prototype = {
    release() {
      var defer = new Deferred();

      setTimeout(() => {
        defer.resolve();
      }, 100);

      return defer.promise;
    },

    setConfiguration(params) {
      var defer = new Deferred();
      var config = this.configuration;

      if (params.recorderProfile) config.recorderProfile = params.recorderProfile;
      if (params.pictureSize) config.pictureSize = params.pictureSize;
      if (params.mode) config.mode = params.mode;

      setTimeout(() => {
        defer.resolve(this.configuration);
        setTimeout(() => {
          this.emit('previewstatechange', { newState: 'started' });
        });
      }, 200);

      return defer.promise;
    },

    setThumbnailSize(size) {
      var thumbnailSizes = this.capabilities.thumbnailSizes;
      var matched = thumbnailSizes.some(thumbnail => {
        return thumbnail.width === size.width
          && thumbnail.height === size.height;
      });

      if (matched) this.thumbnailSize = size;
    },

    addEventListener(name, fn) {
      this.emitter.addEventListener(name, fn);
    },

    removeEventListener(name, fn) {
      this.emitter.removeEventListener(name, fn);
    },

    startFaceDetection() {},
    stopFaceDetection() {},

    autoFocus() {
      var defer = new Deferred();
      requestAnimationFrame(() => defer.resolve(), 100);
      return defer.promise;
    },

    setFocusAreas(value) {
      this.focusAreas = value;
    },

    getFocusAreas() {
      return this.focusAreas || [];
    },

    setMeteringAreas() {},

    emit(name, data) {
      var event = new CustomEvent(name);
      Object.assign(event, data || {});
      this.emitter.dispatchEvent(event);
    },

    takePicture(config) {
      var defer = new Deferred();

      setTimeout(() => {
        this.emit('shutter');
        defer.resolve(new Blob(['']));
      }, 100);

      return defer.promise;
    },

    resumePreview() {},

    startRecording(config, storage, filePath, onSuccess, onError) {
      setTimeout(() => {
        this.storage = storage;
        var req = this.storage.addNamed(new Blob(['']), filePath);
        req.onsuccess = e => {
          this.emit('recorderstatechange', { newState: 'Started' });
          this.emit('poster', { data: new Blob(['']) });
          if (this.error) onError(this.error);
          else onSuccess();
        };
      }, 100);
    },

    stopRecording() {
      setTimeout(() => {
        this.emit('recorderstatechange', { newState: 'Stopped' });
      }, 100);
    },

    onSetAsSrcObject(video) {
      video.play = () => {
        setTimeout(() => {
          this.emit('previewstatechange', { newState: 'started' });
        });
      };
    },
  };

  MockMozCamera.faces = [
    {
      id: 1,
      score: 55,
      hasLeftEye: true,
      hasRightEye: true,
      hasMouth: true,
      bounds: {
        bottom: 291,
        height: 333,
        left: 0,
        right: 250,
        top: -42,
        width: 250,
        x: 0,
        y: -42
      }
    },

    {
      id: 2,
      score: 60,
      hasLeftEye: true,
      hasRightEye: true,
      hasMouth: true,
      bounds: {
        bottom: 407,
        height: 291,
        left: -279,
        right: -61,
        top: 116,
        width: 218,
        x: -297,
        y: -116
      }
    }
  ];

  /**
   * Utils
   */

  function Deferred() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  return MockMozCamera;
})();