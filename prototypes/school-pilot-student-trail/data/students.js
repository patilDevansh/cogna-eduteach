/* Cogna prototype — demo students + personalisation inputs. CONTRACT FILE (orchestrator).
   Loaded right after data/skills.js. Picks the current student (localStorage 'cogna-student',
   default 'aarav') and patches C.data.student / skills / mixups / report for that student.
   Everything downstream (state.js fresh(), screens) just reads C.data as before.

   Day-1 "causes" (Pythagoras wrong ideas) are ordinary mix-ups:
     addsides — adds the legs instead of squaring (3,4 -> 7)
     noroot   — squares and adds but forgets the square root (3,4 -> 25)
     wrongc   — treats a short side as c (subtracts when it should add, or adds when it should subtract)
*/
(function () {
  "use strict";
  var C = window.Cogna, D = C.data;

  D.mixups.push(
    { id: "addsides", name: "Adds the sides instead of squaring them", plain: "You added the two short sides (3 + 4 = 7) instead of squaring them first.", whyNotSlip: "It happened on every Pythagoras question.", day0Seen: 0, day0Of: 0, fixAnim: "pyth-why-not-add" },
    { id: "noroot", name: "Forgets to take the square root", plain: "You squared and added correctly, then stopped at c² (like 25) instead of c (5).", whyNotSlip: "Same step missed each time.", day0Seen: 0, day0Of: 0, fixAnim: "pyth-undo-square" },
    { id: "wrongc", name: "Mixes up which side is the longest (c)", plain: "You used a short side as c, so you added when you needed to take away.", whyNotSlip: "Seen when the missing side was a short one.", day0Seen: 0, day0Of: 0, fixAnim: "pyth-which-c" }
  );

  /* interest: picks the story context of personalised questions (question.themes[interest]).
     causes: Day-0 wrong ideas (drive Day 1 openers). startLevel: where adaptive practice begins (1-3). */
  D.students = {
    aarav: {
      id: "aarav", name: "Aarav Mehta", interest: "cricket", startLevel: 1,
      day0: {}, // keeps skills.js defaults (pyth missing)
      causes: { addsides: 3 },
      story: [{ correct: false, mixup: "addsides" }, { correct: true }, { correct: true }, { correct: true }, { correct: true }, { correct: true }],
      reportPatch: null,
    },
    riya: {
      id: "riya", name: "Riya Sharma", interest: "music", startLevel: 2,
      day0: { pyth: "shaky", quad: "secure", cube: "secure", expand: "secure" },
      causes: { noroot: 2 },
      story: [{ correct: false, mixup: "noroot" }, { correct: true }, { correct: true }, { correct: true }, { correct: true }],
      mixupDay0: { slant: [0, 3], perim: [0, 2] },
      reportPatch: {
        headline: [
          "You're secure on four-sided shapes, cubes and expanding brackets: a strong base.",
          "One step to tidy up before Area: with Pythagoras you square and add perfectly, then forget the square root.",
          "No mix-up with heights. You found the straight-up height every time.",
        ],
        quote: { q: "Legs 6 and 8. Why did you write 100?", a: "Because 36 plus 64 is 100, so that's the long side." },
        confidenceGrid: { sureRight: 31, sureWrong: 3, unsureRight: 6, unsureWrong: 4 },
        testAnswers: { pyth: [
          { q: "A right triangle has legs 6 cm and 8 cm. Longest side?", his: "100 cm", right: "10 cm", tells: "The rule is there; the last step (√) is missing." },
          { q: "Legs 3 cm and 4 cm. Longest side?", his: "25 cm", right: "5 cm", tells: "Same: stops at c²." },
        ] },
        mixupCards: {},
      },
    },
  };

  var id = "aarav";
  try { id = window.localStorage.getItem("cogna-student") || "aarav"; } catch (e) { /* ignore */ }
  if (!D.students[id]) id = "aarav";
  var P = D.students[id];
  C.studentId = id;
  D.profile = P;

  D.student.name = P.name;
  D.skills.forEach(function (s) { if (P.day0[s.id]) s.day0 = P.day0[s.id]; });
  D.mixups.forEach(function (m) {
    if (P.causes[m.id] !== undefined) { m.day0Seen = P.causes[m.id]; m.day0Of = P.causes[m.id]; }
    if (P.mixupDay0 && P.mixupDay0[m.id]) { m.day0Seen = P.mixupDay0[m.id][0]; m.day0Of = P.mixupDay0[m.id][1]; }
  });
  if (P.reportPatch) Object.keys(P.reportPatch).forEach(function (k) {
    if (k === "testAnswers") Object.keys(P.reportPatch.testAnswers).forEach(function (s) { D.report.testAnswers[s] = P.reportPatch.testAnswers[s]; });
    else D.report[k] = P.reportPatch[k];
  });

  /** Switch demo student: saved, then reload so every layer re-reads data. */
  C.switchStudent = function (newId) {
    try { window.localStorage.setItem("cogna-student", newId); } catch (e) { /* ignore */ }
    window.location.hash = "#/welcome";
    window.location.reload();
  };
})();
