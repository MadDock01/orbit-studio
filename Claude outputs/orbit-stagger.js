/* ============================================================
   ORBIT LAYER STAGGER  (Motion Lab)
   Offsets the selected layers in time by a fixed frame step,
   cumulatively — first layer anchors, each next one moves a step
   further. Multi-layer by definition: the host refuses fewer than two.

   Host side: ae_staggerLayers(direction, stepFrames) in hostscript.jsx.
   direction is "ascending" (top layer anchors) or "descending".

   This file loads before main.js (compx-loader injects main.js only
   after the licence check), so the host bridge is resolved lazily at
   click time rather than captured at load.
   ============================================================ */
(function () {
  "use strict";

  var DIR_KEY = "compXStaggerDirection";

  function bridge() {
    return window.CompXHostBridge || null;
  }

  function init() {
    var card = document.getElementById("cxStaggerCard");
    if (!card) return;

    var steps = document.getElementById("stgSteps");
    var custom = document.getElementById("stgCustom");
    var applyCustom = document.getElementById("stgApplyCustom");
    var dirBtn = document.getElementById("stgDirection");
    var status = document.getElementById("stgStatus");

    var descending = false;
    try { descending = localStorage.getItem(DIR_KEY) === "descending"; } catch (e) { descending = false; }

    function paintDirection() {
      if (!dirBtn) return;
      dirBtn.setAttribute("aria-pressed", descending ? "true" : "false");
      dirBtn.classList.toggle("is-up", descending);
      var arrow = dirBtn.querySelector(".stg-dir-arrow");
      var text = dirBtn.querySelector(".stg-dir-text");
      if (arrow) arrow.textContent = descending ? "↑" : "↓";
      if (text) text.textContent = descending ? "BOTTOM FIRST" : "TOP FIRST";
      dirBtn.title = descending
        ? "Bottom layer anchors, the staircase walks up"
        : "Top layer anchors, the staircase walks down";
    }

    function say(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", !!isError);
    }

    function run(frames) {
      var step = parseFloat(frames);
      if (!step || isNaN(step) || !isFinite(step)) {
        say("Step must be a non-zero number of frames.", true);
        return;
      }

      var host = bridge();
      if (!host || typeof host.call !== "function") {
        say("Host bridge is not ready yet — give the panel a moment.", true);
        return;
      }

      var direction = descending ? "descending" : "ascending";
      say("Staggering by " + step + " frame" + (Math.abs(step) === 1 ? "" : "s") + "…");

      host.call(
        'ae_staggerLayers("' + direction + '",' + step + ')',
        function (parsed) {
          if (parsed && parsed.success) {
            say(parsed.message || "Layers staggered.");
          } else {
            say((parsed && (parsed.message || parsed.detail)) || "Stagger failed.", true);
          }
        }
      );
    }

    if (steps) {
      steps.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-stagger-step]");
        if (!btn) return;
        run(btn.getAttribute("data-stagger-step"));
      });
    }

    if (applyCustom) {
      applyCustom.addEventListener("click", function () {
        run(custom ? custom.value : 0);
      });
    }

    if (custom) {
      custom.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          run(custom.value);
        }
      });
    }

    if (dirBtn) {
      dirBtn.addEventListener("click", function () {
        descending = !descending;
        paintDirection();
        try { localStorage.setItem(DIR_KEY, descending ? "descending" : "ascending"); } catch (e) { /* CEP sandbox */ }
      });
    }

    paintDirection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
