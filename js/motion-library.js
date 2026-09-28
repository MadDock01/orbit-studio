(function () {
  "use strict";

  var FAVORITES_KEY = "compxMotionFavorites";
  var state = { items: [], selected: null, category: "all", query: "", favorites: {} };
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
    if (!cs) { callback({ success: false, message: "After Effects host bridge is unavailable." }); return; }
    cs.evalScript(script, function (raw) {
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (parseError) { parsed = { success: false, message: String(raw || "Invalid host response") }; }
      callback(parsed || { success: false, message: "No host response." });
    });
  }
  function fileUrl(filePath) {
    var normalized = String(filePath || "").replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized)) normalized = "/" + normalized;
    return "file://" + encodeURI(normalized).replace(/#/g, "%23");
  }
  function extensionRoot() {
    if (!cs) return "";
    try { return cs.getSystemPath(SystemPath.EXTENSION); } catch (error) { return ""; }
  }
  function loadFavorites() {
    try {
      var saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      if (Array.isArray(saved)) saved.forEach(function (id) { state.favorites[id] = true; });
    } catch (error) { state.favorites = {}; }
  }
  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Object.keys(state.favorites).filter(function (id) { return state.favorites[id]; })));
    } catch (error) { void error; }
  }
  function exists(filePath) {
    try { return !!(filePath && fs && fs.existsSync(filePath)); } catch (error) { return false; }
  }
  function scanLibrary() {
    if (!fs || !path) return [];
    var root = path.join(extensionRoot(), "presets", "motions");
    if (!exists(root)) return [];
    var output = [];
    fs.readdirSync(root, { withFileTypes: true }).filter(function (entry) { return entry.isDirectory(); }).forEach(function (categoryEntry) {
      var folder = path.join(root, categoryEntry.name);
      fs.readdirSync(folder).filter(function (name) { return /\.aep$/i.test(name); }).sort().forEach(function (fileName) {
        var base = fileName.replace(/\.aep$/i, "");
        var aepPath = path.join(folder, fileName);
        var gifPath = path.join(folder, base + ".gif");
        output.push({
          id: categoryEntry.name.toLowerCase() + ":" + base.toLowerCase(),
          name: base,
          category: categoryEntry.name.toLowerCase(),
          categoryLabel: categoryEntry.name,
          aepPath: aepPath,
          gifPath: exists(gifPath) ? gifPath : ""
        });
      });
    });
    return output;
  }
  function setStatus(message, error) {
    var status = document.getElementById("motionStatus");
    if (!status) return;
    status.classList.toggle("error", !!error);
    var copy = status.querySelector("span");
    if (copy) copy.textContent = message;
  }
  function updatePreview(item) {
    var name = document.getElementById("motionPreviewName");
    var meta = document.getElementById("motionPreviewMeta");
    if (!item) {
      if (name) name.textContent = "Select a motion";
      if (meta) meta.textContent = "95 presets · click to insert";
      return;
    }
    if (name) name.textContent = item.name;
    if (meta) meta.textContent = item.categoryLabel + " · collapsed precomp";
    setStatus(item.name + " ready. Open a comp, then apply.");
  }
  function filteredItems() {
    var query = state.query.toLowerCase();
    return state.items.filter(function (item) {
      if (state.category === "favorites" && !state.favorites[item.id]) return false;
      if (state.category !== "all" && state.category !== "favorites" && item.category !== state.category) return false;
      return !query || (item.name + " " + item.categoryLabel).toLowerCase().indexOf(query) !== -1;
    });
  }
  function loadPreviewImage(image) {
    if (!image || image.getAttribute("src")) return;
    var source = image.getAttribute("data-preview-src");
    if (source) image.setAttribute("src", source);
  }
  function hydrateVisiblePreviews() {
    var images = Array.prototype.slice.call(document.querySelectorAll("#motionGrid .cx-textfx-thumb-img"));
    images.forEach(function (image) {
      var rect = image.getBoundingClientRect();
      if (rect.bottom >= 0 && rect.top <= (window.innerHeight || 800) + 80) loadPreviewImage(image);
    });
  }
  function replayVisiblePreviews() {
    Array.prototype.slice.call(document.querySelectorAll("#motionGrid .cx-textfx-thumb-img[src]")).forEach(function (image) {
      var source = image.getAttribute("src");
      image.removeAttribute("src");
      image.setAttribute("src", source);
    });
  }
  function setActiveButtons(selector, attr, value) {
    Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(function (button) {
      button.classList.toggle("active", button.getAttribute(attr) === value);
    });
  }
  function renderCategories() {
    var host = document.getElementById("motionCategories");
    if (!host) return;
    var seen = {};
    var cats = [];
    state.items.forEach(function (item) {
      if (seen[item.category]) return;
      seen[item.category] = true;
      cats.push({ key: item.category, label: item.categoryLabel });
    });
    host.innerHTML =
      '<button class="active" type="button" data-motion-category="all">ALL</button>' +
      cats.map(function (cat) {
        return '<button type="button" data-motion-category="' + escapeHtml(cat.key) + '">' + escapeHtml(cat.label.toUpperCase()) + "</button>";
      }).join("") +
      '<button type="button" data-motion-category="favorites">&#9733; FAV</button>';
    if (state.category !== "all") setActiveButtons("[data-motion-category]", "data-motion-category", state.category);
  }
  function selectItem(id, persist) {
    var item = null;
    state.items.forEach(function (entry) { if (entry.id === id) item = entry; });
    if (persist) state.selected = item;
    updatePreview(item || state.selected);
    Array.prototype.slice.call(document.querySelectorAll("#motionGrid .cx-textfx-card")).forEach(function (card) {
      card.classList.toggle("active", card.getAttribute("data-motion-id") === (item || state.selected || {}).id);
    });
  }
  function apply(item) {
    item = item || state.selected;
    if (!item) { setStatus("Select a motion first.", true); return; }
    setStatus("Inserting " + item.name + "...");
    callHost("ae_importMotionPreset(" + hostArg(item.aepPath) + ")", function (result) {
      setStatus(result.message || (result.success ? "Motion inserted." : "Insert failed."), !result.success);
      toast(result.message || (result.success ? "Motion inserted." : "Insert failed."), !result.success);
    });
  }
  function render() {
    var grid = document.getElementById("motionGrid");
    var count = document.getElementById("motionCount");
    var items = filteredItems();
    if (count) count.textContent = items.length + " / " + state.items.length + " motions";
    if (!grid) return;
    if (!items.length) {
      grid.innerHTML = '<div class="studio-empty">' + (state.items.length ? "No motions match this filter." : "Motion pack not found in presets/motions.") + "</div>";
      return;
    }
    grid.innerHTML = items.map(function (item) {
      var preview = item.gifPath ? fileUrl(item.gifPath) : "";
      return '<article class="cx-textfx-card' + (state.selected && state.selected.id === item.id ? " active" : "") + '" data-motion-id="' + escapeHtml(item.id) + '">' +
        '<button class="cx-textfx-fav' + (state.favorites[item.id] ? " active" : "") + '" type="button" data-motion-favorite="' + escapeHtml(item.id) + '" title="Favorite">&#9733;</button>' +
        '<div class="cx-textfx-thumb"><span class="cx-textfx-thumb-empty">' + escapeHtml(item.categoryLabel) + "</span>" +
        (preview ? '<img class="cx-textfx-thumb-img" alt="" data-preview-src="' + escapeHtml(preview) + '">' : "") +
        "</div>" +
        '<div class="cx-textfx-copy"><strong>' + escapeHtml(item.name) + "</strong><small>" + escapeHtml(item.categoryLabel) + "</small></div>" +
        '<div class="cx-textfx-card-actions"><button type="button" data-motion-apply="' + escapeHtml(item.id) + '">INSERT</button></div>' +
        "</article>";
    }).join("");
    if (previewObserver) previewObserver.disconnect();
    if (typeof IntersectionObserver !== "undefined") {
      previewObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) loadPreviewImage(entry.target); });
      }, { root: grid, rootMargin: "80px" });
      Array.prototype.slice.call(grid.querySelectorAll(".cx-textfx-thumb-img")).forEach(function (image) { previewObserver.observe(image); });
    } else {
      hydrateVisiblePreviews();
    }
  }
  function wireDrop() {
    var root = document.getElementById("motionPresetView");
    if (!root) return;
    root.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    root.addEventListener("drop", function (event) {
      event.preventDefault();
      var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
      var i;
      for (i = 0; i < files.length; i++) {
        var file = files[i];
        var filePath = file.path || "";
        if (!/\.aep$/i.test(filePath || file.name || "")) continue;
        callHost("ae_importMotionPreset(" + hostArg(filePath) + ")", function (result) {
          toast(result.message || (result.success ? "Motion inserted." : "Insert failed."), !result.success);
          setStatus(result.message || "Drop insert finished.", !result.success);
        });
      }
    });
  }
  function init() {
    var root = document.getElementById("motionPresetView");
    if (!root) return;
    loadFavorites();
    state.items = scanLibrary();
    renderCategories();
    render();
    updatePreview(null);
    setStatus(state.items.length ? state.items.length + " motions ready. Open a comp, then click INSERT." : "No motion files found.", !state.items.length);

    var search = document.getElementById("motionSearch");
    if (search) search.addEventListener("input", function () {
      state.query = search.value;
      render();
    });
    var categories = document.getElementById("motionCategories");
    if (categories) categories.addEventListener("click", function (event) {
      var button = event.target.closest("[data-motion-category]");
      if (!button) return;
      state.category = button.getAttribute("data-motion-category");
      setActiveButtons("[data-motion-category]", "data-motion-category", state.category);
      render();
    });
    root.addEventListener("mouseover", function (event) {
      var card = event.target.closest("[data-motion-id]");
      if (card) selectItem(card.getAttribute("data-motion-id"), false);
    });
    root.addEventListener("click", function (event) {
      var favorite = event.target.closest("[data-motion-favorite]");
      if (favorite) {
        event.stopPropagation();
        var favoriteId = favorite.getAttribute("data-motion-favorite");
        state.favorites[favoriteId] = !state.favorites[favoriteId];
        saveFavorites();
        render();
        return;
      }
      var applyButton = event.target.closest("[data-motion-apply]");
      if (applyButton) {
        selectItem(applyButton.getAttribute("data-motion-apply"), true);
        apply(state.selected);
        return;
      }
      var card = event.target.closest("[data-motion-id]");
      if (card) selectItem(card.getAttribute("data-motion-id"), true);
    });
    var replay = document.getElementById("btnMotionReplay");
    if (replay) replay.addEventListener("click", replayVisiblePreviews);
    var applySelected = document.getElementById("btnMotionApplySelected");
    if (applySelected) applySelected.addEventListener("click", function () { apply(state.selected); });
    wireDrop();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
