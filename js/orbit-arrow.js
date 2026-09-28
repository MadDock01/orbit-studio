/* ============================================================
   ORBIT ARROW CREATOR — Toolkit tab

   All geometry lives here. One function, geometry(state), turns the
   settings into the line (vertices + in/out tangents, After Effects
   shape format, y down) and the head (a small path pointing +X with
   its tip at the origin). The live preview, the preset thumbnails and
   the layer built in After Effects all come from that one function, so
   what you see is what gets made.

   Host side:  ae_arrowBuild(json)   create, or update the selected arrow

   Loads before main.js (compx-loader injects main.js only after the
   licence check), so the host bridge is looked up at click time.
   ============================================================ */
(function () {
  "use strict";

  var STORE = "compXArrow.state";
  var FPS = 25;
  var SHAPES = ["arc", "straight", "scurve", "step", "circle", "callout"];
  var HEADS = ["triangle", "stealth", "chevron", "dot", "none"];

  var DEFAULTS = {
    shape: "arc", head: "triangle", length: 420, bend: 35, width: 8, headSize: 34,
    color: "#35c8ff", flip: false, double: false, dashed: false, taper: false, neon: false,
    animate: true, frames: 20
  };

  var PRESETS = [
    { id: "classic", name: "Classic Arc", s: { shape: "arc", head: "triangle", bend: 35, width: 8, headSize: 34, color: "#35c8ff", dashed: false, taper: false, neon: false, double: false } },
    { id: "neon", name: "Neon S-Curve", s: { shape: "scurve", head: "triangle", bend: 55, width: 7, headSize: 30, color: "#b26bff", dashed: false, taper: false, neon: true, double: false } },
    { id: "direct", name: "Direct Point", s: { shape: "straight", head: "stealth", bend: 0, width: 8, headSize: 38, color: "#ffc53d", dashed: false, taper: false, neon: false, double: false } },
    { id: "stepped", name: "90° Stepped", s: { shape: "step", head: "chevron", bend: 45, width: 7, headSize: 26, color: "#ff8a3d", dashed: false, taper: false, neon: false, double: false } },
    { id: "dashed", name: "Dashed Flow", s: { shape: "arc", head: "triangle", bend: 22, width: 6, headSize: 28, color: "#3cff5f", dashed: true, taper: false, neon: false, double: false } },
    { id: "focus", name: "Focus Circle", s: { shape: "circle", head: "triangle", bend: 35, width: 7, headSize: 28, color: "#ff5f6d", dashed: false, taper: false, neon: false, double: false } },
    { id: "callout", name: "Taper Callout", s: { shape: "callout", head: "stealth", bend: 40, width: 10, headSize: 36, color: "#4dabf7", dashed: false, taper: true, neon: false, double: false } },
    { id: "double", name: "Double Arrow", s: { shape: "straight", head: "triangle", bend: 0, width: 7, headSize: 30, color: "#eafff0", dashed: false, taper: false, neon: false, double: true } }
  ];

  var SHAPE_NAMES = { arc: "Arc", straight: "Straight", scurve: "S-Curve", step: "90° Step", circle: "Circle", callout: "Callout" };
  var HEAD_NAMES = { triangle: "Triangle", stealth: "Stealth", chevron: "Chevron", dot: "Dot", none: "None" };

  // ---------- storage ----------
  function load() {
    var s = {}, k;
    for (k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved === "object") for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(saved, k)) s[k] = saved[k];
    } catch (e) { /* first run or sandboxed storage */ }
    return sanitize(s);
  }

  function save(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* sandboxed storage */ }
  }

  function clampNum(v, def, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) n = def;
    return Math.max(lo, Math.min(hi, n));
  }

  function sanitize(s) {
    if (SHAPES.indexOf(s.shape) < 0) s.shape = DEFAULTS.shape;
    if (HEADS.indexOf(s.head) < 0) s.head = DEFAULTS.head;
    s.length = Math.round(clampNum(s.length, DEFAULTS.length, 40, 4000));
    s.bend = Math.round(clampNum(s.bend, DEFAULTS.bend, 0, 100));
    s.width = clampNum(s.width, DEFAULTS.width, 1, 200);
    s.headSize = clampNum(s.headSize, DEFAULTS.headSize, 4, 600);
    s.frames = Math.round(clampNum(s.frames, DEFAULTS.frames, 1, 600));
    if (!/^#[0-9a-f]{6}$/i.test(String(s.color))) s.color = DEFAULTS.color;
    ["flip", "double", "dashed", "taper", "neon", "animate"].forEach(function (k) { s[k] = !!s[k]; });
    return s;
  }

  // ---------- geometry ----------
  function arcPath(R, a0, sweep, segs) {
    var pts = [], inT = [], outT = [];
    var step = sweep / segs;
    var k = 4 / 3 * Math.tan(step / 4) * R;
    for (var i = 0; i <= segs; i++) {
      var a = a0 + step * i;
      var dx = -Math.sin(a), dy = Math.cos(a);
      pts.push([R * Math.cos(a), R * Math.sin(a)]);
      inT.push(i === 0 ? [0, 0] : [-dx * k, -dy * k]);
      outT.push(i === segs ? [0, 0] : [dx * k, dy * k]);
    }
    return { pts: pts, inT: inT, outT: outT };
  }

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push([0, 0]); return a; }

  function linePath(s) {
    var L = s.length, h = s.bend / 100 * L * 0.6, p;
    switch (s.shape) {
      case "straight":
        p = { pts: [[-L / 2, 0], [L / 2, 0]], inT: zeros(2), outT: zeros(2) };
        break;
      case "scurve":
        h = Math.max(h, L * 0.04);
        p = { pts: [[-L / 2, h / 2], [L / 2, -h / 2]], inT: [[0, 0], [-L * 0.55, 0]], outT: [[L * 0.55, 0], [0, 0]] };
        break;
      case "step":
        h = Math.max(h, L * 0.12);
        p = { pts: [[-L / 2, h / 2], [0, h / 2], [0, -h / 2], [L / 2, -h / 2]], inT: zeros(4), outT: zeros(4) };
        break;
      case "circle":
        // 300° of a circle; the head lands just short of where it began.
        p = arcPath(L * 0.3, 110 * Math.PI / 180, 300 * Math.PI / 180, 4);
        break;
      case "callout":
        h = Math.max(h, L * 0.12);
        p = { pts: [[-L / 2, h / 2], [L * 0.12, -h / 2], [L / 2, -h / 2]], inT: zeros(3), outT: zeros(3) };
        break;
      default: // arc
        h = Math.max(h, 0.001);
        p = { pts: [[-L / 2, h / 2], [L / 2, h / 2]], inT: [[0, 0], [-L * 0.28, -h * 1.333]], outT: [[L * 0.28, -h * 1.333], [0, 0]] };
    }
    if (s.flip) {
      ["pts", "inT", "outT"].forEach(function (key) {
        p[key] = p[key].map(function (v) { return [v[0], -v[1]]; });
      });
    }
    return p;
  }

  // Head drawn pointing +X, tip at the origin. `inset` (px) is how far the
  // line has to stop short of the tip to stay hidden inside the head.
  function headPath(s) {
    var S = s.headSize, w = s.width;
    switch (s.head) {
      case "stealth":
        return { pts: [[0, 0], [-S, -S * 0.55], [-S * 0.62, 0], [-S, S * 0.55]], inT: zeros(4), outT: zeros(4), closed: true, filled: true,
          inset: Math.min(S * 0.6, Math.max(w, S * 0.35)) };
      case "chevron":
        return { pts: [[-S * 0.75, -S * 0.6], [0, 0], [-S * 0.75, S * 0.6]], inT: zeros(3), outT: zeros(3), closed: false, filled: false,
          inset: w * 0.5 };
      case "dot":
        return dotPath(S * 0.36);
      case "none":
        return null;
      default:
        return { pts: [[0, 0], [-S, -S * 0.5], [-S, S * 0.5]], inT: zeros(3), outT: zeros(3), closed: true, filled: true,
          inset: Math.min(S * 0.85, Math.max(w, S * 0.45)) };
    }
  }

  // Closed 4-point circle, centred on the path end.
  function dotPath(r) {
    var k = 0.5523 * r;
    return {
      pts: [[r, 0], [0, r], [-r, 0], [0, -r]],
      inT: [[0, -k], [k, 0], [0, k], [-k, 0]],
      outT: [[0, k], [-k, 0], [0, -k], [k, 0]],
      closed: true, filled: true, inset: r * 0.5
    };
  }

  function cubicPoint(p0, c0, c1, p1, t) {
    var u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1]
    ];
  }

  function segments(p) {
    var out = [];
    for (var i = 0; i < p.pts.length - 1; i++) {
      var a = p.pts[i], b = p.pts[i + 1];
      out.push([a, [a[0] + p.outT[i][0], a[1] + p.outT[i][1]], [b[0] + p.inT[i + 1][0], b[1] + p.inT[i + 1][1]], b]);
    }
    return out;
  }

  function pathLength(p) {
    var len = 0;
    segments(p).forEach(function (sg) {
      var prev = sg[0];
      for (var i = 1; i <= 24; i++) {
        var q = cubicPoint(sg[0], sg[1], sg[2], sg[3], i / 24);
        len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        prev = q;
      }
    });
    return len;
  }

  function geometry(s) {
    var line = linePath(s);
    var head = headPath(s);
    var len = Math.max(1, pathLength(line));
    var insetPct = head ? Math.min(40, head.inset / len * 100) : 0;
    return {
      line: line, head: head, length: len,
      inset: insetPct,
      startInset: head && s.double ? insetPct : 0
    };
  }

  function svgD(p) {
    var sg = segments(p);
    if (!sg.length) return "";
    var d = "M" + f(sg[0][0][0]) + " " + f(sg[0][0][1]);
    sg.forEach(function (x) { d += "C" + f(x[1][0]) + " " + f(x[1][1]) + " " + f(x[2][0]) + " " + f(x[2][1]) + " " + f(x[3][0]) + " " + f(x[3][1]); });
    return d;
  }

  function headD(h) {
    var p = { pts: h.pts.slice(), inT: h.inT.slice(), outT: h.outT.slice() };
    // Closing segment: last vertex back to the first.
    if (h.closed) { p.pts.push(h.pts[0]); p.inT.push(h.inT[0]); }
    var d = svgD(p);
    return h.closed ? d + "Z" : d;
  }

  function f(n) { return (Math.round(n * 100) / 100).toString(); }

  function bbox(g, s) {
    var xs = [], ys = [];
    segments(g.line).forEach(function (sg) {
      for (var i = 0; i <= 16; i++) { var q = cubicPoint(sg[0], sg[1], sg[2], sg[3], i / 16); xs.push(q[0]); ys.push(q[1]); }
    });
    var pad = (g.head ? s.headSize : 0) + s.width * 2 + 8;
    return { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 };
  }

  function hexRgb(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Small SVG of a state, for the preset cards.
  function thumb(st) {
    var g = geometry(st), b = bbox(g, st), NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", [b.x, b.y, b.w, b.h].join(" "));
    svg.setAttribute("aria-hidden", "true");
    var line = document.createElementNS(NS, "path");
    line.setAttribute("d", svgD(g.line));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", st.color);
    line.setAttribute("stroke-width", st.width * 2.2);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    if (st.dashed) line.setAttribute("stroke-dasharray", (st.width * 5) + " " + (st.width * 3.5));
    svg.appendChild(line);
    if (g.head) {
      var sg = segments(g.line), last = sg[sg.length - 1], first = sg[0];
      var ends = [[cubicPoint(last[0], last[1], last[2], last[3], 1), cubicPoint(last[0], last[1], last[2], last[3], 0.97)]];
      if (st.double) ends.push([cubicPoint(first[0], first[1], first[2], first[3], 0), cubicPoint(first[0], first[1], first[2], first[3], 0.03)]);
      ends.forEach(function (e) {
        var hp = document.createElementNS(NS, "path");
        var ang = Math.atan2(e[0][1] - e[1][1], e[0][0] - e[1][0]) * 180 / Math.PI;
        hp.setAttribute("d", headD(g.head));
        hp.setAttribute("transform", "translate(" + f(e[0][0]) + " " + f(e[0][1]) + ") rotate(" + f(ang) + ") scale(1.6)");
        hp.setAttribute("fill", g.head.filled ? st.color : "none");
        hp.setAttribute("stroke", g.head.filled ? "none" : st.color);
        hp.setAttribute("stroke-width", st.width * 1.4);
        hp.setAttribute("stroke-linejoin", "round");
        hp.setAttribute("stroke-linecap", "round");
        svg.appendChild(hp);
      });
    }
    return svg;
  }

  // ---------- module ----------
  function init() {
    var card = document.getElementById("arrowCreatorCard");
    if (!card) return;
    var q = function (id) { return document.getElementById(id); };
    var el = {
      svg: q("arrowPreviewSvg"), line: q("arrowPreviewLine"), mask: q("arrowPreviewMaskPath"),
      headEnd: q("arrowPreviewHeadEnd"), headStart: q("arrowPreviewHeadStart"), taper: q("arrowPreviewTaper"),
      stage: q("arrowPreviewStage"), play: q("arrowPlay"), zoom: q("arrowPreviewZoom"),
      presets: q("arrowPresets"), shapes: q("arrowShapes"), heads: q("arrowHeads"),
      color: q("arrowColor"), width: q("arrowWidth"), headSize: q("arrowHeadSize"), length: q("arrowLength"), bend: q("arrowBend"),
      double: q("arrowDouble"), dashed: q("arrowDashed"), taperChk: q("arrowTaper"), neon: q("arrowNeon"),
      animate: q("arrowAnimate"), frames: q("arrowFrames"),
      create: q("arrowCreate"), update: q("arrowUpdate"), flip: q("arrowFlip"), reset: q("arrowReset"),
      status: q("arrowStatus")
    };
    var state = load();
    var activePreset = "";
    var playing = 0, busy = false;

    function say(msg, kind) {
      if (!el.status) return;
      el.status.textContent = msg;
      el.status.classList.toggle("is-error", kind === "error");
      el.status.classList.toggle("is-ok", kind === "ok");
    }

    function commit() {
      sanitize(state);
      save(state);
      paint();
    }

    // ---- preview ----
    function headTransform(pt, angleDeg) {
      return "translate(" + f(pt[0]) + " " + f(pt[1]) + ") rotate(" + f(angleDeg) + ")";
    }

    function pointAt(path, len, t) {
      var p = path.getPointAtLength(Math.max(0, Math.min(1, t)) * len);
      return [p.x, p.y];
    }

    function angleAt(path, len, t, back) {
      var a = pointAt(path, len, Math.max(0, t - 0.004)), b = pointAt(path, len, Math.min(1, t + 0.004));
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return 0;
      return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + (back ? 180 : 0);
    }

    function drawTaper(g, path, len, upto) {
      if (!el.taper) return;
      while (el.taper.firstChild) el.taper.removeChild(el.taper.firstChild);
      if (!state.taper) return;
      var NS = "http://www.w3.org/2000/svg", N = 40, from = g.startInset / 100, to = Math.max(from, upto);
      for (var i = 0; i < N; i++) {
        var t0 = from + (to - from) * i / N, t1 = from + (to - from) * (i + 1) / N;
        var a = pointAt(path, len, t0), b = pointAt(path, len, t1);
        var seg = document.createElementNS(NS, "line");
        seg.setAttribute("x1", f(a[0])); seg.setAttribute("y1", f(a[1]));
        seg.setAttribute("x2", f(b[0])); seg.setAttribute("y2", f(b[1]));
        // Stroke Taper start: 0 width growing to full over the first 55%.
        var w = state.width * Math.min(1, ((t0 + t1) / 2) / 0.55);
        seg.setAttribute("stroke-width", f(Math.max(0.2, w)));
        seg.setAttribute("stroke-linecap", "round");
        el.taper.appendChild(seg);
      }
    }

    function render(progress) {
      var g = geometry(state), b = bbox(g, state);
      var p = progress === undefined ? 1 : progress;
      el.svg.setAttribute("viewBox", [b.x, b.y, b.w, b.h].join(" "));
      el.svg.style.color = state.color;
      el.svg.classList.toggle("is-neon", state.neon);
      var d = svgD(g.line);
      el.line.setAttribute("d", d);
      el.mask.setAttribute("d", d);
      el.line.setAttribute("stroke-width", state.width);
      el.mask.setAttribute("stroke-width", state.width + state.headSize * 2);
      el.line.setAttribute("stroke-dasharray", state.dashed ? f(Math.max(4, state.width * 2.2)) + " " + f(Math.max(4, state.width * 1.6)) : "none");
      el.line.style.display = state.taper ? "none" : "";
      var len = el.line.getTotalLength();
      // Trim window: the mask reveals start..end of the line, like Trim Paths.
      var endT = Math.max(0, p - g.inset / 100), startT = g.startInset / 100;
      el.mask.setAttribute("stroke-dasharray", f(Math.max(0, endT - startT) * len) + " " + f(len * 2));
      el.mask.setAttribute("stroke-dashoffset", f(-startT * len));
      drawTaper(g, el.line, len, endT);
      var headScale = Math.max(0, Math.min(1, p * 100 / Math.max(0.5, g.inset * 1.5)));
      if (g.head) {
        var hd = headD(g.head);
        [el.headEnd, el.headStart].forEach(function (h) {
          h.setAttribute("d", hd);
          h.setAttribute("fill", g.head.filled ? "currentColor" : "none");
          h.setAttribute("stroke", g.head.filled ? "none" : "currentColor");
          h.setAttribute("stroke-width", state.width);
        });
        el.headEnd.setAttribute("transform", headTransform(pointAt(el.line, len, p), angleAt(el.line, len, Math.max(0.001, p))) + " scale(" + f(headScale) + ")");
        el.headEnd.style.display = "";
        el.headStart.style.display = state.double ? "" : "none";
        if (state.double) el.headStart.setAttribute("transform", headTransform(pointAt(el.line, len, 0), angleAt(el.line, len, 0.001, true)) + " scale(" + f(headScale) + ")");
      } else {
        el.headEnd.style.display = "none";
        el.headStart.style.display = "none";
      }
      if (el.zoom) el.zoom.textContent = Math.round(g.length) + " px";
    }

    function play() {
      if (playing) { cancelAnimationFrame(playing); playing = 0; render(); paintPlay(); return; }
      var dur = state.frames / FPS * 1000, t0 = performance.now();
      var tick = function (now) {
        var t = Math.min(1, (now - t0) / dur);
        // matches the 75% influence ease on the keyframes
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        render(e);
        if (t < 1) playing = requestAnimationFrame(tick);
        else { playing = 0; paintPlay(); }
      };
      playing = requestAnimationFrame(tick);
      paintPlay();
    }

    function paintPlay() {
      if (!el.play) return;
      el.play.classList.toggle("is-on", !!playing);
      el.play.querySelector("span").textContent = playing ? "Stop" : "Play";
    }

    // ---- controls ----
    function seg(container, list, names, key) {
      container.innerHTML = "";
      list.forEach(function (id) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "arrow-seg-btn";
        b.setAttribute("data-value", id);
        b.textContent = names[id];
        b.addEventListener("click", function () { state[key] = id; activePreset = ""; commit(); });
        container.appendChild(b);
      });
    }

    function buildPresets() {
      el.presets.innerHTML = "";
      PRESETS.forEach(function (pr) {
        var st = {}, k;
        for (k in state) st[k] = state[k];
        for (k in pr.s) st[k] = pr.s[k];
        st.length = 420; st.flip = false;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "arrow-preset";
        b.setAttribute("data-preset", pr.id);
        b.title = pr.name;
        b.appendChild(thumb(sanitize(st)));
        var label = document.createElement("span");
        label.textContent = pr.name;
        b.appendChild(label);
        b.addEventListener("click", function () {
          for (var key in pr.s) state[key] = pr.s[key];
          activePreset = pr.id;
          commit();
        });
        el.presets.appendChild(b);
      });
    }

    function paint() {
      var mark = function (container, value) {
        var btns = container.querySelectorAll("[data-value]");
        for (var i = 0; i < btns.length; i++) {
          var on = btns[i].getAttribute("data-value") === value;
          btns[i].classList.toggle("active", on);
          btns[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
      };
      mark(el.shapes, state.shape);
      mark(el.heads, state.head);
      var cards = el.presets.querySelectorAll("[data-preset]");
      for (var i = 0; i < cards.length; i++) cards[i].classList.toggle("active", cards[i].getAttribute("data-preset") === activePreset);
      if (document.activeElement !== el.width) el.width.value = state.width;
      if (document.activeElement !== el.headSize) el.headSize.value = Math.round(state.headSize);
      if (document.activeElement !== el.length) el.length.value = state.length;
      if (document.activeElement !== el.bend) el.bend.value = state.bend;
      if (document.activeElement !== el.frames) el.frames.value = state.frames;
      el.color.value = state.color;
      el.double.checked = state.double;
      el.dashed.checked = state.dashed;
      el.taperChk.checked = state.taper;
      el.neon.checked = state.neon;
      el.animate.checked = state.animate;
      el.frames.disabled = !state.animate;
      el.flip.classList.toggle("active", state.flip);
      el.flip.setAttribute("aria-pressed", state.flip ? "true" : "false");
      // Bend means nothing for a straight line or a circle.
      el.bend.disabled = state.shape === "straight" || state.shape === "circle";
      if (!playing) render();
    }

    function num(input, key) {
      input.addEventListener("input", function () {
        var n = parseFloat(input.value);
        if (!isFinite(n)) return;
        state[key] = n; activePreset = "";
        sanitize(state); save(state); render();
      });
      input.addEventListener("change", function () { state[key] = input.value; activePreset = ""; commit(); input.value = state[key]; });
    }

    function check(input, key) {
      input.addEventListener("change", function () { state[key] = input.checked; activePreset = ""; commit(); });
    }

    function payload(mode) {
      var g = geometry(state);
      return {
        mode: mode,
        name: "Arrow",
        line: g.line,
        head: g.head,
        inset: g.inset,
        startInset: g.startInset,
        double: state.double,
        width: state.width,
        color: hexRgb(state.color),
        dashed: state.dashed,
        taper: state.taper,
        neon: state.neon,
        animate: state.animate,
        frames: state.frames
      };
    }

    function send(mode) {
      if (busy) return;
      var host = window.CompXHostBridge;
      if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", "error"); return; }
      busy = true;
      card.classList.add("is-busy");
      say(mode === "update" ? "Updating the selected arrow…" : "Creating the arrow…");
      host.call("ae_arrowBuild(" + host.arg(JSON.stringify(payload(mode))) + ")", function (res) {
        busy = false;
        card.classList.remove("is-busy");
        if (res && res.success) say(res.message || "Done", "ok");
        else say((res && (res.message || res.detail)) || "That did not work.", "error");
      });
    }

    seg(el.shapes, SHAPES, SHAPE_NAMES, "shape");
    seg(el.heads, HEADS, HEAD_NAMES, "head");
    buildPresets();
    num(el.width, "width");
    num(el.headSize, "headSize");
    num(el.length, "length");
    num(el.bend, "bend");
    num(el.frames, "frames");
    el.color.addEventListener("input", function () { state.color = el.color.value; activePreset = ""; commit(); });
    check(el.double, "double");
    check(el.dashed, "dashed");
    check(el.taperChk, "taper");
    check(el.neon, "neon");
    check(el.animate, "animate");
    el.flip.addEventListener("click", function () { state.flip = !state.flip; commit(); });
    el.reset.addEventListener("click", function () {
      for (var k in DEFAULTS) state[k] = DEFAULTS[k];
      activePreset = "classic";
      commit();
      say("Settings reset.");
    });
    el.play.addEventListener("click", play);
    el.create.addEventListener("click", function () { send("create"); });
    el.update.addEventListener("click", function () { send("update"); });

    paint();
    say("Pick a preset or shape, then Create Arrow in Comp.");

    window.OrbitArrow = { geometry: geometry, state: function () { return state; } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
