(function () {
  "use strict";
  function toast(message, isError) {
    if (typeof window.showToast === "function") window.showToast(message, !!isError);
  }
  function bridge() { return window.CompXHostBridge || null; }
  function hostCall(code, cb) {
    var b = bridge();
    if (!b) { if (cb) cb({ success: false, message: "Host bridge unavailable." }); return; }
    b.call(code, function (result) { if (cb) cb(result); });
  }
  function hostRaw(code, cb) {
    var b = bridge();
    if (!b) { if (cb) cb("ERR: Host bridge unavailable."); return; }
    b.callRaw(code, function (result) { if (cb) cb(String(result || "")); });
  }

  function finishPasta(button, result) {
    button.disabled = false;
    button.textContent = "Pasta";
    result = result || { success: false, message: "Pasta failed." };
    toast(result.message || "Pasta failed.", !result.success);
  }
  function nodeRequire() {
    if (typeof require === "function") return require;
    if (typeof window.require === "function") return window.require;
    return null;
  }
  function psQuote(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
  function extractWindowsClipboard(targetPath, req) {
    var cp=req("child_process"), fs=req("fs"), path=req("path");
    var svgPath=String(targetPath).replace(/\.[^\.]+$/, ".svg");
    var scriptPath=path.join(path.dirname(targetPath), "compx_pasta_clipboard.ps1");
    var ps=[
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$txt = ''",
      "if ([System.Windows.Forms.Clipboard]::ContainsText()) { $txt = [System.Windows.Forms.Clipboard]::GetText() }",
      "if ($txt -and $txt.ToLower().Contains('<svg')) { [System.IO.File]::WriteAllText("+psQuote(svgPath)+", $txt, (New-Object System.Text.UTF8Encoding($false))); Write-Output 'RESULT:svg'; exit 0 }",
      "$obj = [System.Windows.Forms.Clipboard]::GetDataObject()",
      "if ($obj -ne $null -and $obj.GetDataPresent('PNG')) { $stream=$obj.GetData('PNG'); if ($stream -is [System.IO.Stream]) { if ($stream.CanSeek) { $stream.Position=0 }; $out=[System.IO.File]::Create("+psQuote(targetPath)+"); try { $stream.CopyTo($out) } finally { $out.Dispose() }; Write-Output 'RESULT:image'; exit 0 } }",
      "$img = [System.Windows.Forms.Clipboard]::GetImage()",
      "if ($img -ne $null) { try { $img.Save("+psQuote(targetPath)+", [System.Drawing.Imaging.ImageFormat]::Png) } finally { $img.Dispose() }; Write-Output 'RESULT:image'; exit 0 }",
      "Write-Output 'RESULT:noimg'; exit 2"
    ].join(";\r\n");
    fs.writeFileSync(scriptPath,ps,"utf8");
    var out="";
    try { out=String(cp.execFileSync("powershell.exe",["-NoProfile","-STA","-ExecutionPolicy","Bypass","-File",scriptPath],{encoding:"utf8",timeout:15000,windowsHide:true})||""); }
    catch (e) {
      if (fs.existsSync(svgPath) && fs.statSync(svgPath).size>0) return {path:svgPath,isSvg:true};
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size>0) return {path:targetPath,isSvg:false};
      throw new Error("Windows clipboard has no image/SVG, or PowerShell was blocked.");
    } finally { try { fs.unlinkSync(scriptPath); } catch (ignore) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback("ADVANCED_FEATURES_EXTRACTWINDOWSCLIPBOARD_001", ignore); } }
    if (out.indexOf("RESULT:svg")!==-1 && fs.existsSync(svgPath) && fs.statSync(svgPath).size>0) return {path:svgPath,isSvg:true};
    if (out.indexOf("RESULT:image")!==-1 && fs.existsSync(targetPath) && fs.statSync(targetPath).size>0) return {path:targetPath,isSvg:false};
    throw new Error("Clipboard does not contain a supported image or SVG.");
  }
  function extractMacClipboard(targetPath, req) {
    var cp=req("child_process"), fs=req("fs");
    var svgPath=String(targetPath).replace(/\.[^\.]+$/, ".svg");
    try {
      var txt=String(cp.execFileSync("/usr/bin/pbpaste",[],{encoding:"utf8",timeout:3000})||"").trim();
      if (txt.toLowerCase().indexOf("<svg")!==-1 && txt.toLowerCase().indexOf("</svg>")!==-1) { fs.writeFileSync(svgPath,txt,"utf8"); return {path:svgPath,isSvg:true}; }
    } catch (ignore) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback("ADVANCED_FEATURES_EXTRACTMACCLIPBOARD_001", ignore); }
    var safe=String(targetPath).replace(/\\/g,"\\\\").replace(/"/g,'\\"');
    var apple='set outFile to POSIX file "'+safe+'"\ntry\nset f to open for access outFile with write permission\nset eof f to 0\nwrite (the clipboard as «class PNGf») to f\nclose access f\non error\ntry\nclose access outFile\nend try\nerror "NO_IMAGE"\nend try';
    try { cp.execFileSync("/usr/bin/osascript",["-e",apple],{encoding:"utf8",timeout:10000}); } catch (e) { if (window.CompXDiagnostics) window.CompXDiagnostics.fallback("ADVANCED_FEATURES_EXTRACTMACCLIPBOARD_002", e); }
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size>0) return {path:targetPath,isSvg:false};
    throw new Error("macOS clipboard does not contain a supported image or SVG.");
  }
  function importPasta(extracted, toShapes, button) {
    var importAsShape=!!toShapes && !!extracted.isSvg;
    var code='ae_importPastaFile('+JSON.stringify(String(extracted.path).replace(/\\/g,"/"))+','+importAsShape+')';
    hostCall(code,function(result){ finishPasta(button,result); });
  }
  function wirePasta() {
    var button=document.getElementById("btnPasteFeature");
    if(!button)return;
    button.addEventListener("click",function(){
      var shapes=document.getElementById("pastaToShapes"), toShapes=!!(shapes&&shapes.checked), req=nodeRequire();
      button.disabled=true; button.textContent="Pasting…";
      if(!req){ hostCall("ae_pasteFeature("+toShapes+")",function(result){finishPasta(button,result);}); return; }
      hostRaw("ae_getPastaTargetPath()",function(pathRaw){
        var target=String(pathRaw||"");
        if(!target||target==="undefined"||target==="EvalScript error."||target.indexOf("ERR:")===0){finishPasta(button,{success:false,message:target||"Could not create Pasta target path."});return;}
        try {
          var platform=""; try { platform=String(req("os").platform()); } catch(e) { platform=navigator.platform||""; }
          var extracted=/darwin|mac/i.test(platform)?extractMacClipboard(target,req):extractWindowsClipboard(target,req);
          importPasta(extracted,toShapes,button);
        } catch(e){ finishPasta(button,{success:false,message:String(e.message||e)}); }
      });
    });
  }
  function purgeMemoryPressure(){
    try {
      var nr=nodeRequire();
      var osMod=nr?nr("os"):null;
      if(!osMod||typeof osMod.freemem!=="function"||typeof osMod.totalmem!=="function")return null;
      var total=osMod.totalmem();
      if(!total)return null;
      return 1-(osMod.freemem()/total);
    }catch(e){ return null; }
  }
  function refreshPurgeState(button, includeHost){
    if(!button)return;
    var used=purgeMemoryPressure();
    var workload=0;
    var applyState=function(){
      var critical=used!==null&&used>=0.92;
      var stale=false;
      try{ stale=(Date.now()-parseInt(localStorage.getItem("ccLastPurgeAt")||"0",10)||0)>4*3600*1000; }catch(e){ stale=false; }
      var needs=used!==null&&(used>=0.78||(workload>=1&&used>=0.6)||(stale&&used>=0.6));
      button.classList.toggle("needs-purge",!!(needs||critical));
      button.classList.toggle("critical",!!critical);
      if(used!==null){
        var pct=Math.round(used*100);
        button.title=(critical?"⚠ RAM at "+pct+"% — purge now":(needs?"RAM at "+pct+"% — caches should be purged":"RAM at "+pct+"% — caches healthy"))+" · click to purge all";
      }
    };
    if(!includeHost){ applyState(); return; }
    hostCall('ae_memoryStatus()',function(res){
      try{
        if(res&&res.success&&res.data){
          var d=typeof res.data==="string"?JSON.parse(res.data):res.data;
          if(d&&d.comp){ workload=(d.comp.layers>80||d.comp.effects>150)?1:0; }
        }
      }catch(e){ workload=0; }
      applyState();
    });
  }
  function wireMemoryPurge(){
    var button=document.querySelector('#appTabsRow [data-tool="purge"]');
    if(!button)return;
    button.addEventListener("click",function(){
      if(button.disabled)return;
      button.disabled=true;
      button.classList.add("purging");
      hostCall('ae_purge("all")',function(result){
        button.classList.remove("purging");
        button.disabled=false;
        if(result&&result.success){ try{ localStorage.setItem("ccLastPurgeAt",String(Date.now())); }catch(e){ /* best effort */ } }
        toast(result.message||"Purge failed.",!result.success);
        refreshPurgeState(button,true);
      });
    });
    // Pulse only when the memory monitor says a purge is actually needed.
    refreshPurgeState(button,true);
    setInterval(function(){ refreshPurgeState(button,false); },30000);
  }

  function wireCamera() {
    var root = document.getElementById("cxCamera3D"); if (!root) return;
    var status = document.getElementById("cxCameraStatus");
    var stateBadge = document.getElementById("cxCameraStateBadge");
    var currentStep = 1;

    function setCameraStep(step, finished) {
      currentStep = Math.max(1, Math.min(5, Number(step) || 1));
      root.querySelectorAll("[data-camera-step]").forEach(function(item) {
        var value = Number(item.getAttribute("data-camera-step"));
        item.classList.toggle("is-current", value === currentStep);
        item.classList.toggle("is-complete", value < currentStep || (!!finished && value <= currentStep));
      });
    }

    function refreshCameraState() {
      hostCall("ae_camera3DState()", function(result) {
        if (!stateBadge) return;
        stateBadge.textContent = result && result.success ? "READY" : "NOT SET";
        stateBadge.classList.toggle("is-ready", !!(result && result.success));
        if (result && result.success && currentStep === 1) setCameraStep(2, false);
        if ((!result || !result.success) && currentStep !== 1) setCameraStep(1, false);
      });
    }

    function call(code, after) {
      if (status) status.textContent = "Working...";
      hostCall(code, function(result) {
        result = result || { success: false, message: "After Effects did not return a result." };
        if (status) status.textContent = result.message || "Action completed.";
        toast(result.message || "Action completed.", !result.success);
        refreshCameraState();
        if (after) after(result);
      });
    }

    function getExtPath() {
      try {
        var cs = window.csInterface || new CSInterface();
        return cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {
        return "";
      }
    }

    function numberValue(id, fallback, min, max) {
      var input = document.getElementById(id);
      var value = input ? Number(input.value) : Number(fallback);
      if (!isFinite(value)) value = Number(fallback);
      if (typeof min === "number") value = Math.max(min, value);
      if (typeof max === "number") value = Math.min(max, value);
      return value;
    }

    function markFeature(button) {
      root.querySelectorAll(".cx3d-feature-tile").forEach(function(tile) { tile.classList.remove("active"); });
      if (button) button.classList.add("active");
    }

    function applyLens(value) {
      value = Math.max(1, Math.min(500, Number(value) || 24));
      var topInput = document.getElementById("cxCameraLens");
      if (topInput) topInput.value = value;
      root.querySelectorAll("[data-camera-lens]").forEach(function(chip) {
        chip.classList.toggle("active", Number(chip.getAttribute("data-camera-lens")) === value);
      });
      call("ae_camera3DLens(" + value + ")");
    }

    var confirmBackdrop = document.getElementById("cx3dConfirmBackdrop");
    var confirmDialog = document.getElementById("cx3dConfirmDialog");
    var confirmTitle = document.getElementById("cx3dConfirmTitle");
    var confirmMessage = document.getElementById("cx3dConfirmMessage");
    var confirmDetail = document.getElementById("cx3dConfirmDetail");
    var confirmIcon = document.getElementById("cx3dConfirmIcon");
    var confirmAccept = document.getElementById("cx3dConfirmAccept");
    var confirmCancel = document.getElementById("cx3dConfirmCancel");
    var confirmClose = document.getElementById("cx3dConfirmClose");
    var pendingConfirmAction = null;
    var confirmLastFocus = null;
    var confirmCloseTimer = null;

    function closeCameraConfirm(accepted) {
      if (!confirmBackdrop || confirmBackdrop.hidden) return;
      var action = accepted ? pendingConfirmAction : null;
      pendingConfirmAction = null;
      confirmBackdrop.classList.remove("is-open");
      if (confirmCloseTimer) clearTimeout(confirmCloseTimer);
      confirmCloseTimer = setTimeout(function() {
        confirmBackdrop.hidden = true;
        if (confirmLastFocus && confirmLastFocus.focus) confirmLastFocus.focus();
        confirmLastFocus = null;
      }, 170);
      if (action) setTimeout(action, 20);
    }

    function showCameraConfirm(options, onConfirm) {
      if (!confirmBackdrop || !confirmDialog || !confirmAccept || !confirmCancel) {
        toast("Orbit confirmation interface is unavailable. Reload the extension.", true);
        return;
      }
      options = options || {};
      if (confirmCloseTimer) clearTimeout(confirmCloseTimer);
      confirmLastFocus = document.activeElement;
      pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
      confirmDialog.classList.toggle("is-danger", options.tone === "danger");
      confirmTitle.textContent = options.title || "Confirm action";
      confirmMessage.textContent = options.message || "Are you sure you want to continue?";
      confirmDetail.textContent = options.detail || "This operation changes the active composition.";
      confirmIcon.textContent = options.icon || "!";
      confirmAccept.textContent = options.confirmLabel || "CONFIRM";
      confirmBackdrop.hidden = false;
      requestAnimationFrame(function() {
        confirmBackdrop.classList.add("is-open");
        confirmCancel.focus();
      });
    }

    if (confirmCancel) confirmCancel.addEventListener("click", function() { closeCameraConfirm(false); });
    if (confirmClose) confirmClose.addEventListener("click", function() { closeCameraConfirm(false); });
    if (confirmAccept) confirmAccept.addEventListener("click", function() { closeCameraConfirm(true); });
    if (confirmBackdrop) confirmBackdrop.addEventListener("click", function(event) {
      if (event.target === confirmBackdrop) closeCameraConfirm(false);
    });
    document.addEventListener("keydown", function(event) {
      if (!confirmBackdrop || confirmBackdrop.hidden) return;
      if (event.key === "Escape" || event.keyCode === 27) { event.preventDefault(); closeCameraConfirm(false); }
      else if ((event.key === "Enter" || event.keyCode === 13) && event.target !== confirmCancel) { event.preventDefault(); closeCameraConfirm(true); }
    });

    var btnLight = document.getElementById("btn3DRigLight");
    if (btnLight) btnLight.addEventListener("click", function() {
      call('ae_3drig_light("' + getExtPath().replace(/\\/g, "/") + '")');
    });

    var btnFloor = document.getElementById("btn3DRigFloor");
    if (btnFloor) btnFloor.addEventListener("click", function() {
      call("ae_3drig_floor()");
    });

    var btnStacker = document.getElementById("btn3DRigStacker");
    if (btnStacker) btnStacker.addEventListener("click", function() {
      call('ae_3drig_stacker("' + getExtPath().replace(/\\/g, "/") + '")');
    });

    function quoteHostPath(value) {
      return JSON.stringify(String(value || "").replace(/\\/g, "/"));
    }
    function pickGlbPath() {
      try {
        if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialog === "function") {
          var picked = window.cep.fs.showOpenDialog(false, false, "Import GLB or GLTF", null, ["glb", "gltf"]);
          if (picked && picked.data && picked.data[0]) return String(picked.data[0]);
        }
      } catch (dialogError) { /* fall through */ }
      return "";
    }
    var btnMeshImport = document.getElementById("btn3DMeshImport");
    if (btnMeshImport) btnMeshImport.addEventListener("click", function() {
      var filePath = pickGlbPath();
      if (!filePath) { toast("No GLB/GLTF file selected.", true); return; }
      call("ae_import3DModel(" + quoteHostPath(filePath) + ")");
    });
    function meshPrimitive(kind) {
      return function() { call("ae_create3DPrimitive(" + JSON.stringify(kind) + ")"); };
    }
    var btnMeshCube = document.getElementById("btn3DMeshCube");
    var btnMeshPlane = document.getElementById("btn3DMeshPlane");
    var btnMeshCylinder = document.getElementById("btn3DMeshCylinder");
    var btnMeshSphere = document.getElementById("btn3DMeshSphere");
    if (btnMeshCube) btnMeshCube.addEventListener("click", meshPrimitive("cube"));
    if (btnMeshPlane) btnMeshPlane.addEventListener("click", meshPrimitive("plane"));
    if (btnMeshCylinder) btnMeshCylinder.addEventListener("click", meshPrimitive("cylinder"));
    if (btnMeshSphere) btnMeshSphere.addEventListener("click", meshPrimitive("sphere"));
    var btnMeshEnv = document.getElementById("btn3DMeshEnvLight");
    if (btnMeshEnv) btnMeshEnv.addEventListener("click", function() {
      call("ae_addEnvironmentLight()");
    });
    var btnMeshExtrude = document.getElementById("btn3DMeshExtrude");
    if (btnMeshExtrude) btnMeshExtrude.addEventListener("click", function() {
      call("ae_shapeExtrude(" + numberValue("cxMeshExtrudeDepth", 80, 4, 800) + ")");
    });
    var btnMeshPathExtrude = document.getElementById("btn3DMeshPathExtrude");
    if (btnMeshPathExtrude) btnMeshPathExtrude.addEventListener("click", function() {
      call("ae_meshExtrudeFromPath(" + numberValue("cxMeshExtrudeDepth", 80, 4, 800) + ")");
    });

    var btnClean = document.getElementById("btn3DRigClean");
    if (btnClean) btnClean.addEventListener("click", function() {
      showCameraConfirm({
        title: "Clean all 3D rigs?",
        message: "Remove every CompX 3D rig and controller from the active composition?",
        detail: "Camera, light, floor and CompX controller layers will be removed. You can still use After Effects Undo immediately afterward.",
        confirmLabel: "CLEAN RIGS",
        icon: "3D",
        tone: "danger"
      }, function() {
        call("ae_3drig_clean()");
      });
    });


    root.querySelectorAll("[data-camera-frame]").forEach(function(button) {
      button.addEventListener("click", function() {
        call('ae_camera3DFrame("' + button.getAttribute("data-camera-frame") + '")', function(result) {
          if (!result.success) return;
          root.querySelectorAll("[data-camera-frame]").forEach(function(item) { item.classList.remove("active"); });
          button.classList.add("active");
          setCameraStep(3, false);
        });
      });
    });

    root.querySelectorAll("[data-camera-lens]").forEach(function(button) {
      button.addEventListener("click", function() { applyLens(button.getAttribute("data-camera-lens")); });
    });
    var lensInput = document.getElementById("cxCameraLens");
    if (lensInput) lensInput.addEventListener("change", function() { applyLens(lensInput.value); });

    root.querySelectorAll("[data-camera-action]").forEach(function(button) {
      button.addEventListener("click", function() {
        var action = button.getAttribute("data-camera-action");
        if (action === "setup") call("ae_camera3DSetup()", function(result) { if (result.success) setCameraStep(2, false); });
        else if (action === "move") {
          var mode = document.getElementById("cxCameraMoveMode");
          call('ae_camera3DMove("' + (mode ? mode.value : "orbitLeft") + '",' + numberValue("cxCameraDistance", 500, 1, 100000) + ',true,' + numberValue("cxCameraDuration", 24, 1, 300) + ')', function(result) { if (result.success) setCameraStep(5, true); });
        } else if (action === "target") {
          call('ae_camera3DTarget("track")', function(result) { if (result.success) { markFeature(button); setCameraStep(4, false); } });
        } else if (action === "lookAt") {
          call('ae_camera3DTarget("snap")', function(result) { if (result.success) { markFeature(button); setCameraStep(4, false); } });
        } else if (action === "autoFocus") {
          call("ae_camera3DAutoFocusSettings(100,100)", function(result) { if (result.success) { markFeature(button); setCameraStep(5, false); } });
        } else if (action === "dof") {
          var enabled = button.getAttribute("aria-pressed") !== "true";
          call("ae_camera3DDOF(" + enabled + ",100,100)", function(result) {
            if (result.success) button.setAttribute("aria-pressed", enabled ? "true" : "false");
          });
        } else if (action === "reset") call('ae_camera3DReset("all")', function(result) { if (result.success) setCameraStep(2, false); });
        else if (action === "unrig") showCameraConfirm({
          title: "Detach Orbit camera?",
          message: "Keep the camera layer but remove its CompX rig controls?",
          detail: "Target, 3D path, motion and shake controllers will be removed. The camera remains in the active composition.",
          confirmLabel: "UNRIG CAMERA",
          icon: "CAM",
          tone: "danger"
        }, function() {
          call("ae_camera3DUnrig()", function(result) { if (result.success) setCameraStep(1, false); });
        });
      });
    });

    setCameraStep(1, false);
    refreshCameraState();
  }
  var initialized=false;
  function initAdvancedFeatures(){
    if(initialized)return;
    initialized=true;
    wirePasta();wireMemoryPurge();wireCamera();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initAdvancedFeatures);
  else initAdvancedFeatures();
})();
