/* ============================================================
   ORBIT LIBRARY TAB — one rail tab, four shelves

   The Library rail tab carries MOGRT / TEXT / MOTIONS / SFX in its
   shelf row:
     MOGRT   -> #sfxMogrtView (main.js library, assetType "mogrt")
     TEXT    -> #textAnimView    (main.js)
     MOTIONS -> #motionPresetView (main.js)
     SFX     -> #panel-sfxdesign (the Sound Designer workspace,
                js/orbit-sfx.js)

   main.js already shows/hides the TEXT and MOTIONS views, but it no
   longer shows #sfxMogrtView and on start-up it forces the shelf back
   to TEXT. This file fills those gaps from outside, so main.js (whose
   hash the loader checks) stays untouched.
   ============================================================ */
(function () {
  "use strict";

  var SHELF_KEY = "compXLibraryShelf";

  // Old sessions may remember rail tabs that are now shelves.
  var savedShelf = "textanim";
  try {
    var tab = localStorage.getItem("compXActiveTab");
    if (tab === "mogrt" || tab === "sfxdesign") {
      localStorage.setItem("compXActiveTab", "sfx");
      savedShelf = tab === "mogrt" ? "mogrt" : "sfx";
    } else {
      savedShelf = localStorage.getItem(SHELF_KEY) || "textanim";
    }
  } catch (e) { /* sandboxed storage */ }

  var shelf = "";

  function paint(type) {
    var was = shelf;
    shelf = type;
    var library = document.getElementById("sfxMogrtView");
    var designer = document.getElementById("panel-sfxdesign");
    if (library) library.style.display = type === "mogrt" ? "" : "none";
    if (designer) designer.style.display = type === "sfx" ? "flex" : "none";
    if (type === "sfx" && was !== "sfx") {
      // The waveform canvases measure 0 while hidden; a resize makes
      // orbit-sfx.js repaint them at their real width.
      setTimeout(function () {
        try { window.dispatchEvent(new Event("resize")); } catch (e) { /* old CEP */ }
      }, 0);
    }
    if (was === "sfx" && type !== "sfx") {
      try { window.dispatchEvent(new CustomEvent("compx:sfxd-hidden")); } catch (e) { /* old CEP */ }
    }
  }

  function init() {
    var row = document.getElementById("assetTypeRow");
    if (!row) return;

    // main.js resets the shelf to TEXT with a scripted click once it has
    // wired itself up. The first scripted click is that reset, so the
    // remembered shelf goes back right after it.
    var restorePending = savedShelf !== "textanim";

    row.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".shelf");
      if (!btn) return;
      if (restorePending && !ev.isTrusted) {
        restorePending = false;
        var want = row.querySelector('.shelf[data-type="' + savedShelf + '"]');
        if (want && want !== btn) { setTimeout(function () { want.click(); }, 0); return; }
      }
      paint(btn.dataset.type);
      try { localStorage.setItem(SHELF_KEY, btn.dataset.type); } catch (e) { /* sandboxed storage */ }
    });

    var active = row.querySelector(".shelf.active");
    paint(active ? active.dataset.type : "textanim");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
