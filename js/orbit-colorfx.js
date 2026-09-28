/* ============================================================
   ORBIT COLOR FX — Animation tab > COLOR FX

   125 viral text colour styles. Each style is an ENGINE (how the colour
   moves: 21 of them) plus a variant (direction, unit, spread, size...)
   plus a three-colour palette. After Effects builds the engine live from
   text animators (ae_textColorFx in hostscript.jsx); this file lists the
   styles, draws the cards and animates each preview with the same maths
   the expressions use, so a card moves the way the text will.

   Per unit (character or word) an engine answers: how much of colour B
   and colour C is on it now (0..1), plus hue, scale, lift, opacity and
   glow where the engine uses them. Colour A is always the base.

   Loads before main.js (compx-loader injects main.js only after the
   licence check), so the host bridge is looked up at click time.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXColorFx.";
  var FPS = 25;

  // ---------- palettes: A base, B accent, C third ----------
  var PALETTES = {
    viral: { name: "Viral Yellow", a: "#ffffff", b: "#ffd400", c: "#ff2e88" },
    hotpink: { name: "Hot Pink", a: "#ffffff", b: "#ff2e88", c: "#7a5cff" },
    cyan: { name: "Cyan Pop", a: "#ffffff", b: "#00e5ff", c: "#ffd400" },
    fire: { name: "Fire", a: "#ff3b1f", b: "#ffd000", c: "#ffffff" },
    mint: { name: "Mint", a: "#eafff0", b: "#3cff5f", c: "#00c2ff" },
    purple: { name: "Purple Haze", a: "#9b5cff", b: "#ff6ad5", c: "#ffffff" },
    ice: { name: "Ice", a: "#7cc8ff", b: "#ffffff", c: "#b5f2ff" },
    sunset: { name: "Sunset", a: "#ff7a18", b: "#ff2e63", c: "#ffd166" },
    ocean: { name: "Ocean", a: "#00b4d8", b: "#caf0f8", c: "#0077b6" },
    lime: { name: "Lime Punch", a: "#ffffff", b: "#b6ff00", c: "#00ffa3" },
    gold: { name: "Gold Luxe", a: "#fff3d6", b: "#ffc94d", c: "#e59a00" },
    blood: { name: "Blood Red", a: "#ffffff", b: "#ff1f3d", c: "#ffd400" },
    toxic: { name: "Toxic", a: "#39ff14", b: "#ffe600", c: "#00ffd5" },
    candy: { name: "Candy", a: "#ff9ad5", b: "#9ad0ff", c: "#fff59a" },
    mono: { name: "Mono Punch", a: "#9aa0a6", b: "#ffffff", c: "#ffe600" },
    retro: { name: "Retro", a: "#ffcb05", b: "#ff5e5b", c: "#00cecb" },
    tiktok: { name: "TikTok", a: "#ffffff", b: "#25f4ee", c: "#fe2c55" },
    youtube: { name: "YouTube", a: "#ffffff", b: "#ff0000", c: "#ffd400" },
    insta: { name: "Insta", a: "#feda75", b: "#d62976", c: "#962fbf" }
  };

  // ---------- engines ----------
  // fam: category. sample: preview text. loop: repeats vs one pass.
  // v: variants [label, params]. p: palette ids.
  var ENGINES = [
    { id: "rainbow", name: "Rainbow Wave", fam: "Rainbow & Hue", sample: "RAINBOW", loop: true, desc: "A hue wave rolls through every letter",
      v: [["", { cycles: 1 }], ["Tight", { cycles: 2 }]], p: ["fire", "purple", "toxic"] },
    { id: "hueSpin", name: "Hue Spin", fam: "Rainbow & Hue", sample: "SPIN", loop: true, desc: "The whole line cycles through every hue",
      v: [["", {}], ["Glow", { glow: true }]], p: ["fire", "sunset", "tiktok"] },
    { id: "confetti", name: "Confetti Letters", fam: "Rainbow & Hue", sample: "PARTY", loop: true, desc: "Letters jump between random hues",
      v: [["", { rate: 6 }], ["Fast", { rate: 12 }]], p: ["candy", "fire", "ocean"] },
    { id: "confetti3", name: "3-Color Confetti", fam: "Multi-Color", sample: "HYPE", loop: true, desc: "Letters shuffle between the three palette colours",
      v: [["", { rate: 5 }]], p: ["tiktok", "insta", "retro", "candy", "viral", "sunset"] },
    { id: "triCycle", name: "Tri-Color Cycle", fam: "Multi-Color", sample: "TRIPLE", loop: true, desc: "A, B and C march through the letters in turn",
      v: [["", { rate: 3 }], ["Fast", { rate: 8 }]], p: ["tiktok", "insta", "retro"] },
    { id: "alternate", name: "Alternate", fam: "Multi-Color", sample: "SWITCH", loop: true, desc: "Every other letter swaps colour on the beat",
      v: [["", { rate: 3 }]], p: ["viral", "hotpink", "cyan", "youtube", "mint"] },
    { id: "karaoke", name: "Karaoke Fill", fam: "Reveal", sample: "SING IT NOW", loop: false, desc: "Words fill with the accent one by one",
      v: [["", { unit: "word" }], ["Reverse", { unit: "word", dir: -1 }], ["Letters", { unit: "char" }]], p: ["viral", "tiktok", "gold"] },
    { id: "wipe", name: "Color Wipe", fam: "Reveal", sample: "WIPE", loop: false, desc: "A smooth colour change runs across",
      v: [["", {}], ["Reverse", { dir: -1 }]], p: ["fire", "ocean", "mint", "purple"] },
    { id: "randomFill", name: "Random Fill", fam: "Reveal", sample: "RANDOM", loop: false, desc: "Letters take the accent in random order",
      v: [["", {}]], p: ["viral", "cyan", "hotpink", "toxic"] },
    { id: "centerOut", name: "Center Out", fam: "Reveal", sample: "CENTER", loop: false, desc: "Colour spreads from the middle to the edges",
      v: [["", {}]], p: ["gold", "ice", "sunset"] },
    { id: "pop", name: "Pop Highlight", fam: "Reveal", sample: "POP IT UP", loop: false, desc: "Units pop in flashing the accent, then settle",
      v: [["", { unit: "word" }], ["Letters", { unit: "char" }]], p: ["viral", "hotpink", "cyan"] },
    { id: "activeWord", name: "Active Word", fam: "Highlight", sample: "GO VIRAL NOW", loop: true, desc: "One word at a time lights up and grows",
      v: [["", { unit: "word", rate: 2 }], ["Big", { unit: "word", rate: 2, scale: 125 }], ["Letter", { unit: "char", rate: 6 }]], p: ["viral", "tiktok", "youtube", "lime"] },
    { id: "shine", name: "Shine Sweep", fam: "Highlight", sample: "SHINE", loop: true, desc: "A soft band of colour sweeps across",
      v: [["", { width: 28 }], ["Reverse", { width: 28, dir: -1 }], ["Wide", { width: 50 }]], p: ["gold", "ice", "viral"] },
    { id: "heartbeat", name: "Heartbeat", fam: "Highlight", sample: "LOVE", loop: true, desc: "The line thumps and flushes with colour",
      v: [["", { scale: 112 }], ["Glow", { scale: 112, glow: true }]], p: ["blood", "hotpink"] },
    { id: "blink", name: "Duotone Blink", fam: "Flash & Glitch", sample: "BLINK", loop: true, desc: "The whole line flips between two colours",
      v: [["", { rate: 4 }], ["Fast", { rate: 8 }]], p: ["viral", "youtube", "lime"] },
    { id: "strobe", name: "Strobe", fam: "Flash & Glitch", sample: "STROBE", loop: true, desc: "Irregular full-line flashes",
      v: [["", { rate: 8 }]], p: ["mono", "blood", "toxic"] },
    { id: "neon", name: "Neon Flicker", fam: "Flash & Glitch", sample: "NEON", loop: true, desc: "Glowing letters flicker like a broken sign",
      v: [["", { rate: 12 }]], p: ["tiktok", "purple", "toxic", "cyan"] },
    { id: "glitch", name: "Glitch Color", fam: "Flash & Glitch", sample: "GLITCH", loop: true, desc: "Random letters jump sideways in the accent",
      v: [["", { rate: 10, lift: 8 }]], p: ["tiktok", "cyan", "blood"] },
    { id: "pulse", name: "Color Pulse", fam: "Wave", sample: "PULSE", loop: true, desc: "A smooth wave of accent pulses along",
      v: [["", { cycles: 1 }], ["Tight", { cycles: 2 }], ["Reverse", { cycles: 1, dir: -1 }]], p: ["viral", "ocean", "candy"] },
    { id: "waveJump", name: "Wave Jump", fam: "Wave", sample: "BOUNCE", loop: true, desc: "Letters hop up as the colour wave passes",
      v: [["", { cycles: 1, lift: 14 }], ["High", { cycles: 1, lift: 26 }]], p: ["viral", "cyan", "mint"] },
    { id: "breathe", name: "Breathe", fam: "Wave", sample: "BREATHE", loop: true, desc: "The line fades slowly between both colours",
      v: [["", {}]], p: ["purple", "ice", "sunset", "gold"] }
  ];

  var DEF = { unit: "char", dir: 1, cycles: 1, rate: 4, width: 28, scale: 112, lift: 14, glow: false };

  // ---------- the catalogue ----------
  var STYLES = [];
  ENGINES.forEach(function (eng) {
    eng.v.forEach(function (variant) {
      eng.p.forEach(function (pid) {
        var params = {}, k;
        for (k in DEF) params[k] = DEF[k];
        for (k in variant[1]) params[k] = variant[1][k];
        var pal = PALETTES[pid];
        var sample = params.unit === "char" && eng.sample.indexOf(" ") >= 0 ? "LETTERS" : eng.sample;
        STYLES.push({
          key: eng.id + "-" + (variant[0] || "std").toLowerCase() + "-" + pid,
          engine: eng.id,
          name: eng.name + (variant[0] ? " " + variant[0] : "") + " · " + pal.name,
          fam: eng.fam,
          desc: eng.desc,
          loop: eng.loop,
          sample: sample,
          params: params,
          pal: pal
        });
      });
    });
  });

  // ---------- helpers ----------
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

  // Same rule as compxCfxVivid on the host.
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
  function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  // One-pass engines run over `frames`, hold, then the preview restarts.
  function passProgress(t, frames) {
    var run = frames / FPS, hold = 0.9;
    return clamp01((t % (run + hold)) / run);
  }

  // Random order for Random Fill, fixed per card.
  function order(n, seed) {
    var idx = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    for (i = n - 1; i > 0; i--) { var j = Math.floor(rand(seed + i) * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    var pos = [];
    for (i = 0; i < n; i++) pos[idx[i]] = i;
    return pos;
  }

  // What unit i of n looks like at time t.
  function look(id, t, i, n, P, sp, frames, rank) {
    var o = { b: 0, c: 0, hue: 0, scale: 1, lift: 0, shift: 0, opacity: 1, glow: 0 };
    var x = n > 0 ? (P.dir < 0 ? (n - 1 - i) / n : i / n) : 0;
    var p, r, w;
    switch (id) {
      case "rainbow": o.hue = ((t * sp * 0.5 + x * P.cycles) % 1) * 360; break;
      case "hueSpin": o.hue = ((t * sp * 0.4) % 1) * 360; break;
      case "confetti": o.hue = rand(i * 13 + Math.floor(t * P.rate * sp) * 7) * 360; break;
      case "confetti3":
        r = Math.floor(rand(i * 13 + Math.floor(t * P.rate * sp) * 7) * 3);
        o.b = r === 1 ? 1 : 0; o.c = r === 2 ? 1 : 0; break;
      case "triCycle":
        r = (i + 1 + Math.floor(t * P.rate * sp)) % 3;
        o.b = r === 1 ? 1 : 0; o.c = r === 2 ? 1 : 0; break;
      case "alternate":
        o.b = (i + 1 + Math.floor(t * P.rate * sp)) % 2 === 1 ? 1 : 0; break;
      case "karaoke":
        p = passProgress(t, frames);
        o.b = (P.dir < 0 ? (n - 1 - i) : i) <= p * n - 0.5 ? 1 : 0; break;
      case "wipe":
        p = easeInOut(passProgress(t, frames));
        o.b = clamp01(p * (n + 1) - (P.dir < 0 ? (n - 1 - i) : i)); break;
      case "randomFill":
        p = passProgress(t, frames);
        o.b = rank[i] <= p * n - 0.5 ? 1 : 0; break;
      case "centerOut":
        p = passProgress(t, frames) * 1.25;
        o.b = clamp01((p - Math.abs((i + 0.5) / n - 0.5) * 2) * 4); break;
      case "activeWord":
        r = Math.floor(t * P.rate * sp) % Math.max(1, n);
        if (P.dir < 0) r = n - 1 - r;
        if (r === i) { o.b = 1; o.scale = P.scale / 100; }
        break;
      case "shine": {
        var tt = (t * sp * 0.6) % 1, off = P.dir < 0 ? 100 - tt * (100 + P.width) : -P.width + tt * (100 + P.width);
        var cc = (i + 0.5) / n * 100;
        o.b = cc >= off && cc <= off + P.width ? Math.sin(Math.PI * (cc - off) / P.width) : 0;
        break;
      }
      case "heartbeat":
        p = (t * sp) % 1;
        o.b = p < 0.1 ? 1 : (p < 0.35 ? (0.35 - p) / 0.25 : 0);
        o.scale = 1 + (P.scale / 100 - 1) * o.b; break;
      case "blink": o.b = Math.floor(t * P.rate * sp) % 2 === 0 ? 0 : 1; break;
      case "strobe": o.b = rand(Math.floor(t * P.rate * sp) * 17) < 0.45 ? 1 : 0; break;
      case "neon": o.b = rand(i * 31 + Math.floor(t * P.rate * sp) * 11) < 0.22 ? 0 : 1; o.glow = o.b; break;
      case "glitch":
        o.b = rand(i * 29 + Math.floor(t * P.rate * sp) * 11) < 0.18 ? 1 : 0;
        o.shift = o.b * P.lift * 0.35; break;
      case "pop": {
        var start = easeInOut(passProgress(t, frames)) * 100, centre = (i + 0.5) / n * 100;
        var land = clamp01((start - i / n * 100) / (100 / n));
        o.scale = land; o.opacity = land;
        o.b = centre <= start && centre >= start - 20 ? 1 : 0; break;
      }
      case "pulse":
        o.b = 0.5 + 0.5 * Math.sin((x * P.cycles - t * sp) * Math.PI * 2); break;
      case "waveJump":
        w = Math.pow(Math.max(0, Math.sin((x * P.cycles - t * sp) * Math.PI * 2)), 3);
        o.b = w; o.lift = w * P.lift * 0.35; break;
      case "breathe": o.b = 0.5 + 0.5 * Math.sin(t * sp * Math.PI); break;
    }
    if (P.glow) o.glow = Math.max(o.glow, 0.6);
    return o;
  }

  // ---------- module ----------
  function init() {
    var grid = document.getElementById("cfxGrid");
    if (!grid) return;
    var el = {
      a: document.getElementById("cfxColorA"), b: document.getElementById("cfxColorB"), c: document.getElementById("cfxColorC"),
      swap: document.getElementById("cfxSwap"), mine: document.getElementById("cfxUseMine"),
      palettes: document.getElementById("cfxPalettes"),
      speed: document.getElementById("cfxSpeed"), frames: document.getElementById("cfxFrames"),
      search: document.getElementById("cfxSearch"), fam: document.getElementById("cfxFamily"), count: document.getElementById("cfxCount"),
      clean: document.getElementById("cfxClean"), status: document.getElementById("cfxStatus"), shell: document.getElementById("cfxShell")
    };
    var state = {
      a: read("a", "#ffffff"), b: read("b", "#ffd400"), c: read("c", "#ff2e88"),
      mine: read("mine", "0") === "1",
      speed: Math.max(0.1, Math.min(5, Number(read("speed", 1)) || 1)),
      frames: Math.max(2, Math.min(600, Math.round(Number(read("frames", 30)) || 30)))
    };
    var cards = [], onScreen = [];
    var busy = false, raf = 0, t0 = 0;

    function say(msg, kind) {
      if (!el.status) return;
      el.status.textContent = msg;
      el.status.classList.toggle("is-error", kind === "error");
      el.status.classList.toggle("is-ok", kind === "ok");
    }

    function colorsFor(st) {
      return state.mine ? { a: state.a, b: state.b, c: state.c } : st.pal;
    }

    // ---- cards ----
    var io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var c = en.target._cfx;
        if (!c) return;
        var at = onScreen.indexOf(c);
        if (en.isIntersecting && at < 0) onScreen.push(c);
        else if (!en.isIntersecting && at >= 0) onScreen.splice(at, 1);
      });
      wake();
    }, { rootMargin: "80px" }) : null;

    STYLES.forEach(function (st, si) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "cfx-card";
      card.setAttribute("data-cfx", st.key);
      card.title = st.name + " — " + st.desc;

      var stage = document.createElement("div");
      stage.className = "cfx-stage";
      var word = document.createElement("div");
      word.className = "cfx-word";
      var units = [];
      if (st.params.unit === "word") {
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
      var dots = document.createElement("span");
      dots.className = "cfx-dots";
      stage.appendChild(dots);

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
      var rec = { style: st, units: units, el: card, dots: dots, rank: order(units.length, si * 101 + 7) };
      card._cfx = rec;
      cards.push(rec);
      if (io) io.observe(card);
    });

    function paintDots() {
      cards.forEach(function (c) {
        var col = colorsFor(c.style);
        c.dots.innerHTML = "";
        [col.a, col.b, col.c].forEach(function (hex) {
          var d = document.createElement("i");
          d.style.setProperty("--cfx-dot", hex);
          c.dots.appendChild(d);
        });
      });
    }

    // ---- filters ----
    var fams = [];
    ENGINES.forEach(function (e) { if (fams.indexOf(e.fam) < 0) fams.push(e.fam); });
    fams.forEach(function (f) {
      var o = document.createElement("option");
      o.value = f; o.textContent = f;
      el.fam.appendChild(o);
    });

    function filter() {
      var q = String(el.search.value || "").trim().toLowerCase();
      var fam = el.fam.value;
      var shown = 0;
      cards.forEach(function (c) {
        var st = c.style;
        var hit = (fam === "all" || st.fam === fam) && (!q || (st.name + " " + st.desc + " " + st.fam).toLowerCase().indexOf(q) >= 0);
        c.el.hidden = !hit;
        if (hit) shown++;
      });
      el.count.textContent = shown + " / " + cards.length + " styles";
      wake();
    }

    // ---- palettes ----
    Object.keys(PALETTES).forEach(function (pid) {
      var pal = PALETTES[pid];
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cfx-chip";
      chip.title = pal.name + " — use these colours on every style";
      // A custom property, because the theme's #app button background wins over inline style.
      chip.style.setProperty("--cfx-chip", "conic-gradient(" + pal.a + " 0 33%, " + pal.b + " 0 66%, " + pal.c + " 0)");
      chip.addEventListener("click", function () {
        state.a = pal.a; state.b = pal.b; state.c = pal.c; state.mine = true;
        commit();
      });
      el.palettes.appendChild(chip);
    });

    function commit() {
      write("a", state.a); write("b", state.b); write("c", state.c); write("mine", state.mine ? "1" : "0");
      write("speed", state.speed); write("frames", state.frames);
      el.a.value = state.a; el.b.value = state.b; el.c.value = state.c;
      el.mine.checked = state.mine;
      el.shell.classList.toggle("is-mine", state.mine);
      if (document.activeElement !== el.speed) el.speed.value = state.speed;
      if (document.activeElement !== el.frames) el.frames.value = state.frames;
      paintDots();
    }

    // ---- preview loop: only the cards on screen ----
    function panelVisible() {
      var panel = grid.closest("[data-text-library-panel]");
      return !!grid.offsetParent && !(panel && panel.hidden);
    }

    function frame(now) {
      raf = 0;
      if (!panelVisible()) return;
      if (!t0) t0 = now;
      var t = (now - t0) / 1000;
      var list = io ? onScreen : cards;
      for (var ci = 0; ci < list.length; ci++) {
        var card = list[ci];
        if (card.el.hidden) continue;
        var st = card.style, n = card.units.length, col = colorsFor(st);
        var A = hexRgb(col.a), B = hexRgb(col.b), C = hexRgb(col.c);
        if (st.engine === "rainbow" || st.engine === "hueSpin" || st.engine === "confetti") A = vivid(A);
        for (var i = 0; i < n; i++) {
          var lk = look(st.engine, t, i, n, st.params, state.speed, state.frames, card.rank);
          var span = card.units[i];
          var rgb = mix(mix(A, B, lk.b), C, lk.c);
          span.style.color = rgbCss(rgb);
          span.style.filter = lk.hue ? "hue-rotate(" + Math.round(lk.hue) + "deg)" : "";
          var tf = "";
          if (lk.lift || lk.shift) tf += "translate(" + lk.shift.toFixed(1) + "px," + (-lk.lift).toFixed(1) + "px) ";
          if (lk.scale !== 1) tf += "scale(" + lk.scale.toFixed(3) + ")";
          span.style.transform = tf;
          span.style.opacity = lk.opacity !== 1 ? lk.opacity.toFixed(3) : "";
          span.style.textShadow = lk.glow ? "0 0 3px " + rgbCss(rgb) + ", 0 0 " + Math.round(12 * lk.glow) + "px " + rgbCss(rgb) : "";
        }
      }
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!raf && panelVisible()) raf = requestAnimationFrame(frame);
    }

    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest("[data-text-library-tab], .app-tab")) setTimeout(wake, 30);
    });

    // ---- apply ----
    function apply(st) {
      if (busy) return;
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", "error"); return; }
      busy = true;
      el.shell.classList.add("is-busy");
      say("Applying " + st.name + "…");
      var col = colorsFor(st), P = st.params;
      var payload = {
        name: st.name, a: hexRgb(col.a), b: hexRgb(col.b), c: hexRgb(col.c),
        speed: state.speed, frames: state.frames, sample: st.sample,
        unit: P.unit, dir: P.dir, cycles: P.cycles, rate: P.rate, width: P.width, scale: P.scale, lift: P.lift, glow: P.glow
      };
      host.call("ae_textColorFx(" + host.arg(st.engine) + "," + host.arg(JSON.stringify(payload)) + ")", function (res) {
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

    function pick(key, input) {
      input.addEventListener("input", function () { state[key] = input.value; state.mine = true; commit(); });
    }
    pick("a", el.a); pick("b", el.b); pick("c", el.c);
    el.mine.addEventListener("change", function () { state.mine = el.mine.checked; commit(); });
    el.swap.addEventListener("click", function () { var t = state.a; state.a = state.b; state.b = t; state.mine = true; commit(); });
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
    el.search.addEventListener("input", filter);
    el.fam.addEventListener("change", filter);

    commit();
    filter();
    say("Select text layers (or none for a demo), then click a style.");
    wake();

    window.OrbitColorFx = { styles: STYLES, engines: ENGINES };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
