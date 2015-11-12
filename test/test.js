/* global suite, sinon, setup, teardown,
test, assert, capabilities, FXOSCamera */
/*jshint maxlen:false*/

suite('fxos-camera >>', function() {
  'use strict';

  var ViewfinderProto = window['./lib/viewfinder'].prototype;
  var InternalProto = FXOSCamera.Internal.prototype;
  var mozCamera;
  var dom;

  setup(function() {
    this.sinon = sinon.sandbox.create();

    dom = document.createElement('div');
    dom.style.height = '480px';
    dom.style.width = '320px';
    document.body.appendChild(dom);

    this.sinon.stub(ViewfinderProto, 'setStream');

    navigator.mozCameras = {
      getListOfCameras: sinon.stub().returns(['front', 'back']),

      getCamera: sinon.spy(function(camera, config) {
        var defer = new Deferred();

        mozCamera = new MozCamera(camera, config);

        setTimeout(() => {
          defer.resolve({
            configuration: mozCamera.configuration,
            camera: mozCamera
          });
        }, 100);

        return defer.promise;
      })
    };
  });

  teardown(function() {
    this.sinon.restore();
    dom.remove();
  });

  suite('creation', function() {
    var el;

    setup(function() {
      el = create();
      return el.complete;
    });

    teardown(function() {
      console.log('TEAR');
      return el.teardown()
        .then(() => console.log('DOWN'));
    });

    test('it calls .getCamera()', function() {
      sinon.assert.calledOnce(navigator.mozCameras.getCamera);
    });

    test('it has a flashMode', function() {
      assert.equal(el.flashMode, 'auto');
    });

    test('it has a sceneMode', function() {
      assert.equal(el.sceneMode, 'auto');
    });

    suite('#setCamera()', function() {
      test('it can be hammered like hell', function() {
        return new Promise((resolve, reject) => {
          navigator.mozCameras.getCamera.reset();
          setTimeout(() => {
            el.setCamera('front');
            setTimeout(() => {
              el.setCamera('back');
              setTimeout(() => {
                el.setCamera('front')
                  .then(() => {
                    assert.equal(el.camera, 'front');
                    sinon.assert.calledOnce(navigator.mozCameras.getCamera);
                  })

                  .then(resolve, reject);
              }, 10);
            }, 50);
          }, 30);
        });
      });
    });

    suite('#setMode()', function() {
      test('it can be called straight after .setCamera()', function() {
        el.setCamera('front');
        return el.setMode('video')
          .then(() => {
            assert.equal(el.mode, 'video');
            return el.setMode('picture');
          })

        .then(() => {
          assert.equal(el.mode, 'picture');
          var lastConfig = mozCamera.setConfiguration.lastCall.args[0];
          assert.equal(lastConfig.mode, 'picture');
        });
      });

      test('calling several times minimises hardware calls', function() {
        el.setMode('video');
        el.setMode('picture');
        el.setMode('video');

        return el.setMode('picture').then(() => {
          sinon.assert.calledOnce(mozCamera.setConfiguration);
        });
      });

      test('it should fade out before configuring', function() {
        this.sinon.spy(InternalProto, 'fadeOut');

        return el.setMode('video')
          .then(() => {
            assert.ok(InternalProto.fadeOut.calledBefore(mozCamera.setConfiguration));
          });
      });
    });

    suite('fading in/out', function() {
      test('it should only fade in after the last task is done', function(done) {
        var count = 2;

        el.setMode('video').then(complete).catch(done);
        el.setCamera('front').then(complete).catch(done);

        function complete() {
          var opacity = el.style.opacity;
          if (--count) {
            assert.equal(opacity, '0');
            return;
          }

          assert.equal(opacity, '1');
          done();
        }
      });
    });

    suite('#setFlashMode()', function() {
      test('it sets the flashMode on the moz camera', function() {
        return el.setFlashMode('on')
          .then(() => {
            assert.equal(mozCamera.flashMode, 'on');
            assert.equal(el.flashMode, 'on');
          });
      });

      test('it can be called directly after .setCamera()', function() {
        el.setCamera('front');
        el.setCamera('back');
        return el.setFlashMode('on')
          .then(() => {
            assert.equal(el.camera, 'back');
            assert.equal(mozCamera.flashMode, 'on');
          });
      });

      test('it fails silently if value unknown', function() {
        return el.setFlashMode('on')
          .then(result => {
            assert.equal(mozCamera.flashMode, 'on');
            assert.equal(result, 'on');
            return el.setFlashMode('unknown');
          })

        .then(result => {
          assert.equal(mozCamera.flashMode, 'on');
          assert.equal(result, 'on');
        });
      });
    });

    suite('#sceneMode()', function() {
      test('it sets the flashMode on the moz camera', function() {
        return el.setSceneMode('landscape')
          .then(() => {
            assert.equal(mozCamera.sceneMode, 'landscape');
            assert.equal(el.sceneMode, 'landscape');
          });
      });

      test('it can be called directly after .setCamera()', function() {
        el.setCamera('front');
        el.setCamera('back');
        return el.setSceneMode('sunset')
          .then(() => {
            assert.equal(el.camera, 'back');
            assert.equal(mozCamera.sceneMode, 'sunset');
          });
      });

      test('it fails silently if value unknown', function() {
        return el.setSceneMode('sports')
          .then(result => {
            assert.equal(mozCamera.sceneMode, 'sports');
            assert.equal(result, 'sports');
            return el.setSceneMode('unknown');
          })

        .then(result => {
          assert.equal(mozCamera.sceneMode, 'sports');
          assert.equal(result, 'sports');
        });
      });
    });

    suite('#takePicture()', function() {
      test('it waits until camera is \'ready\'', function() {
        el.setCamera('front');
        return el.takePicture({ rotation: 90 })
          .then(picture => {
            assert.equal(el.camera, 'front');
          });
      });

      test('roation is passed to WebAPI', function() {
        return el.takePicture({ rotation: 90 })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.rotation, 90);
          });
      });

      test('roation is mirrored for front camera', function() {
        el.setCamera('front');
        return el.takePicture({ rotation: 90 })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.rotation, -90);
          });
      });

      test('`postition` is passed to WebAPI', function() {
        var position = { lat: 0, lon: 0 };
        return el.takePicture({ position: position })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.position, position);
          });
      });

      test('it returns a fully decorated `Picture`', function() {
        return el.takePicture()
          .then(picture => {
            assert.isTrue(picture.blob instanceof Blob);
            assert.ok(picture.width);
            assert.ok(picture.height);
            assert.ok(picture.timeStamp);
          });
      });
    });

    suite('video recording', function() {
      var deviceStorage;

      setup(function() {
        deviceStorage = new DeviceStorage();
      });

      suite('#startRecording()', function() {
        test('it waits until camera is \'ready\'', function() {
          return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            });
        });

        test('it records to the given filePath', function() {
          return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            })

            .then(() => {
              var filePath = mozCamera.startRecording.lastCall.args[2];
              assert.equal(filePath, 'foo/bar/video.3gp');
            });
        });

        test('it records to the given DeviceStorage', function() {
          return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            })

            .then(() => {
              var storage = mozCamera.startRecording.lastCall.args[1];
              assert.equal(storage, deviceStorage);
            });
        });

        test('it passes rotation to WebAPI', function() {
          return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            })

            .then(() => {
              var config = mozCamera.startRecording.lastCall.args[0];
              assert.equal(config.rotation, 90);
            });
        });

        test('it `maxFileSize` to WebAPI', function() {
          el.maxFileSize = 6000;

          return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            })

            .then(() => {
              var config = mozCamera.startRecording.lastCall.args[0];
              assert.equal(config.maxFileSizeBytes, 6000);
            });
        });

        suite('errors >>', function() {
          setup(function() {
            return el.startRecording({
              storage: deviceStorage,
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            });
          });

          test('recording is stopped on `PosterFailed`', function(done) {
            mozCamera.emit('recorderstatechange', {
              newState: 'PosterFailed'
            });

            el.addEventListener('error', e => {
              assert.equal(e.detail.message, 'PosterFailed');
              sinon.assert.called(deviceStorage.delete);
              done();
            });
          });
        });
      });

      suite('#stopRecording()', function() {
        setup(function() {
          return el.startRecording({
            storage: deviceStorage,
            filePath: 'foo/bar/video.3gp',
            rotation: 90
          });
        });

        test('it returns the Video', function() {
          return el.stopRecording()
            .then(video => {
              assert.ok(video.poster.blob instanceof Blob);
              assert.ok(video.poster.width);
              assert.ok(video.poster.height);
              assert.ok(video.blob instanceof Blob);
            });
        });
      });

      test('it\'s stopped when .teardown() is called', function() {

      });
    });

    suite('detachedCallback()', function() {
      test('it should release the camera', function(done) {
        console.log('----');
        sinon.assert.notCalled(mozCamera.release);
        el.remove();

        // skip over microtasks
        setTimeout(() => {
          sinon.assert.calledOnce(mozCamera.release);
          done();
          console.log('----');
        });
      });
    });

    suite('#teardown()', function() {
      test('able to .setup() again after .teardown()', function() {
        return el.teardown()
          .then(() => {
            InternalProto.setStream.reset();
            return el.setup();
          })

          .then(() => {
            sinon.assert.calledOnce(InternalProto.setStream);
          });
      });
    });

    suite('viewfinder >>', function() {
      test('it rotates the viewfinder to match the sensor-angle', function() {
        var wrapper = el.shadowRoot.querySelector('.wrapper');
        var sensorAngle = mozCamera.sensorAngle;

        assert.include(wrapper.style.transform, sensorAngle);
      });

      test('the viewfinder is mirrored for front camera', function() {
        var wrapper = el.shadowRoot.querySelector('.wrapper');
        return el.setCamera('front')
          .then(() => {
            assert.include(wrapper.style.transform, 'scale(-1, 1)');
          });
      });

      test('the viewfinder is mirrored for front camera', function() {
        var wrapper = el.shadowRoot.querySelector('.wrapper');
        return el.setCamera('front')
          .then(() => {
            assert.include(wrapper.style.transform, 'scale(-1, 1)');
          });
      });

      test('can define a function to dynamically define scaleType', function() {
        var wrapper = el.shadowRoot.querySelector('.wrapper');
        var size;

        el.scaleType = sizes => {
          size = sizes.fit;
          return 'fit';
        };

        return el.setCamera('front')
          .then(() => {
            assert.equal(wrapper.clientWidth, Math.round(size.width));
            assert.equal(wrapper.clientHeight, Math.round(size.height));
          })

          .then(() => {
            el.scaleType = sizes => {
              size = sizes.fill;
              return 'fill';
            };

            return el.setCamera('back');
          })

          .then(() => {
            assert.equal(wrapper.clientWidth, Math.round(size.width));
            assert.equal(wrapper.clientHeight, Math.round(size.height));
          });
      });
    });

    suite('get()', function() {
      test('it returns the available picture sizes', function() {
        return el.get('pictureSizes')
          .then(result => {
            var pictureSizes = capabilities.flame.back.pictureSizes;
            assert.equal(pictureSizes[0].width, result[0].width);
            assert.equal(pictureSizes[0].height, result[0].height);
            el.setCamera('front');
            return el.get('pictureSizes');
          })

          .then(result => {
            var pictureSizes = capabilities.flame.front.pictureSizes;
            assert.equal(pictureSizes[0].width, result[0].width);
            assert.equal(pictureSizes[0].height, result[0].height);
          });
      });
    });

    suite('persistence >>', function() {
      test.only('the pictureSize persists', function() {
        return el.get('pictureSizes')
          .then(sizes => el.setPictureSize(sizes[1]))
          .then(() => {
            el.remove();
            el = create();
            return el.complete;
          })

          .then(() => el.get('pictureSize'))
          .then(result => {
            console.log('XXX', result);
          });
      });

      test('the flash mode persists', function() {
        return el.setFlashMode('off')
          .then(() => {
            el.remove();
            el = create();
            return el.get('flashMode');
          })

          .then(result => {
            assert.equal(result, 'off');
          });
      });
    });
  });

  /**
   * Utils
   */

  function create() {
    var html = `<fxos-camera></fxos-camera>`;
    var parent = document.createElement('div');
    parent.innerHTML = html;
    var el = parent.firstElementChild;
    dom.appendChild(el);
    return el;
  }

  function MozCamera(camera, config) {
    this.sensorAngle = 270;
    this.flashMode = 'auto';
    this.sceneMode = 'auto';
    this.effect = 'none';

    this.configuration = {
      previewSize: {
        height: 480,
        width: 640
      },
      pictureSize: {
        height: 1536,
        width: 2048
      },
      recorderProfile: '720p',
      mode: config.mode
    };

    this.capabilities = capabilities.flame[camera];
    this.emitter = document.createElement('div');

    sinon.spy(this, 'setConfiguration');
    sinon.spy(this, 'startRecording');
    sinon.spy(this, 'stopRecording');
    sinon.spy(this, 'takePicture');
    sinon.spy(this, 'release');
  }

  MozCamera.prototype = {
    release() {
      var defer = new Deferred();

      setTimeout(() => {
        defer.resolve();
      }, 100);

      return defer.promise;
    },

    setConfiguration(config) {
      var defer = new Deferred();
      Object.assign(this.configuration, config);

      setTimeout(() => {
        defer.resolve(this.configuration);
      }, 100);

      return defer.promise;
    },

    addEventListener(name, fn) {
      this.emitter.addEventListener(name, fn);
    },

    removeEventListener(name, fn) {
      this.emitter.removeEventListener(name, fn);
    },

    emit(name, data) {
      var event = new CustomEvent(name);
      Object.assign(event, data || {});
      this.emitter.dispatchEvent(event);
    },

    takePicture(config, onSuccess, onError) {
      setTimeout(() => {
        var result = new Blob(['']);
        onSuccess(result);
      }, 100);
    },

    startRecording(config, storage, filePath, onSuccess, onError) {
      setTimeout(() => {
        this.storage = storage;
        this.emit('recorderstatechange', { newState: 'Started' });
        this.emit('poster', { data: new Blob(['']) });
        if (this.error) onError(this.error);
        else onSuccess();
      }, 100);
    },

    stopRecording() {
      setTimeout(() => {
        this.emit('recorderstatechange', { newState: 'Stopped' });
      }, 100);
    }
  };

  function DeviceStorage() {
    sinon.spy(this, 'get');
    sinon.spy(this, 'delete');
    sinon.spy(this, 'freeSpace');
    this.space = 100000000;
  }

  DeviceStorage.prototype = {
    get(filePath) {
      var defer = new Deferred();

      setTimeout(() => {
        defer.resolve(new Blob(['']));
      });

      return defer.promise;
    },

    delete(filePath) {
      var defer = new Deferred();
      return defer.promise;
    },

    freeSpace() {
      var request = {};

      setTimeout(() => {
        request.result = this.space;
        request.onsuccess();
      });

      return request;
    }
  };

  function Deferred() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
});
