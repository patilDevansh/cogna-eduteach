/* Cogna prototype — session player, step renderers, retest.
   OWNER: Agent C. Registers Cogna.screens.session, Cogna.screens.retest, Cogna.steps[type], Cogna.session.

   Player:  #/day/N  -> header, progress dots, one step in a .card on .grid-air, sticky Continue bar.
            Continue is disabled until the step calls ctx.complete(). Re-entering resumes at the
            first step not in state.completedSteps[N]. `fix` steps are skipped unless
            state.shouldShowFix(day, step.mixup) is true at the moment we reach them.
   Retest:  #/retest -> 12 questions from Cogna.data.retest, confidence required, no feedback,
            each answer -> state.recordRetest. "See my growth" -> completeDay(10) -> #/growth.

   Step renderer signature: Cogna.steps[type](el, step, ctx)
     ctx = { day, state, complete(), record(info), next(),
             onCleanup(fn)  // extra: run fn when the step is left (destroy controllers)
             setAuto(fn)    // extra: fn() fills + submits this step with right answers (may return a Promise) }

   Demo hooks (for the orchestrator's drawer):
     Cogna.session.autoAnswer()  -> Promise<boolean>. Fills and submits the CURRENT step of the live player
                                    (or the retest) with right answers: every question answered correctly and
                                    "Sure"; worked blanks filled; explain gets a strong answer built from the
                                    first keyword of each keyIdeas group (resolves after the 1.2 s "reading"
                                    pause); animation/game/teacher are simply marked done. Resolves true once
                                    the step has called ctx.complete(); false if no player is mounted.
     Cogna.session.advance()     -> clicks Continue if it is enabled (finish day / see growth on the last step).
     Cogna.session.isComplete()  -> boolean, whether Continue is currently enabled.
   A full auto-play of a day is:  autoAnswer().then(advance) repeated. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h;
  var current = null; // the live player: { el, cleanups[], auto, advance, isComplete }

  /* ------------------------------------------------------------------ helpers */
  function icon(kind) {
    var d = kind === "ok" ? "M5 12.5l4.5 4.5L19 7.5" : "M6 6l12 12M18 6L6 18";
    return C.svg("svg", { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: kind === "ok" ? "check-draw t-icon" : "t-icon" }, C.svg("path", { d: d }));
  }
  function hashStr(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function shuffled(arr, key) {
    var a = arr.slice(), seed = hashStr(key);
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /** First number in a string: "48", "48 cm²", "4.8", "1,000" -> number, or null. */
  function parseNum(s) {
    var m = String(s).replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?|-?\.\d+/);
    return m ? parseFloat(m[0]) : null;
  }
  function mixupInfo(id) { return (C.data.mixups || []).filter(function (m) { return m.id === id; })[0]; }
  function correctText(q) {
    if (q.kind === "mcq") { var o = (q.options || []).filter(function (x) { return x.correct; })[0]; return o ? o.text : ""; }
    return q.answer + (q.unit ? " " + q.unit : "");
  }
  function teacherName() {
    var t = (C.data.student && C.data.student.teacher) || "Ms. Rao";
    var parts = t.split(/\s+/);
    return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1] : t;
  }
  function runCleanups(list) { while (list.length) { try { list.pop()(); } catch (e) { console.error("[session] cleanup", e); } } }
  function destroyCurrent() { if (current) { runCleanups(current.cleanups); current = null; } }
  C.bus.on("route:changed", function () { if (current && !current.el.isConnected) destroyCurrent(); });

  function dots(n, label) {
    var box = h("div", { class: "progress-dots", role: "img", "aria-label": label || "" });
    function set(items, now) {
      box.innerHTML = "";
      items.forEach(function (done, i) { box.appendChild(h("span", { class: i === now ? "now" : (done ? "done" : "") })); });
    }
    return { el: box, set: set };
  }

  /* ------------------------------------------------------------------ one question */
  /* o: { needSure, feedback:'instant'|'none', tries, neutral, anything, reveal, checkLabel,
          reactions (a sound + a little pop or shake on every answer), replays (a wrong answer with `replay:` plays
          that mistake replay next, so its feedback stays short), record(info), onResult(res, final) } */
  function questionView(q, o) {
    var root = h("div", { class: "t-q" });
    var tries = o.tries || 1;
    var opts = q.kind === "mcq" ? shuffled(q.options || [], q.id) : null;
    var S = { pick: -1, sure: null, attempts: 0, locked: false, text: "", tried: {}, seenMixups: {} };
    var R = {}; // element refs
    var uid = "q-" + hashStr(q.id + Math.random());

    function hasAnswer() { return q.kind === "mcq" ? S.pick >= 0 : S.text.trim() !== ""; }
    function ready() { return hasAnswer() && (!o.needSure || S.sure !== null); }
    function refresh() {
      R.check.disabled = S.locked || !ready();
      R.need.hidden = !(o.needSure && hasAnswer() && S.sure === null && !S.locked);
    }

    function evaluate() {
      if (q.kind === "mcq") {
        var p = opts[S.pick];
        return { correct: !!p.correct, mixup: p.correct ? null : (p.mixup || null), why: p.correct ? null : (p.why || null), answer: p.text,
          replay: p.correct ? null : (p.replay || null) };
      }
      var v = parseNum(S.text);
      if (v === null) return o.anything ? { correct: false, mixup: null, why: null, answer: S.text.trim() } : { invalid: true };
      var res = { correct: Math.abs(v - q.answer) <= (q.tol || 0) + 1e-9, mixup: null, why: null, answer: S.text.trim(), replay: null };
      if (!res.correct) {
        (q.wrongMixups || []).some(function (w) {
          if (Math.abs(v - w.value) <= 1e-9) { res.mixup = w.mixup || null; res.why = w.why || null; res.replay = w.replay || null; return true; }
          return false;
        });
      }
      return res;
    }

    function selectOpt(i) {
      if (S.locked) return;
      S.pick = i;
      R.optBtns.forEach(function (b, j) { b.setAttribute("aria-checked", j === i ? "true" : "false"); b.classList.toggle("is-picked", j === i); });
      refresh();
    }
    function setSure(v) {
      if (S.locked) return;
      S.sure = v;
      R.sureBtns.forEach(function (b) { var on = (b.getAttribute("data-sure") === "1") === v; b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("is-selected", on); });
      refresh();
    }
    function setText(t) { if (S.locked) return; S.text = t; R.input.value = t; R.err.textContent = ""; refresh(); }

    function lock(res, final) {
      S.locked = true;
      if (R.optBtns) R.optBtns.forEach(function (b, j) {
        b.disabled = true;
        if (o.feedback === "instant" && !o.neutral) {
          if (j === S.pick) b.classList.add(res.correct ? "is-right" : "is-wrong");
          else if (final && !res.correct && opts[j].correct) b.classList.add("is-right");
        }
      });
      if (R.input) R.input.disabled = true;
      R.sureBtns.forEach(function (b) { b.disabled = true; });
      R.check.hidden = true; R.need.hidden = true;
      if (R.hintBtn) R.hintBtn.hidden = true;
    }

    function showFeedback(res, final) {
      var box = R.fb; box.innerHTML = "";
      if (o.neutral) {
        box.appendChild(h("div", { class: "feedback t-note settle" }, h("div", null,
          h("strong", null, res.correct ? "You already had it." : "Here's how it works"),
          o.reveal || q.explain || "")));
        return;
      }
      var body = h("div", null);
      if (res.correct) {
        body.appendChild(h("strong", null, "Right."));
        if (q.explain) body.appendChild(h("span", null, q.explain));
        box.appendChild(h("div", { class: "feedback feedback-correct t-right settle" }, icon("ok"), body));
        return;
      }
      body.appendChild(h("strong", null, final ? "Not quite." : "Not quite. Have another look."));
      if (final && o.replays && res.replay && C.anims[res.replay]) {
        // show, don't write: the replay below works through this exact answer, then a fresh question follows
        body.appendChild(h("span", { class: "t-fb-line" }, "Watch where " + res.answer + " comes from."));
        if (res.mixup) { var mi0 = mixupInfo(res.mixup); body.appendChild(h("span", { class: "t-fb-line t-mixup-line" }, "This is a mix-up we've seen before" + (mi0 ? ": " + mi0.name : "."))); }
        box.appendChild(h("div", { class: "feedback feedback-incorrect t-wrong settle" }, icon("x"), body));
        return;
      }
      // while a try is left, say nothing that gives the answer away: the `why` lines often work it out in full
      if (final && res.why) body.appendChild(h("span", { class: "t-fb-line" }, res.why));
      if (final && res.mixup) {
        var mi = mixupInfo(res.mixup);
        body.appendChild(h("span", { class: "t-fb-line t-mixup-line" }, "This is a mix-up we've seen before" + (mi ? ": " + mi.name : ".")));
      }
      if (final) {
        body.appendChild(h("span", { class: "t-fb-line" }, "The answer is " + correctText(q) + "."));
        if (q.explain) body.appendChild(h("span", { class: "t-fb-line" }, q.explain));
      } else {
        if (q.hint) body.appendChild(h("span", { class: "t-fb-line" }, "Hint: " + q.hint));
        body.appendChild(h("button", { type: "button", class: "btn btn-ghost t-retry", on: { click: function () { render(true); R.focus(); } } }, "Try again"));
      }
      box.appendChild(h("div", { class: "feedback feedback-incorrect t-wrong settle" }, icon("x"), body));
    }

    function check() {
      if (S.locked || !ready()) return;
      var res = evaluate();
      if (res.invalid) { R.err.textContent = "Type a number to answer."; R.input.focus(); return; }
      S.attempts++;
      // a wrong answer that has its own mistake replay goes straight to the replay, as before
      var final = res.correct || S.attempts >= tries || !!(o.replays && res.replay && C.anims[res.replay]);
      if (!res.correct && q.kind === "mcq") S.tried[S.pick] = true;
      // a second wrong try on the same question is logged, but it is one mistake, not two: it doesn't drop the
      // skill again or count the same mix-up twice
      var again = !res.correct && S.attempts > 1;
      var mix = res.mixup && S.seenMixups[res.mixup] ? null : res.mixup;
      if (res.mixup) S.seenMixups[res.mixup] = true;
      o.record({ qid: q.id, skill: q.skill, correct: res.correct, mixup: mix, guards: q.guards, sure: o.needSure ? S.sure : undefined, answer: res.answer, noMastery: again || undefined });
      lock(res, final);
      if (o.feedback === "instant") showFeedback(res, final);
      if (o.reactions && o.feedback === "instant" && !o.neutral) react(res.correct);
      o.onResult(res, final);
    }
    /** a sound and a little movement on every answer: a pop when right, a shake when not */
    function react(right) {
      root.classList.remove("is-right-now", "is-shake"); void root.offsetWidth;
      root.classList.add(right ? "is-right-now" : "is-shake");
      if (C.sfx) {
        if (right) { C.sfx.snap(); setTimeout(function () { C.sfx.chime(); }, 90); }
        else C.sfx.oops();
      }
    }

    function render(keepSure) {
      var sure = keepSure ? S.sure : null;
      S.pick = -1; S.text = ""; S.locked = false; S.sure = sure;
      root.innerHTML = "";
      root.appendChild(h("p", { class: "t-q-prompt", id: uid + "-p" }, q.prompt));
      if (q.figure) { var f = C.fromHTML(q.figure); if (f) root.appendChild(f); }

      if (q.kind === "mcq") {
        var grp = h("div", { class: "t-options", role: "radiogroup", "aria-labelledby": uid + "-p" });
        R.optBtns = opts.map(function (op, i) {
          var b = h("button", { type: "button", class: "t-opt", role: "radio", "aria-checked": "false", "aria-label": op.text, on: { click: function () { selectOpt(i); } } },
            h("span", { class: "t-opt-key", "aria-hidden": "true" }, String.fromCharCode(65 + i)), h("span", { class: "t-opt-text" }, op.text));
          if (S.tried[i]) { b.disabled = true; b.classList.add("is-wrong"); }   // already tried: stays crossed out
          grp.appendChild(b); return b;
        });
        root.appendChild(grp);
        R.input = null;
        R.focus = function () { R.optBtns[0].focus(); };
      } else {
        R.optBtns = null;
        R.input = h("input", { class: "input t-num-input", type: "text", inputmode: "decimal", autocomplete: "off", "aria-labelledby": uid + "-p", placeholder: "Your answer",
          on: { input: function (e) { S.text = e.target.value; R.err.textContent = ""; refresh(); }, keydown: function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } } } });
        root.appendChild(h("div", { class: "t-num" }, R.input, q.unit ? h("span", { class: "t-num-unit" }, q.unit) : null));
        R.focus = function () { R.input.focus(); };
      }
      R.err = h("p", { class: "t-q-err", role: "alert" });
      root.appendChild(R.err);

      R.sureBtns = [];
      if (o.needSure) {
        var cg = h("div", { class: "t-conf", role: "group", "aria-label": "How sure are you?" }, h("span", { class: "t-conf-label" }, "How sure are you?"));
        var row = h("div", { class: "t-conf-choices" });
        [[true, "Sure"], [false, "Not sure"]].forEach(function (pair) {
          var b = h("button", { type: "button", class: "t-conf-btn", "data-sure": pair[0] ? "1" : "0", "aria-pressed": "false", on: { click: function () { setSure(pair[0]); } } }, pair[1]);
          R.sureBtns.push(b); row.appendChild(b);
        });
        cg.appendChild(row); root.appendChild(cg);
      }

      R.hintBtn = null;
      if (q.hint && !o.neutral) {
        var hintP = h("p", { class: "t-hint", hidden: true }, "Hint: " + q.hint);
        R.hintBtn = h("button", { type: "button", class: "btn-link t-hint-btn", on: { click: function () { hintP.hidden = !hintP.hidden; R.hintBtn.textContent = hintP.hidden ? "Show a hint" : "Hide the hint"; } } }, "Show a hint");
        root.appendChild(R.hintBtn); root.appendChild(hintP);
      }

      R.need = h("p", { class: "t-need", hidden: true }, "Pick Sure or Not sure to check your answer.");
      R.check = h("button", { type: "button", class: "btn btn-primary t-check", disabled: true, on: { click: check } }, o.checkLabel || "Check");
      root.appendChild(h("div", { class: "t-q-actions" }, R.check, R.need));
      R.fb = h("div", { class: "t-fb", role: "status", "aria-live": "polite" });
      root.appendChild(R.fb);
      if (keepSure && sure !== null) setSure(sure);
      refresh();
    }
    render(false);

    return {
      el: root,
      focus: function () { if (R.focus) R.focus(); },
      /** Fill and submit with the right answer, "Sure". */
      auto: function () {
        if (S.locked) return;
        if (q.kind === "mcq") {
          var i = 0; opts.forEach(function (op, j) { if (op.correct) i = j; });
          selectOpt(i);
        } else { setText(String(q.answer)); }
        if (o.needSure) setSure(true);
        check();
      },
      locked: function () { return S.locked; },
      /** Fill and submit a WRONG answer (the one that shows mix-up `mixupId` when there is one), "Sure". */
      autoWrong: function (mixupId) {
        if (S.locked) return;
        if (q.kind === "mcq") {
          var wrong = [], hit = -1;
          opts.forEach(function (op, j) { if (!op.correct) { wrong.push(j); if (mixupId && op.mixup === mixupId && hit < 0) hit = j; } });
          selectOpt(hit >= 0 ? hit : (mixupId ? wrong[0] : wrong[wrong.length - 1]));
        } else {
          var wm = (q.wrongMixups || []), m = wm.filter(function (w) { return mixupId && w.mixup === mixupId; })[0];
          setText(String(m ? m.value : (mixupId && wm[0] ? wm[0].value : q.answer + 1000)));
        }
        if (o.needSure) setSure(true);
        check();
      },
    };
  }

  /* ------------------------------------------------------------------ a run of questions */
  /* o: { label, mode:'instant'|'deferred'|'none', needSure, tries, noMastery, anything, reveal, reactions,
          onReplay(res, q, afterBox, next)  // instant mode: a wrong answer with a replay hands over here; call next() when done
          record(info), onProgress(i, n), onFinish(results) } */
  function runQuestions(host, questions, o) {
    var n = questions.length, i = 0, view = null, finished = false, pendingNext = null, results = [];

    function show(k) {
      i = k; pendingNext = null;
      host.innerHTML = "";
      if (o.onProgress) o.onProgress(i, n);
      var q = questions[i];
      var head = h("div", { class: "t-q-head" }, h("p", { class: "eyebrow" }, o.label + (n > 1 ? " · " + (i + 1) + " of " + n : "")));
      var actions = h("div", { class: "t-q-next" });
      var after = h("div", { class: "t-q-after" });   // a mistake replay and its fresh question go here
      view = questionView(q, {
        needSure: o.needSure, feedback: o.mode === "instant" ? "instant" : "none", tries: o.tries, anything: o.anything,
        neutral: o.neutral, reveal: o.reveal, checkLabel: o.mode === "none" || o.mode === "deferred" ? (i < n - 1 ? "Lock in and continue" : "Lock in answer") : "Check",
        reactions: o.reactions, replays: o.mode === "instant" && !!o.onReplay,
        record: o.record,
        onResult: function (res, final) {
          if (!final) return;
          results.push({ q: q, res: res });
          function next() {
            if (o.mode === "instant") {
              if (i < n - 1) {
                var nb = h("button", { type: "button", class: "btn btn-primary", on: { click: function () { pendingNext = null; show(i + 1); focusView(); } } }, "Next question");
                actions.appendChild(nb); pendingNext = function () { nb.click(); };
                nb.focus({ preventScroll: false });
              } else { finish(); }
            } else if (i < n - 1) { show(i + 1); focusView(); }
            else { finish(); }
          }
          if (o.mode === "instant" && o.onReplay && !res.correct && res.replay && C.anims[res.replay]) { o.onReplay(res, q, after, next); return; }
          next();
        },
      });
      host.appendChild(head); host.appendChild(view.el); host.appendChild(after); host.appendChild(actions);
    }
    function focusView() { if (view) view.focus(); }
    function finish() {
      finished = true;
      if (o.mode === "deferred") renderSummary(host, results);
      else if (o.mode === "instant") host.appendChild(h("p", { class: "t-done-note" }, "That's the set. Press Continue when you're ready."));
      if (o.onFinish) o.onFinish(results);
    }
    if (!n) { finished = true; if (o.onFinish) o.onFinish([]); return { auto: function () {}, finished: function () { return true; } }; }
    show(0);
    return {
      finished: function () { return finished; },
      auto: function () {
        var guard = 0;
        while (!finished && guard++ < 60) { view.auto(); if (!finished && pendingNext) pendingNext(); }
      },
    };
  }

  function renderSummary(host, results) {
    var right = results.filter(function (r) { return r.res.correct; }).length;
    var box = h("div", { class: "t-summary phase-in" }, h("h3", { class: "t-summary-title" }, "You got " + right + " of " + results.length + " right."));
    results.forEach(function (r) {
      var ok = r.res.correct;
      var body = h("div", { class: "t-sum-body" }, h("p", { class: "t-sum-q" }, r.q.prompt));
      if (!ok) {
        body.appendChild(h("p", { class: "t-sum-line" }, "You said " + r.res.answer + ". The answer is " + correctText(r.q) + "."));
        if (r.res.why) body.appendChild(h("p", { class: "t-sum-line" }, r.res.why));
        if (r.res.mixup) { var mi = mixupInfo(r.res.mixup); body.appendChild(h("p", { class: "t-sum-line t-mixup-line" }, "This is a mix-up we've seen before" + (mi ? ": " + mi.name : "."))); }
      }
      if (r.q.explain) body.appendChild(h("p", { class: "t-sum-line t-sum-explain" }, r.q.explain));
      box.appendChild(h("div", { class: "t-sum-item " + (ok ? "t-right" : "t-wrong") }, icon(ok ? "ok" : "x"), body));
    });
    host.appendChild(box);
  }

  /* ------------------------------------------------------------------ animation / game blocks */
  function placeholder(kind, id, btnLabel, onClick) {
    return h("div", { class: "t-placeholder" },
      h("p", { class: "t-placeholder-title" }, (kind === "anim" ? "Animation" : "Game") + " “" + id + "” isn't ready yet."),
      h("p", { class: "muted" }, "It will appear here once it has been built."),
      btnLabel ? h("button", { type: "button", class: "btn btn-ghost", on: { click: onClick } }, btnLabel) : null);
  }

  /* ------------------------------------------------------------------ narration (Cogna's voice)
     Every animation caption is read aloud with the browser's speech engine, so each animation is a
     narrated audio-visual lesson. The on/off choice is remembered per browser. */
  var voice = (function () {
    var KEY = "cogna-voice", on = true, chosen = null;
    try { on = window.localStorage.getItem(KEY) !== "off"; } catch (e) { /* ignore */ }
    var synth = window.speechSynthesis || null;
    // Fallback only (used when a caption has no recording): natural-ish voices first, novelty voices never.
    var PREFER = [/natural/i, /neural/i, /premium/i, /enhanced/i, /^Google UK English Female/i, /^Google US English/i,
      /^Samantha/i, /^Microsoft (Neerja|Aria|Jenny|Sonia)/i, /^Daniel/i, /^Karen/i, /^Moira/i];
    function pick() {
      if (!synth || chosen) return chosen;
      var vs = (synth.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); });
      for (var i = 0; i < PREFER.length && !chosen; i++) chosen = vs.find(function (v) { return PREFER[i].test(v.name); }) || null;
      return chosen;
    }
    if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", function () { chosen = null; pick(); });

    /** Must match hash()/spoken() in tools/record-narration.mjs */
    function narrationKey(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
    /** The chosen voice's recording of a line (Demo drawer > Voice), else the default voice's, else none. */
    function recordingFor(text) {
      var k = narrationKey(text), pick = null;
      try { pick = window.localStorage.getItem("cogna-voice-set"); } catch (e) { /* ignore */ }
      var set = pick && C.voiceSets && C.voiceSets[pick];
      if (set && set.map && set.map[k]) return set.map[k];
      // Maji's own voice is the default for every lesson line that has been recorded in it
      var own = C.voiceSets && C.voiceSets["cartesia-skylar"];
      if (own && own.map && own.map[k]) return own.map[k];
      if (C.narration && C.narration[k]) return C.narration[k];
      // no Sarvam recording yet (credits ran out 2026-11-19): use another recorded voice before the browser's
      var FALLBACK = ["elevenlabs-cgsgspj2msm6clmckdw9", "gemini-sulafat", "cartesia-kiara"];
      for (var i = 0; i < FALLBACK.length; i++) { var f = C.voiceSets && C.voiceSets[FALLBACK[i]]; if (f && f.map && f.map[k]) return f.map[k]; }
      return null;
    }
    function spokenText(t) {
      return String(t)
        .replace(/\b([bch])\b/g, function (m, l) { return l.toUpperCase(); })
        .replace(/(^|[\s(+=×−])a(?=\s*(?:²|[+=×−)]|[.,]|$))/g, "$1A")
        .replace(/\ba(?= and B\b| is \d| = )/g, "A")
        .replace(/\bside a\b/g, "side A")
        .replace(/ \+ /g, " plus ").replace(/Baudhāyana/g, "Baudhayana").replace(/Śulba Sūtras/g, "Shulba Sutras")
        .replace(/²/g, " square").replace(/√/g, "the square root of ").replace(/−/g, " minus ").replace(/×/g, " times ").replace(/=/g, " equals ").replace(/½/g, "half");
    }

    /* One line at a time, and the voice follows the student:
       - a line that is playing is let finish, and only the newest waiting line is kept (an older waiting one is dropped);
         recorded and fallback (browser) lines queue the same way;
       - opts.interrupt cuts whatever is playing or waiting and says this line now (the student has already moved on);
       - opts.tag labels a line (the guide's are "guide") so stop(tag) stops only those;
       - opts.onStart() runs when the line starts to sound (or at once when it can't be heard), so captions follow the voice.
       done(spoken) is called once per line: true when it was heard, or when it was cut or dropped because the student
       moved on (it counts as heard: nothing waits a reading time for a line that was cut); false when it can't be heard
       at all (sound off, no voice, autoplay blocked), so a lesson paces itself by reading time instead.
       Every call returns { cut() } for that one line. */
    var cur = null, pending = null, paused = false;
    function settle(line, spoken) {
      if (!line || line.over) return;
      line.over = true; clearTimeout(line.timer);
      if (line.done) try { line.done(spoken); } catch (e) { console.error(e); }
    }
    function silence(line) {
      clearTimeout(line.timer);
      if (line.audio) { line.audio.onended = null; line.audio.onerror = null; try { line.audio.pause(); } catch (e) { /* ignore */ } }
      if (line.utter && synth) { line.utter.onend = null; line.utter.onerror = null; synth.cancel(); }
    }
    function next() { if (pending && !cur) { var p = pending; pending = null; begin(p); } }
    function over(line, spoken) { if (cur !== line) return; cur = null; silence(line); settle(line, spoken); next(); }
    /** A line that never reports its end (a stalled file, a browser voice that hangs, a background tab) must not block
        the queue: after about its own length (ms) plus a margin, it counts as heard. */
    function guard(line, ms) {
      clearTimeout(line.timer);
      line.timer = setTimeout(function () { if (cur !== line) return; if (paused) { guard(line, ms); return; } over(line, true); }, ms + 2500);
    }
    function spokenMs(text) { return String(text).split(/\s+/).length * 500; }   // the fallback voice reads about 2 words a second
    function begin(line) {
      cur = line;
      if (line.onStart) try { line.onStart(); } catch (e) { console.error(e); }
      if (line.rec) {
        var a = line.audio = new Audio(line.rec);
        a.onended = function () { over(line, true); };
        a.onerror = function () { over(line, false); };
        a.onloadedmetadata = function () { if (cur === line && isFinite(a.duration)) guard(line, a.duration * 1000); };   // its real length
        guard(line, spokenMs(line.text) + 4000);   // until the file says how long it is
        if (!paused) a.play().catch(function () { over(line, false); /* autoplay blocked: captions still show */ });
        return;
      }
      if (!synth) { cur = null; settle(line, false); next(); return; }
      var u = line.utter = new SpeechSynthesisUtterance(spokenText(line.text));
      var v = pick(); if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.95; u.pitch = 1;
      u.onend = function () { over(line, true); };
      u.onerror = function () { over(line, false); };
      guard(line, spokenMs(u.text));
      synth.speak(u);
    }
    function stopAll(spoken) {
      var p = pending, c = cur;
      pending = null; cur = null; paused = false;
      if (p) settle(p, spoken);
      if (c) { silence(c); settle(c, spoken); }
      if (synth) synth.cancel();
    }
    function cutLine(line) {
      if (line.over) return;
      if (pending === line) { pending = null; settle(line, true); return; }
      over(line, true);
    }
    function say(text, done, opts) {
      opts = opts || {};
      var line = { text: String(text || ""), done: done || null, tag: opts.tag || null, onStart: opts.onStart || null, over: false };
      var handle = { cut: function () { cutLine(line); } };
      if (!on || !text) {
        if (line.onStart) try { line.onStart(); } catch (e) { console.error(e); }
        settle(line, false);
        return handle;
      }
      line.rec = recordingFor(line.text);
      if (opts.interrupt) stopAll(true);
      if (cur) {   // let the line that is playing finish; only the newest waiting line is kept
        if (pending) settle(pending, true);
        pending = line;
        return handle;
      }
      begin(line);
      return handle;
    }
    return {
      available: !!synth || !!C.narration,
      isOn: function () { return on; },
      set: function (v) { on = v; try { window.localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) { /* ignore */ } if (!v) stopAll(false); },
      say: say,
      pause: function () { paused = true; if (cur && cur.audio) cur.audio.pause(); if (synth) synth.pause(); },
      resume: function () { paused = false; if (cur && cur.audio) cur.audio.play().catch(function () {}); if (synth) synth.resume(); },
      /** stop(): everything (it counts as heard). stop(tag): only the lines with that tag; the others go on. */
      stop: function (tag) {
        if (!tag) { stopAll(true); return; }
        if (pending && pending.tag === tag) { var p = pending; pending = null; settle(p, true); }
        if (cur && cur.tag === tag) over(cur, true);
      },
    };
  })();
  C.voice = voice;
  C.bus.on("route:changed", function () { voice.stop(); });

  /** o: { skill, onEnd, onBeat, markButton, flags } -> { el, destroy, play }  (flags reach a Cogna.lesson as L.flags) */
  function animBlock(id, o) {
    var A = C.anims[id], el = h("div", { class: "t-anim" });
    var out = { el: el, destroy: function () {}, play: function () {}, ended: false };
    if (!A) { el.appendChild(placeholder("anim", id, o.markButton ? "Mark as watched" : null, function () { out.ended = true; if (o.onEnd) o.onEnd(); })); return out; }
    var stage = h("div", { class: "t-anim-stage" });
    var caption = h("p", { class: "t-caption", role: "status", "aria-live": "polite" }, "Press Play to watch.");
    var toggle = h("button", { type: "button", class: "btn btn-ghost" }, "Play");
    var replay = h("button", { type: "button", class: "btn btn-ghost" }, "Replay");
    var skip = h("button", { type: "button", class: "btn-link", hidden: true }, "Mark as watched");
    var sound = h("button", { type: "button", class: "btn btn-quiet t-sound", "aria-pressed": String(voice.isOn()), hidden: !voice.available },
      voice.isOn() ? "Sound on" : "Sound off");
    sound.addEventListener("click", function () {
      voice.set(!voice.isOn());
      sound.textContent = voice.isOn() ? "Sound on" : "Sound off";
      sound.setAttribute("aria-pressed", String(voice.isOn()));
      if (voice.isOn() && playing) voice.say(caption.textContent);
    });
    el.appendChild(stage); el.appendChild(caption);
    el.appendChild(h("div", { class: "t-row t-anim-controls" }, toggle, replay, sound, skip));
    var ctl = null, playing = false, timer = null;
    function ended() { playing = false; toggle.textContent = "Play"; skip.hidden = true; clearTimeout(timer); if (!out.ended) { out.ended = true; if (o.onEnd) o.onEnd(); } }
    try {
      // vo.interrupt: a reaction to what the student just did cuts the line still being said. The caption under the
      // stage changes when its line starts to sound, so the words on screen and the voice stay together.
      ctl = A.mount(stage, { flags: o.flags || {}, onRecord: o.onRecord, onEnd: ended, onBeat: function (c, done, vo) {
        var line = null;
        if (c) line = voice.say(c, done, { interrupt: !!(vo && vo.interrupt), onStart: function () { caption.textContent = c; } });
        else if (done) done(false);
        if (o.onBeat) o.onBeat(c);
        return line;
      } });
    } catch (e) { console.error("[session] anim mount", id, e); stage.appendChild(placeholder("anim", id, "Mark as watched", function () { ended(); })); return out; }
    function start() { playing = true; toggle.textContent = "Pause"; try { ctl.play(); } catch (e) { console.error(e); } }
    toggle.addEventListener("click", function () {
      if (playing) { playing = false; toggle.textContent = "Play"; voice.pause(); try { ctl.pause(); } catch (e) { console.error(e); } }
      else if (out.ended) { playing = true; toggle.textContent = "Pause"; voice.stop(); try { ctl.replay(); } catch (e) { console.error(e); } }
      else { voice.resume(); start(); }
    });
    replay.addEventListener("click", function () { playing = true; toggle.textContent = "Pause"; voice.stop(); try { ctl.replay(); } catch (e) { console.error(e); } });
    // "Mark as watched" ends it for real: the lesson stops moving and stops talking
    skip.addEventListener("click", function () { try { ctl.pause(); } catch (e) { /* ignore */ } voice.stop(); ended(); });
    timer = setTimeout(function () { if (!out.ended) skip.hidden = false; }, (A.durationMs || 20000) + 5000);
    out.play = start; out.destroy = function () { clearTimeout(timer); voice.stop(); try { ctl && ctl.destroy(); } catch (e) { /* ignore */ } };
    return out;
  }

  /* ------------------------------------------------------------------ step renderers */
  var T = C.steps;

  T.teacher = function (el, step, ctx) {
    var name = teacherName();
    var btn = h("button", { type: "button", class: "btn btn-primary t-board-btn" }, "I've listened");
    var board = h("div", { class: "t-board" },
      h("p", { class: "eyebrow t-board-eyebrow" }, name + " at the board"),
      h("p", { class: "t-board-what" }, step.what || ""),
      step.boardSvg ? h("div", { class: "t-board-fig" }, C.fromHTML(step.boardSvg)) : null,
      step.trap ? h("div", { class: "t-board-trap" }, h("span", { class: "t-board-label" }, "The trap she'll show"), h("p", null, step.trap)) : null,
      step.classNote ? h("p", { class: "t-board-note" }, step.classNote) : null,
      btn);
    function done() { btn.disabled = true; btn.textContent = "Listened"; ctx.complete(); }
    btn.addEventListener("click", done);
    el.appendChild(board);
    ctx.setAuto(done);
  };

  /* step.reactions: true -> a sound and a little pop or shake on every answer.
     A wrong answer whose option / wrongMixups entry has `replay: "<anim id>"` (instant steps only) plays that mistake
     replay straight away, starting from the student's own number, then asks `q.retry`: a fresh question of the same kind. */
  function questionStep(label, mode, needSure) {
    return function (el, step, ctx) {
      var qs = step.questions || [];
      var host = h("div", { class: "t-qrun" });
      if (step.note) el.appendChild(h("p", { class: "t-plan-why" }, step.note));   // a made-for-you step says why it is here (plan.js)
      el.appendChild(host);
      var replays = [], retryView = null;
      ctx.onCleanup(function () { replays.forEach(function (b) { try { b.destroy(); } catch (e) { /* ignore */ } }); replays = []; });
      function record(info) {
        var due = step.type === "recall" && info.correct && C.state.revisitsDue(ctx.day).indexOf(info.skill) !== -1;
        ctx.record(info);
        if (due) C.state.clearRevisit(info.skill);
      }
      function onReplay(res, q, box, next) {
        var watched = false;
        var blk = animBlock(res.replay, { markButton: true, onEnd: afterWatch });
        replays.push(blk);
        var panel = h("div", { class: "t-replay settle" },
          h("p", { class: "eyebrow" }, "Let's look closer"),
          h("h3", { class: "t-replay-title" }, "Your answer: " + res.answer),
          blk.el);
        box.appendChild(panel);
        blk.play();
        try { panel.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* ignore */ }
        function afterWatch() {
          if (watched) return; watched = true;
          if (!q.retry) { next(); return; }
          var rb = h("div", { class: "t-replay-retry settle" }, h("p", { class: "t-fix-ask" }, "Now try one like it."));
          box.appendChild(rb);
          retryView = questionView(q.retry, {
            needSure: needSure, feedback: "instant", tries: 1, reactions: !!step.reactions, record: record,
            onResult: function (r2, final) { if (final) { retryView = null; next(); } },
          });
          rb.appendChild(retryView.el);
          try { rb.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* ignore */ }
          retryView.focus();
        }
      }
      var run = runQuestions(host, qs, {
        label: step.label || label, mode: mode, needSure: needSure, reactions: !!step.reactions, onReplay: mode === "instant" ? onReplay : null,
        tries: mode === "instant" ? 2 : 1,   // a wrong answer gets one more look before the answer is shown
        record: record,
        onProgress: function (i, n) { ctx.progress && ctx.progress(i, n); },
        onFinish: function () { ctx.complete(); },
      });
      ctx.setAuto(function () { if (retryView && !retryView.locked()) retryView.auto(); run.auto(); });
    };
  }
  T.recall = questionStep("Quick recall", "instant", false);
  T.practice = questionStep("Practice", "instant", true);
  T.exit = questionStep("Exit check", "deferred", true);

  T.try = function (el, step, ctx) {
    el.appendChild(h("p", { class: "t-nopressure" }, "No pressure: you haven't been taught this yet"));
    var host = h("div", { class: "t-qrun" });
    el.appendChild(host);
    var run = runQuestions(host, [step.q], {
      label: "Try first", mode: "instant", needSure: false, anything: true, neutral: true, reveal: step.reveal,
      record: function (info) { info.noMastery = true; ctx.record(info); },
      onFinish: function () { ctx.complete(); },
    });
    ctx.setAuto(function () { run.auto(); });
  };

  T.worked = function (el, step, ctx) {
    var lines = step.lines || [], shown = 0;
    var yt = step.yourTurn;
    el.appendChild(h("p", { class: "eyebrow" }, "Worked example"));
    if (step.figure) { var f = C.fromHTML(step.figure); if (f) el.appendChild(f); }
    var list = h("div", { class: "t-worked", "aria-live": "polite" });
    var nextBtn = h("button", { type: "button", class: "btn btn-ghost" }, "Next step");
    var turn = h("div", { class: "t-turn", hidden: true });
    el.appendChild(list); el.appendChild(nextBtn); el.appendChild(turn);

    function revealOne() {
      if (shown >= lines.length) return;
      list.appendChild(h("p", { class: "worked-line math-sm phase-in t-worked-line" }, lines[shown]));
      shown++;
      if (shown >= lines.length) { nextBtn.hidden = true; startTurn(); }
      else nextBtn.textContent = "Next step";
    }
    nextBtn.addEventListener("click", revealOne);

    var turnStarted = false, inputs = [], tries = 0, finished = false, msg;
    function finishWorked() {
      if (finished) return; finished = true;
      if (step.skill) C.state.markTaught(step.skill, ctx.day);
      ctx.complete();
    }
    function startTurn() {
      if (turnStarted) return; turnStarted = true;
      if (!yt || !(yt.blanks || []).length) { finishWorked(); return; }
      turn.hidden = false;
      turn.appendChild(h("p", { class: "t-turn-prompt" }, yt.prompt || "Your turn"));
      yt.blanks.forEach(function (b, k) {
        var inp = h("input", { class: "input t-blank-input", type: "text", inputmode: "decimal", autocomplete: "off", "aria-label": b.label,
          on: { keydown: function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } } } });
        inputs.push(inp);
        turn.appendChild(h("div", { class: "t-blank" }, h("span", { class: "t-blank-label math-sm" }, b.label), inp, b.unit ? h("span", { class: "t-num-unit" }, b.unit) : null));
      });
      msg = h("div", { class: "t-fb", role: "status", "aria-live": "polite" });
      var chk = h("button", { type: "button", class: "btn btn-primary t-check", on: { click: check } }, "Check");
      turn.appendChild(h("div", { class: "t-q-actions" }, chk)); turn.appendChild(msg);
      el._chk = chk; inputs[0].focus();
    }
    function check() {
      if (finished) return;
      var allOk = true;
      yt.blanks.forEach(function (b, k) {
        var v = parseNum(inputs[k].value), ok = v !== null && Math.abs(v - b.answer) <= (b.tol || 0) + 1e-9;
        inputs[k].classList.toggle("is-right", ok); inputs[k].classList.toggle("is-wrong", !ok);
        inputs[k].setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok) allOk = false;
      });
      msg.innerHTML = "";
      if (allOk) {
        msg.appendChild(h("div", { class: "feedback feedback-correct t-right settle" }, icon("ok"), h("div", null, h("strong", null, "Right."), "Same steps, new numbers.")));
        lockTurn(); finishWorked(); return;
      }
      tries++;
      if (tries >= 2) {
        yt.blanks.forEach(function (b, k) { inputs[k].value = String(b.answer); inputs[k].classList.remove("is-wrong"); inputs[k].classList.add("is-right"); });
        msg.appendChild(h("div", { class: "feedback feedback-incorrect t-wrong settle" }, icon("x"), h("div", null, h("strong", null, "Here's the answer."),
          yt.blanks.map(function (b) { return h("span", { class: "t-fb-line" }, b.label + " " + b.answer + (b.unit ? " " + b.unit : "")); }))));
        lockTurn(); finishWorked();
      } else {
        msg.appendChild(h("div", { class: "feedback feedback-incorrect t-wrong settle" }, icon("x"), h("div", null, h("strong", null, "Not quite. Have another go."), "Look back at the steps above and follow them one at a time.")));
      }
    }
    function lockTurn() { inputs.forEach(function (i) { i.disabled = true; }); if (el._chk) el._chk.hidden = true; }

    if (!lines.length) startTurn(); else revealOne();
    ctx.setAuto(function () {
      while (shown < lines.length) revealOne();
      startTurn();
      if (yt && yt.blanks && !finished) { yt.blanks.forEach(function (b, k) { inputs[k].value = String(b.answer); }); check(); }
    });
  };

  /* step: { anim, skill?, eyebrow? (default "Cogna lesson"), autoplay? (short pieces: the reminder, the progress moment),
             flags? (handed to the lesson, e.g. { afterLesson: true }) } */
  T.animation = function (el, step, ctx) {
    var a = C.anims[step.anim];
    el.appendChild(h("p", { class: "eyebrow" }, step.eyebrow || "Cogna lesson"));
    el.appendChild(h("h2", { class: "t-step-title" }, (a && a.title) || "Watch and listen"));
    if (!step.autoplay) el.appendChild(h("p", { class: "muted t-lesson-hint" }, a && a.interactive
      ? "Press Play. Maji tells the story, and stops to let you try things yourself."
      : "Press Play. Maji explains each step out loud; captions follow along."));
    var blk = animBlock(step.anim, {
      markButton: true, flags: step.flags,
      onRecord: function (info) { ctx.record(info); },   // what the student tells the person in a story lesson
      onEnd: function () { if (step.skill) C.state.markTaught(step.skill, ctx.day); ctx.complete(); },
    });
    el.appendChild(blk.el);
    ctx.onCleanup(blk.destroy);
    // A piece that plays by itself starts once the screen has settled: the voice is stopped on every route change, and
    // that comes after the screen is drawn, so starting during the draw would silence its first line (Day 6's reminder).
    if (step.autoplay) setTimeout(function () { if (blk.el.isConnected) blk.play(); }, 0);
    ctx.setAuto(function () { if (step.skill) C.state.markTaught(step.skill, ctx.day); ctx.complete(); });
  };

  T.game = function (el, step, ctx) {
    var g = C.games[step.game], n = 0;
    el.appendChild(h("p", { class: "eyebrow" }, "Play"));
    el.appendChild(h("h2", { class: "t-step-title" }, (g && g.title) || "Have a go"));
    var note = h("p", { class: "t-done-note", hidden: true, role: "status" }, "Nice work. You can continue.");
    var finished = false;
    // Finishing the game counts as ONE right answer for the skill (it shows the idea works for him).
    function ok() {
      if (!finished) {
        finished = true;
        if (step.skill) {
          C.state.markTaught(step.skill, ctx.day);
          ctx.record({ qid: step.id + "-done", skill: step.skill, correct: true, answer: "game finished" });
        }
      }
      note.hidden = false; ctx.complete();
    }
    if (!g) {
      el.appendChild(placeholder("game", step.game, "Mark as played", ok));
    } else {
      var stage = h("div", { class: "t-game-stage" });
      el.appendChild(stage);
      try {
        var ctl = g.mount(stage, {
          onSuccess: ok,
          onEvent: function (e) {
            if (!e || e.kind !== "answer") return;
            // Orchestrator rule: single moves inside a game don't move the meter (placing 11 tiles is not
            // 11 right answers, and a fumble is not a maths mistake). Every move is still logged.
            // Only a wrong move that shows a known mix-up (e.g. picking the slanted side) counts against the skill.
            var mixupWrong = !e.correct && !!e.mixup;
            ctx.record({ qid: step.id + "-g" + (++n), skill: step.skill, correct: !!e.correct, mixup: e.mixup, guards: e.guards,
              noMastery: !mixupWrong, answer: e.answer !== undefined ? e.answer : "game" });
          },
        });
        ctx.onCleanup(function () { try { ctl && ctl.destroy && ctl.destroy(); } catch (e) { /* ignore */ } });
      } catch (err) { console.error("[session] game mount", step.game, err); stage.appendChild(placeholder("game", step.game, "Mark as played", ok)); }
    }
    el.appendChild(note);
    ctx.setAuto(ok);
  };

  /* step: { type: "rive", lessons: [1, 2, 3] | 4, skill?, title?, eyebrow? } — an Area lesson: the Rive Area module
     (data/lab.js) opened straight onto each lesson in turn. Its lines are spoken by the app's own voice (C.voice), and a new
     line always replaces the old one, so the voice never talks about a part the student has left. Every answer given inside
     it is recorded like any other answer (with its mix-up), and when the last lesson is done the skill counts as taught and
     Continue opens. If the lesson cannot start (offline, no WebGL), the student can skip it. */
  T.rive = function (el, step, ctx) {
    var lab = C.lab || {}, ls = [].concat(step.lessons || step.lesson || []);
    var title = step.title || (ls.length && lab.lessons && lab.lessons[ls[0]]) || "Try it with your own hands";
    el.appendChild(h("p", { class: "eyebrow" }, step.eyebrow || "Hands on"));
    el.appendChild(h("h2", { class: "t-step-title" }, title));
    el.appendChild(h("p", { class: "muted t-lesson-hint" }, "Do each task with your finger, mouse or arrow keys: the gold things move. Press Next in the lesson when you're ready."));
    var parts = h("p", { class: "eyebrow t-lab-parts", role: "status" }, ls.length > 1 ? "Part 1 of " + ls.length : "");
    var stage = h("div", { class: "t-lab-stage" });
    var msg = h("p", { class: "muted t-lab-note", role: "status" }, "Loading the lesson…");
    var skip = h("button", { type: "button", class: "btn btn-ghost t-lab-skip", hidden: true }, "Skip this lesson for now");
    el.appendChild(parts); el.appendChild(stage); el.appendChild(msg); el.appendChild(skip);
    var done = false, at = 0, voice = C.voice;
    // a step can cover lessons that teach different skills (Day 3: counting squares, then parallelograms)
    function skillOf(n) { return (step.lessonSkills && step.lessonSkills[n]) || step.skill; }
    function finish(taught) {
      if (done) return; done = true;
      if (taught) [].concat(step.skills || [], step.skill ? [step.skill] : []).forEach(function (s) { C.state.markTaught(s, ctx.day); });
      msg.textContent = taught ? "Lesson done. Press Continue when you're ready." : "";
      skip.hidden = true;
      ctx.complete();
    }
    skip.addEventListener("click", function () { finish(false); });
    var run = lab.mount ? lab.mount(stage, {
      lesson: ls[0] || 1,
      onReady: function () { if (msg.textContent === "Loading the lesson…") msg.textContent = ""; },
      onLine: function (text, heard) {
        if (!voice || !voice.isOn()) { heard(); return; }   // sound off: the lesson paces itself by reading time
        voice.stop();                                     // a new line always replaces the one before it
        voice.say(text, function () { heard(); });
      },
      onStop: function () { if (voice) voice.stop(); },
      onAnswer: function (a) {
        var bet = a.value === "same" || a.value === "changes";   // a bet is a guess before teaching, not an answer
        ctx.record({ qid: step.id + "-" + a.qid, skill: skillOf(ls[at]), correct: a.correct, answer: a.value, mixup: a.mixup || undefined, noMastery: bet });
      },
      onDone: function () {
        var s = skillOf(ls[at]); if (s) C.state.markTaught(s, ctx.day);   // each part counts as taught when it is done
        at += 1;
        if (at < ls.length) { parts.textContent = "Part " + (at + 1) + " of " + ls.length; run.open(ls[at]); }
        else finish(true);
      },
      onError: function (m) { msg.textContent = m + " You can skip it for now."; skip.hidden = false; },
    }) : null;
    if (run) ctx.onCleanup(run.destroy);
    else { msg.textContent = "This lesson isn't available here."; skip.hidden = false; }
    // a lesson running for a very long time (stuck, or a device that can't draw it) can still be left
    var late = setTimeout(function () { if (!done) skip.hidden = false; }, 6 * 60 * 1000);
    ctx.onCleanup(function () { clearTimeout(late); });
    // the lesson has its own presenter on stage, so the floating guide steps aside while it plays
    var gr = C.guide && C.guide.root;
    if (gr) { gr.style.display = "none"; ctx.onCleanup(function () { gr.style.display = ""; }); }
    ctx.setAuto(function () { finish(true); });
  };

  /* step.carry (plan.js): a second look at a mix-up from an earlier day or the check-in. Always shown.
     Both kinds show the student's own wrong answer first, when one is on record. */
  T.fix = function (el, step, ctx) {
    var mi = mixupInfo(step.mixup);
    el.appendChild(h("p", { class: "eyebrow" }, step.eyebrow || "Let's look at that mix-up"));
    el.appendChild(h("h2", { class: "t-step-title" }, mi ? mi.name : "A common mix-up"));
    if (mi && mi.plain) el.appendChild(h("p", { class: "lead" }, mi.plain));
    if (step.note) el.appendChild(h("p", { class: "t-plan-why" }, step.note));
    var ev = C.plan && C.plan.evidence ? C.plan.evidence(step.mixup, ctx.day) : null;
    if (ev) el.appendChild(h("div", { class: "t-plan-own" },
      h("p", { class: "eyebrow" }, ev.when + ", you answered"),
      ev.prompt ? h("p", { class: "t-plan-own-q" }, ev.prompt) : null,
      h("p", { class: "t-plan-own-a" }, h("strong", null, ev.his), ev.right ? " · the answer was " + ev.right : "")));
    // With a check, the question comes once the animation has ended (or been marked as watched): nothing is said over
    // the explanation, and Continue can't cut it short.
    var blk = animBlock(step.anim, { markButton: true, onEnd: function () { if (!step.check) ctx.complete(); else showCheck(); } });
    el.appendChild(blk.el);
    ctx.onCleanup(blk.destroy);
    if (!step.check) { ctx.setAuto(function () { ctx.complete(); }); return; }
    var ask = h("p", { class: "t-fix-ask", hidden: true }, "Now try one.");
    var host = h("div", { class: "t-qrun", hidden: true });
    el.appendChild(ask);
    el.appendChild(host);
    var run = null;
    function showCheck() {
      if (run) return;
      ask.hidden = false; host.hidden = false;
      run = runQuestions(host, [step.check], {
        label: "Check", mode: "instant", needSure: false, tries: 2,
        record: function (info) { ctx.record(info); },
        onFinish: function () { ctx.complete(); },
      });
      try { ask.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* ignore */ }
    }
    ctx.setAuto(function () { showCheck(); run.auto(); });
  };

  /* ---- adaptive practice (Day 1 personalised; see DAY1_PERSONALISED.md rules 1-11) ---- */
  T.adaptive = function (el, step, ctx) {
    var P = C.data.profile || {}, pool = step.pool || [], maxQ = step.maxQuestions || 8;
    var level = P.startLevel || 1, streak = 0, asked = 0, used = {}, bonusUsed = false, done = false;
    var path = [], view = null, lastInfo = null, blk = null, nextBtn = null, openerBtn = null;
    var resolveAuto = null, autoTimer = null, story = P.story || [];
    var queue = Object.keys(P.causes || {}).filter(function (k) { return step.openers && step.openers[k]; });

    var status = h("p", { class: "t-adapt-status", role: "status", "aria-live": "polite" });
    var pathBox = h("div", { class: "t-path", hidden: true });
    var host = h("div", { class: "t-qrun t-adapt-host" });
    el.appendChild(h("p", { class: "eyebrow" }, "Practice that follows you"));
    el.appendChild(status); el.appendChild(pathBox); el.appendChild(host);
    ctx.onCleanup(function () { clearTimeout(autoTimer); autoTimer = null; destroyBlk(); });

    function destroyBlk() { if (blk) { blk.destroy(); blk = null; } }
    function drawStatus() {
      status.textContent = done ? "" : "Level " + level + " of 3 · " + streak + " in a row";
      status.hidden = done || (queue.length > 0 && asked === 0 && !view);
    }
    function drawPath() {
      pathBox.hidden = !path.length; pathBox.innerHTML = "";
      if (!path.length) return;
      var row = h("div", { class: "t-path-row" });
      path.forEach(function (p, i) {
        row.appendChild(h("span", { class: "t-path-item" },
          h("span", { class: "t-path-dot " + (p.right ? "is-right" : "is-wrong"), role: "img", "aria-label": "Question " + (i + 1) + ", level " + p.level + ", " + (p.right ? "right" : "not quite") }, String(p.level)),
          h("span", { class: "t-path-tag" }, p.tag || "")));
      });
      row.appendChild(h("span", { class: "t-path-now" }, "Now: level " + level));
      pathBox.appendChild(h("p", { class: "t-path-label" }, "Your path")); pathBox.appendChild(row);
    }

    /* openers: the animations for this student's own check-in mix-ups */
    function showOpener(i) {
      destroyBlk(); host.innerHTML = ""; openerBtn = null;
      if (i >= queue.length) { askNext(); return; }
      var id = queue[i], mi = mixupInfo(id);
      host.appendChild(h("h2", { class: "t-step-title" }, mi ? mi.name : "A common mix-up"));
      host.appendChild(h("p", { class: "lead t-adapt-from" }, "From your check-in: " + (mi && mi.plain ? mi.plain : "")));
      blk = animBlock(step.openers[id], { markButton: false });
      host.appendChild(blk.el);
      openerBtn = h("button", { type: "button", class: "btn btn-primary t-adapt-go", on: { click: function () { openerBtn = null; showOpener(i + 1); } } }, i + 1 < queue.length ? "Next" : "Start practising");
      host.appendChild(h("div", { class: "t-q-actions" }, openerBtn));
      if (step.skill) C.state.markTaught(step.skill, ctx.day);
      window.scrollTo(0, 0);
    }

    function pickQuestion() {
      for (var d = 0; d < 3; d++) {
        var tries = d === 0 ? [level] : [level - d, level + d];
        for (var t = 0; t < tries.length; t++) {
          var q = pool.filter(function (x) { return x.level === tries[t] && !used[x.id]; })[0];
          if (q) return q;
        }
      }
      return null;
    }
    function themed(q) {
      var c = {}; Object.keys(q).forEach(function (k) { c[k] = q[k]; });
      var th = q.themes || {};
      c.prompt = th[P.interest] || th["default"] || q.prompt || "";
      return c;
    }

    function askNext() {
      destroyBlk(); host.innerHTML = ""; nextBtn = null; view = null;
      var q = pickQuestion();
      if (asked >= maxQ || !q) { finish(false); return; }
      used[q.id] = true;
      var qLevel = q.level || level;
      var qq = themed(q);
      host.appendChild(h("div", { class: "t-q-head" }, h("p", { class: "eyebrow" }, "Practice · question " + (asked + 1))));
      var after = h("div", { class: "t-adapt-after" });
      view = questionView(qq, {
        needSure: true, feedback: "instant", tries: 1, checkLabel: "Check",
        record: function (info) { lastInfo = info; ctx.record(info); },
        onResult: function (res) { handle(res, qLevel, after); },
      });
      host.appendChild(view.el); host.appendChild(after);
      drawStatus();
      if (!resolveAuto) view.focus();
    }

    function say(box, text) { box.appendChild(h("p", { class: "t-adapt-msg" }, text)); }
    function handle(res, qLevel, box) {
      asked++;
      var sure = lastInfo && lastInfo.sure === true;
      var entry = { right: !!res.correct, level: qLevel, tag: "" };
      var finishedSecure = false;
      if (res.correct) {
        if (!sure && !bonusUsed) {
          bonusUsed = true; entry.tag = "extra";
          say(box, "Right, but you weren't sure. One more at level " + level + " to be certain.");
        } else {
          streak++;
          if (streak >= 2) {
            if (level >= 3) { finishedSecure = true; }
            else { level++; streak = 0; entry.tag = "up"; say(box, "Two in a row. Moving up to level " + level + "."); }
          } else say(box, "One in a row. One more right answer to move up.");
        }
      } else {
        streak = 0;
        if (sure) box.appendChild(h("div", { class: "feedback t-note settle" }, h("div", null, h("strong", null, "You felt sure, so this one's worth a closer look."))));
        var fixId = res.mixup && step.fixes ? step.fixes[res.mixup] : null;
        if (fixId) {
          entry.tag = "fix";
          var mi = mixupInfo(res.mixup);
          blk = animBlock(fixId, { markButton: false });
          box.appendChild(h("div", { class: "t-adapt-fix settle" },
            h("p", { class: "eyebrow" }, "A closer look" + (mi ? ": " + mi.name : "")),
            mi && mi.plain ? h("p", { class: "t-adapt-fix-plain" }, mi.plain) : null, blk.el));
          blk.play();
          say(box, "Here's another one at level " + level + ", now that you've seen it.");
        } else {
          if (level > 1) { level--; entry.tag = "down"; say(box, "Let's step back to level " + level + " and build up again."); }
          else say(box, "Let's try another at level 1.");
        }
      }
      path.push(entry); drawPath(); drawStatus();
      if (finishedSecure) { finish(true); return; }
      if (asked >= maxQ) { finish(false); return; }
      nextBtn = h("button", { type: "button", class: "btn btn-primary t-adapt-next", on: { click: function () { nextBtn = null; askNext(); } } }, "Next question");
      box.appendChild(h("div", { class: "t-q-next" }, nextBtn));
      try { nextBtn.focus({ preventScroll: false }); } catch (e) { /* ignore */ }
    }

    function finish(secure) {
      done = true; nextBtn = null; drawStatus(); drawPath();
      if (step.skill) C.state.markTaught(step.skill, ctx.day);
      var target = host.querySelector(".t-adapt-after") || host;
      target.appendChild(h("div", { class: "feedback feedback-correct t-right t-adapt-done settle" }, icon("ok"), h("div", null,
        h("strong", null, secure ? "Secure: two in a row at the hardest level." : "We'll keep practising this tomorrow."),
        secure ? "Press Continue when you're ready." : "You can press Continue now.")));
      ctx.complete();
      if (resolveAuto) { var r = resolveAuto; resolveAuto = null; clearTimeout(autoTimer); r(); }
    }

    /* demo auto-play: follows profile.story by answer number, then answers right */
    function tick() {
      autoTimer = null;
      if (!resolveAuto) return;
      if (done) { var r = resolveAuto; resolveAuto = null; r(); return; }
      if (openerBtn && openerBtn.isConnected) openerBtn.click();
      else if (nextBtn && nextBtn.isConnected) nextBtn.click();
      else if (view && !view.locked()) {
        var s = story[asked];
        if (s && !s.correct) view.autoWrong(s.mixup); else view.auto();
      }
      autoTimer = setTimeout(tick, 150);
    }
    ctx.setAuto(function () {
      if (done) return null;
      return new Promise(function (resolve) { resolveAuto = resolve; clearTimeout(autoTimer); tick(); });
    });

    drawStatus();
    if (queue.length) showOpener(0); else askNext();
  };

  function judgeExplain(step, text) {
    var low = String(text).toLowerCase(), words = low.trim().split(/\s+/).filter(Boolean).length;
    var groups = step.keyIdeas || [], hits = 0;
    groups.forEach(function (g) { if (g.some(function (w) { return low.indexOf(String(w).toLowerCase()) !== -1; })) hits++; });
    if (words < 6) return "nudge";
    if (!groups.length || hits === groups.length) return "strong";
    return hits >= 1 ? "close" : "nudge";
  }
  /** A microphone for a written answer: what the student says is written into the box (they can fix it before sending).
      Uses the browser's own speech-to-text when it has one (Indian English), otherwise records and sends the sound to the
      trail's voice server (/api/hear). Returns { el, stop } or null when there is no microphone at all. */
  function micFor(ta, onText) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
    if (!SR && !canRecord) return null;
    var label = h("span", null, "Say it");
    var btn = h("button", { type: "button", class: "btn btn-ghost t-mic", "aria-pressed": "false" },
      h("span", { class: "t-mic-dot", "aria-hidden": "true" }), label);
    btn.firstChild.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    var on = false, rec = null, base = "", raw = null;
    function put(text) {
      ta.value = (base ? base.replace(/\s+$/, "") + " " : "") + text;
      if (onText) onText();
    }
    function setOn(v, msg) {
      on = v; btn.classList.toggle("is-on", v); btn.setAttribute("aria-pressed", String(v));
      label.textContent = msg || (v ? "Listening… tap to stop" : "Say it");
    }
    function startBrowser() {
      rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = true;
      rec.onresult = function (ev) {
        var t = ""; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        put(t.trim());
      };
      rec.onerror = function (ev) {
        rec = null;
        if (canRecord && (ev.error === "network" || ev.error === "service-not-allowed" || ev.error === "language-not-supported")) { SR = null; startRecording(); return; }
        setOn(false, ev.error === "not-allowed" ? "Microphone blocked" : "Say it");
      };
      rec.onend = function () { if (rec) { rec = null; setOn(false); } };
      rec.start(); setOn(true);
    }
    function startRecording() {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream);
        var proc = ctx.createScriptProcessor(2048, 1, 1), chunks = [];
        proc.onaudioprocess = function (e) { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
        src.connect(proc); proc.connect(ctx.destination);
        raw = { stream: stream, ctx: ctx, proc: proc, chunks: chunks };
        setOn(true);
      }).catch(function () { setOn(false, "Microphone blocked"); });
    }
    function stopRecording() {
      var r = raw; raw = null; if (!r) return;
      try { r.proc.disconnect(); r.stream.getTracks().forEach(function (t) { t.stop(); }); r.ctx.close(); } catch (e) { /* ignore */ }
      if (!C.toWav || !r.chunks.length) { setOn(false); return; }
      setOn(false, "Writing it down…"); btn.disabled = true;
      fetch("/api/hear", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: C.toWav(r.chunks, r.ctx.sampleRate) })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (j) { btn.disabled = false; if (j && j.text) { put(j.text.trim()); setOn(false); } else setOn(false, "Didn't catch that. Try again"); })
        .catch(function () { btn.disabled = false; setOn(false, "Can't hear right now. Please type"); });
    }
    function stop() {
      if (rec) { var r = rec; rec = null; try { r.stop(); } catch (e) { /* ignore */ } setOn(false); }
      if (raw) stopRecording();
    }
    btn.addEventListener("click", function () {
      if (on) { stop(); return; }
      if (C.voice) C.voice.stop();   // the student is talking: Cogna stops
      base = ta.value;
      if (SR) { try { startBrowser(); return; } catch (e) { SR = null; } }
      startRecording();
    });
    return { el: btn, stop: stop };
  }

  T.explain = function (el, step, ctx) {
    el.classList.add("t-explain");
    el.appendChild(h("p", { class: "eyebrow" }, "In your own words"));
    el.appendChild(h("h2", { class: "t-step-title", id: "ex-prompt" }, step.prompt));
    el.appendChild(h("p", { class: "muted t-explain-hint" }, "Type it or say it. A sentence or two is enough, and there's no wrong way to start."));
    var ta = h("textarea", { class: "input t-explain-input", rows: 4, "aria-labelledby": "ex-prompt", placeholder: "Because…" });
    var count = h("span", { class: "t-explain-count", "aria-hidden": "true" }, "");
    var send = h("button", { type: "button", class: "btn btn-primary t-check" }, "Send");
    var out = h("div", { class: "t-fb", role: "status", "aria-live": "polite" });
    function words() { var n = ta.value.trim().split(/\s+/).filter(Boolean).length; count.textContent = n ? n + (n === 1 ? " word" : " words") : ""; send.disabled = !n || ta.disabled; }
    ta.addEventListener("input", words);
    var mic = micFor(ta, words);
    el.appendChild(h("div", { class: "t-explain-box" }, ta,
      h("div", { class: "t-explain-tools" }, mic ? mic.el : null, count, send)));
    el.appendChild(out);
    if (mic) ctx.onCleanup(mic.stop);
    words();
    var submissions = 0, busy = false, timers = [], resolveAuto = null;
    ctx.onCleanup(function () { timers.forEach(clearTimeout); });

    function submit() {
      if (busy) return;
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      if (mic) mic.stop();
      busy = true; send.disabled = true; ta.disabled = true; out.innerHTML = "";
      out.appendChild(h("div", { class: "t-reading" }, h("div", { class: "skeleton t-reading-bar" }), h("p", { class: "t-reading-text" }, "Cogna is reading your answer…")));
      // An AI reads it like a teacher (tools/agent-server.mjs /api/judge). If that can't be reached, the old keyword
      // check marks it and the student is told it was a quick check.
      var t0 = Date.now(), ctrl = window.AbortController ? new AbortController() : null;
      timers.push(setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000));
      fetch("/api/judge", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ prompt: step.prompt, keyIdeas: step.keyIdeas || [], text: text }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (ai) {
          var wait = Math.max(0, 900 - (Date.now() - t0));   // a beat of "reading" even when it is fast
          timers.push(setTimeout(function () { show(ai); }, wait));
        });
      function show(ai) {
        if (!el.isConnected) return;
        var verdict = ai ? ai.verdict : judgeExplain(step, text);
        submissions++;
        C.state.recordExplain({ day: ctx.day, stepId: step.id, skill: step.skill, text: text, verdict: verdict, saveAs: step.saveAs,
          by: ai ? "ai" : "keywords", wrongIdea: ai ? ai.wrongIdea : "" });
        out.innerHTML = "";
        var r = ai ? ai.feedback : ((step.responses || {})[verdict] || "");
        var body = h("div", null, h("strong", null, verdict === "strong" ? "That's it." : verdict === "close" ? "Close." : "Let's try again."), " ", r);
        if (verdict === "nudge" && step.starter) body.appendChild(h("span", { class: "t-fb-line t-starter" }, "Try starting like this: " + step.starter));
        if (!ai) body.appendChild(h("span", { class: "t-fb-line t-fb-by" }, "Quick check only: Cogna couldn't read it properly just now."));
        out.appendChild(h("div", { class: "feedback " + (verdict === "strong" ? "feedback-correct t-right" : "feedback-incorrect t-wrong") + " settle" }, icon(verdict === "strong" ? "ok" : "x"), body));
        var canRetry = submissions < 2 && verdict !== "strong";
        if (canRetry) {
          out.appendChild(h("button", { type: "button", class: "btn btn-ghost t-retry", on: { click: function () { out.innerHTML = ""; ta.disabled = false; send.disabled = false; busy = false; send.textContent = "Send again"; ta.focus(); } } }, verdict === "close" ? "Add to your answer" : "Try again"));
        }
        if (verdict !== "close" || !canRetry) ctx.complete();
        busy = false;
        if (resolveAuto) { resolveAuto(); resolveAuto = null; }
      }
    }
    send.addEventListener("click", submit);
    ctx.setAuto(function () {
      if (ctx.isComplete()) return null;
      var kws = (step.keyIdeas || []).map(function (g) { return g[0]; });
      ta.disabled = false; busy = false;
      ta.value = "My answer: it depends on " + (kws.join(" and ") || "the idea we just saw") + " and how they fit together.";
      var p = new Promise(function (res) { resolveAuto = res; });
      submit();
      return p;
    });
  };

  /* ------------------------------------------------------------------ session screen */
  C.screens.session = function (el, params) {
    destroyCurrent();
    var day = params.day, state = C.state;
    var d = (C.data.days || []).filter(function (x) { return x.n === day; })[0];
    var steps = C.plan ? C.plan.forDay(day).steps : ((d && d.steps) || []);   // made-for-you steps first (plan.js)
    var P = { el: el, cleanups: [], auto: null, advance: null, isComplete: function () { return false; } };
    current = P;
    var idx = -1, stepCleanups = [], completed = false, advancing = false;
    var dt = dots(0, "");

    var continueBtn = h("button", { type: "button", class: "btn btn-primary t-continue", disabled: true }, "Continue");
    var barNote = h("span", { class: "t-bar-note" }, "");
    var card = h("div", { class: "card t-step-card", tabindex: "-1" });
    var stage = h("div", { class: "t-stage grid-air" }, card);
    var title = "Day " + day + (d ? " · " + d.title : "");
    var head = h("div", { class: "t-session-head" },
      h("div", null, h("p", { class: "eyebrow" }, "Today"), h("h1", { class: "t-session-title" }, title)),
      h("div", { class: "t-session-tools" }, dt.el, h("a", { class: "btn btn-quiet", href: "#/trail" }, "Leave")));
    var bar = h("div", { class: "t-bar" }, h("div", { class: "t-bar-inner" }, barNote, continueBtn));
    el.appendChild(h("section", { class: "shell t-page t-session" }, head, stage, bar));

    function nextIndex(from) {
      for (var i = from; i < steps.length; i++) {
        var s = steps[i];
        if (s.type === "fix" && !s.carry && !state.shouldShowFix(day, s.mixup)) continue;
        if (state.isStepDone(day, s.id)) continue;
        return i;
      }
      return -1;
    }
    function visible() { return steps.filter(function (s, i) { return s.type !== "fix" || s.carry || i === idx || state.shouldShowFix(day, s.mixup); }); }
    function drawDots() {
      var vis = visible(), cur = vis.indexOf(steps[idx]);
      dt.set(vis.map(function (s, i) { return i < cur || state.isStepDone(day, s.id); }), cur);
      dt.el.setAttribute("aria-label", "Step " + (cur + 1) + " of " + vis.length);
      barNote.textContent = "Step " + (cur + 1) + " of " + vis.length;
    }
    function updateBar() {
      continueBtn.disabled = !completed;
      continueBtn.textContent = nextIndex(idx + 1) === -1 ? "Finish day" : "Continue";
    }
    function finishDay() {
      if (!state.isDayDone(day)) state.completeDay(day);
      C.router.go("#/day/" + day + "/done");
    }
    function advance() {
      if (!completed || advancing) return;
      advancing = true;
      voice.stop();   // the student has moved on: anything still being said belongs to the step they left
      var s = steps[idx];
      if (s) state.completeStep(day, s.id);
      runCleanups(stepCleanups);
      var n = nextIndex(idx + 1);
      if (n === -1) { finishDay(); return; }
      showStep(n);
    }
    P.advance = advance; P.isComplete = function () { return completed; };
    continueBtn.addEventListener("click", advance);

    function showStep(i) {
      runCleanups(stepCleanups);
      idx = i; completed = false; advancing = false; P.auto = null;
      var step = steps[i];
      var fresh = h("div", { class: "card t-step-card phase-in", tabindex: "-1" });
      stage.replaceChild(fresh, card); card = fresh;
      drawDots(); updateBar();
      var ctx = {
        day: day, state: state,
        complete: function () {
          if (completed) return;
          completed = true; updateBar();
          C.bus.emit("step:complete", { day: day, stepId: step.id });
        },
        isComplete: function () { return completed; },
        record: function (info) {
          var o = {}; Object.keys(info).forEach(function (k) { o[k] = info[k]; });
          o.day = day; o.stepId = step.id;
          state.recordAnswer(o);
        },
        next: advance,
        onCleanup: function (fn) { stepCleanups.push(fn); },
        setAuto: function (fn) { P.auto = fn; },
      };
      var render = C.steps[step.type];
      try {
        if (render) render(card, step, ctx);
        else {
          card.appendChild(h("div", { class: "t-placeholder" }, h("p", { class: "t-placeholder-title" }, "This step type (" + step.type + ") isn't ready yet."),
            h("button", { type: "button", class: "btn btn-ghost", on: { click: ctx.complete } }, "Mark done")));
          P.auto = ctx.complete;
        }
      } catch (e) {
        console.error("[session] step failed", step, e);
        card.appendChild(h("div", { class: "t-placeholder" }, h("p", { class: "t-placeholder-title" }, "This step hit a problem: " + e.message),
          h("button", { type: "button", class: "btn btn-ghost", on: { click: ctx.complete } }, "Skip this step")));
        P.auto = ctx.complete;
      }
      window.scrollTo(0, 0);
      try { card.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    P.cleanups.push(function () { runCleanups(stepCleanups); });

    if (!steps.length) {
      dt.el.hidden = true; barNote.textContent = "";
      card.appendChild(h("p", { class: "eyebrow" }, "Content coming"));
      card.appendChild(h("h2", { class: "t-step-title" }, "Today's lesson is still being written"));
      card.appendChild(h("p", { class: "lead" }, "Ms. Rao is putting the finishing touches on this one. You can carry on to see how the next day unlocks."));
      completed = true; continueBtn.disabled = false; continueBtn.textContent = "Continue";
      continueBtn.onclick = function () { finishDay(); };
      continueBtn.removeEventListener("click", advance);
      P.auto = function () {}; P.advance = function () { finishDay(); }; P.isComplete = function () { return true; };
      return;
    }
    var first = nextIndex(0);
    if (first === -1) { finishDay(); return; }
    showStep(first);
  };

  /* ------------------------------------------------------------------ retest screen */
  C.screens.retest = function (el) {
    destroyCurrent();
    var qs = C.data.retest || [], state = C.state;
    var P = { el: el, cleanups: [], auto: null, advance: null, isComplete: function () { return false; } };
    current = P;
    var days = C.data.days || [], d10 = days.filter(function (x) { return x.n === 10; })[0];
    var title = "Day 10 · " + ((d10 && d10.title) || "Check-in again");
    var dt = dots(0, "");
    var btn = h("button", { type: "button", class: "btn btn-primary t-continue", disabled: true }, "See my growth");
    var barNote = h("span", { class: "t-bar-note" }, "");
    var card = h("div", { class: "card t-step-card phase-in", tabindex: "-1" });
    var head = h("div", { class: "t-session-head" },
      h("div", null, h("p", { class: "eyebrow" }, "Same kind of questions as day 0"), h("h1", { class: "t-session-title" }, title)),
      h("div", { class: "t-session-tools" }, dt.el, h("a", { class: "btn btn-quiet", href: "#/trail" }, "Leave")));
    el.appendChild(h("section", { class: "shell t-page t-session" }, head, h("div", { class: "t-stage grid-air" }, card),
      h("div", { class: "t-bar" }, h("div", { class: "t-bar-inner" }, barNote, btn))));

    function toGrowth() { state.completeDay(10); C.router.go("#/growth"); }
    if (!qs.length) {
      dt.el.hidden = true;
      card.appendChild(h("p", { class: "eyebrow" }, "Content coming"));
      card.appendChild(h("h2", { class: "t-step-title" }, "The check-in questions aren't ready yet"));
      card.appendChild(h("p", { class: "lead" }, "Once they're written, you'll answer 12 questions here and then see how far you've come."));
      btn.disabled = false; btn.textContent = "Continue"; btn.addEventListener("click", toGrowth);
      P.auto = function () {}; P.advance = toGrowth; P.isComplete = function () { return true; };
      return;
    }
    var ready = false;
    var host = h("div", { class: "t-qrun" });
    card.appendChild(h("p", { class: "t-retest-intro" }, "Answer on your own. You won't see right or wrong until the end of the course. Pick how sure you are each time."));
    card.appendChild(host);
    var run = runQuestions(host, qs, {
      label: "Check-in", mode: "none", needSure: true,
      record: function (info) { state.recordRetest({ qid: info.qid, skill: info.skill, correct: info.correct, sure: info.sure, answer: info.answer, mixup: info.mixup, guards: info.guards }); },
      onProgress: function (i, n) {
        var all = []; for (var k = 0; k < n; k++) all.push(k < i);
        dt.set(all, i); dt.el.setAttribute("aria-label", "Question " + (i + 1) + " of " + n); barNote.textContent = "Question " + (i + 1) + " of " + n;
      },
      onFinish: function () {
        ready = true; btn.disabled = false; barNote.textContent = "All " + qs.length + " answered";
        host.innerHTML = "";
        host.appendChild(h("div", { class: "t-summary phase-in" }, h("h3", { class: "t-summary-title" }, "All done."), h("p", { class: "lead" }, "Your answers are saved. Press “See my growth” to compare with day 0.")));
        btn.focus();
      },
    });
    btn.addEventListener("click", function () { if (ready) toGrowth(); });
    P.auto = function () { run.auto(); };
    P.advance = function () { if (ready) toGrowth(); };
    P.isComplete = function () { return ready; };
  };

  /* ------------------------------------------------------------------ one lesson on its own: #/lesson/<id> (for demos) */
  C.screens.lesson = function (el, params) {
    var A = C.anims[params.id], blk = animBlock(params.id, { markButton: false });
    el.appendChild(h("section", { class: "shell t-page" },
      h("div", { class: "card t-lesson-page" },
        h("p", { class: "eyebrow" }, "Lesson"),
        h("h1", { class: "t-lesson-page-title" }, A ? A.title : params.id),
        blk.el,
        h("p", { class: "t-lesson-page-foot" }, h("a", { href: "#/trail" }, "Back to the trail")))));
    var off = C.bus.on("route:changed", function () { if (!el.isConnected || !blk.el.isConnected) { try { blk.destroy(); } catch (e) { /* ignore */ } if (typeof off === "function") off(); } });
  };

  /* ------------------------------------------------------------------ demo hooks */
  C.session = {
    autoAnswer: function () {
      if (!current || !current.el.isConnected) return Promise.resolve(false);
      var r = null;
      try { r = current.auto ? current.auto() : null; } catch (e) { console.error("[session] autoAnswer", e); }
      return Promise.resolve(r).then(function () { return true; });
    },
    advance: function () { if (current && current.el.isConnected && current.advance) current.advance(); },
    isComplete: function () { return !!(current && current.el.isConnected && current.isComplete()); },
  };
})();
