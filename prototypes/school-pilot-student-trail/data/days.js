/* Cogna prototype — all 10 days of learning content + the day-10 re-test.
   OWNER: Agent A (content). Day 1 below is the orchestrator's worked example of the schema —
   keep its shape; you may polish its wording. Days 2–9 and the retest are yours to write.

   Question (Q) schema:
     { id, skill, prompt, figure?, kind:'mcq'|'number',
       options:[{text, correct:true} | {text, mixup:'slant', why} | {text, why}],   // mcq
       answer, tol?, unit?, wrongMixups?:[{value, mixup?, why}],                     // number
       guards?:['slant'], hint?, explain }
   NOTE: wrongMixups uses plain {value} (no functions) so data stays serialisable.
*/
(function () {
  "use strict";
  var C = window.Cogna, F = C.fig;

  var tri345 = F.wrap(5, 4, [
    F.grid(5, 4),
    F.poly([[0.5, 3.5], [4.5, 3.5], [0.5, 0.5]]),
    F.right(0.5, 3.5),
    F.label(2.5, 4.2, "4 cm"), F.label(-0.1, 2.1, "3 cm", "end"), F.label(2.9, 1.7, "?", "start"),
  ], { alt: "Right triangle with legs 3 cm and 4 cm; the longest side is unknown." });

  var tri68 = F.wrap(9, 7, [
    F.grid(9, 7),
    F.poly([[0.5, 6.5], [8.5, 6.5], [0.5, 0.5]]),
    F.right(0.5, 6.5),
    F.label(4.5, 7.2, "8 cm"), F.label(-0.1, 3.6, "6 cm", "end"), F.label(4.9, 3.2, "?", "start"),
  ], { alt: "Right triangle with legs 6 cm and 8 cm." });


  /* Day 1 adaptive pool helpers (plain data out; see DAY1_PERSONALISED.md). */
  function ptri(a, b, la, lb, lc) { // a = bottom leg, b = vertical leg
    var k = 6 / Math.max(a, b), W = a * k, H = b * k;
    return F.wrap(W + 1, H + 1, [
      F.poly([[0.5, H + 0.5], [W + 0.5, H + 0.5], [0.5, 0.5]]), F.right(0.5, H + 0.5),
      F.label(W / 2 + 0.5, H + 1.3, la), F.label(-0.1, H / 2 + 0.7, lb, "end"), F.label(W / 2 + 0.9, H / 2 + 0.3, lc, "start"),
    ], { alt: "Right triangle with the sides labelled " + la + ", " + lb + " and " + lc + "." });
  }
  function pc(id, level, a, b, c, themes) { // find the longest side
    return { id: id, skill: "pyth", level: level, kind: "number", answer: c, themes: themes,
      figure: ptri(a, b, String(b), String(a), "?"),
      wrongMixups: [
        { value: a + b, mixup: "addsides", why: "That's " + a + " + " + b + ". Square first: " + a * a + " + " + b * b + " = " + (a * a + b * b) + ", then take the root." },
        { value: a * a + b * b, mixup: "noroot", why: a * a + b * b + " is c squared. Take the square root: \u221a" + (a * a + b * b) + " = " + c + "." },
      ],
      explain: a + "\u00b2 + " + b + "\u00b2 = " + a * a + " + " + b * b + " = " + c * c + ", and \u221a" + c * c + " = " + c + "." };
  }
  function pl(id, level, c, a, b, themes, r1) { // find a missing leg: c longest, a known leg, b answer
    var w = Math.round(Math.sqrt(c * c + a * a) * 10) / 10;
    return { id: id, skill: "pyth", level: level, kind: "number", answer: b, themes: themes,
      figure: ptri(b, a, "?", String(a), String(c)),
      wrongMixups: [
        { value: c - a, mixup: "wrongc", why: "That's " + c + " \u2212 " + a + ". Sides don't subtract like that. Use squares: " + c * c + " \u2212 " + a * a + " = " + b * b + ", then take the root." },
        { value: c * c + a * a, mixup: "wrongc", why: "You added the squares, as if " + a + " were a short side and the answer were c. The longest side is " + c + ", so subtract: " + c * c + " \u2212 " + a * a + "." },
        { value: w, mixup: "wrongc", why: "You added " + c * c + " + " + a * a + ". But " + c + " is the longest side (c), so take " + a * a + " away from " + c * c + " instead." },
        { value: c + a, mixup: "addsides", why: "That's " + c + " + " + a + ". Work with squares: " + c * c + " \u2212 " + a * a + " = " + b * b + ", then take the root." },
        { value: c * c - a * a, mixup: "noroot", why: b * b + " is the square of the missing side. Take the root: \u221a" + b * b + " = " + b + "." },
      ],
      explain: c + "\u00b2 \u2212 " + a + "\u00b2 = " + c * c + " \u2212 " + a * a + " = " + b * b + ", and \u221a" + b * b + " = " + b + "." };
  }
  function prc(id, level, text, a, b, c, isRight, themes) { // "is it right-angled?" mcq
    var sq = a * a + " + " + b * b + " = " + (a * a + b * b);
    var yes = { text: "Yes, it's right-angled" }, no = { text: "No, it isn't" }, cant = { text: "Can't tell without a picture", why: "The numbers are enough: if the two short sides squared add up to the long side squared, it's right-angled." };
    if (isRight) {
      yes.correct = true;
      no.mixup = "addsides"; no.why = "Adding the short sides (" + a + " + " + b + " = " + (a + b) + ") isn't the test. Square them: " + sq + " = " + c + "\u00b2, so it is right-angled.";
    } else {
      no.correct = true;
      yes.why = "Check the squares: " + sq + ", but " + c + "\u00b2 = " + c * c + ". They don't match, so it isn't right-angled.";
    }
    return { id: id, skill: "pyth", level: level, kind: "mcq", themes: themes, options: [yes, no, cant],
      explain: isRight ? sq + " = " + c * c + " = " + c + "\u00b2, so yes." : sq + " but " + c + "\u00b2 = " + c * c + ", so no." };
  }

  C.data.days = [
    {
      n: 1, title: "Bridge: the right-angle rule", skills: ["pyth"],
      summaryLine: "You met the rule that links the three sides of a right triangle.",
      teacherNote: "Good start, Aarav. Remember: square first, then add.",
      tomorrow: "Where exactly is the height of a leaning shape?",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao ties a rope into 12 equal sections and pulls it into a 3-4-5 triangle. The corner is a perfect right angle.",
          boardSvg: tri345,
          trap: "Adding the two short sides (3 + 4 = 7) instead of squaring them.",
          classNote: "21 of 32 in 8-B couldn't use this rule on day 0." },
        { id: "s2", type: "recall", questions: [
          { id: "d1r1", skill: "sq", kind: "number", prompt: "√144 = ?", answer: 12, explain: "12 × 12 = 144." },
          { id: "d1r2", skill: "sq", kind: "number", prompt: "15² = ?", answer: 225, explain: "15 × 15 = 225." },
          { id: "d1r3", skill: "sq", kind: "mcq", prompt: "Which one is a perfect square?",
            options: [{ text: "48", why: "6 × 8 = 48, but no whole number times itself makes 48." }, { text: "49", correct: true }, { text: "50", why: "7² = 49 and 8² = 64, so 50 isn't a perfect square." }],
            explain: "7 × 7 = 49." },
        ] },
        { id: "s3", type: "animation", anim: "pyth-squares", skill: "pyth" },
        { id: "s4", type: "adaptive", skill: "pyth",
          openers: { addsides: "pyth-why-not-add", noroot: "pyth-undo-square" },
          fixes: { addsides: "pyth-why-not-add", noroot: "pyth-undo-square", wrongc: "pyth-which-c" },
          maxQuestions: 8,
          pool: [
            // ---- Level 1: find c, small triples ----
            pc("d1a1", 1, 3, 4, 5, {
              cricket: "A cricket pitch has a right-angled corner. One side is 3 m and the next is 4 m. How long is the diagonal across the corner? (in m)",
              music: "A guitar neck brace makes a right angle. Its two straight sides are 3 cm and 4 cm. How long is the sloping side? (in cm)",
              default: "A right triangle has legs 3 cm and 4 cm. How long is the longest side? (in cm)" }),
            pc("d1a2", 1, 6, 8, 10, {
              cricket: "A rope runs from the top of a 6 m floodlight pole to a peg 8 m from its base on level ground. How long is the rope? (in m)",
              music: "A ramp up to a stage rises 6 m and runs 8 m along the floor. How long is the sloping ramp? (in m)",
              default: "A right triangle has legs 6 cm and 8 cm. How long is the longest side? (in cm)" }),
            pc("d1a3", 1, 12, 16, 20, {
              cricket: "A fielder runs 12 m up the pitch, turns a right angle and runs 16 m to the boundary. How far is he now from where he started, in a straight line? (in m)",
              music: "A speaker stand's side brace forms a right angle with sides 12 cm and 16 cm. How long is the slanted bar? (in cm)",
              default: "A right triangle has legs 12 cm and 16 cm. How long is the longest side? (in cm)" }),
            pc("d1a4", 1, 30, 40, 50, {
              cricket: "A practice area is a right-angled triangle with sides 30 m and 40 m. How long is the edge across the slope? (in m)",
              music: "A stage is a right-angled triangle with straight edges of 30 m and 40 m. How long is the front edge across the slope? (in m)",
              default: "A right triangle has legs 30 cm and 40 cm. How long is the longest side? (in cm)" }),
            // ---- Level 2: find c, bigger triples + right-angle checks ----
            pc("d1b1", 2, 5, 12, 13, {
              cricket: "A fielder stands 5 m along the pitch from the stumps, then 12 m out to the side at a right angle. How far is he from the stumps in a straight line? (in m)",
              music: "A guitar leans so its foot is 5 cm from an amp and its top touches the amp 12 cm up. What is the guitar's length along the lean? (in cm)",
              default: "A right triangle has legs 5 cm and 12 cm. How long is the longest side? (in cm)" }),
            prc("d1b2", 2, "", 8, 15, 17, true, {
              cricket: "A groundsman marks a corner of the pitch with sides of 8 m and 15 m, and a diagonal of 17 m. Is the corner a right angle?",
              music: "A speaker stand has sides of 8 cm and 15 cm, and a slanted bar of 17 cm. Is the corner a right angle?",
              default: "A triangle has sides 8, 15 and 17. Is it a right triangle?" }),
            pc("d1b3", 2, 9, 12, 15, {
              cricket: "A bat leans against the pavilion wall. Its foot is 9 cm from the wall and its top touches the wall 12 cm up. How long is the bat? (in cm)",
              music: "A keyboard stand's frame is a right angle with sides 9 cm and 12 cm. How long is the slanted bar? (in cm)",
              default: "A right triangle has legs 9 cm and 12 cm. How long is the longest side? (in cm)" }),
            pc("d1b4", 2, 8, 15, 17, {
              cricket: "A cricket pitch corner has sides 8 m and 15 m at a right angle. How long is the diagonal? (in m)",
              music: "A guitar neck brace makes a right angle with sides 8 cm and 15 cm. How long is the slanted side? (in cm)",
              default: "A right triangle has legs 8 cm and 15 cm. How long is the longest side? (in cm)" }),
            pc("d1b5", 2, 7, 24, 25, {
              cricket: "A boundary rope is fixed 7 m up a pole and pegged 24 m from its base. How long is the rope? (in m)",
              music: "A speaker cable goes from the top of a 7 m stand to a socket 24 m from its base. How long is the cable? (in m)",
              default: "A right triangle has legs 7 cm and 24 cm. How long is the longest side? (in cm)" }),
            prc("d1b6", 2, "", 6, 7, 9, false, {
              cricket: "A bat rest has sides of 6 cm and 7 cm and a slanted side of 9 cm. Is its corner a right angle?",
              music: "A guitar stand has sides of 6 cm and 7 cm and a slanted bar of 9 cm. Is its corner a right angle?",
              default: "A triangle has sides 6, 7 and 9. Is it a right triangle?" }),
            // ---- Level 3: find a missing leg (+ one word problem) ----
            pl("d1c1", 3, 10, 6, 8, {
              cricket: "A rope of 10 m runs from a peg to the top of a 6 m pole. How far is the peg from the base of the pole? (in m)",
              music: "A slanted speaker stand bar is 10 cm long. One short side is 6 cm. How long is the other short side? (in cm)",
              default: "A right triangle's longest side is 10 cm and one leg is 6 cm. How long is the other leg? (in cm)" }),
            pl("d1c2", 3, 13, 5, 12, {
              cricket: "A 13 m diagonal crosses a pitch corner. One side of the corner is 5 m. How long is the other side? (in m)",
              music: "A guitar neck brace has a slanted side of 13 cm and one straight side of 5 cm. How long is the other straight side? (in cm)",
              default: "A right triangle's longest side is 13 cm and one leg is 5 cm. How long is the other leg? (in cm)" }),
            pl("d1c3", 3, 17, 8, 15, {
              cricket: "A bat of 17 cm leans against a wall, its foot 8 cm from the wall. How high up the wall does it touch? (in cm)",
              music: "A guitar of 17 cm (a model) leans against an amp, its foot 8 cm from the amp. How high up the amp does it touch? (in cm)",
              default: "A right triangle's longest side is 17 cm and one leg is 8 cm. How long is the other leg? (in cm)" }),
            pl("d1c4", 3, 25, 7, 24, {
              cricket: "A rope of 25 m runs from the top of a floodlight pole to a peg 7 m from its base. How tall is the pole? (in m)",
              music: "A cable of 25 m runs from the top of a speaker tower to a point 7 m from its base. How tall is the tower? (in m)",
              default: "A right triangle's longest side is 25 cm and one leg is 7 cm. How long is the other leg? (in cm)" }),
            pl("d1c5", 3, 5, 3, 4, {
              cricket: "A 5 m net pole leans against the pavilion wall with its foot 3 m from the wall. How high up the wall does it reach? (in m)",
              music: "A 5 m cable stays a speaker tower, with its foot 3 m from the tower base. How high up the tower does it reach? (in m)",
              default: "A 5 m ladder leans against a wall with its foot 3 m from the wall. How high up the wall does it reach? (in m)" }),
            pl("d1c6", 3, 15, 9, 12, {
              cricket: "A 15 m cable runs from the top of a scoreboard to a peg 9 m from its base. How tall is the scoreboard? (in m)",
              music: "A 15 m cable runs from the top of a stage light stand to a peg 9 m from its base. How tall is the stand? (in m)",
              default: "A right triangle's longest side is 15 cm and one leg is 9 cm. How long is the other leg? (in cm)" }),
          ] },
        { id: "s5", type: "explain", skill: "pyth",
          prompt: "Why does a² + b² = c² only work for right triangles?",
          keyIdeas: [["right angle", "90", "right-angled", "right angled", "square corner"], ["longest", "hypotenuse", "opposite", "c is"]],
          starter: "It only works when the triangle has a… and c has to be the…",
          responses: {
            strong: "Strong reasoning. You linked the rule to the right angle and to the longest side. That's exactly it.",
            close: "You're close. You mentioned one key idea. What about which side c has to be?",
            nudge: "Let's try again. Think about the corner of the triangle and which side is c.",
          } },
        { id: "s6", type: "exit", questions: [
          { id: "d1e1", skill: "pyth", kind: "number", unit: "cm", prompt: "Legs 9 cm and 12 cm. Longest side = ? cm", answer: 15,
            wrongMixups: [{ value: 21, why: "That's 9 + 12. 81 + 144 = 225, √225 = 15." }], explain: "81 + 144 = 225, √225 = 15 cm." },
          { id: "d1e2", skill: "pyth", kind: "number", unit: "cm", prompt: "Longest side 13 cm, one leg 5 cm. Other leg = ? cm", answer: 12,
            wrongMixups: [{ value: 8, why: "That's 13 − 5. 169 − 25 = 144, √144 = 12." }], explain: "169 − 25 = 144, √144 = 12 cm." },
        ] },
      ],
    },
    // ================= DAY 2 =================
    {
      n: 2, title: "Bridge: where's the height?", skills: ["quad"],
      summaryLine: "You learned that the height is the straight-up line that meets the base at a right angle, not the slanted side.",
      teacherNote: "Look for the right-angle mark, Aarav, not the longest line.",
      tomorrow: "Area is counting squares, and how a parallelogram turns into a rectangle.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao leans a book against the board and drops a plumb line from its top corner: the height is that straight-down line, and it meets the base at a right angle.",
          boardSvg: par(8, 3, 4, { base: "8 cm", slant: "5 cm", h: "4 cm", hl: true, rm: true, slantMark: true, alt: "Parallelogram with base 8 cm, slanted side 5 cm marked as not the height, and a dashed height of 4 cm meeting the base at a right angle." }),
          trap: "Measuring along the slanted side because it's the one you can see.",
          classNote: "In 8-B, 18 of 32 picked the slanted side as the height on day 0." },
        { id: "s2", type: "recall", questions: [
          num("d2r1", "pyth", "A right triangle has legs 15 cm and 20 cm. Longest side = ? cm", 25,
            "15² + 20² = 225 + 400 = 625, and √625 = 25 cm.",
            { unit: "cm", wrongMixups: [{ value: 35, why: "That's 15 + 20. Square first: 225 + 400 = 625, then √625 = 25." }, { value: 625, why: "625 is the square of the answer. Take the root: √625 = 25." }] }),
          num("d2r2", "sq", "√169 = ?", 13, "13 × 13 = 169."),
          mcq("d2r3", "pyth", "A right triangle's longest side is 10 cm and one leg is 8 cm. The other leg is…", [
            bad("2 cm", "That's 10 − 8. Use squares: 100 − 64 = 36, then √36 = 6."),
            bad("18 cm", "That's 10 + 8. A leg is always shorter than the longest side."),
            ok("6 cm"),
          ], "10² − 8² = 100 − 64 = 36, and √36 = 6 cm."),
        ] },
        { id: "s3", type: "animation", anim: "quad-heights", skill: "quad" },
        { id: "s4", type: "try", skill: "quad",
          q: mcq("d2t1", "quad", "Here is a leaning parallelogram. Which length is its height?", [
            bad("5 cm, the slanted side", "The slanted side leans over. The height goes straight up from the base.", "slant"),
            bad("9 cm, the bottom side", "9 cm is the base, the side it stands on. The height is measured up from it."),
            ok("4 cm, the straight-up line"),
          ], "The height is the straight-up distance between the base and the top, 4 cm.",
            { figure: par(9, 3, 4, { base: "9 cm", slant: "5 cm", h: "4 cm", hl: true }), guards: ["slant"] }),
          reveal: "The height is 4 cm, the straight-up line. It meets the base at a right angle. The slanted side (5 cm) is longer because it leans over. Now you'll see why." },
        { id: "s5", type: "practice", questions: [
          mcq("d2p1", "quad", "Which length is the height of this parallelogram?", [
            bad("6 cm", "6 cm is the base. The height is measured at a right angle to the base."),
            ok("4 cm"),
            bad("5 cm", "5 cm is the slanted side. It leans, so it's longer than the real height.", "slant"),
          ], "The height is the straight-up dashed line, 4 cm.",
            { figure: par(6, 3, 4, { base: "6 cm", slant: "5 cm", h: "4 cm", hl: true }), guards: ["slant"] }),
          mcq("d2p2", "quad", "Which length is the height of this trapezium?", [
            bad("5 cm", "5 cm is the slanted leg. The height meets the base at a right angle, so it goes straight up.", "slant"),
            bad("9 cm", "9 cm is the bottom side (a base), not the height."),
            ok("4 cm"),
          ], "The height is the straight-up dashed line between the two parallel sides, 4 cm.",
            { figure: trap(9, 3, 3, 4, { bot: "9 cm", top: "3 cm", leg: "5 cm", h: "4 cm", hl: true }), guards: ["slant"] }),
          mcq("d2p3", "quad", "Which sentence about the height is true?", [
            bad("It is always the longest side of the shape.", "The height is often shorter than a slanted side, because the slanted side leans."),
            ok("It meets the base at a right angle (90°)."),
            bad("It is always one of the sides of the shape.", "In a leaning shape the height is NOT a side. It's a straight-up line you draw yourself.", "slant"),
          ], "A height always meets the base at a right angle, and it may not be a side at all."),
          mcq("d2p4", "quad", "Which length is the height of this parallelogram?", [
            bad("5 cm", "5 cm is the slanted side, not the straight-up distance.", "slant"),
            bad("7 cm", "7 cm is the base. The height is measured up from it."),
            ok("3 cm"),
          ], "The height is the straight-up dashed line, 3 cm.",
            { figure: par(7, 4, 3, { base: "7 cm", slant: "5 cm", h: "3 cm", hl: true }), guards: ["slant"] }),
        ] },
        { id: "s6", type: "explain", skill: "quad", saveAs: "2",
          prompt: "What makes a line the height of a shape?",
          keyIdeas: [["perpendicular", "right angle", "right-angle", "90", "square corner", "straight down", "straight up", "at right angles"], ["base", "bottom", "opposite side", "parallel", "top"]],
          starter: "A line is the height when it meets the base at a… and it goes straight from the top to the…",
          responses: {
            strong: "Strong. You said it meets the base at a right angle and linked it to the base. That's exactly what a height is.",
            close: "You're close. You have one key idea. Add what the height has to meet, and the angle it makes there.",
            nudge: "Let's try again. Think about the angle where the height touches the base. Is it slanted or square?",
          } },
        { id: "s7", type: "exit", questions: [
          mcq("d2e1", "quad", "Which length is the height of this parallelogram?", [
            bad("10 cm", "10 cm is the slanted side. It leans a lot, so it's much longer than the height.", "slant"),
            bad("5 cm", "5 cm is the base, the bottom side."),
            ok("8 cm"),
          ], "The height is the straight-up dashed line, 8 cm.",
            { figure: par(5, 6, 8, { base: "5 cm", slant: "10 cm", h: "8 cm", hl: true }), guards: ["slant"] }),
          num("d2e2", "quad", "A parallelogram has base 9 cm and a slanted side of 7 cm. The straight-up distance between the top and the bottom is 5 cm. Its height = ? cm", 5,
            "The height is the straight-up distance, 5 cm. The slanted side (7 cm) and the base (9 cm) are not the height.",
            { unit: "cm", guards: ["slant"], wrongMixups: [{ value: 7, mixup: "slant", why: "7 cm is the slanted side. The height is the straight-up distance: 5 cm." }, { value: 9, why: "9 cm is the base. The height is the straight-up distance: 5 cm." }] }),
        ] },
      ],
    },

    // ================= DAY 3 =================
    {
      n: 3, title: "Area is counting squares", skills: ["a1", "a2"],
      summaryLine: "Area counts the squares inside a shape, and a parallelogram can be re-cut into a rectangle: base × height.",
      teacherNote: "Squares inside for area, a walk around the edge for perimeter. Keep them apart, Aarav.",
      tomorrow: "Triangles, and why the height is never the slanted side.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao covers a 5 cm by 3 cm rectangle with 15 small squares, then walks a finger round its edge: the squares are the area, the walk is the perimeter.",
          boardSvg: F.wrap(5, 3, [F.grid(5, 3), F.poly([[0, 0], [5, 0], [5, 3], [0, 3]]),
            F.label(2.5, 1.7, "15 squares"), F.label(2.5, 3.8, "5 cm"), F.label(5.2, 1.7, "3 cm", "start"),
            F.label(2.5, -0.3, "Area 15 cm²  ·  Perimeter 16 cm")], { pad: 1.2, alt: "A 5 cm by 3 cm rectangle covered in 15 squares." }),
          trap: "Adding the sides (perimeter) when the question asks how much space is inside.",
          classNote: "In 8-B, 7 of 32 mixed up area and perimeter on day 0." },
        { id: "s2", type: "recall", questions: [
          num("d3r1", "rect", "Area of a rectangle 9 cm by 5 cm = ? cm²", 45, "9 × 5 = 45 cm².",
            { unit: "cm²", guards: ["perim"], wrongMixups: [{ value: 28, mixup: "perim", why: "28 is 9 + 5 + 9 + 5, the distance around. Area is 9 × 5 = 45." }] }),
          mcq("d3r2", "rect", "Area is measured in…", [
            bad("cm", "Plain cm measures a length, like the side of a shape."),
            ok("cm²"),
            bad("cm³", "cm³ measures volume, the space in a solid. Area is flat: cm²."),
          ], "Area counts squares, so it's in square units: cm²."),
          mcq("d3r3", "alg", "A rectangle is 2x long and 3 wide. Its area is…", [
            bad("5x", "That adds 2x + 3 as if they were like terms. Area multiplies: 2x × 3."),
            ok("6x"),
            bad("2x + 3", "That adds the sides. Area multiplies them: 2x × 3 = 6x."),
          ], "2x × 3 = 6x."),
        ] },
        { id: "s3", type: "animation", anim: "pen-fence", skill: "a1" },   // story lesson: the goat pen (replaces the cut-move video)
        { id: "s4", type: "game", game: "tile-cover", skill: "a1" },
        { id: "s5", type: "animation", anim: "para-field", skill: "a2" },   // hands-on: replaces the para-to-rect video + the cut-slide game
        { id: "s6", type: "rive", lessons: [1, 2, 3], title: "Area Lab: squares, fences and the wonky field" },
        { id: "s7", type: "practice", questions: [
          mcq("d3p1", "a1", "Each small square is 1 cm². What is the area of this shape?", [
            bad("18 cm²", "18 is the distance round the edge (5 + 2 + 3 + 2 + 2 + 4). Area counts the squares inside.", "perim"),
            ok("14 cm²"),
            bad("20 cm²", "That's the whole 5 × 4 box. The top-right corner isn't part of the shape."),
          ], "The wide part is 5 × 2 = 10 squares and the lower arm is 2 × 2 = 4 squares: 10 + 4 = 14.",
            { figure: S(5, 4, [[0, 0], [5, 0], [5, 2], [2, 2], [2, 4], [0, 4]], [], "L-shaped figure drawn on a grid of 1 cm squares."), guards: ["perim"] }),
          num("d3p2", "a1", "A garden is 7 m long and 5 m wide. How much grass covers it? (m²)", 35, "Grass covers the inside: 7 × 5 = 35 m².",
            { unit: "m²", guards: ["perim"], wrongMixups: [{ value: 24, mixup: "perim", why: "24 is 7 + 5 + 7 + 5, the distance around. Grass covers the inside, so multiply: 7 × 5 = 35." }, { value: 12, why: "12 is 7 + 5. Area multiplies the two sides: 7 × 5 = 35." }] }),
          mcq("d3p3", "a2", "What is the area of this parallelogram?", [
            bad("30 cm²", "6 × 5 uses the slanted side. The height is the straight-up 4 cm.", "slant"),
            bad("22 cm²", "22 is 6 + 5 + 6 + 5, the distance round. Area is base × height.", "perim"),
            ok("24 cm²"),
          ], "Base × height = 6 × 4 = 24 cm².",
            { figure: par(6, 3, 4, { base: "6 cm", slant: "5 cm", h: "4 cm", hl: true, rm: true }), guards: ["slant", "perim"] }),
          num("d3p4", "a2", "A parallelogram has base 9 cm and height 5 cm. Area = ? cm²", 45, "Base × height = 9 × 5 = 45 cm².",
            { unit: "cm²", guards: ["perim"], wrongMixups: [{ value: 14, why: "14 is 9 + 5. Area multiplies: 9 × 5 = 45." }, { value: 90, why: "90 is double. For a parallelogram it's just base × height: 9 × 5." }] }),
        ] },
        { id: "s8", type: "fix", mixup: "perim", anim: "fix-perim",
          check: mcq("d3f1", "a1", "Two fields each use 20 m of fence. Field A is 8 m by 2 m. Field B is 6 m by 4 m. Which one has more grass?", [
            bad("They're the same, because they have the same fence", "Same fence means the same perimeter. Grass is the area: A = 8 × 2 = 16 m² and B = 6 × 4 = 24 m².", "perim"),
            ok("Field B, with 24 m²"),
            bad("Field A, with 16 m²", "A has 16 m², but B has 6 × 4 = 24 m². B has more."),
          ], "A = 8 × 2 = 16 m², B = 6 × 4 = 24 m². Same fence, different area.", { guards: ["perim"] }) },
        { id: "s9", type: "exit", questions: [
          num("d3e1", "a1", "A rectangle is 9 m by 4 m. Area = ? m²", 36, "9 × 4 = 36 m².",
            { unit: "m²", guards: ["perim"], wrongMixups: [{ value: 26, mixup: "perim", why: "26 is 9 + 4 + 9 + 4, the distance round. Area is 9 × 4 = 36." }] }),
          mcq("d3e2", "a2", "A parallelogram has base 7 cm and height 3 cm. Its area is…", [
            bad("10 cm²", "10 is 7 + 3. Area multiplies: base × height."),
            ok("21 cm²"),
            bad("42 cm²", "42 is double. For a parallelogram it's just base × height: 7 × 3 = 21."),
          ], "7 × 3 = 21 cm²."),
        ] },
      ],
    },

    // ================= DAY 4 =================
    {
      n: 4, title: "Triangles and the real height", skills: ["a3"],
      summaryLine: "A triangle is half of a parallelogram: area = ½ × base × height, and the height goes straight up.",
      teacherNote: "Watch the lean, Aarav. The height is the straight-up line, never the slanted side.",
      tomorrow: "Pair work: explain triangles to a partner, including heights that fall outside the shape.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao draws a triangle with three lines in it and asks which one is the height: the class agrees it's the straight-down one, not the slanted side.",
          boardSvg: tri(8, 3, 4, { base: "8 cm", left: "5 cm", h: "4 cm", hl: true, rm: true, slantMark: true, alt: "Triangle with base 8 cm, slanted side 5 cm marked as not the height, and a dashed height of 4 cm." }),
          trap: "Using the 5 cm slanted side as the height (20 cm² instead of 16 cm²), or forgetting the ½.",
          classNote: "In 8-B, 18 of 32 used the slanted side as the height on day 0." },
        { id: "s2", type: "recall", questions: [
          num("d4r1", "pyth", "A right triangle has longest side 25 cm and one leg 7 cm. The other leg = ? cm", 24,
            "25² − 7² = 625 − 49 = 576, and √576 = 24 cm.",
            { unit: "cm", wrongMixups: [{ value: 18, why: "That's 25 − 7. Use squares: 625 − 49 = 576, then √576 = 24." }, { value: 576, why: "576 is the square of the answer. Take the root: √576 = 24." }] }),
          num("d4r2", "a2", "A parallelogram has base 10 cm and height 3 cm. Area = ? cm²", 30, "Base × height = 10 × 3 = 30 cm².", { unit: "cm²" }),
          mcq("d4r3", "a1", "A rectangle is 8 cm by 3 cm. Its area is…", [
            bad("22 cm²", "22 is the distance round the edge. Area is 8 × 3.", "perim"),
            ok("24 cm²"),
            bad("11 cm²", "11 is 8 + 3. Area multiplies the sides."),
          ], "8 × 3 = 24 cm².", { guards: ["perim"] }),
        ] },
        { id: "s3", type: "animation", anim: "tri-field", skill: "a3" },   // hands-on: replaces the tri-half video
        { id: "s4", type: "rive", lessons: [4], title: "Area Lab: two triangles, one field" },
        { id: "s6", type: "practice", questions: [
          num("d4p1", "a3", "Find the area of this right triangle. The 4 cm side is the height. Area = ? cm²", 12,
            "½ × 6 × 4 = 12 cm².",
            { figure: tri(6, 0, 4, { base: "6 cm", left: "4 cm", alt: "Right triangle with base 6 cm and height 4 cm." }), unit: "cm²", guards: ["half"],
              wrongMixups: [{ value: 24, why: "6 × 4 = 24 is the whole rectangle. A triangle is half of it: ½ × 6 × 4 = 12." }, { value: 10, why: "10 is 6 + 4. Area multiplies, then halves: ½ × 6 × 4 = 12." }] }),
          mcq("d4p2", "a3", "Find the area of this triangle.", [
            bad("40 cm²", "8 × 5 uses the slanted side as the height and forgets the ½. Use ½ × 8 × 4.", "slant"),
            ok("16 cm²"),
            bad("20 cm²", "½ × 8 × 5 uses the 5 cm slanted side as the height. The height is the straight-up 4 cm.", "slant"),
            bad("32 cm²", "8 × 4 = 32 is the whole rectangle. A triangle is only half of it.", "half"),
          ], "Area = ½ × base × height = ½ × 8 × 4 = 16 cm². The slanted side (5 cm) isn't the height.",
            { figure: tri(8, 3, 4, { base: "8 cm", left: "5 cm", h: "4 cm", hl: true }), guards: ["slant", "half"] }),
          mcq("d4p3", "a3", "A triangle has base 10 cm and height 6 cm. What is its area?", [
            bad("60 cm²", "10 × 6 = 60 is the rectangle round the triangle. Halve it."),
            ok("30 cm²"),
            bad("16 cm²", "16 is 10 + 6. Area multiplies, then halves: ½ × 10 × 6."),
          ], "½ × 10 × 6 = 30 cm².",
            { figure: tri(10, 4, 6, { base: "10 cm", h: "6 cm", hl: true, rm: true }), guards: ["half"] }),
          num("d4p4", "a3", "A triangle has base 9 cm and height 6 cm. Area = ? cm²", 27, "½ × 9 × 6 = 27 cm².",
            { unit: "cm²", guards: ["half"],
              wrongMixups: [{ value: 54, mixup: "half", why: "9 × 6 = 54 is the whole rectangle. A triangle is half of it: 27." }, { value: 15, why: "15 is 9 + 6. Multiply, then halve: ½ × 9 × 6 = 27." }] }),
          num("d4p5", "a3", "A triangle has area 20 cm² and base 8 cm. Its height = ? cm", 5,
            "20 = ½ × 8 × h = 4 × h, so h = 5 cm.",
            { unit: "cm", guards: ["half"],
              wrongMixups: [{ value: 2.5, mixup: "half", why: "20 ÷ 8 = 2.5 forgets the ½. Area = ½ × base × height, so 20 = 4 × h and h = 5." }, { value: 12, why: "12 is 20 − 8. Use the area rule backwards: 20 = ½ × 8 × h." }] }),
        ] },
        { id: "s7", type: "fix", mixup: "slant", anim: "fix-slant",
          check: mcq("d4f1", "a3", "Find the area of this triangle.", [
            bad("15 cm²", "½ × 6 × 5 uses the slanted side as the height. The straight-up height is 4 cm.", "slant"),
            bad("24 cm²", "6 × 4 = 24 is the whole rectangle. A triangle is half of it.", "half"),
            ok("12 cm²"),
          ], "½ × 6 × 4 = 12 cm². The 5 cm slanted side is not the height.",
            { figure: tri(6, 3, 4, { base: "6 cm", left: "5 cm", right: "5 cm", h: "4 cm", hl: true }), guards: ["slant"] }) },
        { id: "s8", type: "fix", mixup: "half", anim: "fix-half",
          check: num("d4f2", "a3", "A triangle has base 12 cm and height 7 cm. Area = ? cm²", 42, "½ × 12 × 7 = 42 cm².",
            { unit: "cm²", guards: ["half"], wrongMixups: [{ value: 84, mixup: "half", why: "12 × 7 = 84 is the whole rectangle. A triangle is exactly half of it: 42." }] }) },
        { id: "s9", type: "exit", questions: [
          num("d4e1", "a3", "A triangle has base 14 cm and height 5 cm. Area = ? cm²", 35, "½ × 14 × 5 = 35 cm².",
            { unit: "cm²", guards: ["half"], wrongMixups: [{ value: 70, mixup: "half", why: "14 × 5 = 70 is the whole rectangle. A triangle is half of it: 35." }] }),
          mcq("d4e2", "a3", "Find the area of this triangle.", [
            bad("25 cm²", "½ × 10 × 5 uses the slanted side as the height. The height is 4 cm.", "slant"),
            ok("20 cm²"),
            bad("40 cm²", "10 × 4 = 40 is the whole rectangle. A triangle is half of it.", "half"),
            bad("50 cm²", "10 × 5 uses the slanted side and forgets the ½.", "slant"),
          ], "½ × 10 × 4 = 20 cm².",
            { figure: tri(10, 3, 4, { base: "10 cm", left: "5 cm", h: "4 cm", hl: true }), guards: ["slant", "half"] }),
        ] },
      ],
    },

    // ================= DAY 5 =================
    {
      n: 5, title: "Practice and pairs", skills: ["a2", "a3"],
      summaryLine: "You practised parallelograms and triangles, including a triangle whose height falls outside it.",
      teacherNote: "Good explaining today. Saying it out loud is how it sticks.",
      tomorrow: "Trapeziums: a shape with two parallel sides.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao puts the class in pairs (one explains, one checks), then shows a leaning triangle whose height lands outside it.",
          boardSvg: tri(4, -2, 4, { base: "4 cm", h: "4 cm", hl: true, rm: true, alt: "Leaning triangle with base 4 cm. The dashed height of 4 cm falls outside the triangle, on an extended base line." }),
          trap: "Thinking the height must sit inside the triangle. It can fall outside: extend the base line and drop straight down.",
          classNote: "In pairs, one explains and one checks, then they swap. Ms. Rao listens in." },
        { id: "s2", type: "recall", questions: [
          num("d5r1", "a3", "A triangle has base 10 cm and height 7 cm. Area = ? cm²", 35, "½ × 10 × 7 = 35 cm².", { unit: "cm²", wrongMixups: [{ value: 70, why: "70 is the whole rectangle. A triangle is half: 35." }] }),
          num("d5r2", "a2", "A parallelogram has base 12 cm and height 5 cm. Area = ? cm²", 60, "12 × 5 = 60 cm².", { unit: "cm²" }),
          mcq("d5r3", "quad", "The height of a shape is…", [
            bad("the length of the slanted side", "A slanted side leans over. The height goes straight up.", "slant"),
            ok("a straight line from the top down to the base, at a right angle"),
            bad("always the longest side", "The height is often shorter than the sides. It doesn't have to be a side at all."),
          ], "A height meets the base at a right angle.", { guards: ["slant"] }),
        ] },
        { id: "s3", type: "worked", skill: "a3",
          lines: [
            "This triangle leans so far that its top corner sits beyond the end of the base.",
            "Extend the base line, then drop a straight line down from the top corner. That's the height: 4 cm.",
            "The base is the 4 cm side on the ground.",
            "Area = ½ × base × height = ½ × 4 × 4 = 8 cm²",
          ],
          figure: tri(4, -2, 4, { base: "4 cm", h: "4 cm", hl: true, rm: true, alt: "Leaning triangle with the height outside." }),
          yourTurn: { prompt: "Your turn: a leaning triangle has base 6 cm and height 5 cm.",
            blanks: [{ label: "6 × 5 =", answer: 30 }, { label: "Area = half of that =", answer: 15, unit: "cm²" }] } },
        { id: "s4", type: "practice", questions: [
          num("d5p1", "a2", "Find the area of this parallelogram. Area = ? cm²", 28, "Base × height = 7 × 4 = 28 cm².",
            { figure: par(7, 3, 4, { base: "7 cm", slant: "5 cm", h: "4 cm", hl: true }), unit: "cm²", guards: ["slant", "half"],
              wrongMixups: [{ value: 35, mixup: "slant", why: "7 × 5 uses the slanted side as the height. The height is the straight-up 4 cm." }, { value: 14, mixup: "half", why: "A parallelogram is NOT halved. Only a triangle gets the ½. Use 7 × 4 = 28." }] }),
          mcq("d5p2", "a3", "Find the area of this triangle. The dashed line is the height.", [
            bad("24 cm²", "6 × 4 = 24 is the whole rectangle. A triangle is half of it.", "half"),
            ok("12 cm²"),
            bad("15 cm²", "½ × 6 × 5 uses the slanted side as the height. The dashed line is 4 cm.", "slant"),
          ], "½ × 6 × 4 = 12 cm². The height can sit outside the triangle.",
            { figure: tri(6, -3, 4, { base: "6 cm", left: "5 cm", h: "4 cm", hl: true }), guards: ["slant", "half"] }),
          mcq("d5p3", "a2", "A parallelogram and a triangle both have base 8 cm and height 5 cm. How do their areas compare?", [
            bad("They're equal, 40 cm² each", "The triangle gets a ½: it's only 20 cm². The parallelogram is 40 cm².", "half"),
            ok("The parallelogram is twice the triangle (40 cm² and 20 cm²)"),
            bad("The triangle is twice the parallelogram", "It's the other way round. The triangle is half of the parallelogram."),
          ], "Parallelogram: 8 × 5 = 40 cm². Triangle: ½ × 8 × 5 = 20 cm². The parallelogram is twice as big.", { guards: ["half"] }),
          num("d5p4", "a3", "A triangle has base 15 cm and height 8 cm. Area = ? cm²", 60, "½ × 15 × 8 = 60 cm².",
            { unit: "cm²", guards: ["half"], wrongMixups: [{ value: 120, mixup: "half", why: "15 × 8 = 120 is the whole rectangle. A triangle is half of it: 60." }, { value: 23, why: "23 is 15 + 8. Multiply, then halve." }] }),
          num("d5p5", "a2", "A parallelogram has area 48 cm² and base 8 cm. Its height = ? cm", 6, "48 ÷ 8 = 6 cm.",
            { unit: "cm", guards: ["half"], wrongMixups: [{ value: 12, mixup: "half", why: "12 comes from using the triangle rule (2 × 48 ÷ 8). A parallelogram has no ½: 48 ÷ 8 = 6." }, { value: 40, why: "40 is 48 − 8. Divide the area by the base: 48 ÷ 8 = 6." }] }),
        ] },
        { id: "s5", type: "explain", skill: "a3",
          prompt: "Explain why a triangle is half a parallelogram.",
          keyIdeas: [["two", "copy", "twice", "double", "another", "join", "same triangle", "match", "rotate", "turn"], ["half", "½", "parallelogram", "half of it"]],
          starter: "If I take two copies of the same triangle and join them, I get a… so one triangle is…",
          responses: {
            strong: "Strong. You said two copies make a parallelogram, so each triangle is half. That's the whole idea.",
            close: "You're close. You have one key idea. Say how many triangles you need to build the parallelogram, and what each one is.",
            nudge: "Let's try again. Picture the animation: you took a second triangle and turned it round. What shape did the two make?",
          } },
        { id: "s6", type: "exit", questions: [
          num("d5e1", "a3", "A triangle has base 20 cm and height 9 cm. Area = ? cm²", 90, "½ × 20 × 9 = 90 cm².",
            { unit: "cm²", guards: ["half"], wrongMixups: [{ value: 180, mixup: "half", why: "20 × 9 = 180 is the whole rectangle. A triangle is half of it: 90." }] }),
          mcq("d5e2", "a2", "A parallelogram has base 5 cm, a slanted side of 7 cm and a height of 6 cm. Its area is…", [
            bad("35 cm²", "5 × 7 uses the slanted side. The height is 6 cm.", "slant"),
            ok("30 cm²"),
            bad("15 cm²", "A parallelogram is NOT halved. It's just base × height: 5 × 6 = 30.", "half"),
          ], "Base × height = 5 × 6 = 30 cm².", { guards: ["slant", "half"] }),
        ] },
      ],
    },

    // ================= DAY 6 =================
    {
      n: 6, title: "Trapeziums", skills: ["a4"],
      summaryLine: "A trapezium is half of a parallelogram made from two copies: area = ½ × (a + b) × h.",
      teacherNote: "Both parallel sides count, Aarav. Add them, multiply by the height, then halve.",
      tomorrow: "Any shape: split it into pieces you already know.",
      /* Rebuilt 2026-11-19 on the animation flow (see anim/trap-day.js and anim/trap-fixes.js):
         quick reminder -> quick recall -> try first -> lesson video with 2 guess stops -> hands-on field (the aha and the
         play: copy, spin, slide; stretch the top; make exactly 14) -> check questions with a reaction on every answer
         and a mistake replay after the common wrong answers, each followed by a fresh question -> progress. */
      steps: [
        { id: "d6-remind", type: "animation", anim: "trap-remind", eyebrow: "Quick reminder", autoplay: true },
        { id: "d6-recall", type: "recall", reactions: true, questions: [
          num("d6r1", "a3", "A triangle has base 12 cm and height 5 cm. Area = ? cm²", 30, "½ × 12 × 5 = 30 cm².", { unit: "cm²", wrongMixups: [{ value: 60, why: "60 is the whole rectangle. A triangle is half: 30." }] }),
          num("d6r2", "a2", "A parallelogram has base 9 cm and height 7 cm. Area = ? cm²", 63, "9 × 7 = 63 cm².", { unit: "cm²" }),
          mcq("d6r3", "a1", "A room is 5 m by 8 m. Its floor area is…", [
            bad("26 m²", "26 is the distance round the edge. Area is 5 × 8.", "perim"),
            ok("40 m²"),
            bad("13 m²", "13 is 5 + 8. Area multiplies the sides."),
          ], "5 × 8 = 40 m².", { guards: ["perim"] }),
        ] },
        { id: "d6-try", type: "try", skill: "a4",
          q: num("d6t1", "a4", "A trapezium has parallel sides 8 cm and 4 cm, and height 3 cm. Take a guess at its area (cm²).", 18, "The area is ½ × (8 + 4) × 3 = 18 cm².",
            { figure: trap(8, 4, 2, 3, { bot: "8 cm", top: "4 cm", h: "3 cm", hl: true }), unit: "cm²" }),
          reveal: "The area is 18 cm². You'll see exactly where that comes from: ½ × (8 + 4) × 3. No worry if your guess was different." },
        { id: "d6-lesson", type: "animation", anim: "trap-lesson", skill: "a4" },
        { id: "d6-hands", type: "animation", anim: "trap-field", skill: "a4", eyebrow: "Now you try", flags: { afterLesson: true } },
        { id: "d6-check", type: "practice", reactions: true, questions: [
          mcq("d6c1", "a4", "Find the area of this trapezium.", [
            rep(bad("100 cm²", "(8 + 12) × 5 = 100 is two trapeziums put together. Yours is half of it: 50."), "trap-fix-100"),
            ok("50 cm²"),
            rep(bad("60 cm²", "12 × 5 uses only the bottom side. Both parallel sides count: ½ × (8 + 12) × 5."), "trap-fix-60"),
          ], "½ × (8 + 12) × 5 = ½ × 20 × 5 = 50 cm².",
            { figure: trap(12, 8, 2, 5, { bot: "12 cm", top: "8 cm", h: "5 cm", hl: true, rm: true }),
              retry: num("d6c1b", "a4", "A trapezium has parallel sides 7 cm and 9 cm, and height 6 cm. Area = ? cm²", 48, "½ × (7 + 9) × 6 = ½ × 16 × 6 = 48 cm².",
                { unit: "cm²", wrongMixups: [
                  { value: 96, why: "(7 + 9) × 6 = 96 is two trapeziums. Yours is half of it: 48." },
                  { value: 54, why: "9 × 6 uses only the bottom side. Both parallel sides count: ½ × (7 + 9) × 6." },
                  { value: 42, why: "7 × 6 uses only the top side. Both parallel sides count: ½ × (7 + 9) × 6." }] }) }),
          mcq("d6c2", "a4", "Find the area of this trapezium.", [
            rep(bad("35 cm²", "½ × 14 × 5 uses the 5 cm slanted side as the height. The height is the straight-up 4 cm.", "slant"), "trap-fix-35"),
            ok("28 cm²"),
            bad("56 cm²", "(9 + 5) × 4 = 56 forgets the ½. That's two trapeziums; yours is half: 28."),
          ], "½ × (9 + 5) × 4 = ½ × 14 × 4 = 28 cm².",
            { figure: trap(9, 5, 3, 4, { bot: "9 cm", top: "5 cm", leg: "5 cm", h: "4 cm", hl: true }), guards: ["slant"],
              retry: mcq("d6c2b", "a4", "Find the area of this trapezium.", [
                bad("40 cm²", "½ × 16 × 5 uses the 5 cm slanted side as the height. The height is the straight-up 4 cm.", "slant"),
                ok("32 cm²"),
                bad("64 cm²", "(11 + 5) × 4 = 64 forgets the ½. Yours is half: 32."),
              ], "½ × (11 + 5) × 4 = ½ × 16 × 4 = 32 cm². The slanted sides are 5 cm, but the height is 4 cm.",
                { figure: trap(11, 5, 3, 4, { bot: "11 cm", top: "5 cm", leg: "5 cm", h: "4 cm", hl: true }), guards: ["slant"] }) }),
          mcq("d6c3", "a4", "Ramesh uncle has three more fields. Which two have the same area?", [
            ok("P and Q"),
            bad("P and R", "P and R share a bottom of 8 m, but nothing else. P is ½ × (4 + 8) × 5 = 30 m², and R is ½ × (6 + 8) × 4 = 28 m²."),
            bad("Q and R", "Q is ½ × (2 + 10) × 5 = 30 m², but R is ½ × (6 + 8) × 4 = 28 m²."),
          ], "P is ½ × (4 + 8) × 5 = 30 m² and Q is ½ × (2 + 10) × 5 = 30 m². They look different, but top + bottom is 12 in both, and the heights match.",
            { figure: trio([["P", 8, 4, 5], ["Q", 10, 2, 5], ["R", 8, 6, 4]],
                "Three trapezium fields. P: parallel sides 4 m and 8 m, height 5 m. Q: parallel sides 2 m and 10 m, height 5 m. R: parallel sides 6 m and 8 m, height 4 m.") }),
          num("d6c4", "a4", "A trapezium has area 36 cm² and parallel sides 5 cm and 7 cm. Its height = ? cm", 6, "36 = ½ × 12 × h = 6 × h, so h = 6 cm.",
            { unit: "cm", wrongMixups: [{ value: 3, why: "36 ÷ 12 = 3 forgets the ½. 36 = ½ × 12 × h = 6 × h, so h = 6." }, { value: 24, why: "24 is 36 − 12. Use the area rule backwards: 36 = ½ × (5 + 7) × h." }] }),
        ] },
        { id: "d6-lab", type: "rive", lessons: [5], title: "Area Lab: two parallel sides" },
        { id: "d6-progress", type: "animation", anim: "trap-progress", eyebrow: "Today's progress", autoplay: true },
      ],
    },

    // ================= DAY 7 =================
    {
      n: 7, title: "Any shape: split it up", skills: ["a5"],
      summaryLine: "Any shape can be split into rectangles, triangles and trapeziums. Find each area, then add (or take away).",
      teacherNote: "One dashed line can turn a scary shape into two easy ones, Aarav.",
      tomorrow: "Real rooms, and changing m² into cm².",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao draws an L-shaped room and cuts it into two rectangles with one dashed line: each piece is a shape you already know.",
          boardSvg: S(6, 5, [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]], [F.line(0, 2, 3, 2, "height"),
            F.label(3, -0.3, "6 cm"), F.label(6.2, 1.2, "2 cm", "start"), F.label(1.5, 5.8, "3 cm"),
            F.label(3, 1.25, "A = 6 × 2 = 12"), F.label(1.5, 3.6, "B = 3 × 3 = 9")], "L-shaped room split by a dashed line into a 6 by 2 rectangle and a 3 by 3 square. Total 21.", 1.4),
          trap: "Measuring the whole box round the shape, which includes the missing corner.",
          classNote: "Pieces can be added up, or the missing corner can be taken away. Both give the same answer." },
        { id: "s2", type: "recall", questions: [
          num("d7r1", "a4", "A trapezium has parallel sides 6 cm and 14 cm, and height 5 cm. Area = ? cm²", 50, "½ × (6 + 14) × 5 = ½ × 20 × 5 = 50 cm².",
            { unit: "cm²", wrongMixups: [{ value: 100, why: "(6 + 14) × 5 = 100 forgets the ½. The trapezium is half: 50." }] }),
          num("d7r2", "a3", "A triangle has base 10 cm and height 8 cm. Area = ? cm²", 40, "½ × 10 × 8 = 40 cm².",
            { unit: "cm²", wrongMixups: [{ value: 80, mixup: "half", why: "80 is the whole rectangle. A triangle is half: 40." }], guards: ["half"] }),
          num("d7r3", "a2", "A parallelogram has base 8 cm and height 6 cm. Area = ? cm²", 48, "8 × 6 = 48 cm².", { unit: "cm²" }),
        ] },
        { id: "s3", type: "animation", anim: "courtyard-split", skill: "a5" },   // story lesson: the L-shaped courtyard (replaces the poly-split video)
        { id: "s4", type: "game", game: "split-shape", skill: "a5" },
        { id: "s4b", type: "rive", lessons: [6], title: "Area Lab: awkward corners" },
        { id: "s5", type: "practice", questions: [
          mcq("d7p1", "a5", "Each small square is 1 cm². What is the area of this shape?", [
            bad("35 cm²", "7 × 5 is the whole box. The bottom-right corner isn't part of the shape."),
            bad("26 cm²", "The lower arm sticks out only 3 cm below the bar, not 4: 3 × 3 = 9, not 12."),
            ok("23 cm²"),
          ], "Split it: the top bar is 7 × 2 = 14 and the lower arm is 3 × 3 = 9. Total 14 + 9 = 23 cm².",
            { figure: S(7, 5, [[0, 0], [7, 0], [7, 2], [3, 2], [3, 5], [0, 5]], [F.line(0, 2, 3, 2, "height")], "L-shaped figure on a grid of 1 cm squares: a 7 by 2 bar with a 3 by 3 arm below its left end.") }),
          num("d7p2", "a5", "A house shape is a rectangle with a triangle on top. Find its total area. (cm²)", 52,
            "Rectangle: 8 × 5 = 40. Triangle: ½ × 8 × 3 = 12. Total 40 + 12 = 52 cm².",
            { figure: S(8, 8, [[0, 3], [4, 0], [8, 3], [8, 8], [0, 8]], [F.line(0, 3, 8, 3, "height"), F.line(4, 0, 4, 3, "height"),
                F.label(4, 8.9, "8 cm"), F.label(-0.2, 5.7, "5 cm", "end"), F.label(4.2, 1.8, "3 cm", "start")], "House shape: an 8 by 5 rectangle with a triangle of height 3 on top.", 1.2),
              unit: "cm²",
              wrongMixups: [{ value: 40, why: "40 is just the rectangle (8 × 5). Don't forget the triangle on top: ½ × 8 × 3 = 12." }, { value: 64, why: "8 × 8 is the whole box, but the roof's two top corners are empty." }] }),
          num("d7p3", "a5", "A floor plan is a 10 m by 6 m rectangle with a 4 m by 3 m corner missing. Area = ? m²", 48,
            "Whole rectangle: 10 × 6 = 60. Missing corner: 4 × 3 = 12. Area = 60 − 12 = 48 m².",
            { figure: S(10, 6, [[0, 0], [6, 0], [6, 3], [10, 3], [10, 6], [0, 6]], [F.label(5, 6.9, "10 m"), F.label(-0.2, 3.2, "6 m", "end"), F.label(8, 2.6, "4 m"), F.label(10.2, 4.7, "3 m", "start")], "Floor plan: a 10 by 6 rectangle with a 4 by 3 corner missing at the top right.", 1.3),
              unit: "m²",
              wrongMixups: [{ value: 72, why: "72 adds the missing corner (60 + 12). It's missing, so take it away: 60 − 12." }, { value: 60, why: "60 is the whole rectangle, with the missing corner included." }] }),
        ] },
        { id: "s6", type: "exit", questions: [
          num("d7e1", "a5", "A shape is a 7 cm by 4 cm rectangle with a triangle on top. The triangle has base 7 cm and height 4 cm. Total area = ? cm²", 42,
            "Rectangle: 7 × 4 = 28. Triangle: ½ × 7 × 4 = 14. Total 42 cm².",
            { unit: "cm²", wrongMixups: [{ value: 28, why: "28 is just the rectangle. Add the triangle: 14." }, { value: 56, why: "The triangle is half of 28, which is 14, not 28." }] }),
          mcq("d7e2", "a5", "Each small square is 1 cm². What is the area of this T-shape?", [
            bad("54 cm²", "9 × 6 is the whole box. The bottom corners are empty."),
            bad("36 cm²", "The stem sticks out only 4 cm below the bar, not 6: 3 × 4 = 12, not 18."),
            ok("30 cm²"),
          ], "Bar: 9 × 2 = 18. Stem: 3 × 4 = 12. Total 18 + 12 = 30 cm².",
            { figure: S(9, 6, [[0, 0], [9, 0], [9, 2], [6, 2], [6, 6], [3, 6], [3, 2], [0, 2]], [F.line(0, 2, 9, 2, "height"), F.label(4.5, -0.3, "9 cm"), F.label(9.2, 1.2, "2 cm", "start"), F.label(6.2, 4, "4 cm", "start"), F.label(4.5, 6.8, "3 cm")], "T-shape: a 9 by 2 bar with a 3 wide stem, 4 cm tall, below the middle.", 1.3) }),
        ] },
      ],
    },

    // ================= DAY 8 =================
    {
      n: 8, title: "Real rooms and units", skills: ["a6"],
      summaryLine: "Real rooms use square metres, and 1 m² is 10,000 cm², not 100.",
      teacherNote: "When you change square units, the 100 happens twice, Aarav: 100 × 100.",
      tomorrow: "Hidden heights: use Pythagoras to find a height you can't see.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao lays a 1 metre square of paper on the floor and marks it in centimetres: 100 cm one way and 100 cm the other.",
          boardSvg: F.wrap(5, 5, [F.grid(5, 5), F.poly([[0.5, 0.5], [4.5, 0.5], [4.5, 4.5], [0.5, 4.5]]),
            F.label(2.5, 0.1, "100 cm"), F.label(4.7, 2.6, "100 cm", "start"), F.label(2.5, 2.4, "1 m²"), F.label(2.5, 3.2, "= 100 × 100 cm²")], { pad: 1.4, alt: "A 1 metre square, 100 cm on each side. 1 m² = 100 × 100 = 10,000 cm²." }),
          trap: "Multiplying by 100 instead of 100 × 100 when changing m² to cm².",
          classNote: "Most of the class guesses 100 here. The picture shows why it's 10,000." },
        { id: "s2", type: "recall", questions: [
          num("d8r1", "a4", "A trapezium has parallel sides 3 cm and 9 cm, and height 5 cm. Area = ? cm²", 30, "½ × (3 + 9) × 5 = ½ × 12 × 5 = 30 cm².",
            { unit: "cm²", wrongMixups: [{ value: 60, why: "(3 + 9) × 5 = 60 forgets the ½. The trapezium is half: 30." }] }),
          num("d8r2", "a5", "A shape is a 5 cm by 2 cm rectangle joined to a 3 cm by 2 cm rectangle. Total area = ? cm²", 16, "5 × 2 = 10 and 3 × 2 = 6, and 10 + 6 = 16 cm².", { unit: "cm²" }),
          mcq("d8r3", "rect", "How many centimetres are in 1 metre?", [
            bad("10", "10 is too small. Think of a ruler: 1 m = 100 cm."),
            ok("100"),
            bad("1000", "1000 is the number of millimetres in 1 metre. 1 m = 100 cm."),
          ], "1 m = 100 cm."),
        ] },
        { id: "s3", type: "animation", anim: "tile-units", skill: "a6" },   // story lesson: one square metre of tiles (replaces the units video)
        { id: "s4", type: "game", game: "floor-tiles", skill: "a6" },
        { id: "s4b", type: "rive", lessons: [7], title: "Area Lab: square metres and square centimetres" },
        { id: "s5", type: "practice", questions: [
          num("d8p1", "a6", "A classroom floor is 5 m by 4 m. Its area = ? m²", 20, "5 × 4 = 20 m².",
            { unit: "m²", guards: ["perim"], wrongMixups: [{ value: 18, mixup: "perim", why: "18 is 5 + 4 + 5 + 4, the distance round. Area is 5 × 4 = 20." }] }),
          num("d8p2", "a6", "A rug is 2 m by 3 m. What is its area in cm²?", 60000, "2 m × 3 m = 6 m². And 1 m² = 10,000 cm², so 6 × 10,000 = 60,000 cm². (Or 200 cm × 300 cm = 60,000.)",
            { unit: "cm²", guards: ["units"],
              wrongMixups: [{ value: 600, mixup: "units", why: "6 m² × 100 = 600. But 1 m² is 100 × 100 = 10,000 cm², so 6 × 10,000 = 60,000." }, { value: 6, why: "6 is the area in m². The question wants cm²: 6 × 10,000." }] }),
          num("d8p3", "a6", "Square tiles 50 cm by 50 cm cover a floor 3 m by 2 m. How many tiles are needed?", 24,
            "Floor: 300 cm × 200 cm = 60,000 cm². One tile: 50 × 50 = 2,500 cm². 60,000 ÷ 2,500 = 24 tiles. (Or 6 tiles along 3 m and 4 along 2 m: 6 × 4 = 24.)",
            { guards: ["units"], wrongMixups: [{ value: 10, why: "10 is 6 + 4, the tiles along the two sides. Multiply: 6 × 4 = 24." }, { value: 12, why: "12 is 6 ÷ 0.5. A tile's AREA is 0.5 × 0.5 = 0.25 m², so 6 ÷ 0.25 = 24." }] }),
          mcq("d8p4", "a6", "A flower bed is shaped like this parallelogram. How much soil is needed to cover it?", [
            bad("45 m²", "9 × 5 uses the slanted side as the height. The height is the straight-up 4 m.", "slant"),
            bad("28 m²", "28 is 9 + 5 + 9 + 5, the distance round. Area is base × height.", "perim"),
            ok("36 m²"),
          ], "Base × height = 9 × 4 = 36 m².",
            { figure: par(9, 3, 4, { base: "9 m", slant: "5 m", h: "4 m", hl: true, rm: true }), guards: ["slant", "perim"] }),
          mcq("d8p5", "a6", "How many cm² are there in 3 m²?", [
            bad("300 cm²", "That multiplies by 100 only. 1 m² = 100 × 100 = 10,000 cm².", "units"),
            bad("3,000 cm²", "1 m² is 100 × 100 = 10,000 cm², not 1,000."),
            ok("30,000 cm²"),
          ], "3 × 10,000 = 30,000 cm².", { guards: ["units"] }),
        ] },
        { id: "s6", type: "fix", mixup: "units", anim: "units-10000",
          check: num("d8f1", "a6", "A table top is 2 m by 1 m. What is its area in cm²?", 20000, "2 m × 1 m = 2 m², and 2 × 10,000 = 20,000 cm². (Or 200 cm × 100 cm.)",
            { unit: "cm²", guards: ["units"], wrongMixups: [{ value: 200, mixup: "units", why: "2 × 100 = 200 is the mix-up: 1 m² is 100 × 100 = 10,000 cm², so 2 × 10,000 = 20,000." }, { value: 2, why: "2 is the area in m². Change it to cm²: 2 × 10,000." }] }) },
        { id: "s7", type: "fix", mixup: "slant", anim: "fix-slant",
          check: mcq("d8f2", "a6", "Find the area of this parallelogram.", [
            bad("50 cm²", "5 × 10 uses the slanted side as the height. The straight-up height is 8 cm.", "slant"),
            ok("40 cm²"),
            bad("30 cm²", "30 is 5 + 10 + 5 + 10, the distance round. Area is base × height.", "perim"),
          ], "Base × height = 5 × 8 = 40 cm². The 10 cm slanted side isn't the height.",
            { figure: par(5, 6, 8, { base: "5 cm", slant: "10 cm", h: "8 cm", hl: true, rm: true }), guards: ["slant", "perim"] }) },
        { id: "s8", type: "exit", questions: [
          num("d8e1", "a6", "A hall is 12 m by 9 m. Its area = ? m²", 108, "12 × 9 = 108 m².",
            { unit: "m²", guards: ["perim"], wrongMixups: [{ value: 42, mixup: "perim", why: "42 is 12 + 9 + 12 + 9, the distance round. Area is 12 × 9 = 108." }] }),
          mcq("d8e2", "a6", "A 4 m² carpet is how many cm²?", [
            bad("400 cm²", "That multiplies by 100 only. 1 m² = 100 × 100 = 10,000 cm².", "units"),
            ok("40,000 cm²"),
            bad("4,000 cm²", "1 m² is 100 × 100 = 10,000 cm², not 1,000."),
          ], "4 × 10,000 = 40,000 cm².", { guards: ["units"] }),
        ] },
      ],
    },

    // ================= DAY 9 =================
    {
      n: 9, title: "Hidden heights", skills: ["a7"],
      summaryLine: "When the height isn't given, drop it to make a right triangle and use Pythagoras to find it.",
      teacherNote: "This is where Part 1 and Area meet, Aarav. Pythagoras hands you the height you can't measure.",
      tomorrow: "Check-in again, and see how far you've come.",
      steps: [
        { id: "s1", type: "teacher",
          what: "Ms. Rao draws a triangle with sides 10, 10 and 12 and no height given: she drops a line from the top, and Pythagoras finds it.",
          boardSvg: tri(12, 6, 8, { base: "12 cm", left: "10 cm", right: "10 cm", h: "? cm", hl: true, rm: true, alt: "Triangle with sides 10, 10 and 12 cm. A dashed height of unknown length splits the base into 6 cm and 6 cm." }),
          trap: "Using the 10 cm side as the height, or using the whole 12 cm base instead of half (6 cm) in the right-angled triangle.",
          classNote: "Pythagoras from Part 1 returns here: it gives the height you can't measure." },
        { id: "s2", type: "recall", questions: [
          num("d9r1", "pyth", "A right triangle has longest side 17 cm and one leg 8 cm. The other leg = ? cm", 15, "17² − 8² = 289 − 64 = 225, and √225 = 15 cm.",
            { unit: "cm", wrongMixups: [{ value: 9, why: "That's 17 − 8. Use squares: 289 − 64 = 225, then √225 = 15." }, { value: 225, why: "225 is the square of the answer. Take the root: √225 = 15." }] }),
          num("d9r2", "sq", "13² = ?", 169, "13 × 13 = 169."),
          mcq("d9r3", "alg", "Simplify 3(x + 2) − x", [
            bad("2x + 2", "Multiply both parts by 3: 3 × x + 3 × 2 = 3x + 6, not 3x + 2."),
            ok("2x + 6"),
            bad("4x + 6", "The − x means take away: 3x − x = 2x, not 4x."),
          ], "3(x + 2) = 3x + 6, and 3x + 6 − x = 2x + 6."),
        ] },
        { id: "s2b", type: "animation", anim: "shade-net", skill: "a7" },   // story lesson: the shade net, before the worked example
        { id: "s3", type: "worked", skill: "a7",
          lines: [
            "A triangle has equal sides of 10 cm and a base of 12 cm. The height isn't given.",
            "Drop the height from the top to the middle of the base. The base splits into 6 and 6.",
            "Now there's a right triangle: longest side 10, one leg 6. So h² = 10² − 6² = 100 − 36 = 64, and h = 8 cm.",
            "Area = ½ × 12 × 8 = 48 cm²",
          ],
          figure: tri(12, 6, 8, { base: "12 cm", left: "10 cm", right: "10 cm", h: "h = ?", hl: true, rm: true }),
          yourTurn: { prompt: "Your turn: equal sides 13 cm and base 10 cm.",
            blanks: [{ label: "Half the base =", answer: 5, unit: "cm" }, { label: "h² = 13² − 5² =", answer: 144 }, { label: "Height h =", answer: 12, unit: "cm" }, { label: "Area = ½ × 10 × 12 =", answer: 60, unit: "cm²" }] } },
        { id: "s4", type: "practice", questions: [
          num("d9p1", "a7", "A triangle has sides 5 cm, 5 cm and 6 cm. Find its area. (cm²)", 12,
            "Half the base is 3. h² = 5² − 3² = 25 − 9 = 16, so h = 4. Area = ½ × 6 × 4 = 12 cm².",
            { figure: tri(6, 3, 4, { base: "6 cm", left: "5 cm", right: "5 cm", alt: "Triangle with sides 5, 5 and 6 cm. The height is not shown." }), unit: "cm²", guards: ["slant", "half"],
              wrongMixups: [{ value: 15, mixup: "slant", why: "½ × 6 × 5 uses a slanted side as the height. Find the real height: √(25 − 9) = 4." }, { value: 24, mixup: "half", why: "6 × 4 = 24 forgets the ½. A triangle is half of it: 12." }] }),
          num("d9p2", "a7", "A parallelogram has base 7 cm and a slanted side of 10 cm. The slanted side leans 6 cm sideways. Find its area. (cm²)", 56,
            "The height is √(10² − 6²) = √64 = 8 cm. Area = 7 × 8 = 56 cm².",
            { figure: par(7, 6, 8, { base: "7 cm", slant: "10 cm", alt: "Parallelogram with base 7 cm and slanted side 10 cm. The height is not shown." }), unit: "cm²", guards: ["slant"],
              wrongMixups: [{ value: 70, mixup: "slant", why: "7 × 10 uses the slanted side as the height. Find the real height: √(100 − 36) = 8." }, { value: 42, why: "42 is 7 × 6. The 6 is the sideways lean, not the height. Height = √(100 − 36) = 8." }] }),
          mcq("d9p3", "a7", "A triangular roof end has two sloping sides of 17 m and a flat base of 16 m. How much wall does it cover? (its area)", [
            bad("136 m²", "½ × 16 × 17 uses the sloping side as the height. Find the real height: half the base is 8, so h = √(289 − 64) = 15.", "slant"),
            bad("240 m²", "16 × 15 = 240 forgets the ½. A triangle is half of that: 120.", "half"),
            ok("120 m²"),
          ], "Half the base is 8. h² = 17² − 8² = 289 − 64 = 225, so h = 15. Area = ½ × 16 × 15 = 120 m².", { guards: ["slant", "half"] }),
        ] },
        { id: "s5", type: "explain", skill: "a7", saveAs: "9",
          prompt: "How did you find the height you couldn't see?",
          keyIdeas: [["pythag", "right triangle", "right-angled", "right angled", "square root", "squared", "a²"], ["half", "split", "middle", "halve", "cut", "divide", "drop", "perpendicular"]],
          starter: "I dropped a line from the top to make a… and then I used… on half of the base.",
          responses: {
            strong: "Strong. You dropped the height to make a right triangle and used Pythagoras. That's exactly the method.",
            close: "You're close. You have one key idea. Say how you made a right triangle, and which rule you used on it.",
            nudge: "Let's try again. Think about the line you drop from the top corner. What kind of triangle does it make, and which rule finds a missing side?",
          } },
        { id: "s6", type: "exit", questions: [
          num("d9e1", "a7", "A triangle has two sloping sides of 13 cm and a base of 24 cm. Find its area. (cm²)", 60,
            "Half the base is 12. h² = 13² − 12² = 169 − 144 = 25, so h = 5. Area = ½ × 24 × 5 = 60 cm².",
            { unit: "cm²", guards: ["slant"], wrongMixups: [{ value: 156, mixup: "slant", why: "½ × 24 × 13 uses the sloping side as the height. The real height is √(169 − 144) = 5." }, { value: 120, why: "24 × 5 = 120 forgets the ½. The triangle is half: 60." }] }),
          num("d9e2", "a7", "A triangle has two equal sides of 10 cm and a base of 16 cm. Its height = ? cm", 6,
            "Half the base is 8. h² = 10² − 8² = 100 − 64 = 36, so h = 6 cm.",
            { unit: "cm", guards: ["slant"], wrongMixups: [{ value: 10, mixup: "slant", why: "10 cm is a sloping side, not the height. h = √(100 − 64) = 6." }, { value: 8, why: "8 is half the base. It's one leg of the right triangle, not the height. h² = 100 − 64 = 36." }] }),
        ] },
      ],
    },
    { n: 10, title: "Check-in again", skills: [], steps: [] },
  ];

  // ================= RETEST (day 10): 12 questions, one per skill =================
  C.data.retest = [
    num("rt1", "sq", "√225 = ?", 15, "15 × 15 = 225."),
    mcq("rt2", "quad", "Which length is the height of this parallelogram?", [
      bad("5 cm", "5 cm is the slanted side. The height goes straight up.", "slant"),
      bad("7 cm", "7 cm is the base. The height is measured up from it."),
      ok("3 cm"),
    ], "The height is the straight-up line, 3 cm.",
      { figure: par(7, 4, 3, { base: "7 cm", slant: "5 cm", h: "3 cm", hl: true }), guards: ["slant"] }),
    num("rt3", "pyth", "A right triangle has legs 20 cm and 21 cm. Longest side = ? cm", 29, "20² + 21² = 400 + 441 = 841, and √841 = 29 cm.",
      { unit: "cm", wrongMixups: [{ value: 41, why: "That's 20 + 21. Square, add, then take the root: 841, √841 = 29." }, { value: 841, why: "841 is the square. √841 = 29." }] }),
    num("rt4", "rect", "A hall is 9 m by 6 m. Its floor area = ? m²", 54, "9 × 6 = 54 m².",
      { unit: "m²", guards: ["perim"], wrongMixups: [{ value: 30, mixup: "perim", why: "30 is 9 + 6 + 9 + 6, the distance round. Area is 9 × 6 = 54." }] }),
    mcq("rt5", "alg", "Simplify 5a + 3b − 2a + b", [
      bad("3a + 2b", "3b + b = 4b, not 2b."),
      ok("3a + 4b"),
      bad("7a + 4b", "5a − 2a is 3a (take away), not 7a."),
    ], "5a − 2a = 3a and 3b + b = 4b, so 3a + 4b."),
    num("rt6", "a1", "Each small square is 1 cm². What is the area of this shape? (cm²)", 12,
      "Count the rows: 2 + 4 + 6 = 12 squares.",
      { figure: S(6, 3, [[0, 0], [2, 0], [2, 1], [4, 1], [4, 2], [6, 2], [6, 3], [0, 3]], [], "Staircase shape on a grid of 1 cm squares: rows of 2, 4 and 6 squares."), unit: "cm²", guards: ["perim"],
        wrongMixups: [{ value: 18, mixup: "perim", why: "18 is the distance round the edge. Area counts the squares inside." }] }),
    mcq("rt7", "a2", "Find the area of this parallelogram.", [
      bad("45 cm²", "9 × 5 uses the slanted side as the height. The height is the straight-up 3 cm.", "slant"),
      ok("27 cm²"),
      bad("28 cm²", "28 is 9 + 5 + 9 + 5, the distance round. Area is base × height.", "perim"),
    ], "Base × height = 9 × 3 = 27 cm².",
      { figure: par(9, 4, 3, { base: "9 cm", slant: "5 cm", h: "3 cm", hl: true, rm: true }), guards: ["slant", "perim"] }),
    mcq("rt8", "a3", "Find the area of this right triangle.", [
      bad("30 cm²", "½ × 6 × 10 uses the longest slanted side as the height. The straight-up side is 8 cm.", "slant"),
      bad("48 cm²", "6 × 8 = 48 is the whole rectangle. A triangle is half of it.", "half"),
      ok("24 cm²"),
    ], "½ × 6 × 8 = 24 cm².",
      { figure: tri(6, 0, 8, { base: "6 cm", left: "8 cm", right: "10 cm", alt: "Right triangle with base 6 cm, upright side 8 cm and longest side 10 cm." }), guards: ["slant", "half"] }),
    num("rt9", "a4", "A trapezium has parallel sides 5 cm and 11 cm, and height 4 cm. Area = ? cm²", 32, "½ × (5 + 11) × 4 = ½ × 16 × 4 = 32 cm².",
      { unit: "cm²", wrongMixups: [{ value: 64, why: "(5 + 11) × 4 = 64 forgets the ½. The trapezium is half: 32." }] }),
    num("rt10", "a5", "A house shape is a 6 cm by 3 cm rectangle with a triangle of height 4 cm on top (base 6 cm). Total area = ? cm²", 30,
      "Rectangle: 6 × 3 = 18. Triangle: ½ × 6 × 4 = 12. Total 18 + 12 = 30 cm².",
      { figure: S(6, 7, [[0, 4], [3, 0], [6, 4], [6, 7], [0, 7]], [F.line(0, 4, 6, 4, "height"), F.line(3, 0, 3, 4, "height"),
          F.label(3, 7.9, "6 cm"), F.label(-0.2, 5.7, "3 cm", "end"), F.label(3.2, 2.2, "4 cm", "start")], "House shape: a 6 by 3 rectangle with a triangle of height 4 on top.", 1.2),
        unit: "cm²", wrongMixups: [{ value: 18, why: "18 is just the rectangle. Add the triangle: 12." }, { value: 42, why: "The triangle is ½ × 6 × 4 = 12, not 24." }] }),
    num("rt11", "a6", "A mat is 3 m by 1 m. What is its area in cm²?", 30000, "3 m × 1 m = 3 m², and 3 × 10,000 = 30,000 cm².",
      { unit: "cm²", guards: ["units"], wrongMixups: [{ value: 300, mixup: "units", why: "3 × 100 = 300 is the mix-up. 1 m² = 100 × 100 = 10,000 cm², so 3 × 10,000 = 30,000." }, { value: 3, why: "3 is the area in m². The question wants cm²." }] }),
    num("rt12", "a7", "A triangle has sides 5 cm, 5 cm and 8 cm. Find its area. (cm²)", 12,
      "Half the base is 4. h² = 25 − 16 = 9, so h = 3. Area = ½ × 8 × 3 = 12 cm².",
      { figure: tri(8, 4, 3, { base: "8 cm", left: "5 cm", right: "5 cm", alt: "Triangle with sides 5, 5 and 8 cm. The height is not shown." }), unit: "cm²", guards: ["slant", "half"],
        wrongMixups: [{ value: 20, mixup: "slant", why: "½ × 8 × 5 uses a sloping side as the height. The real height is √(25 − 16) = 3." }, { value: 24, mixup: "half", why: "8 × 3 = 24 forgets the ½. A triangle is half of it: 12." }] }),
  ];

  // ================= helpers (function declarations are hoisted) =================
  function ok(text) { return { text: text, correct: true }; }
  function bad(text, why, mixup) { var o = { text: text, why: why }; if (mixup) o.mixup = mixup; return o; }
  /** this wrong answer plays the mistake replay `anim` (an anim id from anim/trap-fixes.js) before the question's retry */
  function rep(option, anim) { option.replay = anim; return option; }
  function mcq(id, skill, prompt, options, explain, extra) {
    var q = { id: id, skill: skill, kind: "mcq", prompt: prompt, options: options, explain: explain };
    if (extra) Object.keys(extra).forEach(function (k) { q[k] = extra[k]; });
    return q;
  }
  function num(id, skill, prompt, answer, explain, extra) {
    var q = { id: id, skill: skill, kind: "number", prompt: prompt, answer: answer, explain: explain };
    if (extra) Object.keys(extra).forEach(function (k) { q[k] = extra[k]; });
    return q;
  }
  function S(W, H, pts, extra, alt, pad) {
    return F.wrap(W, H, [F.grid(W, H), F.poly(pts)].concat(extra || []), { alt: alt || "Shape on a grid.", pad: pad || 1 });
  }
  /* Parallelogram: base b, sideways lean off, height h. o: base/slant/h labels, hl (draw height), rm (right mark), slantMark */
  function par(b, off, h, o) {
    o = o || {};
    var W = b + off + 2, H = h + 2, y = h + 1, xl = 1, xr = 1 + b, xtl = 1 + off, xtr = 1 + b + off, my = (y + 1) / 2;
    var p = [F.grid(W, H), F.poly([[xl, y], [xr, y], [xtr, 1], [xtl, 1]])];
    if (o.slantMark) p.push(F.line(xr, y, xtr, 1, "wrong"));
    if (o.hl) {
      if (xtl > xr) p.push(F.line(xr, y, xtl, y, "height"));
      p.push(F.line(xtl, 1, xtl, y, "height"));
      if (o.rm) p.push(F.right(xtl, y));
      if (o.h) p.push(F.label(xtl - 0.2, my + 0.2, o.h, "end"));
    }
    if (o.base) p.push(F.label((xl + xr) / 2, y + 0.8, o.base));
    if (o.slant) p.push(F.label((xr + xtr) / 2 + 0.25, my + 0.3, o.slant, "start"));
    return F.wrap(W, H, p, { alt: o.alt || ("Parallelogram" + (o.base ? " with base " + o.base : "") + (o.slant ? " and slanted side " + o.slant : "") + "."), pad: 1.2 });
  }
  /* Triangle: base b, apex a units from the left end of the base (a<0 = leaning out past the left end), height h. */
  function tri(b, a, h, o) {
    o = o || {};
    var shift = a < 0 ? 1 - a : 0, xl = 1 + shift, xr = xl + b, xa = xl + a, y = h + 1, my = (y + 1) / 2;
    var W = Math.max(xr, xa) + 1, H = h + 2;
    var p = [F.grid(W, H), F.poly([[xl, y], [xr, y], [xa, 1]])];
    if (o.slantMark) p.push(F.line(xl, y, xa, 1, "wrong"));
    if (o.hl) {
      if (xa < xl) p.push(F.line(xa, y, xl, y, "height"));
      if (xa > xr) p.push(F.line(xr, y, xa, y, "height"));
      p.push(F.line(xa, 1, xa, y, "height"));
      if (o.rm) p.push(F.right(xa, y));
      if (o.h) p.push(a < 0 ? F.label(xa - 0.2, my + 0.2, o.h, "end") : F.label(xa + 0.2, my + 0.2, o.h, "start"));
    }
    if (o.base) p.push(F.label((xl + xr) / 2, y + 0.8, o.base));
    if (o.left) p.push(a < 0 ? F.label((xl + xa) / 2 + 0.5, my + 0.3, o.left, "start") : F.label((xl + xa) / 2 - 0.25, my + 0.3, o.left, "end"));
    if (o.right) p.push(F.label((xr + xa) / 2 + 0.25, my + 0.3, o.right, "start"));
    return F.wrap(W, H, p, { alt: o.alt || "Triangle figure.", pad: 1.2 });
  }
  /* Trapezium: bottom side bot, top side top, top starts offL right of the bottom-left corner, height h. */
  function trap(bot, top, offL, h, o) {
    o = o || {};
    var xl = 1, xr = 1 + bot, xtl = 1 + offL, xtr = xtl + top, y = h + 1, my = (y + 1) / 2;
    var W = Math.max(xr, xtr) + 1, H = h + 2;
    var p = [F.grid(W, H), F.poly([[xl, y], [xr, y], [xtr, 1], [xtl, 1]])];
    if (o.hl) {
      p.push(F.line(xtl, 1, xtl, y, "height"));
      if (o.rm) p.push(F.right(xtl, y));
      if (o.h) p.push(F.label(xtl + 0.2, my + 0.2, o.h, "start"));
    }
    if (o.bot) p.push(F.label((xl + xr) / 2, y + 0.8, o.bot));
    if (o.top) p.push(F.label((xtl + xtr) / 2, 0.65, o.top));
    if (o.leg) p.push(F.label((xl + xtl) / 2 - 0.25, my + 0.3, o.leg, "end"));
    return F.wrap(W, H, p, { alt: o.alt || ("Trapezium" + (o.bot ? " with parallel sides " + o.top + " and " + o.bot : "") + "."), pad: 1.2 });
  }
  /* Three trapezium fields side by side, named P, Q, R: list = [[name, bottom, top, height], ...] in metres.
     Drawn at half scale (no grid) so the labels stay readable in one wide figure. */
  function trio(list, alt) {
    var s = 0.5, gap = 1.6, x = 0, parts = [], H = 0;
    list.forEach(function (f) { H = Math.max(H, f[3] * s); });
    list.forEach(function (f) {
      var bot = f[1] * s, top = f[2] * s, hh = f[3] * s, off = (bot - top) / 2, yb = H + 0.9, yt = yb - hh;
      parts.push(F.poly([[x, yb], [x + bot, yb], [x + off + top, yt], [x + off, yt]]));
      parts.push(F.line(x + off, yt, x + off, yb, "height"));
      parts.push(F.label(x + off + top / 2, yt - 0.3, f[2] + " m"));
      parts.push(F.label(x + bot / 2, yb + 0.75, f[1] + " m"));
      parts.push(F.label(x + off + 0.15, (yt + yb) / 2 + 0.2, f[3] + " m", "start"));
      parts.push('<text class="name" x="' + (x + bot / 2) + '" y="' + (yb + 1.75) + '" text-anchor="middle">' + f[0] + "</text>");
      x += bot + gap;
    });
    return F.wrap(x - gap, H + 2.2, parts, { alt: alt, pad: 0.8 }).replace('class="t-figure"', 'class="t-figure t-figure-wide"');
  }
  /* Product decision (2026-11-16): no teacher-at-the-board step. Every lesson is a narrated
     Cogna audio-visual lesson (the animation steps), so teacher steps are removed from every day. */
  C.data.days.forEach(function (d) { d.steps = (d.steps || []).filter(function (s) { return s.type !== "teacher"; }); });
})();
