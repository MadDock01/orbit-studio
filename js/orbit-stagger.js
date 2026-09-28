/* ============================================================
   ORBIT SEQUENCER  (bottom global rail)
   Offsets the selected layers in time — the staircase used for
   stagger reveals.

   Four icons, one click each. The frame step is fixed at
   STEP_FRAMES, so clicking a direction both picks it and runs it.
   The host still takes an arbitrary step, so changing the
   constant below is the whole job if a different default is ever
   wanted.

   Host side: ae_staggerLayers(order, stepFrames, groupSize)
     order      "down" | "up" | "random" | "align"
     stepFrames frames between slots, may be negative
     groupSize  layers per slot

   The rail has no status line, so results go to the app's toast.
   Both that and the host bridge are resolved lazily at click time:
   this file loads before main.js, which compx-loader only injects
   after the licence check.
   ============================================================ */
(function () {
  "use strict";

  var STEP_FRAMES = 5;
  var GROUP_SIZE = 1;
  var ORDER_KEY = "compXSeqOrder";

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

  /* main.js owns the toast; fall back to the button tooltip so a
     failure is never silent if it has not loaded yet. */
  function say(anchor, message, isError) {
    var fn = window.compxToast || window.showToast || window.toast;
    if (typeof fn === "function") {
      try {
        fn(message, isError);
        return;
      } catch (e) {
        /* fall through to the tooltip */
      }
    }
    if (anchor) {
      var original = anchor.getAttribute("data-seq-title");
      if (original === null) {
        anchor.setAttribute("data-seq-title", anchor.title || "");
        original = anchor.title || "";
      }
      anchor.title = message;
      setTimeout(function () {
        anchor.title = original;
      }, 2600);
    }
  }

  function init() {
    var grid = document.getElementById("seqOrders");
    if (!grid) return;

    var alignBtn = document.getElementById("seqAlign");
    // Only remembered so the rail shows which direction ran last.
    var order = readStore(ORDER_KEY, "down");
    var busy = false;

    function paintOrder(value) {
      grid.querySelectorAll("[data-seq-order]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-seq-order") === value);
      });
    }

    function run(useOrder, anchor) {
      if (busy) return;

      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") {
        say(anchor, "After Effects is not connected yet.", true);
        return;
      }

      var step = useOrder === "align" ? 0 : STEP_FRAMES;
      busy = true;
      grid.classList.add("is-busy");

      host.call(
        'ae_staggerLayers("' + useOrder + '",' + step + "," + GROUP_SIZE + ")",
        function (parsed) {
          busy = false;
          grid.classList.remove("is-busy");
          if (parsed && parsed.success) {
            say(anchor, parsed.message || "Done", false);
          } else {
            say(anchor, (parsed && (parsed.message || parsed.detail)) || "Sequencer failed.", true);
          }
        }
      );
    }

    // One click picks the direction and applies it.
    grid.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-seq-order]");
      if (!btn) return;
      order = btn.getAttribute("data-seq-order");
      paintOrder(order);
      writeStore(ORDER_KEY, order);
      run(order, btn);
    });

    // Align is its own action and ignores the current direction.
    if (alignBtn) {
      alignBtn.addEventListener("click", function () {
        run("align", alignBtn);
      });
    }

    paintOrder(order);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
