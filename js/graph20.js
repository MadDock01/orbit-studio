/* CompX Curve Lab — CompX-style curve workspace ported into the Advanced tab.
   Curve math + preset library adapted from CompX Graph 2.0. Host bridge:
   ae_graph20Apply / ae_graph20Read / ae_graph20Remove (payload: model|mode|invert|params|pts). */
(function () {
  'use strict';

  var MODELS = ['bezier', 'custom', 'elastic', 'bounce', 'wave', 'steps'];
  var MODEL_LABELS = { bezier: 'BEZIER', custom: 'SPLINE', elastic: 'ELASTIC', bounce: 'BOUNCE', wave: 'WAVE', steps: 'STEPS' };
  var MODEL_ICON = {
    bezier: 'M2 11 C6 11 8 3 12 3',
    custom: 'M2 11 C5 11 5 5 8 5 C11 5 11 9 14 3',
    elastic: 'M2 8 C4 1 5 13 7 7 C9 3 10 10 14 7',
    bounce: 'M2 3 C3 12 5 12 6 6 C7 12 9 12 10 8 C11 12 13 12 14 10',
    wave: 'M2 7 C3 2 4 12 6 7 C8 2 9 12 11 7 C12 4 13 9 14 7',
    steps: 'M2 12 L5 12 L5 8 L8 8 L8 4 L11 4 L11 2 L14 2'
  };

  var DEFAULT_PARAMS = {
    bezier: { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 },
    elastic: { amplitude: 1, frequency: 3, decay: 4 },
    bounce: { bounces: 3, stiffness: 0.6 },
    wave: { frequency: 3, decay: 2, sharpness: 0 },
    steps: { count: 8, position: 'end' }
  };

  var DEFAULT_PRESETS = [
    { name: 'EASE', model: 'bezier', params: { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 } },
    { name: 'EASE IN', model: 'bezier', params: { p1x: 0.55, p1y: 0, p2x: 1, p2y: 1 } },
    { name: 'EASE OUT', model: 'bezier', params: { p1x: 0, p1y: 0, p2x: 0.45, p2y: 1 } },
    { name: 'SHARP IN', model: 'bezier', params: { p1x: 0.9, p1y: 0, p2x: 1, p2y: 0.1 } },
    { name: 'SPRING', model: 'elastic', params: { amplitude: 1, frequency: 3, decay: 4 } },
    { name: 'RUBBER', model: 'elastic', params: { amplitude: 1.3, frequency: 2, decay: 3 } },
    { name: 'GRAVITY', model: 'bounce', params: { bounces: 3, stiffness: 0.6 } },
    { name: 'STEPS 8', model: 'steps', params: { count: 8, position: 'end' } },
    { name: 'QUART IN', model: 'bezier', params: { p1x: 0.5, p1y: 0, p2x: 0, p2y: 1 } },
    { name: 'QUART OUT', model: 'bezier', params: { p1x: 1, p1y: 0, p2x: 0.5, p2y: 1 } },
    { name: 'SHINE', model: 'bezier', params: { p1x: 0.75, p1y: 0, p2x: 0.25, p2y: 1 } },
    { name: 'EXPO IN', model: 'bezier', params: { p1x: 0, p1y: 1, p2x: 0.25, p2y: 1 } },
    { name: 'EXPO OUT', model: 'bezier', params: { p1x: 0.75, p1y: 0, p2x: 1, p2y: 0 } },
    { name: 'ELASTIC 1', model: 'elastic', params: { amplitude: 1, frequency: 1.36, decay: 4 } },
    { name: 'ELASTIC 2', model: 'elastic', params: { amplitude: 1, frequency: 1.81, decay: 3.83 } }
  ];

  var BASE_PRESETS = [
    ['LINEAR', 0, 0, 1, 1], ['EASE I/O', 0.42, 0, 0.58, 1],
    ['EASE IN', 0.42, 0, 1, 1], ['EASE OUT', 0, 0, 0.58, 1],
    ['SINE IN', 0.47, 0, 0.745, 0.715], ['SINE OUT', 0.39, 0.575, 0.565, 1],
    ['QUAD IN', 0.55, 0.085, 0.68, 0.53], ['QUAD OUT', 0.25, 0.46, 0.45, 0.94],
    ['CUBIC IN', 0.55, 0.055, 0.675, 0.19], ['CUBIC OUT', 0.215, 0.61, 0.355, 1],
    ['EXPO IN', 0.95, 0.05, 0.795, 0.035], ['EXPO OUT', 0.19, 1, 0.22, 1],
    ['CIRC IN', 0.6, 0.04, 0.98, 0.335], ['CIRC OUT', 0.075, 0.82, 0.165, 1],
    ['BACK IN', 0.6, -0.28, 0.735, 0.045], ['BACK OUT', 0.175, 0.885, 0.32, 1.275],
    ['ELASTIC IN', 0.36, -0.40, 0.64, 1.40], ['ELASTIC OUT', 0.18, 0.89, 0.32, 1.28]
  ].map(function (r) { return { name: r[0], model: 'bezier', params: { p1x: r[1], p1y: r[2], p2x: r[3], p2y: r[4] } }; });

  function cloneObj(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n, d) { return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString(); }

  var state = {
    model: 'bezier',
    bezier: cloneObj(DEFAULT_PARAMS.bezier),
    elastic: cloneObj(DEFAULT_PARAMS.elastic),
    bounce: cloneObj(DEFAULT_PARAMS.bounce),
    wave: cloneObj(DEFAULT_PARAMS.wave),
    steps: cloneObj(DEFAULT_PARAMS.steps),
    points: [ { x: 0, y: 0, cx1: 0, cy1: 0, cx2: 0.25, cy2: 0 }, { x: 1, y: 1, cx1: 0.75, cy1: 1, cx2: 1, cy2: 1 } ],
    invert: false,
    libTab: 'def',
    drag: null,
    selectedPoint: -1,
    graph: 'value',     // editor view: 'value' curve or its 'speed' (AE Speed Graph)
    applyAs: 'speed'    // 'speed' = ease the keys you have, 'value' = bake the exact curve
  };
  try {
    var savedGraph = localStorage.getItem('compxGraph20View');
    var savedAs = localStorage.getItem('compxGraph20ApplyAs');
    if (savedGraph === 'speed' || savedGraph === 'value') state.graph = savedGraph;
    if (savedAs === 'speed' || savedAs === 'value') state.applyAs = savedAs;
  } catch (prefErr) { /* sandboxed storage */ }
  var view = { yMin: -0.35, yMax: 1.35 };
  var PAD = { l: 30, r: 14, t: 16, b: 22 };
  var VB = { w: 320, h: 220 };
  var userPresets = [];
  function bridge() { return window.CompXHostBridge || null; }
  function hostRaw(script, callback) {
    var b=bridge();
    if(!b){ callback('ERR: Host bridge unavailable.'); return; }
    b.callRaw(script,function(raw){ callback(String(raw||'')); });
  }

  /* ── curve math (from CompX) ── */
  function solveBezierT(x, nx1, nx2) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var lo = 0, hi = 1, t = x, i, mt, bx;
    for (i = 0; i < 18; i++) { mt = 1 - t; bx = 3 * mt * mt * t * nx1 + 3 * mt * t * t * nx2 + t * t * t; if (Math.abs(bx - x) < 0.0004) break; if (bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return t;
  }
  function evalPiecewise(points, x) {
    var seg = 0; while (seg < points.length - 2 && x > points[seg + 1].x) seg++;
    var p0 = points[seg], p3 = points[seg + 1]; var dx = p3.x - p0.x; if (dx <= 0.000001) return p3.y;
    var localX = clamp((x - p0.x) / dx, 0, 1);
    var nx1 = (p0.cx2 - p0.x) / dx, nx2 = (p3.cx1 - p0.x) / dx;
    var t = solveBezierT(localX, nx1, nx2), mt = 1 - t;
    return mt * mt * mt * p0.y + 3 * mt * mt * t * p0.cy2 + 3 * mt * t * t * p3.cy1 + t * t * t * p3.y;
  }
  function evalElastic(p, t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    var w = Math.exp(-p.decay); var err0 = 1 - p.amplitude; var err1 = -p.amplitude * w * Math.cos(p.frequency * Math.PI * 2);
    var raw = 1 - p.amplitude * Math.exp(-p.decay * t) * Math.cos(p.frequency * Math.PI * 2 * t);
    return raw - (err0 * Math.exp(-2.5 * p.decay * t) * (1 - t) + err1 * t);
  }
  function evalBounce(p, t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    var segs = Math.round(p.bounces) + 1; var seg = Math.min(Math.floor(t * segs), segs - 1);
    if (seg === 0) { var lt = t * segs; return lt * lt; }
    var segMid = (seg + 0.5) / segs; var halfWidth = 0.5 / segs; var nt = (t - segMid) / halfWidth;
    return 1 - Math.pow(p.stiffness, seg) * (1 - nt * nt);
  }
  function evalWave(p, t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    var phase = t * p.frequency; var sig = Math.sin(phase * Math.PI * 2 - Math.PI / 2); var s = 0.5 + 0.5 * sig;
    var tri = Math.abs(((phase + 0.5) % 1) * 2 - 1); var osc;
    if (p.sharpness > 0) { osc = s + (tri - s) * p.sharpness; }
    else { var expo = 1 / (1 + Math.abs(p.sharpness)); var shaped = (sig < 0 ? -1 : 1) * Math.pow(Math.abs(sig), expo); osc = 0.5 + 0.5 * shaped; }
    return 0.5 + (osc - 0.5) * Math.exp(-p.decay * t);
  }
  function evalSteps(p, t) {
    var n = Math.max(1, Math.round(p.count)); if (t >= 0.999999) return 1;
    if (p.position === 'start') return Math.min(1, (Math.floor(t * n) + 1) / n);
    if (p.position === 'both') return Math.round(t * n) / n;
    return Math.floor(t * n) / n;
  }
  function evalCurve(x) {
    var t = state.invert ? 1 - x : x, y;
    switch (state.model) {
      case 'bezier': { var b = state.bezier; var tt = solveBezierT(t, b.p1x, b.p2x); var mt = 1 - tt; y = 3 * mt * mt * tt * b.p1y + 3 * mt * tt * tt * b.p2y + tt * tt * tt; break; }
      case 'custom': y = evalPiecewise(state.points, t); break;
      case 'elastic': y = evalElastic(state.elastic, t); break;
      case 'bounce': y = evalBounce(state.bounce, t); break;
      case 'wave': y = evalWave(state.wave, t); break;
      case 'steps': y = evalSteps(state.steps, t); break;
      default: y = t;
    }
    return state.invert ? 1 - y : y;
  }

  /* ── speed (the AE Speed Graph view of the same curve) ──
     Speed here is dy/dx of the normalised curve, so 1 is the average
     speed of the move and 0 is standing still. Bezier and spline curves
     are sampled along their own parameter for an exact derivative; the
     procedural models are differentiated numerically. */
  function bezPts() {
    var b = state.bezier;
    return [{ x: 0, y: 0, cx1: 0, cy1: 0, cx2: b.p1x, cy2: b.p1y }, { x: 1, y: 1, cx1: b.p2x, cy1: b.p2y, cx2: 1, cy2: 1 }];
  }
  var SPEED_CAP = 6;
  function speedSeries() {
    var out = [], i, k;
    if (state.model === 'bezier' || state.model === 'custom') {
      var P = state.model === 'bezier' ? bezPts() : state.points;
      for (i = 0; i < P.length - 1; i++) {
        var a = P[i], z = P[i + 1];
        var X = [a.x, a.cx2, z.cx1, z.x], Y = [a.y, a.cy2, z.cy1, z.y];
        for (k = (i ? 1 : 0); k <= 40; k++) {
          var t = k / 40, mt = 1 - t;
          var x = mt * mt * mt * X[0] + 3 * mt * mt * t * X[1] + 3 * mt * t * t * X[2] + t * t * t * X[3];
          var dx = 3 * mt * mt * (X[1] - X[0]) + 6 * mt * t * (X[2] - X[1]) + 3 * t * t * (X[3] - X[2]);
          var dy = 3 * mt * mt * (Y[1] - Y[0]) + 6 * mt * t * (Y[2] - Y[1]) + 3 * t * t * (Y[3] - Y[2]);
          var sp = Math.abs(dx) < 1e-5 ? (dy >= 0 ? SPEED_CAP : -SPEED_CAP) : dy / dx;
          out.push([x, clamp(sp, -SPEED_CAP, SPEED_CAP)]);
        }
      }
      if (state.invert) out = out.map(function (q) { return [1 - q[0], q[1]]; }).reverse();
    } else {
      var N = 160, h = 1 / 640;
      for (i = 0; i <= N; i++) {
        var xx = i / N, x0 = Math.max(0, xx - h), x1 = Math.min(1, xx + h);
        out.push([xx, clamp((evalCurve(x1) - evalCurve(x0)) / (x1 - x0), -SPEED_CAP, SPEED_CAP)]);
      }
    }
    return out;
  }
  function speedAt(series, x) {
    for (var i = 1; i < series.length; i++) {
      if (series[i][0] >= x) {
        var a = series[i - 1], b = series[i], span = b[0] - a[0];
        return span > 1e-6 ? a[1] + (b[1] - a[1]) * (x - a[0]) / span : b[1];
      }
    }
    return series.length ? series[series.length - 1][1] : 0;
  }
  // Bezier speeds at the two keys, exactly as AE stores them (x average).
  function bezSpeeds() {
    var b = state.bezier;
    return { out: b.p1x > 0.001 ? b.p1y / b.p1x : 0, inn: b.p2x < 0.999 ? (1 - b.p2y) / (1 - b.p2x) : 0 };
  }

  /* ── coordinate mapping ── */
  function fitView(series) {
    var lo = 0, hi = 1, i, y;
    if (state.graph === 'speed' && series) {
      hi = 1.2;
      for (i = 0; i < series.length; i++) { y = series[i][1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      if (state.model === 'bezier' && !state.invert) { var bs = bezSpeeds(); hi = Math.max(hi, bs.out, bs.inn); lo = Math.min(lo, bs.out, bs.inn); }
      view.yMin = lo - (hi - lo) * 0.08; view.yMax = hi + (hi - lo) * 0.12;
      return;
    }
    for (i = 0; i <= 96; i++) { y = evalCurve(i / 96); if (y < lo) lo = y; if (y > hi) hi = y; }
    var pad = (hi - lo) * 0.12 + 0.05; view.yMin = lo - pad; view.yMax = hi + pad;
  }
  function sx(x) { return PAD.l + x * (VB.w - PAD.l - PAD.r); }
  function sy(y) { var span = view.yMax - view.yMin || 1; return PAD.t + (1 - (y - view.yMin) / span) * (VB.h - PAD.t - PAD.b); }
  function ux(px) { return (px - PAD.l) / (VB.w - PAD.l - PAD.r); }
  function uy(py) { var span = view.yMax - view.yMin || 1; return view.yMin + (1 - (py - PAD.t) / (VB.h - PAD.t - PAD.b)) * span; }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  var dom = {};
  var previewRaf = 0, previewT = -1;

  // VALUE mode sends the curve itself: 241 evenly spaced y samples with
  // Invert already applied, which the host bakes one key per frame.
  function valueSamples() {
    var out = [];
    for (var i = 0; i <= 240; i++) out.push(fmt(evalCurve(i / 240), 5));
    return out.join(',');
  }
  function buildPayload() {
    if (state.applyAs === 'value') return state.model + '|value|0||' + valueSamples();
    var graphMode, params = '', pts = '';
    if (state.model === 'bezier') { graphMode = 'ease'; var b = state.bezier; params = [b.p1x, b.p1y, b.p2x, b.p2y].map(function (n) { return fmt(n, 5); }).join(','); }
    else if (state.model === 'custom') { graphMode = 'bake'; pts = state.points.map(function (p) { return [p.x, p.y, p.cx1, p.cy1, p.cx2, p.cy2].map(function (n) { return fmt(n, 5); }).join(','); }).join(';'); }
    else if (state.model === 'elastic') { graphMode = 'expr'; params = [state.elastic.amplitude, state.elastic.frequency, state.elastic.decay].map(function (n) { return fmt(n, 5); }).join(','); }
    else if (state.model === 'bounce') { graphMode = 'expr'; params = [Math.round(state.bounce.bounces), state.bounce.stiffness].map(function (n) { return fmt(n, 5); }).join(','); }
    else if (state.model === 'wave') { graphMode = 'expr'; params = [state.wave.frequency, state.wave.decay, state.wave.sharpness].map(function (n) { return fmt(n, 5); }).join(','); }
    else { graphMode = 'bake'; var posCode = state.steps.position === 'start' ? 1 : state.steps.position === 'both' ? 2 : 0; params = Math.round(state.steps.count) + ',' + posCode; }
    return state.model + '|' + graphMode + '|' + (state.invert ? 1 : 0) + '|' + params + '|' + pts;
  }

  function status(msg, kind) { if (dom.status) { dom.status.textContent = msg; dom.status.className = 'fx20-status' + (kind ? ' ' + kind : ''); } }
  function readout() { if (dom.info) { try { dom.info.value = state.model; } catch (e) {} } }

  /* ── render curve + handles ── */
  function render() {
    if (state.graph === 'speed') { renderSpeed(); return; }
    fitView();
    var svg = dom.svg; if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    // grid
    var g = svgEl('g', { 'class': 'fx20-grid' }); var i;
    for (i = 0; i <= 4; i++) { var gx = PAD.l + i / 4 * (VB.w - PAD.l - PAD.r); g.appendChild(svgEl('line', { x1: gx, y1: PAD.t, x2: gx, y2: VB.h - PAD.b })); }
    for (i = 0; i <= 4; i++) { var gy = PAD.t + i / 4 * (VB.h - PAD.t - PAD.b); g.appendChild(svgEl('line', { x1: PAD.l, y1: gy, x2: VB.w - PAD.r, y2: gy })); }
    svg.appendChild(g);
    // zero + one guide lines
    var z0 = svgEl('line', { x1: PAD.l, y1: sy(0), x2: VB.w - PAD.r, y2: sy(0), 'class': 'fx20-grid-strong' });
    var z1 = svgEl('line', { x1: PAD.l, y1: sy(1), x2: VB.w - PAD.r, y2: sy(1), 'class': 'fx20-grid-strong' });
    svg.appendChild(z0); svg.appendChild(z1);
    // curve path + area
    var N = 96, dline = '', aline = 'M' + sx(0) + ' ' + sy(0);
    for (i = 0; i <= N; i++) { var x = i / N, y = evalCurve(x); var px = sx(x), py = sy(y); dline += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ' ' + py.toFixed(2); aline += 'L' + px.toFixed(2) + ' ' + py.toFixed(2); }
    aline += 'L' + sx(1) + ' ' + sy(0) + 'Z';
    svg.appendChild(svgEl('path', { d: aline, 'class': 'fx20-curvearea' }));
    svg.appendChild(svgEl('path', { d: dline, 'class': 'fx20-curve' }));
    // bezier handles
    if (state.model === 'bezier') {
      var b = state.bezier;
      var a0 = { x: sx(0), y: sy(0) }, a1 = { x: sx(1), y: sy(1) };
      var h1 = { x: sx(b.p1x), y: sy(b.p1y) }, h2 = { x: sx(b.p2x), y: sy(b.p2y) };
      svg.appendChild(svgEl('line', { x1: a0.x, y1: a0.y, x2: h1.x, y2: h1.y, 'class': 'fx20-armline' }));
      svg.appendChild(svgEl('line', { x1: a1.x, y1: a1.y, x2: h2.x, y2: h2.y, 'class': 'fx20-armline' }));
      svg.appendChild(svgEl('circle', { cx: a0.x, cy: a0.y, r: 4, 'class': 'fx20-anchor-fixed' }));
      svg.appendChild(svgEl('circle', { cx: a1.x, cy: a1.y, r: 4, 'class': 'fx20-anchor-fixed' }));
      var c1 = svgEl('circle', { cx: h1.x, cy: h1.y, r: 5.5, 'class': 'fx20-handle', 'data-h': '1' });
      var c2 = svgEl('circle', { cx: h2.x, cy: h2.y, r: 5.5, 'class': 'fx20-handle', 'data-h': '2' });
      svg.appendChild(c1); svg.appendChild(c2);
    } else if (state.model === 'custom') {
      for (i = 0; i < state.points.length; i++) {
        var pt = state.points[i], anchor = { x:sx(pt.x), y:sy(pt.y) };
        if (i > 0) {
          var hin = { x:sx(pt.cx1), y:sy(pt.cy1) };
          svg.appendChild(svgEl('line', { x1:anchor.x, y1:anchor.y, x2:hin.x, y2:hin.y, 'class':'fx20-armline' }));
          svg.appendChild(svgEl('circle', { cx:hin.x, cy:hin.y, r:4.5, 'class':'fx20-handle', 'data-point':i, 'data-role':'in' }));
        }
        if (i < state.points.length - 1) {
          var hout = { x:sx(pt.cx2), y:sy(pt.cy2) };
          svg.appendChild(svgEl('line', { x1:anchor.x, y1:anchor.y, x2:hout.x, y2:hout.y, 'class':'fx20-armline' }));
          svg.appendChild(svgEl('circle', { cx:hout.x, cy:hout.y, r:4.5, 'class':'fx20-handle', 'data-point':i, 'data-role':'out' }));
        }
        svg.appendChild(svgEl('circle', { cx:anchor.x, cy:anchor.y, r:state.selectedPoint===i?6:4.5, 'class':'fx20-spline-point'+(state.selectedPoint===i?' selected':''), 'data-point':i, 'data-role':'anchor' }));
      }
    }
    if (previewT >= 0 && previewT <= 1) {
      svg.appendChild(svgEl('circle', { cx: sx(previewT), cy: sy(evalCurve(previewT)), r: 5, 'class': 'fx20-previewdot' }));
    }
    readout();
  }

  function renderSpeed() {
    var svg = dom.svg; if (!svg) return;
    var series = speedSeries();
    fitView(series);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = svgEl('g', { 'class': 'fx20-grid' }), i;
    for (i = 0; i <= 4; i++) { var gx = PAD.l + i / 4 * (VB.w - PAD.l - PAD.r); g.appendChild(svgEl('line', { x1: gx, y1: PAD.t, x2: gx, y2: VB.h - PAD.b })); }
    for (i = 0; i <= 4; i++) { var gy = PAD.t + i / 4 * (VB.h - PAD.t - PAD.b); g.appendChild(svgEl('line', { x1: PAD.l, y1: gy, x2: VB.w - PAD.r, y2: gy })); }
    svg.appendChild(g);
    svg.appendChild(svgEl('line', { x1: PAD.l, y1: sy(0), x2: VB.w - PAD.r, y2: sy(0), 'class': 'fx20-grid-strong' }));
    svg.appendChild(svgEl('line', { x1: PAD.l, y1: sy(1), x2: VB.w - PAD.r, y2: sy(1), 'class': 'fx20-speed-avg' }));
    var avg = svgEl('text', { x: PAD.l + 3, y: sy(1) - 3, 'class': 'fx20-axis-label' }); avg.textContent = 'avg'; svg.appendChild(avg);
    var zl = svgEl('text', { x: PAD.l + 3, y: sy(0) - 3, 'class': 'fx20-axis-label' }); zl.textContent = '0'; svg.appendChild(zl);
    var dline = '', aline = 'M' + sx(series[0][0]).toFixed(2) + ' ' + sy(0).toFixed(2);
    for (i = 0; i < series.length; i++) {
      var px = sx(series[i][0]).toFixed(2), py = sy(series[i][1]).toFixed(2);
      dline += (i === 0 ? 'M' : 'L') + px + ' ' + py; aline += 'L' + px + ' ' + py;
    }
    aline += 'L' + sx(series[series.length - 1][0]).toFixed(2) + ' ' + sy(0).toFixed(2) + 'Z';
    svg.appendChild(svgEl('path', { d: aline, 'class': 'fx20-curvearea fx20-speedarea' }));
    svg.appendChild(svgEl('path', { d: dline, 'class': 'fx20-curve fx20-speedcurve' }));
    // Bezier: AE-style speed handles. Height is the key's speed, length its influence.
    if (state.model === 'bezier' && !state.invert) {
      var b = state.bezier, bs = bezSpeeds();
      var k0 = { x: sx(0), y: sy(bs.out) }, k1 = { x: sx(1), y: sy(bs.inn) };
      var h1 = { x: sx(b.p1x), y: sy(bs.out) }, h2 = { x: sx(b.p2x), y: sy(bs.inn) };
      svg.appendChild(svgEl('line', { x1: k0.x, y1: k0.y, x2: h1.x, y2: h1.y, 'class': 'fx20-armline' }));
      svg.appendChild(svgEl('line', { x1: k1.x, y1: k1.y, x2: h2.x, y2: h2.y, 'class': 'fx20-armline' }));
      svg.appendChild(svgEl('rect', { x: k0.x - 3.5, y: k0.y - 3.5, width: 7, height: 7, 'class': 'fx20-anchor-fixed' }));
      svg.appendChild(svgEl('rect', { x: k1.x - 3.5, y: k1.y - 3.5, width: 7, height: 7, 'class': 'fx20-anchor-fixed' }));
      svg.appendChild(svgEl('circle', { cx: h1.x, cy: h1.y, r: 5.5, 'class': 'fx20-handle', 'data-h': '1' }));
      svg.appendChild(svgEl('circle', { cx: h2.x, cy: h2.y, r: 5.5, 'class': 'fx20-handle', 'data-h': '2' }));
    }
    if (previewT >= 0 && previewT <= 1) {
      svg.appendChild(svgEl('circle', { cx: sx(previewT), cy: sy(speedAt(series, previewT)), r: 5, 'class': 'fx20-previewdot' }));
    }
    readout();
  }

  /* ── view + apply-as toggles ── */
  var APPLY_HINTS = {
    value: 'VALUE · BAKE — the exact curve becomes one keyframe per frame between the first and last selected key (keys in between are replaced). Every curve type works, no expression; the Value Graph shows it exactly.',
    bezier: 'SPEED · EASE — keeps your keyframes and only sets their ease handles (speed + influence). You see it in the Speed Graph; the Value Graph follows.',
    custom: 'SPEED · EASE — each spline point becomes a keyframe eased from its handles.',
    steps: 'SPEED · EASE — steps become hold keyframes.',
    expr: 'SPEED · EASE — this curve cannot be a plain ease, so it runs as an expression between the first and last selected key. Pick VALUE for real keyframes instead.'
  };
  function syncModes() {
    if (dom.viewSeg) { var vb = dom.viewSeg.querySelectorAll('button'); for (var i = 0; i < vb.length; i++) vb[i].classList.toggle('active', vb[i].getAttribute('data-view') === state.graph); }
    if (dom.asSeg) { var ab = dom.asSeg.querySelectorAll('button'); for (var j = 0; j < ab.length; j++) ab[j].classList.toggle('active', ab[j].getAttribute('data-as') === state.applyAs); }
    if (dom.applyHint) {
      var key = state.applyAs === 'value' ? 'value' : (state.model === 'bezier' || state.model === 'custom' || state.model === 'steps') ? state.model : 'expr';
      dom.applyHint.textContent = APPLY_HINTS[key];
    }
    if (dom.apply) dom.apply.textContent = state.applyAs === 'value' ? '✓ APPLY AS VALUE (BAKE KEYS)' : '✓ APPLY AS SPEED (EASE)';
    if (dom.canvasLabel) dom.canvasLabel.textContent = state.graph === 'speed' ? 'SPEED GRAPH · 1 = average speed' : 'VALUE GRAPH · 0 = first key, 1 = last key';
  }

  /* ── keyframe row (numbered badge + slider + value + copy/trash) ── */
  function keyRow(idx, label, key, obj, min, max, step, icon, onIcon) {
    var row = document.createElement('div'); row.className = 'fx20-keyrow';
    var badge = document.createElement('span'); badge.className = 'fx20-keynum'; badge.textContent = idx;
    var lab = document.createElement('span'); lab.className = 'fx20-keylabel'; lab.textContent = label;
    var inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = obj[key];
    inp.addEventListener('input', function () { obj[key] = parseFloat(inp.value); val.textContent = fmt(obj[key], 2); render(); });
    var val = document.createElement('b'); val.textContent = fmt(obj[key], 2);
    var track = document.createElement('div'); track.className = 'fx20-keytrack'; track.appendChild(inp);
    var act = document.createElement('button'); act.className = 'fx20-keyact'; act.textContent = icon; act.title = icon === '⧉' ? 'Copy this value' : 'Reset this parameter';
    act.addEventListener('click', onIcon);
    row.appendChild(badge); row.appendChild(lab); row.appendChild(track); row.appendChild(val); row.appendChild(act);
    return row;
  }
  function paramRow(idx, label, key, obj, min, max, step, defVal) {
    var row = keyRow(idx, label, key, obj, min, max, step, idx === 1 ? '⧉' : '✕', function () {
      if (idx === 1) {
        // copy full curve payload to clipboard
        var payload = buildPayload();
        try { if (window.navigator && navigator.clipboard) { navigator.clipboard.writeText(payload).then(function(){ status('Curve payload copied.','success'); }, function(){ status('Could not copy.',''); }); } else status('Clipboard unavailable.',''); } catch (e) { status('Could not copy.',''); }
      } else { obj[key] = defVal; render(); renderParams(); status(label + ' reset to default.',''); }
    });
    return row;
  }
  function renderParams() {
    var box = dom.params; if (!box) return; box.innerHTML = '';
    if (state.model === 'bezier') {
      var b = state.bezier;
      box.appendChild(paramRow(1, 'X1', 'p1x', b, 0, 1, 0.01, 0.42));
      box.appendChild(paramRow(2, 'Y1', 'p1y', b, -0.6, 1.6, 0.01, 0));
      box.appendChild(paramRow(3, 'X2', 'p2x', b, 0, 1, 0.01, 0.58));
      box.appendChild(paramRow(4, 'Y2', 'p2y', b, -0.6, 1.6, 0.01, 1));
    }
    else if (state.model === 'elastic') { var e = state.elastic; box.appendChild(paramRow(1, 'AMPLITUDE', 'amplitude', e, 0.2, 2, 0.01, 1)); box.appendChild(paramRow(2, 'FREQUENCY', 'frequency', e, 0.5, 6, 0.01, 3)); box.appendChild(paramRow(3, 'DECAY', 'decay', e, 1, 8, 0.05, 4)); }
    else if (state.model === 'bounce') { var bo = state.bounce; box.appendChild(paramRow(1, 'BOUNCES', 'bounces', bo, 1, 8, 1, 3)); box.appendChild(paramRow(2, 'STIFFNESS', 'stiffness', bo, 0.1, 0.95, 0.01, 0.6)); }
    else if (state.model === 'wave') { var wv = state.wave; box.appendChild(paramRow(1, 'FREQUENCY', 'frequency', wv, 1, 8, 0.1, 3)); box.appendChild(paramRow(2, 'DECAY', 'decay', wv, 0, 6, 0.05, 2)); box.appendChild(paramRow(3, 'SHARPNESS', 'sharpness', wv, -3, 3, 0.1, 0)); }
    else if (state.model === 'steps') {
      var st = state.steps; box.appendChild(paramRow(1, 'COUNT', 'count', st, 2, 20, 1, 8));
      var wrap = document.createElement('label'); wrap.className = 'fx20-keyrow';
      var badge = document.createElement('span'); badge.className = 'fx20-keynum'; badge.textContent = '2';
      var lab = document.createElement('span'); lab.className = 'fx20-keylabel'; lab.textContent = 'POSITION';
      var sel = document.createElement('select'); sel.className = 'fx20-select';
      ['end', 'start', 'both'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v.toUpperCase(); if (st.position === v) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { st.position = sel.value; render(); });
      var wrapVal = document.createElement('b'); wrapVal.className = 'fx20-selectval'; wrapVal.textContent = st.position.toUpperCase();
      sel.addEventListener('change', function () { wrapVal.textContent = sel.value.toUpperCase(); });
      wrap.appendChild(badge); wrap.appendChild(lab); wrap.appendChild(sel); wrap.appendChild(wrapVal);
      box.appendChild(wrap);
    }
  }

  /* ── preset library ── */
  function currentLib() { return state.libTab === 'base' ? BASE_PRESETS : state.libTab === 'user' ? userPresets : DEFAULT_PRESETS; }
  function loadPreset(p) {
    state.model = p.model;
    if (p.model === 'custom' && p.params.points) state.points = cloneObj(p.params.points);
    else if (state[p.model]) { for (var k in p.params) state[p.model][k] = p.params[k]; }
    syncModelStrip(); renderParams(); render();
    status('Loaded preset: ' + p.name, '');
  }
  function renderLib() {
    var box = dom.lib; if (!box) return; box.innerHTML = '';
    var list = currentLib();
    if (!list.length) { var empty = document.createElement('div'); empty.className = 'fx20-lib-empty'; empty.textContent = state.libTab === 'user' ? 'Save a curve to build your library.' : 'No presets.'; box.appendChild(empty); return; }
    list.forEach(function (p, idx) {
      var card = document.createElement('button'); card.className = 'fx20-preset'; card.setAttribute('aria-label', p.name + '. Click to load; double-click to apply.');
      var mini = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mini.setAttribute('viewBox', '0 0 40 24'); mini.setAttribute('class', 'fx20-preset-mini');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', miniPath(p)); path.setAttribute('class', 'fx20-preset-line'); mini.appendChild(path);
      var name = document.createElement('span'); name.textContent = p.name;
      card.appendChild(mini); card.appendChild(name);
      card.addEventListener('click', function () { loadPreset(p); });
      card.addEventListener('dblclick', function () { loadPreset(p); applyCurve(); });
      box.appendChild(card);
    });
  }
  function miniPath(p) {
    var saveModel = state.model, saveState = {};
    MODELS.forEach(function (m) { if (state[m]) saveState[m] = cloneObj(state[m]); });
    var savePts = cloneObj(state.points);
    state.model = p.model;
    if (p.model === 'custom' && p.params.points) state.points = cloneObj(p.params.points);
    else if (state[p.model]) { for (var k in p.params) state[p.model][k] = p.params[k]; }
    var d = '', lo = 0, hi = 1, i, ys = [];
    for (i = 0; i <= 24; i++) { var y = evalCurve(i / 24); ys.push(y); if (y < lo) lo = y; if (y > hi) hi = y; }
    var span = (hi - lo) || 1;
    for (i = 0; i <= 24; i++) { var px = 3 + i / 24 * 34; var py = 21 - (ys[i] - lo) / span * 18; d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1); }
    state.model = saveModel; MODELS.forEach(function (m) { if (saveState[m]) state[m] = saveState[m]; }); state.points = savePts;
    return d;
  }

  function syncModelStrip() {
    syncModes();
    var btns = dom.strip ? dom.strip.querySelectorAll('.fx20-model') : [];
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-model') === state.model);
  }

  /* ── centralized host bridge ── */
  function applyCurve() {
    status('Applying…', '');
    hostRaw('ae_graph20Apply("' + buildPayload() + '")', function (res) {
      if (res.indexOf('ERR') === 0 || res.indexOf('"ok":false') >= 0 || res.indexOf('"success":false') >= 0) status(res.replace(/^ERR:\s*/, ''), 'error');
      else status(res.replace(/^SUCCESS:\s*/, '') || 'Applied to selected keyframes.', 'success');
    });
  }
  function readCurve() {
    hostRaw('ae_graph20Read()', function (res) {
      if (res.indexOf('ERR') === 0) { status(res.replace(/^ERR:\s*/, ''), 'error'); return; }
      if (res.indexOf('OK|') !== 0) { status('Could not read the selected keys.', 'error'); return; }
      var pts = res.substring(3).split(';').map(function (chunk) {
        var v = chunk.split(',').map(parseFloat);
        return { x:v[0], y:v[1], cx1:v[2], cy1:v[3], cx2:v[4], cy2:v[5] };
      }).filter(function (p) { return !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.cx1) && !isNaN(p.cy1) && !isNaN(p.cx2) && !isNaN(p.cy2); });
      if (pts.length < 2) { status('Need at least two keyframes to read a curve.', 'error'); return; }
      state.invert = false; state.selectedPoint = -1;
      if (pts.length === 2 && Math.abs(pts[0].y) < .001 && Math.abs(pts[1].y - 1) < .001) {
        state.model = 'bezier'; state.bezier = { p1x:clamp(pts[0].cx2,0,1), p1y:pts[0].cy2, p2x:clamp(pts[1].cx1,0,1), p2y:pts[1].cy1 };
      } else { state.model = 'custom'; state.points = pts; }
      syncModelStrip(); renderParams(); render(); status('Curve loaded from selected AE keys.', 'success');
    });
  }
  function removeExpr() {
    hostRaw('ae_graph20Remove()', function (res) { status(res.indexOf('ERR') === 0 ? res.replace(/^ERR:\s*/, '') : 'Expression removed.', res.indexOf('ERR') === 0 ? 'error' : 'success'); });
  }
  function saveUserPreset() {
    var name = (window.prompt && window.prompt('Preset name', MODEL_LABELS[state.model] + ' ' + (userPresets.length + 1))) || '';
    name = name.trim(); if (!name) return;
    var params = state.model === 'custom' ? { points: cloneObj(state.points) } : cloneObj(state[state.model]);
    userPresets.push({ name: name.toUpperCase(), model: state.model, params: params });
    try { localStorage.setItem('compxGraph20UserPresets', JSON.stringify(userPresets)); } catch (e) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback("GRAPH20_SAVEUSERPRESET_001", e); }
    state.libTab = 'user'; syncLibTabs(); renderLib(); status('Saved to MINE.', 'success');
  }
  function syncLibTabs() { if (!dom.libTabs) return; var t = dom.libTabs.querySelectorAll('button'); for (var i = 0; i < t.length; i++) t[i].classList.toggle('active', t[i].getAttribute('data-lib') === state.libTab); }

  /* ── preview animation (CompX-style traveling dot) ── */
  function togglePreview() {
    if (previewRaf) { stopPreview(); return; }
    var start = (window.performance && performance.now) ? performance.now() : Date.now();
    var DUR = 1400;
    function frame(now) {
      previewT = (((now - start) % DUR) / DUR);
      render();
      previewRaf = requestAnimationFrame(frame);
    }
    previewRaf = requestAnimationFrame(frame);
    if (dom.play) dom.play.classList.add('active');
  }
  function stopPreview() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = 0; previewT = -1;
    if (dom.play) dom.play.classList.remove('active');
    render();
  }

  /* ── drag handling ── */
  function pointerUV(evt) {
    var rect = dom.svg.getBoundingClientRect();
    var px = (evt.clientX - rect.left) / rect.width * VB.w;
    var py = (evt.clientY - rect.top) / rect.height * VB.h;
    return { x: ux(px), y: uy(py) };
  }
  function onDown(evt) {
    var t = evt.target; if (!t || !t.getAttribute) return;
    if (state.model === 'bezier' && t.classList.contains('fx20-handle')) state.drag = { type:'bezier', handle:t.getAttribute('data-h') };
    else if (state.graph === 'speed' && state.model !== 'bezier') { status('Edit this curve in the VALUE view; SPEED shows the result.', ''); return; }
    else if (state.model === 'custom' && (t.classList.contains('fx20-handle') || t.classList.contains('fx20-spline-point'))) {
      state.selectedPoint = parseInt(t.getAttribute('data-point'), 10);
      state.drag = { type:'custom', point:state.selectedPoint, role:t.getAttribute('data-role') };
      render();
    }
    if (state.drag) evt.preventDefault();
  }
  function onMove(evt) {
    if (!state.drag) return; var uv = pointerUV(evt); var b = state.bezier;
    var x = clamp(uv.x, 0, 1), y = clamp(uv.y, -0.6, 1.6);
    if (state.drag.type === 'bezier' && state.graph === 'speed') {
      // Horizontal = influence, vertical = speed at that key (x average).
      var spd = clamp(uv.y, -SPEED_CAP, SPEED_CAP);
      if (state.drag.handle === '1') { b.p1x = clamp(uv.x, 0.01, 1); b.p1y = clamp(spd * b.p1x, -0.6, 1.6); }
      else { b.p2x = clamp(uv.x, 0, 0.99); b.p2y = clamp(1 - spd * (1 - b.p2x), -0.6, 1.6); }
    } else if (state.drag.type === 'bezier') {
      if (state.drag.handle === '1') { b.p1x = x; b.p1y = y; } else { b.p2x = x; b.p2y = y; }
    } else {
      var p = state.points[state.drag.point]; if (!p) return;
      if (state.drag.role === 'anchor') {
        var oldX=p.x, oldY=p.y, minX=state.drag.point===0?0:state.points[state.drag.point-1].x+.01, maxX=state.drag.point===state.points.length-1?1:state.points[state.drag.point+1].x-.01;
        if (state.drag.point === 0) { x=0; y=0; } else if (state.drag.point === state.points.length-1) { x=1; y=1; } else x=clamp(x,minX,maxX);
        var dx=x-oldX, dy=y-oldY; p.x=x; p.y=y; p.cx1+=dx; p.cy1+=dy; p.cx2+=dx; p.cy2+=dy;
      } else if (state.drag.role === 'in') { p.cx1=clamp(x,state.drag.point?state.points[state.drag.point-1].x:p.x,p.x); p.cy1=y; }
      else { p.cx2=clamp(x,p.x,state.drag.point<state.points.length-1?state.points[state.drag.point+1].x:p.x); p.cy2=y; }
    }
    renderParams(); render();
  }
  function onUp() { state.drag = null; }
  function addSplinePoint(evt) {
    if (state.model !== 'custom' || state.graph === 'speed') return;
    var uv=pointerUV(evt), x=clamp(uv.x,.02,.98), y=clamp(uv.y,-.6,1.6), span=.09;
    state.points.push({x:x,y:y,cx1:Math.max(0,x-span),cy1:y,cx2:Math.min(1,x+span),cy2:y});
    state.points.sort(function(a,b){return a.x-b.x;});
    for (var i=0;i<state.points.length;i++) if (state.points[i].x===x) state.selectedPoint=i;
    render(); status('Spline point added. Drag the point or its handles.','success');
  }
  function deleteSplinePoint() {
    if (state.model !== 'custom' || state.selectedPoint <= 0 || state.selectedPoint >= state.points.length-1) { status('Select an interior spline point to delete.',''); return; }
    state.points.splice(state.selectedPoint,1); state.selectedPoint=-1; render();
  }

  /* ── build DOM ── */
  function build(root) {
    var modelOptions = MODELS.map(function (m) { return '<option value="' + m + '">' + MODEL_LABELS[m] + '</option>'; }).join('');
    root.innerHTML = '' +
      '<div class="fx20-topbar">' +
        '<div class="fx20-titleblock">' +
          '<div class="fx20-title"><span class="fx20-kicker"></span><strong>MOTION Curve Lab</strong></div>' +
          '<div class="fx20-subtitle">Create custom motion with bezier curves</div>' +
        '</div>' +
        '<div class="fx20-meta">' +
          '<select id="fx20-modelselect" class="fx20-modelselect" title="Curve type">' + modelOptions + '</select>' +
          '<div class="fx20-seg" id="fx20-view" role="group" aria-label="Graph view"><button data-view="value" title="Value Graph: where the property is over time">VALUE</button><button data-view="speed" title="Speed Graph: how fast it moves, like AE\'s Speed Graph">SPEED</button></div>' +
          '<button id="fx20-play" class="fx20-chip" title="Preview animation">▶ PLAY</button>' +
          '<button id="fx20-invert" class="fx20-chip" title="Invert curve">INV</button>' +
          '<div class="fx20-libtabs" id="fx20-libtabs"><button data-lib="def" class="active">DEF</button><button data-lib="base">BASE</button><button data-lib="user">MINE</button></div>' +
          '<button id="fx20-save" class="fx20-savechip" title="Save current curve to MINE">＋ SAVE</button>' +
        '</div>' +
      '</div>' +
      '<div class="fx20-modelstrip" id="fx20-strip"></div>' +
      '<div class="fx20-canvas-wrap"><span class="fx20-canvas-label" id="fx20-canvaslabel"></span><svg id="fx20-svg" viewBox="0 0 ' + VB.w + ' ' + VB.h + '" preserveAspectRatio="none"></svg></div>' +
      '<div class="fx20-spline-actions"><button id="fx20-addpoint" title="Switch to Spline; double-click the graph to add points">＋ POINT</button><button id="fx20-delpoint">− POINT</button></div>' +
      '<div class="fx20-keyshead"><span class="fx20-keys-title">KEYFRAME COORDINATES</span><span class="fx20-keys-hint" id="fx20-keyshint"></span></div>' +
      '<div class="fx20-params" id="fx20-params"></div>' +
      '<div class="fx20-actions"><button id="fx20-read">⌨ READ KEYS</button><button id="fx20-remove">🗑 REMOVE COMPX EXPR</button></div>' +
      '<div class="fx20-applyas"><span class="fx20-applyas-label">APPLY AS</span><div class="fx20-seg fx20-seg-wide" id="fx20-applyas" role="group" aria-label="Apply as"><button data-as="speed" title="Keep the keyframes; set their ease (Speed Graph)">SPEED · EASE</button><button data-as="value" title="Bake the exact curve into value keyframes (Value Graph)">VALUE · BAKE</button></div></div>' +
      '<div class="fx20-applyhint" id="fx20-applyhint"></div>' +
      '<button id="fx20-apply" class="fx20-apply">✓ APPLY TO SELECTED KEYS</button>' +
      '<div class="fx20-statusbar"><div class="fx20-status" id="fx20-status">Select a property and two adjacent keyframes.</div><button id="fx20-how" class="fx20-howbtn" title="How it works">? HOW IT WORKS</button></div>' +
      '<div class="fx20-howto" id="fx20-howto" hidden><b>How it works</b><span>Select a property in AE with two adjacent keyframes, click <b>⌨ READ KEYS</b> to load its motion, sculpt the curve here, then <b>✓ APPLY TO SELECTED KEYS</b>. Double-click a spline to add points; drag the green handles. Presets are one-click — double-click a preset to load and apply.</span></div>' +
      '<div class="fx20-lib" id="fx20-lib"></div>';
    dom.svg = root.querySelector('#fx20-svg');
    dom.strip = root.querySelector('#fx20-strip');
    dom.params = root.querySelector('#fx20-params');
    dom.lib = root.querySelector('#fx20-lib');
    dom.libTabs = root.querySelector('#fx20-libtabs');
    dom.status = root.querySelector('#fx20-status');
    dom.info = root.querySelector('#fx20-modelselect');
    dom.play = root.querySelector('#fx20-play');
    dom.viewSeg = root.querySelector('#fx20-view');
    dom.asSeg = root.querySelector('#fx20-applyas');
    dom.applyHint = root.querySelector('#fx20-applyhint');
    dom.apply = root.querySelector('#fx20-apply');
    dom.canvasLabel = root.querySelector('#fx20-canvaslabel');
    dom.viewSeg.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-view]'); if (!btn) return;
      state.graph = btn.getAttribute('data-view');
      try { localStorage.setItem('compxGraph20View', state.graph); } catch (e1) { /* sandboxed storage */ }
      syncModes(); render();
    });
    dom.asSeg.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-as]'); if (!btn) return;
      state.applyAs = btn.getAttribute('data-as');
      try { localStorage.setItem('compxGraph20ApplyAs', state.applyAs); } catch (e2) { /* sandboxed storage */ }
      syncModes();
    });
    // model strip
    MODELS.forEach(function (m) {
      var btn = document.createElement('button'); btn.className = 'fx20-model' + (m === state.model ? ' active' : ''); btn.setAttribute('data-model', m);
      var mini = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mini.setAttribute('viewBox', '0 0 16 14');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', MODEL_ICON[m]); mini.appendChild(path);
      var span = document.createElement('span'); span.textContent = MODEL_LABELS[m];
      btn.appendChild(mini); btn.appendChild(span);
      btn.addEventListener('click', function () { state.model = m; syncModelStrip(); syncModelSelect(); renderParams(); render(); });
      dom.strip.appendChild(btn);
    });
    // events
    dom.svg.addEventListener('mousedown', onDown);
    dom.svg.addEventListener('dblclick', addSplinePoint);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    root.querySelector('#fx20-apply').addEventListener('click', applyCurve);
    root.querySelector('#fx20-read').addEventListener('click', readCurve);
    root.querySelector('#fx20-remove').addEventListener('click', removeExpr);
    root.querySelector('#fx20-addpoint').addEventListener('click', function () { state.model='custom'; state.selectedPoint=-1; syncModelStrip(); syncModelSelect(); renderParams(); render(); status('Double-click the graph to add a spline point.',''); });
    root.querySelector('#fx20-delpoint').addEventListener('click', deleteSplinePoint);
    root.querySelector('#fx20-save').addEventListener('click', saveUserPreset);
    root.querySelector('#fx20-invert').addEventListener('click', function () { state.invert = !state.invert; this.classList.toggle('active', state.invert); render(); });
    root.querySelector('#fx20-play').addEventListener('click', togglePreview);
    root.querySelector('#fx20-modelselect').addEventListener('change', function () { state.model = this.value; syncModelStrip(); renderParams(); render(); });
    root.querySelector('#fx20-how').addEventListener('click', function () { var box = root.querySelector('#fx20-howto'); var show = box.hidden; box.hidden = !show; this.classList.toggle('active', show); });
    var tabs = dom.libTabs.querySelectorAll('button');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function () { state.libTab = this.getAttribute('data-lib'); syncLibTabs(); renderLib(); });
    try { var raw = localStorage.getItem('compxGraph20UserPresets'); if (raw) userPresets = JSON.parse(raw) || []; } catch (e) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback("GRAPH20_BUILD_001", e); }
    renderParams(); renderLib(); syncModes(); render();
  }

  function syncModelSelect() {
    if (dom.info && dom.info.tagName === 'SELECT') dom.info.value = state.model;
  }

  function initFlexBounce() {
    var card = document.getElementById('cxFlexBounceCard');
    if (!card) return;
    var canvas = document.getElementById('fxbCanvas');
    var ampEl = document.getElementById('fxbAmp');
    var freqEl = document.getElementById('fxbFreq');
    var dampEl = document.getElementById('fxbDamp');
    var ampVal = document.getElementById('fxbAmpVal');
    var freqVal = document.getElementById('fxbFreqVal');
    var dampVal = document.getElementById('fxbDampVal');
    var statusEl = document.getElementById('fxbStatus');
    if (!canvas || !ampEl || !freqEl || !dampEl) return;

    function num(el, fallback) {
      var v = parseFloat(el.value);
      return isFinite(v) ? v : fallback;
    }
    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = 'fx20-status' + (kind ? ' ' + kind : '');
    }
    function exprAmp() { return Math.round((num(ampEl, 20) / 100) * 1000) / 1000; }
    function draw() {
      var w = canvas.width, h = canvas.height;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var amp = num(ampEl, 20);
      var freq = num(freqEl, 2);
      var damp = num(dampEl, 4);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(143,160,201,.16)';
      ctx.lineWidth = 1;
      var i;
      for (i = 1; i < 4; i++) {
        var gy = Math.round(h * i / 4) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(143,160,201,.28)';
      ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.lineTo(w, h * 0.62); ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2.2;
      var peak = Math.max(8, amp * 2.1);
      for (i = 0; i <= w; i++) {
        var t = i / w * 2.4;
        var y = Math.sin(freq * t * Math.PI * 2) * Math.exp(-damp * t * 0.55);
        var py = h * 0.62 - y * peak;
        if (i === 0) ctx.moveTo(i, py);
        else ctx.lineTo(i, py);
      }
      ctx.stroke();
    }
    function syncLabels() {
      if (ampVal) ampVal.textContent = String(Math.round(num(ampEl, 20)));
      if (freqVal) freqVal.textContent = fmt(num(freqEl, 2), 1);
      if (dampVal) dampVal.textContent = fmt(num(dampEl, 4), 1);
      draw();
    }
    function resetSliders() {
      ampEl.value = '20';
      freqEl.value = '2';
      dampEl.value = '4';
      syncLabels();
      setStatus('Sliders reset to Orbit Bounce defaults (20 / 2 / 4).', '');
    }
    ampEl.addEventListener('input', syncLabels);
    freqEl.addEventListener('input', syncLabels);
    dampEl.addEventListener('input', syncLabels);
    var resetBtn = document.getElementById('fxbReset');
    var applyBtn = document.getElementById('fxbApply');
    var removeBtn = document.getElementById('fxbRemove');
    resetBtn && resetBtn.addEventListener('click', resetSliders);
    applyBtn && applyBtn.addEventListener('click', function () {
      setStatus('Applying…', '');
      hostRaw('ae_flexBounceApply(' + exprAmp() + ',' + num(freqEl, 2) + ',' + num(dampEl, 4) + ')', function (res) {
        if (res.indexOf('ERR') === 0 || res.indexOf('"success":false') >= 0 || res.indexOf('"ok":false') >= 0) {
          var parsed = null;
          try { parsed = JSON.parse(res); } catch (parseErr) { parsed = null; }
          setStatus((parsed && parsed.message) || res.replace(/^ERR:\s*/, '') || 'Apply failed.', 'error');
        } else {
          var ok = null;
          try { ok = JSON.parse(res); } catch (okErr) { ok = null; }
          setStatus((ok && ok.message) || 'Orbit Bounce applied.', 'success');
        }
      });
    });
    removeBtn && removeBtn.addEventListener('click', function () {
      hostRaw('ae_flexBounceRemove()', function (res) {
        var parsed = null;
        try { parsed = JSON.parse(res); } catch (parseErr) { parsed = null; }
        if (res.indexOf('ERR') === 0 || (parsed && parsed.success === false)) {
          setStatus((parsed && parsed.message) || res.replace(/^ERR:\s*/, '') || 'Remove failed.', 'error');
        } else {
          setStatus((parsed && parsed.message) || 'Orbit Bounce removed.', 'success');
        }
      });
    });
    syncLabels();
  }

  function init() {
    var root = document.getElementById('cxFlow20'); if (!root) return;
    try { build(root); } catch (e) { root.innerHTML = '<div class="fx20-status error">Graph editor failed to load.</div>'; }
    try { initFlexBounce(); } catch (bounceErr) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback('GRAPH20_FLEXBOUNCE_001', bounceErr); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
