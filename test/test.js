/*jshint maxlen:false*/
/* global suite, sinon, setup, teardown, test, assert, capabilities, MockMozCamera, MockDeviceStorage, HTMLMediaElement, File */

suite('fxos-camera >>', function() {
  'use strict';

  var realMozSrcObject = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'mozSrcObject');

  var getDescriptor = Object.getOwnPropertyDescriptor;
  var ViewfinderProto = window['./lib/viewfinder'].prototype;
  var MozCameraProto = window['./lib/moz-camera'].prototype;
  var storage = window['../storage'];
  var deviceStorage;
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

    navigator.getDeviceStorage = sinon.spy(type => {
      deviceStorage = new MockDeviceStorage(type);
      return deviceStorage;
    });

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
      return el.started;
    });

    teardown(function() {
      console.log('TEAR');
      return el.stop()
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

      suite('failure', function() {
        var getCamera;
        var defer;

        setup(function() {
          defer = new Deferred();
          getCamera = navigator.mozCameras.getCamera;
          navigator.mozCameras.getCamera = sinon.spy(() => defer.promise);
          return el.stop()
            .then(() => {
              el.start();
            });
        });

        test('it reattempts up to 3 times', function() {
          this.sinon.useFakeTimers();
          defer.reject(new DOMError('NS_ERROR_NOT_AVAILABLE'));

          defer.promise
            .catch(() => Promise.resolve())
            .then(() => {
              sinon.assert.calledOnce(navigator.mozCameras.getCamera);
              this.sinon.clock.tick(1000);
            })

            .catch(() => Promise.resolve())
            .then(() => {
              sinon.assert.calledTwice(navigator.mozCameras.getCamera);
              this.sinon.clock.tick(1000);
            })

            .catch(() => Promise.resolve())
            .then(() => {
              sinon.assert.calledThrice(navigator.mozCameras.getCamera);
              this.sinon.clock.tick(1000);
            });

            return el.started
              .catch(err => {
                sinon.assert.callCount(navigator.mozCameras.getCamera, 4);
                assert.equal(err.message, 'hardware-unavailable');
              });
        });

        test('it can recover after second attempt succeeds', function() {
          defer.reject(new DOMError('NS_ERROR_NOT_AVAILABLE'));

          defer.promise
            .catch(() => Promise.resolve())
            .then(() => {
              sinon.assert.calledOnce(navigator.mozCameras.getCamera);
              navigator.mozCameras.getCamera = getCamera; // restore
            });

            return el.started;
        });
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
                  .then(() => el.get('camera'))
                  .then(result => {
                    assert.equal(result, 'front');
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
      setup(function() {
        this.sinon.spy(ViewfinderProto, 'update');
        this.sinon.spy(ViewfinderProto, 'show');
        this.sinon.spy(ViewfinderProto, 'hide');
      });

      test('it can be called straight after .setCamera()', function() {
        el.setCamera('front');
        return el.setMode('video')
          .then(() => el.get('mode'))
          .then(result => {
            assert.equal(result, 'video');
            return el.setMode('picture');
          })

          .then(() => el.get('mode'))
          .then(result => {
            assert.equal(result, 'picture');
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
        return el.setMode('video')
          .then(() => {
            assert.ok(ViewfinderProto.hide.calledBefore(mozCamera.setConfiguration));
          });
      });

      test('it should update the viewfinder before fading in', function() {
        return el.setMode('video')
          .then(() => {
            assert.ok(ViewfinderProto.update.calledBefore(ViewfinderProto.show));
          });
      });

      test('it does not fade in until preview started', function() {
        var spy = sinon.spy();

        mozCamera.addEventListener('previewstatechange', e => {
          if (e.newState === 'started') spy(e);
        });

        return el.setMode('video')
          .then(() => {
            assert.ok(ViewfinderProto.show.calledAfter(spy));
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
          .then(() => el.get('camera'))
          .then(result => {
            assert.equal(result, 'back');
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
          .then(() => Promise.all([
            el.get('sceneMode'),
            el.get('camera'),
          ]))
          .then(results => {
            assert.equal(results[0], 'sunset');
            assert.equal(results[1], 'back');
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
            assert.equal(picture.camera, 'front');
          });
      });

      test('rotation is passed to WebAPI', function() {
        return el.takePicture('my-picture.jpg', { rotation: 90 })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.rotation, 90);
          });
      });

      test('rotation is mirrored for front camera', function() {
        el.setCamera('front');
        return el.takePicture('my-picture.jpg', { rotation: 90 })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.rotation, -90);
          });
      });

      test('`postition` is passed to WebAPI', function() {
        var position = { lat: 0, lon: 0 };
        return el.takePicture('my-picture.jpg', { position: position })
          .then(picture => {
            var config = mozCamera.takePicture.lastCall.args[0];
            assert.equal(config.position, position);
          });
      });

      test('it returns a fully decorated `Picture`', function() {
        return el.takePicture('foo.jpg')
          .then(picture => {
            assert.isTrue(picture.file instanceof File);
            assert.ok(picture.absolutePath);
            assert.ok(picture.width);
            assert.ok(picture.height);
            assert.ok(picture.timeStamp);
          });
      });

      test('it resumes preview once complete', function() {
        return el.takePicture('foo.jpg')
          .then(() => {
            sinon.assert.calledOnce(mozCamera.resumePreview);
          });
      });

      test('it stores the image in DeviceStorage', function() {
        return el.takePicture('foo.jpg')
          .then(() => mozCamera.takePicture.lastCall.returnValue)
          .then(blob => {
            sinon.assert.calledOnce(deviceStorage.addNamed);
            sinon.assert.calledWith(deviceStorage.addNamed,
              blob, 'foo.jpg');
          });
      });

      test('it focuses before taking the picture', function() {
        return el.takePicture('foo.jpg')
          .then(() => {
            sinon.assert.calledOnce(mozCamera.autoFocus);
            sinon.assert.calledOnce(mozCamera.takePicture);
            assert.isTrue(mozCamera.autoFocus.calledBefore(mozCamera.takePicture));
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
      suite('#startRecording()', function() {
        test('it waits until camera is \'ready\'', function() {
          return el.startRecording({
              filePath: 'foo/bar/video.3gp',
              rotation: 90
            });
        });

        test('it records to the given filePath', function() {
          return el.startRecording({
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
              assert.ok(video.file instanceof File);
            });
        });
      });

      test('it\'s stopped when .stop() is called', function() {

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
      test('able to .start() again after .stop()', function() {
        var video = el.shadowRoot.querySelector('video');

        return el.stop()
          .then(() => {
            MozCameraProto.streamInto.reset();
            return el.start();
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
            this.sinon.stub(window, 'requestAnimationFrame');
            mozCamera.emit('facesdetected', { faces: MockMozCamera.faces });
            window.requestAnimationFrame.yield();
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

      suite('focus on point', function() {
        test.skip('it converts the point to camera co-ordinates', function() {

          mozCamera.setFocusAreas.reset();
          var viewfinder = el.shadowRoot.querySelector('.frame');
          var rect = viewfinder.getBoundingClientRect();

          var x = rect.x + (rect.width * 0.75);
          var y = rect.y + (rect.height * 0.75);

          return el.focus({ clientX: x, clientY: y })
            .then(() => {
              var rect = mozCamera.setFocusAreas.args[0][0][0];
              console.log('XXX', rect);
              sinon.assert.calledOnce(mozCamera.setFocusAreas);
              assert.deepEqual(rect, {
                x: 468.75,
                y: -476.56250111758703,
                left: 468.75,
                top: -476.56250111758703,
                right: 531.25,
                bottom: 539.0625011175871,
                width: 62.5,
                height: 62.5
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
            return el.started;
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

    suite('`visibilitychange`', function() {
      var hidden = false;
      var HiddenDescriptor = getDescriptor(Document.prototype, 'hidden');
      var visibilityChange = function() {
        document.dispatchEvent(new CustomEvent('visibilitychange'));
      };

      setup(function() {
        Object.defineProperty(Document.prototype, 'hidden', {
          get() {
            console.log('HIDDEN', hidden);
            return hidden; }
        });
      });

      teardown(function() {
        Object.defineProperty(Document.prototype, 'hidden', HiddenDescriptor);
      });

      suite('app hidden', function() {
        setup(function() {
          hidden = true;
          visibilityChange();
          return el.stopped;
        });

        test('it releases the hardware when the document is hidden', function() {
          sinon.assert.calledOnce(mozCamera.release);
        });

        suite('app shown again', function() {
          setup(function() {
            navigator.mozCameras.getCamera.reset();
            hidden = false;
            visibilityChange();
            return el.started;
          });

          test('it sets up the camera again', function() {
            sinon.assert.calledOnce(navigator.mozCameras.getCamera);
          });
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
