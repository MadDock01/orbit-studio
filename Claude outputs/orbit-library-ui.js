/* ============================================================
   ORBIT LIBRARY UI
   Chrome only for the Library tab's SFX / MOGRT shelf:
   the "⋯ more actions" popover.

   Every action inside the popover keeps the id main.js already
   binds (#btnBackupLibrary, #btnRestoreLibrary, #btnClearMogrtCache,
   #btnCopyDiagnostics), so this file adds no behaviour of its own —
   it only opens and closes the container. Reset (#btnReset) and
   batch mode (#btnBatchMode) sit directly in the toolbar and are
   wired by main.js exactly as before.
   ============================================================ */
(function () {
  "use strict";

  function init() {
    var btn = document.getElementById("btnLibMore");
    var menu = document.getElementById("libMoreMenu");
    if (!btn || !menu) return;

    function close() {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-open");
    }

    function open() {
      if (!menu.hidden) return;
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-open");
    }

    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (menu.hidden) open();
      else close();
    });

    // Picking an action runs it (main.js handles the click) and closes up.
    menu.addEventListener("click", function (ev) {
      if (ev.target.closest(".lib-more-item")) close();
    });

    document.addEventListener("click", function (ev) {
      if (menu.hidden) return;
      if (ev.target.closest("#btnLibMore") || ev.target.closest("#libMoreMenu")) return;
      close();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !menu.hidden) {
        close();
        btn.focus();
      }
    });

    // Leaving the Library tab should not leave a popover floating.
    var rail = document.getElementById("appTabsRow");
    if (rail) rail.addEventListener("click", close);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
