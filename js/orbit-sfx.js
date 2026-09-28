/* ============================================================
   ORBIT SFX — Sound Designer workspace (SFX rail tab)

   Its own library, separate from the Library tab: you point it at
   folders, it indexes the audio in them, and everything after that
   happens here — search, audition, trim, and insert.

   Three things are worth knowing before reading on.

   1. Nothing is decoded until it has to be. Indexing only walks the
      directory tree and reads a 4KB header, so a folder of 5,000
      files lands in well under a second. A WAV header gives exact
      duration, channels and sample rate for free, which is what
      fills the duration column and drives the One shots / Ambience
      split. Formats without a readable header show "—:—" until the
      file is actually auditioned, which is also when its row
      waveform appears.

   2. What you hear is what gets inserted. Preview and insert both
      run through renderSegment(), so reverse, gain, pitch and speed
      are applied once, cached, and used for both. There is no
      second code path that could drift.

   3. Pitch holds the length. It is a resample to the new pitch
      followed by an overlap-add stretch back to the original
      duration — the honest way round, not a playbackRate change
      dressed up as pitch. Speed is the tape-style control where
      pitch follows, and is labelled that way.

   Host side:
     ae_sfxPlace(filePath, target, layerName, organise)

   Loads before main.js (compx-loader injects main.js only after the
   licence check), so the host bridge is looked up at click time.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXSfx.";
  var AUDIO_EXT = [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".ogg", ".flac", ".aac"];
  var MAX_FILES = 20000;      // a runaway folder tree should not hang the panel
  var MAX_DEPTH = 8;
  var PEAK_FILE_CAP = 25 * 1024 * 1024;  // no row thumbnail for files bigger than this
  var PEAK_CACHE_CAP = 400;
  var ONESHOT_MAX = 2;        // seconds; the One shots / Ambience line
  var ZOOMS = [1, 2, 4, 8, 16];
  var CLOUD = "@freesound";   // activeFolder value for the Freesound source
  var FS_SEARCH = "https://freesound.org/apiv2/search/text/";
  var FS_FIELDS = "id,name,duration,previews,license,username,filesize,type,samplerate,channels,tags,url";
  var FS_PAGE = 30;
  var FS_MAX_BYTES = 40 * 1024 * 1024;
  var LABELS = [
    { name: "Red", c: "#ff5f6d" }, { name: "Orange", c: "#ffa94d" },
    { name: "Yellow", c: "#ffe066" }, { name: "Green", c: "#3cff5f" },
    { name: "Blue", c: "#4dabf7" }, { name: "Purple", c: "#b197fc" }
  ];

  var fsMod = null, pathMod = null, osMod = null;
  try {
    if (typeof require !== "undefined") {
      fsMod = require("fs"); pathMod = require("path"); osMod = require("os");
    } else if (typeof window.require !== "undefined") {
      fsMod = window.require("fs"); pathMod = window.require("path"); osMod = window.require("os");
    }
  } catch (e) { fsMod = null; }

  // ---------- small helpers ----------
  function read(key, fallback) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(STORE + key, String(value)); } catch (e) { /* sandboxed storage */ }
  }

  function readJson(key, fallback) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) { /* quota or sandbox */ }
  }

  function baseName(p) {
    var s = String(p || "").replace(/[\\/]+$/, "");
    var i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    return i < 0 ? s : s.slice(i + 1);
  }

  function extOf(name) {
    var i = String(name).lastIndexOf(".");
    return i < 0 ? "" : String(name).slice(i).toLowerCase();
  }

  function stripExt(name) {
    var i = String(name).lastIndexOf(".");
    return i <= 0 ? String(name) : String(name).slice(0, i);
  }

  // 0:1.10 — minutes, then seconds to two places, which is how the
  // durations read in the source panel this was modelled on.
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "—:—";
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  }

  function fmtSize(bytes) {
    if (!isFinite(bytes)) return "—";
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  }

  function tagsOf(name) {
    var parts = stripExt(name).split(/[\s_\-.,()\[\]]+/);
    var out = [], seen = {}, i, t;
    for (i = 0; i < parts.length; i++) {
      t = parts[i].toLowerCase();
      if (!t || t.length < 2 || seen[t]) continue;
      seen[t] = 1;
      out.push(t);
      if (out.length >= 6) break;
    }
    return out;
  }

  // ---------- WAV header ----------
  // 4KB off the front is enough for every real-world WAV: it carries the
  // fmt chunk, and the data chunk header that gives the length. No decode,
  // no full read, so this stays cheap across thousands of files.
  function wavHeader(file) {
    if (!fsMod) return null;
    var fd = null;
    try {
      fd = fsMod.openSync(file, "r");
      var buf = Buffer.alloc ? Buffer.alloc(4096) : new Buffer(4096);
      var got = fsMod.readSync(fd, buf, 0, 4096, 0);
      fsMod.closeSync(fd); fd = null;
      if (got < 44) return null;
      if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;

      var pos = 12, fmt = null, dataSize = -1;
      while (pos + 8 <= got) {
        var id = buf.toString("ascii", pos, pos + 4);
        var size = buf.readUInt32LE(pos + 4);
        if (id === "fmt " && pos + 8 + 16 <= got) {
          fmt = {
            channels: buf.readUInt16LE(pos + 10),
            sampleRate: buf.readUInt32LE(pos + 12),
            byteRate: buf.readUInt32LE(pos + 16),
            bits: buf.readUInt16LE(pos + 22)
          };
        } else if (id === "data") {
          dataSize = size;
          break;
        }
        if (size <= 0) break;
        pos += 8 + size + (size % 2);
      }
      if (!fmt || !fmt.byteRate) return null;
      if (dataSize < 0) return null;
      return {
        duration: dataSize / fmt.byteRate,
        channels: fmt.channels,
        sampleRate: fmt.sampleRate,
        bits: fmt.bits
      };
    } catch (e) {
      if (fd !== null) { try { fsMod.closeSync(fd); } catch (e2) { /* already gone */ } }
      return null;
    }
  }

  // ---------- WAV encode ----------
  function encodeWav(buffer) {
    var chans = Math.min(2, buffer.numberOfChannels);
    var len = buffer.length;
    var sr = buffer.sampleRate;
    var bytes = len * chans * 2;
    var out = new ArrayBuffer(44 + bytes);
    var view = new DataView(out);
    var i, c;

    function str(off, s) { for (var k = 0; k < s.length; k++) view.setUint8(off + k, s.charCodeAt(k)); }
    str(0, "RIFF"); view.setUint32(4, 36 + bytes, true); str(8, "WAVE");
    str(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, chans, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * chans * 2, true);
    view.setUint16(32, chans * 2, true); view.setUint16(34, 16, true);
    str(36, "data"); view.setUint32(40, bytes, true);

    var data = [];
    for (c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
    var off = 44;
    for (i = 0; i < len; i++) {
      for (c = 0; c < chans; c++) {
        var v = data[c][i];
        if (v > 1) v = 1; else if (v < -1) v = -1;
        view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        off += 2;
      }
    }
    return out;
  }

  // ---------- peaks ----------
  function buildPeaks(buffer, width, channel) {
    var n = Math.max(16, Math.min(4000, Math.round(width)));
    var chans = buffer.numberOfChannels;
    var pick = channel === "l" ? 0 : (channel === "r" ? Math.min(1, chans - 1) : -1);
    var len = buffer.length;
    var step = len / n;
    var min = new Float32Array(n), max = new Float32Array(n);
    var data = [], c;
    if (pick >= 0) data.push(buffer.getChannelData(pick));
    else for (c = 0; c < chans; c++) data.push(buffer.getChannelData(c));

    for (var i = 0; i < n; i++) {
      var from = Math.floor(i * step), to = Math.min(len, Math.floor((i + 1) * step));
      if (to <= from) to = Math.min(len, from + 1);
      var lo = 1, hi = -1;
      for (var k = from; k < to; k++) {
        for (c = 0; c < data.length; c++) {
          var v = data[c][k];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (lo > hi) { lo = 0; hi = 0; }
      min[i] = lo; max[i] = hi;
    }
    return { min: min, max: max, n: n };
  }

  // ---------- module ----------
  function init() {
    var panel = document.getElementById("panel-sfxdesign");
    if (!panel) return;

    var el = {
      shell: panel.querySelector(".sfxd-shell"),
      host: document.getElementById("sfxdHost"),
      settingsBtn: document.getElementById("sfxdSettings"),
      settings: document.getElementById("sfxdSettingsPanel"),
      togglePreview: document.getElementById("sfxdTogglePreview"),
      insertTarget: document.getElementById("sfxdInsertTarget"),
      organise: document.getElementById("sfxdOrganise"),
      autoPreview: document.getElementById("sfxdAutoPreview"),

      sourceCount: document.getElementById("sfxdSourceCount"),
      rescan: document.getElementById("sfxdRescan"),
      addFolder: document.getElementById("sfxdAddFolder"),
      folderFilter: document.getElementById("sfxdFolderFilter"),
      folders: document.getElementById("sfxdFolders"),
      libFoot: document.getElementById("sfxdLibFoot"),
      folderInput: document.getElementById("sfxdFolderInput"),

      search: document.getElementById("sfxdSearch"),
      searchClear: document.getElementById("sfxdSearchClear"),
      tabs: document.getElementById("sfxdTabs"),
      filters: document.getElementById("sfxdFilters"),
      favCount: document.getElementById("sfxdFavCount"),
      density: document.getElementById("sfxdDensity"),
      labelFilter: document.getElementById("sfxdLabelFilter"),
      resizer: document.getElementById("sfxdResizer"),
      body: panel.querySelector(".sfxd-body"),
      lockPitch: document.getElementById("sfxdLockPitch"),
      restoreDropped: document.getElementById("sfxdRestoreDropped"),
      fsKey: document.getElementById("sfxdFsKey"),
      count: document.getElementById("sfxdCount"),
      sort: document.getElementById("sfxdSort"),
      results: document.getElementById("sfxdResults"),

      preview: document.getElementById("sfxdPreview"),
      pvName: document.getElementById("sfxdPvName"),
      zoomVal: document.getElementById("sfxdZoomVal"),
      zoomIn: document.getElementById("sfxdZoomIn"),
      zoomOut: document.getElementById("sfxdZoomOut"),
      t0: document.getElementById("sfxdT0"),
      tM: document.getElementById("sfxdTM"),
      t1: document.getElementById("sfxdT1"),
      wrap: document.getElementById("sfxdWrap"),
      wave: document.getElementById("sfxdWave"),
      playhead: document.getElementById("sfxdPlayhead"),
      handleA: document.getElementById("sfxdHandleA"),
      handleB: document.getElementById("sfxdHandleB"),
      reverse: document.getElementById("sfxdReverse"),
      format: document.getElementById("sfxdFormat"),
      size: document.getElementById("sfxdSize"),
      length: document.getElementById("sfxdLength"),
      source: document.getElementById("sfxdSource"),
      tags: document.getElementById("sfxdTags"),

      nowName: document.getElementById("sfxdNowName"),
      prev: document.getElementById("sfxdPrev"),
      play: document.getElementById("sfxdPlay"),
      next: document.getElementById("sfxdNext"),
      stopBtn: document.getElementById("sfxdStop"),
      loop: document.getElementById("sfxdLoop"),
      fxBtn: document.getElementById("sfxdFxBtn"),
      fxState: document.getElementById("sfxdFxState"),
      fxRack: document.getElementById("sfxdFxRack"),
      gain: document.getElementById("sfxdGain"),
      gainVal: document.getElementById("sfxdGainVal"),
      pitch: document.getElementById("sfxdPitch"),
      pitchVal: document.getElementById("sfxdPitchVal"),
      speed: document.getElementById("sfxdSpeed"),
      speedVal: document.getElementById("sfxdSpeedVal"),
      fxReset: document.getElementById("sfxdFxReset"),
      time: document.getElementById("sfxdTime"),
      clear: document.getElementById("sfxdClear"),
      insert: document.getElementById("sfxdInsert"),
      status: document.getElementById("sfxdStatus")
    };

    // ---------- state ----------
    var folders = readJson("folders", []);          // [{path, name}]
    var favs = readJson("favs", {});                // path -> 1
    var labels = readJson("labels", {});            // path -> index into LABELS
    var pins = readJson("pins", {});                // path -> time it was pinned
    var dropped = readJson("dropped", {});          // path -> 1, removed from the index (file kept)
    var labelFilter = read("labelFilter", "");      // "" is every label
    var lockPitch = read("lockPitch", "0") === "1";
    // Freesound: results of the last cloud search, as items shaped like the
    // local ones (path "freesound:<id>", remote carries the rest).
    var fsKey = read("fsKey", "");
    var fsItems = [], fsNext = "", fsQuery = "", fsBusy = false, fsError = "", fsTimer = 0, fsToken = 0;
    // Search tabs: each keeps its own query and filter chip.
    var tabs = readJson("tabs", null);
    if (!tabs || !tabs.length) tabs = [{ q: "", filter: filter }];
    var tabIdx = Math.min(tabs.length - 1, Math.max(0, Number(read("tabIdx", 0)) || 0));
    var items = [];                                 // the whole index
    var view = [];                                  // what the list is showing
    var activeFolder = read("activeFolder", "");    // "" is every folder
    var filter = read("filter", "all");
    var sortBy = read("sort", "relevance");
    var query = "";
    var compact = read("compact", "0") === "1";
    var current = null;                             // the selected item
    var buffer = null;                              // its decoded AudioBuffer
    var selA = 0, selB = 1;                         // segment, 0..1 of the file
    var zoom = 0;                                   // index into ZOOMS
    var viewA = 0, viewB = 1;                       // visible window, 0..1
    var chanMode = read("chan", "stereo");
    var reversed = false;
    var loop = read("loop", "0") === "1";
    var fx = { gain: 0, pitch: 0, speed: 1 };
    var rendered = null, renderKey = "";
    var audio = null, source = null, startedAt = 0, raf = 0, playing = false;
    var peakCache = {}, peakOrder = [];
    var decodeQueue = [], decoding = 0, token = 0;
    var busy = false;

    function ctx() {
      if (!audio) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audio = new AC();
      }
      if (audio.state === "suspended") { try { audio.resume(); } catch (e) { /* gesture pending */ } }
      return audio;
    }

    function say(message, state) {
      if (!el.status) return;
      el.status.textContent = message;
      el.status.classList.toggle("is-error", state === "error");
      el.status.classList.toggle("is-ok", state === "ok");
      el.status.title = message;
    }

    // ---------- indexing ----------
    function walk(root, out) {
      if (!fsMod || !pathMod) return;
      var stack = [{ dir: root, depth: 0 }];
      while (stack.length) {
        var job = stack.pop();
        var entries;
        try { entries = fsMod.readdirSync(job.dir, { withFileTypes: true }); } catch (e) { continue; }
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var name = entry.name;
          if (name.charAt(0) === ".") continue;
          var full = pathMod.join(job.dir, name);
          var isDir;
          try { isDir = entry.isDirectory(); } catch (e2) { isDir = false; }
          if (isDir) {
            if (job.depth < MAX_DEPTH) stack.push({ dir: full, depth: job.depth + 1 });
            continue;
          }
          if (AUDIO_EXT.indexOf(extOf(name)) < 0) continue;
          if (out.length >= MAX_FILES) return;
          var size = 0, head = null;
          try { size = fsMod.statSync(full).size; } catch (e3) { size = 0; }
          if (extOf(name) === ".wav") head = wavHeader(full);
          out.push({
            path: full,
            name: stripExt(name),
            file: name,
            ext: extOf(name).slice(1).toUpperCase(),
            root: root,
            rootName: baseName(root),
            size: size,
            duration: head ? head.duration : -1,
            channels: head ? head.channels : 0,
            sampleRate: head ? head.sampleRate : 0,
            search: (stripExt(name) + " " + baseName(job.dir)).toLowerCase()
          });
        }
      }
    }

    function rescan(quiet) {
      if (!fsMod) {
        say("This build has no file access, so folders cannot be indexed.", "error");
        return;
      }
      var next = [], i;
      var kept = [];
      for (i = 0; i < folders.length; i++) {
        var exists = false;
        try { exists = fsMod.statSync(folders[i].path).isDirectory(); } catch (e) { exists = false; }
        if (!exists) continue;
        kept.push(folders[i]);
        walk(folders[i].path, next);
      }
      if (kept.length !== folders.length) {
        folders = kept;
        writeJson("folders", folders);
      }
      items = next.filter(function (it) { return !dropped[it.path]; });
      paintDropped();
      paintFolders();
      render();
      if (!quiet) {
        say(items.length ? ("Indexed " + items.length + " sound" + (items.length === 1 ? "" : "s") + " in " +
          folders.length + " folder" + (folders.length === 1 ? "" : "s") + ".") : "No audio found in those folders.",
          items.length ? "ok" : "error");
      }
    }

    function addFolderPath(dir) {
      if (!dir) return;
      var i;
      for (i = 0; i < folders.length; i++) if (folders[i].path === dir) { say("That folder is already indexed."); return; }
      folders.push({ path: dir, name: baseName(dir) });
      writeJson("folders", folders);
      rescan();
    }

    function pickFolder() {
      // CEP's own picker first: it returns a real directory path. The hidden
      // webkitdirectory input is the fallback, and its File.path minus the
      // relative path gives the same root.
      try {
        if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialog === "function") {
          var res = window.cep.fs.showOpenDialog(false, true, "Select a folder of sounds", "");
          if (res && res.data && res.data.length) { addFolderPath(String(res.data[0])); return; }
          if (res && res.err === 0) return;   // the user cancelled
        }
      } catch (e) { /* fall through to the input */ }
      if (el.folderInput) el.folderInput.click();
    }

    if (el.folderInput) {
      el.folderInput.addEventListener("change", function () {
        var f = el.folderInput.files && el.folderInput.files[0];
        if (!f) return;
        var full = f.path || "";
        var rel = (f.webkitRelativePath || "").replace(/\//g, full.indexOf("\\") >= 0 ? "\\" : "/");
        var dir = "";
        if (full && rel && full.slice(-rel.length) === rel) dir = full.slice(0, full.length - rel.length - 1);
        else if (full) dir = full.replace(/[\\/][^\\/]*$/, "");
        el.folderInput.value = "";
        if (dir) addFolderPath(dir);
        else say("Could not work out that folder's path.", "error");
      });
    }

    // ---------- folder list ----------
    function paintFolders() {
      if (!el.folders) return;
      var needle = (el.folderFilter && el.folderFilter.value || "").trim().toLowerCase();
      var counts = {}, i;
      for (i = 0; i < items.length; i++) counts[items[i].root] = (counts[items[i].root] || 0) + 1;

      var html = "";
      var allOn = activeFolder === "";
      html += '<button type="button" class="sfxd-folder' + (allOn ? " is-on" : "") + '" data-sfxd-folder="" role="option" aria-selected="' + allOn + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 9v6M12 7.5v9M16 10v3.5"/></svg>' +
        '<span class="sfxd-fname"><b>All local sounds</b><small>Every indexed folder</small></span>' +
        '<span class="sfxd-fcount">' + items.length + "</span></button>";

      for (i = 0; i < folders.length; i++) {
        var f = folders[i];
        if (needle && f.name.toLowerCase().indexOf(needle) < 0 && f.path.toLowerCase().indexOf(needle) < 0) continue;
        var on = activeFolder === f.path;
        html += '<button type="button" class="sfxd-folder' + (on ? " is-on" : "") + '" data-sfxd-folder="' + escapeAttr(f.path) + '" role="option" aria-selected="' + on + '" title="' + escapeAttr(f.path) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l1.6 2.2h9.4v9.8H3.5Z"/></svg>' +
          '<span class="sfxd-fname"><b>' + escapeHtml(f.name) + "</b><small>" + escapeHtml(f.path) + "</small></span>" +
          '<span class="sfxd-fcount">' + (counts[f.path] || 0) + "</span>" +
          '<span class="sfxd-fdrop" role="button" tabindex="0" data-sfxd-drop="' + escapeAttr(f.path) + '" title="Stop indexing this folder">✕</span></button>';
      }
      var cloudOn = activeFolder === CLOUD;
      html += '<button type="button" class="sfxd-folder sfxd-cloud' + (cloudOn ? " is-on" : "") + '" data-sfxd-folder="' + CLOUD + '" role="option" aria-selected="' + cloudOn + '" title="Freesound cloud library">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.2a4.7 4.7 0 0 0 0 9.3Z"/></svg>' +
        '<span class="sfxd-fname"><b>Freesound</b><small>' + (fsKey ? "Cloud library" : "Add an API key in Settings") + "</small></span>" +
        (cloudOn && fsItems.length ? '<span class="sfxd-fcount">' + fsItems.length + "</span>" : "") + "</button>";
      el.folders.innerHTML = html;

      if (el.sourceCount) {
        el.sourceCount.textContent = folders.length
          ? folders.length + " source" + (folders.length === 1 ? "" : "s") + " active"
          : "No source yet";
      }
      if (el.libFoot) el.libFoot.textContent = items.length + " indexed sound" + (items.length === 1 ? "" : "s");
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, "&quot;");
    }

    if (el.folders) {
      el.folders.addEventListener("click", function (ev) {
        var drop = ev.target.closest("[data-sfxd-drop]");
        if (drop) {
          ev.stopPropagation();
          var gone = drop.getAttribute("data-sfxd-drop");
          folders = folders.filter(function (f) { return f.path !== gone; });
          writeJson("folders", folders);
          if (activeFolder === gone) { activeFolder = ""; write("activeFolder", ""); }
          rescan(true);
          say("Folder removed from the index.");
          return;
        }
        var btn = ev.target.closest("[data-sfxd-folder]");
        if (!btn) return;
        activeFolder = btn.getAttribute("data-sfxd-folder");
        write("activeFolder", activeFolder);
        paintSearchMode();
        paintFolders();
        if (activeFolder === CLOUD) fsSearch(false); else render();
      });
    }

    if (el.folderFilter) el.folderFilter.addEventListener("input", paintFolders);
    if (el.rescan) el.rescan.addEventListener("click", function () { rescan(); });
    if (el.addFolder) el.addFolder.addEventListener("click", pickFolder);

    // ---------- carrying the old library across ----------
    // Sounds used to live on a shelf inside the Library tab. Its index is a
    // flat list of file paths, so the folders are recovered by taking each
    // file's directory and dropping any that sit inside another one — a
    // folder and its subfolder become just the folder.
    function legacyFolders() {
      var raw = null;
      try { raw = localStorage.getItem("sfxCommandCenter.library.v1"); } catch (e) { return []; }
      if (!raw) return [];
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { return []; }
      var list = parsed && parsed.length ? parsed : (parsed && parsed.items) || [];
      var dirs = {}, i, p;
      for (i = 0; i < list.length; i++) {
        if (!list[i] || list[i].type !== "sfx" || typeof list[i].path !== "string") continue;
        p = list[i].path.replace(/[\\/][^\\/]*$/, "");
        if (p) dirs[p] = 1;
      }
      var all = Object.keys(dirs).sort(function (a, b) { return a.length - b.length; });
      var roots = [];
      for (i = 0; i < all.length; i++) {
        var inside = false;
        for (var k = 0; k < roots.length; k++) {
          if (all[i].toLowerCase().indexOf(roots[k].toLowerCase()) === 0) { inside = true; break; }
        }
        if (!inside) roots.push(all[i]);
        if (roots.length >= 12) break;
      }
      return roots;
    }

    function importOldLibrary() {
      var roots = legacyFolders(), i;
      if (!roots.length) { say("Nothing to bring across."); return; }
      for (i = 0; i < roots.length; i++) {
        var dup = false;
        for (var k = 0; k < folders.length; k++) if (folders[k].path === roots[i]) dup = true;
        if (!dup) folders.push({ path: roots[i], name: baseName(roots[i]) });
      }
      writeJson("folders", folders);
      rescan();
    }

    // ---------- search, filter, sort ----------
    // Relevance is a real score, so it is only shown when there is something
    // to be relevant to: an exact name match scores highest, then prefix,
    // then word-boundary, then a loose substring, with a small bonus for
    // short names so "click" beats "click_layered_long_tail".
    function score(item, needle) {
      if (!needle) return 0;
      var name = item.name.toLowerCase();
      var s = 0;
      if (name === needle) s = 100;
      else if (name.indexOf(needle) === 0) s = 88;
      else if (new RegExp("\\b" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(name)) s = 76;
      else if (name.indexOf(needle) >= 0) s = 64;
      else if (item.search.indexOf(needle) >= 0) s = 48;
      else return -1;
      s += Math.max(0, 12 - Math.floor(name.length / 6));
      return Math.min(99, s);
    }

    function render() {
      query = (el.search && el.search.value || "").trim().toLowerCase();
      if (el.searchClear) el.searchClear.hidden = !query;

      var out = [], i, it;
      var cloud = activeFolder === CLOUD;
      var pool = cloud ? fsItems : items;
      for (i = 0; i < pool.length; i++) {
        it = pool[i];
        if (cloud && dropped[it.path]) continue;
        if (!cloud && activeFolder && it.root !== activeFolder) continue;
        if (filter === "fav" && !favs[it.path]) continue;
        if (filter === "oneshot" && !(it.duration >= 0 && it.duration <= ONESHOT_MAX)) continue;
        if (filter === "ambience" && !(it.duration > ONESHOT_MAX)) continue;
        if (labelFilter !== "" && String(labels[it.path]) !== labelFilter) continue;
        if (query && !cloud) {
          it._score = score(it, query);
          if (it._score < 0) continue;
        } else {
          it._score = 0;
        }
        out.push(it);
      }

      out.sort(function (a, b) {
        var pa = pins[a.path] || 0, pb = pins[b.path] || 0;
        if (pa || pb) {
          if (!pa) return 1;
          if (!pb) return -1;
          return pa - pb;       // pinned first, in the order they were pinned
        }
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "size") return b.size - a.size;
        if (sortBy === "duration") {
          var da = a.duration < 0 ? Infinity : a.duration;
          var db = b.duration < 0 ? Infinity : b.duration;
          return da - db;
        }
        if (cloud) return (a._rank || 0) - (b._rank || 0);   // Freesound's own relevance
        if (query && b._score !== a._score) return b._score - a._score;
        return a.name.localeCompare(b.name);
      });

      view = out;
      paintResults();
    }

    function paintResults() {
      if (!el.results) return;
      var favTotal = 0, k;
      for (k in favs) if (favs[k]) favTotal++;
      if (el.favCount) el.favCount.textContent = favTotal;

      var cloud = activeFolder === CLOUD;
      if (el.count && cloud) {
        el.count.textContent = fsBusy ? "Searching Freesound…"
          : view.length ? view.length + " Freesound result" + (view.length === 1 ? "" : "s")
          : "Freesound";
      } else if (el.count) {
        el.count.textContent = !folders.length ? "No folders yet"
          : view.length ? view.length + " result" + (view.length === 1 ? "" : "s")
          : "Nothing matched";
      }

      el.results.classList.toggle("is-compact", compact);

      if (!view.length && cloud) {
        el.results.innerHTML = '<div class="sfxd-empty">' + escapeHtml(
          !fsKey ? "Add your Freesound API key in Settings to search the cloud library."
            : fsBusy ? "Searching Freesound…"
            : fsError ? fsError
            : !query || query.length < 2 ? "Type at least two characters to search Freesound."
            : "Freesound found nothing for “" + query + "”.") + "</div>";
        return;
      }

      if (!view.length) {
        el.results.innerHTML = '<div class="sfxd-empty">' +
          (!folders.length ? ("Add a folder of sounds to get started." +
              (legacyFolders().length ? '<br/><button type="button" class="sfxd-mini" id="sfxdImportOld" style="margin-top:9px">BRING ACROSS ' + legacyFolders().length + ' FOLDER' + (legacyFolders().length === 1 ? "" : "S") + ' FROM THE OLD LIBRARY</button>' : ""))
            : query ? "Nothing here matches “" + escapeHtml(query) + "”."
            : filter === "fav" ? "No favourites yet — tap a heart on any row."
            : "Nothing in this view.") + "</div>";
        return;
      }

      var html = [], i;
      var cap = Math.min(view.length, 600);   // beyond this the list is scrolled, not read
      for (i = 0; i < cap; i++) {
        var it = view[i];
        var on = current && current.path === it.path;
        var known = it.duration >= 0;
        html.push(
          '<div class="sfxd-row' + (on ? " is-on" : "") + '" data-sfxd-i="' + i + '" role="option" tabindex="0" aria-selected="' + (on ? "true" : "false") + '" title="' + escapeAttr(it.path) + '">' +
          '<button type="button" class="sfxd-rowplay" data-sfxd-play="' + i + '" title="Audition this sound" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg></button>' +
          '<span class="sfxd-rowmid">' +
          '<span class="sfxd-rowname">' +
          (labels[it.path] != null && LABELS[labels[it.path]] ? '<i class="sfxd-labeldot" style="--sfxd-label:' + LABELS[labels[it.path]].c + '" title="' + LABELS[labels[it.path]].name + ' label"></i>' : "") +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M8 10v4M12 8.5v7M16 10.5v3"/></svg><b>' + escapeHtml(it.name) + "</b>" +
          (pins[it.path] ? '<svg class="sfxd-pinmark" viewBox="0 0 24 24" aria-label="Pinned to top"><path d="M9 3.5h6l-1 5 3.5 3.5h-11L10 8.5Z"/><path d="M12 12v8.5"/></svg>' : "") +
          "</span>" +
          '<canvas class="sfxd-rowwave" data-sfxd-wave="' + i + '"></canvas>' +
          "</span>" +
          '<span class="sfxd-rowinfo">' +
          '<span class="sfxd-rowdur' + (known ? "" : " is-unknown") + '">' + (known ? fmtTime(it.duration) : "—:—") + "</span>" +
          '<span class="sfxd-rowmeta">' + escapeHtml(it.ext) + " · " +
          (it.remote ? escapeHtml(it.remote.license) + " · " + escapeHtml(it.remote.user) : fmtSize(it.size)) + "</span>" +
          "</span>" +
          '<span class="sfxd-rowend">' +
          (query && !it.remote ? '<span class="sfxd-score">' + it._score + "%</span>" : "") +
          '<button type="button" class="sfxd-fav' + (favs[it.path] ? " is-on" : "") + '" data-sfxd-fav="' + i + '" title="' + (favs[it.path] ? "Remove from favourites" : "Add to favourites") + '" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.5s-7-4.3-7-9A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.5c0 4.7-7 9-7 9Z"/></svg></button>' +
          "</span></div>"
        );
      }
      if (view.length > cap) {
        html.push('<div class="sfxd-empty">' + (view.length - cap) + " more — narrow the search to see them.</div>");
      }
      if (cloud && fsNext) {
        html.push('<div class="sfxd-empty"><button type="button" class="sfxd-mini" id="sfxdFsMore"' + (fsBusy ? " disabled" : "") + ">" +
          (fsBusy ? "LOADING…" : "MORE FREESOUND RESULTS") + "</button></div>");
      }
      el.results.innerHTML = html.join("");
      queueRowWaves();
    }

    // ---------- row waveforms ----------
    // Only what is on screen, two decodes at a time, and never for a file
    // large enough that pulling it into memory for a 14px thumbnail would
    // be silly. Everything decoded is kept, capped at PEAK_CACHE_CAP.
    function cachePeaks(path, peaks) {
      if (!peakCache[path]) {
        peakOrder.push(path);
        if (peakOrder.length > PEAK_CACHE_CAP) delete peakCache[peakOrder.shift()];
      }
      peakCache[path] = peaks;
    }

    function drawRowWave(canvas, peaks) {
      var w = canvas.clientWidth || 120, h = canvas.clientHeight || 14;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      var g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      var mid = h / 2;
      if (!peaks) {
        g.strokeStyle = "rgba(125,150,135,.35)";
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
        return;
      }
      g.fillStyle = "rgba(60,255,95,.55)";
      var bars = Math.max(1, Math.floor(w / 2));
      for (var i = 0; i < bars; i++) {
        var p = Math.floor(i / bars * peaks.n);
        var hi = peaks.max[p], lo = peaks.min[p];
        var top = mid - hi * mid, bot = mid - lo * mid;
        var height = Math.max(1, bot - top);
        g.fillRect(i * 2, top, 1, height);
      }
    }

    function queueRowWaves() {
      if (!el.results) return;
      var canvases = el.results.querySelectorAll("[data-sfxd-wave]");
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var it = view[Number(c.getAttribute("data-sfxd-wave"))];
        if (!it) continue;
        if (peakCache[it.path]) { drawRowWave(c, peakCache[it.path]); continue; }
        drawRowWave(c, null);
        if (it.remote) continue;   // no download just to draw a thumbnail
        if (it.size > PEAK_FILE_CAP || !fsMod) continue;
        observeRow(c, it);
      }
    }

    var io = null;
    if (window.IntersectionObserver && el.results) {
      io = new window.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          var c = entries[i].target;
          io.unobserve(c);
          var it = view[Number(c.getAttribute("data-sfxd-wave"))];
          if (it && !peakCache[it.path]) decodeQueue.push({ canvas: c, item: it });
        }
        pumpDecode();
      }, { root: el.results, rootMargin: "120px" });
    }

    function observeRow(canvas, item) {
      if (io) io.observe(canvas);
      else { decodeQueue.push({ canvas: canvas, item: item }); pumpDecode(); }
    }

    function pumpDecode() {
      while (decoding < 2 && decodeQueue.length) {
        var job = decodeQueue.shift();
        if (!job.item || peakCache[job.item.path]) continue;
        decoding++;
        decodeFile(job.item, (function (j) {
          return function (buf) {
            decoding--;
            if (buf) {
              var peaks = buildPeaks(buf, 260);
              cachePeaks(j.item.path, peaks);
              if (j.item.duration < 0) {
                j.item.duration = buf.duration;
                j.item.channels = buf.numberOfChannels;
                j.item.sampleRate = buf.sampleRate;
                var row = j.canvas.closest(".sfxd-row");
                var dur = row && row.querySelector(".sfxd-rowdur");
                if (dur) { dur.textContent = fmtTime(buf.duration); dur.classList.remove("is-unknown"); }
              }
              if (j.canvas.isConnected !== false) drawRowWave(j.canvas, peaks);
            }
            pumpDecode();
          };
        })(job));
      }
    }

    function decodeFile(item, done) {
      var c = ctx();
      if (item && item.remote) {
        if (!c) { done(null); return; }
        fetchRemote(item, function (arr) {
          if (!arr) { done(null); return; }
          try {
            c.decodeAudioData(arr, function (buf) { done(buf); }, function () { done(null); });
          } catch (e) { done(null); }
        });
        return;
      }
      if (!c || !fsMod) { done(null); return; }
      var data;
      try { data = fsMod.readFileSync(item.path); } catch (e) { done(null); return; }
      var arr = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      try {
        c.decodeAudioData(arr, function (buf) { done(buf); }, function () { done(null); });
      } catch (e) { done(null); }
    }

    // ---------- results interaction ----------
    if (el.results) {
      el.results.addEventListener("click", function (ev) {
        var fav = ev.target.closest("[data-sfxd-fav]");
        if (fav) {
          ev.stopPropagation();
          var f = view[Number(fav.getAttribute("data-sfxd-fav"))];
          if (!f) return;
          if (favs[f.path]) delete favs[f.path]; else favs[f.path] = 1;
          writeJson("favs", favs);
          if (filter === "fav") render(); else paintResults();
          return;
        }
        var playBtn = ev.target.closest("[data-sfxd-play]");
        if (playBtn) {
          ev.stopPropagation();
          select(view[Number(playBtn.getAttribute("data-sfxd-play"))], true);
          return;
        }
        var row = ev.target.closest("[data-sfxd-i]");
        if (row) select(view[Number(row.getAttribute("data-sfxd-i"))], el.autoPreview ? el.autoPreview.checked : true);
      });

      el.results.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var row = ev.target.closest && ev.target.closest("[data-sfxd-i]");
        if (!row) return;
        ev.preventDefault();
        select(view[Number(row.getAttribute("data-sfxd-i"))], true);
      });
    }

    if (el.results) el.results.addEventListener("click", function (ev) {
      if (ev.target && ev.target.id === "sfxdImportOld") importOldLibrary();
    });

    // ---------- search tabs ----------
    var MAX_TABS = 8;
    function saveTabs() { writeJson("tabs", tabs); write("tabIdx", tabIdx); }

    function paintTabs() {
      if (!el.tabs) return;
      var html = "";
      for (var i = 0; i < tabs.length; i++) {
        var on = i === tabIdx;
        var label = tabs[i].q ? tabs[i].q : (i === 0 ? "All sounds" : "New search");
        html += '<span class="sfxd-tab' + (on ? " is-on" : "") + '">' +
          '<button type="button" role="tab" class="sfxd-tabbtn" data-sfxd-tab="' + i + '" aria-selected="' + on + '" tabindex="' + (on ? "0" : "-1") + '" title="' + escapeAttr(label) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/></svg>' +
          "<span>" + escapeHtml(label) + "</span></button>" +
          (tabs.length > 1 ? '<button type="button" class="sfxd-tabclose" data-sfxd-tabclose="' + i + '" title="Close search" aria-label="Close search">✕</button>' : "") +
          "</span>";
      }
      html += '<button type="button" class="sfxd-tabnew" id="sfxdTabNew" title="Open a new search tab" aria-label="New search"' + (tabs.length >= MAX_TABS ? " disabled" : "") + '>+</button>';
      el.tabs.innerHTML = html;
    }

    function useTab(i, focus) {
      tabIdx = Math.max(0, Math.min(tabs.length - 1, i));
      var t = tabs[tabIdx];
      if (el.search) el.search.value = t.q || "";
      filter = t.filter || "all";
      write("filter", filter);
      saveTabs();
      paintTabs();
      paintFilters();
      if (activeFolder === CLOUD) fsSearch(false); else render();
      if (focus && el.search) el.search.focus();
    }

    if (el.tabs) {
      el.tabs.addEventListener("click", function (ev) {
        var close = ev.target.closest("[data-sfxd-tabclose]");
        if (close) {
          var ci = Number(close.getAttribute("data-sfxd-tabclose"));
          tabs.splice(ci, 1);
          if (tabIdx > ci || tabIdx >= tabs.length) tabIdx = Math.max(0, tabIdx - 1);
          useTab(tabIdx);
          return;
        }
        if (ev.target.closest("#sfxdTabNew")) {
          if (tabs.length >= MAX_TABS) return;
          tabs.push({ q: "", filter: "all" });
          useTab(tabs.length - 1, true);
          return;
        }
        var b = ev.target.closest("[data-sfxd-tab]");
        if (b) useTab(Number(b.getAttribute("data-sfxd-tab")));
      });
      el.tabs.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
        if (!ev.target.closest("[data-sfxd-tab]")) return;
        ev.preventDefault();
        useTab((tabIdx + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length);
        var on = el.tabs.querySelector('[data-sfxd-tab="' + tabIdx + '"]');
        if (on) on.focus();
      });
    }

    var tabNameTimer = 0;
    if (el.search) el.search.addEventListener("input", function () {
      tabs[tabIdx].q = el.search.value.trim();
      saveTabs();
      clearTimeout(tabNameTimer);
      tabNameTimer = setTimeout(paintTabs, 250);
      if (activeFolder === CLOUD) scheduleFsSearch(); else render();
    });
    if (el.searchClear) el.searchClear.addEventListener("click", function () {
      el.search.value = ""; tabs[tabIdx].q = ""; saveTabs(); paintTabs(); render(); el.search.focus();
    });

    // Ctrl/Cmd+K jumps to the search while the workspace is on screen.
    document.addEventListener("keydown", function (ev) {
      if (!(ev.ctrlKey || ev.metaKey) || String(ev.key).toLowerCase() !== "k") return;
      if (!panel.offsetParent) return;
      ev.preventDefault();
      if (el.search) { el.search.focus(); el.search.select(); }
    });

    if (el.filters) el.filters.addEventListener("click", function (ev) {
      var chip = ev.target.closest("[data-sfxd-filter]");
      if (!chip) return;
      filter = chip.getAttribute("data-sfxd-filter");
      write("filter", filter);
      tabs[tabIdx].filter = filter;
      saveTabs();
      paintFilters();
      render();
    });

    function paintFilters() {
      if (!el.filters) return;
      var chips = el.filters.querySelectorAll("[data-sfxd-filter]");
      for (var i = 0; i < chips.length; i++) {
        var on = chips[i].getAttribute("data-sfxd-filter") === filter;
        chips[i].classList.toggle("is-on", on);
        chips[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    if (el.sort) el.sort.addEventListener("change", function () {
      sortBy = el.sort.value; write("sort", sortBy); render();
    });

    if (el.density) el.density.addEventListener("click", function () {
      compact = !compact;
      write("compact", compact ? "1" : "0");
      el.density.setAttribute("aria-pressed", compact ? "true" : "false");
      paintResults();
    });

    // ---------- Freesound ----------
    // Search goes to the public API with the user's key; audition and insert
    // use the HQ preview (an MP3), which needs no OAuth. Everything fetched is
    // kept in Documents/CompX Freesound so the project never points at a temp
    // file, and each download adds its credit line to CREDITS.txt there.
    var httpsMod = null;
    try { httpsMod = (typeof require !== "undefined" ? require : window.require)("https"); } catch (e) { httpsMod = null; }
    if (httpsMod && typeof httpsMod.get !== "function") httpsMod = null;

    function trustedFsUrl(u) {
      return /^https:\/\/([a-z0-9-]+\.)*freesound\.org\//i.test(String(u || ""));
    }

    function licenseShort(url) {
      var u = String(url || "").toLowerCase();
      if (u.indexOf("publicdomain/zero") >= 0) return "CC0";
      if (u.indexOf("sampling+") >= 0) return "Sampling+";
      if (u.indexOf("by-nc") >= 0) return "CC BY-NC";
      if (u.indexOf("/by/") >= 0 || u.indexOf("by/3") >= 0 || u.indexOf("by/4") >= 0) return "CC BY";
      return "See license";
    }

    // GET over Node https when CEP has it (no CORS, redirects checked here),
    // otherwise fetch. asBinary returns an ArrayBuffer, else parsed JSON.
    function httpGet(url, asBinary, done) {
      var finished = false;
      function end(err, val) { if (finished) return; finished = true; done(err, val); }
      if (!trustedFsUrl(url)) { end("Untrusted remote audio URL."); return; }
      if (httpsMod) {
        (function hop(u, left) {
          if (!trustedFsUrl(u)) { end("Freesound redirected to an untrusted download address."); return; }
          var req = httpsMod.get(u, { headers: { "User-Agent": "CompX-Orbit-Studio" } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              if (left <= 0) { end("Freesound redirected the download too many times."); return; }
              hop(String(res.headers.location).indexOf("http") === 0 ? res.headers.location : "https://freesound.org" + res.headers.location, left - 1);
              return;
            }
            if (res.statusCode === 401 || res.statusCode === 403) { res.resume(); end("Freesound rejected the API key. Check it in Settings."); return; }
            if (res.statusCode === 429) { res.resume(); end("Freesound request limit reached. Please try again later."); return; }
            if (res.statusCode !== 200) { res.resume(); end("Freesound answered " + res.statusCode + "."); return; }
            var chunks = [], total = 0;
            res.on("data", function (d) {
              total += d.length;
              if (total > FS_MAX_BYTES) { req.abort(); end("This sound is too large to download safely."); return; }
              chunks.push(d);
            });
            res.on("end", function () {
              var buf = Buffer.concat(chunks);
              if (asBinary) end(null, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
              else { try { end(null, JSON.parse(buf.toString("utf8"))); } catch (e) { end("Freesound search failed."); } }
            });
          });
          req.on("error", function () { end("Freesound could not be reached."); });
          req.setTimeout(20000, function () { req.abort(); end(asBinary ? "The Freesound download timed out." : "The Freesound search timed out."); });
        })(url, 4);
        return;
      }
      if (!window.fetch) { end("CEP HTTPS is unavailable."); return; }
      window.fetch(url).then(function (res) {
        if (res.url && !trustedFsUrl(res.url)) throw "Freesound redirected to an untrusted download address.";
        if (res.status === 401 || res.status === 403) throw "Freesound rejected the API key. Check it in Settings.";
        if (res.status === 429) throw "Freesound request limit reached. Please try again later.";
        if (!res.ok) throw "Freesound answered " + res.status + ".";
        return asBinary ? res.arrayBuffer() : res.json();
      }).then(function (v) {
        if (asBinary && v && v.byteLength > FS_MAX_BYTES) { end("This sound is too large to download safely."); return; }
        end(null, v);
      }, function (e) {
        end(typeof e === "string" ? e : (asBinary ? "The Freesound download failed." : "Freesound search failed."));
      });
    }

    function toItem(r, rank) {
      var prev = r.previews || {};
      var safe = String(r.name || ("freesound " + r.id)).replace(/\.[a-z0-9]{2,4}$/i, "");
      return {
        path: "freesound:" + r.id,
        name: safe,
        file: safe,
        ext: "MP3",
        size: Number(r.filesize) || 0,
        duration: typeof r.duration === "number" ? r.duration : -1,
        rootName: "Freesound",
        _rank: rank,
        remote: {
          id: r.id,
          preview: prev["preview-hq-mp3"] || prev["preview-lq-mp3"] || "",
          license: licenseShort(r.license),
          licenseUrl: r.license || "",
          user: r.username || "unknown",
          page: r.url || ("https://freesound.org/s/" + r.id + "/"),
          tags: (r.tags || []).slice(0, 12)
        }
      };
    }

    function fsSearch(more) {
      clearTimeout(fsTimer);
      var q = (el.search && el.search.value || "").trim();
      if (!more) { fsItems = []; fsNext = ""; fsError = ""; }
      if (!fsKey || q.length < 2) { fsBusy = false; render(); paintFolders(); return; }
      var url = more ? fsNext
        : FS_SEARCH + "?query=" + encodeURIComponent(q) + "&fields=" + FS_FIELDS + "&page_size=" + FS_PAGE;
      if (!url) return;
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(fsKey);
      var mine = ++fsToken;
      fsBusy = true; fsQuery = q;
      render();
      say(more ? "Loading more Freesound results…" : "Searching Freesound…");
      httpGet(url, false, function (err, data) {
        if (mine !== fsToken) return;
        fsBusy = false;
        if (err) { fsError = err; say(err, "error"); render(); return; }
        var list = (data && data.results) || [], base = fsItems.length;
        for (var i = 0; i < list.length; i++) fsItems.push(toItem(list[i], base + i));
        fsNext = data && data.next ? String(data.next).replace(/([?&])token=[^&]*&?/, "$1").replace(/[?&]$/, "") : "";
        say(fsItems.length ? (data.count || fsItems.length) + " Freesound result" + ((data.count || fsItems.length) === 1 ? "" : "s") + " for “" + q + "”." : "Freesound found nothing for “" + q + "”.",
          fsItems.length ? "ok" : "");
        render();
        paintFolders();
      });
    }

    function scheduleFsSearch() {
      clearTimeout(fsTimer);
      fsTimer = setTimeout(function () { fsSearch(false); }, 450);
    }

    function fsDir() {
      if (!fsMod || !pathMod || !osMod) return "";
      var dir = pathMod.join(osMod.homedir(), "Documents", "CompX Freesound");
      try { if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true }); } catch (e) { return ""; }
      return dir;
    }

    function addCredit(dir, item) {
      try {
        var file = pathMod.join(dir, "CREDITS.txt");
        var line = "\"" + item.name + "\" by " + item.remote.user + " — " + item.remote.page + " — " + (item.remote.licenseUrl || item.remote.license);
        var have = fsMod.existsSync(file) ? String(fsMod.readFileSync(file, "utf8")) : "";
        if (have.indexOf(item.remote.page) >= 0) return;
        fsMod.writeFileSync(file, have + (have && have.slice(-1) !== "\n" ? "\n" : "") + line + "\n");
      } catch (e) { /* credits are a courtesy, never a blocker */ }
    }

    // Returns the audio as an ArrayBuffer, downloading the preview once and
    // reading the kept copy after that.
    function fetchRemote(item, done) {
      var dir = fsDir();
      var safe = item.name.replace(/[^A-Za-z0-9_\- ]+/g, "").replace(/\s+/g, "_").slice(0, 48) || "sound";
      var local = dir ? pathMod.join(dir, item.remote.id + "_" + safe + ".mp3") : "";
      if (local) {
        try {
          if (fsMod.existsSync(local)) {
            var data = fsMod.readFileSync(local);
            item.local = local;
            done(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            return;
          }
        } catch (e) { /* download it again */ }
      }
      if (!item.remote.preview) { say("This Freesound result has no downloadable preview.", "error"); done(null); return; }
      say("Downloading " + item.name + " from Freesound…");
      httpGet(item.remote.preview, true, function (err, arr) {
        if (err || !arr || !arr.byteLength) { say(err || "Freesound returned an empty audio file.", "error"); done(null); return; }
        if (local) {
          try {
            fsMod.writeFileSync(local, Buffer.from(new Uint8Array(arr)));
            item.local = local;
            item.size = arr.byteLength;
            addCredit(dir, item);
          } catch (e) { item.local = ""; }
        }
        done(arr);
      });
    }

    if (el.results) el.results.addEventListener("click", function (ev) {
      if (ev.target && ev.target.id === "sfxdFsMore") fsSearch(true);
    });

    if (el.fsKey) {
      el.fsKey.value = fsKey;
      el.fsKey.addEventListener("change", function () {
        fsKey = el.fsKey.value.trim();
        write("fsKey", fsKey);
        paintFolders();
        if (activeFolder === CLOUD) fsSearch(false);
        say(fsKey ? "Freesound key saved." : "Freesound key removed.");
      });
    }

    function paintSearchMode() {
      if (!el.search) return;
      var cloud = activeFolder === CLOUD;
      el.search.placeholder = cloud ? "Search Freesound…" : "Search local sounds…";
      el.search.setAttribute("aria-label", cloud ? "Search Freesound" : "Search local sounds");
    }

    // ---------- context menu ----------
    // Right-click (or the Menu key / Shift+F10) on a row: favourite, pin to
    // top, colour label, and remove from the index. The same menu shell
    // carries the colour-label filter.
    var menu = document.createElement("div");
    menu.className = "sfxd-menu";
    menu.id = "sfxdMenu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    panel.appendChild(menu);
    var menuItem = null, menuReturn = null, menuOpenedAt = 0;

    function swatches(active, attr) {
      var html = '<div class="sfxd-menu-swatches" role="group" aria-label="Color label">';
      for (var i = 0; i < LABELS.length; i++) {
        html += '<button type="button" role="menuitemradio" class="sfxd-swatch' + (String(active) === String(i) ? " is-on" : "") +
          '" ' + attr + '="' + i + '" style="--sfxd-label:' + LABELS[i].c + '" aria-checked="' + (String(active) === String(i)) +
          '" title="' + LABELS[i].name + '"></button>';
      }
      return html + "</div>";
    }

    function openMenu(html, x, y, returnTo) {
      menu.innerHTML = html;
      menu.hidden = false;
      menuOpenedAt = Date.now();
      menuReturn = returnTo || null;
      var box = panel.getBoundingClientRect();
      var w = menu.offsetWidth, h = menu.offsetHeight;
      var left = Math.max(box.left + 4, Math.min(x, box.right - w - 4));
      var top = Math.max(box.top + 4, Math.min(y, box.bottom - h - 4));
      menu.style.left = (left - box.left) + "px";
      menu.style.top = (top - box.top) + "px";
      var first = menu.querySelector("button");
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }

    function closeMenu() {
      if (menu.hidden) return;
      menu.hidden = true;
      menuItem = null;
      if (el.labelFilter) el.labelFilter.setAttribute("aria-expanded", "false");
      if (menuReturn && menuReturn.focus) { try { menuReturn.focus(); } catch (e) { /* gone */ } }
      menuReturn = null;
    }

    function openRowMenu(item, x, y, row) {
      menuItem = item;
      var fav = !!favs[item.path], pinned = !!pins[item.path];
      openMenu(
        '<div class="sfxd-menu-title">' + escapeHtml(item.name) + "</div>" +
        '<button type="button" role="menuitem" data-sfxd-act="play">Preview sound</button>' +
        '<button type="button" role="menuitem" data-sfxd-act="fav">' + (fav ? "Remove from favorites" : "Add to favorites") + "</button>" +
        '<button type="button" role="menuitem" data-sfxd-act="pin">' + (pinned ? "Unpin from top" : "Pin to top") + "</button>" +
        '<div class="sfxd-menu-sep"></div><div class="sfxd-menu-label">Color label</div>' +
        swatches(labels[item.path], "data-sfxd-label") +
        (labels[item.path] != null ? '<button type="button" role="menuitem" data-sfxd-act="unlabel">Remove color label</button>' : "") +
        '<div class="sfxd-menu-sep"></div>' +
        '<button type="button" role="menuitem" class="is-danger" data-sfxd-act="drop">Remove from index (keeps source file)</button>',
        x, y, row);
    }

    function openLabelFilterMenu() {
      var r = el.labelFilter.getBoundingClientRect();
      el.labelFilter.setAttribute("aria-expanded", "true");
      openMenu(
        '<div class="sfxd-menu-label">Filter by color label</div>' +
        swatches(labelFilter, "data-sfxd-labelfilter") +
        '<button type="button" role="menuitem" data-sfxd-act="alllabels">' + (labelFilter === "" ? "✓ " : "") + "All labels</button>",
        r.right - 170, r.bottom + 4, el.labelFilter);
    }

    function paintLabelFilter() {
      if (!el.labelFilter) return;
      var on = labelFilter !== "" && LABELS[labelFilter];
      el.labelFilter.classList.toggle("is-on", !!on);
      el.labelFilter.style.setProperty("--sfxd-label", on ? LABELS[labelFilter].c : "transparent");
      el.labelFilter.title = on ? "Showing " + LABELS[labelFilter].name + " labels — click to change" : "Filter by color label";
    }

    function paintDropped() {
      if (!el.restoreDropped) return;
      var n = 0, k;
      for (k in dropped) if (dropped[k]) n++;
      el.restoreDropped.hidden = n === 0;
      el.restoreDropped.textContent = "RESTORE " + n + " REMOVED SOUND" + (n === 1 ? "" : "S");
    }

    menu.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      var lf = b.getAttribute("data-sfxd-labelfilter");
      if (lf !== null) {
        labelFilter = labelFilter === lf ? "" : lf;
        write("labelFilter", labelFilter);
        paintLabelFilter(); closeMenu(); render();
        return;
      }
      var act = b.getAttribute("data-sfxd-act");
      if (act === "alllabels") {
        labelFilter = ""; write("labelFilter", ""); paintLabelFilter(); closeMenu(); render();
        return;
      }
      var it = menuItem;
      if (!it) { closeMenu(); return; }
      var lab = b.getAttribute("data-sfxd-label");
      if (lab !== null) {
        labels[it.path] = Number(lab);
        writeJson("labels", labels);
        closeMenu(); render();
        return;
      }
      if (act === "play") { closeMenu(); select(it, true); return; }
      if (act === "fav") {
        if (favs[it.path]) delete favs[it.path]; else favs[it.path] = 1;
        writeJson("favs", favs);
      } else if (act === "pin") {
        if (pins[it.path]) delete pins[it.path]; else pins[it.path] = Date.now();
        writeJson("pins", pins);
      } else if (act === "unlabel") {
        delete labels[it.path];
        writeJson("labels", labels);
      } else if (act === "drop") {
        dropped[it.path] = 1;
        writeJson("dropped", dropped);
        items = items.filter(function (x) { return x.path !== it.path; });
        paintDropped();
        paintFolders();
        say("Removed from the search index. The source file was kept.");
      }
      closeMenu();
      render();
    });

    menu.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); closeMenu(); return; }
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      ev.preventDefault();
      var list = Array.prototype.slice.call(menu.querySelectorAll("button"));
      var i = list.indexOf(document.activeElement);
      i = ev.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[i].focus();
    });

    document.addEventListener("mousedown", function (ev) {
      if (!menu.hidden && !menu.contains(ev.target) && ev.target !== el.labelFilter) closeMenu();
    }, true);
    window.addEventListener("resize", closeMenu);
    // A scroll that lands right after opening is the one that brought the row
    // into view, not the user moving on.
    if (el.results) el.results.addEventListener("scroll", function () {
      if (Date.now() - menuOpenedAt > 250) closeMenu();
    });

    if (el.results) {
      el.results.addEventListener("contextmenu", function (ev) {
        var row = ev.target.closest("[data-sfxd-i]");
        if (!row) return;
        var it = view[Number(row.getAttribute("data-sfxd-i"))];
        if (!it) return;
        ev.preventDefault();
        openRowMenu(it, ev.clientX, ev.clientY, row);
      });
      el.results.addEventListener("keydown", function (ev) {
        if (ev.key !== "ContextMenu" && !(ev.shiftKey && ev.key === "F10")) return;
        var row = ev.target.closest && ev.target.closest("[data-sfxd-i]");
        if (!row) return;
        var it = view[Number(row.getAttribute("data-sfxd-i"))];
        if (!it) return;
        ev.preventDefault();
        var r = row.getBoundingClientRect();
        openRowMenu(it, r.left + 24, r.bottom - 4, row);
      });
    }

    if (el.labelFilter) el.labelFilter.addEventListener("click", function () {
      if (!menu.hidden && el.labelFilter.getAttribute("aria-expanded") === "true") closeMenu();
      else openLabelFilterMenu();
    });

    if (el.restoreDropped) el.restoreDropped.addEventListener("click", function () {
      dropped = {};
      writeJson("dropped", dropped);
      rescan(true);
      say("Removed sounds are back in the index.");
    });

    // ---------- library drawer width ----------
    // Drag the bar between the folder list and the results, or use the arrow
    // keys on it. The width is remembered.
    function setLibWidth(px) {
      if (!el.body) return;
      var max = Math.max(160, el.body.clientWidth * 0.55);
      var w = Math.round(Math.max(120, Math.min(max, px)));
      el.body.style.setProperty("--sfxd-lib-w", w + "px");
      if (el.resizer) el.resizer.setAttribute("aria-valuenow", String(w));
      return w;
    }
    var savedLibW = Number(read("libWidth", 0));
    if (savedLibW) setLibWidth(savedLibW);
    if (el.resizer && el.body) {
      el.resizer.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        var lib = el.body.querySelector(".sfxd-lib");
        var startX = ev.clientX, startW = lib ? lib.getBoundingClientRect().width : 180;
        el.resizer.classList.add("is-drag");
        try { el.resizer.setPointerCapture(ev.pointerId); } catch (e) { /* old CEP */ }
        function move(e) { setLibWidth(startW + e.clientX - startX); }
        function up() {
          el.resizer.classList.remove("is-drag");
          el.resizer.removeEventListener("pointermove", move);
          el.resizer.removeEventListener("pointerup", up);
          el.resizer.removeEventListener("pointercancel", up);
          var w = lib ? Math.round(lib.getBoundingClientRect().width) : 0;
          if (w) write("libWidth", w);
          lanePeakCache = {}; queueRowWaves();
        }
        el.resizer.addEventListener("pointermove", move);
        el.resizer.addEventListener("pointerup", up);
        el.resizer.addEventListener("pointercancel", up);
      });
      el.resizer.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
        ev.preventDefault();
        var lib = el.body.querySelector(".sfxd-lib");
        var w = lib ? lib.getBoundingClientRect().width : 180;
        write("libWidth", setLibWidth(w + (ev.key === "ArrowRight" ? 1 : -1) * (ev.shiftKey ? 40 : 10)));
      });
      el.resizer.addEventListener("dblclick", function () {
        el.body.style.removeProperty("--sfxd-lib-w");
        write("libWidth", 0);
      });
    }

    // ---------- selection ----------
    function select(item, autoPlay) {
      if (!item) return;
      stop();
      current = item;
      buffer = null;
      rendered = null; renderKey = "";
      selA = 0; selB = 1; zoom = 0; reversed = false;
      if (el.reverse) { el.reverse.classList.remove("is-on"); el.reverse.setAttribute("aria-pressed", "false"); }
      paintResults();
      paintMeta();
      if (el.nowName) el.nowName.textContent = item.name;
      if (el.pvName) el.pvName.textContent = item.name;

      var mine = ++token;
      say("Loading " + item.name + "…");
      decodeFile(item, function (buf) {
        if (mine !== token) return;
        if (!buf) { say("Could not decode that file.", "error"); redraw(); return; }
        buffer = buf;
        item.duration = buf.duration;
        item.channels = buf.numberOfChannels;
        item.sampleRate = buf.sampleRate;
        cachePeaks(item.path, buildPeaks(buf, 260));
        paintMeta();
        redraw();
        say(fmtTime(buf.duration) + " · " + buf.sampleRate + " Hz · " + (buf.numberOfChannels > 1 ? "stereo" : "mono"));
        if (autoPlay) play();
      });
      redraw();
    }

    function paintMeta() {
      if (!current) return;
      if (el.format) el.format.textContent = current.ext || "—";
      if (el.size) el.size.textContent = fmtSize(current.size);
      if (el.length) el.length.textContent = current.duration >= 0 ? fmtTime(current.duration) : "—:—";
      if (el.source) el.source.textContent = current.remote
        ? "Freesound · " + current.remote.user + " · " + current.remote.license
        : (current.rootName || "Local");
      if (el.source) el.source.title = current.remote ? current.remote.page : "";
      if (el.tags) {
        var tags = current.remote ? current.remote.tags.slice(0, 8) : tagsOf(current.file), html = "", i;
        for (i = 0; i < tags.length; i++) {
          html += '<button type="button" class="sfxd-tag" data-sfxd-tag="' + escapeAttr(tags[i]) + '" title="Search for this word">' + escapeHtml(tags[i]) + "</button>";
        }
        el.tags.innerHTML = html;
      }
      paintRuler();
    }

    if (el.tags) el.tags.addEventListener("click", function (ev) {
      var tag = ev.target.closest("[data-sfxd-tag]");
      if (!tag || !el.search) return;
      el.search.value = tag.getAttribute("data-sfxd-tag");
      render();
    });

    // ---------- waveform ----------
    function windowBounds() {
      var span = 1 / ZOOMS[zoom];
      if (span >= 1) return [0, 1];
      var mid = (selA + selB) / 2;
      var a = Math.max(0, Math.min(1 - span, mid - span / 2));
      return [a, a + span];
    }

    function redraw() {
      var bounds = windowBounds();
      viewA = bounds[0]; viewB = bounds[1];
      if (el.zoomVal) el.zoomVal.textContent = ZOOMS[zoom].toFixed(1) + "×";
      paintRuler();
      paintHandles();
      drawWave();
    }

    function paintRuler() {
      var dur = buffer ? buffer.duration : (current && current.duration >= 0 ? current.duration : 0);
      if (el.t0) el.t0.textContent = fmtTime(viewA * dur);
      if (el.tM) el.tM.textContent = dur ? fmtTime((viewA + viewB) / 2 * dur) : "—";
      if (el.t1) el.t1.textContent = dur ? fmtTime(viewB * dur) : "—";
    }

    function pos(t) {
      var span = viewB - viewA;
      return span <= 0 ? 0 : (t - viewA) / span;
    }

    function paintHandles() {
      if (!el.wrap) return;
      var w = el.wrap.clientWidth || 1;
      if (el.handleA) {
        var pa = pos(selA);
        el.handleA.style.left = Math.round(Math.max(0, Math.min(1, pa)) * w) + "px";
        el.handleA.style.display = (pa < -0.02 || pa > 1.02) ? "none" : "";
        el.handleA.setAttribute("aria-valuenow", Math.round(selA * 100));
      }
      if (el.handleB) {
        var pb = pos(selB);
        el.handleB.style.left = Math.round(Math.max(0, Math.min(1, pb)) * w) + "px";
        el.handleB.style.display = (pb < -0.02 || pb > 1.02) ? "none" : "";
        el.handleB.setAttribute("aria-valuenow", Math.round(selB * 100));
      }
    }

    function drawWave() {
      var canvas = el.wave;
      if (!canvas) return;
      var w = canvas.clientWidth || 300, h = canvas.clientHeight || 60;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      var g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      // grid
      g.strokeStyle = "rgba(90,120,100,.14)";
      g.lineWidth = 1;
      for (var k = 1; k < 4; k++) {
        var x = Math.round(w * k / 4) + 0.5;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }

      if (!buffer) {
        g.fillStyle = "rgba(125,150,135,.5)";
        g.font = "9px 'Segoe UI', sans-serif";
        g.textAlign = "center";
        g.fillText(current ? "Decoding…" : "Select a sound", w / 2, h / 2 + 3);
        return;
      }

      var stereo = chanMode === "stereo" && buffer.numberOfChannels > 1;
      var lanes = stereo ? [{ ch: "l", y0: 0, y1: h / 2 - 1 }, { ch: "r", y0: h / 2 + 1, y1: h }]
                         : [{ ch: "mix", y0: 0, y1: h }];

      for (var li = 0; li < lanes.length; li++) {
        var lane = lanes[li];
        var lh = lane.y1 - lane.y0, mid = lane.y0 + lh / 2;
        var peaks = lanePeaks(lane.ch, w);
        var from = Math.floor(viewA * peaks.n), to = Math.ceil(viewB * peaks.n);
        var count = Math.max(1, to - from);
        g.fillStyle = "rgba(60,255,95,.62)";
        for (var i = 0; i < w; i++) {
          var p = from + Math.floor(i / w * count);
          if (p < 0) p = 0; if (p >= peaks.n) p = peaks.n - 1;
          var top = mid - peaks.max[p] * (lh / 2);
          var bot = mid - peaks.min[p] * (lh / 2);
          g.fillRect(i, top, 1, Math.max(1, bot - top));
        }
        g.strokeStyle = "rgba(60,255,95,.18)";
        g.beginPath(); g.moveTo(0, mid + 0.5); g.lineTo(w, mid + 0.5); g.stroke();
      }

      // dim everything outside the segment
      g.fillStyle = "rgba(4,7,5,.62)";
      var xa = Math.max(0, Math.min(w, pos(selA) * w));
      var xb = Math.max(0, Math.min(w, pos(selB) * w));
      if (xa > 0) g.fillRect(0, 0, xa, h);
      if (xb < w) g.fillRect(xb, 0, w - xb, h);
    }

    var lanePeakCache = {};
    function lanePeaks(ch, width) {
      var key = (current ? current.path : "") + "|" + ch + "|" + ZOOMS[zoom] + "|" + Math.round(width);
      if (lanePeakCache.key === key) return lanePeakCache.value;
      var peaks = buildPeaks(buffer, Math.max(600, width * ZOOMS[zoom]), ch === "mix" ? null : ch);
      lanePeakCache = { key: key, value: peaks };
      return peaks;
    }

    // ---------- segment handles ----------
    function dragHandle(handle, which) {
      if (!handle) return;
      var dragging = false;
      handle.addEventListener("pointerdown", function (ev) {
        dragging = true;
        try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* older CEP */ }
        ev.preventDefault();
      });
      handle.addEventListener("pointermove", function (ev) {
        if (!dragging || !el.wrap) return;
        var rect = el.wrap.getBoundingClientRect();
        var t = viewA + Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width))) * (viewB - viewA);
        setEdge(which, t);
      });
      handle.addEventListener("pointerup", function () { dragging = false; });
      handle.addEventListener("pointercancel", function () { dragging = false; });
      handle.addEventListener("keydown", function (ev) {
        var step = ev.shiftKey ? 0.05 : 0.005;
        if (ev.key === "ArrowLeft") { setEdge(which, (which === "a" ? selA : selB) - step); ev.preventDefault(); }
        else if (ev.key === "ArrowRight") { setEdge(which, (which === "a" ? selA : selB) + step); ev.preventDefault(); }
      });
    }

    function setEdge(which, t) {
      t = Math.max(0, Math.min(1, t));
      if (which === "a") selA = Math.min(t, selB - 0.004);
      else selB = Math.max(t, selA + 0.004);
      if (selA < 0) selA = 0;
      if (selB > 1) selB = 1;
      rendered = null; renderKey = "";
      paintHandles();
      drawWave();
      paintTime();
    }

    dragHandle(el.handleA, "a");
    dragHandle(el.handleB, "b");

    if (el.wrap) el.wrap.addEventListener("pointerdown", function (ev) {
      if (ev.target !== el.wave) return;
      var rect = el.wrap.getBoundingClientRect();
      var t = viewA + Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width))) * (viewB - viewA);
      if (Math.abs(t - selA) <= Math.abs(t - selB)) setEdge("a", t); else setEdge("b", t);
    });

    if (el.zoomIn) el.zoomIn.addEventListener("click", function () {
      if (zoom < ZOOMS.length - 1) { zoom++; lanePeakCache = {}; redraw(); }
    });
    if (el.zoomOut) el.zoomOut.addEventListener("click", function () {
      if (zoom > 0) { zoom--; lanePeakCache = {}; redraw(); }
    });

    // ---------- channel / reverse ----------
    if (el.wrap && el.wrap.parentNode) {
      var chanRow = panel.querySelector(".sfxd-wavebtns");
      if (chanRow) chanRow.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-sfxd-chan]");
        if (!btn) return;
        chanMode = btn.getAttribute("data-sfxd-chan");
        write("chan", chanMode);
        var all = chanRow.querySelectorAll("[data-sfxd-chan]");
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === btn;
          all[i].classList.toggle("is-on", on);
          all[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
        lanePeakCache = {};
        drawWave();
      });
    }

    if (el.reverse) el.reverse.addEventListener("click", function () {
      reversed = !reversed;
      el.reverse.classList.toggle("is-on", reversed);
      el.reverse.setAttribute("aria-pressed", reversed ? "true" : "false");
      rendered = null; renderKey = "";
      say(reversed ? "Segment reversed." : "Segment back to forwards.");
    });

    // ---------- FX ----------
    function fxLabel() {
      var bits = [];
      if (fx.gain) bits.push((fx.gain > 0 ? "+" : "") + fx.gain.toFixed(1) + " dB");
      if (fx.pitch) bits.push((fx.pitch > 0 ? "+" : "") + fx.pitch + " st");
      if (Math.abs(fx.speed - 1) > 0.001) bits.push(fx.speed.toFixed(2) + "×" + (lockPitch ? " (pitch locked)" : ""));
      if (el.fxState) el.fxState.textContent = bits.length ? bits.join(" · ") : "Effects";
      if (el.fxBtn) el.fxBtn.classList.toggle("is-active", bits.length > 0);
    }

    function readFx() {
      fx.gain = el.gain ? Number(el.gain.value) : 0;
      fx.pitch = el.pitch ? Number(el.pitch.value) : 0;
      fx.speed = el.speed ? Number(el.speed.value) / 100 : 1;
      if (el.gainVal) el.gainVal.textContent = fx.gain.toFixed(1) + " dB";
      if (el.pitchVal) el.pitchVal.textContent = (fx.pitch > 0 ? "+" : "") + fx.pitch + " st";
      if (el.speedVal) el.speedVal.textContent = fx.speed.toFixed(2) + "×";
      fxLabel();
      rendered = null; renderKey = "";
      write("fxGain", fx.gain); write("fxPitch", fx.pitch); write("fxSpeed", fx.speed);
      paintTime();
    }

    if (el.gain) el.gain.addEventListener("input", readFx);
    if (el.pitch) el.pitch.addEventListener("input", readFx);
    if (el.speed) el.speed.addEventListener("input", readFx);
    if (el.fxReset) el.fxReset.addEventListener("click", function () {
      if (el.gain) el.gain.value = 0;
      if (el.pitch) el.pitch.value = 0;
      if (el.speed) el.speed.value = 100;
      readFx();
      say("Effects back to unity.");
    });
    function paintLockPitch() {
      if (!el.lockPitch) return;
      el.lockPitch.classList.toggle("is-on", lockPitch);
      el.lockPitch.setAttribute("aria-pressed", lockPitch ? "true" : "false");
      el.lockPitch.title = lockPitch ? "Unlock pitch from speed" : "Lock pitch while changing speed";
    }
    if (el.lockPitch) el.lockPitch.addEventListener("click", function () {
      lockPitch = !lockPitch;
      write("lockPitch", lockPitch ? "1" : "0");
      paintLockPitch();
      readFx();
      say(lockPitch ? "Pitch locked: speed now changes only the length." : "Pitch follows speed again, like tape.");
    });

    if (el.fxBtn) el.fxBtn.addEventListener("click", function () {
      var open = el.fxRack.hidden;
      el.fxRack.hidden = !open;
      el.fxBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // ---------- rendering the segment ----------
    // Everything the user hears and everything that lands in the comp comes
    // out of here, so the two can never disagree.
    function segmentSlice(c) {
      var from = Math.floor(selA * buffer.length);
      var to = Math.max(from + 1, Math.floor(selB * buffer.length));
      var len = to - from;
      var out = c.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
      for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
        var src = buffer.getChannelData(ch);
        var dst = out.getChannelData(ch);
        if (reversed) for (var i = 0; i < len; i++) dst[i] = src[to - 1 - i];
        else dst.set(src.subarray(from, to));
      }
      return out;
    }

    function renderRate(buf, rate, gainLinear, done) {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var len = Math.max(1, Math.ceil(buf.length / rate));
      var off = new OAC(buf.numberOfChannels, len, buf.sampleRate);
      var src = off.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      if (gainLinear !== 1) {
        var g = off.createGain();
        g.gain.value = gainLinear;
        src.connect(g); g.connect(off.destination);
      } else {
        src.connect(off.destination);
      }
      src.start(0);
      var p = off.startRendering();
      if (p && p.then) p.then(done, function () { done(null); });
      else off.oncomplete = function (ev) { done(ev.renderedBuffer); };
    }

    // Overlap-add stretch with a Hann window, normalised by the window sum so
    // the level stays put at any hop. Good enough for one-shots and ambience,
    // which is what this panel is for; it is not a phase vocoder.
    function olaStretch(buf, factor, c) {
      if (Math.abs(factor - 1) < 0.002) return buf;
      var sr = buf.sampleRate;
      var grain = Math.max(256, Math.round(0.06 * sr));
      var hopA = Math.round(grain / 2);
      var hopS = Math.max(1, Math.round(hopA * factor));
      var target = Math.max(1, Math.round(buf.length * factor));
      var outLen = target + grain;
      var out = c.createBuffer(buf.numberOfChannels, target, sr);
      var scratch = [];
      var win = new Float32Array(grain), i;
      for (i = 0; i < grain; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / grain);

      for (var ch = 0; ch < buf.numberOfChannels; ch++) {
        var src = buf.getChannelData(ch);
        var dst = new Float32Array(outLen);
        var norm = new Float32Array(outLen);
        var pa = 0, ps = 0;
        while (pa + grain < buf.length && ps + grain < outLen) {
          for (i = 0; i < grain; i++) {
            dst[ps + i] += src[pa + i] * win[i];
            norm[ps + i] += win[i];
          }
          pa += hopA; ps += hopS;
        }
        for (i = 0; i < outLen; i++) if (norm[i] > 0.0001) dst[i] /= norm[i];
        scratch.push(dst);
      }
      for (ch = 0; ch < buf.numberOfChannels; ch++) {
        out.getChannelData(ch).set(scratch[ch].subarray(0, target));
      }
      return out;
    }

    function renderSegment(done) {
      var c = ctx();
      if (!c || !buffer) { done(null); return; }
      var key = [selA.toFixed(5), selB.toFixed(5), reversed ? 1 : 0, fx.gain, fx.pitch, fx.speed, lockPitch ? 1 : 0].join("|");
      if (rendered && renderKey === key) { done(rendered); return; }

      var sliced = segmentSlice(c);
      var linear = Math.pow(10, fx.gain / 20);

      function finish(buf) {
        if (!buf) { done(null); return; }
        rendered = buf; renderKey = key;
        done(buf);
      }

      function applySpeed(buf) {
        if (Math.abs(fx.speed - 1) < 0.002 && linear === 1) { finish(buf); return; }
        if (lockPitch && Math.abs(fx.speed - 1) >= 0.002) {
          // Pitch locked: change only the length, then apply the gain.
          var stretched = olaStretch(buf, 1 / fx.speed, c);
          if (linear === 1) finish(stretched);
          else renderRate(stretched, 1, linear, finish);
          return;
        }
        renderRate(buf, fx.speed, linear, finish);
      }

      if (fx.pitch !== 0) {
        var ratio = Math.pow(2, fx.pitch / 12);
        // resample to the new pitch (which shortens it), then stretch the
        // length back so only the pitch has moved
        renderRate(sliced, ratio, 1, function (shifted) {
          if (!shifted) { finish(null); return; }
          applySpeed(olaStretch(shifted, ratio, c));
        });
      } else {
        applySpeed(sliced);
      }
    }

    // ---------- transport ----------
    function stop() {
      if (source) { try { source.stop(); } catch (e) { /* already ended */ } source = null; }
      playing = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (el.playhead) el.playhead.style.opacity = "0";
      paintPlay();
    }

    function paintPlay() {
      if (!el.play) return;
      el.play.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5.5" width="3.6" height="13" rx="1"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>';
      el.play.title = playing ? "Pause the preview" : "Play the segment";
    }

    function play() {
      var c = ctx();
      if (!c) { say("This build has no audio output.", "error"); return; }
      if (!buffer) { say("Pick a sound first."); return; }
      stop();
      renderSegment(function (buf) {
        if (!buf) { say("Could not prepare that segment.", "error"); return; }
        source = c.createBufferSource();
        source.buffer = buf;
        source.loop = loop;
        source.connect(c.destination);
        source.onended = function () {
          if (source && !loop) {
            source = null; playing = false; paintPlay(); paintTime();
            if (el.playhead) el.playhead.style.opacity = "0";
          }
        };
        startedAt = c.currentTime;
        source.start(0);
        playing = true;
        paintPlay();
        tick();
      });
    }

    function tick() {
      if (!playing || !source || !source.buffer) return;
      var c = ctx();
      var dur = source.buffer.duration;
      var t = (c.currentTime - startedAt) % (dur || 1);
      var frac = dur ? t / dur : 0;
      var abs = selA + frac * (selB - selA);
      if (el.playhead && el.wrap) {
        var p = pos(abs);
        el.playhead.style.opacity = (p < 0 || p > 1) ? "0" : "1";
        el.playhead.style.left = Math.round(Math.max(0, Math.min(1, p)) * (el.wrap.clientWidth || 1)) + "px";
      }
      if (el.time) el.time.textContent = fmtTime(t);
      raf = requestAnimationFrame(tick);
    }

    function paintTime() {
      if (!el.time) return;
      if (!buffer) { el.time.textContent = "0:0.00"; return; }
      var segLen = (selB - selA) * buffer.duration / (fx.speed || 1);
      el.time.textContent = fmtTime(segLen);
    }

    function step(delta) {
      if (!view.length) return;
      var i = 0;
      if (current) {
        for (var k = 0; k < view.length; k++) if (view[k].path === current.path) { i = k; break; }
        i += delta;
      }
      if (i < 0) i = view.length - 1;
      if (i >= view.length) i = 0;
      select(view[i], true);
      var row = el.results && el.results.querySelector('[data-sfxd-i="' + i + '"]');
      if (row) { try { row.scrollIntoView({ block: "nearest" }); } catch (e) { row.scrollIntoView(); } }
    }

    if (el.play) el.play.addEventListener("click", function () { if (playing) { stop(); say("Stopped"); } else play(); });
    if (el.stopBtn) el.stopBtn.addEventListener("click", function () { stop(); if (el.time) el.time.textContent = "0:0.00"; });
    if (el.prev) el.prev.addEventListener("click", function () { step(-1); });
    if (el.next) el.next.addEventListener("click", function () { step(1); });
    if (el.loop) el.loop.addEventListener("click", function () {
      loop = !loop;
      write("loop", loop ? "1" : "0");
      el.loop.setAttribute("aria-pressed", loop ? "true" : "false");
      if (source) source.loop = loop;
      say(loop ? "Looping the segment." : "Loop off.");
    });
    if (el.clear) el.clear.addEventListener("click", function () {
      stop();
      current = null; buffer = null; rendered = null; renderKey = "";
      if (el.nowName) el.nowName.textContent = "Select a sound";
      if (el.pvName) el.pvName.textContent = "Nothing selected";
      if (el.format) el.format.textContent = "—";
      if (el.size) el.size.textContent = "—";
      if (el.length) el.length.textContent = "—";
      if (el.source) el.source.textContent = "—";
      if (el.tags) el.tags.innerHTML = "";
      paintResults();
      redraw();
      say("Selection cleared.");
    });

    // ---------- insert ----------
    function insert() {
      if (busy) return;
      if (!buffer || !current) { say("Pick a sound first.", "error"); return; }
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", "error"); return; }
      if (!fsMod || !osMod || !pathMod) { say("This build cannot write the rendered segment to disk.", "error"); return; }

      busy = true;
      if (el.shell) el.shell.classList.add("is-busy");
      say("Rendering the segment…");

      renderSegment(function (buf) {
        function fail(message) {
          busy = false;
          if (el.shell) el.shell.classList.remove("is-busy");
          say(message, "error");
        }
        if (!buf) { fail("Could not render that segment."); return; }

        // An untouched full clip is imported as-is; only a trimmed or
        // processed one is written out, so the project keeps the original
        // file wherever it can.
        var untouched = selA <= 0.0001 && selB >= 0.9999 && !reversed &&
          !fx.gain && !fx.pitch && Math.abs(fx.speed - 1) < 0.002;
        var outPath = current.remote ? current.local : current.path;
        var layerName = current.name;
        if (current.remote && !outPath) { fail("The Freesound download is not on disk yet."); return; }

        if (!untouched) {
          try {
            var wav = encodeWav(buf);
            var safe = current.name.replace(/[^A-Za-z0-9_\- ]+/g, "").slice(0, 40) || "segment";
            var stamp = String(Date.now()).slice(-8);
            outPath = pathMod.join(osMod.tmpdir(), "compx_sfx_" + safe.replace(/\s+/g, "_") + "_" + stamp + ".wav");
            fsMod.writeFileSync(outPath, Buffer.from ? Buffer.from(wav) : new Buffer(new Uint8Array(wav)));
            layerName = current.name + " [seg]";
          } catch (e) {
            fail("Could not write the rendered segment: " + e);
            return;
          }
        }

        var target = el.insertTarget ? el.insertTarget.value : "playhead";
        var organise = el.organise ? el.organise.value : "folder";
        host.call(
          'ae_sfxPlace(' + host.arg(outPath) + "," + host.arg(target) + "," + host.arg(layerName) + "," + host.arg(organise) + ")",
          function (parsed) {
            busy = false;
            if (el.shell) el.shell.classList.remove("is-busy");
            if (parsed && parsed.success) say(parsed.message || "Placed.", "ok");
            else say((parsed && (parsed.message || parsed.detail)) || "That did not work.", "error");
          }
        );
      });
    }

    if (el.insert) el.insert.addEventListener("click", insert);

    // ---------- chrome ----------
    if (el.settingsBtn) el.settingsBtn.addEventListener("click", function () {
      var open = el.settings.hidden;
      el.settings.hidden = !open;
      el.settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    if (el.togglePreview) el.togglePreview.addEventListener("click", function () {
      var open = el.preview.hidden;
      el.preview.hidden = !open;
      el.togglePreview.setAttribute("aria-pressed", open ? "true" : "false");
      write("preview", open ? "1" : "0");
      if (open) redraw();
    });

    if (el.insertTarget) el.insertTarget.addEventListener("change", function () { write("target", el.insertTarget.value); });
    if (el.organise) el.organise.addEventListener("change", function () { write("organise", el.organise.value); });
    if (el.autoPreview) el.autoPreview.addEventListener("change", function () { write("autoPlay", el.autoPreview.checked ? "1" : "0"); });

    // Leaving the tab should not leave a preview running.
    var rail = document.getElementById("appTabsRow");
    if (rail) rail.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".app-tab");
      if (btn && btn.getAttribute("data-apptab") !== "sfxdesign") stop();
      if (btn) closeMenu();
    });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        lanePeakCache = {};
        redraw();
        queueRowWaves();
      }, 140);
    });

    // ---------- restore ----------
    if (el.sort) el.sort.value = sortBy;
    if (el.insertTarget) el.insertTarget.value = read("target", "playhead");
    if (el.organise) el.organise.value = read("organise", "folder");
    if (el.autoPreview) el.autoPreview.checked = read("autoPlay", "1") === "1";
    if (el.gain) el.gain.value = read("fxGain", 0);
    if (el.pitch) el.pitch.value = read("fxPitch", 0);
    if (el.speed) el.speed.value = Math.round(Number(read("fxSpeed", 1)) * 100);
    if (el.loop) el.loop.setAttribute("aria-pressed", loop ? "true" : "false");
    if (el.density) el.density.setAttribute("aria-pressed", compact ? "true" : "false");
    if (el.preview && read("preview", "1") === "0") {
      el.preview.hidden = true;
      if (el.togglePreview) el.togglePreview.setAttribute("aria-pressed", "false");
    }
    var chanBtns = panel.querySelectorAll("[data-sfxd-chan]");
    for (var ci = 0; ci < chanBtns.length; ci++) {
      var chanOn = chanBtns[ci].getAttribute("data-sfxd-chan") === chanMode;
      chanBtns[ci].classList.toggle("is-on", chanOn);
      chanBtns[ci].setAttribute("aria-pressed", chanOn ? "true" : "false");
    }
    if (el.host && window.CompXHostBridge) el.host.classList.add("is-live");

    if (el.search) el.search.value = tabs[tabIdx].q || "";
    filter = tabs[tabIdx].filter || filter;
    paintTabs();
    paintSearchMode();
    paintLockPitch();
    paintLabelFilter();
    paintDropped();
    readFx();
    paintFilters();
    paintFolders();
    paintPlay();
    redraw();

    if (folders.length) rescan(true);
    render();
    if (activeFolder === CLOUD) fsSearch(false);
    say(folders.length
      ? items.length + " sounds indexed across " + folders.length + " folder" + (folders.length === 1 ? "" : "s") + "."
      : "Add a folder to index your sounds.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
