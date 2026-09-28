/* ============================================================
   ORBIT GLOBAL DOCKS
   Top rail    (#orbitGlobalDock) — anchor · align · trim · Quick FX
   Bottom rail (#orbitBottomDock) — layer creation (Quick Actions)

   Both live outside .app-panel, so a tab switch never rebuilds them.
   This file only handles rail chrome: collapse (persisted), the Quick
   FX flyout, the sideways-scroll fade and the anchor-pad active dot.
   Tool clicks are NOT wired here — main.js binds every
   `.tool-btn[data-tool]` document-wide, so the rail buttons are picked
   up exactly like the ones that used to sit inside #panel-tools.
   ============================================================ */
(function () {
  "use strict";

  var RAILS = [
    { dock: "orbitGlobalDock", toggle: "orbitGlobalDockToggle", inner: "orbitGlobalDockInner", key: "compXGlobalDockCollapsed", label: "quick dock" },
    { dock: "orbitBottomDock", toggle: "orbitBottomDockToggle", inner: "orbitBottomDockInner", key: "compXBottomDockCollapsed", label: "create rail" }
  ];

  function readFlag(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeFlag(key, value) {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch (e) {
      /* storage unavailable in some CEP sandboxes — collapse still works for the session */
    }
  }

  /* ---- Quick FX flyout (top rail only) ---- */
  function wireFxFlyout(closeHooks) {
    var btn = document.getElementById("orbitDockFxBtn");
    var flyout = document.getElementById("orbitDockFxFlyout");
    if (!btn || !flyout) return;

    function close() {
      if (flyout.hidden) return;
      flyout.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }

    function open() {
      if (!flyout.hidden) return;
      flyout.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }

    closeHooks.push(close);

    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (flyout.hidden) open();
      else close();
    });

    // Applying an effect closes the flyout; main.js still receives the click.
    flyout.addEventListener("click", function (ev) {
      if (ev.target.closest(".tool-btn")) close();
    });

    document.addEventListener("click", function (ev) {
      if (flyout.hidden) return;
      if (ev.target.closest("#orbitDockFxBtn") || ev.target.closest("#orbitDockFxFlyout")) return;
      close();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !flyout.hidden) {
        close();
        btn.focus();
      }
    });
  }

  function wireRail(spec, closeHooks) {
    var dock = document.getElementById(spec.dock);
    if (!dock) return;

    var toggle = document.getElementById(spec.toggle);
    var inner = document.getElementById(spec.inner);

    function applyCollapsed(collapsed) {
      dock.classList.toggle("is-collapsed", collapsed);
      if (collapsed) closeHooks.forEach(function (fn) { fn(); });
      if (toggle) {
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute("title", (collapsed ? "Expand " : "Collapse ") + spec.label);
      }
    }

    applyCollapsed(readFlag(spec.key));

    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = !dock.classList.contains("is-collapsed");
        applyCollapsed(next);
        writeFlag(spec.key, next);
      });
    }

    /* overflow hint: fade the trailing edge when the rail has to scroll */
    if (inner) {
      var syncOverflow = function () {
        dock.classList.toggle("is-scrollable", inner.scrollWidth > inner.clientWidth + 1);
      };
      syncOverflow();
      window.addEventListener("resize", syncOverflow);
      if (typeof ResizeObserver === "function") {
        try { new ResizeObserver(syncOverflow).observe(inner); } catch (e) { /* older CEP */ }
      }
    }

    /* anchor pad: keep the lit dot on the last pick */
    var anchorGrid = dock.querySelector(".gdock-anchor-grid");
    if (anchorGrid) {
      anchorGrid.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".anchor-dot-btn");
        if (!btn || !anchorGrid.contains(btn)) return;
        anchorGrid.querySelectorAll(".anchor-dot-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    }
  }

  function init() {
    var closeHooks = [];
    wireFxFlyout(closeHooks);
    RAILS.forEach(function (spec) { wireRail(spec, closeHooks); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
