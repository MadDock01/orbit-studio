/* ============================================================
   ORBIT SEQUENCER  (Tools tab)
   Offsets the selected layers in time, one slot each — the
   staircase used for stagger reveals.

   Host side: ae_staggerLayers(order, stepFrames, groupSize)
     order      "down" | "up" | "random" | "align"
     stepFrames frames between slots, may be negative
     groupSize  layers per slot

   This file loads before main.js (compx-loader injects main.js only
   after the licence check), so the host bridge is resolved lazily at
   click time rather than captured at load.
   ============================================================ */
(function () {
  "use strict";

  var ORDER_KEY = "compXSeqOrder";
  var GROUP_KEY = "compXSeqGroup";

  function readStore(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* storage unavailable in some CEP sandboxes — the session still works */
    }
  }

  function init() {
    var card = document.getElementById("orbitSequencer");
    if (!card) return;

    var orders = document.getElementById("seqOrders");
    var steps = document.getElementById("seqSteps");
    var groups = document.getElementById("seqGroups");
    var custom = document.getElementById("seqCustom");
    var alignBtn = document.getElementById("seqAlign");
    var status = document.getElementById("seqStatus");

    var order = readStore(ORDER_KEY, "down");
    var group = readStore(GROUP_KEY, "1");

    function paintRadio(container, attr, value) {
      if (!container) return;
      container.querySelectorAll("[" + attr + "]").forEach(function (btn) {
        var on = btn.getAttribute(attr) === value;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    function say(message, state) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", state === "error");
      status.classList.toggle("is-ok", state === "ok");
      status.title = message;
    }

    function run(stepFrames, forcedOrder) {
      var useOrder = forcedOrder || order;

      if (useOrder !== "align") {
        var step = parseFloat(stepFrames);
        if (!step || isNaN(step) || !isFinite(step)) {
          say("Step must be a non-zero number", "error");
          return;
        }
        stepFrames = step;
      } else {
        stepFrames = 0;
      }

      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") {
        say("Host not ready", "error");
        return;
      }

      say(useOrder === "align" ? "Aligning…" : "Sequencing…");

      host.call(
        'ae_staggerLayers("' + useOrder + '",' + stepFrames + ',' + parseInt(group, 10) + ')',
        function (parsed) {
          if (parsed && parsed.success) {
            say(parsed.message || "Done", "ok");
          } else {
            say((parsed && (parsed.message || parsed.detail)) || "Failed", "error");
          }
        }
      );
    }

    if (orders) {
      orders.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-seq-order]");
        if (!btn) return;
        order = btn.getAttribute("data-seq-order");
        paintRadio(orders, "data-seq-order", order);
        writeStore(ORDER_KEY, order);
        say(order === "random" ? "Random order" : order === "up" ? "Bottom layer anchors" : "Top layer anchors");
      });
    }

    if (groups) {
      groups.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-seq-group]");
        if (!btn) return;
        group = btn.getAttribute("data-seq-group");
        paintRadio(groups, "data-seq-group", group);
        writeStore(GROUP_KEY, group);
        say(group === "1" ? "One layer per step" : group + " layers per step");
      });
    }

    if (steps) {
      steps.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-seq-step]");
        if (!btn) return;
        run(btn.getAttribute("data-seq-step"));
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

    // Align is a one-shot action and ignores the current direction.
    if (alignBtn) {
      alignBtn.addEventListener("click", function () {
        run(0, "align");
      });
    }

    paintRadio(orders, "data-seq-order", order);
    paintRadio(groups, "data-seq-group", group);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
