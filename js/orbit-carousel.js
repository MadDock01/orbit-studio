/* ============================================================
   ORBIT CAROUSEL  (Carousel tab)

   Thin wiring only: read the fields, call the host, report what
   came back. Every decision about what happens to the layers lives
   in jsx/hostscript.jsx.

   Host side:
     ae_carouselBuild(style, optsJson)
     ae_carouselUpdate(optsJson)
     ae_carouselRemove()
     ae_carouselState()
     ae_gridBuild(mode, cols, rows, count, spacing, radius)
     ae_gridProximity(falloff, strength, affect)

   The rig is expression driven, so once a carousel exists a changed
   field is a slider write rather than a rebuild — that is why every
   field calls Update live and only Build touches the layers.

   This file loads before main.js (compx-loader injects main.js only
   after the licence check), so the host bridge is resolved lazily at
   click time rather than captured at load.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXCarousel.";
  var STYLES = ["strip", "ring", "path", "stack"];

  var FIELDS = [
    { id: "carSpacing", key: "spacing", min: 1, max: 6000, def: 320 },
    { id: "carRadius", key: "radius", min: 1, max: 8000, def: 600 },
    { id: "carScale", key: "cardScale", min: 1, max: 400, def: 60 },
    { id: "carFalloff", key: "falloff", min: 0, max: 100, def: 40 },
    { id: "carTilt", key: "tilt", min: -90, max: 90, def: 0 },
    { id: "carVisible", key: "visible", min: 1, max: 120, def: 5 },
    { id: "carTiltPath", key: "tiltPath", min: 0, max: 100, def: 100 },
    { id: "carSpeed", key: "speed", min: -10, max: 10, def: 0, decimals: 2 }
  ];
  var CHECKS = ["carVertical", "carBillboard", "carCamera"];

  // GRID sits in this tab too: it is the same job as a carousel — one layer
  // laid out many times off one rig — so the two share a home. Its numbers
  // are kept apart from the carousel's because they drive a different host
  // call and must never end up in the carousel payload.
  var GRID_FIELDS = [
    { id: "gridCols", min: 1, max: 60, def: 5 },
    { id: "gridRows", min: 1, max: 60, def: 4 },
    { id: "gridSpacing", min: 1, max: 4000, def: 120 },
    { id: "gridCount", min: 2, max: 300, def: 12 },
    { id: "gridRadius", min: 1, max: 6000, def: 300 },
    { id: "gridFalloff", min: 10, max: 6000, def: 400 },
    { id: "gridStrength", min: -200, max: 200, def: 60 }
  ];
  var GRID_MODE_KEY = "gridMode";

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(STORE + key, String(value));
    } catch (e) {
      /* storage unavailable in some CEP sandboxes — the session still works */
    }
  }

  function init() {
    var panel = document.getElementById("panel-carousel");
    if (!panel) return;

    var status = document.getElementById("carStatus");
    var buildBtn = document.getElementById("carBuild");
    var busy = false;
    var hasRig = false;
    var updateTimer = null;

    var style = read("style", "strip");
    if (STYLES.indexOf(style) < 0) style = "strip";

    function say(message, state) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", state === "error");
      status.classList.toggle("is-ok", state === "ok");
      status.title = message;
    }

    // A field that is empty, non-numeric or out of range falls back to its
    // default rather than sending NaN into a host call. The field itself is
    // only rewritten when "tidy" is set (on change/blur, or before a build):
    // doing it while the user types turned a cleared field or a lone "-"
    // back into the default under their cursor.
    function numberOf(spec, tidy) {
      var el = document.getElementById(spec.id);
      if (!el) return spec.def;
      var n = parseFloat(el.value);
      if (!isFinite(n)) n = spec.def;
      n = Math.max(spec.min, Math.min(spec.max, spec.decimals ? n : Math.round(n)));
      if (tidy) {
        var text = String(n);
        if (text !== el.value) el.value = text;
      }
      return n;
    }

    function options(tidy) {
      var o = {}, i;
      for (i = 0; i < FIELDS.length; i++) o[FIELDS[i].key] = numberOf(FIELDS[i], tidy);
      // Path uses one field for how hard a card turns to follow the curve,
      // and it lands on the same Tilt slider the other looks drive.
      if (style === "path") o.tilt = o.tiltPath;
      delete o.tiltPath;
      o.vertical = checked("carVertical");
      o.billboard = checked("carBillboard");
      o.addCamera = checked("carCamera");
      return o;
    }

    function checked(id) {
      var el = document.getElementById(id);
      return el ? !!el.checked : false;
    }

    function bridge() {
      var host = window.CompXHostBridge;
      return host && typeof host.call === "function" ? host : null;
    }

    function call(code, workingText, done) {
      if (busy) return;
      var host = bridge();
      if (!host) {
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
        if (done) done(parsed);
      });
    }

    function argOf(value) {
      var host = window.CompXHostBridge;
      if (host && typeof host.arg === "function") return host.arg(value);
      return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }

    // Which fields a look actually uses. Showing Radius on a flat strip, or
    // Spacing on a ring, would offer a control that does nothing.
    function syncStyleUI() {
      panel.querySelectorAll("[data-car-style]").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-car-style") === style);
      });
      panel.querySelectorAll("[data-car-for]").forEach(function (row) {
        var list = " " + row.getAttribute("data-car-for") + " ";
        row.hidden = list.indexOf(" " + style + " ") < 0;
      });
      panel.dataset.carCurrent = style;
    }

    function setStyle(next, fromUser) {
      style = next;
      write("style", style);
      syncStyleUI();
      // Changing the look is a different layout, so it needs a real rebuild —
      // an Update would only move sliders the new expressions never read.
      if (fromUser && hasRig) say("Look changed — press BUILD to apply it.");
    }

    function markRig(exists) {
      hasRig = !!exists;
      panel.classList.toggle("has-rig", hasRig);
    }

    // Live: once a carousel exists, a changed number is a slider write.
    function pushUpdate() {
      if (!hasRig || busy) return;
      call("ae_carouselUpdate(" + argOf(JSON.stringify(options())) + ")", "Updating…");
    }

    function queueUpdate() {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(pushUpdate, 260);
    }

    function refreshState() {
      var host = bridge();
      if (!host) return;
      host.call("ae_carouselState()", function (parsed) {
        if (!parsed || !parsed.success) return;
        markRig(parsed.exists === true);
        if (parsed.exists) {
          if (parsed.style && STYLES.indexOf(parsed.style) >= 0 && parsed.style !== style) {
            setStyle(parsed.style, false);
          }
          var i, spec, el, key;
          for (i = 0; i < FIELDS.length; i++) {
            spec = FIELDS[i];
            // One Tilt slider on the rig: on a path it is the FOLLOW field.
            key = spec.key;
            if (spec.key === "tilt" && parsed.style === "path") continue;
            if (spec.key === "tiltPath") key = parsed.style === "path" ? "tilt" : "";
            el = document.getElementById(spec.id);
            if (el && key && parsed[key] !== undefined && parsed[key] !== null) {
              el.value = String(Math.round(Number(parsed[key]) * 100) / 100);
              write(spec.id, el.value);
            }
          }
          say(parsed.cards + " cards in this comp's carousel.", "ok");
        } else if (parsed.selected >= 2) {
          say(parsed.selected + " layers selected — ready to build.");
        } else {
          say("Select 2+ layers to build from.");
        }
      });
    }

    /* ---- restore, then wire ---- */

    var i, spec, el;
    for (i = 0; i < FIELDS.length; i++) {
      spec = FIELDS[i];
      el = document.getElementById(spec.id);
      if (!el) continue;
      el.value = read(spec.id, String(spec.def));
      numberOf(spec, true);
      (function (s, input) {
        input.addEventListener("input", function () {
          write(s.id, input.value);
          queueUpdate();
        });
        input.addEventListener("change", function () {
          numberOf(s, true);
          write(s.id, input.value);
        });
      })(spec, el);
    }
    for (i = 0; i < CHECKS.length; i++) {
      el = document.getElementById(CHECKS[i]);
      if (!el) continue;
      el.checked = read(CHECKS[i], el.checked ? "1" : "") === "1";
      (function (id, input) {
        input.addEventListener("change", function () {
          write(id, input.checked ? "1" : "");
          // Vertical and Billboard are baked into the expressions, so they
          // only take effect on the next build.
          if (hasRig) say("Press BUILD to apply that.");
        });
      })(CHECKS[i], el);
    }

    panel.querySelectorAll("[data-car-style]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setStyle(btn.getAttribute("data-car-style"), true);
      });
    });

    if (buildBtn) {
      buildBtn.addEventListener("click", function () {
        call("ae_carouselBuild(" + argOf(style) + "," + argOf(JSON.stringify(options(true))) + ")",
          "Building…",
          function (parsed) { if (parsed && parsed.success) markRig(true); });
      });
    }

    var removeBtn = document.getElementById("carRemove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        call("ae_carouselRemove()", "Removing…", function (parsed) {
          if (parsed && parsed.success) markRig(false);
        });
      });
    }

    var refreshBtn = document.getElementById("carRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", refreshState);

    var tabBtn = document.querySelector('[data-apptab="carousel"]');
    if (tabBtn) tabBtn.addEventListener("click", function () { setTimeout(refreshState, 40); });

    /* ---- GRID ---- */

    function gridSpec(id) {
      var j, found = null;
      for (j = 0; j < GRID_FIELDS.length; j++) if (GRID_FIELDS[j].id === id) found = GRID_FIELDS[j];
      return found;
    }

    function gridField(id) {
      var spec = gridSpec(id);
      return spec ? numberOf(spec, true) : 0;
    }

    var gridModes = document.getElementById("gridModes");
    var gridRect = document.getElementById("gridRectFields");
    var gridRound = document.getElementById("gridRoundFields");
    var gridMode = read(GRID_MODE_KEY, "rect");
    if (["rect", "radial", "sphere"].indexOf(gridMode) < 0) gridMode = "rect";

    // Columns and rows mean nothing to a ring or a sphere, and a single
    // count means nothing to a rectangle, so only the relevant row shows.
    function paintGridMode(value) {
      if (gridModes) {
        gridModes.querySelectorAll("[data-grid-mode]").forEach(function (btn) {
          var on = btn.getAttribute("data-grid-mode") === value;
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-checked", on ? "true" : "false");
        });
      }
      var isRect = value === "rect";
      if (gridRect) gridRect.hidden = !isRect;
      if (gridRound) gridRound.hidden = isRect;
    }

    function gridCells() {
      return gridMode === "rect" ? gridField("gridCols") * gridField("gridRows") : gridField("gridCount");
    }

    for (i = 0; i < GRID_FIELDS.length; i++) {
      spec = GRID_FIELDS[i];
      el = document.getElementById(spec.id);
      if (!el) continue;
      el.value = read(spec.id, String(spec.def));
      numberOf(spec, true);
      (function (s, input) {
        input.addEventListener("input", function () { write(s.id, input.value); });
      })(spec, el);
    }

    if (gridModes) {
      gridModes.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-grid-mode]");
        if (!btn) return;
        gridMode = btn.getAttribute("data-grid-mode");
        paintGridMode(gridMode);
        write(GRID_MODE_KEY, gridMode);
        var cells = gridCells();
        say(cells + " cells" + (gridMode === "sphere" ? " on a sphere" : gridMode === "radial" ? " in a ring" : ""));
      });
    }

    var gridBuild = document.getElementById("gridBuildBtn");
    if (gridBuild) {
      gridBuild.addEventListener("click", function () {
        var cells = gridCells();
        if (cells > 300) {
          say("That is " + cells + " cells \u2014 keep it to 300 or fewer.", "error");
          return;
        }
        call(
          "ae_gridBuild(" + argOf(gridMode) + "," + gridField("gridCols") + "," + gridField("gridRows") + "," +
            gridField("gridCount") + "," + gridField("gridSpacing") + "," + gridField("gridRadius") + ")",
          "Building " + cells + " cells\u2026"
        );
      });
    }

    var gridProx = document.getElementById("gridProxBtn");
    if (gridProx) {
      gridProx.addEventListener("click", function () {
        var affect = document.getElementById("gridAffect");
        call(
          "ae_gridProximity(" + gridField("gridFalloff") + "," + gridField("gridStrength") + "," +
            argOf(affect ? affect.value : "scale") + ")",
          "Adding effector\u2026"
        );
      });
    }

    var gridAffect = document.getElementById("gridAffect");
    if (gridAffect) {
      gridAffect.value = read("gridAffect", "scale");
      gridAffect.addEventListener("change", function () { write("gridAffect", gridAffect.value); });
    }

    paintGridMode(gridMode);

    syncStyleUI();
    say("Select 2+ layers to build from.");
    setTimeout(refreshState, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
