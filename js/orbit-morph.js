/* ============================================================
   ORBIT MORPH  (Morph tab)

   Thin wiring only: read the number fields, call the host, report
   what came back. Every decision about what actually happens to the
   layers lives in jsx/hostscript.jsx.

   Host side:
     ae_morphLayers(durationFrames, staggerFrames, overshootPct, fadeOut, centerAnchors)
     ae_morphStretch(amountPct)
     ae_morphTrails(count, offsetFrames, fadePct)
     ae_morphSlice(count, vertical)
     ae_morphClean()

   This file loads before main.js (compx-loader injects main.js only
   after the licence check), so the host bridge is resolved lazily at
   click time rather than captured at load.
   ============================================================ */
(function () {
  "use strict";

  var STORE_PREFIX = "compXMorph.";
  var FIELDS = [
    { id: "morphDuration", min: 2, max: 240, def: 20 },
    { id: "morphStagger", min: 0, max: 60, def: 4 },
    { id: "morphOvershoot", min: 0, max: 80, def: 0 },
    { id: "morphTrailCount", min: 1, max: 20, def: 5 },
    { id: "morphTrailGap", min: 1, max: 30, def: 2 },
    { id: "morphSliceCount", min: 2, max: 40, def: 6 }
  ];
  var CHECKS = ["morphCenter", "morphFade", "morphSliceVertical"];

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(STORE_PREFIX + key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, String(value));
    } catch (e) {
      /* storage unavailable in some CEP sandboxes — the session still works */
    }
  }

  function init() {
    var panel = document.getElementById("panel-morph");
    if (!panel) return;

    var status = document.getElementById("morphStatus");
    var busy = false;

    function say(message, state) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", state === "error");
      status.classList.toggle("is-ok", state === "ok");
      status.title = message;
    }

    // A field that is empty, non-numeric or out of range falls back to its
    // default rather than sending NaN into a host call.
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
      var i, spec = null;
      for (i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) spec = FIELDS[i];
      return spec ? numberOf(spec) : 0;
    }

    function checked(id) {
      var el = document.getElementById(id);
      return el ? !!el.checked : false;
    }

    function call(code, workingText) {
      if (busy) return;
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") {
        say("After Effects is not connected yet.", "error");
        return;
      }
      busy = true;
      panel.classList.add("is-busy");
      say(workingText || "Working…");
      host.call(code, function (parsed) {
        busy = false;
        panel.classList.remove("is-busy");
        if (parsed && parsed.success) {
          say(parsed.message || "Done", "ok");
        } else {
          say((parsed && (parsed.message || parsed.detail)) || "That did not work.", "error");
        }
      });
    }

    function on(id, handler) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("click", handler);
    }

    on("morphRun", function () {
      call(
        "ae_morphLayers(" + field("morphDuration") + "," + field("morphStagger") + "," +
          field("morphOvershoot") + "," + (checked("morphFade") ? "true" : "false") + "," +
          (checked("morphCenter") ? "true" : "false") + ")",
        "Morphing…"
      );
    });

    on("morphStretchBtn", function () {
      // Stretch has no field of its own; it reuses the overshoot dial as its
      // strength, falling back to a readable 30% when that is left at zero.
      var amount = field("morphOvershoot") || 30;
      call("ae_morphStretch(" + amount + ")", "Adding stretch…");
    });

    on("morphTrailsBtn", function () {
      call("ae_morphTrails(" + field("morphTrailCount") + "," + field("morphTrailGap") + ",70)", "Adding trails…");
    });

    on("morphSliceBtn", function () {
      call("ae_morphSlice(" + field("morphSliceCount") + "," +
        (checked("morphSliceVertical") ? "true" : "false") + ")", "Slicing…");
    });

    on("morphCleanBtn", function () {
      call("ae_morphClean()", "Cleaning…");
    });

    // Remember the dial settings between sessions.
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
    for (i = 0; i < CHECKS.length; i++) {
      (function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var saved = read(id, null);
        if (saved !== null) el.checked = saved === "true";
        el.addEventListener("change", function () { write(id, el.checked); });
      })(CHECKS[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
