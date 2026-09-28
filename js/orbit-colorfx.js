/* ============================================================
   ORBIT COLOR FX — Animation tab > COLOR FX

   Ten viral text colour animations. After Effects builds them live from
   text animators (ae_textColorFx in hostscript.jsx); this file draws the
   cards and animates their previews with the same maths the expressions
   use, so a card moves the way the text will.

   Per character (or word) every style answers one question: how much of
   colour B is on it right now (0..1), plus hue, scale, opacity or glow for
   the styles that use them. Colour A is always the base.

   Loads before main.js (compx-loader injects main.js only after the
   licence check), so the host bridge is looked up at click time.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXColorFx.";
  var FPS = 25;

  var STYLES = [
    { id: "rainbow", name: "Rainbow Wave", desc: "A hue wave rolls through every letter", sample: "RAINBOW", unit: "char", loop: true },
    { id: "confetti", name: "Confetti Letters", desc: "Letters jump between random colours", sample: "PARTY", unit: "char", loop: true },
    { id: "karaoke", name: "Karaoke Fill", desc: "Words fill with the accent one by one", sample: "SING IT NOW", unit: "word", loop: false },
    { id: "activeWord", name: "Active Word", desc: "One word at a time lights up and grows", sample: "GO VIRAL NOW", unit: "word", loop: true },
    { id: "shine", name: "Shine Sweep", desc: "A soft band of colour sweeps across", sample: "SHINE", unit: "char", loop: true },
    { id: "wipe", name: "Color Wipe", desc: "A smooth colour change runs letter by letter", sample: "WIPE", unit: "char", loop: false },
    { id: "blink", name: "Duotone Blink", desc: "The whole line flips between both colours", sample: "BLINK", unit: "char", loop: true },
    { id: "neon", name: "Neon Flicker", desc: "Glowing letters flicker like a broken sign", sample: "NEON", unit: "char", loop: true },
    { id: "pop", name: "Pop Highlight", desc: "Words pop in flashing the accent, then settle", sample: "POP IT UP", unit: "word", loop: false },
    { id: "pulse", name: "Color Pulse", desc: "A smooth wave of accent pulses along", sample: "PULSE", unit: "char", loop: true }
  ];

  var PALETTES = [
    { name: "Viral Yellow", a: "#ffffff", b: "#ffd400" },
    { name: "Hot Pink", a: "#ffffff", b: "#ff2e88" },
    { name: "Cyan Pop", a: "#ffffff", b: "#00e5ff" },
    { name: "Fire", a: "#ff3b1f", b: "#ffd000" },
    { name: "Mint", a: "#eafff0", b: "#3cff5f" },
    { name: "Purple Haze", a: "#9b5cff", b: "#ff6ad5" },
    { name: "Ice", a: "#7cc8ff", b: "#ffffff" }
  ];

  function read(key, def) {
    try { var v = localStorage.getItem(STORE + key); return v === null ? def : v; } catch (e) { return def; }
  }
  function write(key, v) {
    try { localStorage.setItem(STORE + key, String(v)); } catch (e) { /* sandboxed storage */ }
  }

  function hexRgb(hex) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    if (!isFinite(n)) n = 0xffffff;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function rgbCss(c) {
    return "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // Same rule as compxCfxVivid on the host: hue shifts need a coloured base.
  function vivid(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    return (mx - mn) < 0.25 ? [1, 0.22, 0.42] : c;
  }

  // Deterministic 0..1 from an integer seed, standing in for seedRandom.
  function rand(seed) {
    var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // A one-pass style runs over `frames`, holds, then the preview restarts.
  function passProgress(t, frames) {
    var run = frames / FPS, hold = 0.9;
    var local = t % (run + hold);
    return clamp01(local / run);
  }

  function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  // What a unit (char or word) looks like at time t.
  function look(id, t, i, n, speed, frames) {
    var out = { b: 0, hue: 0, scale: 1, opacity: 1, glow: 0 };
    var x = n > 1 ? i / n : 0;
    var p;
    switch (id) {
      case "rainbow":
        out.hue = ((t * speed * 0.5 + x) % 1) * 360;
        break;
      case "confetti":
        out.hue = rand(i * 13 + Math.floor(t * 6 * speed) * 7) * 360;
        break;
      case "karaoke":
        p = passProgress(t, frames);
        out.b = p * n - i >= 0.5 ? 1 : 0;
        break;
      case "wipe":
        p = easeInOut(passProgress(t, frames));
        out.b = clamp01(p * (n + 1) - i);
        break;
      case "activeWord":
        if (Math.floor(t * 2 * speed) % Math.max(1, n) === i) { out.b = 1; out.scale = 1.12; }
        break;
      case "shine": {
        var o = -28 + ((t * speed * 0.6) % 1) * 156;
        var c = (i + 0.5) / n * 100;
        out.b = c >= o && c <= o + 28 ? Math.sin(Math.PI * (c - o) / 28) : 0;
        break;
      }
      case "blink":
        out.b = Math.floor(t * 4 * speed) % 2 === 0 ? 0 : 1;
        break;
      case "neon":
        out.b = rand(i * 31 + Math.floor(t * 12 * speed)) < 0.22 ? 0 : 1;
        out.glow = out.b;
        break;
      case "pop": {
        var start = easeInOut(passProgress(t, frames)) * 100;
        var centre = (i + 0.5) / n * 100;
        var land = clamp01((start - i / n * 100) / (100 / n));
        out.scale = land;
        out.opacity = land;
        out.b = centre <= start && centre >= start - 20 ? 1 : 0;
        break;
      }
      case "pulse":
        out.b = 0.5 + 0.5 * Math.sin((x * 2 - t * speed) * Math.PI * 2);
        break;
    }
    return out;
  }

  function init() {
    var grid = document.getElementById("cfxGrid");
    if (!grid) return;
    var el = {
      a: document.getElementById("cfxColorA"),
      b: document.getElementById("cfxColorB"),
      swap: document.getElementById("cfxSwap"),
      palettes: document.getElementById("cfxPalettes"),
      speed: document.getElementById("cfxSpeed"),
      frames: document.getElementById("cfxFrames"),
      clean: document.getElementById("cfxClean"),
      status: document.getElementById("cfxStatus"),
      shell: document.getElementById("cfxShell")
    };
    var state = {
      a: read("a", "#ffffff"),
      b: read("b", "#ffd400"),
      speed: Math.max(0.1, Math.min(5, Number(read("speed", 1)) || 1)),
      frames: Math.max(2, Math.min(600, Math.round(Number(read("frames", 30)) || 30)))
    };
    var cards = [];
    var busy = false, raf = 0, t0 = 0;

    function say(msg, kind) {
      if (!el.status) return;
      el.status.textContent = msg;
      el.status.classList.toggle("is-error", kind === "error");
      el.status.classList.toggle("is-ok", kind === "ok");
    }

    // ---- cards ----
    STYLES.forEach(function (st) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "cfx-card";
      card.setAttribute("data-cfx", st.id);
      card.title = st.name + " — " + st.desc;

      var stage = document.createElement("div");
      stage.className = "cfx-stage";
      var word = document.createElement("div");
      word.className = "cfx-word";
      var units = [];
      if (st.unit === "word") {
        word.classList.add("is-words");
        st.sample.split(" ").forEach(function (w, wi) {
          if (wi) word.appendChild(document.createTextNode(" "));
          var span = document.createElement("span");
          span.className = "cfx-u";
          span.textContent = w;
          word.appendChild(span);
          units.push(span);
        });
      } else {
        st.sample.split("").forEach(function (ch) {
          var span = document.createElement("span");
          span.className = "cfx-u";
          span.textContent = ch;
          word.appendChild(span);
          units.push(span);
        });
      }
      stage.appendChild(word);
      var badge = document.createElement("span");
      badge.className = "cfx-badge";
      badge.textContent = st.loop ? "LOOP" : "ONE PASS";
      stage.appendChild(badge);

      var meta = document.createElement("div");
      meta.className = "cfx-meta";
      var title = document.createElement("strong");
      title.textContent = st.name;
      var sub = document.createElement("small");
      sub.textContent = st.desc;
      meta.appendChild(title);
      meta.appendChild(sub);

      card.appendChild(stage);
      card.appendChild(meta);
      card.addEventListener("click", function () { apply(st); });
      grid.appendChild(card);
      cards.push({ style: st, units: units, el: card });
    });

    // ---- palettes ----
    PALETTES.forEach(function (pal) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cfx-chip";
      chip.title = pal.name;
      // A custom property, because the theme's #app button background wins over inline style.
      chip.style.setProperty("--cfx-chip", "linear-gradient(135deg, " + pal.a + " 0 50%, " + pal.b + " 50% 100%)");
      chip.addEventListener("click", function () {
        state.a = pal.a; state.b = pal.b;
        commit();
      });
      el.palettes.appendChild(chip);
    });

    function commit() {
      write("a", state.a); write("b", state.b); write("speed", state.speed); write("frames", state.frames);
      el.a.value = state.a;
      el.b.value = state.b;
      if (document.activeElement !== el.speed) el.speed.value = state.speed;
      if (document.activeElement !== el.frames) el.frames.value = state.frames;
    }

    // ---- preview loop ----
    function visible() {
      var panel = grid.closest("[data-text-library-panel]");
      return !!grid.offsetParent && !(panel && panel.hidden);
    }

    function frame(now) {
      raf = 0;
      if (!visible()) return;
      if (!t0) t0 = now;
      var t = (now - t0) / 1000;
      var A = hexRgb(state.a), B = hexRgb(state.b);
      for (var c = 0; c < cards.length; c++) {
        var card = cards[c], st = card.style, n = card.units.length;
        var base = st.id === "rainbow" || st.id === "confetti" ? vivid(A) : A;
        for (var i = 0; i < n; i++) {
          var lk = look(st.id, t, i, n, state.speed, state.frames);
          var span = card.units[i];
          span.style.color = rgbCss(mix(base, B, lk.b));
          span.style.filter = lk.hue ? "hue-rotate(" + Math.round(lk.hue) + "deg)" : "";
          span.style.transform = lk.scale !== 1 ? "scale(" + lk.scale.toFixed(3) + ")" : "";
          span.style.opacity = lk.opacity !== 1 ? lk.opacity.toFixed(3) : "";
          span.style.textShadow = lk.glow ? "0 0 3px " + rgbCss(B) + ", 0 0 12px " + rgbCss(B) : "";
        }
      }
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!raf && visible()) raf = requestAnimationFrame(frame);
    }

    // The previews only run while the COLOR FX tab is on screen.
    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest("[data-text-library-tab], .app-tab")) setTimeout(wake, 30);
    });
    if (window.IntersectionObserver) new IntersectionObserver(wake).observe(grid);

    // ---- apply ----
    function apply(st) {
      if (busy) return;
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", "error"); return; }
      busy = true;
      el.shell.classList.add("is-busy");
      say("Applying " + st.name + "…");
      var payload = { a: hexRgb(state.a), b: hexRgb(state.b), speed: state.speed, frames: state.frames, sample: st.sample };
      host.call("ae_textColorFx(" + host.arg(st.id) + "," + host.arg(JSON.stringify(payload)) + ")", function (res) {
        busy = false;
        el.shell.classList.remove("is-busy");
        if (res && res.success) say(res.message || st.name + " applied.", "ok");
        else say((res && (res.message || res.detail)) || "That did not work.", "error");
      });
    }

    el.clean.addEventListener("click", function () {
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", "error"); return; }
      host.call("ae_textColorFxClean()", function (res) {
        say((res && res.message) || "Done", res && res.success ? "ok" : "error");
      });
    });

    el.a.addEventListener("input", function () { state.a = el.a.value; commit(); });
    el.b.addEventListener("input", function () { state.b = el.b.value; commit(); });
    el.swap.addEventListener("click", function () { var t = state.a; state.a = state.b; state.b = t; commit(); });
    el.speed.addEventListener("change", function () {
      var v = Number(el.speed.value);
      state.speed = isFinite(v) ? Math.max(0.1, Math.min(5, v)) : 1;
      el.speed.value = state.speed; commit();
    });
    el.frames.addEventListener("change", function () {
      var v = Math.round(Number(el.frames.value));
      state.frames = isFinite(v) ? Math.max(2, Math.min(600, v)) : 30;
      el.frames.value = state.frames; commit();
    });

    commit();
    say("Select text layers (or none for a demo), then click a style.");
    wake();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
