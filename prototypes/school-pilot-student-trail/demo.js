/* Cogna prototype — demo drawer for presenting to schools. OWNER: orchestrator.
   "Jump" resets progress and replays Aarav's STORY answers through the real state API
   (recordAnswer / recordExplain / completeDay), so meters, mix-ups and the growth page stay honest. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h;

  /* ---------- the story ---------- */
  /* One tempting wrong answer on these days:
     day 2 + 4: the slanted-side mix-up (day 4's shows the fix step);
     day 6: a slip on the LAST check question (Day 6 has no exit check since its 2026-11-19 rebuild), so trapeziums
            end the day shaky and get revisited on day 7;
     day 8: the slanted-side mix-up comes back once. */
  var STORY = {
    2: { type: "practice", mixup: "slant", pick: "first" },
    4: { type: "practice", mixup: "slant", pick: "first" },
    6: { type: "practice", mixup: null, pick: "last" },
    8: { type: "practice", mixup: "slant", pick: "first" },
  };
  var STORY_TEXT = {
    "1": "It only works when the triangle has a right angle of 90 degrees, and c has to be the longest side, opposite that angle.",
    "2": "The height is how tall the shape is, the side going up from the bottom.",
    "9": "I couldn't see the height, so I dropped a line straight down from the top to the middle of the base. That made two right triangles, so I used Pythagoras: 10² − 6² = 64, height = 8. Then area = ½ × 12 × 8 = 48 cm².",
  };
  var RETEST_WRONG = { a5: true }; // splitting shapes slips once in the re-test: a believable "next for Aarav"

  function rightOption(q) {
    var i = (q.options || []).findIndex(function (o) { return o.correct; });
    return { index: i, text: q.options[i].text };
  }
  /** First wrong mcq option matching the mix-up id (or any wrong option when mixupId is null/false). */
  function wrongOption(q, mixupId) {
    var opts = q.options || [];
    for (var i = 0; i < opts.length; i++) if (!opts[i].correct && (!mixupId || opts[i].mixup === mixupId)) return { index: i, opt: opts[i] };
    return null;
  }
  function wrongNumber(q, mixupId) {
    var list = q.wrongMixups || [];
    for (var i = 0; i < list.length; i++) if (!mixupId || list[i].mixup === mixupId) return list[i];
    return null;
  }
  function storyWrong(q, mixupId) {
    if (q.kind === "mcq") { var w = wrongOption(q, mixupId); return w && { correct: false, mixup: w.opt.mixup || null, answer: w.opt.text }; }
    var n = wrongNumber(q, mixupId); return n && { correct: false, mixup: n.mixup || null, answer: n.value };
  }

  /** The one question on this day that Aarav gets wrong in the story (or null). */
  function storyTarget(d, day) {
    var plan = STORY[d];
    if (!plan) return null;
    var qs = [];
    (day.steps || []).forEach(function (s) { if (s.type === plan.type) qs = qs.concat(s.questions || []); });
    if (plan.pick === "last") qs = qs.slice().reverse();
    for (var i = 0; i < qs.length; i++) if (storyWrong(qs[i], plan.mixup)) return { qid: qs[i].id, mixup: plan.mixup };
    return null;
  }

  /** Decide the story answer for one question. Returns {correct, mixup, answer}. */
  function storyAnswer(q, target) {
    if (target && q.id === target.qid) { var w = storyWrong(q, target.mixup); if (w) return w; }
    if (q.kind === "mcq") return { correct: true, mixup: null, answer: rightOption(q).text };
    return { correct: true, mixup: null, answer: q.answer };
  }

  function sureFor(day, correct, n) {
    if (!correct) return day <= 4;          // early: sure but wrong; later: knows when unsure
    return day >= 5 ? true : n % 3 !== 0;   // early rights are sometimes unsure
  }

  function playQuestions(day, step, target, counter) {
    var S = C.state;
    (step.questions || []).forEach(function (q) {
      var a = storyAnswer(q, target);
      counter.n++;
      S.recordAnswer({ day: day, stepId: step.id, qid: q.id, skill: q.skill, correct: a.correct, mixup: a.mixup,
        guards: q.guards, sure: step.type === "recall" ? undefined : sureFor(day, a.correct, counter.n), answer: a.answer });
      if (a.correct && step.type === "recall" && S.revisitsDue(day).indexOf(q.skill) !== -1) S.clearRevisit(q.skill);
    });
  }

  function playDay(d) {
    var S = C.state, day = C.data.days[d - 1];
    if (!day) return;
    var target = storyTarget(d, day), counter = { n: 0 };
    (day.steps || []).forEach(function (step) {
      switch (step.type) {
        case "recall": case "practice": case "exit":
          playQuestions(d, step, target, counter); break;
        case "adaptive":
          // Replay this student's story (profile.story), then right answers, using the pool in level order.
          (function () {
            var story = (C.data.profile && C.data.profile.story) || [];
            var level = (C.data.profile && C.data.profile.startLevel) || 1, streak = 0, used = {}, k = 0;
            for (var guard = 0; guard < (step.maxQuestions || 8); guard++) {
              var q = (step.pool || []).find(function (p) { return p.level === level && !used[p.id]; });
              if (!q) break;
              used[q.id] = true;
              var plan = story[k++] || { correct: true };
              var w = plan.correct ? null : storyWrong(q, plan.mixup || null);
              var correct = !w;
              S.recordAnswer({ day: d, stepId: step.id, qid: q.id, skill: step.skill, correct: correct, mixup: w ? w.mixup : null,
                guards: q.guards, sure: correct || d <= 4, answer: w ? w.answer : (q.kind === "mcq" ? rightOption(q).text : q.answer) });
              if (correct) { if (++streak === 2) { if (level === 3) break; level++; streak = 0; } }
              else { streak = 0; if (!w.mixup) level = Math.max(1, level - 1); }
            }
          })();
          break;
        case "animation":
          if (step.skill) S.markTaught(step.skill, d); break;
        case "worked":
          if (step.skill) { S.markTaught(step.skill, d); S.recordAnswer({ day: d, stepId: step.id, qid: step.id + "-yourturn", skill: step.skill, correct: true, answer: "(worked)" }); }
          break;
        case "try":
          if (step.q) S.recordAnswer({ day: d, stepId: step.id, qid: step.q.id, skill: step.skill || step.q.skill, correct: false, noMastery: true, answer: "(tried first)" });
          break;
        case "game":
          if (step.skill) { S.markTaught(step.skill, d); S.recordAnswer({ day: d, stepId: step.id, qid: step.id + "-game", skill: step.skill, correct: true, answer: "(game)" }); }
          break;
        case "fix":
          if (!S.shouldShowFix(d, step.mixup)) return; // skipped, like the real session
          if (step.check) S.recordAnswer({ day: d, stepId: step.id, qid: step.check.id, skill: step.check.skill, correct: true, guards: step.check.guards || [step.mixup], sure: true, answer: "(fixed)" });
          break;
        case "explain":
          var text = STORY_TEXT[step.saveAs || String(d)] ||
            ("Because " + (step.keyIdeas || []).map(function (g) { return g[0]; }).join(" and ") + " matter here.");
          S.recordExplain({ day: d, stepId: step.id, skill: step.skill, text: text, verdict: step.saveAs === "2" ? "close" : "strong", saveAs: step.saveAs });
          break;
      }
      S.completeStep(d, step.id);
    });
    S.completeDay(d);
  }

  function playRetest() {
    var S = C.state;
    (C.data.retest || []).forEach(function (q, i) {
      var wrong = RETEST_WRONG[q.skill];
      var a;
      if (wrong) {
        var w = q.kind === "mcq" ? wrongOption(q, false) : wrongNumber(q, false);
        a = { correct: false, mixup: w ? (w.opt ? w.opt.mixup : w.mixup) || null : null, answer: w ? (w.opt ? w.opt.text : w.value) : "?" };
      } else {
        a = q.kind === "mcq" ? { correct: true, answer: rightOption(q).text } : { correct: true, answer: q.answer };
      }
      S.recordRetest({ qid: q.id, skill: q.skill, correct: a.correct, sure: a.correct || i % 2 === 0 ? a.correct : false, answer: a.answer, mixup: a.mixup, guards: q.guards });
    });
    S.completeDay(10);
  }

  /** Reset, then replay the story up to (not including) `target` day. target 11 = through the re-test. */
  function jumpTo(target) {
    C.state.reset();
    for (var d = 1; d < Math.min(target, 10); d++) playDay(d);
    if (target >= 11) { playRetest(); C.router.go("#/growth"); return; }
    C.router.go(target === 10 ? "#/retest" : "#/day/" + target);
  }

  /* ---------- drawer UI ---------- */
  var open = false;
  /** Voice: every voice recorded by tools/record-narration.mjs (audio/voices.js). Lines a voice hasn't recorded use the default. */
  function voicePicker() {
    var sets = C.voiceSets || {}, ids = Object.keys(sets);
    if (ids.length < 2) return null;
    var pick = null;
    try { pick = window.localStorage.getItem("cogna-voice-set"); } catch (e) { /* ignore */ }
    if (!sets[pick]) pick = "sarvam-priya";
    return h("div", null,
      h("p", { class: "t-demo-label" }, "Voice"),
      h("div", { class: "t-demo-voices" }, ids.map(function (id) {
        var on = id === pick;
        return h("button", { class: on ? "btn btn-primary t-demo-wide" : "btn btn-ghost t-demo-wide", type: "button", "aria-pressed": String(on),
          on: { click: function () {
            try { window.localStorage.setItem("cogna-voice-set", id); } catch (e) { /* ignore */ }
            if (C.voice) C.voice.stop();
            build();
          } } }, sets[id].label);
      })));
  }
  function build() {
    var root = document.getElementById("demo-root");
    if (!root) return;
    root.innerHTML = "";
    var dayBtns = [];
    for (var d = 1; d <= 10; d++) {
      (function (n) {
        dayBtns.push(h("button", { class: "t-demo-day", type: "button", title: "Replay Aarav's story up to Day " + n, on: { click: function () { jumpTo(n); toggle(false); } } }, String(n)));
      })(d);
    }
    var panel = h("div", { class: "t-demo-panel", id: "t-demo-panel", role: "dialog", "aria-label": "Demo controls", hidden: !open },
      h("p", { class: "eyebrow" }, "Demo controls"),
      h("p", { class: "t-demo-note" }, "Prototype: answers and AI feedback are scripted."),
      h("p", { class: "t-demo-label" }, "Student"),
      h("div", { class: "t-demo-links" }, Object.keys(C.data.students || {}).map(function (id) {
        var s = C.data.students[id], on = id === C.studentId;
        return h("button", { class: on ? "btn btn-primary t-demo-wide" : "btn btn-ghost t-demo-wide", type: "button", "aria-pressed": String(on),
          on: { click: function () { if (!on) C.switchStudent(id); } } }, s.name.split(" ")[0]);
      })),
      voicePicker(),
      h("p", { class: "t-demo-label" }, "Go to"),
      h("div", { class: "t-demo-links" },
        h("a", { href: "#/welcome", on: { click: function () { toggle(false); } } }, "Welcome"),
        h("a", { href: "#/report", on: { click: function () { toggle(false); } } }, "Report"),
        h("a", { href: "#/trail", on: { click: function () { toggle(false); } } }, "Trail")),
      h("p", { class: "t-demo-label" }, "Jump to a day (replays Aarav's story)"),
      h("div", { class: "t-demo-days" }, dayBtns),
      h("button", { class: "btn btn-ghost t-demo-wide", type: "button", on: { click: function () { jumpTo(11); toggle(false); } } }, "Jump to the growth report"),
      h("button", { class: "btn btn-ghost t-demo-wide", type: "button", on: { click: function () {
        if (C.session && C.session.autoAnswer) C.session.autoAnswer();
      } } }, "Auto-play this step"),
      h("button", { class: "btn btn-quiet t-demo-wide", type: "button", on: { click: function () { C.state.reset(); C.router.go("#/welcome"); toggle(false); } } }, "Reset progress")
    );
    var fab = h("button", { class: "btn btn-pill t-demo-fab", type: "button", "aria-expanded": String(open), "aria-controls": "t-demo-panel", on: { click: function () { toggle(); } } }, open ? "Close" : "Demo");
    root.appendChild(panel);
    root.appendChild(fab);
  }
  function toggle(force) { open = typeof force === "boolean" ? force : !open; build(); }

  C.demo = { jumpTo: jumpTo, playDay: playDay, playRetest: playRetest, toggle: toggle };
  document.addEventListener("DOMContentLoaded", build);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) toggle(false); });
})();
