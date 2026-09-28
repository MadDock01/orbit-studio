/* ============================================================
   ORBIT POLISH

   1. Quick Find — press "/" (or Ctrl/Cmd+Shift+F, or the Find button
      in the title bar) and type: every button on every tab is listed
      with its tab and section. Enter runs it (after switching to its
      tab); Shift+Enter only takes you there. Anything that deletes,
      clears, resets or signs out is only ever taken to, never run.
   2. Interface size — 90% to 140%, from Plugin Settings or with
      Ctrl/Cmd + = / - / 0. Scales the whole panel like page zoom, so
      the 7px labels in the denser tabs become readable.
   3. Logo fallback — assets/compx-mark.png is not in every build; a
      broken image is replaced by an inline orbit mark.

   Nothing here touches main.js state; it only clicks the same buttons
   the user would.
   ============================================================ */
(function () {
  "use strict";

  var SCALE_KEY = "orbitUiScale";
  var RECENT_KEY = "orbitFindRecent";
  var SCALES = [0.9, 1, 1.1, 1.25, 1.4];
  var RISKY = /\b(delete|remove|clear|reset|purge|log ?out|sign ?out|uninstall|release|unrig|wipe)\b/i;
  var SKIP_LABEL = /^(apply|ok|cancel|close|\?|[✕×+\-–—…⋯·•▦☰↻]+)$/i;

  function store(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* sandboxed storage */ }
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  // ---------------------------------------------------------------- logo
  var MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)"/>' +
    '<circle cx="12" cy="12" r="4.4"/><circle class="core" cx="12" cy="12" r="1.9"/></svg>';

  function fixLogo(img) {
    if (!img || img.dataset.orbitFallback) return;
    function swap() {
      if (img.dataset.orbitFallback) return;
      img.dataset.orbitFallback = "1";
      var w = img.getBoundingClientRect().width || Number(img.getAttribute("width")) || 22;
      var h = img.getBoundingClientRect().height || Number(img.getAttribute("height")) || 22;
      var span = document.createElement("span");
      span.className = "orbit-logo-fallback " + (img.className || "");
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", img.getAttribute("alt") || "Orbit Studio");
      span.style.width = w + "px";
      span.style.height = h + "px";
      span.innerHTML = MARK;
      img.parentNode.replaceChild(span, img);
    }
    if (img.complete && !img.naturalWidth) swap();
    else img.addEventListener("error", swap);
  }

  // --------------------------------------------------------- interface size
  function currentScale() {
    var v = Number(store(SCALE_KEY, "1"));
    return SCALES.indexOf(v) >= 0 ? v : 1;
  }
  function applyScale(v, announce) {
    document.documentElement.style.zoom = v === 1 ? "" : String(v);
    save(SCALE_KEY, String(v));
    paintScaleCard();
    // Canvases (waveforms, curves) measure themselves on resize.
    try { window.dispatchEvent(new Event("resize")); } catch (e) { /* old CEP */ }
    if (announce && typeof window.showToast === "function") {
      try { window.showToast("Interface size " + Math.round(v * 100) + "%"); } catch (e) { /* no toast */ }
    }
  }
  function stepScale(dir) {
    var i = SCALES.indexOf(currentScale());
    if (dir === 0) { applyScale(1, true); return; }
    i = Math.max(0, Math.min(SCALES.length - 1, i + dir));
    applyScale(SCALES[i], true);
  }

  var scaleCard = null;
  function buildScaleCard() {
    var body = document.querySelector("#lgSettingsModal .lg-settings-body");
    if (!body || scaleCard) return;
    scaleCard = document.createElement("div");
    scaleCard.className = "orbit-uiscale-card";
    var html = "<h4>INTERFACE SIZE</h4><p>Makes every label and button in the panel bigger or smaller. Shortcut: Ctrl + = / − / 0.</p>" +
      '<div class="orbit-uiscale-row" role="group" aria-label="Interface size">';
    for (var i = 0; i < SCALES.length; i++) {
      html += '<button type="button" data-orbit-scale="' + SCALES[i] + '">' + Math.round(SCALES[i] * 100) + "%</button>";
    }
    scaleCard.innerHTML = html + "</div>";
    body.insertBefore(scaleCard, body.firstChild);
    scaleCard.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-orbit-scale]");
      if (b) applyScale(Number(b.getAttribute("data-orbit-scale")), false);
    });
    paintScaleCard();
  }
  function paintScaleCard() {
    if (!scaleCard) return;
    var v = currentScale();
    var btns = scaleCard.querySelectorAll("[data-orbit-scale]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", Number(btns[i].getAttribute("data-orbit-scale")) === v ? "true" : "false");
    }
  }

  // ------------------------------------------------------------ quick find
  var find = null, input = null, list = null, results = [], cursor = 0, lastFocus = null;

  function tabTitle(tab) {
    var b = document.querySelector('#appTabsRow [data-apptab="' + tab + '"]');
    return b ? (b.getAttribute("title") || tab) : tab;
  }

  // Text split at element boundaries, so a card's badge, title and blurb
  // come back as separate lines instead of "TEXTGLOWVOX Flicker…".
  function textLines(el) {
    var lines = [], cur = "";
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) cur += c.nodeValue;
        else if (c.nodeType === 1 && c.tagName !== "svg" && c.tagName !== "SVG") {
          lines.push(cur); cur = "";
          walk(c);
          lines.push(cur); cur = "";
        }
      }
    })(el);
    lines.push(cur);
    return lines.map(function (l) { return l.replace(/\s+/g, " ").trim(); })
      .filter(function (l) { return /[A-Za-z0-9\u0980-\u09FF]/.test(l); });
  }

  function labelOf(el) {
    var t = (el.getAttribute("aria-label") || "").trim();
    var title = (el.getAttribute("title") || "").split(/ — | – | - |\. |: /)[0].trim();
    if (!t) {
      var lines = textLines(el);
      if (lines.length === 1) t = lines[0];
      else if (lines.length > 1) t = title && title.length <= 40 ? title : lines.join(" ");
    }
    if (t.length < 2) t = title;
    return t.replace(/^[^A-Za-z0-9\u0980-\u09FF]+/, "").slice(0, 60);
  }

  function sectionOf(el) {
    var sec = el.closest(".tool-section, .tool-subgroup, .sfxd-preview, .sfxd-lib, .sfxd-settings, .lg-plugin-card, [class*='-card'], [class*='section']");
    if (!sec) return "";
    var head = sec.querySelector(".tool-section-title, .tool-subgroup-title") ||
      sec.querySelector(".tool-section-head, h1, h2, h3, h4, b, strong");
    var t = head ? (head.textContent || "").replace(/\s+/g, " ").replace(/[\s?]+$/, "").trim() : "";
    return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }

  function buildIndex() {
    var out = [], seen = {};
    function add(el, tab, where) {
      if (el.disabled || el.closest(".orbit-find, .modal-backdrop, #sfxdResults, #sfxdFolders, #sfxdMenu, #tanimList, #library, #folderTree, .sfxd-tabs")) return;
      var label = labelOf(el);
      if (!label || SKIP_LABEL.test(label)) return;
      var section = sectionOf(el);
      var key = (tab || "") + "|" + section + "|" + label.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push({
        el: el, tab: tab, where: where || (tab ? tabTitle(tab) : "Always visible"),
        label: label, section: section === label ? "" : section,
        hint: (el.getAttribute("title") || "").slice(0, 120),
        risky: RISKY.test(label)
      });
    }
    // the tabs themselves
    var tabs = document.querySelectorAll("#appTabsRow .app-tab[data-apptab]");
    for (var i = 0; i < tabs.length; i++) {
      out.push({ el: tabs[i], tab: null, where: "Tab", label: "Go to " + (tabs[i].getAttribute("title") || tabs[i].dataset.apptab), section: "", hint: "", risky: false, isTab: true });
    }
    var panels = document.querySelectorAll(".app-panel[id^='panel-']");
    for (i = 0; i < panels.length; i++) {
      var tab = panels[i].id.slice(6);
      if (!document.querySelector('#appTabsRow [data-apptab="' + tab + '"]')) continue;
      var btns = panels[i].querySelectorAll("button, [role='button']");
      for (var j = 0; j < btns.length; j++) add(btns[j], tab);
    }
    var docks = document.querySelectorAll("#orbitGlobalDock, #orbitBottomDock");
    for (i = 0; i < docks.length; i++) {
      var db = docks[i].querySelectorAll("button, [role='button']");
      for (j = 0; j < db.length; j++) add(db[j], null, docks[i].id === "orbitBottomDock" ? "Bottom dock" : "Top dock");
    }
    return out;
  }

  var index = null;

  function score(item, q) {
    var label = item.label.toLowerCase();
    var hay = (label + " " + item.section + " " + item.where + " " + item.hint).toLowerCase();
    var words = q.split(/\s+/), total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var at = label.indexOf(w);
      if (at === 0) total += 60;
      else if (at > 0 && /[\s\-\/(]/.test(label.charAt(at - 1))) total += 40;
      else if (at > 0) total += 25;
      else if (hay.indexOf(w) >= 0) total += 8;
      else {
        // letters in order, e.g. "prsp" -> "Precomp Separate"
        var k = 0;
        for (var c = 0; c < label.length && k < w.length; c++) if (label.charAt(c) === w.charAt(k)) k++;
        if (k < w.length) return -1;
        total += 3;
      }
    }
    if (item.isTab) total += 2;
    return total - label.length * 0.05;
  }

  function recent() {
    try { return JSON.parse(store(RECENT_KEY, "[]")) || []; } catch (e) { return []; }
  }

  function highlight(label, q) {
    var words = q.split(/\s+/).filter(Boolean), out = esc(label);
    for (var i = 0; i < words.length; i++) {
      var at = label.toLowerCase().indexOf(words[i]);
      if (at < 0) continue;
      var raw = label.substr(at, words[i].length);
      out = out.replace(esc(raw), "<mark>" + esc(raw) + "</mark>");
    }
    return out;
  }

  function paint() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      var r = recent(), picks = [];
      for (var i = 0; i < r.length; i++) {
        for (var j = 0; j < index.length; j++) {
          if (index[j].label === r[i].label && (index[j].tab || "") === (r[i].tab || "")) { picks.push(index[j]); break; }
        }
      }
      results = picks;
    } else {
      var scored = [];
      for (var k = 0; k < index.length; k++) {
        var s = score(index[k], q);
        if (s >= 0) scored.push({ s: s, it: index[k] });
      }
      scored.sort(function (a, b) { return b.s - a.s; });
      results = scored.slice(0, 40).map(function (x) { return x.it; });
    }
    cursor = Math.min(cursor, Math.max(0, results.length - 1));
    if (!results.length) {
      list.innerHTML = '<li class="orbit-find-empty">' + (q ? "No tool matches “" + esc(input.value.trim()) + "”." : "Type a tool name — e.g. precomp, glow, caption, crop.") + "</li>";
      return;
    }
    var html = "";
    for (var n = 0; n < results.length; n++) {
      var it = results[n];
      html += '<li class="orbit-find-item' + (n === cursor ? " is-on" : "") + '" role="option" id="orbitFindOpt' + n + '" data-i="' + n + '" aria-selected="' + (n === cursor) + '">' +
        "<b>" + highlight(it.label, q) + "</b>" +
        "<em>" + esc(it.where) + "</em>" +
        "<small>" + esc([it.section, it.risky ? "opens only — confirm there" : ""].filter(Boolean).join(" · ") || it.hint || " ") + "</small></li>";
    }
    list.innerHTML = html;
    input.setAttribute("aria-activedescendant", "orbitFindOpt" + cursor);
    var on = list.querySelector(".is-on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }

  function remember(it) {
    var r = recent().filter(function (x) { return !(x.label === it.label && (x.tab || "") === (it.tab || "")); });
    r.unshift({ label: it.label, tab: it.tab || "" });
    save(RECENT_KEY, JSON.stringify(r.slice(0, 6)));
  }

  function flash(el) {
    el.classList.add("orbit-find-flash");
    setTimeout(function () { el.classList.remove("orbit-find-flash"); }, 1600);
  }

  function go(it, run) {
    close();
    remember(it);
    if (it.isTab) { it.el.click(); return; }
    if (it.tab) {
      var active = document.querySelector("#appTabsRow .app-tab.active");
      if (!active || active.getAttribute("data-apptab") !== it.tab) {
        var tabBtn = document.querySelector('#appTabsRow [data-apptab="' + it.tab + '"]');
        if (tabBtn) tabBtn.click();
      }
    }
    setTimeout(function () {
      var el = it.el;
      if (!visible(el)) {
        // Hidden inside a sub-view: open the shelf or library tab that holds it.
        var shelfView = el.closest("#textAnimView, #motionPresetView, #ffxPresetView");
        if (shelfView) {
          var type = shelfView.id === "textAnimView" ? "textanim" : shelfView.id === "motionPresetView" ? "motions" : "ffx";
          var shelf = document.querySelector('#assetTypeRow [data-type="' + type + '"]');
          if (shelf) shelf.click();
        }
        var sub = el.closest("[data-text-library-panel]");
        if (sub) {
          var t = document.querySelector('[data-text-library-tab="' + sub.getAttribute("data-text-library-panel") + '"]');
          if (t) t.click();
        }
      }
      setTimeout(function () {
        if (!visible(el)) return;
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); }
        flash(el);
        if (run && !it.risky) el.click();
        else { try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
      }, 60);
    }, 60);
  }

  function open() {
    if (!find) buildFind();
    lastFocus = document.activeElement;
    index = buildIndex();
    cursor = 0;
    input.value = "";
    find.hidden = false;
    paint();
    setTimeout(function () { input.focus(); }, 0);
  }

  function close() {
    if (!find || find.hidden) return;
    find.hidden = true;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    }
  }

  function buildFind() {
    find = document.createElement("div");
    find.className = "orbit-find";
    find.hidden = true;
    find.setAttribute("role", "dialog");
    find.setAttribute("aria-modal", "true");
    find.setAttribute("aria-label", "Quick Find");
    find.innerHTML =
      '<div class="orbit-find-box">' +
      '<div class="orbit-find-head"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
      '<input class="orbit-find-input" type="text" placeholder="Find a tool…" aria-label="Find a tool" role="combobox" aria-expanded="true" aria-controls="orbitFindList" autocomplete="off" spellcheck="false"/></div>' +
      '<ul class="orbit-find-list" id="orbitFindList" role="listbox" aria-label="Tools"></ul>' +
      '<div class="orbit-find-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> go to</span><span><kbd>Esc</kbd> close</span></div>' +
      "</div>";
    document.body.appendChild(find);
    input = find.querySelector(".orbit-find-input");
    list = find.querySelector(".orbit-find-list");

    input.addEventListener("input", function () { cursor = 0; paint(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!results.length) return;
        cursor = (cursor + (ev.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
        paint();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (results[cursor]) go(results[cursor], !ev.shiftKey);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    });
    list.addEventListener("mousemove", function (ev) {
      var li = ev.target.closest("[data-i]");
      if (!li) return;
      var i = Number(li.getAttribute("data-i"));
      if (i !== cursor) { cursor = i; paint(); }
    });
    list.addEventListener("click", function (ev) {
      var li = ev.target.closest("[data-i]");
      if (li && results[Number(li.getAttribute("data-i"))]) go(results[Number(li.getAttribute("data-i"))], !ev.shiftKey);
    });
    find.addEventListener("mousedown", function (ev) { if (ev.target === find) close(); });
  }

  function addFindButton() {
    var bar = document.querySelector("#app .cx-brand-bar");
    if (!bar || document.getElementById("orbitFindBtn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "orbitFindBtn";
    btn.className = "orbit-find-btn";
    btn.title = "Quick Find — search every tool (/)";
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>Find tool</span><kbd>/</kbd>';
    var status = bar.querySelector(".orbit-host-status");
    bar.insertBefore(btn, status || null);
    btn.addEventListener("click", open);
  }

  function typing(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  document.addEventListener("keydown", function (ev) {
    var mod = ev.ctrlKey || ev.metaKey;
    if (!typing(ev.target) && !mod && !ev.altKey && ev.key === "/") {
      ev.preventDefault(); open(); return;
    }
    if (mod && ev.shiftKey && String(ev.key).toLowerCase() === "f") {
      ev.preventDefault(); open(); return;
    }
    if (mod && !ev.shiftKey && !ev.altKey) {
      if (ev.key === "=" || ev.key === "+") { ev.preventDefault(); stepScale(1); }
      else if (ev.key === "-" || ev.key === "_") { ev.preventDefault(); stepScale(-1); }
      else if (ev.key === "0") { ev.preventDefault(); stepScale(0); }
    }
  });

  // ------------------------------------------------------------------ init
  // The saved size goes on before first paint of the panel content.
  if (currentScale() !== 1) document.documentElement.style.zoom = String(currentScale());

  function init() {
    var logos = document.querySelectorAll("img.cx-header-logo, .cx-gate__mark img");
    for (var i = 0; i < logos.length; i++) fixLogo(logos[i]);
    addFindButton();
    buildScaleCard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.OrbitQuickFind = { open: open, close: close };
})();
