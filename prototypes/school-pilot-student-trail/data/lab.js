/* The Area Lab: the Rive Area module (prototypes/rive-area-module) running inside the app.
   Rive's hosted pages refuse to be framed (X-Frame-Options: DENY), so the signed file is served from this folder
   (lab/area-module.riv) and played by Rive's web runtime on a canvas, the way the hosted page does it.
   To update it after changing the module:
     rive prototypes/rive-area-module --publish=web      (this also signs it; the signed file is build/rive-area-module.riv)
     cp prototypes/rive-area-module/build/rive-area-module.riv prototypes/school-pilot-student-trail/lab/area-module.riv
   The module opens on its lesson list and has no deep link, so a lab step tells the student which lesson to tap. */
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

  C.lab = {
    src: "lab/area-module.riv",
    lessons: {
      1: "Area is counting squares", 2: "Fence or land?", 3: "The wonky field", 4: "Two triangles, one field",
      5: "Two parallel sides", 6: "Awkward corners", 7: "Square metres, square centimetres",
    },
    /** Play the module on a canvas inside `host`. Returns { destroy }. onError(message) if it cannot start. */
    mount: function (host, onError) {
      var canvas = document.createElement("canvas");
      canvas.className = "t-lab-canvas"; canvas.tabIndex = 0; canvas.setAttribute("aria-label", "Area Lab. Keys: left and right arrows step, Escape goes back to the lessons.");
      host.appendChild(canvas);
      var inst = null, dead = false;
      loadRuntime().then(function (rive) {
        if (dead) return;
        inst = new rive.Rive({
          src: C.lab.src, canvas: canvas, autoplay: true, stateMachines: "State Machine 1",
          layout: new rive.Layout({ fit: "contain", alignment: "center" }),
          onLoad: function () { try { inst.resizeDrawingSurfaceToCanvas(); } catch (e) { /* ignore */ } },
          onLoadError: function (e) { if (!dead && onError) onError("The Area Lab could not start" + (e && e.data ? ": " + e.data : ".")); },
        });
      }).catch(function (e) { if (!dead && onError) onError(e.message || "The Area Lab could not start."); });
      function resize() { try { inst && inst.resizeDrawingSurfaceToCanvas(); } catch (e) { /* ignore */ } }
      window.addEventListener("resize", resize);
      return {
        destroy: function () { dead = true; window.removeEventListener("resize", resize); try { inst && inst.cleanup(); } catch (e) { /* ignore */ } if (canvas.parentNode) canvas.parentNode.removeChild(canvas); },
      };
    },
  };
})();
