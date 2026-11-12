/* Cogna prototype — the student, skills, mix-ups and the day-0 test findings.
   CONTRACT FILE (owned by the orchestrator). Mock data for one grade 8 CBSE student. */
(function () {
  "use strict";
  var C = window.Cogna, F = C.fig;

  C.data.student = {
    name: "Aarav Mehta", grade: "8-B", school: "Sunrise Public School",
    teacher: "Ms. Kavita Rao", teacherShort: "Ms. Rao",
    group: "Short bridge first", classSize: 32,
    testDate: "Check-in, Dec 2026", topic: "Area",
  };

  /* kind: 'prior' = taught June–December (tested on day 0) | 'area' = the new topic (7 steps).
     neededForArea: the 5 prior skills Area builds on (shown on the "Ready for Area?" path).
     fixDay: which bridge day fixes it (only for needed skills that are not secure). */
  C.data.skills = [
    { id: "sq",     kind: "prior", name: "Squares & square roots",         neededForArea: true,  day0: "secure",  evidence: "6 of 6 right, quick and sure" },
    { id: "cube",   kind: "prior", name: "Cubes & cube roots",             neededForArea: false, day0: "shaky",   evidence: "3 of 5 right; slips on cube roots of fractions" },
    { id: "pow",    kind: "prior", name: "Powers & exponents",             neededForArea: false, day0: "secure",  evidence: "5 of 5 right" },
    { id: "quad",   kind: "prior", name: "Four-sided shapes: sides & heights", neededForArea: true,  day0: "shaky",   evidence: "Knows the properties; unsure where a height goes", fixDay: 2 },
    { id: "prop1",  kind: "prior", name: "Proportional reasoning I",       neededForArea: false, day0: "secure",  evidence: "4 of 4 right" },
    { id: "expand", kind: "prior", name: "Expanding brackets",             neededForArea: false, day0: "shaky",   evidence: "Forgets the middle term in (a+b)²" },
    { id: "pct",    kind: "prior", name: "Percentages",                    neededForArea: false, day0: "secure",  evidence: "5 of 6 right" },
    { id: "pyth",   kind: "prior", name: "Baudhayana–Pythagoras theorem",  neededForArea: true,  day0: "missing", evidence: "0 of 3 right; adds the sides instead of squaring", fixDay: 1 },
    { id: "rect",   kind: "prior", name: "Area of rectangles (counting squares)", neededForArea: true, day0: "secure", evidence: "4 of 4 right" },
    { id: "alg",    kind: "prior", name: "Simple algebra expressions",     neededForArea: true,  day0: "secure",  evidence: "5 of 6 right" },

    { id: "a1", kind: "area", step: 1, name: "Area is counting squares",      day0: "untaught" },
    { id: "a2", kind: "area", step: 2, name: "Parallelograms",                day0: "untaught" },
    { id: "a3", kind: "area", step: 3, name: "Triangles",                     day0: "untaught" },
    { id: "a4", kind: "area", step: 4, name: "Trapeziums",                    day0: "untaught" },
    { id: "a5", kind: "area", step: 5, name: "Any shape, by splitting",       day0: "untaught" },
    { id: "a6", kind: "area", step: 6, name: "Real rooms & units",            day0: "untaught" },
    { id: "a7", kind: "area", step: 7, name: "Hidden heights (with Pythagoras)", day0: "untaught" },
  ];

  /* Mix-ups. day0Seen / day0Of = in how many of the related test questions it showed up. */
  C.data.mixups = [
    { id: "slant", name: "Uses the slanted side as the height",
      plain: "When a shape leans, you measured the leaning side instead of the straight-up distance.",
      whyNotSlip: "It showed up in 3 different questions, with different shapes and numbers. A careless slip doesn't repeat like that.",
      day0Seen: 3, day0Of: 3, fixAnim: "fix-slant" },
    { id: "perim", name: "Mixes up area and perimeter",
      plain: "Once, you added up the sides when the question asked for the space inside.",
      whyNotSlip: "Only 1 of 2 questions, so it might be a slip. We'll watch for it.",
      day0Seen: 1, day0Of: 2, fixAnim: "fix-perim" },
    { id: "half", name: "Forgets the ½ for a triangle (or uses it on a parallelogram)",
      plain: "Not seen yet: triangles haven't been taught. Common in this class.", day0Seen: 0, day0Of: 0, fixAnim: "fix-half" },
    { id: "units", name: "Multiplies by 100 instead of 10,000 for m² → cm²",
      plain: "Not seen yet. Common when area units are new.", day0Seen: 0, day0Of: 0, fixAnim: "units-10000" },
    { id: "looks", name: "“Looks bigger, so it is bigger”",
      plain: "Not seen yet.", day0Seen: 0, day0Of: 0, fixAnim: "cut-move" },
  ];

  /* Figure used by the report's slanted-side mix-up card: his chosen "height" is the slanted side. */
  var slantFigure = F.wrap(10, 6, [
    F.grid(10, 6),
    F.poly([[1, 5], [7, 5], [9, 1], [3, 1]]),
    F.line(7, 5, 9, 1, "wrong"),
    F.line(3, 1, 3, 5, "height"), F.right(3, 5),
    F.label(4, 5.75, "8 cm"), F.label(8.9, 3.2, "5 cm"), F.label(2.2, 3.2, "4 cm"),
  ], { alt: "Parallelogram, base 8 cm, slanted side 5 cm, height 4 cm. Aarav's chosen height (the slanted side) is marked." });

  C.data.report = {
    headline: [
      "You're strong on squares, powers and percentages: that's a great base.",
      "Two things need a quick fix before Area: the right-angle rule (Pythagoras) and finding the height in four-sided shapes.",
      "One mix-up to watch: using the slanted side as the height. We'll fix it in the first week.",
    ],
    questionsAnswered: 44, minutes: 32,
    confidenceGrid: { sureRight: 27, sureWrong: 6, unsureRight: 7, unsureWrong: 4 },
    avgSec: 41, classAvgSec: 48,
    quote: { q: "Why did you pick 40 cm²?", a: "Because the sides are 8 and 5 so I multiplied them. The 5 is how tall it goes." },
    /* Evidence drawers for each prior skill: his actual answers. */
    testAnswers: {
      sq: [{ q: "√196 = ?", his: "14", right: "14", tells: "Knows square roots of perfect squares quickly." }],
      cube: [{ q: "∛(27/64) = ?", his: "9/16", right: "3/4", tells: "Squares-thinking leaks into cubes: took the square root instead of the cube root." }],
      pow: [{ q: "2⁵ × 2³ = 2^?", his: "8", right: "8", tells: "Adds powers correctly when the bases match." }],
      quad: [
        { q: "Which line is the height of this parallelogram? (A slanted side, B dashed perpendicular)", his: "A", right: "B", tells: "Knows a height exists but picked the side you can see." },
        { q: "Opposite sides of a parallelogram are…", his: "parallel and equal", right: "parallel and equal", tells: "Properties are fine; it's only the height that's unclear." },
      ],
      prop1: [{ q: "If 4 pens cost ₹60, 7 pens cost?", his: "₹105", right: "₹105", tells: "Unit-rate reasoning is secure." }],
      expand: [{ q: "(x + 3)² = ?", his: "x² + 9", right: "x² + 6x + 9", tells: "Forgets the middle term: squares each part separately." }],
      pct: [{ q: "15% of 240 = ?", his: "36", right: "36", tells: "Percent of a quantity is secure." }],
      pyth: [
        { q: "A right triangle has legs 6 cm and 8 cm. Longest side?", his: "14 cm", right: "10 cm", tells: "Adds the sides instead of squaring and adding: the rule isn't there yet." },
        { q: "Is a triangle with sides 5, 12, 13 right-angled?", his: "Don't know", right: "Yes (25 + 144 = 169)", tells: "Hasn't met the converse either." },
      ],
      rect: [{ q: "Area of a 7 cm × 4 cm rectangle?", his: "28 cm²", right: "28 cm²", tells: "Counts squares and multiplies; units right." }],
      alg: [{ q: "Simplify 3a + 2b − a + 4b", his: "2a + 6b", right: "2a + 6b", tells: "Collects like terms well." }],
    },
    mixupCards: {
      slant: { q: "Find the area of the parallelogram (base 8 cm, slanted side 5 cm, height 4 cm).", his: "40 cm²", right: "32 cm²", figure: slantFigure },
      perim: { q: "A garden is 6 m by 4 m. How much grass covers it?", his: "20 m²", right: "24 m²", figure: null },
    },
    plan: [
      { days: "Day 1–2", what: "Quick fixes: Pythagoras and heights" },
      { days: "Day 3–9", what: "Area, step by step, with Ms. Rao" },
      { days: "Day 10", what: "Check-in again and see how far you've come" },
    ],
  };
})();
