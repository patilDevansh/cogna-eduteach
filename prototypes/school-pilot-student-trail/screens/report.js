/* Agent B: #/welcome and #/report. Shared helpers are exposed on Cogna.tui for trail.js. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, svg = C.svg;

  /* ---------- shared helpers ---------- */
  function icon(name, size) {
    var s = size || 16;
    var a = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" };
    if (name === "check") return svg("svg", a, svg("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
    if (name === "chev") return svg("svg", a, svg("path", { d: "M6 9l6 6 6-6" }));
    if (name === "arrow") return svg("svg", a, svg("path", { d: "M5 12h14M13 6l6 6-6 6" }));
    if (name === "lock") return svg("svg", a, svg("rect", { x: 5, y: 11, width: 14, height: 9, rx: 2 }), svg("path", { d: "M8 11V8a4 4 0 018 0v3" }));
    if (name === "clock") return svg("svg", a, svg("circle", { cx: 12, cy: 12, r: 8.5 }), svg("path", { d: "M12 7.5V12l3 2" }));
    if (name === "x") return svg("svg", a, svg("path", { d: "M6 6l12 12M18 6L6 18" }));
    return svg("svg", a);
  }
  function skillName(id) {
    var s = (C.data.skills || []).filter(function (k) { return k.id === id; })[0];
    return s ? s.name : id;
  }
  function meter(tone) {
    return h("span", { class: "t-meter", "data-tone": tone, role: "img", "aria-label": C.TONES[tone] ? C.TONES[tone].label : tone }, h("i"), h("i"), h("i"));
  }
  function dots(n, cls) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(h("i"));
    return h("span", { class: cls || "t-cdots", "aria-hidden": "true" }, out);
  }
  function getDay(n) {
    return ((C.data.days || []).filter(function (d) { return d.n === n; })[0]) || null;
  }
  function statusOf(snap, id) {
    var s = snap && snap[id];
    return s ? s.status : "untaught";
  }
  C.tui = { icon: icon, skillName: skillName, meter: meter, dots: dots, getDay: getDay, statusOf: statusOf };

  /* ---------- welcome ---------- */
  C.screens.welcome = function (el) {
    var s = C.data.student;
    el.appendChild(h("section", { class: "shell-narrow t-welcome phase-in" },
      h("p", { class: "eyebrow" }, "Check-in complete"),
      h("h1", null, "Hi " + s.name.split(" ")[0]),
      h("p", { class: "lead" }, "Your check-in is done. Here's what we found."),
      h("a", { class: "btn btn-primary btn-lg", href: "#/report" }, "See my report")
    ));
  };

  /* ---------- report ---------- */
  function card(title, eyebrow, i) {
    var c = h("section", { class: "card t-section rise", style: { "--i": i || 0 } });
    if (eyebrow) c.appendChild(h("p", { class: "eyebrow" }, eyebrow));
    if (title) c.appendChild(h("h2", { class: "t-section-title" }, title));
    return c;
  }

  function skillCard(sk, R, uid) {
    var tone = sk.day0;
    var open = false;
    var rows = (R.testAnswers && R.testAnswers[sk.id]) || [];
    var panelId = "ev-" + uid;
    var panel = h("div", { class: "t-evidence", id: panelId, hidden: true },
      h("p", { class: "t-evsummary" }, sk.evidence || ""),
      rows.map(function (r) {
        var ok = String(r.his).toLowerCase() === String(r.right).toLowerCase();
        return h("div", { class: "t-qa" },
          h("p", { class: "math" }, r.q),
          h("dl", null,
            h("dt", null, "His answer"), h("dd", { class: ok ? "is-right" : "is-wrong" }, r.his),
            h("dt", null, "Right answer"), h("dd", { class: "is-right" }, r.right)),
          h("p", { class: "t-tells" }, h("b", null, "What it tells us: "), r.tells));
      })
    );
    var btn = h("button", { type: "button", class: "t-skillbtn", "aria-expanded": "false", "aria-controls": panelId,
      on: { click: function () {
        open = !open;
        btn.setAttribute("aria-expanded", String(open));
        if (open) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
      } } },
      h("span", { class: "t-skillname" }, sk.name),
      h("span", { class: "t-skillrt" }, C.toneChip(tone), h("span", { class: "t-chev" }, icon("chev")))
    );
    return h("div", { class: "t-skillcard", "data-tone": tone }, btn, panel);
  }

  function pathNode(sk) {
    var tone = sk.day0;
    return h("div", { class: "t-pnode", "data-tone": tone },
      h("span", { class: "t-pdot" }, tone === "secure" ? icon("check", 14) : null),
      h("span", { class: "t-pname" }, sk.name),
      tone === "secure" ? h("span", { class: "t-tone-label", "data-tone": "secure" }, "Ready") :
        h("span", { class: "t-pfix" }, "Fixed on Day " + sk.fixDay)
    );
  }

  function mixCard(m, R) {
    var mc = (R.mixupCards || {})[m.id];
    var seen = m.day0Seen, of = m.day0Of;
    var d = [];
    for (var i = 0; i < of; i++) d.push(h("i", { class: i < seen ? "" : "is-off" }));
    var left = h("div", null,
      of ? h("span", { class: "t-seen" }, h("span", { class: "t-dots", "aria-hidden": "true" }, d), "Seen in " + seen + " of " + of + " questions") : h("span", { class: "t-seen" }, "Not seen yet"),
      h("h3", null, m.name),
      h("p", { class: "muted", style: { margin: 0 } }, m.plain),
      mc ? h("p", { class: "t-hisq" }, h("span", { class: "math", style: { fontSize: "inherit" } }, mc.q), h("br"),
        "You answered ", h("b", { class: "is-wrong" }, mc.his), ". Right answer: ", h("b", { class: "is-right" }, mc.right), ".") : null,
      m.whyNotSlip ? h("p", { class: "t-notslip" }, h("b", null, "Why it's a mix-up, not a slip: "), m.whyNotSlip) : null
    );
    var kids = [left];
    if (mc && mc.figure) {
      var f = typeof mc.figure === "string" ? C.fromHTML(mc.figure) : mc.figure;
      if (f) { f.classList && f.classList.add("t-figure"); kids.push(h("div", null, f)); }
    }
    return h("article", { class: "panel t-mixcard" }, kids);
  }

  function confGrid(g) {
    function cell(kind, n, label) {
      return h("div", { class: "t-cell", "data-kind": kind }, h("b", null, String(n)), h("span", { class: "t-cl" }, label), dots(n));
    }
    return h("div", { class: "t-conf", role: "group", "aria-label": "Confidence compared with correctness" },
      h("span"), h("span", { class: "t-axis" }, "Right"), h("span", { class: "t-axis" }, "Wrong"),
      h("span", { class: "t-axis is-row" }, "Sure"), cell("good", g.sureRight, "Sure and right"), cell("risk", g.sureWrong, "Sure but wrong"),
      h("span", { class: "t-axis is-row" }, "Not sure"), cell("", g.unsureRight, "Not sure, but right"), cell("", g.unsureWrong, "Not sure, wrong")
    );
  }
  C.tui.confGrid = confGrid;

  C.screens.report = function (el) {
    var s = C.data.student, R = C.data.report, skills = C.data.skills;
    var prior = skills.filter(function (k) { return k.kind === "prior"; });
    var needed = prior.filter(function (k) { return k.neededForArea; });
    var page = h("div", { class: "shell t-page stack-4" });

    page.appendChild(h("header", { class: "t-report-head phase-in" },
      h("p", { class: "eyebrow" }, "Check-in report"),
      h("h1", null, s.name.split(" ")[0] + "'s check-in"),
      h("p", { class: "t-who-line" }, s.name + " · " + s.grade + " · " + s.school)));

    // 1. headline
    var c1 = card(null, null, 0);
    c1.appendChild(h("div", { class: "t-headline" }, R.headline.map(function (t) { return h("p", null, t); })));
    c1.appendChild(h("div", { class: "t-count" },
      h("span", null, R.questionsAnswered + " questions answered"), h("span", null, R.minutes + " minutes")));
    page.appendChild(c1);

    // 2. everything since June
    var c2 = card("Everything since June", "What the test found", 1);
    c2.appendChild(h("p", { class: "muted", style: { margin: "0 0 var(--s-4)" } }, "Tap a skill to see your actual answers."));
    c2.appendChild(h("div", { class: "t-skillgrid" }, prior.map(function (sk, i) { return skillCard(sk, R, i); })));
    page.appendChild(c2);

    // 3. ready for Area
    var c3 = card("Ready for Area?", "Five skills Area builds on", 2);
    var nFix = needed.filter(function (k) { return k.day0 !== "secure"; }).length;
    c3.appendChild(h("p", { class: "muted", style: { margin: 0 } }, (needed.length - nFix) + " of " + needed.length + " are ready. The other " + nFix + " get a quick fix in the first two days."));
    c3.appendChild(h("div", { class: "t-path" }, needed.map(pathNode),
      h("p", { class: "t-pgoal" }, "Then: Area, " + (s.topic ? "step by step" : ""))));
    page.appendChild(c3);

    // 4. mix-ups
    var seenMix = C.data.mixups.filter(function (m) { return m.day0Seen > 0; });
    var c4 = card("Mix-ups we spotted", "Not mistakes, patterns", 3);
    c4.appendChild(h("div", { class: "t-mixgrid" }, seenMix.map(function (m) { return mixCard(m, R); })));
    page.appendChild(c4);

    // 5. how you think
    var c5 = card("How you think", "Sure or not sure, and how fast", 4);
    c5.appendChild(h("p", { class: "muted", style: { margin: "0 0 var(--s-4)" } }, "Each dot is one answer. Being sure but wrong is the one to watch."));
    c5.appendChild(confGrid(R.confidenceGrid));
    c5.appendChild(h("div", { class: "t-time" },
      h("span", null, "His average", h("br"), h("b", null, R.avgSec + " s"), " per question"),
      h("span", null, "Class average", h("br"), h("b", null, R.classAvgSec + " s"), " per question")));
    if (R.quote) c5.appendChild(h("div", { class: "t-quote" },
      h("p", { class: "t-qq" }, R.quote.q), h("p", null, "“" + R.quote.a + "”")));
    page.appendChild(c5);

    // 6. two weeks
    var c6 = card("Your 2 weeks", "What happens next", 5);
    var strip = [];
    for (var i = 1; i <= 10; i++) strip.push(h("i", { class: i <= 2 ? "is-bridge" : (i === 10 ? "is-check" : "is-area"), title: "Day " + i }));
    c6.appendChild(h("div", { class: "t-dayrow", "aria-hidden": "true" }, strip));
    c6.appendChild(h("div", { class: "t-plan" }, (R.plan || []).map(function (p) {
      return h("div", { class: "t-plan-item" }, h("b", null, p.days), h("span", null, p.what));
    })));
    c6.appendChild(h("a", { class: "btn btn-primary btn-lg t-cta", href: "#/trail" }, "See your trail"));
    page.appendChild(c6);

    el.appendChild(page);
  };
})();
