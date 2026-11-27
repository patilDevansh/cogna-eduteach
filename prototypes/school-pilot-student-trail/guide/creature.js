/* Cogna guide — how she looks: Maji, a golden lion cub, drawn from a sprite sheet (guide/maji.png:
   8 columns × 11 rows of 192 × 208 cells; rows and frame counts are in ROWS below).
   Her mood picks the row:
     idle     sits, breathes and blinks; with something to look at, she turns her head toward it
     listen   waits, attentive
     think    working-it-out face
     talk     sits and looks at what she is talking about; she swells a little with her voice
     happy    jumps
     oops     droops, then looks back up
     play     left alone for a while she waves
   Drawn on a canvas every frame by guide/guide.js: creature.draw(dt, mood, look, level). */
(function () {
  "use strict";
  var C = window.Cogna;
  var SHEET = "guide/maji.png", CW = 192, CH = 208;

  // sprite rows: { row, frames, fps }
  var ROWS = {
    idle:    { row: 0, frames: 6, fps: 4 },
    waving:  { row: 3, frames: 4, fps: 6 },
    jumping: { row: 4, frames: 5, fps: 9 },
    failed:  { row: 5, frames: 8, fps: 6 },
    waiting: { row: 6, frames: 6, fps: 5 },
    working: { row: 7, frames: 6, fps: 7 },
    review:  { row: 8, frames: 6, fps: 5 },
  };
  var MOOD_ROW = { idle: "idle", listen: "waiting", think: "working", talk: "idle", happy: "jumping", oops: "failed", play: "waving" };
  var LOOKS = { idle: true, talk: true, listen: true };   // moods in which she turns to look at something
  var LOOK_ROW = 9;                                       // rows 9 and 10: sixteen directions, clockwise from straight up

  var img = new Image(), ready = false;
  img.onload = function () { ready = true; };
  img.src = SHEET;

  /** Picks her sprite frame over time. step(dt, mood, look, level) -> { col, row, pulse } (pulse: 0..1, her voice). */
  function animator() {
    var t = 0, clip = "idle", clipT = 0, idleFor = 0, lookIx = -1, lookHold = 0;
    return {
      step: function (dt, mood, look, level) {
        t += dt;
        if (mood === "idle") idleFor += dt; else idleFor = 0;
        var m = MOOD_ROW[mood] ? mood : "idle";
        if (m === "idle" && idleFor > 9) { m = "play"; if (idleFor > 9 + 2 * ROWS.waving.frames / ROWS.waving.fps) idleFor = 0; }   // two waves, then rest
        var name = MOOD_ROW[m];
        if (name !== clip) { clip = name; clipT = 0; } else clipT += dt;
        var R = ROWS[clip], col = Math.floor(clipT * R.fps) % R.frames, row = R.row;

        // turn her head toward what she watches; a blink (idle frames 2-3) still comes through now and then
        var lx = look ? look.x : 0, ly = look ? look.y : 0, mag = Math.sqrt(lx * lx + ly * ly);
        var blinking = clip === "idle" && (col === 2 || col === 3);
        if (LOOKS[m] && mag > 0.35 && !blinking) {
          var deg = Math.atan2(lx, -ly) * 180 / Math.PI;                 // 0 = up, clockwise
          var ix = ((Math.round(deg / 22.5) % 16) + 16) % 16;
          lookHold -= dt;
          if (lookIx < 0 || (ix !== lookIx && lookHold <= 0)) { lookIx = ix; lookHold = 0.12; }   // no flicker between two directions
          row = LOOK_ROW + (lookIx >= 8 ? 1 : 0); col = lookIx % 8;
        } else if (!(LOOKS[m] && mag > 0.35)) { lookIx = -1; }
        var lv = m === "talk" ? Math.min(1, level || 0) * 0.6 + 0.4 * Math.abs(Math.sin(t * 9.3) * Math.sin(t * 3.1 + 1)) : 0;
        return { col: col, row: row, pulse: lv };
      },
    };
  }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var size = canvas.width / (window.devicePixelRatio || 1);
    var A = animator();

    return {
      /** mood: one of MOOD_ROW; look: {x, y} in -1..1 toward what she watches; level: 0..1 voice level */
      draw: function (dt, mood, look, level) {
        var f = A.step(dt, mood, look, level), col = f.col, row = f.row, lv = f.pulse;
        var w = size;
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / w, 0, 0);
        ctx.clearRect(0, 0, w, w);
        if (!ready) return;
        var dh = w * 0.86 * (1 + lv * 0.035), dw = dh * CW / CH;
        var feet = w * 0.9;                                              // where her paws rest, just above the shadow
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, col * CW, row * CH, CW, CH, (w - dw) / 2, feet - dh * 0.95, dw, dh);
      },
    };
  }

  C.guideCreature = { create: create, animator: animator, sheet: { src: SHEET, cw: CW, ch: CH, cols: 8, rows: 11 } };
})();
