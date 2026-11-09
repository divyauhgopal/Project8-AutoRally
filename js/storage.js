/* Auto Rally – saved data (best time), stored in localStorage.
 *
 * Key: "autoRally.v1" → JSON { v: 1, best: { time, laps[3], coins, date }, ... }
 * Other fields (e.g. settings added later) are preserved when the best time is written.
 *
 * Safety:
 *  - every localStorage access is wrapped in try/catch (private modes, blocked
 *    site data and full storage all throw);
 *  - stored data is validated: anything missing, malformed or implausible is
 *    treated as "no record" and replaced by the next real result;
 *  - if storage is unavailable the record is kept in memory for this visit only.
 */
(function (AR) {
  'use strict';

  var KEY = 'autoRally.v1';
  var MIN_TIME = 30;        // seconds – no genuine 3-lap race can be faster (theoretical ≈ 114 s)
  var MAX_TIME = 3600;      // anything slower than an hour is treated as invalid

  var available = (function () {
    try {
      var probe = '__autoRally_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  var cache = null;         // the whole data object, loaded once

  function load() {
    if (cache) return cache;
    cache = {};
    if (!available) return cache;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object' && !Array.isArray(data)) cache = data;
      }
    } catch (e) {
      cache = {};             // corrupted JSON → start clean (overwritten on next save)
    }
    return cache;
  }

  function save() {
    if (!available) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
      return true;
    } catch (e) {
      return false;           // e.g. storage full – the in-memory copy still works
    }
  }

  function validTime(t) {
    return typeof t === 'number' && isFinite(t) && t >= MIN_TIME && t <= MAX_TIME;
  }

  function validBest(b) {
    if (!b || typeof b !== 'object' || !validTime(b.time)) return null;
    var laps = null;
    if (Array.isArray(b.laps) && b.laps.length === 3 && b.laps.every(function (x) {
      return typeof x === 'number' && isFinite(x) && x > 0;
    })) laps = b.laps.slice();
    return {
      time: b.time,
      laps: laps,
      coins: typeof b.coins === 'number' && isFinite(b.coins) && b.coins >= 0 ? Math.floor(b.coins) : null,
      date: typeof b.date === 'string' ? b.date : null
    };
  }

  AR.storage = {
    KEY: KEY,

    isAvailable: function () { return available; },

    /* The saved best race, or null. */
    getBest: function () { return validBest(load().best); },

    /* Call once when a 3-lap race is completed.
     * Returns { isNew, previous, best, saved }. Only a strictly faster time replaces the record. */
    submitRace: function (time, laps, coins) {
      var previous = this.getBest();
      var result = { isNew: false, previous: previous, best: previous, saved: false };
      if (!validTime(time)) return result;
      if (!previous || time < previous.time) {
        var data = load();
        data.v = 1;
        data.best = {
          time: time,
          laps: (laps || []).slice(0, 3),
          coins: coins || 0,
          date: new Date().toISOString()
        };
        result.saved = save();
        result.isNew = true;
        result.best = validBest(data.best);
      }
      return result;
    },

    /* Remove only the best time (other saved data is kept). */
    resetBest: function () {
      var data = load();
      delete data.best;
      return save();
    },

    /* Settings live under data.settings; the best time is never touched.
     * Values must match the type of the fallback, otherwise the fallback is used. */
    getSetting: function (name, fallback) {
      var s = load().settings;
      if (!s || typeof s !== 'object' || Array.isArray(s)) return fallback;
      var v = s[name];
      return typeof v === typeof fallback ? v : fallback;
    },
    setSetting: function (name, value) {
      var data = load();
      if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) data.settings = {};
      data.settings[name] = value;
      data.v = 1;
      return save();
    }
  };
})(window.AutoRally = window.AutoRally || {});
