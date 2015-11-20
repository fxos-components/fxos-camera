/*jshint maxlen:false*/
/* global suite, sinon, setup, teardown, test, assert, capabilities, MockMozCamera, MockDeviceStorage, HTMLMediaElement */

suite('fxos-camera >>', function() {
  'use strict';

  var realMozSrcObject = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'mozSrcObject');

  var ViewfinderProto = window['./lib/viewfinder'].prototype;
  var MozCameraProto = window['./lib/moz-camera'].prototype;
  var storage = window['../storage'];
  var mozCamera;
  var dom;

  setup(function() {
    this.sinon = sinon.sandbox.create();

    dom = document.createElement('div');
    dom.style.height = '480px';
    dom.style.width = '320px';
    document.body.appendChild(dom);

    this.sinon.spy(MozCameraProto, 'streamInto');

    // Stops DOM throwing when setting
    // fake <video> mediaStream
    Object.defineProperty(
      HTMLMediaElement.prototype,
      'mozSrcObject', {
        set(mozCamera) {
          this._mozSrcObject = mozCamera;
          mozCamera.onSetAsSrcObject(this);
        },
        get() { return this._mozSrcObject; }
      }
    );

    navigator.mozCameras = {
      getListOfCameras: sinon.stub().returns(['front', 'back']),

      getCamera: sinon.spy(function(camera, config) {
        var defer = new Deferred();

        mozCamera = new MockMozCamera(camera, config);

        setTimeout(() => {
          defer.resolve({
            configuration: mozCamera.configuration,
            camera: mozCamera
          });
        }, 100);

        return defer.promise;
      })
    };

    storage.clear();
  });

  teardown(function() {
    Object.defineProperty(
      HTMLMediaElement.prototype,
      'mozSrcObject',
      realMozSrcObject
    );

    storage.clear();
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

    suite('getCamera()', function() {
      test('it calls .getCamera()', function() {
        sinon.assert.calledOnce(navigator.mozCameras.getCamera);
      });

      test('it only provides defined config keys', function() {
        var config = navigator.mozCameras.getCamera.args[0][1];
        assert.deepEqual(config, { mode: 'picture' });
      });

      test('it defaults to back camera', function() {
        sinon.assert.calledWith(navigator.mozCameras.getCamera, 'back');
      });
    });

    test('it has a flashMode', function() {
      return el.get('flashMode')
        .then(value => assert.equal(value, 'auto'));
    });

    test('it has a sceneMode', function() {
      return el.get('sceneMode')
        .then(value => assert.equal(value, 'auto'));
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
        el.setMode('picture');

        return el.setMode('video').then(() => {
          sinon.assert.calledOnce(mozCamera.setConfiguration);
          sinon.assert.calledOnce(mozCamera.setConfiguration);
        });
      });

      test('it should fade out before configuring', function() {
        this.sinon.spy(ViewfinderProto, 'hide');

        return el.setMode('video')
          .then(() => {
            assert.ok(ViewfinderProto.hide.calledBefore(mozCamera.setConfiguration));
          });
      });
    });

    suite('fading in/out', function() {
      test('it should only fade in after the last task is done', function(done) {
        var frame = el.shadowRoot.querySelector('.frame');
        var count = 2;

        el.setMode('video').then(complete).catch(done);
        el.setCamera('front').then(complete).catch(done);

        function complete() {
          var opacity = frame.style.opacity;
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
          .then(() => el.get('flashMode'))
          .then(result => {
            assert.equal(result, 'on');
            assert.equal(mozCamera.flashMode, 'on');
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
      test('it sets the sceneMode on the MozCamera', function() {
        return el.set('sceneMode', 'landscape')
          .then(() => el.get('sceneMode'))
          .then(result => {
            assert.equal(result, 'landscape');
            assert.equal(mozCamera.sceneMode, 'landscape');
          });
      });

      test('it can be called directly after .setCamera()', function() {
        el.setCamera('front');
        el.setCamera('back');
        return el.set('sceneMode', 'sunset')
          .then(() => el.get('sceneMode'))
          .then(result => {
            assert.equal(el.camera, 'back');
            assert.equal(result, 'sunset');
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

    suite('thumbnail size >>', function() {
      test('it sets a thumbnail size when camera is aquired', function() {
        sinon.assert.calledOnce(mozCamera.setThumbnailSize);
        assert.deepEqual(mozCamera.thumbnailSize, { height: 480, width: 640 });
      });

      test('it sets a thumbnail size when pictureSize changes', function() {
        var key;

        mozCamera.setThumbnailSize.reset();
        return el.get('pictureSizes')
          .then(sizes => {
            key = sizes[1].key;
            return el.set('pictureSize', key);
          })

          .then(() => {
            sinon.assert.calledOnce(mozCamera.setThumbnailSize);
            assert.deepEqual(mozCamera.thumbnailSize, { height: 480, width: 640 });
          });
      });

      test('it sets a thumbnail size when the camera changes', function() {
        var expected = { height: 480, width: 640 };
        mozCamera.setThumbnailSize.reset();
        return el.setCamera('front')
          .then(() => {
            sinon.assert.calledWith(mozCamera.setThumbnailSize, expected);
            assert.deepEqual(mozCamera.thumbnailSize, expected);
          });
      });
    });

    suite('video recording', function() {
      var deviceStorage;

      setup(function() {
        deviceStorage = new MockDeviceStorage();
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
        sinon.assert.notCalled(mozCamera.release);
        el.remove();

        // skip over microtasks
        setTimeout(() => {
          sinon.assert.calledOnce(mozCamera.release);
          done();
        });
      });
    });

    suite('#teardown()', function() {
      test('able to .setup() again after .teardown()', function() {
        var video = el.shadowRoot.querySelector('video');

        return el.teardown()
          .then(() => {
            MozCameraProto.streamInto.reset();
            return el.setup();
          })

          .then(() => {
            sinon.assert.calledOnce(MozCameraProto.streamInto);
            sinon.assert.calledWith(MozCameraProto.streamInto, video);
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

      test('face elements match maxFaceCount', function() {
        var faces = el.querySelectorAll('.face');
        assert.equal(faces.length, mozCamera.capabilities.maxDetectedFaces);
      });
    });

    suite('Focus()', function() {
      test('it sets `continuous-picture` mode when available', function() {
        assert.equal(mozCamera.focusMode, 'continuous-picture');
      });

      test('it fallbacks to any available mode', function() {
        return el.set('camera', 'front')
          .then(() => {
            assert.equal(mozCamera.focusMode, 'fixed');
          });
      });

      suite('face detection >>', function() {
        test('it is started when available', function() {
          sinon.assert.calledOnce(mozCamera.startFaceDetection);
        });

        test('it is stopped when the camera changes', function() {
          var firstCamera = mozCamera;
          return el.set('camera', 'front')
            .then(() => {
              sinon.assert.calledOnce(firstCamera.stopFaceDetection);
            });
        });

        suite('2 faces detected', function() {
          setup(function() {
            mozCamera.emit('facesdetected', {
              faces: MockMozCamera.faces
            });
          });

          test('it places the faces in the right place', function() {
            var faces = Array.from(el.querySelectorAll('.face'));
            var visible = 0;

            faces.forEach(el => {
              var visibility = getComputedStyle(el).visibility;
              if (visibility === 'visible') visible++;
            });

            assert.equal(visible, 2);
          });

          suite('1 face detected', function() {
            setup(function() {
              mozCamera.emit('facesdetected', {
                faces: [MockMozCamera.faces[0]]
              });
            });

            test('it places the faces in the right place', function() {

            });

            suite('no faces detected', function() {
              setup(function() {
                mozCamera.emit('facesdetected', { faces: [] });
              });

              test('it places the faces in the right place', function() {

              });
            });
          });
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
      test('the pictureSize persists', function() {
        var key;

        return el.get('pictureSizes')
          .then(sizes => {
            key = sizes[2].key;
            return el.set('pictureSize', key);
          })
          .then(() => {
            el.remove();
            el = create();
            return el.complete;
          })

          .then(() => el.get('pictureSize'))
          .then(result => {
            assert.equal(result, key);
          });
      });

      test('the recorderProfile persists', function() {
        var size;
        return el.get('recorderProfiles')
          .then(sizes => {
            size = sizes[1].key;
            return el.set('recorderProfile', size);
          })

          .then(() => {
            el.remove();
            el = create();
            return el.get('recorderProfile');
          })

          .then(result => {
            assert.equal(result, size);
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

  function Deferred() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
});
