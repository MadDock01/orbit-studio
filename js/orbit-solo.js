/* ============================================================
   ORBIT SOLO — undocked panels

   The bundle ships two CEP panels that load the same index.html:
     com.compxorbit.studio.main  the full Orbit Studio panel
     com.compxorbit.studio.sfx   Sound Designer on its own

   This file runs first, in <head>, so the SFX panel never paints
   the rail or the docks. It works out which panel it is from the
   CEP extension id (or ?solo=sfx when the page is opened outside
   After Effects), tags <html> with .orbit-solo-sfx, and keeps the
   Sound Designer tab the active one even after main.js restores
   the last-used tab.

   Also exposes window.OrbitSolo: the ids, the mode, and small
   wrappers for CEP events and opening or closing a panel, so
   orbit-sfx.js does not repeat the CSInterface plumbing.
   ============================================================ */
(function () {
  "use strict";

  var MAIN_ID = "com.compxorbit.studio.main";
  var SFX_ID = "com.compxorbit.studio.sfx";

  function extensionId() {
    try {
      if (window.__adobe_cep__ && window.__adobe_cep__.getExtensionId) return window.__adobe_cep__.getExtensionId() || "";
    } catch (e) { /* not inside a CEP host */ }
    return "";
  }

  var id = extensionId();
  var query = "";
  try { query = (/[?&]solo=([a-z]+)/.exec(window.location.search) || [])[1] || ""; } catch (e) { query = ""; }
  var mode = id === SFX_ID || query === "sfx" ? "sfx" : "";

  if (mode) document.documentElement.classList.add("orbit-solo", "orbit-solo-" + mode);

  function cs() {
    try { return window.__adobe_cep__ && typeof CSInterface === "function" ? new CSInterface() : null; } catch (e) { return null; }
  }

  // CEP events reach every panel in the bundle; the payload is a JSON string.
  function emit(type, data) {
    var api = cs();
    if (!api || typeof CSEvent !== "function") return false;
    try {
      var ev = new CSEvent(type, "APPLICATION");
      ev.data = JSON.stringify(data || {});
      api.dispatchEvent(ev);
      return true;
    } catch (e) { return false; }
  }

  function on(type, handler) {
    var api = cs();
    if (!api) return false;
    try {
      api.addEventListener(type, function (ev) {
        var data = ev && ev.data;
        if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
        handler(data || {});
      });
      return true;
    } catch (e) { return false; }
  }

  function openPanel(extId) {
    var api = cs();
    if (!api) return false;
    try { api.requestOpenExtension(extId, ""); return true; } catch (e) { return false; }
  }

  function closeSelf() {
    var api = cs();
    if (!api) return false;
    try { api.closeExtension(); return true; } catch (e) { return false; }
  }

  // main.js restores the last tab after the licence check; in the SFX
  // panel that must stay Sound Designer whatever was saved.
  function pinTab() {
    var panel = document.getElementById("panel-sfxdesign");
    if (!panel) return;
    var apply = function () {
      if (panel.classList.contains("active")) return;
      var panels = document.querySelectorAll(".app-panel");
      for (var i = 0; i < panels.length; i++) panels[i].classList.toggle("active", panels[i] === panel);
    };
    apply();
    if (window.MutationObserver) {
      new MutationObserver(apply).observe(panel, { attributes: true, attributeFilter: ["class"] });
    }
  }

  if (mode === "sfx") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pinTab);
    else pinTab();
  }

  window.OrbitSolo = {
    MAIN_ID: MAIN_ID,
    SFX_ID: SFX_ID,
    mode: mode,
    inHost: !!id,
    emit: emit,
    on: on,
    openPanel: openPanel,
    closeSelf: closeSelf
  };
})();
