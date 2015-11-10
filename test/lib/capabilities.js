/*export capabilities*/

var capabilities = {
  flame: {
    back: {
      previewSizes: [{
        height: 720,
        width: 1280
      }, {
        height: 480,
        width: 864
      }, {
        height: 480,
        width: 800
      }, {
        height: 432,
        width: 768
      }, {
        height: 480,
        width: 720
      }, {
        height: 480,
        width: 640
      }, {
        height: 432,
        width: 576
      }, {
        height: 320,
        width: 480
      }, {
        height: 288,
        width: 384
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 160,
        width: 240
      }, {
        height: 144,
        width: 176
      }, {
        height: 176,
        width: 144
      }],

      pictureSizes: [{
        height: 1944,
        width: 2592
      }, {
        height: 1536,
        width: 2048,
      }, {
        height: 1080,
        width: 1920
      }, {
        height: 1200,
        width: 1600
      }, {
        height: 768,
        width: 1280
      }, {
        height: 720,
        width: 1280
      }, {
        height: 768,
        width: 1024
      }, {
        height: 600,
        width: 800
      }, {
        height: 480,
        width: 800
      }, {
        height: 480,
        width: 720
      }, {
        height: 480,
        width: 640
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }],

      thumbnailSizes: [{
        height: 480,
        width: 640
      }, {
        height: 288,
        width: 512
      }, {
        height: 288,
        width: 480
      }, {
        height: 154,
        width: 256
      }, {
        height: 288,
        width: 432
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }, {
        height: 0,
        width: 0
      }],

      videoSizes: [{
        height: 720,
        width: 1280
      }, {
        height: 480,
        width: 864
      }, {
        height: 480,
        width: 800
      }, {
        height: 480,
        width: 720
      }, {
        height: 480,
        width: 640
      }, {
        height: 320,
        width: 480
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }],

      fileFormats: [
        'jpeg',
        'bayer-mipi-10bggr',
        'bayer-ideal-qcom-10bggr',
        'bayer-qcom-10bggr',
        'yuv422sp'
      ],

      whiteBalanceModes: [
        'auto',
        'incandescent',
        'fluorescent',
        'warm-fluorescent',
        'daylight',
        'cloudy-daylight',
        'twilight',
        'shade'
      ],

      sceneModes: [
        'auto',
        'asd',
        'landscape',
        'snow',
        'beach',
        'sunset',
        'night',
        'portrait',
        'backlight',
        'sports',
        'steadyphoto',
        'flowers',
        'candlelight',
        'fireworks',
        'party',
        'night-portrait',
        'theatre',
        'action',
        'AR'
      ],

      effects: [
        'none',
        'mono',
        'negative',
        'solarize',
        'sepia',
        'posterize',
        'whiteboard',
        'blackboard',
        'aqua'
      ],

      flashModes: [
        'off',
        'auto',
        'on',
        'torch'
      ],

      focusModes: [
        'auto',
        'infinity',
        'macro',
        'continuous-video',
        'continuous-picture'
      ],

      zoomRatios: [
        1,
        1.02,
        1.04,
        1.07,
        1.09,
        1.12,
        1.14,
        1.17,
        1.2,
        1.23,
        1.25,
        1.28,
        1.31,
        1.35,
        1.38,
        1.41,
        1.44,
        1.48,
        1.51,
        1.55,
        1.58,
        1.62,
        1.66,
        1.7,
        1.74,
        1.78,
        1.82,
        1.86,
        1.9,
        1.95,
        2,
        2.04,
        2.09,
        2.14,
        2.19,
        2.24,
        2.29,
        2.35,
        2.4,
        2.46,
        2.51,
        2.57,
        2.63,
        2.7,
        2.76,
        2.82,
        2.89,
        2.96,
        3.03,
        3.1,
        3.17,
        3.24,
        3.32,
        3.4,
        3.48,
        3.56,
        3.64,
        3.73,
        3.81,
        3.9,
        4,
        4.09,
        4.18,
        4.28,
        4.38,
        4.48,
        4.59,
        4.7,
        4.81,
        4.92,
        5.03,
        5.15,
        5.27,
        5.4,
        5.52,
        5.65,
        5.78,
        5.92,
        6.06
      ],

      maxFocusAreas: 1,
      maxMeteringAreas: 5,
      maxDetectedFaces: 5,
      minExposureCompensation: -2.0000039935112,
      maxExposureCompensation: 2.0000039935112,
      exposureCompensationStep: 0.16666699945926666,
      recorderProfiles: {

      },

      isoModes: [
        'auto',
        'hjr',
        '100',
        '200',
        '400',
        '800',
        '1600'
      ],

      meteringModes: [
        'frame-average',
        'spot-metering',
        'center-weighted',
        'spot-metering-adv',
        'center-weighted-adv'
      ]
    },

    front: {
      previewSizes: [{
        height: 480,
        width: 640
      }, {
        height: 432,
        width: 576
      }, {
        height: 320,
        width: 480
      }, {
        height: 288,
        width: 384
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 160,
        width: 240
      }, {
        height: 144,
        width: 176
      }, {
        height: 176,
        width: 144
      }],
      pictureSizes: [{
        height: 1200,
        width: 1600
      }, {
        height: 768,
        width: 1280
      }, {
        height: 720,
        width: 1280
      }, {
        height: 768,
        width: 1024
      }, {
        height: 600,
        width: 800
      }, {
        height: 480,
        width: 800
      }, {
        height: 480,
        width: 720
      }, {
        height: 480,
        width: 640
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }],
      thumbnailSizes: [{
        height: 480,
        width: 640
      }, {
        height: 288,
        width: 512
      }, {
        height: 288,
        width: 480
      }, {
        height: 154,
        width: 256
      }, {
        height: 288,
        width: 432
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }, {
        height: 0,
        width: 0
      }],
      videoSizes: [{
        height: 480,
        width: 640
      }, {
        height: 320,
        width: 480
      }, {
        height: 288,
        width: 352
      }, {
        height: 240,
        width: 320
      }, {
        height: 144,
        width: 176
      }],
      fileFormats: [
        'jpeg',
        'yuv422sp'
      ],
      whiteBalanceModes: [
        'auto',
        'incandescent',
        'fluorescent',
        'warm-fluorescent',
        'daylight',
        'cloudy-daylight',
        'twilight',
        'shade'
      ],
      sceneModes: [],
      effects: [],
      flashModes: [],
      focusModes: [
        'fixed'
      ],
      zoomRatios: [
        1,
        1.02,
        1.04,
        1.07,
        1.09,
        1.12,
        1.14,
        1.17,
        1.2,
        1.23,
        1.25,
        1.28,
        1.31,
        1.35,
        1.38,
        1.41,
        1.44,
        1.48,
        1.51,
        1.55,
        1.58,
        1.62,
        1.66,
        1.7,
        1.74,
        1.78,
        1.82,
        1.86,
        1.9,
        1.95,
        2,
        2.04,
        2.09,
        2.14,
        2.19,
        2.24,
        2.29,
        2.35,
        2.4,
        2.46,
        2.51,
        2.57,
        2.63,
        2.7,
        2.76,
        2.82,
        2.89,
        2.96,
        3.03,
        3.1,
        3.17,
        3.24,
        3.32,
        3.4,
        3.48,
        3.56,
        3.64,
        3.73,
        3.81,
        3.9,
        4,
        4.09,
        4.18,
        4.28,
        4.38,
        4.48,
        4.59,
        4.7,
        4.81,
        4.92,
        5.03,
        5.15,
        5.27,
        5.4,
        5.52,
        5.65,
        5.78,
        5.92,
        6.06
      ],
      maxFocusAreas: 0,
      maxMeteringAreas: 5,
      maxDetectedFaces: 5,
      minExposureCompensation: -2.0000039935112,
      maxExposureCompensation: 2.0000039935112,
      exposureCompensationStep: 0.16666699945926666,
      recorderProfiles: {},
      isoModes: [
        'auto',
        'hjr',
        '100',
        '200',
        '400',
        '800',
        '1600'
      ],
      meteringModes: [
        'frame-average',
        'spot-metering',
        'center-weighted',
        'spot-metering-adv',
        'center-weighted-adv'
      ]
    }
  }
};