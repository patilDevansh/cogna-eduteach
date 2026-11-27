/* Cogna.story — the shared story kit for Area lessons (used with Cogna.lesson; load after anim/lesson.js).

   Every story lesson has the same five beats, shown as a strip above the stage (a step's `beat` starts one):
     story   someone arrives with a real problem            (lesson writes these steps; first one has beat: "story")
     guess   the student guesses before anything is taught  (guessStep)
     hands   the student does the maths with their hands    (lesson writes these; first one has beat: "hands")
     tell    the student tells the person the answer, then how they knew   (tellStep, howStep)
     rule    the same idea on a plain shape, and the rule   (lesson writes these; first one has beat: "rule")

   PEOPLE  person(parent, L, { x, y, look }) -> P       x, y = where the feet rest, in viewBox units.
           look: 'uncle' (turban, moustache) | 'aunty' (bun) | 'girl' (plaits, smaller) | 'boy' (short hair, smaller)
           A person is about 70 wide and 155 tall (children 130). Their speech bubble is 176 wide and sits above
           the head: from x - 60 to x + 116, and from y - 262 to y - 202. Keep that area clear of other things.
           They start off stage; enter() brings them on.
           enter(P, L, from?)  puzzled(P, L, on)  asks(P, L)  says(P, L, line1, line2?)  hush(P, L)
           cheer(P, L, line1, line2?)  leave(P, L, to?)          from / to: 'left' (default) | 'right'

   STEPS   each returns a Step for Cogna.lesson's `steps` array. Every spoken line is a literal `caption:` in the
           LESSON file, so tools/record-narration.mjs finds it.
           guessStep({ caption, prompt, choices: [{ label, value }], guessed: { caption }, none: { caption } })
               value 0 means "no idea yet". The guess is kept as c.guess and never marked.
           tellStep({ who(c) -> P, caption, prompt, answer, tol?, wrong: [{ value, caption, mixup? }], other: { caption },
                      thanks: [line1, line2], same: { caption }, close: { caption }, plain: { caption }, skill, qid })
               the student types the answer for the person. `same` is said when it matches their first guess, `close`
               when they had guessed something else, `plain` when they had no guess.
           howStep({ who(c) -> P, caption, prompt, bubble: [line1, line2], skill, qid, leave?: true,
                     choices: [{ label, value, correct?, mixup?, caption }] })
               the person asks how they knew; each choice has its own reply. With leave, the person walks off after.
           tellStep and howStep log what the student said (L.record) without moving the skill meter; a wrong choice
           that shows a known mix-up counts as that mix-up being seen. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg;

  function add(p, tag, a) { var e = S(tag, a || {}); p.appendChild(e); return e; }
  function text(p, str, x, y, cls) { var e = add(p, "text", { x: x, y: y, "class": cls }); e.textContent = str; return e; }

  var MOUTH = {
    calm: "M-7 -103Q0 -96 7 -103",
    puzzled: "M-4 -100a4 3.6 0 1 0 8 0a4 3.6 0 1 0 -8 0",
    happy: "M-10 -106Q0 -84 10 -106Z",
  };
  var DOME = "M-35 -134C-42 -170 -14 -178 2 -176C30 -176 42 -160 35 -134C14 -146 -14 -146 -35 -134Z";   // turban or hair

  /** One arm: a group that swings from the shoulder, holding a forearm that bends at the elbow. side: -1 left, 1 right. */
  function limb(parent, L, side) {
    var sx = side * 22, sy = -84, ey = sy + 23;
    var g = add(parent, "g");
    add(g, "path", { d: "M" + sx + " " + sy + "V" + ey, "class": "t-st-arm-out" });
    var fore = add(g, "g");
    add(fore, "path", { d: "M" + sx + " " + ey + "v21", "class": "t-st-arm-out" });
    add(fore, "path", { d: "M" + sx + " " + ey + "v21", "class": "t-st-arm" });
    add(fore, "circle", { cx: sx, cy: ey + 21, r: 7, "class": "t-st-hand" });
    add(g, "path", { d: "M" + sx + " " + sy + "V" + ey, "class": "t-st-arm" });
    add(g, "path", { d: "M" + sx + " " + sy + "v18", "class": "t-st-sleeve-out" });
    add(g, "path", { d: "M" + sx + " " + sy + "v18", "class": "t-st-sleeve" });
    L.set(g, { svgOrigin: sx + " " + sy, rotation: side * -9 });
    L.set(fore, { svgOrigin: sx + " " + ey });
    return { g: g, fore: fore, side: side };
  }

  function person(parent, L, o) {
    o = o || {};
    var look = { uncle: 1, aunty: 1, girl: 1, boy: 1 }[o.look] ? o.look : "uncle", small = look === "girl" || look === "boy";
    var g = add(parent, "g", { "class": "t-st-person is-" + look, transform: "translate(" + o.x + " " + o.y + ")" });
    var walk = add(g, "g");                                   // slides them on and off
    var fig = add(walk, "g", small ? { transform: "scale(0.84)" } : {});
    var shadow = add(fig, "ellipse", { cx: 3, cy: 3, rx: 40, ry: 9, "class": "t-st-shadow" });
    var body = add(fig, "g");                                 // bobs and hops
    var legL = add(body, "g"), legR = add(body, "g");
    [[legL, -1], [legR, 1]].forEach(function (q) {
      add(q[0], "rect", { x: q[1] * 11 - 9, y: -44, width: 18, height: 42, rx: 7, "class": "t-st-leg" });
      add(q[0], "ellipse", { cx: q[1] * 11 + 1, cy: -3, rx: 12, ry: 5.5, "class": "t-st-sandal" });
      L.set(q[0], { svgOrigin: q[1] * 11 + " -44" });
    });
    var armL = limb(body, L, -1);
    var torso = add(body, "g");
    add(torso, "rect", { x: -25, y: -96, width: 50, height: 62, rx: 17, "class": "t-st-body" });
    add(torso, "path", { d: "M-9 -95L0 -78L9 -95M0 -78V-44", "class": "t-st-trim" });
    add(torso, "circle", { cx: 0, cy: -68, r: 2.2, "class": "t-st-button" });
    add(torso, "circle", { cx: 0, cy: -56, r: 2.2, "class": "t-st-button" });
    L.set(torso, { svgOrigin: "0 -36" });
    var armR = limb(body, L, 1);

    var head = add(body, "g");                                // tilts from the neck
    L.set(head, { svgOrigin: "0 -94" });
    if (look === "girl") { add(head, "path", { d: "M-30 -122Q-46 -104 -38 -80", "class": "t-st-plait" }); add(head, "path", { d: "M30 -122Q46 -104 38 -80", "class": "t-st-plait" }); }
    if (look === "aunty") add(head, "circle", { cx: 0, cy: -178, r: 12, "class": "t-st-hair" });
    add(head, "circle", { cx: -33, cy: -124, r: 7.5, "class": "t-st-skin" });
    add(head, "circle", { cx: 33, cy: -124, r: 7.5, "class": "t-st-skin" });
    add(head, "circle", { cx: 0, cy: -126, r: 33, "class": "t-st-skin" });
    add(head, "circle", { cx: -20, cy: -113, r: 7, "class": "t-st-cheek" });
    add(head, "circle", { cx: 20, cy: -113, r: 7, "class": "t-st-cheek" });
    add(head, "path", { d: DOME, "class": look === "uncle" ? "t-st-turban" : "t-st-hair" });
    if (look === "uncle") {
      add(head, "path", { d: "M-28 -150Q0 -172 30 -148M-14 -172Q10 -164 24 -142", "class": "t-st-fold" });
      add(head, "circle", { cx: 4, cy: -175, r: 6.5, "class": "t-st-pin" });
    }
    if (look === "aunty") add(head, "circle", { cx: 0, cy: -140, r: 3, "class": "t-st-bindi" });
    // eyes: open ones that blink and look about, and happy arcs for when they are delighted
    var eyes = add(head, "g"), pupils = [];
    [-13, 13].forEach(function (ex) {
      var e = add(eyes, "g");
      add(e, "ellipse", { cx: ex, cy: -125, rx: 7.6, ry: 9, "class": "t-st-eye" });
      var pu = add(e, "g");
      add(pu, "circle", { cx: ex, cy: -125, r: 4, "class": "t-st-ink" });
      add(pu, "circle", { cx: ex - 1.2, cy: -126.5, r: 1.3, "class": "t-st-glint" });
      pupils.push(pu);
      L.set(e, { svgOrigin: ex + " -125" });
      if (!L.reduced) L.to(e, { scaleY: 0.1, duration: 0.07, repeat: -1, yoyo: true, repeatDelay: 3.4, delay: 1.2 + Math.random() * 0.02 }, true);
    });
    var joy = add(head, "path", { d: "M-20 -123Q-13 -134 -6 -123M6 -123Q13 -134 20 -123", "class": "t-st-joy" });
    joy.style.display = "none";
    var browL = add(head, "path", { d: "M-21 -139L-7 -140", "class": "t-st-brow" });
    var browR = add(head, "path", { d: "M7 -140L21 -139", "class": "t-st-brow" });
    L.set(browR, { svgOrigin: "14 -139" });
    var mouth = add(head, "path", { d: MOUTH.calm, "class": "t-st-mouth" });
    if (look === "uncle") add(head, "path", { d: "M0 -108Q-11 -98 -23 -111M0 -108Q11 -98 23 -111", "class": "t-st-tache" });

    var q = add(fig, "g", { "class": "t-st-q" });
    add(q, "circle", { cx: 24, cy: -168, r: 4 });
    add(q, "circle", { cx: 40, cy: -190, r: 17 }); text(q, "?", 40, -189, "t-st-qmark");
    var say = add(walk, "g", { "class": "t-st-say" });
    add(say, "rect", { x: -58, y: -257, width: 176, height: 60, rx: 15, "class": "t-st-bubble-shadow" });
    add(say, "path", { d: "M-6 -184l14 -22h-26z", "class": "t-st-tail" });
    add(say, "rect", { x: -60, y: -262, width: 176, height: 60, rx: 15, "class": "t-st-bubble" });
    add(say, "path", { d: "M-16 -202.5h22", "class": "t-st-tail-join" });
    var l1 = text(say, "", 28, -242, "t-st-line"), l2 = text(say, "", 28, -220, "t-st-line");
    var off = (o.from === "right" ? 1 : -1) * 260;
    L.set(walk, { x: off });
    L.set(q, { scale: 0, svgOrigin: "40 -190" });
    L.set(say, { scale: 0, opacity: 0, svgOrigin: "0 -196" });
    L.set(shadow, { svgOrigin: "3 3" });
    // they glance over at the work on the board now and then
    if (!L.reduced) L.to(pupils, { x: 2.6, y: 0.8, duration: 0.35, ease: "power2.inOut", repeat: -1, yoyo: true, repeatDelay: 2.8, delay: 2 }, true);
    // alive while they stand there: a slow breath
    if (!L.reduced) L.to(torso, { scaleY: 1.025, duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);
    return { g: g, walk: walk, body: body, shadow: shadow, armL: armL, armR: armR, arm: armR.g, legL: legL, legR: legR, head: head, eyes: eyes,
      pupils: pupils, joy: joy, browR: browR, mouth: mouth, q: q, say: say, l1: l1, l2: l2, off: off, on: false };
  }

  /** a little burst of confetti over their head */
  function burst(P, L) {
    if (L.reduced) return;
    for (var i = 0; i < 18; i++) {
      var r = add(P.walk, "rect", { x: -3, y: -4, width: 6, height: 9, rx: 1.5, "class": "t-st-conf" + (i % 4) });
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 60 + Math.random() * 90;
      L.set(r, { x: 30, y: -205, rotation: Math.random() * 180 });
      L.to(r, { keyframes: [
        { x: 30 + Math.cos(a) * sp, y: -205 + Math.sin(a) * sp, rotation: "+=220", duration: 0.45, ease: "power2.out" },
        { x: "+=" + ((Math.random() - 0.5) * 50).toFixed(0), y: "+=150", opacity: 0, rotation: "+=200", duration: 1, ease: "power1.in" },
      ], onComplete: function () { var t = this.targets()[0]; if (t && t.parentNode) t.parentNode.removeChild(t); } }, true);
    }
  }

  function face(P, mood) {
    P.mouth.setAttribute("d", MOUTH[mood] || MOUTH.calm);
    P.mouth.setAttribute("class", "t-st-mouth" + (mood === "calm" ? "" : " is-open"));
    P.joy.style.display = mood === "happy" ? "" : "none";
    P.eyes.style.display = mood === "happy" ? "none" : "";
  }
  /** where an arm goes: swing from the shoulder (degrees, 0 = hanging) and how far the elbow folds */
  function pose(P, L, arm, swing, bend, dur) {
    L.to(arm.g, { rotation: arm.side * -swing, duration: dur || 0.4, ease: "back.out(1.6)", overwrite: "auto" }, true);
    L.to(arm.fore, { rotation: arm.side * -bend, duration: dur || 0.4, ease: "back.out(1.6)", overwrite: "auto" }, true);
  }
  function rest(P, L) { pose(P, L, P.armL, 9, 0); pose(P, L, P.armR, 9, 0); L.to(P.head, { rotation: 0, duration: 0.4, overwrite: "auto" }, true); L.to(P.browR, { rotation: 0, y: 0, duration: 0.3, overwrite: "auto" }, true); }
  function strides(P, L, delay) {
    L.to(P.body, { y: -5, duration: 0.14, repeat: 7, yoyo: true, ease: "sine.inOut", delay: delay || 0 }, true);
    L.to(P.legL, { rotation: 16, duration: 0.14, repeat: 7, yoyo: true, ease: "sine.inOut", delay: delay || 0 }, true);
    L.to(P.legR, { rotation: -16, duration: 0.14, repeat: 7, yoyo: true, ease: "sine.inOut", delay: (delay || 0) + 0.14 }, true);
  }
  function hop(P, L, times, height) {
    L.to(P.body, { keyframes: [{ y: -(height || 20), scaleY: 1.05, duration: 0.2, ease: "power2.out" }, { y: 0, scaleY: 1, duration: 0.36, ease: "bounce.out" }], repeat: (times || 1) - 1, overwrite: "auto" }, true);
    L.to(P.shadow, { keyframes: [{ scale: 0.7, opacity: 0.1, duration: 0.2 }, { scale: 1, opacity: 0.2, duration: 0.36 }], repeat: (times || 1) - 1, overwrite: "auto" }, true);
  }
  function lines(P, a, b) {
    P.l1.textContent = a || ""; P.l2.textContent = b || "";
    P.l1.setAttribute("y", b ? -242 : -231);
  }
  /** their eyes turn toward a point on the stage (viewBox units), or back to the front with no point */
  function lookAt(P, L, x, y) {
    var m = P.g.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/), dx = 0, dy = 0;
    if (m && x != null) { var ex = x - Number(m[1]), ey = y - (Number(m[2]) - 125), d = Math.sqrt(ex * ex + ey * ey) || 1; dx = ex / d * 2.8; dy = ey / d * 2.6; }
    L.to(P.pupils, { x: dx, y: dy, duration: 0.35, ease: "power2.out", overwrite: "auto" }, true);
  }

  /** walks on and gives a little wave */
  function enter(P, L, from) {
    if (from) { P.off = (from === "right" ? 1 : -1) * 260; L.set(P.walk, { x: P.off }); }
    P.on = true;
    L.to(P.walk, { x: 0, duration: 1.1, ease: "power2.out" });
    strides(P, L);
    L.wait(1100, function () { face(P, "happy"); pose(P, L, P.armR, 150, 25, 0.3); });
    L.to(P.armR.fore, { rotation: -55, duration: 0.17, repeat: 5, yoyo: true, ease: "sine.inOut", delay: 1.4 }, true);   // the wave never holds the story up
    L.wait(2500, function () { face(P, "calm"); rest(P, L); });
  }
  /** stuck: a question mark over the head, a cocked brow and a hand scratching it */
  function puzzled(P, L, on) {
    face(P, on ? "puzzled" : "calm");
    L.to(P.q, { scale: on ? 1 : 0, duration: 0.35, ease: on ? "back.out(3)" : "power2.in", overwrite: "auto" }, true);
    if (on) {
      pose(P, L, P.armR, 150, 100);
      L.to(P.head, { rotation: 7, duration: 0.4, ease: "power2.out", overwrite: "auto" }, true);
      L.to(P.browR, { rotation: -16, y: -4, duration: 0.3, overwrite: "auto" }, true);
    } else rest(P, L);
  }
  /** looks up, waiting to hear */
  function asks(P, L) { hop(P, L, 2, 9); }
  /** a speech bubble (one or two short lines, about 16 characters each) */
  function says(P, L, a, b) {
    lines(P, a, b);
    L.to(P.q, { scale: 0, duration: 0.2, overwrite: "auto" }, true);
    L.to(P.say, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)", overwrite: "auto" }, true);
  }
  function hush(P, L) { L.to(P.say, { scale: 0, opacity: 0, duration: 0.25, overwrite: "auto" }, true); }
  /** a cheer: both arms up, a jump or two, and what they say in a bubble */
  function cheer(P, L, a, b) {
    face(P, "happy");
    says(P, L, a, b);
    pose(P, L, P.armL, 140, 22, 0.3); pose(P, L, P.armR, 140, 22, 0.3);
    L.to(P.head, { rotation: 0, duration: 0.3, overwrite: "auto" }, true);
    L.to(P.browR, { rotation: 0, y: 0, duration: 0.2, overwrite: "auto" }, true);
    hop(P, L, 3, 26);
    burst(P, L);
  }
  /** walks off */
  function leave(P, L, to) {
    if (to) P.off = (to === "right" ? 1 : -1) * 260;
    P.on = false;
    hush(P, L); face(P, "calm"); rest(P, L);
    strides(P, L, 0.2);
    L.to(P.walk, { x: P.off, duration: 1.1, delay: 0.2, ease: "power2.in" }, true);
  }

  /* ---------- the world behind the lesson ---------- */
  /** scene(parent, L, { kind, w, h, horizon, sunX, hutX, river, road, before }) -> its group. Call it before drawing
      anything else, with before: c.world, so it sits behind the lesson and does not shake with the land.
        kind 'farm' (default): sky, a sun that rises as the lesson starts, drifting clouds, birds, hills, a hut (hutX),
          tufts and long grass swaying along the front. river: a canal shimmering along the back. road: a road along the
          back, with an auto-rickshaw going by now and then.
        kind 'village': the same sky over a row of houses behind a compound wall, and washing drying on a line.
        kind 'room': indoors: a wall, a window with swaying curtains and a slow sunbeam, a skirting board, a wooden floor.
      Colours come from --w-* variables (css/story.css), so dark mode turns it into night. The lesson engine fades the
      scene away when the 'rule' beat starts: the idea leaves the story behind (concreteness fading). */
  function scene(parent, L, o) {
    o = o || {};
    var W = o.w || 800, H = o.h || 470, hz = o.horizon || 118, kind = o.kind || "farm";
    var id = "w" + Math.random().toString(36).slice(2, 7);
    var g = add(parent, "g", { "class": "t-st-world is-" + kind, "aria-hidden": "true" });
    if (o.before && o.before.parentNode === parent) parent.insertBefore(g, o.before);
    var defs = add(g, "defs");
    function grad(name, a, b) {
      var lg = add(defs, "linearGradient", { id: id + name, x1: 0, y1: 0, x2: 0, y2: 1 });
      add(lg, "stop", { offset: 0, "class": a }); add(lg, "stop", { offset: 1, "class": b });
      return "url(#" + id + name + ")";
    }
    function loop(target, vars) { return L.reduced ? null : L.to(target, vars, true); }
    function cloud(p, x, y, s) {
      var cl = add(p, "g", { "class": "t-w-cloud" });
      add(cl, "rect", { x: -46 * s, y: y - 4 * s, width: 92 * s, height: 22 * s, rx: 11 * s });
      add(cl, "circle", { cx: -20 * s, cy: y - 6 * s, r: 18 * s });
      add(cl, "circle", { cx: 6 * s, cy: y - 14 * s, r: 24 * s });
      add(cl, "circle", { cx: 30 * s, cy: y - 2 * s, r: 15 * s });
      return cl;
    }
    function drift(cl, from, to, dur, at) {
      L.set(cl, { x: from });
      if (L.reduced) { L.set(cl, { x: from + (to - from) * at }); return; }
      var tw = L.to(cl, { x: to, duration: dur, repeat: -1, ease: "none" }, true);
      if (tw) tw.progress(at);
    }

    if (kind === "room") room(); else outdoors();
    L.backdrop = g;
    return g;

    function outdoors() {
      add(g, "rect", { x: 0, y: 0, width: W, height: hz + 30, fill: grad("sky", "t-w-sky1", "t-w-sky2") });

      // the sun comes up as the lesson starts, then its rays turn slowly and breathe
      var sx = o.sunX || 330, sy = 50, sun = add(g, "g");
      add(sun, "circle", { cx: sx, cy: sy, r: 44, "class": "t-w-glow" });
      var rays = add(sun, "g");
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6, r1 = i % 2 ? 34 : 38;
        add(rays, "path", { d: "M" + (sx + Math.cos(a) * 26).toFixed(1) + " " + (sy + Math.sin(a) * 26).toFixed(1) + "L" + (sx + Math.cos(a) * r1).toFixed(1) + " " + (sy + Math.sin(a) * r1).toFixed(1), "class": "t-w-ray" });
      }
      add(sun, "circle", { cx: sx, cy: sy, r: 19, "class": "t-w-sun" });
      add(sun, "circle", { cx: sx - 6, cy: sy - 6, r: 7, "class": "t-w-sunshine" });
      L.set(rays, { svgOrigin: sx + " " + sy });
      L.set(sun, { y: 70, opacity: 0 });
      L.to(sun, { y: 0, opacity: 1, duration: 1.8, delay: 0.2, ease: "power2.out" }, true);
      loop(rays, { rotation: 360, duration: 70, repeat: -1, ease: "none" });
      loop(rays, { scale: 1.08, duration: 1.8, repeat: -1, yoyo: true, ease: "sine.inOut" });

      [[60, 40, 1, 95], [470, 66, 0.72, 130], [650, 30, 0.56, 80]].forEach(function (c) {
        drift(cloud(g, 0, c[1], c[2]), -80, W + 80, c[3], (c[0] + 80) / (W + 160));
      });

      var birds = add(g, "g", { "class": "t-w-birds" });
      var b1 = add(birds, "path", { d: "M-11 -5Q-4 -8 0 0Q4 -8 11 -5", transform: "translate(0 62)" });
      var b2 = add(birds, "path", { d: "M-9 -4Q-3 -7 0 0Q3 -7 9 -4", transform: "translate(30 78)" });
      L.set(birds, { x: W + 60 });
      loop(birds, { x: -80, duration: 24, repeat: -1, repeatDelay: 6, ease: "none", delay: 3 });
      loop([b1, b2], { scaleY: 0.35, duration: 0.28, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.14, transformOrigin: "50% 100%" });

      hill(hz, 26, 0.6, "t-w-hill1");
      if (kind === "village") village(); else hill(hz + 12, 17, 2.4, "t-w-hill2");

      if (kind === "farm" && o.hutX != null) {
        var hx = o.hutX, hy = hz + 6, hut = add(g, "g", { "class": "t-w-hut" });
        add(hut, "rect", { x: hx - 20, y: hy - 22, width: 40, height: 25, rx: 3, "class": "t-w-wall" });
        add(hut, "path", { d: "M" + (hx - 27) + " " + (hy - 20) + "L" + hx + " " + (hy - 42) + "L" + (hx + 27) + " " + (hy - 20) + "Z", "class": "t-w-roof" });
        add(hut, "rect", { x: hx - 5, y: hy - 12, width: 10, height: 15, rx: 2, "class": "t-w-door" });
        // a wisp of smoke from the hut
        var smoke = add(hut, "g", { "class": "t-w-smoke" });
        for (var k = 0; k < 3; k++) {
          var puff = add(smoke, "circle", { cx: hx + 12, cy: hy - 40, r: 4 + k });
          L.set(puff, { opacity: 0 });
          loop(puff, { keyframes: [{ y: 0, x: 0, opacity: 0.55, scale: 0.6, duration: 0.01 }, { y: -26, x: 8, opacity: 0, scale: 1.6, duration: 2.6, ease: "sine.out" }], repeat: -1, delay: k * 0.9, transformOrigin: "50% 50%" });
        }
      }
      add(g, "rect", { x: 0, y: hz + 18, width: W, height: H - hz - 18, fill: grad("gr", "t-w-ground1", "t-w-ground2") });
      if (o.river) canal();
      if (o.road) road();
      if (kind === "farm") grass();
    }

    function hill(y, amp, ph, cls) {
      var d = "M0 " + (y + 60) + "V" + (y - amp * (0.5 + 0.5 * Math.sin(ph))).toFixed(1), n = 6;
      for (var k = 1; k <= n; k++) {
        var x0 = W * (k - 1) / n, x1 = W * k / n;
        d += "Q" + ((x0 + x1) / 2).toFixed(1) + " " + (y - amp * (0.5 + 0.5 * Math.sin(ph + (k - 0.5) * 1.9 + 0.8)) * 1.25).toFixed(1) + " " + x1.toFixed(1) + " " + (y - amp * (0.5 + 0.5 * Math.sin(ph + k * 1.9))).toFixed(1);
      }
      add(g, "path", { d: d + "V" + (y + 60) + "Z", "class": cls });
    }

    function grass() {
      var tufts = [], blades = [];
      for (var t = 0; t < 14; t++) {
        var tx = 30 + (t * 197) % (W - 60), ty = hz + 50 + (t * 131) % (H - hz - 100);
        var tf = add(g, "path", { d: "M" + (tx - 4) + " " + ty + "l-3 -8M" + tx + " " + ty + "v-11M" + (tx + 4) + " " + ty + "l3 -8", "class": "t-w-tuft" });
        L.set(tf, { svgOrigin: tx + " " + ty }); tufts.push(tf);
      }
      for (var j = 0; j < 58; j++) {
        var gx = j * 14 + (j * 37) % 9, bh = 12 + (j * 53) % 14;
        var bl = add(g, "path", { d: "M" + (gx - 3) + " " + (H + 2) + "Q" + (gx - 1) + " " + (H - bh * 0.6) + " " + gx + " " + (H - bh) + "Q" + (gx + 2) + " " + (H - bh * 0.6) + " " + (gx + 4) + " " + (H + 2) + "Z", "class": j % 3 ? "t-w-blade2" : "t-w-blade1" });
        L.set(bl, { svgOrigin: gx + " " + H, rotation: -6 }); blades.push(bl);
      }
      // a breeze runs along the grass, front to back
      loop(tufts, { rotation: 14, duration: 1.7, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.21, from: "random" } });
      loop(blades, { rotation: 8, duration: 1.5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.045, from: "start" } });
    }

    function canal() {
      var y0 = hz + 22, y1 = hz + 40;
      add(g, "rect", { x: 0, y: y0, width: W, height: y1 - y0, "class": "t-w-water" });
      add(g, "path", { d: "M0 " + y0 + "H" + W + "M0 " + y1 + "H" + W, "class": "t-w-bank" });
      for (var i = 0; i < 9; i++) {
        var x = 40 + i * 88 + (i % 2) * 20, y = y0 + 5 + (i % 3) * 4;
        var sh = add(g, "path", { d: "M" + x + " " + y + "h" + (14 + (i % 3) * 6), "class": "t-w-shimmer" });
        loop(sh, { x: 26, opacity: 0.15, duration: 1.6 + (i % 3) * 0.4, repeat: -1, yoyo: true, ease: "sine.inOut", delay: i * 0.17 });
      }
    }

    function road() {
      var y0 = hz + 20, y1 = hz + 44;
      add(g, "rect", { x: 0, y: y0, width: W, height: y1 - y0, "class": "t-w-road" });
      add(g, "path", { d: "M0 " + y0 + "H" + W + "M0 " + y1 + "H" + W, "class": "t-w-kerb" });
      add(g, "path", { d: "M0 " + ((y0 + y1) / 2) + "H" + W, "class": "t-w-lane" });
      // an auto-rickshaw goes by now and then, wheels spinning
      var lane = add(g, "g", { transform: "translate(0 " + (y1 - 4) + ")" }), car = add(lane, "g", { "class": "t-w-auto" });
      add(car, "path", { d: "M-20 0V-13Q-20 -26 -6 -27H9Q22 -27 22 -12V0Z", "class": "t-w-auto-body" });
      add(car, "path", { d: "M-17 -25Q-12 -32 2 -32H14Q20 -32 20 -25", "class": "t-w-auto-roof" });
      add(car, "rect", { x: 3, y: -22, width: 13, height: 10, rx: 2, "class": "t-w-auto-glass" });
      [-11, 13].forEach(function (wx) {
        var wh = add(car, "g");
        add(wh, "circle", { cx: wx, cy: 0, r: 5.5, "class": "t-w-wheel" });
        add(wh, "path", { d: "M" + (wx - 4) + " 0h8M" + wx + " -4v8", "class": "t-w-spoke" });
        L.set(wh, { svgOrigin: wx + " 0" });
        loop(wh, { rotation: 360, duration: 0.45, repeat: -1, ease: "none" });
      });
      L.set(car, { x: -60 });
      loop(car, { x: W + 60, duration: 9, repeat: -1, repeatDelay: 11, ease: "none", delay: 4 });
      loop(car, { y: -1.5, duration: 0.12, repeat: -1, yoyo: true, ease: "sine.inOut" });
    }

    function village() {
      var base = hz + 16;
      // houses behind the compound wall; their windows glow at night (dark mode)
      [[150, 64, 46, "flat"], [262, 78, 58, "roof"], [420, 70, 50, "flat"], [548, 84, 60, "roof"], [690, 66, 44, "flat"]].forEach(function (hs) {
        var x = hs[0], w = hs[1], h = hs[2], hg = add(g, "g", { "class": "t-w-house" });
        add(hg, "rect", { x: x - w / 2, y: base - h, width: w, height: h, rx: 2, "class": "t-w-hwall" });
        if (hs[3] === "roof") add(hg, "path", { d: "M" + (x - w / 2 - 6) + " " + (base - h + 2) + "L" + x + " " + (base - h - 24) + "L" + (x + w / 2 + 6) + " " + (base - h + 2) + "Z", "class": "t-w-roof" });
        else add(hg, "rect", { x: x - w / 2 - 3, y: base - h - 6, width: w + 6, height: 8, rx: 2, "class": "t-w-parapet" });
        add(hg, "rect", { x: x - 9, y: base - h + 12, width: 18, height: 14, rx: 2, "class": "t-w-hwin" });
      });
      // the compound wall
      add(g, "rect", { x: 0, y: base, width: W, height: 22, "class": "t-w-cwall" });
      add(g, "rect", { x: 0, y: base - 4, width: W, height: 6, rx: 2, "class": "t-w-coping" });
      // washing on a line, swaying in the breeze
      var lx0 = 30, lx1 = 220, ly = 50;
      add(g, "path", { d: "M" + lx0 + " " + (ly - 10) + "V" + (base - 2) + "M" + lx1 + " " + (ly - 10) + "V" + (base - 2), "class": "t-w-pole" });
      add(g, "path", { d: "M" + lx0 + " " + ly + "Q" + ((lx0 + lx1) / 2) + " " + (ly + 14) + " " + lx1 + " " + ly, "class": "t-w-line" });
      [[66, 4, "t-w-cloth1"], [122, 8, "t-w-cloth2"], [178, 5, "t-w-cloth3"]].forEach(function (cl, i) {
        var cy = ly + cl[1], c = add(g, "rect", { x: cl[0] - 17, y: cy, width: 34, height: 44, rx: 3, "class": cl[2] });
        add(g, "path", { d: "M" + (cl[0] - 12) + " " + cy + "v4M" + (cl[0] + 12) + " " + cy + "v4", "class": "t-w-peg" });
        L.set(c, { svgOrigin: cl[0] + " " + cy });
        loop(c, { skewX: 7, rotation: 3, duration: 1.3 + i * 0.25, repeat: -1, yoyo: true, ease: "sine.inOut", delay: i * 0.3 });
      });
    }

    function room() {
      add(g, "rect", { x: 0, y: 0, width: W, height: H, "class": "t-w-wallin" });
      add(g, "rect", { x: 0, y: 286, width: W, height: 50, "class": "t-w-dado" });
      add(g, "path", { d: "M0 286H" + W, "class": "t-w-rail" });
      // a window, with the sky and a cloud going by outside
      var wx = 30, wy = 34, ww = 168, wh = 124, clip = id + "win";
      add(add(defs, "clipPath", { id: clip }), "rect", { x: wx, y: wy, width: ww, height: wh, rx: 6 });
      var view = add(g, "g", { "clip-path": "url(#" + clip + ")" });
      add(view, "rect", { x: wx, y: wy, width: ww, height: wh, fill: grad("sky", "t-w-sky1", "t-w-sky2") });
      add(view, "path", { d: "M" + wx + " " + (wy + wh) + "Q" + (wx + 50) + " " + (wy + wh - 30) + " " + (wx + 100) + " " + (wy + wh - 12) + "T" + (wx + ww) + " " + (wy + wh - 18) + "V" + (wy + wh) + "Z", "class": "t-w-hill1" });
      drift(cloud(view, 0, wy + 40, 0.6), wx - 60, wx + ww + 60, 26, 0.35);
      add(g, "rect", { x: wx, y: wy, width: ww, height: wh, rx: 6, "class": "t-w-frame" });
      add(g, "path", { d: "M" + (wx + ww / 2) + " " + wy + "V" + (wy + wh) + "M" + wx + " " + (wy + wh / 2) + "H" + (wx + ww), "class": "t-w-mullion" });
      add(g, "rect", { x: wx - 10, y: wy + wh, width: ww + 20, height: 9, rx: 3, "class": "t-w-sill" });
      // curtains that sway a little
      [[wx - 16, 1], [wx + ww + 16, -1]].forEach(function (cu, i) {
        var x = cu[0], s = cu[1];
        var c = add(g, "path", { d: "M" + (x - 16) + " " + (wy - 12) + "H" + (x + 16) + "Q" + (x + 10 * s + 6) + " " + (wy + 60) + " " + (x + 14 * s) + " " + (wy + wh + 14) + "H" + (x - 14 * s) + "Q" + (x - 4 * s) + " " + (wy + 60) + " " + (x - 16) + " " + (wy - 12) + "Z", "class": "t-w-curtain" });
        L.set(c, { svgOrigin: x + " " + (wy - 12) });
        loop(c, { skewX: 4 * s, duration: 2.4 + i * 0.5, repeat: -1, yoyo: true, ease: "sine.inOut" });
      });
      add(g, "path", { d: "M" + (wx - 40) + " " + (wy - 12) + "H" + (wx + ww + 40), "class": "t-w-rod" });
      // a sunbeam falling from the window to the floor, gently brightening and fading
      var beam = add(g, "path", { d: "M" + (wx + 40) + " " + (wy + wh) + "L" + (wx + ww) + " " + (wy + wh) + "L" + (wx + ww + 250) + " " + H + "L" + (wx + 150) + " " + H + "Z", "class": "t-w-beam" });
      loop(beam, { opacity: 0.08, duration: 3.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
      // skirting and a wooden floor
      add(g, "rect", { x: 0, y: 336, width: W, height: 12, "class": "t-w-skirting" });
      add(g, "rect", { x: 0, y: 348, width: W, height: H - 348, "class": "t-w-floor" });
      var d = "";
      for (var y = 370, r = 0; y < H; y += 24, r++) {
        d += "M0 " + y + "H" + W;
        for (var x = (r % 2) * 90 + 40; x < W; x += 180) d += "M" + x + " " + (y - 24) + "V" + y;
      }
      add(g, "path", { d: d, "class": "t-w-plank" });
    }
  }

  /* ---------- the shared steps ---------- */
  function guessStep(o) {
    return { beat: "guess", caption: o.caption,
      task: function (c, L, done) {
        L.ask(o.prompt || "Your guess:", o.choices, function (v) {
          c.guess = v;
          L.say((v ? o.guessed : o.none).caption, function () { done(v); });
        });
      } };
  }

  function tellStep(o) {
    return { beat: "tell", caption: o.caption,
      run: function (c, L) { asks(o.who(c), L); },
      task: function (c, L, done) {
        var tries = 0;
        L.number(o.prompt, function (v) {
          if (Math.abs(v - o.answer) <= (o.tol || 0) + 1e-9) return true;
          var w = (o.wrong || []).filter(function (x) { return Math.abs(x.value - v) < 1e-9; })[0];
          tries++;
          L.record({ qid: o.qid, skill: o.skill, correct: false, mixup: tries === 1 && w ? w.mixup : null, answer: String(v), noMastery: true });
          L.sfx("oops"); L.say((w || o.other).caption);
          return "Not quite. Have another go.";
        }, function (v) {
          L.record({ qid: o.qid, skill: o.skill, correct: true, answer: String(v), noMastery: true });
          L.sfx("chime"); cheer(o.who(c), L, o.thanks[0], o.thanks[1]);
          var g = c.guess, r = g === o.answer ? o.same : (g ? o.close : o.plain);
          L.say((r || o.plain).caption, function () { done(v); });
        });
      } };
  }

  function howStep(o) {
    return { caption: o.caption,
      run: function (c, L) { var P = o.who(c); face(P, "calm"); rest(P, L); says(P, L, o.bubble[0], o.bubble[1]); },
      task: function (c, L, done) {
        L.ask(o.prompt || "Tell them how:", o.choices.map(function (ch, i) { return { label: ch.label, value: i }; }), function (i) {
          var ch = o.choices[i];
          L.record({ qid: o.qid, skill: o.skill, correct: !!ch.correct, mixup: ch.correct ? null : (ch.mixup || null), answer: ch.label, noMastery: true });
          L.sfx(ch.correct ? "chime" : "oops");
          L.say(ch.caption, function () { if (o.leave) leave(o.who(c), L); else hush(o.who(c), L); done(ch.value); });
        });
      } };
  }

  C.story = {
    person: person, enter: enter, puzzled: puzzled, asks: asks, says: says, hush: hush, cheer: cheer, leave: leave,
    lookAt: lookAt, scene: scene, farm: scene, burst: burst,
    guessStep: guessStep, tellStep: tellStep, howStep: howStep,
    BEATS: [["story", "Story"], ["guess", "Guess"], ["hands", "Try it"], ["tell", "Tell"], ["rule", "Rule"]],
  };
})();
