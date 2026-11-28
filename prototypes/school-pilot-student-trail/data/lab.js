/* The Area lessons: the Rive Area module (prototypes/rive-area-module) playing inside the app.
   Rive's hosted pages refuse to be framed (X-Frame-Options: DENY), so the signed file is served from this folder
   (lab/area-module.riv) and played by Rive's web runtime on a canvas.
   To update it after changing the module:
     rive prototypes/rive-area-module --publish=web      (this also signs it; the signed file is build/rive-area-module.riv)
     cp prototypes/rive-area-module/build/rive-area-module.riv prototypes/school-pilot-student-trail/lab/area-module.riv

   The page and the module talk through the module's AreaBridge view model (see main.luau, initBridge):
     lesson     page → module   opens that lesson straight away (no lesson list, no "All lessons")
     hostVoice  page → module   the page speaks every line with the app's own voice player
     say/sayId  module → page   the line to say now ('' = stop)
     heard      page → module   the last sayId the page finished (spoken, cut short or skipped)
     answer/answerId  module → page   'qid|1 or 0|value|mixup' for every answer the student gives
     done       module → page   the lesson just completed */
(function () {
  "use strict";
  var C = window.Cogna = window.Cogna || {};
  var RUNTIME = "https://cdn.jsdelivr.net/npm/@rive-app/webgl2@2.52.0/rive.js";
  var loading = null;

  function loadRuntime() {
    if (window.rive && window.rive.Rive) return Promise.resolve(window.rive);
    if (!loading) loading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = RUNTIME; s.async = true;
      s.onload = function () { window.rive && window.rive.Rive ? res(window.rive) : rej(new Error("Rive runtime did not start")); };
      s.onerror = function () { loading = null; rej(new Error("Could not load the Rive runtime (offline?)")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /** "qid|1|value|mixup" -> { qid, correct, value, mixup } */
  function readAnswer(raw) {
    var p = String(raw || "").split("|");
    if (p.length < 3 || !p[0]) return null;
    return { qid: p[0], correct: p[1] === "1", value: p[2], mixup: p[3] || null };
  }

  C.lab = {
    src: "lab/area-module.riv",
    lessons: {
      1: "Kavin's kolam patch", 2: "Rope or space?", 3: "The corner house", 4: "Tenzin's greenhouse wall",
      5: "Kiran's funbox", 6: "Imran's island", 7: "The kitchen floor", 8: "Fiza's kites", 9: "Where is the height?",
    },
    /**
     * Play the module on a canvas inside `host`.
     * o: { lesson: n, onLine(text, done), onStop(), onAnswer({ qid, correct, value, mixup }), onDone(n), onError(message) }
     * Returns { destroy, open(n) }. Without o.lesson the module opens on its lesson list.
     */
    mount: function (host, o) {
      if (typeof o === "function") o = { onError: o };   // the old signature: mount(host, onError)
      o = o || {};
      var canvas = document.createElement("canvas");
      canvas.className = "t-lab-canvas"; canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", "Area lesson. Use your finger, mouse or arrow keys; Next moves on.");
      host.appendChild(canvas);
      var inst = null, vmi = null, dead = false, lastSay = 0, lastAnswer = 0, lastDone = 0, spoken = 0;

      function prop(kind, name) { try { return vmi && vmi[kind] ? vmi[kind](name) : null; } catch (e) { return null; } }
      function setNum(name, v) { var p = prop("number", name); if (p) p.value = v; }
      function heard(id) { if (!dead && id > spoken) { spoken = id; setNum("heard", id); } }

      function onSay() {
        var id = Number((prop("number", "sayId") || {}).value || 0);
        if (!id || id === lastSay) return;
        lastSay = id;
        var text = String((prop("string", "say") || {}).value || "");
        if (!text) { if (o.onStop) o.onStop(); heard(id); return; }
        if (o.onLine) o.onLine(text, function () { heard(id); });
        else heard(id);
      }
      function onAnswer() {
        var id = Number((prop("number", "answerId") || {}).value || 0);
        if (!id || id === lastAnswer) return;
        lastAnswer = id;
        var a = readAnswer((prop("string", "answer") || {}).value);
        if (a && o.onAnswer) o.onAnswer(a);
      }
      function onDone() {
        var n = Number((prop("number", "done") || {}).value || 0);
        if (!n || n === lastDone) return;
        lastDone = n;
        if (o.onDone) o.onDone(n);
      }
      function listen(kind, name, fn) { var p = prop(kind, name); if (p && p.on) p.on(fn); }

      loadRuntime().then(function (rive) {
        if (dead) return;
        inst = new rive.Rive({
          src: C.lab.src, canvas: canvas, autoplay: true, stateMachines: "State Machine 1", autoBind: true,
          layout: new rive.Layout({ fit: "contain", alignment: "center" }),
          onLoad: function () {
            if (dead) return;
            try { inst.resizeDrawingSurfaceToCanvas(); } catch (e) { /* ignore */ }
            vmi = inst.viewModelInstance || null;
            if (!vmi) { if (o.onError) o.onError("The lesson could not connect to the page."); return; }
            listen("number", "sayId", onSay);
            listen("number", "answerId", onAnswer);
            listen("number", "done", onDone);
            var hv = prop("boolean", "hostVoice"); if (hv) hv.value = !!o.onLine;
            if (o.lesson) setNum("lesson", o.lesson);
            try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
            if (o.onReady) o.onReady();
          },
          onLoadError: function (e) { if (!dead && o.onError) o.onError("The lesson could not start" + (e && e.data ? ": " + e.data : ".")); },
        });
      }).catch(function (e) { if (!dead && o.onError) o.onError(e.message || "The lesson could not start."); });

      function resize() { try { inst && inst.resizeDrawingSurfaceToCanvas(); } catch (e) { /* ignore */ } }
      window.addEventListener("resize", resize);
      return {
        /** Open another lesson in the same player (the next part of a day). */
        open: function (n) { lastDone = 0; setNum("lesson", n); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } },
        destroy: function () {
          dead = true; window.removeEventListener("resize", resize);
          if (o.onStop) try { o.onStop(); } catch (e) { /* ignore */ }
          try { inst && inst.cleanup(); } catch (e) { /* ignore */ }
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
      };
    },
  };
})();
