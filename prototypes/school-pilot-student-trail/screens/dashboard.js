/* Dashboard: #/dashboard/parent and #/dashboard/teacher. Two views of the same 2-week trail.

   Parent (one child, phone first), in the order the product owner set: is the work done -> what's next ->
   ready for Area (check-in vs now) -> where they're stuck -> Area so far. Never marks, ranks or time-in-app.

   Teacher (class of 32), two columns: who needs you now (the headline) and today's completion on the left; the
   class skill map and the class's mix-ups on the right; growth since the check-in across the bottom.
   The prototype has one real student. The other 31 are sample pupils made from a fixed seed, so the page looks
   the same on every load; the real student sits in the class with their own answers and is marked "you".

   Skill states use Cogna's status colours, and every mark also carries a glyph and a label (✕ needs work,
   ~ shaky, ✓ secure, dashed = not taught yet), so colour is never the only signal. Every chart has a hover/focus
   tooltip and a "See it as a table" view. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, svg = C.svg;

  var ORDER = ["untaught", "missing", "shaky", "secure"];
  var GLYPH = { missing: "✕", shaky: "~", secure: "✓", untaught: "" };
  var LABEL = { untaught: "Not taught yet", missing: "Needs work", shaky: "Shaky", secure: "Secure" };
  var TAUGHT_ON = { a1: 3, a2: 3, a3: 4, a4: 6, a5: 7, a6: 8, a7: 9 };   // the trail day each Area step is first taught

  function skills() { return C.data.skills || []; }
  function needed() { return skills().filter(function (s) { return s.neededForArea; }); }
  function areaSteps() { return skills().filter(function (s) { return s.kind === "area"; }); }
  function mixups() { return C.data.mixups || []; }
  function dayOf(n) { return (C.data.days || []).filter(function (d) { return d.n === n; })[0]; }
  function first(name) { return String(name || "").split(" ")[0]; }
  function rank(s) { return ORDER.indexOf(s); }
  function shortName(s) {
    var map = { sq: "Squares", quad: "Heights", pyth: "Pythagoras", rect: "Rectangles", alg: "Algebra" };
    return map[s.id] || (s.kind === "area" ? "Area " + s.step : s.name);
  }

  /* ---------------------------------------------------------------- the real student */
  function realStudent() {
    var st = C.state.get(), s = C.data.student || {};
    var log = st.log || [];
    function dayState(n) {
      if ((st.completedDays || []).indexOf(n) !== -1) return "done";
      if (n > st.unlockedDay) return "locked";
      if ((st.completedSteps[n] || []).length) return "started";
      return "open";
    }
    var now = {}, before = {};
    skills().forEach(function (k) { now[k.id] = (st.skills[k.id] || {}).status || k.day0; before[k.id] = ((st.history[0] || {})[k.id] || {}).status || k.day0; });
    // open mix-ups during the trail, and how often they came up
    var open = mixups().filter(function (m) { var v = st.mixups[m.id]; return v && v.seen > 0 && !v.fixed; }).map(function (m) {
      var trail = log.filter(function (e) { return e.day >= 1 && e.mixup === m.id && !e.correct; }).length;
      return { id: m.id, name: m.name, times: trail || (st.mixups[m.id].seen || 0), trail: trail };
    });
    var fixed = mixups().filter(function (m) { var v = st.mixups[m.id]; return v && v.seen > 0 && v.fixed; }).map(function (m) { return { id: m.id, name: m.name }; });
    var wrongIdeas = log.filter(function (e) { return e.right && /^Wrong idea: /.test(e.right); }).map(function (e) { return { day: e.day, idea: e.right.replace(/^Wrong idea: /, "") }; });
    return {
      name: s.name, real: true, unlocked: st.unlockedDay, dayState: dayState,
      done: (st.completedDays || []).filter(function (n) { return n >= 1; }).length,
      now: now, before: before, open: open, fixed: fixed, wrongIdeas: wrongIdeas,
    };
  }

  /* ---------------------------------------------------------------- the sample class (fixed seed) */
  var NAMES = ["Meena Iyer", "Kabir Khan", "Ananya Das", "Arjun Reddy", "Fatima Sheikh", "Tenzin Norbu", "Ishaan Gupta", "Lalremruati Pachuau",
    "Sahil Verma", "Priya Nair", "Harpreet Kaur", "Aditya Rao", "Zoya Mirza", "Nikhil Patil", "Sneha Kulkarni", "Rohan Bose", "Kavya Menon",
    "Imran Qureshi", "Diya Joshi", "Vikram Singh", "Ayesha Siddiqui", "Joel D'Souza", "Pooja Yadav", "Karan Malhotra", "Nandini Hegde",
    "Siddharth Jain", "Mahika Chauhan", "Dev Bhattacharya", "Tanvi Desai", "Ritika Oraon", "Yash Thakur", "Riya Sharma", "Aarav Mehta"];
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, weights) { var x = r(), acc = 0, k; for (k in weights) { acc += weights[k]; if (x < acc) return k; } return k; }
  function better(r, s, steps) {   // a few days of teaching moves a state up, sometimes not all the way
    var i = rank(s);
    for (var k = 0; k < steps; k++) if (i < 3 && r() < 0.78) i++;
    return ORDER[Math.max(1, i)];
  }

  /** The class on trail day `day` (1-10): 31 sample pupils + the real student. */
  function classOn(day, me) {
    var r = rng(8 * 1000 + 32), out = [];
    NAMES.filter(function (n) { return n !== me.name; }).slice(0, 31).forEach(function (name, i) {
      var p = { name: name, real: false, now: {}, before: {}, open: [], wrongIdeas: [] };
      var pace = r();   // most keep up, a few fall a day behind
      var at = Math.max(1, Math.min(10, day - (pace < 0.07 ? 1 : 0)));
      p.reached = at;
      p.todayState = at < day ? "behind" : pick(r, { done: 0.68, started: 0.2, open: 0.12 });
      var daysDone = at - 1 + (p.todayState === "done" ? 1 : 0);
      needed().forEach(function (k) {
        var b = pick(r, k.id === "pyth" ? { missing: 0.5, shaky: 0.3, secure: 0.2 } : k.id === "quad" ? { missing: 0.3, shaky: 0.45, secure: 0.25 } : { missing: 0.08, shaky: 0.22, secure: 0.7 });
        p.before[k.id] = b;
        var fixDay = k.fixDay || 0;
        p.now[k.id] = fixDay && daysDone >= fixDay ? better(r, b, 2 + Math.min(2, Math.floor((daysDone - fixDay) / 3))) : (daysDone >= 2 ? better(r, b, 1) : b);
      });
      areaSteps().forEach(function (k) {
        p.before[k.id] = "untaught";
        var t = TAUGHT_ON[k.id];
        if (daysDone < t) p.now[k.id] = "untaught";
        else p.now[k.id] = better(r, "missing", Math.min(3, daysDone - t + 1));
      });
      // open mix-ups, tied to the skills still weak
      var heights = rank(p.now.quad) < 3 || ["a2", "a3", "a4"].some(function (a) { return p.now[a] === "missing"; });
      if (heights && r() < 0.3) p.open.push({ id: "slant", times: 1 + Math.floor(r() * r() * 4) });
      if (rank(p.now.pyth) < 3 && r() < 0.35) p.open.push({ id: r() < 0.6 ? "addsides" : "noroot", times: 1 + Math.floor(r() * r() * 3) });
      if (daysDone >= 6 && r() < 0.2) p.open.push({ id: "perim", times: 2 });
      p.open.forEach(function (o) { var m = mixups().filter(function (x) { return x.id === o.id; })[0]; o.name = m ? m.name : o.id; });
      if (r() < 0.1 && daysDone >= 2) p.wrongIdeas.push({ day: Math.max(1, daysDone), idea: ["the longest side is always the base", "height is the slanted side", "area is the distance round"][Math.floor(r() * 3)] });
      out.push(p);
    });
    // the real student, seen on the same class day
    var meDone = me.done;
    out.push({ name: me.name, real: true, now: me.now, before: me.before, open: me.open.filter(function (o) { return o.trail > 0; }).map(function (o) { return { id: o.id, name: o.name, times: o.trail }; }),
      wrongIdeas: me.wrongIdeas, reached: Math.min(me.unlocked, 10),
      todayState: me.unlocked < day ? "behind" : (me.dayState(day) === "done" ? "done" : me.dayState(day) === "started" ? "started" : me.dayState(day) === "locked" ? "behind" : "open"),
      daysDone: meDone });
    return out;
  }

  /** Why the teacher is needed, most urgent first. */
  function needsYou(cls, day) {
    var out = [];
    cls.forEach(function (p) {
      var rs = [];
      p.open.filter(function (o) { return o.times >= 2; }).forEach(function (o) { rs.push({ w: 3 + o.times, text: o.name.toLowerCase() + ", " + o.times + " times" }); });
      if (p.todayState === "behind") rs.push({ w: 4, text: "hasn't finished Day " + (day - 1) });
      p.wrongIdeas.forEach(function (w) { rs.push({ w: 2, text: "explained a wrong idea: “" + w.idea + "”" }); });
      var stuck = needed().filter(function (k) { return p.now[k.id] === "missing" && k.fixDay && day > k.fixDay + 1; });
      stuck.forEach(function (k) { rs.push({ w: 3, text: "still needs work on " + k.name + " after the Day " + k.fixDay + " bridge" }); });
      if (rs.length) { rs.sort(function (a, b) { return b.w - a.w; }); out.push({ p: p, reasons: rs, w: rs.reduce(function (s, x) { return s + x.w; }, 0) }); }
    });
    return out.sort(function (a, b) { return b.w - a.w; });
  }

  /* ---------------------------------------------------------------- shared bits */
  function tipHost() { return h("div", { class: "db-tip", role: "status", hidden: true }); }
  /** Show a tooltip in `tip` near `target` inside `box`. lines: [[strong, soft], ...] — text only. */
  function showTip(tip, box, target, lines) {
    tip.textContent = "";
    lines.forEach(function (l, i) {
      var row = h("p", { class: i ? "db-tip-row" : "db-tip-head" });
      if (l[0]) row.appendChild(h("b", null, String(l[0])));
      if (l[1]) row.appendChild(document.createTextNode((l[0] ? " " : "") + String(l[1])));
      tip.appendChild(row);
    });
    tip.hidden = false;
    var b = box.getBoundingClientRect(), t = target.getBoundingClientRect();
    var x = t.left - b.left + t.width / 2, y = t.bottom - b.top + 8;
    var w = tip.offsetWidth || 220;
    tip.style.left = Math.max(0, Math.min(b.width - w, x - w / 2)) + "px";
    tip.style.top = y + "px";
  }
  function hoverable(el, tip, box, lines) {
    el.setAttribute("tabindex", "0");
    function on() { showTip(tip, box, el, typeof lines === "function" ? lines() : lines); }
    function off() { tip.hidden = true; }
    el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on); el.addEventListener("blur", off);
  }
  function tableView(head, rows, label) {
    return h("details", { class: "db-table" }, h("summary", null, label || "See it as a table"),
      h("div", { class: "db-table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, head.map(function (c) { return h("th", { scope: "col" }, c); }))),
        h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c, i) { return i ? h("td", null, c) : h("th", { scope: "row" }, c); })); })))));
  }
  function state(tone, small) {
    return h("span", { class: "db-state" + (small ? " is-small" : ""), "data-tone": tone },
      h("i", { class: "db-swatch", "data-tone": tone, "aria-hidden": "true" }, GLYPH[tone]), LABEL[tone]);
  }
  function legend(tones) {
    return h("div", { class: "db-legend" }, tones.map(function (t) { return state(t, true); }));
  }
  function section(cls, eyebrow, title, sub) {
    var s = h("section", { class: "card db-card " + (cls || "") });
    if (eyebrow) s.appendChild(h("p", { class: "eyebrow" }, eyebrow));
    if (title) s.appendChild(h("h2", { class: "db-title" }, title));
    if (sub) s.appendChild(h("p", { class: "db-sub" }, sub));
    return s;
  }

  /* ---------------------------------------------------------------- parent view */
  function parentView(root) {
    var me = realStudent(), nm = first(me.name);
    var trailDays = []; for (var n = 1; n <= 10; n++) trailDays.push(n);
    var states = trailDays.map(function (n) { return me.dayState(n); });
    var doneN = states.filter(function (s) { return s === "done"; }).length;
    var nextN = trailDays.filter(function (n, i) { return states[i] === "open" || states[i] === "started"; })[0];
    var next = nextN ? dayOf(nextN) : null;

    // 1. is the work done?
    var s1 = section("db-work", "Is the work done?", null);
    var headline = doneN === 10 ? nm + " has finished all 10 days."
      : nextN && states[nextN - 1] === "started" ? nm + " started Day " + nextN + " but hasn't finished it."
      : doneN === 0 ? nm + " hasn't started the trail yet."
      : nm + " is up to date: " + doneN + " of 10 days done.";
    s1.appendChild(h("p", { class: "db-hero" }, headline));
    var box = h("div", { class: "db-plot" }), tip = tipHost();
    var row = h("ol", { class: "db-days", "aria-label": "The 10 days of the trail" });
    var DL = { done: "Done", started: "Started", open: "Open now", locked: "Not open yet" };
    trailDays.forEach(function (n, i) {
      var d = dayOf(n), s = states[i];
      var li = h("li", { class: "db-day", "data-state": s, "aria-label": "Day " + n + ": " + DL[s] + (d ? ", " + d.title : "") },
        h("span", { class: "db-day-mark", "aria-hidden": "true" }, s === "done" ? "✓" : String(n)),
        h("span", { class: "db-day-n" }, n === 10 ? "Check" : "Day " + n));
      hoverable(li, tip, box, [["Day " + n, d ? d.title : ""], [DL[s], ""]]);
      row.appendChild(li);
    });
    box.appendChild(row); box.appendChild(tip);
    s1.appendChild(box);
    s1.appendChild(h("div", { class: "db-legend" },
      h("span", { class: "db-key", "data-state": "done" }, "Done"), h("span", { class: "db-key", "data-state": "started" }, "Started"),
      h("span", { class: "db-key", "data-state": "open" }, "Open now"), h("span", { class: "db-key", "data-state": "locked" }, "Not open yet")));

    // 2. what's next
    var s2 = section("db-next", "What's next", null);
    if (next) {
      var mins = Math.round(((next.steps || []).length * 4 + 5) / 5) * 5;
      s2.appendChild(h("p", { class: "db-next-line" }, h("b", null, nextN === 10 ? "The final check" : "Day " + nextN + ": " + next.title)));
      s2.appendChild(h("p", { class: "db-sub" }, "About " + mins + " minutes. " + (states[nextN - 1] === "started" ? "Already started: pick up where " + nm + " left off." : "Open now in class.")));
      s2.appendChild(h("a", { class: "btn btn-ghost", href: "#/day/" + nextN }, nextN === 10 ? "Open the check" : "Open Day " + nextN));
    } else s2.appendChild(h("p", { class: "db-sub" }, "Nothing waiting. The trail is finished."));

    // 3. ready for Area: check-in -> now on the 4-step ladder
    var s3 = section("db-ready", "Ready for Area?", "The 5 skills Area builds on",
      "Where each one was at the check-in, and where it is now. A skill only counts as secure after two right answers in a row.");
    var box3 = h("div", { class: "db-plot" }), tip3 = tipHost();
    var ladder = h("div", { class: "db-ladder", role: "list" });
    ladder.appendChild(h("div", { class: "db-ladder-head", "aria-hidden": "true" }, h("span"),
      h("span", { class: "db-ladder-scale" }, ["missing", "shaky", "secure"].map(function (t) { return h("span", null, LABEL[t]); }))));
    needed().forEach(function (k) {
      var b = me.before[k.id], nw = me.now[k.id];
      var line = h("div", { class: "db-ladder-row", role: "listitem", "aria-label": k.name + ": " + LABEL[b] + " at the check-in, " + LABEL[nw] + " now" });
      line.appendChild(h("span", { class: "db-ladder-name" }, k.name));
      var track = h("span", { class: "db-ladder-track" });
      var bi = Math.max(1, rank(b)), ni = Math.max(1, rank(nw));
      var lo = Math.min(bi, ni), hi = Math.max(bi, ni);
      track.appendChild(h("i", { class: "db-ladder-span" + (ni < bi ? " is-down" : ""), style: { left: ((lo - 1) / 2 * 100) + "%", width: ((hi - lo) / 2 * 100) + "%" } }));
      if (bi !== ni) track.appendChild(h("i", { class: "db-ladder-dot is-before", style: { left: ((bi - 1) / 2 * 100) + "%" }, title: "" }));
      track.appendChild(h("i", { class: "db-ladder-dot", "data-tone": nw, style: { left: ((ni - 1) / 2 * 100) + "%" } }, GLYPH[nw]));
      line.appendChild(track);
      hoverable(line, tip3, box3, [[k.name, ""], ["Check-in:", LABEL[b]], ["Now:", LABEL[nw]]]);
      ladder.appendChild(line);
    });
    box3.appendChild(ladder); box3.appendChild(tip3);
    s3.appendChild(box3);
    s3.appendChild(h("div", { class: "db-legend" }, h("span", { class: "db-key-before" }, "At the check-in"), h("span", { class: "db-key-now" }, "Now")));
    s3.appendChild(tableView(["Skill", "At the check-in", "Now"], needed().map(function (k) { return [k.name, LABEL[me.before[k.id]], LABEL[me.now[k.id]]]; })));

    // 4. where they're stuck
    var s4 = section("db-stuck", "Where " + nm + " is stuck", null);
    var items = me.open.slice().sort(function (a, b) { return b.times - a.times; }).slice(0, 2).map(function (o) {
      return h("li", null, h("p", { class: "db-stuck-name" }, o.name), h("p", { class: "db-sub" }, "Came up " + o.times + (o.times === 1 ? " time" : " times") + ". Cogna is working on it in the next lessons."), C.toneChip("missing", "Still to fix"));
    });
    me.fixed.slice(0, Math.max(0, 2 - items.length)).forEach(function (f) {
      items.push(h("li", null, h("p", { class: "db-stuck-name" }, f.name), h("p", { class: "db-sub" }, "Right twice in a row since, so this one is fixed."), C.toneChip("secure", "Fixed")));
    });
    s4.appendChild(items.length ? h("ul", { class: "db-stuck-list" }, items) : h("p", { class: "db-sub" }, "Nothing open right now. " + nm + " has no mix-up waiting to be fixed."));
    if (me.done) s4.appendChild(h("a", { class: "btn-link", href: "#/day/" + Math.max(1, me.done) + "/done" }, "See " + nm + "'s answers from the last day"));

    // 5. Area so far
    var s5 = section("db-area", "Area so far", "The 7 steps of Area");
    s5.appendChild(h("ol", { class: "db-steps" }, areaSteps().map(function (k) {
      return h("li", null, h("span", { class: "db-step-n" }, String(k.step)), h("span", { class: "db-step-name" }, k.name), state(me.now[k.id], true));
    })));

    root.appendChild(h("div", { class: "db-parent" }, s1, s2, s3, s4, s5));
  }

  /* ---------------------------------------------------------------- teacher view */
  function teacherView(root, day) {
    var me = realStudent(), cls = classOn(day, me), N = cls.length;
    var nyn = needsYou(cls, day);

    // ---- left: who needs you now (headline) + today
    var sNeed = section("db-need", "Who needs you now", null);
    sNeed.appendChild(h("p", { class: "db-hero" }, nyn.length ? nyn.length + " of " + N + " students need you today" : "No one needs you right now"));
    sNeed.appendChild(h("p", { class: "db-sub" }, "Wrong on the same idea twice or more, behind on the trail, or a wrong idea in their own words."));
    sNeed.appendChild(h("ol", { class: "db-need-list" }, nyn.slice(0, 8).map(function (x) {
      return h("li", { class: x.p.real ? "is-you" : "" },
        h("span", { class: "db-need-name" }, x.p.name, x.p.real ? h("span", { class: "db-you" }, "your test student") : null),
        h("span", { class: "db-need-why" }, x.reasons.slice(0, 2).map(function (r) { return r.text; }).join("; ")));
    })));
    if (nyn.length > 8) sNeed.appendChild(tableView(["Student", "Why"], nyn.map(function (x) { return [x.p.name, x.reasons.map(function (r) { return r.text; }).join("; ")]; }), "All " + nyn.length + " students"));

    var sToday = section("db-today", "Today", "Day " + day + (dayOf(day) ? ": " + dayOf(day).title : ""));
    var cnt = { done: 0, started: 0, open: 0, behind: 0 };
    cls.forEach(function (p) { cnt[p.todayState]++; });
    var parts = [["done", "Finished"], ["started", "Started"], ["open", "Not started"], ["behind", "Behind"]].filter(function (x) { return cnt[x[0]]; });
    var box = h("div", { class: "db-plot" }), tip = tipHost();
    var bar = h("div", { class: "db-split", role: "img", "aria-label": parts.map(function (x) { return cnt[x[0]] + " " + x[1].toLowerCase(); }).join(", ") });
    parts.forEach(function (x) {
      var seg = h("span", { class: "db-seg", "data-part": x[0], style: { flexGrow: cnt[x[0]] } }, cnt[x[0]] >= 3 ? String(cnt[x[0]]) : "");
      var who = cls.filter(function (p) { return p.todayState === x[0]; }).map(function (p) { return first(p.name); });
      hoverable(seg, tip, box, [[String(cnt[x[0]]), x[1]], ["", who.length <= 6 ? who.join(", ") : who.slice(0, 6).join(", ") + " and " + (who.length - 6) + " more"]]);
      bar.appendChild(seg);
    });
    box.appendChild(bar); box.appendChild(tip);
    sToday.appendChild(h("p", { class: "db-big" }, cnt.done + " of " + N + " finished"));
    sToday.appendChild(box);
    sToday.appendChild(h("div", { class: "db-legend" }, parts.map(function (x) { return h("span", { class: "db-key", "data-part": x[0] }, x[1] + " " + cnt[x[0]]); })));
    var late = cls.filter(function (p) { return p.todayState === "open" || p.todayState === "behind"; });
    if (late.length) sToday.appendChild(h("p", { class: "db-sub" }, h("b", null, "Not started or behind: "), late.map(function (p) { return first(p.name); }).join(", ")));
    sToday.appendChild(tableView(["Student", "Today"], cls.map(function (p) { return [p.name + (p.real ? " (you)" : ""), { done: "Finished", started: "Started", open: "Not started", behind: "Behind (on Day " + p.reached + ")" }[p.todayState]]; })));

    // ---- right: class skill map (heatmap) + mix-ups (ranked bars)
    var cols = needed().concat(areaSteps());
    var sMap = section("db-map", "Class skill map", "Every student, every skill",
      "Sorted so the students who need most help are at the top. Hover a square for detail.");
    var sorted = cls.slice().sort(function (a, b) {
      function score(p) { return cols.reduce(function (s, k) { var v = p.now[k.id]; return s + (v === "missing" ? 3 : v === "shaky" ? 1 : 0); }, 0); }
      return score(b) - score(a);
    });
    var box2 = h("div", { class: "db-plot" }), tip2 = tipHost();
    var grid = h("div", { class: "db-heat", role: "grid", "aria-label": "Class skill map", style: { gridTemplateColumns: "minmax(7.5rem, 1.4fr) repeat(" + cols.length + ", minmax(18px, 1fr))" } });
    grid.appendChild(h("span", { class: "db-heat-corner", role: "columnheader" }, "Student"));
    cols.forEach(function (k, i) {
      grid.appendChild(h("span", { class: "db-heat-col" + (i === needed().length ? " is-split" : ""), role: "columnheader", title: k.name }, shortName(k)));
    });
    sorted.forEach(function (p) {
      grid.appendChild(h("span", { class: "db-heat-name" + (p.real ? " is-you" : ""), role: "rowheader" }, p.real ? p.name + " · you" : p.name));
      cols.forEach(function (k, i) {
        var v = p.now[k.id], b = p.before[k.id];
        var cell = h("span", { class: "db-cell" + (i === needed().length ? " is-split" : ""), "data-tone": v, role: "gridcell", "aria-label": p.name + ", " + k.name + ": " + LABEL[v] }, GLYPH[v]);
        hoverable(cell, tip2, box2, [[p.name, ""], [k.name, ""], ["Now:", LABEL[v]], k.kind === "area" ? ["", ""] : ["At the check-in:", LABEL[b]]].filter(function (l) { return l[0] || l[1]; }));
        grid.appendChild(cell);
      });
    });
    box2.appendChild(h("div", { class: "db-heat-scroll" }, grid)); box2.appendChild(tip2);
    sMap.appendChild(legend(["missing", "shaky", "secure", "untaught"]));
    sMap.appendChild(box2);
    sMap.appendChild(h("p", { class: "db-sub db-heat-note" }, "Left of the line: the 5 skills Area builds on. Right: the 7 steps of Area."));
    sMap.appendChild(tableView(["Student"].concat(cols.map(function (k) { return k.name; })), sorted.map(function (p) { return [p.name + (p.real ? " (you)" : "")].concat(cols.map(function (k) { return LABEL[p.now[k.id]]; })); })));

    var sMix = section("db-mix", "Mix-ups in the class", "Open mix-ups, by how many students have them",
      "Many students: reteach it to the whole class. A few: a small group.");
    var counts = mixups().map(function (m) {
      var who = cls.filter(function (p) { return p.open.some(function (o) { return o.id === m.id; }); });
      return { m: m, who: who };
    }).filter(function (x) { return x.who.length; }).sort(function (a, b) { return b.who.length - a.who.length; });
    var max = Math.max.apply(null, counts.map(function (x) { return x.who.length; }).concat([1]));
    var box4 = h("div", { class: "db-plot" }), tip4 = tipHost();
    var bars = h("div", { class: "db-bars" });
    counts.forEach(function (x) {
      var whole = x.who.length >= Math.ceil(N * 0.3);
      var b = h("div", { class: "db-bar-row" },
        h("span", { class: "db-bar-name" }, x.m.name),
        h("span", { class: "db-bar-track" }, h("i", { class: "db-bar", style: { width: (x.who.length / max * 100) + "%" } }), h("b", { class: "db-bar-val" }, String(x.who.length))),
        h("span", { class: "db-bar-act" }, whole ? "Reteach the whole class" : "Small group: " + x.who.slice(0, 4).map(function (p) { return first(p.name); }).join(", ") + (x.who.length > 4 ? " +" + (x.who.length - 4) : "")));
      hoverable(b, tip4, box4, [[String(x.who.length), "students: " + x.m.name], ["", x.who.map(function (p) { return first(p.name); }).join(", ")]]);
      bars.appendChild(b);
    });
    box4.appendChild(bars); box4.appendChild(tip4);
    sMix.appendChild(counts.length ? box4 : h("p", { class: "db-sub" }, "No open mix-ups in the class."));
    if (counts.length) sMix.appendChild(tableView(["Mix-up", "Students", "Who"], counts.map(function (x) { return [x.m.name, String(x.who.length), x.who.map(function (p) { return p.name; }).join(", ")]; })));

    // ---- across the bottom: growth since the check-in
    var sGrow = section("db-grow", "Growth since the check-in", "The 5 skills Area builds on, check-in against now",
      "Each bar is the whole class of " + N + ". This is the picture to show the school.");
    var readyBefore = cls.filter(function (p) { return needed().every(function (k) { return p.before[k.id] === "secure"; }); }).length;
    var readyNow = cls.filter(function (p) { return needed().every(function (k) { return p.now[k.id] === "secure"; }); }).length;
    sGrow.appendChild(h("p", { class: "db-big" }, "Ready for Area: " + readyBefore + " of " + N + " at the check-in, " + readyNow + " of " + N + " now"));
    var box5 = h("div", { class: "db-plot" }), tip5 = tipHost();
    var gl = h("div", { class: "db-grow-grid" });
    var growRows = [];
    needed().forEach(function (k) {
      gl.appendChild(h("span", { class: "db-grow-name" }, k.name));
      var pair = h("div", { class: "db-grow-pair" });
      [["before", "Check-in"], ["now", "Now"]].forEach(function (w) {
        var c = { missing: 0, shaky: 0, secure: 0 };
        cls.forEach(function (p) { var v = p[w[0]][k.id]; if (c[v] !== undefined) c[v]++; });
        growRows.push([k.name + " · " + w[1], String(c.missing), String(c.shaky), String(c.secure)]);
        var bar2 = h("div", { class: "db-stack", role: "img", "aria-label": k.name + ", " + w[1] + ": " + c.missing + " needs work, " + c.shaky + " shaky, " + c.secure + " secure" });
        ["missing", "shaky", "secure"].forEach(function (t) {
          if (!c[t]) return;
          var seg = h("span", { class: "db-stack-seg", "data-tone": t, style: { flexGrow: c[t] } }, c[t] >= 4 ? String(c[t]) : "");
          hoverable(seg, tip5, box5, [[String(c[t]), LABEL[t]], [k.name + ", " + w[1].toLowerCase(), ""]]);
          bar2.appendChild(seg);
        });
        pair.appendChild(h("div", { class: "db-grow-line" }, h("span", { class: "db-grow-when" }, w[1]), bar2));
      });
      gl.appendChild(pair);
    });
    box5.appendChild(gl); box5.appendChild(tip5);
    sGrow.appendChild(legend(["missing", "shaky", "secure"]));
    sGrow.appendChild(box5);
    sGrow.appendChild(tableView(["Skill", "Needs work", "Shaky", "Secure"], growRows));

    root.appendChild(h("div", { class: "db-teacher" },
      h("div", { class: "db-col" }, sNeed, sToday),
      h("div", { class: "db-col" }, sMap, sMix),
      h("div", { class: "db-wide" }, sGrow)));
  }

  /* ---------------------------------------------------------------- screen */
  C.screens.dashboard = function (el, params) {
    var view = params.view === "teacher" ? "teacher" : "parent";
    var me = realStudent();
    var day = Math.max(1, Math.min(10, params.day || me.unlocked || 1));
    var s = C.data.student || {};
    var tabs = h("nav", { class: "db-tabs", "aria-label": "Who is looking" },
      h("a", { href: "#/dashboard/parent", class: "db-tab" + (view === "parent" ? " is-on" : ""), "aria-current": view === "parent" ? "page" : null }, "Parent"),
      h("a", { href: "#/dashboard/teacher", class: "db-tab" + (view === "teacher" ? " is-on" : ""), "aria-current": view === "teacher" ? "page" : null }, "Teacher"));
    var head = h("header", { class: "db-head phase-in" },
      h("div", null,
        h("p", { class: "eyebrow" }, view === "parent" ? "For " + first(me.name) + "'s family" : "For " + (s.teacher || "the teacher") + " · " + (s.grade || "")),
        h("h1", null, view === "parent" ? first(me.name) + "'s 2 weeks" : "Class " + (s.grade || "") + ", Area trail"),
        h("p", { class: "db-sub" }, "Check-in, then Day 1 to Day 10. " + (view === "teacher" ? "" : "Updated after every session."))),
      tabs);
    var page = h("div", { class: "shell t-page db-page" + (view === "parent" ? " is-parent" : "") }, head);
    if (view === "teacher") {
      var sel = h("select", { class: "input db-day-select", "aria-label": "Class day" });
      for (var n = 1; n <= 10; n++) sel.appendChild(h("option", { value: String(n), selected: n === day ? "selected" : null }, n === 10 ? "Day 10 (final check)" : "Day " + n));
      sel.addEventListener("change", function () { window.location.hash = "#/dashboard/teacher/" + sel.value; });
      page.appendChild(h("div", { class: "db-filters" },
        h("label", { class: "db-filter" }, h("span", null, "Show the class on"), sel),
        h("p", { class: "db-sample" }, "Sample class: " + first(me.name) + " is real; the other 31 are made-up pupils for this prototype.")));
      teacherView(page, day);
    } else parentView(page);
    el.appendChild(page);
  };
})();
