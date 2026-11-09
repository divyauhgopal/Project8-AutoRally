/* Auto Rally – track geometry and scenery placement.
 *
 * The track is a loop of equal-length segments. Each segment stores:
 *   z1/z2  distance along the track,   y1/y2  height (hills),
 *   curve  how much the road bends here (+ right, − left),
 *   zone   scenery theme,   sprites  roadside objects.
 * Curves and hills are eased in and out so the road always flows smoothly,
 * and the last section returns to height 0 so the loop joins seamlessly.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config, U = AR.util, S = AR.sprites;
  var SEG = cfg.SEGMENT_LENGTH;

  var LEN = { SHORT: 25, MEDIUM: 50, LONG: 100 };
  var CURVE = { EASY: 2, MEDIUM: 4, HARD: 6 };
  var HILL = { LOW: 10, MEDIUM: 20, HIGH: 35 };

  var segments = [];
  var zone = 'town';

  function lastY() { return segments.length ? segments[segments.length - 1].y2 : 0; }

  function addSegment(curve, y) {
    var n = segments.length;
    segments.push({
      index: n,
      z1: n * SEG, z2: (n + 1) * SEG,
      y1: lastY(), y2: y,
      curve: curve,
      stripe: Math.floor(n / cfg.RUMBLE_LENGTH) % 2,
      zone: zone,
      start: false,
      sprites: [],
      // projection cache, filled by the renderer every frame
      sx1: 0, sy1: 0, sw1: 0, sx2: 0, sy2: 0, sw2: 0, scale1: 0, fog: 0,
      inView: false, roadVisible: false
    });
  }

  /* A road section: ease into `curve`, hold it, ease out; rise by `hill` over the whole section. */
  function addRoad(enter, hold, leave, curve, hill) {
    var startY = lastY();
    var endY = startY + hill * SEG;
    var total = enter + hold + leave;
    var n, k = 0;
    for (n = 0; n < enter; n++) addSegment(U.easeIn(0, curve, n / enter), U.easeInOut(startY, endY, ++k / total));
    for (n = 0; n < hold; n++) addSegment(curve, U.easeInOut(startY, endY, ++k / total));
    for (n = 0; n < leave; n++) addSegment(U.easeInOut(curve, 0, n / leave), U.easeInOut(startY, endY, ++k / total));
  }

  function straight(len) { addRoad(0, len, 0, 0, 0); }
  function curve(len, c, hill) { addRoad(len, len, len, c, hill || 0); }
  function hill(len, h) { addRoad(len, len, len, 0, h); }

  function rollingHills(len, h) {
    addRoad(len, len, len, 0, h / 2);
    addRoad(len, len, len, 0, -h);
    addRoad(len, len, len, 0, h);
    addRoad(len, len, len, 0, -h / 2);
  }

  function sCurves(len) {
    addRoad(len, len, len, -CURVE.EASY, 0);
    addRoad(len, len, len, CURVE.MEDIUM, 0);
    addRoad(len, len, len, CURVE.EASY, 0);
    addRoad(len, len, len, -CURVE.MEDIUM, 0);
  }

  function bumps() {
    var h = [3, -2, -3, 4, 3, -5, 2, -2];
    for (var i = 0; i < h.length; i++) addRoad(8, 8, 8, 0, h[i]);
  }

  /* ---------- the lap ---------- */

  function buildGeometry() {
    zone = 'town';
    straight(60);                                   // start / finish straight
    curve(LEN.SHORT, CURVE.MEDIUM);                 // right turn out of town
    straight(30);

    zone = 'avenue';                                // tree-lined road
    hill(LEN.SHORT, HILL.LOW);
    curve(LEN.MEDIUM, -CURVE.EASY, HILL.LOW);
    straight(25);

    zone = 'fields';                                // open countryside
    rollingHills(LEN.SHORT, HILL.LOW);
    curve(LEN.MEDIUM, CURVE.EASY, -HILL.LOW);
    sCurves(20);

    zone = 'village';
    straight(30);
    bumps();
    curve(LEN.SHORT, -CURVE.MEDIUM);
    straight(25);

    zone = 'ghat';                                  // hill road with sharp bends
    curve(LEN.MEDIUM, CURVE.HARD, HILL.HIGH);
    curve(LEN.MEDIUM, -CURVE.MEDIUM, -HILL.MEDIUM);
    curve(LEN.SHORT, CURVE.MEDIUM);

    zone = 'palms';                                 // coconut groves
    curve(LEN.MEDIUM, -CURVE.EASY, HILL.LOW);
    sCurves(15);

    zone = 'town';                                  // back into town, down to height 0
    addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, 0, -lastY() / SEG);
    straight(30);
  }

  /* ---------- scenery ---------- */

  var ZONES = {
    town:    { every: 6, near: [['houseP', 1], ['houseB', 1], ['houseY', 1], ['chai', 0.6], ['dhaba', 0.4], ['temple', 0.25]],
               nearOff: [1.6, 2.0], far: [['neem', 1], ['palm', 0.4]], farOff: [2.8, 4.5], farChance: 0.5 },
    avenue:  { every: 5, both: true, near: [['neem', 1]], nearOff: [1.5, 1.7],
               far: [['bush', 1], ['haystack', 0.5]], farOff: [2.6, 4], farChance: 0.3 },
    fields:  { every: 7, near: [['haystack', 1], ['bush', 1], ['hut', 0.4], ['neem', 0.6]],
               nearOff: [1.7, 3], far: [['neem', 1], ['palm', 0.5]], farOff: [3, 5], farChance: 0.6 },
    village: { every: 6, near: [['hut', 1], ['houseY', 0.5], ['chai', 0.4], ['haystack', 0.6], ['temple', 0.2]],
               nearOff: [1.6, 2.4], far: [['palm', 1], ['neem', 1]], farOff: [2.8, 4.5], farChance: 0.6 },
    ghat:    { every: 5, near: [['rock', 1], ['neem', 1], ['bush', 1]],
               nearOff: [1.5, 2.6], far: [['neem', 1], ['rock', 0.4]], farOff: [2.8, 4.5], farChance: 0.7 },
    palms:   { every: 5, near: [['palm', 1], ['bush', 0.4], ['hut', 0.3]],
               nearOff: [1.6, 2.6], far: [['palm', 1]], farOff: [3, 5], farChance: 0.6 }
  };

  function decorate() {
    var rng = U.rng(cfg.TRACK_SEED);
    var N = segments.length;

    function pick(list) {
      var total = 0, i;
      for (i = 0; i < list.length; i++) total += list[i][1];
      var r = rng() * total;
      for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return S[list[i][0]]; }
      return S[list[list.length - 1][0]];
    }
    function range(r) { return r[0] + rng() * (r[1] - r[0]); }
    function add(i, def, offset, align) {
      segments[i % N].sprites.push({
        def: def,
        offset: offset,                                      // in road half-widths; ±1 = road edge
        align: align !== undefined ? align : (offset < 0 ? -1 : 0)   // keep sprites off the road
      });
    }

    // Start / finish line and arch
    segments[0].start = segments[1].start = true;
    add(1, S.arch, 0, -0.5);

    var prevZone = null;
    for (var i = 0; i < N; i++) {
      var s = segments[i];
      var z = ZONES[s.zone];
      var blocked = 0;                                       // side taken by a sign (−1 / +1)

      // Curve warning chevrons on the outside of bends
      if (Math.abs(s.curve) > 1.5 && i % 14 === 0) {
        blocked = s.curve > 0 ? -1 : 1;
        add(i, s.curve > 0 ? S.chevronR : S.chevronL, 1.25 * blocked);
      } else if (i % 160 === 80) {
        blocked = -1;
        add(i, S.milestone, -1.2);
      } else if (s.zone !== prevZone && (s.zone === 'town' || s.zone === 'village') && i > 10) {
        blocked = 1;
        add(i, S.signTown, 1.3);
      } else if (i % 230 === 120) {
        blocked = 1;
        add(i, S.signChai, 1.3);
      }
      prevZone = s.zone;

      if (i < 8 || i % z.every !== 0) continue;             // keep start area clear

      if (z.both) {
        if (blocked !== -1) add(i, pick(z.near), -range(z.nearOff));
        if (blocked !== 1) add(i, pick(z.near), range(z.nearOff));
      } else {
        var side = rng() < 0.5 ? -1 : 1;
        if (side === blocked) side = -side;
        add(i, pick(z.near), side * range(z.nearOff));
      }
      if (rng() < z.farChance) add(i, pick(z.far), (rng() < 0.5 ? -1 : 1) * range(z.farOff));
    }
  }

  buildGeometry();
  decorate();

  var length = segments.length * SEG;

  AR.track = {
    segments: segments,
    length: length,
    findSegment: function (z) {
      return segments[Math.floor(U.wrap(z, length) / SEG) % segments.length];
    }
  };
})(window.AutoRally = window.AutoRally || {});
