/* Agent B: #/trail, review, dayDone, growth. Uses helpers from Cogna.tui (screens/report.js). */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, T = C.tui;
  var icon = T.icon, meter = T.meter, skillName = T.skillName, getDay = T.getDay, statusOf = T.statusOf;

  function dayTitle(n) {
    if (n === 0) return "Check-in";
    if (n === 10) return "Check-in again";
    var d = getDay(n);
    return d ? d.title : "Coming soon";
  }
  function stateOf(n, st) {
    if (C.state.isDayDone(n)) return "done";
    if (n === st.unlockedDay) return "today";
    if (n < st.unlockedDay) return "today";
    return "locked";
  }

  /* ---------- meters panel ---------- */
  function metersPanel() {
    var open = false;
    var root = h("aside", { class: "panel t-meters", "data-open": "false", "aria-label": "Skill meters" });
    function row(id, st) {
      var sk = st.skills[id];
      var tone = sk ? sk.status : "untaught";
      var due = sk && sk.revisitDay !== null && sk.revisitDay <= st.unlockedDay && tone === "secure";
      return h("div", { class: "t-meter-row" },
        h("span", { class: "t-mname" }, skillName(id),
          due ? h("span", { class: "t-clock", title: "Quick recall due", role: "img", "aria-label": "Quick recall due" }, icon("clock", 14)) : null),
        meter(tone));
    }
    function draw() {
      var st = C.state.get();
      var skills = C.data.skills;
      var needed = skills.filter(function (k) { return k.neededForArea; });
      var area = skills.filter(function (k) { return k.kind === "area"; });
      root.setAttribute("data-open", String(open));
      root.innerHTML = "";
      root.appendChild(h("button", { type: "button", class: "t-meters-head", "aria-expanded": String(open),
        on: { click: function () { open = !open; draw(); } } },
        h("h2", null, "My skills"), h("span", { class: "t-chev" }, icon("chev"))));
      root.appendChild(h("div", { class: "t-meters-body" },
        h("p", { class: "eyebrow t-meters-group" }, "Before Area"),
        needed.map(function (k) { return row(k.id, st); }),
        h("p", { class: "eyebrow t-meters-group" }, "Area"),
        area.map(function (k) { return row(k.id, st); }),
        h("p", { class: "t-legend" }, icon("clock", 14), "Quick recall due")));
    }
    draw();
    var off = C.bus.on("state:changed", function () {
      if (!root.isConnected) { off(); return; }
      draw();
    });
    return root;
  }

  /* ---------- trail ---------- */
  C.screens.trail = function (el) {
    var st = C.state.get();
    var nodes = [];
    for (var n = 0; n <= 10; n++) nodes.push(n);
    var list = h("ol", { class: "t-daylist" }, nodes.map(function (n) {
      var state = stateOf(n, st);
      var d = getDay(n);
      var href = null;
      if (state === "done") href = n === 10 ? "#/growth" : (n === 0 ? "#/report" : "#/day/" + n + "/review");
      else if (state === "today") href = n === 10 ? "#/retest" : "#/day/" + n;
      var marker = state === "done" ? icon("check", 20) : (state === "locked" ? icon("lock", 16) : String(n));
      var label = n === 0 ? "Day 0" : "Day " + n;
      var chips = (d && d.skills ? d.skills : []).map(function (id) {
        return h("span", { class: "t-chip", "data-tone": statusOf(st.skills, id), title: skillName(id) }, skillName(id));
      });
      var body = [
        h("div", { class: "t-daytop" }, h("span", { class: "t-daylabel" }, label + (state === "today" ? " · today" : "")),
          state === "done" ? C.toneChip("secure", "Done") : null),
        h("p", { class: "t-daytitle" }, dayTitle(n)),
        d && d.summaryLine ? h("p", { class: "t-dayline" }, d.summaryLine) : null,
        n === 10 ? h("p", { class: "t-dayline" }, "Check in again and see how far you've come.") : null,
        n === 0 ? h("p", { class: "t-dayline" }, "Your first check-in. See the report.") : null,
        chips.length ? h("div", { class: "t-daychips" }, chips) : null,
        state === "today" ? h("span", { class: "t-go" }, n === 10 ? "Start check-in" : "Start Day " + n, icon("arrow")) : null,
        state === "done" ? h("span", { class: "t-go" }, n === 10 ? "See your growth" : (n === 0 ? "See report" : "Review"), icon("arrow")) : null,
      ];
      var cardEl = href ? h("a", { class: "t-daycard", href: href }, body) : h("div", { class: "t-daycard" }, body);
      return h("li", { class: "t-daynode", "data-state": state, "data-day": n, "aria-current": state === "today" ? "step" : null },
        h("span", { class: "t-marker" + (state === "today" ? " breathe" : "") }, marker), cardEl);
    }));
    el.appendChild(h("div", { class: "shell t-page" },
      h("header", { class: "t-trail-head phase-in" },
        h("p", { class: "eyebrow" }, "My 2 weeks"),
        h("h1", null, "Your trail to Area"),
        h("p", { class: "lead" }, "One day at a time. Finish a day to open the next.")),
      h("div", { class: "t-split" }, h("div", null, list), metersPanel())));
  };

  /* ---------- day done ---------- */
  function snapshotBefore(hist, n) {
    for (var k = n - 1; k >= 0; k--) if (hist[k]) return hist[k];
    return hist[0] || {};
  }
  /** What today's answers changed about the next day (plan.js). Null when the next day isn't a planned one. */
  function madeForYou(next) {
    var why = C.plan && C.plan.preview ? C.plan.preview(next) : null;
    if (!why) return null;
    return h("section", { class: "card rise t-plan-next", style: { "--i": 3 } },
      h("p", { class: "eyebrow" }, "Day " + next + ", made for you"),
      why.length
        ? h("div", null, h("p", { class: "muted", style: { margin: "0 0 var(--s-2)" } }, "Because of your answers so far, Day " + next + " starts with:"),
            h("ul", { class: "t-plan-list" }, why.map(function (w) { return h("li", null, w); })))
        : h("p", { class: "muted", style: { margin: 0 } }, "Nothing to repair or check back on. Day " + next + " goes straight into the new lesson."));
  }
  /** Every wrong turn of the day, in order: what was asked, what the student said, the right answer, and whether
      they got it right later the same day. Nothing is left out, including guesses inside lessons and weak explanations. */
  function rightOf(q, e) {
    if (e.right) return e.right;
    if (!q) return null;
    if (q.options) { var o = q.options.filter(function (x) { return x.correct; })[0]; return o ? (o.text || o.label) : null; }
    return q.answer == null ? null : String(q.answer) + (q.unit ? " " + q.unit : "");
  }
  function promptOf(q) {
    if (!q) return null;
    if (q.prompt) return q.prompt;
    if (q.themes) { var t = q.themes[(C.data.student || {}).theme] || q.themes[(C.data.student || {}).interest] || q.themes.default; return t; }
    return null;
  }
  function slipsCard(n, d) {
    var log = C.state.get().log.filter(function (e) { return e.day === n; });
    var slips = log.map(function (e, i) { return { e: e, i: i }; }).filter(function (x) { return !x.e.correct; });
    if (!slips.length) return h("section", { class: "card rise t-slips", style: { "--i": 2 } },
      h("h2", { class: "t-section-title" }, "Where you went wrong"),
      h("p", { class: "muted", style: { margin: 0 } }, log.length ? "Nowhere today. Every answer was right first time." : "Nothing was answered today."));
    var stillOpen = 0;
    var rows = slips.map(function (x) {
      var e = x.e, step = stepOf(d, e.stepId), q = findQuestion(d, e.qid);
      var after = log.slice(x.i + 1);
      var fixed = after.some(function (l) { return l.correct && l.qid === e.qid; });
      var nextRight = !fixed && after.some(function (l) { return l.correct && l.stepId === e.stepId && l.skill === e.skill; });
      var later = fixed || nextRight;
      if (!fixed) stillOpen++;
      var mix = e.mixup ? (C.data.mixups.filter(function (m) { return m.id === e.mixup; })[0]) : null;
      var right = rightOf(q, e);
      return h("li", { class: "t-slip" + (later ? " is-fixed" : "") },
        h("p", { class: "t-slip-where" }, (step && step.label) || STEP_LABEL[step && step.type] || (step && step.type === "adaptive" ? "Practice" : "Lesson")),
        h("p", { class: "t-slip-q" }, promptOf(q) || e.what || skillName(e.skill) || e.qid),
        h("p", { class: "t-slip-ans" }, h("span", null, "You said: "), h("b", null, answerText(e.answer)),
          right ? h("span", null, /^Wrong idea: /.test(right) ? " · Wrong idea: " : " · Right answer: ") : null, right ? h("b", null, right.replace(/^Wrong idea: /, "")) : null),
        mix ? h("p", { class: "t-slip-mix" }, "Mix-up: " + mix.name) : null,
        h("span", { class: "t-chip", "data-tone": fixed ? "secure" : nextRight ? "shaky" : "missing" }, fixed ? "Fixed on the next try" : nextRight ? "Got a similar one right after" : "Still to fix"));
    });
    return h("section", { class: "card rise t-slips", style: { "--i": 2 } },
      h("h2", { class: "t-section-title" }, "Where you went wrong"),
      h("p", { class: "muted", style: { margin: "0 0 var(--s-3)" } },
        slips.length + " wrong turn" + (slips.length === 1 ? "" : "s") + " today" +
        (stillOpen ? ", " + stillOpen + " not fixed on that question." : ", and you fixed every one.")),
      h("ol", { class: "t-slip-list" }, rows),
      h("a", { class: "btn btn-quiet", href: "#/day/" + n + "/review" }, "See every answer"));
  }
  /* ---------- "What moved today", for a parent or teacher ----------
     Read top to bottom: one sentence, four numbers, which skills changed and why, then the day answer by answer.
     The chart: one mark per answer in the order given, grouped by part of the day; height = how hard the question was
     (practice levels 1-3; everything else counts as level 1). Right = filled dot, wrong = hollow ring with a cross,
     so it never relies on colour alone. Hover or focus a mark for the question and the answer. A table holds the same. */
  function dayEvents(n, d) {
    return C.state.get().log.filter(function (e) { return e.day === n; }).map(function (e, i, all) {
      var step = stepOf(d, e.stepId), q = findQuestion(d, e.qid);
      var part = (step && step.label) || (step && step.type === "adaptive" ? "Practice" : STEP_LABEL[step && step.type]) || (step && step.type === "animation" ? "Lesson" : "Other");
      var fixed = !e.correct && all.slice(i + 1).some(function (l) { return l.correct && l.qid === e.qid; });
      return { e: e, part: part, level: (q && q.level) || 1, prompt: promptOf(q) || e.what || skillName(e.skill), right: rightOf(q, e), fixed: fixed };
    });
  }
  function whyMoved(ev, id, before, after) {
    var mine = ev.filter(function (x) { return x.e.skill === id && !x.e.noMastery; });
    var run = 0; for (var i = mine.length - 1; i >= 0 && mine[i].e.correct; i--) run++;
    var wrong = ev.filter(function (x) { return x.e.skill === id && !x.e.correct; }).length;
    var up = ["untaught", "missing", "shaky", "secure"].indexOf(after) > ["untaught", "missing", "shaky", "secure"].indexOf(before);
    if (up) return (run ? "Ended the day with " + run + " right in a row" : "More right than wrong at the end") +
      (wrong ? ", after " + wrong + " wrong turn" + (wrong === 1 ? "" : "s") + " earlier. Worth checking again in a few days." : ".");
    return wrong + " wrong answer" + (wrong === 1 ? "" : "s") + " on this today, so it slipped back. The next day starts by repairing it.";
  }
  function dayChart(ev) {
    var NS = "http://www.w3.org/2000/svg";
    function s(tag, a, parent) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); if (parent) parent.appendChild(e); return e; }
    var maxL = Math.max.apply(null, ev.map(function (x) { return x.level; }).concat([1]));
    var W = 640, left = 56, right = 12, top = 14, rowH = maxL > 1 ? 44 : 0, plotH = (maxL - 1) * rowH, H = top + plotH + 64;
    var step = (W - left - right) / ev.length;
    function X(i) { return left + step * (i + 0.5); }
    function Y(l) { return top + 12 + (maxL - l) * rowH; }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, class: "t-dc-svg", role: "img", "aria-label": "Every answer today in order, by difficulty: " + ev.filter(function (x) { return x.e.correct; }).length + " right and " + ev.filter(function (x) { return !x.e.correct; }).length + " wrong." });
    // parts of the day as bands, named underneath
    var groups = []; ev.forEach(function (x, i) { var g = groups[groups.length - 1]; if (!g || g.part !== x.part) groups.push(g = { part: x.part, a: i, b: i }); g.b = i; });
    groups.forEach(function (g, k) {
      var x0 = left + step * g.a, x1 = left + step * (g.b + 1);
      s("rect", { x: x0 + 1, y: top, width: x1 - x0 - 2, height: plotH + 24, rx: 6, class: "t-dc-band" + (k % 2 ? " is-alt" : "") }, svg);
      var t = s("text", { x: (x0 + x1) / 2, y: top + plotH + 44, class: "t-dc-part", "text-anchor": "middle" }, svg);
      t.textContent = (x1 - x0) < 60 && g.part.length > 6 ? g.part.slice(0, 5) + "…" : g.part;
    });
    // level guides
    if (maxL > 1) for (var l = 1; l <= maxL; l++) {
      s("line", { x1: left, x2: W - right, y1: Y(l), y2: Y(l), class: "t-dc-grid" }, svg);
      var lt = s("text", { x: left - 8, y: Y(l) + 4, class: "t-dc-axis", "text-anchor": "end" }, svg); lt.textContent = "Level " + l;
    }
    // the path through the day
    s("polyline", { points: ev.map(function (x, i) { return X(i).toFixed(1) + "," + Y(x.level); }).join(" "), class: "t-dc-path" }, svg);
    var tip = h("div", { class: "t-dc-tip", role: "status", hidden: true });
    ev.forEach(function (x, i) {
      var g = s("g", { class: "t-dc-mark " + (x.e.correct ? "is-right" : "is-wrong"), tabindex: "0", role: "img",
        "aria-label": "Answer " + (i + 1) + ", " + x.part + ": " + (x.e.correct ? "right" : "wrong") + ". " + x.prompt }, svg);
      s("circle", { cx: X(i), cy: Y(x.level), r: 16, class: "t-dc-hit" }, g);
      if (x.e.correct) s("circle", { cx: X(i), cy: Y(x.level), r: 6.5, class: "t-dc-dot" }, g);
      else {
        s("circle", { cx: X(i), cy: Y(x.level), r: 6.5, class: "t-dc-ring" }, g);
        s("path", { d: "M" + (X(i) - 3) + "," + (Y(x.level) - 3) + "l6,6m0,-6l-6,6", class: "t-dc-x" }, g);
      }
      function show() {
        tip.innerHTML = "";
        tip.appendChild(h("p", { class: "t-dc-tip-h" }, "Answer " + (i + 1) + " · " + x.part + (x.level > 1 ? " · level " + x.level : "")));
        tip.appendChild(h("p", null, x.prompt));
        tip.appendChild(h("p", { class: "t-dc-tip-a" }, (x.e.correct ? "Right: " : "Said ") + answerText(x.e.answer) + (!x.e.correct && x.right ? " · right answer " + x.right : "")));
        tip.hidden = false;
        var box = svg.getBoundingClientRect(), k = box.width / W;
        tip.style.left = Math.min(Math.max(X(i) * k - 120, 0), box.width - 240) + "px";
        tip.style.top = (Y(x.level) * k + 18) + "px";
      }
      function hide() { tip.hidden = true; }
      g.addEventListener("pointerenter", show); g.addEventListener("pointerleave", hide);
      g.addEventListener("focus", show); g.addEventListener("blur", hide);
    });
    var legend = h("div", { class: "t-dc-legend" },
      h("span", null, h("i", { class: "t-dc-key is-right" }), "Right"),
      h("span", null, h("i", { class: "t-dc-key is-wrong" }), "Wrong"),
      maxL > 1 ? h("span", { class: "muted" }, "Higher = harder question") : null);
    return h("figure", { class: "t-dc" },
      h("figcaption", { class: "t-dc-title" }, "The day, answer by answer"),
      legend, h("div", { class: "t-dc-plot" }, svg, tip));
  }
  function dayTable(ev) {
    return h("details", { class: "t-dc-table" }, h("summary", null, "See it as a table"),
      h("table", null,
        h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, "Part"), h("th", null, "Question"), h("th", null, "Answer"), h("th", null, "Result"))),
        h("tbody", null, ev.map(function (x, i) {
          return h("tr", null, h("td", null, String(i + 1)), h("td", null, x.part + (x.level > 1 ? " (L" + x.level + ")" : "")), h("td", null, x.prompt),
            h("td", null, answerText(x.e.answer)), h("td", null, x.e.correct ? "Right" : x.fixed ? "Wrong, fixed" : "Wrong" + (x.right ? " (" + x.right + ")" : "")));
        }))));
  }
  function movedCard(n, d, rows, moved) {
    var ev = dayEvents(n, d), st = C.state.get();
    var first = (C.data.student && C.data.student.name ? String(C.data.student.name).split(" ")[0] : "They");
    var right = ev.filter(function (x) { return x.e.correct; }).length, wrong = ev.length - right;
    var fixed = ev.filter(function (x) { return x.fixed; }).length;
    var after = st.history[n] || st.skills, before = snapshotBefore(st.history, n);
    var lead = !ev.length ? "Nothing was answered today."
      : first + " gave " + ev.length + " answers today. " + right + " were right" +
        (wrong ? " and " + wrong + " went wrong" + (fixed ? ", " + fixed + " of them put right on the next try." : ".") : ", with no wrong turns.");
    var kpis = h("div", { class: "t-kpis" }, [
      ["Answers", ev.length, ""], ["Right", right, "is-good"], ["Wrong turns", wrong, wrong ? "is-bad" : ""], ["Still to fix", wrong - fixed, wrong - fixed ? "is-bad" : ""],
    ].map(function (k) { return h("div", { class: "t-kpi " + k[2] }, h("span", { class: "t-kpi-n" }, String(k[1])), h("span", { class: "t-kpi-l" }, k[0])); }));
    rows.forEach(function (r, i) {
      var id = moved[i];
      r.querySelector(".t-mv-name").parentNode.appendChild(h("p", { class: "t-mv-why" }, whyMoved(ev, id, statusOf(before, id), statusOf(after, id))));
    });
    return h("section", { class: "card rise t-moved-card", style: { "--i": 1 } },
      h("h2", { class: "t-section-title" }, "What moved today"),
      h("p", { class: "t-moved-lead" }, lead),
      ev.length ? kpis : null,
      rows.length ? h("div", { class: "t-moved" }, rows)
        : h("p", { class: "muted", style: { margin: 0 } }, "No skill changed level today. Practice first, then the meters move. That's normal."),
      ev.length ? dayChart(ev) : null,
      ev.length ? dayTable(ev) : null);
  }
  C.screens.dayDone = function (el, params) {
    var n = params.day, st = C.state.get(), d = getDay(n);
    var after = st.history[n] || st.skills;
    var before = snapshotBefore(st.history, n);
    var moved = Object.keys(after).filter(function (id) { return statusOf(before, id) !== statusOf(after, id); });
    var rows = moved.map(function (id) {
      var m = meter(statusOf(before, id));
      var chipSlot = h("span", null, C.toneChip(statusOf(before, id)));
      var o = statusOf(before, id), nw = statusOf(after, id);
      setTimeout(function () {
        if (!m.isConnected) return;
        m.setAttribute("data-tone", nw);
        m.setAttribute("aria-label", (C.toneChip(nw).textContent || nw));
        chipSlot.innerHTML = "";
        chipSlot.appendChild(C.toneChip(nw));
      }, 500);
      return h("div", { class: "t-mv" },
        h("div", null, h("div", { class: "t-mv-name" }, skillName(id)),
          h("div", { class: "t-mv-flow" }, C.toneChip(o), h("span", { class: "t-arrow" }, icon("arrow", 14)), chipSlot)),
        m);
    });
    var rao = (C.data.student.teacherShort || "Ms. Rao");
    el.appendChild(h("div", { class: "shell-narrow t-page stack-4" },
      h("header", { class: "phase-in" },
        h("p", { class: "eyebrow" }, "Day " + n + " done"),
        h("h1", { style: { fontSize: "var(--text-xl)", marginTop: "var(--s-1)" } }, d ? d.title : "Nice work"),
        d && d.summaryLine ? h("p", { class: "lead" }, d.summaryLine) : null),
      movedCard(n, d, rows, moved),
      slipsCard(n, d),
      d && d.teacherNote ? h("section", { class: "card rise", style: { "--i": 2 } },
        h("div", { class: "t-teacher" }, h("span", { class: "t-avatar", "aria-hidden": "true" }, "KR"),
          h("div", null, h("p", { class: "eyebrow" }, "A note from " + rao), h("blockquote", null, d.teacherNote)))) : null,
      d && d.tomorrow ? h("div", { class: "t-tomorrow rise", style: { "--i": 3 } }, h("p", { class: "eyebrow" }, "Tomorrow"), h("p", null, d.tomorrow)) : null,
      madeForYou(n + 1),
      h("div", { class: "t-cta rise", style: { "--i": 4 } }, h("a", { class: "btn btn-primary btn-lg", href: "#/trail" }, "Back to trail"))));
  };

  /* ---------- review (read-only) ---------- */
  /** A day's steps as this student got them: made-for-you steps (plan.js) and the day's own. */
  function daySteps(day) { return C.plan ? C.plan.forDay(day.n).steps : (day.steps || []); }
  function findQuestion(day, qid) {
    if (!day) return null;
    var found = null;
    daySteps(day).forEach(function (s) {
      var qs = (s.questions || []).concat(s.pool || []).concat(s.q ? [s.q] : []).concat(s.check ? [s.check] : []);
      qs = qs.concat(qs.filter(function (q) { return q && q.retry; }).map(function (q) { return q.retry; }));   // a replay's fresh question
      qs.forEach(function (q) { if (q && q.id === qid) found = q; });
    });
    return found;
  }
  function stepOf(day, id) {
    return day ? daySteps(day).filter(function (s) { return s.id === id; })[0] : null;
  }
  var STEP_LABEL = { recall: "Quick recall", practice: "Practice", exit: "Exit check", try: "Try first", game: "Game", fix: "Fix the mix-up", explain: "In your words", worked: "Worked example", rive: "Area Lab" };
  function answerText(a) {
    if (a === null || a === undefined || a === "") return "(no answer saved)";
    return String(a);
  }

  C.screens.review = function (el, params) {
    var n = params.day, st = C.state.get(), d = getDay(n);
    var entries = st.log.filter(function (e) { return e.day === n; });
    var order = [], groups = {};
    entries.forEach(function (e) {
      if (!groups[e.stepId]) { groups[e.stepId] = []; order.push(e.stepId); }
      groups[e.stepId].push(e);
    });
    var right = entries.filter(function (e) { return e.correct; }).length;
    var body = order.map(function (sid) {
      var step = stepOf(d, sid);
      var title = (step && step.label) || STEP_LABEL[step && step.type] || "Step " + sid;
      return h("section", { class: "t-rvstep" },
        h("h3", null, title),
        groups[sid].map(function (e) {
          var q = findQuestion(d, e.qid);
          var mix = e.mixup ? (C.data.mixups.filter(function (m) { return m.id === e.mixup; })[0]) : null;
          return h("div", { class: "t-rvrow " + (e.correct ? "t-right" : "t-wrong") },
            h("span", { class: "t-rvmark" }, icon(e.correct ? "check" : "x", 14)),
            h("div", null,
              h("p", { class: "t-rvq" }, q ? q.prompt : (skillName(e.skill) || e.qid)),
              h("p", { class: "t-rvans" }, "Your answer: " + answerText(e.answer) + (e.sure === true ? " · sure" : (e.sure === false ? " · not sure" : ""))),
              mix ? h("p", { class: "t-rvtag" }, "A mix-up we've seen: " + mix.name) : null));
        }));
    });
    el.appendChild(h("div", { class: "shell-narrow t-page stack-4" },
      h("header", { class: "phase-in" },
        h("p", { class: "eyebrow" }, "Day " + n + " · review"),
        h("h1", { style: { fontSize: "var(--text-xl)", marginTop: "var(--s-1)" } }, dayTitle(n)),
        h("p", { class: "lead" }, entries.length ? right + " of " + entries.length + " answers right. This is a read-only replay." : "Nothing was answered on this day.")),
      h("section", { class: "card rise" }, body.length ? body : h("p", { class: "muted", style: { margin: 0 } }, "No saved answers for this day yet.")),
      h("div", { class: "t-row t-cta" },
        h("a", { class: "btn btn-primary", href: "#/day/" + n + "/done" }, "What moved that day"),
        h("a", { class: "btn btn-ghost", href: "#/trail" }, "Back to trail"))));
  };

  /* ---------- growth ---------- */
  var FALLBACK_EXPLAIN = {
    "2": "(No written answer was saved on Day 2 in this run.)",
    "9": "(No written answer was saved on Day 9 in this run.)",
  };
  function growthMixups(st) {
    var retest = C.data.retest || [];
    return C.data.mixups.filter(function (m) { return m.day0Seen > 0; }).map(function (m) {
      var guarded = retest.filter(function (q) { return (q.guards || []).indexOf(m.id) !== -1; });
      var rt = st.retest || {};
      var hits = Object.keys(rt).filter(function (qid) { return rt[qid].mixup === m.id; }).length;
      var after;
      if (guarded.length) {
        after = hits + " of " + guarded.length;
      } else {
        var after2 = st.log.filter(function (e) { return e.day >= 1 && e.mixup === m.id; }).length;
        after = after2 + " in the 2 weeks";
      }
      return { m: m, before: m.day0Seen + " of " + m.day0Of, after: after };
    });
  }
  function confAfter(st) {
    var c = st.confidence || [];
    if (!c.length) return null;
    var last = Math.max.apply(null, c.map(function (x) { return x.day; }));
    var g = { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0 };
    c.filter(function (x) { return x.day >= last - 1; }).forEach(function (x) {
      g[(x.sure ? "sure" : "unsure") + (x.correct ? "Right" : "Wrong")]++;
    });
    return g;
  }

  C.screens.growth = function (el) {
    var st = C.state.get(), R = C.data.report;
    var before = st.history[0] || {};
    var after = st.history[10] || st.skills;
    var skills = C.data.skills;
    var shown = skills.filter(function (k) { return k.neededForArea || k.kind === "area"; });
    var nSecureBefore = shown.filter(function (k) { return statusOf(before, k.id) === "secure"; }).length;
    var nSecureAfter = shown.filter(function (k) { return statusOf(after, k.id) === "secure"; }).length;

    var page = h("div", { class: "shell t-page stack-4" });
    page.appendChild(h("header", { class: "t-report-head phase-in" },
      h("p", { class: "eyebrow" }, "Day 0 and Day 10"),
      h("h1", null, "How far Aarav has come"),
      h("p", { class: "lead" }, "Skills secure on the Area path:"),
      h("p", { class: "t-big" }, h("span", { class: "t-from" }, nSecureBefore + " of " + shown.length), h("span", { class: "t-arrow" }, icon("arrow", 24)), h("span", { class: "t-to" }, nSecureAfter + " of " + shown.length))));

    // meters
    var c1 = h("section", { class: "card t-section rise", style: { "--i": 1 } },
      h("h2", { class: "t-section-title" }, "Skill by skill"),
      shown.map(function (k) {
        var b = statusOf(before, k.id), a = statusOf(after, k.id);
        return h("div", { class: "t-grow-meter" },
          h("div", { class: "t-gm-name" }, k.name, h("small", null, k.kind === "area" ? "Area" : "Before Area")),
          h("div", { class: "t-gm-flow" }, meter(b), h("span", { class: "t-arrow" }, icon("arrow", 14)), meter(a), C.toneChip(a)));
      }));
    page.appendChild(c1);

    // mix-ups
    var mx = growthMixups(st);
    page.appendChild(h("section", { class: "card t-section rise", style: { "--i": 2 } },
      h("h2", { class: "t-section-title" }, "Mix-ups"),
      mx.map(function (r) {
        var fixed = st.mixups[r.m.id] && st.mixups[r.m.id].fixed;
        return h("div", { class: "t-grow-meter" },
          h("div", { class: "t-gm-name" }, r.m.name, fixed ? h("small", null, "Now fixed: two right answers in a row where it could have shown up") : null),
          h("div", { class: "t-big", style: { fontSize: "var(--text-lg)" } }, h("span", { class: "t-from" }, r.before), h("span", { class: "t-arrow" }, icon("arrow", 16)), h("span", { class: "t-to" }, r.after)));
      })));

    // confidence
    var ca = confAfter(st);
    page.appendChild(h("section", { class: "card t-section rise", style: { "--i": 3 } },
      h("h2", { class: "t-section-title" }, "Knowing what he knows"),
      h("div", { class: "t-two" },
        h("div", null, h("p", { class: "t-ba-label" }, "Day 0"), T.confGrid(R.confidenceGrid)),
        h("div", null, h("p", { class: "t-ba-label" }, "Last two days"),
          ca ? T.confGrid(ca) : h("p", { class: "muted" }, "Not enough answers yet to compare.")))));

    // explanations
    function expl(key, label) {
      var t = st.explains && st.explains[key];
      return h("div", null, h("p", { class: "t-ba-label" }, label),
        h("p", { class: "t-expl" + (t ? "" : " is-fallback") }, t ? "“" + t + "”" : FALLBACK_EXPLAIN[key]));
    }
    page.appendChild(h("section", { class: "card t-section rise", style: { "--i": 4 } },
      h("h2", { class: "t-section-title" }, "In his own words"),
      h("div", { class: "t-two" }, expl("2", "Day 2: what makes a line the height?"), expl("9", "Day 9: how did you find the hidden height?"))));

    // the crew: the seven friends from the Area lessons, together (Rive module, lesson 98; see CAST_AND_STORIES.md)
    if (C.lab && C.lab.mount) {
      var crewStage = h("div", { class: "t-lab-stage" });
      page.appendChild(h("section", { class: "card t-section rise", style: { "--i": 4 } },
        h("p", { class: "eyebrow" }, "Your Area crew"),
        h("h2", { class: "t-section-title" }, "Seven friends, seven problems, all solved with you"),
        crewStage));
      var crew = C.lab.mount(crewStage, { lesson: 98 });
      var offCrew = C.bus.on("route:changed", function () { offCrew(); try { crew.destroy(); } catch (e) { /* ignore */ } });
    }

    // next
    var notSecure = skills.filter(function (k) { return (k.neededForArea || k.kind === "area") && statusOf(after, k.id) !== "secure"; });
    var c6 = h("section", { class: "card t-section rise", style: { "--i": 5 } },
      h("p", { class: "eyebrow" }, "Next for Aarav"),
      h("h2", { class: "t-section-title" }, notSecure.length ? "A few skills to keep practising" : "Everything on the path is secure"),
      notSecure.length ? h("div", { class: "t-next" }, notSecure.map(function (k) {
        return h("div", { class: "t-next-item" }, h("span", null, k.name), C.toneChip(statusOf(after, k.id)));
      })) : h("p", { class: "muted", style: { margin: 0 } }, "Ms. Rao can move on to the next topic."),
      h("div", { class: "t-row t-cta" },
        h("a", { class: "btn btn-primary", href: "#/trail" }, "Back to trail"),
        h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { C.state.reset(); C.router.go("#/welcome"); } } }, "Restart demo")));
    page.appendChild(c6);
    el.appendChild(page);
  };
})();
