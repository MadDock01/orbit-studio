/* CompX Studio — local still-image background removal.
 * U2Net inference runs locally through ONNX Runtime Web/WASM. The model is
 * downloaded only after explicit user consent and verified with SHA-256.
 */
(function () {
  "use strict";

  var nodeRequire = typeof require === "function" ? require : (typeof window.require === "function" ? window.require : null);
  var fs = nodeRequire ? nodeRequire("fs") : null;
  var path = nodeRequire ? nodeRequire("path") : null;
  var os = nodeRequire ? nodeRequire("os") : null;
  var crypto = nodeRequire ? nodeRequire("crypto") : null;
  var https = nodeRequire ? nodeRequire("https") : null;
  var urlMod = nodeRequire ? nodeRequire("url") : null;
  var BufferCtor = nodeRequire ? nodeRequire("buffer").Buffer : null;
  var nodeProcess = nodeRequire ? nodeRequire("process") : null;
  var cs = new CSInterface();
  var session = null;
  var pendingSelection = null;
  var busy = false;

  var card = document.getElementById("studioAiBgRemover");
  if (!card) return;

  var removeButton = document.getElementById("btnAiRemoveBackground");
  var restoreButton = document.getElementById("btnAiBgRestore");
  var consent = document.getElementById("aiBgRuntimeConsent");
  var allowButton = document.getElementById("btnAiBgRuntimeAllow");
  var cancelButton = document.getElementById("btnAiBgRuntimeCancel");
  var progress = document.getElementById("aiBgRuntimeProgress");
  var status = document.getElementById("aiBgStatus");
  var preview = document.getElementById("aiBgPreview");
  var previewImage = document.getElementById("aiBgPreviewImage");
  var cutoff = document.getElementById("aiBgCutoff");
  var feather = document.getElementById("aiBgFeather");
  var cutoffValue = document.getElementById("aiBgCutoffValue");
  var featherValue = document.getElementById("aiBgFeatherValue");
  var disableOriginal = document.getElementById("aiBgDisableOriginal");
  var pipeline = document.getElementById("aiBgPipeline");
  var fileInput = document.getElementById("aiBgFileInput");
  var refreshContextButton = document.getElementById("btnStudioRefreshContext");
  var cachedCutout = null; // raw mask + source image for live Cleanup/Feather re-preview

  function supportedImageExtension(filePath) {
    var extension = path ? path.extname(String(filePath || "")).toLowerCase() : "";
    return extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp";
  }

  function dropContainsFiles(dataTransfer) {
    if (!dataTransfer) return false;
    try {
      var types = Array.from(dataTransfer.types || []);
      if (types.indexOf("Files") >= 0 || types.indexOf("application/x-moz-file") >= 0) return true;
      return !!(dataTransfer.files && dataTransfer.files.length);
    } catch (ignore) { return false; }
  }

  function resolveDroppedPath(file) {
    if (!file) return "";
    return String(file.path || "");
  }

  function showPreviewFromPath(filePath) {
    if (!preview || !previewImage) return;
    var empty = preview.querySelector(".cx-ai-bg-preview-empty");
    if (empty) empty.hidden = true;
    previewImage.src = fileUri(filePath);
    previewImage.hidden = false;
  }

  function stageDroppedPath(filePath, label) {
    if (!fs || !path) {
      setStatus("CEP local runtime is unavailable.", "error");
      return false;
    }
    if (!filePath || !supportedImageExtension(filePath)) return false;
    try {
      if (!fs.statSync(filePath).isFile()) return false;
    } catch (ignore) { return false; }

    pendingSelection = {
      success: true,
      path: filePath,
      name: label || path.basename(filePath),
      layerName: label || path.basename(filePath),
      mode: "drop",
      compId: 0,
      layerId: 0
    };
    cachedCutout = null;

    var compLabel = document.getElementById("cxStudioCompLabel");
    var selectionLabel = document.getElementById("cxStudioSelectionLabel");
    if (compLabel) compLabel.textContent = "DROPPED FILE";
    if (selectionLabel) selectionLabel.textContent = pendingSelection.layerName;
    showPreviewFromPath(filePath);
    setPipelineStep("select");
    setStatus("Image ready. Click Remove Background to process.", "");
    return true;
  }

  function wireDropZone() {
    if (!preview) return;
    var dragDepth = 0;

    function clearDragState() {
      dragDepth = 0;
      preview.classList.remove("is-dragover");
    }

    preview.addEventListener("dragenter", function (event) {
      if (!dropContainsFiles(event.dataTransfer) || busy) return;
      event.preventDefault();
      dragDepth++;
      preview.classList.add("is-dragover");
    });

    preview.addEventListener("dragover", function (event) {
      if (!dropContainsFiles(event.dataTransfer) || busy) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });

    preview.addEventListener("dragleave", function (event) {
      if (!preview.classList.contains("is-dragover")) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) preview.classList.remove("is-dragover");
    });

    preview.addEventListener("drop", function (event) {
      if (!dropContainsFiles(event.dataTransfer) || busy) return;
      event.preventDefault();
      clearDragState();
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      var filePath = resolveDroppedPath(file);
      if (!filePath) {
        setStatus("Could not read the dropped file path. Drop from File Explorer.", "error");
        return;
      }
      if (!stageDroppedPath(filePath, file && file.name)) {
        setStatus("Drop a PNG, JPG, JPEG or WebP still image.", "error");
      }
    });

    preview.addEventListener("click", function () {
      if (busy || !fileInput) return;
      fileInput.click();
    });

    preview.addEventListener("keydown", function (event) {
      if (busy || !fileInput) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
  }

  function setPipelineStep(step) {
    if (!pipeline) return;
    var order = ["select", "process", "import"];
    var activeIndex = order.indexOf(step);
    if (activeIndex < 0) activeIndex = 0;
    pipeline.querySelectorAll("[data-bg-step]").forEach(function (node) {
      var index = order.indexOf(node.getAttribute("data-bg-step"));
      node.classList.toggle("is-active", index === activeIndex);
      node.classList.toggle("is-done", index >= 0 && index < activeIndex);
    });
  }

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-busy", "is-ok", "is-error");
    if (state) status.classList.add("is-" + state);
    if (state === "busy") {
      if (/download|model|loading local/i.test(message)) setPipelineStep("process");
      else if (/import|removing|reading|checking/i.test(message)) setPipelineStep("process");
      else setPipelineStep("process");
    } else if (state === "ok") {
      setPipelineStep("import");
    } else if (state === "error") {
      setPipelineStep("select");
    } else if (/select one still/i.test(message)) {
      setPipelineStep("select");
    }
  }

  function setBusy(value) {
    busy = !!value;
    if (removeButton) removeButton.disabled = busy;
    if (restoreButton) restoreButton.disabled = busy;
    if (allowButton) allowButton.disabled = busy;
    if (cancelButton) cancelButton.disabled = busy;
  }

  function updateProgress(label, percent) {
    if (progress) progress.value = Math.max(0, Math.min(100, Number(percent) || 0));
    setStatus(label + (percent ? " " + Math.round(percent) + "%" : ""), "busy");
  }

  function audit(code, error) {
    try {
      if (window.CompXDiagnostics && window.CompXDiagnostics.fallback) window.CompXDiagnostics.fallback(code, error);
      else console.error(code, error);
    } catch (ignore) {}
  }

  function parseHostResult(raw) {
    try { return JSON.parse(raw || "{}"); }
    catch (error) { return { success: false, message: String(raw || "After Effects returned an unreadable response.") }; }
  }

  function hostString(value) {
    return '"' + String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
  }

  function hostCall(expression) {
    return new Promise(function (resolve) {
      cs.evalScript(expression, function (raw) { resolve(parseHostResult(raw)); });
    });
  }

  function extensionRoot() {
    return cs.getSystemPath(SystemPath.EXTENSION);
  }

  function loadSpec() {
    var specPath = path.join(extensionRoot(), "scripts", "background-removal-runtime.json");
    var spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    if (!spec || spec.schema !== 1 || !spec.model || !/^[a-f0-9]{64}$/.test(spec.model.sha256 || "")) throw new Error("Background-removal manifest is invalid.");
    return spec;
  }

  function runtimeRoot() {
    var local = nodeProcess.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "CompXOrbit", "BackgroundRemoval");
  }

  function modelPath(spec) {
    return path.join(runtimeRoot(), "models", spec.model.file);
  }

  function readInstallRecord() {
    try { return JSON.parse(fs.readFileSync(path.join(runtimeRoot(), "manifest.json"), "utf8")); }
    catch (error) { return {}; }
  }

  function installedModel(spec) {
    var destination = modelPath(spec);
    var record = readInstallRecord();
    if (record.modelSha256 !== spec.model.sha256 || record.modelBytes !== spec.model.bytes) return null;
    try {
      var stat = fs.statSync(destination);
      return stat.isFile() && stat.size === spec.model.bytes ? destination : null;
    } catch (error) { return null; }
  }

  function writeInstallRecord(spec) {
    var root = runtimeRoot();
    fs.mkdirSync(root, { recursive: true });
    var destination = path.join(root, "manifest.json");
    var partial = destination + ".tmp";
    var record = { schema: 1, runtimeVersion: spec.runtimeVersion, model: spec.model.id, modelSha256: spec.model.sha256, modelBytes: spec.model.bytes, installedAt: new Date().toISOString() };
    fs.writeFileSync(partial, JSON.stringify(record, null, 2), "utf8");
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    fs.renameSync(partial, destination);
  }

  function downloadModel(spec) {
    return new Promise(function (resolve, reject) {
      var destination = modelPath(spec);
      var partial = destination + ".part";
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (error) { audit("BG_MODEL_PARTIAL_CLEANUP_001", error); }

      function request(currentUrl, redirects) {
        var req = https.get(currentUrl, function (response) {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirects >= 8) { reject(new Error("Too many model download redirects.")); return; }
            request(urlMod.resolve(currentUrl, response.headers.location), redirects + 1);
            return;
          }
          if (response.statusCode !== 200) { response.resume(); reject(new Error("Model download returned HTTP " + response.statusCode + ".")); return; }
          var total = Number(response.headers["content-length"]) || Number(spec.model.bytes) || 0;
          var received = 0;
          var hash = crypto.createHash("sha256");
          var output = fs.createWriteStream(partial);
          var settled = false;

          function fail(error) {
            if (settled) return;
            settled = true;
            try { output.destroy(); } catch (destroyError) { audit("BG_MODEL_STREAM_001", destroyError); }
            try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (unlinkError) { audit("BG_MODEL_PARTIAL_CLEANUP_002", unlinkError); }
            reject(error);
          }

          response.on("data", function (chunk) {
            received += chunk.length;
            hash.update(chunk);
            updateProgress("Downloading offline U²-Net model...", total ? received * 100 / total : 0);
          });
          response.on("error", fail);
          output.on("error", fail);
          output.on("finish", function () {
            output.close(function () {
              if (settled) return;
              var actual = hash.digest("hex");
              if (actual !== spec.model.sha256 || received !== spec.model.bytes) { fail(new Error("Downloaded model failed security verification.")); return; }
              try {
                if (fs.existsSync(destination)) fs.unlinkSync(destination);
                fs.renameSync(partial, destination);
                writeInstallRecord(spec);
                settled = true;
                resolve(destination);
              } catch (renameError) { fail(renameError); }
            });
          });
          response.pipe(output);
        });
        req.setTimeout(30000, function () { req.destroy(new Error("Model download timed out.")); });
        req.on("error", function (error) {
          try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch (unlinkError) { audit("BG_MODEL_PARTIAL_CLEANUP_003", unlinkError); }
          reject(error);
        });
      }
      request(spec.model.url, 0);
    });
  }

  // CEP panels load over file://, where Chromium refuses to dynamically import
  // file:// ES modules ("Failed to fetch dynamically imported module") — which
  // is exactly what ONNX Runtime does with ort-wasm-simd-threaded.mjs. Blob and
  // data URL module imports are blocked here too. The reliable route is a tiny
  // loopback HTTP server (via the CEP Node bridge) that serves the two vendor
  // files with CORS headers, so ort's dynamic import goes over http. In a plain
  // browser (e.g. the http preview) fall back to the classic relative paths,
  // which work there.
  function prepareWasmPaths() {
    return new Promise(function (resolve) {
      try {
        var httpMod = nodeRequire ? nodeRequire("http") : null;
        if (httpMod && fs && path) {
          var vendorDir = path.join(extensionRoot(), "vendor", "onnxruntime");
          var mjsPath = path.join(vendorDir, "ort-wasm-simd-threaded.mjs");
          var wasmPath = path.join(vendorDir, "ort-wasm-simd-threaded.wasm");
          if (fs.existsSync(mjsPath) && fs.existsSync(wasmPath)) {
            var server = httpMod.createServer(function (req, res) {
              try {
                var name = decodeURIComponent((req.url || "/").replace(/^\//, ""));
                var allowed = {
                  "ort-wasm-simd-threaded.mjs": "text/javascript",
                  "ort-wasm-simd-threaded.wasm": "application/wasm"
                };
                if (!allowed[name]) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, {
                  "Content-Type": allowed[name],
                  "Access-Control-Allow-Origin": "*",
                  "Cache-Control": "no-store"
                });
                res.end(fs.readFileSync(path.join(vendorDir, name)));
              } catch (ignore) { try { res.writeHead(500); res.end(); } catch (ignore2) { /* swallow */ } }
            });
            server.on("error", function () { resolve("./vendor/onnxruntime/"); });
            server.listen(0, "127.0.0.1", function () {
              resolve("http://127.0.0.1:" + server.address().port + "/");
            });
            return;
          }
        }
      } catch (ignore) { /* fall through to relative paths */ }
      resolve("./vendor/onnxruntime/");
    });
  }

  function loadOrtRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "vendor/onnxruntime/ort.wasm.min.js";
      script.onload = function () {
        if (!window.ort) { reject(new Error("ONNX Runtime did not initialize.")); return; }
        window.ort.env.wasm.numThreads = 1;
        window.ort.env.wasm.proxy = false;
        prepareWasmPaths().then(function (paths) {
          window.ort.env.wasm.wasmPaths = paths;
          resolve(window.ort);
        }, function () {
          window.ort.env.wasm.wasmPaths = "./vendor/onnxruntime/";
          resolve(window.ort);
        });
      };
      script.onerror = function () { reject(new Error("Could not load the local ONNX Runtime.")); };
      document.body.appendChild(script);
    });
  }

  function loadImage(sourcePath) {
    return new Promise(function (resolve, reject) {
      var extension = path.extname(sourcePath).toLowerCase();
      var mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("The selected image could not be decoded.")); };
      image.src = "data:" + mime + ";base64," + fs.readFileSync(sourcePath).toString("base64");
    });
  }

  function imageTensor(image, ortApi) {
    var size = 320;
    var canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    var pixels = context.getImageData(0, 0, size, size).data;
    var plane = size * size;
    var data = new Float32Array(plane * 3);
    for (var index = 0; index < plane; index++) {
      var pixel = index * 4;
      data[index] = (pixels[pixel] / 255 - 0.485) / 0.229;
      data[plane + index] = (pixels[pixel + 1] / 255 - 0.456) / 0.224;
      data[plane * 2 + index] = (pixels[pixel + 2] / 255 - 0.406) / 0.225;
    }
    return new ortApi.Tensor("float32", data, [1, 3, size, size]);
  }

  function maskCanvas(output, width, height, cleanup, featherPixels) {
    var values = output.data;
    var count = values.length;
    var side = Math.round(Math.sqrt(count));
    if (side * side !== count) {
      var dims = output.dims || [];
      side = Number(dims[dims.length - 1]) || 320;
      count = side * side;
    }
    var minimum = Infinity, maximum = -Infinity;
    for (var i = 0; i < count; i++) { if (values[i] < minimum) minimum = values[i]; if (values[i] > maximum) maximum = values[i]; }
    var range = maximum - minimum || 1;
    var small = document.createElement("canvas");
    small.width = side; small.height = side;
    var smallContext = small.getContext("2d", { willReadFrequently: true });
    var imageData = smallContext.createImageData(side, side);
    for (var m = 0; m < count; m++) {
      var alpha = Math.max(0, Math.min(1, ((values[m] - minimum) / range - cleanup) / Math.max(0.001, 1 - cleanup)));
      var offset = m * 4;
      imageData.data[offset] = 255; imageData.data[offset + 1] = 255; imageData.data[offset + 2] = 255; imageData.data[offset + 3] = Math.round(alpha * 255);
    }
    smallContext.putImageData(imageData, 0, 0);
    var full = document.createElement("canvas");
    full.width = width; full.height = height;
    var fullContext = full.getContext("2d", { willReadFrequently: true });
    fullContext.imageSmoothingEnabled = true;
    fullContext.imageSmoothingQuality = "high";
    if (featherPixels > 0) fullContext.filter = "blur(" + featherPixels + "px)";
    fullContext.drawImage(small, 0, 0, width, height);
    fullContext.filter = "none";
    return full;
  }

  function composeCutout(image, mask) {
    var canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    var context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "source-over";
    return canvas;
  }

  function saveCanvas(canvas, sourcePath) {
    var root = path.join(runtimeRoot(), "outputs");
    fs.mkdirSync(root, { recursive: true });
    var base = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
    var destination = path.join(root, base + "_no-bg_" + Date.now() + ".png");
    var dataUrl = canvas.toDataURL("image/png");
    fs.writeFileSync(destination, BufferCtor.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    return { path: destination, dataUrl: dataUrl };
  }

  function ensureSession(spec) {
    if (session) return Promise.resolve(session);
    setStatus("Loading local AI model...", "busy");
    return loadOrtRuntime().then(function (ortApi) {
      var bytes = new Uint8Array(fs.readFileSync(modelPath(spec)));
      return ortApi.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    }).then(function (created) { session = created; return session; });
  }

  function showPreview(dataUrl) {
    if (!preview || !previewImage) return;
    var empty = preview.querySelector(".cx-ai-bg-preview-empty");
    if (empty) empty.hidden = true;
    previewImage.src = dataUrl;
    previewImage.hidden = false;
  }

  function fileUri(filePath) {
    var normalized = String(filePath || "").replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized)) normalized = "/" + normalized;
    return encodeURI("file://" + normalized);
  }

  function refreshSelectionContext() {
    if (pendingSelection && pendingSelection.mode === "drop") return;
    var compLabel = document.getElementById("cxStudioCompLabel");
    var selectionLabel = document.getElementById("cxStudioSelectionLabel");
    hostCall("ae_bgRemoveSelectionInfo()").then(function (selection) {
      if (!selection.success) {
        var noComp = String(selection.message || "").toLowerCase().indexOf("open a composition") >= 0;
        if (compLabel) compLabel.textContent = noComp ? "NO ACTIVE COMP" : "ACTIVE COMP";
        if (selectionLabel) selectionLabel.textContent = noComp ? "OPEN A COMPOSITION" : "SELECT ONE STILL IMAGE";
        pendingSelection = null;
        return;
      }
      pendingSelection = selection;
      if (cachedCutout && cachedCutout.path !== selection.path) cachedCutout = null;
      if (compLabel) compLabel.textContent = selection.compName || ("COMP " + selection.compId);
      if (selectionLabel) selectionLabel.textContent = selection.layerName || selection.name || "1 IMAGE SELECTED";
      setPipelineStep("select");
      var empty = preview && preview.querySelector(".cx-ai-bg-preview-empty");
      if (previewImage && selection.path) {
        previewImage.src = fileUri(selection.path);
        previewImage.hidden = false;
        if (empty) empty.style.display = "none";
      }
    }).catch(function (error) { audit("BG_CONTEXT_001", error); });
  }

  function processSelection(selection, spec) {
    setBusy(true);
    setStatus("Reading selected still image...", "busy");
    var image;
    return Promise.all([loadImage(selection.path), ensureSession(spec)]).then(function (values) {
      image = values[0];
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100000000) throw new Error("Image dimensions are unsupported or too large.");
      setStatus("Removing background locally...", "busy");
      var tensor = imageTensor(image, window.ort);
      var feeds = {};
      feeds[values[1].inputNames[0]] = tensor;
      return values[1].run(feeds);
    }).then(function (results) {
      var output = results[session.outputNames[0]];
      if (!output) throw new Error("The AI model returned no mask.");
      var cleanup = Math.max(0, Math.min(0.35, Number(cutoff && cutoff.value || 5) / 100));
      var featherPixels = Math.max(0, Math.min(12, Number(feather && feather.value || 1)));
      var mask = maskCanvas(output, image.naturalWidth, image.naturalHeight, cleanup, featherPixels);
      cachedCutout = { image: image, output: output, width: image.naturalWidth, height: image.naturalHeight, path: selection.path };
      var saved = saveCanvas(composeCutout(image, mask), selection.path);
      showPreview(saved.dataUrl);
      setStatus("Importing transparent PNG into After Effects...", "busy");
      var token = String(Date.now()) + "_" + Math.floor(Math.random() * 1000000);
      var disable = (disableOriginal && disableOriginal.checked) ? "true" : "false";
      if (selection.mode === "drop") {
        return hostCall("ae_bgRemoveImportDropped(" + hostString(saved.path) + "," + hostString(selection.path) + "," + hostString(token) + "," + disable + ")");
      }
      return hostCall("ae_bgRemoveImport(" + hostString(saved.path) + "," + hostString(token) + "," + disable + "," + Number(selection.compId || 0) + "," + Number(selection.layerId || 0) + ")");
    }).then(function (result) {
      if (!result.success) throw new Error(result.message || "After Effects could not import the cutout.");
      setStatus(result.message || "Background removed. Original layer preserved.", "ok");
    }).catch(function (error) {
      audit("BG_PROCESS_001", error);
      setStatus("Background removal failed: " + error.message, "error");
    }).then(function () { setBusy(false); });
  }

  function resolveSelection() {
    if (pendingSelection && pendingSelection.success && pendingSelection.path) {
      return Promise.resolve(pendingSelection);
    }
    return hostCall("ae_bgRemoveSelectionInfo()").then(function (selection) {
      if (selection.success) pendingSelection = selection;
      return selection;
    });
  }

  function beginRemoval() {
    if (busy) return;
    if (!fs || !path || !os || !crypto || !https || !urlMod || !nodeProcess || !BufferCtor) { setStatus("CEP local runtime is unavailable.", "error"); return; }
    setBusy(true);
    setStatus(pendingSelection && pendingSelection.mode === "drop" ? "Preparing dropped image..." : "Checking selected layer...", "busy");
    var spec;
    try { spec = loadSpec(); }
    catch (error) { setBusy(false); setStatus(error.message, "error"); return; }
    resolveSelection().then(function (selection) {
      if (!selection.success) throw new Error(selection.message || "Drop an image, click to browse, or select one still-image layer first.");
      pendingSelection = selection;
      var installed = installedModel(spec);
      if (!installed) {
        setBusy(false);
        if (consent) consent.hidden = false;
        if (progress) progress.value = 0;
        setStatus("Background removal needs a one-time model download — open Settings (gear icon) to continue.", "busy");
        if (window.openCompXSettings) window.openCompXSettings("stgCardBgRemover");
        return;
      }
      return processSelection(selection, spec);
    }).catch(function (error) {
      setBusy(false);
      setStatus(error.message, "error");
    });
  }

  // Live Cleanup/Feather re-preview: re-applies mask post-processing to the
  // cached raw output without re-running inference, so dragging a slider
  // updates the preview instantly.
  function applyLiveRefinement() {
    if (!cachedCutout || !cutoff || !feather) return;
    try {
      var cleanup = Math.max(0, Math.min(0.35, Number(cutoff.value || 5) / 100));
      var featherPixels = Math.max(0, Math.min(12, Number(feather.value || 1)));
      var mask = maskCanvas(cachedCutout.output, cachedCutout.width, cachedCutout.height, cleanup, featherPixels);
      showPreview(composeCutout(cachedCutout.image, mask).toDataURL("image/png"));
    } catch (error) { audit("BG_LIVE_001", error); }
  }

  if (cutoff) cutoff.addEventListener("input", function () { if (cutoffValue) cutoffValue.textContent = cutoff.value + "%"; applyLiveRefinement(); });
  if (feather) feather.addEventListener("input", function () { if (featherValue) featherValue.textContent = feather.value + "px"; applyLiveRefinement(); });
  if (removeButton) removeButton.addEventListener("click", beginRemoval);
  window.addEventListener("compx:bg-context-request", refreshSelectionContext);
  if (allowButton) allowButton.addEventListener("click", function () {
    if (busy || !pendingSelection) return;
    var spec;
    try { spec = loadSpec(); }
    catch (error) { setStatus(error.message, "error"); return; }
    setBusy(true);
    downloadModel(spec).then(function () {
      if (consent) consent.hidden = true;
      if (progress) progress.value = 0;
      var selection = pendingSelection;
      pendingSelection = null;
      setBusy(false);
      return processSelection(selection, spec);
    }).catch(function (error) {
      setBusy(false);
      audit("BG_MODEL_DOWNLOAD_001", error);
      setStatus("Model installation failed: " + error.message, "error");
    });
  });
  if (cancelButton) cancelButton.addEventListener("click", function () {
    pendingSelection = null;
    if (consent) consent.hidden = true;
    if (progress) progress.value = 0;
    setStatus("Model download cancelled. No files were installed.", "");
  });
  if (restoreButton) restoreButton.addEventListener("click", function () {
    if (busy) return;
    setBusy(true);
    setStatus("Restoring original layer...", "busy");
    hostCall("ae_bgRemoveRestore()").then(function (result) {
      setStatus(result.message || (result.success ? "Original restored." : "Select a generated cutout layer first."), result.success ? "ok" : "error");
      setBusy(false);
    });
  });
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      if (busy) return;
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      var filePath = resolveDroppedPath(file);
      if (!filePath) {
        setStatus("Could not read the selected file path. Choose a file from disk.", "error");
        return;
      }
      if (!stageDroppedPath(filePath, file.name)) {
        setStatus("Choose a PNG, JPG, JPEG or WebP still image.", "error");
      }
    });
  }
  if (refreshContextButton) refreshContextButton.addEventListener("click", function () {
    if (!busy) refreshSelectionContext();
  });
  wireDropZone();
  refreshSelectionContext();
  setStatus("Drop an image, click to browse, or select one still-image layer in the active composition.", "");
})();
