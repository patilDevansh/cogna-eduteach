/* Cogna guide — an animated orb who walks the student through the whole prototype.
   She greets them, flies beside whatever she is talking about and rings it, tours the report,
   points at today's day, introduces each lesson step, reacts to right and wrong answers
   (with the mix-up's own words), and cheers a finished day.

   Built on top of the app, not inside it: she listens to the router's "route:changed" and the
   state's "state:changed" events and reads the page, so the contract files (core.js, router.js,
   state.js) stay untouched. Her voice goes through the app's own player (Cogna.voice, in
   screens/session.js), so the student's Sound on/off is respected and she never talks over
   a lesson line. Lines live in guide/script.js; recordings are made by tools/record-guide.mjs. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, S = C.guideScript, L = S.lines;
  var SEEN_KEY = "cogna-guide-seen";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Her recordings join the app's narration map, so Cogna.voice plays them by text.
  if (C.guideNarration) {
    C.narration = C.narration || {};
    Object.keys(C.guideNarration).forEach(function (k) { if (!C.narration[k]) C.narration[k] = C.guideNarration[k]; });
  }

  /* ------------------------------------------------------------------ memory of what she has shown */
  var seen = {};
  try { seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch (e) { seen = {}; }
  function markSeen(k) { seen[k] = true; try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* ignore */ } }
  // ?guide=reset in the address bar starts her from the beginning (handy for demos).
  if (/[?&]guide=reset\b/.test(window.location.search)) { seen = {}; try { window.localStorage.removeItem(SEEN_KEY); } catch (e) { /* ignore */ } }

  /* ------------------------------------------------------------------ the orb */
  // her body is drawn on a canvas by guide/creature.js (Maji, a lion cub, from a sprite sheet)
  var DPR = Math.min(2, window.devicePixelRatio || 1), CANVAS = 112;
  var canvas = h("canvas", { class: "cg-canvas", width: CANVAS * DPR, height: CANVAS * DPR, "aria-hidden": "true" });
  var creature = C.guideCreature.create(canvas);
  var level = 0;
  var body = h("span", { class: "cg-body" }, canvas);
  var orb = h("button", { type: "button", class: "cg-orb", "aria-label": "Maji, your guide. Tap to hear that again." },
    h("span", { class: "cg-ring" }), body);
  var shadow = h("span", { class: "cg-shadow", "aria-hidden": "true" });
  var text = h("p", { class: "cg-text" });
  var heard = h("p", { class: "cg-heard", hidden: true });
  var nextBtn = h("button", { type: "button", class: "cg-btn cg-next" }, "Next");
  var skipBtn = h("button", { type: "button", class: "cg-btn cg-skip" }, "Skip tour");
  var hideBtn = h("button", { type: "button", class: "cg-x", "aria-label": "Hide the guide's message" }, "×");
  var bubble = h("div", { class: "cg-bubble", role: "status", "aria-live": "polite", hidden: true },
    h("span", { class: "cg-name" }, "Maji"), hideBtn, heard, text, h("div", { class: "cg-actions" }, nextBtn, skipBtn));
  var spot = h("div", { class: "cg-spot", "aria-hidden": "true", hidden: true });
  var sparks = h("div", { class: "cg-sparks", "aria-hidden": "true" });
  var root = h("div", { class: "cg-guide", "data-mood": "idle" }, shadow, orb, sparks);

  var SIZE = 64;
  var pos = { x: -120, y: window.innerHeight - 160 }, vel = { x: 0, y: 0 }, goal = { x: 28, y: window.innerHeight - 170 };
  var target = null, look = null, docked = true, hop = 0, shake = 0, t0 = performance.now();

  function narrow() { return window.innerWidth < 760; }
  function dockGoal() {
    var bar = document.querySelector(".t-bar");
    var bottom = bar ? bar.getBoundingClientRect().height + 24 : 28;
    // on a phone she sits bottom-left, clear of the Demo button
    return narrow() ? { x: 16, y: window.innerHeight - SIZE - bottom - 40 }
      : { x: 28, y: window.innerHeight - SIZE - bottom - 8 };
  }
  /** Where to sit beside an element: right of small things, on the top-right corner of big ones. */
  function besideGoal(r) {
    var vw = window.innerWidth, vh = window.innerHeight, x, y;
    if (narrow()) return dockGoal();
    if (r.width < 380 && r.right + SIZE + 28 < vw) { x = r.right + 18; y = r.top + r.height / 2 - SIZE / 2; }
    else if (r.width < 380 && r.left - SIZE - 28 > 0) { x = r.left - SIZE - 18; y = r.top + r.height / 2 - SIZE / 2; }
    else { x = Math.min(r.right - SIZE * 0.55, vw - SIZE - 14); y = r.top - SIZE * 0.55; }
    return { x: Math.max(12, Math.min(vw - SIZE - 12, x)), y: Math.max(70, Math.min(vh - SIZE - 12, y)) };
  }

  /* One frame: a soft spring toward the goal, a little bob, squash with speed, eyes on the target. */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = (now - t0) / 1000;
    var r = target && target.isConnected ? target.getBoundingClientRect() : null;
    if (target && !target.isConnected) setTarget(null);
    goal = r && !docked ? besideGoal(r) : dockGoal();

    if (reduce) { pos.x = goal.x; pos.y = goal.y; vel.x = vel.y = 0; }
    else {
      var k = 60, damp = 12;
      vel.x += ((goal.x - pos.x) * k - vel.x * damp) * dt;
      vel.y += ((goal.y - pos.y) * k - vel.y * damp) * dt;
      pos.x += vel.x * dt; pos.y += vel.y * dt;
    }
    var speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    hop = Math.max(0, hop - dt * 2.2);
    shake = Math.max(0, shake - dt * 2.5);
    var bob = reduce ? 0 : Math.sin(t * 2.2) * 4;
    var jump = Math.sin(hop * Math.PI) * 26 * (hop > 0 ? 1 : 0);
    var sx = reduce ? 1 : 1 + Math.min(0.18, speed / 4000) - Math.sin(hop * Math.PI * 2) * 0.06 * (hop > 0 ? 1 : 0);
    var sy = reduce ? 1 : 1 / sx;
    var tilt = reduce ? 0 : Math.max(-14, Math.min(14, vel.x / 60)) + Math.sin(shake * 30) * 10 * shake;
    var lift = bob - jump;
    root.style.transform = "translate(" + pos.x.toFixed(1) + "px," + pos.y.toFixed(1) + "px)";
    orb.style.transform = "translateY(" + lift.toFixed(1) + "px) rotate(" + tilt.toFixed(1) + "deg) scale(" + sx.toFixed(3) + "," + sy.toFixed(3) + ")";
    var high = (-lift + 10) / 40; // higher up: smaller, fainter shadow
    shadow.style.transform = "scale(" + (1 - high * 0.35).toFixed(3) + ")";
    shadow.style.opacity = String((0.55 - high * 0.3).toFixed(3));

    // eyes follow the thing she is talking about (or the pointer)
    var lx = 0, ly = 0, focus = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : look;
    if (focus) {
      var dx = focus.x - (pos.x + SIZE / 2), dy = focus.y - (pos.y + SIZE / 2), d = Math.sqrt(dx * dx + dy * dy) || 1;
      lx = dx / d * 3.2; ly = dy / d * 2.6;
    }
    level *= Math.exp(-dt * 8);
    creature.draw(dt, root.getAttribute("data-mood") || "idle", { x: lx / 3.2, y: ly / 2.6 }, level);

    if (r && !spot.hidden) placeSpot(r);
    placeBubble();
    window.requestAnimationFrame(frame);
  }

  function placeSpot(r) {
    var pad = 8;
    spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
    spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
  }
  function placeBubble() {
    if (bubble.hidden) return;
    var vw = window.innerWidth, vh = window.innerHeight, bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (narrow()) {
      bubble.style.left = "12px"; bubble.style.right = "12px";
      bubble.style.top = Math.max(70, pos.y - bh - 14) + "px";
      return;
    }
    bubble.style.right = "auto";
    var pill = root.querySelector(".cg-mic:not([hidden])"), gap = 14 + (pill ? 46 : 0); // room for the Talk to me pill
    var cx = pos.x + SIZE / 2, below = pos.y + SIZE + gap + bh < vh - 12;
    var x = cx > vw / 2 ? pos.x + SIZE - bw : pos.x;
    var y = below ? pos.y + SIZE + gap : pos.y - bh - 14;
    bubble.style.left = Math.max(12, Math.min(vw - bw - 12, x)) + "px";
    bubble.style.top = Math.max(70, Math.min(vh - bh - 12, y)) + "px";
    bubble.setAttribute("data-side", cx > vw / 2 ? "right" : "left");
  }

  function setTarget(el, ring) {
    target = el || null;
    docked = !el;
    if (el && ring !== false) { spot.hidden = false; spot.style.borderRadius = getComputedStyle(el).borderRadius || "14px"; placeSpot(el.getBoundingClientRect()); }
    else spot.hidden = true;
  }
  function mood(m) { root.setAttribute("data-mood", m); }
  function cheer() {
    mood("happy"); hop = 1;
    sparks.innerHTML = "";
    if (!reduce) for (var i = 0; i < 10; i++) {
      var a = i / 10 * Math.PI * 2, d = 38 + (i % 3) * 10;
      sparks.appendChild(h("i", { style: { "--dx": (Math.cos(a) * d).toFixed(0) + "px", "--dy": (Math.sin(a) * d).toFixed(0) + "px", "--d": (i % 4) * 40 + "ms" } }));
    }
    setTimeout(function () { if (root.getAttribute("data-mood") === "happy") mood("idle"); }, 1400);
  }
  function oops() { mood("oops"); shake = 1; setTimeout(function () { if (root.getAttribute("data-mood") === "oops") mood("idle"); }, 1600); }

  /* ------------------------------------------------------------------ speaking */
  var token = 0, lastLine = null, lastOpts = null, hideTimer = null;
  function readMs(s) { return Math.max(2400, String(s).split(/\s+/).length * 330); }

  /** Out of sight: a lesson's own presenter is on stage (guide.css hides her) or a step has put her away (the Area
      lessons). She never speaks from nowhere. */
  function outOfSight() { try { return window.getComputedStyle(root).display === "none"; } catch (e) { return false; } }

  /** Show a line in the bubble and say it. opts: {quiet, then(), tour, keep, speak}
      speak: say these words instead of the whole line (the bubble still shows the whole line).
      A spoken line appears when her voice gets to it (the app's voice says one line at a time), so the bubble and the
      voice stay together. Out of sight she shows and says nothing. */
  function say(line, opts) {
    opts = opts || {};
    var my = ++token;
    clearTimeout(hideTimer);
    lastLine = line; lastOpts = opts;
    var hidden = outOfSight();
    function show() {
      if (my !== token || hidden) return;
      text.textContent = line;
      if (opts.heard) { heard.textContent = "You: " + opts.heard; heard.hidden = false; } else heard.hidden = true;
      nextBtn.hidden = !opts.tour; skipBtn.hidden = !opts.tour;
      nextBtn.textContent = opts.last ? "Done" : "Next";
      bubble.hidden = false;
      bubble.classList.remove("cg-pop"); void bubble.offsetWidth; bubble.classList.add("cg-pop");
      if (root.getAttribute("data-mood") !== "happy") mood("talk");
    }
    var finished = false;
    function done(spoken) {
      if (finished || my !== token) return;
      finished = true;
      if (root.getAttribute("data-mood") === "talk") mood("idle");
      var wait = spoken ? 700 : readMs(line);
      if (opts.then) hideTimer = setTimeout(function () { if (my === token) opts.then(); }, wait);
      else if (!opts.keep) hideTimer = setTimeout(function () { if (my === token) bubble.hidden = true; }, wait + 2600);
    }
    if (hidden || opts.quiet || !C.voice || !C.voice.isOn()) { show(); done(false); return; }
    C.voice.say(opts.speak || line, done, { tag: "guide", onStart: show });
  }
  function hush() { token++; clearTimeout(hideTimer); bubble.hidden = true; if (root.getAttribute("data-mood") === "talk") mood("idle"); }

  /* ------------------------------------------------------------------ tours: a list of stops */
  var tour = null;
  function runTour(stops, key) {
    tour = { stops: stops, i: -1, key: key };
    stepTour();
  }
  function stepTour() {
    if (!tour) return;
    tour.i += 1;
    var st = tour.stops[tour.i];
    if (!st) { endTour(); return; }
    var el = typeof st.el === "function" ? st.el() : document.querySelector(st.el);
    if (!el) { stepTour(); return; }
    var big = el.getBoundingClientRect().height > window.innerHeight * 0.6;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: big ? "start" : "center" });
    var me = tour;
    setTimeout(function () {
      if (tour !== me) return;
      setTarget(el, st.ring);
      say(st.line, { tour: tour.stops.length > 1, last: tour.i === tour.stops.length - 1, then: function () { if (tour === me) stepTour(); } });
    }, reduce ? 0 : 520);
  }
  function endTour() {
    if (tour && tour.key) markSeen(tour.key);
    var t = tour; tour = null;
    if (t && t.after) t.after();
  }
  nextBtn.addEventListener("click", function () { if (C.voice) C.voice.stop(); if (tour) stepTour(); else hush(); });
  skipBtn.addEventListener("click", function () {
    if (C.voice) C.voice.stop();
    var t = tour; if (!t) { hush(); return; }
    // skipping still lands on the last stop (the thing to tap next)
    t.i = t.stops.length - 2; stepTour();
  });
  hideBtn.addEventListener("click", function () { if (C.voice) C.voice.stop(); tour = null; hush(); setTarget(null); });
  orb.addEventListener("click", function () {
    var r = C.router && C.router.current();
    if (r && tourFor[r.name]) { tourFor[r.name](true); return; }
    if (lastLine) say(lastLine, { tour: false, keep: lastOpts && lastOpts.keep });
  });
  document.addEventListener("pointermove", function (e) { look = { x: e.clientX, y: e.clientY }; }, { passive: true });

  /* ------------------------------------------------------------------ what she does on each screen */
  function first() { return String((C.data.student || {}).name || "").split(" ")[0]; }
  function dayOf(n) { return (C.data.days || []).filter(function (d) { return d.n === n; })[0]; }
  function q(sel) { return document.querySelector(sel); }

  var tourFor = {
    welcome: function () {
      var back = seen.welcome;
      setTarget(q(".t-welcome .btn-primary"));
      say(S.fill(back ? L.welcomeBack : L.welcomeFirst, { first: first() }), { keep: true });
      markSeen("welcome");
    },
    report: function (again) {
      var secs = Array.prototype.slice.call(document.querySelectorAll("#main .t-section"));
      if (seen.report && !again) {
        setTarget(q("#main .t-cta"));
        say(L.reportBack, { keep: true });
        return;
      }
      var stops = L.report.map(function (line, i) {
        var el = i === 5 ? (secs[5] && secs[5].querySelector(".t-cta")) || secs[5] : secs[i];
        return { el: function () { return el; }, line: line };
      });
      runTour(stops, "report");
    },
    trail: function (again) {
      var st = C.state.get(), n = st.unlockedDay;
      var today = function () { return q('.t-daynode[data-state="today"] .t-daycard'); };
      var todayLine = n >= 10 ? S.fill(L.trailCheck, { first: first() }) : S.fill(L.trailToday, { n: n, title: (dayOf(n) || {}).title || "" });
      var stops = [];
      if (!seen.trail || again) {
        stops.push({ el: ".t-trail-head", line: L.trailFirst, ring: false });
        if (q(".t-meters") && !narrow()) stops.push({ el: ".t-meters", line: L.trailMeters });
      }
      stops.push({ el: today, line: todayLine });
      runTour(stops, "trail");
      if (stops.length === 1) { nextBtn.hidden = true; skipBtn.hidden = true; }
    },
  };

  /* Lesson days: she docks in the corner, introduces each kind of step the first time it appears, and reacts to answers
     sparingly: the cards already say right or wrong, and lessons speak for themselves. */
  var session = null;
  // steps where she says nothing about answers: lessons and the Area lessons (they have their own presenter and
  // reactions), the exit check (no feedback until its summary, by design) and "try first" (nothing is marked there)
  var QUIET = { animation: 1, rive: 1, exit: 1, try: 1 };
  // steps where she never points at Continue: the card already says it (games, the Area lessons, the end of every
  // question set), so she would only repeat it
  var NO_NUDGE = { rive: 1, game: 1, recall: 1, practice: 1, exit: 1, try: 1, adaptive: 1 };
  /** The step the student is on: the same list and rules as the session player (screens/session.js), so the made-for-you
      steps from plan.js come first. */
  function currentStep(day) {
    var steps = C.plan ? C.plan.forDay(day).steps : ((dayOf(day) || {}).steps || []);
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.type === "fix" && !s.carry && !C.state.shouldShowFix(day, s.mixup)) continue;
      if (C.state.isStepDone(day, s.id)) continue;
      return s;
    }
    return null;
  }
  function startSession(day) {
    var main = q("#main"); if (!main) return;
    var d = dayOf(day);
    // started from the beginning: every new card gets its intro, even if a quick first answer interrupts the greeting
    session = { day: day, step: null, hints: 0, rights: 0, rightsAt: null, run: 0, logLen: C.state.get().log.length,
      obs: null, cardEl: null, contTimer: null, started: true };
    setTarget(null);
    var me = session;
    // The trail has just said the day out loud, so the greeting is shown, not said. On the student's very first day she
    // adds one warm line out loud, unless the day opens with a piece that plays by itself (it has the floor).
    var opening = currentStep(day), warm = !seen.session && !(opening && opening.autoplay);
    markSeen("session");
    var line = S.fill(L.sessionStart, { n: day, title: d ? d.title : "" });
    var opts = { then: function () { if (session === me) introStep(); } };
    if (warm) { line += " " + L.sessionWarm; opts.speak = L.sessionWarm; } else opts.quiet = true;
    say(line, opts);
    me.obs = new MutationObserver(function () {
      if (session !== me) return;
      var card = q("#main .t-step-card");
      if (card && card !== me.cardEl) { me.cardEl = card; if (me.started) introStep(); }
      watchContinue();
    });
    me.obs.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    me.cardEl = q("#main .t-step-card");
  }
  function introStep() {
    var me = session; if (!me) return;
    var s = currentStep(me.day);
    if (!s || (me.step && s.id === me.step.id)) return;
    me.step = s;
    clearTimeout(me.contTimer); me.contTimer = null;
    if (C.voice) C.voice.stop("guide");   // what she was still saying belonged to the step the student has left
    setTarget(null);
    var line = L.step[s.type];
    if (!line) { hush(); return; }        // lessons, fixes and the Area lessons speak for themselves
    // said out loud the first time this kind of step appears on the trail, only shown after that
    var key = "step-" + s.type, firstTime = !seen[key];
    markSeen(key);
    say(line, { quiet: !firstTime });
  }
  /** a card that already tells the student to press Continue */
  function cardSaysContinue() { var card = q("#main .t-step-card"); return !!card && /\bcontinue\b/i.test(card.textContent || ""); }
  /* When a step is finished and the student lingers, point at Continue: once a day at most, never where the card already
     says it, and never while she is out of sight. */
  function watchContinue() {
    var me = session; if (!me) return;
    var btn = q("#main .t-continue");
    if (!btn || btn.disabled) { clearTimeout(me.contTimer); me.contTimer = null; if (target === btn) setTarget(null); return; }
    if (me.contTimer || me.hints >= 1) return;
    var s = me.step;
    if (!s || NO_NUDGE[s.type]) return;
    var stepAt = s.id;
    me.contTimer = setTimeout(function () {
      if (session !== me || btn.disabled || !btn.isConnected || !me.step || me.step.id !== stepAt) return;
      if (outOfSight() || cardSaysContinue()) return;
      me.hints++;
      docked = true; target = btn; spot.hidden = false; spot.style.borderRadius = "999px"; placeSpot(btn.getBoundingClientRect());
      say(L.continueHint);
    }, 3500);
  }
  function endSession() {
    if (!session) return;
    if (session.obs) session.obs.disconnect();
    clearTimeout(session.contTimer);
    session = null;
  }
  var rightIx = 0;
  C.bus.on("state:changed", function (st) {
    var me = session; if (!me || !st || !st.log) return;
    var fresh = st.log.slice(me.logLen); me.logLen = st.log.length;
    var mine = fresh.filter(function (e) { return e.day === me.day && e.answer !== "(explanation)"; });
    if (!mine.length) return;
    var e = mine[mine.length - 1];
    var s = currentStep(me.day) || me.step;   // the answer belongs to the step on screen (it is marked done on Continue)
    if (!s || QUIET[s.type]) return;
    if (s.type === "game" && !/-done$/.test(String(e.qid || ""))) return;   // single moves in a game: only finishing counts
    if (me.rightsAt !== s.id) { me.rightsAt = s.id; me.rights = 0; }
    if (e.correct) {
      me.rights++; me.run++;
      if (s.reactions) return;   // the step plays its own sound and pop on every answer
      // praise: the first right answer in a set, and a run of three right answers in a row (once; a wrong answer starts
      // a new run)
      var praise = me.rights === 1 ? L.right[rightIx++ % L.right.length] : (me.run === 3 ? L.streak : null);
      if (praise) { cheer(); say(praise); }
      return;
    }
    me.run = 0;
    oops();
    // The feedback is drawn right after this event, so look at it on the next tick. A wrong answer that opens a mistake
    // replay gets no line from her (the replay is the reaction). While a try is left the card already says "Not quite.
    // Have another look.", so she only shows it. Once the answer is on screen she names the mix-up, or points at the working.
    var REPLAY = "#main .t-replay, #main .t-adapt-fix";   // a mistake replay, or Day 1's "closer look"
    var replays = document.querySelectorAll(REPLAY).length;
    setTimeout(function () {
      if (session !== me) return;
      if (document.querySelectorAll(REPLAY).length > replays) return;
      var card = q("#main .t-step-card");
      if (card && card.querySelector(".t-fb .t-retry")) { say(L.wrong, { quiet: true }); return; }
      say(e.mixup && L.mixup[e.mixup] ? L.mixup[e.mixup] : L.wrongFinal);
    }, 0);
  });

  var handled = null;
  function onRoute(route) {
    if (!route || route === handled) return; // the first screen can be announced twice at load
    handled = route;
    tour = null; hush(); endSession(); setTarget(null); mood("idle");
    var name = route && route.name;
    // let the screen draw and settle first
    setTimeout(function () {
      if (!C.router || C.router.current() !== route) return;
      if (tourFor[name]) tourFor[name]();
      else if (name === "session") startSession(route.params.day);
      else if (name === "dayDone") {
        setTarget(q("#main .t-moved") || q("#main .card"));
        cheer(); say(L.dayDone, { keep: true });   // the screen already says "Day N done"
      } else if (name === "retest") say(S.fill(L.retest, { first: first() }));
      else if (name === "growth") {
        setTarget(q("#main .t-big"));
        cheer(); say(S.fill(L.growth, { first: first() }), { keep: true });
      }
    }, reduce ? 50 : 650);
  }
  C.bus.on("route:changed", onRoute);

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(spot);
    document.body.appendChild(bubble);
    document.body.appendChild(root);
    pos = { x: narrow() ? window.innerWidth + 40 : -120, y: window.innerHeight - 180 };
    window.requestAnimationFrame(frame);
    // the router renders before we are attached; catch up with the first screen
    var r = C.router && C.router.current();
    if (r) onRoute(r);
  });

  C.guide = {
    say: say, cheer: cheer, oops: oops, point: setTarget, mood: mood, root: root,
    /** the student's voice level while she listens, 0..1 (makes her edge ripple) */
    setLevel: function (v) { level = Math.max(level, v); },
    isTalking: function () { return root.getAttribute("data-mood") === "talk"; },
    /** Stop whatever she is doing (tour, line, pointing) so the student can talk to her. */
    stop: function () { tour = null; if (C.voice) C.voice.stop(); hush(); },
    /** Show a reply that is voiced elsewhere (the live conversation). */
    show: function (line, heardText) { say(line, { quiet: true, keep: true, heard: heardText }); mood("talk"); },
    thinking: function (heardText) {
      tour = null; clearTimeout(hideTimer); token++;
      text.textContent = "Let me think…";
      if (heardText) { heard.textContent = "You: " + heardText; heard.hidden = false; } else heard.hidden = true;
      nextBtn.hidden = true; skipBtn.hidden = true; bubble.hidden = false; mood("think");
    },
    replay: function () { seen = {}; try { window.localStorage.removeItem(SEEN_KEY); } catch (e) { /* ignore */ } } };
})();
