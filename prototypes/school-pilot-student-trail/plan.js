/* Cogna prototype — the daily decider for the Area chapter (days 3–9).

   Each day's fixed steps (data/days.js) are the same for every student. This file looks at what the
   student has actually done so far and puts up to three made-for-you steps in front of them:

     1. Check-back  — a skill that became secure two days ago gets one cold question, before anything is
                      re-taught. Right: the check-back is cleared. Wrong: the skill drops a level
                      (state.js), which makes it a repair candidate tomorrow.
     2. Second look — a mix-up that has been seen and is not fixed yet, when today's questions can trigger
                      it. Shows the student's own wrong answer, the fix lesson, and one question.
                      Not repeated on the next day unless the mix-up showed up again in between, and never carried
                      into the day whose own lesson fixes it (FIXED_BY).
     3. Repair      — an earlier skill that is taught but not secure gets two questions before the new
                      lesson. A skill today builds on (NEEDS) goes first.

   The plan for a day is decided once, when the day is first opened, and saved (state.plan), so answers
   given during the day never reshuffle the steps under the student. What a day's answers change is
   TOMORROW's plan; the day-done screen shows that with preview().

   Questions come from the earlier days' own questions (never today's, never the day-10 re-test, which
   has to stay unseen). A check-back prefers a question the student has not been asked; a repair prefers
   one they got wrong. Nothing here is hardcoded per student. */
(function () {
  "use strict";
  var C = window.Cogna;
  var FIRST_DAY = 3, LAST_DAY = 9;

  /* What each Area skill builds on (ids from data/skills.js). */
  var NEEDS = {
    a2: ["a1", "quad"], a3: ["a2", "quad"], a4: ["a2", "a3"],
    a5: ["a1", "a3"], a6: ["a1"], a7: ["a3", "pyth"],
  };
  /* The skill whose lesson is the fix for each mix-up. On the day that lesson is first taught, the mix-up is not carried
     in as a "second look": the day's own lesson already is one (Day 3 used to open with the perimeter fix and then teach
     the same rope-and-squares idea again). */
  var FIXED_BY = { perim: "a1", slant: "a3", half: "a3", units: "a6" };

  function getDay(n) { return (C.data.days || []).filter(function (d) { return d.n === n; })[0] || null; }
  /** the first day whose own skills include this skill */
  function firstTaught(skill) {
    var days = (C.data.days || []).filter(function (d) { return (d.skills || []).indexOf(skill) !== -1; });
    return days.length ? Math.min.apply(null, days.map(function (d) { return d.n; })) : -1;
  }
  function skillInfo(id) { return (C.data.skills || []).filter(function (s) { return s.id === id; })[0] || null; }
  function skillName(id) { var s = skillInfo(id); return s ? s.name : id; }
  function mixupInfo(id) { return (C.data.mixups || []).filter(function (m) { return m.id === id; })[0] || null; }

  /* ---------- the question bank: every question in days 1–9, by id ---------- */
  var cache = null;
  /** Day-1 adaptive questions carry `themes` instead of a prompt: give them this student's wording. */
  function worded(q) {
    if (q.prompt || !q.themes) return q;
    var copy = {}; Object.keys(q).forEach(function (k) { copy[k] = q[k]; });
    var interest = C.data.profile && C.data.profile.interest;
    copy.prompt = q.themes[interest] || q.themes["default"] || "";
    return copy;
  }
  function stepQuestions(s) {
    var qs = (s.questions || []).concat(s.check ? [s.check] : []).concat(s.pool || []);
    return qs.concat(qs.filter(function (q) { return q && q.retry; }).map(function (q) { return q.retry; }));
  }
  function bank() {
    if (cache) return cache;
    var list = [], byId = {};
    (C.data.days || []).forEach(function (d) {
      if (d.n > LAST_DAY) return;
      (d.steps || []).forEach(function (s) {
        stepQuestions(s).forEach(function (q) {
          if (!q || !q.id || byId[q.id]) return;
          var w = worded(q);
          byId[q.id] = w; list.push({ q: w, day: d.n });
        });
      });
    });
    cache = { list: list, byId: byId };
    return cache;
  }
  function touches(q, mixupId) {
    if (!q) return false;
    if ((q.guards || []).indexOf(mixupId) !== -1) return true;
    if ((q.options || []).some(function (o) { return o.mixup === mixupId; })) return true;
    return (q.wrongMixups || []).some(function (w) { return w.mixup === mixupId; });
  }
  function correctText(q) {
    if (!q) return "";
    if (q.kind === "mcq") { var o = (q.options || []).filter(function (x) { return x.correct; })[0]; return o ? o.text : ""; }
    return String(q.answer) + (q.unit ? " " + q.unit : "");
  }

  /** The last time each question was asked: { qid: { day, correct } }. */
  function lastAsked(st) {
    var m = {};
    st.log.forEach(function (e) { if (e.qid) m[e.qid] = { day: e.day, correct: e.correct }; });
    return m;
  }
  /** Up to `count` questions from days before `day` that pass `pred`. mode 'fresh': unseen first, then the
      one asked longest ago. mode 'repair': last answered wrong first, then unseen, then longest ago. */
  function pick(pred, count, mode, day, used, asked) {
    var c = bank().list.filter(function (e) { return e.day < day && !used[e.q.id] && pred(e.q); }).map(function (e, i) {
      var a = asked[e.q.id], score;
      if (mode === "repair") score = a ? (a.correct ? 2 + a.day / 100 : 0) : 1;
      else score = a ? 1 + a.day / 100 : 0;
      return { q: e.q, score: score, i: i };
    });
    c.sort(function (x, y) { return x.score - y.score || x.i - y.i; });
    return c.slice(0, count).map(function (x) { used[x.q.id] = true; return x.q; });
  }

  /* ---------- deciding ---------- */
  function lastSeenDay(m) {
    var last = -1;
    Object.keys(m.byDay || {}).forEach(function (k) { if (m.byDay[k] > 0) last = Math.max(last, parseInt(k, 10)); });
    return last;
  }
  function lastCarried(st, mixupId, before) {
    var last = -1;
    Object.keys(st.plans || {}).forEach(function (k) {
      var p = st.plans[k], n = parseInt(k, 10);
      if (n < before && p && p.carry && p.carry.mixup === mixupId) last = Math.max(last, n);
    });
    return last;
  }

  /** Decide day n from the state as it is now. Returns a small serialisable record (ids only). */
  function compute(n) {
    var st = C.state.get(), d = getDay(n), rec = { v: 1, back: [], carry: null, repair: null };
    if (!d) return rec;
    var steps = d.steps || [], used = {}, asked = lastAsked(st);
    var todays = [];
    steps.forEach(function (s) { todays = todays.concat(stepQuestions(s)).concat(s.q ? [s.q] : []); });
    todays.forEach(function (q) { if (q && q.id) used[q.id] = true; });

    // 1. check-back: secure two days ago, and today's own recall doesn't already ask it
    var recalled = {};
    steps.forEach(function (s) { if (s.type === "recall") (s.questions || []).forEach(function (q) { recalled[q.skill] = true; }); });
    C.state.revisitsDue(n).forEach(function (skill) {
      if (rec.back.length >= 2 || recalled[skill]) return;
      var q = pick(function (x) { return x.skill === skill; }, 1, "fresh", n, used, asked)[0];
      if (q) rec.back.push({ skill: skill, qid: q.id, since: st.skills[skill].revisitDay - 2 });
    });

    // 2. second look: an open mix-up that today's questions can trigger
    var open = (C.data.mixups || []).map(function (mi) {
      var m = st.mixups[mi.id];
      if (!m || !m.seen || m.fixed || !mi.fixAnim) return null;
      if (FIXED_BY[mi.id] && firstTaught(FIXED_BY[mi.id]) === n) return null;   // today's own lesson fixes it
      var seenDay = lastSeenDay(m);
      if (seenDay < lastCarried(st, mi.id, n)) return null;   // already looked at, and not seen since
      var relevant = todays.some(function (q) { return touches(q, mi.id); }) || steps.some(function (s) { return s.type === "fix" && s.mixup === mi.id; });
      return relevant ? { id: mi.id, seenDay: seenDay, seen: m.seen } : null;
    }).filter(Boolean);
    open.sort(function (a, b) { return b.seenDay - a.seenDay || b.seen - a.seen; });
    if (open[0]) {
      var cq = pick(function (x) { return touches(x, open[0].id); }, 1, "repair", n, used, asked)[0];
      rec.carry = { mixup: open[0].id, seenDay: open[0].seenDay, seen: open[0].seen, qid: cq ? cq.id : null };
    }

    // 3. repair: an earlier skill that is taught but not secure; one that today builds on goes first
    var needs = {};
    (d.skills || []).forEach(function (s) { (NEEDS[s] || []).forEach(function (p) { needs[p] = true; }); });
    var minStep = Math.min.apply(null, (d.skills || []).map(function (s) { var i = skillInfo(s); return i && i.step ? i.step : 99; }).concat([99]));
    var weak = (C.data.skills || []).filter(function (s) {
      var cur = st.skills[s.id];
      if (!cur || cur.status === "secure" || cur.status === "untaught") return false;
      if ((d.skills || []).indexOf(s.id) !== -1) return false;
      return s.kind === "area" ? s.step < minStep : !!s.neededForArea;
    }).map(function (s) {
      var lastDay = 0;
      st.log.forEach(function (e) { if (e.skill === s.id) lastDay = Math.max(lastDay, e.day); });
      return { skill: s.id, status: st.skills[s.id].status, prereq: !!needs[s.id], lastDay: lastDay };
    });
    weak.sort(function (a, b) {
      return (b.prereq - a.prereq) || ((a.status === "missing" ? 0 : 1) - (b.status === "missing" ? 0 : 1)) || (b.lastDay - a.lastDay);
    });
    for (var i = 0; i < weak.length && !rec.repair; i++) {
      var w = weak[i], qs = pick(function (x) { return x.skill === w.skill; }, 2, "repair", n, used, asked);
      if (qs.length) rec.repair = { skill: w.skill, status: w.status, prereq: w.prereq, lastDay: w.lastDay, qids: qs.map(function (q) { return q.id; }) };
    }
    return rec;
  }

  /* ---------- turning a saved record into steps and plain-English reasons ---------- */
  function times(n) { return n === 1 ? "once" : n === 2 ? "twice" : n + " times"; }
  function build(rec) {
    var B = bank().byId, steps = [], why = [];
    if (!rec) return { steps: steps, why: why };

    var back = (rec.back || []).filter(function (b) { return B[b.qid]; });
    if (back.length) {
      var note = back.length === 1
        ? "You got " + skillName(back[0].skill) + " right twice on Day " + back[0].since + ". One question to see if it stuck."
        : "You got these right twice a couple of days ago: " + back.map(function (b) { return skillName(b.skill); }).join(" and ") + ". One question on each to see if they stuck.";
      steps.push({ id: "p-back", type: "recall", planned: "back", label: "Check-back", note: note, questions: back.map(function (b) { return B[b.qid]; }) });
      why.push("A check-back on " + back.map(function (b) { return skillName(b.skill); }).join(" and ") + ", to see if it stuck.");
    }

    if (rec.carry && mixupInfo(rec.carry.mixup)) {
      var mi = mixupInfo(rec.carry.mixup), c = rec.carry;
      var from = c.seenDay > 0 ? "Day " + c.seenDay : "your check-in";
      steps.push({
        id: "p-carry-" + c.mixup, type: "fix", carry: true, planned: "carry", mixup: c.mixup, anim: mi.fixAnim,
        label: "A second look", eyebrow: "From " + from,
        note: (c.seenDay > 0 ? "This came back on Day " + c.seenDay + "." : "This showed up " + times(c.seen) + " in your check-in and isn't fixed yet.") +
          " Today's questions can catch you the same way, so look at it first.",
        check: c.qid ? B[c.qid] : null,
      });
      why.push("A second look at a mix-up from " + from + ": " + mi.name.charAt(0).toLowerCase() + mi.name.slice(1) + ".");
    }

    if (rec.repair) {
      var r = rec.repair, qs = (r.qids || []).map(function (id) { return B[id]; }).filter(Boolean);
      if (qs.length) {
        var when = r.lastDay > 0 ? "at the end of Day " + r.lastDay : "in your check-in";
        var count = qs.length === 1 ? "One question" : "Two questions";
        steps.push({
          id: "p-repair-" + r.skill, type: "recall", planned: "repair", label: "Repair first",
          note: (r.prereq ? "Today builds on " + skillName(r.skill) + ", and it wasn't solid " + when + ". " : skillName(r.skill) + " wasn't solid " + when + ". ") +
            count + " to fix it before the new lesson.",
          questions: qs,
        });
        why.push(count + " to repair " + skillName(r.skill) + " before the new lesson.");
      }
    }
    return { steps: steps, why: why };
  }

  function inRange(n) { return n >= FIRST_DAY && n <= LAST_DAY; }
  function base(n) { var d = getDay(n); return (d && d.steps) || []; }

  C.plan = {
    FIRST_DAY: FIRST_DAY, LAST_DAY: LAST_DAY,

    /** The steps of day n for this student: made-for-you steps first, then the day's own.
        Decides and saves the plan the first time the day is opened; after that it never changes. */
    forDay: function (n) {
      var own = base(n);
      if (!inRange(n) || !own.length) return { steps: own, why: [], made: [] };
      var st = C.state.get(), rec = C.state.plan(n);
      if (!rec) {
        var started = (st.completedSteps[n] || []).length > 0;
        if (n > st.unlockedDay) return { steps: own, why: [], made: [] };             // not reachable yet: nothing to decide
        rec = (started || C.state.isDayDone(n)) ? { v: 1, back: [], carry: null, repair: null } : compute(n);
        C.state.setPlan(n, rec);
      }
      var b = build(rec);
      return { steps: b.steps.concat(own), why: b.why, made: b.steps };
    },

    /** What day n would get if it were decided right now. Saves nothing. */
    preview: function (n) {
      if (!inRange(n) || !base(n).length) return null;
      return build(C.state.plan(n) || compute(n)).why;
    },

    /** The student's own latest wrong answer that showed this mix-up, for the fix steps.
        -> { when, prompt, his, right } or null. */
    evidence: function (mixupId, day) {
      var st = C.state.get(), B = bank().byId;
      for (var i = st.log.length - 1; i >= 0; i--) {
        var e = st.log[i];
        if (e.mixup !== mixupId || e.correct || e.answer === null) continue;
        var q = B[e.qid];
        return { when: e.day === day ? "Just now" : "On Day " + e.day, prompt: q ? q.prompt : null,
          his: String(e.answer) + (q && q.kind === "number" && q.unit ? " " + q.unit : ""), right: correctText(q) };
      }
      var card = C.data.report && C.data.report.mixupCards && C.data.report.mixupCards[mixupId];
      var m = st.mixups[mixupId];
      if (card && m && m.byDay && m.byDay[0] > 0) return { when: "In your check-in", prompt: card.q, his: card.his, right: card.right };
      return null;
    },
  };
})();
