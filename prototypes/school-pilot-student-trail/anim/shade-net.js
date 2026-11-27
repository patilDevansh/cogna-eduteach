/* Meena's shade net — a story lesson for skill a7: hidden heights, with Pythagoras.
   A triangle with sides 10, 10 and 12 and no height given. The student:
     1. drags a plumb line from the top corner straight down to the base (it lands in the middle: 6 and 6)
     2. looks at one right-angled half (longest side 10, short side 6) and finds the height, 8
     3. works out ½ × 12 × 8 = 48, and the sign counts up
   then tells Meena the answer and how they knew. The rule beat lists the three steps on a plain triangle and ends
   with a 13, 13, 10 triangle the student does alone (area 60).
   Built on Cogna.lesson + Cogna.story + Cogna.landKit. The net is cloth, not grass: its colours are on .t-net
   (css/lessons/shade-net.css). Every spoken line is a literal `caption:` so tools/record-narration.mjs finds it.
   Every rotate/scale origin is a point (svgOrigin), because lessons are built off-screen. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, K = C.story, LK = C.landKit;
  var W = 800, H = 470, SKILL = "a7";
  /* the net: base 12 m, sides 10 m, height 8 m, at 30 units to the metre */
  var A = [410, 110], BL = [230, 350], BR = [590, 350], F = [410, 350], DROP = 240;
  var HALF_C = [470, 270], HALF_DX = 36;                 // the right-hand half: its middle, and how far it lifts out
  /* the plain triangle of the rule beat, and the 13, 13, 10 triangle the student does alone (20 units to the metre) */
  var PA = [270, 130], PL = [150, 330], PR = [390, 330], PF = [270, 330];
  var OA = [400, 120], OL = [300, 360], OR = [500, 360], OF = [400, 360];

  /* reaction lines (spoken inside a task) */
  var R = {
    guessed: { caption: "Good. Hold on to that guess, and let's find out for sure." },
    noGuess: { caption: "That's fine. Let's find out together." },
    dropShort: { caption: "Not far enough. The height goes all the way down to the base." },
    dropGood: { caption: "That is the height. It meets the base at a right angle, right in the middle: 6 metres each side." },
    h64: { caption: "64 is the height times itself. Take the square root.", mixup: "noroot" },
    h4: { caption: "10 − 6 is 4, but sides do not subtract like that. Use the squares.", mixup: "wrongc" },
    h16: { caption: "That adds the sides. Which number times itself makes 64?" },
    hOther: { caption: "Which number times itself makes 64?" },
    hRight: { caption: "Yes. 8 × 8 is 64, so the height is 8 metres." },
    a96: { caption: "96 is 12 × 8. You forgot the half.", mixup: "half" },
    a60: { caption: "That used the slanted 10 as the height. The height is 8.", mixup: "slant" },
    aOther: { caption: "Half of 12 is 6. Then 6 × 8." },
    aRight: { caption: "48 square metres of net." },
    t60: { caption: "That used the slanted side, 10, as the height. The real height is 8.", mixup: "slant" },
    t96: { caption: "96 is 12 × 8. A triangle is half of that.", mixup: "half" },
    t32: { caption: "32 is the distance round the edge. We want the cloth inside.", mixup: "perim" },
    tOther: { caption: "Use half of the base times the height: ½ × 12 × 8." },
    tellSame: { caption: "She says thank you! And 48 was your guess at the start. Spot on." },
    tellClose: { caption: "She says thank you! Your first guess was a start, and now you know for sure." },
    tellPlain: { caption: "She says thank you! Now she knows exactly how much net to buy." },
    o65: { caption: "That used the slanted side, 13, as the height. Drop the real height first.", mixup: "slant" },
    o120: { caption: "120 is 10 × 12. You forgot the half.", mixup: "half" },
    o12: { caption: "12 is the height. Now use it: ½ × 10 × 12." },
    oOther: { caption: "Drop the height to the middle of the base. Half of 10 is 5, so use 13 and 5." },
    oRight: { caption: "60! Half the base is 5, so the height is 12. And ½ × 10 × 12 is 60." },
  };

  /* ---------- drawing helpers ---------- */
  var add = LK.add, shade = LK.shade;
  function pts(P) { return P.map(function (p) { return p[0] + "," + p[1]; }).join(" "); }
  /** a label that starts hidden and pops in at its own spot */
  function lab(L, parent, str, x, y, cls) {
    var e = LK.text(parent, str, x, y, cls || "t-pf-lab");
    L.set(e, { opacity: 0, scale: 0.4, svgOrigin: x + " " + y });
    return e;
  }
  function show(L, e, delay, quiet) {
    L.to(e, { opacity: 1, scale: 1, duration: 0.4, delay: delay || 0, ease: "back.out(3)", overwrite: "auto",
      onStart: function () { if (!quiet) L.sfx("pop"); } });
  }
  function hide(L, e, delay) { L.to(e, { opacity: 0, scale: 0.6, duration: 0.25, delay: delay || 0, overwrite: "auto" }, true); }
  /** a triangle of net cloth: the cloth, its mesh and its rope edge */
  function cloth(c, parent, P, hot) {
    add(parent, "polygon", { points: pts(P), "class": "t-net-cloth" });
    add(parent, "polygon", { points: pts(P), fill: "url(#" + c.meshId + ")" });
    return add(parent, "polygon", { points: pts(P), "class": "t-net-edge" + (hot ? " is-hot" : "") });
  }
  function setPlumb(c, y) { c.plumb.setAttribute("y2", Math.max(0, y).toFixed(1)); }
  function handleY(c) { return window.gsap ? Number(window.gsap.getProperty(c.handle, "y")) || 0 : 0; }
  /** log an answer typed inside one of this lesson's own tasks */
  function log(L, qid, v, ok, mixup) {
    L.record({ qid: qid, skill: SKILL, correct: ok, mixup: ok ? null : (mixup || null), answer: String(v), noMastery: true });
  }

  /** the right-hand half lifts out of the net: a right-angled triangle with sides 10, 6 and "?" */
  function liftHalf(c, L) {
    var p = c.half;
    p.g.style.display = "";
    L.to([c.lSideL, c.lSideR, c.l6a, c.l6b], { opacity: 0, duration: 0.3, overwrite: "auto" });
    L.to([c.clothG, c.plumb, c.mark, c.pegs], { opacity: 0.25, duration: 0.4 });
    L.to(p.g, { opacity: 1, duration: 0.25, delay: 0.3 });
    L.wait(550, function () { L.sfx("pickup"); });
    L.to(p.lift, { y: -12, scale: 1.03, duration: 0.3, delay: 0.55, ease: "power2.out" });
    L.to(p.shadow, Object.assign(shade(LK.HELD), { duration: 0.3, delay: 0.55, ease: "power2.out" }));
    L.to(p.g, { x: HALF_DX, duration: 0.6, delay: 0.6, ease: "back.out(2)" });
    show(L, c.h10, 1.2); show(L, c.h6, 1.6); show(L, c.hQ, 2.0);
  }
  /** and goes back: the whole net again, with its base and its height */
  function putBack(c, L) {
    var p = c.half;
    L.to(p.g, { x: 0, duration: 0.6, ease: "power2.inOut" });
    L.to(p.lift, { y: 0, scale: 1, duration: 0.34, delay: 0.6, ease: "back.out(2.6)" });
    L.to(p.shadow, Object.assign(shade(LK.REST), { duration: 0.3, delay: 0.6, ease: "power2.out" }));
    L.wait(700, function () { L.sfx("snap"); LK.shake(c, L, 2); });
    L.to([c.clothG, c.plumb, c.mark, c.pegs], { opacity: 1, duration: 0.4, delay: 0.7 });
    L.to(p.g, { opacity: 0, duration: 0.35, delay: 0.9, onComplete: function () { p.g.style.display = "none"; } });
    c.lBase.textContent = "12 m";
    show(L, c.lBase, 1.3); show(L, c.hLab, 1.7);
    show(L, c.lSideL, 2.1, true); show(L, c.lSideR, 2.1, true);
  }

  C.lesson.define({
    id: "shade-net", title: "Meena's shade net", cls: "t-pf t-net", w: W, h: H, durationMs: 200000,
    presenter: { x: 700, y: 360, h: 106 },

    build: function (svg, L) {
      var c = LK.setup(svg, L);
      K.scene(svg, L, { w: W, h: H, sunX: 150, before: c.world });   // the farm, where the seedlings need shade
      c.meshId = "net-mesh-" + c.key;
      add(add(c.defs, "pattern", { id: c.meshId, width: 12, height: 12, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }),
        "path", { d: "M0 0H12M0 0V12", "class": "t-net-thread" });

      // the sign: how much net
      c.sign = LK.sign(c, W, "NET");
      c.sign.set(null, null, "sq m");

      // Meena waits off to the left until the story brings her on (drawn first, so moving pieces pass over her)
      c.meena = K.person(c.world, L, { x: 74, y: 420, look: "girl" });

      /* ----- the net ----- */
      c.gNet = add(c.world, "g");
      c.netShadow = add(c.gNet, "polygon", { points: pts([A, BR, BL]), "class": "t-pf-shadow", filter: "url(#" + c.blurId + ")" });
      L.set(c.netShadow, { x: 8, y: 14, opacity: 0.16 });
      c.clothG = add(c.gNet, "g");
      cloth(c, c.clothG, [A, BR, BL]);
      c.pegs = add(c.gNet, "g", { "class": "t-net-labs" });
      [A, BL, BR].forEach(function (p) { add(c.pegs, "circle", { cx: p[0], cy: p[1], r: 6, "class": "t-net-peg" }); });
      c.target = add(c.gNet, "circle", { cx: F[0], cy: F[1], r: 15, "class": "t-net-target" });
      L.set(c.target, { opacity: 0 });

      c.gLab = add(c.gNet, "g", { "class": "t-net-labs" });
      c.lSideL = lab(L, c.gLab, "10 m", 290, 207);
      c.lSideR = lab(L, c.gLab, "10 m", 530, 207);
      c.lBase = lab(L, c.gLab, "12 m", 410, 386);
      c.l6a = lab(L, c.gLab, "6 m", 320, 386);
      c.l6b = lab(L, c.gLab, "6 m", 500, 386);
      c.hLab = lab(L, c.gLab, "8 m", 398, 245, "t-pf-lab t-pf-end");
      c.mark = add(c.gLab, "path", { d: "M" + (F[0] + 16) + " " + F[1] + "V" + (F[1] - 16) + "H" + F[0], "class": "t-net-mark" });
      L.set(c.mark, { opacity: 0, scale: 0.2, svgOrigin: F[0] + " " + F[1] });

      // the plumb line and the gold dot that pulls it down (its own coordinates start at the top corner)
      c.gPlumb = add(c.gNet, "g", { transform: "translate(" + A[0] + " " + A[1] + ")" });
      c.plumb = add(c.gPlumb, "line", { x1: 0, y1: 0, x2: 0, y2: 0, "class": "t-net-plumb" });
      c.finger = LK.finger(c, c.gPlumb);
      c.handle = add(c.gPlumb, "g", { "class": "t-pf-handleg" });
      add(c.handle, "ellipse", { cx: 3, cy: 9, rx: 19, ry: 12, "class": "t-pf-handle-shadow", filter: "url(#" + c.blurSmallId + ")" });
      add(c.handle, "circle", { r: 28, "class": "t-pf-handle-ring" });
      c.knob = add(c.handle, "g");
      add(c.knob, "circle", { r: 17, "class": "t-pf-handle" });
      add(c.knob, "path", { d: "M-6 -7L0 -1L6 -7M-6 1L0 7L6 1", "class": "t-pf-chev" });
      c.handleHit = add(c.handle, "circle", { r: 44, "class": "t-pf-hit", tabindex: "-1", role: "slider",
        "aria-label": "The gold dot at the top of the net. Press the down arrow to drag it to the base, or Enter to drop it." });
      L.set(c.handle, { x: 0, y: 0, opacity: 0 });
      L.set(c.knob, { scale: 0, svgOrigin: "0 0" });
      c.handle.style.pointerEvents = "none";

      // the right-hand half, for the moment it lifts out
      var hp = { g: add(c.gNet, "g", { "class": "t-net-labs" }) };
      hp.shadow = add(hp.g, "polygon", { points: pts([A, BR, F]), "class": "t-pf-shadow", filter: "url(#" + c.blurId + ")" });
      L.set(hp.shadow, shade(LK.REST));
      hp.lift = add(hp.g, "g");
      cloth(c, hp.lift, [A, BR, F], true);
      add(hp.lift, "path", { d: "M" + (F[0] + 16) + " " + F[1] + "V" + (F[1] - 16) + "H" + F[0], "class": "t-net-mark" });
      c.h10 = lab(L, hp.lift, "10 m", 530, 207);
      c.h6 = lab(L, hp.lift, "6 m", 500, 386);
      c.hQ = lab(L, hp.lift, "?", 392, 240, "t-pf-lab t-pf-end t-net-q");
      L.set(hp.lift, { svgOrigin: HALF_C[0] + " " + HALF_C[1] });
      L.set(hp.g, { opacity: 0 }); hp.g.style.display = "none";
      c.half = hp;
      L.set(c.gNet, { opacity: 0 });

      /* ----- the rule: a plain triangle and the three steps ----- */
      c.gRule = add(c.world, "g", { "class": "t-net-labs" });
      c.gRule.style.display = "none";
      add(c.gRule, "polygon", { points: pts([PA, PR, PL]), "class": "t-net-plain" });
      c.pHalf = add(c.gRule, "polygon", { points: pts([PA, PR, PF]), "class": "t-net-half" });
      c.pBase = add(c.gRule, "line", { x1: PL[0], y1: PL[1], x2: PR[0], y2: PR[1], "class": "t-net-glow" });
      c.pDrop = add(c.gRule, "line", { x1: PA[0], y1: PA[1], x2: PA[0], y2: PA[1], "class": "t-net-plumb" });
      c.pMark = add(c.gRule, "path", { d: "M" + (PF[0] + 14) + " " + PF[1] + "V" + (PF[1] - 14) + "H" + PF[0], "class": "t-net-mark" });
      L.set([c.pHalf, c.pBase], { opacity: 0 });
      L.set(c.pMark, { opacity: 0, scale: 0.2, svgOrigin: PF[0] + " " + PF[1] });
      c.pa = lab(L, c.gRule, "a", 330, 354);
      c.pb = lab(L, c.gRule, "b", 252, 238);
      c.pc = lab(L, c.gRule, "c", 354, 216);
      c.pBaseLab = lab(L, c.gRule, "base", 270, 356);
      c.pHLab = lab(L, c.gRule, "height", 260, 238, "t-pf-lab t-pf-end");
      c.s1 = lab(L, c.gRule, "1  Drop the height", 430, 170, "t-pf-lab t-net-step");
      c.s2 = lab(L, c.gRule, "2  Find it: a² + b² = c²", 430, 225, "t-pf-lab t-net-step");
      c.s3 = lab(L, c.gRule, "3  ½ × base × height", 430, 280, "t-pf-lab t-net-step");

      /* ----- on your own: sides 13, 13 and 10 ----- */
      c.gOwn = add(c.world, "g", { "class": "t-net-labs" });
      c.gOwn.style.display = "none";
      add(c.gOwn, "polygon", { points: pts([OA, OR, OL]), "class": "t-net-plain" });
      c.oDrop = add(c.gOwn, "line", { x1: OA[0], y1: OA[1], x2: OA[0], y2: OA[1], "class": "t-net-plumb" });
      c.oMark = add(c.gOwn, "path", { d: "M" + (OF[0] + 14) + " " + OF[1] + "V" + (OF[1] - 14) + "H" + OF[0], "class": "t-net-mark" });
      L.set(c.oMark, { opacity: 0, scale: 0.2, svgOrigin: OF[0] + " " + OF[1] });
      c.o13a = lab(L, c.gOwn, "13 m", 311, 225);
      c.o13b = lab(L, c.gOwn, "13 m", 489, 225);
      c.o10 = lab(L, c.gOwn, "10 m", 400, 394);
      c.o5a = lab(L, c.gOwn, "5 m", 350, 394);
      c.o5b = lab(L, c.gOwn, "5 m", 450, 394);
      c.o12 = lab(L, c.gOwn, "12 m", 390, 256, "t-pf-lab t-pf-end");
      return c;
    },

    steps: [
      /* ---- story ---- */
      { beat: "story", caption: "This is Meena, Ramesh uncle's daughter. She is hanging a shade net over the seedlings.",
        run: function (c, L) {
          K.enter(c.meena, L);
          L.set(c.clothG, { y: -46 });
          L.wait(900, function () { L.sfx("whoosh"); });
          L.to(c.gNet, { opacity: 1, duration: 0.3, delay: 0.9 });
          L.to(c.clothG, { y: 0, duration: 0.9, delay: 0.9, ease: "bounce.out" });
          L.wait(1700, function () { c.sign.pop(L); });
        } },
      { caption: "Its sides are 10 metres, 10 metres and 12 metres. Net is sold by the square metre, but nobody told her the height.",
        run: function (c, L) {
          show(L, c.lSideL, 0.3); show(L, c.lSideR, 1.1); show(L, c.lBase, 1.9);
          L.wait(2800, function () { K.puzzled(c.meena, L, true); });
        } },

      /* ---- guess ---- */
      K.guessStep({ caption: "Before we help her, have a guess. How many square metres of net does she need?",
        prompt: "How many square metres of net?",
        choices: [{ label: "48", value: 48 }, { label: "60", value: 60 }, { label: "120", value: 120 }, { label: "No idea yet", value: 0 }],
        guessed: R.guessed, none: R.noGuess }),

      /* ---- hands 1: drop the height ---- */
      { beat: "hands", caption: "For the area we need the height. Drag the gold dot at the top straight down to the base.",
        hint: { caption: "Press the gold dot at the top of the net and pull it all the way down to the base." },
        run: function (c, L) {
          K.puzzled(c.meena, L, false);
          L.to(c.handle, { opacity: 1, duration: 0.2, delay: 0.3 });
          L.to(c.knob, { scale: 1, duration: 0.45, delay: 0.3, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
          L.to(c.target, { opacity: 0.9, duration: 0.4, delay: 0.6 });
        },
        task: function (c, L, done) {
          var over = false, misses = 0, tickAt = 0, demo = null, svg = L.svg, hit = c.handleHit, d = null;
          c.handle.style.pointerEvents = ""; c.handle.classList.add("is-live");
          hit.setAttribute("tabindex", "0"); hit.setAttribute("aria-valuemin", 0); hit.setAttribute("aria-valuemax", 8); hit.setAttribute("aria-valuenow", 0);
          svg.classList.add("is-dragging-ok");   // on a touch screen, a drag here must not scroll the page
          // a ghost fingertip shows the pull, over and over, until the student starts
          if (!L.reduced) {
            L.set(c.finger, { x: 0, y: 0, opacity: 0 });
            demo = L.to(c.finger, { keyframes: [
              { opacity: 1, duration: 0.25, ease: "none" },
              { y: DROP, duration: 1.2, ease: "power1.inOut" },
              { opacity: 0, duration: 0.3, ease: "none" },
              { y: 0, duration: 0.01 },
              { opacity: 0, duration: 1.4 },
            ], repeat: -1, delay: 3.5 }, true);
          }
          function stopDemo() { if (demo) { L.kill(demo); demo = null; L.to(c.finger, { opacity: 0, duration: 0.15, overwrite: "auto" }, true); } }
          function held(on) {
            c.handle.classList.toggle("is-held", on);
            L.to(c.knob, { scale: on ? 1.18 : 1, duration: 0.14, ease: "power2.out", overwrite: "auto" }, true);
          }
          function follow(y) {
            setPlumb(c, y);
            hit.setAttribute("aria-valuenow", Math.round(y / 30));
            c.target.classList.toggle("is-hot", y > DROP - 34);
            var s = Math.round(y / 30); if (s !== tickAt) { tickAt = s; L.sfx("tick", s); }
          }
          function back() {
            misses++; L.sfx("oops");
            c.target.classList.remove("is-hot");
            L.to(c.handle, { y: 0, duration: 0.7, ease: "elastic.out(1, 0.6)", overwrite: "auto",
              onUpdate: function () { setPlumb(c, handleY(c)); },
              onComplete: function () { setPlumb(c, 0); if (d) d.update(); } }, true);
            L.say(R.dropShort.caption);
            if (misses === 2) L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { land(true); } } }, "Drop it for me")]);
          }
          function land(slow) {
            if (over) return; over = true;
            stopDemo(); L.clearBar();
            if (d) d.disable();
            c.handle.style.pointerEvents = "none"; c.handle.classList.remove("is-live", "is-held");
            hit.setAttribute("tabindex", "-1");
            svg.classList.remove("is-dragging-ok");
            L.to(c.handle, { y: DROP, duration: slow ? 0.9 : 0.15, ease: slow ? "power2.inOut" : "power3.out", overwrite: "auto",
              onUpdate: function () { setPlumb(c, handleY(c)); },
              onComplete: function () {
                setPlumb(c, DROP);
                L.sfx("snap"); LK.shake(c, L, 2);
                L.to(c.target, { opacity: 0, duration: 0.25, overwrite: "auto" }, true);
                L.to(c.handle, { opacity: 0, duration: 0.3, delay: 0.15 }, true);
                L.to(c.mark, { opacity: 1, scale: 1, duration: 0.4, delay: 0.2, ease: "back.out(3)" }, true);
                hide(L, c.lBase, 0.3);
                show(L, c.l6a, 0.7); show(L, c.l6b, 1.0);
                L.say(R.dropGood.caption, function () { done("dropped"); });
              } }, true);
          }
          d = L.draggable(c.handle, {
            type: "y", bounds: { minY: 0, maxY: DROP },
            onPress: function () { if (over) return; stopDemo(); L.sfx("pickup"); held(true); },
            onDrag: function () { follow(this.y); },
            onRelease: function () {
              if (over) return;
              held(false);
              if (this.y >= DROP - 34) { land(false); return; }
              if (this.y < 8) { L.to(c.handle, { y: 0, duration: 0.15, overwrite: "auto" }, true); setPlumb(c, 0); return; }   // a tap, not a pull
              back();
            },
          });
          // keyboard: Tab to the dot, down arrow pulls it a metre at a time, Enter drops it
          L.listen(hit, "keydown", function (ev) {
            if (over) return;
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); land(true); return; }
            if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
            ev.preventDefault(); stopDemo();
            var y = Math.max(0, Math.min(DROP, Math.round(handleY(c) / 30) * 30 + (ev.key === "ArrowDown" ? 30 : -30)));
            if (y >= DROP) { land(false); return; }
            L.set(c.handle, { y: y }); if (d) d.update(); follow(y);
          });
        } },

      /* ---- hands 2: one half is a right-angled triangle; find the height ---- */
      { caption: "Now look at one half. It is a right-angled triangle. Its longest side is 10 and one short side is 6.",
        run: function (c, L) { liftHalf(c, L); } },
      { caption: "Use the right-angle rule. Height × height is 10² − 6². That is 100 − 36 = 64.",
        hint: { caption: "Which number times itself makes 64? Try 8 × 8." },
        run: function (c, L) { L.wait(1200, function () { L.board("10² − 6² = 100 − 36 = <b>64</b>"); }); },
        task: function (c, L, done) {
          var tries = 0;
          L.number("height × height = 64, so the height is?", function (v) {
            if (v === 8) return true;
            var r = v === 64 ? R.h64 : v === 4 ? R.h4 : v === 16 ? R.h16 : R.hOther;
            tries++; log(L, "net-height", v, false, tries === 1 ? r.mixup : null);
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function (v) {
            log(L, "net-height", v, true);
            c.hQ.textContent = "8 m"; c.hQ.classList.remove("t-net-q");
            L.set(c.hQ, { scale: 0.4 }); show(L, c.hQ, 0, true);
            L.sfx("chime");
            L.board("10² − 6² = 64, and √64 = <b>8</b>");
            L.say(R.hRight.caption, function () { done(8); });
          });
        } },

      /* ---- hands 3: the whole net, base 12 and height 8 ---- */
      { caption: "Back to the whole net. Now we have the base, 12, and the height, 8. Work out the area.",
        hint: { caption: "Half of 12 is 6. Then 6 × 8." },
        run: function (c, L) {
          putBack(c, L);
          L.wait(1500, function () { L.board("area = ½ × base × height"); });
        },
        task: function (c, L, done) {
          var tries = 0;
          L.number("½ × 12 × 8 = ?", function (v) {
            if (v === 48) return true;
            var r = v === 96 ? R.a96 : v === 60 ? R.a60 : R.aOther;
            tries++; log(L, "net-area", v, false, tries === 1 ? r.mixup : null);
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function (v) {
            log(L, "net-area", v, true);
            L.board("½ × 12 × 8 = <b>48</b>");
            c.sign.count(L, 0, 48, 1.5, function () { L.say(R.aRight.caption, function () { done(48); }); });
          });
        } },

      /* ---- tell Meena: the answer, then how you knew ---- */
      K.tellStep({ who: function (c) { return c.meena; }, skill: SKILL, qid: "net-tell",
        caption: "Meena is waiting. Tell her how many square metres of net to buy.",
        prompt: "Tell Meena. Square metres of net:", answer: 48,
        wrong: [
          { value: 60, caption: R.t60.caption, mixup: "slant" },
          { value: 96, caption: R.t96.caption, mixup: "half" },
          { value: 32, caption: R.t32.caption, mixup: "perim" },
        ],
        other: R.tOther, thanks: ["48 sq m of net!", "Thank you!"],
        same: R.tellSame, close: R.tellClose, plain: R.tellPlain }),
      K.howStep({ who: function (c) { return c.meena; }, skill: SKILL, qid: "net-how", leave: true,
        caption: "She has one more question. How did you find the area when nobody gave you the height?",
        prompt: "Tell her how:", bubble: ["How did", "you know?"],
        choices: [
          { label: "I used the slanted side, 10, as the height", value: "slant", mixup: "slant",
            caption: "The slanted side is longer than the height. We dropped the height, found 8, then took half of 12 × 8. Off she goes to buy the net." },
          { label: "I dropped the height and found it with the right-angle rule", value: "drop", correct: true,
            caption: "Exactly. Drop the height, find it, then half of base × height. Off she goes to buy the net." },
          { label: "I added the three sides", value: "perim", mixup: "perim",
            caption: "Adding the sides gives the edge, not the cloth inside. We dropped the height, found 8, then took half of 12 × 8. Off she goes to buy the net." },
        ] }),

      /* ---- the rule: three steps on a plain triangle ---- */
      { beat: "rule", caption: "This works for any triangle with no height given. Step one: drop the height straight down to the base.",
        run: function (c, L) {
          L.board("");
          L.to([c.gNet, c.sign.g], { opacity: 0, duration: 0.4, onComplete: function () { c.gNet.style.display = "none"; c.sign.g.style.display = "none"; } });
          c.gRule.style.display = ""; L.set(c.gRule, { opacity: 0 });
          L.to(c.gRule, { opacity: 1, duration: 0.4, delay: 1.2 });
          L.to(c.pDrop, { attr: { y2: PF[1] }, duration: 0.8, delay: 2.2, ease: "power2.in" });
          L.to(c.pMark, { opacity: 1, scale: 1, duration: 0.4, delay: 3.0, ease: "back.out(3)", onStart: function () { L.sfx("snap"); } });
          show(L, c.s1, 3.2);
        } },
      { caption: "Step two: find the height with the right-angle rule, a² + b² = c².",
        run: function (c, L) {
          L.to(c.pHalf, { opacity: 1, duration: 0.4 });
          show(L, c.pa, 0.5); show(L, c.pb, 0.9); show(L, c.pc, 1.3);
          show(L, c.s2, 1.8);
        } },
      { caption: "Step three: the area is ½ × base × height.",
        run: function (c, L) {
          L.to(c.pHalf, { opacity: 0, duration: 0.3 });
          hide(L, c.pa); hide(L, c.pb); hide(L, c.pc);
          L.to(c.pBase, { opacity: 1, duration: 0.4, delay: 0.4 });
          show(L, c.pBaseLab, 0.5); show(L, c.pHLab, 0.9);
          show(L, c.s3, 1.4);
          L.wait(2000, function () { L.board('<span class="t-rule">area = ½ × base × height</span>'); });
        } },

      /* ---- on your own ---- */
      { caption: "Your turn, on your own. This triangle has sides 13 metres, 13 metres and 10 metres. What is its area?",
        hint: { caption: "Drop the height to the middle of the base. Half of 10 is 5. Then use 13 and 5 to find the height." },
        run: function (c, L) {
          L.board("");
          L.to(c.gRule, { opacity: 0, duration: 0.4, onComplete: function () { c.gRule.style.display = "none"; } });
          c.gOwn.style.display = ""; L.set(c.gOwn, { opacity: 0 });
          L.to(c.gOwn, { opacity: 1, duration: 0.4, delay: 0.5, onStart: function () { L.sfx("pop"); } });
          show(L, c.o13a, 0.9, true); show(L, c.o13b, 1.1, true); show(L, c.o10, 1.3, true);
        },
        task: function (c, L, done) {
          var tries = 0;
          L.number("Its area in square metres?", function (v) {
            if (v === 60) return true;
            var r = v === 65 ? R.o65 : v === 120 ? R.o120 : v === 12 ? R.o12 : R.oOther;
            tries++; log(L, "net-own", v, false, tries === 1 ? r.mixup : null);
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function (v) {
            log(L, "net-own", v, true);
            L.sfx("chime");
            // show the working: the height drops, the base splits into 5 and 5, the height is 12
            L.to(c.oDrop, { attr: { y2: OF[1] }, duration: 0.7, ease: "power2.in" }, true);
            L.to(c.oMark, { opacity: 1, scale: 1, duration: 0.4, delay: 0.7, ease: "back.out(3)" }, true);
            hide(L, c.o10, 0.6);
            show(L, c.o5a, 0.9, true); show(L, c.o5b, 1.1, true); show(L, c.o12, 1.5, true);
            L.board("13² − 5² = 144, so the height is 12 &nbsp;·&nbsp; ½ × 10 × 12 = <b>60</b>");
            L.say(R.oRight.caption, function () { done(60); });
          });
        } },
      { caption: "No height given? Drop it, find it with the right-angle rule, then use ½ × base × height.", hold: 600,
        run: function (c, L) {
          L.board('<span class="t-rule">area = ½ × base × height</span><span class="t-rule-note">no height given: drop it, then find it with a² + b² = c²</span>');
        } },
    ],
  });
})();
