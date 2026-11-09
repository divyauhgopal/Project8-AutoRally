/* Auto Rally – small maths and colour helpers. */
(function (AR) {
  'use strict';

  var U = AR.util = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* Easing between a and b for progress p (0..1) – used to shape curves and hills. */
  U.easeIn = function (a, b, p) { return a + (b - a) * p * p; };
  U.easeOut = function (a, b, p) { return a + (b - a) * (1 - (1 - p) * (1 - p)); };
  U.easeInOut = function (a, b, p) { return a + (b - a) * (0.5 - Math.cos(p * Math.PI) / 2); };

  /* Wrap v into [0, max). */
  U.wrap = function (v, max) {
    v = v % max;
    return v < 0 ? v + max : v;
  };

  /* Seeded pseudo-random generator (mulberry32) – same "random" track every time. */
  U.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.hexToRgb = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  /* Mix two #rrggbb colours; returns an rgb() string. */
  U.mix = function (hexA, hexB, t) {
    var a = U.hexToRgb(hexA), b = U.hexToRgb(hexB);
    return 'rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  };
})(window.AutoRally = window.AutoRally || {});
