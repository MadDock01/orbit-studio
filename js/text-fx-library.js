(function () {
  "use strict";

  var FAVORITES_KEY = "compxTextFxFavorites";
  var state = { items:[], selected:null, target:"Characters", category:"all", query:"", favorites:{}, previewDirection:"IN" };
  var fs = null;
  var path = null;
  var cs = null;
  var previewObserver = null;

  try {
    if (typeof require !== "undefined") { fs = require("fs"); path = require("path"); }
    else if (typeof window.require !== "undefined") { fs = window.require("fs"); path = window.require("path"); }
  } catch (nodeError) { void nodeError; }
  try { cs = new CSInterface(); } catch (csError) { void csError; }

  function toast(message, error) {
    if (window.showToast) window.showToast(message, !!error);
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hostArg(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }
  function callHost(script, callback) {
    if (!cs) { callback({ success:false, message:"After Effects host bridge is unavailable." }); return; }
    cs.evalScript(script, function (raw) {
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (parseError) { parsed = { success:false, message:String(raw || "Invalid host response") }; }
      callback(parsed || { success:false, message:"No host response." });
    });
  }
  function fileUrl(filePath) {
    var normalized = String(filePath || "").replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized)) normalized = "/" + normalized;
    return "file://" + encodeURI(normalized).replace(/#/g, "%23");
  }
  function categoryInfo(folder) {
    var raw = String(folder || "").replace(/^\d+[- ]*/, "").trim();
    var key = raw.toLowerCase();
    return { key:key, label:raw || folder };
  }
  function loadFavorites() {
    try {
      var saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      if (Array.isArray(saved)) saved.forEach(function (id) { state.favorites[id] = true; });
    } catch (error) { state.favorites = {}; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Object.keys(state.favorites).filter(function (id) { return state.favorites[id]; }))); }
    catch (error) { void error; }
  }
  function extensionRoot() {
    if (!cs) return "";
    try { return cs.getSystemPath(SystemPath.EXTENSION); } catch (error) { return ""; }
  }
  function scanLibrary() {
    if (!fs || !path) return [];
    var root = path.join(extensionRoot(), "presets", "text-fx");
    if (!fs.existsSync(root)) return [];
    var output = [];
    fs.readdirSync(root, { withFileTypes:true }).filter(function (entry) { return entry.isDirectory(); }).forEach(function (categoryEntry) {
      var info = categoryInfo(categoryEntry.name);
      var namesRoot = path.join(root, categoryEntry.name, "IN", "Characters");
      if (!fs.existsSync(namesRoot)) return;
      fs.readdirSync(namesRoot).filter(function (name) { return /\.ffx$/i.test(name); }).sort().forEach(function (fileName) {
        var presetBase = fileName.replace(/\.ffx$/i, "");
        var name = presetBase.replace(/^\s+|\s+$/g, "");
        output.push({ id:info.key + ":" + name.toLowerCase(), name:name, presetBase:presetBase, category:info.key, categoryLabel:info.label, folder:categoryEntry.name, root:root });
      });
    });
    return output;
  }
  function asset(item, direction, extension) {
    if (!item || !path) return "";
    var base = extension.toLowerCase() === ".ffx" ? (item.presetBase || item.name) : item.name;
    return path.join(item.root, item.folder, direction, state.target, base + extension);
  }
  function exists(filePath) {
    try { return !!(filePath && fs && fs.existsSync(filePath)); } catch (error) { return false; }
  }
  function setStatus(message, error) {
    var status = document.getElementById("textFxStatus");
    if (!status) return;
    status.classList.toggle("error", !!error);
    var copy = status.querySelector("span");
    if (copy) copy.textContent = message;
  }
  function updatePreview(item) {
    var name = document.getElementById("textFxPreviewName");
    var meta = document.getElementById("textFxPreviewMeta");
    if (!item) {
      if (name) name.textContent = "Select a Text FX preset";
      if (meta) meta.textContent = "Simple · " + state.target;
      return;
    }
    if (name) name.textContent = item.name;
    if (meta) meta.textContent = item.categoryLabel + " · " + state.target + " · " + state.previewDirection + " preview";
    setStatus(item.name + " ready · " + state.target + " target.");
  }
  function filteredItems() {
    var query = state.query.toLowerCase();
    return state.items.filter(function (item) {
      if (state.category === "favorites" && !state.favorites[item.id]) return false;
      if (state.category !== "all" && state.category !== "favorites" && item.category !== state.category) return false;
      return !query || (item.name + " " + item.categoryLabel).toLowerCase().indexOf(query) !== -1;
    });
  }
  function glyph(item) {
    return { simple:"S", modern:"M", around:"A", elastic:"E", funny:"F" }[item.category] || "T";
  }
  function loadPreviewImage(image) {
    if (!image || image.getAttribute("src")) return;
    var source = image.getAttribute("data-preview-src");
    if (source) image.setAttribute("src", source);
  }
  function hydrateVisiblePreviews() {
    var images = Array.prototype.slice.call(document.querySelectorAll("#textFxGrid .cx-textfx-thumb-img"));
    if (previewObserver) { previewObserver.disconnect(); previewObserver = null; }
    if (typeof window.IntersectionObserver !== "function") {
      images.forEach(loadPreviewImage);
      return;
    }
    previewObserver = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadPreviewImage(entry.target);
        previewObserver.unobserve(entry.target);
      });
    }, { root:document.getElementById("textFxGrid"), rootMargin:"90px" });
    images.forEach(function (image) { previewObserver.observe(image); });
  }
  function replayVisiblePreviews() {
    Array.prototype.forEach.call(document.querySelectorAll("#textFxGrid .cx-textfx-thumb-img[src]"), function (image) {
      var source = image.getAttribute("data-preview-src");
      image.removeAttribute("src");
      window.setTimeout(function () { if (source) image.setAttribute("src", source); }, 20);
    });
  }
  function render() {
    var grid = document.getElementById("textFxGrid");
    var count = document.getElementById("textFxCount");
    if (!grid) return;
    var items = filteredItems();
    if (count) count.textContent = items.length + " of " + state.items.length + " paired animations · " + state.target;
    if (!items.length) {
      grid.innerHTML = '<div class="studio-empty">No Text FX match the current filter.</div>';
      return;
    }
    var directionLabel = state.previewDirection === "OUT" ? "OUT" : "IN";
    var selectedApply = document.getElementById("btnTextFxApplySelected");
    if (selectedApply) selectedApply.textContent = "APPLY SELECTED " + directionLabel;
    grid.innerHTML = items.map(function (item) {
      var previewPath = asset(item, state.previewDirection, ".gif");
      var previewUrl = exists(previewPath) ? fileUrl(previewPath) : "";
      return '<article class="cx-textfx-card' + (state.selected && state.selected.id === item.id ? ' active' : '') + '" data-text-fx-id="' + escapeHtml(item.id) + '">' +
        '<div class="cx-textfx-thumb">' +
          '<img class="cx-textfx-thumb-img" data-preview-src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(item.name + " " + state.previewDirection + " animation preview") + '"/>' +
          '<span class="cx-textfx-thumb-empty">PREVIEW</span>' +
          '<span class="cx-textfx-preview-badge">' + state.previewDirection + '</span>' +
          '<button class="cx-textfx-fav' + (state.favorites[item.id] ? ' active' : '') + '" type="button" data-text-fx-favorite="' + escapeHtml(item.id) + '" title="Favorite">&#9733;</button>' +
        '</div>' +
        '<div class="cx-textfx-copy"><strong title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</strong><small><b>' + glyph(item) + '</b> ' + escapeHtml(item.categoryLabel) + ' · ' + escapeHtml(state.target) + '</small></div>' +
        '<div class="cx-textfx-card-actions"><button type="button" data-text-fx-apply="' + escapeHtml(item.id) + '">APPLY ' + directionLabel + '</button></div>' +
      '</article>';
    }).join("");
    hydrateVisiblePreviews();
  }
  function selectItem(id, commit) {
    var item = state.items.filter(function (candidate) { return candidate.id === id; })[0] || null;
    if (!item) return;
    if (commit !== false) state.selected = item;
    updatePreview(item);
    if (commit !== false) render();
  }
  function setActiveButtons(selector, attribute, value) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (button) {
      button.classList.toggle("active", button.getAttribute(attribute) === value);
    });
  }
  function apply(mode) {
    if (!state.selected) { toast("Select a Text FX preset first.", true); return; }
    var inPath = asset(state.selected, "IN", ".ffx");
    var outPath = asset(state.selected, "OUT", ".ffx");
    if ((mode === "in" || mode === "both") && !exists(inPath)) { toast("IN preset is missing.", true); return; }
    if ((mode === "out" || mode === "both") && !exists(outPath)) { toast("OUT preset is missing.", true); return; }
    var keep = !!document.getElementById("textFxKeepOriginal").checked;
    setStatus("Applying " + mode.toUpperCase() + " · " + state.selected.name + "...");
    callHost("ae_applyTextFxPair(" + hostArg(inPath) + "," + hostArg(outPath) + "," + hostArg(mode) + "," + (keep ? "true" : "false") + ",0)", function (result) {
      setStatus(result.message || (result.success ? "Text FX applied." : "Text FX failed."), !result.success);
      toast(result.message || (result.success ? "Text FX applied" : "Text FX failed"), !result.success);
    });
  }
  function wireTabs() {
    var tabs = document.getElementById("textLibraryTabs");
    if (!tabs) return;
    tabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-text-library-tab]");
      if (!button) return;
      var value = button.getAttribute("data-text-library-tab");
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-text-library-tab]"), function (tab) { tab.classList.toggle("active", tab === button); });
      Array.prototype.forEach.call(document.querySelectorAll("[data-text-library-panel]"), function (panel) { panel.hidden = panel.getAttribute("data-text-library-panel") !== value; });
      if (value === "textfx") {
        if (state.selected) updatePreview(state.selected);
        window.setTimeout(hydrateVisiblePreviews, 0);
      }
    });
  }
  function init() {
    var root = document.getElementById("textFxGrid");
    if (!root) return;
    wireTabs();
    loadFavorites();
    state.items = scanLibrary();
    state.selected = state.items[0] || null;
    render();
    updatePreview(state.selected);
    if (!state.items.length) setStatus("Bundled Text FX assets were not found.", true);

    var search = document.getElementById("textFxSearch");
    if (search) search.addEventListener("input", function () { state.query = search.value || ""; render(); });
    var targets = document.getElementById("textFxTargets");
    if (targets) targets.addEventListener("click", function (event) {
      var button = event.target.closest("[data-text-fx-target]");
      if (!button) return;
      state.target = button.getAttribute("data-text-fx-target");
      setActiveButtons("[data-text-fx-target]", "data-text-fx-target", state.target);
      render(); updatePreview(state.selected);
    });
    var categories = document.getElementById("textFxCategories");
    if (categories) categories.addEventListener("click", function (event) {
      var button = event.target.closest("[data-text-fx-category]");
      if (!button) return;
      state.category = button.getAttribute("data-text-fx-category");
      setActiveButtons("[data-text-fx-category]", "data-text-fx-category", state.category);
      render();
    });
    var directions = document.getElementById("textFxDirection");
    if (directions) directions.addEventListener("click", function (event) {
      var button = event.target.closest("[data-text-fx-direction]");
      if (!button) return;
      state.previewDirection = button.getAttribute("data-text-fx-direction");
      setActiveButtons("[data-text-fx-direction]", "data-text-fx-direction", state.previewDirection);
      render(); updatePreview(state.selected);
    });
    root.addEventListener("mouseover", function (event) {
      var card = event.target.closest("[data-text-fx-id]");
      if (card) selectItem(card.getAttribute("data-text-fx-id"), false);
    });
    root.addEventListener("mouseleave", function () { updatePreview(state.selected); });
    root.addEventListener("click", function (event) {
      var favorite = event.target.closest("[data-text-fx-favorite]");
      if (favorite) {
        event.stopPropagation();
        var favoriteId = favorite.getAttribute("data-text-fx-favorite");
        state.favorites[favoriteId] = !state.favorites[favoriteId];
        saveFavorites(); render(); return;
      }
      var applyButton = event.target.closest("[data-text-fx-apply]");
      if (applyButton) {
        selectItem(applyButton.getAttribute("data-text-fx-apply"), true);
        apply(state.previewDirection.toLowerCase());
        return;
      }
      var card = event.target.closest("[data-text-fx-id]");
      if (card) selectItem(card.getAttribute("data-text-fx-id"), true);
    });
    var replay = document.getElementById("btnTextFxReplay");
    if (replay) replay.addEventListener("click", replayVisiblePreviews);
    document.getElementById("btnTextFxApplySelected").addEventListener("click", function () { apply(state.previewDirection.toLowerCase()); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
