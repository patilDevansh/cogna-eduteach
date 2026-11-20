/* Pet 8 — Mitthu, the parrot who learns from the student.
   Mitthu says the student's own mix-ups out loud, sure of himself. The student decides if he
   is right and, if not, teaches him the right idea. Teaching someone else is one of the
   strongest ways to learn. Correct rules go in his notebook, to be checked on revisit days.
   The claims are fixed content, never the student's own answers being marked. */
(function () {
  "use strict";
  var K = Cogna.petKit, S = K.S, h = K.h;

  var CLAIMS = [
    { mixup: "Uses the slanted side as the height",
      claim: "Squawk! The slanted side is the height!",
      right: "No: the height goes straight down, at a right angle.",
      wrong: "Yes, the height is always the longest side.",
      learnt: "Straight down, at a right angle! That's the height. Squawk!",
      you: "It goes straight down, Mitthu!" },
    { mixup: "Adds the sides instead of squaring them",
      claim: "To find c, just add them: 3 + 4 = 7! Squawk!",
      right: "Square them first: 9 + 16 = 25, so c = 5.",
      wrong: "Multiply them: 3 × 4 = 12.",
      learnt: "Square, add, then square root. c is 5! Squawk!",
      you: "Square them first, Mitthu!" },
    { mixup: "Forgets the ½ for a triangle",
      claim: "A triangle's area is base × height: 6 × 4 = 24!",
      right: "It's half of that: ½ × 6 × 4 = 12.",
      wrong: "Add them: 6 + 4 = 10.",
      learnt: "Half! A triangle is half its rectangle: 12. Squawk!",
      you: "Don't forget the half!" },
  ];

  function drawMitthu(st) {
    var g = S("g");
    var tailFill = st.linear([[0, "#2f9a4b"], [0.7, "#21804a"], [1, "#2e7f9a"]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    g.appendChild(S("path", { d: "M -6 -14 C -16 8, -26 38, -38 66 C -28 44, -18 20, 2 -10 Z", fill: tailFill }));
    g.appendChild(S("path", { d: "M -1 -12 C -6 12, -12 40, -18 68 C -9 44, -3 20, 7 -9 Z", fill: tailFill, opacity: 0.9 }));
    var body = S("g", { class: "pk-breathe" });
    body.appendChild(S("ellipse", { cx: 0, cy: -25, rx: 15, ry: 22, transform: "rotate(10 0 -25)",
      fill: st.radial([[0, "#a4ec9a"], [0.5, "#43b45d"], [1, "#1d743a"]], { cx: "40%", cy: "30%", r: "80%" }), stroke: "#1b6b37", "stroke-width": 1.2 }));
    body.appendChild(S("ellipse", { cx: 5, cy: -20, rx: 8, ry: 13, fill: "#b9f0b0", opacity: 0.55, transform: "rotate(10 5 -20)" }));
    g.appendChild(body);
    // wing, flaps from the shoulder
    var wing = S("g");
    wing.appendChild(S("path", { d: "M -2 -38 C -15 -30, -16 -8, -4 6 C 2 -6, 4 -24, -2 -38 Z",
      fill: st.linear([[0, "#38a653"], [1, "#17602f"]]), stroke: "#155a2c", "stroke-width": 1 }));
    wing.appendChild(S("path", { d: "M -9 -18 C -7 -10, -6 -4, -3 2 M -5 -24 C -3 -14, -2 -8, 0 -2", fill: "none", stroke: "#155a2c", "stroke-width": 1, opacity: 0.7 }));
    var wingWrap = S("g"); wingWrap.appendChild(wing); g.appendChild(wingWrap);
    // head, bobbing
    var head = S("g", { class: "pk-bob" });
    head.appendChild(S("circle", { cx: 6, cy: -50, r: 13.5, fill: st.radial([[0, "#b0f09f"], [0.5, "#4cbb62"], [1, "#258544"]], { cx: "40%", cy: "30%", r: "80%" }), stroke: "#1b6b37", "stroke-width": 1.2 }));
    head.appendChild(S("path", { d: "M -6 -41 Q 6 -33 18 -42", fill: "none", stroke: "#16241d", "stroke-width": 2.2, "stroke-linecap": "round" }));
    head.appendChild(S("path", { d: "M -6 -38.6 Q 6 -30.6 18 -39.6", fill: "none", stroke: "#f08aa8", "stroke-width": 2, "stroke-linecap": "round" }));
    head.appendChild(S("path", { d: "M 16 -55 C 26 -56, 31 -48, 27 -41 C 25 -45, 21 -47, 16 -47 Z", fill: "#e0482f", stroke: "#a8301c", "stroke-width": 0.8 }));
    head.appendChild(S("path", { d: "M 16 -46 C 20 -45, 23 -43, 24 -41 C 21 -40, 18 -41, 16 -43 Z", fill: "#b8341f" }));
    head.appendChild(S("circle", { cx: 10.5, cy: -53, r: 4.6, fill: "#fff6d6", stroke: "#e7c46a", "stroke-width": 1 }));
    K.eyes(head, [[11.2, -53]], 2.5);
    g.appendChild(head);
    // feet on the perch
    g.appendChild(S("path", { d: "M -8 -1 q 3 6 7 0 M 3 -1 q 3 6 7 0", fill: "none", stroke: "#b98585", "stroke-width": 3, "stroke-linecap": "round" }));
    return { g: g, wing: wingWrap };
  }

  function mount(parts) {
    var st = K.stage(parts.stage, { label: "Mitthu the parrot on a perch, next to his board. He says a maths rule. Decide if he is right, and teach him if he is not." });
    K.grid(st.back, 20, 20, 240, 220, 20);
    // perch
    st.back.appendChild(S("path", { d: "M 22 198 C 90 192, 170 196, 250 205", fill: "none", stroke: st.linear([[0, "#9a6a3e"], [1, "#5e3b1f"]]), "stroke-width": 9, "stroke-linecap": "round" }));
    st.back.appendChild(S("ellipse", { cx: 30, cy: 190, rx: 10, ry: 5, fill: "#4a9a5a", transform: "rotate(-30 30 190)" }));
    st.back.appendChild(S("ellipse", { cx: 238, cy: 196, rx: 10, ry: 5, fill: "#3f8a4f", transform: "rotate(25 238 196)" }));
    // his board
    st.back.appendChild(S("rect", { x: 264, y: 24, width: 144, height: 206, rx: 14, fill: "#fff", stroke: "#dce4dd", "stroke-width": 1.5 }));
    st.back.appendChild(S("text", { x: 336, y: 46, "text-anchor": "middle", class: "pk-label" }, "Mitthu's board"));
    var board = S("g"); st.back.appendChild(board);

    var bird = drawMitthu(st);
    var bg = S("g"); bg.appendChild(bird.g); st.front.appendChild(bg);
    var B = K.actor(bg, { x: 118, y: 199, sx: 1.25, sy: 1.25 });
    var W = K.actor(bird.wing, { x: -2, y: -36 });
    bird.wing.firstChild.setAttribute("transform", "translate(2 36)"); // pivot at the shoulder

    var idx = 0, learnt = 0, phase = "claim", busy = false;

    function lbl(x, y, t, cls) { board.appendChild(S("text", { x: x, y: y, "text-anchor": "middle", class: cls || "pk-label" }, t)); }
    function drawBoard(i, done) {
      board.textContent = "";
      if (i === 0) {
        board.appendChild(S("polygon", { points: K.pts([[276, 186], [356, 186], [394, 104], [314, 104]]), class: "pk-shape" }));
        if (!done) {
          board.appendChild(S("line", { x1: 314, y1: 104, x2: 276, y2: 186, stroke: "#b4400c", "stroke-width": 4.5, "stroke-linecap": "round" }));
          lbl(334, 150, "height?", "pk-label-warn");
        } else {
          board.appendChild(S("line", { x1: 334, y1: 104, x2: 334, y2: 186, stroke: "#0e6b54", "stroke-width": 3.5, "stroke-linecap": "round" }));
          board.appendChild(S("path", { d: "M 334 176 h 10 v 10", fill: "none", stroke: "#0e6b54", "stroke-width": 2 }));
          lbl(318, 150, "h", "pk-label-good");
        }
      } else if (i === 1) {
        board.appendChild(S("polygon", { points: K.pts([[290, 186], [370, 186], [290, 126]]), class: "pk-shape" }));
        board.appendChild(S("path", { d: "M 290 176 h 10 v 10", fill: "none", stroke: "#51635a", "stroke-width": 1.6 }));
        lbl(280, 160, "3"); lbl(330, 204, "4");
        lbl(350, 146, done ? "c = 5" : "c = 7?", done ? "pk-label-good" : "pk-label-warn");
      } else {
        board.appendChild(S("rect", { x: 280, y: 122, width: 96, height: 64, fill: "none", stroke: "#7d8c84", "stroke-width": 1.5, "stroke-dasharray": "5 5" }));
        board.appendChild(S("polygon", { points: K.pts([[280, 186], [376, 186], [316, 122]]), class: "pk-shape", style: done ? { fill: "#fff4d8", stroke: "#dca03a" } : null }));
        lbl(328, 204, "base 6, height 4");
        lbl(328, 106, done ? "½ × 6 × 4 = 12" : "6 × 4 = 24?", done ? "pk-label-good" : "pk-label-warn");
      }
    }
    function notebook() { st.chip("nb", "Mitthu has learnt " + learnt + " of 3", 92, 30, learnt === 3 ? "good" : "gold"); }

    function flap(times) {
      var tl = gsap.timeline();
      for (var k = 0; k < times; k++) { tl.to(W.s, W.tw({ rot: -38, duration: 0.11, ease: "power1.out" })).to(W.s, W.tw({ rot: 0, duration: 0.13, ease: "power1.in" })); }
      tl.to(B.s, B.tw({ y: 185, duration: 0.16, ease: "power2.out" }), 0).to(B.s, B.tw({ y: 199, duration: 0.3, ease: "bounce.out" }), 0.16);
      return tl;
    }
    function tilt() {
      return gsap.timeline().to(B.s, B.tw({ rot: -12, duration: 0.25 })).to(B.s, B.tw({ rot: 6, duration: 0.25 })).to(B.s, B.tw({ rot: 0, duration: 0.3 }));
    }
    function sayClaim() { st.say(CLAIMS[idx].claim, 150, 104, "warn"); }

    function buttons(list) {
      parts.actions.textContent = "";
      list.forEach(function (b) {
        var el = h("button", { type: "button", class: "btn " + (b.primary ? "btn-primary" : "btn-ghost") }, b.label);
        el.addEventListener("click", function () { st.interact(); b.fn(); });
        parts.actions.appendChild(el);
      });
    }
    function showClaim() {
      phase = "claim";
      drawBoard(idx, false); notebook(); sayClaim(); st.chip("you", null);
      buttons([
        { label: "Mitthu is right", fn: function () {
          st.say("Hmm, are you sure? Look at my board again… Squawk?", 150, 104);
          tilt(); st.sfx("oops");
        } },
        { label: "Mitthu is wrong: teach him", primary: true, fn: showTeach },
      ]);
    }
    function showTeach() {
      phase = "teach";
      var c = CLAIMS[idx];
      st.say("Oh? Then what is it? Teach me!", 150, 104);
      tilt();
      var opts = [{ label: c.right, ok: true }, { label: c.wrong, ok: false }];
      if (Math.random() < 0.5) opts.reverse();
      buttons(opts.map(function (o) {
        return { label: o.label, fn: function () {
          if (o.ok) learn();
          else { st.say("That doesn't sound right to me. Try the other one?", 150, 104); tilt(); st.sfx("oops"); }
        } };
      }));
    }
    function learn() {
      phase = "learnt";
      learnt = Math.min(3, learnt + 1);
      drawBoard(idx, true); notebook();
      st.say(CLAIMS[idx].learnt, 150, 104, "good");
      flap(3); st.sfx("chime");
      buttons([{ label: idx < CLAIMS.length - 1 ? "Next" : "Start again", primary: true, fn: function () {
        if (idx < CLAIMS.length - 1) idx += 1; else { idx = 0; learnt = 0; }
        showClaim();
      } }]);
    }

    function reset() {
      gsap.killTweensOf([B.s, W.s]); B.set({ x: 118, y: 199, rot: 0 }); W.set({ rot: 0 });
      if (!st.isInteracting()) { idx = 0; learnt = 0; }
      showClaim();
    }
    function build() {
      var tl = gsap.timeline();
      tl.call(function () { idx = 0; learnt = 0; showClaim(); });
      CLAIMS.forEach(function (c, i) {
        if (i > 0) tl.call(function () { idx = i; showClaim(); });
        tl.to({}, { duration: 2.8 });
        tl.call(function () { st.hush(); st.chip("you", "You: “" + c.you + "”", 150, 240, "gold"); });
        tl.to({}, { duration: 1.6 });
        tl.call(function () { st.chip("you", null); idx = i; learnt = i + 1; drawBoard(i, true); notebook(); st.say(c.learnt, 150, 104, "good"); flap(3); });
        tl.to({}, { duration: 2.8 });
      });
      tl.call(function () { st.say("I'll check I still remember these tomorrow! Squawk!", 150, 104, "good"); flap(2); });
      tl.to({}, { duration: 2.6 });
      return tl;
    }

    st.keys(function (e) {
      var b = parts.actions.querySelectorAll("button");
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= b.length) { b[n - 1].click(); return true; }
      return false;
    });
    st.setDemo(build, reset);
    return { destroy: st.destroy };
  }

  K.register("mitthu", {
    name: "Mitthu", kind: "the parrot who learns from you",
    line: "Says the student's own mix-ups out loud, very sure of himself. The student decides if he is right, and teaches him.",
    teaches: "Any rule, by teaching it: the student has to explain why Mitthu is wrong.",
    mixups: ["Uses the slanted side as the height", "Adds the sides instead of squaring them", "Forgets the ½ for a triangle"],
    play: "Tap “Mitthu is wrong” and pick what to teach him. In the app the student can explain out loud, because Cogna already listens.",
    days: "Every day, and every topic after Area",
    grows: "His notebook fills with rules the student taught him. On revisit days he “forgets” one and asks again.",
    effort: "medium",
  }, mount);
})();
