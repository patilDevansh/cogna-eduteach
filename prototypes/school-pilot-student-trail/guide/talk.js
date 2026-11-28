/* Cogna guide — live conversation. She listens all the time (once the student allows the
   microphone), notices when they start and stop talking, sends what they said to the local
   server (tools/agent-server.mjs: Sarvam hears it, the model replies, a voice speaks it), and
   answers out loud. She knows the screen they are on and how they are doing, and can take them
   to their report, their trail or today's lesson when asked.
   Only switches on when the page is served by tools/agent-server.mjs (it answers /api/ping). */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h;
  var PREF = "cogna-guide-listen";

  var pill = h("button", { type: "button", class: "cg-mic", "data-state": "off", hidden: true },
    h("span", { class: "cg-mic-dot", "aria-hidden": "true" }),
    h("span", { class: "cg-mic-bars", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"), h("i")),
    h("span", { class: "cg-mic-label" }, "Talk to me"));
  var label = pill.querySelector(".cg-mic-label");
  var bars = Array.prototype.slice.call(pill.querySelectorAll(".cg-mic-bars i"));

  var ears = null, listening = false, busy = false, history = [], reply = null;

  function setState(s, text) { pill.setAttribute("data-state", s); label.textContent = text; }

  /* ------------------------------------------------------------------ ears: always-on voice detection */
  function startEars() {
    if (ears) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var src = ctx.createMediaStreamSource(stream);
        var proc = ctx.createScriptProcessor(2048, 1, 1);
        var rate = ctx.sampleRate, block = 2048 / rate; // seconds per block
        var floor = 0.006, talking = false, loud = 0, quiet = 0, chunks = [], pre = [], len = 0;
        proc.onaudioprocess = function (e) {
          var x = e.inputBuffer.getChannelData(0), sum = 0;
          for (var i = 0; i < x.length; i++) sum += x[i] * x[i];
          var rms = Math.sqrt(sum / x.length);
          // a level meter on the pill
          var lv = Math.min(1, rms / 0.08);
          if (listening) C.guide.setLevel(lv);
          bars.forEach(function (b, k) { b.style.transform = "scaleY(" + (0.25 + lv * (0.6 + 0.4 * Math.sin(k * 1.7 + performance.now() / 90))).toFixed(2) + ")"; });
          if (!listening || busy) { pre = []; return; }
          // while she is talking, only a clearly louder voice counts (lets the student interrupt)
          var herVoice = C.guide.isTalking() || (reply && !reply.paused);
          var thresh = Math.max(0.018, floor * 3.2) * (herVoice ? 2.6 : 1);
          var copy = new Float32Array(x);
          if (!talking) {
            if (rms < thresh) floor = floor * 0.97 + rms * 0.03;
            pre.push(copy); if (pre.length > 6) pre.shift();
            loud = rms > thresh ? loud + 1 : 0;
            if (loud * block > 0.16) { talking = true; quiet = 0; chunks = pre.slice(); len = 0; pre = []; onStart(); }
          } else {
            chunks.push(copy); len += block;
            quiet = rms < thresh * 0.7 ? quiet + 1 : 0;
            if (quiet * block > 0.75 || len > 14) {
              talking = false; loud = 0;
              var dur = chunks.length * block;
              var wav = dur > 0.55 ? toWav(chunks, rate) : null;
              chunks = [];
              if (wav) onUtterance(wav); else onCancel();
            }
          }
        };
        src.connect(proc); proc.connect(ctx.destination);
        ears = { ctx: ctx, stream: stream, proc: proc };
      });
  }
  function stopEars() {
    if (!ears) return;
    try { ears.proc.disconnect(); ears.stream.getTracks().forEach(function (t) { t.stop(); }); ears.ctx.close(); } catch (e) { /* ignore */ }
    ears = null;
  }
  /** Float32 blocks at `rate` -> 16 kHz mono 16-bit WAV, which speech-to-text likes. */
  function toWav(chunks, rate) {
    var total = 0; chunks.forEach(function (c) { total += c.length; });
    var ratio = rate / 16000, n = Math.floor(total / ratio), pcm = new Int16Array(n), flat = new Float32Array(total), o = 0;
    chunks.forEach(function (c) { flat.set(c, o); o += c.length; });
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * ratio), b = Math.min(total, Math.floor((i + 1) * ratio)), s = 0;
      for (var j = a; j < b; j++) s += flat[j];
      var v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    var buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    function w(off, str) { for (var k = 0; k < str.length; k++) dv.setUint8(off + k, str.charCodeAt(k)); }
    w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true);
    dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: "audio/wav" });
  }

  /* ------------------------------------------------------------------ the conversation */
  function onStart() {
    // the student is talking: she stops and listens
    if (reply) { reply.pause(); reply = null; }
    C.guide.stop();
    C.guide.mood("listen");
    setState("hearing", "Listening…");
  }
  function onCancel() { if (!busy) { C.guide.mood("idle"); setState("on", "Listening"); } }

  function screenText() {
    var main = document.getElementById("main");
    var card = main && (main.querySelector(".t-step-card") || main);
    var t = card ? card.innerText : "";
    return t.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n").trim().slice(0, 1400);
  }
  function context() {
    var r = (C.router && C.router.current()) || { name: "welcome", params: {} };
    var st = C.state.get(), s = C.data.student || {};
    var days = C.data.days || [];
    var today = days.filter(function (d) { return d.n === st.unlockedDay; })[0];
    var skills = {};
    (C.data.skills || []).forEach(function (k) { var v = st.skills[k.id]; if (v) skills[k.name] = v.status; });
    var mix = (C.data.mixups || []).filter(function (m) { var v = st.mixups[m.id]; return v && v.seen > 0 && !v.fixed; }).map(function (m) { return m.name; });
    return {
      screen: r.name, screenDay: r.params && r.params.day,
      student: { first: String(s.name || "").split(" ")[0], grade: s.grade, school: s.school, likes: s.interest },
      programme: "A 10-day trail: days 1-2 fix earlier skills, days 3-9 teach Area (Ganita Prakash, class 8), day 10 is a check-in again.",
      today: today ? { day: today.n, title: today.title } : { day: st.unlockedDay },
      daysDone: (st.completedDays || []).filter(function (n) { return n > 0; }),
      skills: skills, mixupsStillOpen: mix,
      onScreen: screenText(),
    };
  }

  /** Ask her something in words (typed, or already heard). */
  function ask(said) {
    said = String(said || "").trim();
    if (!said || busy) return;
    busy = true;
    setState("thinking", "Thinking…");
    C.guide.stop();
    C.guide.thinking(said);
    history.push({ role: "user", text: said });
    fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ said: said, context: context(), history: history.slice(0, -1) }) })
      .then(function (r) { return r.json(); })
      .then(function (rep) { speak(rep, said); })
      .catch(function (e) { console.error("[guide talk]", e); C.guide.show("Sorry, I lost my train of thought. Say that again?", said); done(); });
  }

  function onUtterance(wav) {
    busy = true;
    setState("thinking", "Thinking…");
    C.guide.thinking();
    fetch("/api/hear", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var said = (j && j.text || "").trim();
        if (said.length < 2) { done(); return null; }
        C.guide.thinking(said);
        history.push({ role: "user", text: said });
        return fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ said: said, context: context(), history: history.slice(0, -1) }) })
          .then(function (r) { return r.json(); })
          .then(function (rep) { speak(rep, said); });
      })
      .catch(function (e) { console.error("[guide talk]", e); C.guide.show("Sorry, I couldn't hear that properly. Can you say it again?"); done(); });
  }

  function speak(rep, said) {
    if (!rep || rep.error) { C.guide.show("Sorry, I lost my train of thought. Say that again?", said); done(); return; }
    history.push({ role: "assistant", text: rep.say });
    if (history.length > 20) history = history.slice(-20);
    C.guide.show(rep.say, said);
    setState("on", "Listening");
    busy = false; // she can be interrupted while she talks
    var finish = function () {
      if (reply !== a) return;
      reply = null;
      C.guide.mood("idle");
      act(rep.action);
    };
    var a = null;
    if (rep.voice && (!C.voice || C.voice.isOn())) {
      a = new Audio(rep.voice);
      reply = a;
      a.onended = finish; a.onerror = finish;
      a.play().catch(finish);
    } else { setTimeout(function () { C.guide.mood("idle"); act(rep.action); }, 1800); }
  }
  function done() { busy = false; C.guide.mood("idle"); setState(listening ? "on" : "off", listening ? "Listening" : "Talk to me"); }

  function act(action) {
    var st = C.state.get();
    if (action === "report") C.router.go("#/report");
    else if (action === "trail") C.router.go("#/trail");
    else if (action === "today") C.router.go(st.unlockedDay >= 10 ? "#/retest" : "#/day/" + st.unlockedDay);
  }

  /* ------------------------------------------------------------------ switching listening on and off */
  function turnOn() {
    setState("thinking", "Asking for the mic…");
    startEars().then(function () {
      listening = true; setState("on", "Listening");
      try { window.localStorage.setItem(PREF, "on"); } catch (e) { /* ignore */ }
      if (ears && ears.ctx.state === "suspended") ears.ctx.resume();
      C.guide.say("I'm listening now. Ask me anything, any time.", { quiet: true });
    }).catch(function () {
      setState("off", "Mic is blocked");
      C.guide.say("I can't hear you yet. Allow the microphone in your browser, then tap Talk to me.", { quiet: true, keep: true });
    });
  }
  function turnOff() {
    listening = false; stopEars(); setState("off", "Talk to me");
    try { window.localStorage.setItem(PREF, "off"); } catch (e) { /* ignore */ }
  }
  pill.addEventListener("click", function () { if (listening) turnOff(); else turnOn(); });

  // a reply cut short by leaving the screen stops with it
  C.bus.on("route:changed", function () { if (reply && !busy) { /* let a reply finish across a route change she asked for */ } });

  document.addEventListener("DOMContentLoaded", function () {
    fetch("/api/ping").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.ok) return;
      C.guide.root.appendChild(pill);
      pill.hidden = false;
      var pref = null; try { pref = window.localStorage.getItem(PREF); } catch (e) { /* ignore */ }
      // Browsers only start audio after a tap, so a remembered "on" resumes on the first tap anywhere.
      if (pref === "on") {
        setState("off", "Tap to keep talking");
        document.addEventListener("pointerdown", function once() { document.removeEventListener("pointerdown", once, true); if (!listening) turnOn(); }, true);
      }
    }).catch(function () { /* plain static server: the scripted guide only */ });
  });

  C.guideTalk = { on: turnOn, off: turnOff, ask: ask, context: context };
})();
