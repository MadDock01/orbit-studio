/* ============================================================
   ORBIT SOUND — waveform + segment trim, Library tab

   Picking a sound in the Library draws its real waveform here.
   Drag the two handles to pick a region, audition just that
   region, and INSERT writes it out as a WAV and drops it on the
   active comp at the playhead.

   Audio has only ever reached After Effects from this panel by
   native OS drag and drop, which lands a clip wherever the mouse
   is and always the whole file. This adds the other half.

   main.js keeps the library, the selection and its own preview
   player; the two talk through one event, "compx:sfx-selected",
   so this stays a separate file rather than surgery on a 500KB
   module. Decoding is done here independently so the strip never
   depends on main.js's internal buffer state.

   Host side: ae_placeAudio(filePath, atPlayhead, layerName)
   ============================================================ */
(function () {
  "use strict";

  var MAX_DECODE_BYTES = 120 * 1024 * 1024;
  var AUDIO_EXT = /\.(wav|mp3|aif|aiff|m4a|aac|ogg|flac)$/i;

  var fs = null, os = null, path = null;
  try {
    fs = require("fs");
    os = require("os");
    path = require("path");
  } catch (e) {
    /* No Node in this context — the strip simply never opens. */
  }

  var audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  var el = {};
  var current = null;   // { name, path }
  var buffer = null;    // decoded AudioBuffer
  var peaks = null;     // [{min,max}] one per canvas column
  var selA = 0, selB = 1;   // segment bounds as 0..1 of the buffer
  var source = null;
  var raf = 0;
  var playFrom = 0, playStartedAt = 0;
  var token = 0;        // guards against a slow decode landing after a new pick

  function fmt(sec) {
    if (!isFinite(sec)) return "0.00";
    return sec.toFixed(2);
  }

  function say(text, isError) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.classList.toggle("is-error", !!isError);
  }

  function show(on) {
    if (el.strip) el.strip.hidden = !on;
  }

  // ---- Waveform ----------------------------------------------------------
  // One column per device pixel, each drawn from the min and max sample in
  // its slice. Cheap, and it keeps transients visible where averaging would
  // flatten them into a smear.
  function buildPeaks(buf, columns) {
    var ch = buf.getChannelData(0);
    var ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    var step = ch.length / columns;
    var out = new Array(columns);
    var i, j, start, end, min, max, v;
    for (i = 0; i < columns; i++) {
      start = Math.floor(i * step);
      end = Math.min(ch.length, Math.floor((i + 1) * step));
      if (end <= start) end = start + 1;
      min = 1; max = -1;
      for (j = start; j < end; j++) {
        v = ch2 ? (ch[j] + ch2[j]) * 0.5 : ch[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      out[i] = { min: min, max: max };
    }
    return out;
  }

  function draw() {
    var canvas = el.canvas;
    if (!canvas || !peaks) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var mid = h / 2;
    var n = peaks.length;
    var aX = selA * w, bX = selB * w;

    var i, x, p, y0, y1;
    for (i = 0; i < n; i++) {
      x = (i / n) * w;
      p = peaks[i];
      y0 = mid - p.max * mid * 0.92;
      y1 = mid - p.min * mid * 0.92;
      if (y1 - y0 < 1) y1 = y0 + 1;
      // Inside the segment the wave is lit; outside it stays muted, so the
      // selection reads without a separate overlay swallowing the detail.
      g.fillStyle = (x >= aX && x <= bX) ? "#3cff5f" : "#2f4a38";
      g.fillRect(x, y0, Math.max(1, w / n), y1 - y0);
    }

    g.fillStyle = "rgba(0,0,0,0.42)";
    g.fillRect(0, 0, aX, h);
    g.fillRect(bX, 0, w - bX, h);

    g.strokeStyle = "#22322a";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, mid + 0.5);
    g.lineTo(w, mid + 0.5);
    g.stroke();
  }

  function placeHandles() {
    if (!el.wrap) return;
    var w = el.wrap.clientWidth || 1;
    if (el.handleA) el.handleA.style.left = (selA * w) + "px";
    if (el.handleB) el.handleB.style.left = (selB * w) + "px";
    if (!buffer) return;
    var a = selA * buffer.duration, b = selB * buffer.duration;
    if (el.range) el.range.textContent = fmt(a) + " – " + fmt(b) + " s  (" + fmt(b - a) + ")";
  }

  function redraw() {
    draw();
    placeHandles();
  }

  // ---- Selection ---------------------------------------------------------
  function dragHandle(handle, which) {
    if (!handle) return;
    handle.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      var rect = el.wrap.getBoundingClientRect();

      function move(e) {
        var t = (e.clientX - rect.left) / Math.max(1, rect.width);
        t = Math.max(0, Math.min(1, t));
        // Keep a sliver between the handles so the segment can never
        // collapse to zero and produce an empty file.
        if (which === "a") selA = Math.min(t, selB - 0.005);
        else selB = Math.max(t, selA + 0.005);
        selA = Math.max(0, selA);
        selB = Math.min(1, selB);
        redraw();
      }
      function up(e) {
        try { handle.releasePointerCapture(ev.pointerId); } catch (releaseErr) { /* pointer already gone */ }
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });

    handle.addEventListener("keydown", function (ev) {
      var stepSize = ev.shiftKey ? 0.05 : 0.01;
      var delta = ev.key === "ArrowLeft" ? -stepSize : ev.key === "ArrowRight" ? stepSize : 0;
      if (!delta) return;
      ev.preventDefault();
      if (which === "a") selA = Math.max(0, Math.min(selA + delta, selB - 0.005));
      else selB = Math.min(1, Math.max(selB + delta, selA + 0.005));
      redraw();
    });
  }

  // ---- Playback ----------------------------------------------------------
  function stop() {
    if (source) {
      try { source.onended = null; source.stop(0); } catch (stopErr) { /* already finished */ }
      source = null;
    }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (el.playhead) el.playhead.style.opacity = "0";
    if (el.play) el.play.classList.remove("is-on");
  }

  function tick() {
    if (!source || !buffer) return;
    var elapsed = ctx().currentTime - playStartedAt;
    var t = (playFrom + elapsed) / buffer.duration;
    if (el.playhead && el.wrap) {
      el.playhead.style.opacity = "1";
      el.playhead.style.left = Math.min(1, Math.max(0, t)) * el.wrap.clientWidth + "px";
    }
    raf = requestAnimationFrame(tick);
  }

  function playSegment() {
    if (!buffer) return;
    stop();
    var a = selA * buffer.duration;
    var len = (selB - selA) * buffer.duration;
    if (len <= 0.01) { say("That segment is too short.", true); return; }
    var c = ctx();
    if (c.state === "suspended") { try { c.resume(); } catch (resumeErr) { /* older CEP */ } }
    source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.onended = function () { stop(); };
    playFrom = a;
    playStartedAt = c.currentTime;
    source.start(0, a, len);
    if (el.play) el.play.classList.add("is-on");
    raf = requestAnimationFrame(tick);
    say("Playing " + fmt(len) + "s");
  }

  // ---- WAV writing -------------------------------------------------------
  // 16-bit PCM, which every AE build imports without a codec.
  function encodeWav(buf, fromSec, toSec) {
    var channels = Math.min(2, buf.numberOfChannels);
    var rate = buf.sampleRate;
    var start = Math.floor(fromSec * rate);
    var end = Math.min(buf.length, Math.floor(toSec * rate));
    var frames = Math.max(1, end - start);

    var dataBytes = frames * channels * 2;
    var out = new ArrayBuffer(44 + dataBytes);
    var view = new DataView(out);

    function str(offset, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }
    str(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);           // format: PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * 2, true); // byte rate
    view.setUint16(32, channels * 2, true);        // block align
    view.setUint16(34, 16, true);          // bits per sample
    str(36, "data");
    view.setUint32(40, dataBytes, true);

    var chans = [], c;
    for (c = 0; c < channels; c++) chans.push(buf.getChannelData(c));

    var offset = 44, i, s;
    for (i = 0; i < frames; i++) {
      for (c = 0; c < channels; c++) {
        s = chans[c][start + i];
        if (s > 1) s = 1; else if (s < -1) s = -1;
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return Buffer.from(out);
  }

  function safeName(name) {
    return String(name || "segment").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9 _-]+/g, "_").slice(0, 48);
  }

  function insertSegment() {
    if (!buffer || !current) { say("Pick a sound first.", true); return; }
    if (!fs || !os || !path) { say("File access is unavailable here.", true); return; }
    var host = window.CompXHostBridge;
    if (!host || typeof host.call !== "function") { say("After Effects is not connected yet.", true); return; }

    var a = selA * buffer.duration, b = selB * buffer.duration;
    var whole = selA <= 0.0005 && selB >= 0.9995;

    // Untouched bounds mean the original file can go straight in — no point
    // writing a byte-identical copy to a temp folder.
    if (whole) {
      say("Placing…");
      host.call('ae_placeAudio(' + JSON.stringify(current.path.replace(/\\/g, "/")) + ',true,' +
        JSON.stringify(safeName(current.name)) + ')', done);
      return;
    }

    try {
      var dir = path.join(os.tmpdir(), "OrbitSound");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      var file = path.join(dir, safeName(current.name) + "_" + Math.round(a * 1000) + "-" + Math.round(b * 1000) + ".wav");
      fs.writeFileSync(file, encodeWav(buffer, a, b));
      say("Placing…");
      host.call('ae_placeAudio(' + JSON.stringify(file.replace(/\\/g, "/")) + ',true,' +
        JSON.stringify(safeName(current.name) + " " + fmt(a) + "-" + fmt(b)) + ')', done);
    } catch (e) {
      say("Could not write the segment: " + (e.message || e), true);
    }
  }

  function done(parsed) {
    if (parsed && parsed.success) say(parsed.message || "Placed.");
    else say((parsed && (parsed.message || parsed.detail)) || "Could not place that.", true);
  }

  // ---- Selection from the Library ----------------------------------------
  function load(detail) {
    stop();
    token++;
    var mine = token;

    if (!detail || !detail.path || !AUDIO_EXT.test(detail.path)) {
      current = null; buffer = null; peaks = null;
      show(false);
      return;
    }
    if (!fs) { show(false); return; }

    current = { name: detail.name, path: detail.path };
    buffer = null; peaks = null;
    selA = 0; selB = 1;
    show(true);
    if (el.name) {
      el.name.textContent = detail.name || "—";
      el.name.title = detail.path;
    }
    if (el.range) el.range.textContent = "…";
    say("Reading…");

    var data;
    try {
      var stat = fs.statSync(detail.path);
      if (stat.size > MAX_DECODE_BYTES) {
        say("That file is too large to scrub here (" + Math.round(stat.size / 1048576) + " MB).", true);
        return;
      }
      data = fs.readFileSync(detail.path);
    } catch (e) {
      say("Could not read that file.", true);
      return;
    }

    var arr = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    ctx().decodeAudioData(
      arr,
      function (decoded) {
        if (mine !== token) return;   // a newer pick won the race
        buffer = decoded;
        peaks = buildPeaks(decoded, Math.max(80, Math.round(el.canvas.clientWidth || 300)));
        redraw();
        say(fmt(decoded.duration) + "s · " + decoded.sampleRate + " Hz · " +
            (decoded.numberOfChannels > 1 ? "stereo" : "mono"));
      },
      function () {
        if (mine !== token) return;
        say("Could not decode that audio.", true);
      }
    );
  }

  function init() {
    el.strip = document.getElementById("sndStrip");
    if (!el.strip) return;
    el.wrap = document.getElementById("sndWrap");
    el.canvas = document.getElementById("sndWave");
    el.handleA = document.getElementById("sndHandleA");
    el.handleB = document.getElementById("sndHandleB");
    el.playhead = document.getElementById("sndPlayhead");
    el.name = document.getElementById("sndName");
    el.range = document.getElementById("sndRange");
    el.status = document.getElementById("sndStatus");
    el.play = document.getElementById("sndPlaySeg");

    dragHandle(el.handleA, "a");
    dragHandle(el.handleB, "b");

    // Clicking the wave moves the nearer handle, so a rough selection takes
    // one click rather than a hunt for a 9px target.
    if (el.wrap) {
      el.wrap.addEventListener("pointerdown", function (ev) {
        if (ev.target !== el.canvas) return;
        var rect = el.wrap.getBoundingClientRect();
        var t = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
        if (Math.abs(t - selA) <= Math.abs(t - selB)) selA = Math.min(t, selB - 0.005);
        else selB = Math.max(t, selA + 0.005);
        redraw();
      });
    }

    if (el.play) el.play.addEventListener("click", function () {
      if (source) { stop(); say("Stopped"); } else playSegment();
    });
    var reset = document.getElementById("sndReset");
    if (reset) reset.addEventListener("click", function () {
      selA = 0; selB = 1; redraw(); say("Full clip");
    });
    var insert = document.getElementById("sndInsert");
    if (insert) insert.addEventListener("click", insertSegment);

    // ---- Fold ----
    // The strip sits between the card grid and the transport, so every pixel
    // it takes is a pixel of preview cards. Folded, only the one-line bar is
    // left; the choice is remembered between sessions.
    var fold = document.getElementById("sndFold");
    function paintFold(folded) {
      el.strip.classList.toggle("is-folded", folded);
      if (fold) {
        fold.setAttribute("aria-expanded", folded ? "false" : "true");
        fold.title = folded ? "Show the waveform" : "Fold the waveform away to show more cards";
      }
      // The canvas measures 0 while it is folded, so the peaks have to be
      // rebuilt at the real width once it comes back.
      if (!folded && buffer && el.canvas) {
        setTimeout(function () {
          peaks = buildPeaks(buffer, Math.max(80, Math.round(el.canvas.clientWidth || 300)));
          redraw();
        }, 0);
      }
    }
    var startFolded = false;
    try { startFolded = localStorage.getItem("compXSound.folded") === "1"; } catch (e) { startFolded = false; }
    paintFold(startFolded);
    if (fold) fold.addEventListener("click", function () {
      var next = !el.strip.classList.contains("is-folded");
      paintFold(next);
      try { localStorage.setItem("compXSound.folded", next ? "1" : "0"); } catch (e) { /* sandboxed storage */ }
    });

    window.addEventListener("compx:sfx-selected", function (ev) { load(ev.detail); });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!buffer || !el.canvas) return;
        peaks = buildPeaks(buffer, Math.max(80, Math.round(el.canvas.clientWidth || 300)));
        redraw();
      }, 120);
    });

    // Leaving the Library tab should not leave a preview playing.
    var rail = document.getElementById("appTabsRow");
    if (rail) rail.addEventListener("click", stop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
