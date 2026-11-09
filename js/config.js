/* Auto Rally – global tuning values.
   Every script attaches to the single window.AutoRally namespace. */
(function (AR) {
  'use strict';

  AR.config = {
    /* Rendering */
    MAX_DPR: 2,               // never render above 2x – sharp enough, saves GPU on phones
    MAX_PIXELS: 3700000,      // cap on canvas backing pixels (≈ 2560x1440); phones stay well below

    /* Fixed-timestep loop */
    STEP: 1 / 60,             // physics update interval (seconds)
    MAX_FRAME: 0.25,          // longest frame we will simulate (avoids "spiral of death")
    MAX_STEPS: 8,             // max physics updates per rendered frame

    /* Road & track (world units) */
    SEGMENT_LENGTH: 200,      // length of one road segment
    RUMBLE_LENGTH: 3,         // segments per kerb colour stripe
    ROAD_WIDTH: 2000,         // half the road width
    TRACK_SEED: 1947,         // seed for scenery placement (same track every race)

    /* Camera & rendering */
    PLAYER_DIST: 3300,        // distance from camera to the auto-rickshaw
    DRAW_DISTANCE: 220,       // segments drawn ahead (high quality)
    DRAW_DISTANCE_LOW: 130,   // segments drawn ahead on slow devices
    FOG_DENSITY: 3.2,         // distance haze strength

    /* Auto-rickshaw driving (speeds in world units per second) */
    MAX_SPEED: 9000,          // top speed
    KMH_AT_MAX: 72,           // speedometer reading at top speed
    ACCEL: 2600,              // throttle (tapers off near top speed)
    BRAKE: 9000,              // full stop from top speed in ~1 s
    COAST: 1500,              // slowdown with no pedal pressed
    STEER_RATE: 2.2,          // road half-widths per second at full steering
    STEER_RESPONSE: 12,       // how quickly steering eases in/out
    CENTRIFUGAL: 0.18,        // outward push on curves
    SHOULDER_LIMIT: 0.6,      // max speed on the dirt shoulder (fraction of top speed)
    GRASS_LIMIT: 0.35,        // max speed on grass
    OFFROAD_DECEL: 7000,      // how fast speed drops to the off-road limit
    X_LIMIT: 1.55,            // furthest the auto can go from the road centre
    WALL_DRAG: 2000,          // extra slowdown when scraping the boundary
    AUTO_WIDTH: 1000,         // auto-rickshaw width in world units
    CAMERA_FOLLOW: 0.85,      // share of sideways movement the camera follows

    /* Race */
    LAPS: 3,
    START_OFFSET: 300,        // grid position behind the start line (world units)

    /* Coins, obstacles, power-ups */
    AUTO_HIT_HALF: 0.2,       // auto's collision half-width (road half-widths; body without mirrors)
    AUTO_LENGTH: 500,         // auto's collision length (world units)
    TURBO_TIME: 3,            // seconds
    TURBO_MAX_FACTOR: 1.35,   // Turbo top speed = 135% of normal top speed (hard cap)
    TURBO_ACCEL: 4000,        // extra push while Turbo is active
    OVERSPEED_DECEL: 2500,    // how quickly speed eases back after Turbo ends
    SHIELD_TIME: 6,           // seconds

    /* Touch */
    AUTO_GAS_TOUCH: true,     // touch players accelerate automatically (brake to slow)

    /* Development */
    DEBUG: false              // stats panel (toggle with the ` key or ?debug=1)
  };
})(window.AutoRally = window.AutoRally || {});
