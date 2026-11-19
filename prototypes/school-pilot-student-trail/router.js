/* Cogna prototype — hash router + top bar. Loaded LAST; boots the app.
   CONTRACT FILE (owned by the orchestrator).

   Routes -> screen registry names (Cogna.screens[name](el, params)):
     #/welcome          -> 'welcome'
     #/report           -> 'report'
     #/trail            -> 'trail'
     #/day/N            -> 'session'   params {day:N}
     #/day/N/review     -> 'review'    params {day:N}   (read-only replay of a finished day)
     #/day/N/done       -> 'dayDone'   params {day:N}
     #/retest           -> 'retest'
     #/growth           -> 'growth'
     #/lesson/<id>      -> 'lesson'    params {id}      (one lesson on its own, for demos)
*/
(function () {
  "use strict";
  var C = window.Cogna;
  var h = C.h;

  var ROUTES = [
    { re: /^\/?$/, name: "welcome" },
    { re: /^\/welcome$/, name: "welcome" },
    { re: /^\/report$/, name: "report" },
    { re: /^\/trail$/, name: "trail" },
    { re: /^\/day\/(\d+)$/, name: "session", day: true },
    { re: /^\/day\/(\d+)\/review$/, name: "review", day: true },
    { re: /^\/day\/(\d+)\/done$/, name: "dayDone", day: true },
    { re: /^\/retest$/, name: "retest" },
    { re: /^\/growth$/, name: "growth" },
    { re: /^\/lesson\/([a-z0-9-]+)$/, name: "lesson", id: true },
  ];

  function parse(hash) {
    var path = (hash || "").replace(/^#/, "");
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i].re);
      if (m) return { name: ROUTES[i].name, params: ROUTES[i].day ? { day: parseInt(m[1], 10) } : (ROUTES[i].id ? { id: m[1] } : {}), path: path };
    }
    return { name: "welcome", params: {}, path: "/welcome" };
  }

  function topbar(route) {
    var s = C.data.student || {};
    function link(href, label, active) {
      return h("a", { href: href, "aria-current": active ? "page" : null, class: active ? "t-navlink is-active" : "t-navlink" }, label);
    }
    return h("header", { class: "shell topbar t-topbar" },
      h("a", { class: "wordmark", href: "#/welcome", "aria-label": "Cogna home" }, "cogna", h("span", { class: "dot" }, ".")),
      h("nav", { class: "topbar-links", "aria-label": "Main" },
        link("#/report", "Report", route.name === "report"),
        link("#/trail", "My 2 weeks", ["trail", "session", "dayDone", "review"].indexOf(route.name) !== -1),
        h("span", { class: "t-who" }, (s.name || "").split(" ")[0] + " · " + (s.grade || ""))
      )
    );
  }

  function todo(el, name) {
    el.appendChild(h("section", { class: "shell t-page" },
      h("div", { class: "card" }, h("p", { class: "eyebrow" }, "Coming soon"), h("h2", null, "Screen “" + name + "” isn’t built yet."))));
  }

  var current = null;
  function render() {
    var route = parse(window.location.hash);
    var st = C.state.get();
    // Guard: locked days go back to the trail.
    if ((route.name === "session") && route.params.day > st.unlockedDay) { go("#/trail"); return; }
    if (route.name === "session" && route.params.day === 10) { go("#/retest"); return; }
    current = route;
    var app = document.getElementById("app");
    app.innerHTML = "";
    app.setAttribute("data-route", route.name);
    app.appendChild(topbar(route));
    var main = h("main", { id: "main", class: "t-main", tabindex: "-1" });
    app.appendChild(main);
    var screen = C.screens[route.name];
    try {
      if (screen) screen(main, route.params); else todo(main, route.name);
    } catch (e) {
      console.error("[router] screen failed:", route.name, e);
      todo(main, route.name + " (error: " + e.message + ")");
    }
    window.scrollTo(0, 0);
    C.bus.emit("route:changed", route);
  }

  function go(hash) {
    if (window.location.hash === hash) render(); else window.location.hash = hash;
  }

  C.router = { go: go, render: render, current: function () { return current; }, parse: parse };

  window.addEventListener("hashchange", render);
  document.addEventListener("DOMContentLoaded", function () { C.state.init(); render(); });
})();
