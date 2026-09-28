/* CompX Asset Library — panel logic
 *
 * Runs inside the CEP (Chromium) panel. Node integration is enabled in the
 * manifest (--enable-nodejs / --mixed-context) so we can use fs/path directly
 * to read audio files from disk and scan folders — no upload/copy step,
 * matching the "reference the file path, don't duplicate storage" goal.
 */

(function () {
  "use strict";

  // CEP Node integration is optional in some Adobe installs. Never let a
  // missing `require` stop the entire panel (including tab switching).
  const nodeRequire = typeof require === "function" ? require : (typeof window.require === "function" ? window.require : null);
  const fs = nodeRequire ? nodeRequire("fs") : null;
  const path = nodeRequire ? nodeRequire("path") : null;
  const zlib = nodeRequire ? nodeRequire("zlib") : null;
  const os = nodeRequire ? nodeRequire("os") : null;
  const cp = nodeRequire ? nodeRequire("child_process") : null;
  const crypto = nodeRequire ? nodeRequire("crypto") : null;
  const https = nodeRequire ? nodeRequire("https") : null;
  const urlMod = nodeRequire ? nodeRequire("url") : null;
  const nodeProcess = nodeRequire ? nodeRequire("process") : null;
  const nodeAvailable = !!(fs && path && zlib && os && cp && crypto && https && urlMod && nodeProcess);
  if (!nodeAvailable) {
    try { console.warn("CompX: CEP Node is unavailable; file-based Library features are disabled, but panel tabs remain usable."); } catch (e) { auditFallback("MAIN_GLOBAL_001", e); }
  }

  const csInterface = new CSInterface();
  const AUDIO_EXT = [".mp3", ".wav", ".aiff", ".aif", ".m4a", ".ogg"];
  const MOGRT_EXT = [".mogrt"];
  const EXT_BY_TYPE = { sfx: AUDIO_EXT, mogrt: MOGRT_EXT };
  const COLORS = ["#e0654f", "#f0a63c", "#e8d05a", "#5fd68c", "#5aa7e8", "#b587e8"];
  const IMAGE_EXT_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };
  const VIDEO_EXT_MIME = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };

  // The "Graphic" shelf (mogrt) shares preview/import/insert behavior —
  // only SFX plays back as audio through the Web Audio engine.
  function isGraphicType(t) {
    return t === "mogrt";
  }

  function assetNoun(type) {
    if (type === "mogrt") return "template";
    return "sound";
  }

  // ---------------- State ----------------

  const STORAGE_KEY = "sfxCommandCenter.library.v1";
  const STORAGE_RECOVERY_KEY = "sfxCommandCenter.library.recovery";
  const FOLDER_MARK_KEY = "sfxCommandCenter.markedFolders.v1";
  let indexedDbReady = false;
  let indexedDbInitStarted = false;
  let pendingStorageSave = false;
  let storageWriteChain = Promise.resolve();

  /** @type {{id:string,type:"sfx"|"mogrt",name:string,path:string,category:string,tags:string[],favorite:boolean,duration:number|null,thumbnail:string|null,thumbnailChecked:boolean,color:string|null,collections:string[],lastPlayedAt:number|null,relativePath:string,folderPath:string}[]} */
  let library = loadLibrary();
  // Sounds went to the SFX rail tab (js/orbit-sfx.js) and MOGRTs to the MOGRT
  // rail tab, which is the only thing #sfxMogrtView shows now — nothing can
  // change this again. The "sfx" branches below stay intact so that nobody's
  // stored sound library is thrown away.
  let assetType = "mogrt"; // "sfx" | "mogrt" — which shelf of the Asset Library is showing
  let filterText = "";
  let selectedId = null;
  let audioCtx = null;
  let currentSource = null;
  let currentBuffer = null;
  let currentGain = null;
  let previewVolume = 1.0;
  let isPlaying = false;
  let playStartedAt = 0;

  // Favorites / Recent / Packs views were removed — "all" is the only view.
  let currentView = "all";
  let activeCollection = null; // legacy collections data still readable from saved libraries
  let batchMode = false;
  let batchSelected = new Set();

  let selectedFolder = ""; // active folder path in the sidebar tree
  let markedFolders = loadMarkedFolders();
  let viewMode = "grid"; // "grid" | "list"
  let sortBy = "name"; // "name" | "recent" | "duration" | "favorite"
  let sidebarCollapsed = false;
  const ASSET_PAGE_SIZE = 120;
  let assetRenderLimit = ASSET_PAGE_SIZE;
  let lastAssetQueryKey = "";
  const missingAssetIds = new Set();
  const activeMogrtCacheDirs = new Set();
  const mogrtImportInProgress = new Set();

  // ---------------- DOM refs ----------------

  const el = {
    library: document.getElementById("library"),
    search: document.getElementById("search"),
    btnAddFiles: document.getElementById("btnAddFiles"),
    btnAddFolder: document.getElementById("btnAddFolder"),
    btnRemoveMarkedSfx: document.getElementById("btnRemoveMarkedSfx"),
    btnReset: document.getElementById("btnReset"),
    btnBackupLibrary: document.getElementById("btnBackupLibrary"),
    btnRestoreLibrary: document.getElementById("btnRestoreLibrary"),
    btnCheckMissing: document.getElementById("btnCheckMissing"),
    btnRelinkLibrary: document.getElementById("btnRelinkLibrary"),
    btnClearMogrtCache: document.getElementById("btnClearMogrtCache"),
    btnCopyDiagnostics: document.getElementById("btnCopyDiagnostics"),
    mogrtCacheInfo: document.getElementById("mogrtCacheInfo"),
    diagnosticSummary: document.getElementById("diagnosticSummary"),
    fileInputFiles: document.getElementById("fileInputFiles"),
    fileInputFolder: document.getElementById("fileInputFolder"),
    fileInputLibraryBackup: document.getElementById("fileInputLibraryBackup"),
    fileInputRelinkFolder: document.getElementById("fileInputRelinkFolder"),
    nowPlaying: document.getElementById("nowPlaying"),
    pitch: document.getElementById("pitch"),
    pitchVal: document.getElementById("pitchVal"),
    volume: document.getElementById("volume"),
    volumeVal: document.getElementById("volumeVal"),
    btnInsert: document.getElementById("btnInsert"),
    hostHint: document.getElementById("hostHint"),
    toast: document.getElementById("toast"),
    waveformWrap: null, // removed from UI
    waveform: null,     // removed from UI
    assetTypeRow: document.getElementById("assetTypeRow"),
    tabsRow: document.getElementById("tabsRow"),
    collectionsRow: document.getElementById("collectionsRow"),
    pitchBlock: document.getElementById("pitchBlock"),
    playHint: document.getElementById("playHint"),
    btnBatchMode: document.getElementById("btnBatchMode"),
    batchBar: document.getElementById("batchBar"),
    batchCount: document.getElementById("batchCount"),
    batchColor: document.getElementById("batchColor"),
    batchCollection: document.getElementById("batchCollection"),
    batchDelete: document.getElementById("batchDelete"),
    tagEditorRow: document.getElementById("tagEditorRow"),
    tagEditor: document.getElementById("tagEditor"),
    mainLayout: document.getElementById("mainLayout"),
    sidebar: document.getElementById("sidebar"),
    btnCollapse: document.getElementById("btnCollapse"),
    folderTree: document.getElementById("folderTree"),
    breadcrumb: document.getElementById("breadcrumb"),
    sortBy: document.getElementById("sortBy"),
    btnGridView: document.getElementById("btnGridView"),
    btnListView: document.getElementById("btnListView"),
    customModal: document.getElementById("customModal"),
    modalBox: document.getElementById("modalBox"),
    modalTitle: document.getElementById("modalTitle"),
    modalMessage: document.getElementById("modalMessage"),
    modalInput: document.getElementById("modalInput"),
    modalBtnOk: document.getElementById("modalBtnOk"),
    modalBtnCancel: document.getElementById("modalBtnCancel"),
  };

  // ---------------- Persistence ----------------

  function loadLibrary() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) throw new Error("Stored library is not an array");
      return normalizeLibraryItems(items);
    } catch (e) {
      // Preserve malformed data before a future save can replace it. This is
      // intentionally silent in the UI because loadLibrary runs before the
      // panel DOM references are initialized.
      if (raw) {
        try {
          localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
            savedAt: new Date().toISOString(),
            error: String(e && e.message ? e.message : e),
            raw: raw
          }));
        } catch (recoveryError) { auditFallback("MAIN_LOADLIBRARY_001", recoveryError); }
      }
      try { console.error("CompX: stored library could not be read; recovery copy preserved.", e); } catch (consoleError) { auditFallback("MAIN_LOADLIBRARY_002", consoleError); }
      return [];
    }
  }

  function normalizeLibraryItems(input) {
      const items = Array.isArray(input) ? input : [];
      const seenAssetPaths = {};
      // Pre-MOGRT libraries have no `type` field — everything saved before
      // this version was a sound effect.
      return items.filter((it) => {
        if (!it.type) it.type = "sfx";
        // The separate "Text Preset" shelf was removed — fold any previously
        // saved text-preset items into the MOGRT shelf (same file format).
        if (it.type === "text") it.type = "mogrt";
        if (it.thumbnail === undefined) it.thumbnail = null;
        if (it.thumbnailChecked === undefined) it.thumbnailChecked = false;
        if (!it.relativePath) {
          it.relativePath = it.name + (it.type === "mogrt" ? ".mogrt" : ".wav");
        }
        if (it.folderPath === undefined) {
          it.folderPath = "";
        }
        it.favorite = !!it.favorite;
        it.path = normalizeAssetPath(it.path);
        const key = assetPathKey(it.path, it.type);
        if (seenAssetPaths[key]) return false;
        seenAssetPaths[key] = true;
        return true;
      });
  }

  function prepareLibraryForPersistence(items) {
      return items.filter((item) => !item.bundled).map((item) => {
        const copy = Object.assign({}, item);
        if (typeof copy.thumbnail === "string" && copy.thumbnail.indexOf("data:") === 0) {
          copy.thumbnail = null;
          copy.thumbnailChecked = false;
        }
        return copy;
      });
  }

  function saveLibrary() {
    const persisted = prepareLibraryForPersistence(library);
    if (indexedDbReady && window.CompXStorage) {
      const snapshot = persisted;
      storageWriteChain = storageWriteChain
        .then(() => window.CompXStorage.replaceAllAssets(snapshot))
        .catch((e) => {
          try { console.error("CompX IndexedDB save failed:", e); } catch (consoleError) { auditFallback("MAIN_SAVELIBRARY_001", consoleError); }
          try { localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify(snapshot)); } catch (recoveryError) { auditFallback("MAIN_SAVELIBRARY_002", recoveryError); }
          showToast("Could not save library database", true);
        });
      return;
    }
    pendingStorageSave = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch (e) {
      showToast("Could not save temporary library: " + e.message, true);
    }
  }

  async function initializeIndexedDbLibrary() {
    if (indexedDbInitStarted || !window.CompXStorage) return;
    indexedDbInitStarted = true;
    try {
      const result = await window.CompXStorage.migrateFromLocalStorage(STORAGE_KEY);
      if (pendingStorageSave) {
        await window.CompXStorage.replaceAllAssets(prepareLibraryForPersistence(library));
      } else {
        library = normalizeLibraryItems(result.assets || []);
      }
      indexedDbReady = true;
      pendingStorageSave = false;
      render();
      if (result.migrated) showToast("Library upgraded to IndexedDB (" + result.count + " items)");
    } catch (e) {
      indexedDbReady = false;
      try { console.error("CompX IndexedDB initialization failed:", e); } catch (consoleError) { auditFallback("MAIN_INITIALIZEINDEXEDDBLIBRARY_001", consoleError); }
      showToast("IndexedDB unavailable — using local recovery storage", true);
    }
  }

  function buildLibraryBackup() {
    return {
      format: "compx-library-backup",
      version: 1,
      extensionVersion: "2.6.0",
      exportedAt: new Date().toISOString(),
      assetCount: library.length,
      library: prepareLibraryForPersistence(library).map((item) => {
        const copy = Object.assign({}, item);
        delete copy.pathType;
        return copy;
      }),
    };
  }

  async function exportLibraryBackup() {
    if (!nodeAvailable || !fs.promises) return showToast("File access is unavailable", true);
    try {
      const backupDir = path.join(os.homedir(), "Documents", "CompX", "Backups");
      await fs.promises.mkdir(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = "CompX-Library-" + stamp + ".json";
      const backupPath = path.join(backupDir, fileName);
      await fs.promises.writeFile(backupPath, JSON.stringify(buildLibraryBackup(), null, 2), "utf8");
      showToast("Backup exported: " + fileName);
    } catch (e) {
      showToast("Backup failed: " + (e.message || e), true);
    }
  }

  function parseLibraryBackup(raw) {
    if (typeof raw !== "string" || raw.length > 25 * 1024 * 1024) throw new Error("Backup is too large");
    const data = JSON.parse(raw);
    if (!data || data.format !== "compx-library-backup" || data.version !== 1 || !Array.isArray(data.library)) {
      throw new Error("Not a supported CompX library backup");
    }
    if (data.library.length > 100000) throw new Error("Backup contains too many items");
    const seen = new Set();
    const items = [];
    data.library.forEach((item) => {
      if (!item || typeof item.id !== "string" || typeof item.path !== "string" || !item.path) return;
      const type = item.type === "mogrt" ? "mogrt" : "sfx";
      const key = type + "|" + item.path;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(Object.assign({}, item, { type: type, thumbnail: null, thumbnailChecked: false }));
    });
    return normalizeLibraryItems(items);
  }

  async function restoreLibraryBackup(filePath) {
    if (!nodeAvailable || !fs.promises || !filePath) return showToast("Backup file is unavailable", true);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw new Error("Backup is too large or invalid");
      const restored = parseLibraryBackup(await fs.promises.readFile(filePath, "utf8"));
      const ok = await showModal({
        title: "Restore Library Backup?",
        message: "Replace the current " + library.length + " items with " + restored.length + " backup items? Your backup file will not be changed.",
        okText: "Replace Library",
        cancelText: "Cancel",
        danger: true,
      });
      if (!ok) return;
      if (currentSource) stopPlayback();
      library = restored;
      missingAssetIds.clear();
      selectedId = null;
      saveLibrary();
      render();
      const missing = await detectMissingFiles(false);
      showToast("Restored " + restored.length + " items" + (missing.length ? " · " + missing.length + " missing" : ""), !!missing.length);
    } catch (e) {
      showToast("Restore failed: " + (e.message || e), true);
    }
  }

  async function detectMissingFiles(showResult) {
    if (!nodeAvailable || !fs.promises) {
      if (showResult !== false) showToast("File access is unavailable", true);
      return [];
    }
    missingAssetIds.clear();
    const missing = [];
    const batchSize = 100;
    for (let start = 0; start < library.length; start += batchSize) {
      const batch = library.slice(start, start + batchSize);
      const results = await Promise.all(batch.map(async (item) => {
        try { await fs.promises.access(item.path, fs.constants.F_OK); return null; }
        catch (e) { return item; }
      }));
      results.forEach((item) => {
        if (!item) return;
        missing.push(item);
        missingAssetIds.add(item.id);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    render();
    if (showResult !== false) {
      showToast(missing.length ? missing.length + " missing file(s) found" : "All " + library.length + " files are available", !!missing.length);
    }
    return missing;
  }

  async function relinkLibraryFromFiles(files) {
    const candidates = Array.from(files || []).filter((file) => file && file.path);
    if (!candidates.length) return showToast("No files selected for relinking", true);
    const byName = new Map();
    candidates.forEach((file) => {
      const key = path.basename(file.path).toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(file);
    });
    const missing = await detectMissingFiles(false);
    let relinked = 0;
    missing.forEach((item) => {
      const matches = byName.get(path.basename(item.path).toLowerCase()) || [];
      let match = null;
      if (matches.length === 1) {
        match = matches[0];
      } else if (matches.length > 1 && item.relativePath) {
        const wanted = item.relativePath.replace(/\\/g, "/").toLowerCase();
        const exact = matches.filter((file) => String(file.webkitRelativePath || file.path).replace(/\\/g, "/").toLowerCase().endsWith(wanted));
        if (exact.length === 1) match = exact[0];
      }
      if (!match) return;
      item.path = match.path;
      if (match.webkitRelativePath) {
        item.relativePath = match.webkitRelativePath.replace(/\\/g, "/");
        const relDir = path.posix.dirname(item.relativePath);
        item.folderPath = relDir === "." ? "" : relDir;
      }
      missingAssetIds.delete(item.id);
      relinked++;
    });
    if (relinked) saveLibrary();
    render();
    showToast(relinked + " file(s) relinked" + (missing.length - relinked ? " · " + (missing.length - relinked) + " unresolved" : ""), relinked === 0);
  }

  // ---------------- Helpers ----------------

  function uid() {
    return "sfx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function guessCategory(name) {
    const n = name.toLowerCase();
    if (/(boom|impact|hit|slam|thud|punch)/.test(n)) return "Impacts";
    if (/(whoosh|swoosh|swish|transition)/.test(n)) return "Whoosh";
    if (/(horror|scary|tense|drone|dark)/.test(n)) return "Horror";
    if (/(explo|blast)/.test(n)) return "Explosions";
    if (/(ui|click|button|beep|notif)/.test(n)) return "UI";
    if (/(ambience|ambient|room|wind|rain)/.test(n)) return "Ambience";
    return "Uncategorized";
  }

  function guessTags(name) {
    const n = name.toLowerCase();
    const tags = [];
    ["boom", "whoosh", "horror", "cinematic", "transition", "hit", "explosion", "impact", "riser", "drone"].forEach(
      (t) => {
        if (n.indexOf(t) !== -1) tags.push(t);
      }
    );
    return tags;
  }

  function guessMogrtCategory(name) {
    const n = name.toLowerCase();
    if (/(lower.?third|lt[_-])/.test(n)) return "Lower Thirds";
    if (/(title|headline|opener)/.test(n)) return "Titles";
    if (/(intro|outro)/.test(n)) return "Intros/Outros";
    if (/(subscribe|social|instagram|youtube|tiktok|handle)/.test(n)) return "Social";
    if (/(transition|wipe|swipe)/.test(n)) return "Transitions";
    if (/(callout|badge|label|tag)/.test(n)) return "Callouts";
    return "Uncategorized";
  }

  function guessMogrtTags(name) {
    const n = name.toLowerCase();
    const tags = [];
    [
      "title", "lower third", "subscribe", "social", "youtube", "instagram", "tiktok",
      "transition", "intro", "outro", "callout", "badge", "logo",
    ].forEach((t) => {
      if (n.indexOf(t.replace(" ", "")) !== -1 || n.indexOf(t) !== -1) tags.push(t);
    });
    return tags;
  }

  function fmtTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function seedFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function generatePseudoWaveform(name) {
    let seed = seedFromName(name);
    const rand = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
    const pointsCount = 36;
    let svg = '<svg viewBox="0 0 160 60" preserveAspectRatio="none" style="width:100%; height:100%;">';
    svg += '<path d="M 0 30 ';
    for (let i = 0; i <= pointsCount; i++) {
      const x = (i / pointsCount) * 160;
      const progress = i / pointsCount;
      const weight = Math.sin(progress * Math.PI);
      const h = rand() * 24 * weight;
      svg += 'L ' + x + ' ' + (30 - h) + ' ';
    }
    for (let i = pointsCount; i >= 0; i--) {
      const x = (i / pointsCount) * 160;
      const progress = i / pointsCount;
      const weight = Math.sin(progress * Math.PI);
      const h = rand() * 24 * weight;
      svg += 'L ' + x + ' ' + (30 + h) + ' ';
    }
    svg += 'Z" fill="#e9e7e2" opacity="0.45"/>';
    svg += '</svg>';
    return svg;
  }

  function showToast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.className = "toast show" + (isError ? " error" : "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.className = "toast";
    }, 2600);
  }

  function recordDiagnostic(level, code, message, detail, outcome) {
    if (window.CompXDiagnostics) {
      window.CompXDiagnostics.record(level, code, message, detail, outcome);
      renderDiagnosticSummary();
    }
  }

  function renderDiagnosticSummary() {
    if (!el.diagnosticSummary || !window.CompXDiagnostics) return;
    const s = window.CompXDiagnostics.getSummary();
    el.diagnosticSummary.textContent = "A " + s.applied + " · S " + s.skipped + " · F " + s.failed + " · O " + s.optionalFallbacks;
  }

  function auditFallback(code, error) {
    if (window.CompXDiagnostics) {
      window.CompXDiagnostics.fallback(code, error);
      if (!auditFallback._summaryTimer) {
        auditFallback._summaryTimer = setTimeout(() => {
          auditFallback._summaryTimer = null;
          renderDiagnosticSummary();
        }, 100);
      }
    }
  }

  function reportError(code, error, userMessage) {
    const detail = String(error && error.stack ? error.stack : (error && error.message ? error.message : error));
    recordDiagnostic("error", code, userMessage, detail, "failed");
    showToast(userMessage, true);
  }

  async function copyDiagnosticReport() {
    if (!window.CompXDiagnostics) return showToast("Diagnostics are unavailable", true);
    try {
      const hostAudit = await new Promise((resolve) => {
        callHost("compx_getHostDiagnostics()", (parsed) => resolve(parsed.success ? parsed.data : null), 15000);
      });
      if (hostAudit) window.CompXDiagnostics.setHostAudit(hostAudit);
      let copied = await window.CompXDiagnostics.copyReport();
      if (!copied) {
        const area = document.createElement("textarea");
        area.value = window.CompXDiagnostics.reportText();
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand("copy");
        document.body.removeChild(area);
      }
      if (!copied) throw new Error("Clipboard API rejected the report");
      showToast("Sanitized diagnostic report copied");
    } catch (e) {
      reportError("DIAGNOSTIC_COPY", e, "Could not copy diagnostic report");
    }
  }

  // ---------------- Custom modal (replaces native confirm()/prompt()) ----------------
  //
  // showModal({ title, message, input, placeholder, defaultValue, okText,
  //             cancelText, danger })
  //   -> Promise that resolves to:
  //        - the typed string (or "" ) when input:true and OK was pressed
  //        - null                    when input:true and cancelled
  //        - true                    when input:false and OK was pressed
  //        - false                   when input:false and cancelled
  function showModal(opts) {
    const o = Object.assign(
      { title: "", message: "", input: false, placeholder: "", defaultValue: "", okText: "OK", cancelText: "Cancel", danger: false },
      opts || {}
    );

    return new Promise((resolve) => {
      el.modalTitle.textContent = o.title;
      if (o.message) {
        el.modalMessage.textContent = o.message;
        el.modalMessage.style.display = "block";
      } else {
        el.modalMessage.style.display = "none";
      }
      el.modalInput.style.display = o.input ? "block" : "none";
      el.modalInput.value = o.defaultValue;
      el.modalInput.placeholder = o.placeholder;
      el.modalBtnOk.textContent = o.okText;
      el.modalBtnCancel.textContent = o.cancelText;
      el.modalBox.classList.toggle("danger", !!o.danger);
      el.modalBtnOk.classList.toggle("danger", !!o.danger);
      el.modalBtnOk.classList.toggle("primary", !o.danger);

      function cleanup() {
        el.customModal.style.display = "none";
        el.modalBtnOk.removeEventListener("click", onOk);
        el.modalBtnCancel.removeEventListener("click", onCancel);
        el.modalInput.removeEventListener("keydown", onKeydown);
        el.customModal.removeEventListener("mousedown", onBackdrop);
      }
      function onOk() {
        const val = o.input ? el.modalInput.value : true;
        cleanup();
        resolve(val);
      }
      function onCancel() {
        cleanup();
        resolve(o.input ? null : false);
      }
      function onKeydown(ev) {
        if (ev.key === "Enter") onOk();
        else if (ev.key === "Escape") onCancel();
      }
      function onBackdrop(ev) {
        if (ev.target === el.customModal) onCancel();
      }

      el.modalBtnOk.addEventListener("click", onOk);
      el.modalBtnCancel.addEventListener("click", onCancel);
      el.modalInput.addEventListener("keydown", onKeydown);
      el.customModal.addEventListener("mousedown", onBackdrop);

      el.customModal.style.display = "flex";
      if (o.input) {
        el.modalInput.focus();
        el.modalInput.select();
      } else {
        el.modalBtnOk.focus();
      }
    });
  }

  window.showModal = showModal;
  window.showToast = showToast;

  // ---------------- MOGRT thumbnail extraction ----------------
  //
  // A .mogrt is a plain zip archive. There's no documented, guaranteed
  // "official" preview asset inside every .mogrt, so this is a best-effort
  // reader: it lists the zip's central directory itself (no npm dependency —
  // CEP panels can't easily vendor native/npm zip libs), looks for the most
  // plausible preview-ish image inside, and inflates it with Node's built-in
  // zlib if needed. If nothing image-like is found, callers fall back to a
  // generic placeholder — this mirrors the "best-effort, not guaranteed"
  // honesty already used for the timeline-drag and auto-add-track features.

  const MAX_ZIP_ENTRIES = 20000;
  const MAX_MOGRT_PREVIEW_ARCHIVE_BYTES = 512 * 1024 * 1024;
  const MAX_MOGRT_IMPORT_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
  const MAX_PREVIEW_IMAGE_BYTES = 16 * 1024 * 1024;
  const MOGRT_CACHE_ROOT = nodeAvailable ? path.join(os.tmpdir(), "CompX", "mogrt-cache") : "";

  function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1) + " MB";
  }

  async function mogrtCacheInfoFor(filePath) {
    const stat = await fs.promises.stat(filePath);
    const identity = filePath + "|" + stat.size + "|" + Math.floor(stat.mtimeMs || stat.mtime.getTime());
    const key = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
    return { key: key, dir: path.join(MOGRT_CACHE_ROOT, key), stat: stat };
  }

  async function directorySize(dir) {
    let total = 0;
    let entries = [];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return 0; }
    for (let i = 0; i < entries.length; i++) {
      const full = path.join(dir, entries[i].name);
      if (entries[i].isDirectory()) total += await directorySize(full);
      else {
        try { total += (await fs.promises.stat(full)).size; } catch (e) { auditFallback("MAIN_DIRECTORYSIZE_001", e); }
      }
      if (i % 25 === 24) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return total;
  }

  async function refreshMogrtCacheInfo() {
    if (!el.mogrtCacheInfo || !nodeAvailable) return;
    const bytes = await directorySize(MOGRT_CACHE_ROOT);
    el.mogrtCacheInfo.textContent = "Cache: " + formatBytes(bytes);
    el.mogrtCacheInfo.title = MOGRT_CACHE_ROOT;
  }

  function removeDirectoryAsync(dir) {
    return new Promise((resolve, reject) => {
      const done = (error) => error ? reject(error) : resolve();
      if (fs.rm) fs.rm(dir, { recursive: true, force: true }, done);
      else fs.rmdir(dir, { recursive: true }, done);
    });
  }

  function cacheDirFromReferencedPath(filePath) {
    const normalizedRoot = path.resolve(MOGRT_CACHE_ROOT);
    const normalized = path.resolve(filePath);
    if (normalized.indexOf(normalizedRoot + path.sep) !== 0) return null;
    const relative = path.relative(normalizedRoot, normalized);
    const first = relative.split(path.sep)[0];
    return first ? path.join(normalizedRoot, first) : null;
  }

  async function getHostProtectedCacheDirs() {
    const protectedDirs = new Set(activeMogrtCacheDirs);
    if (currentHostAppId() !== "AEFT") return protectedDirs;
    const parsed = await new Promise((resolve) => {
      callHost("aeft_getReferencedCompXCachePaths(" + hostArg(MOGRT_CACHE_ROOT) + ")", resolve, 30000);
    });
    if (parsed.success && parsed.data && Array.isArray(parsed.data.paths)) {
      parsed.data.paths.forEach((filePath) => {
        const dir = cacheDirFromReferencedPath(filePath);
        if (dir) protectedDirs.add(dir);
      });
    } else if (!parsed.success) {
      recordDiagnostic("warn", "CACHE_REFERENCE_SCAN", "Could not query active AE cache references", parsed.message, "skipped");
    }
    return protectedDirs;
  }

  async function clearUnusedMogrtCache() {
    if (!nodeAvailable) return showToast("Cache access is unavailable", true);
    const ok = await showModal({
      title: "Clear Unused MOGRT Cache?",
      message: "CompX will keep files used by the active After Effects project and this panel session. Only unreferenced cache folders will be removed.",
      okText: "Clear Unused",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;
    try {
      const protectedDirs = await getHostProtectedCacheDirs();
      let entries = [];
      try { entries = await fs.promises.readdir(MOGRT_CACHE_ROOT, { withFileTypes: true }); } catch (e) { auditFallback("MAIN_CLEARUNUSEDMOGRTCACHE_001", e); }
      let removed = 0;
      let removedBytes = 0;
      for (let i = 0; i < entries.length; i++) {
        if (!entries[i].isDirectory()) continue;
        const dir = path.join(MOGRT_CACHE_ROOT, entries[i].name);
        if (protectedDirs.has(dir)) continue;
        removedBytes += await directorySize(dir);
        await removeDirectoryAsync(dir);
        removed++;
      }
      await refreshMogrtCacheInfo();
      recordDiagnostic("info", "CACHE_CLEAR", "Unused MOGRT cache cleared", removed + " folders, " + formatBytes(removedBytes), "applied");
      showToast("Cleared " + removed + " unused cache folder(s) · " + formatBytes(removedBytes));
    } catch (e) {
      reportError("CACHE_CLEAR_FAILED", e, "Could not clear unused MOGRT cache");
    }
  }

  async function readMogrtBufferAsync(filePath, maxBytes) {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null;
    return fs.promises.readFile(filePath);
  }

  function findEOCD(buf) {
    const minLen = 22;
    const maxCommentLen = 65535;
    const start = Math.max(0, buf.length - minLen - maxCommentLen);
    for (let i = buf.length - minLen; i >= start; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) return i;
    }
    return -1;
  }

  function listZipEntries(buf) {
    const eocdOffset = findEOCD(buf);
    if (eocdOffset === -1) return [];
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    if (totalEntries > MAX_ZIP_ENTRIES) return [];
    if (cdOffset > eocdOffset || cdSize > eocdOffset - cdOffset) return [];
    const entries = [];
    let offset = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break;
      const compression = buf.readUInt16LE(offset + 10);
      const compSize = buf.readUInt32LE(offset + 20);
      const uncompSize = buf.readUInt32LE(offset + 24);
      const nameLen = buf.readUInt16LE(offset + 28);
      const extraLen = buf.readUInt16LE(offset + 30);
      const commentLen = buf.readUInt16LE(offset + 32);
      const localHeaderOffset = buf.readUInt32LE(offset + 42);
      const nextOffset = offset + 46 + nameLen + extraLen + commentLen;
      if (nextOffset > buf.length) break;
      const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
      entries.push({ name, compression, compSize, uncompSize, localHeaderOffset });
      offset = nextOffset;
    }
    return entries;
  }

  function readZipEntryData(buf, entry) {
    // MOGRTs are untrusted zip archives. Reject obviously dangerous entries
    // before handing them to zlib so a corrupt/hostile template cannot make
    // the CEP process allocate an unbounded buffer.
    const MAX_ZIP_ENTRY_BYTES = 512 * 1024 * 1024;
    const MAX_ZIP_RATIO = 500;
    if (!entry || entry.compSize < 0 || entry.uncompSize < 0) return null;
    if (entry.uncompSize > MAX_ZIP_ENTRY_BYTES) return null;
    if (entry.compSize === 0 && entry.uncompSize > 0) return null;
    if (entry.compSize > 0 && entry.uncompSize / entry.compSize > MAX_ZIP_RATIO) return null;
    const lho = entry.localHeaderOffset;
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) return null;
    const nameLen = buf.readUInt16LE(lho + 26);
    const extraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + nameLen + extraLen;
    if (dataStart < 0 || dataStart > buf.length || entry.compSize > buf.length - dataStart) return null;
    const raw = buf.slice(dataStart, dataStart + entry.compSize);
    if (entry.compression === 0) {
      if (entry.uncompSize && raw.length !== entry.uncompSize) return null;
      return raw;
    }
    if (entry.compression === 8) {
      try {
        const inflated = zlib.inflateRawSync(raw);
        if (inflated.length > MAX_ZIP_ENTRY_BYTES) return null;
        if (entry.uncompSize && inflated.length !== entry.uncompSize) return null;
        return inflated;
      } catch (e) {
        return null;
      }
    }
    return null; // unsupported compression method — extremely rare in .mogrt
  }

  function scoreImageEntry(entry) {
    const n = entry.name.toLowerCase();
    if (n.indexOf("poster") !== -1) return 3;
    if (n.indexOf("thumb") !== -1) return 3;
    if (n.indexOf("preview") !== -1) return 2;
    return 1;
  }

  async function extractMogrtThumbnail(filePath) {
    try {
      const buf = await readMogrtBufferAsync(filePath, MAX_MOGRT_PREVIEW_ARCHIVE_BYTES);
      if (!buf) return null;
      const entries = listZipEntries(buf);
      const images = entries.filter((e) => {
        const ext = path.extname(e.name).toLowerCase();
        return IMAGE_EXT_MIME.hasOwnProperty(ext) && e.uncompSize > 0 && e.uncompSize <= MAX_PREVIEW_IMAGE_BYTES;
      });
      if (images.length === 0) return null;
      images.sort((a, b) => scoreImageEntry(b) - scoreImageEntry(a));
      const best = images[0];
      const data = readZipEntryData(buf, best);
      if (!data) return null;
      const mime = IMAGE_EXT_MIME[path.extname(best.name).toLowerCase()];
      return "data:" + mime + ";base64," + data.toString("base64");
    } catch (e) {
      return null;
    }
  }

  const THUMBNAIL_QUEUE_DELAY_MS = 24;
  const thumbnailQueue = [];
  const queuedThumbnailIds = new Set();
  let thumbnailQueueActive = false;

  function updateRenderedThumbnail(item) {
    if (!item.thumbnail) return;
    const cards = document.querySelectorAll("#library .sfx-card");
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (card.dataset.id !== item.id) continue;
      const current = card.querySelector(".card-media-img");
      if (!current) continue;
      if (current.tagName && current.tagName.toLowerCase() === "img") {
        current.src = item.thumbnail;
      } else {
        const image = document.createElement("img");
        image.className = "card-media-img";
        image.src = item.thumbnail;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";
        current.parentNode.replaceChild(image, current);
      }
    }
  }

  function scheduleThumbnailQueue() {
    if (thumbnailQueueActive || thumbnailQueue.length === 0) return;
    thumbnailQueueActive = true;
    setTimeout(async () => {
      const item = thumbnailQueue.shift();
      if (item) queuedThumbnailIds.delete(item.id);
      // A queued item may have been deleted or reset before its turn.
      if (item && !item.thumbnailChecked && library.some((entry) => entry.id === item.id)) {
        item.thumbnail = await extractMogrtThumbnail(item.path);
        item.thumbnailChecked = true;
        updateRenderedThumbnail(item);
      }
      thumbnailQueueActive = false;
      scheduleThumbnailQueue();
    }, THUMBNAIL_QUEUE_DELAY_MS);
  }

  function ensureThumbnail(item) {
    if (!isGraphicType(item.type) || item.thumbnailChecked || queuedThumbnailIds.has(item.id)) return;
    queuedThumbnailIds.add(item.id);
    thumbnailQueue.push(item);
    scheduleThumbnailQueue();
  }

  // ---------------- MOGRT → AE project extraction ----------------
  //
  // A .mogrt authored in After Effects is a zip that bundles the *source* AE
  // project plus its assets/fonts and a definition.json manifest. AE cannot
  // consume a .mogrt directly (that's Premiere-only), so to use the SAME
  // .mogrt file in AE we unpack it, drop the internal AE project (+ assets)
  // into a fresh temp folder, and hand the .aep to ExtendScript to import.
  // Premiere keeps using the .mogrt natively — one file, both hosts.
  //
  // Returns { aepPath, compName } or null when there's no AE project inside
  // (e.g. a Premiere-authored template, which AE genuinely cannot use).

  const AE_PROJECT_EXT = [".aep", ".aepx", ".aegraphic", ".aegp"];
  const REAL_AE_EXT = [".aep", ".aepx"]; // what importFile() actually accepts

  // A buffer is a local zip entry if it starts with the PK\x03\x04 signature.
  function isZipBuffer(b) {
    return b && b.length > 4 && b.readUInt32LE(0) === 0x04034b50;
  }

  // Pick the best AE-project-ish entry from a parsed zip buffer, preferring
  // real .aep/.aepx over the mogrt-internal .aegraphic/.aegp wrappers.
  function pickAeEntry(zipBuf, exts) {
    const entries = listZipEntries(zipBuf);
    let best = null, rank = 99;
    for (const e of entries) {
      const ext = path.extname(e.name).toLowerCase();
      const r = exts.indexOf(ext);
      if (r !== -1 && e.uncompSize > 0 && r < rank) { best = e; rank = r; }
    }
    return best;
  }

  // Write every file entry of a zip buffer to destDir, preserving relative
  // paths so an AE project's linked footage/fonts resolve correctly.
  function safeZipDestination(rootDir, entryName) {
    if (!entryName || entryName.indexOf("\0") !== -1 || path.isAbsolute(entryName) || /^[A-Za-z]:[\\/]/.test(entryName)) return null;
    const root = path.resolve(rootDir);
    const dest = path.resolve(root, entryName);
    return (dest === root || dest.indexOf(root + path.sep) === 0) ? dest : null;
  }

  async function spillZip(zipBuf, destDir) {
    const entries = listZipEntries(zipBuf);
    const MAX_TOTAL_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
    let totalExtracted = 0;
    for (const e of entries) {
      if (/\/$/.test(e.name)) continue; // skip directory entries
      // Reject absolute paths, Windows drive paths, null bytes, and traversal.
      const dest = safeZipDestination(destDir, e.name);
      if (!dest) continue;
      if (e.uncompSize > MAX_TOTAL_EXTRACTED_BYTES - totalExtracted) continue;
      const data = readZipEntryData(zipBuf, e);
      if (!data) continue;
      if (data.length > MAX_TOTAL_EXTRACTED_BYTES - totalExtracted) continue;
      totalExtracted += data.length;
      try {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, data);
      } catch (writeError) {
        recordDiagnostic("warn", "MOGRT_CACHE_WRITE", "Skipped one extracted MOGRT entry", writeError.message || writeError, "skipped");
      }
      if (totalExtracted % (32 * 1024 * 1024) < data.length) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function fileExists(filePath) {
    try { await fs.promises.access(filePath, fs.constants.F_OK); return true; }
    catch (e) { return false; }
  }

  async function extractMogrtAeProject(filePath) {
    const cache = await mogrtCacheInfoFor(filePath);
    const metadataPath = path.join(cache.dir, "compx-cache.json");
    try {
      const metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
      if (metadata && metadata.aepPath && await fileExists(metadata.aepPath)) {
        activeMogrtCacheDirs.add(cache.dir);
        recordDiagnostic("info", "MOGRT_CACHE_HIT", "Reused cached MOGRT extraction", cache.key, "applied");
        return { aepPath: metadata.aepPath, compName: metadata.compName || "", cacheDir: cache.dir, cached: true };
      }
    } catch (cacheReadError) { auditFallback("MAIN_EXTRACTMOGRTAEPROJECT_001", cacheReadError); }

    const buf = await readMogrtBufferAsync(filePath, MAX_MOGRT_IMPORT_ARCHIVE_BYTES);
    if (!buf) return null;
    const entries = listZipEntries(buf);
    if (!entries.length) return null;

    // Unpack into a deterministic source/size/mtime cache directory. Updating
    // the source MOGRT generates a new key and cannot reuse stale contents.
    try { await removeDirectoryAsync(cache.dir); } catch (e) { auditFallback("MAIN_EXTRACTMOGRTAEPROJECT_002", e); }
    await fs.promises.mkdir(cache.dir, { recursive: true });
    activeMogrtCacheDirs.add(cache.dir);
    const outDir = cache.dir;
    await spillZip(buf, outDir);

    const projEntry = pickAeEntry(buf, AE_PROJECT_EXT);
    if (!projEntry) {
      activeMogrtCacheDirs.delete(cache.dir);
      try { await removeDirectoryAsync(cache.dir); } catch (e) { auditFallback("MAIN_EXTRACTMOGRTAEPROJECT_003", e); }
      return null;
    } // no AE project inside → not AE-usable

    let projData = readZipEntryData(buf, projEntry);
    if (!projData) return null;

    // On-disk path of the project as first spilled (e.g. project.aegraphic).
    let aepPath = safeZipDestination(outDir, projEntry.name);
    if (!aepPath) return null;

    // CRUCIAL: AE-authored mogrts don't store a bare .aep — they wrap the real
    // RIFX .aep INSIDE project.aegraphic, which is ITSELF a zip. (A .aegraphic
    // handed straight to importFile fails with "bad format or not readable".)
    // So keep unwrapping nested zips until we reach the actual project bytes.
    let level = 0;
    while (isZipBuffer(projData) && level < 4) {
      const innerDir = path.join(outDir, "_nested" + level);
      await spillZip(projData, innerDir);
      const inner = pickAeEntry(projData, REAL_AE_EXT) ||
                    pickAeEntry(projData, AE_PROJECT_EXT);
      if (!inner) break;
      aepPath = safeZipDestination(innerDir, inner.name);
      if (!aepPath) return null;
      projData = readZipEntryData(projData, inner);
      level++;
      if (!projData) break;
    }

    if (!await fileExists(aepPath)) return null;

    // importFile() only accepts .aep/.aepx — copy if the extension differs.
    const curExt = path.extname(aepPath).toLowerCase();
    if (curExt !== ".aep" && curExt !== ".aepx") {
      const renamed = aepPath.replace(/\.[^.]+$/, "") + ".aep";
      try { await fs.promises.copyFile(aepPath, renamed); aepPath = renamed; } catch (cErr) { auditFallback("MAIN_EXTRACTMOGRTAEPROJECT_004", cErr); }
    }
    if (!await fileExists(aepPath)) return null;

    // Best-effort: read definition.json to learn the template/comp name.
    let compName = "";
    try {
      const defEntry = entries.find((e) => /(^|\/)definition\.json$/i.test(e.name));
      if (defEntry) {
        const defData = readZipEntryData(buf, defEntry);
        if (defData) {
          const def = JSON.parse(defData.toString("utf8"));
          compName = def.name || def.templateName ||
                     (def.template && def.template.name) ||
                     def.capsuleName || def.capsuleNameLocalized || "";
        }
      }
    } catch (defErr) {
      recordDiagnostic("warn", "MOGRT_DEFINITION", "Could not read MOGRT definition metadata", defErr.message || defErr, "skipped");
    }

    await fs.promises.writeFile(metadataPath, JSON.stringify({
      version: 1,
      sourceSize: cache.stat.size,
      sourceMtime: cache.stat.mtimeMs || cache.stat.mtime.getTime(),
      aepPath: aepPath,
      compName: compName,
      createdAt: new Date().toISOString(),
    }, null, 2), "utf8");
    activeMogrtCacheDirs.add(cache.dir);
    refreshMogrtCacheInfo();
    recordDiagnostic("info", "MOGRT_CACHE_CREATE", "Created reusable MOGRT cache", cache.key, "applied");
    return { aepPath, compName, cacheDir: cache.dir, cached: false };
  }

  async function safeExtractMogrtAeProject(filePath) {
    try { return await extractMogrtAeProject(filePath); }
    catch (e) {
      recordDiagnostic("error", "MOGRT_EXTRACT", "MOGRT extraction failed", e.stack || e.message || e, "failed");
      return null;
    }
  }

  // ---------------- Animated hover preview (MOGRT) ----------------
  //
  // Same "best-effort, not guaranteed" spirit as the thumbnail extraction
  // above: a .mogrt is just a zip, and there's no guaranteed animated asset
  // inside it. This looks for, in order of preference:
  //   1) a small embedded preview video (preview.mp4 / .webm / .mov)
  //   2) a numbered sequence of preview frames (preview_001.png, _002, ...)
  //   3) the single best static image (same one used for the thumbnail)
  // and plays whichever is found while the card is hovered. If a template
  // only has a single static image, hovering just leaves the thumbnail as-is
  // — there's nothing to animate, and we don't fake it.

  const previewAssetCache = new Map(); // bounded LRU: item.id -> preview asset
  const MAX_PREVIEW_CACHE_ITEMS = 8;
  const HOVER_PREVIEW_DELAY_MS = 120;

  function scoreMediaEntry(entry) {
    const n = entry.name.toLowerCase();
    if (n.indexOf("preview") !== -1) return 3;
    if (n.indexOf("thumb") !== -1) return 2;
    if (n.indexOf("poster") !== -1) return 2;
    return 1;
  }

  // "preview_0007.png" -> "preview_" (used to group a numbered frame sequence)
  function frameSequenceKey(fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    const m = base.match(/^(.*?)(\d+)$/);
    return m ? m[1] : null;
  }

  async function extractPreviewAsset(filePath) {
    try {
      const buf = await readMogrtBufferAsync(filePath, MAX_MOGRT_PREVIEW_ARCHIVE_BYTES);
      if (!buf) return { type: "none" };
      const entries = listZipEntries(buf);

      // 1) Embedded preview video — capped so we never inline something huge.
      const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
      const videos = entries.filter((e) => {
        const ext = path.extname(e.name).toLowerCase();
        return VIDEO_EXT_MIME.hasOwnProperty(ext) && e.uncompSize > 0 && e.uncompSize < MAX_VIDEO_BYTES;
      });
      if (videos.length) {
        videos.sort((a, b) => scoreMediaEntry(b) - scoreMediaEntry(a));
        const data = readZipEntryData(buf, videos[0]);
        if (data) {
          const mime = VIDEO_EXT_MIME[path.extname(videos[0].name).toLowerCase()];
          return { type: "video", url: "data:" + mime + ";base64," + data.toString("base64") };
        }
      }

      // 2) Numbered frame sequence — flipbook it like Premiere's own library scrub preview.
      const images = entries.filter((e) => {
        const ext = path.extname(e.name).toLowerCase();
        return IMAGE_EXT_MIME.hasOwnProperty(ext) && e.uncompSize > 0 && e.uncompSize <= MAX_PREVIEW_IMAGE_BYTES;
      });
      const groups = {};
      images.forEach((e) => {
        const key = frameSequenceKey(path.basename(e.name));
        if (key) {
          groups[key] = groups[key] || [];
          groups[key].push(e);
        }
      });
      const groupKeys = Object.keys(groups).filter((k) => groups[k].length >= 3);
      if (groupKeys.length) {
        groupKeys.sort((a, b) => groups[b].length - groups[a].length);
        const frameEntries = groups[groupKeys[0]]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .slice(0, 30);
        const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
        let total = 0;
        const frames = [];
        for (let i = 0; i < frameEntries.length; i++) {
          const e = frameEntries[i];
          if (total + e.uncompSize > MAX_TOTAL_BYTES) break;
          const data = readZipEntryData(buf, e);
          if (!data) continue;
          total += e.uncompSize;
          const mime = IMAGE_EXT_MIME[path.extname(e.name).toLowerCase()];
          frames.push("data:" + mime + ";base64," + data.toString("base64"));
        }
        if (frames.length >= 3) return { type: "frames", frames: frames };
      }

      // 3) Fallback: the same single best static image used for the thumbnail.
      if (images.length) {
        images.sort((a, b) => scoreImageEntry(b) - scoreImageEntry(a));
        const data = readZipEntryData(buf, images[0]);
        if (data) {
          const mime = IMAGE_EXT_MIME[path.extname(images[0].name).toLowerCase()];
          return { type: "image", url: "data:" + mime + ";base64," + data.toString("base64") };
        }
      }
    } catch (e) { auditFallback("MAIN_EXTRACTPREVIEWASSET_001", e); }
    return { type: "none" };
  }

  async function getPreviewAssetCached(item) {
    if (previewAssetCache.has(item.id)) {
      const cached = previewAssetCache.get(item.id);
      // Refresh insertion order so Map behaves as a small LRU cache.
      previewAssetCache.delete(item.id);
      previewAssetCache.set(item.id, cached);
      return cached;
    }
    const asset = await extractPreviewAsset(item.path);
    previewAssetCache.set(item.id, asset);
    while (previewAssetCache.size > MAX_PREVIEW_CACHE_ITEMS) {
      const oldestId = previewAssetCache.keys().next().value;
      previewAssetCache.delete(oldestId);
    }
    return asset;
  }

  async function applyCardHoverPreview(card, item) {
    const asset = await getPreviewAssetCached(item);
    if (!card._previewHovering || !document.documentElement.contains(card)) return;
    const img = card.querySelector(".card-media-img");
    const video = card.querySelector(".card-media-video");

    if (asset.type === "video" && video) {
      if (img) img.style.display = "none";
      video.src = asset.url;
      video.style.display = "block";
      try {
        video.currentTime = 0;
        video.play().catch(() => {});
      } catch (e) { auditFallback("MAIN_APPLYCARDHOVERPREVIEW_001", e); }
    } else if (asset.type === "frames" && img && asset.frames.length) {
      clearInterval(card._frameTimer);
      let idx = 0;
      img.src = asset.frames[0];
      card._frameTimer = setInterval(() => {
        idx = (idx + 1) % asset.frames.length;
        img.src = asset.frames[idx];
      }, 90);
    }
    // type "image" or "none" — nothing to animate, static thumbnail stays put.
  }

  function startCardHoverPreview(card, item) {
    card._previewHovering = true;
    clearTimeout(card._previewLoadTimer);
    // Avoid reading and inflating a MOGRT when the pointer merely passes over
    // a card. Intentional hovers still start quickly after this short delay.
    card._previewLoadTimer = setTimeout(async () => {
      if (!card._previewHovering || !document.documentElement.contains(card)) return;
      await applyCardHoverPreview(card, item);
    }, HOVER_PREVIEW_DELAY_MS);
  }

  function stopCardHoverPreview(card, item) {
    if (card._previewPinned) return;
    card._previewHovering = false;
    clearTimeout(card._previewLoadTimer);
    card._previewLoadTimer = null;
    clearInterval(card._frameTimer);
    card._frameTimer = null;
    const img = card.querySelector(".card-media-img");
    const video = card.querySelector(".card-media-video");
    if (video) {
      try { video.pause(); } catch (e) { auditFallback("MAIN_STOPCARDHOVERPREVIEW_001", e); }
      video.style.display = "none";
    }
    if (img) {
      img.style.display = "block";
      if (item.thumbnail) img.src = item.thumbnail;
    }
  }

  // ---------------- Library building ----------------

  // normalizeAssetPath hits the filesystem (existsSync + realpathSync) on every
  // call, and assetPathKey calls it once per library entry. Importing M files
  // into a library of N used to cost M*N syscalls — tens of seconds on a real
  // disk. The same input always resolves to the same output inside a session,
  // so the answers are memoised; relink/missing-check clear the cache.
  var assetPathCache = Object.create(null);
  var assetPathCacheSize = 0;
  var ASSET_PATH_CACHE_MAX = 20000;

  function clearAssetPathCache() {
    assetPathCache = Object.create(null);
    assetPathCacheSize = 0;
  }

  function normalizeAssetPath(filePath) {
    var cacheKey = String(filePath || "");
    var cached = assetPathCache[cacheKey];
    if (cached !== undefined) return cached;
    var resolved = normalizeAssetPathUncached(filePath);
    if (assetPathCacheSize < ASSET_PATH_CACHE_MAX) {
      assetPathCache[cacheKey] = resolved;
      assetPathCacheSize++;
    }
    return resolved;
  }

  function normalizeAssetPathUncached(filePath) {
    var value = String(filePath || "").trim();
    if (!value || !path) return value;
    try {
      if (/^file:\/\//i.test(value) && urlMod && typeof urlMod.fileURLToPath === "function") {
        value = urlMod.fileURLToPath(value);
      }
    } catch (urlError) { auditFallback("MAIN_NORMALIZE_ASSET_URL_001", urlError); }
    try { value = path.resolve(value); } catch (resolveError) { auditFallback("MAIN_NORMALIZE_ASSET_PATH_001", resolveError); }
    try {
      if (fs && fs.existsSync(value)) {
        value = fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value);
      }
    } catch (realPathError) { auditFallback("MAIN_NORMALIZE_ASSET_REALPATH_001", realPathError); }
    try { value = value.normalize("NFC"); } catch (unicodeError) { auditFallback("MAIN_NORMALIZE_ASSET_UNICODE_001", unicodeError); }
    return value;
  }

  function assetPathKey(filePath, type) {
    var key = normalizeAssetPath(filePath).replace(/\\/g, "/");
    // win32 and darwin are both case-insensitive by default, so the key has to
    // be too or "Kick.wav" and "kick.wav" become two entries for one file
    var plat = nodeProcess && nodeProcess.platform;
    if (plat === "win32" || plat === "darwin") key = key.toLowerCase();
    return String(type || "") + "|" + key;
  }

  function addFilePaths(filePaths, type) {
    type = type || assetType;
    const extList = EXT_BY_TYPE[type];
    let added = 0;

    // Filter paths to only supported extension types
    const validPaths = filePaths.map(normalizeAssetPath).filter((p) => {
      const ext = path.extname(p).toLowerCase();
      return extList.indexOf(ext) !== -1;
    });

    if (validPaths.length === 0) {
      showToast("No supported files found", true);
      return;
    }

    // Determine common root to build relative paths and folder paths
    let commonDir = path.dirname(validPaths[0]);
    validPaths.forEach((p) => {
      const dir = path.dirname(p);
      if (dir.length < commonDir.length && commonDir.startsWith(dir)) {
        commonDir = dir;
      }
    });
    // Use the parent of the common directory so the top-level folder itself is part of the tree
    const rootDir = path.dirname(commonDir);

    // Hash the keys already in the library once, instead of rescanning the whole
    // array for every incoming path.
    const existingKeys = Object.create(null);
    library.forEach((s) => { existingKeys[assetPathKey(s.path, s.type)] = true; });

    validPaths.forEach((p) => {
      const candidateKey = assetPathKey(p, type);
      if (existingKeys[candidateKey]) return; // no duplicate path/reference
      existingKeys[candidateKey] = true;
      const ext = path.extname(p).toLowerCase();
      const name = path.basename(p, ext);
      
      // Compute relativePath and folderPath relative to the rootDir
      const rel = path.relative(rootDir, p).replace(/\\/g, "/");
      const relDir = path.dirname(rel).replace(/\\/g, "/");
      const folderPath = relDir === "." ? "" : relDir;

      library.push({
        id: uid(),
        type: type,
        name: name,
      path: normalizeAssetPath(p),
        relativePath: rel,
        folderPath: folderPath,
        category: isGraphicType(type) ? guessMogrtCategory(name) : guessCategory(name),
        tags: isGraphicType(type) ? guessMogrtTags(name) : guessTags(name),
        favorite: false,
        duration: null, // populated lazily on first decode (SFX only)
        thumbnail: null, // populated lazily on first view (MOGRT only)
        thumbnailChecked: false,
        color: null,
        collections: [],
        lastPlayedAt: null,
      });
      added++;
    });

    const noun = assetNoun(type);
    if (added > 0) {
      saveLibrary();
      render();
      showToast(added + " " + noun + (added > 1 ? "s" : "") + " added");
    } else {
      showToast("No new supported " + (isGraphicType(type) ? ".mogrt" : "audio") + " files found", true);
    }
  }

  // ---------------- Rendering ----------------

  function getFiltered() {
    let items = library.filter((s) => s.type === assetType);

    if (currentView === "favorites") {
      items = items.filter((s) => !!s.favorite);
    }

    // Selected folder filter (handles subfolders as well)
    if (currentView !== "favorites" && selectedFolder) {
      items = items.filter((s) => {
        const folder = s.folderPath || "";
        return folder === selectedFolder || folder.indexOf(selectedFolder + "/") === 0;
      });
    }

    const q = filterText.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q)) ||
          s.category.toLowerCase().includes(q)
      );
    }

    // Sort items
    if (sortBy === "name") {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "duration") {
      items.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }

    return items;
  }

  function getAllCollections() {
    const set = new Set();
    library.filter((s) => s.type === assetType).forEach((s) => s.collections.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }

  function buildFolderTree(items) {
    const root = { name: "Root", children: {}, path: "", isRoot: true };
    items.forEach((item) => {
      if (!item.folderPath) return;
      const parts = item.folderPath.split("/");
      let current = root;
      let currentPath = "";
      parts.forEach((part) => {
        currentPath = currentPath ? currentPath + "/" + part : part;
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {}, path: currentPath };
        }
        current = current.children[part];
      });
    });
    return root;
  }

  const collapsedFolders = new Set();

  function renderSidebarStats() {
    const itemCount = document.getElementById("libItemCount");
    if (itemCount) itemCount.textContent = library.length + " items";
    const sidebarFooter = document.getElementById("libSidebarFooter");
    if (sidebarFooter) sidebarFooter.textContent = library.length + " items";
  }

  function renderFolderTree() {
    const items = library.filter((s) => s.type === assetType);
    const treeData = buildFolderTree(items);
    el.folderTree.innerHTML = "";

    const ul = document.createElement("ul");
    
    // Add default "All Files" row
    const allLi = document.createElement("li");
    allLi.className = "folder-node";
    allLi.innerHTML = `
      <div class="folder-row ${currentView !== "favorites" && selectedFolder === "" ? "active" : ""}" data-folder="">
        <span class="folder-caret"></span>
        <span class="folder-icon" aria-hidden="true"></span>
        <span class="folder-name">All Files</span>
        <span class="folder-count">${items.length}</span>
      </div>
    `;
    ul.appendChild(allLi);

    const favCount = items.filter((it) => !!it.favorite).length;
    const favLi = document.createElement("li");
    favLi.className = "folder-node";
    favLi.innerHTML = `
      <div class="folder-row ${currentView === "favorites" ? "active" : ""}" data-folder="__favorites__">
        <span class="folder-caret"></span>
        <span class="folder-icon" aria-hidden="true"></span>
        <span class="folder-name">Favorites</span>
        <span class="folder-count">${favCount}</span>
      </div>
    `;
    ul.appendChild(favLi);

    function buildHtml(node, parentEl) {
      Object.keys(node.children).sort().forEach((key) => {
        const child = node.children[key];
        const li = document.createElement("li");
        li.className = "folder-node";
        const hasChildren = Object.keys(child.children).length > 0;
        const isCollapsed = collapsedFolders.has(child.path);
        if (isCollapsed) {
          li.classList.add("collapsed");
        }
        const folderCount = items.filter((it) => it.folderPath === child.path || (it.folderPath && it.folderPath.startsWith(child.path + "/"))).length;
        const marked = isFolderMarked(child.path);

        li.innerHTML = `
          <div class="folder-row ${currentView !== "favorites" && selectedFolder === child.path ? "active" : ""} ${marked ? "marked" : ""}" data-folder="${escapeHtml(child.path)}">
            <span class="folder-caret">${hasChildren ? (isCollapsed ? "▶" : "▼") : ""}</span>
            <span class="folder-icon" aria-hidden="true"></span>
            <span class="folder-name">${escapeHtml(child.name)}</span>
            <span class="folder-count">${folderCount}</span>
            <button type="button" class="folder-remove-btn" data-folder-remove="${escapeHtml(child.path)}" title="Remove this folder and everything in it from the library" aria-label="Remove folder ${escapeHtml(child.name)}">✕</button>
          </div>
        `;

        if (hasChildren) {
          const subUl = document.createElement("ul");
          subUl.className = "folder-tree-sub";
          buildHtml(child, subUl);
          li.appendChild(subUl);
        }
        parentEl.appendChild(li);
      });
    }

    buildHtml(treeData, ul);
    el.folderTree.appendChild(ul);
  }

  function render() {
    const isGraphic = isGraphicType(assetType);
    const noun = assetNoun(assetType);
    const shelfCount = library.filter((s) => s.type === assetType).length;
    const filtered = getFiltered();
    const queryKey = [assetType, currentView, activeCollection || "", selectedFolder, filterText.trim().toLowerCase(), sortBy, viewMode].join("|");
    if (queryKey !== lastAssetQueryKey) {
      lastAssetQueryKey = queryKey;
      assetRenderLimit = ASSET_PAGE_SIZE;
    }
    el.library.innerHTML = "";
    
    // Update view mode classes on library container
    el.library.className = "library " + (viewMode === "grid" ? "grid" : "list");

    renderAssetTypeRow();
    renderTabsAndCollections();
    renderBatchBar();
    renderTransportForType();
    renderFolderTree();
    renderSidebarStats();

    if (shelfCount === 0) {
      if (assetType === "mogrt") {
        el.library.innerHTML = '<div class="empty-state"><span class="big empty-ico empty-ico-mogrt"></span>Your MOGRT shelf is empty.<br/>Add .mogrt templates or import a folder to get started.</div>';
      } else {
        el.library.innerHTML = '<div class="empty-state"><span class="big empty-ico empty-ico-sfx"></span>Your library is empty.<br/>Add sounds or import a folder to get started.</div>';
      }
      return;
    }
    if (filtered.length === 0) {
      const msg = currentView === "favorites"
        ? "No favorites yet. Ctrl+click a card to mark it, then open Favorites."
        : "No " + noun + "s match your search in this folder.";
      el.library.innerHTML = '<div class="empty-state">' + msg + "</div>";
      return;
    }

    // Render incrementally so very large libraries do not create thousands of
    // DOM nodes or extract every MOGRT thumbnail in one blocking pass.
    const visibleItems = filtered.slice(0, assetRenderLimit);
    visibleItems.forEach((item) => {
      el.library.appendChild(renderCard(item));
    });

    if (visibleItems.length < filtered.length) {
      const remaining = filtered.length - visibleItems.length;
      const batch = Math.min(ASSET_PAGE_SIZE, remaining);
      const more = document.createElement("div");
      more.className = "library-load-more";
      more.innerHTML = '<div class="library-load-progress">Showing ' + visibleItems.length + ' of ' + filtered.length + '</div>' +
        '<button type="button">Load ' + batch + ' more</button>';
      more.querySelector("button").addEventListener("click", () => {
        const previousScroll = el.library.scrollTop;
        assetRenderLimit += ASSET_PAGE_SIZE;
        render();
        requestAnimationFrame(() => { el.library.scrollTop = previousScroll; });
      });
      el.library.appendChild(more);
    }

  }

  function renderAssetTypeRow() {
    el.assetTypeRow.querySelectorAll(".shelf").forEach((b) => b.classList.toggle("active", b.dataset.type === assetType));
  }

  function renderTransportForType() {
    const isGraphic = isGraphicType(assetType);
    el.pitchBlock.style.display = isGraphic ? "none" : "block";
    if (document.getElementById("volumeBlock")) {
      document.getElementById("volumeBlock").style.display = isGraphic ? "none" : "block";
    }
    var _bm = document.getElementById("btnMixer");
    var _bp = document.getElementById("btnPitch");
    var _bottomMixer = document.querySelector("#sfxMogrtView .mixer-top-wrap");
    var showSfxMixer = assetType === "sfx";
    if (_bottomMixer) _bottomMixer.style.display = showSfxMixer ? "flex" : "none";
    if (_bm) _bm.style.display = showSfxMixer ? "" : "none";
    if (_bp) _bp.style.display = showSfxMixer ? "" : "none";
    var _mp = document.getElementById("mixerPopover");
    if (!showSfxMixer && _mp) { _mp.style.display = "none"; if (_bm) _bm.classList.remove("active"); if (_bp) _bp.classList.remove("active"); }
    el.playHint.textContent = isGraphic
      ? "Hover a " + assetNoun(assetType) + " to preview · click to insert at the playhead · Ctrl+click to favorite"
      : "Click a sound to play · Ctrl+click a card or folder to mark · ✕ removes marked items";
    el.btnAddFiles.textContent = "+";
    el.btnAddFiles.title = assetType === "mogrt" ? "Add MOGRT files" : "Add sound files";
    el.btnReset.title = "Reset " + (isGraphic ? "MOGRT" : "SFX") + " library";
    el.btnReset.setAttribute("aria-label", el.btnReset.title);
    el.fileInputFiles.setAttribute("accept", isGraphic ? ".mogrt" : ".mp3,.wav,.aiff,.aif,.m4a,.ogg");
  }

  function renderTabsAndCollections() {
    el.tabsRow.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === currentView));
    if (currentView !== "collections") {
      el.collectionsRow.style.display = "none";
      return;
    }
    el.collectionsRow.style.display = "flex";
    const cols = getAllCollections();
    if (cols.length === 0) {
      el.collectionsRow.innerHTML =
        '<span class="hint" style="margin:0;">No collections yet — use the folder button on a sound to create one.</span>';
      return;
    }
    el.collectionsRow.innerHTML = cols
      .map(
        (c) =>
          '<button class="chip' + (c === activeCollection ? " active" : "") + '" data-collection="' + escapeHtml(c) + '">' +
          escapeHtml(c) +
          "</button>"
      )
      .join("");
  }

  function renderBatchBar() {
    el.batchBar.style.display = batchMode ? "flex" : "none";
    el.batchCount.textContent = batchSelected.size + " selected";
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    // textContent protects element text, while explicit quote encoding also
    // makes the result safe when reused inside generated HTML attributes.
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderCard(item) {
    const isGraphic = isGraphicType(item.type);
    if (isGraphic) ensureThumbnail(item);

    const card = document.createElement("div");
    card.className = "sfx-card fxlib-card";
    if (missingAssetIds.has(item.id)) card.classList.add("missing-file");
    if (item.id === selectedId) card.classList.add("selected");
    if (item.favorite) card.classList.add("favorite");
    if (batchSelected.has(item.id)) card.classList.add("batch-selected");
    if (!isGraphic && isPlaying && item.id === selectedId) card.classList.add("playing");
    card.dataset.id = item.id;
    card.draggable = !batchMode;

    const colorStrip = item.color
      ? '<div class="color-strip" style="background:' + item.color + '"></div>'
      : "";

    const durationText = item.duration != null ? fmtTime(item.duration) : "—";
    const fmtMatch = (item.name || "").match(/\.([a-z0-9]{2,4})$/i);
    const fmtBadge = isGraphic ? "Ae" : (fmtMatch ? fmtMatch[1].toUpperCase() : "WAV");
    const badgeHtml = '<span class="card-badge card-badge-dur">' + durationText + '</span>' +
      '<span class="card-badge card-badge-fmt">' + fmtBadge + '</span>' +
      '<button type="button" class="card-fav-star' + (item.favorite ? " is-on" : "") + '" data-action="favorite" title="Favorite — Ctrl+click to mark">★</button>';

    let mediaArea = "";
    if (isGraphic) {
      mediaArea = '<div class="waveform-area fxlib-thumb">' +
        (item.thumbnail
          ? '<img class="card-media-img" src="' + item.thumbnail + '" style="width:100%;height:100%;object-fit:cover;" />'
          : '<span class="card-media-img thumb-fallback">Fx</span>') +
        '<video class="card-media-video" muted loop playsinline style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>' +
        badgeHtml +
        '</div>';
    } else {
      mediaArea = '<div class="waveform-area fxlib-thumb">' +
        generatePseudoWaveform(item.name) +
        badgeHtml +
        '</div>';
    }

    const subText = missingAssetIds.has(item.id) ? "Missing file" : (item.type === "mogrt" ? "MOGRT Template" : fmtBadge + " · " + durationText);

    const batchCheck = batchMode
      ? '<input class="batch-check" type="checkbox" aria-label="Select ' + escapeHtml(item.name) + ' for batch actions"' + (batchSelected.has(item.id) ? ' checked' : '') + ' />'
      : '';
    card.innerHTML = colorStrip + batchCheck + mediaArea +
      '<div class="meta-area fxlib-cardmeta">' +
      '<strong class="meta-title" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</strong>' +
      '<span class="meta-sub">' + subText + '</span>' +
      (item.favorite
        ? '<button type="button" class="card-fav-remove" data-action="remove-marked" title="Remove this marked item from the library">✕</button>'
        : "") +
      '</div>' +
      '<button class="fxlib-apply" data-action="insert" title="Apply — insert at the playhead">Apply</button>';

    // Click events inside cards
    card.addEventListener("click", (ev) => {
      if (batchMode) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleBatchSelect(item.id);
        return;
      }
      const btn = ev.target.closest("button");
      const action = btn ? btn.dataset.action : null;

      if (action === "favorite" || ((ev.ctrlKey || ev.metaKey) && action !== "insert" && action !== "remove-marked")) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleFavoriteSfx(item);
        return;
      }

      if (action === "remove-marked") {
        ev.preventDefault();
        ev.stopPropagation();
        removeMarkedSfxItems([item.id], item.name);
        return;
      }

      if (action === "insert") {
        ev.stopPropagation();
        selectItem(item.id);
        insertToTimeline();
        return;
      }

      if (action === "preview") {
        ev.stopPropagation();
        if (isGraphic) {
          selectedId = item.id;
          el.nowPlaying.innerHTML = '<span class="label">Selected:</span> ' + escapeHtml(item.name);
          el.library.querySelectorAll(".sfx-card").forEach(function(node) { node.classList.toggle("selected", node === card); });
          if (card._previewPinned) {
            card._previewPinned = false;
            stopCardHoverPreview(card, item);
          } else {
            card._previewPinned = true;
            card._previewHovering = true;
            applyCardHoverPreview(card, item);
          }
        } else {
          playOrStop(item.id);
        }
        return;
      }

      // Hover-overlay play/stop button (SFX cards only — MOGRT cards don't
      // render this overlay at all, so this branch never fires for them).
      if (ev.target.closest(".play-circle") || ev.target.closest(".hover-overlay")) {
        ev.stopPropagation();
        playOrStop(item.id);
        return;
      }

      // Card body is preview/select only. Timeline mutation is always an
      // explicit Apply action, consistently across SFX and MOGRT cards.
      if (isGraphic) {
        selectedId = item.id;
        el.nowPlaying.innerHTML = '<span class="label">Selected:</span> ' + escapeHtml(item.name);
        el.library.querySelectorAll(".sfx-card").forEach(function(node) { node.classList.toggle("selected", node === card); });
        card._previewPinned = true;
        card._previewHovering = true;
        applyCardHoverPreview(card, item);
      } else {
        playOrStop(item.id);
      }
    });

    // Hover = animated preview for MOGRT cards (same behavior
    // for both shelves) — plays whatever embedded preview asset was found.
    if (isGraphic) {
      card.addEventListener("mouseenter", () => startCardHoverPreview(card, item));
      card.addEventListener("mouseleave", () => stopCardHoverPreview(card, item));
    }

    // Drag start
    card.addEventListener("dragstart", (ev) => {
      card.classList.add("dragging");
      const cleanPath = item.path.replace(/\\/g, "/");
      const fileUrlRaw = "file:///" + cleanPath;
      const fileUrlEncoded = "file:///" + encodeURI(cleanPath);
      const mime = isGraphic ? "application/octet-stream" : "audio/" + path.extname(item.path).slice(1);

      // Adobe CEP Standard native drag and drop type (highly compatible with Premiere/AE)
      ev.dataTransfer.setData("com.adobe.cep.dnd.file.0", item.path);

      // Set DownloadURL for Chromium native OS file drop (with three slashes and encoding)
      ev.dataTransfer.setData("DownloadURL", mime + ":" + path.basename(item.path) + ":" + fileUrlEncoded);
      
      // Set text/uri-list (standards-based local file drag)
      ev.dataTransfer.setData("text/uri-list", fileUrlRaw);
      
      // Set text/plain as raw absolute path (highly effective fallback for host native timeline drop)
      ev.dataTransfer.setData("text/plain", item.path);
      
      ev.dataTransfer.effectAllowed = "copy";
    });

    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    return card;
  }

  function toggleBatchSelect(id) {
    if (batchSelected.has(id)) batchSelected.delete(id);
    else batchSelected.add(id);
    render();
  }

  function toggleFavoriteSfx(sfx) {
    if (!sfx) return;
    sfx.favorite = !sfx.favorite;
    saveLibrary();
    render();
    showToast(sfx.favorite ? "Marked “" + sfx.name + "” as favorite" : "Unmarked “" + sfx.name + "”");
  }

  function getMarkedSfxItems() {
    return library.filter((s) => s.type === assetType && !!s.favorite);
  }

  async function removeMarkedSfxItems(ids, label) {
    const idSet = new Set(ids || []);
    const targets = library.filter((s) => idSet.has(s.id));
    if (targets.length === 0) {
      showToast("No marked items to remove", true);
      return false;
    }
    const noun = assetNoun(assetType);
    const ok = await showModal({
      title: targets.length === 1 ? "Remove marked item?" : "Remove marked items?",
      message: targets.length === 1
        ? "Remove “" + (label || targets[0].name) + "” from the library? The file on disk stays in place."
        : "Remove " + targets.length + " marked " + noun + (targets.length > 1 ? "s" : "") + " from the library? Files on disk stay in place.",
      okText: "Remove",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return false;
    if (currentSource && idSet.has(selectedId)) stopPlayback();
    library = library.filter((s) => !idSet.has(s.id));
    idSet.forEach((id) => {
      missingAssetIds.delete(id);
      mogrtImportInProgress.delete(id);
      batchSelected.delete(id);
    });
    if (idSet.has(selectedId)) selectedId = null;
    saveLibrary();
    render();
    showToast(targets.length === 1 ? "Removed “" + (label || targets[0].name) + "”" : "Removed " + targets.length + " marked items");
    return true;
  }

  function loadMarkedFolders() {
    try {
      const raw = localStorage.getItem(FOLDER_MARK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        sfx: Array.isArray(parsed.sfx) ? parsed.sfx.filter(Boolean) : [],
        mogrt: Array.isArray(parsed.mogrt) ? parsed.mogrt.filter(Boolean) : []
      };
    } catch (e) {
      return { sfx: [], mogrt: [] };
    }
  }

  function saveMarkedFolders() {
    try {
      localStorage.setItem(FOLDER_MARK_KEY, JSON.stringify({
        sfx: markedFolders.sfx || [],
        mogrt: markedFolders.mogrt || []
      }));
    } catch (e) { auditFallback("MAIN_SAVEMARKEDFOLDERS_001", e); }
  }

  function isFolderMarked(folderPath) {
    return !!(folderPath && (markedFolders[assetType] || []).indexOf(folderPath) !== -1);
  }

  function toggleFolderMark(folderPath) {
    if (!folderPath || folderPath === "__favorites__") return;
    if (!markedFolders[assetType]) markedFolders[assetType] = [];
    const list = markedFolders[assetType];
    const idx = list.indexOf(folderPath);
    if (idx === -1) list.push(folderPath);
    else list.splice(idx, 1);
    saveMarkedFolders();
    render();
    showToast(idx === -1 ? "Marked folder “" + folderPath + "”" : "Unmarked folder “" + folderPath + "”");
  }

  function itemsInFolder(folderPath) {
    return library.filter((s) => {
      if (s.type !== assetType) return false;
      const folder = s.folderPath || "";
      return folder === folderPath || folder.indexOf(folderPath + "/") === 0;
    });
  }

  function getItemsInMarkedFolders() {
    const folders = markedFolders[assetType] || [];
    const seen = {};
    const out = [];
    folders.forEach((folderPath) => {
      itemsInFolder(folderPath).forEach((item) => {
        if (seen[item.id]) return;
        seen[item.id] = true;
        out.push(item);
      });
    });
    return out;
  }

  function unmarkFolders(folderPaths) {
    const drop = {};
    (folderPaths || []).forEach((p) => { drop[p] = true; });
    markedFolders[assetType] = (markedFolders[assetType] || []).filter((p) => !drop[p]);
    saveMarkedFolders();
  }

  async function removeMarkedFolder(folderPath) {
    const items = itemsInFolder(folderPath);
    if (items.length === 0) {
      unmarkFolders([folderPath]);
      render();
      showToast("Folder already empty");
      return;
    }
    const removed = await removeMarkedSfxItems(items.map((item) => item.id), folderPath);
    if (!removed) return;
    unmarkFolders([folderPath]);
    if (selectedFolder === folderPath || (selectedFolder && selectedFolder.indexOf(folderPath + "/") === 0)) {
      selectedFolder = "";
      currentView = "all";
      if (el.breadcrumb) el.breadcrumb.textContent = "All";
    }
    render();
  }

  function cycleColor(sfx) {
    const idx = sfx.color ? COLORS.indexOf(sfx.color) : -1;
    sfx.color = idx >= COLORS.length - 1 ? null : COLORS[idx + 1];
    saveLibrary();
    render();
  }

  async function promptAddToCollection(sfxList) {
    const existing = getAllCollections();
    const hint = existing.length ? "Existing: " + existing.join(", ") : "";
    const input = await showModal({
      title: "Add to Collection",
      message: "Comma-separated — new collections are created automatically." + (hint ? "\n" + hint : ""),
      input: true,
      placeholder: "e.g. Whoosh, Impacts",
      okText: "Add",
    });
    if (!input) return;
    const names = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    sfxList.forEach((sfx) => {
      names.forEach((n) => {
        if (!sfx.collections.includes(n)) sfx.collections.push(n);
      });
    });
    saveLibrary();
    render();
    showToast("Added " + sfxList.length + " sound" + (sfxList.length > 1 ? "s" : "") + " to " + names.join(", "));
  }

  function updateAnimatedMeters() {
    if (!isPlaying) return;
    document.querySelectorAll(".sfx-row.playing .meter i").forEach((bar) => {
      bar.style.height = 20 + Math.random() * 80 + "%";
    });
  }
  setInterval(updateAnimatedMeters, 110);

  // ---------------- Selection & audio engine ----------------

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function selectItem(id) {
    if (currentSource && selectedId !== id) stopPlayback();
    selectedId = id;
    const item = library.find((s) => s.id === id);
    el.nowPlaying.innerHTML = '<span class="label">Selected:</span> ' + escapeHtml(item ? item.name : "—");

    // The Library tab's waveform strip (js/orbit-sound.js) follows the
    // selection through this event rather than reaching into this module's
    // state, so it stays a separate file.
    try {
      window.dispatchEvent(new CustomEvent("compx:sfx-selected", {
        detail: item ? { id: item.id, name: item.name, path: item.path, type: item.type, duration: item.duration } : null
      }));
    } catch (evErr) { auditFallback("MAIN_SFX_SELECT_EVENT_001", evErr); }
    if (item) {
      el.tagEditorRow.style.display = "flex";
      el.tagEditor.value = item.tags.join(", ");
    } else {
      el.tagEditorRow.style.display = "none";
    }

    // Card thumbnails/hover-previews load lazily via ensureThumbnail() in
    // renderCard() — no separate big preview panel needed anymore.
    if (!item || !isGraphicType(item.type)) {
      // Waveform removed from UI — just decode to get duration if unknown
      if (item) loadWaveform(item);
    }

    render();
  }

  async function loadWaveform(sfx) {
    // Waveform canvas removed from UI. Only decode to capture duration.
    if (sfx.duration != null) return; // already known — skip decode
    try {
      const data = await fs.promises.readFile(sfx.path);
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      getAudioCtx().decodeAudioData(
        arrayBuffer,
        (buffer) => {
          if (sfx.duration == null) {
            sfx.duration = buffer.duration;
            saveLibrary();
            render();
          }
        },
        () => recordDiagnostic("warn", "AUDIO_DURATION_DECODE", "Could not decode audio duration", sfx.name, "skipped")
      );
    } catch (e) {
      recordDiagnostic("warn", "AUDIO_DURATION_READ", "Could not read audio for duration", e.message || e, "skipped");
    }
  }

  // drawWaveform is a no-op — canvas element removed from the panel UI.
  function drawWaveform(buffer) {}

  async function playSelected() {
    const sfx = library.find((s) => s.id === selectedId);
    if (!sfx) {
      showToast("Select a sound first", true);
      return;
    }
    if (isGraphicType(sfx.type)) {
      showToast("Hover the card to preview — drag onto the timeline to insert it", true);
      return;
    }
    try {
      const requestedId = sfx.id;
      const data = await fs.promises.readFile(sfx.path);
      if (selectedId !== requestedId) return;
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const ctx = getAudioCtx();
      ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => {
          stopPlayback();
          currentBuffer = buffer;
          if (sfx.duration == null) {
            sfx.duration = buffer.duration;
            saveLibrary();
          }
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          applyPitch(source);
          const gain = ctx.createGain();
          gain.gain.value = previewVolume;
          source.connect(gain).connect(ctx.destination);
          source.onended = () => {
            if (currentSource === source) {
              isPlaying = false;
              currentSource = null;
              render();
            }
          };
          source.start(0);
          currentSource = source;
          currentGain = gain;
          isPlaying = true;
          playStartedAt = ctx.currentTime;
          saveLibrary();
          // drawWaveform removed — canvas no longer in DOM
          render();
        },
        () => reportError("AUDIO_DECODE", "decodeAudioData failed", "Could not decode " + sfx.name)
      );
    } catch (e) {
      reportError("AUDIO_READ", e, "Could not read file: " + sfx.name);
    }
  }

  function applyPitch(source) {
    // Pitch-only control via detune (no speed control per the current design —
    // click-to-play always plays back at natural speed, pitch-shifted).
    const pitchSemis = parseFloat(el.pitch.value);
    source.detune.value = pitchSemis * 100;
  }

  function stopPlayback() {
    if (currentSource) {
      try {
        currentSource.onended = null;
        currentSource.stop();
      } catch (e) { auditFallback("MAIN_STOPPLAYBACK_001", e); }
      currentSource = null;
    }
    isPlaying = false;
    render();
  }

  function togglePlay() {
    if (isPlaying) {
      stopPlayback();
    } else {
      playSelected();
    }
  }

  function playOrStop(id) {
    // Click-to-play: clicking the currently-playing row stops it; clicking any
    // other row selects it and starts playback immediately.
    if (isPlaying && selectedId === id) {
      stopPlayback();
      return;
    }
    selectItem(id);
    playSelected();
  }

  function stepSelection(delta) {
    const filtered = getFiltered();
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((s) => s.id === selectedId);
    let next;
    if (idx === -1) next = delta > 0 ? 0 : filtered.length - 1;
    else next = (idx + delta + filtered.length) % filtered.length;
    selectItem(filtered[next].id);
  }

  // ---------------- Timeline insert (Premiere / AE) ----------------

  async function insertToTimeline() {
    const item = library.find((s) => s.id === selectedId);
    if (!item) {
      showToast("Select a " + assetNoun(assetType) + " first", true);
      return;
    }
    const safePath = hostArg(item.path);
    const pitchSemis = parseFloat(el.pitch.value) || 0;
    const volumePercent = Math.max(0, Math.min(200, parseInt((el.volume && el.volume.value) || "100", 10) || 100));
    let script;
    let trackedMogrtImport = false;
    if (isGraphicType(item.type) && currentHostAppId() === "AEFT") {
      // AE can't apply a .mogrt directly — unpack it and import the AE project
      // embedded inside (works for AE-authored mogrts). Premiere-authored
      // mogrts have no AE project, so we fall back to an honest reveal.
      if (mogrtImportInProgress.has(item.id)) {
        showToast("This MOGRT is already being prepared", true);
        recordDiagnostic("warn", "MOGRT_DUPLICATE_IMPORT", "Duplicate MOGRT import request skipped", item.name, "skipped");
        return;
      }
      mogrtImportInProgress.add(item.id);
      trackedMogrtImport = true;
      showToast("Preparing MOGRT cache…");
      const ex = await safeExtractMogrtAeProject(item.path);
      if (ex && ex.aepPath) {
        script = "aeft_importMogrtProject(" + hostArg(ex.aepPath) + ", " + hostArg(ex.compName || "") + ", true)";
      } else {
        script = "aeft_revealMogrt(" + safePath + ")";
      }
    } else {
      const fn = isGraphicType(item.type) ? "importMogrt" : "importSfx";
      script = isGraphicType(item.type)
        ? fn + "(" + safePath + ", true)"
        : fn + "(" + safePath + ", true, " + pitchSemis + ", " + volumePercent + ")";
    }
    callHost(script, (parsed) => {
      if (trackedMogrtImport) mogrtImportInProgress.delete(item.id);
      if (parsed.success && parsed.inserted) {
        var adjustments = [];
        if (pitchSemis !== 0) adjustments.push("pitch: " + (pitchSemis > 0 ? "+" : "") + pitchSemis + " st");
        if (!isGraphicType(item.type) && volumePercent !== 100) adjustments.push("volume: " + volumePercent + "%");
        var suffix = adjustments.length ? " (" + adjustments.join(" · ") + ")" : "";
        showToast(parsed.warning || ("Inserted “" + item.name + "” on the timeline" + suffix), !!parsed.warning);
        recordDiagnostic("info", "TIMELINE_INSERT", "Asset inserted on timeline", item.name, "applied");
      } else if (parsed.success && !parsed.inserted) {
        showToast(parsed.warning || "Imported to project (no active sequence to insert into)", true);
        recordDiagnostic("warn", "PROJECT_IMPORT_ONLY", "Asset imported without timeline insertion", parsed.warning || item.name, "skipped");
      } else {
        showToast(parsed.error || parsed.message || "Insert failed", true);
        recordDiagnostic("error", "TIMELINE_INSERT_FAILED", "Timeline insertion failed", parsed.error || parsed.message, "failed");
      }
    });
  }

  function detectHost() {
    try {
      const info = csInterface.getHostEnvironment();
      el.hostHint.textContent = "Connected to " + (info && info.appName ? info.appName : "host");
    } catch (e) {
      el.hostHint.textContent = "Standalone preview (no Premiere/AE detected)";
    }
  }

  // ---------------- Wiring ----------------

  el.assetTypeRow.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".shelf");
    if (!btn) return;

    el.assetTypeRow.querySelectorAll(".shelf").forEach((b) => b.classList.toggle("active", b === btn));
    try { localStorage.setItem("compXLibraryShelf", btn.dataset.type || "textanim"); } catch (e) { auditFallback("MAIN_DETECTHOST_001", e); }

    const ffxView = document.getElementById("ffxPresetView");
    const tanimView = document.getElementById("textAnimView");
    const motionView = document.getElementById("motionPresetView");
    [ffxView, tanimView, motionView].forEach((v) => { if (v) v.style.display = "none"; });
    // These library views contain flex-height scroll regions. Opening them as
    // block elements collapses large card grids even though the item count is
    // correct (most visible with hundreds of local video references).
    if (btn.dataset.type === "ffx") { if (ffxView) ffxView.style.display = "flex"; return; }
    if (btn.dataset.type === "textanim") { if (tanimView) tanimView.style.display = "flex"; return; }
    if (btn.dataset.type === "motions") { if (motionView) motionView.style.display = "flex"; return; }
    if (btn.dataset.type === assetType) return; // already on this shelf

    if (currentSource) stopPlayback();
    assetType = btn.dataset.type;
    selectedId = null;
    filterText = "";
    selectedFolder = "";
    el.breadcrumb.textContent = "All";
    el.search.value = "";
    currentView = "all";
    activeCollection = null;
    batchMode = false;
    batchSelected.clear();
    el.tagEditorRow.style.display = "none";
    el.nowPlaying.innerHTML = '<span class="label">Selected:</span> —';
    render();
    // SFX and MOGRT share one scrollable grid. A shelf switch used to retain
    // the previous shelf's vertical offset, clipping the first card preview
    // beneath the toolbar and leaving only its meta/apply row visible.
    el.library.scrollTop = 0;
    requestAnimationFrame(function() { el.library.scrollTop = 0; });
  });

  el.search.addEventListener("input", () => {
    filterText = el.search.value;
    render();
  });

  el.btnAddFiles.addEventListener("click", () => el.fileInputFiles.click());

  (function wireCardSizeSlider() {
    const slider = document.getElementById("cardSizeSlider");
    const libraryGrid = document.getElementById("library");
    if (!slider || !libraryGrid) return;
    const saved = parseInt(localStorage.getItem("ccCardSize") || "158", 10);
    const initial = isNaN(saved) ? 158 : Math.max(90, Math.min(220, saved));
    slider.value = String(initial);
    libraryGrid.style.setProperty("--card-min-w", initial + "px");
    // FIX: throttle slider updates with requestAnimationFrame.
    // Without this, every single pixel of drag fires a CSS variable change
    // which forces the grid to recalculate layout on every frame — causing
    // severe lag/jank when there are many cards.
    let rafPending = false;
    slider.addEventListener("input", () => {
      if (rafPending) return;
      rafPending = true;
      // Disable card transitions while dragging so they don't compound the lag
      libraryGrid.classList.add("resizing");
      requestAnimationFrame(() => {
        libraryGrid.style.setProperty("--card-min-w", slider.value + "px");
        rafPending = false;
      });
    });
    slider.addEventListener("change", () => {
      // Final value after drag ends: apply immediately + remove resizing class
      libraryGrid.style.setProperty("--card-min-w", slider.value + "px");
      libraryGrid.classList.remove("resizing");
      try { localStorage.setItem("ccCardSize", slider.value); } catch (e) { auditFallback("MAIN_WIRECARDSIZESLIDER_001", e); }
    });
  })();

  // -------------------------------------------------------------
  // FLEX CAPTION STUDIO � replaces old word-by-word caption system
  // -------------------------------------------------------------
  function wireFlexCaptions() {
    var mediaInput = document.getElementById("flexMediaInput");
    var srtInput = document.getElementById("flexSrtInput");
    var editor = document.getElementById("flexCaptionEditor");
    var status = document.getElementById("flexCaptionStatus");
    var createBtn = document.getElementById("btnFlexCaptionCreate");
    var captionEngine = document.getElementById("flexCaptionEngine");
    var captionBuildProgress = document.getElementById("flexCaptionBuildProgress");
    var updateCaptionsBtn = document.getElementById("btnFlexUpdateCaptions");
    var layoutGrid = document.getElementById("flexCaptionLayoutGrid");
    var outputSeg = document.getElementById("flexCaptionOutputSeg");
    var transcribeBtn = document.getElementById("btnFlexTranscribe");
    var consentPanel = document.getElementById("flexRuntimeConsent");
    var consentText = document.getElementById("flexRuntimeConsentText");
    var runtimeProgress = document.getElementById("flexRuntimeProgress");
    var runtimeAllowBtn = document.getElementById("btnFlexRuntimeAllow");
    var runtimeCancelBtn = document.getElementById("btnFlexRuntimeCancel");
    var mediaPath = "";
    var runtimeBusy = false;
    var pendingRuntimeRequest = null;
    var lastWordTimings = [];
    var lastFlexSrtIssues = [];
    var selectedCueIndex = -1;
    var cueRows = [];
    var rowTextEditing = false;
    var captionAnimSelect = document.getElementById("flexCaptionAnimType");
    var captionPresetGrid = document.getElementById("flexCaptionPresetGrid");
    var previewStage = document.getElementById("flexCaptionPreviewStage");
    var previewWords = document.getElementById("flexCaptionPreviewWords");
    var previewTag = document.getElementById("flexCaptionPreviewTag");
    var captionStageNav = document.getElementById("flexCaptionStageNav");
    var captionStageSummary = document.getElementById("flexCaptionStageSummary");
    var activeCaptionStage = "source";
    var banglaFontSelect = document.getElementById("flexCaptionBanglaFont");
    var banglaFontInstallBtn = document.getElementById("btnInstallBanglaFonts");
    var banglaFontStatus = document.getElementById("banglaFontStatus");
    var captionFontInput = document.getElementById("flexCaptionFont");
    var systemFontList = document.getElementById("flexSystemFontList");
    var systemFontLoadBtn = document.getElementById("btnLoadSystemFonts");
    var systemFontStatus = document.getElementById("systemFontStatus");
    var systemFontByPostScript = {};

    function captionStageCopy(stage) {
      if (stage === "edit") {
        var cueCount = parseFlexSRT(editor ? editor.value : "").length;
        return cueCount
          ? cueCount + " caption line" + (cueCount === 1 ? "" : "s") + " ready" + (lastFlexSrtIssues.length ? " · review " + lastFlexSrtIssues.length + " warning(s)" : " · timing clean") + "."
          : "Transcribe media or import an SRT before editing.";
      }
      if (stage === "style") return "Choose a look, preview it, then explicitly Generate Captions.";
      return "Choose media or import an SRT, then transcribe.";
    }

    function refreshCaptionStageAvailability(cueCount) {
      if (!captionStageNav) return;
      var hasCues = Number(cueCount) > 0;
      captionStageNav.querySelectorAll("[data-caption-stage]").forEach(function (button) {
        var stage = button.dataset.captionStage;
        button.disabled = stage !== "source" && !hasCues;
        button.classList.toggle("has-content", hasCues && stage !== "source");
      });
      if (!hasCues && activeCaptionStage !== "source") setCaptionStage("source");
      else if (captionStageSummary) captionStageSummary.textContent = captionStageCopy(activeCaptionStage);
    }

    function setCaptionStage(stage) {
      stage = stage === "edit" || stage === "style" ? stage : "source";
      var targetButton = captionStageNav ? captionStageNav.querySelector('[data-caption-stage="' + stage + '"]') : null;
      if (targetButton && targetButton.disabled) return;
      activeCaptionStage = stage;
      document.querySelectorAll("#flexAutoCaptions [data-cap-stage-panel]").forEach(function (panel) {
        panel.hidden = panel.dataset.capStagePanel !== stage;
      });
      if (captionStageNav) captionStageNav.querySelectorAll("[data-caption-stage]").forEach(function (button) {
        var selected = button.dataset.captionStage === stage;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
      });
      if (captionStageSummary) captionStageSummary.textContent = captionStageCopy(stage);
      if (stage === "edit") renderCueList();
      if (stage === "style") refreshCaptionPreview();
    }

    if (captionStageNav) captionStageNav.addEventListener("click", function (event) {
      var button = event.target.closest("[data-caption-stage]");
      if (!button || button.disabled) return;
      setCaptionStage(button.dataset.captionStage);
    });
    document.getElementById("btnFlexContinueStyle")?.addEventListener("click", function () {
      var cues = refreshImportState();
      if (!cues.length) { setStatus("Add or transcribe captions before choosing a style.", "error"); return; }
      var fatalIssues = lastFlexSrtIssues.filter(function (issue) { return issue.indexOf("overlaps the previous cue") < 0; });
      if (fatalIssues.length) { setStatus("Fix invalid SRT blocks before continuing to Style.", "error"); return; }
      setCaptionStage("style");
    });
    var BANGLA_CAPTION_FONTS = [
      { file:"Hind Siliguri Regular.ttf", postscript:"HindSiliguriRegular", registry:"Hind Siliguri Regular (TrueType)" },
      { file:"Hind Siliguri Medium.ttf", postscript:"HindSiliguri-Medium", registry:"Hind Siliguri Medium (TrueType)" },
      { file:"Hind Siliguri Bold.ttf", postscript:"HindSiliguriBold-Bold", registry:"Hind Siliguri Bold (TrueType)" },
      { file:"Mina-Regular.ttf", postscript:"Mina-Regular", registry:"Mina Regular (TrueType)" },
      { file:"Mina-Bold.ttf", postscript:"Mina-Bold", registry:"Mina Bold (TrueType)" },
      { file:"Ekush-Regular.ttf", postscript:"CodepotroEkush", registry:"Codepotro Ekush (TrueType)" },
      { file:"Galada Unicode.ttf", postscript:"GaladaUnicode", registry:"Galada Unicode (TrueType)" },
      { file:"Galada Script Unicode.ttf", postscript:"GaladaScriptUnicode", registry:"Galada Script Unicode (TrueType)" }
    ];

    if (captionAnimSelect && !captionAnimSelect.querySelector('optgroup[data-caption-ffx]')) {
      var ffxGroup = document.createElement("optgroup");
      ffxGroup.label = "Bundled FFX Presets";
      ffxGroup.dataset.captionFfx = "1";
      CAPTION_FFX_STYLES.forEach(function (preset) {
        var option = document.createElement("option");
        option.value = "ffx:" + preset.file;
        option.textContent = preset.label + " · FFX";
        option.dataset.ffxId = preset.preview || preset.id;
        ffxGroup.appendChild(option);
      });
      captionAnimSelect.appendChild(ffxGroup);
    }

    var builtinPreviewMap = { pop:"ffxJump", whip:"ffxSlingshot", scale:"ffxBasic", bounce:"ffxBouncy", elastic:"ffxJelly", drop:"ffxSmoothDown", slideUp:"ffxSmoothUp", slideLeft:"ffxSlick", slideRight:"ffxClassy", rotate:"ffxWild", blurIn:"ffxShy", fade:"ffxEase", letterRise:"ffxSmoothUp" };
    function selectedLayout() {
      var active = layoutGrid ? layoutGrid.querySelector("[data-flex-layout].active") : null;
      return active ? active.dataset.flexLayout : "inline";
    }
    function chooseLayout(layout) {
      if (!layoutGrid) return;
      layoutGrid.querySelectorAll("[data-flex-layout]").forEach(function (item) { item.classList.toggle("active", item.dataset.flexLayout === layout); });
    }
    function previewSample() {
      var cues = parseFlexSRT(editor ? editor.value : "");
      var language = (document.getElementById("flexCaptionLanguage") || {}).value;
      var cueIndex = selectedCueIndex >= 0 && selectedCueIndex < cues.length ? selectedCueIndex : 0;
      var source = cues.length ? cues[cueIndex].text : (language === "bn" ? "বাংলা ক্যাপশন প্রিভিউ" : "YOUR CAPTION HERE");
      var words = String(source).replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
      return words.length ? words : ["YOUR", "CAPTION", "HERE"];
    }
    var captionPlayTimer = null;
    function previewWordBeats() {
      var beats = null;
      var cues = parseFlexSRT(editor ? editor.value : "");
      var cueIndex = selectedCueIndex >= 0 && selectedCueIndex < cues.length ? selectedCueIndex : 0;
      var precise = lastWordTimings && lastWordTimings[cueIndex];
      if (precise && precise.length) {
        beats = precise.slice(0, 5).map(function (word) { return Math.max(130, Math.min(900, Math.round((word.end - word.start) * 1000 * 0.8))); });
      }
      return beats;
    }
    function stopCaptionPlay() {
      if (captionPlayTimer) { clearTimeout(captionPlayTimer); captionPlayTimer = null; }
      if (previewStage) previewStage.classList.remove("is-playing");
      var playBtn = document.getElementById("btnCaptionPreviewPlay");
      if (playBtn) playBtn.classList.remove("is-playing");
      if (previewWords) {
        var spans = previewWords.querySelectorAll("span");
        for (var i = 0; i < spans.length; i++) {
          spans[i].classList.remove("cx-preview-word-done", "cx-preview-word-active", "cx-preview-word-pending");
        }
      }
    }
    function playCaptionPreview() {
      if (!previewWords || !previewStage) return;
      stopCaptionPlay();
      var spans = Array.prototype.slice.call(previewWords.querySelectorAll("span"));
      if (!spans.length) return;
      var beats = previewWordBeats();
      previewStage.classList.add("is-playing");
      var playBtn = document.getElementById("btnCaptionPreviewPlay");
      if (playBtn) playBtn.classList.add("is-playing");
      spans.forEach(function (span) { span.classList.add("cx-preview-word-pending"); });
      function step(index) {
        if (index >= spans.length) { stopCaptionPlay(); return; }
        spans[index].classList.remove("cx-preview-word-pending");
        spans[index].classList.add("cx-preview-word-active");
        for (var k = 0; k < index; k++) {
          spans[k].classList.remove("cx-preview-word-active");
          spans[k].classList.add("cx-preview-word-done");
        }
        var beat = beats && beats[index] ? beats[index] : 360;
        captionPlayTimer = setTimeout(function () { step(index + 1); }, beat);
      }
      step(0);
    }
    document.getElementById("btnCaptionPreviewPlay")?.addEventListener("click", function () {
      if (previewStage && previewStage.classList.contains("is-playing")) { stopCaptionPlay(); return; }
      playCaptionPreview();
    });
    function refreshCaptionPreview() {
      stopCaptionPlay();
      if (!previewStage || !previewWords) return;
      var layout = selectedLayout();
      var activeWord = document.getElementById("flexCaptionKaraoke").checked;
      var activeMode = document.getElementById("flexCaptionActiveMode").value;
      var activePop = Math.max(0, Math.min(40, Number(document.getElementById("flexCaptionActivePop").value) || 0));
      var anim = captionAnimSelect ? captionAnimSelect.value : "pop";
      var option = captionAnimSelect && captionAnimSelect.selectedOptions ? captionAnimSelect.selectedOptions[0] : null;
      var motionId = option && option.dataset.ffxId ? option.dataset.ffxId : builtinPreviewMap[anim];
      var motionClass = motionId ? "ffx-anim-" + motionId : "";
      var activeStyleButton = document.querySelector("#flexCaptionActiveStyle [data-active-style].active");
      var activeStyleName = activeStyleButton ? activeStyleButton.dataset.activeStyle : "pill";
      var previewMeta = activePresetMeta();
      previewStage.className = "ffx-preview-stage cx-caption-live-preview preset-" + activeCaptionPreset + " layout-" + layout + " mode-" + activeMode + " active-style-" + activeStyleName + (activeWord ? " active-enabled" : "") + (document.getElementById("flexChkBg").checked ? " preview-bg" : "");
      previewStage.style.setProperty("--caption-normal", document.getElementById("flexCaptionColor").value);
      previewStage.style.setProperty("--caption-active", document.getElementById("flexCaptionEmphasisColor").value);
      previewStage.style.setProperty("--caption-bg", document.getElementById("flexCaptionBgColor").value);
      previewStage.style.setProperty("--caption-pop", String(1 + activePop / 100));
      previewStage.style.setProperty("--caption-shadow", document.getElementById("flexChkShadow").checked ? "0 3px 7px rgba(0,0,0,.8)" : "none");
      previewStage.style.alignItems = document.getElementById("flexCaptionPosition").value === "top" ? "flex-start" : (document.getElementById("flexCaptionPosition").value === "bottom" ? "flex-end" : "center");
      previewStage.style.padding = "8px";
      previewWords.style.fontSize = Math.max(14, Math.min(30, (Number(document.getElementById("flexCaptionFontSize").value) || 90) / 4)) + "px";
      var selectedBanglaFont = banglaFontSelect && banglaFontSelect.selectedOptions ? banglaFontSelect.selectedOptions[0] : null;
      var requestedFont = captionFontInput ? String(captionFontInput.value || "").trim() : "";
      var systemFont = requestedFont ? systemFontByPostScript[requestedFont] : null;
      var previewFamily = selectedBanglaFont && selectedBanglaFont.value === requestedFont && selectedBanglaFont.dataset.cssFont ? selectedBanglaFont.dataset.cssFont : (systemFont ? systemFont.family : requestedFont);
      previewWords.style.fontFamily = previewFamily ? ('"' + String(previewFamily).replace(/"/g, "") + '", sans-serif') : "";
      previewWords.className = "ffx-preview-word cx-caption-preview-words " + motionClass;
      previewWords.innerHTML = "";
      var BEASTY_PREVIEW_PALETTE = ["#ffd94a", "#4dff88", "#66c7ff", "#ff7ab8"];
      previewSample().forEach(function (word, wordIndex) {
        var isKeyword = /^\*[^*]+\*$/.test(word);
        var cleanWord = isKeyword ? word.slice(1, -1) : word;
        var span = document.createElement("span");
        span.textContent = cleanWord;
        if (isKeyword) {
          var keywordScale = Math.max(100, Math.min(300, Number((document.getElementById("flexCaptionKeywordScale") || {}).value) || 135));
          var keywordGlow = Math.max(0, Math.min(100, Number((document.getElementById("flexCaptionKeywordGlow") || {}).value) || 40));
          var keywordColor = document.getElementById("flexCaptionEmphasisColor").value;
          span.classList.add("cx-preview-word-keyword");
          span.style.color = keywordColor;
          span.style.fontSize = (keywordScale / 100) + "em";
          span.style.fontWeight = "900";
          span.style.textShadow = keywordGlow > 0 ? "0 0 " + Math.round(4 + keywordGlow * 0.22) + "px " + keywordColor : "none";
        }
        if (/[\u0980-\u09FF]/.test(cleanWord)) {
          var banglaPreviewFamily = selectedBanglaFont && selectedBanglaFont.dataset.cssFont ? selectedBanglaFont.dataset.cssFont : "CompX Hind Siliguri";
          span.style.fontFamily = '"' + String(banglaPreviewFamily).replace(/"/g, "") + '", sans-serif';
        } else if (previewFamily) {
          span.style.fontFamily = '"' + String(previewFamily).replace(/"/g, "") + '", sans-serif';
        }
        // Preset-specific preview treatments so each style previews what AE will actually build.
        if (!isKeyword) {
          if (previewMeta.beasty) {
            span.style.color = BEASTY_PREVIEW_PALETTE[wordIndex % BEASTY_PREVIEW_PALETTE.length];
            span.style.fontWeight = "900";
          } else if (previewMeta.chrome) {
            span.classList.add("cx-preview-word-chrome");
          } else if (previewMeta.neon) {
            span.classList.add("cx-preview-word-neon");
          } else if (previewMeta.spotlight) {
            span.classList.add("cx-preview-word-spotlight");
          } else if (activeCaptionPreset === "hormozi" && wordIndex === 0) {
            // Hormozi demo: the first word pops in the keyword (accent) colour.
            span.classList.add("cx-preview-word-keyword");
            span.style.color = document.getElementById("flexCaptionEmphasisColor").value;
            span.style.fontWeight = "900";
          }
        }
        previewWords.appendChild(span);
      });
      if (previewTag) previewTag.textContent = (option ? option.textContent.replace(" · FFX", "") : "Pop") + " · " + layout;
      void previewWords.offsetWidth;
    }

    var captionStylePresets = {
      clean:{ layout:"inline", anim:"fade", active:false, mode:"colorPop", pop:8, size:86, max:3, normal:"#ffffff", accent:"#7b61ff", shadow:true, bg:false },
      capcut:{ layout:"inline", anim:"pop", active:true, mode:"colorPop", pop:14, size:96, max:3, normal:"#ffffff", accent:"#ffe600", shadow:true, bg:false },
      karaoke:{ layout:"inline", anim:"none", active:true, mode:"colorPop", pop:12, size:92, max:4, normal:"#ffffff", accent:"#7b61ff", shadow:true, bg:false },
      hormozi:{ layout:"inline", anim:"pop", active:true, mode:"colorPop", pop:16, size:96, max:3, normal:"#ffffff", accent:"#ffe600", shadow:true, bg:false },
      bigword:{ layout:"bigword", anim:"bounce", active:false, mode:"colorPop", pop:10, size:88, max:2, normal:"#ffffff", accent:"#ff4d8d", shadow:true, bg:false },
      classy:{ layout:"inline", anim:"ffx:MB W20 Classy.ffx", active:false, mode:"color", pop:0, size:90, max:3, normal:"#ffffff", accent:"#7b61ff", shadow:true, bg:false },
      beasty:{ layout:"inline", anim:"pop", active:true, mode:"colorPop", pop:18, size:100, max:2, normal:"#ffffff", accent:"#ffe600", shadow:true, bg:false, beasty:true },
      neon:{ layout:"inline", anim:"pop", active:false, mode:"color", pop:0, size:96, max:3, normal:"#5fffa6", accent:"#5fffa6", shadow:false, bg:false, neon:true },
      chrome:{ layout:"inline", anim:"pop", active:false, mode:"color", pop:0, size:96, max:3, normal:"#c9ced8", accent:"#c9ced8", shadow:false, bg:false, chrome:true },
      spotlight:{ layout:"inline", anim:"none", active:true, mode:"colorPop", pop:20, size:98, max:2, normal:"#e8e8e8", accent:"#22ff6f", shadow:true, bg:false, spotlight:true },
      letterrise:{ layout:"inline", anim:"letterRise", active:false, mode:"colorPop", pop:10, size:92, max:1, normal:"#ffffff", accent:"#7b61ff", shadow:true, bg:false },
      banglaviral:{ layout:"inline", anim:"pop", active:true, mode:"colorPop", pop:16, size:104, max:3, normal:"#ffffff", accent:"#ffe600", shadow:true, bg:true, font:"HindSiliguriBold-Bold" },
      news:{ layout:"inline", anim:"fade", active:false, mode:"color", pop:0, size:80, max:5, normal:"#ffffff", accent:"#ffd166", shadow:true, bg:true, position:"bottom" },
      podcast:{ layout:"inline", anim:"none", active:false, mode:"color", pop:0, size:74, max:6, normal:"#ffffff", accent:"#7b61ff", shadow:false, bg:false },
      review:{ layout:"inline", anim:"bounce", active:true, mode:"colorPop", pop:14, size:98, max:3, normal:"#ffffff", accent:"#22ff6f", shadow:true, bg:true, position:"center" }
    };
    var activeCaptionPreset = "clean";
    // ---- Custom text presets: save any current settings as a named preset ----
    var CUSTOM_PRESETS_KEY = "compxCustomTextPresets";
    var customPresets = [];
    try { customPresets = JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]") || []; } catch (customLoadError) { customPresets = []; }
    function saveCustomPresets() {
      try { localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets)); } catch (customSaveError) { auditFallback("MAIN_CUSTOM_PRESET_SAVE_001", customSaveError); }
    }
    function findCustomPreset(id) {
      for (var ci = 0; ci < customPresets.length; ci++) { if (customPresets[ci].id === id) return customPresets[ci]; }
      return null;
    }
    // Treatment flags (neon/chrome/beasty/spotlight) come from the active built-in
    // preset OR from a custom preset's own saved settings.
    function activePresetMeta() {
      var meta = captionStylePresets[activeCaptionPreset] || {};
      if (String(activeCaptionPreset).indexOf("custom-") === 0) {
        var cp = findCustomPreset(activeCaptionPreset);
        if (cp && cp.settings) meta = { neon: !!cp.settings.neon, chrome: !!cp.settings.chrome, beasty: !!cp.settings.beasty, spotlight: !!cp.settings.spotlight };
      }
      return meta;
    }
    function readCaptionSettings() {
      var activeLayoutBtn = layoutGrid ? layoutGrid.querySelector("[data-flex-layout].active") : null;
      var activeStyleBtn = document.querySelector("#flexCaptionActiveStyle [data-active-style].active");
      var meta = activePresetMeta();
      return {
        layout: activeLayoutBtn ? activeLayoutBtn.dataset.flexLayout : "inline",
        anim: (document.getElementById("flexCaptionAnimType") || {}).value || "pop",
        position: (document.getElementById("flexCaptionPosition") || {}).value || "bottom",
        font: (document.getElementById("flexCaptionFont") || {}).value || "",
        banglaFont: (document.getElementById("flexCaptionBanglaFont") || {}).value || "",
        fontSize: Number((document.getElementById("flexCaptionFontSize") || {}).value) || 90,
        color: (document.getElementById("flexCaptionColor") || {}).value || "#ffffff",
        emphasisColor: (document.getElementById("flexCaptionEmphasisColor") || {}).value || "#7b61ff",
        karaoke: !!(document.getElementById("flexCaptionKaraoke") || {}).checked,
        activeStyle: activeStyleBtn ? activeStyleBtn.dataset.activeStyle : "pill",
        activeMode: (document.getElementById("flexCaptionActiveMode") || {}).value || "colorPop",
        activePop: Number((document.getElementById("flexCaptionActivePop") || {}).value) || 0,
        shadow: !!(document.getElementById("flexChkShadow") || {}).checked,
        bg: !!(document.getElementById("flexChkBg") || {}).checked,
        bgColor: (document.getElementById("flexCaptionBgColor") || {}).value || "#000000",
        speed: Number((document.getElementById("flexCaptionSpeed") || {}).value) || 14,
        intensity: Number((document.getElementById("flexCaptionIntensity") || {}).value) || 60,
        keywordScale: Number((document.getElementById("flexCaptionKeywordScale") || {}).value) || 135,
        keywordGlow: Number((document.getElementById("flexCaptionKeywordGlow") || {}).value) || 40,
        maxWords: Number((document.getElementById("flexCaptionMaxWords") || {}).value) || 3,
        neon: !!meta.neon, chrome: !!meta.chrome, beasty: !!meta.beasty, spotlight: !!meta.spotlight
      };
    }
    function applyCaptionSettings(s) {
      if (!s) return;
      if (layoutGrid) {
        var layoutBtn = layoutGrid.querySelector('[data-flex-layout="' + s.layout + '"]');
        if (layoutBtn) chooseLayout(s.layout);
      }
      var setVal = function (id, val) { var el = document.getElementById(id); if (el && val !== undefined && val !== null && val !== "") el.value = val; };
      setVal("flexCaptionAnimType", s.anim);
      setVal("flexCaptionPosition", s.position);
      setVal("flexCaptionFont", s.font);
      setVal("flexCaptionBanglaFont", s.banglaFont);
      setVal("flexCaptionFontSize", s.fontSize);
      setVal("flexCaptionColor", s.color);
      setVal("flexCaptionEmphasisColor", s.emphasisColor);
      setVal("flexCaptionActiveMode", s.activeMode);
      setVal("flexCaptionActivePop", s.activePop);
      setVal("flexCaptionBgColor", s.bgColor);
      setVal("flexCaptionSpeed", s.speed);
      setVal("flexCaptionIntensity", s.intensity);
      setVal("flexCaptionKeywordScale", s.keywordScale);
      setVal("flexCaptionKeywordGlow", s.keywordGlow);
      setVal("flexCaptionMaxWords", s.maxWords);
      var setCheck = function (id, val) { var el = document.getElementById(id); if (el) el.checked = !!val; };
      setCheck("flexCaptionKaraoke", s.karaoke);
      setCheck("flexChkShadow", s.shadow);
      setCheck("flexChkBg", s.bg);
      var styleBtn = document.querySelector('#flexCaptionActiveStyle [data-active-style="' + s.activeStyle + '"]');
      if (styleBtn) {
        document.querySelectorAll("#flexCaptionActiveStyle [data-active-style]").forEach(function (item) { item.classList.toggle("active", item === styleBtn); });
      }
      var banglaSel = document.getElementById("flexCaptionBanglaFont");
      var fontInput = document.getElementById("flexCaptionFont");
      if (banglaSel && s.banglaFont && banglaSel.value !== s.banglaFont) { banglaSel.value = s.banglaFont; if (fontInput) fontInput.value = s.banglaFont; }
      updateOutputEstimate();
      refreshCaptionPreview();
    }
    function renderCustomPresets() {
      if (!captionPresetGrid) return;
      captionPresetGrid.querySelectorAll("[data-caption-preset][data-custom]" ).forEach(function (el) { el.remove(); });
      customPresets.forEach(function (cp) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cx-caption-preset cx-caption-preset-custom" + (activeCaptionPreset === cp.id ? " active" : "");
        btn.dataset.captionPreset = cp.id;
        btn.dataset.custom = "1";
        btn.title = "Custom preset \u2014 " + cp.name;
        var glyph = document.createElement("span");
        glyph.className = "cx-cap-preset-glyph";
        glyph.textContent = "★";
        var name = document.createElement("span");
        name.className = "cx-cap-preset-name";
        name.textContent = cp.name;
        var dot = document.createElement("span");
        dot.className = "cx-cap-preset-dot";
        dot.style.background = cp.settings && cp.settings.emphasisColor ? cp.settings.emphasisColor : "#22ff6f";
        var del = document.createElement("button");
        del.type = "button";
        del.className = "cx-cap-preset-del";
        del.textContent = "✕";
        del.title = "Delete this custom preset";
        del.dataset.obs = "1";
        del.addEventListener("click", function (ev) {
          ev.stopPropagation();
          showModal({ title: "Delete preset?", message: "Delete custom preset \"" + cp.name + "\"?", okText: "Delete", cancelText: "Keep", danger: true }).then(function (ok) {
            if (!ok) return;
            customPresets = customPresets.filter(function (p) { return p.id !== cp.id; });
            saveCustomPresets();
            if (activeCaptionPreset === cp.id) { activeCaptionPreset = "clean"; }
            renderCustomPresets();
            setStatus("Custom preset deleted.", "ok");
          });
        });
        btn.appendChild(glyph);
        btn.appendChild(name);
        btn.appendChild(dot);
        btn.appendChild(del);
        captionPresetGrid.appendChild(btn);
      });
    }
    document.getElementById("btnFlexSavePreset")?.addEventListener("click", function () {
      showModal({ title: "Save Custom Preset", message: "Give this style a name \u2014 it saves everything: animation, colors, fonts, layout, position, sliders.", input: true, placeholder: "e.g. My Brand Yellow", defaultValue: "", okText: "Save", cancelText: "Cancel" }).then(function (name) {
        if (!name) return;
        var id = "custom-" + Date.now();
        customPresets.push({ id: id, name: String(name).trim().substring(0, 24), settings: readCaptionSettings() });
        saveCustomPresets();
        renderCustomPresets();
        setStatus("Custom preset saved: \"" + name + "\" \u2014 click it in the grid to apply anytime.", "ok");
        showToast("Custom preset saved", false);
      });
    });

    captionPresetGrid?.addEventListener("click", function (event) {
      var button = event.target.closest("[data-caption-preset]");
      if (!button) return;
      var customPreset = button.dataset.custom ? findCustomPreset(button.dataset.captionPreset) : null;
      if (customPreset) {
        activeCaptionPreset = button.dataset.captionPreset;
        captionPresetGrid.querySelectorAll("[data-caption-preset]").forEach(function (item) { item.classList.toggle("active", item === button); });
        applyCaptionSettings(customPreset.settings);
        setStatus("Custom preset selected: \"" + customPreset.name + "\". Generate or Update Style when ready.", "ok");
        return;
      }
      var preset = captionStylePresets[button.dataset.captionPreset];
      if (!preset) return;
      activeCaptionPreset = button.dataset.captionPreset;
      captionPresetGrid.querySelectorAll("[data-caption-preset]").forEach(function (item) { item.classList.toggle("active", item === button); });
      chooseLayout(preset.layout);
      captionAnimSelect.value = preset.anim;
      document.getElementById("flexCaptionKaraoke").checked = preset.active;
      document.getElementById("flexCaptionActiveMode").value = preset.mode;
      document.getElementById("flexCaptionActivePop").value = preset.pop;
      document.getElementById("flexCaptionFontSize").value = preset.size;
      document.getElementById("flexCaptionMaxWords").value = preset.max;
      document.getElementById("flexCaptionColor").value = preset.normal;
      document.getElementById("flexCaptionEmphasisColor").value = preset.accent;
      document.getElementById("flexChkShadow").checked = preset.shadow;
      document.getElementById("flexChkBg").checked = preset.bg;
      if (preset.position && document.getElementById("flexCaptionPosition")) document.getElementById("flexCaptionPosition").value = preset.position;
      if (preset.font && banglaFontSelect) { banglaFontSelect.value = preset.font; if (captionFontInput) captionFontInput.value = preset.font; }
      refreshCaptionPreview();
      setStatus("Preset selected: " + String(button.dataset.captionPreset || "style").toUpperCase() + ". Generate or Update Style when ready.", "ok");
    });
    document.getElementById("btnFlexPresetSuggestApply")?.addEventListener("click", function () {
      var banner = document.getElementById("flexPresetSuggest");
      if (!banner) return;
      var presetId = banner.dataset.suggestedPreset;
      var button = captionPresetGrid ? captionPresetGrid.querySelector('[data-caption-preset="' + presetId + '"]') : null;
      if (!button) return;
      button.click();
      banner.hidden = true;
      setStatus("Suggested preset selected: " + (captionStylePresets[presetId] ? presetId.toUpperCase() : presetId) + ".", "ok");
    });
    renderCustomPresets();

    ["flexCaptionAnimType","flexCaptionPosition","flexCaptionFont","flexCaptionFontSize","flexCaptionColor","flexCaptionEmphasisColor","flexCaptionKaraoke","flexCaptionEngine","flexCaptionActiveMode","flexCaptionActivePop","flexChkShadow","flexChkBg","flexCaptionBgColor","flexCaptionBanglaFont"].forEach(function (id) {
      var control = document.getElementById(id);
      if (control) { control.addEventListener("input", refreshCaptionPreview); control.addEventListener("change", refreshCaptionPreview); }
      if ((id === "flexCaptionKaraoke" || id === "flexCaptionEngine") && control) { control.addEventListener("change", updateOutputEstimate); }
    });
    var activeStyleSeg = document.getElementById("flexCaptionActiveStyle");
    function syncCaptionEngineControls() {
      if (!captionEngine || !activeStyleSeg) return;
      var smart = captionEngine.value !== "layers";
      var pill = activeStyleSeg.querySelector('[data-active-style="pill"]');
      if (pill) { pill.textContent = smart ? "Color + Pop" : "Pill"; pill.title = smart ? "Lightweight fill-color and scale emphasis on the current word." : "Per-word layered pill treatment."; }
      var selected = activeStyleSeg.querySelector("[data-active-style].active");
      if (smart && selected && selected.dataset.activeStyle !== "pill") {
        activeStyleSeg.querySelectorAll("[data-active-style]").forEach(function (item) { item.classList.toggle("active", item === pill); });
      }
      activeStyleSeg.querySelectorAll('[data-active-style="underline"],[data-active-style="highlight"]').forEach(function (item) {
        item.disabled = smart;
        item.title = smart ? "Underline and Highlighter require Advanced Layered Words." : "Apply this decoration to the timed active word.";
      });
      updateOutputEstimate();
    }
    if (activeStyleSeg) {
      activeStyleSeg.addEventListener("click", function (event) {
        var button = event.target.closest("[data-active-style]");
        if (!button) return;
        if (button.disabled) { setStatus("Underline and Highlighter need Advanced Layered Words. Smart Active Word uses color and pop on one cue layer.", "error"); return; }
        activeStyleSeg.querySelectorAll("[data-active-style]").forEach(function (item) { item.classList.toggle("active", item === button); });
        try { localStorage.setItem("compxActiveWordStyle", button.dataset.activeStyle); } catch (stylePrefError) { auditFallback("MAIN_ACTIVE_STYLE_PREF_001", stylePrefError); }
        refreshCaptionPreview();
      });
      try {
        var savedStyle = localStorage.getItem("compxActiveWordStyle") || "pill";
        if (savedStyle === "underline" || savedStyle === "highlight") {
          var savedButton = activeStyleSeg.querySelector('[data-active-style="' + savedStyle + '"]');
          if (savedButton) {
            activeStyleSeg.querySelectorAll("[data-active-style]").forEach(function (item) { item.classList.toggle("active", item === savedButton); });
          }
        }
      } catch (stylePrefError) { auditFallback("MAIN_ACTIVE_STYLE_PREF_LOAD_001", stylePrefError); }
    }
    if (captionEngine) {
      try { captionEngine.value = localStorage.getItem("compxCaptionEngine") || "smart"; } catch (engineLoadError) { auditFallback("MAIN_CAPTION_ENGINE_LOAD_001", engineLoadError); }
      captionEngine.addEventListener("change", function () {
        try { localStorage.setItem("compxCaptionEngine", captionEngine.value); } catch (engineSaveError) { auditFallback("MAIN_CAPTION_ENGINE_SAVE_001", engineSaveError); }
        syncCaptionEngineControls();
        setStatus(captionEngine.value === "smart" ? "Smart Active Word selected — one text layer per cue and responsive batch generation." : "Advanced Layered Words selected — intended for short clips and manual per-word control.", "ok");
      });
      syncCaptionEngineControls();
    }

    var captionLanguageSelect = document.getElementById("flexCaptionLanguage");
    var captionModelSelect = document.getElementById("flexCaptionModel");
    var captionGlossaryInput = document.getElementById("flexCaptionGlossary");

    function loadSystemFonts(showResultToast) {
      if (!systemFontList || !systemFontLoadBtn) return;
      systemFontLoadBtn.disabled = true;
      systemFontLoadBtn.textContent = "LOADING…";
      if (systemFontStatus) systemFontStatus.textContent = "Reading fonts available in After Effects…";
      callHost("ae_getSystemFonts()", function(parsed) {
        systemFontLoadBtn.disabled = false;
        systemFontLoadBtn.textContent = "REFRESH FONTS";
        if (!parsed.success || !Array.isArray(parsed.data)) {
          if (systemFontStatus) systemFontStatus.textContent = parsed.message || "Could not read installed fonts.";
          if (showResultToast) showToast(parsed.message || "Could not read installed fonts", true);
          return;
        }
        systemFontByPostScript = {};
        systemFontList.innerHTML = "";
        parsed.data.forEach(function(font) {
          if (!font || !font.postScript) return;
          var family = String(font.family || font.postScript);
          var style = String(font.style || "Regular");
          systemFontByPostScript[font.postScript] = { family:family, style:style };
          var option = document.createElement("option");
          option.value = font.postScript;
          option.label = family + (style && family.toLowerCase().indexOf(style.toLowerCase()) < 0 ? " · " + style : "");
          systemFontList.appendChild(option);
        });
        if (systemFontStatus) systemFontStatus.textContent = parsed.data.length + " font styles ready · type a family, style, or PostScript name.";
        if (showResultToast) showToast(parsed.data.length + " system fonts loaded");
        refreshCaptionPreview();
      }, 30000);
    }
    systemFontLoadBtn?.addEventListener("click", function() { loadSystemFonts(true); });
    if (captionFontInput) {
      try { captionFontInput.value = localStorage.getItem("compxCaptionSystemFont") || captionFontInput.value || ""; } catch (systemFontPrefError) { auditFallback("MAIN_SYSTEM_FONT_PREF_001", systemFontPrefError); }
      captionFontInput.addEventListener("input", function() {
        if (banglaFontSelect && captionFontInput.value !== banglaFontSelect.value) {
          banglaFontSelect.value = "";
          try { localStorage.setItem("compxBanglaCaptionFont", ""); } catch (fontPrefError) { auditFallback("MAIN_SYSTEM_FONT_PREF_002", fontPrefError); }
        }
        try { localStorage.setItem("compxCaptionSystemFont", captionFontInput.value || ""); } catch (systemFontPrefError) { auditFallback("MAIN_SYSTEM_FONT_PREF_003", systemFontPrefError); }
        refreshCaptionPreview();
      });
    }

    function updateBanglaFontStatus() {
      if (!banglaFontStatus || !nodeAvailable) return;
      var localFonts = path.join(nodeProcess.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
      var installed = BANGLA_CAPTION_FONTS.filter(function(font) { return fs.existsSync(path.join(localFonts, font.file)); }).length;
      banglaFontStatus.textContent = installed === BANGLA_CAPTION_FONTS.length ? "Bangla fonts installed. Restart After Effects once if they are not visible yet." : (installed + " / " + BANGLA_CAPTION_FONTS.length + " Bangla fonts installed · live preview is available now.");
      banglaFontStatus.className = "hint " + (installed === BANGLA_CAPTION_FONTS.length ? "ok" : "");
      if (banglaFontInstallBtn) banglaFontInstallBtn.textContent = installed === BANGLA_CAPTION_FONTS.length ? "REINSTALL BANGLA FONTS" : "INSTALL BANGLA FONTS";
    }
    if (banglaFontSelect) {
      try { banglaFontSelect.value = localStorage.getItem("compxBanglaCaptionFont") || ""; } catch (fontPrefError) { auditFallback("MAIN_BANGLA_FONT_PREF_001", fontPrefError); }
      if (banglaFontSelect.value && captionFontInput) captionFontInput.value = banglaFontSelect.value;
      banglaFontSelect.addEventListener("change", function() {
        if (captionFontInput) captionFontInput.value = banglaFontSelect.value;
        try { localStorage.setItem("compxBanglaCaptionFont", banglaFontSelect.value || ""); } catch (fontPrefError) { auditFallback("MAIN_BANGLA_FONT_PREF_002", fontPrefError); }
        try { localStorage.setItem("compxCaptionSystemFont", banglaFontSelect.value || ""); } catch (fontPrefError) { auditFallback("MAIN_BANGLA_FONT_PREF_004", fontPrefError); }
        refreshCaptionPreview();
      });
    }
    banglaFontInstallBtn?.addEventListener("click", function() {
      if (!nodeAvailable) { setStatus("Font installation requires the CEP Node bridge.", "error"); return; }
      showModal({ title:"Install Bangla Caption Fonts?", message:"Installs 8 OFL-licensed fonts for your Windows user only. No admin permission is required. Restart After Effects after installation.", okText:"Install Fonts", cancelText:"Not Now" }).then(function(approved) {
        if (!approved) return;
        try {
          var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
          var sourceRoot = path.join(extensionRoot, "assets", "fonts", "bangla");
          var localFonts = path.join(nodeProcess.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
          fs.mkdirSync(localFonts, { recursive:true });
          BANGLA_CAPTION_FONTS.forEach(function(font) {
            var source = path.join(sourceRoot, font.file), target = path.join(localFonts, font.file);
            if (!fs.existsSync(source)) throw new Error("Bundled font missing: " + font.file);
            fs.copyFileSync(source, target);
            var result = cp.spawnSync("reg.exe", ["ADD", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", font.registry, "/t", "REG_SZ", "/d", target, "/f"], { windowsHide:true, encoding:"utf8" });
            if (result.status !== 0) throw new Error(result.stderr || ("Could not register " + font.file));
          });
          updateBanglaFontStatus();
          showToast("Bangla fonts installed. Restart After Effects once.");
        } catch (fontInstallError) { reportError("BANGLA_FONT_INSTALL", fontInstallError, "Bangla font installation failed"); }
      });
    });
    updateBanglaFontStatus();
    loadSystemFonts(false);
    try { if (captionGlossaryInput) captionGlossaryInput.value = localStorage.getItem("compxCaptionGlossary") || ""; } catch (glossaryLoadError) { auditFallback("MAIN_FLEXCAPTION_GLOSSARY_LOAD_001", glossaryLoadError); }
    captionGlossaryInput?.addEventListener("change", function () {
      try { localStorage.setItem("compxCaptionGlossary", captionGlossaryInput.value || ""); } catch (glossarySaveError) { auditFallback("MAIN_FLEXCAPTION_GLOSSARY_SAVE_001", glossarySaveError); }
    });
    captionLanguageSelect?.addEventListener("change", function () {
      if (captionLanguageSelect.value === "bn" && captionModelSelect) {
        captionModelSelect.value = "large-v3";
        if (banglaFontSelect && !banglaFontSelect.value) { banglaFontSelect.value = "HindSiliguriRegular"; if (captionFontInput) captionFontInput.value = banglaFontSelect.value; try { localStorage.setItem("compxBanglaCaptionFont", banglaFontSelect.value); } catch (fontPrefError) { auditFallback("MAIN_BANGLA_FONT_PREF_003", fontPrefError); } }
        setStatus("Accurate Large V3 selected for the best available local Bangla accuracy.", "ok");
      }
      refreshCaptionPreview();
    });
    if (captionLanguageSelect && captionLanguageSelect.value === "bn" && captionModelSelect) {
      captionModelSelect.value = "large-v3";
      if (banglaFontSelect && !banglaFontSelect.value) { banglaFontSelect.value = "HindSiliguriRegular"; if (captionFontInput) captionFontInput.value = banglaFontSelect.value; }
    }

    function setStatus(message, kind) {
      if (status) {
        status.textContent = message;
        status.className = "hint " + (kind || "");
      }
      // Caption Studio's Simple workflow is a separate view over this same
      // local runtime. Send state explicitly instead of making that view
      // inspect/click hidden Advanced controls.
      try {
        document.dispatchEvent(new CustomEvent("compx:caption-transcription-status", {
          detail: { message: String(message || ""), kind: String(kind || ""), busy: !!runtimeBusy }
        }));
      } catch (statusEventError) { auditFallback("MAIN_CAPTION_STATUS_EVENT_001", statusEventError); }
    }

    function readPanelFile(file) {
      if (fs && file && file.path) return fs.promises.readFile(file.path, "utf8");
      if (file && typeof file.text === "function") return file.text();
      return Promise.reject(new Error("This CEP runtime cannot read the selected file."));
    }

    function refreshImportState() {
      var cues = parseFlexSRT(editor ? editor.value : "");
      if (createBtn) createBtn.disabled = cues.length === 0;
      var countEl = document.getElementById("flexCaptionEditorCount");
      if (countEl && editor) {
        countEl.textContent = editor.value.length + " characters • " + cues.length + " lines" + (lastFlexSrtIssues.length ? " • " + lastFlexSrtIssues.length + " timing/format issue(s)" : " • timing OK");
        countEl.classList.toggle("has-issues", lastFlexSrtIssues.length > 0);
      }
      refreshCaptionStageAvailability(cues.length);
      refreshCaptionPreview();
      return cues;
    }

    // ---- Timed cue-list editor (renders SRT as editable rows) ----
    function fmtCueTime(seconds) {
      seconds = Math.max(0, Number(seconds) || 0);
      var mins = Math.floor(seconds / 60);
      var secs = Math.floor(seconds - mins * 60);
      var ms = Math.round((seconds - mins * 60 - secs) * 1000);
      if (ms === 1000) { ms = 0; secs += 1; }
      if (secs === 60) { secs = 0; mins += 1; }
      function pad(value, width) { var s = String(value); while (s.length < width) s = "0" + s; return s; }
      return pad(mins, 2) + ":" + pad(secs, 2) + "." + pad(ms, 3);
    }
    function parseCueTime(str) {
      var t = String(str || "").trim().replace(",", ".");
      if (!t) return null;
      var parts = t.split(":");
      var value;
      if (parts.length === 3) value = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
      else if (parts.length === 2) value = Number(parts[0]) * 60 + Number(parts[1]);
      else value = parseFloat(t);
      return isFinite(value) ? value : null;
    }
    function renderCueList() {
      var list = document.getElementById("flexCueList");
      if (!list || !editor) return;
      cueRows = parseFlexSRT(editor.value);
      list.innerHTML = "";
      if (!cueRows.length) {
        var empty = document.createElement("div");
        empty.className = "cx-cue-empty";
        empty.textContent = "No captions yet — transcribe or load an SRT.";
        list.appendChild(empty);
        updateOutputEstimate();
        return;
      }
      if (selectedCueIndex >= cueRows.length) selectedCueIndex = cueRows.length - 1;
      cueRows.forEach(function (cue, index) { list.appendChild(buildCueRow(cue, index)); });
      updateOutputEstimate();
    }
    function updateOutputEstimate() {
      var hint = document.getElementById("flexCaptionOutputHint");
      if (!hint) return;
      var cues = parseFlexSRT(editor ? editor.value : "");
      var words = 0;
      cues.forEach(function (cue) { words += String(cue.text || "").split(/\s+/).filter(Boolean).length; });
      var karaokeOn = (document.getElementById("flexCaptionKaraoke") || {}).checked;
      var engine = captionEngine ? captionEngine.value : "smart";
      var activeOutputBtn = outputSeg ? outputSeg.querySelector("[data-caption-output].active") : null;
      var inPrecomp = activeOutputBtn ? activeOutputBtn.dataset.captionOutput === "precomp" : true;
      if (!cues.length) { hint.textContent = "Load an SRT or transcribe — then Generate."; return; }
      var layers = karaokeOn && engine === "layers" ? words : cues.length;
      if (inPrecomp) {
        hint.textContent = karaokeOn && engine === "layers"
          ? "Heavy: ≈ " + words + " word layers inside 1 precomp. Best for short clips only."
          : "Responsive: " + cues.length + " cue layer" + (cues.length === 1 ? "" : "s") + " inside 1 precomp" + (karaokeOn ? " · Active Word uses one Text Animator per cue." : ".");
      } else {
        hint.textContent = "≈ " + layers + " layer" + (layers === 1 ? "" : "s") + " directly in the timeline" + (karaokeOn && engine === "smart" ? " · Smart Active Word." : ".") + " Use 1 Precomp for a clean timeline.";
      }
    }
    function commitCues(cues) {
      if (editor) editor.value = formatFlexSRT(cues);
      refreshImportState();
      renderCueList();
    }
    function buildCueRow(cue, index) {
      var row = document.createElement("div");
      row.className = "cx-cue-row" + (index === selectedCueIndex ? " selected" : "");
      if (index > 0 && (cue.start <= cueRows[index - 1].start || cue.start < cueRows[index - 1].end)) row.classList.add("timing-warning");
      row.dataset.cueIndex = String(index);
      var num = document.createElement("span");
      num.className = "cx-cue-num";
      num.textContent = String(index + 1);
      var times = document.createElement("span");
      times.className = "cx-cue-times";
      function makeTimeSpan(value, title) {
        var span = document.createElement("span");
        span.className = "cx-cue-time";
        span.contentEditable = "true";
        span.spellcheck = false;
        span.textContent = value;
        span.title = title;
        return span;
      }
      var startSpan = makeTimeSpan(fmtCueTime(cue.start), "Start time — MM:SS.mmm");
      var dash = document.createElement("span");
      dash.className = "cx-cue-times-dash";
      dash.textContent = "–";
      var endSpan = makeTimeSpan(fmtCueTime(cue.end), "End time — MM:SS.mmm");
      times.appendChild(startSpan);
      times.appendChild(dash);
      times.appendChild(endSpan);
      var text = document.createElement("div");
      text.className = "cx-cue-text";
      text.contentEditable = "true";
      text.spellcheck = true;
      text.textContent = String(cue.text || "");
      text.title = "Click to edit — preview shows this line";
      var actions = document.createElement("span");
      actions.className = "cx-cue-actions";
      function cueBtn(label, title, cls) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.className = cls || "";
        b.dataset.obs = "1";
        return b;
      }
      var upBtn = cueBtn("↑", "Move line up", "cx-cue-move");
      var downBtn = cueBtn("↓", "Move line down", "cx-cue-move");
      var delBtn = cueBtn("✕", "Delete line", "cx-cue-del");
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(delBtn);
      row.appendChild(num);
      row.appendChild(times);
      row.appendChild(text);
      row.appendChild(actions);

      row.addEventListener("click", function (event) {
        if (event.target.closest("input,button,.cx-cue-text,.cx-cue-time")) return;
        selectedCueIndex = index;
        refreshCaptionPreview();
        renderCueList();
      });

      text.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); text.blur(); }
      });
      text.addEventListener("input", function () {
        rowTextEditing = true;
        try {
          if (cueRows[index]) cueRows[index].text = text.textContent;
          if (editor) editor.value = formatFlexSRT(cueRows);
          // A same-length rewrite can still replace/reorder words. Discard the
          // cached Whisper timing for this cue instead of applying stale timing.
          if (lastWordTimings) lastWordTimings[index] = null;
          refreshImportState();
        } finally { rowTextEditing = false; }
      });

      function wireTime(span, isStart) {
        var commit = function () {
          if (!cueRows[index]) return;
          var v = parseCueTime(span.textContent);
          if (v === null) { span.textContent = fmtCueTime(cueRows[index][isStart ? "start" : "end"]); return; }
          if (isStart) {
            cueRows[index].start = Math.max(0, v);
            if (cueRows[index].end <= cueRows[index].start) cueRows[index].end = cueRows[index].start + 0.5;
          } else {
            cueRows[index].end = Math.max(cueRows[index].start + 0.1, v);
          }
          // Manual cue boundaries must win over cached absolute word timings.
          if (lastWordTimings) lastWordTimings[index] = null;
          commitCues(cueRows);
        };
        span.addEventListener("blur", commit);
        span.addEventListener("keydown", function (event) {
          if (event.key === "Enter") { event.preventDefault(); span.blur(); }
        });
      }
      wireTime(startSpan, true);
      wireTime(endSpan, false);

      upBtn.addEventListener("click", function () {
        if (index < 1) return;
        var arr = cueRows.slice();
        var tmp = arr[index - 1]; arr[index - 1] = arr[index]; arr[index] = tmp;
        if (lastWordTimings && lastWordTimings.length) {
          var timingTmp = lastWordTimings[index - 1]; lastWordTimings[index - 1] = lastWordTimings[index]; lastWordTimings[index] = timingTmp;
        }
        selectedCueIndex = index - 1;
        commitCues(arr);
      });
      downBtn.addEventListener("click", function () {
        if (index >= cueRows.length - 1) return;
        var arr = cueRows.slice();
        var tmp = arr[index + 1]; arr[index + 1] = arr[index]; arr[index] = tmp;
        if (lastWordTimings && lastWordTimings.length) {
          var timingTmp = lastWordTimings[index + 1]; lastWordTimings[index + 1] = lastWordTimings[index]; lastWordTimings[index] = timingTmp;
        }
        selectedCueIndex = index + 1;
        commitCues(arr);
      });
      delBtn.addEventListener("click", function () {
        var arr = cueRows.slice();
        arr.splice(index, 1);
        if (lastWordTimings && lastWordTimings.length) lastWordTimings.splice(index, 1);
        if (selectedCueIndex >= arr.length) selectedCueIndex = arr.length - 1;
        commitCues(arr);
      });
      return row;
    }

    document.getElementById("btnFlexFixTiming")?.addEventListener("click", function () {
      var current = parseFlexSRT(editor ? editor.value : "");
      if (!current.length) { setStatus("No valid caption timing to repair.", "error"); return; }
      var issueCount = lastFlexSrtIssues.length;
      var formatIssues = lastFlexSrtIssues.filter(function (issue) {
        return issue.indexOf("overlaps the previous cue") < 0 && issue.indexOf("out of chronological order") < 0;
      });
      if (formatIssues.length) {
        setStatus("Fix " + formatIssues.length + " invalid SRT block(s) in Raw SRT first; timing repair will not delete malformed captions.", "error");
        return;
      }
      var repaired = normalizeFlexCueBoundaries(current);
      lastWordTimings = [];
      if (editor) editor.value = formatFlexSRT(repaired);
      refreshImportState();
      renderCueList();
      setStatus(issueCount ? ("Timing repaired: " + issueCount + " issue(s) fixed and cues sorted.") : "Caption timing is already clean.", "ok");
    });

    document.getElementById("btnFlexMediaPick")?.addEventListener("click", function () {
      if (!mediaInput) return;
      // Clearing the picker lets a customer choose the same edited/replaced
      // media file again; Chromium otherwise suppresses the change event.
      mediaInput.value = "";
      mediaInput.click();
    });
    mediaInput?.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      mediaPath = file.path || "";
      var hint = document.getElementById("flexMediaHint");
      if (hint) hint.textContent = file.name || mediaPath;
      var fileRow = document.getElementById("flexMediaFileRow");
      if (fileRow) fileRow.hidden = false;
      setStatus(mediaPath ? "Media ready for local transcription." : "CEP did not expose this media path.", mediaPath ? "ok" : "error");
      try {
        document.dispatchEvent(new CustomEvent("compx:caption-media-ready", {
          detail: { ready: !!mediaPath, name: file.name || mediaPath || "Media selected" }
        }));
      } catch (mediaEventError) { auditFallback("MAIN_CAPTION_MEDIA_EVENT_001", mediaEventError); }
      if (mediaPath) {
        probeMediaDuration(mediaPath).then(function (duration) {
          var suggest = suggestPresetForDuration(duration);
          var banner = document.getElementById("flexPresetSuggest");
          var text = document.getElementById("flexPresetSuggestText");
          if (!banner || !text) return;
          if (!suggest) { banner.hidden = true; return; }
          var label = document.getElementById("flexPresetSuggestDuration");
          var durationText = formatClockDuration(duration);
          text.textContent = durationText + " video \u2192 " + suggest.label + " suggested for your " + suggest.reason + ".";
          banner.dataset.suggestedPreset = suggest.preset;
          banner.hidden = false;
        });
      }
    });

    function formatClockDuration(seconds) {
      var s = Math.round(Number(seconds) || 0);
      var mins = Math.floor(s / 60), secs = s % 60;
      if (mins >= 60) { var h = Math.floor(mins / 60); mins = mins % 60; return h + ":" + (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs; }
      return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    document.getElementById("btnFlexMediaClear")?.addEventListener("click", function () {
      mediaPath = "";
      if (mediaInput) mediaInput.value = "";
      var fileRow = document.getElementById("flexMediaFileRow");
      if (fileRow) fileRow.hidden = true;
      var hint = document.getElementById("flexMediaHint");
      if (hint) hint.textContent = "No media selected";
      setStatus("Media removed. Choose a file to transcribe.", "");
    });

    ["flexCaptionSpeed", "flexCaptionIntensity", "flexCaptionKeywordGlow"].forEach(function (id) {
      var control = document.getElementById(id);
      if (!control) return;
      var refreshValue = function () {
        var val = Number(control.value) || 0;
        var max = Number(control.max) || 100;
        var pct = id === "flexCaptionSpeed" ? Math.round(val / max * 100) : Math.round(val);
        var label = document.getElementById(id === "flexCaptionSpeed" ? "flexCaptionSpeedVal" : (id === "flexCaptionIntensity" ? "flexCaptionIntensityVal" : "flexCaptionKeywordGlowVal"));
        if (label) label.textContent = pct + "%";
      };
      control.addEventListener("input", refreshValue);
      refreshValue();
    });
    var keywordScaleControl = document.getElementById("flexCaptionKeywordScale");
    if (keywordScaleControl) {
      var refreshKeywordScale = function () {
        var val = Math.max(100, Math.min(300, Number(keywordScaleControl.value) || 135));
        var label = document.getElementById("flexCaptionKeywordScaleVal");
        if (label) label.textContent = (val / 100).toFixed(2).replace(/\.?0+$/, "") + "x";
        refreshCaptionPreview();
      };
      keywordScaleControl.addEventListener("input", function () { try { localStorage.setItem("compxKeywordScale", keywordScaleControl.value); } catch (scalePrefError) { auditFallback("MAIN_KEYWORD_SCALE_PREF_001", scalePrefError); } refreshKeywordScale(); });
      try {
        var savedScale = Number(localStorage.getItem("compxKeywordScale")) || 135;
        keywordScaleControl.value = Math.max(100, Math.min(300, savedScale));
      } catch (scalePrefError) { auditFallback("MAIN_KEYWORD_SCALE_PREF_002", scalePrefError); }
      refreshKeywordScale();
    }
    var keywordGlowControl = document.getElementById("flexCaptionKeywordGlow");
    if (keywordGlowControl) {
      keywordGlowControl.addEventListener("input", function () { try { localStorage.setItem("compxKeywordGlow", keywordGlowControl.value); } catch (glowPrefError) { auditFallback("MAIN_KEYWORD_GLOW_PREF_001", glowPrefError); } refreshCaptionPreview(); });
      try {
        var savedGlow = Number(localStorage.getItem("compxKeywordGlow")) || 40;
        keywordGlowControl.value = Math.max(0, Math.min(100, savedGlow));
        var glowVal = document.getElementById("flexCaptionKeywordGlowVal");
        if (glowVal) glowVal.textContent = Math.round(savedGlow) + "%";
      } catch (glowPrefError) { auditFallback("MAIN_KEYWORD_GLOW_PREF_002", glowPrefError); }
    }

    document.getElementById("btnFlexAddSwatch")?.addEventListener("click", function () {
      var color = document.getElementById("flexCaptionEmphasisColor");
      if (color) color.click();
    });

    var CLEANUP_PREF_KEY = "compxCaptionCleanup";
    function saveCleanupPrefs() {
      try {
        var activeWords = document.querySelector("#flexCleanWordsSeg [data-clean-words].active");
        localStorage.setItem(CLEANUP_PREF_KEY, JSON.stringify({
          filler: document.getElementById("flexCleanFiller") ? document.getElementById("flexCleanFiller").checked : true,
          punct: document.getElementById("flexCleanPunct") ? document.getElementById("flexCleanPunct").checked : true,
          linebreak: document.getElementById("flexCleanLinebreak") ? document.getElementById("flexCleanLinebreak").checked : true,
          maxWords: activeWords ? Number(activeWords.dataset.cleanWords) || 3 : 3
        }));
      } catch (cleanupPrefError) { auditFallback("MAIN_CLEANUP_PREF_SAVE_001", cleanupPrefError); }
    }
    function restoreCleanupPrefs() {
      try {
        var saved = JSON.parse(localStorage.getItem(CLEANUP_PREF_KEY) || "null");
        if (!saved || typeof saved !== "object") return;
        if (typeof saved.filler === "boolean" && document.getElementById("flexCleanFiller")) document.getElementById("flexCleanFiller").checked = saved.filler;
        if (typeof saved.punct === "boolean" && document.getElementById("flexCleanPunct")) document.getElementById("flexCleanPunct").checked = saved.punct;
        if (typeof saved.linebreak === "boolean" && document.getElementById("flexCleanLinebreak")) document.getElementById("flexCleanLinebreak").checked = saved.linebreak;
        var words = Math.max(3, Math.min(7, Number(saved.maxWords) || 3));
        if (cleanWordsSeg) {
          var segButton = cleanWordsSeg.querySelector('[data-clean-words="' + words + '"]');
          if (segButton) {
            cleanWordsSeg.querySelectorAll("[data-clean-words]").forEach(function (item) { item.classList.toggle("active", item === segButton); });
            var maxWordsInput = document.getElementById("flexCaptionMaxWords");
            if (maxWordsInput) maxWordsInput.value = String(words);
          }
        }
      } catch (cleanupPrefError) { auditFallback("MAIN_CLEANUP_PREF_LOAD_001", cleanupPrefError); }
    }

    var cleanWordsSeg = document.getElementById("flexCleanWordsSeg");
    if (cleanWordsSeg) cleanWordsSeg.addEventListener("click", function (event) {
      var button = event.target.closest("[data-clean-words]");
      if (!button) return;
      cleanWordsSeg.querySelectorAll("[data-clean-words]").forEach(function (item) { item.classList.toggle("active", item === button); });
      var maxWordsInput = document.getElementById("flexCaptionMaxWords");
      if (maxWordsInput) maxWordsInput.value = button.dataset.cleanWords;
      saveCleanupPrefs();
    });
    ["flexCleanFiller", "flexCleanPunct", "flexCleanLinebreak"].forEach(function (id) {
      var control = document.getElementById(id);
      if (control) control.addEventListener("change", saveCleanupPrefs);
    });
    restoreCleanupPrefs();

    // ---- Highlight rules (ZH-style auto-highlight): word → pops in captions ----
    var RULES_PREF_KEY = "compxHighlightRules";
    var POWER_WORDS = ["free","sale","discount","offer","bonus","new","now","today","limited","guaranteed","guarantee","best","price","order","buy","save","instant","exclusive","urgent","important","amazing","ফ্রি","অফার","ডিসকাউন্ট","নতুন","সেরা","দাম","অর্ডার","এখনই","বোনাস","গ্যারান্টি","জরুরি","বিক্রি","ছাড়","লাভ","আসল","বিশেষ","সীমিত"];
    var flexRuleWordInput = document.getElementById("flexRuleWord");
    var flexRuleList = document.getElementById("flexRuleList");
    var flexRuleSwatches = document.getElementById("flexRuleSwatches");
    var selectedRuleColor = "#7b61ff";

    function loadFlexRules() {
      try { return JSON.parse(localStorage.getItem(RULES_PREF_KEY) || "[]") || []; } catch (ruleLoadError) { return []; }
    }
    function saveFlexRules(rules) {
      try { localStorage.setItem(RULES_PREF_KEY, JSON.stringify(rules)); } catch (ruleSaveError) { auditFallback("MAIN_RULES_SAVE_001", ruleSaveError); }
      renderFlexRules();
    }
    function renderFlexRules() {
      if (!flexRuleList) return;
      var rules = loadFlexRules();
      flexRuleList.innerHTML = "";
      if (!rules.length) { flexRuleList.innerHTML = "<span class='hint' style='margin:0'>No rules yet \u2014 add a word like \"free\" or \"অফার\" to always highlight it.</span>"; return; }
      rules.forEach(function (rule, index) {
        var chip = document.createElement("span");
        chip.className = "cx-cap-rule-chip";
        var dot = document.createElement("span");
        dot.className = "cx-cap-rule-dot";
        dot.style.background = rule.color || "#7b61ff";
        var label = document.createElement("span");
        label.textContent = rule.word;
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "✕";
        remove.title = "Remove rule";
        remove.addEventListener("click", function () {
          var rulesNow = loadFlexRules();
          rulesNow.splice(index, 1);
          saveFlexRules(rulesNow);
          setStatus("Rule removed.", "ok");
        });
        chip.appendChild(dot);
        chip.appendChild(label);
        chip.appendChild(remove);
        flexRuleList.appendChild(chip);
      });
    }
    if (flexRuleSwatches) flexRuleSwatches.addEventListener("click", function (event) {
      var button = event.target.closest("[data-rule-color]");
      if (!button) return;
      flexRuleSwatches.querySelectorAll("[data-rule-color]").forEach(function (item) { item.classList.toggle("active", item === button); });
      selectedRuleColor = button.dataset.ruleColor;
      // Show the chosen rule colour as the active-word colour so wrapped keywords render in it.
      var emphasisInput = document.getElementById("flexCaptionEmphasisColor");
      if (emphasisInput) { emphasisInput.value = selectedRuleColor; refreshCaptionPreview(); }
    });
    document.getElementById("btnFlexRuleAdd")?.addEventListener("click", function () {
      var word = flexRuleWordInput ? String(flexRuleWordInput.value || "").trim() : "";
      if (!word) { setStatus("Type a word to add as a highlight rule.", "error"); if (flexRuleWordInput) flexRuleWordInput.focus(); return; }
      var rules = loadFlexRules();
      var exists = rules.some(function (r) { return r.word.toLowerCase() === word.toLowerCase(); });
      if (exists) { setStatus("\"" + word + "\" is already a rule.", "error"); return; }
      rules.push({ word: word, color: selectedRuleColor });
      saveFlexRules(rules);
      if (flexRuleWordInput) flexRuleWordInput.value = "";
      setStatus("Rule added: \"" + word + "\" \u2014 use Apply Rules to highlight it in the captions.", "ok");
    });
    document.getElementById("btnFlexAutoEmphasis")?.addEventListener("click", function () {
      var cues = parseFlexSRT(editor ? editor.value : "");
      var rules = loadFlexRules();
      var existing = {};
      rules.forEach(function (r) { existing[r.word.toLowerCase()] = true; });
      var added = 0;
      var counts = {};
      cues.forEach(function (cue) {
        String(cue.text || "").split(/\s+/).forEach(function (tok) {
          var base = String(tok).replace(/^\*+|\*+$|[^\u0980-\u09FFA-Za-z0-9]+$/g, "").toLowerCase();
          if (base && POWER_WORDS.indexOf(base) >= 0) counts[base] = (counts[base] || 0) + 1;
        });
      });
      Object.keys(counts).forEach(function (word) {
        if (!existing[word] && counts[word] >= 1) { rules.push({ word: word, color: "#ffe600" }); existing[word] = true; added++; }
      });
      if (added) {
        saveFlexRules(rules);
        setStatus("⚡ Auto-Emphasis: " + added + " power word" + (added === 1 ? "" : "s") + " added as rules (\"free\", \"অফার\"…). Now Apply Rules to Captions.", "ok");
        showToast("Auto-Emphasis added " + added + " rule" + (added === 1 ? "" : "s"), false);
      } else {
        setStatus("No new power words found \u2014 transcript may already be clean or fully ruled.", "ok");
      }
    });
    function applyFlexRulesToText(text, rules) {
      return String(text || "").split(/(\s+)/).map(function (tok) {
        if (!tok || /^\s+$/.test(tok)) return tok;
        var stripped = String(tok).replace(/^\*+|\*+$/g, "");
        var punct = "";
        var m = stripped.match(/^([^,.;:!?…\"'”“’]+)([,.;:!?…\"'”“’]+)?$/);
        if (m && m[1]) { punct = m[2] || ""; stripped = m[1]; }
        if (!stripped) return tok;
        for (var i = 0; i < rules.length; i++) {
          if (stripped.toLowerCase() === String(rules[i].word).toLowerCase()) {
            return "*" + stripped + "*" + punct;
          }
        }
        return tok;
      }).join("");
    }
    document.getElementById("btnFlexRulesApply")?.addEventListener("click", function () {
      var rules = loadFlexRules();
      if (!rules.length) { setStatus("Add at least one highlight rule first.", "error"); return; }
      var cues = parseFlexSRT(editor ? editor.value : "");
      if (!cues.length) { setStatus("Load or transcribe captions first.", "error"); return; }
      var hits = 0;
      cues.forEach(function (cue) {
        var before = String(cue.text || "");
        var after = applyFlexRulesToText(before, rules);
        if (after !== before) { cue.text = after; hits++; }
      });
      if (!hits) { setStatus("None of the rule words were found in the captions.", "ok"); return; }
      commitCues(cues);
      setStatus("Applied " + rules.length + " rule" + (rules.length === 1 ? "" : "s") + " to " + hits + " caption line" + (hits === 1 ? "" : "s") + " \u2014 keywords wrapped in *stars*.", "ok");
      showToast("Highlight rules applied", false);
      refreshCaptionPreview();
    });
    document.getElementById("btnFlexChapterMarkers")?.addEventListener("click", function () {
      var cues = parseFlexSRT(editor ? editor.value : "");
      if (cues.length < 2) { setStatus("Need at least 2 caption lines to find chapter pauses.", "error"); return; }
      var markers = [], minGap = 2.5;
      for (var ci = 0; ci < cues.length - 1; ci++) {
        var gap = (cues[ci + 1].start || 0) - (cues[ci].end || 0);
        if (gap >= minGap) {
          var label = String(cues[ci + 1].text || "").replace(/\*+/g, "").split(/\s+/).slice(0, 5).join(" ");
          markers.push({ time: Number((cues[ci + 1].start || 0).toFixed(3)), label: label || ("Chapter " + (markers.length + 1)) });
        }
      }
      if (!markers.length) { setStatus("No long pauses (≥" + minGap + "s) found between captions \u2014 no chapters to mark.", "ok"); return; }
      runTool("ae_addChapterMarkers(" + hostArg(JSON.stringify(markers)) + ")", markers.length + " chapter marker(s) added to the composition");
    });
    renderFlexRules();

    var ENHANCE_PREF_KEY = "compxVoiceEnhance";
    var enhanceCheck = document.getElementById("flexCaptionVoiceEnhance");
    var enhanceRow = document.getElementById("flexEnhanceRow");
    var enhanceSeg = document.getElementById("flexEnhanceSeg");
    function readVoiceEnhancePref() {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(ENHANCE_PREF_KEY) || "null"); } catch (enhancePrefError) { saved = null; }
      if (!saved || typeof saved !== "object") saved = {};
      return {
        checked: typeof saved.checked === "boolean" ? saved.checked : false,
        strength: saved.strength === "light" || saved.strength === "strong" ? saved.strength : "medium"
      };
    }
    function saveVoiceEnhancePref() {
      try {
        var activeButton = enhanceSeg ? enhanceSeg.querySelector("[data-enhance-strength].active") : null;
        localStorage.setItem(ENHANCE_PREF_KEY, JSON.stringify({
          checked: !!(enhanceCheck && enhanceCheck.checked),
          strength: activeButton ? activeButton.dataset.enhanceStrength : "medium"
        }));
      } catch (enhancePrefError) { auditFallback("MAIN_ENHANCE_PREF_SAVE_001", enhancePrefError); }
    }
    function applyVoiceEnhancePref(saved) {
      if (enhanceCheck) enhanceCheck.checked = !!saved.checked;
      if (enhanceRow) enhanceRow.hidden = !saved.checked;
      if (enhanceSeg) {
        enhanceSeg.querySelectorAll("[data-enhance-strength]").forEach(function (button) {
          button.classList.toggle("active", button.dataset.enhanceStrength === saved.strength);
        });
      }
    }
    if (enhanceCheck) enhanceCheck.addEventListener("change", function () {
      if (enhanceRow) enhanceRow.hidden = !enhanceCheck.checked;
      saveVoiceEnhancePref();
    });
    if (enhanceSeg) enhanceSeg.addEventListener("click", function (event) {
      var button = event.target.closest("[data-enhance-strength]");
      if (!button) return;
      enhanceSeg.querySelectorAll("[data-enhance-strength]").forEach(function (item) { item.classList.toggle("active", item === button); });
      saveVoiceEnhancePref();
    });
    applyVoiceEnhancePref(readVoiceEnhancePref());

    document.getElementById("btnFlexCleanNow")?.addEventListener("click", function () {
      var current = refreshImportState();
      if (!current.length) { setStatus("No captions to clean yet — transcribe or load an SRT first.", "error"); return; }
      var cleaned = applyFlexCleanup(current, lastWordTimings, readCleanupOptions());
      if (!cleaned.cues.length) { setStatus("Cleaning removed every caption — adjust the cleanup options.", "error"); return; }
      if (editor) editor.value = formatFlexSRT(cleaned.cues);
      lastWordTimings = cleaned.timings;
      var count = refreshImportState().length;
      renderCueList();
      setStatus("Transcript cleaned: " + count + " cue(s). Ready to generate captions.", "ok");
    });

    document.getElementById("btnFlexSrtPick")?.addEventListener("click", function () { if (srtInput) srtInput.click(); });
    srtInput?.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      readPanelFile(file).then(function (text) {
        lastWordTimings = [];
        if (editor) editor.value = text;
        var count = refreshImportState().length;
        var issueCount = lastFlexSrtIssues.length;
        renderCueList();
        if (count) setCaptionStage("edit");
        setStatus(count
          ? ("Loaded " + count + " caption cue(s)." + (issueCount ? " Skipped/warned about " + issueCount + " SRT issue(s)." : ""))
          : "No valid SRT cues found.", count && !issueCount ? "ok" : "error");
      }).catch(function (error) { setStatus("SRT read failed: " + error.message, "error"); });
      // Let the same file be selected again after it is edited on disk.
      event.target.value = "";
    });

    editor?.addEventListener("input", function () {
      // Raw SRT edits can change cue order, boundaries and words at once.
      lastWordTimings = [];
      refreshImportState();
      if (!rowTextEditing) renderCueList();
    });
    document.getElementById("btnCueAdd")?.addEventListener("click", function () {
      var cues = cueRows.length ? cueRows.slice() : parseFlexSRT(editor ? editor.value : "");
      var last = cues.length ? cues[cues.length - 1] : null;
      var start = last ? last.end + 0.5 : 0;
      cues.push({ start: start, end: start + 2, text: "" });
      if (lastWordTimings) lastWordTimings.push(null);
      selectedCueIndex = cues.length - 1;
      commitCues(cues);
      var rows = document.querySelectorAll("#flexCueList .cx-cue-row");
      var row = rows[rows.length - 1];
      var textEl = row && row.querySelector(".cx-cue-text");
      if (textEl) textEl.focus();
    });
    document.getElementById("btnCueRaw")?.addEventListener("click", function () {
      if (!editor) return;
      var rawBtn = document.getElementById("btnCueRaw");
      var showing = !editor.hidden;
      editor.hidden = showing;
      if (rawBtn) rawBtn.textContent = showing ? "📋 Raw SRT" : "✓ Done";
      if (!showing) editor.focus();
    });
    layoutGrid?.addEventListener("click", function (event) {
      var button = event.target.closest("[data-flex-layout]");
      if (!button) return;
      layoutGrid.querySelectorAll("[data-flex-layout]").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      refreshCaptionPreview();
    });
    if (outputSeg) {
      outputSeg.addEventListener("click", function (event) {
        var button = event.target.closest("[data-caption-output]");
        if (!button) return;
        outputSeg.querySelectorAll("[data-caption-output]").forEach(function (item) { item.classList.remove("active"); });
        button.classList.add("active");
        try { localStorage.setItem("compxCaptionOutput", button.dataset.captionOutput); } catch (outputPrefError) { auditFallback("MAIN_CAPTION_OUTPUT_PREF_001", outputPrefError); }
        updateOutputEstimate();
      });
      try {
        var savedOutput = localStorage.getItem("compxCaptionOutput") || "precomp";
        var savedOutputButton = outputSeg.querySelector('[data-caption-output="' + savedOutput + '"]');
        if (savedOutputButton) {
          outputSeg.querySelectorAll("[data-caption-output]").forEach(function (item) { item.classList.toggle("active", item === savedOutputButton); });
        }
      } catch (outputPrefError) { auditFallback("MAIN_CAPTION_OUTPUT_PREF_LOAD_001", outputPrefError); }
    }

    renderCueList();
    refreshCaptionPreview();
    refreshCaptionStageAvailability(parseFlexSRT(editor ? editor.value : "").length);
    setCaptionStage("source");

    transcribeBtn?.addEventListener("click", requestFlexTranscription);
    // Public bridge used by the Simple Source -> Style -> Export workflow.
    // This avoids programmatically clicking a hidden Advanced button whose
    // disabled state previously made Simple Transcribe appear unresponsive.
    window.CompXCaptionTranscriber = {
      chooseMedia: function () {
        if (!mediaInput) return false;
        mediaInput.value = "";
        mediaInput.click();
        return true;
      },
      hasMedia: function () { return !!mediaPath; },
      isBusy: function () { return !!runtimeBusy; },
      start: function (options) {
        options = options || {};
        var modelControl = document.getElementById("flexCaptionModel");
        var languageControl = document.getElementById("flexCaptionLanguage");
        if (modelControl && options.model !== undefined) modelControl.value = String(options.model || "base");
        if (languageControl && options.language !== undefined) languageControl.value = String(options.language || "");
        return requestFlexTranscription();
      }
    };
    runtimeAllowBtn?.addEventListener("click", function () {
      if (!pendingRuntimeRequest || runtimeBusy) return;
      runtimeBusy = true;
      runtimeAllowBtn.disabled = true;
      runtimeCancelBtn.disabled = true;
      ensurePrivateCaptionRuntime(pendingRuntimeRequest.spec, pendingRuntimeRequest.model).then(function (runtime) {
        var request = pendingRuntimeRequest;
        pendingRuntimeRequest = null;
        hideRuntimeConsent();
        return transcribeWithPrivateRuntime(runtime, request.language, request.fillGaps, request.enhance, request.glossary);
      }).catch(function (error) {
        setStatus("AutoCaptions failed: " + error.message, "error");
      }).then(function () {
        runtimeBusy = false;
        runtimeAllowBtn.disabled = false;
        runtimeCancelBtn.disabled = false;
      });
    });
    runtimeCancelBtn?.addEventListener("click", function () {
      if (runtimeBusy) return;
      pendingRuntimeRequest = null;
      hideRuntimeConsent();
      setStatus("AutoCaptions download cancelled. Existing SRT import is still available.", "");
    });

    function requestFlexTranscription() {
      if (!nodeAvailable) { setStatus("CEP Node is unavailable; load an existing SRT instead.", "error"); return { started:false, failed:true }; }
      if (!mediaPath) { setStatus("Choose an audio or video file first.", "error"); return { started:false, failed:true }; }
      if (runtimeBusy) {
        setStatus("A local transcription is already running. Please wait for it to finish.", "busy");
        return { started:false, busy:true };
      }
      var spec;
      try { spec = loadCaptionRuntimeSpec(); }
      catch (error) { setStatus("AutoCaptions manifest error: " + error.message, "error"); return { started:false, failed:true }; }
      if (os.platform() !== "win32" || os.arch() !== "x64") {
        setStatus("This AutoCaptions runtime currently supports 64-bit Windows only.", "error");
        return { started:false, failed:true };
      }
      var model = document.getElementById("flexCaptionModel").value;
      if (!spec.models[model]) { setStatus("The selected Whisper model is not available.", "error"); return { started:false, failed:true }; }
      var language = document.getElementById("flexCaptionLanguage").value;
      var fillGaps = document.getElementById("flexCaptionFillGaps").checked;
      var enhancePref = readVoiceEnhancePref();
      var enhance = enhancePref.checked ? enhancePref.strength : null;
      var glossary = captionGlossaryInput ? captionGlossaryInput.value : "";
      try { localStorage.setItem("compxCaptionGlossary", glossary || ""); } catch (glossarySaveError) { auditFallback("MAIN_FLEXCAPTION_GLOSSARY_SAVE_002", glossarySaveError); }
      var installed = resolvePrivateCaptionRuntime(spec, model);
      if (installed) {
        var transcriptionPromise = transcribeWithPrivateRuntime(installed, language, fillGaps, enhance, glossary).catch(function (error) {
          setStatus("Transcription failed: " + error.message, "error");
        });
        return { started:true, promise:transcriptionPromise };
      }
      pendingRuntimeRequest = { spec: spec, model: model, language: language, fillGaps: fillGaps, enhance: enhance, glossary: glossary };
      var requiredMB = estimateCaptionDownloadMB(spec, model);
      if (consentText) consentText.textContent = "CompX needs approximately " + Math.ceil(requiredMB) + " MB for the private runtime and selected model. Files stay in Local AppData; no admin access, system Python, or PATH changes.";
      if (runtimeProgress) runtimeProgress.value = 0;
      if (consentPanel) consentPanel.hidden = false;
      setStatus("AutoCaptions needs a one-time runtime download — open Settings (gear icon) to continue.", "busy");
      if (window.openCompXSettings) window.openCompXSettings("stgCardAutoCaptions");
      showToast("AutoCaptions runtime not installed — download it from Settings", true);
      return { started:false, pending:true };
    }

    function loadCaptionRuntimeSpec() {
      var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      var manifestPath = path.join(extensionRoot, "scripts", "autocaptions-runtime.json");
      var spec = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (!spec || spec.schema !== 1 || !spec.runtime || !spec.ffmpeg || !spec.models) throw new Error("Invalid runtime manifest.");
      return spec;
    }

    function captionRuntimeRoot() {
      var local = nodeProcess.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      return path.join(local, "CompXOrbit", "AutoCaptions");
    }

    function readCaptionInstallRecord(root) {
      try { return JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")); }
      catch (error) { return { schema: 1, models: {} }; }
    }

    function safeCaptionRuntimePath(root, relativePath) {
      if (!relativePath) return null;
      var resolvedRoot = path.resolve(root) + path.sep;
      var resolved = path.resolve(root, relativePath);
      if (resolved.toLowerCase().indexOf(resolvedRoot.toLowerCase()) !== 0) return null;
      return resolved;
    }

    function resolvePrivateCaptionRuntime(spec, model) {
      if (!spec.models[model]) return null;
      var root = captionRuntimeRoot();
      var record = readCaptionInstallRecord(root);
      if (record.runtimeVersion !== spec.runtimeVersion || record.runtimeSha256 !== spec.runtime.sha256 || record.ffmpegSha256 !== spec.ffmpeg.sha256) return null;
      var whisperExe = safeCaptionRuntimePath(root, record.whisperExe);
      var ffmpegExe = safeCaptionRuntimePath(root, record.ffmpegExe);
      var modelRecord = record.models && record.models[model];
      var modelPath = modelRecord && modelRecord.sha256 === spec.models[model].sha256 ? safeCaptionRuntimePath(root, modelRecord.path) : null;
      if (!whisperExe || !ffmpegExe || !modelPath || !fs.existsSync(whisperExe) || !fs.existsSync(ffmpegExe) || !fs.existsSync(modelPath)) return null;
      return { root: root, whisper: whisperExe, ffmpeg: ffmpegExe, model: modelPath };
    }

    function estimateCaptionDownloadMB(spec, model) {
      var root = captionRuntimeRoot();
      var record = readCaptionInstallRecord(root);
      var total = 0;
      var whisperPath = safeCaptionRuntimePath(root, record.whisperExe);
      var ffmpegPath = safeCaptionRuntimePath(root, record.ffmpegExe);
      var modelRecord = record.models && record.models[model];
      var modelPath = modelRecord && safeCaptionRuntimePath(root, modelRecord.path);
      if (record.runtimeVersion !== spec.runtimeVersion || record.runtimeSha256 !== spec.runtime.sha256 || !whisperPath || !fs.existsSync(whisperPath)) total += Number(spec.runtime.sizeMB) || 0;
      if (record.ffmpegSha256 !== spec.ffmpeg.sha256 || !ffmpegPath || !fs.existsSync(ffmpegPath)) total += Number(spec.ffmpeg.sizeMB) || 0;
      if (!modelRecord || modelRecord.sha256 !== spec.models[model].sha256 || !modelPath || !fs.existsSync(modelPath)) total += Number(spec.models[model].sizeMB) || 0;
      return total;
    }

    function hideRuntimeConsent() {
      if (consentPanel) consentPanel.hidden = true;
      if (runtimeProgress) runtimeProgress.value = 0;
    }

    function updateRuntimeProgress(label, percent) {
      if (runtimeProgress) runtimeProgress.value = Math.max(0, Math.min(100, percent || 0));
      setStatus(label + (percent ? " " + Math.round(percent) + "%" : ""), "busy");
    }

    function downloadVerifiedFile(url, destination, expectedHash, label) {
      return new Promise(function (resolve, reject) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        var partial = destination + ".part";
        try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_PARTIAL_001", cleanupError); }

        function request(currentUrl, redirects) {
          var req = https.get(currentUrl, function (response) {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              response.resume();
              if (redirects >= 8) { reject(new Error("Too many download redirects.")); return; }
              request(urlMod.resolve(currentUrl, response.headers.location), redirects + 1);
              return;
            }
            if (response.statusCode !== 200) { response.resume(); reject(new Error(label + " download returned HTTP " + response.statusCode)); return; }
            var total = Number(response.headers["content-length"]) || 0;
            var received = 0;
            var hash = crypto.createHash("sha256");
            var output = fs.createWriteStream(partial);
            var settled = false;
            function fail(error) {
              if (settled) return;
              settled = true;
              try { output.destroy(); } catch (destroyError) { auditFallback("MAIN_FLEXCAPTION_STREAM_001", destroyError); }
              try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (unlinkError) { auditFallback("MAIN_FLEXCAPTION_PARTIAL_002", unlinkError); }
              reject(error);
            }
            response.on("data", function (chunk) {
              received += chunk.length;
              hash.update(chunk);
              updateRuntimeProgress("Downloading " + label + "...", total ? received * 100 / total : 0);
            });
            response.on("error", fail);
            output.on("error", fail);
            output.on("finish", function () {
              output.close(function () {
                if (settled) return;
                var actual = hash.digest("hex");
                if (actual !== expectedHash) { fail(new Error(label + " security verification failed.")); return; }
                try {
                  if (fs.existsSync(destination)) fs.unlinkSync(destination);
                  fs.renameSync(partial, destination);
                  settled = true;
                  resolve(destination);
                } catch (renameError) { fail(renameError); }
              });
            });
            response.pipe(output);
          });
          req.setTimeout(30000, function () { req.destroy(new Error(label + " download timed out.")); });
          req.on("error", function (error) {
            try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (unlinkError) { auditFallback("MAIN_FLEXCAPTION_PARTIAL_003", unlinkError); }
            reject(error);
          });
        }
        request(url, 0);
      });
    }

    function extractCaptionZip(archive, destination, label) {
      return new Promise(function (resolve, reject) {
        fs.mkdirSync(destination, { recursive: true });
        var quote = function (value) { return "'" + String(value).replace(/'/g, "''") + "'"; };
        var command = "Expand-Archive -LiteralPath " + quote(archive) + " -DestinationPath " + quote(destination) + " -Force";
        var proc = cp.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true });
        var output = "";
        proc.stdout.on("data", function (chunk) { output += chunk.toString(); });
        proc.stderr.on("data", function (chunk) { output += chunk.toString(); });
        proc.on("error", reject);
        proc.on("close", function (code) { if (code === 0) resolve(); else reject(new Error(label + " extraction failed: " + output.slice(-300))); });
      });
    }

    function findCaptionBinary(folder, names) {
      // `names` is a priority-ordered list (e.g. ["whisper-cli.exe", "main.exe"]).
      // We must return the highest-priority match found anywhere in the tree,
      // not just the first match encountered during directory traversal —
      // otherwise a deprecated binary earlier in readdir order (alphabetically
      // "main.exe" sorts before "whisper-cli.exe") gets picked over the
      // preferred one.
      var found = {};
      var queue = [folder];
      while (queue.length) {
        var current = queue.shift();
        var entries = fs.readdirSync(current, { withFileTypes: true });
        for (var i = 0; i < entries.length; i++) {
          var item = path.join(current, entries[i].name);
          if (entries[i].isDirectory()) {
            queue.push(item);
          } else {
            var lower = entries[i].name.toLowerCase();
            if (found[lower] === undefined) found[lower] = item;
          }
        }
      }
      for (var n = 0; n < names.length; n++) {
        var key = names[n].toLowerCase();
        if (found[key] !== undefined) return found[key];
      }
      return null;
    }

    function writeCaptionInstallRecord(root, record) {
      record.schema = 1;
      record.updatedAt = new Date().toISOString();
      var destination = path.join(root, "manifest.json");
      var partial = destination + ".tmp";
      fs.writeFileSync(partial, JSON.stringify(record, null, 2), "utf8");
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
      fs.renameSync(partial, destination);
    }

    function ensurePrivateCaptionRuntime(spec, model) {
      var modelSpec = spec.models[model];
      if (!modelSpec) return Promise.reject(new Error("Unknown Whisper model: " + model));
      var root = captionRuntimeRoot();
      var downloads = path.join(root, "downloads");
      var record = readCaptionInstallRecord(root);
      if (record.runtimeVersion !== spec.runtimeVersion) record = { schema: 1, models: {} };
      if (!record.models) record.models = {};
      fs.mkdirSync(downloads, { recursive: true });

      var chain = Promise.resolve();
      var currentRuntime = resolvePrivateCaptionRuntime(spec, model);
      if (currentRuntime) return Promise.resolve(currentRuntime);

      var whisperPath = safeCaptionRuntimePath(root, record.whisperExe);
      if (record.runtimeSha256 !== spec.runtime.sha256 || !whisperPath || !fs.existsSync(whisperPath)) {
        chain = chain.then(function () {
          var archive = path.join(downloads, spec.runtime.archive);
          var destination = path.join(root, "runtime", spec.runtimeVersion);
          return downloadVerifiedFile(spec.runtime.url, archive, spec.runtime.sha256, "whisper.cpp").then(function () {
            updateRuntimeProgress("Installing whisper.cpp...", 100);
            return extractCaptionZip(archive, destination, "whisper.cpp");
          }).then(function () {
            var executable = findCaptionBinary(destination, ["whisper-cli.exe", "main.exe"]);
            if (!executable) throw new Error("whisper-cli.exe was not found in the verified runtime.");
            record.runtimeVersion = spec.runtimeVersion;
            record.runtimeSha256 = spec.runtime.sha256;
            record.whisperExe = path.relative(root, executable);
            try { fs.unlinkSync(archive); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_ARCHIVE_001", cleanupError); }
            writeCaptionInstallRecord(root, record);
          });
        });
      }

      var ffmpegPath = safeCaptionRuntimePath(root, record.ffmpegExe);
      if (record.ffmpegSha256 !== spec.ffmpeg.sha256 || !ffmpegPath || !fs.existsSync(ffmpegPath)) {
        chain = chain.then(function () {
          var archive = path.join(downloads, spec.ffmpeg.archive);
          var destination = path.join(root, "ffmpeg", spec.ffmpeg.version);
          return downloadVerifiedFile(spec.ffmpeg.url, archive, spec.ffmpeg.sha256, "FFmpeg").then(function () {
            updateRuntimeProgress("Installing FFmpeg...", 100);
            return extractCaptionZip(archive, destination, "FFmpeg");
          }).then(function () {
            var executable = findCaptionBinary(destination, ["ffmpeg.exe"]);
            if (!executable) throw new Error("ffmpeg.exe was not found in the verified package.");
            record.ffmpegSha256 = spec.ffmpeg.sha256;
            record.ffmpegExe = path.relative(root, executable);
            try { fs.unlinkSync(archive); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_ARCHIVE_002", cleanupError); }
            writeCaptionInstallRecord(root, record);
          });
        });
      }

      var installedModel = record.models[model];
      var installedModelPath = installedModel && safeCaptionRuntimePath(root, installedModel.path);
      if (!installedModel || installedModel.sha256 !== modelSpec.sha256 || !installedModelPath || !fs.existsSync(installedModelPath)) {
        chain = chain.then(function () {
          var destination = path.join(root, "models", modelSpec.file);
          return downloadVerifiedFile(modelSpec.url, destination, modelSpec.sha256, "Whisper " + model + " model").then(function () {
            record.models[model] = { sha256: modelSpec.sha256, path: path.relative(root, destination) };
            writeCaptionInstallRecord(root, record);
          });
        });
      }

      return chain.then(function () {
        var runtime = resolvePrivateCaptionRuntime(spec, model);
        if (!runtime) throw new Error("AutoCaptions runtime did not pass its installation check.");
        return runtime;
      });
    }

    function runCaptionProcess(executable, args, label) {
      return new Promise(function (resolve, reject) {
        var proc = cp.spawn(executable, args, { windowsHide: true });
        var output = "";
        function collect(chunk) {
          output = (output + chunk.toString()).slice(-5000);
          var line = chunk.toString().trim().split(/\r?\n/).pop();
          if (line) setStatus(label + ": " + line.slice(0, 180), "busy");
        }
        proc.stdout.on("data", collect);
        proc.stderr.on("data", collect);
        proc.on("error", reject);
        proc.on("close", function (code) { if (code === 0) resolve(output); else reject(new Error(label + " exited with code " + code + (output ? " - " + output.slice(-300) : ""))); });
      });
    }

    function probeMediaDuration(mediaFilePath) {
      // Reads media duration with ffmpeg -i (no re-encode) using the verified
      // private runtime. Resolves to seconds, or null when unavailable.
      return new Promise(function (resolve) {
        try {
          if (!nodeAvailable || !fs || !mediaFilePath) { resolve(null); return; }
          var spec;
          try { spec = loadCaptionRuntimeSpec(); } catch (specError) { resolve(null); return; }
          var runtime = resolvePrivateCaptionRuntime(spec, document.getElementById("flexCaptionModel") ? document.getElementById("flexCaptionModel").value : "base");
          if (!runtime || !fs.existsSync(runtime.ffmpeg)) { resolve(null); return; }
          var proc = cp.spawn(runtime.ffmpeg, ["-i", String(mediaFilePath)], { windowsHide: true });
          var output = "";
          proc.stderr.on("data", function (chunk) { output = (output + chunk.toString()).slice(-8000); });
          proc.on("error", function () { resolve(null); });
          proc.on("close", function () {
            // ffmpeg -i always exits non-zero without an output file; the
            // Duration line still lands on stderr.
            var match = output.match(/Duration:\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/);
            if (!match) { resolve(null); return; }
            var seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            if (match[4]) seconds += Number(("0." + match[4]));
            resolve(seconds > 0 ? seconds : null);
          });
        } catch (probeError) { auditFallback("MAIN_PROBE_DURATION_001", probeError); resolve(null); }
      });
    }

    function suggestPresetForDuration(durationSeconds) {
      // Short reels → punchy pop; mid-length → viral; long-form → news style.
      if (!(durationSeconds > 0)) return null;
      if (durationSeconds < 60) return { preset: "capcut", label: "CapCut Pop", reason: "short reel" };
      if (durationSeconds <= 300) return { preset: "banglaviral", label: "Bangla Viral", reason: "mid-length video" };
      return { preset: "news", label: "News Style", reason: "long-form video" };
    }

    function formatFlexSRT(cues) {
      function stamp(value) {
        var ms = Math.max(0, Math.round(value * 1000));
        var hours = Math.floor(ms / 3600000); ms %= 3600000;
        var minutes = Math.floor(ms / 60000); ms %= 60000;
        var seconds = Math.floor(ms / 1000); var millis = ms % 1000;
        function pad(number, width) { return (new Array(width + 1).join("0") + number).slice(-width); }
        return pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "," + pad(millis, 3);
      }
      return cues.map(function (cue, index) { return (index + 1) + "\n" + stamp(cue.start) + " --> " + stamp(cue.end) + "\n" + cue.text; }).join("\n\n") + "\n";
    }

    function applyCaptionGlossary(text, glossary) {
      String(glossary || "").split(/[\n,;]+/).forEach(function (entry) {
        var separator = entry.indexOf("=>") >= 0 ? "=>" : "=";
        var at = entry.indexOf(separator);
        if (at < 1) return;
        var from = entry.slice(0, at).trim(), to = entry.slice(at + separator.length).trim();
        if (from && to) text = text.split(from).join(to);
      });
      return text;
    }

    function buildVoiceEnhanceChain(strength) {
      if (strength === "light") return "highpass=f=80,afftdn=nr=8,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=1,loudnorm=I=-16:LRA=11";
      if (strength === "strong") return "afftdn=nr=18,deesser=threshold=0.5,acompressor=threshold=-24dB:ratio=3:attack=5:release=100:makeup=2,loudnorm=I=-16:LRA=11,alimiter=limit=-1.5dB";
      return "afftdn=nr=12,highpass=f=80,deesser,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=1,loudnorm=I=-16:LRA=11,alimiter=limit=-1.5dB";
    }
    var VOICE_ENHANCE_FALLBACK_CHAIN = "afftdn=nr=12,highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=1,loudnorm=I=-16:LRA=11,alimiter=limit=-1.5dB";

    function transcribeWithPrivateRuntime(runtime, language, fillGaps, enhance, glossary) {
      runtimeBusy = true;
      if (transcribeBtn) transcribeBtn.disabled = true;
      var token = Date.now() + "_" + Math.floor(Math.random() * 100000);
      var wavPath = path.join(os.tmpdir(), "compx_caption_" + token + ".wav");
      var outputPrefix = path.join(os.tmpdir(), "compx_caption_" + token);
      var srtPath = outputPrefix + ".srt";
      var jsonPath = outputPrefix + ".json";
      var subtitleMaxLength = language === "bn" ? 42 : 64;
      var whisperArgs = ["-m", runtime.model, "-f", wavPath, "-osrt", "-ojf", "-of", outputPrefix, "-l", language || "auto", "-pp", "-ml", String(subtitleMaxLength), "-sow", "-sns"];
      // Whisper (Tiny/Base especially) often writes Bangla speech in Latin
      // letters ("Banglish") even with -l bn. A short prompt in the target
      // script steers the decoder to that script.
      var SCRIPT_PROMPTS = {
        bn: "আমি বাংলায় কথা বলছি। এই ভিডিওর সব কথা বাংলা অক্ষরে লেখা হবে।",
        hi: "मैं हिंदी में बात कर रहा हूँ। सब कुछ देवनागरी में लिखा जाएगा।",
        ur: "میں اردو میں بات کر رہا ہوں۔ سب کچھ اردو رسم الخط میں لکھا جائے گا۔"
      };
      if (SCRIPT_PROMPTS[language]) whisperArgs.push("--prompt", SCRIPT_PROMPTS[language]);
      setStatus("Preparing audio locally with FFmpeg...", "busy");
      var ffmpegArgs = ["-y", "-loglevel", "error", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000"];
      var enhanceChain = enhance ? buildVoiceEnhanceChain(enhance) : null;
      if (enhanceChain) ffmpegArgs.push("-af", enhanceChain);
      ffmpegArgs.push("-c:a", "pcm_s16le", wavPath);
      return runCaptionProcess(runtime.ffmpeg, ffmpegArgs, "FFmpeg").catch(function (ffmpegError) {
        if (!enhanceChain || enhanceChain.indexOf("deesser") < 0) throw ffmpegError;
        setStatus("Advanced filters unavailable — retrying with a compatible chain...", "busy");
        var fallbackArgs = ffmpegArgs.slice();
        var afIndex = fallbackArgs.indexOf("-af");
        if (afIndex >= 0) fallbackArgs[afIndex + 1] = VOICE_ENHANCE_FALLBACK_CHAIN;
        return runCaptionProcess(runtime.ffmpeg, fallbackArgs, "FFmpeg");
      }).then(function () {
        setStatus("Transcribing locally with whisper.cpp...", "busy");
        return runCaptionProcess(runtime.whisper, whisperArgs, "Whisper");
      }).then(function () {
        var text = applyCaptionGlossary(fs.readFileSync(srtPath, "utf8"), glossary);
        var cues = parseFlexSRT(text);
        var timingAdjusted = false;
        for (var cueIndex = 0; cueIndex < cues.length; cueIndex++) {
          var cue = cues[cueIndex];
          if (cue.end - cue.start > 8) {
            var readableDuration = Math.max(1.5, Math.min(8, String(cue.text || "").length * 0.13 + 0.6));
            cue.end = Math.min(cue.end, cue.start + readableDuration);
            timingAdjusted = true;
          }
        }
        if (fillGaps) {
          for (var i = 0; i < cues.length - 1; i++) {
            var gap = cues[i + 1].start - cues[i].end;
            if (gap > 0 && gap < 2) cues[i].end = cues[i + 1].start;
          }
        }
        lastWordTimings = readWhisperWordTimings(jsonPath, cues, glossary);
        var cleanedTranscript = applyFlexCleanup(cues, lastWordTimings, readCleanupOptions());
        cues = cleanedTranscript.cues;
        lastWordTimings = cleanedTranscript.timings;
        text = formatFlexSRT(cues);
        if (editor) editor.value = text;
        var count = refreshImportState().length;
        renderCueList();
        if (count) setCaptionStage("edit");
        // Still mostly Latin letters after asking for Bangla: the model is too
        // small for this audio. Say so instead of handing over Banglish.
        var scriptHint = "";
        if (language === "bn") {
          var bnChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
          var latinChars = (text.match(/[A-Za-z]/g) || []).length;
          if (latinChars > bnChars) scriptHint = " Most of it came out in English letters — try Whisper Small or Medium for Bangla script.";
        }
        setStatus("Transcription complete: " + count + " cue(s). Review the text and timing, then continue to Style." + scriptHint, scriptHint ? "error" : "ok");
        try {
          document.dispatchEvent(new CustomEvent("compx:srt-ready", {
            detail: { srt:text, count:count, wordTimings:lastWordTimings }
          }));
        } catch (readyEventError) { auditFallback("MAIN_SIMPLE_SRT_READY_EVENT_001", readyEventError); }
      }).then(function () {
        runtimeBusy = false;
        if (transcribeBtn) transcribeBtn.disabled = false;
        try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_001", cleanupError); }
        try { if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_002", cleanupError); }
        try { if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_JSON_001", cleanupError); }
      }, function (error) {
        runtimeBusy = false;
        if (transcribeBtn) transcribeBtn.disabled = false;
        try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_003", cleanupError); }
        try { if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_004", cleanupError); }
        try { if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath); } catch (cleanupError) { auditFallback("MAIN_FLEXCAPTION_TEMP_JSON_002", cleanupError); }
        throw error;
      });
    }

    function doGenerateFlexCaptions(fromAuto, cues, karaokeOn) {
      var engine = captionEngine ? captionEngine.value : "smart";
      var layeredWords = karaokeOn && engine === "layers";
      // Smart/line mode keeps exactly one layer per SRT cue. Advanced Layered
      // Words intentionally retains the old chunk/word-layer workflow.
      var maxWords = layeredWords
        ? Math.max(1, Math.min(8, Number(document.getElementById("flexCaptionMaxWords").value) || 3))
        : 999999;
      var normalizedCues = normalizeFlexCueBoundaries(cues);
      var containsBangla = normalizedCues.some(function (cue) { return /[\u0980-\u09FF]/.test(String(cue && cue.text || "")); });
      var hadOverlapRepair = normalizedCues.some(function (cue, index) { return cues[index] && Math.abs(cue.end - cues[index].end) > 0.0005; });
      var words = buildFlexWords(normalizedCues, maxWords, hadOverlapRepair ? null : lastWordTimings);
      var activeLayout = layoutGrid ? layoutGrid.querySelector("[data-flex-layout].active") : null;
      var activeOutputBtn = outputSeg ? outputSeg.querySelector("[data-caption-output].active") : null;
      var payloadBase = {
        buildId: "caption_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
        output: activeOutputBtn ? activeOutputBtn.dataset.captionOutput : "comp",
        layout: activeLayout ? activeLayout.dataset.flexLayout : "inline",
        anim: document.getElementById("flexCaptionAnimType").value,
        position: document.getElementById("flexCaptionPosition").value,
        font: document.getElementById("flexCaptionFont").value,
        banglaFont: document.getElementById("flexCaptionBanglaFont").value || "HindSiliguriRegular",
        fontSize: Number(document.getElementById("flexCaptionFontSize").value) || 90,
        color: document.getElementById("flexCaptionColor").value,
        emphasisColor: document.getElementById("flexCaptionEmphasisColor").value,
        karaoke: karaokeOn,
        karaokeEngine: engine,
        activeStyle: (function () { var b = document.querySelector("#flexCaptionActiveStyle [data-active-style].active"); return b ? b.dataset.activeStyle : "pill"; })(),
        activeMode: document.getElementById("flexCaptionActiveMode").value,
        activePop: Number(document.getElementById("flexCaptionActivePop").value) || 0,
        shadow: document.getElementById("flexChkShadow").checked,
        bg: document.getElementById("flexChkBg").checked,
        bgColor: document.getElementById("flexCaptionBgColor").value,
        speed: Number(document.getElementById("flexCaptionSpeed").value) || 14,
        intensity: Number(document.getElementById("flexCaptionIntensity").value) || 60,
        keywordScale: Number(document.getElementById("flexCaptionKeywordScale").value) || 135,
        keywordGlow: Number(document.getElementById("flexCaptionKeywordGlow").value) || 40,
        neon: !!activePresetMeta().neon,
        chrome: !!activePresetMeta().chrome,
        beasty: !!activePresetMeta().beasty,
        spotlight: !!activePresetMeta().spotlight,
        buildDuration: normalizedCues.reduce(function (max, cue) { return Math.max(max, Number(cue.end) || 0); }, 0)
      };

      function setBuildProgress(done, total, label) {
        if (!captionBuildProgress) return;
        captionBuildProgress.hidden = false;
        var bar = captionBuildProgress.querySelector("i");
        var text = captionBuildProgress.querySelector("span");
        var percent = total ? Math.round(done / total * 100) : 0;
        if (bar) bar.style.width = percent + "%";
        if (text) text.textContent = label || ("Building captions… " + percent + "%");
      }
      function finishBuild(parsed) {
        if (captionBuildProgress) {
          setBuildProgress(words.length, words.length, parsed && parsed.success ? "Captions ready ✓" : ((parsed && parsed.message) || "Caption build stopped"));
          setTimeout(function () { captionBuildProgress.hidden = true; }, 1800);
        }
        if (createBtn) createBtn.disabled = false;
        if (parsed && parsed.success) {
          showToast(parsed.message || (fromAuto ? "Captions auto-generated after transcription" : "Captions created"));
          if (containsBangla && karaokeOn && engine === "smart") {
            setStatus("Captions created in Bengali Safe mode. Conjunct-safe whole-line rendering is active; glyph-breaking per-word Scale/Range animation was skipped.", "ok");
          } else {
            setStatus(hadOverlapRepair ? "Captions created; overlapping SRT cue boundaries were repaired automatically." : "Captions created with the responsive " + (karaokeOn ? "Smart Active Word" : "line") + " engine.", "ok");
          }
        } else {
          var message = parsed && parsed.message ? parsed.message : "Caption generation failed.";
          showToast(message, true);
          setStatus(message, "error");
        }
      }

      if (createBtn) createBtn.disabled = true;
      // Small host batches let AE repaint between calls in both output modes.
      var useBatches = words.length > 12;
      if (!useBatches) {
        payloadBase.words = words;
        setBuildProgress(0, Math.max(1, words.length), layeredWords ? "Building Advanced Layered Words…" : "Building captions…");
        callHost('ae_createFlexCaptions("' + encodeURIComponent(JSON.stringify(payloadBase)) + '")', finishBuild, 180000);
        return;
      }

      // Keep complete cue groups together; splitting a cue between batches would
      // create duplicate partial lines. Eight cues per host call is a good AE
      // responsiveness/throughput balance on both Windows and macOS.
      var cueBatches = [];
      var groupedWords = [];
      var groupLookup = {};
      words.forEach(function (word) {
        var key = String(word.groupId);
        if (!groupLookup[key]) { groupLookup[key] = []; groupedWords.push(groupLookup[key]); }
        groupLookup[key].push(word);
      });
      for (var groupCursor = 0; groupCursor < groupedWords.length; groupCursor += 8) {
        var flatBatch = [];
        groupedWords.slice(groupCursor, groupCursor + 8).forEach(function (group) { flatBatch = flatBatch.concat(group); });
        cueBatches.push(flatBatch);
      }
      var cursor = 0;
      setStatus(layeredWords ? "Building Advanced Layered Words in safe batches…" : "Building responsive captions in safe batches…", "busy");
      function buildNextBatch() {
        if (cursor >= cueBatches.length) { finishBuild({ success:true, message:normalizedCues.length + " responsive caption cue(s) created" + (payloadBase.output === "precomp" ? " in a CompX Captions precomp." : " in the active composition.") }); return; }
        var batchPayload = Object.assign({}, payloadBase, { words:cueBatches[cursor], appendBuild:cursor > 0 });
        setBuildProgress(cursor, cueBatches.length, "Building captions… " + Math.round(cursor / cueBatches.length * 100) + "%");
        callHost('ae_createFlexCaptions("' + encodeURIComponent(JSON.stringify(batchPayload)) + '")', function (parsed) {
          if (!parsed.success) { finishBuild(parsed); return; }
          cursor += 1;
          setBuildProgress(cursor, cueBatches.length);
          setTimeout(buildNextBatch, 30);
        }, 90000);
      }
      buildNextBatch();
    }

    function generateFlexCaptions(fromAuto) {
      var cues = refreshImportState();
      if (!cues.length) { setStatus("Load or generate valid SRT captions first.", "error"); return; }
      var fatalSrtIssues = lastFlexSrtIssues.filter(function (issue) { return issue.indexOf("overlaps the previous cue") < 0; });
      if (fatalSrtIssues.length) {
        setStatus("Fix " + fatalSrtIssues.length + " invalid SRT issue(s) before generating. Open Raw SRT to review.", "error");
        return;
      }
      var karaokeOn = !!(document.getElementById("flexCaptionKaraoke") || {}).checked;
      var engine = captionEngine ? captionEngine.value : "smart";
      var totalWords = 0;
      cues.forEach(function (cue) { totalWords += String(cue.text || "").split(/\s+/).filter(Boolean).length; });
      // Karaoke guard: word-by-word layers are heavy (2-3 layers per word). If the user
      // is about to generate hundreds of word layers, warn once so AE never hangs.
      if (karaokeOn && engine === "layers" && totalWords > 160 && !fromAuto) {
        showModal({
          title: "Advanced Layered Words is heavy",
          message: "This transcript contains " + totalWords + " words. Layered Words can create hundreds of AE layers and effects.\n\nSmart Active Word gives the same timed highlight using one text layer per cue and is recommended for production.",
          okText: "Build layered anyway",
          cancelText: "Use Smart Active Word",
          danger: true
        }).then(function (keepGoing) {
          if (!keepGoing) {
            if (captionEngine) captionEngine.value = "smart";
            updateOutputEstimate();
            setStatus("Switched to Smart Active Word — one layer per cue with timed word highlighting.", "ok");
          }
          doGenerateFlexCaptions(fromAuto, cues, karaokeOn);
        });
        return;
      }
      doGenerateFlexCaptions(fromAuto, cues, karaokeOn);
    }

    createBtn?.addEventListener("click", function () { generateFlexCaptions(false); });

    // Full restyle payload built from the CURRENT panel controls. Includes
    // animation style + treatments so one call restyles every generated layer
    // (color, font, motion, neon/chrome/beasty/spotlight) without regenerating.
    function buildCaptionStylePayload() {
      var meta = activePresetMeta();
      var activeLayoutBtn = layoutGrid ? layoutGrid.querySelector("[data-flex-layout].active") : null;
      var activeStyleBtn = document.querySelector("#flexCaptionActiveStyle [data-active-style].active");
      return {
        font: document.getElementById("flexCaptionFont").value,
        banglaFont: document.getElementById("flexCaptionBanglaFont").value || "HindSiliguriRegular",
        fontSize: Number(document.getElementById("flexCaptionFontSize").value) || 90,
        color: document.getElementById("flexCaptionColor").value,
        emphasisColor: document.getElementById("flexCaptionEmphasisColor").value,
        position: document.getElementById("flexCaptionPosition").value,
        activeMode: document.getElementById("flexCaptionActiveMode").value,
        activePop: Number(document.getElementById("flexCaptionActivePop").value) || 0,
        activeStyle: activeStyleBtn ? activeStyleBtn.dataset.activeStyle : "pill",
        shadow: document.getElementById("flexChkShadow").checked,
        bg: document.getElementById("flexChkBg").checked,
        bgColor: document.getElementById("flexCaptionBgColor").value,
        keywordScale: Number(document.getElementById("flexCaptionKeywordScale").value) || 135,
        keywordGlow: Number(document.getElementById("flexCaptionKeywordGlow").value) || 40,
        layout: activeLayoutBtn ? activeLayoutBtn.dataset.flexLayout : "inline",
        anim: (document.getElementById("flexCaptionAnimType") || {}).value || "pop",
        speed: Number(document.getElementById("flexCaptionSpeed").value) || 14,
        intensity: Number(document.getElementById("flexCaptionIntensity").value) || 60,
        neon: !!meta.neon, chrome: !!meta.chrome, beasty: !!meta.beasty, spotlight: !!meta.spotlight
      };
    }

    // Clicking a preset (or the ↻ Update Captions button) restyles every already-
    // generated CompX caption layer in AE — colour + animation + treatments — so
    // the user never has to regenerate to preview a different style.
    function applyPresetToTimeline(okMsg) {
      callHost("ae_updateFlexCaptions(" + hostArg(JSON.stringify(buildCaptionStylePayload())) + ")", function (parsed) {
        if (parsed.success) {
          showToast(parsed.message || okMsg || "Captions restyled");
        } else if (String(parsed.message || "").indexOf("No generated CompX captions") === 0) {
          // No captions in the comp yet — preset is only staged in the panel controls.
          setStatus("Preset staged \u2014 generate captions to apply it to the timeline.", "ok");
        } else {
          showToast(parsed.message || "Captions restyle failed", true);
        }
      });
    }

    updateCaptionsBtn?.addEventListener("click", function () {
      applyPresetToTimeline("Captions updated");
    });

    function parseFlexSRT(text) {
      var cues = [];
      var issues = [];
      var blocks = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split(/\n\n+/);
      blocks.forEach(function(block, blockIndex) {
        if (!block.trim()) return;
        var lines = block.trim().split("\n");
        if (lines.length < 2) { issues.push("Block " + (blockIndex + 1) + " is incomplete"); return; }
        var timeLine = "", textLines = [];
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].match(/-->/)) { timeLine = lines[i]; textLines = lines.slice(i+1); break; }
        }
        if (!timeLine) { issues.push("Block " + (blockIndex + 1) + " has no timestamp"); return; }
        var parts = timeLine.split("-->");
        if (parts.length !== 2) { issues.push("Block " + (blockIndex + 1) + " has an invalid timestamp"); return; }
        function toSec(t) {
          var value = String(t || "").trim().replace(",", ".");
          var m = value.match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/);
          if (m) return parseInt(m[1],10)*3600 + parseInt(m[2],10)*60 + parseInt(m[3],10) + parseInt(m[4],10)/Math.pow(10, m[4].length);
          var m2 = value.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
          if (m2) return parseInt(m2[1],10)*60 + parseInt(m2[2],10) + parseInt(m2[3],10)/Math.pow(10, m2[3].length);
          return null;
        }
        var start = toSec(parts[0]), end = toSec(parts[1]);
        if (start === null || end === null) { issues.push("Block " + (blockIndex + 1) + " has an invalid time value"); return; }
        if (!(end > start)) { issues.push("Block " + (blockIndex + 1) + " must end after it starts"); return; }
        var cueText = textLines.join(" ").replace(/<[^>]+>/g,"").trim();
        if (!cueText) { issues.push("Block " + (blockIndex + 1) + " has no caption text"); return; }
        cues.push({ start: start, end: end,
          text: cueText });
      });
      for (var cueIndex = 1; cueIndex < cues.length; cueIndex++) {
        if (cues[cueIndex].start < cues[cueIndex - 1].start) issues.push("Cue " + (cueIndex + 1) + " is out of chronological order");
        else if (cues[cueIndex].start < cues[cueIndex - 1].end) issues.push("Cue " + (cueIndex + 1) + " overlaps the previous cue");
      }
      lastFlexSrtIssues = issues;
      return cues;
    }

    function readWhisperWordTimings(jsonPath, cues, glossary) {
      try {
        var payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        var segments = payload && payload.transcription || [], output = [];
        cues.forEach(function (cue, cueIndex) {
          var segment = segments[cueIndex], result = [], current = null;
          if (!segment || !segment.tokens) { output.push(result); return; }
          function finish() {
            if (!current || !current.text) { current = null; return; }
            current.text = applyCaptionGlossary(current.text, glossary).trim();
            if (current.text) result.push(current);
            current = null;
          }
          segment.tokens.forEach(function (token) {
            var piece = String(token.text || "");
            if (/^\[[^\]]+\]$/.test(piece)) return;
            if (/^\s/.test(piece)) finish();
            piece = piece.replace(/^\s+/, "");
            if (!piece) return;
            var from = token.offsets ? Number(token.offsets.from) / 1000 : cue.start;
            var to = token.offsets ? Number(token.offsets.to) / 1000 : from;
            if (!current) current = { text: "", start: from, end: to };
            current.text += piece;
            current.end = Math.max(current.end, to);
          });
          finish();
          var rawStart = segment.offsets ? Number(segment.offsets.from) / 1000 : cue.start;
          var rawEnd = segment.offsets ? Number(segment.offsets.to) / 1000 : cue.end;
          var rawDuration = Math.max(0.05, rawEnd - rawStart), cueDuration = Math.max(0.05, cue.end - cue.start);
          result.forEach(function (word) {
            word.start = cue.start + Math.max(0, Math.min(1, (word.start - rawStart) / rawDuration)) * cueDuration;
            word.end = cue.start + Math.max(0, Math.min(1, (word.end - rawStart) / rawDuration)) * cueDuration;
            if (!(word.end > word.start)) word.end = Math.min(cue.end, word.start + 0.08);
          });
          output.push(result);
        });
        return output;
      } catch (wordTimingError) {
        auditFallback("MAIN_FLEXCAPTION_WORD_TIMING_001", wordTimingError);
        return [];
      }
    }

    // ---- Smart Caption Cleaner: filler words, punctuation, smart line breaks ----
    var FLEX_FILLER_TOKEN = /^(?:um+|uh+|er+|erm+|hmm+|hm+|mmm+|ah+|oh+|huh+|yeah|yep|basically|actually|literally|mane|matlab|accha|acha|মানে|উম+|উম্ম+|হুম+|হুঁ|আহ|ওহ|আরে|আচ্ছা|ব্যাস|উফ|আঃ|তো)$/i;
    var FLEX_FILLER_PHRASE = /^(?:you\s*know|i\s*mean|i\s*guess|sort\s*of|kind\s*of|y'?know)$/i;

    function isFlexFillerWord(word) {
      var plain = String(word || "").replace(/^\*+|\*+$/g, "").replace(/^[,.;:!?…"'\u2019]+|[,.;:!?…"'\u2019]+$/g, "");
      return !!plain && FLEX_FILLER_TOKEN.test(plain);
    }

    function fixFlexPunctuation(text) {
      var t = String(text || "").trim();
      t = t.replace(/\s+/g, " ");
      t = t.replace(/\s+([,.;:!?…])/g, "$1");
      t = t.replace(/([,.;:!?…])(?=[^\s,.;:!?…])/g, "$1 ");
      t = t.replace(/^[,.;:!?…\s]+/, "");
      t = t.replace(/\s{2,}/g, " ").trim();
      if (t && !/[.!?…]$/.test(t)) {
        t = t.replace(/[,;:]+$/, "");
        if (t && !/[.!?…]$/.test(t)) t += ".";
      }
      t = t.replace(/^(\*+)?\s*([a-zA-Z])/, function (match, stars, letter) { return (stars || "") + letter.toUpperCase(); });
      t = t.replace(/(^|\s)i(\s|$)/g, "$1I$2");
      return t;
    }

    function readCleanupOptions() {
      var activeWords = document.querySelector("#flexCleanWordsSeg [data-clean-words].active");
      return {
        filler: document.getElementById("flexCleanFiller") ? document.getElementById("flexCleanFiller").checked : true,
        punct: document.getElementById("flexCleanPunct") ? document.getElementById("flexCleanPunct").checked : true,
        linebreak: document.getElementById("flexCleanLinebreak") ? document.getElementById("flexCleanLinebreak").checked : true,
        maxWords: activeWords ? Number(activeWords.dataset.cleanWords) || 3 : 3
      };
    }

    function applyFlexCleanup(cues, timings, opts) {
      if (!cues || !cues.length) return { cues: cues || [], timings: timings || [] };
      opts = opts || {};
      var useFiller = !!opts.filler, usePunct = !!opts.punct, useBreak = !!opts.linebreak;
      if (!useFiller && !usePunct && !useBreak) return { cues: cues, timings: timings || [] };
      var maxWords = Math.max(1, opts.maxWords || 3);
      var outCues = [], outTimings = [];
      cues.forEach(function (cue, index) {
        var tokens = (cue.text || "").split(/\s+/).filter(Boolean);
        var precise = timings && timings[index];
        if (!precise || precise.length !== tokens.length) precise = null;
        var kept = [], keptT = [];
        for (var ti = 0; ti < tokens.length; ti++) {
          var token = tokens[ti];
          if (useFiller && isFlexFillerWord(token)) continue;
          if (useFiller && kept.length && FLEX_FILLER_PHRASE.test(kept[kept.length - 1].replace(/^\*+|\*+$/g, "") + " " + token.replace(/^\*+|\*+$/g, ""))) {
            kept.pop();
            if (precise) keptT.pop();
            continue;
          }
          kept.push(token);
          if (precise) keptT.push(precise[ti]);
        }
        if (!kept.length) return;
        var cueDuration = Math.max(0.05, (cue.end || 0) - (cue.start || 0));
        var totalKept = kept.length;
        var wordCursor = 0;
        var lines = [], current = [], currentT = [];
        function flushCleanLine() {
          if (!current.length) return;
          lines.push({ words: current, timings: currentT, wordFrom: wordCursor - current.length, wordTo: wordCursor });
          current = []; currentT = [];
        }
        for (var wi = 0; wi < kept.length; wi++) {
          current.push(kept[wi]);
          if (precise) currentT.push(keptT[wi]);
          wordCursor++;
          var plainLast = kept[wi].replace(/^\*+|\*+$/g, "");
          var hasLetter = /[a-zA-Z0-9\u0980-\u09FF]/.test(plainLast.replace(/[.!?…"'”)]/g, ""));
          var endsSentence = hasLetter && /[.!?…]["'”)]*$/.test(plainLast);
          var atLimit = current.length >= maxWords;
          var finalWord = wi === kept.length - 1;
          if ((useBreak && (atLimit || (endsSentence && !finalWord))) || (!useBreak && finalWord)) flushCleanLine();
        }
        flushCleanLine();
        lines.forEach(function (line) {
          var lineText = line.words.join(" ");
          if (usePunct) lineText = fixFlexPunctuation(lineText);
          if (!lineText) return;
          var start = cue.start || 0, end = cue.end || (start + 0.5);
          var lineTimings = null;
          if (precise && line.timings.length) {
            start = line.timings[0].start;
            end = line.timings[line.timings.length - 1].end;
            lineTimings = line.timings;
          } else {
            start = (cue.start || 0) + cueDuration * line.wordFrom / Math.max(totalKept, 1);
            end = (cue.start || 0) + cueDuration * line.wordTo / Math.max(totalKept, 1);
          }
          if (!(end > start)) end = Math.min(cue.end || start + 0.5, start + 0.35);
          outCues.push({ start: start, end: end, text: lineText });
          outTimings.push(lineTimings);
        });
      });
      return { cues: outCues, timings: outTimings };
    }

    function buildFlexWords(cues, maxWords, preciseTimings) {
      var words = [];
      cues.forEach(function(cue, cueIndex) {
        var tokens = (cue.text || "").split(/\s+/).filter(Boolean);
        var precise = preciseTimings && preciseTimings[cueIndex];
        if (!precise || precise.length !== tokens.length) precise = null;
        for (var base = 0; base < tokens.length; base += maxWords) {
          var chunk = tokens.slice(base, base + maxWords);
          var groupId = cueIndex + "_" + Math.floor(base / maxWords);
          var chunkStart = precise ? precise[base].start : cue.start + ((cue.end - cue.start) * base / Math.max(tokens.length, 1));
          var chunkEnd = precise ? precise[base + chunk.length - 1].end : cue.start + ((cue.end - cue.start) * Math.min(base + chunk.length, tokens.length) / Math.max(tokens.length, 1));
          var unit = Math.max(0.05, (chunkEnd - chunkStart) / Math.max(chunk.length, 1));
          chunk.forEach(function (token, index) {
            var emphasis = /^\*[^*]+\*$/.test(token);
            var exact = precise && precise[base + index];
            words.push({ text: emphasis ? token.slice(1, -1) : token, emphasis: emphasis, start: exact ? exact.start : chunkStart + index * unit, end: exact ? exact.end : chunkStart + (index + 1) * unit, groupStart: chunkStart, groupEnd: chunkEnd, groupId: groupId, groupIndex: index, groupSize: chunk.length });
          });
        }
      });
      return words;
    }

    // SRT files from auto-caption services often contain slightly overlapping
    // adjacent cues. AE renders both text layers during that overlap, producing
    // two captions at different vertical positions. Preserve every cue start,
    // but trim the previous cue just before the next one begins.
    function normalizeFlexCueBoundaries(cues) {
      var normalized = (cues || []).map(function (cue) { return { start:Number(cue.start) || 0, end:Number(cue.end) || 0, text:String(cue.text || "") }; });
      normalized.sort(function (a, b) { return a.start - b.start; });
      for (var i = 0; i < normalized.length - 1; i++) {
        var current = normalized[i], next = normalized[i + 1];
        // Two cues with the same (or decreasing) start cannot both have a valid,
        // non-overlapping interval. Preserve the later cue's duration and move it
        // just beyond the current cue's minimum readable interval.
        if (next.start <= current.start) {
          var nextDuration = Math.max(0.01, next.end - next.start);
          next.start = current.start + 0.011;
          next.end = next.start + nextDuration;
        }
        // ZH-style safety: a caption must finish before the next caption begins.
        // This prevents AE from rendering two subtitle layers simultaneously.
        if (current.end >= next.start) current.end = Math.max(current.start + 0.01, next.start - 0.001);
      }
      return normalized.filter(function (cue) { return cue.text && cue.end > cue.start; });
    }

  }

  // -------------------------------------------------------------
  // FLEX-STYLE MULTI-LAYER 3D EXTRUSION — Motion tab
  // -------------------------------------------------------------
  function wireSimpleSrtCaptions() {
    var root = document.querySelector("#flexAutoCaptions .cx-simple-srt");
    if (!root) return;
    var pickButton = document.getElementById("btnSimpleSrtPick");
    var fileInput = document.getElementById("simpleSrtInput");
    var fileName = document.getElementById("simpleSrtFileName");
    var editor = document.getElementById("simpleSrtEditor");
    var count = document.getElementById("simpleSrtCount");
    var generate = document.getElementById("btnSimpleSrtGenerate");
    var status = document.getElementById("simpleSrtStatus");
    var mediaPick = document.getElementById("btnSimpleMediaPick");
    var mediaName = document.getElementById("simpleMediaFileName");
    var transcribe = document.getElementById("btnSimpleTranscribe");
    var transcribeProgress = document.getElementById("simpleTranscribeProgress");
    var transcribeProgressText = document.getElementById("simpleTranscribeProgressText");
    var transcribeProgressPercent = document.getElementById("simpleTranscribeProgressPercent");
    var transcribeProgressBar = document.getElementById("simpleTranscribeProgressBar");
    var simpleModel = document.getElementById("simpleCaptionModel");
    var simpleLanguage = document.getElementById("simpleCaptionLanguage");
    var legacyMediaPick = document.getElementById("btnFlexMediaPick");
    var legacyMediaInput = document.getElementById("flexMediaInput");
    var legacyTranscribe = document.getElementById("btnFlexTranscribe");
    var legacyModel = document.getElementById("flexCaptionModel");
    var legacyLanguage = document.getElementById("flexCaptionLanguage");
    var legacyStatus = document.getElementById("flexCaptionStatus");
    var mediaReady = false;
    var transcriptionRequested = false;
    var templateGrid = document.getElementById("simpleCaptionTemplateGrid");
    var templateSelected = document.getElementById("simpleCaptionTemplateSelected");
    var templateClear = document.getElementById("btnSimpleTemplateClear");
    var simpleFontInput = document.getElementById("simpleSrtFont");
    var simpleFontSearch = document.getElementById("simpleSrtFontSearch");
    var simpleFontList = document.getElementById("simpleSystemFontList");
    var simpleFontCatalog = [];
    var simpleFontLoadButton = document.getElementById("btnSimpleLoadSystemFonts");
    var simpleFontStatus = document.getElementById("simpleSystemFontStatus");
    var selectedCaptionTemplate = null;
    // Same Premium Styles catalog as Library > TEXT ANIMATION STYLES.
    // Files live in presets/text-animations/ and are applied by Create Captions.
    var simpleCaptionTemplates = [
      { id:"alphabetBlink", name:"Alphabet Blink", desc:"Letter-by-letter blink-on reveal", sample:"BLINK", anim:"blink", file:"Alphabet Blink.ffx" },
      { id:"blurUp", name:"Blur Up", desc:"Soft blur rises up into focus", sample:"BLUR", anim:"blur", file:"Blur Up.ffx" },
      { id:"bounceSlideDown", name:"Bounce Slide Down", desc:"Word bounces in sliding downward", sample:"DOWN", anim:"down", file:"Bounce Slide Down Word.ffx" },
      { id:"bounceSlideLeft", name:"Bounce Slide Left", desc:"Word bounces in from the right", sample:"LEFT", anim:"left", file:"Bounce Slide Left Word.ffx" },
      { id:"bounceSlideRight", name:"Bounce Slide Right", desc:"Word bounces in from the left", sample:"RIGHT", anim:"right", file:"Bounce Slide Right Word.ffx" },
      { id:"bounceSlideUp", name:"Bounce Slide Up", desc:"Word bounces in sliding upward", sample:"UP", anim:"up", file:"Bounce Slide Up Word.ffx" },
      { id:"characterDown", name:"Character Down", desc:"Characters drop in one by one", sample:"CHAR", anim:"down", file:"Character Down.ffx" },
      { id:"characterRight", name:"Character Right", desc:"Characters slide in from the left", sample:"CHAR", anim:"right", file:"Character Right.ffx" },
      { id:"eduBounce", name:"Bounce Text", desc:"Playful springy bounce reveal", sample:"BOUNCE", anim:"bounce", file:"EduPohren - Bounce Text.ffx" },
      { id:"fadeUpOut", name:"Fade Up And Out", desc:"Smooth fade up then fade out", sample:"FADE", anim:"fade", file:"Fade Up And Out Smooth.ffx" },
      { id:"letterFlicker", name:"Letter Flicker", desc:"Nervous per-letter flicker-on", sample:"FLICK", anim:"blink", file:"Letter Flicker Text Animation.ffx" },
      { id:"miMainText", name:"Main Text", desc:"Clean punchy main-title pop", sample:"MAIN", anim:"pop", file:"mi main text.ffx" },
      { id:"oneByOne", name:"One By One", desc:"Characters pop in one by one", sample:"1BY1", anim:"pop", file:"OneByOne Text.ffx" },
      { id:"opacityFade", name:"Opacity Fade", desc:"Simple clean opacity fade-in", sample:"FADE", anim:"fade", file:"Opacity Fade.ffx" },
      { id:"smoothFade", name:"Smooth Fade In/Out", desc:"Gentle fade in and out", sample:"SMOOTH", anim:"fade", file:"Smooth Fade In And Out.ffx" },
      { id:"wordByWordAnim", name:"Word By Word", desc:"Reveals one word at a time", sample:"WORDS", anim:"pop", file:"text animation word by word.ffx" },
      { id:"textBounceDown", name:"Text Bounce Down", desc:"Bouncy drop-in from above", sample:"DOWN", anim:"down", file:"Text Bounce down.ffx" },
      { id:"textBounceUp", name:"Text Bounce Up", desc:"Bouncy rise-in from below", sample:"UP", anim:"up", file:"text Bounce up.ffx" },
      { id:"textBounce", name:"Text Bounce", desc:"Elastic scale bounce reveal", sample:"BOUNCE", anim:"bounce", file:"Text Bounce.ffx" },
      { id:"textFlicker", name:"Text Flicker", desc:"Stylized flicker-on entrance", sample:"FLICK", anim:"blink", file:"Text Flicker.ffx" },
      { id:"textSlideUp", name:"Text Slide Up", desc:"Word slides up into place", sample:"SLIDE", anim:"up", file:"Text Slide Up Word.ffx" },
      { id:"textStyle1", name:"Text Style 1", desc:"Preset style one entrance", sample:"STYLE1", anim:"pop", file:"Text Style 1.ffx" },
      { id:"textStyle2", name:"Text Style 2", desc:"Preset style two entrance", sample:"STYLE2", anim:"bounce", file:"Text Style 2.ffx" },
      { id:"textStyle3", name:"Text Style 3", desc:"Preset style three entrance", sample:"STYLE3", anim:"up", file:"Text Style 3.ffx" },
      { id:"textStyle4", name:"Text Style 4", desc:"Preset style four entrance", sample:"STYLE4", anim:"fade", file:"Text Style 4.ffx" },
      { id:"viralText", name:"Viral Text", desc:"Bold social-ready viral pop", sample:"VIRAL", anim:"pop", file:"VIRAL TEXT ANIMATION.ffx" },
      { id:"wordBlink", name:"Word Blink", desc:"Whole word blinks on", sample:"WORD", anim:"blink", file:"Word Blink.ffx" },
      { id:"wordByWordDown", name:"Word By Word Down", desc:"Each word drops in downward", sample:"DOWN", anim:"down", file:"Word By Word Down.ffx" },
      { id:"wordByWordLeft", name:"Word By Word Left", desc:"Each word slides in from right", sample:"LEFT", anim:"left", file:"Word By Word Left.ffx" },
      { id:"wordByWordRight", name:"Word By Word Right", desc:"Each word slides in from left", sample:"RIGHT", anim:"right", file:"Word By Word Right.ffx" },
      { id:"wordByWordUp", name:"Word By Word Up", desc:"Each word rises in upward", sample:"UP", anim:"up", file:"Word By Word Up.ffx" },
      { id:"wordDown", name:"Word Down", desc:"Word drops in from above", sample:"DOWN", anim:"down", file:"Word Down.ffx" },
      { id:"wordRampBlur", name:"Word Ramp + Blur", desc:"Word ramps up with blur", sample:"RAMP", anim:"blur", file:"word ramp up + blur (1).ffx" },
      { id:"wordRight", name:"Word Right", desc:"Word slides in from the left", sample:"RIGHT", anim:"right", file:"Word Right.ffx" },
      { id:"erfanOpacityFlicker", name:"Opacity Flicker", desc:"Erfan flicker-based text reveal", sample:"FLICK", anim:"blink", file:"Opacity Flicker.ffx" },
      { id:"erfanOpacityPosition", name:"Opacity Position", desc:"Opacity and position entrance", sample:"MOVE", anim:"up", file:"Opacity Postion.ffx" },
      { id:"erfanPositionWiggle", name:"Position Wiggle", desc:"Energetic position wiggle", sample:"WIGGLE", anim:"bounce", file:"Postion Wiggle.ffx" },
      { id:"erfanText3", name:"Erfan Text 3", desc:"Erfan animated text style 3", sample:"TEXT3", anim:"up", file:"Text Animation 3.ffx" },
      { id:"erfanText4", name:"Erfan Text 4", desc:"Erfan animated text style 4", sample:"TEXT4", anim:"bounce", file:"Text Animation 4.ffx" },
      { id:"erfanText6", name:"Erfan Text 6", desc:"Erfan animated text style 6", sample:"TEXT6", anim:"right", file:"Text Animation 6.ffx" },
      { id:"erfanText7", name:"Erfan Text 7", desc:"Erfan animated text style 7", sample:"TEXT7", anim:"bounce", file:"Text Animation 7.ffx" },
      { id:"erfanText8", name:"Erfan Text 8", desc:"Erfan animated text style 8", sample:"TEXT8", anim:"pop", file:"Text Animation 8.ffx" },
      { id:"erfanText9", name:"Erfan Text 9", desc:"Erfan animated text style 9", sample:"TEXT9", anim:"left", file:"Text Animation 9.ffx" },
      { id:"erfanText1", name:"Erfan Text 1", desc:"Erfan animated text style 1", sample:"TEXT1", anim:"up", file:"Text Animation_1.ffx" },
      { id:"erfanText2", name:"Erfan Text 2", desc:"Erfan animated text style 2", sample:"TEXT2", anim:"down", file:"Text Animation_2.ffx" },
      { id:"erfanTextEvo", name:"TextEvo", desc:"Evolving high-energy text animation", sample:"EVO", anim:"pop", file:"TextEvo.ffx" },
      { id:"voxAppearRandom", name:"VOX Appear Random", desc:"Randomized text appearance", sample:"RANDOM", anim:"blink", file:"AppearRandom.ffx" },
      { id:"voxFillAnimation", name:"VOX Fill Animation", desc:"Animated fill treatment", sample:"FILL", anim:"rainbow", file:"FillAnimation.ffx" },
      { id:"voxFlickerGlow", name:"VOX Flicker + Glow", desc:"Flickering luminous text reveal", sample:"GLOW", anim:"blink", file:"Flicker and Glow.ffx" },
      { id:"voxLoadUp", name:"VOX Load Up", desc:"Loading-style upward reveal", sample:"LOAD", anim:"up", file:"LoadUp.ffx" },
      { id:"voxTextJitter", name:"VOX Text Jitter", desc:"Fast jittering text motion", sample:"JITTER", anim:"bounce", file:"Text Jitter.ffx" }
    ];
    var SIMPLE_CAPTION_DEFAULT_TEMPLATE = "alphabetBlink";

    function describeCaptionTemplate(template) {
      return (template && template.desc) ? String(template.desc) : "Premium style applied to every caption";
    }
    function captionStylePreviewChars(sample) {
      return String(sample || "TEXT").slice(0, 7).split("").map(function (ch) {
        return '<span class="tanim-pchar">' + String(ch).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</span>";
      }).join("");
    }
    function simpleFontLabel(font) {
      var family = String((font && font.family) || (font && font.postScript) || "");
      var style = String((font && font.style) || "Regular");
      return family + (style && family.toLowerCase().indexOf(style.toLowerCase()) < 0 ? " · " + style : "");
    }
    function parseSimpleFontCatalog(parsed) {
      var fonts = [];
      if (parsed && parsed.path && fs) {
        try {
          var raw = fs.readFileSync(parsed.path, "utf8");
          String(raw || "").split(/\r?\n/).forEach(function (line) {
            var parts = line.split("\t");
            if (parts.length < 3 || !parts[2]) return;
            fonts.push({ family: parts[0], style: parts[1], postScript: parts[2] });
          });
        } catch (readError) { auditFallback("MAIN_SIMPLE_FONT_FILE_001", readError); }
      }
      if (!fonts.length && parsed && Array.isArray(parsed.data)) {
        parsed.data.forEach(function (font) {
          if (font && font.postScript) fonts.push({ family: font.family || font.postScript, style: font.style || "Regular", postScript: font.postScript });
        });
      }
      return fonts;
    }
    function scanOsFontFallback() {
      if (!fs || !path) return [];
      var dirs = [];
      try {
        var home = (os && os.homedir && os.homedir()) || "";
        var plat = (nodeProcess && nodeProcess.platform) || (os && os.platform && os.platform()) || "";
        if (plat === "win32") {
          dirs.push("C:\\Windows\\Fonts");
          if (home) dirs.push(path.join(home, "AppData", "Local", "Microsoft", "Windows", "Fonts"));
        } else {
          dirs.push("/System/Library/Fonts", "/Library/Fonts");
          if (home) dirs.push(path.join(home, "Library", "Fonts"));
        }
      } catch (dirError) { auditFallback("MAIN_SIMPLE_FONT_OSDIRS_001", dirError); }
      var seen = {};
      var fonts = [];
      dirs.forEach(function (dir) {
        var files;
        try { files = fs.readdirSync(dir); } catch (readError) { return; }
        files.forEach(function (name) {
          if (!/\.(ttf|otf|ttc|otc)$/i.test(name)) return;
          var family = name.replace(/\.(ttf|otf|ttc|otc)$/i, "").replace(/[_-]+/g, " ");
          var key = family.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          fonts.push({ family: family, style: "Regular", postScript: family });
        });
      });
      fonts.sort(function (a, b) { return a.family.toLowerCase() < b.family.toLowerCase() ? -1 : 1; });
      return fonts;
    }
    function renderSimpleFontOptions(query) {
      var needle = String(query || "").toLowerCase().replace(/^\s+|\s+$/g, "");
      var saved = "";
      try { saved = localStorage.getItem("compxSimpleCaptionFont") || ""; } catch (fontStorageError) { saved = simpleFontInput ? simpleFontInput.value : ""; }
      if (simpleFontInput) {
        simpleFontInput.innerHTML = "";
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "System default";
        simpleFontInput.appendChild(empty);
      }
      if (simpleFontList) simpleFontList.innerHTML = "";
      var shown = 0;
      simpleFontCatalog.forEach(function (font) {
        if (!font || !font.postScript) return;
        var label = simpleFontLabel(font);
        var hay = (label + " " + font.postScript).toLowerCase();
        if (needle && hay.indexOf(needle) < 0) return;
        shown++;
        if (simpleFontInput) {
          var option = document.createElement("option");
          option.value = font.postScript;
          option.textContent = label;
          simpleFontInput.appendChild(option);
        }
        if (simpleFontList) {
          var listOption = document.createElement("option");
          listOption.value = font.postScript;
          listOption.label = label;
          simpleFontList.appendChild(listOption);
        }
      });
      if (simpleFontInput && saved) {
        var match = Array.prototype.some.call(simpleFontInput.options, function (opt) { return opt.value === saved; });
        simpleFontInput.value = match ? saved : "";
        if (!match && !needle) {
          var custom = document.createElement("option");
          custom.value = saved;
          custom.textContent = saved;
          simpleFontInput.appendChild(custom);
          simpleFontInput.value = saved;
        }
      }
      if (simpleFontStatus) {
        simpleFontStatus.textContent = needle
          ? shown + " match" + (shown === 1 ? "" : "es") + " · " + simpleFontCatalog.length + " installed"
          : simpleFontCatalog.length + " system fonts ready · search, then select.";
      }
    }
    function resolveSimpleCaptionFont() {
      var picked = simpleFontInput ? String(simpleFontInput.value || "").replace(/^\s+|\s+$/g, "") : "";
      if (picked) return picked;
      var typed = simpleFontSearch ? String(simpleFontSearch.value || "").replace(/^\s+|\s+$/g, "") : "";
      if (!typed) return "";
      var q = typed.toLowerCase();
      var familyRegular = "";
      var familyAny = "";
      simpleFontCatalog.forEach(function (font) {
        if (!font || !font.postScript) return;
        if (String(font.postScript).toLowerCase() === q) familyRegular = font.postScript;
        else if (String(font.family || "").toLowerCase() === q) {
          if (!familyAny) familyAny = font.postScript;
          if (/^(regular|normal|roman)$/i.test(font.style || "")) familyRegular = font.postScript;
        }
      });
      return familyRegular || familyAny || typed;
    }
    function loadSimpleSystemFonts(showResultToast) {
      if (!simpleFontLoadButton) return;
      simpleFontLoadButton.disabled = true;
      simpleFontLoadButton.textContent = "...";
      if (simpleFontStatus) simpleFontStatus.textContent = "Reading fonts available in After Effects...";
      callHost("ae_getSystemFonts()", function (parsed) {
        simpleFontLoadButton.disabled = false;
        simpleFontLoadButton.textContent = "↻";
        var fonts = parseSimpleFontCatalog(parsed);
        if (!fonts.length) fonts = scanOsFontFallback();
        if (!fonts.length) {
          if (simpleFontStatus) simpleFontStatus.textContent = (parsed && parsed.message) || "Could not read installed fonts.";
          if (showResultToast) showToast((parsed && parsed.message) || "Could not read installed fonts", true);
          return;
        }
        simpleFontCatalog = fonts;
        renderSimpleFontOptions(simpleFontSearch ? simpleFontSearch.value : "");
        if (showResultToast) showToast(fonts.length + " system fonts loaded");
      }, 30000);
    }
    function applyCaptionTemplate(template, button, persist) {
      selectedCaptionTemplate = template;
      if (typeof paintRecap === "function") paintRecap();
      if (templateGrid) Array.prototype.forEach.call(templateGrid.querySelectorAll(".tanim-card"), function (card) { card.classList.toggle("active", card === button); card.setAttribute("aria-pressed", String(card === button)); });
      if (templateSelected) {
        templateSelected.querySelector("strong").textContent = template.name;
        templateSelected.querySelector("span").textContent = describeCaptionTemplate(template);
      }
      if (persist !== false) {
        try {
          localStorage.setItem("compxSimpleCaptionAnimation", template.id);
        }
        catch (storageError) { /* CEP privacy mode can disable persistent storage. */ }
      }
    }
    function clearCaptionTemplate(persist) {
      selectedCaptionTemplate = null;
      if (typeof paintRecap === "function") paintRecap();
      if (templateGrid) Array.prototype.forEach.call(templateGrid.querySelectorAll(".tanim-card"), function (card) { card.classList.remove("active"); card.setAttribute("aria-pressed", "false"); });
      if (templateSelected) {
        templateSelected.querySelector("strong").textContent = "No animation";
        templateSelected.querySelector("span").textContent = "Captions appear as plain text. Pick a style above to animate them.";
      }
      if (persist !== false) {
        try {
          localStorage.removeItem("compxSimpleCaptionAnimation");
        }
        catch (storageError) { /* CEP privacy mode can disable persistent storage. */ }
      }
    }
    function renderCaptionTemplates() {
      if (!templateGrid) return;
      templateGrid.innerHTML = "";
      simpleCaptionTemplates.forEach(function (template) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "tanim-card";
        card.setAttribute("data-tanim", template.id);
        card.setAttribute("aria-pressed", "false");
        card.setAttribute("title", template.name + " — " + describeCaptionTemplate(template));
        card.innerHTML =
          '<div class="tanim-card-preview tanim-fx-' + (template.anim || "pop") + '">' +
            '<div class="tanim-card-badge">TEXT</div>' +
            '<div class="tanim-card-stage">' +
              '<div class="tanim-card-word">' + captionStylePreviewChars(template.sample || template.name) + "</div>" +
              '<div class="tanim-card-glow"></div>' +
            "</div>" +
          "</div>" +
          '<div class="tanim-card-meta">' +
            '<div class="tanim-card-title"></div>' +
            '<div class="tanim-card-sub"></div>' +
          "</div>";
        card.querySelector(".tanim-card-title").textContent = template.name;
        card.querySelector(".tanim-card-sub").textContent = describeCaptionTemplate(template);
        card.addEventListener("click", function () { applyCaptionTemplate(template, card, true); });
        templateGrid.appendChild(card);
      });
      var savedId = "";
      try { savedId = localStorage.getItem("compxSimpleCaptionAnimation") || ""; }
      catch (storageError) { /* Continue with the default unselected state. */ }
      var restored = false;
      if (savedId) {
        restored = simpleCaptionTemplates.some(function (template, index) {
          if (template.id !== savedId) return false;
          applyCaptionTemplate(template, templateGrid.children[index], false);
          return true;
        });
      }
      // Premium default: preselect the recommended animation so Create Captions
      // works immediately; the user can still pick another card or clear it.
      if (!restored) {
        simpleCaptionTemplates.some(function (template, index) {
          if (template.id !== SIMPLE_CAPTION_DEFAULT_TEMPLATE) return false;
          applyCaptionTemplate(template, templateGrid.children[index], false);
          return true;
        });
      }
    }
    if (templateClear) templateClear.addEventListener("click", function () { clearCaptionTemplate(true); });
    if (simpleFontLoadButton) simpleFontLoadButton.addEventListener("click", function () { loadSimpleSystemFonts(true); });
    if (simpleFontSearch) {
      simpleFontSearch.addEventListener("input", function () {
        renderSimpleFontOptions(simpleFontSearch.value);
      });
    }
    if (simpleFontInput) {
      simpleFontInput.addEventListener("change", function () {
        try { localStorage.setItem("compxSimpleCaptionFont", simpleFontInput.value || ""); }
        catch (fontStorageError) { auditFallback("MAIN_SIMPLE_CAPTION_FONT_SAVE_001", fontStorageError); }
        if (simpleFontSearch && simpleFontInput.selectedIndex > 0) {
          simpleFontSearch.value = simpleFontInput.options[simpleFontInput.selectedIndex].textContent || "";
        }
      });
    }

    function transcriptionPercent(message) {
      var match = String(message || "").match(/progress\s*=\s*(\d{1,3})%/i) || String(message || "").match(/\b(\d{1,3})%\b/);
      return match ? Math.max(0, Math.min(100, Number(match[1]) || 0)) : null;
    }
    function friendlyTranscriptionStatus(message, percent) {
      var value = String(message || "").trim();
      if (/failed|error|exited with code|unavailable|cancelled/i.test(value)) return value;
      if (/Preparing audio locally|FFmpeg/i.test(value)) return "Preparing audio with FFmpeg…";
      if (/Advanced filters unavailable/i.test(value)) return "Optimizing audio with compatible filters…";
      if (/Transcribing locally/i.test(value)) return "Whisper is transcribing locally…";
      if (/Whisper:/i.test(value) && percent !== null) return "Transcribing speech…";
      if (/runtime download|open Settings/i.test(value)) return "Waiting for the local transcription runtime…";
      return value || "Starting local transcription…";
    }
    function updateSimpleTranscriptionProgress(state, message) {
      if (!transcribeProgress) return;
      var active = state === "busy";
      var percent = transcriptionPercent(message);
      root.classList.toggle("is-transcribing", active);
      root.setAttribute("aria-busy", active ? "true" : "false");
      transcribeProgress.hidden = state === "idle";
      transcribeProgress.classList.toggle("is-indeterminate", active && percent === null);
      transcribeProgress.classList.toggle("is-error", state === "error");
      transcribeProgress.classList.toggle("is-complete", state === "complete");
      if (transcribeProgressText) transcribeProgressText.textContent = friendlyTranscriptionStatus(message, percent);
      if (transcribeProgressPercent) transcribeProgressPercent.textContent = state === "error" ? "FAILED" : (state === "complete" ? "DONE" : (percent === null ? "WORKING" : percent + "%"));
      if (transcribeProgressBar) transcribeProgressBar.style.width = (state === "complete" ? 100 : (percent === null ? 0 : percent)) + "%";
      if (transcribe) transcribe.textContent = active ? ("TRANSCRIBING" + (percent === null ? "…" : " · " + percent + "%")) : "TRANSCRIBE MEDIA";
      if (mediaPick) mediaPick.disabled = active;
      if (simpleModel) simpleModel.disabled = active;
      if (simpleLanguage) simpleLanguage.disabled = active;
    }

    function setStatus(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className = "hint " + (kind || "");
    }
    function timeToSeconds(value) {
      var text = String(value || "").trim();
      var match = text.match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})/);
      if (match) {
        var millis = String(match[4] || "0");
        while (millis.length < 3) millis += "0";
        return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(millis.substring(0, 3)) / 1000;
      }
      // Short MM:SS[.,]fff timestamps are common in SRTs exported by
      // CapCut/YouTube/auto-caption tools; accept them like the other parsers.
      var shortMatch = text.match(/^(\d{1,3}):(\d{2})[,.](\d{1,3})/);
      if (!shortMatch) return null;
      var shortMillis = String(shortMatch[3] || "0");
      while (shortMillis.length < 3) shortMillis += "0";
      return Number(shortMatch[1]) * 60 + Number(shortMatch[2]) + Number(shortMillis.substring(0, 3)) / 1000;
    }
    function parseSrt(source) {
      var cues = [], invalid = 0;
      String(source || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim().split(/\n\s*\n+/).forEach(function (block) {
        var lines = block.split("\n"), timingIndex = -1;
        for (var i = 0; i < lines.length; i++) if (lines[i].indexOf("-->") >= 0) { timingIndex = i; break; }
        if (timingIndex < 0) { if (block.trim()) invalid++; return; }
        var timing = lines[timingIndex].split("-->");
        var start = timeToSeconds(timing[0]), end = timeToSeconds(timing[1]);
        var text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (start === null || end === null || end <= start || !text) { invalid++; return; }
        cues.push({ start:start, end:end, text:text });
      });
      cues.sort(function (a, b) { return a.start - b.start; });
      return { cues:cues, invalid:invalid };
    }
    function parseSrtResilient(source) {
      var cues = [], invalid = 0;
      var normalized = String(source || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
      if (!normalized) return { cues:cues, invalid:invalid };
      var lines = normalized.split("\n"), timingLines = [];
      // Parse by timestamp boundaries instead of requiring blank lines. Whisper,
      // Premiere and web caption tools can omit the empty line between cues.
      for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (lines[lineIndex].indexOf("-->") >= 0) timingLines.push(lineIndex);
      }
      if (!timingLines.length) return { cues:cues, invalid:1 };
      timingLines.forEach(function (timingIndex, cueIndex) {
        var timing = lines[timingIndex].split("-->");
        var start = timeToSeconds(timing[0]);
        var end = timing.length === 2 ? timeToSeconds(timing[1]) : null;
        var textEnd = cueIndex + 1 < timingLines.length ? timingLines[cueIndex + 1] : lines.length;
        // Do not append the next cue's numeric id to the current caption.
        if (textEnd > timingIndex + 1 && /^\s*\d+\s*$/.test(lines[textEnd - 1])) textEnd--;
        var text = lines.slice(timingIndex + 1, textEnd).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (start === null || end === null || end <= start || !text) { invalid++; return; }
        cues.push({ start:start, end:end, text:text });
      });
      cues.sort(function (a, b) { return a.start - b.start; });
      return { cues:cues, invalid:invalid };
    }

    var simpleStages = Array.prototype.slice.call(root.querySelectorAll("[data-simple-caption-stage]"));
    var simpleStagePanels = Array.prototype.slice.call(root.querySelectorAll("[data-simple-stage-panel]"));
    function setSimpleStage(name) {
      simpleStages.forEach(function (step) { step.classList.toggle("active", step.getAttribute("data-simple-caption-stage") === name); });
      simpleStagePanels.forEach(function (panel) { panel.hidden = panel.getAttribute("data-simple-stage-panel") !== name; });
    }
    function unlockSimpleStages(hasCues) {
      simpleStages.forEach(function (step) {
        if (step.getAttribute("data-simple-caption-stage") !== "source") step.disabled = !hasCues;
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll("[data-simple-go]"), function (btn) {
      btn.addEventListener("click", function () {
        var stepBtn = root.querySelector('[data-simple-caption-stage="' + btn.getAttribute("data-simple-go") + '"]');
        if (stepBtn && !stepBtn.disabled) stepBtn.click();
      });
    });
    var langHint = document.getElementById("simpleLangHint");
    function paintLangHint() {
      if (!langHint) return;
      var small = !simpleModel || simpleModel.value === "tiny" || simpleModel.value === "base";
      langHint.hidden = !(simpleLanguage && simpleLanguage.value === "bn" && small);
    }
    simpleLanguage?.addEventListener("change", paintLangHint);
    simpleModel?.addEventListener("change", paintLangHint);
    paintLangHint();
    simpleStages.forEach(function (step) {
      step.addEventListener("click", function () {
        if (step.disabled) return;
        var stage = step.getAttribute("data-simple-caption-stage");
        setSimpleStage(stage);
        var target = root.querySelector('[data-simple-stage-panel="' + stage + '"]');
        if (target) {
          try { target.scrollIntoView({ block:"nearest", behavior:"smooth" }); }
          catch (scrollError) { target.scrollIntoView(false); }
        }
      });
    });

    function refresh() {
      var parsed = parseSrtResilient(editor ? editor.value : "");
      if (editor) editor.classList.toggle("has-cues", parsed.cues.length > 0);
      if (count) {
        count.textContent = parsed.cues.length + " valid cue" + (parsed.cues.length === 1 ? "" : "s") + (parsed.invalid ? " · " + parsed.invalid + " invalid block(s) ignored" : " · timing ready");
        count.classList.toggle("has-error", parsed.invalid > 0);
      }
      var range = document.getElementById("simpleSrtRange");
      if (range) {
        if (parsed.cues.length) {
          var clock = function (seconds) {
            var whole = Math.max(0, Math.round(Number(seconds) || 0));
            var mins = Math.floor(whole / 60);
            var secs = whole - mins * 60;
            return mins + ":" + (secs < 10 ? "0" : "") + secs;
          };
          range.textContent = clock(parsed.cues[0].start) + " – " + clock(parsed.cues[parsed.cues.length - 1].end);
        } else {
          range.textContent = "";
        }
      }
      if (generate) generate.disabled = parsed.cues.length === 0;
      unlockSimpleStages(parsed.cues.length > 0);
      paintTimingReport(parsed);
      paintRecap();
      return parsed;
    }

    // What the SRT will actually do on the timeline: overlaps are trimmed to
    // the next cue, very short cues flash, very long ones sit on screen.
    function srtClock(seconds) {
      var ms = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
      var m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60, cs = Math.floor(ms % 1000 / 10);
      return m + ":" + (sec < 10 ? "0" : "") + sec + "." + (cs < 10 ? "0" : "") + cs;
    }
    function paintTimingReport(parsed) {
      var box = document.getElementById("simpleSrtTiming");
      var list = document.getElementById("simpleSrtCueList");
      var cues = parsed.cues, overlaps = 0, short = 0, long = 0, i;
      var flags = [];
      for (i = 0; i < cues.length; i++) {
        var f = [];
        if (i + 1 < cues.length && cues[i + 1].start < cues[i].end - 0.001) { overlaps++; f.push("overlaps next"); }
        var d = cues[i].end - cues[i].start;
        if (d < 0.3) { short++; f.push("very short"); }
        else if (d > 7) { long++; f.push("long"); }
        flags.push(f);
      }
      if (box) {
        if (!cues.length) { box.innerHTML = ""; }
        else {
          var bits = [];
          if (overlaps) bits.push(overlaps + " overlap" + (overlaps === 1 ? "" : "s") + " (each is trimmed to the next cue)");
          if (short) bits.push(short + " under 0.3s");
          if (long) bits.push(long + " over 7s");
          if (parsed.invalid) bits.push(parsed.invalid + " invalid block" + (parsed.invalid === 1 ? "" : "s") + " skipped");
          box.className = "cx-srt-timing " + (bits.length ? "has-warn" : "is-ok");
          box.textContent = bits.length ? "Timing: " + bits.join(" · ") + "." : "Timing looks good: no overlaps, nothing too short or too long.";
        }
      }
      if (list) {
        var html = "", show = Math.min(cues.length, 200);
        for (i = 0; i < show; i++) {
          html += '<li class="' + (flags[i].length ? "has-warn" : "") + '"><time>' + srtClock(cues[i].start) + " → " + srtClock(cues[i].end) + "</time><span>" +
            escapeHtml(cues[i].text) + "</span>" + (flags[i].length ? "<em>" + flags[i].join(", ") + "</em>" : "") + "</li>";
        }
        if (cues.length > show) html += "<li><span>… " + (cues.length - show) + " more</span></li>";
        list.innerHTML = html;
      }
    }
    function paintRecap() {
      var recap = document.getElementById("simpleSrtRecap");
      if (!recap) return;
      var pos = document.getElementById("simpleSrtPosition");
      var size = document.getElementById("simpleSrtFontSize");
      var font = (simpleFontInput && simpleFontInput.value) || "System default";
      recap.textContent = "Animation: " + (selectedCaptionTemplate ? selectedCaptionTemplate.name : "None (plain captions)") +
        " · Font: " + font + " · " + ((size && size.value) || 72) + " px · " +
        (pos && pos.options[pos.selectedIndex] ? pos.options[pos.selectedIndex].text : "Bottom");
    }
    ["simpleSrtPosition", "simpleSrtFontSize", "simpleSrtFont"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("change", paintRecap); el.addEventListener("input", paintRecap); }
    });
    function readFile(file) {
      if (!file) return;
      if (!/\.srt$/i.test(String(file.name || ""))) { setStatus("Choose a standard .srt file.", "error"); return; }
      var promise;
      if (fs && file.path) promise = fs.promises.readFile(file.path, "utf8");
      else if (typeof file.text === "function") promise = file.text();
      else promise = Promise.reject(new Error("This CEP runtime cannot read the selected SRT."));
      promise.then(function (text) {
        editor.value = String(text || "");
        if (fileName) fileName.textContent = file.name || file.path || "SRT loaded";
        var parsed = refresh();
        if (parsed.cues.length) setSimpleStage("review");
        setStatus(parsed.cues.length ? "SRT ready. Check the timing, then pick an animation and font." : "No valid SRT cues were found.", parsed.cues.length ? "ok" : "error");
      }).catch(function (error) { setStatus("Could not read SRT: " + error.message, "error"); });
    }

    function syncTranscriptionSettings() {
      if (legacyModel && simpleModel) legacyModel.value = simpleModel.value;
      if (legacyLanguage && simpleLanguage) legacyLanguage.value = simpleLanguage.value;
    }
    mediaPick?.addEventListener("click", function () {
      var captionApi = window.CompXCaptionTranscriber;
      if (captionApi && captionApi.chooseMedia && captionApi.chooseMedia()) return;
      if (legacyMediaPick) legacyMediaPick.click();
      else if (legacyMediaInput) { legacyMediaInput.value = ""; legacyMediaInput.click(); }
    });
    legacyMediaInput?.addEventListener("change", function () {
      var file = legacyMediaInput.files && legacyMediaInput.files[0];
      mediaReady = !!(file && file.path);
      if (mediaName) mediaName.textContent = file ? (file.name || file.path || "Media selected") : "No media selected";
      if (transcribe) transcribe.disabled = !mediaReady;
      if (file) setStatus(mediaReady ? "Media ready. Choose language/model and click Transcribe." : "CEP could not access the selected media path.", mediaReady ? "ok" : "error");
    });
    document.addEventListener("compx:caption-media-ready", function (event) {
      var detail = event && event.detail ? event.detail : {};
      mediaReady = !!detail.ready;
      if (mediaName) mediaName.textContent = detail.name || (mediaReady ? "Media selected" : "No media selected");
      if (transcribe) transcribe.disabled = !mediaReady;
      updateSimpleTranscriptionProgress("idle", "");
      setStatus(mediaReady ? "Media ready. Choose language/model and click Transcribe." : "CEP could not access the selected media path.", mediaReady ? "ok" : "error");
    });
    simpleModel?.addEventListener("change", syncTranscriptionSettings);
    simpleLanguage?.addEventListener("change", syncTranscriptionSettings);
    transcribe?.addEventListener("click", function () {
      if (!mediaReady) { setStatus("Choose an audio or video file first.", "error"); return; }
      syncTranscriptionSettings();
      transcriptionRequested = true;
      transcribe.disabled = true;
      setStatus("Starting local transcription…", "busy");
      updateSimpleTranscriptionProgress("busy", "Starting local transcription…");
      var captionApi = window.CompXCaptionTranscriber;
      if (captionApi && captionApi.start) {
        var result = captionApi.start({
          model: simpleModel ? simpleModel.value : "base",
          language: simpleLanguage ? simpleLanguage.value : ""
        }) || {};
        if (result.failed) {
          transcriptionRequested = false;
          transcribe.disabled = !mediaReady;
          updateSimpleTranscriptionProgress("error", "Local transcription could not start.");
        }
        return;
      }
      transcriptionRequested = false;
      transcribe.disabled = !mediaReady;
      updateSimpleTranscriptionProgress("error", "Local transcription engine is unavailable.");
      setStatus("Local transcription engine is unavailable.", "error");
    });
    document.addEventListener("compx:caption-transcription-status", function (event) {
      if (!transcriptionRequested) return;
      var detail = event && event.detail ? event.detail : {};
      var message = String(detail.message || "").trim();
      if (!message) return;
      var kind = detail.kind || (/failed|error|unavailable|choose|cancelled/i.test(message) ? "error" : "busy");
      setStatus(message.replace("continue to Style", "review the SRT, then Create Captions"), kind);
      updateSimpleTranscriptionProgress(kind === "error" ? "error" : (/complete/i.test(message) ? "complete" : "busy"), message);
      if (kind === "error") {
        transcriptionRequested = false;
        if (transcribe) transcribe.disabled = !mediaReady;
      }
    });
    document.addEventListener("compx:srt-ready", function (event) {
      var detail = event && event.detail ? event.detail : {};
      var srt = String(detail.srt || "");
      if (!srt) return;
      transcriptionRequested = false;
      if (editor) editor.value = srt;
      if (fileName) fileName.textContent = "Local transcription result";
      var parsed = refresh();
      if (transcribe) transcribe.disabled = !mediaReady;
      updateSimpleTranscriptionProgress("complete", "Transcription complete: " + parsed.cues.length + " cue(s).");
      if (parsed.cues.length) setSimpleStage("review");
      setStatus("Transcription complete: " + parsed.cues.length + " cue(s). Check the timing, then pick an animation and font.", parsed.cues.length ? "ok" : "error");
    });
    if (legacyStatus && typeof MutationObserver !== "undefined") {
      new MutationObserver(function () {
        if (!transcriptionRequested) return;
        var message = String(legacyStatus.textContent || "").trim();
        if (!message) return;
        var lower = message.toLowerCase();
        var kind = /failed|error|unavailable|choose|cancelled/.test(lower) ? "error" : (/complete|ready/.test(lower) ? "ok" : "busy");
        setStatus(message.replace("continue to Style", "review the SRT, then Create Captions"), kind);
        updateSimpleTranscriptionProgress(kind === "error" ? "error" : (/complete/i.test(message) ? "complete" : "busy"), message);
        if (kind === "error" && transcribe) {
          transcriptionRequested = false;
          transcribe.disabled = !mediaReady;
        }
      }).observe(legacyStatus, { childList:true, subtree:true, characterData:true });
    }

    pickButton?.addEventListener("click", function () { fileInput?.click(); });
    fileInput?.addEventListener("change", function () { readFile(fileInput.files && fileInput.files[0]); });
    ["dragenter", "dragover"].forEach(function (type) { pickButton?.addEventListener(type, function (event) { event.preventDefault(); pickButton.classList.add("dragover"); }); });
    ["dragleave", "drop"].forEach(function (type) { pickButton?.addEventListener(type, function (event) { event.preventDefault(); pickButton.classList.remove("dragover"); }); });
    pickButton?.addEventListener("drop", function (event) { readFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]); });
    editor?.addEventListener("input", refresh);
    generate?.addEventListener("click", function () {
      var parsed = refresh();
      if (!parsed.cues.length) { setStatus("Load a valid SRT first.", "error"); return; }
      // The animation is optional: without one the captions are plain text.
      var activeTemplate = selectedCaptionTemplate && selectedCaptionTemplate.file ? selectedCaptionTemplate : null;
      var timingBase = document.getElementById("simpleSrtTimingBase");
      var payload = {
        cues: parsed.cues.map(function (cue) { return { start:cue.start, end:cue.end, text:cue.text }; }),
        position: document.getElementById("simpleSrtPosition").value,
        textAnimationPreset: activeTemplate ? activeTemplate.file : "",
        textAnimationName: activeTemplate ? activeTemplate.name : "",
        timingBase: timingBase ? timingBase.value : "comp",
        font: resolveSimpleCaptionFont(),
        fontSize: Number(document.getElementById("simpleSrtFontSize").value) || 72,
        shadow: document.getElementById("simpleSrtShadow").checked
      };
      generate.disabled = true;
      setStatus("Creating " + parsed.cues.length + " captions" + (activeTemplate ? " with " + activeTemplate.name : "") + "…", "busy");
      callHost("ae_createSimpleSrtCaptions(" + hostArg(JSON.stringify(payload)) + ")", function (result) {
        generate.disabled = false;
        if (result && result.success) {
          setStatus(result.message || "Captions created.", "ok");
          showToast(result.message || "SRT captions created");
        } else setStatus((result && result.message) || "Caption creation failed.", "error");
      }, 180000);
    });
    renderCaptionTemplates();
    try {
      var savedFontOverride = localStorage.getItem("compxSimpleCaptionFont") || "";
      if (savedFontOverride && simpleFontInput) simpleFontInput.value = savedFontOverride;
    } catch (captionOverrideStorageError) { auditFallback("MAIN_SIMPLE_CAPTION_OVERRIDE_LOAD_001", captionOverrideStorageError); }
    loadSimpleSystemFonts(false);
    setSimpleStage("source");
    refresh();
  }

  

  // ─────────────────────────────────────────────────────────────
  // PRO PANEL — Image Exploder & 3D Element Animator Wire
  // ─────────────────────────────────────────────────────────────

  function wireProPanel() {
    var dropzone = document.getElementById("ssToAeDropzone");
    var fileInput = document.getElementById("ssToAeFileInput");
    var canvas = document.getElementById("ssToAePreviewCanvas");
    var emptyState = document.getElementById("ssToAeEmpty");
    var statusEl = document.getElementById("ssToAeStatus");
    var summaryEl = document.getElementById("ssToAeSummary");
    var previewToolbar = document.getElementById("ssToAePreviewToolbar");
    var buildBtn = document.getElementById("btnSsToAeBuild");
    var analyzeBtn = document.getElementById("btnSsToAeAnalyze");
    var timelineBtn = document.getElementById("btnSsToAeDetectTimeline");
    var modeInput = document.getElementById("ssToAeMode");
    var state = { path: "", name: "", image: null, regions: [], width: 0, height: 0, typeSample: null, hoverId: -1 };

    function setFlowStep(step) {
      var steps = document.querySelectorAll("#ssToAeCard .cx-ssae-flow span");
      for (var si = 0; si < steps.length; si++) steps[si].classList.toggle("is-active", si === step - 1);
    }

    function setStatus(message, error) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle("error", !!error);
    }

    function mimeForPath(filePath) {
      var ext = path ? path.extname(filePath || "").toLowerCase() : String(filePath || "").toLowerCase().replace(/^.*(\.[^.]+)$/, "$1");
      return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    }

    function loadImageData(dataUrl, sourcePath, sourceName) {
      var img = new Image();
      img.onload = function() {
        state.path = sourcePath || "";
        state.name = sourceName || "Screenshot";
        state.image = img;
        state.width = img.naturalWidth || img.width;
        state.height = img.naturalHeight || img.height;
        state.typeSample = null;
        if (emptyState) emptyState.hidden = true;
        if (canvas) canvas.style.display = "block";
        if (previewToolbar) previewToolbar.hidden = false;
        setFlowStep(2);
        analyseRegions();
      };
      img.onerror = function() { setStatus("The selected screenshot could not be decoded.", true); };
      img.src = dataUrl;
    }

    // Writes a clipboard/pasted screenshot (PNG base64) to a real temp file so
    // the rest of the pipeline (analysis, the host-side ae_ssToAeBuild import)
    // sees a file on disk — exactly what Flex's ss-to-ae paste flow does.
    function saveScreenshotBase64(base64, label) {
      if (!fs || !path) throw new Error("Local screenshot storage is unavailable.");
      var os = require("os"), dir = path.join(os.tmpdir(), "CompX_Screenshot_Animator");
      fs.mkdirSync(dir, { recursive: true });
      var filePath = path.join(dir, "pasted_" + label + "_" + Date.now() + ".png");
      fs.writeFileSync(filePath, Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ""), "base64"));
      return filePath;
    }

    function loadFile(file) {
      if (!file) return;
      if (!/\.(png|jpe?g|webp)$/i.test(file.name || "")) { setStatus("Use a PNG, JPG or WEBP screenshot.", true); return; }
      var reader = new FileReader();
      reader.onload = function(event) {
        var sourcePath = file.path || "";
        // CEP fills file.path for <input> picks, but drag-and-drop / pasted files
        // sometimes arrive without it. Fall back to writing a temp copy so the
        // Build step (which needs a real path) still works.
        if (!sourcePath && fs) {
          try { sourcePath = saveScreenshotBase64(event.target.result, String(file.name || "Screenshot").replace(/\.[^.]+$/, "")); }
          catch (saveError) { setStatus("Could not save the screenshot locally: " + saveError.message, true); return; }
        }
        loadImageData(event.target.result, sourcePath, file.name);
      };
      reader.onerror = function() { setStatus("The screenshot could not be read.", true); };
      reader.readAsDataURL(file);
    }

    function loadLocalPath(filePath, sourceName) {
      if (!fs || !filePath) { setStatus("Local screenshot access is unavailable.", true); return; }
      try {
        var bytes = fs.readFileSync(filePath);
        loadImageData("data:" + mimeForPath(filePath) + ";base64," + bytes.toString("base64"), filePath, sourceName || (path && path.basename(filePath)) || "Timeline screenshot");
      } catch (error) { setStatus("Could not read the timeline screenshot: " + error.message, true); }
    }

    function dilate(source, width, height, passes) {
      var current = source;
      for (var pass = 0; pass < passes; pass++) {
        var next = new Uint8Array(current.length);
        for (var y = 1; y < height - 1; y++) {
          var row = y * width;
          for (var x = 1; x < width - 1; x++) {
            var i = row + x;
            if (current[i] || current[i - 1] || current[i + 1] || current[i - width] || current[i + width] || current[i - width - 1] || current[i - width + 1] || current[i + width - 1] || current[i + width + 1]) next[i] = 1;
          }
        }
        current = next;
      }
      return current;
    }

    function detectRegions(img, detail) {
      var maxSide = 960;
      var scale = Math.min(1, maxSide / Math.max(state.width, state.height));
      var w = Math.max(1, Math.round(state.width * scale));
      var h = Math.max(1, Math.round(state.height * scale));
      var work = document.createElement("canvas"); work.width = w; work.height = h;
      var ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      var pixels = ctx.getImageData(0, 0, w, h).data;
      var gray = new Uint8Array(w * h);
      for (var i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = Math.round(pixels[p] * .299 + pixels[p + 1] * .587 + pixels[p + 2] * .114);
      var threshold = [76, 60, 46, 34, 24][Math.max(1, Math.min(5, detail)) - 1];
      var edge = new Uint8Array(w * h);
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var at = y * w + x;
        var gx = Math.abs(gray[at + 1] - gray[at - 1]);
        var gy = Math.abs(gray[at + w] - gray[at - w]);
        if (gx + gy >= threshold) edge[at] = 1;
      }
      edge = dilate(edge, w, h, detail <= 2 ? 2 : 1);
      var seen = new Uint8Array(edge.length), queue = new Int32Array(edge.length), found = [];
      var minSide = [24, 18, 13, 9, 6][detail - 1];
      for (var start = 0; start < edge.length; start++) {
        if (!edge[start] || seen[start]) continue;
        var head = 0, tail = 0; queue[tail++] = start; seen[start] = 1;
        var minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
        while (head < tail) {
          var q = queue[head++], qx = q % w, qy = (q / w) | 0; count++;
          if (qx < minX) minX = qx; if (qx > maxX) maxX = qx; if (qy < minY) minY = qy; if (qy > maxY) maxY = qy;
          for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue; var nx = qx + ox, ny = qy + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var ni = ny * w + nx; if (edge[ni] && !seen[ni]) { seen[ni] = 1; queue[tail++] = ni; }
          }
        }
        var bw = maxX - minX + 1, bh = maxY - minY + 1, area = bw * bh;
        if (bw >= minSide && bh >= Math.max(4, minSide * .45) && area >= minSide * minSide && area < w * h * .78 && count >= Math.max(8, minSide)) {
          var edgeConfidence = Math.min(1, count / Math.max(1, (bw + bh) * 1.6));
          var areaRatio = area / (w * h), sizeScore = areaRatio < .0003 ? .15 : areaRatio < .002 ? .55 : areaRatio < .18 ? 1 : Math.max(.1, 1 - (areaRatio - .18) * 2.2);
          var aspect = Math.max(bw / Math.max(1,bh), bh / Math.max(1,bw)), aspectScore = aspect <= 12 ? 1 : Math.max(.2, 1 - (aspect - 12) / 30);
          var score = edgeConfidence * .52 + sizeScore * .33 + aspectScore * .15;
          found.push({ x:minX, y:minY, w:bw, h:bh, area:area, score:score });
        }
      }
      found.sort(function(a,b){return a.y-b.y||a.x-b.x;});
      var merged=[], consumed=new Uint8Array(found.length);
      for(var ma=0;ma<found.length;ma++){
        if(consumed[ma])continue;var seed=found[ma],box={x:seed.x,y:seed.y,w:seed.w,h:seed.h,area:seed.area,score:seed.score},changed=true;
        while(changed){changed=false;for(var mb=ma+1;mb<found.length;mb++){if(consumed[mb])continue;var candidate=found[mb],top=Math.max(box.y,candidate.y),bottom=Math.min(box.y+box.h,candidate.y+candidate.h),vOverlap=Math.max(0,bottom-top)/Math.max(1,Math.min(box.h,candidate.h)),gap=Math.max(0,Math.max(box.x,candidate.x)-Math.min(box.x+box.w,candidate.x+candidate.w)),heightRatio=Math.max(box.h,candidate.h)/Math.max(1,Math.min(box.h,candidate.h));if(vOverlap>.56&&heightRatio<2.25&&gap<=Math.max(9,Math.max(box.h,candidate.h)*.85)&&Math.max(box.x+box.w,candidate.x+candidate.w)-Math.min(box.x,candidate.x)<w*.7){var nx0=Math.min(box.x,candidate.x),ny0=Math.min(box.y,candidate.y),nx1=Math.max(box.x+box.w,candidate.x+candidate.w),ny1=Math.max(box.y+box.h,candidate.y+candidate.h);box.x=nx0;box.y=ny0;box.w=nx1-nx0;box.h=ny1-ny0;box.area=box.w*box.h;box.score=Math.max(box.score,candidate.score);consumed[mb]=1;changed=true;}}}
        merged.push(box);
      }
      found=merged; found.sort(function(a, b) { return b.score - a.score || b.area - a.area; });
      var kept = [];
      var adaptiveCap = [28,48,75,92,110][Math.max(1,Math.min(5,detail))-1];
      for (var fi = 0; fi < found.length && kept.length < adaptiveCap; fi++) {
        var a = found[fi], duplicate = false;
        for (var ki = 0; ki < kept.length; ki++) {
          var b = kept[ki], ix = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)), iy = Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
          var intersection = ix * iy, union = a.area + b.area - intersection;
          var smaller = Math.min(a.area,b.area), larger = Math.max(a.area,b.area);
          if ((union && intersection / union > .68) || (smaller && intersection / smaller > .94 && smaller / larger > .78)) { duplicate = true; break; }
        }
        if (!duplicate) kept.push(a);
      }
      var inv = 1 / scale;
      var mapped = kept.map(function(r, index) { return { id:index, parent:-1, enabled:true, score:Math.round(r.score*100)/100, x:Math.round(r.x*inv), y:Math.round(r.y*inv), w:Math.round(r.w*inv), h:Math.round(r.h*inv) }; });
      for (var childIndex = 0; childIndex < mapped.length; childIndex++) {
        var child = mapped[childIndex], childArea = child.w * child.h, bestParent = -1, bestArea = Infinity;
        for (var parentIndex = 0; parentIndex < mapped.length; parentIndex++) {
          if (parentIndex === childIndex) continue;
          var parent = mapped[parentIndex], parentArea = parent.w * parent.h;
          if (parentArea <= childArea / .82) continue;
          var overlapW = Math.max(0,Math.min(child.x+child.w,parent.x+parent.w)-Math.max(child.x,parent.x));
          var overlapH = Math.max(0,Math.min(child.y+child.h,parent.y+parent.h)-Math.max(child.y,parent.y));
          if (overlapW*overlapH/Math.max(1,childArea) >= .94 && parentArea < bestArea) { bestArea=parentArea; bestParent=parent.id; }
        }
        child.parent = bestParent;
      }
      var typeCounts={text:0,icon:0,image:0,shape:0}; mapped.forEach(function(region){region.type=ssAssetType(region);typeCounts[region.type]++;region.name=region.type.charAt(0).toUpperCase()+region.type.slice(1)+" "+typeCounts[region.type];});
      return mapped;
    }

    function activeRegions() { return state.regions.filter(function(region) { return region.enabled !== false; }); }

    function ssAssetType(region) {
      var area=region.w*region.h, total=Math.max(1,state.width*state.height), aspect=region.w/Math.max(1,region.h), minFrame=Math.min(state.width,state.height);
      if (region.h<state.height*.075 && aspect>1.35) return "text";
      if (Math.max(region.w,region.h)<minFrame*.12 && aspect>.55 && aspect<1.8) return "icon";
      if (area/total>.045 || (region.w>state.width*.22 && region.h>state.height*.12)) {
        if(!state.typeSample){var sample=document.createElement("canvas"),sampleW=Math.min(320,state.width),sampleH=Math.max(1,Math.round(state.height*sampleW/state.width));sample.width=sampleW;sample.height=sampleH;var sampleCtx=sample.getContext("2d",{willReadFrequently:true});sampleCtx.drawImage(state.image,0,0,sampleW,sampleH);state.typeSample={w:sampleW,h:sampleH,data:sampleCtx.getImageData(0,0,sampleW,sampleH).data};}
        var ts=state.typeSample,x0=Math.max(0,Math.floor(region.x*ts.w/state.width)),y0=Math.max(0,Math.floor(region.y*ts.h/state.height)),x1=Math.min(ts.w,Math.ceil((region.x+region.w)*ts.w/state.width)),y1=Math.min(ts.h,Math.ceil((region.y+region.h)*ts.h/state.height)),sum=0,sumSq=0,n=0,step=Math.max(1,Math.floor(Math.max(x1-x0,y1-y0)/36));
        for(var sy=y0;sy<y1;sy+=step)for(var sx=x0;sx<x1;sx+=step){var si=(sy*ts.w+sx)*4,luma=ts.data[si]*.299+ts.data[si+1]*.587+ts.data[si+2]*.114;sum+=luma;sumSq+=luma*luma;n++;}var variance=n?sumSq/n-(sum/n)*(sum/n):0;if(variance>420)return "image";
      }
      return "shape";
    }

    function ssWriteCanvasPng(canvasEl,filePath) {
      var b64=canvasEl.toDataURL("image/png").replace(/^data:image\/png;base64,/,"");
      fs.writeFileSync(filePath,Buffer.from(b64,"base64"));
    }

    function ssBuildRasterAssets(regions) {
      if (!fs || !path || typeof require === "undefined") throw new Error("Node file access is unavailable.");
      var os=require("os"), dir=path.join(os.tmpdir(),"CompX_Screenshot_Animator",String(Date.now())); fs.mkdirSync(dir,{recursive:true});
      var W=state.width,H=state.height;
      regions=(regions||[]).map(function(r){
        var x=Math.max(0,Math.min(W-1,Math.floor(Number(r.x)||0))),y=Math.max(0,Math.min(H-1,Math.floor(Number(r.y)||0)));
        var x2=Math.max(x+1,Math.min(W,Math.ceil((Number(r.x)||0)+(Number(r.w)||1)))),y2=Math.max(y+1,Math.min(H,Math.ceil((Number(r.y)||0)+(Number(r.h)||1))));
        return {id:r.id,parent:r.parent,type:r.type,name:r.name,score:r.score,x:x,y:y,w:x2-x,h:y2-y};
      }).filter(function(r){return r.w>0&&r.h>0;});
      if(!regions.length)throw new Error("No valid screenshot regions were found.");
      var sw=Math.max(32,Math.min(256,W)),sh=Math.max(20,Math.round(H*sw/W));
      var small=document.createElement("canvas"); small.width=sw; small.height=sh; var sc=small.getContext("2d",{willReadFrequently:true}); sc.drawImage(state.image,0,0,sw,sh);
      var src=sc.getImageData(0,0,sw,sh), mask=new Uint8Array(sw*sh), x,y,i;
      regions.forEach(function(r){var x0=Math.max(0,Math.floor(r.x*sw/W)-1),y0=Math.max(0,Math.floor(r.y*sh/H)-1),x1=Math.min(sw,Math.ceil((r.x+r.w)*sw/W)+1),y1=Math.min(sh,Math.ceil((r.y+r.h)*sh/H)+1);for(y=y0;y<y1;y++)for(x=x0;x<x1;x++)mask[y*sw+x]=1;});
      var colors=new Float64Array(sw*sh*3),known=new Uint8Array(sw*sh),avgR=0,avgG=0,avgB=0,avgN=0;
      for(i=0;i<sw*sh;i++)if(!mask[i]){avgR+=src.data[i*4];avgG+=src.data[i*4+1];avgB+=src.data[i*4+2];avgN++;}
      if(!avgN)for(i=0;i<sw*sh;i++){avgR+=src.data[i*4];avgG+=src.data[i*4+1];avgB+=src.data[i*4+2];avgN++;}
      avgR/=Math.max(1,avgN);avgG/=Math.max(1,avgN);avgB/=Math.max(1,avgN);
      for(i=0;i<sw*sh;i++){colors[i*3]=avgR;colors[i*3+1]=avgG;colors[i*3+2]=avgB;if(!mask[i]){known[i]=1;colors[i*3]=src.data[i*4];colors[i*3+1]=src.data[i*4+1];colors[i*3+2]=src.data[i*4+2];}}
      var queue=new Int32Array(sw*sh),queueHead=0,queueTail=0;
      for(i=0;i<sw*sh;i++)if(known[i])queue[queueTail++]=i;
      while(queueHead<queueTail){
        i=queue[queueHead++];x=i%sw;y=Math.floor(i/sw);
        var neighbours=[i-1,i+1,i-sw,i+sw];
        for(var qn=0;qn<4;qn++){
          var ni=neighbours[qn];
          if(ni<0||ni>=sw*sh||known[ni]||(qn===0&&x===0)||(qn===1&&x===sw-1))continue;
          known[ni]=1;colors[ni*3]=colors[i*3];colors[ni*3+1]=colors[i*3+1];colors[ni*3+2]=colors[i*3+2];queue[queueTail++]=ni;
        }
      }
      var oy,ox,nx,ny;
      for(var pass=0;pass<5;pass++){var copy=new Float64Array(colors);for(y=0;y<sh;y++)for(x=0;x<sw;x++){i=y*sw+x;if(!mask[i])continue;var ar=0,ag=0,ab=0,an=0;for(oy=-1;oy<=1;oy++)for(ox=-1;ox<=1;ox++){nx=x+ox;ny=y+oy;if(nx<0||ny<0||nx>=sw||ny>=sh)continue;ni=ny*sw+nx;ar+=copy[ni*3];ag+=copy[ni*3+1];ab+=copy[ni*3+2];an++;}colors[i*3]=ar/an;colors[i*3+1]=ag/an;colors[i*3+2]=ab/an;}}
      var fillData=sc.createImageData(sw,sh);for(i=0;i<sw*sh;i++){fillData.data[i*4]=colors[i*3];fillData.data[i*4+1]=colors[i*3+1];fillData.data[i*4+2]=colors[i*3+2];fillData.data[i*4+3]=255;}sc.putImageData(fillData,0,0);
      var original=document.createElement("canvas");original.width=W;original.height=H;var originalCtx=original.getContext("2d",{willReadFrequently:true});originalCtx.drawImage(state.image,0,0,W,H);
      var fillFull=document.createElement("canvas");fillFull.width=W;fillFull.height=H;var fillCtx=fillFull.getContext("2d",{willReadFrequently:true});fillCtx.imageSmoothingEnabled=true;fillCtx.drawImage(small,0,0,W,H);
      var masks=[];
      regions.forEach(function(r){
        var type=r.type||ssAssetType(r),mc=document.createElement("canvas");mc.width=r.w;mc.height=r.h;var mctx=mc.getContext("2d",{willReadFrequently:true});
        if(type==="image"){mctx.fillStyle="#fff";mctx.fillRect(0,0,r.w,r.h);}else{
          var fg=originalCtx.getImageData(r.x,r.y,r.w,r.h),bg=fillCtx.getImageData(r.x,r.y,r.w,r.h),md=mctx.createImageData(r.w,r.h),d=fg.data,b=bg.data;
          for(var pi=0;pi<d.length;pi+=4){var dr=Math.abs(d[pi]-b[pi]),dg=Math.abs(d[pi+1]-b[pi+1]),db=Math.abs(d[pi+2]-b[pi+2]),dist=(dr*3+dg*4+db*2)/9;md.data[pi+3]=dist<=4?0:dist>=24?255:Math.round((dist-4)/20*255);}
          if(type==="shape"){var solid=0;for(var py=0;py<r.h;py++){var first=-1,last=-1;for(var px=0;px<r.w;px++)if(md.data[(py*r.w+px)*4+3]>16){if(first<0)first=px;last=px;}for(px=first;px>=0&&px<=last;px++){md.data[(py*r.w+px)*4+3]=255;solid++;}}if(solid<r.w*r.h*.16)for(pi=3;pi<md.data.length;pi+=4)md.data[pi]=255;}
          mctx.putImageData(md,0,0);
        }
        masks.push(mc);
      });
      var plate=document.createElement("canvas");plate.width=W;plate.height=H;var pc=plate.getContext("2d");pc.drawImage(original,0,0);
      var plateFile=path.join(dir,"000_background.png");ssWriteCanvasPng(plate,plateFile);var out=[];
      var skipped=0;
      regions.forEach(function(r,index){
        try{
          var type=r.type||ssAssetType(r),cx=r.x+r.w/2,cy=r.y+r.h/2,c=document.createElement("canvas");c.width=r.w;c.height=r.h;
          var cc=c.getContext("2d");cc.drawImage(original,r.x,r.y,r.w,r.h,0,0,r.w,r.h);cc.globalCompositeOperation="destination-in";cc.drawImage(masks[index],0,0);
          var safeType=type.charAt(0).toUpperCase()+type.slice(1),serial=("000"+(index+1)).slice(-3),file=path.join(dir,serial+"_"+safeType+"_"+(index+1)+".png");ssWriteCanvasPng(c,file);
          var patchCanvas=document.createElement("canvas");patchCanvas.width=r.w;patchCanvas.height=r.h;var patchCtx=patchCanvas.getContext("2d");
          patchCtx.drawImage(fillFull,r.x,r.y,r.w,r.h,0,0,r.w,r.h);patchCtx.globalCompositeOperation="destination-in";patchCtx.drawImage(masks[index],0,0);
          var patchFile=path.join(dir,serial+"_Recovery_"+(index+1)+".png");ssWriteCanvasPng(patchCanvas,patchFile);
          out.push({id:r.id,parent:r.parent,type:type,file:file,patch:patchFile,name:r.name||safeType+" "+(index+1),x:r.x,y:r.y,w:r.w,h:r.h,cx:cx,cy:cy,score:r.score});
        }catch(regionError){skipped++;}
      });
      if(!out.length)throw new Error("Detected regions could not be exported. Try lower Detail or less Padding.");
      return {dir:dir,plateFile:plateFile,layers:out,skipped:skipped};
    }

    function updateRegionSummary() {
      var activeList=activeRegions(), active = activeList.length, excluded = state.regions.length - active, counts={text:0,icon:0,image:0,shape:0}; activeList.forEach(function(r){counts[r.type]=(counts[r.type]||0)+1;});
      if (buildBtn) buildBtn.disabled = active < 1 || !state.path;
      if (summaryEl) summaryEl.innerHTML = "<b>" + active + " ELEMENTS</b><span>" + counts.text+" text · "+counts.icon+" icon · "+counts.image+" image · "+counts.shape+" shape"+(excluded ? " · " + excluded + " off" : "") + "</span>";
      var countMap={All:active,Text:counts.text,Icon:counts.icon,Image:counts.image,Shape:counts.shape};
      Object.keys(countMap).forEach(function(key){var el=document.getElementById("ssToAeCount"+key);if(el)el.textContent=countMap[key];});
      if(previewToolbar){var filterButtons=previewToolbar.querySelectorAll("button[data-ssae-type]");for(var bi=0;bi<filterButtons.length;bi++){var filterType=filterButtons[bi].getAttribute("data-ssae-type");filterButtons[bi].classList.toggle("is-active",filterType==="all"?active>0:(counts[filterType]||0)>0);}}
    }

    function drawPreview() {
      if (!canvas || !state.image) return;
      var dpr = window.devicePixelRatio || 1, cssW = Math.max(260, canvas.clientWidth || 520), cssH = Math.max(150, Math.round(cssW * state.height / state.width));
      canvas.style.height = cssH + "px"; canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      var ctx = canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cssW,cssH); ctx.drawImage(state.image,0,0,cssW,cssH);
      var sx = cssW/state.width, sy = cssH/state.height, pad = Number((document.getElementById("ssToAeOffset") || {}).value || 0); ctx.lineWidth = 1; ctx.font = "8px sans-serif";
      var typeColor={text:"#ff5c65",icon:"#27c9ff",image:"#ffb51f",shape:"#42e88b"}; state.regions.forEach(function(r, index) { var x=Math.max(0,r.x-pad), y=Math.max(0,r.y-pad), w=Math.min(state.width,r.x+r.w+pad)-x, h=Math.min(state.height,r.y+r.h+pad)-y, enabled=r.enabled!==false,color=enabled?(typeColor[r.type]||"#22ff6f"):"#777",hovered=r.id===state.hoverId,hasChildren=state.regions.some(function(other){return other.parent===r.id;}),depth=Number(r.depth)||0; ctx.strokeStyle=color;ctx.lineWidth=(hovered?2:1)*(hasChildren?1.6:1);ctx.fillStyle=enabled?color:"#777";ctx.globalAlpha=hovered?.2:(enabled?(hasChildren?.13:.08):.06);ctx.fillRect(x*sx,y*sy,w*sx,h*sy);ctx.globalAlpha=1;ctx.strokeRect(x*sx+.5,y*sy+.5,w*sx,h*sy);if(hasChildren&&depth===0&&!hovered){ctx.setLineDash([3,3]);ctx.strokeRect(x*sx+1.5,y*sy+1.5,w*sx-3,h*sy-3);ctx.setLineDash([]);}if(index<110){ctx.fillStyle=color;ctx.font=hovered?"bold 9px sans-serif":"8px sans-serif";ctx.fillText((depth>0?"· ":"")+String(index+1),x*sx+3,y*sy+9);}if(hovered){var label=(r.name||r.type)+" · "+Math.round(r.w)+"×"+Math.round(r.h)+(hasChildren?" · group":""),tw=ctx.measureText(label).width,lx=Math.max(4,Math.min(cssW-tw-8,x*sx)),ly=Math.max(14,y*sy-3);ctx.fillStyle="rgba(3,8,5,.92)";ctx.fillRect(lx-3,ly-12,tw+7,14);ctx.fillStyle=color;ctx.fillText(label,lx,ly-2);}});ctx.lineWidth=1;
    }

    // Screenshot -> Motion layout analysis. Uses the CompX port of the Flex
    // ss2ae engine (js/ss2ae-engine.js, window.CompXSS2AE) when available:
    // quadratic background surface fit + flood-fill + recursive children, so a
    // gradient hero or a card-with-contents resolves into proper elements the
    // way the old edge detector could not. Falls back to the built-in detector
    // if the engine file is missing.
    function analyseRegions() {
      if (!state.image) { setStatus("Load a screenshot first.", true); return; }
      var detail = Number((document.getElementById("ssToAeDetail") || {}).value || 3);
      setStatus("Analysing visual regions…");
      setTimeout(function() {
        try {
          state.regions = detectRegionsV2(state.image, detail);
          drawPreview();
          updateRegionSummary();
          setStatus(state.path ? "Ready. Click an outline to include or exclude it before building." : "Preview ready, but this browser did not expose the local file path.", !state.path);
        } catch (error) { setStatus("Screenshot analysis failed: " + error.message, true); }
      }, 20);
    }

    // Engine-backed detection. Maps the engine's element list (full-res boxes,
    // types, depth) onto the same region shape the build pipeline expects, and
    // keeps parent-child relations so nested cards group naturally.
    function detectRegionsV2(img, detail) {
      var engine = (typeof window !== "undefined" && window.CompXSS2AE) ? window.CompXSS2AE : null;
      if (engine && engine.detect) {
        try {
          var result = engine.detect(img, { detail: detail || 2, tolerance: 6, modelTolerance: 18 });
          var elements = result && result.elements;
          if (elements && elements.length) {
            var regions = [], typeCounts = { text: 0, icon: 0, image: 0, shape: 0 };
            for (var i = 0; i < elements.length; i++) {
              var e = elements[i], bx = e.box || e;
              var type = e.type || ssAssetType(bx);
              typeCounts[type] = (typeCounts[type] || 0) + 1;
              var region = {
                id: i, parent: -1, enabled: true, score: 0.85,
                x: Math.round(bx.x), y: Math.round(bx.y), w: Math.round(bx.w), h: Math.round(bx.h),
                type: type, name: e.name || type.charAt(0).toUpperCase() + type.slice(1) + " " + typeCounts[type],
                depth: e.depth || 0
              };
              regions.push(region);
            }
            // Derive parent relations from depth + containment: a region that
            // tightly contains another becomes its parent, matching the build
            // step's group-nested behaviour.
            for (var ci = 0; ci < regions.length; ci++) {
              var child = regions[ci], childArea = child.w * child.h, bestParent = -1, bestArea = Infinity;
              for (var pi = 0; pi < regions.length; pi++) {
                if (pi === ci) continue;
                var parent = regions[pi], parentArea = parent.w * parent.h;
                if (parentArea <= childArea / 0.82) continue;
                var overlapW = Math.max(0, Math.min(child.x + child.w, parent.x + parent.w) - Math.max(child.x, parent.x));
                var overlapH = Math.max(0, Math.min(child.y + child.h, parent.y + parent.h) - Math.max(child.y, parent.y));
                if (overlapW * overlapH / Math.max(1, childArea) >= 0.94 && parentArea < bestArea) { bestArea = parentArea; bestParent = parent.id; }
              }
              child.parent = bestParent;
            }
            return regions;
          }
        } catch (engineError) { auditFallback("MAIN_SS2AE_ENGINE_001", engineError); }
      }
      return detectRegions(img, detail || 3);
    }

    function syncReadout(id, outputId, suffix, decimals) {
      var input = document.getElementById(id), output = document.getElementById(outputId); if (!input || !output) return;
      var update = function() { output.textContent = Number(input.value).toFixed(decimals || 0) + (suffix || ""); };
      input.addEventListener("input", update); update();
    }
    syncReadout("ssToAeDetail", "ssToAeDetailVal", "", 0); syncReadout("ssToAeOffset", "ssToAeOffsetVal", "px", 0); syncReadout("ssToAeDuration", "ssToAeDurationVal", "s", 2); syncReadout("ssToAeStagger", "ssToAeStaggerVal", "s", 2);

    if (dropzone) {
      dropzone.addEventListener("click", function(event) { if ((canvas && event.target === canvas) || (previewToolbar && previewToolbar.contains(event.target))) return; if (fileInput) fileInput.click(); });
      dropzone.addEventListener("keydown", function(event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (fileInput) fileInput.click(); } });
      dropzone.addEventListener("dragover", function(event) { event.preventDefault(); dropzone.classList.add("dragover"); });
      dropzone.addEventListener("dragleave", function() { dropzone.classList.remove("dragover"); });
      dropzone.addEventListener("drop", function(event) { event.preventDefault(); dropzone.classList.remove("dragover"); if (event.dataTransfer && event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]); });
    }
    if (fileInput) fileInput.addEventListener("change", function(event) { if (event.target.files && event.target.files.length) loadFile(event.target.files[0]); });

    // Clipboard paste support — the ss-to-ae flow that works in Flex: take a
    // screenshot (Win+Shift+S / Snipping Tool / web copy) and paste it straight
    // into the panel. Handles both image files (Explorer/Finder copies) and raw
    // clipboard images, saving to a temp PNG so the build pipeline works.
    function handleScreenshotPaste(event) {
      var dt = event.clipboardData || event.dataTransfer;
      if (!dt) return false;
      var fileList = dt.files;
      if (fileList && fileList.length) {
        for (var fi = 0; fi < fileList.length; fi++) {
          var f = fileList[fi];
          var isImg = (f.type && f.type.indexOf("image") !== -1) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || "");
          if (!isImg) continue;
          event.preventDefault();
          setStatus("Pasting screenshot…");
          loadFile(f);
          return true;
        }
      }
      var items = dt.items;
      if (!items) return false;
      for (var ii = 0; ii < items.length; ii++) {
        if (!items[ii].type || items[ii].type.indexOf("image") === -1) continue;
        var blob = items[ii].getAsFile ? items[ii].getAsFile() : null;
        if (!blob) continue;
        event.preventDefault();
        setStatus("Reading pasted screenshot…");
        var pasteCanvas = document.createElement("canvas"), pasteCtx = pasteCanvas.getContext("2d");
        var pasteImg = new Image();
        pasteImg.onload = function() {
          try {
            pasteCanvas.width = pasteImg.naturalWidth || pasteImg.width;
            pasteCanvas.height = pasteImg.naturalHeight || pasteImg.height;
            pasteCtx.drawImage(pasteImg, 0, 0);
            var filePath = saveScreenshotBase64(pasteCanvas.toDataURL("image/png"), "Pasted");
            loadLocalPath(filePath, "Pasted screenshot");
          } catch (pasteError) { setStatus("Could not process the pasted screenshot: " + pasteError.message, true); }
          try { URL.revokeObjectURL(pasteImg.src); } catch (ignoreRevoke) { /* older CEP */ }
        };
        pasteImg.onerror = function() { setStatus("The pasted screenshot could not be decoded.", true); };
        pasteImg.src = URL.createObjectURL(blob);
        return true;
      }
      return false;
    }

    if (dropzone) dropzone.addEventListener("paste", function(event) { if (handleScreenshotPaste(event)) setStatus("Screenshot pasted — analysing…"); });
    // Ctrl+V works anywhere on the Studio tab except caption/text fields.
    var studioPanel = document.getElementById("panel-studio");
    document.addEventListener("paste", function(event) {
      if (event.defaultPrevented) return;
      if (studioPanel && !studioPanel.classList.contains("active")) return;
      var focusEl = event.target;
      if (focusEl && (focusEl.closest("textarea") || focusEl.closest("input") || focusEl.isContentEditable)) return;
      if (handleScreenshotPaste(event)) setStatus("Screenshot pasted — analysing…");
    });

    if (analyzeBtn) analyzeBtn.addEventListener("click", analyseRegions);
    var detailInput = document.getElementById("ssToAeDetail"); if (detailInput) detailInput.addEventListener("change", function() { if (state.image) analyseRegions(); });
    var offsetInput = document.getElementById("ssToAeOffset"); if (offsetInput) offsetInput.addEventListener("input", function() { if (state.image) drawPreview(); });
    function syncBuildMode() {
      var safe = modeInput && modeInput.value === "safe", animateInput=document.getElementById("ssToAeAnimate"), motionInput=document.getElementById("ssToAeMotion");
      if (animateInput) { animateInput.disabled=safe; if (safe) animateInput.checked=false; else animateInput.checked=true; }
      if (motionInput) motionInput.disabled=safe;
      ["ssToAeMotionText","ssToAeMotionIcon","ssToAeMotionImage","ssToAeMotionShape"].forEach(function(id){var select=document.getElementById(id);if(select)select.disabled=safe;});
      setStatus(safe ? "Original Screenshot keeps one untouched static layer." : "Hybrid Motion keeps the original background intact and uses local recovery patches under moving elements.");
    }
    if (modeInput) modeInput.addEventListener("change",syncBuildMode); syncBuildMode();
    if (canvas) canvas.addEventListener("click", function(event) {
      if (!state.image || !state.regions.length) return;
      var bounds=canvas.getBoundingClientRect(), px=(event.clientX-bounds.left)*state.width/Math.max(1,bounds.width), py=(event.clientY-bounds.top)*state.height/Math.max(1,bounds.height), hit=null, hitArea=Infinity;
      state.regions.forEach(function(region) { var area=region.w*region.h; if (px>=region.x && px<=region.x+region.w && py>=region.y && py<=region.y+region.h && area<hitArea) { hit=region; hitArea=area; } });
      if (!hit) return; hit.enabled = hit.enabled === false; drawPreview(); updateRegionSummary(); setStatus("Region " + (hit.id+1) + (hit.enabled ? " included." : " excluded.") + " Click again to toggle it.");
    });
    function regionAtCanvasPoint(event) {
      if (!canvas || !state.image || !state.regions.length) return null;
      var bounds=canvas.getBoundingClientRect(),px=(event.clientX-bounds.left)*state.width/Math.max(1,bounds.width),py=(event.clientY-bounds.top)*state.height/Math.max(1,bounds.height),hit=null,hitArea=Infinity;
      state.regions.forEach(function(region){var area=region.w*region.h;if(px>=region.x&&px<=region.x+region.w&&py>=region.y&&py<=region.y+region.h&&area<hitArea){hit=region;hitArea=area;}});
      return hit;
    }
    if (canvas) canvas.addEventListener("mousemove",function(event){var hit=regionAtCanvasPoint(event),next=hit?hit.id:-1;if(next!==state.hoverId){state.hoverId=next;drawPreview();}});
    if (canvas) canvas.addEventListener("mouseleave",function(){if(state.hoverId!==-1){state.hoverId=-1;drawPreview();}});
    if (previewToolbar) previewToolbar.addEventListener("click",function(event){
      event.stopPropagation();
      var button=event.target.closest&&event.target.closest("button[data-ssae-type]");if(!button)return;
      var type=button.getAttribute("data-ssae-type"),targets=type==="all"?state.regions:state.regions.filter(function(r){return r.type===type;});
      if(!targets.length)return;var enable=targets.some(function(r){return r.enabled===false;});targets.forEach(function(r){r.enabled=enable;});
      drawPreview();updateRegionSummary();setStatus((enable?"Included ":"Excluded ")+(type==="all"?"all detected elements.":"all "+type+" elements."));
    });
    window.addEventListener("resize", function() { if (state.image) drawPreview(); });

    if (timelineBtn) timelineBtn.addEventListener("click", function() {
      setStatus("Reading selected timeline image…");
      runTool("ae_ssToAeGetSelectedSource()", "Timeline image detected", function(result) { if (result && result.success && result.data && result.data.path) loadLocalPath(result.data.path, result.data.name); else setStatus((result && result.message) || "Select an image layer or open a composition.", true); });
    });
    if (buildBtn) buildBtn.addEventListener("click", function() {
      if (!state.path || !state.regions.length) { setStatus("Analyse a local screenshot first.", true); return; }
      var pad = Number((document.getElementById("ssToAeOffset") || {}).value || 0);
      var groupNested = !!((document.getElementById("ssToAeGroupNested") || {}).checked), activeIds={}; activeRegions().forEach(function(r){activeIds[r.id]=true;});
      var regions = activeRegions().map(function(r) { var parent=groupNested && activeIds[r.parent] ? r.parent : -1; return { id:r.id, parent:parent, type:r.type, name:r.name, score:r.score, x:Math.max(0,r.x-pad), y:Math.max(0,r.y-pad), w:Math.min(state.width, r.x+r.w+pad)-Math.max(0,r.x-pad), h:Math.min(state.height, r.y+r.h+pad)-Math.max(0,r.y-pad) }; });
      var mode=(modeInput && modeInput.value === "safe") ? "safe" : "layered", animate = mode !== "safe" && !!((document.getElementById("ssToAeAnimate") || {}).checked), assets=null;
      if(mode==="layered"){try{setStatus("Exporting transparent elements with local recovery patches…");assets=ssBuildRasterAssets(regions);}catch(assetError){setStatus("Asset reconstruction failed: "+assetError.message,true);return;}}
      var typeMotion={text:(document.getElementById("ssToAeMotionText")||{}).value||"global",icon:(document.getElementById("ssToAeMotionIcon")||{}).value||"global",image:(document.getElementById("ssToAeMotionImage")||{}).value||"global",shape:(document.getElementById("ssToAeMotionShape")||{}).value||"global"};
      var payload = { filePath:state.path, name:state.name, width:state.width, height:state.height, mode:mode, plateFile:assets?assets.plateFile:"", assetLayers:assets?assets.layers:[], autoParent:!!((document.getElementById("ssToAeAutoParent") || {}).checked), regions:regions, motion:animate ? ((document.getElementById("ssToAeMotion") || {}).value || "smooth") : "none", typeMotion:typeMotion, sequence:(document.getElementById("ssToAeSequence") || {}).value || "top", duration:Number((document.getElementById("ssToAeDuration") || {}).value || .55), stagger:Number((document.getElementById("ssToAeStagger") || {}).value || .06) };
      buildBtn.disabled = true; setFlowStep(3); setStatus("Building " + regions.length + " editable AE layers…");
      runTool("ae_ssToAeBuild(" + hostArg(JSON.stringify(payload)) + ")", "Screenshot layers built", function(result) { buildBtn.disabled = false; setStatus((result && result.message) || "Build finished.", !(result && result.success)); });
    });
  }

  function dropContainsFiles(dataTransfer) {
    if (!dataTransfer) return false;
    try {
      const types = Array.from(dataTransfer.types || []);
      if (types.some((type) => String(type).toLowerCase() === "files")) return true;
      return !!(dataTransfer.files && dataTransfer.files.length);
    } catch (error) { auditFallback("MAIN_DROP_TYPES_001", error); return false; }
  }

  async function collectDroppedFilePaths(dataTransfer, supportedExtensions) {
    if (!nodeAvailable || !fs.promises) throw new Error("Local file access is unavailable in this CEP session.");
    const allowed = (supportedExtensions || []).map((ext) => String(ext).toLowerCase());
    // CEP fills file.path for files picked from <input> elements, but OS
    // drag-and-drop on macOS often delivers only file:// URIs (text/uri-list
    // / text/plain) with no .path on the File objects. Parse those too so
    // dropping SFX/MOGRT assets works identically on Windows and macOS.
    const seeds = Array.from(dataTransfer && dataTransfer.files || []).map((file) => file.path).filter(Boolean);
    const uriSeeds = [];
    try {
      const raw = (dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain") || "").trim();
      raw.split(/\r?\n/).forEach((line) => {
        const text = line.trim();
        if (!text || text.charAt(0) === "#") return;
        try {
          const decoded = /^file:/i.test(text) ? urlMod.fileURLToPath(text) : text;
          if (decoded) uriSeeds.push(decoded);
        } catch (uriError) { /* skip malformed URI lines */ }
      });
    } catch (getDataError) { auditFallback("MAIN_DROP_URILIST_001", getDataError); }
    const stack = seeds.concat(uriSeeds).slice();
    const found = [];
    const seen = new Set();
    const MAX_FILES = 25000;
    while (stack.length && found.length < MAX_FILES) {
      const current = stack.pop();
      const key = path.resolve(current).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let stat;
      try { stat = await fs.promises.lstat(current); }
      catch (statError) { auditFallback("MAIN_DROP_STAT_001", statError); continue; }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        let children = [];
        try { children = await fs.promises.readdir(current); }
        catch (readError) { auditFallback("MAIN_DROP_READDIR_001", readError); continue; }
        children.forEach((name) => stack.push(path.join(current, name)));
      } else if (stat.isFile() && allowed.indexOf(path.extname(current).toLowerCase()) !== -1) {
        found.push(path.resolve(current));
      }
    }
    return found;
  }

  function wireLibraryFileDrop(zone, getExtensions, onPaths, getLabel) {
    if (!zone || zone.dataset.fileDropWired === "1") return;
    zone.dataset.fileDropWired = "1";
    let dragDepth = 0;
    function clearDragState() { dragDepth = 0; zone.classList.remove("is-file-dragover"); }
    zone.addEventListener("dragenter", (event) => {
      if (!dropContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth++;
      zone.dataset.dropLabel = typeof getLabel === "function" ? getLabel(false) : "Drop files to add";
      zone.classList.add("is-file-dragover");
    });
    zone.addEventListener("dragover", (event) => {
      if (!dropContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    zone.addEventListener("dragleave", (event) => {
      if (!zone.classList.contains("is-file-dragover")) return;
      event.preventDefault();
      if (!event.relatedTarget || !zone.contains(event.relatedTarget)) { clearDragState(); return; }
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) zone.classList.remove("is-file-dragover");
    });
    zone.addEventListener("drop", async (event) => {
      if (!dropContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      zone.dataset.dropLabel = typeof getLabel === "function" ? getLabel(true) : "Scanning dropped resources…";
      zone.classList.add("is-file-dropbusy");
      try {
        const extensions = typeof getExtensions === "function" ? getExtensions() : getExtensions;
        const paths = await collectDroppedFilePaths(event.dataTransfer, extensions);
        if (!paths.length) { showToast("No supported files were found in the drop.", true); return; }
        await Promise.resolve(onPaths(paths));
      } catch (dropError) {
        auditFallback("MAIN_LIBRARY_DROP_001", dropError);
        showToast("Drag and drop failed: " + dropError.message, true);
      } finally {
        zone.classList.remove("is-file-dropbusy");
      }
    });
  }



  // ─────────────────────────────────────────────────────────────
  function wireToolkitProductionUtilities() {
    var root = document.getElementById("toolkitProductionUtilities");
    if (!root) return;
    var statusEl = document.getElementById("toolkitProductionStatus");
    var saveFrameBtn = document.getElementById("btnToolkitSaveFrame");
    var duplicateKeysBtn = document.getElementById("btnToolkitDuplicateKeys");
    var reverseKeysBtn = document.getElementById("btnToolkitReverseKeys");
    function setStatus(message) { if (statusEl) statusEl.textContent = message; }
    function keyframeStep() {
      var input = document.getElementById("toolkitKeyframeStep");
      var value = Math.max(1, Math.min(300, Math.round(Number(input && input.value) || 2)));
      if (input) input.value = String(value);
      return value;
    }
    function runProductionTool(script, busyMessage, fallbackMessage) {
      setStatus(busyMessage);
      runTool(script, fallbackMessage, function(result) {
        setStatus((result && result.message) || fallbackMessage);
      });
    }
    if (saveFrameBtn) saveFrameBtn.addEventListener("click", function() {
      runProductionTool("ae_saveCurrentFrame()", "Saving the current frame…", "Frame saved");
    });
    if (duplicateKeysBtn) duplicateKeysBtn.addEventListener("click", function() {
      runProductionTool('ae_advancedKeyframes("duplicate",' + keyframeStep() + ')', "Duplicating selected keyframes…", "Keyframes duplicated");
    });
    if (reverseKeysBtn) reverseKeysBtn.addEventListener("click", function() {
      runProductionTool('ae_advancedKeyframes("reverse",' + keyframeStep() + ')', "Reversing selected keyframes…", "Keyframes reversed");
    });
    root.querySelectorAll("[data-toolkit-key-stagger]").forEach(function(button) {
      button.addEventListener("click", function() {
        var direction = button.getAttribute("data-toolkit-key-stagger") || "ascending";
        runProductionTool('ae_advancedKeyframes("' + direction + '",' + keyframeStep() + ')', "Staggering selected keyframes…", "Keyframes staggered");
      });
    });
  }

  el.fileInputFolder.setAttribute("webkitdirectory", "");

  el.btnAddFolder.addEventListener("click", () => el.fileInputFolder.click());
  if (el.btnRemoveMarkedSfx) {
    el.btnRemoveMarkedSfx.addEventListener("click", () => {
      const marked = getMarkedSfxItems();
      const folderItems = getItemsInMarkedFolders();
      const seen = {};
      const ids = [];
      marked.concat(folderItems).forEach((item) => {
        if (seen[item.id]) return;
        seen[item.id] = true;
        ids.push(item.id);
      });
      if (ids.length === 0) {
        showToast("Ctrl+click a card or folder to mark it", true);
        return;
      }
      const foldersToClear = (markedFolders[assetType] || []).slice();
      removeMarkedSfxItems(ids).then((removed) => {
        if (!removed) return;
        unmarkFolders(foldersToClear);
        render();
      });
    });
  }
  if (el.btnBackupLibrary) el.btnBackupLibrary.addEventListener("click", exportLibraryBackup);
  if (el.btnRestoreLibrary) el.btnRestoreLibrary.addEventListener("click", () => el.fileInputLibraryBackup.click());
  if (el.btnCheckMissing) el.btnCheckMissing.addEventListener("click", () => { clearAssetPathCache(); detectMissingFiles(true); });
  if (el.btnRelinkLibrary) el.btnRelinkLibrary.addEventListener("click", () => { clearAssetPathCache(); el.fileInputRelinkFolder.click(); });
  if (el.btnClearMogrtCache) el.btnClearMogrtCache.addEventListener("click", clearUnusedMogrtCache);
  if (el.btnCopyDiagnostics) el.btnCopyDiagnostics.addEventListener("click", copyDiagnosticReport);

  // Library refresh — Favorites / Recent / Packs / Custom Sets navigation removed
  const btnRefreshView = document.getElementById("btnRefreshView");
  if (btnRefreshView) btnRefreshView.addEventListener("click", () => { render(); showToast("Library refreshed"); });

  if (el.fileInputLibraryBackup) el.fileInputLibraryBackup.addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (file && file.path) restoreLibraryBackup(file.path);
    ev.target.value = "";
  });

  if (el.fileInputRelinkFolder) el.fileInputRelinkFolder.addEventListener("change", (ev) => {
    relinkLibraryFromFiles(ev.target.files);
    ev.target.value = "";
  });

  el.fileInputFiles.addEventListener("change", (ev) => {
    const paths = Array.from(ev.target.files)
      .map((f) => f.path)
      .filter(Boolean);
    addFilePaths(paths);
    ev.target.value = "";
  });

  el.fileInputFolder.addEventListener("change", (ev) => {
    const paths = Array.from(ev.target.files)
      .map((f) => f.path)
      .filter(Boolean);
    addFilePaths(paths);
    ev.target.value = "";
  });

  wireLibraryFileDrop(
    document.getElementById("sfxMogrtView"),
    () => EXT_BY_TYPE[assetType] || [],
    (paths) => addFilePaths(paths, assetType),
    (busy) => busy ? ("Scanning dropped " + (assetType === "mogrt" ? "MOGRT" : "SFX") + " resources…") : ("DROP " + (assetType === "mogrt" ? ".MOGRT" : "AUDIO") + " FILES OR FOLDERS TO ADD")
  );

  el.pitch.addEventListener("input", () => {
    el.pitchVal.textContent = (el.pitch.value > 0 ? "+" : "") + el.pitch.value + " st";
    if (currentSource) currentSource.detune.value = parseFloat(el.pitch.value) * 100;
  });

  if (el.volume) {
    const savedVol = parseInt(localStorage.getItem("ccPreviewVolume") || "100", 10);
    const initialVol = isNaN(savedVol) ? 100 : Math.max(0, Math.min(200, savedVol));
    el.volume.value = String(initialVol);
    previewVolume = initialVol / 100;
    if (el.volumeVal) el.volumeVal.textContent = initialVol + "%";

    el.volume.addEventListener("input", () => {
      const v = Math.max(0, Math.min(200, parseInt(el.volume.value, 10) || 100));
      previewVolume = v / 100;
      if (el.volumeVal) el.volumeVal.textContent = v + "%";
      if (currentGain) currentGain.gain.value = previewVolume;
      try { localStorage.setItem("ccPreviewVolume", String(v)); } catch (e) { auditFallback("MAIN_WIRECARDSIZESLIDER_002", e); }
    });
  }

  if (el.btnInsert) el.btnInsert.addEventListener("click", insertToTimeline);

  // Separate Volume and Pitch buttons open the shared compact control popover.
  var btnMixer = document.getElementById("btnMixer");
  var btnPitch = document.getElementById("btnPitch");
  var mixerPopover = document.getElementById("mixerPopover");
  function openMixer(focusPitch) {
    if (!mixerPopover) return;
    // The MOGRT shelf hides Pitch. Explicitly restore it whenever the SFX
    // mixer opens, so switching MOGRT → SFX cannot leave a volume-only UI.
    if (el.pitchBlock) el.pitchBlock.style.display = assetType === "sfx" ? "block" : "none";
    if (document.getElementById("volumeBlock")) document.getElementById("volumeBlock").style.display = assetType === "sfx" ? "block" : "none";
    mixerPopover.style.display = "block";
    if (btnMixer) btnMixer.classList.toggle("active", !focusPitch);
    if (btnPitch) btnPitch.classList.toggle("active", !!focusPitch);
    if (focusPitch && el.pitch) el.pitch.focus();
    if (!focusPitch && el.volume) el.volume.focus();
  }
  function closeMixer() {
    if (!mixerPopover) return;
    mixerPopover.style.display = "none";
    if (btnMixer) btnMixer.classList.remove("active");
    if (btnPitch) btnPitch.classList.remove("active");
  }
  if (btnMixer && mixerPopover) {
    btnMixer.addEventListener("click", function (ev) {
      ev.stopPropagation();
      mixerPopover.style.display === "none" ? openMixer(false) : closeMixer();
    });
  }
  if (btnPitch && mixerPopover) {
    btnPitch.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openMixer(true);
    });
  }
  if (mixerPopover) {
    document.addEventListener("click", function (ev) {
      if (mixerPopover.style.display === "none") return;
      if (ev.target.closest && (ev.target.closest("#mixerPopover") || ev.target.closest("#btnMixer") || ev.target.closest("#btnPitch"))) return;
      closeMixer();
    });
  }

  el.tabsRow.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".tab");
    if (!btn) return;
    currentView = btn.dataset.view;
    if (currentView === "favorites") {
      selectedFolder = "";
      el.breadcrumb.textContent = "Favorites";
    } else if (currentView === "all") {
      selectedFolder = "";
      el.breadcrumb.textContent = "All";
    }
    if (currentView !== "collections") activeCollection = null;
    render();
  });

  el.collectionsRow.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip) return;
    const name = chip.dataset.collection;
    activeCollection = activeCollection === name ? null : name;
    render();
  });

  el.tagEditor.addEventListener("change", () => {
    const sfx = library.find((s) => s.id === selectedId);
    if (!sfx) return;
    sfx.tags = el.tagEditor.value
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    saveLibrary();
  });

  el.btnBatchMode.addEventListener("click", () => {
    batchMode = !batchMode;
    batchSelected.clear();
    el.btnBatchMode.classList.toggle("primary", batchMode);
    el.btnBatchMode.textContent = batchMode ? "×" : "✓";
    render();
  });

  el.btnReset.addEventListener("click", async () => {
    // SFX and MOGRT share the same persisted database, but reset is scoped to
    // the shelf that was active when the user clicked the button.
    const resetType = assetType;
    const resetLabel = resetType === "mogrt" ? "MOGRT" : "SFX";
    const resetItems = library.filter((item) => item.type === resetType);
    if (resetItems.length === 0) {
      showToast(resetLabel + " library is already empty");
      return;
    }

    const ok = await showModal({
      title: "Reset " + resetLabel + " Library?",
      message: "This permanently removes only the " + resetLabel + " items you've added, along with their tags and colors. The other library will stay unchanged. This cannot be undone.",
      okText: "Reset " + resetLabel,
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    if (currentSource) stopPlayback();
    const resetIds = new Set(resetItems.map((item) => item.id));
    library = library.filter((item) => item.type !== resetType);
    resetIds.forEach((id) => {
      missingAssetIds.delete(id);
      mogrtImportInProgress.delete(id);
    });

    // Reset only the active shelf's transient view state. Keep the current
    // shelf selected and preserve every item belonging to the other shelf.
    filterText = "";
    selectedId = null;
    currentView = "all";
    activeCollection = null;
    batchMode = false;
    batchSelected.clear();
    selectedFolder = "";
    viewMode = "grid";
    sortBy = "name";
    sidebarCollapsed = false;

    el.search.value = "";
    el.sortBy.value = "name";
    el.breadcrumb.textContent = "All";
    el.tagEditorRow.style.display = "none";
    el.nowPlaying.innerHTML = '<span class="label">Selected:</span> —';
    el.btnBatchMode.classList.remove("primary");
    el.btnBatchMode.textContent = "✓";
    el.sidebar.classList.remove("collapsed");
    el.btnCollapse.textContent = "◀";

    saveLibrary();
    showToast(resetLabel + " library reset");
    render();
  });
  el.batchColor.addEventListener("click", () => {
    if (batchSelected.size === 0) return showToast("Select some " + assetNoun(assetType) + "s first", true);
    const items = library.filter((s) => batchSelected.has(s.id));
    items.forEach((sfx) => cycleColor(sfx));
  });

  el.batchCollection.addEventListener("click", () => {
    if (batchSelected.size === 0) return showToast("Select some " + assetNoun(assetType) + "s first", true);
    const items = library.filter((s) => batchSelected.has(s.id));
    promptAddToCollection(items);
  });

  el.batchDelete.addEventListener("click", async () => {
    if (batchSelected.size === 0) return showToast("Select some " + assetNoun(assetType) + "s first", true);
    const ok = await showModal({
      title: "Remove Items?",
      message: "Remove " + batchSelected.size + " item(s) from the library? This cannot be undone.",
      okText: "Remove",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;
    if (currentSource && batchSelected.has(selectedId)) stopPlayback();
    library = library.filter((s) => !batchSelected.has(s.id));
    if (batchSelected.has(selectedId)) selectedId = null;
    batchSelected.clear();
    saveLibrary();
    render();
  });

  // Folder tree interactions
  el.folderTree.addEventListener("click", (ev) => {
    const removeBtn = ev.target.closest("[data-folder-remove]");
    if (removeBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      removeMarkedFolder(removeBtn.getAttribute("data-folder-remove") || "");
      return;
    }
    const row = ev.target.closest(".folder-row");
    if (!row) return;
    const folder = row.dataset.folder;
    if ((ev.ctrlKey || ev.metaKey) && folder && folder !== "__favorites__") {
      ev.preventDefault();
      ev.stopPropagation();
      toggleFolderMark(folder);
      return;
    }
    
    // Toggle collapse if caret clicked
    const caret = ev.target.closest(".folder-caret");
    if (caret && caret.textContent !== "") {
      const node = row.closest(".folder-node");
      if (node) {
        const isCollapsed = node.classList.toggle("collapsed");
        if (isCollapsed) {
          collapsedFolders.add(folder);
          caret.textContent = "▶";
        } else {
          collapsedFolders.delete(folder);
          caret.textContent = "▼";
        }
        return;
      }
    }
    
    if (folder === "__favorites__") {
      currentView = "favorites";
      selectedFolder = "";
      el.breadcrumb.textContent = "Favorites";
      render();
      return;
    }

    currentView = "all";
    selectedFolder = folder;
    el.breadcrumb.textContent = selectedFolder ? selectedFolder.replace(/\//g, " / ") : "All";
    render();
  });

  // Collapse toggle
  el.btnCollapse.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    el.sidebar.classList.toggle("collapsed", sidebarCollapsed);
    el.btnCollapse.textContent = sidebarCollapsed ? "▶" : "◀";
  });

  // Sorting
  el.sortBy.addEventListener("change", () => {
    sortBy = el.sortBy.value;
    render();
  });

  // View modes (buttons are optional — not every layout includes them)
  if (el.btnGridView) {
    el.btnGridView.addEventListener("click", () => {
      viewMode = "grid";
      el.btnGridView.classList.add("active");
      if (el.btnListView) el.btnListView.classList.remove("active");
      render();
    });
  }

  if (el.btnListView) {
    el.btnListView.addEventListener("click", () => {
      viewMode = "list";
      if (el.btnGridView) el.btnGridView.classList.remove("active");
      el.btnListView.classList.add("active");
      render();
    });
  }

  document.addEventListener("keydown", (ev) => {
    const target = ev.target;
    const tag = (target && target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (target && target.isContentEditable)) return; // never hijack typing/editing controls
    if (ev.code === "Space") {
      ev.preventDefault();
      togglePlay();
    } else if (ev.code === "ArrowDown") {
      ev.preventDefault();
      stepSelection(1);
    } else if (ev.code === "ArrowUp") {
      ev.preventDefault();
      stepSelection(-1);
    } else if (ev.code === "Enter") {
      ev.preventDefault();
      playSelected();
    }
  });

  // ---------------- AE Tools tab ----------------

  const toolsHint = document.getElementById("toolsHint");

  const HOST_CALL_TIMEOUT_MS = 120000;

  function hostArg(value) {
    // JSON string literals safely preserve quotes, slashes, newlines and
    // Unicode separators when values cross the CEP -> ExtendScript bridge.
    return JSON.stringify(value == null ? "" : String(value))
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function parseHostResult(result) {
    const raw = String(result == null ? "" : result);
    if (!raw || raw === "undefined" || raw === "EvalScript error.") {
      return { success: false, message: raw === "EvalScript error." ? "Adobe host script failed" : "Adobe host returned no response" };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { success: false, message: "Adobe host returned an invalid result" };
      }
      return parsed;
    } catch (e) {
      return { success: false, message: "Adobe host response could not be parsed", detail: raw.slice(0, 500) };
    }
  }

  function callHostRaw(script, callback, timeoutMs) {
    let settled = false;
    const finish = (raw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(String(raw == null ? "" : raw));
    };
    const timer = setTimeout(() => {
      recordDiagnostic("error", "HOST_TIMEOUT", "Adobe host action timed out", String(script).split("(")[0]);
      finish("ERR: Adobe host timed out while running this action");
    }, timeoutMs || HOST_CALL_TIMEOUT_MS);
    try {
      csInterface.evalScript(script, finish);
    } catch (e) {
      recordDiagnostic("error", "HOST_CONTACT", "Could not contact Adobe host", e.message || e);
      finish("ERR: Could not contact the Adobe host");
    }
  }

  function callHost(script, callback, timeoutMs) {
    callHostRaw(script, (raw) => callback(parseHostResult(raw)), timeoutMs);
  }

  function runTool(script, okMsg, onResult) {
    callHost(script, (parsed) => {
      const actionName = String(script || "").split("(")[0].slice(0, 80);
      if (parsed.success) {
        showToast(parsed.message || okMsg || "Done");
        recordDiagnostic("info", "HOST_ACTION", parsed.message || okMsg || "Host action completed", actionName, "applied");
      } else {
        showToast(parsed.message || "Action failed", true);
        recordDiagnostic("error", "HOST_ACTION_FAILED", parsed.message || "Host action failed", actionName + (parsed.detail ? " · " + parsed.detail : ""), "failed");
        try { console.error("CompX host action failed:", script.slice(0, 160), parsed.detail || parsed.message); } catch (consoleError) { auditFallback("MAIN_RUNTOOL_001", consoleError); }
      }
      if (onResult) onResult(parsed);
    });
  }

  // Shared by feature modules loaded after main.js. JSON-returning host APIs
  // use call(); legacy text protocols (Graph/Pasta path) use callRaw().
  window.CompXHostBridge = Object.freeze({
    call: callHost,
    callRaw: callHostRaw,
    arg: hostArg,
  });

  // Liquid Glass uses the same Plugin Settings native-pack installer as Deep Glow / Shadow Studio.

  // ---------------- Plugin Settings modal (gear icon) ----------------
  // Keeps the Liquid Glass installer out of the main tool UI; only reachable
  // via the gear icon next to Sign Out.
  // ---------------- Bundled native AEX pack (Liquid Glass / Deep Glow / Shadow Studio) ----------------
  // Copy the bundled Windows .aex (or macOS .plugin) into AE's scanned Plug-ins
  // folder (UAC / admin when needed). Tools-tab buttons apply the loaded effect.
  function wireNativeAexPlugins() {
    const pack = document.getElementById("lgNativePack");
    const NATIVE_AEX = [
      { id: "liquidglass", label: "Liquid Glass", fileWin: "LiquidGlass.aex", fileMac: "LiquidGlass.plugin", macExe: "LiquidGlass" },
      { id: "deepglow", label: "Deep Glow", fileWin: "Deep Glow.aex" },
      { id: "deepglow2", label: "Deep Glow 2", fileWin: "DeepGlow2.aex", fileMac: "DeepGlow2.plugin", macExe: "DeepGlow2" },
      { id: "shadow2", label: "Shadow Studio 2", fileWin: "Shadow Studio 2.aex" },
      { id: "shadow3", label: "Shadow Studio 3", fileWin: "Shadow Studio 3.aex", fileMac: "Shadow Studio 3.plugin", macExe: "SS3" }
    ];

    let fs = null, pathMod = null, osMod = null, cp = null;
    try {
      if (typeof require !== "undefined") {
        fs = require("fs"); pathMod = require("path"); osMod = require("os"); cp = require("child_process");
      } else if (typeof window.require !== "undefined") {
        fs = window.require("fs"); pathMod = window.require("path"); osMod = window.require("os"); cp = window.require("child_process");
      }
    } catch (e) { auditFallback("MAIN_NP_REQUIRE_001", e); }

    function platform() {
      try { return osMod ? osMod.platform() : (navigator.platform.toLowerCase().indexOf("win") >= 0 ? "win32" : "darwin"); }
      catch (e) { return "win32"; }
    }
    const isWin = platform() === "win32";
    let commonDetected;
    let aePluginDetected;
    let detectPending = false;
    let detectCallbacks = [];
    const lastLoaded = {};

    function extensionRoot() {
      try { return csInterface.getSystemPath(SystemPath.EXTENSION); }
      catch (e) { auditFallback("MAIN_NP_EXTROOT_001", e); return "."; }
    }
    function compareVersion(a, b) {
      const pa = String(a).split("."), pb = String(b).split(".");
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const na = parseInt(pa[i] || "0", 10), nb = parseInt(pb[i] || "0", 10);
        if (na !== nb) return na - nb;
      }
      return 0;
    }
    function flushDetect() {
      const cbs = detectCallbacks;
      detectCallbacks = [];
      cbs.forEach((cb) => { try { cb(); } catch (e) { auditFallback("MAIN_NP_DETECT_CB_001", e); } });
    }
    function detectMacPluginDirs() {
      const found = [];
      const roots = ["/Applications"];
      if (!fs || !pathMod) {
        commonDetected = "/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore";
        detectPending = false;
        flushDetect();
        return;
      }
      try { if (osMod && osMod.homedir) roots.push(pathMod.join(osMod.homedir(), "Applications")); } catch (eHome) { /* optional */ }
      roots.forEach((root) => {
        try {
          if (!fs || !fs.existsSync(root)) return;
          fs.readdirSync(root).forEach((name) => {
            if (!/^Adobe After Effects/i.test(name)) return;
            const plug = pathMod.join(root, name, "Plug-ins");
            if (!fs.existsSync(plug)) return;
            const year = parseInt((/(\d{4})/.exec(name) || [])[1] || "0", 10);
            found.push({ plug: plug, year: year, name: name });
          });
        } catch (eRead) { auditFallback("MAIN_NP_MAC_DETECT_001", eRead); }
      });
      found.sort((a, b) => (b.year - a.year) || String(b.name).localeCompare(String(a.name)));
      if (found.length) aePluginDetected = found[0].plug;
      const common = "/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore";
      try { commonDetected = (fs && fs.existsSync(common)) ? common : common; }
      catch (eC) { commonDetected = common; }
      detectPending = false;
      flushDetect();
    }
    function detectPluginDirs(cb) {
      if (commonDetected !== undefined) { cb(); return; }
      detectCallbacks.push(cb);
      if (detectPending) return;
      detectPending = true;
      if (!isWin) { detectMacPluginDirs(); return; }
      if (!cp) { commonDetected = null; detectPending = false; flushDetect(); return; }
      const views = ["HKLM\\SOFTWARE\\Adobe\\After Effects", "HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\After Effects"];
      const found = [];
      let viewIdx = 0;
      const readViews = () => {
        if (viewIdx >= views.length) { resolveNewest(); return; }
        const view = views[viewIdx++];
        cp.execFile("reg", ["query", view], { timeout: 4000 }, (err, stdout) => {
          if (!err && stdout) {
            String(stdout).split(/\r?\n/).forEach((line) => {
              const m = /After Effects\\([\d.]+)\\?\s*$/.exec(String(line).trim());
              if (m && !found.some((f) => f.version === m[1])) found.push({ view: view, version: m[1] });
            });
          }
          readViews();
        });
      };
      const resolveNewest = () => {
        found.sort((a, b) => compareVersion(b.version, a.version));
        let fi = 0;
        const nextFound = () => {
          if (fi >= found.length) { if (commonDetected === undefined) commonDetected = null; detectPending = false; flushDetect(); return; }
          const entry = found[fi++];
          cp.execFile("reg", ["query", entry.view + "\\" + entry.version], { timeout: 4000 }, (err, stdout) => {
            if (!err && stdout) {
              const text = String(stdout);
              const cm = /CommonPluginInstallPath\s+REG_[A-Z0-9_]+\s+(.+)$/m.exec(text);
              const pm = /PluginInstallPath\s+REG_[A-Z0-9_]+\s+(.+)$/m.exec(text);
              const common = cm && cm[1] ? cm[1].trim().replace(/[\\/]+$/, "") : "";
              const appSpecific = pm && pm[1] ? pm[1].trim().replace(/[\\/]+$/, "") : "";
              if (appSpecific) aePluginDetected = appSpecific;
              if (common) { commonDetected = common; detectPending = false; flushDetect(); return; }
            }
            nextFound();
          });
        };
        nextFound();
      };
      readViews();
    }
    function aePluginDir() {
      if (typeof aePluginDetected === "string" && aePluginDetected) return aePluginDetected;
      return isWin
        ? "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\Plug-ins"
        : "/Applications/Adobe After Effects 2025/Plug-ins";
    }
    function commonPluginDir() {
      if (isWin && typeof commonDetected === "string" && commonDetected) return commonDetected;
      return isWin
        ? "C:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore"
        : "/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore";
    }
    function perUserPluginDir() {
      const home = osMod && typeof osMod.homedir === "function" ? osMod.homedir() : "";
      return isWin
        ? pathMod.join(home, "AppData", "Roaming", "Adobe", "Common", "Plug-ins", "7.0", "MediaCore")
        : pathMod.join(home, "Library", "Application Support", "Adobe", "Common", "Plug-ins", "7.0", "MediaCore");
    }
    function platformFile(plugin) {
      if (!plugin) return "";
      return isWin ? (plugin.fileWin || "") : (plugin.fileMac || "");
    }
    function bundledPath(plugin) {
      const file = platformFile(plugin);
      if (!file) return "";
      return pathMod.join(extensionRoot(), "plugins", isWin ? "win" : "mac", file);
    }
    function targetPaths(plugin) {
      const file = platformFile(plugin);
      if (!file) return [];
      return [
        pathMod.join(aePluginDir(), file),
        pathMod.join(commonPluginDir(), file),
        pathMod.join(perUserPluginDir(), file)
      ];
    }
    function scannedTarget(plugin) {
      const file = platformFile(plugin);
      if (!file) return "";
      return pathMod.join(aePluginDir(), file);
    }
    function macBundleReady(src, exeName) {
      try {
        return !!(src && exeName && fs.existsSync(pathMod.join(src, "Contents", "MacOS", exeName)));
      } catch (e) { return false; }
    }
    function fileInstalled(plugin) {
      try {
        return targetPaths(plugin).some((p) => fs && fs.existsSync(p));
      } catch (e) { return false; }
    }
    function installedAtScannedLocation(plugin) {
      const file = platformFile(plugin);
      if (!file) return false;
      try {
        if (fs.existsSync(pathMod.join(aePluginDir(), file)) || fs.existsSync(pathMod.join(commonPluginDir(), file))) return true;
        return false;
      } catch (e) { return false; }
    }
    function copyRecursive(src, dst) {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
        fs.readdirSync(src).forEach((name) => copyRecursive(pathMod.join(src, name), pathMod.join(dst, name)));
      } else {
        fs.mkdirSync(pathMod.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
    }
    function removeRecursive(p) {
      if (!fs.existsSync(p)) return;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.readdirSync(p).forEach((name) => removeRecursive(pathMod.join(p, name)));
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
    }
    function pluginById(id) {
      return NATIVE_AEX.find((p) => p.id === id) || null;
    }
    function rowEls(id) {
      return {
        status: document.getElementById("npStatus-" + id),
        install: pack ? pack.querySelector('[data-np-install="' + id + '"]') : null,
        uninstall: pack ? pack.querySelector('[data-np-uninstall="' + id + '"]') : null
      };
    }
    function refreshRow(plugin, aeLoaded) {
      const els = rowEls(plugin.id);
      if (!els.status) return;
      const loaded = aeLoaded === true;
      const onDisk = fileInstalled(plugin);
      els.status.classList.remove("lg-status-ok", "lg-status-bad", "lg-status-warn");
      if (!platformFile(plugin)) {
        els.status.textContent = isWin ? "macOS only" : "Windows only";
        els.status.classList.add("lg-status-warn");
        if (els.install) { els.install.textContent = "Install"; els.install.disabled = true; }
        if (els.uninstall) els.uninstall.hidden = true;
        return;
      }
      if (loaded) {
        els.status.textContent = "Loaded ✓";
        els.status.classList.add("lg-status-ok");
        if (els.install) { els.install.textContent = "Reinstall"; els.install.disabled = false; }
        if (els.uninstall) els.uninstall.hidden = false;
      } else if (onDisk && !installedAtScannedLocation(plugin)) {
        els.status.textContent = "Old install — Reinstall";
        els.status.classList.add("lg-status-bad");
        if (els.install) { els.install.textContent = "Reinstall"; els.install.disabled = false; }
        if (els.uninstall) els.uninstall.hidden = false;
      } else if (onDisk) {
        els.status.textContent = "Installed — restart AE";
        els.status.classList.add("lg-status-warn");
        if (els.install) { els.install.textContent = "Reinstall"; els.install.disabled = false; }
        if (els.uninstall) els.uninstall.hidden = false;
      } else if (!bundledReady(plugin)) {
        els.status.textContent = "Not bundled";
        els.status.classList.add("lg-status-warn");
        if (els.install) { els.install.textContent = "Install"; els.install.disabled = true; }
        if (els.uninstall) els.uninstall.hidden = true;
      } else {
        els.status.textContent = "Not installed";
        if (els.install) { els.install.textContent = "Install"; els.install.disabled = false; }
        if (els.uninstall) els.uninstall.hidden = true;
      }
    }
    function checkLoaded(plugin) {
      const els = rowEls(plugin.id);
      if (els.status) els.status.textContent = "Checking…";
      try {
        callHost("ae_nativePluginStatus(" + hostArg(plugin.id) + ")", (parsed) => {
          lastLoaded[plugin.id] = !!(parsed && parsed.success);
          refreshRow(plugin, lastLoaded[plugin.id]);
        }, 8000);
      } catch (e) {
        auditFallback("MAIN_NP_CHECKLOADED_001", e);
        lastLoaded[plugin.id] = false;
        refreshRow(plugin, false);
      }
    }
    function refreshAll() {
      NATIVE_AEX.forEach((plugin) => refreshRow(plugin, lastLoaded[plugin.id] === true));
    }
    function checkAll() {
      NATIVE_AEX.forEach(checkLoaded);
    }

    function elevatedPowerShell(scriptPath, marker, onDone) {
      if (!cp) { onDone(false); return; }
      let child = null;
      try {
        child = cp.spawn("powershell.exe", [
          "-NoProfile", "-Command",
          "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"'"
        ], { windowsHide: true, stdio: "ignore" });
      } catch (spawnErr) { onDone(false); return; }
      let waited = 0;
      const timer = setInterval(() => {
        waited += 300;
        try {
          if (marker && fs.existsSync(marker)) {
            clearInterval(timer);
            try { fs.unlinkSync(marker); } catch (markerErr) { /* best effort */ }
            try { fs.unlinkSync(scriptPath); } catch (scriptErr) { /* best effort */ }
            onDone(true);
            return;
          }
        } catch (pollErr) { /* keep polling */ }
        if (waited > 45000) {
          clearInterval(timer);
          try { fs.unlinkSync(scriptPath); } catch (scriptErr) { /* best effort */ }
          onDone(false);
        }
      }, 300);
      child.on("error", () => { /* wait for marker or timeout */ });
    }
    function writeElevatedScript(lines) {
      const scriptPath = pathMod.join(osMod.tmpdir(), "compx_np_" + Date.now() + ".ps1");
      fs.writeFileSync(scriptPath, lines.join("\r\n"), "utf8");
      return scriptPath;
    }
    function psQuote(value) {
      return "'" + String(value).replace(/'/g, "''") + "'";
    }
    function copyFilesElevated(copies, onDone) {
      const marker = pathMod.join(osMod.tmpdir(), "compx_np_ok_" + Date.now() + ".tmp");
      const lines = ["$ErrorActionPreference = 'Stop'"];
      copies.forEach((item) => {
        lines.push("New-Item -ItemType Directory -Force -Path " + psQuote(item.dir) + " | Out-Null");
        lines.push("Copy-Item -LiteralPath " + psQuote(item.src) + " -Destination " + psQuote(item.dst) + " -Force");
      });
      lines.push("Set-Content -LiteralPath " + psQuote(marker) + " -Value 'ok' -Encoding ascii");
      try {
        elevatedPowerShell(writeElevatedScript(lines), marker, onDone);
      } catch (scriptErr) { onDone(false); }
    }
    function removeFilesElevated(paths, onDone) {
      const marker = pathMod.join(osMod.tmpdir(), "compx_np_rm_" + Date.now() + ".tmp");
      const lines = ["$ErrorActionPreference = 'SilentlyContinue'"];
      paths.forEach((p) => { lines.push("Remove-Item -LiteralPath " + psQuote(p) + " -Force"); });
      lines.push("Set-Content -LiteralPath " + psQuote(marker) + " -Value 'ok' -Encoding ascii");
      try {
        elevatedPowerShell(writeElevatedScript(lines), marker, onDone);
      } catch (scriptErr) { onDone(false); }
    }
    function bundledReady(plugin) {
      try {
        const src = bundledPath(plugin);
        if (!src || !fs.existsSync(src)) return false;
        if (isWin) return true;
        return macBundleReady(src, plugin.macExe);
      } catch (e) { return false; }
    }
    function shellQuote(value) {
      return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
    }
    function runElevatedMacScript(lines, onDone) {
      if (!cp || !fs || !osMod || !pathMod) { onDone(false, "macOS installer bridge unavailable"); return; }
      const scriptPath = pathMod.join(osMod.tmpdir(), "compx_np_" + Date.now() + ".zsh");
      try {
        fs.writeFileSync(scriptPath, ["#!/bin/zsh", "set -e"].concat(lines).join("\n"), { encoding: "utf8", mode: 448 });
      } catch (writeErr) { onDone(false, (writeErr && writeErr.message) || String(writeErr)); return; }
      const escapedPath = scriptPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const appleScript = 'do shell script ("/bin/zsh " & quoted form of "' + escapedPath + '") with administrator privileges';
      cp.execFile("/usr/bin/osascript", ["-e", appleScript], { timeout: 120000 }, (error) => {
        try { fs.unlinkSync(scriptPath); } catch (cleanupErr) { auditFallback("MAIN_NP_MAC_SCRIPT_CLEANUP_001", cleanupErr); }
        onDone(!error, error ? ((error.stderr || error.message || String(error)).trim()) : "");
      });
    }
    function elevatedMacInstall(src, dst, exeName, onDone) {
      const parent = pathMod.dirname(dst);
      const executable = pathMod.join(dst, "Contents", "MacOS", exeName);
      const stage = dst + ".installing";
      const lines = [
        "SRC=" + shellQuote(src),
        "DST=" + shellQuote(dst),
        "PARENT=" + shellQuote(parent),
        "STAGE=" + shellQuote(stage),
        '/bin/rm -rf "$STAGE"',
        '/bin/mkdir -p "$PARENT"',
        '/usr/bin/ditto --rsrc "$SRC" "$STAGE"',
        '/bin/chmod 755 "$STAGE/Contents/MacOS/' + String(exeName).replace(/'/g, "") + '" 2>/dev/null || true',
        '/bin/rm -rf "$DST"',
        '/bin/mv "$STAGE" "$DST"'
      ];
      runElevatedMacScript(lines, (ok, reason) => {
        if (!ok) { onDone(false, reason); return; }
        try { onDone(fs.existsSync(dst) && fs.existsSync(executable), "installed bundle verification failed"); }
        catch (verifyErr) { onDone(false, (verifyErr && verifyErr.message) || String(verifyErr)); }
      });
    }
    function finishInstall(list, doneLabel) {
      showToast((doneLabel || "Plugins installed") + ". Restart After Effects to load them.");
      list.forEach((plugin) => { lastLoaded[plugin.id] = false; refreshRow(plugin, false); });
      checkAll();
    }
    function installPlugins(list, doneLabel) {
      if (!fs || !pathMod) { showToast("Node file access unavailable in this panel build.", true); return; }
      const available = (list || []).filter(bundledReady);
      if (!available.length) {
        showToast(isWin
          ? "Bundled plugin file missing from plugins/win."
          : "No macOS plugin is bundled for the selected item. Liquid Glass and Deep Glow 2 are the Mac native plugins in this build.", true);
        return;
      }
      detectPluginDirs(() => {
        const copies = available.map((plugin) => {
          const dst = scannedTarget(plugin);
          return { plugin: plugin, src: bundledPath(plugin), dst: dst, dir: pathMod.dirname(dst) };
        });
        const copyOne = (item) => {
          if (isWin) {
            fs.mkdirSync(item.dir, { recursive: true });
            fs.copyFileSync(item.src, item.dst);
          } else {
            copyRecursive(item.src, item.dst);
            if (!macBundleReady(item.dst, item.plugin.macExe)) throw new Error("macOS plugin bundle incomplete after copy");
          }
        };
        try {
          copies.forEach(copyOne);
          finishInstall(available, doneLabel);
        } catch (copyErr) {
          if (isWin && cp && osMod) {
            copyFilesElevated(copies, (ok) => {
              if (ok) finishInstall(available, doneLabel);
              else showToast("Install cancelled or blocked. Allow the UAC prompt, or copy " + copies.map((c) => platformFile(c.plugin)).join(", ") + " into " + aePluginDir() + ".", true);
            });
            return;
          }
          if (!isWin) {
            const macCopies = copies.filter((item) => item.plugin && item.plugin.macExe);
            if (!macCopies.length) {
              showToast("Could not write to the After Effects Plug-ins folder. " + ((copyErr && copyErr.message) || ""), true);
              return;
            }
            const installNext = (idx) => {
              if (idx >= macCopies.length) { finishInstall(available, doneLabel); return; }
              const item = macCopies[idx];
              const destinations = [
                pathMod.join(commonPluginDir(), platformFile(item.plugin)),
                pathMod.join(aePluginDir(), platformFile(item.plugin))
              ];
              const tryDest = (di) => {
                if (di >= destinations.length) {
                  showToast("Could not install " + item.plugin.label + ". Approve the administrator prompt so After Effects can load the plugin from MediaCore.", true);
                  return;
                }
                elevatedMacInstall(item.src, destinations[di], item.plugin.macExe, (ok) => {
                  if (ok) installNext(idx + 1);
                  else tryDest(di + 1);
                });
              };
              tryDest(0);
            };
            installNext(0);
            return;
          }
          showToast("Could not write to the After Effects Plug-ins folder. " + ((copyErr && copyErr.message) || ""), true);
        }
      });
    }
    function uninstallPlugin(plugin) {
      if (!platformFile(plugin)) { showToast(plugin.label + " is not available on this platform.", true); return; }
      if (!fs || !pathMod) { showToast("Node file access unavailable in this panel build.", true); return; }
      try {
        if (!window.confirm("Remove " + plugin.label + " from After Effects' Plug-ins folder? You can reinstall it anytime from this panel.")) return;
      } catch (e) { /* confirm() not available — proceed */ }
      const present = [];
      const errors = [];
      let removed = 0;
      targetPaths(plugin).forEach((p) => {
        try {
          if (fs.existsSync(p)) { present.push(p); removeRecursive(p); removed++; }
        } catch (e) {
          present.push(p);
          errors.push((e && e.code) || (e && e.message) || String(e));
          auditFallback("MAIN_NP_UNINSTALL_001", e);
        }
      });
      const finishOk = () => {
        showToast(plugin.label + " removed. Restart After Effects to unload it.");
        lastLoaded[plugin.id] = false;
        refreshRow(plugin, false);
      };
      if (removed === 0 && present.length && isWin && cp && osMod) {
        removeFilesElevated(present, (ok) => {
          if (ok) finishOk();
          else showToast("Could not remove " + plugin.label + ": " + (errors[0] || "elevation cancelled"), true);
        });
        return;
      }
      if (removed === 0 && present.length && !isWin && cp && osMod) {
        runElevatedMacScript(present.map((p) => "/bin/rm -rf " + shellQuote(p)), (ok, reason) => {
          if (ok) finishOk();
          else showToast("Could not remove " + plugin.label + ": " + (reason || "administrator approval cancelled"), true);
        });
        return;
      }
      if (removed > 0) finishOk();
      else if (errors.length) showToast("Could not remove " + plugin.label + ": " + errors[0], true);
      else showToast(plugin.label + " is not installed.", true);
    }

    NATIVE_AEX.forEach((plugin) => {
      const applyBtn = document.getElementById("btnNpApply-" + plugin.id);
      applyBtn && applyBtn.addEventListener("click", () => {
        runTool("ae_nativePluginApplySmart(" + hostArg(plugin.id) + ")", plugin.label + " applied");
      });
    });
    if (pack) {
      pack.addEventListener("click", (ev) => {
        const installBtn = ev.target.closest("[data-np-install]");
        const uninstallBtn = ev.target.closest("[data-np-uninstall]");
        if (installBtn) {
          const plugin = pluginById(installBtn.getAttribute("data-np-install"));
          if (plugin) installPlugins([plugin], plugin.label + " installed");
        } else if (uninstallBtn) {
          const plugin = pluginById(uninstallBtn.getAttribute("data-np-uninstall"));
          if (plugin) uninstallPlugin(plugin);
        }
      });
    }
    const btnAll = document.getElementById("btnNpInstallAll");
    btnAll && btnAll.addEventListener("click", () => {
      const available = NATIVE_AEX.filter(bundledReady);
      if (!available.length) {
        showToast(isWin ? "No Windows plugins are bundled." : "No macOS plugins are bundled in this build.", true);
        return;
      }
      installPlugins(available, available.length === 1 ? available[0].label + " installed" : "All available native plugins installed");
    });
    window.addEventListener("compx:lg-status-refresh", checkAll);
    refreshAll();
    checkAll();
    detectPluginDirs(() => { try { refreshAll(); } catch (e) { auditFallback("MAIN_NP_DETECT_REFRESH_001", e); } });
  }

  function wirePluginSettingsModal() {
    const gearBtn = document.getElementById("cx-settings-btn");
    const modal = document.getElementById("lgSettingsModal");
    const closeBtn = document.getElementById("lgSettingsClose");
    if (!gearBtn || !modal) return;
    const open = (cardId) => {
      modal.style.display = "flex";
      try { window.dispatchEvent(new CustomEvent("compx:lg-status-refresh")); } catch (e) { auditFallback("MAIN_LG_MODALOPEN_001", e); }
      if (cardId) {
        const card = document.getElementById(cardId);
        if (card) {
          document.querySelectorAll(".stg-card-highlight").forEach((c) => c.classList.remove("stg-card-highlight"));
          card.classList.add("stg-card-highlight");
          setTimeout(() => { try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { /* older CEP */ card.scrollIntoView(); } }, 60);
        }
      }
    };
    const close = () => { modal.style.display = "none"; };
    gearBtn.addEventListener("click", open);
    closeBtn && closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) close(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && modal.style.display !== "none") close(); });
    // Shared helper so any feature (Auto Captions, background remover) can open
    // Settings and highlight the download card that needs user action.
    window.openCompXSettings = open;
  }

  function wireAppTabs() {
    const row = document.getElementById("appTabsRow");
    const utilityRow = document.getElementById("orbitUtilityTabs");
    if (!row) return;
    const activate = (target, persist) => {
      const btn = document.querySelector('[data-apptab="' + target + '"]');
      const panel = document.getElementById("panel-" + target);
      if (!btn || !panel) return false;
      document.querySelectorAll("#appTabsRow .app-tab, #orbitUtilityTabs .app-tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".app-panel").forEach((p) => p.classList.toggle("active", p === panel));
      if (target === "studio") window.dispatchEvent(new CustomEvent("compx:bg-context-request"));
      if (persist !== false) { try { localStorage.setItem("compXActiveTab", target); } catch (e) { auditFallback("MAIN_WIREAPPTABS_001", e); } }
      return true;
    };
    const handleTabClick = (ev) => {
      const btn = ev.target.closest(".app-tab");
      if (btn) activate(btn.dataset.apptab, true);
    };
    row.addEventListener("click", handleTabClick);
    if (utilityRow) utilityRow.addEventListener("click", handleTabClick);
    let saved = "tools";
    try { saved = localStorage.getItem("compXActiveTab") || "tools"; } catch (e) { auditFallback("MAIN_WIREAPPTABS_002", e); }
    if (!activate(saved, false)) activate("tools", false);
  }

  // Align-to mode: selection bbox (default) / comp frame / key (last-selected) layer.
  let compXAlignMode = "selection";
  try { compXAlignMode = localStorage.getItem("compXAlignMode") || "selection"; } catch (e) { compXAlignMode = "selection"; }

  function wireAlignModeToggle() {
    const row = document.getElementById("alignModeRow");
    if (!row) return;
    row.querySelectorAll(".align-mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.alignMode === compXAlignMode);
      b.addEventListener("click", () => {
        compXAlignMode = b.dataset.alignMode;
        try { localStorage.setItem("compXAlignMode", compXAlignMode); } catch (e) { void e; }
        row.querySelectorAll(".align-mode-btn").forEach((x) => x.classList.toggle("active", x === b));
      });
    });
  }

  function wireSmartGrid() {
    const modal = document.getElementById("smartGridModal");
    if (!modal) return;
    const openBtn = document.getElementById("btnSmartGrid");
    const closeBtn = document.getElementById("btnSmartGridClose");
    const cancelBtn = document.getElementById("btnSmartGridCancel");
    const generateBtn = document.getElementById("btnSmartGridGenerate");
    const shapeSel = document.getElementById("sgShape");
    const imageRow = document.getElementById("sgImageRow");
    const trackSel = document.getElementById("sgTrackLayer");
    const statusEl = document.getElementById("sgStatus");
    const val = (id, dflt) => { const el = document.getElementById(id); return el ? el.value : dflt; };

    function populateTrackLayers() {
      callHost("ae_listLayers()", (parsed) => {
        const prev = trackSel.value;
        trackSel.innerHTML = '<option value="">None — fixed grid</option>';
        let names = [];
        if (Array.isArray(parsed)) names = parsed;
        else if (parsed && Array.isArray(parsed.layers)) names = parsed.layers;
        else if (parsed && typeof parsed === "object") { try { names = Object.values(parsed); } catch (e) { names = []; } }
        names.forEach((n) => {
          const s = String(n || "").trim();
          if (!s) return;
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          if (s === prev) opt.selected = true;
          trackSel.appendChild(opt);
        });
      });
    }

    function open() {
      populateTrackLayers();
      modal.style.display = "flex";
      if (statusEl) statusEl.textContent = "Generates a procedural grid + intersection markers on one shape layer.";
    }
    function close() { modal.style.display = "none"; }

    if (openBtn) openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (shapeSel && imageRow) {
      const syncImageRow = () => { imageRow.hidden = shapeSel.value !== "image"; };
      shapeSel.addEventListener("change", syncImageRow);
      syncImageRow();
    }
    if (generateBtn) {
      generateBtn.addEventListener("click", () => {
        const config = {
          width: val("sgWidth", 600),
          height: val("sgHeight", 400),
          cell: val("sgCell", 100),
          anchorX: val("sgAnchorX", 960),
          anchorY: val("sgAnchorY", 540),
          stroke: val("sgStroke", 2),
          color: val("sgColor", "#22ff6f"),
          opacity: val("sgOpacity", 100),
          markerShape: val("sgShape", "square"),
          markerSize: val("sgMarkerSize", 8),
          markerRotation: val("sgMarkerRot", 0),
          markerColor: val("sgMarkerColor", "#22ff6f"),
          markerOpacity: val("sgMarkerOpacity", 100),
          animate: val("sgAnimate", "none"),
          trackName: trackSel ? trackSel.value : "",
          imagePath: val("sgImagePath", "")
        };
        const json = JSON.stringify(config);
        runTool("ae_smartGrid(" + json + ")", "Smart Grid created");
        close();
      });
    }
  }

  function wireFlexGrid() {
    const applyBtn = document.getElementById("btnFlexGridApply");
    if (!applyBtn) return;
    const num = (id, fallback) => {
      const el = document.getElementById(id);
      const n = el ? parseFloat(el.value) : NaN;
      return isFinite(n) ? n : fallback;
    };
    applyBtn.addEventListener("click", () => {
      const cfg = {
        cols: num("fgp-cols", 3),
        rows: num("fgp-rows", 3),
        border: num("fgp-border", 3),
        w: num("fgp-w", 250),
        h: num("fgp-h", 250),
        marker: num("fgp-marker", 8),
        opacity: num("fgp-opacity", 100),
        markerShape: (document.getElementById("fgp-marker-shape") || {}).value || "plus"
      };
      runTool("ae_applyFlexGrid(" + hostArg(JSON.stringify(cfg)) + ")", "CompX Grid applied");
    });
  }

  function wireLayoutGrid() {
    const section = document.getElementById("toolkitLayoutGridSection");
    if (!section) return;
    const selectEl = document.getElementById("layoutGridSelect");
    const listEl = document.getElementById("layoutGridLayerList");
    const statusEl = document.getElementById("layoutGridStatus");
    const changeEl = document.getElementById("layoutGridChangeMode");
    let mode = "rect";
    let grids = [];
    const setStatus = (msg, error) => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = error ? "#ff8e97" : "";
    };
    const selectedIds = () => Array.prototype.map.call(listEl ? listEl.querySelectorAll("li.is-selected") : [], (el) => Number(el.getAttribute("data-id"))).filter((id) => isFinite(id));
    const currentName = () => (selectEl && selectEl.value) || "";
    const setMode = (next) => {
      mode = next || "rect";
      section.querySelectorAll("[data-layout-grid-mode]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-layout-grid-mode") === mode);
      });
      if (changeEl) changeEl.value = mode;
    };
    const renderLayers = (grid) => {
      if (!listEl) return;
      listEl.innerHTML = "";
      const layers = (grid && grid.layers) || [];
      if (!layers.length) {
        const empty = document.createElement("li");
        empty.textContent = "No layers on this grid yet.";
        listEl.appendChild(empty);
        return;
      }
      layers.forEach((layer, index) => {
        const item = document.createElement("li");
        item.setAttribute("data-id", String(layer.id));
        item.innerHTML = "<b>" + (index + 1) + "</b><span></span>";
        item.querySelector("span").textContent = layer.name || ("Layer " + layer.id);
        item.addEventListener("click", (event) => {
          if (!event.ctrlKey && !event.metaKey) {
            listEl.querySelectorAll("li.is-selected").forEach((el) => el.classList.remove("is-selected"));
          }
          item.classList.toggle("is-selected");
        });
        listEl.appendChild(item);
      });
    };
    const renderGrids = (keepName) => {
      const preferred = keepName || currentName();
      if (selectEl) {
        selectEl.innerHTML = "";
        if (!grids.length) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "No layout grids";
          selectEl.appendChild(opt);
        } else {
          grids.forEach((grid) => {
            const opt = document.createElement("option");
            opt.value = grid.name;
            opt.textContent = grid.name + " (" + ((grid.layers && grid.layers.length) || 0) + ")";
            selectEl.appendChild(opt);
          });
          const match = grids.some((grid) => grid.name === preferred);
          selectEl.value = match ? preferred : grids[0].name;
        }
      }
      const active = grids.filter((grid) => grid.name === currentName())[0] || grids[0] || null;
      if (active && active.mode) setMode(active.mode);
      renderLayers(active);
    };
    const refresh = (keepName) => {
      callHost("ae_layoutGridList()", (parsed) => {
        grids = (parsed && parsed.success && Array.isArray(parsed.grids)) ? parsed.grids : [];
        renderGrids(keepName);
        if (!parsed || parsed.success === false) setStatus((parsed && parsed.message) || "Could not read layout grids.", true);
      });
    };
    const run = (script, okMsg) => {
      runTool(script, okMsg, (result) => {
        setStatus((result && result.message) || okMsg, !(result && result.success));
        refresh((result && result.gridName) || currentName());
      });
    };
    section.querySelectorAll("[data-layout-grid-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.getAttribute("data-layout-grid-mode")));
    });
    if (selectEl) selectEl.addEventListener("change", () => renderLayers(grids.filter((grid) => grid.name === currentName())[0]));
    const createBtn = document.getElementById("btnLayoutGridCreate");
    if (createBtn) createBtn.addEventListener("click", () => run("ae_layoutGridCreate(" + hostArg(JSON.stringify({ mode: mode })) + ")", "Layout Grid created"));
    const refreshBtn = document.getElementById("btnLayoutGridRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", () => refresh(currentName()));
    const dupBtn = document.getElementById("btnLayoutGridDuplicate");
    if (dupBtn) dupBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      run("ae_layoutGridDuplicate(" + hostArg(currentName()) + ")", "Layout Grid duplicated");
    });
    const delBtn = document.getElementById("btnLayoutGridDelete");
    if (delBtn) delBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      run("ae_layoutGridRemove(" + hostArg(currentName()) + ")", "Layout Grid removed");
    });
    const changeBtn = document.getElementById("btnLayoutGridChangeMode");
    if (changeBtn) changeBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      const next = (changeEl && changeEl.value) || mode;
      run("ae_layoutGridSetMode(" + hostArg(JSON.stringify({ name: currentName(), mode: next })) + ")", "Layout Grid mode updated");
    });
    const addBtn = document.getElementById("btnLayoutGridAdd");
    if (addBtn) addBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      run("ae_layoutGridAdd(" + hostArg(currentName()) + ")", "Layers added to Layout Grid");
    });
    const replaceBtn = document.getElementById("btnLayoutGridReplace");
    if (replaceBtn) replaceBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      const ids = selectedIds();
      if (!ids.length) { setStatus("Highlight a grid slot, then select a replacement layer.", true); return; }
      run("ae_layoutGridReplace(" + hostArg(JSON.stringify({ name: currentName(), ids: ids })) + ")", "Layout Grid slot replaced");
    });
    const removeBtn = document.getElementById("btnLayoutGridRemoveLayers");
    if (removeBtn) removeBtn.addEventListener("click", () => {
      if (!currentName()) { setStatus("Create a layout grid first.", true); return; }
      const ids = selectedIds();
      if (!ids.length) { setStatus("Highlight one or more grid layers to unlink.", true); return; }
      run("ae_layoutGridUnlink(" + hostArg(JSON.stringify({ name: currentName(), ids: ids })) + ")", "Layers unlinked from Layout Grid");
    });
    setMode("rect");
    refresh();
  }

  function wireRoundPro() {
    const section = document.getElementById("toolkitRoundProSection");
    if (!section) return;
    const num = (id, fallback) => {
      const el = document.getElementById(id);
      const n = el ? parseFloat(el.value) : NaN;
      return isFinite(n) ? n : fallback;
    };
    const corners = ["rp-tl", "rp-tr", "rp-bl", "rp-br"].map((id) => document.getElementById(id));
    const uniformEl = document.getElementById("rp-uniform");
    const consistentEl = document.getElementById("rp-consistent");
    let mode = "rectangle";
    const syncCorners = () => {
      const linked = !uniformEl || uniformEl.checked;
      const circle = mode === "circle";
      corners.forEach((el) => {
        if (el) el.disabled = linked || circle;
      });
    };
    section.querySelectorAll("[data-rp-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.getAttribute("data-rp-mode") || "rectangle";
        section.querySelectorAll("[data-rp-mode]").forEach((other) => {
          other.classList.toggle("active", other === btn);
        });
        syncCorners();
      });
    });
    if (uniformEl) {
      uniformEl.addEventListener("change", () => {
        if (!uniformEl.checked) {
          const radius = num("rp-radius", 150);
          corners.forEach((el) => {
            if (el && (!el.value || Number(el.value) === 0)) el.value = String(radius);
          });
        }
        syncCorners();
      });
    }
    syncCorners();
    const applyBtn = document.getElementById("btnRoundProApply");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const cfg = {
          mode: mode,
          radius: num("rp-radius", 150),
          tl: num("rp-tl", 0),
          tr: num("rp-tr", 0),
          bl: num("rp-bl", 0),
          br: num("rp-br", 0),
          uniform: !uniformEl || uniformEl.checked,
          consistent: !consistentEl || consistentEl.checked
        };
        runTool("ae_applyRoundPro(" + hostArg(JSON.stringify(cfg)) + ")", "Round Pro applied");
      });
    }
    const undoBtn = document.getElementById("btnRoundProUndo");
    if (undoBtn) undoBtn.addEventListener("click", () => runTool("ae_undoRoundPro()", "Round Pro undone"));
    const fitBtn = document.getElementById("btnRoundProFit");
    if (fitBtn) fitBtn.addEventListener("click", () => runTool("ae_fitToComp()", "Fit to comp"));
  }

  function wireSuperMorph() {
    const card = document.getElementById("cxSuperMorphCard");
    const applyBtn = document.getElementById("btnSuperMorph");
    if (!card || !applyBtn) return;
    const modeInput = document.getElementById("morphMode");
    const status = document.getElementById("morphStatus");
    const num = (id, fallback) => {
      const el = document.getElementById(id);
      const n = el ? parseFloat(el.value) : NaN;
      return isFinite(n) ? n : fallback;
    };
    const refreshLabels = () => {
      const d = document.getElementById("morphDurationVal");
      const e = document.getElementById("morphElasticityVal");
      const s = document.getElementById("morphSmoothnessVal");
      if (d) d.textContent = num("morphDuration", 0.8).toFixed(1) + "s";
      if (e) e.textContent = Math.round(num("morphElasticity", 35)) + "%";
      if (s) s.textContent = Math.round(num("morphSmoothness", 70)) + "%";
    };
    ["morphDuration", "morphElasticity", "morphSmoothness"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", refreshLabels);
    });
    let mode = (modeInput && modeInput.value) || "travel";
    const subtitle = document.getElementById("morphSubtitle");
    const setMode = (next) => {
      mode = next || "travel";
      if (modeInput) modeInput.value = mode;
      card.dataset.mode = mode;
      card.querySelectorAll("[data-morph-mode]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-morph-mode") === mode);
      });
      if (subtitle) {
        if (mode === "path") subtitle.textContent = "Select exactly 2 Shape Layers (source first, target last). Creates a live morph path.";
        else if (mode === "liquid") subtitle.textContent = "Select 2+ layers. Opacity crossfade with warp between each step.";
        else subtitle.textContent = "Sources first, target last. Select a Mask/Shape Path in the timeline to travel along it.";
      }
      if (status) {
        status.textContent = mode === "path"
          ? "Path morph: pick 2 shape layers, then Morph It."
          : mode === "liquid"
            ? "Liquid morph: pick 2+ layers, then Morph It."
            : "Travel: pick 2+ layers (optional path in timeline), then Morph It.";
        status.style.color = "";
      }
    };
    card.querySelectorAll("[data-morph-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.getAttribute("data-morph-mode")));
    });
    setMode(mode);
    refreshLabels();
    applyBtn.addEventListener("click", () => {
      const trailCount = Math.max(0, Math.round(num("morphTrailCount", 0)));
      const sliceCount = Math.max(0, Math.round(num("morphSliceCount", 0)));
      const cfg = {
        duration: num("morphDuration", 0.8),
        elasticity: num("morphElasticity", 35),
        smoothness: num("morphSmoothness", 70),
        style: "liquid",
        autoEase: !!(document.getElementById("morphAutoEase") || {}).checked,
        mode: mode,
        pair: !!(document.getElementById("morphPair") || {}).checked,
        reverse: !!(document.getElementById("morphReverse") || {}).checked,
        trails: trailCount > 0,
        trailCount: trailCount,
        trailAmount: trailCount > 0 ? Math.min(100, trailCount * 12) : 0,
        slicer: sliceCount > 0,
        sliceCount: sliceCount
      };
      if (status) { status.textContent = "Creating Super Morph…"; status.style.color = "#f5a623"; }
      const hostFn = mode === "travel" ? "ae_applyTravelMorph" : "ae_superMorphSmart";
      cfg.mode = mode;
      runTool(hostFn + "(" + hostArg(JSON.stringify(cfg)) + ")", "Super Morph created", (result) => {
        if (!status) return;
        status.textContent = result.message || (result.success ? "Super Morph created." : "Super Morph failed.");
        status.style.color = result.success ? "#6fdc8c" : "#ff6b6b";
      });
    });
  }

  function wireCaptionStudioShell() {
    // EDIT TEXT folds the raw SRT away. The stage opens on the one-line cue
    // summary instead: the textarea is 220-360px of monospace that most
    // people never touch, and with it open the style grid and CREATE
    // CAPTIONS both fell below the fold.
    const advBtn = document.getElementById("btnSimpleAdvanced");
    const editor = document.getElementById("simpleSrtEditor");
    if (!advBtn || !editor) return;
    let expanded = false;
    const sync = () => {
      // The hidden attribute, not an inline display: orbit-captions.css pins
      // the editor to display:block, and an inline style loses to that.
      editor.hidden = !expanded;
      advBtn.classList.toggle("active", expanded);
      advBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      advBtn.textContent = expanded ? "\u2713 DONE" : "\u270E EDIT TEXT";
      if (expanded) { try { editor.focus({ preventScroll: true }); } catch (focusError) { editor.focus(); } }
    };
    advBtn.addEventListener("click", () => { expanded = !expanded; sync(); });
    sync();
  }

  function wireToolButtons() {
    // Reuse the same counter fields/host actions inside the popup; never clone
    // the controls, so values and their existing event handlers stay intact.
    const counterModal = document.getElementById("numberCounterModal");
    const counterTrigger = document.getElementById("btnNumberCounter");
    const counterClose = document.getElementById("btnNumberCounterClose");
    if (counterModal && counterTrigger && counterClose) {
      const closeCounter = () => {
        counterModal.style.display = "none";
        counterTrigger.setAttribute("aria-expanded", "false");
        counterTrigger.focus();
      };
      counterTrigger.addEventListener("click", () => {
        counterModal.style.display = "flex";
        counterTrigger.setAttribute("aria-expanded", "true");
        document.getElementById("counterFrom").focus();
      });
      counterClose.addEventListener("click", closeCounter);
      counterModal.addEventListener("click", (event) => {
        if (event.target === counterModal) closeCounter();
      });
      counterModal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); closeCounter();
        } else if (event.key === "Tab") {
          const focusable = Array.from(counterModal.querySelectorAll("button, input, select, [tabindex]"))
            .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
    }
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        const arg = btn.dataset.arg;
        switch (tool) {
          case "align":
            runTool('ae_alignClassic("' + arg + '")', "Aligned");
            break;
          case "anchor":
            runTool('ae_setAnchor("' + arg + '")', "Anchor set");
            break;
          case "flip":
            runTool('ae_applyFlip("' + arg + '")', arg === "vertical" ? "Flipped vertically" : "Flipped horizontally");
            break;
          case "precompose":
            runTool("ae_precompose(" + arg + ")", "Precomposed");
            break;
          case "precomposeSeparate":
            runTool("ae_precomposeSeparate()", "Precomposed separately");
            break;
          case "unprecompose":
            runTool("ae_unprecompose()", "Unprecomposed");
            break;
          case "createLayer": {
            const matchChk = document.getElementById("chkMatchLayerDuration");
            const matchDur = !!(matchChk && matchChk.checked);
            runTool('ae_createLayer("' + arg + '", ' + (matchDur ? "true" : "false") + ')', "Layer created");
            break;
          }
          case "fitToComp":
            runTool("ae_fitToComp()", "Fit to comp");
            break;
          case "distribute":
            runTool('ae_distribute("' + arg + '")', arg === "space" ? "Spaced evenly" : "Distributed");
            break;
          case "centerToComp":
            runTool('ae_align("center")', "Centered");
            break;
          case "matchSize":
            runTool("ae_matchSize()", "Matched size");
            break;
          case "trueDuplicate":
            runTool("ae_trueDuplicate()", "Duplicated");
            break;
          case "bounce":
            (async function () {
              const params = await showModal({
                title: "Bounce Settings",
                message: "Amplitude, Frequency, Decay (e.g. 0.06, 3.0, 6.0):",
                input: true,
                defaultValue: "0.06, 3.0, 6.0",
                placeholder: "0.06, 3.0, 6.0",
                okText: "Next",
              });
              if (params === null) return;
              const parts = String(params || "0.06, 3.0, 6.0").split(/[,\s]+/);
              const amp = parseFloat(parts[0]) || 0.06;
              const freq = parseFloat(parts[1]) || 3.0;
              const decay = parseFloat(parts[2]) || 6.0;
              const target = await showModal({
                title: "Bounce Target",
                message: "Property: auto / scale / position / rotation / opacity",
                input: true,
                defaultValue: "auto",
                placeholder: "auto",
                okText: "Apply",
              });
              if (target === null) return;
              const payload = JSON.stringify({ amp, freq, decay, target: target || "auto" })
                .replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              runTool('ae_addBounce("' + payload + '")', "Bounce added");
          
  // -------------------------------------------------------------
  // FLEX CAPTION STUDIO � replaces old word-by-word caption system
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 3D TEXT EXTRUSION � Advanced tab
  // -------------------------------------------------------------
  
  })();
            break;
          case "effect":
            runTool('ae_applyEffect("' + arg + '", "' + btn.textContent.trim() + '")', "Effect applied");
            break;
          case "createShape":
            runTool("ae_createShapeLayer()", "Shape layer created");
            break;
          case "capitalize":
            runTool("ae_capitalizeText()", "Text capitalized");
            break;
          case "trimOut":
            runTool("ae_trimOut()", "Trimmed");
            break;
          case "alignDown":
            runTool("ae_alignDown()", "Aligned down");
            break;
          case "removeFx":
            (async function () {
              const modeInput = await showModal({
                title: "FX Remove",
                message: "Mode: all / selected / disabled / duplicates",
                input: true,
                defaultValue: "all",
                placeholder: "all",
                okText: "Next",
              });
              if (modeInput === null) return;
              const mode = String(modeInput || "all").trim().toLowerCase();
              let effectName = "";
              if (mode === "selected") {
                const nameInput = await showModal({
                  title: "Selected Effect",
                  message: "Effect name to remove (e.g. Glow, Drop Shadow):",
                  input: true,
                  placeholder: "Glow",
                  okText: "Remove",
                });
                if (!nameInput) return;
                effectName = nameInput;
              }
              const payload = JSON.stringify({ mode: mode, effectName: effectName })
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"');
              runTool('ae_removeEffectsAdvanced("' + payload + '")', "Effects removed");
          
  // -------------------------------------------------------------
  // FLEX CAPTION STUDIO � replaces old word-by-word caption system
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 3D TEXT EXTRUSION � Advanced tab
  // -------------------------------------------------------------
  
  })();
            break;
          case "trimBefore":
            runTool("ae_trimBefore()", "Trimmed before playhead");
            break;
          case "trimAfter":
            runTool("ae_trimAfter()", "Trimmed after playhead");
            break;
          case "deleteBeforeLayers":
            (async function () {
              const s1 = await showModal({
                title: "Delete Before",
                message: "Scope: selected / all  |  Ripple: y/n  (e.g. selected,y)",
                input: true,
                defaultValue: "selected,y",
                placeholder: "selected,y",
                okText: "Delete",
              });
              if (s1 === null) return;
              const p1 = String(s1 || "selected,y").split(",").map((s) => s.trim());
              const payload1 = JSON.stringify({
                scope: (p1[0] === "all") ? "all" : "selected",
                ripple: p1[1] === "y" || p1[1] === "yes" || p1[1] === "true"
              }).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              runTool('ae_deleteBeforeLayers("' + payload1 + '")', "Deleted before playhead");
          
  // -------------------------------------------------------------
  // FLEX CAPTION STUDIO � replaces old word-by-word caption system
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 3D TEXT EXTRUSION � Advanced tab
  // -------------------------------------------------------------
  
  })();
            break;
          case "deleteAfterLayers":
            (async function () {
              const s2 = await showModal({
                title: "Delete After",
                message: "Scope: selected / all  |  Ripple: y/n  (e.g. selected,y)",
                input: true,
                defaultValue: "selected,y",
                placeholder: "selected,y",
                okText: "Delete",
              });
              if (s2 === null) return;
              const p2 = String(s2 || "selected,y").split(",").map((s) => s.trim());
              const payload2 = JSON.stringify({
                scope: (p2[0] === "all") ? "all" : "selected",
                ripple: p2[1] === "y" || p2[1] === "yes" || p2[1] === "true"
              }).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              runTool('ae_deleteAfterLayers("' + payload2 + '")', "Deleted after playhead");
          
  // -------------------------------------------------------------
  // FLEX CAPTION STUDIO � replaces old word-by-word caption system
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 3D TEXT EXTRUSION � Advanced tab
  // -------------------------------------------------------------
  
  })();
            break;
          case "splitMasks":
            runTool("ae_splitMasks()", "Masks split");
            break;
          case "trackPath":
            runTool("ae_trackPath()", "Track null created");
            break;
          case "splitAtPlayhead":
            runTool("ae_splitAtPlayhead()", "Split at playhead");
            break;
          case "sortLayers":
            runTool('ae_sortLayers("' + (arg || "nameAZ") + '")', "Layers sorted");
            break;
          case "autoOrganize":
            runTool("ae_autoOrganize()", "Layers auto-organized into groups");
            break;
          case "colorCodeLayers":
            runTool("ae_colorCodeByType()", "Layers color-coded by type");
            break;
          case "memoryPurge":
            runTool('ae_memoryPurge("' + (arg || "all") + '")', "Memory purged");
            break;
          case "toggleSolo":
            runTool("ae_toggleSolo()", "Solo toggled");
            break;
          case "toggleShy":
            runTool("ae_toggleShy()", "Shy toggled");
            break;
          case "curvePreset":
            runTool('ae_applyCurvePreset("' + arg + '")', "Curve applied");
            break;
          case "purge":
            runTool('ae_purge("' + arg + '")', "Purged " + arg);
            break;
          case "solidToPlayhead":
          case "solidFromPlayhead":
          case "solidBetweenLayers":
          case "solidFullComp": {
            const sc = document.getElementById("solidColor");
            const color = (sc && sc.value) || "#000000";
            runTool('ae_solidTool("' + tool + '","' + color + '")', "Solid created");
            break;
          }
          case "glowPreset": {
            const ga = document.getElementById("glowColorA");
            const gb = document.getElementById("glowColorB");
            const gm = document.getElementById("glowColorMode");
            const colA = (ga && ga.value) || "#ff4444";
            const colB = (gb && gb.value) || "#ffff00";
            const mode = (gm && gm.value) || "ab";
            const payload = JSON.stringify({ preset: arg || "medium", colorA: colA, colorB: colB, colorMode: mode })
              .replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            runTool('ae_applyGlowPreset("' + payload + '")', "Glow preset applied");
            break;
          }
          case "gradientPlate": {
            const g1 = document.getElementById("gradColor1");
            const g2 = document.getElementById("gradColor2");
            const gt = document.getElementById("gradType");
            const ga2 = document.getElementById("gradAngle");
            const gp = JSON.stringify({
              preset: arg || "custom",
              color1: (g1 && g1.value) || "#ff416c",
              color2: (g2 && g2.value) || "#ff4b2b",
              type: (gt && gt.value) || "1",
              angle: parseFloat((ga2 && ga2.value) || 0)
            }).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            runTool('ae_applyGradientPlate("' + gp + '")', "Gradient applied");
            break;
          }
          case "xCrop":
            runTool("ae_processXCrop()", "X Crop complete");
            break;
          case "xactCrop":
            runTool("ae_processBoltCrop(false)", "Xact Crop complete");
            break;
          case "xpertCrop":
            runTool("ae_processBoltCrop(true)", "Xpert Crop complete");
            break;
          default:
            break;
        }
      });
    });

    const counterStyle = document.getElementById("counterStyle");
    const counterCustomRow = document.getElementById("counterCustomRow");
    function syncCounterCustomRow() {
      if (!counterStyle || !counterCustomRow) return;
      counterCustomRow.style.display = counterStyle.value === "custom" ? "flex" : "none";
    }
    if (counterStyle) {
      counterStyle.addEventListener("change", syncCounterCustomRow);
      syncCounterCustomRow();
    }

    const btnCounter = document.getElementById("btnCreateCounter");
    if (btnCounter) {
      btnCounter.addEventListener("click", () => {
        const from = document.getElementById("counterFrom").value || "0";
        const to = document.getElementById("counterTo").value || "100";
        const decimals = document.getElementById("counterDecimals").value || "0";
        const prefix = document.getElementById("counterPrefix").value || "";
        const suffix = document.getElementById("counterSuffix").value || "";
        const style = (counterStyle && counterStyle.value) || "custom";
        const locale = document.getElementById("counterLocale").value || "us";
        const symbolPos = document.getElementById("counterSymbolPos").value || "prefix";
        const script =
          "ae_createNumberCounter(" + Number(from) + ", " + Number(to) + ", " + Number(decimals) +
          ", " + hostArg(prefix) + ", " + hostArg(suffix) + ", " + hostArg(style) + ", " + hostArg(locale) + ", " + hostArg(symbolPos) + ")";
        runTool(script, "Number counter created");
      });
    }

    const btnApplyPoz = document.getElementById("btnApplyPoz");
    if (btnApplyPoz) {
      btnApplyPoz.addEventListener("click", () => {
        const px = document.getElementById("counterPosStep").value || "0";
        runTool("ae_applyCounterPosition(" + Number(px) + ")", "Position linked to counter");
      });
    }
  }

  // ---------------- Property Clipboard ----------------

  let clipboardSlots = { 1: null, 2: null, 3: null };
  let activeClipSlot = 1;
  // Tracks which slots hold Copy FX data, which now lives only in AE's own
  // ExtendScript memory (see ae_copyEverything/ae_pasteEverything) so large
  // captures never have to cross the evalScript() bridge.
  let fxClipboardHasData = { 1: false, 2: false, 3: false };

  function wirePropertyClipboard() {
    const slotsRow = document.getElementById("clipSlotsRow");
    if (slotsRow) {
      slotsRow.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".clip-slot");
        if (!btn) return;
        activeClipSlot = Number(btn.dataset.slot);
        slotsRow.querySelectorAll(".clip-slot").forEach((b) => b.classList.toggle("active", b === btn));
      });
    }

    const btnClear = document.getElementById("btnClipboardClear");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        clipboardSlots = { 1: null, 2: null, 3: null };
        fxClipboardHasData = { 1: false, 2: false, 3: false };
        callHost("ae_clearAllClipboardSlots()", (parsed) => {
          if (!parsed.success) showToast(parsed.message || "Host clipboard could not be cleared", true);
        });
        if (slotsRow) slotsRow.querySelectorAll(".clip-slot").forEach((b) => b.classList.remove("has-data"));
        showToast("Clipboard cleared");
      });
    }

    const btnCopy = document.getElementById("btnClipCopy");
    if (btnCopy) {
      btnCopy.addEventListener("click", () => {
        callHost("ae_copyProperty()", (parsed) => {
          if (parsed.success && parsed.data) {
            clipboardSlots[activeClipSlot] = parsed.data;
            if (slotsRow) {
              const slotBtn = slotsRow.querySelector('.clip-slot[data-slot="' + activeClipSlot + '"]');
              if (slotBtn) slotBtn.classList.add("has-data");
            }
            showToast(parsed.message || "Copied to slot " + activeClipSlot);
          } else {
            showToast(parsed.message || "Copy failed", true);
          }
        });
      });
    }

    const btnPaste = document.getElementById("btnClipPaste");
    if (btnPaste) {
      btnPaste.addEventListener("click", () => {
        const data = clipboardSlots[activeClipSlot];
        if (!data) {
          showToast("Slot " + activeClipSlot + " is empty — copy a property first", true);
          return;
        }
        const payload = JSON.stringify(data).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        runTool('ae_pasteProperty("' + payload + '")', "Pasted");
      });
    }

    const btnPropertyBounce = document.getElementById("btnPropertyBounce");
    if (btnPropertyBounce) {
      btnPropertyBounce.addEventListener("click", () => {
        runTool("ae_applyClipboardBounce()", "Bounce expression applied");
      });
    }

    const btnBefore = document.getElementById("btnDeleteBefore");
    if (btnBefore) {
      btnBefore.addEventListener("click", () => runTool('ae_deleteKeyframes("before")', "Keyframes deleted"));
    }
    const btnAfter = document.getElementById("btnDeleteAfter");
    if (btnAfter) {
      btnAfter.addEventListener("click", () => runTool('ae_deleteKeyframes("after")', "Keyframes deleted"));
    }

    // Enhanced Copy/Paste buttons — captures and restores everything applied
    // to the layer (transform, effects, masks, blending mode, styles, etc.)
    // Copy FX / Paste FX now stay entirely on the ExtendScript side: AE
    // keeps the captured data in its own memory (keyed by clipboard slot)
    // for the life of the session, so nothing large ever has to cross the
    // evalScript() bridge — that bridge silently truncates long strings in
    // both directions, which is what broke this feature before.
    // ── Copy Pasta ── frame copy/paste (replaces old Copy FX / Paste FX)
    const btnCopyPasta = document.getElementById("btnCopyPasta");
    if (btnCopyPasta) {
      btnCopyPasta.addEventListener("click", () => {
        btnCopyPasta.disabled = true;
        btnCopyPasta.textContent = "⏳ Copying…";
        callHost("ae_copyPastaCapture()", (parsed) => {
          btnCopyPasta.disabled = false;
          btnCopyPasta.textContent = "📋 Copy";
          if (parsed.success) {
            showToast(parsed.message || "Frame captured!");
            if (btnPastePasta) btnPastePasta.classList.add("has-data");
          } else {
            showToast(parsed.message || "Copy Pasta: capture failed", true);
          }
        });
      });
    }

    const btnPastePasta = document.getElementById("btnPastePasta");
    if (btnPastePasta) {
      btnPastePasta.addEventListener("click", () => {
        btnPastePasta.disabled = true;
        btnPastePasta.textContent = "⏳ Pasting…";
        callHost("ae_copyPastaPaste()", (parsed) => {
          btnPastePasta.disabled = false;
          btnPastePasta.textContent = "📌 Paste";
          if (parsed.success) {
            showToast(parsed.message || "Frame pasted as layer!");
          } else {
            showToast(parsed.message || "Copy Pasta: paste failed", true);
          }
        });
      });
    }

    const btnFxLock = document.getElementById("btnFxLock");
    if (btnFxLock) {
      btnFxLock.addEventListener("click", () => {
        runTool("ae_fxLock()", "FX Lock updated");
      });
    }

    const btnFxRemove = document.getElementById("btnFxRemove");
    if (btnFxRemove) {
      btnFxRemove.addEventListener("click", async () => {
        const confirmed = await showModal({
          title: "Remove all FX?",
          message: "This removes every effect from the selected layer(s). You can undo it in After Effects.",
          input: false,
          okText: "Remove FX",
          cancelText: "Cancel",
          danger: true,
        });
        if (!confirmed) return;
        runTool("ae_removeAllFx()", "All FX removed");
      });
    }

    const btnCopyEverything = document.getElementById("btnCopyEverything");
    if (btnCopyEverything) {
      btnCopyEverything.addEventListener("click", () => {
        callHost("ae_copyEverything()", (parsed) => {
          if (parsed.success && parsed.data) {
            clipboardSlots[activeClipSlot] = parsed.data;
            if (slotsRow) {
              const slotBtn = slotsRow.querySelector('.clip-slot[data-slot="' + activeClipSlot + '"]');
              if (slotBtn) slotBtn.classList.add("has-data");
            }
            showToast(parsed.message || "All copied to slot " + activeClipSlot);
          } else {
            showToast(parsed.message || "Copy All failed", true);
          }
        });
      });
    }

    const btnPasteEverything = document.getElementById("btnPasteEverything");
    if (btnPasteEverything) {
      btnPasteEverything.addEventListener("click", () => {
        const data = clipboardSlots[activeClipSlot];
        if (!data) {
          showToast("Slot " + activeClipSlot + " is empty — copy everything first", true);
          return;
        }
        const payload = JSON.stringify(data).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        runTool('ae_pasteEverything("' + payload + '")', "Everything pasted");
      });
    }

    // Curve Copy/Paste buttons
    const btnCurveCopy = document.getElementById("btnCurveCopy");
    if (btnCurveCopy) {
      btnCurveCopy.addEventListener("click", () => {
        callHost("ae_copyCurve()", (parsed) => {
          if (parsed.success && parsed.data) {
            clipboardSlots[activeClipSlot] = parsed.data;
            if (slotsRow) {
              const slotBtn = slotsRow.querySelector('.clip-slot[data-slot="' + activeClipSlot + '"]');
              if (slotBtn) slotBtn.classList.add("has-data");
            }
            showToast(parsed.message || "Curve copied to slot " + activeClipSlot);
          } else {
            showToast(parsed.message || "Copy Curve failed", true);
          }
        });
      });
    }

    const btnCurvePaste = document.getElementById("btnCurvePaste");
    if (btnCurvePaste) {
      btnCurvePaste.addEventListener("click", () => {
        const data = clipboardSlots[activeClipSlot];
        if (!data) {
          showToast("Slot " + activeClipSlot + " is empty — copy a curve first", true);
          return;
        }
        const payload = JSON.stringify(data).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        runTool('ae_pasteCurve("' + payload + '")', "Curve pasted");
      });
    }

    const btnExplode = document.getElementById("btnExplodeTextPro");
    const explodeModal = document.getElementById("explodeModal");
    if (btnExplode && explodeModal) {
      const explodeCancelBtn = document.getElementById("explodeModalCancel");
      const explodeModes = document.getElementById("textExploderModes");

      const closeExplodeModal = () => { explodeModal.style.display = "none"; };

      btnExplode.textContent = "Text Exploder";
      btnExplode.title = "Split selected text layers by characters, words, lines, or paragraphs";
      btnExplode.addEventListener("click", () => { explodeModal.style.display = "flex"; });

      if (explodeCancelBtn) explodeCancelBtn.addEventListener("click", closeExplodeModal);
      explodeModal.addEventListener("mousedown", (ev) => {
        if (ev.target === explodeModal) closeExplodeModal();
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && explodeModal.style.display === "flex") closeExplodeModal();
      });

      if (explodeModes) {
        explodeModes.addEventListener("click", (ev) => {
          const modeButton = ev.target.closest("[data-text-explode-mode]");
          if (!modeButton) return;
          const mode = modeButton.dataset.textExplodeMode || "characters";
          closeExplodeModal();
          runTool("ae_splitTextFlex(" + hostArg(mode) + ")", "Text exploded by " + mode);
        });
      }
    }

    function jsArg(str) {
      return hostArg(str);
    }

    const btnRenameSequential = document.getElementById("btnRenameSequential");
    if (btnRenameSequential) {
      btnRenameSequential.addEventListener("click", () => {
        const base = document.getElementById("renameBase");
        const val = base ? base.value.trim() : "";
        if (!val) { showToast("Enter a base name first", true); return; }
        runTool('ae_renameLayers("sequential", ' + jsArg(val) + ")", "Renamed sequentially");
      });
    }
    const btnRenamePrefix = document.getElementById("btnRenamePrefix");
    if (btnRenamePrefix) {
      btnRenamePrefix.addEventListener("click", () => {
        const el = document.getElementById("renamePrefix");
        const val = el ? el.value : "";
        if (!val) { showToast("Enter a prefix first", true); return; }
        runTool('ae_renameLayers("prefix", ' + jsArg(val) + ")", "Prefix added");
      });
    }
    const btnRenameSuffix = document.getElementById("btnRenameSuffix");
    if (btnRenameSuffix) {
      btnRenameSuffix.addEventListener("click", () => {
        const el = document.getElementById("renameSuffix");
        const val = el ? el.value : "";
        if (!val) { showToast("Enter a suffix first", true); return; }
        runTool('ae_renameLayers("suffix", ' + jsArg(val) + ")", "Suffix added");
      });
    }
    const btnRenameReplace = document.getElementById("btnRenameReplace");
    if (btnRenameReplace) {
      btnRenameReplace.addEventListener("click", () => {
        const findEl = document.getElementById("renameFind");
        const replEl = document.getElementById("renameReplace");
        const find = findEl ? findEl.value : "";
        const repl = replEl ? replEl.value : "";
        if (!find) { showToast("Enter text to find first", true); return; }
        runTool('ae_renameLayers("replace", ' + jsArg(find) + ", " + jsArg(repl) + ")", "Names replaced");
      });
    }

    const btnCompStats = document.getElementById("btnGetCompStats");
    if (btnCompStats) {
      btnCompStats.addEventListener("click", () => {
        const display = document.getElementById("compStatsDisplay");
        if (!display) return;
        display.innerHTML = '<div class="studio-empty">Scanning comp…</div>';
        callHost("ae_getCompStats()", (parsed) => {
          if (!parsed.success) {
            display.innerHTML = '<div class="studio-empty" style="color:var(--danger);">' + escapeHtml(parsed.message || "Failed") + '</div>';
            return;
          }
          if (!parsed.data) {
            display.innerHTML = '<div class="studio-empty">No data returned.</div>';
            return;
          }
          const s = parsed.data;
          const lc = s.layerCounts || {};
          const totalLayers = lc.footage + lc.solid + lc.text + lc.shape + lc.null + lc.adjustment + lc.camera + lc.light + lc.precomp + lc.other;
          let html = '<div style="padding:4px 0;">';
          html += '<b>' + escapeHtml(s.name) + '</b>  —  ' + s.width + '×' + s.height + '  @  ' + s.frameRate.toFixed(2) + ' fps<br>';
          html += 'Duration: ' + s.duration.toFixed(2) + 's  |  Layers: ' + totalLayers + '  |  Effects: ' + s.totalEffects + '  |  Masks: ' + s.totalMasks + '<br>';
          html += '<span style="font-size:11px;opacity:0.7;">';
          if (lc.footage) html += '🎬' + lc.footage + ' ';
          if (lc.solid) html += '⬛' + lc.solid + ' ';
          if (lc.text) html += '🔤' + lc.text + ' ';
          if (lc.shape) html += 'ï¿½ï¿½' + lc.shape + ' ';
          if (lc.null) html += '⊙' + lc.null + ' ';
          if (lc.adjustment) html += '🔎' + lc.adjustment + ' ';
          if (lc.camera) html += '📷' + lc.camera + ' ';
          if (lc.light) html += '💡' + lc.light + ' ';
          if (lc.precomp) html += 'ï¿½ï¿½ï¿½' + lc.precomp + ' ';
          if (lc.other) html += '…' + lc.other + ' ';
          html += '</span>';
          if (s.hasMissingFootage) html += '<br><span style="color:var(--danger);">⚠ Missing footage detected</span>';
          html += '</div>';
          display.innerHTML = html;
        });
      });
    }

    function showProjectDoctorReport(parsed, display) {
      if (!parsed.success) {
        display.innerHTML = '<div class="studio-empty" style="color:var(--danger);">' + escapeHtml(parsed.message || "Failed") + '</div>';
        return;
      }
      if (!parsed.data || !parsed.data.issues) {
        display.innerHTML = '<div class="studio-empty">No issues found — your project looks clean!</div>';
        return;
      }
      const d = parsed.data;
      let html = '<div style="padding:4px 0;">';
      html += '<b>' + d.totalIssues + ' issue(s)</b>  —  ' + d.fixable + ' fixable, ' + d.notFixable + ' not fixable';
      if (d.fixReport) html += '  |  Folders removed: ' + d.fixReport.foldersRemoved;
      html += '</div>';
      for (let i = 0; i < d.issues.length; i++) {
        const iss = d.issues[i];
        const color = iss.severity === "high" ? "var(--danger)" : iss.severity === "medium" ? "var(--warning)" : "inherit";
        html += '<div style="padding:2px 0;color:' + color + ';">';
        if (iss.type === "missingFootage") html += '⚠ Missing: ';
        else if (iss.type === "unusedFootage") html += '🗑 Unused: ';
        else if (iss.type === "emptyFolder") html += 'Empty folder: ';
        else html += '• ';
        html += escapeHtml(iss.itemName) + ' <span style="opacity:0.5;">' + escapeHtml(iss.path) + '</span></div>';
      }
      display.innerHTML = html;
    }

    const btnProjectScan = document.getElementById("btnProjectScan");
    const btnProjectFix = document.getElementById("btnProjectFix");
    const projectDisplay = document.getElementById("projectDoctorDisplay");
    if (btnProjectScan && projectDisplay) {
      btnProjectScan.addEventListener("click", () => {
        projectDisplay.innerHTML = '<div class="studio-empty">Scanning project…</div>';
        callHost("ae_projectDoctor('scan')", (parsed) => showProjectDoctorReport(parsed, projectDisplay));
      });
    }
    if (btnProjectFix && projectDisplay) {
      btnProjectFix.addEventListener("click", () => {
        projectDisplay.innerHTML = '<div class="studio-empty">Fixing issues…</div>';
        callHost("ae_projectDoctor('fix')", (parsed) => showProjectDoctorReport(parsed, projectDisplay));
      });
    }

    // ---------------- Project Organizer (v2) ----------------
    const orgModal = document.getElementById("organizeModal");

    const ORG_OPTS = [
      ["orgOptOrganize", "organizeAssets"],
      ["orgOptEmpty", "removeEmptyFolders"],
      ["orgOptUnused", "removeUnusedFootage"],
      ["orgOptMerge", "mergeDuplicateSolids"],
      ["orgOptGroup", "groupByType"],
      ["orgOptLabels", "colorLabels"]
    ];

    function orgBuildConfig(apply) {
      const cfg = { apply: !!apply, createMissing: true };
      for (let i = 0; i < ORG_OPTS.length; i++) {
        const el = document.getElementById(ORG_OPTS[i][0]);
        cfg[ORG_OPTS[i][1]] = el ? !!el.checked : false;
      }
      return cfg;
    }

    function orgSetStat(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = (value === null || value === undefined) ? "\u2014" : String(value);
    }

    function orgRenderAnalysis(data) {
      orgSetStat("orgStatAssets", data.assets);
      orgSetStat("orgStatMove", data.willMove);
      orgSetStat("orgStatUnused", data.unused);
      orgSetStat("orgStatMissing", data.missing);
      const extra = document.getElementById("orgStatExtra");
      if (extra) {
        const bits = [];
        if (data.emptyFolders) bits.push(data.emptyFolders + " empty folder(s)");
        if (data.duplicateSolids) bits.push(data.duplicateSolids + " duplicate solid(s)");
        extra.textContent = bits.join("  \u00b7  ");
        extra.style.display = bits.length ? "block" : "none";
      }
    }

    function orgResetAnalysis() {
      orgSetStat("orgStatAssets", null);
      orgSetStat("orgStatMove", null);
      orgSetStat("orgStatUnused", null);
      orgSetStat("orgStatMissing", null);
      const extra = document.getElementById("orgStatExtra");
      if (extra) { extra.textContent = ""; extra.style.display = "none"; }
      const pv = document.getElementById("orgPreview");
      if (pv) pv.innerHTML = '<div class="org-preview-empty">Press \u201cPreview Changes\u201d to scan the project.</div>';
    }

    function orgRun(apply) {
      const cfg = orgBuildConfig(apply);
      if (apply && cfg.removeUnusedFootage) {
        const n = document.getElementById("orgStatUnused");
        const count = n && n.textContent !== "\u2014" ? n.textContent : "the unused";
        if (!window.confirm("This will permanently remove " + count + " unused footage item(s) from the project.\n\nContinue?")) return;
      }
      const payload = JSON.stringify(cfg).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const preview = document.getElementById("orgPreview");
      if (preview) preview.innerHTML = '<div class="org-preview-empty">' + (apply ? "Organizing\u2026" : "Scanning\u2026") + '</div>';

      callHost('ae_projectOrganize("' + payload + '")', (parsed) => {
        if (!parsed.success) {
          showToast(parsed.message || "Organize failed", true);
          if (preview) preview.innerHTML = '<div class="org-preview-empty">' + escapeHtml(parsed.message || "Failed") + '</div>';
          return;
        }
        const data = parsed.data || {};
        orgRenderAnalysis(data);

        if (apply) {
          if (!data.applied) {
            showToast(parsed.message || "Organize did not run \u2014 nothing was changed", true);
            return;
          }
          showToast(parsed.message || "Project organized");
          orgClose();
          return;
        }

        const cats = data.categories || [];
        if (!cats.length) {
          if (preview) preview.innerHTML = '<div class="org-preview-empty">Everything is already in place.</div>';
          return;
        }
        let html = "";
        for (let i = 0; i < cats.length; i++) {
          html += '<div class="org-preview-row"><span class="org-preview-count">' + cats[i].count +
            '</span><span class="org-preview-arrow">\u2192</span><span class="org-preview-folder">' +
            escapeHtml(cats[i].folder) + '</span></div>';
        }
        html += '<div class="org-preview-total">' + data.willMove + ' item(s) will move</div>';
        if (preview) preview.innerHTML = html;
      });
    }

    function orgOpen() {
      if (!orgModal) return;
      orgResetAnalysis();
      orgModal.style.display = "flex";
      orgRun(false);
    }
    function orgClose() { if (orgModal) orgModal.style.display = "none"; }

    const btnOrgOpen = document.getElementById("btnOrganizeApply");
    if (btnOrgOpen) btnOrgOpen.addEventListener("click", orgOpen);
    const _orgPrev = document.getElementById("btnOrgPreview");
    if (_orgPrev) _orgPrev.addEventListener("click", () => orgRun(false));
    const _orgApply = document.getElementById("btnOrgApply");
    if (_orgApply) _orgApply.addEventListener("click", () => orgRun(true));
    const _orgCancel = document.getElementById("btnOrgCancel");
    if (_orgCancel) _orgCancel.addEventListener("click", orgClose);
    if (orgModal) orgModal.addEventListener("mousedown", (ev) => { if (ev.target === orgModal) orgClose(); });
    for (let i = 0; i < ORG_OPTS.length; i++) {
      const el = document.getElementById(ORG_OPTS[i][0]);
      if (el) el.addEventListener("change", () => { if (orgModal && orgModal.style.display !== "none") orgRun(false); });
    }

    function getColorValues() {
      const p = document.getElementById("colorPrimary");
      const s = document.getElementById("colorSecondary");
      return {
        primary: (p && p.value) || "#ff0000",
        secondary: (s && s.value) || "#0000ff"
      };
    }

    const btnFill = document.getElementById("btnColorFill");
    if (btnFill) {
      btnFill.addEventListener("click", () => {
        const c = getColorValues();
        const script = 'ae_colorTool("fill","' + c.primary + '","' + c.secondary + '")';
        runTool(script, "Fill applied");
      });
    }
    const btnTint = document.getElementById("btnColorTint");
    if (btnTint) {
      btnTint.addEventListener("click", () => {
        const c = getColorValues();
        const script = 'ae_colorTool("tint","' + c.primary + '","' + c.secondary + '")';
        runTool(script, "Tint applied");
      });
    }
    const btnReplace = document.getElementById("btnColorReplace");
    if (btnReplace) {
      btnReplace.addEventListener("click", () => {
        const c = getColorValues();
        const script = 'ae_colorTool("colorReplace","' + c.primary + '","' + c.secondary + '")';
        runTool(script, "Color replace applied");
      });
    }

    const btnResize = document.getElementById("btnResizeComp");
    if (btnResize) {
      btnResize.addEventListener("click", async () => {
        const wStr = await showModal({ title: "Resize Comp", message: "New width (px):", input: true, defaultValue: "1920", placeholder: "Width" });
        if (wStr === null || wStr === "") return;
        const hStr = await showModal({ title: "Resize Comp", message: "New height (px):", input: true, defaultValue: "1080", placeholder: "Height" });
        if (hStr === null || hStr === "") return;
        const scale = await showModal({
          title: "Resize Comp",
          message: "Scale existing layers to fit the new size?",
          okText: "Scale Layers",
          cancelText: "Keep As-Is",
        });
        const script = "ae_resizeComp(" + Number(wStr) + ", " + Number(hStr) + ", " + (scale ? "true" : "false") + ")";
        runTool(script, "Comp resized");
      });
    }

    const fileInputSRT = document.getElementById("fileInputSRT");
    const btnImportSRT = document.getElementById("btnImportSRT");
    if (btnImportSRT && fileInputSRT) {
      btnImportSRT.addEventListener("click", () => fileInputSRT.click());
      fileInputSRT.addEventListener("change", async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        fileInputSRT.value = "";
        if (!file || !file.path) return;
        let text;
        try {
          text = await fs.promises.readFile(file.path, "utf8");
        } catch (e) {
          reportError("SRT_READ", e, "Could not read SRT file");
          return;
        }
        const cues = parseSRT(text);
        if (!cues.length) {
          showToast("No subtitle cues found in that file", true);
          return;
        }
        const payload = hostArg(JSON.stringify(cues));
        runTool("ae_importSRT(" + payload + ")", "SRT imported");
      });
    }
  }

  // Parses standard .srt subtitle text into [{start, end, text}] (seconds).
  // Accepts HH:MM:SS[,.]fff and MM:SS[,.]fff with 1-3 fraction digits.
  function parseSRT(text) {
    const cues = [];
    const blocks = String(text).replace(/\r/g, "").split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.split("\n").filter((l) => l.length > 0);
      if (lines.length < 2) continue;
      let timeLineIdx = 0;
      if (/^\d+$/.test(lines[0].trim())) timeLineIdx = 1;
      const timeLine = lines[timeLineIdx] || "";
      const m = timeLine.match(
        /^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/
      );
      const captionText = lines.slice(timeLineIdx + 1).join("\n").replace(/<[^>]+>/g, "").trim();
      if (m) {
        const start = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / Math.pow(10, m[4].length);
        const end = Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / Math.pow(10, m[8].length);
        if (captionText && end > start) cues.push({ start, end, text: captionText });
        continue;
      }
      const m2 = timeLine.match(
        /^(\d+):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2})[,.](\d{1,3})$/
      );
      if (m2) {
        const start = Number(m2[1]) * 60 + Number(m2[2]) + Number(m2[3]) / Math.pow(10, m2[3].length);
        const end = Number(m2[4]) * 60 + Number(m2[5]) + Number(m2[6]) / Math.pow(10, m2[6].length);
        if (captionText && end > start) cues.push({ start, end, text: captionText });
      }
    }
    return cues;
  }

  function detectHostForTools() {
    if (!toolsHint) return;
    try {
      const info = csInterface.getHostEnvironment();
      const appId = info && info.appId ? info.appId : "";
      if (appId === "AEFT") {
        toolsHint.textContent = "Connected to After Effects";
      } else if (info && info.appName) {
        toolsHint.textContent = info.appName + " detected — Tools tab requires After Effects.";
      } else {
        toolsHint.textContent = "Standalone preview (no host detected)";
      }
    } catch (e) {
      toolsHint.textContent = "Standalone preview (no host detected)";
    }
  }

  // ---------------- Auto Tracker ----------------

  let trackerLastSignature = null;
  let trackerLastActivityAt = Date.now();
  let trackerStreakSeconds = 0;
  let trackerTodaySeconds = 0;
  let trackerBreakActive = false;
  let trackerHasComp = false;
  let trackerWorkIntervalSec = 20 * 60;
  let trackerIdleThresholdSec = 45;
  let trackerBreakCountdown = 0;
  let trackerBreakCountdownTimer = null;
  let trackerBreakNotified = false;

  function trackerLoadState() {
    try {
      const todayStr = new Date().toDateString();
      const storedDay = localStorage.getItem("aeTrackerDay");
      if (storedDay === todayStr) {
        trackerTodaySeconds = parseInt(localStorage.getItem("aeTrackerTotalSeconds") || "0", 10) || 0;
      } else {
        // Day rolled over (or first run) — archive whatever was tracked
        // for the previous stored day into history before resetting.
        if (storedDay) {
          const prevSeconds = parseInt(localStorage.getItem("aeTrackerTotalSeconds") || "0", 10) || 0;
          if (prevSeconds > 0) trackerArchiveDay(storedDay, prevSeconds);
        }
        localStorage.setItem("aeTrackerDay", todayStr);
        localStorage.setItem("aeTrackerTotalSeconds", "0");
        trackerTodaySeconds = 0;
      }
      const wi = localStorage.getItem("aeTrackerWorkInterval");
      const it = localStorage.getItem("aeTrackerIdleThreshold");
      if (wi) trackerWorkIntervalSec = (parseInt(wi, 10) || 20) * 60;
      if (it) trackerIdleThresholdSec = parseInt(it, 10) || 45;
    } catch (e) { auditFallback("MAIN_TRACKERLOADSTATE_001", e); }
  }

  // ---------------- Tracker History ----------------
  // A simple archive of past days' totals, kept separately from "today"
  // (which lives in aeTrackerTotalSeconds until the day rolls over).

  const TRACKER_HISTORY_KEY = "aeTrackerHistory";
  const TRACKER_HISTORY_MAX_DAYS = 60;

  function trackerLoadHistory() {
    try {
      const raw = localStorage.getItem(TRACKER_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function trackerSaveHistory(list) {
    try { localStorage.setItem(TRACKER_HISTORY_KEY, JSON.stringify(list.slice(-TRACKER_HISTORY_MAX_DAYS))); } catch (e) { auditFallback("MAIN_TRACKERSAVEHISTORY_001", e); }
  }

  function trackerArchiveDay(dateStr, seconds) {
    const list = trackerLoadHistory();
    const existing = list.find((d) => d.date === dateStr);
    if (existing) existing.seconds = seconds;
    else list.push({ date: dateStr, seconds });
    trackerSaveHistory(list);
  }

  function trackerRenderHistory() {
    const listEl = document.getElementById("trackerHistoryList");
    const weekEl = document.getElementById("trackerWeekTotal");
    if (!listEl) return;

    const history = trackerLoadHistory().slice().reverse(); // most recent first
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    let weekSeconds = trackerTodaySeconds;
    history.forEach((d) => {
      const t = new Date(d.date).getTime();
      if (!isNaN(t) && t >= weekAgo) weekSeconds += d.seconds;
    });
    if (weekEl) weekEl.textContent = trackerFormatHHMMSS(weekSeconds);

    // Build last 7 days array (including today)
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      let secs = 0;
      if (i === 0) {
        secs = trackerTodaySeconds;
      } else {
        const found = history.find((h) => {
          const hd = new Date(h.date);
          return hd.getFullYear() === d.getFullYear() && hd.getMonth() === d.getMonth() && hd.getDate() === d.getDate();
        });
        if (found) secs = found.seconds;
      }
      weekDays.push({ date: d, label: i === 0 ? "Today" : dayLabels[d.getDay()], seconds: secs, key, isToday: i === 0 });
    }

    const maxSecs = Math.max(...weekDays.map((wd) => wd.seconds), 1);
    const averageSecs = weekDays.reduce((sum, wd) => sum + wd.seconds, 0) / 7;

    // Bar chart HTML
    let html = '<div class="tracker-bar-chart">';
    weekDays.forEach((wd) => {
      const pct = Math.max((wd.seconds / maxSecs) * 100, 2);
      const cls = wd.isToday ? "today" : wd.seconds > averageSecs ? "high" : wd.seconds > 0 ? "medium" : "low";
      html += '<div class="tracker-bar-day">';
      html += '<div class="tracker-bar-column">';
      html += '<div class="tracker-bar-fill ' + cls + '" style="height:' + pct + '%;"></div>';
      html += "</div>";
      html += '<div class="tracker-bar-time">' + trackerFormatMMSS(wd.seconds) + "</div>";
      html += '<div class="tracker-bar-label' + (wd.isToday ? " today-label" : "") + '">' + wd.label + "</div>";
      html += "</div>";
    });
    html += "</div>";

    // Stats row
    const bestDay = weekDays.reduce((best, wd) => (wd.seconds > best.seconds ? wd : best), { seconds: 0 });
    html += '<div class="tracker-stats-row">';
    html += '<div class="tracker-stat-box"><div class="tracker-stat-value">' + trackerFormatHHMMSS(Math.round(averageSecs)) + '</div><div class="tracker-stat-label">Daily Avg</div></div>';
    html += '<div class="tracker-stat-box"><div class="tracker-stat-value">' + trackerFormatHHMMSS(bestDay.seconds) + '</div><div class="tracker-stat-label">Best Day</div></div>';
    html += '<div class="tracker-stat-box"><div class="tracker-stat-value">' + trackerFormatHHMMSS(weekSeconds) + '</div><div class="tracker-stat-label">Total</div></div>';
    html += "</div>";

    // History list (past days beyond today's week)
    if (history.length > 0) {
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--line);font-size:11px;color:var(--text-dim);font-weight:600;">OLDER DAYS</div>';
      history.slice(7).forEach((d) => {
        const dateObj = new Date(d.date);
        const label = isNaN(dateObj.getTime()) ? d.date : dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        html += '<div class="studio-row" style="cursor:default;">' +
          '<div class="studio-row-main"><div class="studio-row-name">' + escapeHtml(label) + "</div></div>" +
          '<div class="studio-row-sub" style="flex-shrink:0;">' + trackerFormatHHMMSS(d.seconds) + "</div>" +
          "</div>";
      });
    }

    listEl.innerHTML = html;
  }

  // duplicate trackerFormatMMSS removed — canonical padded version defined below

  function trackerSaveTotal() {
    try {
      localStorage.setItem("aeTrackerDay", new Date().toDateString());
      localStorage.setItem("aeTrackerTotalSeconds", String(Math.floor(trackerTodaySeconds)));
    } catch (e) { auditFallback("MAIN_TRACKERSAVETOTAL_001", e); }
  }

  function trackerPoll() {
    try {
      callHostRaw("ae_getActivitySignature()", (result) => {
        let parsed;
        try {
          parsed = JSON.parse(result);
        } catch (e) {
          trackerHasComp = false;
          trackerSetStatus("nocomp", "Not connected to After Effects");
          return;
        }
        if (!parsed.hasComp) {
          trackerHasComp = false;
          trackerSetStatus("nocomp", "No composition open");
          const compNameEl = document.getElementById("trackerCompName");
          if (compNameEl) compNameEl.textContent = "";
          return;
        }
        trackerHasComp = true;
        const compNameEl = document.getElementById("trackerCompName");
        if (compNameEl) compNameEl.textContent = parsed.compName || "";
        if (parsed.signature !== trackerLastSignature) {
          trackerLastSignature = parsed.signature;
          trackerLastActivityAt = Date.now();
        }
      });
    } catch (e) { auditFallback("MAIN_TRACKERPOLL_001", e); }
  }

  function trackerTick() {
    if (!trackerHasComp) {
      trackerSetStatus("nocomp", "No composition open");
      trackerRender();
      return;
    }
    if (trackerBreakActive) {
      trackerSetStatus("break", "On break — resting your eyes");
      trackerRender();
      return;
    }
    const idleForSec = (Date.now() - trackerLastActivityAt) / 1000;
    if (idleForSec > trackerIdleThresholdSec) {
      trackerSetStatus("idle", "Idle — timer paused");
    } else {
      trackerSetStatus("working", "Working");
      trackerStreakSeconds += 1;
      trackerTodaySeconds += 1;
      if (trackerStreakSeconds % 10 === 0) { trackerSaveTotal(); trackerRenderHistory(); }
      if (trackerStreakSeconds >= trackerWorkIntervalSec) {
        trackerStreakSeconds = trackerWorkIntervalSec;
        // Fire the break notification/beep exactly ONCE per completed streak
        // (not every second while the banner stays up).
        if (!trackerBreakNotified) {
          trackerBreakNotified = true;
          trackerShowBreakBanner();
        }
      }
    }
    trackerRender();
  }

  function trackerSetStatus(kind, text) {
    const dot = document.getElementById("trackerDot");
    const label = document.getElementById("trackerStatusText");
    if (dot) dot.className = "tracker-dot " + kind;
    if (label) label.textContent = text;
  }

  // ── Tracker Notification ─────────────────────────────────────────────────
  // Fires when work interval completes.
  // 1. OS-level Web Notification (visible even when AE is minimized)
  // 2. AE system beep via ExtendScript
  // 3. Panel toast as fallback
  // Reliable in-panel "ding" using Web Audio (works in CEP/CEF regardless of
  // host). Created lazily and resumed if the context starts suspended.
  let trackerAudioCtx = null;
  function trackerBeep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!trackerAudioCtx) trackerAudioCtx = new AC();
      const ctx = trackerAudioCtx;
      if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) { auditFallback("MAIN_TRACKERBEEP_001", e); } }
      const now = ctx.currentTime;
      // Two short rising tones: ding-ding.
      const tones = [[880, 0], [1174.7, 0.18]];
      for (let i = 0; i < tones.length; i++) {
        const freq = tones[i][0];
        const offset = tones[i][1];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      }
    } catch (e) { auditFallback("MAIN_TRACKERBEEP_002", e); }
  }

  function trackerNotify() {
    const mins = Math.round(trackerWorkIntervalSec / 60);
    const title = "⏱ CompX — Eye Break Time!";
    const body  = mins + " min work streak complete. Rest your eyes for 20 seconds.";

    // 1. OS Notification
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: "icons/icon-normal.png",
            silent: false
          });
        } catch (e) { auditFallback("MAIN_TRACKERNOTIFY_001", e); }
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            try { new Notification(title, { body, icon: "icons/icon-normal.png" }); } catch (e) { auditFallback("MAIN_TRACKERNOTIFY_002", e); }
          }
        });
      }
    }

    // 2. Audible beep — Web Audio, reliable inside CEP.
    //    NOTE: app.beep() is NOT a valid After Effects method (Photoshop only),
    //    so the previous evalScript("app.beep()") never produced any sound.
    //    We now synthesize the beep directly in the panel instead.
    trackerBeep();

    // 3. Panel toast (always shown as fallback)
    showToast("\uD83D\uDC41 " + mins + " min streak done — time for an eye break!");
  }

  function trackerShowBreakBanner() {
    const banner = document.getElementById("trackerBreakBanner");
    if (banner) banner.style.display = "flex";
    trackerNotify();
  }

  function trackerFormatMMSS(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function trackerFormatHHMMSS(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function trackerRender() {
    const streakEl = document.getElementById("trackerStreakTime");
    const totalEl = document.getElementById("trackerTodayTotal");
    const fill = document.getElementById("trackerProgressFill");
    const intervalLabel = document.getElementById("trackerIntervalLabel");
    if (streakEl) streakEl.textContent = trackerFormatMMSS(trackerStreakSeconds);
    if (totalEl) totalEl.textContent = trackerFormatHHMMSS(trackerTodaySeconds);
    if (intervalLabel) intervalLabel.textContent = trackerFormatMMSS(trackerWorkIntervalSec);
    if (fill) fill.style.width = Math.min(100, (trackerStreakSeconds / trackerWorkIntervalSec) * 100) + "%";
  }

  function trackerStartBreak() {
    trackerBreakActive = true;
    trackerBreakCountdown = 20;
    const btn = document.getElementById("btnStartBreak");
    if (btn) btn.disabled = true;

    trackerBreakCountdownTimer = setInterval(() => {
      trackerBreakCountdown -= 1;
      if (btn) btn.textContent = "Resting… " + trackerBreakCountdown + "s";
      if (trackerBreakCountdown <= 0) {
        clearInterval(trackerBreakCountdownTimer);
        trackerBreakCountdownTimer = null;
        trackerBreakActive = false;
        trackerStreakSeconds = 0;
        trackerBreakNotified = false;
        trackerLastActivityAt = Date.now();
        const banner = document.getElementById("trackerBreakBanner");
        if (banner) banner.style.display = "none";
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Start 20s Eye Break";
        }
        showToast("Break done — back to work!");
      }
    }, 1000);
  }

  function wireTracker() {
    const btnBreak = document.getElementById("btnStartBreak");
    if (btnBreak) btnBreak.addEventListener("click", trackerStartBreak);

    const btnSkipBreak = document.getElementById("btnSkipBreak");
    if (btnSkipBreak) {
      btnSkipBreak.addEventListener("click", () => {
        const banner = document.getElementById("trackerBreakBanner");
        if (banner) banner.style.display = "none";
        trackerStreakSeconds = 0;
        trackerBreakNotified = false;
        trackerLastActivityAt = Date.now();
        trackerRender();
        showToast("⏩ Break skipped — streak reset");
      });
    }

    const btnReset = document.getElementById("btnResetToday");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        trackerTodaySeconds = 0;
        trackerSaveTotal();
        trackerRender();
        trackerRenderHistory();
        showToast("Today's tracked time reset");
      });
    }

    const wiInput = document.getElementById("settingWorkInterval");
    if (wiInput) {
      wiInput.value = Math.round(trackerWorkIntervalSec / 60);
      wiInput.addEventListener("change", () => {
        const mins = Math.max(1, Math.min(120, parseInt(wiInput.value, 10) || 20));
        trackerWorkIntervalSec = mins * 60;
        try { localStorage.setItem("aeTrackerWorkInterval", String(mins)); } catch (e) { auditFallback("MAIN_WIRETRACKER_001", e); }
        trackerRender();
      });
    }

    const itInput = document.getElementById("settingIdleThreshold");
    if (itInput) {
      itInput.value = trackerIdleThresholdSec;
      itInput.addEventListener("change", () => {
        const secs = Math.max(10, Math.min(300, parseInt(itInput.value, 10) || 45));
        trackerIdleThresholdSec = secs;
        try { localStorage.setItem("aeTrackerIdleThreshold", String(secs)); } catch (e) { auditFallback("MAIN_WIRETRACKER_002", e); }
      });
    }
  }

  function startTracker() {
    // Request OS notification permission early so it's ready when needed
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    trackerLoadState();
    wireTracker();
    trackerRender();
    trackerRenderHistory();
    trackerPoll();
    setInterval(trackerPoll, 4000);
    setInterval(trackerTick, 1000);
    window.addEventListener("beforeunload", trackerSaveTotal);
  }

  function wireToolSubtabs() {
    const row = document.getElementById("toolSubtabsRow");
    if (!row) return;
    row.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".tool-subtab");
      if (!btn) return;
      showToolGroup(btn.dataset.toolgroup);
    });
  }

  function showToolGroup(group) {
    document.querySelectorAll(".tool-subtab").forEach((b) => b.classList.toggle("active", b.dataset.toolgroup === group));
    document.querySelectorAll(".tool-group").forEach((g) => g.classList.toggle("active", g.dataset.toolgroup === group));
  }

  // ================================================================
  // STUDIO — shared helpers
  // ================================================================

  function jsStr(v) {
    return hostArg(v);
  }

  function currentHostAppId() {
    try {
      const info = csInterface.getHostEnvironment();
      return info && info.appId ? info.appId : "";
    } catch (e) {
      return "";
    }
  }

  function copyToClipboard(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied to clipboard");
    } catch (e) {
      showToast("Could not copy", true);
    }
  }

  function detectHostForStudio() {
    const hint = document.getElementById("studioHint");
    let text;
    try {
      const info = csInterface.getHostEnvironment();
      const appId = info && info.appId ? info.appId : "";
      if (appId === "AEFT") text = "Connected to After Effects — all Studio tools available.";
      else if (appId === "PPRO") text = "Connected to Premiere Pro — FFX Presets & Word Captions require After Effects.";
      else if (info && info.appName) text = info.appName + " detected.";
      else text = "Standalone preview (no host detected)";
    } catch (e) {
      text = "Standalone preview (no host detected)";
    }
    if (hint) hint.textContent = text;
  }

  // ---------------- FFX Preset Library (AE only) ----------------

  const FFX_STORAGE_KEY = "ccFfxPresets";
  let ffxPresets = [];
  let ffxSelectedId = null;
  let ffxSearchText = "";

  function loadFfxPresets() {
    try {
      const raw = localStorage.getItem(FFX_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      // Older builds or a partially-written localStorage value must not stop
      // bundled presets from being scanned and rendered.
      ffxPresets = Array.isArray(saved) ? saved.filter((preset) => preset && typeof preset === "object") : [];
    } catch (e) {
      ffxPresets = [];
    }
  }

  function saveFfxPresets() {
    try { localStorage.setItem(FFX_STORAGE_KEY, JSON.stringify(ffxPresets.filter((preset) => !preset.bundled))); } catch (e) { auditFallback("MAIN_SAVEFFXPRESETS_001", e); }
  }

  function seedBundledFfxPresets() {
    if (!nodeAvailable) return;
    if (!Array.isArray(ffxPresets)) ffxPresets = [];
    var root;
    try { root = csInterface.getSystemPath(SystemPath.EXTENSION); } catch (e) { auditFallback("MAIN_BUNDLED_FFX_ROOT_001", e); return; }
    var presetRoot = path.join(root, "presets");
    var scanRoots = ["effects"];
    function walk(folder, output) {
      if (!fs.existsSync(folder)) return;
      fs.readdirSync(folder, { withFileTypes:true }).forEach((entry) => {
        var full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full, output);
        else if (path.extname(entry.name).toLowerCase() === ".ffx") output.push(full);
      });
    }
    scanRoots.forEach((rootName) => {
      var files = [];
      walk(path.join(presetRoot, rootName), files);
      files.forEach((filePath) => {
        if (ffxPresets.some((preset) => preset.path === filePath)) return;
        var relative = path.relative(presetRoot, filePath).replace(/\\/g, "/");
        var parts = relative.split("/");
        var category = rootName === "effects" ? parts.slice(1, -1).join(" • ") : (rootName.charAt(0).toUpperCase() + rootName.slice(1) + " • " + parts.slice(1, -1).join(" • "));
        category = category || "Bundled Effects";
        ffxPresets.push({ id:"bundled-ffx:" + relative, name:path.basename(filePath, ".ffx"), path:filePath, category:category, bundled:true });
      });
    });
  }

  function guessFfxCategory(filePath) {
    const parent = path.basename(path.dirname(filePath));
    return parent && parent !== "." ? parent : "Uncategorized";
  }

  function addFfxPaths(paths) {
    const validPaths = paths.filter((p) => path.extname(p).toLowerCase() === ".ffx");
    let added = 0;
    validPaths.forEach((p) => {
      if (ffxPresets.some((f) => f.path === p)) return;
      ffxPresets.push({
        id: uid(),
        name: path.basename(p, path.extname(p)),
        path: p,
        category: guessFfxCategory(p),
      });
      added++;
    });
    if (added > 0) {
      saveFfxPresets();
      renderFfxList();
      showToast(added + " preset" + (added > 1 ? "s" : "") + " added");
    } else {
      showToast("No new .ffx presets found", true);
    }
  }

  function renderFfxList() {
    const listEl = document.getElementById("ffxList");
    if (!listEl) return;
    const q = ffxSearchText.trim().toLowerCase();
    const filtered = ffxPresets.filter((f) => !q || (f.name + " " + f.category).toLowerCase().indexOf(q) !== -1);

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="studio-empty">' +
        (ffxPresets.length === 0 ? "No presets yet — add some .ffx files or a folder." : "No presets match your search.") +
        "</div>";
      return;
    }

    const byCategory = {};
    filtered.forEach((f) => {
      const cat = f.category || "Uncategorized";
      (byCategory[cat] = byCategory[cat] || []).push(f);
    });

    function previewClass(preset) {
      var value = (preset.name + " " + preset.category).toLowerCase();
      if (/shake|wiggle|jitter|turbulent/.test(value)) return "ffxWobble";
      if (/flicker|blink|tv|vhs/.test(value)) return "ffxBlink";
      if (/load|up|rise/.test(value)) return "ffxSmoothUp";
      if (/fill|color|glow/.test(value)) return "ffxWild";
      if (/random|pixel/.test(value)) return "ffxExplosion";
      return "ffxBasic";
    }
    let html = "";
    Object.keys(byCategory).sort().forEach((cat) => {
      html += '<div class="studio-row-sub" style="padding:6px 10px 0;">' + escapeHtml(cat) + "</div>";
      html += '<div class="ffx-native-grid">';
      byCategory[cat].forEach((f) => {
        html +=
          '<div class="ffx-native-card' + (f.id === ffxSelectedId ? " active" : "") + '" data-ffx-id="' + f.id + '">' +
          '<div class="ffx-native-preview"><span class="ffx-preview-word ffx-anim-' + previewClass(f) + '">FX</span><b>' + (f.bundled ? 'BUILT IN' : 'CUSTOM') + '</b></div>' +
          '<div class="ffx-native-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
          '<div class="ffx-native-actions"><button data-ffx-preview="' + f.id + '">Preview</button><button data-ffx-apply="' + f.id + '">Apply</button>' + (f.bundled ? '' : '<button class="danger" data-ffx-remove="' + f.id + '">✕</button>') + '</div>' +
          "</div>";
      });
      html += '</div>';
    });
    listEl.innerHTML = html;
  }

  function wireFfxPresets() {
    loadFfxPresets();
    seedBundledFfxPresets();
    renderFfxList();

    const search = document.getElementById("ffxSearch");
    if (search) search.addEventListener("input", () => { ffxSearchText = search.value; renderFfxList(); });

    const btnAdd = document.getElementById("btnFfxAdd");
    const fileInputFfx = document.getElementById("fileInputFfx");
    if (btnAdd && fileInputFfx) {
      btnAdd.addEventListener("click", () => fileInputFfx.click());
      fileInputFfx.addEventListener("change", (ev) => {
        const paths = Array.from(ev.target.files).map((f) => f.path).filter(Boolean);
        fileInputFfx.value = "";
        addFfxPaths(paths);
      });
    }

    const btnAddFolder = document.getElementById("btnFfxAddFolder");
    const fileInputFfxFolder = document.getElementById("fileInputFfxFolder");
    if (btnAddFolder && fileInputFfxFolder) {
      fileInputFfxFolder.setAttribute("webkitdirectory", "");
      btnAddFolder.addEventListener("click", () => fileInputFfxFolder.click());
      fileInputFfxFolder.addEventListener("change", (ev) => {
        const paths = Array.from(ev.target.files).map((f) => f.path).filter(Boolean);
        fileInputFfxFolder.value = "";
        addFfxPaths(paths);
      });
    }

    const listEl = document.getElementById("ffxList");
    if (listEl) {
      listEl.addEventListener("click", (ev) => {
        const previewBtn = ev.target.closest("[data-ffx-preview]");
        if (previewBtn) {
          ev.stopPropagation();
          const preset = ffxPresets.find((f) => f.id === previewBtn.dataset.ffxPreview);
          if (preset) runTool("ae_previewPreset(" + jsStr(preset.path) + ")", "Preview opened in After Effects");
          return;
        }
        const applyBtn = ev.target.closest("[data-ffx-apply]");
        if (applyBtn) {
          ev.stopPropagation();
          const preset = ffxPresets.find((f) => f.id === applyBtn.dataset.ffxApply);
          if (preset) runTool("ae_applyPreset(" + jsStr(preset.path) + ")", "Preset applied");
          return;
        }
        const removeBtn = ev.target.closest("[data-ffx-remove]");
        if (removeBtn) {
          ev.stopPropagation();
          const id = removeBtn.dataset.ffxRemove;
          ffxPresets = ffxPresets.filter((f) => f.id !== id);
          if (ffxSelectedId === id) ffxSelectedId = null;
          saveFfxPresets();
          renderFfxList();
          return;
        }
        const row = ev.target.closest("[data-ffx-id]");
        if (!row) return;
        ffxSelectedId = row.dataset.ffxId;
        renderFfxList();
      });
    }

    const btnApply = document.getElementById("btnFfxApply");
    if (btnApply) {
      btnApply.addEventListener("click", () => {
        const preset = ffxPresets.find((f) => f.id === ffxSelectedId);
        if (!preset) { showToast("Select a preset first", true); return; }
        runTool("ae_applyPreset(" + jsStr(preset.path) + ")", "Preset applied");
      });
    }
  }

  // ---------------- Local Video Asset Library ----------------
  // Stores file references only. Original media is never copied into the extension.
  function wireVideoAssetLibrary() {
    const STORAGE_KEY = "compXLocalVideoAssets";
    const extensions = [".mov", ".mp4", ".mkv", ".avi", ".webm", ".m4v", ".mpg", ".mpeg"];
    const grid = document.getElementById("videoAssetGrid");
    const search = document.getElementById("videoAssetSearch");
    const category = document.getElementById("videoAssetCategory");
    const count = document.getElementById("videoAssetCount");
    if (!grid) return;
    let assets = [];
    try { assets = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { auditFallback("MAIN_VIDEO_ASSET_LOAD_001", e); }

    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(assets)); } catch (e) { auditFallback("MAIN_VIDEO_ASSET_SAVE_001", e); }
    }
    function categoryFor(filePath) {
      const value = String(filePath || "").toLowerCase();
      if (/light[ _-]?leak|lens[ _-]?flare|bokeh|prism/.test(value)) return "light-leaks";
      if (/glitch|vhs|noise|distort|corrupt|scanline|pixel/.test(value)) return "glitch";
      if (/overlay|dust|smoke|fog|grain|film|spark|particle|rain|snow/.test(value)) return "overlay";
      if (/shape|element|callout|line|arrow|icon|scribble|animation/.test(value)) return "shape-animation";
      if (/transition|wipe|flash|burn|swipe/.test(value)) return "transition";
      return "other";
    }
    function fileUrl(filePath) {
      try { if (urlMod && typeof urlMod.pathToFileURL === "function") return urlMod.pathToFileURL(filePath).href; } catch (e) { auditFallback("MAIN_VIDEO_ASSET_URL_001", e); }
      return "file:///" + String(filePath || "").replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
    }
    function addPaths(paths) {
      let added = 0;
      paths.forEach((filePath) => {
        if (!filePath || extensions.indexOf(path.extname(filePath).toLowerCase()) < 0) return;
        const key = path.resolve(filePath).toLowerCase();
        if (assets.some((asset) => String(asset.path || "").toLowerCase() === key)) return;
        let stat = null;
        try { stat = fs.statSync(filePath); } catch (e) { auditFallback("MAIN_VIDEO_ASSET_STAT_001", e); }
        assets.push({ id:uid(), name:path.basename(filePath, path.extname(filePath)), path:path.resolve(filePath), category:categoryFor(filePath), ext:path.extname(filePath).toUpperCase().slice(1), size:stat ? stat.size : 0 });
        added++;
      });
      save(); render();
      showToast(added ? added + " local video asset" + (added === 1 ? "" : "s") + " indexed. No files were copied." : "No new supported video files found.", !added);
    }
    function formatSize(bytes) {
      const size = Number(bytes) || 0;
      if (!size) return "";
      if (size >= 1073741824) return (size / 1073741824).toFixed(1) + " GB";
      if (size >= 1048576) return (size / 1048576).toFixed(0) + " MB";
      return Math.max(1, Math.round(size / 1024)) + " KB";
    }
    function render() {
      const query = String(search && search.value || "").trim().toLowerCase();
      const selectedCategory = category ? category.value : "all";
      const filtered = assets.filter((asset) => (selectedCategory === "all" || asset.category === selectedCategory) && (!query || (asset.name + " " + asset.path + " " + asset.category).toLowerCase().indexOf(query) >= 0));
      if (count) count.textContent = filtered.length + " shown · " + assets.length + " indexed · paths only, media is not copied.";
      if (!filtered.length) {
        grid.innerHTML = '<div class="studio-empty">' + (assets.length ? "No resources match this filter." : "Add MOV, MP4, MKV, AVI, WebM or M4V resources.") + '</div>';
        return;
      }
      grid.innerHTML = filtered.map((asset) => {
        const missing = nodeAvailable && !fs.existsSync(asset.path);
        const source = missing ? "" : fileUrl(asset.path);
        return '<article class="video-asset-card' + (missing ? ' missing' : '') + '" data-video-id="' + escapeHtml(asset.id) + '">' +
          '<div class="video-asset-preview">' + (source ? '<video muted loop preload="metadata" playsinline src="' + escapeHtml(source) + '"></video>' : '') +
          '<span class="video-asset-fallback">' + escapeHtml(asset.ext || "VIDEO") + '</span><b>' + escapeHtml(String(asset.category || "other").replace(/-/g, " ").toUpperCase()) + '</b></div>' +
          '<div class="video-asset-meta"><strong title="' + escapeHtml(asset.name) + '">' + escapeHtml(asset.name) + '</strong><span>' + escapeHtml(asset.ext || "VIDEO") + (asset.size ? " · " + formatSize(asset.size) : "") + (missing ? " · MISSING" : "") + '</span></div>' +
          '<div class="video-asset-card-actions"><button data-video-import="' + escapeHtml(asset.id) + '"' + (missing ? ' disabled' : '') + '>Import</button><button class="danger" data-video-remove="' + escapeHtml(asset.id) + '">×</button></div></article>';
      }).join("");
      grid.querySelectorAll("video").forEach((video) => {
        video.addEventListener("canplay", () => video.parentNode.classList.add("can-preview"));
        video.addEventListener("error", () => video.parentNode.classList.add("preview-error"));
        video.addEventListener("mouseenter", () => { try { video.currentTime = 0; const promise = video.play(); if (promise && promise.catch) promise.catch(() => video.parentNode.classList.add("preview-error")); } catch (e) { auditFallback("MAIN_VIDEO_ASSET_PLAY_001", e); } });
        video.addEventListener("mouseleave", () => { try { video.pause(); video.currentTime = 0; } catch (e) { auditFallback("MAIN_VIDEO_ASSET_PAUSE_001", e); } });
      });
    }

    const fileInput = document.getElementById("fileInputVideoAssets");
    const folderInput = document.getElementById("fileInputVideoAssetFolder");
    const filesButton = document.getElementById("btnVideoAssetFiles");
    const folderButton = document.getElementById("btnVideoAssetFolder");
    if (filesButton && fileInput) filesButton.addEventListener("click", () => fileInput.click());
    if (folderButton && folderInput) folderButton.addEventListener("click", () => folderInput.click());
    if (fileInput) fileInput.addEventListener("change", (event) => { const paths = Array.from(event.target.files || []).map((file) => file.path).filter(Boolean); fileInput.value = ""; addPaths(paths); });
    if (folderInput) folderInput.addEventListener("change", (event) => { const paths = Array.from(event.target.files || []).map((file) => file.path).filter(Boolean); folderInput.value = ""; addPaths(paths); });
    wireLibraryFileDrop(
      document.getElementById("videoAssetView"),
      () => extensions,
      (paths) => addPaths(paths),
      (busy) => busy ? "Scanning dropped video resources…" : "DROP VIDEO FILES OR FOLDERS TO INDEX"
    );
    if (search) search.addEventListener("input", render);
    if (category) category.addEventListener("change", render);
    const clean = document.getElementById("btnVideoAssetClean");
    if (clean) clean.addEventListener("click", () => {
      const before = assets.length;
      assets = assets.filter((asset) => { try { return fs.existsSync(asset.path); } catch (e) { return false; } });
      save(); render(); showToast((before - assets.length) + " missing reference(s) removed.");
    });
    grid.addEventListener("click", (event) => {
      const importButton = event.target.closest("[data-video-import]");
      if (importButton) {
        const asset = assets.find((item) => item.id === importButton.dataset.videoImport);
        if (asset) runTool("importBridgeAsset(" + hostArg(asset.path) + ")", asset.name + " imported");
        return;
      }
      const removeButton = event.target.closest("[data-video-remove]");
      if (removeButton) {
        assets = assets.filter((item) => item.id !== removeButton.dataset.videoRemove);
        save(); render();
      }
    });
    render();
  }

  // ---------------- Word Caption FFX Presets ----------------

  // Named .ffx presets shown in the Caption Studio animation dropdown
  // ("Bundled FFX Presets" optgroup, wired in wireFlexCaptions). Drop the
  // matching .ffx file into presets/word-captions/ (exact filename) and add
  // an entry here — it shows up in the group automatically.
  const CAPTION_FFX_STYLES = [
    { id: "ffxJump", label: "Jump", file: "MB 01 Jump.ffx" },
    { id: "ffxEase", label: "Ease", file: "MB 02 Ease.ffx" },
    { id: "ffxSlingshot", label: "Slingshot", file: "MB 03 Slingshot.ffx" },
    { id: "ffxBouncy", label: "Bouncy", file: "MB 04 Bouncy.ffx" },
    { id: "ffxOverload", label: "Overload", file: "MB 05 Overload.ffx" },
    { id: "ffxBlink", label: "Blink", file: "MB 06 Blink.ffx" },
    { id: "ffxWobble", label: "Wobble", file: "MB 07 Wobble.ffx" },
    { id: "ffxWild", label: "Wild", file: "MB 08 Wild.ffx" },
    { id: "ffxShy", label: "Shy", file: "MB 09 Shy.ffx" },
    { id: "ffxExplosion", label: "Explosion", file: "MB 10 Explosion.ffx" },
    { id: "ffxSmoothUp", label: "Smooth Up", file: "MB 11 Smooth Up.ffx" },
    { id: "ffxSmoothDown", label: "Smooth Down", file: "MB 12 Smooth Down.ffx" },
    { id: "ffxSmoothCombo", label: "Smooth Combo", file: "MB 13 Smooth Combo.ffx" },
    { id: "ffxPolishedUp", label: "Polished Up", file: "MB 14 Polished Up.ffx" },
    { id: "ffxPolishedDown", label: "Polished Down", file: "MB 15 Polished Down.ffx" },
    { id: "ffxBasic", label: "Basic", file: "MB W16 Basic.ffx" },
    { id: "ffxSlick", label: "Slick", file: "MB W17 Slick.ffx" },
    { id: "ffxStiff", label: "Stiff", file: "MB W18 Stiff.ffx" },
    { id: "ffxJelly", label: "Jelly", file: "MB W19 Jelly.ffx" },
    { id: "ffxClassy", label: "Classy", file: "MB W20 Classy.ffx" },
    { id: "erfanOpacityFlicker", label: "Opacity Flicker", file: "Opacity Flicker.ffx", preview: "ffxBlink" },
    { id: "erfanOpacityPosition", label: "Opacity Position", file: "Opacity Postion.ffx", preview: "ffxEase" },
    { id: "erfanPositionWiggle", label: "Position Wiggle", file: "Postion Wiggle.ffx", preview: "ffxWobble" },
    { id: "erfanText3", label: "Erfan Text 3", file: "Text Animation 3.ffx", preview: "ffxSmoothUp" },
    { id: "erfanText4", label: "Erfan Text 4", file: "Text Animation 4.ffx", preview: "ffxBouncy" },
    { id: "erfanText6", label: "Erfan Text 6", file: "Text Animation 6.ffx", preview: "ffxSlick" },
    { id: "erfanText7", label: "Erfan Text 7", file: "Text Animation 7.ffx", preview: "ffxJelly" },
    { id: "erfanText8", label: "Erfan Text 8", file: "Text Animation 8.ffx", preview: "ffxSlingshot" },
    { id: "erfanText9", label: "Erfan Text 9", file: "Text Animation 9.ffx", preview: "ffxWild" },
    { id: "erfanText1", label: "Erfan Text 1", file: "Text Animation_1.ffx", preview: "ffxPolishedUp" },
    { id: "erfanText2", label: "Erfan Text 2", file: "Text Animation_2.ffx", preview: "ffxPolishedDown" },
    { id: "erfanTextEvo", label: "TextEvo", file: "TextEvo.ffx", preview: "ffxExplosion" },
    { id: "voxAppearRandom", label: "VOX Appear Random", file: "AppearRandom.ffx", preview: "ffxShy" },
    { id: "voxFillAnimation", label: "VOX Fill Animation", file: "FillAnimation.ffx", preview: "ffxBasic" },
    { id: "voxFlickerGlow", label: "VOX Flicker + Glow", file: "Flicker and Glow.ffx", preview: "ffxBlink" },
    { id: "voxLoadUp", label: "VOX Load Up", file: "LoadUp.ffx", preview: "ffxSmoothUp" },
    { id: "voxTextJitter", label: "VOX Text Jitter", file: "Text Jitter.ffx", preview: "ffxWobble" },
    { id:"packBlur01", label:"Pack · Blur 01", file:"pack:Blur_IN OUT_Animation 01.ffx", preview:"ffxShy" },
    { id:"packBlur05", label:"Pack · Blur 05", file:"pack:Blur_IN OUT_Animation 05.ffx", preview:"ffxShy" },
    { id:"packBlur10", label:"Pack · Blur 10", file:"pack:Blur_IN OUT_Animation 10.ffx", preview:"ffxEase" },
    { id:"packBlurRtl01", label:"Pack · Blur RTL 01", file:"pack:Blur Right To Left_IN OUT_Animation 01.ffx", preview:"ffxSlick" },
    { id:"packBlurRtl05", label:"Pack · Blur RTL 05", file:"pack:Blur Right To Left_IN OUT_Animation 05.ffx", preview:"ffxSlick" },
    { id:"packCode01", label:"Pack · Code 01", file:"pack:Code_IN OUT_Animation 01.ffx", preview:"ffxBlink" },
    { id:"packColor01", label:"Pack · Colorful 01", file:"pack:Colorful_IN OUT_Animation 01.ffx", preview:"ffxWild" },
    { id:"packColor03", label:"Pack · Colorful 03", file:"pack:Colorful_IN OUT_Animation 03.ffx", preview:"ffxWild" },
    { id:"packPosition01", label:"Pack · Position 01", file:"pack:Position_IN OUT_Animation 01.ffx", preview:"ffxSmoothUp" },
    { id:"packPosition05", label:"Pack · Position 05", file:"pack:Position_IN OUT_Animation 05.ffx", preview:"ffxSmoothDown" },
    { id:"packPosition08", label:"Pack · Position 08", file:"pack:Position_IN OUT_Animation 08.ffx", preview:"ffxPolishedUp" },
    { id:"packPosition11", label:"Pack · Position 11", file:"pack:Position_IN OUT_Animation 11.ffx", preview:"ffxPolishedDown" },
    { id:"packPositionRtl01", label:"Pack · Position RTL 01", file:"pack:Position Right To Left_IN OUT_Animation 01.ffx", preview:"ffxSlick" },
    { id:"packPositionRtl03", label:"Pack · Position RTL 03", file:"pack:Position Right To Left_IN OUT_Animation 03.ffx", preview:"ffxClassy" },
    { id:"packPosRot05", label:"Pack · Position + Rotation 05", file:"pack:Position And Rotation_IN OUT_Animation 05.ffx", preview:"ffxBouncy" },
    { id:"packPosRot10", label:"Pack · Position + Rotation 10", file:"pack:Position And Rotation_IN OUT_Animation 10.ffx", preview:"ffxJelly" },
    { id:"packPosRotRtl01", label:"Pack · Pos + Rot RTL 01", file:"pack:Position And Rotation Right To Left_IN OUT_Animation 01.ffx", preview:"ffxSlingshot" },
    { id:"packPosRotRtl05", label:"Pack · Pos + Rot RTL 05", file:"pack:Position And Rotation Right To Left_IN OUT_Animation 05.ffx", preview:"ffxClassy" },
    { id:"packScaleRot01", label:"Pack · Scale + Rotation 01", file:"pack:Scale And Rotation_IN OUT_Animation 01.ffx", preview:"ffxJump" },
    { id:"packScaleRot02", label:"Pack · Scale + Rotation 02", file:"pack:Scale And Rotation_IN OUT_Animation 02.ffx", preview:"ffxBouncy" },
    { id:"packScaleRot05", label:"Pack · Scale + Rotation 05", file:"pack:Scale And Rotation_IN OUT_Animation 05.ffx", preview:"ffxJelly" },
    { id:"packWiggly02", label:"Pack · Wiggly 02", file:"pack:Wiggly_IN OUT_Animation 02.ffx", preview:"ffxWobble" },
    { id:"packWiggly03", label:"Pack · Wiggly 03", file:"pack:Wiggly_IN OUT_Animation 03.ffx", preview:"ffxWobble" },
    { id:"packWiggly06", label:"Pack · Wiggly 06", file:"pack:Wiggly_IN OUT_Animation 06.ffx", preview:"ffxExplosion" }
  ];

  function getShapeWorkflowOptions() {
    const targetEl = document.getElementById("shapeTargetMode");
    const durationEl = document.getElementById("shapeDurationFrames");
    const easeEl = document.getElementById("shapeEaseMode");
    return {
      target: targetEl ? targetEl.value : "auto",
      durationFrames: Math.max(1, Math.min(300, Number(durationEl && durationEl.value) || 24)),
      animationEase: easeEl ? easeEl.value : "smooth"
    };
  }

  function wireShapeControls() {
    const modal = document.getElementById("shapeModal");
    if (!modal) return;
    const titleMap = { trim: "\u2702 Trim Paths", taper: "\ud83d\udccf Taper", dashes: "\u250a Dashes" };
    let curTab = "trim";

    function setTab(tab) {
      curTab = tab;
      const t = document.getElementById("shapeModalTitle");
      if (t) t.textContent = titleMap[tab] || "Shape Controls";
      modal.querySelectorAll(".shape-tab").forEach((b) => b.classList.toggle("active", b.getAttribute("data-shape-tab") === tab));
      modal.querySelectorAll(".shape-panel").forEach((p) => p.classList.toggle("active", p.getAttribute("data-shape-panel") === tab));
    }
    function openModal(tab) { setTab(tab || "trim"); modal.style.display = "flex"; }
    function closeModal() { modal.style.display = "none"; }
    function num(id) { const e = document.getElementById(id); return e ? Number(e.value) : 0; }
    function chk(id) { const e = document.getElementById(id); return e ? e.checked : false; }

    function apply(cfg) {
      const workflow = getShapeWorkflowOptions();
      cfg.target = workflow.target;
      cfg.durationFrames = workflow.durationFrames;
      cfg.animationEase = workflow.animationEase;
      runTool("ae_shapeControl(" + hostArg(JSON.stringify(cfg)) + ")", "Shape control applied", (res) => { if (res && res.success) closeModal(); });
    }

    document.querySelectorAll("[data-shape-ctrl]").forEach((b) => {
      b.addEventListener("click", () => openModal(b.getAttribute("data-shape-ctrl")));
    });
    modal.querySelectorAll("[data-shape-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.getAttribute("data-shape-tab"))));
    modal.querySelectorAll('input[type="range"]').forEach((s) => {
      const out = document.getElementById(s.id + "V");
      const upd = () => { if (out) out.textContent = s.value; };
      s.addEventListener("input", upd); upd();
    });
    modal.querySelectorAll("[data-trim-preset]").forEach((b) => b.addEventListener("click", () => apply({ type: "trim", preset: b.getAttribute("data-trim-preset") })));
    modal.querySelectorAll("[data-taper-preset]").forEach((b) => b.addEventListener("click", () => apply({ type: "taper", preset: b.getAttribute("data-taper-preset") })));
    const applyBtn = document.getElementById("btnShapeApply");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      if (curTab === "trim") apply({ type: "trim", preset: "custom", start: num("trimStart"), end: num("trimEnd"), offset: num("trimOffset"), animate: chk("trimAnimate") });
      else if (curTab === "taper") apply({ type: "taper", preset: "custom", startWidth: num("taperSW"), endWidth: num("taperEW"), startLength: num("taperSL"), endLength: num("taperEL"), ease: num("taperEase") });
      else apply({ type: "dashes", dash: num("dashDash"), gap: num("dashGap"), offset: num("dashOffset"), animate: chk("dashAnimate") });
    });
    const cancel = document.getElementById("btnShapeCancel");
    if (cancel) cancel.addEventListener("click", closeModal);
    const close = document.getElementById("btnShapeClose");
    if (close) close.addEventListener("click", closeModal);
    modal.addEventListener("mousedown", (ev) => { if (ev.target === modal) closeModal(); });
  }

  function wireShapeToolkit() {
    const sec = document.getElementById("shapeToolkit");
    if (!sec) return;

    // The detailed Trim/Taper/Dashes modal lives outside the toolkit section,
    // so it needs its own listeners in addition to the delegated quick actions.
    wireShapeControls();

    // Live preview thumbnails: tiny animated SVG demos per shape tool.
    const SHAPE_PV = {
      trim: '<path class="pv-stroke pv-draw" d="M2 7h16"/>',
      dashes: '<path class="pv-stroke pv-dash" d="M2 7h16"/>',
      offset: '<path class="pv-stroke pv-draw" d="M2 4h16"/><path class="pv-stroke pv-draw-delay" d="M2 10h16"/>',
      repeater: '<g class="pv-rep"><path class="pv-stroke" d="M3 7h9"/><path class="pv-stroke" d="M11 7h9"/></g>',
      zigzag: '<path class="pv-stroke pv-draw" d="M2 10l4-6 4 6 4-6 4 6"/>',
      twist: '<path class="pv-stroke pv-spin" d="M10 7a5.2 5.2 0 1 1-5.2 5.2"/>',
      round: '<rect class="pv-stroke pv-pulse" x="3" y="3.5" width="14" height="7" rx="3.5"/>',
      pucker: '<path class="pv-stroke pv-pulse" d="M9 1.5 10.5 6 15 7.5 10.5 9 9 13.5 7.5 9 3 7.5 7.5 6Z"/>',
      wigglePaths: '<path class="pv-stroke pv-wiggle" d="M2 7q4-4 8 0t8 0"/>',
      wiggleTransform: '<rect class="pv-stroke pv-swing" x="4" y="3.5" width="12" height="7" rx="1.5"/>',
      merge: '<circle class="pv-stroke pv-fade-a" cx="8" cy="7" r="4.5"/><circle class="pv-stroke pv-fade-b" cx="12.5" cy="7" r="4.5"/>',
      fill: '<rect class="pv-fill pv-pulse" x="3" y="3.5" width="14" height="7" rx="1.5"/>',
      stroke: '<rect class="pv-stroke pv-draw" x="3.5" y="3.5" width="13" height="7" rx="1.5"/>',
      end: '<path class="pv-stroke pv-draw" d="M2 7h10"/><path class="pv-fill pv-pulse" d="M12 5.2 17 7l-5 1.8Z"/>',
      both: '<path class="pv-stroke pv-draw" d="M2 7h16"/><path class="pv-fill pv-pulse" d="M2 5.2 7 7l-5 1.8Z"/><path class="pv-fill pv-pulse" d="M13 5.2 18 7l-5 1.8Z"/>',
      taper: '<path class="pv-stroke pv-draw" d="M2 7h10"/><path class="pv-fill pv-pulse" d="M12 5.2 17 7l-5 1.8Z"/>',
      lightning: '<path class="pv-stroke pv-draw" d="M3 10.5 7.5 3l2.6 4.5L14 2.5l-3.9 6.2 3.4.8-4.6 3.4 1.4-3-4.9-.8Z"/>',
      social: '<path class="pv-stroke pv-draw" d="M2 7h12"/><circle class="pv-fill pv-pulse" cx="16.5" cy="7" r="2.3"/>',
      arrow: '<path class="pv-stroke pv-draw" d="M2 7h12"/><path class="pv-fill pv-pop" d="M14 4.2 18.5 7 14 9.8Z"/>',
      signature: '<path class="pv-stroke pv-draw" d="M2 8.5c1.5-3.5 3 3 4.5 0 1-2 2.5-2.5 3-1s-1.5 2.5-3 2 1-3 3.5-3c2.5 0 2 3.5 5 2"/>',
      road: '<path class="pv-stroke pv-dash" d="M2 4h16"/><path class="pv-stroke pv-dash" d="M2 10h16"/>',
      drawLine: '<path class="pv-stroke pv-draw" d="M2 11 9 4l4 3"/>',
      eraseLine: '<path class="pv-stroke pv-erase" d="M2 11 9 4l4 3"/>',
      loadingCircle: '<path class="pv-stroke pv-spin-arc" d="M3.5 7a6.5 6.5 0 0 1 13 0"/>',
      spinner: '<circle class="pv-stroke pv-spin-arc" cx="10" cy="7" r="5"/>',
      loadingBar: '<rect class="pv-fill pv-bar" x="2" y="5" width="16" height="4" rx="2"/>',
      arrowDraw: '<path class="pv-stroke pv-draw" d="M2 7h10"/><path class="pv-fill pv-pop" d="M12 4.2 18.5 7 12 9.8Z"/>'
    };
    sec.querySelectorAll(".tool-btn").forEach((btn) => {
      const key = btn.getAttribute("data-shape-op") || btn.getAttribute("data-shape-preset") || btn.getAttribute("data-shape-taper") || btn.getAttribute("data-shape-ctrl") || btn.getAttribute("data-shape-reset");
      if (!key || !SHAPE_PV[key]) return;
      const wrap = document.createElement("span");
      wrap.className = "shape-pv";
      wrap.innerHTML = '<svg viewBox="0 0 20 14" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + SHAPE_PV[key] + "</svg>";
      btn.insertBefore(wrap, btn.firstChild);
      btn.classList.add("has-pv");
      btn.childNodes.forEach((node) => {
        if (node.nodeType === 3 && node.textContent.trim()) {
          node.textContent = node.textContent.replace(/^\s*[^\w\s][^\w\s]*\s*/, " ").trim();
        }
      });
    });

    sec.addEventListener("click", (ev) => {
      const workflow = getShapeWorkflowOptions();
      const btn = ev.target.closest(".tool-btn");
      if (!btn || !sec.contains(btn)) return;
      const op = btn.getAttribute("data-shape-op");
      if (op) { runTool("ae_shapeOp(" + hostArg(op) + "," + hostArg(workflow.target) + "," + (ev.altKey ? "true" : "false") + ")", "Shape operator ready"); return; }
      const taper = btn.getAttribute("data-shape-taper");
      if (taper) { runTool("ae_shapeQuickTaper(" + hostArg(taper) + "," + hostArg(workflow.target) + ")", "Taper applied"); return; }
      const preset = btn.getAttribute("data-shape-preset");
      if (preset) { runTool("ae_shapePreset(" + hostArg(preset) + "," + hostArg(JSON.stringify({ target: workflow.target, durationFrames: workflow.durationFrames, animationEase: workflow.animationEase, forceNew: !!ev.altKey })) + ")", "Shape preset applied"); return; }
      const reset = btn.getAttribute("data-shape-reset");
      if (reset) { runTool("ae_shapeReset(" + hostArg(reset) + "," + hostArg(workflow.target) + ")", "Shape properties updated"); }
    });
  }

  // ---------------- Color Panel ----------------

  const CompXColorUtils = {
    hexToRgb: function(hex) {
      hex = String(hex).trim().replace("#", "");
      if (hex.length === 3) hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
      if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return { r: 255, g: 255, b: 255 }; // fallback
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    },
    rgbToHex: function(r, g, b) {
      r = Math.max(0, Math.min(255, Math.round(r||0)));
      g = Math.max(0, Math.min(255, Math.round(g||0)));
      b = Math.max(0, Math.min(255, Math.round(b||0)));
      const rr = r.toString(16).padStart(2, "0");
      const gg = g.toString(16).padStart(2, "0");
      const bb = b.toString(16).padStart(2, "0");
      return "#" + rr + gg + bb;
    },
    rgbToHsl: function(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      if (max === min) { h = s = 0; }
      else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    },
    hslToRgb: function(h, s, l) {
      h = h / 360; s = s / 100; l = l / 100;
      let r, g, b;
      if (s === 0) { r = g = b = l; }
      else {
        const hue2rgb = function(p, q, t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
  };

  function wireColorPanel() {
    const colorPicker = document.getElementById("colorPickerMain");
    const hexInput = document.getElementById("colorHexInput");
    const rInp = document.getElementById("colorRInput");
    const gInp = document.getElementById("colorGInput");
    const bInp = document.getElementById("colorBInput");
    const hInp = document.getElementById("colorHInput");
    const sInp = document.getElementById("colorSInput");
    const lInp = document.getElementById("colorLInput");

    function updateRGBHSL(hex) {
      if (!rInp) return;
      const rgb = CompXColorUtils.hexToRgb(hex);
      rInp.value = rgb.r;
      gInp.value = rgb.g;
      bInp.value = rgb.b;
      const hsl = CompXColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
      hInp.value = hsl.h;
      sInp.value = hsl.s;
      lInp.value = hsl.l;
    }

    // Sample a pixel from any visible screen area. Newer CEP builds can expose
    // Chromium's native EyeDropper API; Windows gets a dependency-free cursor
    // sampler fallback so images/video do not need to be imported first.
    const eyedropperStatus = document.getElementById("colorEyedropperStatus");
    let eyedropperBusy = false;
    function setEyedropperStatus(message, state) {
      if (!eyedropperStatus) return;
      eyedropperStatus.textContent = message;
      eyedropperStatus.classList.toggle("is-picking", state === "picking");
      eyedropperStatus.classList.toggle("is-error", state === "error");
    }
    function commitScreenColor(targetId, hex) {
      const normalized = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? String(hex).toUpperCase() : "";
      if (!normalized) throw new Error("The sampled pixel did not return a valid color.");
      if (targetId === "colorPickerMain") {
        if (colorPicker) colorPicker.value = normalized;
        if (hexInput) hexInput.value = normalized;
        updateRGBHSL(normalized);
      } else {
        const target = document.getElementById(targetId);
        if (!target) throw new Error("The selected gradient stop is unavailable.");
        target.value = normalized;
        target.dispatchEvent(new Event("input", { bubbles:true }));
      }
      addColorToStorage("compXRecentColors", normalized, 12);
      renderSwatches("recentColorGrid", "compXRecentColors", "No recent colors.");
      setEyedropperStatus("Picked " + normalized + " · ready for another sample", "ready");
      showToast(normalized + " sampled from screen.");
    }
    function windowsScreenSample(done) {
      if (!nodeAvailable || !cp || !nodeProcess || nodeProcess.platform !== "win32") {
        done(new Error("Screen sampling is unavailable in this CEP build. Use the manual color control instead."));
        return;
      }
      const ps = [
        "$ErrorActionPreference='Stop'",
        "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CompXMouse { [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; } [DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int vKey); [DllImport(\"user32.dll\")] static extern bool GetCursorPos(out POINT p); [DllImport(\"user32.dll\")] static extern IntPtr GetDC(IntPtr h); [DllImport(\"user32.dll\")] static extern int ReleaseDC(IntPtr h, IntPtr dc); [DllImport(\"gdi32.dll\")] static extern uint GetPixel(IntPtr dc,int x,int y); public static string Sample(){ POINT p; if(!GetCursorPos(out p)) throw new Exception(\"Cursor unavailable\"); IntPtr dc=GetDC(IntPtr.Zero); if(dc==IntPtr.Zero) throw new Exception(\"Screen unavailable\"); uint c=GetPixel(dc,p.X,p.Y); ReleaseDC(IntPtr.Zero,dc); if(c==0xFFFFFFFF) throw new Exception(\"Pixel unavailable\"); return String.Format(\"#{0:X2}{1:X2}{2:X2}\",(byte)(c&255),(byte)((c>>8)&255),(byte)((c>>16)&255)); } }'",
        "$deadline=(Get-Date).AddSeconds(15)",
        "while(([CompXMouse]::GetAsyncKeyState(1) -band 0x8000) -ne 0){Start-Sleep -Milliseconds 20}",
        "while((Get-Date) -lt $deadline){",
        " if(([CompXMouse]::GetAsyncKeyState(27) -band 0x8000) -ne 0){exit 2}",
        " if(([CompXMouse]::GetAsyncKeyState(1) -band 0x8000) -ne 0){",
        "  [CompXMouse]::Sample()",
        "  exit 0",
        " }",
        " Start-Sleep -Milliseconds 20",
        "}",
        "exit 3"
      ].join("\n");
      let encoded = "";
      try { encoded = nodeRequire("buffer").Buffer.from(ps, "utf16le").toString("base64"); }
      catch (encodeError) { auditFallback("MAIN_SCREEN_PICK_ENCODE_001", encodeError); done(encodeError); return; }
      cp.execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded], { windowsHide:true, timeout:18000 }, (error, stdout) => {
        const match = String(stdout || "").match(/#[0-9A-F]{6}/i);
        if (match) { done(null, match[0]); return; }
        if (error && (error.code === 2 || error.code === 3)) { done(new Error("Color picking cancelled."), null, true); return; }
        done(error || new Error("No pixel was selected within 15 seconds."));
      });
    }
    function pickScreenColor(targetId, button) {
      if (eyedropperBusy) return;
      eyedropperBusy = true;
      if (button) button.classList.add("is-picking");
      setEyedropperStatus("Picking… click any image, video or screen pixel · Esc cancels", "picking");
      const finish = (error, hex, cancelled) => {
        eyedropperBusy = false;
        if (button) button.classList.remove("is-picking");
        if (error) {
          setEyedropperStatus(cancelled ? "Picker cancelled · ready" : error.message, cancelled ? "ready" : "error");
          if (!cancelled) showToast(error.message, true);
          return;
        }
        try { commitScreenColor(targetId, hex); }
        catch (commitError) { auditFallback("MAIN_SCREEN_PICK_COMMIT_001", commitError); setEyedropperStatus(commitError.message, "error"); showToast(commitError.message, true); }
      };
      if (typeof window.EyeDropper === "function") {
        try {
          const nativePicker = new window.EyeDropper();
          nativePicker.open().then((result) => finish(null, result.sRGBHex)).catch((error) => {
            if (error && error.name === "AbortError") finish(error, null, true);
            else windowsScreenSample(finish);
          });
          return;
        } catch (nativeError) { auditFallback("MAIN_SCREEN_PICK_NATIVE_001", nativeError); }
      }
      windowsScreenSample(finish);
    }

    const screenEyedropper = document.getElementById("btnScreenEyedropper");
    if (screenEyedropper) screenEyedropper.addEventListener("click", () => pickScreenColor("colorPickerMain", screenEyedropper));
    document.querySelectorAll("#panel-colors [data-eyedrop-target]").forEach((button) => {
      button.addEventListener("click", () => pickScreenColor(button.dataset.eyedropTarget, button));
    });

    if (colorPicker && hexInput) {
      colorPicker.addEventListener("input", () => {
        hexInput.value = colorPicker.value;
        updateRGBHSL(colorPicker.value);
      });
      hexInput.addEventListener("input", () => {
        const v = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/i.test(v)) {
          colorPicker.value = v;
          updateRGBHSL(v);
        }
      });
      // Initial sync
      updateRGBHSL(colorPicker.value);
    }

    // RGB Inputs
    const onRgbInput = () => {
      const hex = CompXColorUtils.rgbToHex(Number(rInp.value), Number(gInp.value), Number(bInp.value));
      if (hexInput) hexInput.value = hex;
      if (colorPicker) colorPicker.value = hex;
      const hsl = CompXColorUtils.rgbToHsl(Number(rInp.value), Number(gInp.value), Number(bInp.value));
      hInp.value = hsl.h; sInp.value = hsl.s; lInp.value = hsl.l;
    };
    if (rInp) [rInp, gInp, bInp].forEach(el => el.addEventListener("input", onRgbInput));

    // HSL Inputs
    const onHslInput = () => {
      const rgb = CompXColorUtils.hslToRgb(Number(hInp.value), Number(sInp.value), Number(lInp.value));
      rInp.value = rgb.r; gInp.value = rgb.g; bInp.value = rgb.b;
      const hex = CompXColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
      if (hexInput) hexInput.value = hex;
      if (colorPicker) colorPicker.value = hex;
    };
    if (hInp) [hInp, sInp, lInp].forEach(el => el.addEventListener("input", onHslInput));

    function getColorFromPicker() {
      return (colorPicker && colorPicker.value) || "#ff6600";
    }

    function renderSwatches(containerId, storageKey, emptyMsg) {
      const grid = document.getElementById(containerId);
      if (!grid) return;
      let colors = [];
      try { colors = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { auditFallback("MAIN_RENDERSWATCHES_001", e); }
      if (!colors.length) {
        grid.innerHTML = '<div class="studio-empty" style="font-size:11px;">' + emptyMsg + '</div>';
        return;
      }
      let html = "";
      colors.forEach((hex, idx) => {
        const safeHex = escapeHtml(hex);
        html += '<div class="swatch-chip" style="background:' + safeHex + ';" data-hex="' + safeHex + '" data-idx="' + idx + '" title="' + safeHex + '">' +
          '<span class="swatch-remove" data-idx="' + idx + '" data-storage="' + storageKey + '" data-container="' + containerId + '" data-empty="' + emptyMsg.replace(/"/g, "&quot;") + '">×</span>' +
          '<span class="swatch-hex-tip">' + safeHex + '</span></div>';
      });
      grid.innerHTML = html;

      grid.querySelectorAll(".swatch-chip").forEach((chip) => {
        chip.addEventListener("click", (ev) => {
          if (ev.target.classList.contains("swatch-remove")) return;
          const hex = chip.dataset.hex;
          if (hex) {
            try { navigator.clipboard.writeText(hex); } catch (ce) { auditFallback("MAIN_RENDERSWATCHES_002", ce); }
            if (colorPicker) colorPicker.value = hex;
            if (hexInput) hexInput.value = hex;
            updateRGBHSL(hex);
            addColorToStorage("compXRecentColors", hex, 12);
            renderSwatches("recentColorGrid", "compXRecentColors", "No recent colors.");
            showToast(hex + " loaded. Double-click to apply.");
          }
        });
        chip.addEventListener("dblclick", (ev) => {
          if (ev.target.classList.contains("swatch-remove")) return;
          const hex = chip.dataset.hex;
          if (hex) runTool('ae_applyColor("fill","' + hex + '")', "Fill applied: " + hex);
        });
      });

      grid.onclick = (ev) => {
        const removeBtn = ev.target.closest(".swatch-remove");
        if (!removeBtn) return;
        const idx = Number(removeBtn.dataset.idx);
        const storageKey2 = removeBtn.dataset.storage;
        const containerId2 = removeBtn.dataset.container;
        const emptyMsg2 = removeBtn.dataset.empty;
        let colors2 = [];
        try { colors2 = JSON.parse(localStorage.getItem(storageKey2)) || []; } catch (e) { auditFallback("MAIN_RENDERSWATCHES_003", e); }
        if (idx >= 0 && idx < colors2.length) {
          colors2.splice(idx, 1);
          localStorage.setItem(storageKey2, JSON.stringify(colors2));
          renderSwatches(containerId2, storageKey2, emptyMsg2);
        }
      };
    }

    function addColorToStorage(storageKey, hex, max) {
      const normalized = String(hex || "").trim().toLowerCase();
      if (!normalized) return;
      let colors = [];
      try { colors = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { auditFallback("MAIN_ADDCOLORTOSTORAGE_001", e); }
      colors = colors.filter((c) => String(c || "").toLowerCase() !== normalized);
      colors.unshift(normalized);
      if (colors.length > max) colors = colors.slice(0, max);
      localStorage.setItem(storageKey, JSON.stringify(colors));
    }

    function refreshColorUI() {
      renderSwatches("swatchGrid", "compXSwatches", "No swatches saved yet. Pick a color and click \"Save Swatch\".");
      renderSwatches("recentColorGrid", "compXRecentColors", "No recent colors.");
      renderUserPalettes();
    }

    // Pick color from layer
    const btnPick = document.getElementById("btnColorPickFromLayer");
    if (btnPick) {
      btnPick.addEventListener("click", () => {
        callHost("ae_pickLayerColor()", (parsed) => {
          if (parsed.success && parsed.data) {
            const hex = String(parsed.data).toLowerCase();
            if (colorPicker) colorPicker.value = hex;
            if (hexInput) hexInput.value = hex;
            updateRGBHSL(hex);
            addColorToStorage("compXRecentColors", hex, 12);
            refreshColorUI();
            showToast("Picked " + hex);
          } else {
            showToast(parsed.message || "Could not pick color", true);
          }
        });
      });
    }

    // Apply Fill
    const btnApply = document.getElementById("btnColorApplyFill");
    if (btnApply) {
      btnApply.addEventListener("click", () => {
        const hex = getColorFromPicker();
        runTool('ae_applyColor("fill","' + hex + '")', "Fill applied", (parsed) => {
          if (parsed.success) {
            addColorToStorage("compXRecentColors", hex, 12);
            refreshColorUI();
          }
        });
      });
    }

    // Apply Solid
    const btnSolid = document.getElementById("btnColorApplySolid");
    if (btnSolid) {
      btnSolid.addEventListener("click", () => {
        const hex = getColorFromPicker();
        runTool('ae_applyColor("solid","' + hex + '")', "Solid color applied", (parsed) => {
          if (parsed.success) {
            addColorToStorage("compXRecentColors", hex, 12);
            refreshColorUI();
          }
        });
      });
    }

    // Save Swatch
    const btnSave = document.getElementById("btnColorSaveSwatch");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const hex = getColorFromPicker();
        let existing = [];
        try { existing = JSON.parse(localStorage.getItem("compXSwatches")) || []; } catch (e) { auditFallback("MAIN_SAVESWATCH_001", e); }
        const duplicate = existing.some((c) => String(c || "").toLowerCase() === String(hex).toLowerCase());
        addColorToStorage("compXSwatches", hex, 48);
        addColorToStorage("compXRecentColors", hex, 12);
        refreshColorUI();
        showToast(duplicate ? hex + " is already saved — moved to the front." : "Saved " + hex);
      });
    }

    // Clear Swatches
    const btnClearSwatches = document.getElementById("btnClearSwatches");
    if (btnClearSwatches) {
      btnClearSwatches.addEventListener("click", () => {
        localStorage.removeItem("compXSwatches");
        refreshColorUI();
        showToast("Swatches cleared");
      });
    }

    // Clear Recent
    const btnClearRecent = document.getElementById("btnClearRecent");
    if (btnClearRecent) {
      btnClearRecent.addEventListener("click", () => {
        localStorage.removeItem("compXRecentColors");
        refreshColorUI();
        showToast("Recent colors cleared");
      });
    }

    // User Palettes Logic
    function renderUserPalettes() {
      const list = document.getElementById("paletteList");
      if (!list) return;
      let palettes = [];
      try { palettes = JSON.parse(localStorage.getItem("compXUserPalettes")) || []; } catch(e) { void e; }
      if (palettes.length === 0) {
        list.innerHTML = '<div class="studio-empty" style="font-size:11px;">No custom palettes yet.</div>';
        return;
      }
      let html = "";
      palettes.forEach((pal, idx) => {
        html += '<div class="cx-palette-row">' +
                '<div class="cx-palette-row-head">' +
                  '<strong>' + escapeHtml(pal.name || "My Palette") + '</strong>' +
                  '<div>' +
                    '<button class="cx-btn cx-btn-mini" data-obs data-action="addcolor" data-idx="'+idx+'" title="Add the current picker color">+ Color</button> ' +
                    '<button class="cx-btn cx-btn-mini" data-obs data-action="deletepal" data-idx="'+idx+'" title="Delete this palette">×</button>' +
                  '</div>' +
                '</div>' +
                '<div class="swatch-grid">';
        (pal.colors || []).forEach((c, cIdx) => {
          const safeHex = escapeHtml(c);
          html += '<div class="swatch-chip" style="background:'+safeHex+';" data-hex="'+safeHex+'">' +
                  '<span class="swatch-remove" data-action="deletecolor" data-idx="'+idx+'" data-cidx="'+cIdx+'">×</span>' +
                  '<span class="swatch-hex-tip">'+safeHex+'</span></div>';
        });
        html += '</div></div>';
      });
      list.innerHTML = html;
      
      list.querySelectorAll(".swatch-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
          if (e.target.classList.contains("swatch-remove")) return;
          const hex = chip.dataset.hex;
          if (hex) {
            try { navigator.clipboard.writeText(hex); } catch(e){ void e; }
            if (colorPicker) colorPicker.value = hex;
            if (hexInput) hexInput.value = hex;
            updateRGBHSL(hex);
            addColorToStorage("compXRecentColors", hex, 12);
            refreshColorUI();
            showToast(hex + " loaded. Double-click to apply.");
          }
        });
        chip.addEventListener("dblclick", (e) => {
          if (e.target.classList.contains("swatch-remove")) return;
          const hex = chip.dataset.hex;
          if (hex) runTool('ae_applyColor("fill","' + hex + '")', "Fill applied");
        });
      });
    }

    const btnNewPalette = document.getElementById("btnNewPalette");
    if (btnNewPalette) {
      btnNewPalette.addEventListener("click", () => {
        let name = prompt("Enter Palette Name:", "My Palette");
        if (!name) return;
        let palettes = [];
        try { palettes = JSON.parse(localStorage.getItem("compXUserPalettes")) || []; } catch(e) { void e; }
        palettes.push({ id: Date.now().toString(), name: name, colors: [] });
        localStorage.setItem("compXUserPalettes", JSON.stringify(palettes));
        renderUserPalettes();
      });
    }
    const paletteList = document.getElementById("paletteList");
    if (paletteList) {
      paletteList.addEventListener("click", (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        const idx = Number(e.target.dataset.idx);
        let palettes = [];
        try { palettes = JSON.parse(localStorage.getItem("compXUserPalettes")) || []; } catch(e) { void e; }
        if (action === "addcolor") {
          const hex = getColorFromPicker();
          if (!palettes[idx].colors) palettes[idx].colors = [];
          const duplicate = palettes[idx].colors.some((c) => String(c || "").toLowerCase() === String(hex).toLowerCase());
          if (!duplicate) palettes[idx].colors.push(hex);
          localStorage.setItem("compXUserPalettes", JSON.stringify(palettes));
          renderUserPalettes();
          showToast(duplicate ? "That color is already in this palette." : "Color added to palette.", duplicate);
        } else if (action === "deletepal") {
          if(confirm("Delete this palette?")) {
            palettes.splice(idx, 1);
            localStorage.setItem("compXUserPalettes", JSON.stringify(palettes));
            renderUserPalettes();
          }
        } else if (action === "deletecolor") {
          const cidx = Number(e.target.dataset.cidx);
          palettes[idx].colors.splice(cidx, 1);
          localStorage.setItem("compXUserPalettes", JSON.stringify(palettes));
          renderUserPalettes();
        }
      });
    }

    // Gradient Builder: live 2/4-stop preview, saved variants and duplicate audit.
    const gradInputs = [1, 2, 3, 4].map((n) => document.getElementById("gradColor" + n));
    const gradMode = document.getElementById("gradStopMode");
    const gradType = document.getElementById("gradType");
    const gradAngle = document.getElementById("gradAngle");
    const gradPreview = document.getElementById("customGradientPreview");
    const gradLabel = document.getElementById("customGradientLabel");
    const savedGradientGrid = document.getElementById("savedGradientGrid");
    const duplicateStatus = document.getElementById("colorDuplicateStatus");

    function normalizeHex(hex) {
      const value = String(hex || "").trim().toUpperCase();
      return /^#[0-9A-F]{6}$/.test(value) ? value : null;
    }
    function currentGradient() {
      const mode = gradMode && gradMode.value === "4" ? 4 : 2;
      return {
        mode: mode,
        colors: gradInputs.slice(0, mode).map((el) => normalizeHex(el && el.value) || "#000000"),
        type: mode === 4 ? 4 : (gradType ? Number(gradType.value) || 1 : 1),
        angle: gradAngle ? Math.max(-360, Math.min(360, Number(gradAngle.value) || 0)) : 0
      };
    }
    function gradientKey(gradient) {
      const colors = gradient.colors.map((c) => normalizeHex(c) || "#000000");
      const reversed = colors.slice().reverse();
      const directKey = colors.join("|");
      const reverseKey = reversed.join("|");
      return gradient.mode + ":" + (directKey < reverseKey ? directKey : reverseKey) + ":" + gradient.type;
    }
    function updateGradientPreview() {
      const gradient = currentGradient();
      document.querySelectorAll("#panel-colors .grad-extra-stop").forEach((el) => {
        el.style.display = gradient.mode === 4 ? "flex" : "none";
      });
      if (gradType) gradType.disabled = gradient.mode === 4;
      if (gradAngle) gradAngle.disabled = gradient.mode === 4;
      if (gradPreview) {
        if (gradient.mode === 4) {
          gradPreview.style.background = "radial-gradient(circle at 18% 20%, " + gradient.colors[0] + " 0, transparent 55%), radial-gradient(circle at 82% 18%, " + gradient.colors[1] + " 0, transparent 55%), radial-gradient(circle at 18% 82%, " + gradient.colors[2] + " 0, transparent 55%), " + gradient.colors[3];
        } else if (gradient.type === 2) {
          gradPreview.style.background = "radial-gradient(circle, " + gradient.colors.join(", ") + ")";
        } else {
          // CSS 0deg points upward; AE's 0deg Ramp runs left-to-right.
          gradPreview.style.background = "linear-gradient(" + (gradient.angle + 90) + "deg, " + gradient.colors.join(", ") + ")";
        }
      }
      if (gradLabel) gradLabel.textContent = gradient.mode === 4 ? "4-point AE gradient" : gradient.mode + " stops · " + (gradient.type === 2 ? "radial" : gradient.angle + "°");
    }
    function getSavedGradients() {
      try { return JSON.parse(localStorage.getItem("compXSavedGradients")) || []; } catch (e) { auditFallback("MAIN_GETSAVEDGRADIENTS_001", e); return []; }
    }
    function setSavedGradients(items) {
      localStorage.setItem("compXSavedGradients", JSON.stringify(items.slice(0, 48)));
    }
    function applyGradient(gradient) {
      gradient.colors.forEach((hex) => addColorToStorage("compXRecentColors", hex, 12));
      refreshColorUI();
      if (gradient.mode === 4) {
        runTool("ae_applyGradient4(" + gradient.colors.map(hostArg).join(",") + ")", "4-color gradient applied");
        return;
      }
      const cfg = { preset: "2color-custom", c1: gradient.colors[0], c2: gradient.colors[1], rampType: gradient.type, angle: gradient.angle };
      runTool("ae_applyGradientPlate(" + hostArg(JSON.stringify(cfg)) + ")", "Custom gradient applied");
    }
    function loadGradient(gradient) {
      if (!gradient || !gradient.colors) return;
      if (gradMode) gradMode.value = String(gradient.mode === 4 ? 4 : 2);
      if (gradType && gradient.mode !== 4) gradType.value = String(gradient.type || 1);
      if (gradAngle) gradAngle.value = String(Number(gradient.angle) || 0);
      gradient.colors.forEach((hex, idx) => { if (gradInputs[idx]) gradInputs[idx].value = normalizeHex(hex) || "#000000"; });
      updateGradientPreview();
    }
    function renderSavedGradients() {
      if (!savedGradientGrid) return;
      const items = getSavedGradients();
      if (!items.length) {
        savedGradientGrid.innerHTML = '<div class="studio-empty" style="font-size:10px;">No saved gradients yet.</div>';
        return;
      }
      savedGradientGrid.innerHTML = items.map((gradient, idx) => {
        const colors = (gradient.colors || []).map((c) => normalizeHex(c) || "#000000");
        const background = gradient.mode === 4 ? "linear-gradient(135deg," + colors.join(",") + ")" : (gradient.type === 2 ? "radial-gradient(circle," + colors.join(",") + ")" : "linear-gradient(" + (Number(gradient.angle) || 0) + "deg," + colors.join(",") + ")");
        return '<button class="cx-saved-gradient" data-gradient-index="' + idx + '" title="Click to load · Double-click to apply" style="background:' + background + '"><span>' + gradient.mode + '</span><i data-remove-gradient="' + idx + '">×</i></button>';
      }).join("");
    }
    function hslToHex(h, s, l) {
      const rgb = CompXColorUtils.hslToRgb((h + 360) % 360, s, l);
      return CompXColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    gradInputs.forEach((input) => { if (input) input.addEventListener("input", updateGradientPreview); });
    [gradMode, gradType, gradAngle].forEach((input) => { if (input) input.addEventListener("input", updateGradientPreview); });

    const btnGrad = document.getElementById("btnApplyCustomGrad");
    if (btnGrad) btnGrad.addEventListener("click", () => applyGradient(currentGradient()));

    const btnSwap = document.getElementById("btnGradientSwap");
    if (btnSwap) btnSwap.addEventListener("click", () => {
      const values = currentGradient().colors.reverse();
      values.forEach((hex, idx) => { if (gradInputs[idx]) gradInputs[idx].value = hex; });
      updateGradientPreview();
    });

    const btnHarmony = document.getElementById("btnGradientHarmony");
    if (btnHarmony) btnHarmony.addEventListener("click", () => {
      const base = CompXColorUtils.hexToRgb(gradInputs[0].value);
      const hsl = CompXColorUtils.rgbToHsl(base.r, base.g, base.b);
      const offsets = currentGradient().mode === 4 ? [0, 35, 180, 225] : [0, 180];
      offsets.forEach((offset, idx) => { gradInputs[idx].value = hslToHex(hsl.h + offset, Math.max(45, hsl.s), Math.max(38, hsl.l)); });
      updateGradientPreview();
      showToast("Balanced color harmony generated.");
    });

    const btnSaveGradient = document.getElementById("btnSaveGradient");
    if (btnSaveGradient) btnSaveGradient.addEventListener("click", () => {
      const gradient = currentGradient();
      const items = getSavedGradients();
      const duplicate = items.some((item) => gradientKey(item) === gradientKey(gradient));
      if (duplicate) { showToast("This gradient is already saved.", true); return; }
      items.unshift(gradient);
      setSavedGradients(items);
      renderSavedGradients();
      showToast("Gradient variant saved.");
    });

    if (savedGradientGrid) {
      savedGradientGrid.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-gradient]");
        if (remove) {
          const items = getSavedGradients();
          items.splice(Number(remove.dataset.removeGradient), 1);
          setSavedGradients(items);
          renderSavedGradients();
          return;
        }
        const card = event.target.closest("[data-gradient-index]");
        if (card) loadGradient(getSavedGradients()[Number(card.dataset.gradientIndex)]);
      });
      savedGradientGrid.addEventListener("dblclick", (event) => {
        const card = event.target.closest("[data-gradient-index]");
        if (card) applyGradient(getSavedGradients()[Number(card.dataset.gradientIndex)]);
      });
    }

    const btnScanDuplicates = document.getElementById("btnScanColorDuplicates");
    if (btnScanDuplicates) btnScanDuplicates.addEventListener("click", () => {
      const savedColors = [];
      ["compXSwatches", "compXRecentColors"].forEach((key) => {
        try { (JSON.parse(localStorage.getItem(key)) || []).forEach((hex) => savedColors.push(String(hex).toUpperCase())); } catch (e) { auditFallback("MAIN_SCANDUPLICATES_001", e); }
      });
      try { (JSON.parse(localStorage.getItem("compXUserPalettes")) || []).forEach((palette) => (palette.colors || []).forEach((hex) => savedColors.push(String(hex).toUpperCase()))); } catch (e) { auditFallback("MAIN_SCANDUPLICATES_002", e); }
      const duplicateColors = savedColors.length - new Set(savedColors).size;
      const gradients = getSavedGradients();
      const duplicateGradients = gradients.length - new Set(gradients.map(gradientKey)).size;
      const audit = window.CompXColorLibraryAudit || {};
      const libraryRemoved = Number(audit.removedSolidDuplicates) || 0;
      if (duplicateStatus) duplicateStatus.textContent = (duplicateColors || duplicateGradients ? duplicateColors + " saved color duplicate(s), " + duplicateGradients + " saved gradient duplicate(s). " : "Your saved items are unique. ") + (libraryRemoved ? libraryRemoved + " built-in duplicate colors are automatically hidden." : "Built-in library is unique.");
      showToast(duplicateColors || duplicateGradients ? "Duplicate scan finished — review the result below." : "No saved duplicates found.");
    });

    updateGradientPreview();
    renderSavedGradients();
    // NOTE: A legacy tab-based color library (SOLID_LIBRARY / GRADIENT_LIBRARY /
    // GRADIENT_4_LIBRARY / #colorLibraryGrid) previously lived here. Its HTML
    // container was removed as dead markup; this JS half was orphaned (targeted
    // DOM ids no longer exist) and partially broken (GRADIENT_LIBRARY /
    // GRADIENT_4_LIBRARY were referenced but never defined anywhere). It has been
    // removed. The live color library is colorplate.js -> #cxColorPlate.

    // Expose a minimal hook so other color-producing modules (e.g. colorplate.js's
    // library swatches/gradients) can feed Recent Colors consistently, without
    // duplicating storage/normalization logic.
    window.CompXRecentColors = {
      add: function (hex) {
        addColorToStorage("compXRecentColors", hex, 12);
        refreshColorUI();
      }
    };

    refreshColorUI();
  }



  function readGradientTextColors() {
    var a = "#ff5ac8", b = "#5ad8ff";
    try {
      a = localStorage.getItem("compXGradText.a") || a;
      b = localStorage.getItem("compXGradText.b") || b;
    } catch (e) { auditFallback("MAIN_GRADTEXT_COLORS_001", e); }
    return [a, b];
  }

  // TEXT STYLE LIBRARY (Library tab)
  function wireTextAnimLibrary() {
    var searchEl = document.getElementById("tanimSearch");
    var categoryEl = document.getElementById("tanimCategory");
    var countEl = document.getElementById("tanimResultCount");
    var listEl = document.getElementById("tanimList");
    if (!listEl) return;

    // Built live by jsx/hostscript.jsx rather than loaded from a .ffx: each
    // one adds a per-character (or per-word) reveal AND a gradient fill that
    // rides on its own matte layer. `script` is what marks them.
    var GRADIENT_STYLES = [
      { id:"gradPop", name:"Gradient Pop", desc:"Letters pop in, gradient sweeping through", sample:"POP", anim:"pop", category:"Gradient", script:"gradPop" },
      { id:"gradSlideUp", name:"Gradient Slide Up", desc:"Words rise in one at a time under a moving gradient", sample:"UP", anim:"up", category:"Gradient", script:"gradSlideUp" },
      { id:"gradBlurIn", name:"Gradient Blur In", desc:"Characters resolve out of blur as the gradient travels", sample:"BLUR", anim:"blur", category:"Gradient", script:"gradBlurIn" },
      { id:"gradCascade", name:"Gradient Cascade", desc:"Characters cascade in, gradient running across them", sample:"CASCADE", anim:"down", category:"Gradient", script:"gradCascade" }
    ];

    // Bundled .ffx text-animation presets (files live in presets/text-animations/).
    // `anim` drives the looping visual preview shown on each card.
    var TEXT_STYLES = [
      { id:"alphabetBlink", name:"Alphabet Blink", desc:"Letter-by-letter blink-on reveal", sample:"BLINK", anim:"blink", file:"Alphabet Blink.ffx" },
      { id:"blurUp", name:"Blur Up", desc:"Soft blur rises up into focus", sample:"BLUR", anim:"blur", file:"Blur Up.ffx" },
      { id:"bounceSlideDown", name:"Bounce Slide Down", desc:"Word bounces in sliding downward", sample:"DOWN", anim:"down", file:"Bounce Slide Down Word.ffx" },
      { id:"bounceSlideLeft", name:"Bounce Slide Left", desc:"Word bounces in from the right", sample:"LEFT", anim:"left", file:"Bounce Slide Left Word.ffx" },
      { id:"bounceSlideRight", name:"Bounce Slide Right", desc:"Word bounces in from the left", sample:"RIGHT", anim:"right", file:"Bounce Slide Right Word.ffx" },
      { id:"bounceSlideUp", name:"Bounce Slide Up", desc:"Word bounces in sliding upward", sample:"UP", anim:"up", file:"Bounce Slide Up Word.ffx" },
      { id:"characterDown", name:"Character Down", desc:"Characters drop in one by one", sample:"CHAR", anim:"down", file:"Character Down.ffx" },
      { id:"characterRight", name:"Character Right", desc:"Characters slide in from the left", sample:"CHAR", anim:"right", file:"Character Right.ffx" },
      { id:"eduBounce", name:"Bounce Text", desc:"Playful springy bounce reveal", sample:"BOUNCE", anim:"bounce", file:"EduPohren - Bounce Text.ffx" },
      { id:"fadeUpOut", name:"Fade Up And Out", desc:"Smooth fade up then fade out", sample:"FADE", anim:"fade", file:"Fade Up And Out Smooth.ffx" },
      { id:"letterFlicker", name:"Letter Flicker", desc:"Nervous per-letter flicker-on", sample:"FLICK", anim:"blink", file:"Letter Flicker Text Animation.ffx" },
      { id:"miMainText", name:"Main Text", desc:"Clean punchy main-title pop", sample:"MAIN", anim:"pop", file:"mi main text.ffx" },
      { id:"oneByOne", name:"One By One", desc:"Characters pop in one by one", sample:"1BY1", anim:"pop", file:"OneByOne Text.ffx" },
      { id:"opacityFade", name:"Opacity Fade", desc:"Simple clean opacity fade-in", sample:"FADE", anim:"fade", file:"Opacity Fade.ffx" },
      { id:"smoothFade", name:"Smooth Fade In/Out", desc:"Gentle fade in and out", sample:"SMOOTH", anim:"fade", file:"Smooth Fade In And Out.ffx" },
      { id:"wordByWordAnim", name:"Word By Word", desc:"Reveals one word at a time", sample:"WORDS", anim:"pop", file:"text animation word by word.ffx" },
      { id:"textBounceDown", name:"Text Bounce Down", desc:"Bouncy drop-in from above", sample:"DOWN", anim:"down", file:"Text Bounce down.ffx" },
      { id:"textBounceUp", name:"Text Bounce Up", desc:"Bouncy rise-in from below", sample:"UP", anim:"up", file:"text Bounce up.ffx" },
      { id:"textBounce", name:"Text Bounce", desc:"Elastic scale bounce reveal", sample:"BOUNCE", anim:"bounce", file:"Text Bounce.ffx" },
      { id:"textFlicker", name:"Text Flicker", desc:"Stylized flicker-on entrance", sample:"FLICK", anim:"blink", file:"Text Flicker.ffx" },
      { id:"textSlideUp", name:"Text Slide Up", desc:"Word slides up into place", sample:"SLIDE", anim:"up", file:"Text Slide Up Word.ffx" },
      { id:"textStyle1", name:"Text Style 1", desc:"Preset style one entrance", sample:"STYLE1", anim:"pop", file:"Text Style 1.ffx" },
      { id:"textStyle2", name:"Text Style 2", desc:"Preset style two entrance", sample:"STYLE2", anim:"bounce", file:"Text Style 2.ffx" },
      { id:"textStyle3", name:"Text Style 3", desc:"Preset style three entrance", sample:"STYLE3", anim:"up", file:"Text Style 3.ffx" },
      { id:"textStyle4", name:"Text Style 4", desc:"Preset style four entrance", sample:"STYLE4", anim:"fade", file:"Text Style 4.ffx" },
      { id:"viralText", name:"Viral Text", desc:"Bold social-ready viral pop", sample:"VIRAL", anim:"pop", file:"VIRAL TEXT ANIMATION.ffx" },
      { id:"wordBlink", name:"Word Blink", desc:"Whole word blinks on", sample:"WORD", anim:"blink", file:"Word Blink.ffx" },
      { id:"wordByWordDown", name:"Word By Word Down", desc:"Each word drops in downward", sample:"DOWN", anim:"down", file:"Word By Word Down.ffx" },
      { id:"wordByWordLeft", name:"Word By Word Left", desc:"Each word slides in from right", sample:"LEFT", anim:"left", file:"Word By Word Left.ffx" },
      { id:"wordByWordRight", name:"Word By Word Right", desc:"Each word slides in from left", sample:"RIGHT", anim:"right", file:"Word By Word Right.ffx" },
      { id:"wordByWordUp", name:"Word By Word Up", desc:"Each word rises in upward", sample:"UP", anim:"up", file:"Word By Word Up.ffx" },
      { id:"wordDown", name:"Word Down", desc:"Word drops in from above", sample:"DOWN", anim:"down", file:"Word Down.ffx" },
      { id:"wordRampBlur", name:"Word Ramp + Blur", desc:"Word ramps up with blur", sample:"RAMP", anim:"blur", file:"word ramp up + blur (1).ffx" },
      { id:"wordRight", name:"Word Right", desc:"Word slides in from the left", sample:"RIGHT", anim:"right", file:"Word Right.ffx" },
      { id:"erfanOpacityFlicker", name:"Opacity Flicker", desc:"Erfan flicker-based text reveal", sample:"FLICK", anim:"blink", file:"Opacity Flicker.ffx" },
      { id:"erfanOpacityPosition", name:"Opacity Position", desc:"Opacity and position entrance", sample:"MOVE", anim:"up", file:"Opacity Postion.ffx" },
      { id:"erfanPositionWiggle", name:"Position Wiggle", desc:"Energetic position wiggle", sample:"WIGGLE", anim:"bounce", file:"Postion Wiggle.ffx" },
      { id:"erfanText3", name:"Erfan Text 3", desc:"Erfan animated text style 3", sample:"TEXT3", anim:"up", file:"Text Animation 3.ffx" },
      { id:"erfanText4", name:"Erfan Text 4", desc:"Erfan animated text style 4", sample:"TEXT4", anim:"bounce", file:"Text Animation 4.ffx" },
      { id:"erfanText6", name:"Erfan Text 6", desc:"Erfan animated text style 6", sample:"TEXT6", anim:"right", file:"Text Animation 6.ffx" },
      { id:"erfanText7", name:"Erfan Text 7", desc:"Erfan animated text style 7", sample:"TEXT7", anim:"bounce", file:"Text Animation 7.ffx" },
      { id:"erfanText8", name:"Erfan Text 8", desc:"Erfan animated text style 8", sample:"TEXT8", anim:"pop", file:"Text Animation 8.ffx" },
      { id:"erfanText9", name:"Erfan Text 9", desc:"Erfan animated text style 9", sample:"TEXT9", anim:"left", file:"Text Animation 9.ffx" },
      { id:"erfanText1", name:"Erfan Text 1", desc:"Erfan animated text style 1", sample:"TEXT1", anim:"up", file:"Text Animation_1.ffx" },
      { id:"erfanText2", name:"Erfan Text 2", desc:"Erfan animated text style 2", sample:"TEXT2", anim:"down", file:"Text Animation_2.ffx" },
      { id:"erfanTextEvo", name:"TextEvo", desc:"Evolving high-energy text animation", sample:"EVO", anim:"pop", file:"TextEvo.ffx" },
      { id:"voxAppearRandom", name:"VOX Appear Random", desc:"Randomized text appearance", sample:"RANDOM", anim:"blink", file:"AppearRandom.ffx" },
      { id:"voxFillAnimation", name:"VOX Fill Animation", desc:"Animated fill treatment", sample:"FILL", anim:"rainbow", file:"FillAnimation.ffx" },
      { id:"voxFlickerGlow", name:"VOX Flicker + Glow", desc:"Flickering luminous text reveal", sample:"GLOW", anim:"blink", file:"Flicker and Glow.ffx" },
      { id:"voxLoadUp", name:"VOX Load Up", desc:"Loading-style upward reveal", sample:"LOAD", anim:"up", file:"LoadUp.ffx" },
      { id:"voxTextJitter", name:"VOX Text Jitter", desc:"Fast jittering text motion", sample:"JITTER", anim:"bounce", file:"Text Jitter.ffx" }
    ];

    TEXT_STYLES.forEach(function(style) { style.category = style.category || "Premium"; });
    function packCategory(fileName) {
      var prefix = String(fileName || "").replace(/\.ffx$/i, "").split("_IN OUT_")[0];
      return prefix.replace(/\bIines\b/gi, "Lines").replace(/\s+/g, " ").trim() || "Text Animation Pack";
    }
    function packPreview(category) {
      var value = String(category || "").toLowerCase();
      if (value.indexOf("blur") >= 0) return "blur";
      if (value.indexOf("wiggly") >= 0) return "bounce";
      if (value.indexOf("color") >= 0) return "rainbow";
      if (value.indexOf("code") >= 0) return "blink";
      if (value.indexOf("scale") >= 0) return "pop";
      if (value.indexOf("right to left") >= 0) return "left";
      if (value.indexOf("rotation") >= 0) return "bounce";
      return "up";
    }
    if (nodeAvailable) {
      try {
        var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        var packRoot = path.join(extensionRoot, "presets", "text-animation-pack");
        if (fs.existsSync(packRoot)) {
          fs.readdirSync(packRoot).filter(function(fileName) { return /\.ffx$/i.test(fileName); }).sort().forEach(function(fileName, index) {
            var category = packCategory(fileName);
            var displayName = fileName.replace(/\.ffx$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
            TEXT_STYLES.push({ id:"textPack" + index, name:displayName, desc:category + " · IN + OUT preset", sample:category.split(" ")[0].toUpperCase(), anim:packPreview(category), file:"pack:" + fileName, category:category });
          });
        }
      } catch (packError) { auditFallback("MAIN_TEXT_PACK_SCAN_001", packError); }
    }

    // A preset can be listed manually and also discovered in a bundled pack.
    // Keep the first canonical file reference so the UI never shows duplicate
    // animation cards or fires two visually identical choices.
    // The script-built gradient styles lead the catalogue: they are the ones
    // this build adds, and they are what the GRADIENT category filters to.
    TEXT_STYLES = GRADIENT_STYLES.concat(TEXT_STYLES);

    var seenTextPresetFiles = {};
    TEXT_STYLES = TEXT_STYLES.filter(function(style) {
      var fileKey = String(style.file || style.script || style.id || "").replace(/\\/g, "/").toLowerCase();
      if (seenTextPresetFiles[fileKey]) return false;
      seenTextPresetFiles[fileKey] = true;
      return true;
    });

    if (categoryEl) {
      var categories = {};
      TEXT_STYLES.forEach(function(style) { categories[style.category || "Premium"] = true; });
      Object.keys(categories).sort().forEach(function(category) {
        var option = document.createElement("option"); option.value = category; option.textContent = category; categoryEl.appendChild(option);
      });
    }

    function esc(str) {
      return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
    }

    function previewChars(sample) {
      return String(sample || "TEXT").slice(0, 7).split("").map(function(ch) {
        return '<span class="tanim-pchar">' + esc(ch) + '</span>';
      }).join('');
    }

    function previewCard(style) {
      return '<div class="tanim-card-preview tanim-fx-' + (style.anim || 'pop') + '">' +
        '<div class="tanim-card-badge">TEXT</div>' +
        '<div class="tanim-card-stage">' +
          '<div class="tanim-card-word">' + previewChars(style.sample || style.name) + '</div>' +
          '<div class="tanim-card-glow"></div>' +
        '</div>' +
      '</div>';
    }

    function render() {
      var q = searchEl ? String(searchEl.value || "").trim().toLowerCase() : "";
      var selectedCategory = categoryEl ? categoryEl.value : "all";
      var items = TEXT_STYLES.filter(function(t) {
        var categoryMatch = selectedCategory === "all" || t.category === selectedCategory;
        return categoryMatch && (!q || t.name.toLowerCase().indexOf(q) !== -1 || t.desc.toLowerCase().indexOf(q) !== -1 || String(t.category || "").toLowerCase().indexOf(q) !== -1);
      });
      if (countEl) countEl.textContent = items.length + " of " + TEXT_STYLES.length + " After Effects text presets";
      if (!items.length) {
        listEl.innerHTML = '<div class="studio-empty" style="grid-column:1/-1;">No text styles found.</div>';
        return;
      }
      listEl.innerHTML = items.map(function(t) {
        return '<div class="tanim-card' + (t.script ? ' is-gradient' : '') + '" data-tanim="' + t.id + '" data-file="' + esc(t.file) + '" data-script="' + esc(t.script) + '">' +
          previewCard(t) +
          '<div class="tanim-card-meta">' +
            '<div class="tanim-card-title" title="' + esc(t.name) + '">' + esc(t.name) + '</div>' +
            '<div class="tanim-card-sub">' + esc(t.desc) + '</div>' +
          '</div>' +
          '<div class="tanim-card-actions">' +
            '<button class="tanim-card-btn" data-action="apply">Apply</button>' +
          '</div>' +
        '</div>';
      }).join('');

      listEl.querySelectorAll('[data-tanim]').forEach(function(card) {
        card.addEventListener('click', function(ev) {
          var btn = ev.target.closest('button');
          var action = btn ? btn.getAttribute('data-action') : 'apply';
          if (action !== 'apply' && action !== null) return;
          var styleName = card.querySelector('.tanim-card-title').textContent;
          if (card.dataset.script) {
            // Gradient styles take the two colours from the Colors tab's last
            // pair when there is one, so the look matches the rest of the job.
            var pair = readGradientTextColors();
            runTool('ae_gradTextStyle(' + jsStr(card.dataset.script) + ',' + jsStr(pair[0]) + ',' + jsStr(pair[1]) + ',20)', styleName + ' applied');
            return;
          }
          runTool('ae_applyTextAnimPreset(' + jsStr(card.dataset.file) + ')', styleName + ' applied');
        });
      });
    }

    var gradClean = document.getElementById('btnTanimGradClean');
    if (gradClean) gradClean.addEventListener('click', function () {
      runTool('ae_gradTextClean()', 'Gradient layers removed');
    });

    if (searchEl) searchEl.addEventListener('input', render);
    if (categoryEl) categoryEl.addEventListener('change', render);
    render();
  }


  // Audio-beat tools remain independent of the removed Library Shake section.
  var beatAudioPath = "";

  function resolveBeatFfmpeg(callback) {
    if (!nodeAvailable) { callback(new Error("Node integration is unavailable in this panel.")); return; }
    try {
      var manifestPath = path.join(csInterface.getSystemPath(SystemPath.EXTENSION), "scripts", "autocaptions-runtime.json");
      var spec = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      var local = nodeProcess.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      var root = path.join(local, "CompXOrbit", "AutoCaptions");
      var record = {};
      try { record = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")); } catch (readErr) { auditFallback("MAIN_BEAT_FFMPEG_RECORD_001", readErr); }
      if (record.ffmpegSha256 === spec.ffmpeg.sha256 && record.ffmpegExe) {
        var resolvedRoot = path.resolve(root) + path.sep;
        var ffmpegPath = path.resolve(root, record.ffmpegExe);
        if (ffmpegPath.toLowerCase().indexOf(resolvedRoot.toLowerCase()) === 0 && fs.existsSync(ffmpegPath)) {
          callback(null, ffmpegPath);
          return;
        }
      }
    } catch (specErr) { auditFallback("MAIN_BEAT_FFMPEG_SPEC_001", specErr); }
    child_process.execFile("where", ["ffmpeg"], { windowsHide: true }, function (err, stdout) {
      if (!err && stdout) {
        var candidate = String(stdout).split(/\r?\n/).filter(Boolean)[0];
        if (candidate && fs.existsSync(candidate)) { callback(null, candidate); return; }
      }
      callback(new Error("FFmpeg not found. Install AutoCaptions runtime once, or add ffmpeg to PATH."));
    });
  }

  function extractAudioBeats(filePath, ffmpegPath, sensitivity, minSpacing, callback) {
    try {
      var args = ["-i", filePath, "-f", "s16le", "-ac", "1", "-ar", "100", "-"];
      var proc = child_process.spawn(ffmpegPath, args, { windowsHide: true });
      var buffers = [];
      proc.stdout.on("data", function (chunk) { buffers.push(chunk); });
      proc.on("close", function (code) {
        if (code !== 0 && code !== null) { callback(new Error("FFmpeg exited with code " + code)); return; }
        try {
          var totalBuffer = Buffer.concat(buffers);
          var sampleCount = totalBuffer.length / 2;
          var sampleRate = 100;
          var timestamps = [];
          var absSamples = new Float32Array(sampleCount);
          for (var i = 0; i < sampleCount; i++) absSamples[i] = Math.abs(totalBuffer.readInt16LE(i * 2));
          var winSize = 250;
          var thresholdMultiplier = 1.0 + (sensitivity / 100.0) * 1.5;
          var lastBeatTime = -minSpacing;
          for (var s = 0; s < sampleCount; s++) {
            var start = Math.max(0, s - winSize / 2);
            var end = Math.min(sampleCount - 1, s + winSize / 2);
            var sum = 0;
            for (var j = start; j <= end; j++) sum += absSamples[j];
            var avg = sum / (end - start + 1);
            if (absSamples[s] > avg * thresholdMultiplier && absSamples[s] > 1000) {
              var isLocalMax = true;
              for (var k = Math.max(0, s - 5); k <= Math.min(sampleCount - 1, s + 5); k++) {
                if (absSamples[k] > absSamples[s]) { isLocalMax = false; break; }
              }
              if (isLocalMax) {
                var time = s / sampleRate;
                if (time - lastBeatTime >= minSpacing) { timestamps.push(time); lastBeatTime = time; }
              }
            }
          }
          callback(null, timestamps);
        } catch (analysisError) { callback(analysisError); }
      });
      proc.on("error", function (spawnError) { callback(spawnError); });
    } catch (outerError) { callback(outerError); }
  }

  function setBeatStatus(message, isError) {
    var status = document.getElementById("beatSyncStatus");
    if (status) {
      status.textContent = message || "";
      status.style.color = isError ? "var(--danger)" : "";
    }
  }

  function setBeatSourceName(filePath) {
    var label = document.getElementById("beatActiveSourceName");
    if (!label) return;
    if (!filePath) { label.textContent = "No audio selected"; return; }
    label.textContent = String(filePath).replace(/\\/g, "/").split("/").pop();
  }

  function wireAudioBeats() {
    var modal = document.getElementById("beatSyncModal");
    var closeBtn = document.getElementById("btnBeatSyncClose");
    var detectBtn = document.getElementById("btnBeatDetect");
    var chooseBtn = document.getElementById("btnBeatChoose");
    var generateBtn = document.getElementById("btnGenerateBeatMarkers");
    var sensitivity = document.getElementById("beatSensitivityVal");
    var sensitivityTxt = document.getElementById("beatSensitivityTxt");
    var spacing = document.getElementById("beatSpacingVal");
    var fileInput = document.getElementById("beatAudioInput");
    var openButtons = [document.getElementById("btnOpenBeatSync"), document.getElementById("btnStudioOpenBeats")].filter(Boolean);

    function openBeatModal() {
      if (!modal) return;
      modal.style.display = "flex";
      detectSelectedAudioForBeats(false);
    }
    function closeBeatModal() { if (modal) modal.style.display = "none"; }

    openButtons.forEach(function (button) { button.addEventListener("click", openBeatModal); });
    if (closeBtn) closeBtn.addEventListener("click", closeBeatModal);
    if (modal) modal.addEventListener("mousedown", function (event) { if (event.target === modal) closeBeatModal(); });

    if (sensitivity && sensitivityTxt) {
      sensitivity.addEventListener("input", function (event) {
        sensitivityTxt.textContent = "Threshold (sensitivity): " + event.target.value + "%";
      });
    }

    function detectSelectedAudioForBeats(manual) {
      callHostRaw("ae_getSelectedAudioPath()", function (raw) {
        raw = String(raw || "");
        if (raw && raw.indexOf("ERR:") !== 0) {
          beatAudioPath = raw;
          setBeatSourceName(beatAudioPath);
          setBeatStatus("Detected audio from the selected layer.", false);
          if (manual) showToast("Audio source detected");
        } else if (manual) {
          var errMsg = raw.indexOf("ERR:") === 0 ? raw.substring(4) : "Could not detect audio from the current selection.";
          setBeatStatus(errMsg, true);
          showToast(errMsg, true);
        }
      });
    }

    if (detectBtn) detectBtn.addEventListener("click", function () { detectSelectedAudioForBeats(true); });

    if (chooseBtn) {
      chooseBtn.addEventListener("click", function () {
        if (window.cep && window.cep.fs) {
          var result = window.cep.fs.showOpenDialog(false, false, "Select audio or video file", null, ["wav", "mp3", "m4a", "aac", "mp4", "mov", "avi", "webm", "mkv"]);
          if (result.err === 0 && result.data && result.data.length) {
            beatAudioPath = result.data[0];
            if (beatAudioPath.indexOf("file://") === 0) beatAudioPath = decodeURIComponent(beatAudioPath.replace(/^file:\/\//, "").replace(/^\/([A-Za-z]:)/, "$1"));
            setBeatSourceName(beatAudioPath);
            setBeatStatus("Local file ready for beat analysis.", false);
          }
          return;
        }
        if (fileInput) fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        beatAudioPath = file.path || file.name;
        setBeatSourceName(beatAudioPath);
        setBeatStatus("Local file ready for beat analysis.", false);
        fileInput.value = "";
      });
    }

    if (generateBtn) {
      generateBtn.addEventListener("click", function () {
        if (!beatAudioPath) {
          setBeatStatus("Select audio in the timeline or choose a local file first.", true);
          showToast("No audio selected", true);
          return;
        }
        var sensitivityVal = sensitivity ? parseInt(sensitivity.value, 10) || 15 : 15;
        var spacingVal = spacing ? parseFloat(spacing.value) || 0.2 : 0.2;
        var originalText = generateBtn.textContent;
        generateBtn.textContent = "Analyzing audio…";
        generateBtn.disabled = true;
        resolveBeatFfmpeg(function (ffmpegErr, ffmpegPath) {
          if (ffmpegErr || !ffmpegPath) {
            generateBtn.textContent = originalText;
            generateBtn.disabled = false;
            setBeatStatus(ffmpegErr ? ffmpegErr.message : "FFmpeg not found.", true);
            showToast(ffmpegErr ? ffmpegErr.message : "FFmpeg not found", true);
            return;
          }
          extractAudioBeats(beatAudioPath, ffmpegPath, sensitivityVal, spacingVal, function (analysisErr, timestamps) {
            generateBtn.textContent = originalText;
            generateBtn.disabled = false;
            if (analysisErr) {
              setBeatStatus("Beat analysis failed: " + analysisErr.message, true);
              showToast("Beat analysis failed", true);
              return;
            }
            if (!timestamps.length) {
              setBeatStatus("No beats detected. Try increasing sensitivity.", true);
              showToast("No beats detected", true);
              return;
            }
            var markerTarget = document.getElementById("beatMarkerTarget");
            var targetFn = (markerTarget && markerTarget.value === "layer") ? "ae_addLayerBeatMarkers" : "ae_addCompBeatMarkers";
            runTool(targetFn + "(" + hostArg(JSON.stringify(timestamps)) + ")", timestamps.length + " beat markers added", function (parsed) {
              if (parsed.success) {
                setBeatStatus(parsed.message || (timestamps.length + " beat markers added."), false);
                closeBeatModal();
              }
            });
          });
        });
      });
    }
  }

  function wireLayerFactory() {
    const modal = document.getElementById("layerFactoryModal");
    const toolkitSection = document.getElementById("toolkitLayerFactorySection");
    if (!modal || !toolkitSection) return;
    const factoryBody = modal.querySelector(".cx-layer-factory-body");
    const factoryFooter = modal.querySelector(".modal-footer");
    const cancelButton = document.getElementById("btnLayerFactoryCancel");
    const generateButton = document.getElementById("btnLayerFactoryGenerate");
    const typeEl = document.getElementById("layerFactoryType");
    const countEl = document.getElementById("layerFactoryCount");
    const presets = document.getElementById("layerFactoryPresets");
    const status = document.getElementById("layerFactoryStatus");
    const solidRow = document.getElementById("layerFactorySolidRow");
    const make3DEl = document.getElementById("layerFactory3D");
    if (factoryBody) toolkitSection.appendChild(factoryBody);
    if (factoryFooter) toolkitSection.appendChild(factoryFooter);
    if (cancelButton) cancelButton.hidden = true;
    if (modal.parentNode) modal.parentNode.removeChild(modal);
    toolkitSection.classList.add("cx-layer-factory-inline");
    status.textContent = "Select source layer(s) optionally, configure, then generate.";
    function refreshType() {
      const type = typeEl.value;
      solidRow.hidden = type !== "solid";
      const supports3D = type !== "camera" && type !== "light";
      make3DEl.disabled = !supports3D;
      if (!supports3D) make3DEl.checked = false;
    }
    function refreshPreset() {
      const count = Math.max(1, Math.min(100, Number(countEl.value) || 1));
      presets.querySelectorAll("[data-layer-count]").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.layerCount) === count);
      });
    }
    function config() {
      return {
        type: typeEl.value,
        count: Math.max(1, Math.min(100, Number(countEl.value) || 1)),
        namePattern: document.getElementById("layerFactoryName").value || "{type} {n}",
        parentMode: document.getElementById("layerFactoryParent").value,
        label: Number(document.getElementById("layerFactoryLabel").value),
        solidColor: document.getElementById("layerFactorySolidColor").value,
        matchTiming: document.getElementById("layerFactoryMatch").checked,
        make3D: make3DEl.checked,
        lock: document.getElementById("layerFactoryLock").checked,
        shy: document.getElementById("layerFactoryShy").checked,
        applyLabelToSource: document.getElementById("layerFactoryApplyLabel").checked,
        preserveParents: document.getElementById("layerFactoryPreserveParents").checked,
      };
    }

    typeEl.addEventListener("change", refreshType);
    countEl.addEventListener("input", refreshPreset);
    presets.addEventListener("click", (event) => {
      const button = event.target.closest("[data-layer-count]");
      if (!button) return;
      countEl.value = button.dataset.layerCount;
      refreshPreset();
    });
    generateButton.addEventListener("click", () => {
      const payload = config();
      countEl.value = payload.count;
      generateButton.disabled = true;
      generateButton.textContent = "GENERATING...";
      status.textContent = "Creating layers in After Effects...";
      runTool("ae_generateLayers(" + hostArg(JSON.stringify(payload)) + ")", "Layers generated", (result) => {
        generateButton.disabled = false;
        generateButton.textContent = "Generate Layers";
        status.textContent = result.message || (result.success ? "Layers generated." : "Layer generation failed.");
      });
    });
    refreshType();
    refreshPreset();
  }

  function wireTrackerWorkspace() {
    const key='compXTrackerWorkspace'; const todoEl=document.getElementById('trackerTodoList'); const input=document.getElementById('trackerTodoInput'); const notes=document.getElementById('trackerNotes'); const count=document.getElementById('trackerNoteCount');
    let state={todos:[], notes:''}; try { state=Object.assign(state, JSON.parse(localStorage.getItem(key)||'{}')); } catch (e) { auditFallback("MAIN_WIRETRACKERWORKSPACE_001", e); }
    const save=()=>localStorage.setItem(key, JSON.stringify(state));
    const words=(text)=>String(text||'').trim().match(/\S+/g)?.length||0;
    function render(){ if(todoEl) todoEl.innerHTML=state.todos.length?state.todos.map((t,i)=>'<label class="tracker-todo '+(t.done?'done':'')+'"><input type="checkbox" data-todo="'+i+'" '+(t.done?'checked':'')+'/><span>'+escapeHtml(t.text)+'</span><button data-delete="'+i+'" title="Delete">×</button></label>').join(''):'<div class="studio-empty">No tasks yet — add your next step.</div>'; if(notes)notes.value=state.notes; if(count)count.textContent=words(state.notes)+' / 500 words'; }
    function add(){const text=(input?.value||'').trim(); if(!text)return; state.todos.push({text:text.slice(0,160),done:false}); input.value='';save();render();}
    document.getElementById('btnTrackerTodoAdd')?.addEventListener('click',add); input?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();add();}});
    todoEl?.addEventListener('change',(e)=>{const i=Number(e.target.dataset.todo);if(state.todos[i]){state.todos[i].done=e.target.checked;save();render();}}); todoEl?.addEventListener('click',(e)=>{const i=e.target.dataset.delete;if(i!==undefined){state.todos.splice(Number(i),1);save();render();}});
    notes?.addEventListener('input',()=>{let tokens=String(notes.value||'').match(/\S+\s*/g)||[]; if(tokens.length>500) notes.value=tokens.slice(0,500).join('').trimEnd(); state.notes=notes.value;save();if(count)count.textContent=words(state.notes)+' / 500 words';}); render();
  }

  // ---------------- Init ----------------

  function safeInit(label, fn) {
    try { fn(); }
    catch (e) { try { console.error("CompX init failed [" + label + "]", e); } catch (ignore) { auditFallback("MAIN_SAFEINIT_001", ignore); } }
  }

  safeInit("app tabs", wireAppTabs);
  safeInit("tool subtabs", wireToolSubtabs);
  safeInit("align mode toggle", wireAlignModeToggle);
  safeInit("smart grid", wireSmartGrid);
  safeInit("round pro", wireRoundPro);
  safeInit("caption studio shell", wireCaptionStudioShell);
  safeInit("tool buttons", wireToolButtons);
  safeInit("native aex plugins", wireNativeAexPlugins);
  safeInit("plugin settings modal", wirePluginSettingsModal);
  safeInit("property clipboard", wirePropertyClipboard);
  safeInit("layer factory", wireLayerFactory);
  function wireStudioOrgKit() {
    // Quicknav jump buttons (Studio tab) — scroll the target section into view.
    const nav = document.getElementById("cxStudioQuickNav");
    if (nav) {
      nav.addEventListener("click", (e) => {
        const b = e.target.closest("[data-studio-jump]");
        if (!b) return;
        const target = document.getElementById(b.dataset.studioJump);
        if (!target) return;
        try { target.scrollIntoView({ behavior: "smooth", block: "start" }); }
        catch (err) { try { target.scrollIntoView(); } catch (err2) { auditFallback("MAIN_STUDIOJUMP_001", err2); } }
      });
    }

  }

  safeInit("studio org kit", wireStudioOrgKit);

  safeInit("colors", wireColorPanel);
  safeInit("tools host", detectHostForTools);
  safeInit("library host", detectHost);
  safeInit("tracker", startTracker);

  safeInit("text styles", wireTextAnimLibrary);
  safeInit("audio beats", wireAudioBeats);
  safeInit("ffx", wireFfxPresets);
  safeInit("local transcription engine", wireFlexCaptions);
  safeInit("simple SRT captions", wireSimpleSrtCaptions);
  safeInit("pro panel", wireProPanel);
  safeInit("toolkit production utilities", wireToolkitProductionUtilities);
  safeInit("todo and notes", wireTrackerWorkspace);
  safeInit("shape toolkit", wireShapeToolkit);
  safeInit("shape controls", wireShapeControls);
  safeInit("studio host", detectHostForStudio);

  safeInit("initial library render", render);
  safeInit("diagnostic summary", renderDiagnosticSummary);
  safeInit("MOGRT cache info", () => { refreshMogrtCacheInfo(); });
  safeInit("IndexedDB library", () => { initializeIndexedDbLibrary(); });
  safeInit("restore library shelf", () => {
    let shelf = "textanim";
    try { shelf = localStorage.getItem("compXLibraryShelf") || "textanim"; } catch (e) { auditFallback("MAIN_SAFEINIT_002", e); }
    // Sounds and MOGRTs both have rail tabs of their own now, so anything the
    // shelf row no longer carries falls back to the first shelf it does.
    if (shelf !== "textanim" && shelf !== "motions" && shelf !== "ffx") shelf = "textanim";
    const button = document.querySelector('#assetTypeRow [data-type="' + shelf + '"]');
    if (button) button.click();
  });

  })();
