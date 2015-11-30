/*jshint maxlen:false*/
/* global suite, sinon, setup, teardown, test, assert, capabilities, MockMozCamera, MockDeviceStorage, HTMLMediaElement, File, FXOSCamera */

suite('fxos-camera >>', function() {
  'use strict';

  var realMozSrcObject = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'mozSrcObject');

  var getDescriptor = Object.getOwnPropertyDescriptor;
  var ViewfinderProto = FXOSCamera.Viewfinder.prototype;
  var MozCameraProto = FXOSCamera.MozCamera.prototype;
  var storage = FXOSCamera.MozCamera.cookies;
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
          defer.reject(new window.DOMError('NS_ERROR_NOT_AVAILABLE'));

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

    suite('changing cameras', function() {
      test('it can be hammered like hell', function() {
        return new Promise((resolve, reject) => {
          navigator.mozCameras.getCamera.reset();
          setTimeout(() => {
            el.set('camera', 'front');
            setTimeout(() => {
              el.set('camera', 'back');
              setTimeout(() => {
                el.set('camera', 'front')
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

    suite(`#set('mode', ...)`, function() {
      setup(function() {
        this.sinon.spy(ViewfinderProto, 'update');
        this.sinon.spy(ViewfinderProto, 'show');
        this.sinon.spy(ViewfinderProto, 'hide');
      });

      test(`it can be called straight after .set('camera', ...)`, function() {
        el.set('camera', 'front');
        return el.set('mode', 'video')
          .then(() => el.get('mode'))
          .then(result => {
            assert.equal(result, 'video');
            return el.set('mode', 'picture');
          })

          .then(() => el.get('mode'))
          .then(result => {
            assert.equal(result, 'picture');
            var lastConfig = mozCamera.setConfiguration.lastCall.args[0];
            assert.equal(lastConfig.mode, 'picture');
          });
      });

      test('calling several times minimises hardware calls', function() {
        return Promise.all([
            el.set('mode', 'video'),
            el.set('mode', 'picture'),
            el.set('mode', 'video'),
            el.set('mode', 'picture'),
            el.set('mode', 'video')
          ])

          .then(() => {
            sinon.assert.calledOnce(mozCamera.setConfiguration);
            sinon.assert.calledOnce(mozCamera.setConfiguration);
          });
      });

      test('it should fade out before configuring', function() {
        return el.set('mode', 'video')
          .then(() => {
            assert.ok(ViewfinderProto.hide.calledBefore(mozCamera.setConfiguration));
          });
      });

      test('it should update the viewfinder before fading in', function() {
        return el.set('mode', 'video')
          .then(() => {
            assert.ok(ViewfinderProto.update.calledBefore(ViewfinderProto.show));
          });
      });

      test('it does not fade in until preview started', function() {
        var spy = sinon.spy();

        mozCamera.addEventListener('previewstatechange', e => {
          if (e.newState === 'started') spy(e);
        });

        return el.set('mode', 'video')
          .then(() => {
            assert.ok(ViewfinderProto.show.calledAfter(spy));
          });
      });

      test('it throws for unknown modes', function() {
        return el.set('mode', 'wilson')
          .then(() => assert.ok(false, 'should throw'))
          .catch(err => assert.include(err.message, 'invalid mode'));
      });

      test('it throws when video recording is in progress', function() {
        return el.set('mode', 'video')
          .then(() => el.startRecording('foo.3gp'))
          .then(() => el.set('mode', 'picture'))
          .then(() => assert.ok(false, 'should throw'))
          .catch(err => assert.include(err.message, 'in progress'));
      });
    });

    suite('fading in/out', function() {
      test('it should only fade in after the last task is done', function(done) {
        var frame = el.shadowRoot.querySelector('.frame');
        var count = 2;

        el.set('mode', 'video').then(complete).catch(done);
        el.set('camera', 'front').then(complete).catch(done);

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

    suite('picture-sizes >>', function() {
      setup(function() {
        this.sinon.spy(ViewfinderProto, 'update');
        this.sinon.spy(ViewfinderProto, 'show');
        this.sinon.spy(ViewfinderProto, 'hide');
      });

      suite('set >>', function() {
        test('it fades out the viewfinder when in `picture` mode', function() {
          this.timeout(4000);

          var hide = ViewfinderProto.hide;
          var key;

          return el.get('pictureSizes')
            .then(result => {
              var last = result[result.length -1];
              key = last.key;
              return el.set('pictureSize', key);
            })

            .then(result => {
              assert.equal(result, key);
              sinon.assert.calledOnce(hide);
              assert.isTrue(hide.calledBefore(mozCamera.setConfiguration));
              return el.set('mode', 'video');
            })

            .then(() => el.get('pictureSizes'))
            .then(result => {
              key = result[0].key;

              mozCamera.setConfiguration.reset();
              hide.reset();

              return el.set('pictureSize', key);
            })

            .then(result => {
              assert.equal(result, key);
              sinon.assert.notCalled(hide);
              sinon.assert.calledOnce(mozCamera.setConfiguration);
            });
        });
      });

      suite('get >>', function() {
        test(`get('pictureSize') returns the size key`, function() {
          return el.get('pictureSize')
            .then(result => {
              assert.equal(result, '2592x1944');
            });
        });

        test(`get('pictureSizes') returns Array of available sizes`, function() {
          return el.get('pictureSizes')
            .then(result => {
              assert.deepEqual(result[0], {
                key: '2592x1944',
                width: 2592,
                height: 1944,
                pixelSize: 5038848,
                mp: '5.0'
              });

              assert.deepEqual(result[10], {
                key: '640x480',
                width: 640,
                height: 480,
                pixelSize: 307200,
                mp: '0.3'
              });
            });
        });
      });
    });

    suite('recorder-profiles >>', function() {
      suite('set >>', function() {
        setup(function() {
          this.sinon.spy(ViewfinderProto, 'update');
          this.sinon.spy(ViewfinderProto, 'show');
          this.sinon.spy(ViewfinderProto, 'hide');
        });

        test('it fades out the viewfinder when in `video` mode', function() {
          this.timeout(4000);

          var hide = ViewfinderProto.hide;
          var key;

          return el.set('mode', 'video')
            .then(() => el.get('recorderProfiles'))
            .then(result => {
              var last = result[result.length -1];
              key = last.key;

              mozCamera.setConfiguration.reset();
              hide.reset();

              return el.set('recorderProfile', key);
            })

            .then(result => {
              assert.equal(result, key);
              sinon.assert.calledOnce(hide);
              assert.isTrue(hide.calledBefore(mozCamera.setConfiguration));
              return el.set('mode', 'picture');
            })

            .then(() => el.get('recorderProfiles'))
            .then(result => {
              key = result[0].key;

              mozCamera.setConfiguration.reset();
              hide.reset();

              return el.set('recorderProfile', key);
            })

            .then(result => {
              assert.equal(result, key);
              sinon.assert.notCalled(hide);
              sinon.assert.calledOnce(mozCamera.setConfiguration);
            });
        });
      });

      suite('get >>', function() {
        test('it returns an Array of available profiles', function() {
          return el.get('recorderProfiles')
            .then(result => {
              assert.equal(result.length, 7);

              assert.deepEqual(result[0], {
                key: '720p',
                width: 1280,
                height: 720,
                aspect: '16:9',
                pixelSize: 921600
              });

              assert.deepEqual(result[1], {
                  key: 'fwvga',
                  width: 864,
                  height: 480,
                  aspect: '9:5',
                  pixelSize: 414720
              });

              assert.deepEqual(result[2], {
                  key: 'wvga',
                  width: 800,
                  height: 480,
                  aspect: '5:3',
                  pixelSize: 384000
              });

              assert.deepEqual(result[3], {
                  key: '480p',
                  width: 720,
                  height: 480,
                  aspect: '3:2',
                  pixelSize: 345600
              });

              assert.deepEqual(result[4], {
                  key: 'vga',
                  width: 640,
                  height: 480,
                  aspect: '4:3',
                  pixelSize: 307200
              });

              assert.deepEqual(result[5], {
                  key: 'cif',
                  width: 352,
                  height: 288,
                  aspect: '11:9',
                  pixelSize: 101376
              });

              assert.deepEqual(result[6], {
                  key: 'qvga',
                  width: 320,
                  height: 240,
                  aspect: '4:3',
                  pixelSize: 76800
              });
            });
        });
      });
    });

    suite('flash-modes >>', function() {
      suite('set >>', function() {

        test('it sets the flashMode on the moz camera', function() {
          return el.set('flashMode', 'on')
            .then(() => el.get('flashMode'))
            .then(result => {
              assert.equal(result, 'on');
              assert.equal(mozCamera.flashMode, 'on');
            });
        });

        test(`it can be called directly after .set('camera', ...)`, function() {
          el.set('camera', 'front');
          el.set('camera', 'back');
          return el.set('flashMode', 'on')
            .then(() => el.get('camera'))
            .then(result => {
              assert.equal(result, 'back');
              assert.equal(mozCamera.flashMode, 'on');
            });
        });

        test('it throws if value unknown', function() {
          var spy = sinon.spy();

          return el.set('flashMode', 'on')
            .then(result => {
              assert.equal(mozCamera.flashMode, 'on');
              assert.equal(result, 'on');
              return el.set('flashMode', 'unknown');
            })

            .then(spy) // should not be called

            .catch(err => {
              assert.include(err.message, 'invalid');
              return el.get('flashMode');
            })

            .then(result => {
              assert.equal(mozCamera.flashMode, 'on');
              assert.equal(result, 'on');
              sinon.assert.notCalled(spy);
            });
        });

        test('the flash mode persists between components', function() {
          return el.set('flashMode', 'off')
            .then(() => {
              el.remove();
              el = create();
              return el.get('flashMode');
            })

            .then(result => {
              assert.equal(result, 'off');
            });
        });

        test.skip('should be able to set and then change camera', function() {
          el.set('flashMode', 'on');

          return el.set('camera', 'front')
            .then(() => el.set('camera', 'back'))
            .then(() => el.get('flashMode'))
            .then(result => assert.equal(result, 'on'));
        });

        test('the flash mode persists between cameras', function() {
          return el.set('flashMode', 'on')
            .then(() => el.set('camera', 'front'))
            .then(() => {
              return el.get('flashMode');
            })

            .then(result => {
              assert.isUndefined(result);
              return el.set('camera', 'back');
            })

            .then(() => el.get('flashMode'))
            .then(result => {
              assert.equal(result, 'on');
            });
        });

        test('the flash mode persists between modes', function() {
          return el.get('flashMode')
            .then(result => assert.equal(result, 'auto'))
            .then(() => el.set('flashMode', 'on'))
            .then(() => el.set('mode', 'video'))
            .then(() => el.set('mode', 'picture'))
            .then(() => el.get('flashMode'))
            .then(result => {
              assert.equal(result, 'on');
            });
        });
      });

      suite('get >>', function() {
        test('it should return `undefined` when there are no flashModes', function() {
          el.set('camera', 'front');
          return el.get('flashMode')
            .then(result => {
              assert.equal(result, undefined);
            });
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

      test(`it can be called directly after .set('camera', ...)`, function() {
        el.set('camera', 'front');
        el.set('camera', 'back');
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
        return el.set('sceneMode', 'sports')
          .then(result => {
            assert.equal(mozCamera.sceneMode, 'sports');
            assert.equal(result, 'sports');
            return el.set('sceneMode', 'unknown');
          })

        .then(result => {
          assert.equal(mozCamera.sceneMode, 'sports');
          assert.equal(result, 'sports');
        });
      });
    });

    suite('HDR', function() {
      setup(function() {
        capabilities.flame.back.sceneModes.push('hdr');
      });

      teardown(function() {
        var index = capabilities.flame.back.sceneModes.indexOf('hdr');
        capabilities.flame.back.sceneModes.splice(index, 1);
      });

      suite('get `hdrModes`', function() {
        test('returns mode options when camera supports HDR', function() {
          return el.get('hdrModes')
            .then(result => {
              assert.deepEqual(result, ['on', 'off']);
              return el.set('camera', 'front');
            })

            .then(() => el.get('hdrModes'))
            .then(result => {
              assert.equal(result, undefined);
            });
        });
      });

      suite('set `hdrMode`', function() {
        test('sceneMode is `null` when HDR is `on`', function() {
          return el.set('sceneMode', 'landscape')
            .then(() => el.get('sceneMode'))
            .then(result => {
              assert.equal(result, 'landscape');
              return el.set('hdrMode', 'on');
            })

            .then(result => {
              assert.equal(result, 'on');
              return el.get('sceneMode');
            })

            .then(result => {
              assert.isNull(result);
            });
        });

        test('it reverts to last `sceneMode` when turned back `off`', function() {
          return el.set('sceneMode', 'landscape')
            .then(result => {
              assert.equal(result, 'landscape');
              return el.set('hdrMode', 'on');
            })

            .then(() => el.set('hdrMode', 'off'))
            .then(result => {
              assert.equal(result, 'off');
              return el.get('sceneMode');
            })

            .then(result => {
              assert.equal(result, 'landscape');
            });
        });
      });
    });

    suite('#takePicture()', function() {
      test(`it waits until camera is 'ready'`, function() {
        el.set('camera', 'front');
        return el.takePicture('my-picture.jpg')
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
        el.set('camera', 'front');
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

      test('it stops all focus while picture is being taken', function() {
        mozCamera.removeEventListener.reset();
        mozCamera.startFaceDetection.reset();

        return el.takePicture('foo.jpg')
          .then(() => {
            sinon.assert.calledOnce(mozCamera.stopFaceDetection);
            sinon.assert.calledWith(mozCamera.removeEventListener, 'focus');

            assert.isTrue(
              mozCamera.stopFaceDetection
                .calledBefore(mozCamera.takePicture));

            sinon.assert.calledOnce(mozCamera.startFaceDetection);

            assert.isTrue(
              mozCamera.startFaceDetection
                .calledAfter(mozCamera.takePicture));

            sinon.assert.calledWith(mozCamera.addEventListener, 'focus');
          });
      });

      test('it throws if no file-path is given', function() {
        return el.takePicture()
          .catch(err => {
            assert.ok(err instanceof Error);
          });
      });

      test('it throws if picture taking is in progress', function() {
        var first = el.takePicture('foo.jpg');
        var second = el.takePicture('bar.jpg');

        return first
          .then(result => {
            assert.ok(result.file);
            return second;
          })

          .catch(err => {
            assert.include(err.message, 'in-progress');
            sinon.assert.calledOnce(mozCamera.takePicture);
          });
      });

      test('it waits until the camera has changed', function() {
        el.set('camera', 'front');
        return el.takePicture('foo.jpg')
          .then(picture => {
            assert.equal(mozCamera.camera, 'front');
            sinon.assert.calledOnce(mozCamera.takePicture);
            assert.equal(picture.camera, 'front');
          });
      });

      test('it dispatches a `shutter` event', function() {
        var spy = sinon.spy();
        el.addEventListener('shutter', spy);

        return el.takePicture('foo.jpg')
          .then(() => {
            sinon.assert.calledOnce(spy);
          });
      });
    });

    suite('zoom >>', function() {
      test('getMaxZoom', function() {
        return el.get('maxZoom')
          .then(result => assert.equal(result, 6.06))
          .then(() => el.set('camera', 'front'))
          .then(() => el.get('maxZoom'))
          .then(result => assert.equal(result, 6.06));
      });

      suite('set zoom >>', function() {
        test('it sets the value on the mozCamera', function() {
          return el.set('zoom', 2)
            .then(() => {
              assert.equal(mozCamera.zoom, 2);
            });
        });

        test('it clamps within range', function() {
          return el.set('zoom', 10)
            .then(result => assert.equal(result, 6.06))
            .then(() => el.set('zoom', -5))
            .then(result => assert.equal(result, 1));
        });

        test('it can be hammered', function() {
          return Promise.all([
              el.set('zoom', 2),
              el.set('zoom', 10),
              el.set('zoom', 4)
            ])

            .then(result => {
              assert.deepEqual(result, [4, 4, 4]);
            })

            .then(() => {
              var defer = new Deferred();
              el.set('zoom', 1);

              setTimeout(() => {
                el.set('zoom', 2);
                setTimeout(() => {
                  el.set('zoom', 12)
                    .then(result => {
                      assert.equal(result, 6.06);
                      return el.get('zoom');
                    })

                    .then(result => assert.equal(result, 6.06))
                    .then(defer.resolve)
                    .catch(defer.reject);
                }, 30);
              }, 10);

              return defer.promise;
            });
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
        return el.set('camera', 'front')
          .then(() => {
            sinon.assert.calledWith(mozCamera.setThumbnailSize, expected);
            assert.deepEqual(mozCamera.thumbnailSize, expected);
            return el.set('camera', 'back');
          });
      });
    });

    suite('video', function() {
      setup(function() {
        return el.set('mode', 'video');
      });

      suite('#startRecording()', function() {
        test('it waits until camera is \'ready\'', function() {
          el.set('camera', 'front');
          return el.startRecording('foo/bar/video.3gp')
            .then(() => {
              sinon.assert.calledOnce(mozCamera.startRecording);
            });
        });

        test('it records to the given filePath', function() {
          return el.startRecording('foo/bar/video.3gp', { rotation: 90 })
            .then(() => {
              var filePath = mozCamera.startRecording.lastCall.args[2];
              assert.equal(filePath, 'foo/bar/video.3gp');
            });
        });

        test('it records to the given DeviceStorage', function() {
          return el.startRecording('foo/bar/video.3gp', { rotation: 90 })
            .then(() => {
              var storage = mozCamera.startRecording.lastCall.args[1];
              assert.equal(storage, deviceStorage);
            });
        });

        test('it passes rotation to WebAPI', function() {
          return el.startRecording('foo/bar/video.3gp', { rotation: 90 })
            .then(() => {
              var config = mozCamera.startRecording.lastCall.args[0];
              assert.equal(config.rotation, 90);
            });
        });

        test('it `maxFileSize` to WebAPI', function() {
          el.maxFileSize = 6000;

          return el.startRecording('foo/bar/video.3gp', { rotation: 90 })

            .then(() => {
              var config = mozCamera.startRecording.lastCall.args[0];
              assert.equal(config.maxFileSizeBytes, 6000);
            });
        });

        test('it throws if recording is in progress', function() {
          var first = el.startRecording('foo.3gp');
          var second = el.startRecording('bar.3gp');

          return first
            .then(() => {
              return second;
            })

            .then(() => {
              throw new Error('should not have succeeded');
            })

            .catch(err => {
              assert.include(err.message, 'in progress');
              sinon.assert.calledOnce(mozCamera.startRecording);
            });
        });

        test('it throws if no file-path is given', function() {
          return el.startRecording()
            .then(() => assert.ok(false, 'should not resolve'))
            .catch(err => {
              assert.include(err.message, 'invalid');
            });
        });

        test('it throws if not in `video` mode', function() {
          return el.set('mode', 'picture')
            .then(() => {
              return el.startRecording('foo.3gp');
            })

            .then(() => assert.ok(false, 'should not resolve'))
            .catch(err => assert.include(err.message, 'mode'));
        });

        test('it uses `videos` DeviceStorage', function() {
          return el.startRecording('foo.3gp')
            .then(() => {
              var args = mozCamera.startRecording.lastCall.args;
              var storage = args[1];

              assert.equal(storage.type, 'videos');
            });
        });

        test('it waits until the camera has changed', function() {
          el.set('camera', 'front');
          return el.startRecording('foo.3gp')
            .then(() => {
              assert.equal(mozCamera.camera, 'front');
              sinon.assert.calledOnce(mozCamera.startRecording);
            });
        });

        suite('errors >>', function() {
          setup(function() {
            return el.startRecording('foo/bar/video.3gp');
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
          return el.startRecording('foo/bar/video1.3gp');
        });

        test('it returns the `Video`', function() {
          return el.stopRecording()
            .then(video => {
              assert.ok(video.poster.blob instanceof Blob);
              assert.ok(video.poster.width);
              assert.ok(video.poster.height);
              assert.ok(video.file instanceof File);
              assert.equal(video.filePath, 'foo/bar/video1.3gp');
            });
        });

        test('it can record more than one video', function() {
          return el.stopRecording()
            .then(() => {
              return el.startRecording('foo/bar/video2.3gp');
            })

            .then(() => el.stopRecording())
            .then(video => {
              assert.equal(video.filePath, 'foo/bar/video2.3gp');
            });
        });
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

    suite('#stop()', function() {
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

      test('it stops video recording', function() {
        return el.set('mode', 'video')
          .then(() => el.startRecording('foo.3pg'))
          .then(() => el.stop())
          .then(() => {
            sinon.assert.calledOnce(mozCamera.stopRecording);
          });
      });

      test('focus is stopped', function() {
        mozCamera.stopFaceDetection.reset();

        return el.stop()
          .then(() => {
            sinon.assert.calledOnce(mozCamera.stopFaceDetection);
            sinon.assert.calledWith(mozCamera.removeEventListener, 'focus');
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
        return el.set('camera', 'front')
          .then(() => {
            assert.include(wrapper.style.transform, 'scale(-1, 1)');
          });
      });

      test('the viewfinder is mirrored for front camera', function() {
        var wrapper = el.shadowRoot.querySelector('.wrapper');
        return el.set('camera', 'front')
          .then(() => {
            assert.include(wrapper.style.transform, 'scale(-1, 1)');
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

        suite('2 faces detected >>', function() {
          setup(function() {
            this.sinon.stub(window, 'requestAnimationFrame');
            this.sinon.useFakeTimers();
            mozCamera.emit('facesdetected', { faces: MockMozCamera.faces });
            window.requestAnimationFrame.yield();
          });

          teardown(function() {
            this.sinon.clock.restore();
          });

          test('it displays the correct number of faces', function() {
            var faces = Array.from(el.querySelectorAll('.face'));
            var active = faces.filter(el => el.classList.contains('active'));

            assert.equal(active.length, 2);
          });

          test('it set the focus-area to the largest face', function() {
            var area = mozCamera.setFocusAreas.lastCall.args[0][0];
            var expected = MockMozCamera.faces[0].bounds;
            assert.equal(area, expected);
          });

          suite('1 face detected >>', function() {
            setup(function() {
              mozCamera.emit('facesdetected', { faces: [MockMozCamera.faces[0]] });
            });

            test('it displays the correct number of faces', function() {
              var faces = Array.from(el.querySelectorAll('.face'));
              var active = faces.filter(el => el.classList.contains('active'));

              assert.equal(active.length, 1);
            });

            suite('no faces detected (timeout)', function() {
              setup(function() {
                this.sinon.clock.tick(1000);
              });

              test('after two seconds of no detected faces, it clears', function() {
                var faces = Array.from(el.querySelectorAll('.face'));
                var active = faces.filter(el => el.classList.contains('active'));

                assert.equal(active.length, 0);
              });
            });
          });
        });
      });

      suite('focus on point >>', function() {
        setup(function() {
          this.sinon.useFakeTimers();
          mozCamera.setFocusAreas.reset();
          var viewfinder = el.shadowRoot.querySelector('.frame');
          var rect = viewfinder.getBoundingClientRect();

          var x = rect.x + (rect.width * 0.75);
          var y = rect.y + (rect.height * 0.75);

          return el.focus({ clientX: x, clientY: y });
        });

        teardown(function() {
          this.sinon.clock.restore();
        });

        test('focus-area is set on the mozCamera', function() {
            var rect = mozCamera.setFocusAreas.args[0][0][0];
            sinon.assert.calledOnce(mozCamera.setFocusAreas);
              // assert.deepEqual(rect, {
              //   x: 468.75,
              //   y: -476.56250111758703,
              //   left: 468.75,
              //   top: -476.56250111758703,
              //   right: 531.25,
              //   bottom: 539.0625011175871,
              //   width: 62.5,
              //   height: 62.5
              // });
            // });
        });

        test('it turns off continuous-auto-focus', function() {
          assert.equal(mozCamera.focusMode, 'auto');
        });

        suite('after 5sec', function() {
          setup(function() {
            this.sinon.clock.tick(5000);
          });

          test('continuous-auto-focus remains off', function() {
            assert.equal(mozCamera.focusMode, 'auto');
          });

          suite('after 10sec', function() {
            setup(function() {
              this.sinon.clock.tick(5000);
            });

            test('returns to continuous-auto-focus', function() {
              assert.equal(mozCamera.focusMode, 'continuous-picture');
            });
          });
        });
      });
    });

    suite('#get() >>', function() {
      test('it returns the available picture sizes', function() {
        return el.get('pictureSizes')
          .then(result => {
            var pictureSizes = capabilities.flame.back.pictureSizes;
            assert.equal(pictureSizes[0].width, result[0].width);
            assert.equal(pictureSizes[0].height, result[0].height);
            el.set('camera', 'front');
            return el.get('pictureSizes');
          })

          .then(result => {
            var pictureSizes = capabilities.flame.front.pictureSizes;
            assert.equal(pictureSizes[0].width, result[0].width);
            assert.equal(pictureSizes[0].height, result[0].height);
          });
      });

      test('it returns the available flash modes', function() {
        return el.get('flashModes')
          .then(result => {
            assert.deepEqual(result, [
              'off',
              'auto',
              'on',
              'torch'
            ]);
          });
      });

      test('it returns the current flash mode', function() {
        return el.get('flashMode')
          .then(result => {
            assert.equal(result, 'auto');
            return el.set('flashMode', 'on');
          })

          .then(result => {
            assert.equal(result, 'on');
            return el.get('flashMode');
          })

          .then(result => {
            assert.equal(result, 'on');
          });
      });

      test('it returns the available scene modes', function() {
        return el.get('sceneModes')
          .then(result => {
            assert.deepEqual(result, capabilities.flame.back.sceneModes);
          });
      });

      test('it returns the available cameras', function() {
        return el.get('cameras')
          .then(result => {
            assert.deepEqual(result, ['front', 'back']);
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
