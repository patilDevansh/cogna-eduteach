/* Cogna.sfx — small lesson sound effects, made in the browser with Web Audio (no sound files, nothing to license).
   tick(i) rising count · snap · cut · pickup · oops · chime · pop · whoosh · slice · sparkle
   Quiet next to the voice, and silent when the student has turned sound off. */
(function () {
  "use strict";
  var C = window.Cogna, ctx = null, master = null;

  function soundOn() { try { return !C.voice || C.voice.isOn(); } catch (e) { return true; } }
  function ac() {
    if (!ctx) {
      var A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      try { ctx = new A(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }
  // Browsers only allow sound after the student has touched the page.
  ["pointerdown", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { ac(); }, { capture: true, passive: true }); });

  function tone(f0, f1, dur, type, gain, at) {
    var a = ac(); if (!a) return;
    var t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, filt, f0, f1, gain, at) {
    var a = ac(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = a.currentTime + (at || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf;
    f.type = filt || "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  var fx = {
    /** one counted square; i = 0, 1, 2 … climbs in pitch */
    tick: function (i) { var f = 520 * Math.pow(2, Math.min(i || 0, 36) / 24); tone(f, f * 1.02, 0.07, "triangle", 0.16); },
    /** a piece clicking into place */
    snap: function () { noise(0.05, "lowpass", 2200, 900, 0.35); tone(190, 85, 0.14, "sine", 0.45); },
    /** a clean knife cut */
    cut: function () { noise(0.2, "bandpass", 2500, 7000, 0.28); },
    /** picking a piece up */
    pickup: function () { tone(420, 640, 0.08, "sine", 0.12); },
    /** gentle "not quite" */
    oops: function () { tone(330, 300, 0.11, "triangle", 0.12); tone(240, 220, 0.14, "triangle", 0.12, 0.12); },
    /** discovery moment */
    chime: function () { [1046.5, 1318.5, 1568, 2093].forEach(function (f, i) { tone(f, f, 0.55, "sine", 0.12, i * 0.085); }); },
    /** something appears */
    pop: function () { tone(700, 1150, 0.07, "sine", 0.12); },
    /** something moves across */
    whoosh: function () { noise(0.32, "bandpass", 350, 1600, 0.1); },
    /** a blade slicing through: a fast swish, then a crisp snip */
    slice: function () { noise(0.17, "bandpass", 1600, 7500, 0.3); noise(0.05, "highpass", 5200, 5200, 0.2, 0.15); tone(1900, 1500, 0.09, "triangle", 0.05, 0.15); },
    /** two edges matching up: a quick bright sparkle */
    sparkle: function () { [1568, 2093, 2637, 3136].forEach(function (f, i) { tone(f, f, 0.24, "sine", 0.07, i * 0.045); }); },
  };
  C.sfx = {};
  Object.keys(fx).forEach(function (k) { C.sfx[k] = function (a) { if (!soundOn()) return; try { fx[k](a); } catch (e) { /* sound is optional */ } }; });
})();
