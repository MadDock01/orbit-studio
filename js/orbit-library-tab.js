/* ============================================================
   ORBIT LIBRARY TAB — one rail tab, four shelves

   The Library rail tab carries MOGRT / TEXT / MOTIONS / SFX in its
   shelf row. main.js already switches assetType for the mogrt and sfx
   shelves and shows/hides the TEXT and MOTIONS views, but it no longer
   shows #sfxMogrtView, and on start-up it forces the shelf back to
   TEXT. This file fills those two gaps from outside, so main.js (whose
   hash the loader checks) stays untouched.
   ============================================================ */
(function () {
  "use strict";

  var SHELF_KEY = "compXLibraryShelf";
  var MEDIA = { mogrt: true, sfx: true };

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

  var shelf = "textanim";

  // The transport bar is hidden by the library stylesheets; it only earns its
  // space on the SFX shelf once a sound is picked and the waveform is up.
  function paintTransport() {
    var transport = document.querySelector("#sfxMogrtView .transport");
    var strip = document.getElementById("sndStrip");
    if (!transport) return;
    transport.classList.toggle("has-sound", shelf === "sfx" && !!strip && !strip.hidden);
  }

  function paint(type) {
    shelf = type;
    var view = document.getElementById("sfxMogrtView");
    if (view) view.style.display = MEDIA[type] ? "" : "none";
    paintTransport();
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

    var strip = document.getElementById("sndStrip");
    if (strip && window.MutationObserver) {
      new MutationObserver(paintTransport).observe(strip, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
