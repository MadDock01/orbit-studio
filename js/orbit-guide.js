/* ============================================================
   ORBIT GUIDE GRID  (Tools tab -> Text / Mask Tools -> Guide Grid)

   Thin wiring only: read the three fields and the marker shape,
   call the host, report what came back. Everything about how the
   grid is drawn lives in jsx/hostscript.jsx.

   The controls sit in a modal rather than inline in the Tools tab,
   opened from the Guide Grid button. Open/close follows the same
   shape as the Number Counter dialog in main.js: backdrop click,
   the close button, and Escape all dismiss it, and focus returns
   to the trigger.

   Host side:
     ae_guideGrid(cols, rows, border, markerShape, fitLayer)
     ae_guideGridRemove()

   This file loads before main.js (compx-loader injects main.js
   only after the licence check), so the host bridge is resolved
   lazily at click time rather than captured at load.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXGuide.";
  var FIELDS = [
    { id: "ggCols", min: 1, max: 200, def: 12 },
    { id: "ggRows", min: 1, max: 200, def: 8 },
    { id: "ggBorder", min: 0, max: 2000, def: 0 }
  ];

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(STORE + key, String(value)); } catch (e) { /* sandboxed */ }
  }

  function init() {
    var card = document.getElementById("guideGridModal");
    if (!card) return;

    var trigger = document.getElementById("btnGuideGridOpen");
    var closeBtn = document.getElementById("btnGuideGridClose");
    var status = document.getElementById("ggStatus");
    var markers = document.getElementById("ggMarkers");
    var shape = read("marker", "dot");
    var busy = false;

    function say(message, state) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", state === "error");
      status.classList.toggle("is-ok", state === "ok");
      status.title = message;
    }

    // An empty or out-of-range field falls back to its default rather than
    // sending NaN into a host call.
    function numberOf(spec) {
      var el = document.getElementById(spec.id);
      if (!el) return spec.def;
      var n = parseFloat(el.value);
      if (!isFinite(n)) n = spec.def;
      n = Math.max(spec.min, Math.min(spec.max, Math.round(n)));
      if (String(n) !== el.value) el.value = n;
      return n;
    }

    function field(id) {
      var i;
      for (i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return numberOf(FIELDS[i]);
      return 0;
    }

    function paintShape(value) {
      if (!markers) return;
      markers.querySelectorAll("[data-gg-marker]").forEach(function (btn) {
        var on = btn.getAttribute("data-gg-marker") === value;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    function call(code, working) {
      if (busy) return;
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") {
        say("After Effects is not connected yet.", "error");
        return;
      }
      busy = true;
      card.classList.add("is-busy");
      say(working || "Working…");
      host.call(code, function (parsed) {
        busy = false;
        card.classList.remove("is-busy");
        if (parsed && parsed.success) say(parsed.message || "Done", "ok");
        else say((parsed && (parsed.message || parsed.detail)) || "That did not work.", "error");
      });
    }

    function build(fitLayer) {
      call(
        "ae_guideGrid(" + field("ggCols") + "," + field("ggRows") + "," + field("ggBorder") +
          ',"' + shape + '",' + (fitLayer ? "true" : "false") + ")",
        fitLayer ? "Tracking layer…" : "Drawing grid…"
      );
    }

    if (markers) {
      markers.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-gg-marker]");
        if (!btn) return;
        shape = btn.getAttribute("data-gg-marker");
        paintShape(shape);
        write("marker", shape);
        say(shape.charAt(0).toUpperCase() + shape.slice(1) + " markers");
      });
    }

    var b = document.getElementById("ggBuild");
    if (b) b.addEventListener("click", function () { build(false); });
    var t = document.getElementById("ggTrack");
    if (t) t.addEventListener("click", function () { build(true); });
    var r = document.getElementById("ggRemove");
    if (r) r.addEventListener("click", function () { call("ae_guideGridRemove()", "Removing…"); });

    var i;
    for (i = 0; i < FIELDS.length; i++) {
      (function (spec) {
        var el = document.getElementById(spec.id);
        if (!el) return;
        el.value = read(spec.id, spec.def);
        numberOf(spec);
        el.addEventListener("change", function () { write(spec.id, numberOf(spec)); });
      })(FIELDS[i]);
    }

    paintShape(shape);

    // ---- Modal ----
    function close() {
      card.style.display = "none";
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    }

    function open() {
      card.style.display = "flex";
      if (trigger) trigger.setAttribute("aria-expanded", "true");
      var first = document.getElementById("ggCols");
      if (first) first.focus();
    }

    if (trigger) trigger.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);

    // Only the backdrop itself closes — a click inside the box must not.
    card.addEventListener("click", function (ev) {
      if (ev.target === card) close();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && card.style.display !== "none") {
        ev.preventDefault();
        close();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
