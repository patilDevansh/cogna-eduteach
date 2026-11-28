/* Game: floor-tiles — a 4 m x 3 m room, 50 cm tiles: type how many tiles (48). Units mix-up is tagged. */
(function () {
  "use strict";
  var h = Cogna.h, S = Cogna.svg;

  function say(box, ok, title, text) {
    box.textContent = "";
    if (!title && !text) return;
    box.appendChild(h("div", { class: "feedback " + (ok ? "feedback-correct" : "feedback-incorrect"), role: "status" },
      h("div", null, h("strong", null, title), text)));
  }

  var W = 11, H = 6.6, RX = 1.2, RY = 1, K = 1.5; // 1 m = 1.5 board units
  var RW = 4 * K, RH = 3 * K, T = 0.5 * K;          // room and tile sizes on the board

  Cogna.games["floor-tiles"] = {
    title: "Tiles for a floor",
    mount: function (el, opts) {
      opts = opts || {};
      var done = false;

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "img",
        "aria-label": "A room 4 metres by 3 metres. One tile is 50 centimetres by 50 centimetres." });
      var d = "", i;
      for (i = 0; i <= W; i++) d += "M" + i + " 0V" + H;
      for (i = 0; i <= H; i++) d += "M0 " + i + "H" + W;
      svg.appendChild(S("path", { d: d, class: "t-g-grid" }));
      svg.appendChild(S("rect", { class: "t-g-shape", x: RX, y: RY, width: RW, height: RH }));
      // the tile grid appears on success
      var tg = "";
      for (i = 1; i < 8; i++) tg += "M" + (RX + i * T) + " " + RY + "v" + RH;
      for (i = 1; i < 6; i++) tg += "M" + RX + " " + (RY + i * T) + "h" + RW;
      var tilegrid = S("path", { d: tg, class: "t-g-tilegrid", fill: "none" });
      svg.appendChild(tilegrid);
      // one sample tile in the corner
      svg.appendChild(S("rect", { class: "t-g-tile", x: RX, y: RY + RH - T, width: T, height: T }));
      svg.appendChild(S("text", { class: "t-g-label", x: RX + RW / 2, y: RY - 0.25, "text-anchor": "middle" }, "4 m"));
      svg.appendChild(S("text", { class: "t-g-label", x: RX - 0.25, y: RY + RH / 2 + 0.17, "text-anchor": "end" }, "3 m"));
      svg.appendChild(S("text", { class: "t-g-label-soft", x: RX + RW + 0.7, y: RY + 0.5 }, "One tile"));
      svg.appendChild(S("text", { class: "t-g-label-soft", x: RX + RW + 0.7, y: RY + 1.05 }, "50 cm by"));
      svg.appendChild(S("text", { class: "t-g-label-soft", x: RX + RW + 0.7, y: RY + 1.55 }, "50 cm"));
      svg.appendChild(S("rect", { class: "t-g-tile", x: RX + RW + 0.7, y: RY + 1.9, width: T, height: T }));
      var result = S("text", { class: "t-g-label-big", x: RX + RW / 2, y: RY + RH + 0.9, "text-anchor": "middle" });
      svg.appendChild(result);

      var input = h("input", { class: "input math-sm", id: "ft-" + Math.random().toString(36).slice(2, 7), type: "text",
        inputmode: "decimal", autocomplete: "off", "aria-label": "Number of tiles", placeholder: "How many?" });
      var btn = h("button", { class: "btn btn-primary", type: "button", on: { click: check } }, "Check");
      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } });
      var root = h("div", { class: "t-game" },
        h("p", { class: "t-game-instr" }, h("strong", null, "How many tiles? "),
          "The floor is 4 m by 3 m. Each tile is 50 cm by 50 cm. How many tiles cover the whole floor?"),
        svg,
        h("div", { class: "t-game-numrow" }, h("div", { class: "field" }, input), btn), fb);
      el.appendChild(root);

      function check() {
        if (done) return;
        var raw = String(input.value).trim().replace(/,/g, "");
        var v = parseFloat(raw);
        if (!raw || isNaN(v)) { say(fb, false, "Type a number first.", "Then press Check."); return; }
        if (v === 48) {
          done = true; btn.disabled = true; input.disabled = true;
          tilegrid.setAttribute("data-on", "1");
          result.textContent = "8 × 6 = 48 tiles";
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          say(fb, true, "48 tiles.", "4 m is 400 cm, which holds 8 tiles. 3 m is 300 cm, which holds 6 tiles. 8 × 6 = 48.");
          if (opts.onSuccess) opts.onSuccess({ game: "floor-tiles", tiles: 48 });
          return;
        }
        var ev = { kind: "answer", correct: false };
        if (v === 4.8 || v === 480) {
          ev.mixup = "units";
          say(fb, false, "Check the units.",
            "The room is in metres and the tile is in centimetres. Change both to the same unit before you work out how many fit.");
        } else if (v === 12) {
          say(fb, false, "12 is the room's area in square metres.",
            "The tiles are measured in centimetres, so change the room to centimetres first. How many 50 cm tiles fit along 4 m?");
        } else {
          say(fb, false, "Not quite.", "Try one wall first: how many 50 cm tiles fit along the 4 m side? Then the 3 m side.");
        }
        if (opts.onEvent) opts.onEvent(ev);
      }

      return { destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); } };
    },
  };
})();
