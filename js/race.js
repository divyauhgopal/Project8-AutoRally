/* Auto Rally – race rules: laps, checkpoint and timing.
 *
 * Timing
 *   The clock counts fixed physics steps (integer), so it never drifts and
 *   only runs while racing: never in the menu, countdown, pause or after the
 *   finish. A crossing of the finish line is timed to a fraction of a step by
 *   interpolating where in the step the auto crossed the line.
 *
 * Lap counting (halfway checkpoint)
 *   The auto's track position z wraps from the track length back to 0 at the
 *   start/finish line. A crossing only counts as a lap if the auto passed the
 *   halfway checkpoint (z = length / 2) since the previous counted crossing.
 *   So one crossing can never count twice, and the initial roll over the line
 *   from the grid (which starts just behind it) does not count.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config;

  var race = AR.race = {
    laps: cfg.LAPS,
    lap: 1,              // current lap (1-based)
    lapTimes: [],        // completed lap times in seconds
    steps: 0,            // racing steps elapsed
    lapStart: 0,         // race time at which the current lap began
    halfway: false,      // checkpoint passed during the current lap
    finished: false,
    finalTime: 0
  };

  race.reset = function () {
    race.lap = 1;
    race.lapTimes = [];
    race.steps = 0;
    race.lapStart = 0;
    race.halfway = false;
    race.finished = false;
    race.finalTime = 0;
  };

  /* Current race time in seconds. */
  race.time = function () {
    return race.finished ? race.finalTime : race.steps * cfg.STEP;
  };

  race.currentLapTime = function () {
    return race.time() - race.lapStart;
  };

  /* Call once per racing step with the auto's track position before and after
   * moving (both wrapped into [0, length)). Returns null, 'checkpoint', 'lap'
   * or 'finish'. */
  race.step = function (prevZ, curZ, length) {
    if (race.finished) return null;
    var t0 = race.steps * cfg.STEP;           // time at the start of this step
    race.steps++;

    var half = length / 2;
    if (curZ >= prevZ) {                       // no wrap this step
      if (!race.halfway && prevZ < half && curZ >= half) {
        race.halfway = true;
        return 'checkpoint';
      }
      return null;
    }

    // Wrapped past the start/finish line this step.
    if (!race.halfway) return null;            // e.g. rolling off the grid: not a lap

    var travelled = (length - prevZ) + curZ;
    var frac = travelled > 0 ? (length - prevZ) / travelled : 1;
    var crossTime = t0 + frac * cfg.STEP;

    race.lapTimes.push(crossTime - race.lapStart);
    race.lapStart = crossTime;
    race.halfway = false;

    if (race.lapTimes.length >= race.laps) {
      race.finished = true;
      race.finalTime = crossTime;
      return 'finish';
    }
    race.lap++;
    return 'lap';
  };

  race.bestLapIndex = function () {
    var best = -1;
    for (var i = 0; i < race.lapTimes.length; i++) {
      if (best < 0 || race.lapTimes[i] < race.lapTimes[best]) best = i;
    }
    return best;
  };

  /* m:ss.cc – truncated (never shows a time better than it was) */
  race.format = function (t) {
    var cs = Math.floor(t * 100 + 1e-6);
    var m = Math.floor(cs / 6000);
    var s = Math.floor(cs / 100) % 60;
    var c = cs % 100;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  };
})(window.AutoRally = window.AutoRally || {});
