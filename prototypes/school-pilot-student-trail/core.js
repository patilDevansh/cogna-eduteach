/* Cogna prototype — core namespace, DOM helpers, registries, event bus.
   CONTRACT FILE (owned by the orchestrator). Agents read it, never edit it. */
(function () {
  "use strict";
  var SVG_NS = "http://www.w3.org/2000/svg";

  function applyAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "on") {
        Object.keys(v).forEach(function (evt) { el.addEventListener(evt, v[evt]); });
      } else if (k === "style" && typeof v === "object") {
        Object.keys(v).forEach(function (p) {
          if (p.indexOf("--") === 0) el.style.setProperty(p, v[p]);
          else el.style[p] = v[p];
        });
      } else if (k === "html") {
        el.innerHTML = v;
      } else if (k === "class" || k === "className") {
        el.setAttribute("class", v);
      } else if (!isSvg && (k === "value" || k === "checked" || k === "disabled")) {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : v);
      }
    });
  }

  function appendKids(el, kids) {
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return appendKids(el, c);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }

  /** h('div', {class:'card', on:{click: fn}}, 'text', childEl, [more]) -> HTMLElement */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    applyAttrs(el, attrs, false);
    appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /** svg('rect', {x:0, y:0, width:10, height:10}) -> SVGElement */
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    applyAttrs(el, attrs, true);
    appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /** Parse an inline SVG/HTML string into a node (used for data figures). */
  function fromHTML(str) {
    var t = document.createElement("template");
    t.innerHTML = String(str || "").trim();
    return t.content.firstChild;
  }

  var listeners = {};
  var bus = {
    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return function off() { listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== fn; }); };
    },
    emit: function (evt, payload) {
      (listeners[evt] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error("[bus]", evt, e); }
      });
    },
  };

  /** Shared tone helpers so every screen labels statuses the same way. */
  var TONES = {
    secure: { label: "Secure", short: "Secure" },
    shaky: { label: "Shaky", short: "Shaky" },
    missing: { label: "Needs work", short: "Needs work" },
    untaught: { label: "Not taught yet", short: "Not yet" },
  };
  function toneChip(status, text) {
    return h("span", { class: "t-chip", "data-tone": status }, text || TONES[status].label);
  }

  window.Cogna = {
    h: h,
    svg: svg,
    fromHTML: fromHTML,
    bus: bus,
    TONES: TONES,
    toneChip: toneChip,
    anims: {},   // Cogna.anims[id] = { title, durationMs, mount(el, {onEnd, onBeat}) -> {play,pause,replay,destroy} }
    games: {},   // Cogna.games[id] = { title, mount(el, {onSuccess, onEvent}) -> {destroy} }
    screens: {}, // Cogna.screens[name] = (el, params) => void
    steps: {},   // Cogna.steps[type] = (el, step, ctx) => void
    data: {},
    state: null,
    router: null,
  };
})();
