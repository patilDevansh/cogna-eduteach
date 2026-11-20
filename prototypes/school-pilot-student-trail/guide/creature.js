/* Cogna guide — how she looks: a living drop of Cogna-green gel with a glowing core and three
   tiny maths shapes (square, triangle, circle) in orbit. No face: her mood shows in how she moves.
     idle     breathes and wobbles slowly; the shapes drift round her
     listen   her edge ripples with the student's voice; the shapes come in close
     think    the core swirls; the shapes race round in a ring
     talk     she pulses as she speaks
     happy    bounces bright; the shapes burst out, spin and come home   (excited)
     oops     she sags and dims a little; the shapes sink
     play     left alone for a while she juggles her shapes over her head
   Drawn on a canvas every frame by guide/guide.js: creature.draw(dt, mood, look, level). */
(function () {
  "use strict";
  var C = window.Cogna;
  var TAU = Math.PI * 2;

  // target settings per mood; the drawing eases between them
  var MOODS = {
    idle:   { wob: 0.035, wobF: 1.0, orbit: 0.55, orbitR: 1.0, core: 0.75, bright: 0, sag: 0, ripple: 0 },
    listen: { wob: 0.03, wobF: 1.4, orbit: 0.35, orbitR: 0.82, core: 0.95, bright: 0.08, sag: 0, ripple: 1 },
    think:  { wob: 0.04, wobF: 1.6, orbit: 3.2, orbitR: 0.9, core: 0.9, bright: 0.04, sag: 0, ripple: 0 },
    talk:   { wob: 0.05, wobF: 2.2, orbit: 0.9, orbitR: 1.0, core: 1.0, bright: 0.06, sag: 0, ripple: 0 },
    happy:  { wob: 0.09, wobF: 2.6, orbit: 2.4, orbitR: 1.55, core: 1.0, bright: 0.22, sag: 0, ripple: 0 },
    oops:   { wob: 0.02, wobF: 0.7, orbit: 0.25, orbitR: 0.85, core: 0.45, bright: -0.12, sag: 1, ripple: 0 },
    play:   { wob: 0.045, wobF: 1.3, orbit: 0, orbitR: 1.0, core: 0.85, bright: 0.06, sag: 0, ripple: 0 },
  };
  var KEYS = Object.keys(MOODS.idle);

  function mix(a, b, t) { return a + (b - a) * t; }
  function rgb(r, g, b, a) { return "rgba(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + "," + (a === undefined ? 1 : a) + ")"; }
  function shade(base, k) { // k > 0 lighter, k < 0 darker/greyer
    return k >= 0 ? base.map(function (c) { return c + (255 - c) * k; }) : base.map(function (c, i) { var grey = (base[0] + base[1] + base[2]) / 3; return mix(c, grey, -k * 1.4) * (1 + k * 0.5); });
  }
  var MINT = [111, 211, 174], MID = [42, 154, 118], DEEP = [8, 70, 58];
  var SHAPES = [
    { kind: "square", color: [214, 160, 30], phase: 0 },
    { kind: "triangle", color: [224, 112, 32], phase: TAU / 3 },
    { kind: "circle", color: [236, 248, 242], phase: TAU * 2 / 3 },
  ];

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var size = canvas.width / (window.devicePixelRatio || 1);
    var p = {}; KEYS.forEach(function (k) { p[k] = MOODS.idle[k]; });
    var t = 0, orbitA = 0, idleFor = 0, burst = 0, lastMood = "idle", core = { x: 0, y: 0 };

    function drawShape(s, x, y, r, spin, alpha) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(spin);
      ctx.fillStyle = rgb(s.color[0], s.color[1], s.color[2], alpha);
      ctx.shadowColor = "rgba(8,40,30,0.35)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.beginPath();
      if (s.kind === "square") ctx.rect(-r, -r, r * 2, r * 2);
      else if (s.kind === "triangle") { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 1.1, r * 0.8); ctx.lineTo(-r * 1.1, r * 0.8); ctx.closePath(); }
      else ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    return {
      /** mood: one of MOODS; look: {x, y} in -1..1 toward what she watches; level: 0..1 voice level */
      draw: function (dt, mood, look, level) {
        t += dt;
        if (mood === "idle") idleFor += dt; else idleFor = 0;
        var m = mood === "idle" && idleFor > 9 ? "play" : (MOODS[mood] ? mood : "idle");
        if (m === "happy" && lastMood !== "happy") burst = 1;
        lastMood = m;
        burst = Math.max(0, burst - dt * 1.3);
        var target = MOODS[m], ease = 1 - Math.exp(-dt * 6);
        KEYS.forEach(function (k) { p[k] += (target[k] - p[k]) * ease; });
        orbitA += dt * p.orbit;
        var lv = Math.min(1, level || 0);
        var talkLv = m === "talk" ? 0.5 + 0.5 * Math.abs(Math.sin(t * 9.3) * Math.sin(t * 3.1 + 1)) : 0;

        var w = size, cx = w / 2, cy = w / 2 + p.sag * 3, R = w * 0.3;
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / w, 0, 0);
        ctx.clearRect(0, 0, w, w);

        // shapes: where each one is this frame (behind her when its orbit swings away)
        var placed = SHAPES.map(function (s, i) {
          var a = orbitA + s.phase, rr = R * (1.45 * p.orbitR + burst * 0.6), x, y, depth, spin = t * (0.8 + p.orbit * 0.6) + i;
          if (m === "play") {
            // juggling: each shape in turn arcs up over her head and drops back into her hand
            var cyc = (t * 0.9 + i / 3) % 1, arc = Math.sin(cyc * Math.PI);
            x = cx + Math.cos(cyc * Math.PI) * R * 0.9;
            y = cy - R * 0.6 - arc * R * 1.6;
            depth = 1; spin = cyc * TAU;
          } else {
            x = cx + Math.cos(a) * rr;
            y = cy + Math.sin(a) * rr * 0.42 - R * 0.15 + p.sag * (Math.sin(a) * 0.5 + 0.8) * R * 0.5;
            depth = Math.sin(a);
          }
          return { s: s, x: x, y: y, depth: depth, spin: spin };
        });
        placed.filter(function (q) { return q.depth < 0; }).forEach(function (q) { drawShape(q.s, q.x, q.y, 4.4, q.spin, 0.55); });

        // the gel body: a wobbling outline, a little wider when she sags
        var n = 56, pts = [];
        for (var i = 0; i < n; i++) {
          var th = i / n * TAU;
          var wob = Math.sin(th * 3 + t * 1.7 * p.wobF) * 0.6 + Math.sin(th * 5 - t * 2.3 * p.wobF + 1.3) * 0.4;
          var rip = p.ripple * lv * 0.16 * Math.sin(th * 9 + t * 14);
          var pulse = talkLv * 0.07 + burst * 0.1 * Math.sin(th * 6 + t * 10);
          var r = R * (1 + p.wob * wob + rip + pulse);
          var sx = 1 + p.sag * 0.08, sy = 1 - p.sag * 0.08;
          pts.push([cx + Math.cos(th) * r * sx, cy + Math.sin(th) * r * sy + (Math.sin(th) > 0 ? p.sag * 2 : 0)]);
        }
        ctx.beginPath();
        for (var j = 0; j <= n; j++) {
          var a0 = pts[j % n], a1 = pts[(j + 1) % n];
          var mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
          if (j === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a0[0], a0[1], mx, my);
        }
        ctx.closePath();
        var hi = shade(MINT, p.bright), mid = shade(MID, p.bright * 0.8), lo = shade(DEEP, p.bright * 0.5);
        var g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R * 1.15);
        g.addColorStop(0, rgb(hi[0], hi[1], hi[2])); g.addColorStop(0.45, rgb(mid[0], mid[1], mid[2])); g.addColorStop(1, rgb(lo[0], lo[1], lo[2]));
        ctx.save();
        ctx.shadowColor = rgb(14, 107, 84, 0.35 + p.bright); ctx.shadowBlur = 10 + burst * 10 + talkLv * 4;
        ctx.fillStyle = g; ctx.fill();
        ctx.restore();
        // rim light
        ctx.save(); ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(cx - R * 0.08, cy - R * 0.1, R * 0.98, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
        // the glowing core: drifts toward what she is looking at, swirls while she thinks
        var lx = (look && look.x) || 0, ly = (look && look.y) || 0;
        if (m === "think") { lx = Math.cos(t * 5) * 0.7; ly = Math.sin(t * 5) * 0.5; }
        if (m === "play") { lx = Math.cos(t * 0.9 * Math.PI) * 0.6; ly = -0.6; }
        core.x += (lx * R * 0.32 - core.x) * ease; core.y += (ly * R * 0.28 + p.sag * R * 0.2 - core.y) * ease;
        var cr = R * (0.32 + talkLv * 0.08 + p.ripple * lv * 0.1 + burst * 0.1);
        var cg = ctx.createRadialGradient(cx + core.x, cy + core.y, 0, cx + core.x, cy + core.y, cr * 1.9);
        cg.addColorStop(0, "rgba(255,255,255," + (0.95 * p.core) + ")");
        cg.addColorStop(0.35, "rgba(214,250,232," + (0.6 * p.core) + ")");
        cg.addColorStop(1, "rgba(214,250,232,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx + core.x, cy + core.y, cr * 1.9, 0, TAU); ctx.fill();
        ctx.restore();
        // glossy highlight
        ctx.fillStyle = "rgba(255,255,255,0.42)";
        ctx.beginPath(); ctx.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.22, R * 0.12, -0.6, 0, TAU); ctx.fill();

        placed.filter(function (q) { return q.depth >= 0; }).forEach(function (q) { drawShape(q.s, q.x, q.y, 5.4, q.spin, 1); });
        return m;
      },
    };
  }

  C.guideCreature = { create: create };
})();
