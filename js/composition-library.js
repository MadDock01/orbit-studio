/* CompX Composition Library — migrated precomp manager
 * Stores references to standalone .aep composition packages on disk.
 * Loaded after main.js so it can use the shared, timeout-protected host bridge.
 */
(function () {
  "use strict";

  var nodeRequire = typeof require === "function" ? require : (typeof window.require === "function" ? window.require : null);
  var fs = nodeRequire ? nodeRequire("fs") : null;
  var pathUtil = nodeRequire ? nodeRequire("path") : null;
  var STORAGE_PATH = "compx.compositionLibrary.path.v1";
  var STORAGE_CATEGORIES = "compx.compositionLibrary.categories.v1";
  var STORAGE_SIZE = "compx.compositionLibrary.cardSize.v1";
  var THEME_KEY = "compx.compositionLibrary.theme.v1";
  var DEFAULT_SIZE = 140;
  var FRAME_COUNT = 12;

  var state = { folder: "", query: "", category: "all", selected: {}, lastIndex: -1, items: [] };
  var el = {};
  var elAdd = {}; // refs for the "Add to Library" modal elements

  function toast(message, isError) {
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.className = "toast"; }, 2600);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function normalizePath(value) {
    var result = String(value || "");
    if (/^file:\/\//i.test(result)) {
      result = result.replace(/^file:\/\//i, "");
      if (/^localhost\//i.test(result)) result = result.replace(/^localhost/i, "");
      else if (result.charAt(0) !== "/") result = "//" + result;
      try { result = decodeURIComponent(result); } catch (decodeError) { /* Keep malformed paths visible for correction. */ }
      if (/^\/[A-Za-z]:\//.test(result)) result = result.slice(1);
    }
    return result.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getCategories() {
    try {
      var categories = JSON.parse(localStorage.getItem(STORAGE_CATEGORIES) || "{}");
      return categories && typeof categories === "object" ? categories : {};
    } catch (e) { return {}; }
  }

  function setCategories(categories) {
    localStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(categories));
  }

  function itemKey(name) { return state.folder + "::" + name; }

  function categoryFor(name) { return getCategories()[itemKey(name)] || ""; }

  function setCategory(name, category) {
    var categories = getCategories();
    var key = itemKey(name);
    if (category) categories[key] = category;
    else delete categories[key];
    setCategories(categories);
  }

  function clearCategory(name) {
    var categories = getCategories();
    delete categories[itemKey(name)];
    setCategories(categories);
  }

  function uriFor(filePath) {
    var normalized = normalizePath(filePath);
    if (!normalized) return "";
    var revision = "";
    try { if (fs) revision = "?v=" + fs.statSync(normalized).mtime.getTime(); } catch (missingFile) { /* Missing preview is reported on the card. */ }
    if (/^[A-Za-z]:\//.test(normalized)) {
      return "file:///" + encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F") + revision;
    }
    if (normalized.charAt(0) === "/") {
      return "file://" + encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F") + revision;
    }
    return "file:///" + encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F") + revision;
  }

  // CEP serves the panel from a file:// origin. On macOS the renderer often
  // refuses to load a second file:// resource from elsewhere on disk, so the
  // preview PNGs silently fail there while Windows renders them fine. Node is
  // already enabled (--enable-nodejs), and fs reads are not subject to that
  // policy, so a failed <img> retries once as an inline data: URI.
  //
  // The manifest flag --allow-file-access-from-files would fix this at the
  // source, but editing CSXS/manifest.xml invalidates the extension signature,
  // so the fallback lives here instead.
  var DATA_URI_MAX_BYTES = 8 * 1024 * 1024;
  var dataUriCache = Object.create(null);

  function dataUriFor(filePath) {
    var normalized = normalizePath(filePath);
    if (!normalized || !fs) return "";
    if (dataUriCache[normalized] !== undefined) return dataUriCache[normalized];
    var uri = "";
    try {
      var info = fs.statSync(normalized);
      if (info.size > 0 && info.size <= DATA_URI_MAX_BYTES) {
        uri = "data:image/png;base64," + fs.readFileSync(normalized).toString("base64");
      }
    } catch (readError) { uri = ""; }
    dataUriCache[normalized] = uri;
    return uri;
  }

  // Swaps an <img> onto the inline copy exactly once, so a genuinely missing
  // file still ends up hidden instead of looping.
  function retryAsDataUri(image, filePath, onDone) {
    if (!image || image.dataset.inlineTried === "1") { if (onDone) onDone(false); return; }
    image.dataset.inlineTried = "1";
    var uri = dataUriFor(filePath);
    if (!uri) { if (onDone) onDone(false); return; }
    if (onDone) {
      image.onload = function () { onDone(true); };
      image.onerror = function () { onDone(false); };
    }
    image.src = uri;
  }

  function cardSize() {
    var value = Number(localStorage.getItem(STORAGE_SIZE));
    return value >= 90 && value <= 220 ? value : DEFAULT_SIZE;
  }

  function updateCardSize(value) {
    value = Math.max(90, Math.min(220, Number(value) || DEFAULT_SIZE));
    localStorage.setItem(STORAGE_SIZE, String(value));
    el.grid.style.setProperty("--compx-comp-card-size", value + "px");
  }

  function applyTheme(theme) {
    theme = theme === "neon" ? "neon" : "ae";
    if (el.panel) el.panel.setAttribute("data-compx-theme", theme);
    if (el.theme) el.theme.textContent = theme === "neon" ? "Theme: Neon" : "Theme: AE";
    localStorage.setItem(THEME_KEY, theme);
  }


  function selectedCount() { return Object.keys(state.selected).length; }

  function resetSelection() { state.selected = {}; state.lastIndex = -1; }

  function filteredItems() {
    var q = state.query.toLowerCase();
    return state.items.filter(function (item) {
      return (!q || item.name.toLowerCase().indexOf(q) !== -1) && (state.category === "all" || item.category === state.category);
    });
  }

  async function readItems() {
    if (!fs || !pathUtil || !state.folder) { state.items = []; render(); return; }
    try {
      var entries = await fs.promises.readdir(state.folder, { withFileTypes: true });
      state.items = entries.filter(function (entry) { return entry.isFile() && /\.aep$/i.test(entry.name); }).map(function (entry) {
        var name = entry.name.replace(/\.aep$/i, "");
        return { name: name, aepPath: pathUtil.join(state.folder, entry.name), previewPath: pathUtil.join(state.folder, name + ".png"), category: categoryFor(name) };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      resetSelection();
      render();
    } catch (error) {
      state.items = [];
      render();
      toast("Cannot read the composition folder", true);
    }
  }

  function renderCategories() {
    var names = {};
    state.items.forEach(function (item) { if (item.category) names[item.category] = true; });
    var categories = Object.keys(names).sort();
    el.categories.innerHTML = "";
    ["all"].concat(categories).forEach(function (category) {
      var button = document.createElement("button");
      button.className = "compx-comp-category" + (state.category === category ? " active" : "");
      button.textContent = category === "all" ? "All" : category;
      button.addEventListener("click", function () { state.category = category; resetSelection(); render(); });
      el.categories.appendChild(button);
    });
  }

  function render() {
    if (!el.grid) return;
    var items = filteredItems();
    el.path.value = state.folder;
    el.count.textContent = String(state.items.length);
    el.selected.textContent = selectedCount() + " selected";
    el.apply.disabled = selectedCount() === 0;
    el.clear.disabled = selectedCount() === 0;
    if (el.bulkDelete) el.bulkDelete.disabled = selectedCount() === 0;
    el.grid.style.setProperty("--compx-comp-card-size", cardSize() + "px");
    renderCategories();
    if (!state.folder) {
      el.grid.innerHTML = '<div class="compx-comp-empty">Choose a folder to view saved compositions.</div>';
      return;
    }
    if (!items.length) {
      el.grid.innerHTML = '<div class="compx-comp-empty">No saved compositions yet. Select an active composition in After Effects and choose Add.</div>';
      return;
    }
    el.grid.innerHTML = items.map(function (item, index) {
      var key = itemKey(item.name);
      var frames = [];
      for (var i = 0; i < FRAME_COUNT; i++) frames.push(uriFor(pathUtil.join(state.folder, item.name + "_frames", "frame_" + (i < 10 ? "0" : "") + i + ".png")));
      var framePaths = [];
      for (var f = 0; f < FRAME_COUNT; f++) framePaths.push(pathUtil.join(state.folder, item.name + "_frames", "frame_" + (f < 10 ? "0" : "") + f + ".png"));
      return '<article class="compx-comp-card fxlib-card' + (state.selected[key] ? " selected" : "") + '" data-name="' + esc(item.name) + '" data-index="' + index + '" data-preview="' + esc(uriFor(item.previewPath)) + '" data-preview-file="' + esc(item.previewPath) + '" data-frames="' + esc(JSON.stringify(frames)) + '" data-frame-files="' + esc(JSON.stringify(framePaths)) + '">' +
        '<div class="compx-comp-preview"><img alt="" src="' + esc(uriFor(item.previewPath)) + '"/>' +
        '<div class="compx-comp-no-thumb"></div>' +
        (item.category ? '<span>' + esc(item.category) + '</span>' : '') + '</div>' +
        '<div class="compx-comp-meta fxlib-cardmeta"><strong title="' + esc(item.name) + '">' + esc(item.name) + '</strong><span data-preview-status>Loading animation preview…</span></div>' +
        '<button class="compx-comp-apply fxlib-apply" data-action="import" title="Import — add to project">Import</button>' +
        '</article>';
    }).join("");
    el.grid.querySelectorAll(".compx-comp-card").forEach(bindCard);
  }

  function bindCard(card) {
    var image = card.querySelector("img");
    var preview = card.dataset.preview;
    var interval = null;
    var hovered = false;
    var previewStatus = card.querySelector("[data-preview-status]");
    image.onload = function () { image.style.display = ""; };
    image.onerror = function () {
      retryAsDataUri(image, card.dataset.previewFile, function (ok) {
        if (!ok) image.style.display = "none";
      });
    };

    // Pre-load frame images so hover animation only plays when files exist.
    // validFrames is filled asynchronously; mouseenter checks its length.
    var validFrames = [];
    function startPreview() {
      if (!hovered || interval || validFrames.length < 2) return;
      validFrames.sort(function (a, b) { return a.idx - b.idx; });
      var frameIndex = 0;
      image.src = validFrames[frameIndex++].src;
      interval = setInterval(function () {
        if (!card.isConnected) { clearInterval(interval); interval = null; return; }
        image.src = validFrames[frameIndex++ % validFrames.length].src;
      }, 90);
    }
    (function preloadFrames() {
      var raw = [];
      try { raw = JSON.parse(card.dataset.frames || "[]"); } catch (e) { raw = []; }
      var completed = 0;
      function loaded() {
        completed++;
        if (previewStatus) previewStatus.textContent = validFrames.length >= 2 ? "Hover to animate · " + validFrames.length + " frames" : (completed >= raw.length ? "Thumbnail only — re-save to create animation preview" : "Loading animation preview…");
        startPreview();
      }
      var rawFiles = [];
      try { rawFiles = JSON.parse(card.dataset.frameFiles || "[]"); } catch (e) { rawFiles = []; }
      raw.forEach(function (src, idx) {
        var img = new Image();
        img.onload = function () { validFrames.push({ idx: idx, src: src }); loaded(); };
        img.onerror = function () {
          // second chance: inline the bytes, then remember the inline source so
          // the hover animation plays from it too
          var uri = dataUriFor(rawFiles[idx]);
          if (!uri) { loaded(); return; }
          var retry = new Image();
          retry.onload = function () { validFrames.push({ idx: idx, src: uri }); loaded(); };
          retry.onerror = loaded;
          retry.src = uri;
        };
        img.src = src;
      });
    })();

    card.addEventListener("mouseenter", function () {
      hovered = true;
      startPreview();
    });
    card.addEventListener("mouseleave", function () {
      hovered = false;
      if (interval) clearInterval(interval);
      interval = null;
      image.src = preview;
    });

    card.addEventListener("dblclick", function (event) {
      var act = event.target.closest("[data-action]");
      if (act) return; // let explicit buttons handle their own action
      handleAction("rename", card.dataset.name);
    });

    card.addEventListener("click", function (event) {
      // Action buttons (Rename / Delete) — handle and stop here
      var action = event.target.closest("[data-action]");
      var name = card.dataset.name;
      if (action) { handleAction(action.dataset.action, name); return; }

      var key = itemKey(name);
      var index = Number(card.dataset.index);

      if (event.shiftKey && state.lastIndex >= 0) {
        // Shift+Click: range-select for bulk category
        var allCards = Array.prototype.slice.call(el.grid.querySelectorAll(".compx-comp-card"));
        allCards.slice(Math.min(state.lastIndex, index), Math.max(state.lastIndex, index) + 1)
          .forEach(function (c) { state.selected[itemKey(c.dataset.name)] = true; });
        render();
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl+Click: toggle selection for bulk category
        if (state.selected[key]) delete state.selected[key]; else state.selected[key] = true;
        state.lastIndex = index;
        render();
      } else {
        // Plain click: select this card. Matches the old extension where a bare
        // click only selects (for category assignment) and the explicit Import
        // button performs the import. Single-select replaces any selection.
        state.selected = {};
        state.selected[key] = true;
        state.lastIndex = index;
        render();
      }
    });
  }

  // timeout is optional; defaults to CompXHostBridge/main.js HOST_CALL_TIMEOUT_MS (120 s)
  function host(name, args, done, timeout) {
    if (!window.CompXHostBridge) { toast("Adobe host bridge is unavailable", true); return; }
    var parts = (args || []).map(window.CompXHostBridge.arg).join(",");
    window.CompXHostBridge.call(name + "(" + parts + ")", done, timeout);
  }

  function bulkDeleteSelected() {
    var chosen = state.items.filter(function (item) { return !!state.selected[itemKey(item.name)]; });
    if (!chosen.length) return;
    
    if (window.showModal) {
      window.showModal({
        title: "Bulk Delete",
        message: "Delete " + chosen.length + " selected composition(s) and their previews?",
        danger: true,
        okText: "Delete"
      }).then(function (confirmed) {
        if (confirmed) executeBulkDelete(chosen);
      });
    } else {
      if (!window.confirm("Delete " + chosen.length + " selected composition(s) and their previews?")) return;
      executeBulkDelete(chosen);
    }

    function executeBulkDelete(items) {
      var index = 0, deleted = 0, failed = 0;
      function next() {
        if (index >= items.length) {
          resetSelection();
          readItems();
          toast(deleted + " composition(s) deleted" + (failed ? " • " + failed + " failed" : ""), failed > 0);
          return;
        }
        var item = items[index++];
        host("compx_deleteComposition", [item.aepPath], function (result) {
          if (result && result.success) { deleted++; clearCategory(item.name); }
          else failed++;
          next();
        });
      }
      next();
    }
  }

  function handleAction(action, name) {
    var item = state.items.filter(function (value) { return value.name === name; })[0];
    if (!item) return;
    if (action === "timeline") {
      host("compx_addCompositionToTimeline", [normalizePath(item.aepPath)], function (result) { toast(result.message || (result.success ? "Added to timeline" : "Could not add to timeline"), !result.success); });
    } else if (action === "import") {
      host("compx_importComposition", [normalizePath(item.aepPath)], function (result) { toast(result.message || (result.success ? "Composition imported" : "Import failed"), !result.success); });
    } else if (action === "rename") {
      var next = window.prompt("New composition name:", name);
      if (!next || !next.trim() || next.trim() === name) return;
      host("compx_renameComposition", [item.aepPath, next.trim()], function (result) {
        if (result.success) { clearCategory(name); if (item.category) setCategory(result.data || next.trim().replace(/\s+/g, "_"), item.category); readItems(); }
        toast(result.message || (result.success ? "Composition renamed" : "Rename failed"), !result.success);
      });
    } else if (action === "delete") {
      if (window.showModal) {
        window.showModal({
          title: "Delete Composition",
          message: 'Delete "' + name + '" and its previews?',
          danger: true,
          okText: "Delete"
        }).then(function (confirmed) {
          if (confirmed) {
            host("compx_deleteComposition", [item.aepPath], function (result) {
              if (result.success) { clearCategory(name); readItems(); }
              toast(result.message || (result.success ? "Composition deleted" : "Delete failed"), !result.success);
            });
          }
        });
      } else {
        if (!window.confirm('Delete "' + name + '" and its previews?')) return;
        host("compx_deleteComposition", [item.aepPath], function (result) {
          if (result.success) { clearCategory(name); readItems(); }
          toast(result.message || (result.success ? "Composition deleted" : "Delete failed"), !result.success);
        });
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     ADD TO LIBRARY — Rich Modal
     Replaces the old window.prompt() with a 3-field form
     matching the original CompX v1.1.1 "Add to Library"
     modal (comp name + existing category + new category).
     ══════════════════════════════════════════════════════ */

  function openAddModal() {
    if (!state.folder) { toast("Choose a storage folder first", true); return; }

    // Reset fields
    elAdd.name.value = "";
    elAdd.newCat.value = "";
    elAdd.btnConfirm.disabled = false;
    elAdd.btnLabel.textContent = "+ Add Comp";

    // Populate existing-category dropdown from items currently in the grid
    var cats = {};
    state.items.forEach(function (item) { if (item.category) cats[item.category] = true; });
    var catList = Object.keys(cats).sort();
    elAdd.catSelect.innerHTML = '<option value="">— No category —</option>';
    catList.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      elAdd.catSelect.appendChild(opt);
    });
    if (catList.length === 0) {
      elAdd.catSelect.options[0].textContent = "— No categories yet —";
    }

    elAdd.modal.style.display = "flex";
    setTimeout(function () { elAdd.name.focus(); }, 40);
  }

  function closeAddModal() {
    elAdd.modal.style.display = "none";
    elAdd.btnConfirm.disabled = false;
    elAdd.btnLabel.textContent = "+ Add Comp";
  }

  function confirmAddComp() {
    if (!state.folder) return;

    var customName = elAdd.name.value.trim().replace(/\s+/g, "_");
    var selectedCat = elAdd.catSelect.value.trim();
    var newCat = elAdd.newCat.value.trim();
    var finalCat = newCat || selectedCat;

    // Disable button and show animated progress label
    elAdd.btnConfirm.disabled = true;
    var dotCount = 0;
    var dotLabels = ["Saving.", "Saving..", "Saving...", "Working.", "Working..", "Working..."];
    elAdd.btnLabel.textContent = dotLabels[0];
    var dotTimer = setInterval(function () {
      dotCount = (dotCount + 1) % dotLabels.length;
      elAdd.btnLabel.textContent = dotLabels[dotCount];
    }, 700);

    // Use a 5-minute timeout — reduceProject + 13 frame renders + AEP save
    // + app.open can take 2-4 minutes on large / complex projects.
    var SAVE_TIMEOUT_MS = 300000;

    host("compx_saveActiveComposition", [state.folder, customName], function (result) {
      clearInterval(dotTimer);
      if (result.success) {
        var savedName = result.data || customName;
        if (finalCat && savedName) setCategory(savedName, finalCat);
        closeAddModal();
        toast(result.message || "Composition saved", false);
        readItems();
      } else {
        elAdd.btnConfirm.disabled = false;
        elAdd.btnLabel.textContent = "+ Add Comp";
        toast(result.message || "Could not save composition", true);
      }
    }, SAVE_TIMEOUT_MS);
  }

  /* ══════════════════════════════════════════════════════ */

  function addComposition() {
    // Entry point wired to the "Add" toolbar button.
    // Opens the rich modal instead of window.prompt().
    openAddModal();
  }

  function applyCategory() {
    var category = String(el.categoryInput.value || "").trim();
    if (!category) { toast("Enter a category name", true); return; }
    state.items.forEach(function (item) { if (state.selected[itemKey(item.name)]) setCategory(item.name, category); });
    state.items.forEach(function (item) { item.category = categoryFor(item.name); });
    el.categoryInput.value = "";
    resetSelection();
    render();
  }

  function chooseFolder() {
    if (!window.cep || !window.cep.fs) { toast("Folder chooser is unavailable", true); return; }
    var result = window.cep.fs.showOpenDialog(false, true, "Select Composition Library Folder", state.folder || "", "");
    if (!result || !result.data || !result.data.length) return;
    state.folder = normalizePath(result.data[0]);
    localStorage.setItem(STORAGE_PATH, state.folder);
    readItems();
  }

  function init() {
    try {
      if (window.cep) {
        var cs = new CSInterface();
        var jsxPath = cs.getSystemPath(SystemPath.EXTENSION) + "/jsx/hostscript.jsx";
        cs.evalScript('$.evalFile("' + jsxPath.replace(/\\/g, '/') + '")');
      }
    } catch (e) {
      console.warn("CompX: could not hot-reload JSX", e);
    }

    el = {
      panel:         document.getElementById("panel-comps"),
      view:          document.getElementById("compositionLibraryView"),
      theme:         document.getElementById("btnCompxCompTheme"),
      path:          document.getElementById("compxCompPath"),
      browse:        document.getElementById("btnCompxCompBrowse"),
      refresh:       document.getElementById("btnCompxCompRefresh"),
      add:           document.getElementById("btnCompxCompAdd"),
      search:        document.getElementById("compxCompSearch"),
      size:          document.getElementById("compxCompSize"),
      categories:    document.getElementById("compxCompCategories"),
      grid:          document.getElementById("compxCompGrid"),
      count:         document.getElementById("compxCompCount"),
      selected:      document.getElementById("compxCompSelected"),
      categoryInput: document.getElementById("compxCompCategoryInput"),
      apply:         document.getElementById("btnCompxCompApplyCategory"),
      clear:         document.getElementById("btnCompxCompClearSelection"),
      bulkDelete:    document.getElementById("btnCompxCompBulkDelete")
    };

    // Cache "Add to Library" modal element refs
    elAdd = {
      modal:      document.getElementById("compxAddModal"),
      name:       document.getElementById("compxAddName"),
      catSelect:  document.getElementById("compxAddCatSelect"),
      newCat:     document.getElementById("compxAddNewCat"),
      btnConfirm: document.getElementById("btnCompxAddConfirm"),
      btnCancel:  document.getElementById("btnCompxAddCancel"),
      btnClose:   document.getElementById("btnCompxAddClose"),
      btnLabel:   document.getElementById("compxAddBtnLabel")
    };

    if (!el.view) return;

    state.folder = normalizePath(localStorage.getItem(STORAGE_PATH) || "");
    el.size.value = cardSize();

    el.browse.addEventListener("click", chooseFolder);
    el.refresh.addEventListener("click", readItems);
    el.add.addEventListener("click", addComposition);
    el.search.addEventListener("input", function () { state.query = el.search.value || ""; resetSelection(); render(); });
    el.size.addEventListener("input", function () { updateCardSize(el.size.value); });
    el.apply.addEventListener("click", applyCategory);
    el.clear.addEventListener("click", function () { resetSelection(); render(); });
    if (el.bulkDelete) el.bulkDelete.addEventListener("click", bulkDeleteSelected);
    el.categoryInput.addEventListener("keydown", function (event) { if (event.key === "Enter") applyCategory(); });
    el.theme.addEventListener("click", function () {
      var current = el.panel.getAttribute("data-compx-theme") || "ae";
      applyTheme(current === "ae" ? "neon" : "ae");
    });

    // Wire "Add to Library" modal controls
    if (elAdd.modal) {
      elAdd.btnConfirm.addEventListener("click", confirmAddComp);
      elAdd.btnCancel.addEventListener("click", closeAddModal);
      elAdd.btnClose.addEventListener("click", closeAddModal);

      // Clicking the dark backdrop dismisses the modal
      elAdd.modal.addEventListener("mousedown", function (event) {
        if (event.target === elAdd.modal) closeAddModal();
      });

      // Keyboard shortcuts inside the modal
      elAdd.modal.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closeAddModal();
          return;
        }
        // Enter submits only when focus is on a form field (not the buttons)
        if (event.key === "Enter" && !elAdd.btnConfirm.disabled) {
          var tag = document.activeElement && document.activeElement.tagName;
          if (tag === "INPUT" || tag === "SELECT") {
            event.preventDefault();
            confirmAddComp();
          }
        }
      });
    }

    try { applyTheme(localStorage.getItem(THEME_KEY) || "ae"); }
    catch (e) { console.warn("CompX: could not restore Comp Saver theme", e); applyTheme("ae"); }
    readItems();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
