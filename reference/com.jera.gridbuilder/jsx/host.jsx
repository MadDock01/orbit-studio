function aeAlert(message, title) {
alert(message);
}
function _comp() {
var c = app.project.activeItem;
return c instanceof CompItem ? c : null;
}
function _uname(comp, base) {
var c = 1;
var n = base + "." + c;
var ok = true;
while (ok) {
ok = false;
for (var i = 1; i <= comp.numLayers; i += 1) { 
if (comp.layer(i).name === n) { 
c++;
n = base + "." + c;
ok = true;
break ;
}}
}
return n;
}
function _isGrid(l) {
if ((!l) || (!l.nullLayer)) { 
return false;
}
var fx = l.property("ADBE Effect Parade");
if (!fx) { 
return false;
}
for (var i = 1; i <= fx.numProperties; i += 1) { 
var n = fx.property(i).name;
var mn = fx.property(i).matchName;
if ((((n) && (n.indexOf("Grid Builder") > -1)) || ((mn) && (mn.indexOf("GridBuilder") > -1))) || ((mn) && (mn.indexOf("Pseudo/") > -1))) { 
return true;
}}
return false;
}
function _getPE(l) {
var fx = l.property("ADBE Effect Parade");
if (!fx) { 
return null;
}
for (var i = 1; i <= fx.numProperties; i += 1) { 
var n = fx.property(i).name;
var mn = fx.property(i).matchName;
if ((((n) && (n.indexOf("Grid Builder") > -1)) || ((mn) && (mn.indexOf("GridBuilder") > -1))) || ((mn) && (mn.indexOf("Pseudo/") > -1))) { 
return fx.property(i);
}}
return null;
}
function _sv(l, n, v) {
try {
var e = _getPE(l);
if (e) { 
e.property(n).setValue(v);
}
} catch (err) {
}
}
function _gv(l, n, d) {
try {
var e = _getPE(l);
if (e) { 
var p = e.property(n);
if ((p) && (p.propertyType === PropertyType.NAMED_GROUP)) { 
p = p.property(n);
}
return p.value;
}
} catch (err) {
}
return d;
}
function _zaVal(ctrl) {
return _gv(ctrl, "Z Anchor", 1);
}
function _has(l, n) {
var fx = l.property("ADBE Effect Parade");
for (var i = 1; i <= fx.numProperties; i += 1) { 
if (fx.property(i).name === n) { 
return true;
}}
return false;
}
function _clr(l) {
var fx = l.property("ADBE Effect Parade");
for (var i = fx.numProperties; i >= 1; i--) { 
try {
fx.property(i).remove();
} catch (e) {
}}
}
function _ctrl(comp) {
var s = comp.selectedLayers;
for (var i = 0; i < s.length; i += 1) { 
if (_isGrid(s[i])) { 
return s[i];
}}
for (var i = 0; i < s.length; i += 1) { 
if ((s[i].parent) && (_isGrid(s[i].parent))) { 
return s[i].parent;
}}
var f = [];
for (var i = 1; i <= comp.numLayers; i += 1) { 
var l = comp.layer(i);
if (_isGrid(l)) { 
f.push(l);
}}
return f.length === 1 ? f[0] : null;
}
function _getRegistry(ctrl) {
var defaultReg = {effectors: [], layers: [], maps: {}, targets: []};
try {
var c = ctrl.comment;
if ((!c) || (c === "")) { 
return defaultReg;
}
if (c.indexOf("{") === 0) { 
var reg = eval("(" + c + ")");
if (!reg.layers) { 
reg.layers = [];
}
if (!reg.effectors) { 
reg.effectors = [];
}
if (!reg.targets) { 
reg.targets = [];
}
if (!reg.maps) { 
reg.maps = {};
}
return reg;
}
else {
if (c.indexOf("[") === 0) { 
var parts = c.split("|");
var lArr = eval(parts[0]);
var tArr = parts.length > 1 ? eval(parts[1]) : [];
return {effectors: [], layers: lArr, maps: {}, targets: tArr};
}
}
} catch (e) {
}
return defaultReg;
}
function _getLinkedFxName(el, targetCtrlName) {
try {
if ((!el) || (!el.property)) { 
return "";
}
var rootGrp = el.property("ADBE Root Vectors Group");
if (!rootGrp) { 
return "";
}
var radBound = rootGrp.property("Radius Boundary");
if (!radBound) { 
return "";
}
var radVecs = radBound.property("ADBE Vectors Group");
if (!radVecs) { 
return "";
}
for (var v = 1; v <= radVecs.numProperties; v += 1) { 
if (radVecs.property(v).matchName === "ADBE Vector Shape - Ellipse") { 
var sizeProp = radVecs.property(v).property("ADBE Vector Ellipse Size");
if (((sizeProp) && (sizeProp.expressionEnabled)) && (sizeProp.expression)) { 
var exprText = sizeProp.expression;
if (targetCtrlName) { 
var q1 = "layer(\'" + targetCtrlName + "\')";
var q2 = "layer(\"" + targetCtrlName + "\")";
if ((exprText.indexOf(q1) === -1) && (exprText.indexOf(q2) === -1)) { 
return "";
}
}
var match = exprText.match(/\.effect\(['"]([^'"]+)['"]\)/);
if (match) { 
return match[1];
}
}
}}
} catch (e) {
}
return "";
}
function _setRegistry(ctrl, regObj) {
try {
var mapsArr = [];
for (var k in regObj.maps) { 
if (regObj.maps.hasOwnProperty(k)) { 
var safeKey = k.replace(/"/g, "\\\"");
var safeVal = regObj.maps[k].replace(/"/g, "\\\"");
mapsArr.push("\"" + safeKey + "\":\"" + safeVal + "\"");
}
}
var mapsStr = "{" + mapsArr.join(",") + "}";
var str = "{\"layers\":[" + regObj.layers ? regObj.layers.join(",") : "" + "],\"effectors\":[" + regObj.effectors ? regObj.effectors.join(",") : "" + "],\"targets\":[" + regObj.targets ? regObj.targets.join(",") : "" + "],\"maps\":" + mapsStr + "}";
ctrl.comment = str;
} catch (e) {
}
}
function _getOrder(ctrl) {
return _getRegistry(ctrl).layers;
}
function _getTargets(ctrl, tot) {
try {
var reg = _getRegistry(ctrl);
if ((reg.targets) && (reg.targets.length === tot)) { 
return reg.targets;
}
} catch (e) {
}
var a = [];
for (var i = 0; i < tot; i += 1) { 
a.push(i);}
return a;
}
function _getTargetsStr(ctrl, tot) {
return "[" + _getTargets(ctrl, tot).join(",") + "]";
}
function _indexOf(arr, val) {
for (var i = 0; i < arr.length; i += 1) { 
if (arr[i] == val) { 
return i;
}}
return -1;
}
function _kids(comp, ctrl) {
var ch = [];
for (var i = 1; i <= comp.numLayers; i += 1) { 
var l = comp.layer(i);
if ((l.parent === ctrl) && (l !== ctrl)) { 
if (_isGrid(l)) { 
continue ;
}
ch.push(l);
}}
var order = _getOrder(ctrl);
ch.sort(function (a, b) {
var idxA = order.length > 0 ? _indexOf(order, a.id) : -1;
var idxB = order.length > 0 ? _indexOf(order, b.id) : -1;
if ((idxA === -1) && (idxB === -1)) { 
return a.index - b.index;
}
if (idxA === -1) { 
return 1;
}
if (idxB === -1) { 
return -1;
}
return idxA - idxB;
});
return ch;
}
function _mode(ctrl) {
try {
if (_has(ctrl, "Grid Builder Morph")) { 
return 4;
}
var e = _getPE(ctrl);
if (e) { 
if ((e.property("Focus Target") !== null) || (e.property("Focus Index") !== null)) { 
return 2;
}
if (e.property("Trim Start") !== null) { 
return 3;
}
if (e.property("Radius") !== null) { 
return 1;
}
}
} catch (err) {
}
return 0;
}
function _gp(ctrl, n, d) {
return _gv(ctrl, n, d);
}
function _sp(ctrl, n, v) {
_sv(ctrl, n, v);
}
function _build(ctrl, comp, m, cols, sx, sy, rad, tot, extPath) {
if (m === 4) { 
alert("System Error: _build was called with Morph Mode. This should not happen.");
return;
}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
ctrl.selected = true;
_clr(ctrl);
var presetName = "";
if (m === 0) { 
presetName = "GridRect_V106.ffx";
}
else if (m === 1) {
presetName = "GridRad_V106.ffx";
}
else if (m === 2) {
presetName = "GridSphere_V106.ffx";
}
else {
if (m === 3) { 
presetName = "GridPath_V106.ffx";
}
}
var ffxFile = new File(extPath + "/src/" + presetName);
if (!ffxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
if (userFile.exists) { 
ffxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxFile = sysFile;
}
}
}
if (ffxFile.exists) { 
ctrl.applyPreset(ffxFile);
}
else {
alert("Preset missing. Searched in:\n" + ffxFile.fsName, "Grid Builder");
return;
}
if (m === 0) { 
_sp(ctrl, "Columns", cols);
_sp(ctrl, "Spacing X", sx);
_sp(ctrl, "Spacing Y", sy);
_sp(ctrl, "Grid Rotation", 0);
_sp(ctrl, "Orientation", 1);
_sp(ctrl, "Scale by Position", 1);
}
else if (m === 1) {
_sp(ctrl, "Spread", cols);
_sp(ctrl, "Radius", rad);
_sp(ctrl, "Grid Rotation", 0);
_sp(ctrl, "Orientation", 1);
_sp(ctrl, "Scale by Position", 0);
}
else if (m === 2) {
_sp(ctrl, "Radius", rad);
_sp(ctrl, "Focus Index", 1);
_sp(ctrl, "Orientation", 1);
_sp(ctrl, "Scale by Position", 0);
}
else {
if (m === 3) { 
_sp(ctrl, "Scale X", sx);
_sp(ctrl, "Scale Y", sy);
_sp(ctrl, "Path Spread", 100);
_sp(ctrl, "Path Progress", 0);
_sp(ctrl, "Trim Start", 0);
_sp(ctrl, "Trim End", 100);
_sp(ctrl, "Orientation", 1);
_sp(ctrl, "Scale by Position", 1);
}
}
}
function _ev() {
return "function gp(n){var fxs=[\"Grid Builder Rectangular\",\"Grid Builder Radial\",\"Grid Builder Spherical\", \"Grid Builder Path\"];for(var k=0;k<fxs.length;k++){try{var p=C.effect(fxs[k])(n); try{var d=p.value;}catch(e2){p=p(n);} return p;}catch(e){}}for(var i=1;i<=15;i++){try{C.effect(i)(\"Grid Rotation\");var p=C.effect(i)(n); try{var d=p.value;}catch(e2){p=p(n);} return p;}catch(e){}}return null;}\rfunction gv(n){var p=gp(n);return p!==null?p.value:0;}";
}
function _eH() {
return "function _h(n){var x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);}";
}
function _eS() {
return "function shuffleIdx(o,N){var sh=Math.round(gv(\"Shuffle\"));if(sh<=0||N<=1)return o;var p=[];for(var a=0;a<N;a++)p[a]=a;for(var a=N-1;a>0;a--){var b=Math.floor(_h(sh*1e4+a)*(a+1));if(b>a)b=a;var t=p[a];p[a]=p[b];p[b]=t;}return p[o];}";
}
function _eTimeOffset(fxVar) {
var e = [];
e.push("var _fx = " + fxVar + ";");
e.push("var _timeReady = false; var eTime = time; var myDelaySec = 0;");
e.push("function gv(a, b){");
e.push("  try {");
e.push("    var fxName = b ? a : _fx; var propName = b ? b : a;");
e.push("    var p = C.effect(fxName)(propName);");
e.push("    try { var d = p.value; } catch(e2) { p = p(propName); }");
e.push("    if (!_timeReady) return p.value;");
e.push("    return (myDelaySec === 0) ? p.value : p.valueAtTime(eTime);");
e.push("  } catch(e){ return 0; }");
e.push("}");
return e.join("\r");
}
function _eRippleMath(cm) {
var e = [];
e.push("function getGridPos(k) {");
if (cm === 0) { 
e.push("  var c_cols = Math.max(1, gv(\"Columns\"));");
e.push("  var c_sx = gv(\"Spacing X\"); var c_sy = gv(\"Spacing Y\");");
e.push("  var row = Math.floor(k / c_cols); var col = k % c_cols;");
e.push("  var totalRows = Math.ceil(N / c_cols);");
e.push("  var gw = (c_cols - 1) * c_sx; var gh = (totalRows - 1) * c_sy;");
e.push("  return [(col * c_sx) - (gw / 2), (row * c_sy) - (gh / 2), 0];");
}
else if (cm === 1) {
e.push("  var spr = Math.max(1, gv(\"Spread\")); var rad = gv(\"Radius\");");
e.push("  var ring = Math.floor(k / spr); var idxInRing = k % spr;");
e.push("  var ang = (idxInRing / spr) * Math.PI * 2;");
e.push("  var currentRad = rad + (ring * rad);");
e.push("  return [Math.cos(ang) * currentRad, Math.sin(ang) * currentRad, 0];");
}
else {
if (cm === 3) { 
e.push("  var rawP = (k / (N > 1 ? N - 1 : 1)) * (gv(\"Path Spread\")/100) + (gv(\"Path Progress\")/100);");
e.push("  return getPt(rawP);");
}
}
e.push("}");
e.push("var fProp = null; try{ fProp = C.effect(_fx)(\"Ripple Focus\"); }catch(e){}");
e.push("var valA = 1, valB = 1, tF = 0;");
e.push("if (fProp && fProp.numKeys > 1) {");
e.push("  var n = 0; if(fProp.numKeys > 0) { n = fProp.nearestKey(eTime).index; if(fProp.key(n).time > eTime) n--; }");
e.push("  if (n > 0 && n < fProp.numKeys) {");
e.push("    valA = fProp.key(n).value; valB = fProp.key(n+1).value;");
e.push("    var fVal = (myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime);");
e.push("    tF = (valA === valB) ? 0 : (fVal - valA) / (valB - valA);");
e.push("  } else if (n === 0) { valA = fProp.key(1).value; valB = valA; }");
e.push("  else { valA = fProp.key(fProp.numKeys).value; valB = valA; }");
e.push("} else {");
e.push("  valA = fProp ? ((myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime)) : 1; valB = valA;");
e.push("}");
e.push("var idxA = Math.max(0, Math.min(N - 1, Math.round(valA) - 1));");
e.push("var idxB = Math.max(0, Math.min(N - 1, Math.round(valB) - 1));");
e.push("var ptA = getGridPos(idxA); var ptB = getGridPos(idxB);");
e.push("var targetPt = ptA + (ptB - ptA) * tF;");
e.push("var myPt = getGridPos(i);");
e.push("var d = length(myPt, targetPt);");
if (cm === 0) { 
e.push("var _cols = Math.max(1, gv(\"Columns\")); var _rows = Math.ceil(N / _cols);");
e.push("var _w = (_cols - 1) * gv(\"Spacing X\"); var _h = (_rows - 1) * gv(\"Spacing Y\");");
e.push("var maxRadius = length([_w/2, _h/2, 0], [0,0,0]);");
}
else if (cm === 1) {
e.push("var _spr = Math.max(1, gv(\"Spread\")); var _rad = gv(\"Radius\");");
e.push("var maxRing = Math.floor((N - 1) / _spr); var maxRadius = _rad + (maxRing * _rad);");
}
else {
if (cm === 3) { 
e.push("var maxRadius = length([gv(\"Scale X\"), gv(\"Scale Y\")], [0,0]);");
}
}
e.push("var maxD = Math.max(0.001, (gv(\"Scale Falloff\") / 100) * (maxRadius * 2));");
e.push("var amt = 1 - Math.min(1, Math.max(0, d / maxD));");
e.push("amt = amt * amt * (3 - 2 * amt);");
e.push("return amt;");
return e.join("\r");
}
function _eSlerp() {
var e = [];
e.push("var fProp = null; try{ fProp = C.effect(_fx)(\'Focus Target\'); }catch(e){}");
e.push("if(!fProp) try{ fProp = C.effect(_fx)(\'Focus Index\'); }catch(e){}");
e.push("var tA = 0, tB = 0, tF = 0;");
e.push("if (fProp && fProp.numKeys > 1) {");
e.push("  var n = 0;");
e.push("  if (fProp.numKeys > 0) {");
e.push("    n = fProp.nearestKey(eTime).index;");
e.push("    if (fProp.key(n).time > eTime) n--;");
e.push("  }");
e.push("  if (n > 0 && n < fProp.numKeys) {");
e.push("    var k1 = fProp.key(n); var k2 = fProp.key(n+1);");
e.push("    var v1Raw = k1.value; var v2Raw = k2.value;");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(v1Raw) - 1));");
e.push("    tB = Math.max(0, Math.min(N - 1, Math.round(v2Raw) - 1));");
e.push("    var fVal = (myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime);");
e.push("    tF = (v1Raw === v2Raw) ? 0 : (fVal - v1Raw) / (v2Raw - v1Raw);");
e.push("  } else if (n === 0) {");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(fProp.key(1).value) - 1)); tB = tA; tF = 0;");
e.push("  } else {");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(fProp.key(fProp.numKeys).value) - 1)); tB = tA; tF = 0;");
e.push("  }");
e.push("} else {");
e.push("  var fv = fProp ? ((myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime)) : 1;");
e.push("  var F = Math.max(0, Math.min(N - 1, fv - 1));");
e.push("  tA = Math.floor(F); tB = Math.min(N - 1, tA + 1); tF = F - tA;");
e.push("}");
e.push("var idxA = tA; var idxB = tB;");
e.push("var phA = Math.acos(1 - 2 * (idxA + 0.5) / N); var thA = Math.PI * (1 + Math.sqrt(5)) * idxA;");
e.push("var vAx = Math.cos(thA) * Math.sin(phA); var vAy = Math.cos(phA); var vAz = Math.sin(thA) * Math.sin(phA);");
e.push("var phB = Math.acos(1 - 2 * (idxB + 0.5) / N); var thB = Math.PI * (1 + Math.sqrt(5)) * idxB;");
e.push("var vBx = Math.cos(thB) * Math.sin(phB); var vBy = Math.cos(phB); var vBz = Math.sin(thB) * Math.sin(phB);");
e.push("var getQ = function(vx, vy, vz) {");
e.push("  var dotP = -vz;");
e.push("  var ang = Math.acos(Math.max(-1, Math.min(1, dotP)));");
e.push("  var ax = -vy, ay = vx;");
e.push("  var len = Math.sqrt(ax*ax + ay*ay);");
e.push("  if(len > 0.0001){ ax/=len; ay/=len; } else { ax=1; ay=0; }");
e.push("  var hAng = ang/2; var s = Math.sin(hAng);");
e.push("  return [Math.cos(hAng), ax*s, ay*s, 0];");
e.push("};");
e.push("var qA = getQ(vAx, vAy, vAz);");
e.push("var qB = getQ(vBx, vBy, vBz);");
e.push("var dotQ = qA[0]*qB[0] + qA[1]*qB[1] + qA[2]*qB[2] + qA[3]*qB[3];");
e.push("if(dotQ < 0) { dotQ = -dotQ; qB[0] = -qB[0]; qB[1] = -qB[1]; qB[2] = -qB[2]; qB[3] = -qB[3]; }");
e.push("var qM = [0,0,0,0];");
e.push("if(dotQ > 0.9999) {");
e.push("  qM[0] = qA[0]*(1-tF) + qB[0]*tF; qM[1] = qA[1]*(1-tF) + qB[1]*tF; qM[2] = qA[2]*(1-tF) + qB[2]*tF; qM[3] = qA[3]*(1-tF) + qB[3]*tF;");
e.push("} else {");
e.push("  var theta_0 = Math.acos(dotQ); var sin_theta_0 = Math.sin(theta_0);");
e.push("  var wA = Math.sin((1-tF)*theta_0) / sin_theta_0; var wB = Math.sin(tF*theta_0) / sin_theta_0;");
e.push("  qM[0] = wA*qA[0] + wB*qB[0]; qM[1] = wA*qA[1] + wB*qB[1]; qM[2] = wA*qA[2] + wB*qB[2]; qM[3] = wA*qA[3] + wB*qB[3];");
e.push("}");
e.push("var qLen = Math.sqrt(qM[0]*qM[0] + qM[1]*qM[1] + qM[2]*qM[2] + qM[3]*qM[3]);");
e.push("var qw = qM[0]/qLen, qx = qM[1]/qLen, qy = qM[2]/qLen, qz = qM[3]/qLen;");
e.push("var R11 = 1 - 2*qy*qy - 2*qz*qz;  var R12 = 2*qx*qy - 2*qz*qw;      var R13 = 2*qx*qz + 2*qy*qw;");
e.push("var R21 = 2*qx*qy + 2*qz*qw;      var R22 = 1 - 2*qx*qx - 2*qz*qz;  var R23 = 2*qy*qz - 2*qx*qw;");
e.push("var R31 = 2*qx*qz - 2*qy*qw;      var R32 = 2*qy*qz + 2*qx*qw;      var R33 = 1 - 2*qx*qx - 2*qy*qy;");
return e.join("\r");
}
function _ePathMath() {
var e = [];
e.push("var shp = gv(\"Shape\");");
e.push("var sX = gv(\"Scale X\"); var sY = gv(\"Scale Y\");");
e.push("var P = Math.max(3, Math.round(gv(\"Polygon Points\")));");
e.push("var gRot = gv(\"Grid Rotation\") * Math.PI / 180;");
e.push("var getPt = function(u) {");
e.push("  var x=0, y=0;");
e.push("  if (shp == 1) {");
e.push("    try { var mp = C.mask(1).maskPath; var pt = mp.pointOnPath(u); x = pt[0]; y = pt[1]; } catch(e) {}");
e.push("  } else if (shp == 2) {");
e.push("    var a = u * Math.PI * 2 - Math.PI/2;");
e.push("    x = Math.cos(a) * sX; y = Math.sin(a) * sY;");
e.push("  } else if (shp == 3) {");
e.push("    if (sX === 0 && sY === 0) { x = 0; y = 0; } else {");
e.push("      var pX = sX / (2 * (sX + sY)); var pY = sY / (2 * (sX + sY));");
e.push("      if (u < pX) { x = -sX + (u/pX)*2*sX; y = -sY; }");
e.push("      else if (u < pX+pY) { x = sX; y = -sY + ((u-pX)/pY)*2*sY; }");
e.push("      else if (u < 2*pX+pY) { x = sX - ((u-pX-pY)/pX)*2*sX; y = sY; }");
e.push("      else { x = -sX; y = sY - ((u-2*pX-pY)/pY)*2*sY; }");
e.push("    }");
e.push("  } else if (shp == 4) {");
e.push("    var seg = u * P; var idx = Math.floor(seg); var frac = seg - idx;");
e.push("    var a1 = idx * Math.PI * 2 / P - Math.PI/2; var a2 = (idx+1) * Math.PI * 2 / P - Math.PI/2;");
e.push("    var x1 = Math.cos(a1)*sX; var y1 = Math.sin(a1)*sY;");
e.push("    var x2 = Math.cos(a2)*sX; var y2 = Math.sin(a2)*sY;");
e.push("    x = x1 + frac*(x2-x1); y = y1 + frac*(y2-y1);");
e.push("  } else if (shp == 5) {");
e.push("    P = 5;");
e.push("    var P2 = P * 2; var seg = u * P2; var idx = Math.floor(seg); var frac = seg - idx;");
e.push("    var innerRatio = 0.5;");
e.push("    var r1_mult = (idx%2 === 0) ? 1.0 : innerRatio;");
e.push("    var r2_mult = ((idx+1)%2 === 0) ? 1.0 : innerRatio;");
e.push("    var a1 = idx * Math.PI / P - Math.PI/2; var a2 = (idx+1) * Math.PI / P - Math.PI/2;");
e.push("    var x1 = Math.cos(a1) * (sX * r1_mult); var y1 = Math.sin(a1) * (sY * r1_mult);");
e.push("    var x2 = Math.cos(a2) * (sX * r2_mult); var y2 = Math.sin(a2) * (sY * r2_mult);");
e.push("    x = x1 + frac*(x2-x1); y = y1 + frac*(y2-y1);");
e.push("  }");
e.push("  var rx = x * Math.cos(gRot) - y * Math.sin(gRot);");
e.push("  var ry = x * Math.sin(gRot) + y * Math.cos(gRot);");
e.push("  return [rx, ry];");
e.push("};");
return e.join("\r");
}
function _ePathMathMorph() {
var e = [];
e.push("var pathFx = \'Grid Builder Path Morph\';");
e.push("var masterFx = \'Grid Builder Morph\';");
e.push("var shp = gv(pathFx, \'Shape\');");
e.push("var sX = gv(pathFx, \'Scale X\'); var sY = gv(pathFx, \'Scale Y\');");
e.push("var P = Math.max(3, Math.round(gv(pathFx, \'Polygon Points\')));");
e.push("var gRotPath = gv(masterFx, \'Grid Rotation\') * Math.PI / 180;");
e.push("var getPt = function(u) {");
e.push("  var x=0, y=0;");
e.push("  if (shp == 1) {");
e.push("    try { var mp = C.mask(1).maskPath; var pt = mp.pointOnPath(u); x = pt[0]; y = pt[1]; } catch(e) {}");
e.push("  } else if (shp == 2) {");
e.push("    var a = u * Math.PI * 2 - Math.PI/2; x = Math.cos(a) * sX; y = Math.sin(a) * sY;");
e.push("  } else if (shp == 3) {");
e.push("    if (sX === 0 && sY === 0) { x = 0; y = 0; } else {");
e.push("      var pX = sX / (2 * (sX + sY)); var pY = sY / (2 * (sX + sY));");
e.push("      if (u < pX) { x = -sX + (u/pX)*2*sX; y = -sY; }");
e.push("      else if (u < pX+pY) { x = sX; y = -sY + ((u-pX)/pY)*2*sY; }");
e.push("      else if (u < 2*pX+pY) { x = sX - ((u-pX-pY)/pX)*2*sX; y = sY; }");
e.push("      else { x = -sX; y = sY - ((u-2*pX-pY)/pY)*2*sY; }");
e.push("    }");
e.push("  } else if (shp == 4) {");
e.push("    var seg = u * P; var idx = Math.floor(seg); var frac = seg - idx;");
e.push("    var a1 = idx * Math.PI * 2 / P - Math.PI/2; var a2 = (idx+1) * Math.PI * 2 / P - Math.PI/2;");
e.push("    var x1 = Math.cos(a1)*sX; var y1 = Math.sin(a1)*sY; var x2 = Math.cos(a2)*sX; var y2 = Math.sin(a2)*sY;");
e.push("    x = x1 + frac*(x2-x1); y = y1 + frac*(y2-y1);");
e.push("  } else if (shp == 5) {");
e.push("    P = 5; var P2 = P * 2; var seg = u * P2; var idx = Math.floor(seg); var frac = seg - idx;");
e.push("    var innerRatio = 0.5;");
e.push("    var r1_mult = (idx%2 === 0) ? 1.0 : innerRatio; var r2_mult = ((idx+1)%2 === 0) ? 1.0 : innerRatio;");
e.push("    var a1 = idx * Math.PI / P - Math.PI/2; var a2 = (idx+1) * Math.PI / P - Math.PI/2;");
e.push("    var x1 = Math.cos(a1) * (sX * r1_mult); var y1 = Math.sin(a1) * (sY * r1_mult);");
e.push("    var x2 = Math.cos(a2) * (sX * r2_mult); var y2 = Math.sin(a2) * (sY * r2_mult);");
e.push("    x = x1 + frac*(x2-x1); y = y1 + frac*(y2-y1);");
e.push("  }");
e.push("  var rx = x * Math.cos(gRotPath) - y * Math.sin(gRotPath);");
e.push("  var ry = x * Math.sin(gRotPath) + y * Math.cos(gRotPath);");
e.push("  return [rx, ry];");
e.push("};");
return e.join("\r");
}
function _eSlerpMorph() {
var e = [];
e.push("var tA = 0, tB = 0, tF_Slerp = 0;");
e.push("if (fProp && fProp.numKeys > 1) {");
e.push("  var n = 0; if (fProp.numKeys > 0) { n = fProp.nearestKey(eTime).index; if (fProp.key(n).time > eTime) n--; }");
e.push("  if (n > 0 && n < fProp.numKeys) {");
e.push("    var k1 = fProp.key(n); var k2 = fProp.key(n+1);");
e.push("    var v1Raw = k1.value; var v2Raw = k2.value;");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(v1Raw) - 1));");
e.push("    tB = Math.max(0, Math.min(N - 1, Math.round(v2Raw) - 1));");
e.push("    var fVal = (myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime);");
e.push("    tF_Slerp = (v1Raw === v2Raw) ? 0 : (fVal - v1Raw) / (v2Raw - v1Raw);");
e.push("  } else if (n === 0) {");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(fProp.key(1).value) - 1)); tB = tA; tF_Slerp = 0;");
e.push("  } else {");
e.push("    tA = Math.max(0, Math.min(N - 1, Math.round(fProp.key(fProp.numKeys).value) - 1)); tB = tA; tF_Slerp = 0;");
e.push("  }");
e.push("} else {");
e.push("  var fv = fProp ? ((myDelaySec === 0) ? fProp.value : fProp.valueAtTime(eTime)) : 1;");
e.push("  var F = Math.max(0, Math.min(N - 1, fv - 1));");
e.push("  tA = Math.floor(F); tB = Math.min(N - 1, tA + 1); tF_Slerp = F - tA;");
e.push("}");
e.push("var idxA = tA; var idxB = tB;");
e.push("var phA = Math.acos(1 - 2 * (idxA + 0.5) / N); var thA = Math.PI * (1 + Math.sqrt(5)) * idxA;");
e.push("var vAx = Math.cos(thA) * Math.sin(phA); var vAy = Math.cos(phA); var vAz = Math.sin(thA) * Math.sin(phA);");
e.push("var phB = Math.acos(1 - 2 * (idxB + 0.5) / N); var thB = Math.PI * (1 + Math.sqrt(5)) * idxB;");
e.push("var vBx = Math.cos(thB) * Math.sin(phB); var vBy = Math.cos(phB); var vBz = Math.sin(thB) * Math.sin(phB);");
e.push("var getQ = function(vx, vy, vz) {");
e.push("  var dotP = -vz; var ang = Math.acos(Math.max(-1, Math.min(1, dotP)));");
e.push("  var ax = -vy, ay = vx; var len = Math.sqrt(ax*ax + ay*ay);");
e.push("  if(len > 0.0001){ ax/=len; ay/=len; } else { ax=1; ay=0; }");
e.push("  var hAng = ang/2; var s = Math.sin(hAng); return [Math.cos(hAng), ax*s, ay*s, 0];");
e.push("};");
e.push("var qA = getQ(vAx, vAy, vAz); var qB = getQ(vBx, vBy, vBz);");
e.push("var dotQ = qA[0]*qB[0] + qA[1]*qB[1] + qA[2]*qB[2] + qA[3]*qB[3];");
e.push("if(dotQ < 0) { dotQ = -dotQ; qB[0] = -qB[0]; qB[1] = -qB[1]; qB[2] = -qB[2]; qB[3] = -qB[3]; }");
e.push("var qM = [0,0,0,0];");
e.push("if(dotQ > 0.9999) {");
e.push("  qM[0] = qA[0]*(1-tF_Slerp) + qB[0]*tF_Slerp; qM[1] = qA[1]*(1-tF_Slerp) + qB[1]*tF_Slerp; qM[2] = qA[2]*(1-tF_Slerp) + qB[2]*tF_Slerp; qM[3] = qA[3]*(1-tF_Slerp) + qB[3]*tF_Slerp;");
e.push("} else {");
e.push("  var theta_0 = Math.acos(dotQ); var sin_theta_0 = Math.sin(theta_0);");
e.push("  var wA = Math.sin((1-tF_Slerp)*theta_0) / sin_theta_0; var wB = Math.sin(tF_Slerp*theta_0) / sin_theta_0;");
e.push("  qM[0] = wA*qA[0] + wB*qB[0]; qM[1] = wA*qA[1] + wB*qB[1]; qM[2] = wA*qA[2] + wB*qB[2]; qM[3] = wA*qA[3] + wB*qB[3];");
e.push("}");
e.push("var qLen = Math.sqrt(qM[0]*qM[0] + qM[1]*qM[1] + qM[2]*qM[2] + qM[3]*qM[3]);");
e.push("var qw = qM[0]/qLen, qx = qM[1]/qLen, qy = qM[2]/qLen, qz = qM[3]/qLen;");
e.push("var R11 = 1 - 2*qy*qy - 2*qz*qz;  var R12 = 2*qx*qy - 2*qz*qw;      var R13 = 2*qx*qz + 2*qy*qw;");
e.push("var R21 = 2*qx*qy + 2*qz*qw;      var R22 = 1 - 2*qx*qx - 2*qz*qz;  var R23 = 2*qy*qz - 2*qx*qw;");
e.push("var R31 = 2*qx*qz - 2*qy*qw;      var R32 = 2*qy*qz + 2*qx*qw;      var R33 = 1 - 2*qx*qx - 2*qy*qy;");
return e.join("\r");
}
function _ePos(idx, cn, gm, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_ev());
e.push(_eH());
e.push(_eS());
e.push("var prt=thisLayer.parent; var ap=prt?prt.transform.anchorPoint.value:[0,0,0];");
e.push("var apx=ap[0], apy=ap[1], apz=(ap.length>2)?ap[2]:0;");
e.push("var gm=" + gm + ";var N=" + tot + ";");
e.push("var rnd=gv(\"Random Offset\"); var seed=gv(\"Random Seed\");");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("var x=0,y=0,z=0;");
e.push("if(gm==2){");
e.push("  var R=gv(\"Radius\");");
e.push("  var phi = Math.acos(1 - 2 * (i + 0.5) / N);");
e.push("  var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("  var px = R * Math.cos(theta) * Math.sin(phi);");
e.push("  var py = R * Math.cos(phi);");
e.push("  var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push(_eSlerp());
e.push("  x = px*R11 + py*R12 + pz*R13;");
e.push("  y = px*R21 + py*R22 + pz*R23;");
e.push("  z = px*R31 + py*R32 + pz*R33;");
e.push("} else if(gm==3){");
e.push(_ePathMath());
e.push("  var spread = gv(\"Path Spread\") / 100;");
e.push("  var prog = gv(\"Path Progress\") / 100;");
e.push("  var trimS = gv(\"Trim Start\") / 100;");
e.push("  var trimE = gv(\"Trim End\") / 100;");
e.push("  var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("  var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("  var rawP = (i / div) * spread + prog;");
e.push("  var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("  if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("  var tFinal = trimS + tWrap * (trimE - trimS);");
e.push("  var pt = getPt(tFinal);");
e.push("  x = pt[0]; y = pt[1];");
e.push("  var zD = gv(\"Z Depth\"); var zA = Math.round(gv(\"Z Anchor\")) - 1;");
e.push("  z = (i - zA) * zD;");
e.push("} else {");
e.push("  var cols=Math.max(1,Math.round(gv(\"" + gm == 1 ? "Spread" : "Columns" + "\")));");
e.push("  var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("  var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("  var zD=gv(\"Z Depth\");var zA=Math.round(gv(\"Z Anchor\"))-1;");
e.push("  var c=i%cols;var r=Math.floor(i/cols);");
e.push("  if(gm==1){");
e.push("    var R=gv(\"Radius\");var angS=(2*Math.PI)/Math.max(1,cols);var a=c*angS+gRot;");
e.push("    var px=Math.cos(a)*R,py=Math.sin(a)*R;");
e.push("    x=px; y=py; z=0;");
e.push("  }else{");
e.push("    var spX=gv(\"Spacing X\");var spY=gv(\"Spacing Y\");");
e.push("    var cx2=(cols-1)/2,cy2=(rows-1)/2;");
e.push("    var dx=(c-cx2)*spX,dy=(r-cy2)*spY;");
e.push("    var rxP=dx*Math.cos(gRot)-dy*Math.sin(gRot);var ryP=dx*Math.sin(gRot)+dy*Math.cos(gRot);");
e.push("    x=rxP; y=ryP; z=0;");
e.push("  }");
e.push("  z+=(i-zA)*zD;");
e.push("}");
e.push("x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd;");
e.push("y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd;");
e.push("z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("value+[x, y, z];");
return e.join("\r");
}
function _eOri(idx, cn, gm, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_ev());
e.push(_eH());
e.push(_eS());
e.push("var gm=" + gm + ";var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("var res = value;");
e.push("var fs=0;");
e.push("if(gm==2){");
e.push("  try{ if(gv(\"Orientation\") == 3) fs = 1; }catch(e){}");
e.push("} else if(gm==3){");
e.push("  try{ if(gv(\"Orientation\") == 2) fs = 1; }catch(e){}");
e.push("} else {");
e.push("  try{ fs = gv(\"Face Screen\"); }catch(e){}");
e.push("}");
e.push("if(fs>=1){");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0]) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0]) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1]) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX); var lY = prt.fromWorldVec(cY); var lZ = prt.fromWorldVec(cZ);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  var yaw = Math.asin(Math.max(-1, Math.min(1, lZ[0])));");
e.push("  var pitch, roll;");
e.push("  if (Math.abs(lZ[0]) < 0.99999) {");
e.push("    pitch = Math.atan2(-lZ[1], lZ[2]);");
e.push("    roll = Math.atan2(-lY[0], lX[0]);");
e.push("  } else {");
e.push("    pitch = Math.atan2(lY[2], lY[1]);");
e.push("    roll = 0;");
e.push("  }");
e.push("  res = [pitch, yaw, roll] * 180 / Math.PI + value;");
e.push("}else if(gm==2){");
e.push("  var p = transform.position;");
e.push("  var faceDir = 1; try{ faceDir = gv(\"Orientation\"); }catch(e){}");
e.push("  if(faceDir == 2){");
e.push("    res = lookAt(p, [0,0,0]) + value;");
e.push("  } else {");
e.push("    res = lookAt([0,0,0], p) + value;");
e.push("  }");
e.push("}else if(gm==3){");
e.push("  var faceDir = 1; try{ faceDir = gv(\"Orientation\"); }catch(e){}");
e.push("  if(faceDir == 3){");
e.push(_ePathMath());
e.push("    var spread = gv(\"Path Spread\") / 100; var prog = gv(\"Path Progress\") / 100;");
e.push("    var trimS = gv(\"Trim Start\") / 100; var trimE = gv(\"Trim End\") / 100;");
e.push("    var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("    var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("    var rawP = (i / div) * spread + prog;");
e.push("    var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("    if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("    var pt1 = getPt(trimS + tWrap * (trimE - trimS));");
e.push("    var rawPNext = rawP + 0.001;");
e.push("    var tNextWrap = rawPNext % 1.0; if(tNextWrap < 0) tNextWrap += 1.0;");
e.push("    if (tNextWrap === 0 && rawPNext !== 0 && !isClosed) tNextWrap = 1.0;");
e.push("    var pt2 = getPt(trimS + tNextWrap * (trimE - trimS));");
e.push("    if(pt1[0]===pt2[0] && pt1[1]===pt2[1]) {");
e.push("      var rawPPrev = rawP - 0.001;");
e.push("      var tPrevWrap = rawPPrev % 1.0; if(tPrevWrap < 0) tPrevWrap += 1.0;");
e.push("      if (tPrevWrap === 0 && rawPPrev !== 0 && !isClosed) tPrevWrap = 1.0;");
e.push("      pt1 = getPt(trimS + tPrevWrap * (trimE - trimS));");
e.push("    }");
e.push("    var dx = pt2[0] - pt1[0]; var dy = pt2[1] - pt1[1];");
e.push("    var ang = Math.atan2(dy, dx) * 180 / Math.PI; res = value + [0,0,ang];");
e.push("  } else if(faceDir == 4){");
e.push("    var p = transform.position; var ang = Math.atan2(p[1], p[0]) * 180 / Math.PI + 90; res = value + [0,0,ang];");
e.push("  } else { res = value; }");
e.push("}else{");
e.push("  var oc=0;try{oc=gv(\"Orient to Center\")}catch(e){}");
e.push("  if(oc>=1){");
e.push("    var p=transform.position;");
e.push("    var ang=Math.atan2(p[1],p[0])*180/Math.PI+90;");
e.push("    res = value+[0,0,ang];");
e.push("  }");
e.push("}");
e.push("res;");
return e.join("\r");
}
function _eScl(idx, cn, gm, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_ev());
e.push(_eH());
e.push(_eS());
e.push("var gm=" + gm + ";var N=" + tot + ";");
e.push("var sf=gv(\"Scale Front\");var sb=gv(\"Scale Back\");");
e.push("if(sf===0 && sb===0) { sf=gv(\"Scale Forward\"); sb=gv(\"Scale Backwards\"); }");
e.push("if(sf!=0||sb!=0){");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("var sByPos=0;try{sByPos=gv(\"Scale by Position\")}catch(e){}");
e.push("var t=0;");
e.push("if(sByPos<1){t=(N>1)?i/(N-1):0;}else{");
e.push("  var sDir=0;try{sDir=gv(\"Scale Direction\")*Math.PI/180}catch(e){}");
e.push("  if(gm==2){");
e.push("    var R=gv(\"Radius\");");
e.push("    var phi = Math.acos(1 - 2 * (i + 0.5) / N);");
e.push("    var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("    var px = R * Math.cos(theta) * Math.sin(phi);");
e.push("    var py = R * Math.cos(phi);");
e.push("    var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push(_eSlerp());
e.push("    var rotX = px*R11 + py*R12 + pz*R13;");
e.push("    var rotY = px*R21 + py*R22 + pz*R23;");
e.push("    var proj = rotX*Math.cos(sDir) + rotY*Math.sin(sDir);");
e.push("    t = (R > 0) ? (proj + R) / (2 * R) : 0;");
e.push("  }else if(gm==3){");
e.push(_ePathMath());
e.push("    try{");
e.push("      var spread=gv(\"Path Spread\")/100;var prog=gv(\"Path Progress\")/100;");
e.push("      var trimS=gv(\"Trim Start\")/100; var trimE=gv(\"Trim End\")/100;");
e.push("      var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("      var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("      var rawP=(i/div)*spread + prog;");
e.push("      var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("      if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("      var tFinal = trimS + tWrap * (trimE - trimS);");
e.push("      var pt = getPt(tFinal);");
e.push("      var proj = pt[0]*Math.cos(sDir) + pt[1]*Math.sin(sDir);");
e.push("      var minP=0; var maxP=0;");
e.push("      for(var j=0; j<N; j++){");
e.push("        var jRawP=(j/div)*spread + prog;");
e.push("        var jWrap = jRawP % 1.0; if(jWrap < 0) jWrap += 1.0;");
e.push("        if (jWrap === 0 && jRawP !== 0 && !isClosed) jWrap = 1.0;");
e.push("        var jFinal = trimS + jWrap * (trimE - trimS);");
e.push("        var jPt = getPt(jFinal);");
e.push("        var jp = jPt[0]*Math.cos(sDir) + jPt[1]*Math.sin(sDir);");
e.push("        if(j===0) { minP = jp; maxP = jp; } else {");
e.push("          if(jp < minP) minP = jp;");
e.push("          if(jp > maxP) maxP = jp;");
e.push("        }");
e.push("      }");
e.push("      if((maxP - minP) > 0.0001) { t = (proj - minP) / (maxP - minP); } else { t = 0; }");
e.push("    }catch(e){ t=0; }");
e.push("  }else{");
e.push("      var cols=Math.max(1,Math.round(gv(\"" + gm == 1 ? "Spread" : "Columns" + "\")));");
e.push("      var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("      var c=i%cols;var r=Math.floor(i/cols);");
e.push("      var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("      var wx=0,wy=0;");
e.push("      if(gm==1){");
e.push("        var R=gv(\"Radius\");var angS=(2*Math.PI)/Math.max(1,cols);");
e.push("        var a=c*angS+gRot;wx=Math.cos(a)*R;wy=Math.sin(a)*R;");
e.push("      }else{");
e.push("        var spX=gv(\"Spacing X\");var spY=gv(\"Spacing Y\");");
e.push("        var cx2=(cols-1)/2,cy2=(rows-1)/2;");
e.push("        var dx=(c-cx2)*spX,dy=(r-cy2)*spY;");
e.push("        wx=dx*Math.cos(gRot)-dy*Math.sin(gRot);");
e.push("        wy=dx*Math.sin(gRot)+dy*Math.cos(gRot);}");
e.push("      var proj=wx*Math.cos(sDir)+wy*Math.sin(sDir);");
e.push("      var maxP=0;");
e.push("      for(var j=0;j<N;j++){var jc=j%cols,jr=Math.floor(j/cols);var jx=0,jy=0;");
e.push("        if(gm==1){var ja=jc*(2*Math.PI)/Math.max(1,cols)+gRot;jx=Math.cos(ja)*R;jy=Math.sin(ja)*R;}");
e.push("        else{jx=(jc-cx2)*spX*Math.cos(gRot)-(jr-cy2)*spY*Math.sin(gRot);");
e.push("        jy=(jc-cx2)*spX*Math.sin(gRot)+(jr-cy2)*spY*Math.cos(gRot);}");
e.push("        var jp=Math.abs(jx*Math.cos(sDir)+jy*Math.sin(sDir));if(jp>maxP)maxP=jp;}");
e.push("      t=(maxP>0)?(proj+maxP)/(2*maxP):0;}");
e.push("  }");
e.push("  if(t<0)t=0;if(t>1)t=1;");
e.push("var fFx=(1-t)*sf/100;var bFx=t*sb/100;");
e.push("var m=1+fFx+bFx;if(m<0)m=0;value*m;}else{value;}");
return e.join("\r");
}
function _ePosRect(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Rectangular\'"));
e.push(_eH());
e.push(_eS());
e.push("var prt=thisLayer.parent; var ap=prt?prt.transform.anchorPoint.value:[0,0,0];");
e.push("var apx=ap[0], apy=ap[1], apz=(ap.length>2)?ap[2]:0;");
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var rnd=gv(\"Random Offset\"); var seed=gv(\"Random Seed\");");
e.push("var cols=Math.max(1,Math.round(gv(\"Columns\")));");
e.push("var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("var spX=gv(\"Spacing X\"); var spY=gv(\"Spacing Y\");");
e.push("var zD=gv(\"Z Depth\"); var zA=Math.round(gv(\"Z Anchor\"))-1;");
e.push("var c=i%cols; var r=Math.floor(i/cols);");
e.push("var cx2=(cols-1)/2, cy2=(rows-1)/2;");
e.push("var dx=(c-cx2)*spX, dy=(r-cy2)*spY;");
e.push("var x=dx*Math.cos(gRot)-dy*Math.sin(gRot);");
e.push("var y=dx*Math.sin(gRot)+dy*Math.cos(gRot);");
e.push("var z=(i-zA)*zD;");
e.push("x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd;");
e.push("y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd;");
e.push("z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("value+[x, y, z];");
return e.join("\r");
}
function _eOriRect(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("var N=" + tot + ";");
e.push(_eTimeOffset("\'Grid Builder Rectangular\'"));
e.push(_eH());
e.push(_eS());
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("function rx(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]; }");
e.push("function ry(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]; }");
e.push("function rz(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]; }");
e.push("var d2r = Math.PI / 180;");
e.push("var r2d = 180 / Math.PI;");
e.push("var ori=1; try{ ori = gv(\'Orientation\'); }catch(e){ try{ if(gv(\'Face Screen\')>=1) ori=2; else if(gv(\'Orient to Center\')>=1) ori=3; }catch(e2){} }");
e.push("var bX = [1,0,0]; var bY = [0,1,0]; var bZ = [0,0,1];");
e.push("if(ori == 2){");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0], eTime) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0], eTime) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1], eTime) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX, eTime); var lY = prt.fromWorldVec(cY, eTime); var lZ = prt.fromWorldVec(cZ, eTime);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  bX = lX; bY = lY; bZ = lZ;");
e.push("} else if(ori == 3){");
e.push("  var p = transform.position;");
e.push("  var ang = Math.atan2(p[1], p[0]) + Math.PI/2;");
e.push("  var c = Math.cos(ang), s = Math.sin(ang);");
e.push("  bX = [c, s, 0]; bY = [-s, c, 0]; bZ = [0, 0, 1];");
e.push("}");
e.push("var tX = gv(\'Twist X\'); var tY = gv(\'Twist Y\'); var tZ = gv(\'Twist Z\');");
e.push("var stag = gv(\'Stagger\');");
e.push("var sAx = gv(\'Stagger Axis\'); if(sAx === 0) sAx = 1;");
e.push("var step = (N > 1) ? (i / (N - 1)) : 0;");
e.push("var actX = (sAx===1 || sAx===2 || sAx===5 || sAx===6) ? 1 : 0;");
e.push("var actY = (sAx===1 || sAx===3 || sAx===5 || sAx===7) ? 1 : 0;");
e.push("var actZ = (sAx===1 || sAx===4 || sAx===6 || sAx===7) ? 1 : 0;");
e.push("var finX = (tX + (stag * actX * step)) * d2r;");
e.push("var finY = (tY + (stag * actY * step)) * d2r;");
e.push("var finZ = (tZ + (stag * actZ * step)) * d2r;");
e.push("var vX = [1,0,0]; var vY = [0,1,0]; var vZ = [0,0,1];");
e.push("vX = rz(ry(rx(vX, finX), finY), finZ);");
e.push("vY = rz(ry(rx(vY, finX), finY), finZ);");
e.push("vZ = rz(ry(rx(vZ, finX), finY), finZ);");
e.push("var fX = [ bX[0]*vX[0] + bY[0]*vX[1] + bZ[0]*vX[2], bX[1]*vX[0] + bY[1]*vX[1] + bZ[1]*vX[2], bX[2]*vX[0] + bY[2]*vX[1] + bZ[2]*vX[2] ];");
e.push("var fY = [ bX[0]*vY[0] + bY[0]*vY[1] + bZ[0]*vY[2], bX[1]*vY[0] + bY[1]*vY[1] + bZ[1]*vY[2], bX[2]*vY[0] + bY[2]*vY[1] + bZ[2]*vY[2] ];");
e.push("var fZ = [ bX[0]*vZ[0] + bY[0]*vZ[1] + bZ[0]*vZ[2], bX[1]*vZ[0] + bY[1]*vZ[1] + bZ[1]*vZ[2], bX[2]*vZ[0] + bY[2]*vZ[1] + bZ[2]*vZ[2] ];");
e.push("var yaw = Math.asin(Math.max(-1, Math.min(1, fZ[0])));");
e.push("var pitch, roll;");
e.push("if (Math.abs(fZ[0]) < 0.99999) {");
e.push("  pitch = Math.atan2(-fZ[1], fZ[2]);");
e.push("  roll = Math.atan2(-fY[0], fX[0]);");
e.push("} else {");
e.push("  pitch = Math.atan2(fY[2], fY[1]);");
e.push("  roll = 0;");
e.push("}");
e.push("var res = value + [pitch * r2d, yaw * r2d, roll * r2d];");
e.push("res;");
return e.join("\r");
}
function _eSclRect(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("var N=" + tot + ";");
e.push(_eTimeOffset("\'Grid Builder Rectangular\'"));
e.push(_eH());
e.push(_eS());
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var sf=0; try{sf=gv(\"Scale Front\");}catch(e){sf=gv(\"Scale Front\");}");
e.push("var sb=0; try{sb=gv(\"Scale Back\");}catch(e){sb=gv(\"Scale Back\");}");
e.push("if(sf!=0||sb!=0){");
e.push("  var sByPos=0;try{sByPos=gv(\"Scale by Position\")}catch(e){}");
e.push("  var t=0;");
e.push("  if(sByPos<2){ t=(N>1)?i/(N-1):0; }else if(sByPos==2){");
e.push("    var sDir=0;try{sDir=(gv(\"Linear Direction\")+90)*Math.PI/180}catch(e){sDir=(gv(\"Scale Direction\")+90)*Math.PI/180}");
e.push("    var falloff=50;try{falloff=gv(\"Scale Falloff\")}catch(e){}");
e.push("    var cols=Math.max(1,Math.round(gv(\"Columns\"))); var rows=Math.ceil(N/cols);");
e.push("    var spX=gv(\"Spacing X\"); var spY=gv(\"Spacing Y\"); var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("    var cx2=(cols-1)/2, cy2=(rows-1)/2;");
e.push("    var dx=(i%cols-cx2)*spX, dy=(Math.floor(i/cols)-cy2)*spY;");
e.push("    var wx=dx*Math.cos(gRot)-dy*Math.sin(gRot); var wy=dx*Math.sin(gRot)+dy*Math.cos(gRot);");
e.push("    var proj=wx*Math.cos(sDir)+wy*Math.sin(sDir);");
e.push("    var maxProj = Math.abs(cx2*spX*Math.cos(sDir-gRot)) + Math.abs(cy2*spY*Math.sin(sDir-gRot));");
e.push("    if(maxProj === 0) maxProj = 1;");
e.push("    var v = (proj / maxProj + 1) / 2;");
e.push("    var W = Math.max(0.01, (falloff / 100) * 2.0);");
e.push("    var start_v = 1.0 - W;");
e.push("    t = (v - start_v) / W;");
e.push("  }else if(sByPos==3){");
e.push("    var getRippleAmt = function() {");
e.push(_eRippleMath(0));
e.push("    };");
e.push("    t = 1.0 - getRippleAmt();");
e.push("  }");
e.push("  if(t<0)t=0;if(t>1)t=1;");
e.push("  t = t * t * t * (t * (t * 6 - 15) + 10);");
e.push("  var fFx=(1-t)*sf/100;var bFx=t*sb/100;");
e.push("  var m=1+fFx+bFx;if(m<0)m=0;value*m;");
e.push("}else{value;}");
return e.join("\r");
}
function _ePosRad(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Radial\'"));
e.push(_eH());
e.push(_eS());
e.push("var prt=thisLayer.parent; var ap=prt?prt.transform.anchorPoint.value:[0,0,0];");
e.push("var apx=ap[0], apy=ap[1], apz=(ap.length>2)?ap[2]:0;");
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var rnd=gv(\"Random Offset\"); var seed=gv(\"Random Seed\");");
e.push("var cols=Math.max(1,Math.round(gv(\"Spread\")));");
e.push("var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("var R=gv(\"Radius\");");
e.push("var zD=gv(\"Z Depth\"); var zA=Math.round(gv(\"Z Anchor\"))-1;");
e.push("var c=i%cols; var r=Math.floor(i/cols);");
e.push("var angS=(2*Math.PI)/Math.max(1,cols);");
e.push("var a=c*angS+gRot-(Math.PI / 2);");
e.push("var x=Math.cos(a)*R;");
e.push("var y=Math.sin(a)*R;");
e.push("var z=(i-zA)*zD;");
e.push("x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd;");
e.push("y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd;");
e.push("z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("value+[x, y, z];");
return e.join("\r");
}
function _eOriRad(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Radial\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("function rx(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]; }");
e.push("function ry(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]; }");
e.push("function rz(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]; }");
e.push("var d2r = Math.PI / 180;");
e.push("var r2d = 180 / Math.PI;");
e.push("var ori=1; try{ ori = gv(\'Orientation\'); }catch(e){ try{ if(gv(\'Face Screen\')>=1) ori=2; else if(gv(\'Orient to Center\')>=1) ori=3; }catch(e2){} }");
e.push("var bX = [1,0,0]; var bY = [0,1,0]; var bZ = [0,0,1];");
e.push("if(ori == 2){");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0], eTime) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0], eTime) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1], eTime) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX, eTime); var lY = prt.fromWorldVec(cY, eTime); var lZ = prt.fromWorldVec(cZ, eTime);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  bX = lX; bY = lY; bZ = lZ;");
e.push("} else if(ori == 3){");
e.push("  var p = transform.position;");
e.push("  var ang = Math.atan2(p[1], p[0]) + Math.PI/2;");
e.push("  var c = Math.cos(ang), s = Math.sin(ang);");
e.push("  bX = [c, s, 0]; bY = [-s, c, 0]; bZ = [0, 0, 1];");
e.push("}");
e.push("var tX = gv(\'Twist X\'); var tY = gv(\'Twist Y\'); var tZ = gv(\'Twist Z\');");
e.push("var stag = gv(\'Stagger\');");
e.push("var sAx = gv(\'Stagger Axis\'); if(sAx === 0) sAx = 1;");
e.push("var step = (N > 1) ? (i / (N - 1)) : 0;");
e.push("var actX = (sAx===1 || sAx===2 || sAx===5 || sAx===6) ? 1 : 0;");
e.push("var actY = (sAx===1 || sAx===3 || sAx===5 || sAx===7) ? 1 : 0;");
e.push("var actZ = (sAx===1 || sAx===4 || sAx===6 || sAx===7) ? 1 : 0;");
e.push("var finX = (tX + (stag * actX * step)) * d2r;");
e.push("var finY = (tY + (stag * actY * step)) * d2r;");
e.push("var finZ = (tZ + (stag * actZ * step)) * d2r;");
e.push("var vX = [1,0,0]; var vY = [0,1,0]; var vZ = [0,0,1];");
e.push("vX = rz(ry(rx(vX, finX), finY), finZ);");
e.push("vY = rz(ry(rx(vY, finX), finY), finZ);");
e.push("vZ = rz(ry(rx(vZ, finX), finY), finZ);");
e.push("var fX = [ bX[0]*vX[0] + bY[0]*vX[1] + bZ[0]*vX[2], bX[1]*vX[0] + bY[1]*vX[1] + bZ[1]*vX[2], bX[2]*vX[0] + bY[2]*vX[1] + bZ[2]*vX[2] ];");
e.push("var fY = [ bX[0]*vY[0] + bY[0]*vY[1] + bZ[0]*vY[2], bX[1]*vY[0] + bY[1]*vY[1] + bZ[1]*vY[2], bX[2]*vY[0] + bY[2]*vY[1] + bZ[2]*vY[2] ];");
e.push("var fZ = [ bX[0]*vZ[0] + bY[0]*vZ[1] + bZ[0]*vZ[2], bX[1]*vZ[0] + bY[1]*vZ[1] + bZ[1]*vZ[2], bX[2]*vZ[0] + bY[2]*vZ[1] + bZ[2]*vZ[2] ];");
e.push("var yaw = Math.asin(Math.max(-1, Math.min(1, fZ[0])));");
e.push("var pitch, roll;");
e.push("if (Math.abs(fZ[0]) < 0.99999) {");
e.push("  pitch = Math.atan2(-fZ[1], fZ[2]);");
e.push("  roll = Math.atan2(-fY[0], fX[0]);");
e.push("} else {");
e.push("  pitch = Math.atan2(fY[2], fY[1]);");
e.push("  roll = 0;");
e.push("}");
e.push("var res = value + [pitch * r2d, yaw * r2d, roll * r2d];");
e.push("res;");
return e.join("\r");
}
function _eSclRad(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Radial\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var sf=gv(\"Scale Front\"); var sb=gv(\"Scale Back\");");
e.push("if(sf!=0||sb!=0){");
e.push("  var sByPos=0;try{sByPos=gv(\"Scale by Position\")}catch(e){}");
e.push("  var t=0;");
e.push("  if(sByPos<1){t=(N>1)?i/(N-1):0;}else{");
e.push("    var sDir=0;try{sDir=(gv(\"Scale Direction\")+90)*Math.PI/180}catch(e){}");
e.push("    var falloff=50;try{falloff=gv(\"Scale Falloff\")}catch(e){}");
e.push("    var cols=Math.max(1,Math.round(gv(\"Spread\")));");
e.push("    var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("    var c=i%cols;");
e.push("    var gRot=gv(\"Grid Rotation\")*Math.PI/180;");
e.push("    var R=gv(\"Radius\");");
e.push("    var angS=(2*Math.PI)/Math.max(1,cols);");
e.push("    var a=c*angS+gRot-(Math.PI / 2);");
e.push("    var wx=Math.cos(a)*R; var wy=Math.sin(a)*R;");
e.push("    var proj=wx*Math.cos(sDir)+wy*Math.sin(sDir);");
e.push("    var maxProj = R > 0 ? R : 1;");
e.push("    var v = (proj / maxProj + 1) / 2;");
e.push("    var F = Math.max(0, Math.min(100, falloff)) / 100;");
e.push("    var start_v, end_v;");
e.push("    if (F <= 0.01) { start_v = 0.99; end_v = 1.0; }");
e.push("    else if (F >= 0.99) { start_v = -0.1; end_v = 0.0; }");
e.push("    else if (F < 0.5) { start_v = 1.0 - (F * 2.0); end_v = 1.0; }");
e.push("    else { start_v = 0.0; end_v = 1.0 - ((F - 0.5) * 2.0); }");
e.push("    t = (v - start_v) / (end_v - start_v);");
e.push("  }");
e.push("  if(t<0)t=0;if(t>1)t=1;");
e.push("  var fFx=(1-t)*sf/100;var bFx=t*sb/100;");
e.push("  var m=1+fFx+bFx;if(m<0)m=0;value*m;");
e.push("}else{value;}");
return e.join("\r");
}
function _ePosPath(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Path\'"));
e.push(_eH());
e.push(_eS());
e.push("var prt=thisLayer.parent; var ap=prt?prt.transform.anchorPoint.value:[0,0,0];");
e.push("var apx=ap[0], apy=ap[1], apz=(ap.length>2)?ap[2]:0;");
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var rnd=gv(\"Random Offset\"); var seed=gv(\"Random Seed\");");
e.push(_ePathMath());
e.push("var spread = gv(\"Path Spread\") / 100;");
e.push("var prog = gv(\"Path Progress\") / 100;");
e.push("var trimS = gv(\"Trim Start\") / 100;");
e.push("var trimE = gv(\"Trim End\") / 100;");
e.push("var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("var rawP = (i / div) * spread + prog;");
e.push("var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("var tFinal = trimS + tWrap * (trimE - trimS);");
e.push("var pt = getPt(tFinal);");
e.push("var x = pt[0]; var y = pt[1];");
e.push("var zD = gv(\"Z Depth\"); var zA = Math.round(gv(\"Z Anchor\")) - 1;");
e.push("var z = (i - zA) * zD;");
e.push("x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd;");
e.push("y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd;");
e.push("z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("value+[x, y, z];");
return e.join("\r");
}
function _eOriPath(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Path\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("function rx(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]; }");
e.push("function ry(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]; }");
e.push("function rz(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]; }");
e.push("var d2r = Math.PI / 180;");
e.push("var r2d = 180 / Math.PI;");
e.push("var ori=1; try{ ori = gv(\"Orientation\"); }catch(e){ try{ ori = gv(\"Face Direction\"); }catch(e2){} }");
e.push("var bX = [1,0,0]; var bY = [0,1,0]; var bZ = [0,0,1];");
e.push("if(ori == 2){");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0], eTime) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0], eTime) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1], eTime) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX, eTime); var lY = prt.fromWorldVec(cY, eTime); var lZ = prt.fromWorldVec(cZ, eTime);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  bX = lX; bY = lY; bZ = lZ;");
e.push("} else if(ori == 3){");
e.push(_ePathMath());
e.push("  var spread = gv(\"Path Spread\") / 100; var prog = gv(\"Path Progress\") / 100;");
e.push("  var trimS = gv(\"Trim Start\") / 100; var trimE = gv(\"Trim End\") / 100;");
e.push("  var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("  var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("  var rawP = (i / div) * spread + prog;");
e.push("  var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("  if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("  var pt1 = getPt(trimS + tWrap * (trimE - trimS));");
e.push("  var rawPNext = rawP + 0.001;");
e.push("  var tNextWrap = rawPNext % 1.0; if(tNextWrap < 0) tNextWrap += 1.0;");
e.push("  if (tNextWrap === 0 && rawPNext !== 0 && !isClosed) tNextWrap = 1.0;");
e.push("  var pt2 = getPt(trimS + tNextWrap * (trimE - trimS));");
e.push("  if(pt1[0]===pt2[0] && pt1[1]===pt2[1]) {");
e.push("    var rawPPrev = rawP - 0.001;");
e.push("    var tPrevWrap = rawPPrev % 1.0; if(tPrevWrap < 0) tPrevWrap += 1.0;");
e.push("    if (tPrevWrap === 0 && rawPPrev !== 0 && !isClosed) tPrevWrap = 1.0;");
e.push("    pt1 = getPt(trimS + tPrevWrap * (trimE - trimS));");
e.push("  }");
e.push("  var dx = pt2[0] - pt1[0]; var dy = pt2[1] - pt1[1];");
e.push("  var ang = Math.atan2(dy, dx);");
e.push("  var c = Math.cos(ang), s = Math.sin(ang);");
e.push("  bX = [c, s, 0]; bY = [-s, c, 0]; bZ = [0, 0, 1];");
e.push("} else if(ori == 4){");
e.push("  var p = transform.position;");
e.push("  var ang = Math.atan2(p[1], p[0]) + Math.PI/2;");
e.push("  var c = Math.cos(ang), s = Math.sin(ang);");
e.push("  bX = [c, s, 0]; bY = [-s, c, 0]; bZ = [0, 0, 1];");
e.push("}");
e.push("var tX = gv(\'Twist X\'); var tY = gv(\'Twist Y\'); var tZ = gv(\'Twist Z\');");
e.push("var stag = gv(\'Stagger\');");
e.push("var sAx = gv(\'Stagger Axis\'); if(sAx === 0) sAx = 1;");
e.push("var step = (N > 1) ? (i / (N - 1)) : 0;");
e.push("var actX = (sAx===1 || sAx===2 || sAx===5 || sAx===6) ? 1 : 0;");
e.push("var actY = (sAx===1 || sAx===3 || sAx===5 || sAx===7) ? 1 : 0;");
e.push("var actZ = (sAx===1 || sAx===4 || sAx===6 || sAx===7) ? 1 : 0;");
e.push("var finX = (tX + (stag * actX * step)) * d2r;");
e.push("var finY = (tY + (stag * actY * step)) * d2r;");
e.push("var finZ = (tZ + (stag * actZ * step)) * d2r;");
e.push("var vX = [1,0,0]; var vY = [0,1,0]; var vZ = [0,0,1];");
e.push("vX = rz(ry(rx(vX, finX), finY), finZ);");
e.push("vY = rz(ry(rx(vY, finX), finY), finZ);");
e.push("vZ = rz(ry(rx(vZ, finX), finY), finZ);");
e.push("var fX = [ bX[0]*vX[0] + bY[0]*vX[1] + bZ[0]*vX[2], bX[1]*vX[0] + bY[1]*vX[1] + bZ[1]*vX[2], bX[2]*vX[0] + bY[2]*vX[1] + bZ[2]*vX[2] ];");
e.push("var fY = [ bX[0]*vY[0] + bY[0]*vY[1] + bZ[0]*vY[2], bX[1]*vY[0] + bY[1]*vY[1] + bZ[1]*vY[2], bX[2]*vY[0] + bY[2]*vY[1] + bZ[2]*vY[2] ];");
e.push("var fZ = [ bX[0]*vZ[0] + bY[0]*vZ[1] + bZ[0]*vZ[2], bX[1]*vZ[0] + bY[1]*vZ[1] + bZ[1]*vZ[2], bX[2]*vZ[0] + bY[2]*vZ[1] + bZ[2]*vZ[2] ];");
e.push("var yaw = Math.asin(Math.max(-1, Math.min(1, fZ[0])));");
e.push("var pitch, roll;");
e.push("if (Math.abs(fZ[0]) < 0.99999) {");
e.push("  pitch = Math.atan2(-fZ[1], fZ[2]);");
e.push("  roll = Math.atan2(-fY[0], fX[0]);");
e.push("} else {");
e.push("  pitch = Math.atan2(fY[2], fY[1]);");
e.push("  roll = 0;");
e.push("}");
e.push("var res = value + [pitch * r2d, yaw * r2d, roll * r2d];");
e.push("res;");
return e.join("\r");
}
function _eSclPath(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Path\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var sf=gv(\"Scale Front\"); var sb=gv(\"Scale Back\");");
e.push("if(sf!=0||sb!=0){");
e.push("  var sByPos=0;try{sByPos=gv(\"Scale by Position\")}catch(e){}");
e.push("  var t=0;");
e.push("  if(sByPos >= 2){");
e.push(_ePathMath());
e.push("  }");
e.push("  if(sByPos<2){ t=(N>1)?i/(N-1):0; }else if(sByPos==2){");
e.push("    var sDir=0;try{sDir=(gv(\"Linear Direction\")+90)*Math.PI/180}catch(e){try{sDir=(gv(\"Scale Direction\")+90)*Math.PI/180}catch(e2){}}");
e.push("    var falloff=50;try{falloff=gv(\"Scale Falloff\")}catch(e){}");
e.push("    try{");
e.push("      var spread=gv(\"Path Spread\")/100;var prog=gv(\"Path Progress\")/100;");
e.push("      var trimS=gv(\"Trim Start\")/100; var trimE=gv(\"Trim End\")/100;");
e.push("      var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("      var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("      var rawP=(i/div)*spread + prog;");
e.push("      var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("      if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("      var tFinal = trimS + tWrap * (trimE - trimS);");
e.push("      var pt = getPt(tFinal);");
e.push("      var proj = pt[0]*Math.cos(sDir) + pt[1]*Math.sin(sDir);");
e.push("      var sX = gv(\"Scale X\"); var sY = gv(\"Scale Y\");");
e.push("      var maxProj = Math.sqrt(sX*sX*Math.pow(Math.cos(sDir),2) + sY*sY*Math.pow(Math.sin(sDir),2));");
e.push("      if(maxProj === 0) maxProj = 1;");
e.push("      var v = (proj / maxProj + 1) / 2;");
e.push("      var F = Math.max(0, Math.min(100, falloff)) / 100;");
e.push("      var start_v, end_v;");
e.push("      if (F <= 0.01) { start_v = 0.99; end_v = 1.0; }");
e.push("      else if (F >= 0.99) { start_v = -0.1; end_v = 0.0; }");
e.push("      else if (F < 0.5) { start_v = 1.0 - (F * 2.0); end_v = 1.0; }");
e.push("      else { start_v = 0.0; end_v = 1.0 - ((F - 0.5) * 2.0); }");
e.push("      t = (v - start_v) / (end_v - start_v);");
e.push("    }catch(e){ t=0; }");
e.push("  }else if(sByPos==3){");
e.push("    var getRippleAmt = function() {");
e.push(_eRippleMath(3));
e.push("    };");
e.push("    t = 1.0 - getRippleAmt();");
e.push("  }");
e.push("  if(t<0)t=0;if(t>1)t=1;");
e.push("  t = t * t * (3 - 2 * t);");
e.push("  var fFx=(1-t)*sf/100;var bFx=t*sb/100;");
e.push("  var m=1+fFx+bFx;if(m<0)m=0;value*m;");
e.push("}else{value;}");
return e.join("\r");
}
function _ePosSphere(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Spherical\'"));
e.push(_eH());
e.push(_eS());
e.push("var prt=thisLayer.parent; var ap=prt?prt.transform.anchorPoint.value:[0,0,0];");
e.push("var apx=ap[0], apy=ap[1], apz=(ap.length>2)?ap[2]:0;");
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var rnd=gv(\"Random Offset\"); var seed=gv(\"Random Seed\");");
e.push("var R=gv(\"Radius\");");
e.push("var phi = Math.acos(1 - 2 * (i + 0.5) / N);");
e.push("var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("var px = R * Math.cos(theta) * Math.sin(phi);");
e.push("var py = R * Math.cos(phi);");
e.push("var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push(_eSlerp());
e.push("var x = px*R11 + py*R12 + pz*R13;");
e.push("var y = px*R21 + py*R22 + pz*R23;");
e.push("var z = px*R31 + py*R32 + pz*R33;");
e.push("x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd;");
e.push("y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd;");
e.push("z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("value+[x, y, z];");
return e.join("\r");
}
function _eOriSphere(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Spherical\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("function rx(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]; }");
e.push("function ry(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]; }");
e.push("function rz(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]; }");
e.push("var d2r = Math.PI / 180;");
e.push("var r2d = 180 / Math.PI;");
e.push("var ori=1; try{ ori = gv(\'Orientation\'); }catch(e){ try{ ori = gv(\'Face Direction\'); }catch(e2){} }");
e.push("var bX = [1,0,0]; var bY = [0,1,0]; var bZ = [0,0,1];");
e.push("if(ori == 3){");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0], eTime) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0], eTime) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1], eTime) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX, eTime); var lY = prt.fromWorldVec(cY, eTime); var lZ = prt.fromWorldVec(cZ, eTime);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  bX = lX; bY = lY; bZ = lZ;");
e.push("} else {");
e.push("  var p = transform.position;");
e.push("  var dir = (ori == 2) ? [-p[0], -p[1], -p[2]] : [p[0], p[1], p[2]];");
e.push("  var len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);");
e.push("  var z = (len > 0) ? [dir[0]/len, dir[1]/len, dir[2]/len] : [0,0,1];");
e.push("  var up = (Math.abs(z[1]) > 0.999) ? [0,0,1] : [0,1,0];");
e.push("  var x = [up[1]*z[2] - up[2]*z[1], up[2]*z[0] - up[0]*z[2], up[0]*z[1] - up[1]*z[0]];");
e.push("  var lenX = Math.sqrt(x[0]*x[0] + x[1]*x[1] + x[2]*x[2]);");
e.push("  if (lenX > 0) { x[0]/=lenX; x[1]/=lenX; x[2]/=lenX; } else { x = [1,0,0]; }");
e.push("  var y = [z[1]*x[2] - z[2]*x[1], z[2]*x[0] - z[0]*x[2], z[0]*x[1] - z[1]*x[0]];");
e.push("  bX = x; bY = y; bZ = z;");
e.push("}");
e.push("var tX = gv(\'Twist X\'); var tY = gv(\'Twist Y\'); var tZ = gv(\'Twist Z\');");
e.push("var stag = gv(\'Stagger\');");
e.push("var sAx = gv(\'Stagger Axis\'); if(sAx === 0) sAx = 1;");
e.push("var step = (N > 1) ? (i / (N - 1)) : 0;");
e.push("var actX = (sAx===1 || sAx===2 || sAx===5 || sAx===6) ? 1 : 0;");
e.push("var actY = (sAx===1 || sAx===3 || sAx===5 || sAx===7) ? 1 : 0;");
e.push("var actZ = (sAx===1 || sAx===4 || sAx===6 || sAx===7) ? 1 : 0;");
e.push("var finX = (tX + (stag * actX * step)) * d2r;");
e.push("var finY = (tY + (stag * actY * step)) * d2r;");
e.push("var finZ = (tZ + (stag * actZ * step)) * d2r;");
e.push("var vX = [1,0,0]; var vY = [0,1,0]; var vZ = [0,0,1];");
e.push("vX = rz(ry(rx(vX, finX), finY), finZ);");
e.push("vY = rz(ry(rx(vY, finX), finY), finZ);");
e.push("vZ = rz(ry(rx(vZ, finX), finY), finZ);");
e.push("var fX = [ bX[0]*vX[0] + bY[0]*vX[1] + bZ[0]*vX[2], bX[1]*vX[0] + bY[1]*vX[1] + bZ[1]*vX[2], bX[2]*vX[0] + bY[2]*vX[1] + bZ[2]*vX[2] ];");
e.push("var fY = [ bX[0]*vY[0] + bY[0]*vY[1] + bZ[0]*vY[2], bX[1]*vY[0] + bY[1]*vY[1] + bZ[1]*vY[2], bX[2]*vY[0] + bY[2]*vY[1] + bZ[2]*vY[2] ];");
e.push("var fZ = [ bX[0]*vZ[0] + bY[0]*vZ[1] + bZ[0]*vZ[2], bX[1]*vZ[0] + bY[1]*vZ[1] + bZ[1]*vZ[2], bX[2]*vZ[0] + bY[2]*vZ[1] + bZ[2]*vZ[2] ];");
e.push("var yaw = Math.asin(Math.max(-1, Math.min(1, fZ[0])));");
e.push("var pitch, roll;");
e.push("if (Math.abs(fZ[0]) < 0.99999) {");
e.push("  pitch = Math.atan2(-fZ[1], fZ[2]);");
e.push("  roll = Math.atan2(-fY[0], fX[0]);");
e.push("} else {");
e.push("  pitch = Math.atan2(fY[2], fY[1]);");
e.push("  roll = 0;");
e.push("}");
e.push("var res = value + [pitch * r2d, yaw * r2d, roll * r2d];");
e.push("res;");
return e.join("\r");
}
function _eSclSphere(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push(_eTimeOffset("\'Grid Builder Spherical\'"));
e.push(_eH());
e.push(_eS());
e.push("var N=" + tot + ";");
e.push("var i=shuffleIdx(" + idx + ",N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var sf=gv(\"Scale Front\"); var sb=gv(\"Scale Back\");");
e.push("if(sf!=0||sb!=0){");
e.push("var sByPos=0;try{sByPos=gv(\"Scale by Position\")}catch(e){}");
e.push("var t=0;");
e.push("if(sByPos<1){t=(N>1)?i/(N-1):0;}else{");
e.push("  var sDir=0;");
e.push("  try{sDir=gv(\"Yaw\")}catch(e){}");
e.push("  sDir = (sDir + 90) * Math.PI / 180;");
e.push("  var sDirZ=0;");
e.push("  try{sDirZ=gv(\"Pitch\")}catch(e){}");
e.push("  sDirZ = sDirZ * Math.PI / 180;");
e.push("  var falloff=50;try{falloff=gv(\"Scale Falloff\")}catch(e){}");
e.push("  var R=gv(\"Radius\");");
e.push("  var phi = Math.acos(1 - 2 * (i + 0.5) / N);");
e.push("  var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("  var px = R * Math.cos(theta) * Math.sin(phi);");
e.push("  var py = R * Math.cos(phi);");
e.push("  var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push(_eSlerp());
e.push("  var rotX = px*R11 + py*R12 + pz*R13;");
e.push("  var rotY = px*R21 + py*R22 + pz*R23;");
e.push("  var rotZ = px*R31 + py*R32 + pz*R33;");
e.push("  var vX = Math.cos(sDir) * Math.cos(sDirZ);");
e.push("  var vY = Math.sin(sDir) * Math.cos(sDirZ);");
e.push("  var vZ = Math.sin(sDirZ);");
e.push("  var proj = rotX*vX + rotY*vY + rotZ*vZ;");
e.push("  var maxProj = R > 0 ? R : 1;");
e.push("  var v = (proj / maxProj + 1) / 2;");
e.push("  var F = Math.max(0, Math.min(100, falloff)) / 100;");
e.push("  var start_v, end_v;");
e.push("  if (F <= 0.01) { start_v = 0.99; end_v = 1.0; }");
e.push("  else if (F >= 0.99) { start_v = -0.1; end_v = 0.0; }");
e.push("  else if (F < 0.5) { start_v = 1.0 - (F * 2.0); end_v = 1.0; }");
e.push("  else { start_v = 0.0; end_v = 1.0 - ((F - 0.5) * 2.0); }");
e.push("  t = (v - start_v) / (end_v - start_v);");
e.push("}");
e.push("if(t<0)t=0;if(t>1)t=1;");
e.push("t = t * t * (3 - 2 * t);");
e.push("var fFx=(1-t)*sf/100;var bFx=t*sb/100;");
e.push("var m=1+fFx+bFx;if(m<0)m=0;value*m;}else{value;}");
return e.join("\r");
}
function _ePosMorph(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("var N = " + tot + "; var i = " + idx + ";");
e.push("var master = \'Grid Builder Morph\';");
e.push(_eTimeOffset("master"));
e.push(_eH());
e.push("function shuffleIdx(o,N){var sh=Math.round(gv(master,\'Shuffle\'));if(sh<=0||N<=1)return o;var p=[];for(var a=0;a<N;a++)p[a]=a;for(var a=N-1;a>0;a--){var b=Math.floor(_h(sh*1e4+a)*(a+1));if(b>a)b=a;var t=p[a];p[a]=p[b];p[b]=t;}return p[o];}");
e.push("i = shuffleIdx(i, N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var fProp = null; try{ fProp = C.effect(\'Grid Builder Spherical Morph\')(\'Focus Target\'); }catch(e){}");
e.push(_eSlerpMorph());
e.push(_ePathMathMorph());
e.push("var mProp = C.effect(master)(\'Transition\');");
e.push("var valA = 1, valB = 1, tF = 0;");
e.push("if (mProp.numKeys > 1) {");
e.push("  var n = 0; if (mProp.numKeys > 0) { n = mProp.nearestKey(eTime).index; if (mProp.key(n).time > eTime) n--; }");
e.push("  if (n > 0 && n < mProp.numKeys) {");
e.push("    valA = mProp.key(n).value; valB = mProp.key(n+1).value;");
e.push("    var mVal = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime);");
e.push("    tF = (valA === valB) ? 0 : (mVal - valA) / (valB - valA);");
e.push("  } else if (n === 0) { valA = mProp.key(1).value; valB = valA; }");
e.push("  else { valA = mProp.key(mProp.numKeys).value; valB = valA; }");
e.push("} else { valA = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime); valB = valA; }");
e.push("var map = [0, 1, 3, 2];");
e.push("var sIdxA = Math.max(0, Math.min(3, Math.round(valA) - 1));");
e.push("var sIdxB = Math.max(0, Math.min(3, Math.round(valB) - 1));");
e.push("var modeA = map[sIdxA];");
e.push("var modeB = map[sIdxB];");
e.push("function getGridPos(mFlag) {");
e.push("  var x=0, y=0, z=0, fx;");
e.push("  var gRot = gv(master,\'Grid Rotation\')*Math.PI/180;");
e.push("  if (mFlag === 0) {");
e.push("    fx = \'Grid Builder Rectangular Morph\';");
e.push("    var cols=Math.max(1,Math.round(gv(fx,\'Columns\'))); var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("    var spX=gv(fx,\'Spacing X\'); var spY=gv(fx,\'Spacing Y\');");
e.push("    var c=i%cols; var r=Math.floor(i/cols); var cx2=(cols-1)/2, cy2=(rows-1)/2;");
e.push("    var dx=(c-cx2)*spX, dy=(r-cy2)*spY;");
e.push("    x=dx*Math.cos(gRot)-dy*Math.sin(gRot); y=dx*Math.sin(gRot)+dy*Math.cos(gRot);");
e.push("  } else if (mFlag === 1) {");
e.push("    fx = \'Grid Builder Radial Morph\';");
e.push("    var cols=Math.max(1,Math.round(gv(fx,\'Spread\'))); var rows=Math.ceil(N/cols); if(rows<1) rows=1;");
e.push("    var R=gv(fx,\'Radius\');");
e.push("    var c=i%cols; var angS=(2*Math.PI)/Math.max(1,cols); var a = c * angS + gRot - (Math.PI / 2);");
e.push("    x=Math.cos(a)*R; y=Math.sin(a)*R;");
e.push("  } else if (mFlag === 2) {");
e.push("    fx = \'Grid Builder Spherical Morph\';");
e.push("    var R=gv(fx,\'Radius\'); var phi = Math.acos(1 - 2 * (i + 0.5) / N); var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("    var px = R * Math.cos(theta) * Math.sin(phi); var py = R * Math.cos(phi); var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push("    var sX = px*R11 + py*R12 + pz*R13; var sY = px*R21 + py*R22 + pz*R23; var sZ = px*R31 + py*R32 + pz*R33;");
e.push("    x = sX * Math.cos(gRot) - sY * Math.sin(gRot); y = sX * Math.sin(gRot) + sY * Math.cos(gRot); z = sZ;");
e.push("  } else if (mFlag === 3) {");
e.push("    fx = \'Grid Builder Path Morph\';");
e.push("    var spread = gv(fx,\'Path Spread\') / 100; var prog = gv(fx,\'Path Progress\') / 100;");
e.push("    var trimS = gv(fx,\'Trim Start\') / 100; var trimE = gv(fx,\'Trim End\') / 100;");
e.push("    var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("    var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("    var rawP = (i / div) * spread + prog;");
e.push("    var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("    if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("    var tFinal = trimS + tWrap * (trimE - trimS);");
e.push("    var pt = getPt(tFinal);");
e.push("    x = pt[0]; y = pt[1];");
e.push("  }");
e.push("  if (mFlag !== 2) { var zD=gv(master,\'Z Depth\'); var zA=Math.round(gv(master,\'Z Anchor\'))-1; z=(i-zA)*zD; }");
e.push("  var rnd=gv(master,\'Random Offset\'); var seed=gv(master,\'Random Seed\');");
e.push("  x+=(_h(seed*123.4 + i*3+0.1)-0.5)*rnd; y+=(_h(seed*123.4 + i*3+1.1)-0.5)*rnd; z+=(_h(seed*123.4 + i*3+2.1)-0.5)*rnd;");
e.push("  return [x,y,z];");
e.push("}");
e.push("var posA = getGridPos(modeA);");
e.push("var posB = getGridPos(modeB);");
e.push("value + linear(tF, 0, 1, posA, posB);");
return e.join("\r");
}
function _eOriMorph(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("var N = " + tot + "; var i = " + idx + ";");
e.push("var master = \'Grid Builder Morph\';");
e.push(_eTimeOffset("master"));
e.push(_eH());
e.push("function shuffleIdx(o,N){var sh=Math.round(gv(master,\'Shuffle\'));if(sh<=0||N<=1)return o;var p=[];for(var a=0;a<N;a++)p[a]=a;for(var a=N-1;a>0;a--){var b=Math.floor(_h(sh*1e4+a)*(a+1));if(b>a)b=a;var t=p[a];p[a]=p[b];p[b]=t;}return p[o];}");
e.push("i = shuffleIdx(i, N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push(_ePathMathMorph());
e.push("var mProp = C.effect(master)(\'Transition\');");
e.push("var valA = 1, valB = 1, tF = 0;");
e.push("if (mProp.numKeys > 1) {");
e.push("  var n = 0; if (mProp.numKeys > 0) { n = mProp.nearestKey(eTime).index; if (mProp.key(n).time > eTime) n--; }");
e.push("  if (n > 0 && n < mProp.numKeys) {");
e.push("    valA = mProp.key(n).value; valB = mProp.key(n+1).value;");
e.push("    var mVal = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime);");
e.push("    tF = (valA === valB) ? 0 : (mVal - valA) / (valB - valA);");
e.push("  } else if (n === 0) { valA = mProp.key(1).value; valB = valA; }");
e.push("  else { valA = mProp.key(mProp.numKeys).value; valB = valA; }");
e.push("} else { valA = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime); valB = valA; }");
e.push("var map = [0, 1, 3, 2];");
e.push("var sIdxA = Math.max(0, Math.min(3, Math.round(valA) - 1));");
e.push("var sIdxB = Math.max(0, Math.min(3, Math.round(valB) - 1));");
e.push("var modeA = map[sIdxA];");
e.push("var modeB = map[sIdxB];");
e.push("function rx(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]; }");
e.push("function ry(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]; }");
e.push("function rz(v, a) { var c=Math.cos(a), s=Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]; }");
e.push("function lerpVec(v1, v2, t) { return [v1[0] + (v2[0]-v1[0])*t, v1[1] + (v2[1]-v1[1])*t, v1[2] + (v2[2]-v1[2])*t]; }");
e.push("function normalize(v) { var l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]); return (l>0) ? [v[0]/l, v[1]/l, v[2]/l] : [1,0,0]; }");
e.push("function cross(a, b) { return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]; }");
e.push("var d2r = Math.PI / 180;");
e.push("var r2d = 180 / Math.PI;");
e.push("function getFaceScreenAxes() {");
e.push("  var cam = thisComp.activeCamera;");
e.push("  var cX = cam ? cam.toWorldVec([1,0,0], eTime) : [1,0,0];");
e.push("  var cY = cam ? cam.toWorldVec([0,1,0], eTime) : [0,1,0];");
e.push("  var cZ = cam ? cam.toWorldVec([0,0,1], eTime) : [0,0,1];");
e.push("  var prt = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("  var lX = prt.fromWorldVec(cX, eTime); var lY = prt.fromWorldVec(cY, eTime); var lZ = prt.fromWorldVec(cZ, eTime);");
e.push("  var lenX = Math.sqrt(lX[0]*lX[0] + lX[1]*lX[1] + lX[2]*lX[2]); if(lenX>0){ lX[0]/=lenX; lX[1]/=lenX; lX[2]/=lenX; }");
e.push("  var lenY = Math.sqrt(lY[0]*lY[0] + lY[1]*lY[1] + lY[2]*lY[2]); if(lenY>0){ lY[0]/=lenY; lY[1]/=lenY; lY[2]/=lenY; }");
e.push("  var lenZ = Math.sqrt(lZ[0]*lZ[0] + lZ[1]*lZ[1] + lZ[2]*lZ[2]); if(lenZ>0){ lZ[0]/=lenZ; lZ[1]/=lenZ; lZ[2]/=lenZ; }");
e.push("  return [lX, lY, lZ];");
e.push("}");
e.push("function getGridAxes(mFlag) {");
e.push("  var fx, ori = 1; var p = transform.position;");
e.push("  var bX = [1,0,0], bY = [0,1,0], bZ = [0,0,1];");
e.push("  if (mFlag === 0) { fx = \'Grid Builder Rectangular Morph\'; }");
e.push("  else if (mFlag === 1) { fx = \'Grid Builder Radial Morph\'; }");
e.push("  else if (mFlag === 2) { fx = \'Grid Builder Spherical Morph\'; }");
e.push("  else if (mFlag === 3) { fx = \'Grid Builder Path Morph\'; }");
e.push("  if(mFlag === 2){ try{ ori = Math.round(gv(fx, \'Orientation\')); }catch(e){ try{ ori = Math.round(gv(fx, \'Face Direction\')); }catch(e2){ori=1;} } }");
e.push("  else { try { ori = Math.round(gv(fx, \'Orientation\')); } catch(e){} }");
e.push("  if (mFlag === 0 || mFlag === 1 || mFlag === 3) {");
e.push("    if(ori === 2) return getFaceScreenAxes();");
e.push("    if(ori === 3 && mFlag !== 3) { var ang = Math.atan2(p[1], p[0]) + Math.PI/2; var c = Math.cos(ang), s = Math.sin(ang); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; }");
e.push("    if(ori === 4 && mFlag === 3) { var ang = Math.atan2(p[1], p[0]) + Math.PI/2; var c = Math.cos(ang), s = Math.sin(ang); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; }");
e.push("    if(ori === 3 && mFlag === 3) {");
e.push("      var spread = gv(fx, \'Path Spread\') / 100; var prog = gv(fx, \'Path Progress\') / 100;");
e.push("      var trimS = gv(fx, \'Trim Start\') / 100; var trimE = gv(fx, \'Trim End\') / 100;");
e.push("      var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("      var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("      var rawP = (i / div) * spread + prog; var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("      if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("      var pt1 = getPt(trimS + tWrap * (trimE - trimS));");
e.push("      var rawPNext = rawP + 0.001; var tNextWrap = rawPNext % 1.0; if(tNextWrap < 0) tNextWrap += 1.0;");
e.push("      if (tNextWrap === 0 && rawPNext !== 0 && !isClosed) tNextWrap = 1.0;");
e.push("      var pt2 = getPt(trimS + tNextWrap * (trimE - trimS));");
e.push("      if(pt1[0]===pt2[0] && pt1[1]===pt2[1]) {");
e.push("        var rawPPrev = rawP - 0.001; var tPrevWrap = rawPPrev % 1.0; if(tPrevWrap < 0) tPrevWrap += 1.0;");
e.push("        if (tPrevWrap === 0 && rawPPrev !== 0 && !isClosed) tPrevWrap = 1.0;");
e.push("        pt1 = getPt(trimS + tPrevWrap * (trimE - trimS));");
e.push("      }");
e.push("      var dx = pt2[0] - pt1[0]; var dy = pt2[1] - pt1[1];");
e.push("      var ang = Math.atan2(dy, dx); var c = Math.cos(ang), s = Math.sin(ang);");
e.push("      return [[c, s, 0], [-s, c, 0], [0, 0, 1]];");
e.push("    }");
e.push("    return [bX, bY, bZ];");
e.push("  } else if (mFlag === 2) {");
e.push("    if(ori === 3) return getFaceScreenAxes();");
e.push("    if(ori === 2 || ori === 1) {");
e.push("      var dir = (ori === 2) ? [-p[0], -p[1], -p[2]] : [p[0], p[1], p[2]];");
e.push("      var len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);");
e.push("      var z = (len > 0) ? [dir[0]/len, dir[1]/len, dir[2]/len] : [0,0,1];");
e.push("      var up = (Math.abs(z[1]) > 0.999) ? [0,0,1] : [0,1,0];");
e.push("      var x = [up[1]*z[2] - up[2]*z[1], up[2]*z[0] - up[0]*z[2], up[0]*z[1] - up[1]*z[0]];");
e.push("      var lenX = Math.sqrt(x[0]*x[0] + x[1]*x[1] + x[2]*x[2]);");
e.push("      if (lenX > 0) { x[0]/=lenX; x[1]/=lenX; x[2]/=lenX; } else { x = [1,0,0]; }");
e.push("      var y = [z[1]*x[2] - z[2]*x[1], z[2]*x[0] - z[0]*x[2], z[0]*x[1] - z[1]*x[0]];");
e.push("      return [x, y, z];");
e.push("    }");
e.push("    return [bX, bY, bZ];");
e.push("  }");
e.push("  return [bX, bY, bZ];");
e.push("}");
e.push("var axesA = getGridAxes(modeA);");
e.push("var axesB = getGridAxes(modeB);");
e.push("var iX = lerpVec(axesA[0], axesB[0], tF);");
e.push("var iZ = lerpVec(axesA[2], axesB[2], tF);");
e.push("var bZ = normalize(iZ);");
e.push("var bX = normalize(iX);");
e.push("var bY = cross(bZ, bX);");
e.push("var lY = Math.sqrt(bY[0]*bY[0] + bY[1]*bY[1] + bY[2]*bY[2]);");
e.push("if(lY === 0) { bY = [0,1,0]; bZ = [0,0,1]; bX = [1,0,0]; } else { bY = [bY[0]/lY, bY[1]/lY, bY[2]/lY]; }");
e.push("bX = normalize(cross(bY, bZ));");
e.push("var tX = gv(\'Twist X\'); var tY = gv(\'Twist Y\'); var tZ = gv(\'Twist Z\');");
e.push("var stag = gv(\'Stagger\');");
e.push("var sAx = gv(\'Stagger Axis\'); if(sAx === 0) sAx = 1;");
e.push("var step = (N > 1) ? (i / (N - 1)) : 0;");
e.push("var actX = (sAx===1 || sAx===2 || sAx===5 || sAx===6) ? 1 : 0;");
e.push("var actY = (sAx===1 || sAx===3 || sAx===5 || sAx===7) ? 1 : 0;");
e.push("var actZ = (sAx===1 || sAx===4 || sAx===6 || sAx===7) ? 1 : 0;");
e.push("var finX = (tX + (stag * actX * step)) * d2r;");
e.push("var finY = (tY + (stag * actY * step)) * d2r;");
e.push("var finZ = (tZ + (stag * actZ * step)) * d2r;");
e.push("var vX = [1,0,0]; var vY = [0,1,0]; var vZ = [0,0,1];");
e.push("vX = rz(ry(rx(vX, finX), finY), finZ);");
e.push("vY = rz(ry(rx(vY, finX), finY), finZ);");
e.push("vZ = rz(ry(rx(vZ, finX), finY), finZ);");
e.push("var fX = [ bX[0]*vX[0] + bY[0]*vX[1] + bZ[0]*vX[2], bX[1]*vX[0] + bY[1]*vX[1] + bZ[1]*vX[2], bX[2]*vX[0] + bY[2]*vX[1] + bZ[2]*vX[2] ];");
e.push("var fY = [ bX[0]*vY[0] + bY[0]*vY[1] + bZ[0]*vY[2], bX[1]*vY[0] + bY[1]*vY[1] + bZ[1]*vY[2], bX[2]*vY[0] + bY[2]*vY[1] + bZ[2]*vY[2] ];");
e.push("var fZ = [ bX[0]*vZ[0] + bY[0]*vZ[1] + bZ[0]*vZ[2], bX[1]*vZ[0] + bY[1]*vZ[1] + bZ[1]*vZ[2], bX[2]*vZ[0] + bY[2]*vZ[1] + bZ[2]*vZ[2] ];");
e.push("var yaw = Math.asin(Math.max(-1, Math.min(1, fZ[0])));");
e.push("var pitch, roll;");
e.push("if (Math.abs(fZ[0]) < 0.99999) {");
e.push("  pitch = Math.atan2(-fZ[1], fZ[2]);");
e.push("  roll = Math.atan2(-fY[0], fX[0]);");
e.push("} else {");
e.push("  pitch = Math.atan2(fY[2], fY[1]);");
e.push("  roll = 0;");
e.push("}");
e.push("var res = value + [pitch * r2d, yaw * r2d, roll * r2d];");
e.push("res;");
return e.join("\r");
}
function _eSclMorph(idx, cn, tot) {
var e = [];
e.push("var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;");
e.push("var N = " + tot + "; var i = " + idx + ";");
e.push("var master = \'Grid Builder Morph\';");
e.push(_eTimeOffset("master"));
e.push(_eH());
e.push("function shuffleIdx(o,N){var sh=Math.round(gv(master,\'Shuffle\'));if(sh<=0||N<=1)return o;var p=[];for(var a=0;a<N;a++)p[a]=a;for(var a=N-1;a>0;a--){var b=Math.floor(_h(sh*1e4+a)*(a+1));if(b>a)b=a;var t=p[a];p[a]=p[b];p[b]=t;}return p[o];}");
e.push("i = shuffleIdx(i, N);");
e.push("try { var maxDelayF = C.effect(_fx)(\'Time Offset\').value; var rev = 0; try{ rev = C.effect(_fx)(\'Reverse Time\').value; }catch(e){} var frac = (N>1) ? (i/(N-1)) : 0; if (rev == 1) frac = 1.0 - frac; myDelaySec = frac * (maxDelayF*thisComp.frameDuration); eTime = Math.max(thisComp.displayStartTime, time - myDelaySec); _timeReady = true; } catch(e){}");
e.push("var fProp = null; try{ fProp = C.effect(\'Grid Builder Spherical Morph\')(\'Focus Target\'); }catch(e){}");
e.push("if(!fProp) try{ fProp = C.effect(\'Grid Builder Spherical Morph\')(\'Focus Index\'); }catch(e){}");
e.push(_eSlerpMorph());
e.push(_ePathMathMorph());
e.push("var mProp = C.effect(master)(\'Transition\');");
e.push("var valA = 1, valB = 1, tF = 0;");
e.push("if (mProp.numKeys > 1) {");
e.push("  var n = 0; if (mProp.numKeys > 0) { n = mProp.nearestKey(eTime).index; if (mProp.key(n).time > eTime) n--; }");
e.push("  if (n > 0 && n < mProp.numKeys) {");
e.push("    valA = mProp.key(n).value; valB = mProp.key(n+1).value;");
e.push("    var mVal = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime);");
e.push("    tF = (valA === valB) ? 0 : (mVal - valA) / (valB - valA);");
e.push("  } else if (n === 0) { valA = mProp.key(1).value; valB = valA; }");
e.push("  else { valA = mProp.key(mProp.numKeys).value; valB = valA; }");
e.push("} else { valA = (myDelaySec === 0) ? mProp.value : mProp.valueAtTime(eTime); valB = valA; }");
e.push("var map = [0, 1, 3, 2];");
e.push("var sIdxA = Math.max(0, Math.min(3, Math.round(valA) - 1));");
e.push("var sIdxB = Math.max(0, Math.min(3, Math.round(valB) - 1));");
e.push("var modeA = map[sIdxA];");
e.push("var modeB = map[sIdxB];");
e.push("function getRippleAmt(mFlag) {");
e.push("  var fx = \'\';");
e.push("  if(mFlag===0) fx=\'Grid Builder Rectangular Morph\'; else if(mFlag===1) fx=\'Grid Builder Radial Morph\'; else if(mFlag===2) fx=\'Grid Builder Spherical Morph\'; else if(mFlag===3) fx=\'Grid Builder Path Morph\';");
e.push("  function getLocalGridPos(k) {");
e.push("    if(mFlag===0) {");
e.push("      var c_cols = Math.max(1, gv(fx, \'Columns\')); var c_sx = gv(fx, \'Spacing X\'); var c_sy = gv(fx, \'Spacing Y\');");
e.push("      var row = Math.floor(k / c_cols); var col = k % c_cols; var totalRows = Math.ceil(N / c_cols);");
e.push("      var gw = (c_cols - 1) * c_sx; var gh = (totalRows - 1) * c_sy;");
e.push("      return [(col * c_sx) - (gw / 2), (row * c_sy) - (gh / 2), 0];");
e.push("    } else if(mFlag===1) {");
e.push("      var spr = Math.max(1, gv(fx, \'Spread\')); var rad = gv(fx, \'Radius\');");
e.push("      var ring = Math.floor(k / spr); var idxInRing = k % spr;");
e.push("      var ang = (idxInRing / spr) * Math.PI * 2; var currentRad = rad + (ring * rad);");
e.push("      return [Math.cos(ang) * currentRad, Math.sin(ang) * currentRad, 0];");
e.push("    } else if(mFlag===3) {");
e.push("      var rawP = (k / (N > 1 ? N - 1 : 1)) * (gv(fx, \'Path Spread\')/100) + (gv(fx, \'Path Progress\')/100);");
e.push("      return getPt(rawP);");
e.push("    }");
e.push("    return [0,0,0];");
e.push("  }");
e.push("  var rfName = (mFlag===2) ? \'Focus Target\' : \'Ripple Focus\';");
e.push("  var rfProp = C.effect(fx)(rfName);");
e.push("  var r_valA = 1, r_valB = 1, rtF = 0;");
e.push("  if (rfProp && rfProp.numKeys > 1) {");
e.push("    var rn = 0; if(rfProp.numKeys > 0) { rn = rfProp.nearestKey(eTime).index; if(rfProp.key(rn).time > eTime) rn--; }");
e.push("    if (rn > 0 && n < rfProp.numKeys) {");
e.push("      r_valA = rfProp.key(rn).value; r_valB = rfProp.key(rn+1).value;");
e.push("      var rfVal = (myDelaySec === 0) ? rfProp.value : rfProp.valueAtTime(eTime);");
e.push("      rtF = (r_valA === r_valB) ? 0 : (rfVal - r_valA) / (r_valB - r_valA);");
e.push("    } else if (rn === 0) { r_valA = rfProp.key(1).value; r_valB = r_valA; }");
e.push("    else { r_valA = rfProp.key(rfProp.numKeys).value; r_valB = r_valA; }");
e.push("  } else { r_valA = rfProp ? ((myDelaySec === 0) ? rfProp.value : rfProp.valueAtTime(eTime)) : 1; r_valB = r_valA; }");
e.push("  var idxA = Math.max(0, Math.min(N - 1, Math.round(r_valA) - 1));");
e.push("  var idxB = Math.max(0, Math.min(N - 1, Math.round(r_valB) - 1));");
e.push("  var ptA = getLocalGridPos(idxA); var ptB = getLocalGridPos(idxB);");
e.push("  var targetPt = ptA + (ptB - ptA) * rtF;");
e.push("  var myPt = getLocalGridPos(i); var d = length(myPt, targetPt); var maxRadius = 1;");
e.push("  if(mFlag===0) {");
e.push("    var _cols = Math.max(1, gv(fx, \'Columns\')); var _rows = Math.ceil(N / _cols);");
e.push("    var _w = (_cols - 1) * gv(fx, \'Spacing X\'); var _h = (_rows - 1) * gv(fx, \'Spacing Y\');");
e.push("    maxRadius = length([_w/2, _h/2, 0], [0,0,0]);");
e.push("  } else if(mFlag===1) {");
e.push("    var _spr = Math.max(1, gv(fx, \'Spread\')); var _rad = gv(fx, \'Radius\');");
e.push("    var maxRing = Math.floor((N - 1) / _spr); maxRadius = _rad + (maxRing * _rad);");
e.push("  } else if(mFlag===3) {");
e.push("    maxRadius = length([gv(fx, \'Scale X\'), gv(fx, \'Scale Y\')], [0,0]);");
e.push("  }");
e.push("  var maxD = Math.max(0.001, (gv(master, \'Scale Falloff\') / 100) * (maxRadius * 2));");
e.push("  var amt = 1 - Math.min(1, Math.max(0, d / maxD));");
e.push("  return amt * amt * (3 - 2 * amt);");
e.push("}");
e.push("function getGridScl(mFlag) {");
e.push("  var fx = \'\';");
e.push("  if(mFlag===0) fx=\'Grid Builder Rectangular Morph\'; else if(mFlag===1) fx=\'Grid Builder Radial Morph\'; else if(mFlag===2) fx=\'Grid Builder Spherical Morph\'; else if(mFlag===3) fx=\'Grid Builder Path Morph\';");
e.push("  var sf = gv(master, \'Scale Front\'); var sb = gv(master, \'Scale Back\');");
e.push("  if(sf===0 && sb===0) return 1;");
e.push("  var sByPos = gv(fx, \'Scale by Position\');");
e.push("  var t = 0;");
e.push("  if(mFlag===0 || mFlag===3) {");
e.push("    if(sByPos < 2) { t = (N>1) ? i/(N-1) : 0; } else if(sByPos === 2) {");
e.push("      var sDir = (gv(fx, \'Linear Direction\') + 90) * Math.PI / 180;");
e.push("      var falloff = gv(master, \'Scale Falloff\');");
e.push("      if(mFlag===0) {");
e.push("        var cols = Math.max(1, Math.round(gv(fx, \'Columns\'))); var rows = Math.ceil(N/cols);");
e.push("        var spX = gv(fx, \'Spacing X\'); var spY = gv(fx, \'Spacing Y\'); var gRot = gv(master, \'Grid Rotation\') * Math.PI / 180;");
e.push("        var cx2 = (cols-1)/2, cy2 = (rows-1)/2;");
e.push("        var dx = (i%cols-cx2)*spX, dy = (Math.floor(i/cols)-cy2)*spY;");
e.push("        var wx = dx*Math.cos(gRot)-dy*Math.sin(gRot); var wy = dx*Math.sin(gRot)+dy*Math.cos(gRot);");
e.push("        var proj = wx*Math.cos(sDir)+wy*Math.sin(sDir);");
e.push("        var maxProj = Math.abs(cx2*spX*Math.cos(sDir-gRot)) + Math.abs(cy2*spY*Math.sin(sDir-gRot));");
e.push("        if(maxProj === 0) maxProj = 1;");
e.push("        var v = (proj / maxProj + 1) / 2;");
e.push("        var W = Math.max(0.01, (falloff / 100) * 2.0);");
e.push("        var start_v = 1.0 - W; t = (v - start_v) / W;");
e.push("      } else {");
e.push("        var spread = gv(fx, \'Path Spread\') / 100; var prog = gv(fx, \'Path Progress\') / 100;");
e.push("        var trimS = gv(fx, \'Trim Start\') / 100; var trimE = gv(fx, \'Trim End\') / 100;");
e.push("        var isClosed = true; if (shp == 1) { try { isClosed = C.mask(1).maskPath.isClosed(); } catch(e){} }");
e.push("        var div = isClosed ? N : (N>1 ? N-1 : 1);");
e.push("        var rawP = (i / div) * spread + prog; var tWrap = rawP % 1.0; if(tWrap < 0) tWrap += 1.0;");
e.push("        if (tWrap === 0 && rawP !== 0 && !isClosed) tWrap = 1.0;");
e.push("        var pt = getPt(trimS + tWrap * (trimE - trimS));");
e.push("        var proj = pt[0]*Math.cos(sDir) + pt[1]*Math.sin(sDir);");
e.push("        var sX = gv(fx, \'Scale X\'); var sY = gv(fx, \'Scale Y\');");
e.push("        var maxProj = Math.sqrt(sX*sX*Math.pow(Math.cos(sDir),2) + sY*sY*Math.pow(Math.sin(sDir),2));");
e.push("        if(maxProj === 0) maxProj = 1;");
e.push("        var v = (proj / maxProj + 1) / 2;");
e.push("        var F = Math.max(0, Math.min(100, falloff)) / 100;");
e.push("        var start_v, end_v;");
e.push("        if (F <= 0.01) { start_v = 0.99; end_v = 1.0; } else if (F >= 0.99) { start_v = -0.1; end_v = 0.0; }");
e.push("        else if (F < 0.5) { start_v = 1.0 - (F * 2.0); end_v = 1.0; } else { start_v = 0.0; end_v = 1.0 - ((F - 0.5) * 2.0); }");
e.push("        t = (v - start_v) / (end_v - start_v);");
e.push("      }");
e.push("    } else if(sByPos === 3) {");
e.push("      t = 1.0 - getRippleAmt(mFlag);");
e.push("    }");
e.push("    if(t<0)t=0; if(t>1)t=1;");
e.push("    if(mFlag===0) { t = t * t * t * (t * (t * 6 - 15) + 10); } else { t = t * t * (3 - 2 * t); }");
e.push("  } else if(mFlag===1 || mFlag===2) {");
e.push("    if(sByPos < 1) { t = (N>1) ? i/(N-1) : 0; } else {");
e.push("      var falloff = gv(master, \'Scale Falloff\'); var sDir, proj, maxProj;");
e.push("      if(mFlag===1) {");
e.push("        sDir = (gv(fx, \'Scale Direction\') + 90) * Math.PI / 180;");
e.push("        var cols = Math.max(1, Math.round(gv(fx, \'Spread\')));");
e.push("        var c = i%cols; var gRot = gv(master, \'Grid Rotation\') * Math.PI / 180;");
e.push("        var R = gv(fx, \'Radius\'); var angS = (2*Math.PI)/Math.max(1,cols);");
e.push("        var a = c*angS+gRot-(Math.PI / 2);");
e.push("        var wx = Math.cos(a)*R; var wy = Math.sin(a)*R;");
e.push("        proj = wx*Math.cos(sDir) + wy*Math.sin(sDir); maxProj = R > 0 ? R : 1;");
e.push("      } else {");
e.push("        sDir = (gv(fx, \'Yaw\') + 90) * Math.PI / 180; var sDirZ = gv(fx, \'Pitch\') * Math.PI / 180;");
e.push("        var R = gv(fx, \'Radius\');");
e.push("        var phi = Math.acos(1 - 2 * (i + 0.5) / N); var theta = Math.PI * (1 + Math.sqrt(5)) * i;");
e.push("        var px = R * Math.cos(theta) * Math.sin(phi); var py = R * Math.cos(phi); var pz = R * Math.sin(theta) * Math.sin(phi);");
e.push("        var sX = px*R11 + py*R12 + pz*R13; var sY = px*R21 + py*R22 + pz*R23; var sZ = px*R31 + py*R32 + pz*R33;");
e.push("        var gRot = gv(master, \'Grid Rotation\') * Math.PI / 180;");
e.push("        var rotX = sX * Math.cos(gRot) - sY * Math.sin(gRot); var rotY = sX * Math.sin(gRot) + sY * Math.cos(gRot); var rotZ = sZ;");
e.push("        var vX = Math.cos(sDir) * Math.cos(sDirZ); var vY = Math.sin(sDir) * Math.cos(sDirZ); var vZ = Math.sin(sDirZ);");
e.push("        proj = rotX*vX + rotY*vY + rotZ*vZ; maxProj = R > 0 ? R : 1;");
e.push("      }");
e.push("      var v = (proj / maxProj + 1) / 2;");
e.push("      var F = Math.max(0, Math.min(100, falloff)) / 100;");
e.push("      var start_v, end_v;");
e.push("      if (F <= 0.01) { start_v = 0.99; end_v = 1.0; } else if (F >= 0.99) { start_v = -0.1; end_v = 0.0; }");
e.push("      else if (F < 0.5) { start_v = 1.0 - (F * 2.0); end_v = 1.0; } else { start_v = 0.0; end_v = 1.0 - ((F - 0.5) * 2.0); }");
e.push("      t = (v - start_v) / (end_v - start_v);");
e.push("    }");
e.push("    if(t<0)t=0; if(t>1)t=1;");
e.push("    t = t * t * (3 - 2 * t);");
e.push("  }");
e.push("  var fFx = (1-t)*sf/100; var bFx = t*sb/100;");
e.push("  var m = 1 + fFx + bFx; if(m<0)m=0; return m;");
e.push("}");
e.push("var sclA = getGridScl(modeA);");
e.push("var sclB = getGridScl(modeB);");
e.push("var finalM = linear(tF, 0, 1, sclA, sclB);");
e.push("value * finalM;");
return e.join("\r");
}
function _expr(lyr, idx, cn, gm, tot) {
lyr.threeDLayer = true;
var tf = lyr.property("ADBE Transform Group");
var posProp = tf.property("ADBE Position");
if (gm === 0) { 
posExpr = _ePosRect(idx, cn, tot);
oriExpr = _eOriRect(idx, cn, tot);
sclExpr = _eSclRect(idx, cn, tot);
}
else if (gm === 1) {
posExpr = _ePosRad(idx, cn, tot);
oriExpr = _eOriRad(idx, cn, tot);
sclExpr = _eSclRad(idx, cn, tot);
}
else if (gm === 3) {
posExpr = _ePosPath(idx, cn, tot);
oriExpr = _eOriPath(idx, cn, tot);
sclExpr = _eSclPath(idx, cn, tot);
}
else if (gm === 2) {
posExpr = _ePosSphere(idx, cn, tot);
oriExpr = _eOriSphere(idx, cn, tot);
sclExpr = _eSclSphere(idx, cn, tot);
}
else {
if (gm === 4) { 
posExpr = _ePosMorph(idx, cn, tot);
oriExpr = _eOriMorph(idx, cn, tot);
sclExpr = _eSclMorph(idx, cn, tot);
}
}
var comp = lyr.containingComp;
posExpr = posExpr.replace("value+[x, y, z];", "var baseGridVal = value+[x, y, z];");
posExpr = posExpr.replace("value + linear(tF, 0, 1, posA, posB);", "var baseGridVal = value + linear(tF, 0, 1, posA, posB);");
posExpr += "\r" + _buildProxInjection(cn, comp, "Position");
oriExpr = oriExpr.replace(/res;$/, "var baseGridVal = res;");
oriExpr += "\r" + _buildProxInjection(cn, comp, "Orientation");
sclExpr = sclExpr.replace("value*m;}else{value;}", "var baseGridVal = value*m;}else{var baseGridVal = value;}");
sclExpr = sclExpr.replace("value*m;\r}else{value;}", "var baseGridVal = value*m;\r}else{var baseGridVal = value;}");
sclExpr = sclExpr.replace("value*m;\n}else{value;}", "var baseGridVal = value*m;\n}else{var baseGridVal = value;}");
sclExpr = sclExpr.replace("value * finalM;", "var baseGridVal = value * finalM;");
sclExpr += "\r" + _buildProxInjection(cn, comp, "Scale");
if (gm === 4) { 
opExpr = "var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;\rfunction gv(fx, n){ try{ var p = C.effect(fx)(n); try{var d=p.value;}catch(e2){p=p(n);} return p.value; }catch(e){ return 0; } }\rvar o = 100; try { o = gv(\'Grid Builder Morph\', \'Global Opacity\'); } catch(e) {}\rvalue * (o / 100);";
}
else {
opExpr = "var C = thisLayer.hasParent ? thisLayer.parent : thisLayer;\r" + _ev() + "\rvar o=100;try{o=gv(\"Global Opacity\");}catch(e){}\rvalue * (o / 100);";
}
opExpr = opExpr.replace("value * (o / 100);", "var baseGridVal = value * (o / 100);");
opExpr += "\r" + _buildProxInjection(cn, comp, "Opacity");
try {
if (posProp.dimensionsSeparated) { 
posProp.dimensionsSeparated = false;
}
} catch (e) {
}
posProp.expression = posExpr;
tf.property("ADBE Orientation").expression = oriExpr;
tf.property("ADBE Scale").expression = sclExpr;
tf.property("ADBE Opacity").expression = opExpr;
}
function _centerAP(layer, time) {
try {
var apProp = layer.property("ADBE Transform Group").property("ADBE Anchor Point");
var cAP = apProp.value;
var isModel = false;
try {
if ((layer.matchName) && (layer.matchName.indexOf("Model") > -1)) { 
isModel = true;
}
if (((layer.source) && (layer.source.mainSource)) && (layer.source.mainSource.file)) { 
var fName = layer.source.mainSource.file.name.toLowerCase();
if (((fName.indexOf(".glb") > -1) || (fName.indexOf(".gltf") > -1)) || (fName.indexOf(".obj") > -1)) { 
isModel = true;
}
}
} catch (err) {
}
if ((((layer.threeDLayer) && (cAP[0] === 0)) && (cAP[1] === 0)) && (cAP[2] === 0)) { 
isModel = true;
}
if (isModel) { 
return;
}
var rect = layer.sourceRectAtTime(time, false);
if ((rect.width === 0) && (rect.height === 0)) { 
return;
}
var x = rect.left + (rect.width / 2);
var y = rect.top + (rect.height / 2);
var z = cAP.length > 2 ? cAP[2] : 0;
if ((Math.abs(cAP[0] - x) > 0.01) || (Math.abs(cAP[1] - y) > 0.01)) { 
apProp.setValue([x, y, z]);
}
} catch (e) {
}
}
function gridCreate(gType, extPath, isTrial) {
var comp = _comp();
if (!comp) { 
alert("Please open a composition first.");
return;
}
var sel = comp.selectedLayers;
if (!sel.length) { 
alert("Please select at least one layer.", "Grid Builder");
return;
}
if ((isTrial) && (sel.length > trialLimit)) { 
alert("GridBuilder Trial is limited to " + trialLimit + " layers per grid. Only the first " + trialLimit + " layers will be processed.");
var choppedSel = [];
for (var i = 0; i < trialLimit; i += 1) { 
choppedSel.push(sel[i]);}
sel = choppedSel;
}
app.beginUndoGroup("Grid Builder - Create");
try {
var src = [];
for (var i = 0; i < sel.length; i += 1) { 
src.push(sel[i]);}
src.sort(function (a, b) {
return a.index - b.index;
});
var cn = _uname(comp, CTRL);
var tot = src.length;
var cols = (gType === 1) || (gType === 3) ? tot : 3;
var ctrl = comp.layers.addNull();
ctrl.name = cn;
ctrl.threeDLayer = true;
ctrl.label = 9;
ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2, 0]);
ctrl.moveToBeginning();
if (gType === 4) { 
var presetName = "GridMorph_V107.ffx";
var ffxFile = new File(extPath + "/src/" + presetName);
if (!ffxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
if (userFile.exists) { 
ffxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxFile = sysFile;
}
}
}
if (ffxFile.exists) { 
var safeFile = new File(ffxFile.fsName);
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
ctrl.selected = true;
ctrl.applyPreset(safeFile);
try {
ctrl.effect("Grid Builder Morph").property("Transition").setValue(1);
ctrl.effect("Grid Builder Rectangular Morph").property("Columns").setValue(cols);
ctrl.effect("Grid Builder Radial Morph").property("Spread").setValue(src.length);
} catch (e) {
}
}
else {
alert("Morph Master Preset missing: " + presetName);
ctrl.remove();
app.endUndoGroup();
return;
}
}
else {
_build(ctrl, comp, gType, cols, 300, 300, 300, tot, extPath);
}
var newOrder = [];
for (var i = 0; i < tot; i += 1) { 
_centerAP(src[i], comp.time);
var tf = src[i].property("ADBE Transform Group");
var posProp = tf.property("ADBE Position");
var originalScale = [100, 100, 100];
try {
originalScale = tf.property("ADBE Scale").value;
} catch (e) {
}
src[i].parent = ctrl;
try {
if (posProp.dimensionsSeparated) { 
posProp.dimensionsSeparated = false;
}
posProp.setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Scale").setValue(originalScale);
} catch (e) {
}
try {
tf.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
newOrder.push(src[i].id);}
var currentReg = _getRegistry(ctrl);
currentReg.layers = newOrder;
_setRegistry(ctrl, currentReg);
for (var i = 0; i < tot; i += 1) { 
_expr(src[i], i, cn, gType, tot);}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
ctrl.selected = true;
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridUpdate(gType, extPath, gridName, isTrial) {
var comp = _comp();
if (!comp) { 
alert("Please open a composition first.");
return;
}
var c = (gridName) && (gridName !== "undefined") ? comp.layer(gridName) : _ctrl(comp);
if (!c) { 
alert("No target grid found. Please select a grid in the panel dropdown.");
return;
}
app.beginUndoGroup("Grid Builder - Update/Repair Mode");
try {
var _findProp = function (parentGroup, propName) {
try {
for (var i = 1; i <= parentGroup.numProperties; i += 1) { 
var p = parentGroup.property(i);
if (((p.name === propName) && (p.propertyType === PropertyType.PROPERTY)) && (p.propertyValueType !== PropertyValueType.NO_VALUE)) { 
return p;
}
if (((p.propertyType === PropertyType.NAMED_GROUP) || (p.propertyType === PropertyType.INDEXED_GROUP)) || (p.propertyValueType === PropertyValueType.NO_VALUE)) { 
var inner = _findProp(p, propName);
if (inner) { 
return inner;
}
}}
} catch (e) {
}
return null;
};
var _val = function (fxObj, pName, def) {
try {
if (!fxObj) { 
return def;
}
var p = _findProp(fxObj, pName);
if (p) { 
return p.value;
}
} catch (e) {
}
return def;
};
var cn = c.name;
var cm = _mode(c);
var rawKids = _kids(comp, c);
var ch = [];
var validIds = [];
for (var k = 0; k < rawKids.length; k += 1) { 
if ((rawKids[k] != null) && (rawKids[k].id !== undefined)) { 
ch.push(rawKids[k]);
validIds.push(rawKids[k].id);
}}
var currentReg = _getRegistry(c);
currentReg.layers = validIds;
_setRegistry(c, currentReg);
var tot = ch.length;
if ((isTrial) && (tot > trialLimit)) { 
alert("Trial Limit Exceeded!\n\nThis grid currently has " + tot + " layers, but the trial only supports " + trialLimit + ".\n\nPlease remove layers or activate a license to update this grid.");
app.endUndoGroup();
return;
}
var mainFx = _getPE(c);
var rVal = _val(mainFx, "Radius", null);
var sxVal = _val(mainFx, "Spacing X", null);
var syVal = _val(mainFx, "Spacing Y", null);
if (rVal === null) { 
rVal = sxVal !== null ? sxVal : 300;
}
if (sxVal === null) { 
sxVal = rVal !== null ? rVal : 300;
}
if (syVal === null) { 
syVal = rVal !== null ? rVal : 300;
}
var oldSbp = _val(mainFx, "Scale by Position", null);
var targetSbpDropdown = 1;
var targetSbpCheckbox = 0;
var currentIsCheckbox = (cm === 1) || (cm === 2);
if (oldSbp !== null) { 
if (currentIsCheckbox) { 
targetSbpDropdown = oldSbp >= 1 ? 2 : 1;
targetSbpCheckbox = oldSbp;
}
else {
targetSbpCheckbox = oldSbp > 1 ? 1 : 0;
targetSbpDropdown = oldSbp;
}
}
var linDirVal = _val(mainFx, "Linear Direction", null);
if (linDirVal === null) { 
linDirVal = _val(mainFx, "Scale Direction", null);
}
if (linDirVal === null) { 
linDirVal = _val(mainFx, "Yaw", 0);
}
var sdzVal = _val(mainFx, "Scale Direction Z", null);
if (sdzVal === null) { 
sdzVal = _val(mainFx, "Pitch", 0);
}
var ripFocVal = _val(mainFx, "Ripple Focus", null);
if (ripFocVal === null) { 
ripFocVal = _val(mainFx, "Focus Target", null);
}
if (ripFocVal === null) { 
ripFocVal = _val(mainFx, "Focus Index", 1);
}
var oriVal = _val(mainFx, "Orientation", null);
if (oriVal === null) { 
var oldFD = _val(mainFx, "Face Direction", null);
if (oldFD !== null) { 
oriVal = oldFD;
}
else {
if (_val(mainFx, "Face Screen", 0) === 1) { 
oriVal = 2;
}
else if (_val(mainFx, "Orient to Center", 0) === 1) {
oriVal = 3;
}
else {
oriVal = 1;
}
}
}
if (oriVal === null) { 
oriVal = 1;
}
var sv = {co: cm === 0 ? _val(mainFx, "Columns", 3) : _val(mainFx, "Spread", 3), fall: _val(mainFx, "Scale Falloff", 50), go: _val(mainFx, "Global Opacity", 100), gr: _val(mainFx, "Grid Rotation", 0), ld: linDirVal, ori: oriVal, p_pts: _val(mainFx, "Polygon Points", 3), p_shp: _val(mainFx, "Shape", 1), p_sx: _val(mainFx, "Scale X", 300), p_sy: _val(mainFx, "Scale Y", 300), p_te: _val(mainFx, "Trim End", 100), p_ts: _val(mainFx, "Trim Start", 0), pp: _val(mainFx, "Path Progress", 0), ps: _val(mainFx, "Path Spread", 100), rad: rVal, rf: ripFocVal, rn: _val(mainFx, "Random Offset", 0), rs: _val(mainFx, "Random Seed", 0), rt: _val(mainFx, "Reverse Time", 0), sb: _val(mainFx, "Scale Back", 0), sbp_cb: targetSbpCheckbox, sbp_dd: targetSbpDropdown, sdz: sdzVal, sf: _val(mainFx, "Scale Front", 0), sh: _val(mainFx, "Shuffle", 0), stg: _val(mainFx, "Stagger", 0), stgAx: _val(mainFx, "Stagger Axis", 1), sx: sxVal, sy: syVal, to: _val(mainFx, "Time Offset", 0), tx: _val(mainFx, "Twist X", 0), ty: _val(mainFx, "Twist Y", 0), tz: _val(mainFx, "Twist Z", 0), za: Math.round(_val(mainFx, "Z Anchor", 1)), zd: _val(mainFx, "Z Depth", 0)};
var targetOri = sv.ori;
if (((gType === 2) && (cm !== 2)) && (sv.ori === 2)) { 
targetOri = 3;
}
if (((gType !== 2) && (cm === 2)) && (sv.ori === 3)) { 
targetOri = 2;
}
if (((gType === 3) && ((cm === 0) || (cm === 1))) && (sv.ori === 3)) { 
targetOri = 4;
}
if ((((gType === 0) || (gType === 1)) && (cm === 3)) && (sv.ori === 4)) { 
targetOri = 3;
}
if ((gType === 2) && ((sv.ori === 4) || ((cm !== 3) && (sv.ori === 3)))) { 
targetOri = 1;
}
if (cm === 4) { 
var _mVal = function (fxName, pName, d) {
try {
return _val(c.effect(fxName), pName, d);
} catch (e) {return d;
}
};
sv.co = _mVal(gType === 1 ? "Grid Builder Radial Morph" : "Grid Builder Rectangular Morph", gType === 1 ? "Spread" : "Columns", 3);
sv.gr = _mVal("Grid Builder Morph", "Grid Rotation", 0);
sv.sx = _mVal("Grid Builder Rectangular Morph", "Spacing X", 300);
sv.sy = _mVal("Grid Builder Rectangular Morph", "Spacing Y", 300);
sv.rad = _mVal(gType === 2 ? "Grid Builder Spherical Morph" : "Grid Builder Radial Morph", "Radius", 300);
sv.zd = _mVal("Grid Builder Morph", "Z Depth", 0);
sv.za = Math.round(_mVal("Grid Builder Morph", "Z Anchor", 1));
sv.p_shp = _mVal("Grid Builder Path Morph", "Shape", 1);
sv.p_sx = _mVal("Grid Builder Path Morph", "Scale X", 300);
sv.p_sy = _mVal("Grid Builder Path Morph", "Scale Y", 300);
sv.p_pts = _mVal("Grid Builder Path Morph", "Polygon Points", 3);
sv.p_ts = _mVal("Grid Builder Path Morph", "Trim Start", 0);
sv.p_te = _mVal("Grid Builder Path Morph", "Trim End", 100);
sv.sf = _mVal("Grid Builder Morph", "Scale Front", 0);
sv.sb = _mVal("Grid Builder Morph", "Scale Back", 0);
sv.fall = _mVal("Grid Builder Morph", "Scale Falloff", 50);
sv.rn = _mVal("Grid Builder Morph", "Random Offset", 0);
sv.rs = _mVal("Grid Builder Morph", "Random Seed", 0);
sv.sh = _mVal("Grid Builder Morph", "Shuffle", 0);
sv.go = _mVal("Grid Builder Morph", "Global Opacity", 100);
sv.pp = _mVal("Grid Builder Path Morph", "Path Progress", 0);
sv.ps = _mVal("Grid Builder Path Morph", "Path Spread", 100);
sv.to = _mVal("Grid Builder Morph", "Time Offset", 0);
sv.rt = _mVal("Grid Builder Morph", "Reverse Time", 0);
sv.tx = _mVal("Grid Builder Morph", "Twist X", 0);
sv.ty = _mVal("Grid Builder Morph", "Twist Y", 0);
sv.tz = _mVal("Grid Builder Morph", "Twist Z", 0);
sv.stg = _mVal("Grid Builder Morph", "Stagger", 0);
sv.stgAx = _mVal("Grid Builder Morph", "Stagger Axis", 1);
if (gType === 0) { 
sv.sbp_dd = _mVal("Grid Builder Rectangular Morph", "Scale by Position", 1);
sv.ld = _mVal("Grid Builder Rectangular Morph", "Linear Direction", 0);
sv.rf = _mVal("Grid Builder Rectangular Morph", "Ripple Focus", 1);
targetOri = _mVal("Grid Builder Rectangular Morph", "Orientation", 1);
}
else if (gType === 1) {
sv.sbp_cb = _mVal("Grid Builder Radial Morph", "Scale by Position", 0);
sv.ld = _mVal("Grid Builder Radial Morph", "Scale Direction", 0);
targetOri = _mVal("Grid Builder Radial Morph", "Orientation", 1);
}
else if (gType === 2) {
sv.sbp_cb = _mVal("Grid Builder Spherical Morph", "Scale by Position", 0);
sv.ld = _mVal("Grid Builder Spherical Morph", "Yaw", 0);
sv.sdz = _mVal("Grid Builder Spherical Morph", "Pitch", 0);
sv.rf = _mVal("Grid Builder Spherical Morph", "Focus Target", 1);
targetOri = _mVal("Grid Builder Spherical Morph", "Orientation", 1);
}
else {
if (gType === 3) { 
sv.sbp_dd = _mVal("Grid Builder Path Morph", "Scale by Position", 1);
sv.ld = _mVal("Grid Builder Path Morph", "Linear Direction", 0);
sv.rf = _mVal("Grid Builder Path Morph", "Ripple Focus", 1);
targetOri = _mVal("Grid Builder Path Morph", "Orientation", 1);
}
}
}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
c.selected = true;
var tempCtrl = c.duplicate();
tempCtrl.name = "TEMP_CTRL";
tempCtrl.enabled = false;
_build(c, comp, gType, sv.co, sv.sx, sv.sy, sv.rad, tot, extPath);
var _smartSet = function (destName, srcNames, fallbackValue, remapFn) {
try {
var destFx = _getPE(c);
if (!destFx) { 
return;
}
var dProp = _findProp(destFx, destName);
if (!dProp) { 
return;
}
var sProp = null;
var foundFxName = "";
if (tempCtrl) { 
var prefFx = "";
if (cm === 4) { 
if (gType === 0) { 
prefFx = "Grid Builder Rectangular Morph";
}
else if (gType === 1) {
prefFx = "Grid Builder Radial Morph";
}
else if (gType === 2) {
prefFx = "Grid Builder Spherical Morph";
}
else {
if (gType === 3) { 
prefFx = "Grid Builder Path Morph";
}
}
}
for (var j = 0; j < srcNames.length; j += 1) { 
if (prefFx !== "") { 
try {
var pFx = tempCtrl.effect(prefFx);
if (pFx) { 
sProp = _findProp(pFx, srcNames[j]);
if (sProp) { 
foundFxName = pFx.name;
}
}
} catch (e) {
}
}
if (sProp !== null) { 
break ;
}
for (var fxi = 1; fxi <= tempCtrl.effect.numProperties; fxi += 1) { 
try {
var tFx = tempCtrl.effect(fxi);
sProp = _findProp(tFx, srcNames[j]);
if (sProp !== null) { 
foundFxName = tFx.name;
break ;
}
} catch (e) {
}}
if (sProp !== null) { 
break ;
}}
}
if ((sProp) && (sProp.numKeys > 0)) { 
var times = [];
var vals = [];
for (var k = 1; k <= sProp.numKeys; k += 1) { 
times.push(sProp.keyTime(k));
var v = sProp.keyValue(k);
if (remapFn) { 
v = remapFn(v, foundFxName);
}
vals.push(v);}
dProp.setValuesAtTimes(times, vals);
for (var k = 1; k <= sProp.numKeys; k += 1) { 
try {
var inInterp = sProp.keyInInterpolationType(k);
var outInterp = sProp.keyOutInterpolationType(k);
dProp.setInterpolationTypeAtKey(k, inInterp, outInterp);
if ((inInterp === KeyframeInterpolationType.BEZIER) || (outInterp === KeyframeInterpolationType.BEZIER)) { 
dProp.setTemporalEaseAtKey(k, sProp.keyInTemporalEase(k), sProp.keyOutTemporalEase(k));
}
} catch (err) {
}}
if (sProp.expressionEnabled) { 
try {
dProp.expression = sProp.expression;
dProp.expressionEnabled = true;
} catch (e) {
}
}
}
else if (sProp) {
var staticVal = fallbackValue;
try {
staticVal = sProp.value;
} catch (e) {
}
if (remapFn) { 
staticVal = remapFn(staticVal, foundFxName);
}
try {
dProp.setValue(staticVal);
} catch (e) {
}
}
else {
try {
dProp.setValue(fallbackValue);
} catch (e) {
}
}
} catch (e) {
}
};
var oriRemap = function (v, srcFxName) {
var oldMode = cm;
if ((srcFxName === "Grid Builder Rectangular Morph") || (srcFxName === "Grid Builder Rectangular")) { 
oldMode = 0;
}
if ((srcFxName === "Grid Builder Radial Morph") || (srcFxName === "Grid Builder Radial")) { 
oldMode = 1;
}
if ((srcFxName === "Grid Builder Spherical Morph") || (srcFxName === "Grid Builder Spherical")) { 
oldMode = 2;
}
if ((srcFxName === "Grid Builder Path Morph") || (srcFxName === "Grid Builder Path")) { 
oldMode = 3;
}
var tOri = v;
if (((gType === 2) && (oldMode !== 2)) && (v === 2)) { 
tOri = 3;
}
if (((gType !== 2) && (oldMode === 2)) && (v === 3)) { 
tOri = 2;
}
if (((gType === 3) && ((oldMode === 0) || (oldMode === 1))) && (v === 3)) { 
tOri = 4;
}
if ((((gType === 0) || (gType === 1)) && (oldMode === 3)) && (v === 4)) { 
tOri = 3;
}
if ((gType === 2) && ((v === 4) || ((oldMode !== 3) && (v === 3)))) { 
tOri = 1;
}
return tOri;
};
var sbpRemap = function (v, srcFxName) {
var isChk = (cm === 1) || (cm === 2);
if ((((srcFxName === "Grid Builder Radial Morph") || (srcFxName === "Grid Builder Spherical Morph")) || (srcFxName === "Grid Builder Radial")) || (srcFxName === "Grid Builder Spherical")) { 
isChk = true;
}
if ((((srcFxName === "Grid Builder Rectangular Morph") || (srcFxName === "Grid Builder Path Morph")) || (srcFxName === "Grid Builder Rectangular")) || (srcFxName === "Grid Builder Path")) { 
isChk = false;
}
var targetIsChk = (gType === 1) || (gType === 2);
if ((isChk) && (!targetIsChk)) { 
return v >= 1 ? 2 : 1;
}
else {
if ((!isChk) && (targetIsChk)) { 
return v > 1 ? 1 : 0;
}
}
return v;
};
if (gType === 0) { 
_smartSet("Columns", ["Columns", "Spread"], sv.co);
_smartSet("Spacing X", ["Spacing X", "Radius"], sv.sx);
_smartSet("Spacing Y", ["Spacing Y", "Radius"], sv.sy);
_smartSet("Grid Rotation", ["Grid Rotation"], sv.gr);
_smartSet("Z Depth", ["Z Depth"], sv.zd);
_smartSet("Z Anchor", ["Z Anchor"], sv.za);
_smartSet("Orientation", ["Orientation"], targetOri, oriRemap);
_smartSet("Scale by Position", ["Scale by Position"], sv.sbp_dd, sbpRemap);
_smartSet("Linear Direction", ["Linear Direction", "Scale Direction", "Yaw"], sv.ld);
_smartSet("Ripple Focus", ["Ripple Focus", "Focus Index", "Focus Target"], sv.rf);
}
else if (gType === 1) {
if (cm === 1) { 
_smartSet("Spread", ["Spread"], sv.co);
}
else {
_smartSet("Spread", [], tot);
}
_smartSet("Radius", ["Radius", "Spacing X", "Spacing Y"], sv.rad);
_smartSet("Grid Rotation", ["Grid Rotation"], sv.gr);
_smartSet("Z Depth", ["Z Depth"], sv.zd);
_smartSet("Z Anchor", ["Z Anchor"], sv.za);
_smartSet("Orientation", ["Orientation"], targetOri, oriRemap);
_smartSet("Scale by Position", ["Scale by Position"], sv.sbp_cb, sbpRemap);
_smartSet("Scale Direction", ["Scale Direction", "Linear Direction", "Yaw"], sv.ld);
}
else if (gType === 3) {
_smartSet("Shape", ["Shape"], sv.p_shp);
_smartSet("Scale X", ["Scale X", "Spacing X", "Radius"], sv.p_sx);
_smartSet("Scale Y", ["Scale Y", "Spacing Y", "Radius"], sv.p_sy);
_smartSet("Polygon Points", ["Polygon Points"], sv.p_pts);
_smartSet("Grid Rotation", ["Grid Rotation"], sv.gr);
_smartSet("Z Depth", ["Z Depth"], sv.zd);
_smartSet("Z Anchor", ["Z Anchor"], sv.za);
_smartSet("Trim Start", ["Trim Start"], sv.p_ts);
_smartSet("Trim End", ["Trim End"], sv.p_te);
_smartSet("Path Progress", ["Path Progress"], sv.pp);
_smartSet("Path Spread", ["Path Spread"], sv.ps);
_smartSet("Orientation", ["Orientation"], targetOri, oriRemap);
_smartSet("Scale by Position", ["Scale by Position"], sv.sbp_dd, sbpRemap);
_smartSet("Linear Direction", ["Linear Direction", "Scale Direction", "Yaw"], sv.ld);
_smartSet("Ripple Focus", ["Ripple Focus", "Focus Index", "Focus Target"], sv.rf);
}
else {
if (gType === 2) { 
_smartSet("Radius", ["Radius", "Spacing X", "Spacing Y"], sv.rad);
_smartSet("Focus Index", ["Focus Index", "Ripple Focus", "Focus Target"], sv.rf);
_smartSet("Orientation", ["Orientation"], targetOri, oriRemap);
_smartSet("Scale by Position", ["Scale by Position"], sv.sbp_cb, sbpRemap);
_smartSet("Yaw", ["Yaw", "Linear Direction", "Scale Direction"], sv.ld);
_smartSet("Pitch", ["Pitch", "Scale Direction Z"], sv.sdz);
}
}
_smartSet("Scale Front", ["Scale Front", "Scale Forward"], sv.sf);
_smartSet("Scale Back", ["Scale Back", "Scale Backwards"], sv.sb);
_smartSet("Scale Falloff", ["Scale Falloff"], sv.fall);
_smartSet("Random Offset", ["Random Offset"], sv.rn);
_smartSet("Random Seed", ["Random Seed"], sv.rs);
_smartSet("Shuffle", ["Shuffle"], sv.sh);
_smartSet("Global Opacity", ["Global Opacity"], sv.go);
_smartSet("Time Offset", ["Time Offset"], sv.to);
_smartSet("Reverse Time", ["Reverse Time"], sv.rt);
_smartSet("Twist X", ["Twist X"], sv.tx);
_smartSet("Twist Y", ["Twist Y"], sv.ty);
_smartSet("Twist Z", ["Twist Z"], sv.tz);
_smartSet("Stagger", ["Stagger"], sv.stg);
_smartSet("Stagger Axis", ["Stagger Axis"], sv.stgAx);
var tempFx = tempCtrl.property("ADBE Effect Parade");
var effectsToRestore = [];
var tempReg = _getRegistry(tempCtrl);
if (tempFx) { 
for (var fIdx = 1; fIdx <= tempFx.numProperties; fIdx += 1) { 
var p = tempFx.property(fIdx);
var mn = p.matchName ? p.matchName.toLowerCase() : "";
var n = p.name ? p.name : "";
var nLow = n.toLowerCase();
var presetToApply = "";
var isCustomMap = false;
if ((((tempReg) && (tempReg.maps)) && (tempReg.maps[n])) || (n.indexOf("Map ") === 0)) { 
isCustomMap = true;
}
if (isCustomMap) { 
if (mn.indexOf("gbproxslider") > -1) { 
presetToApply = "GridProxSlider_V101.ffx";
}
else if ((mn.indexOf("gbproxpos") > -1) || (mn.indexOf("gbproxarray") > -1)) {
presetToApply = "GridProxPos_V101.ffx";
}
else if (mn.indexOf("gbproxcolor") > -1) {
presetToApply = "GridProxColor_V101.ffx";
}
else {
var isColor = false;
var isArray = false;
try {
if ((p.property("Max Color")) || (p.property("Min Color"))) { 
isColor = true;
}
else {
if (p.property("Max Value")) { 
var vt = p.property("Max Value").propertyValueType;
if (vt === PropertyValueType.COLOR) { 
isColor = true;
}
else {
if ((((vt === PropertyValueType.TwoD_SPATIAL) || (vt === PropertyValueType.ThreeD_SPATIAL)) || (vt === PropertyValueType.TwoD)) || (vt === PropertyValueType.ThreeD)) { 
isArray = true;
}
}
}
}
} catch (e) {
}
if (isColor) { 
presetToApply = "GridProxColor_V101.ffx";
}
else if (isArray) {
presetToApply = "GridProxPos_V101.ffx";
}
else {
presetToApply = "GridProxSlider_V101.ffx";
}
}
}
else {
if (((mn.indexOf("gridbuilderprox") > -1) || (mn.indexOf("gridprox") > -1)) || (nLow.indexOf("proximity") > -1)) { 
presetToApply = "GridProxMain_V101.ffx";
}
}
if (presetToApply !== "") { 
effectsToRestore.push({index: fIdx, name: n, preset: presetToApply});
}}
}
if (effectsToRestore.length > 0) { 
for (var pIdx = 0; pIdx < effectsToRestore.length; pIdx += 1) { 
var pData = effectsToRestore[pIdx];
var oldFx = tempFx.property(pData.index);
var ffxProxFile = new File(extPath + "/src/" + pData.preset);
if (!ffxProxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + pData.preset);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + pData.preset);
if (userFile.exists) { 
ffxProxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxProxFile = sysFile;
}
}
}
if (ffxProxFile.exists) { 
var safeProxFile = new File(ffxProxFile.fsName);
for (var L = 1; L <= comp.numLayers; L += 1) { 
comp.layer(L).selected = false;}
c.selected = true;
c.applyPreset(safeProxFile);
var cFx = c.property("ADBE Effect Parade");
var newFx = null;
if ((cFx) && (cFx.numProperties > 0)) { 
newFx = cFx.property(cFx.numProperties);
}
if (newFx) { 
newFx.name = pData.name;
for (var vIdx = 1; vIdx <= oldFx.numProperties; vIdx += 1) { 
var oldProp = oldFx.property(vIdx);
var newProp = newFx.property(vIdx);
if ((((oldProp) && (newProp)) && (oldProp.propertyType === PropertyType.PROPERTY)) && (oldProp.canSetExpression)) { 
try {
if (oldProp.numKeys > 0) { 
var times = [];
var vals = [];
for (var k = 1; k <= oldProp.numKeys; k += 1) { 
times.push(oldProp.keyTime(k));
vals.push(oldProp.keyValue(k));}
newProp.setValuesAtTimes(times, vals);
for (var k = 1; k <= oldProp.numKeys; k += 1) { 
try {
var inInterp = oldProp.keyInInterpolationType(k);
var outInterp = oldProp.keyOutInterpolationType(k);
newProp.setInterpolationTypeAtKey(k, inInterp, outInterp);
if ((inInterp === KeyframeInterpolationType.BEZIER) || (outInterp === KeyframeInterpolationType.BEZIER)) { 
newProp.setTemporalEaseAtKey(k, oldProp.keyInTemporalEase(k), oldProp.keyOutTemporalEase(k));
}
} catch (err) {
}}
}
else {
newProp.setValue(oldProp.value);
}
if (oldProp.expressionEnabled) { 
newProp.expression = oldProp.expression;
newProp.expressionEnabled = true;
}
} catch (e) {
}
}}
}
}}
}
tempCtrl.remove();
for (var i = 0; i < tot; i += 1) { 
ch[i].enabled = true;
_expr(ch[i], i, cn, gType, tot);}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
c.selected = true;
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridUpdateTargets(gridName, targetArrayStr) {
var comp = _comp();
if (!comp) { 
return;
}
var c = comp.layer(gridName);
if (!c) { 
return;
}
app.beginUndoGroup("Grid Builder - Targets");
try {
var currentReg = _getRegistry(c);
currentReg.targets = eval(targetArrayStr);
_setRegistry(c, currentReg);
var cn = c.name;
var cm = _mode(c);
var ch = _kids(comp, c);
var tot = ch.length;
for (var i = 0; i < tot; i += 1) { 
_expr(ch[i], i, cn, cm, tot);}
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridAdd(gridName, isTrial) {
var comp = _comp();
if (!comp) { 
alert("Please open a composition first.");
return;
}
var c = (gridName) && (gridName !== "undefined") ? comp.layer(gridName) : _ctrl(comp);
if (!c) { 
alert("No target grid found. Please select a grid in the panel dropdown.");
return;
}
var sel = comp.selectedLayers;
if (!sel.length) { 
alert("Please select layers to add.");
return;
}
app.beginUndoGroup("Grid Builder - Add");
try {
var cn = c.name;
var cm = _mode(c);
var toA = [];
var skipped = 0;
for (var i = 0; i < sel.length; i += 1) { 
var l = sel[i];
if (_isGrid(l)) { 
continue ;
}
if ((l.name.indexOf(CTRL) === 0) && ((l.name.indexOf("[") > -1) || (l.name.indexOf(":") > -1))) { 
continue ;
}
if ((l.parent) && (_isGrid(l.parent))) { 
alert("Layer \'" + l.name + "\' already belongs to grid: " + l.parent.name);
skipped++;
continue ;
}
toA.push(l);}
if (!toA.length) { 
if (skipped === 0) { 
alert("No valid layers to add.");
}
app.endUndoGroup();
return;
}
var currentTot = _kids(comp, c).length;
if ((isTrial) && ((currentTot + toA.length) > trialLimit)) { 
var remainingSlots = trialLimit - currentTot;
if (remainingSlots <= 0) { 
alert("Trial limit reached! You already have " + trialLimit + " layers in this grid. Unlock the full version to add more.");
app.endUndoGroup();
return;
}
else {
alert("Trial version is limited to " + trialLimit + " layers. Only " + remainingSlots + " layer(s) will be added.");
var choppedToA = [];
for (var i = 0; i < remainingSlots; i += 1) { 
choppedToA.push(toA[i]);}
toA = choppedToA;
}
}
var order = _getOrder(c);
for (var i = 0; i < toA.length; i += 1) { 
_centerAP(toA[i], comp.time);
var tf = toA[i].property("ADBE Transform Group");
var posProp = tf.property("ADBE Position");
var originalScale = [100, 100, 100];
try {
originalScale = tf.property("ADBE Scale").value;
} catch (e) {
}
toA[i].parent = c;
try {
if (posProp.dimensionsSeparated) { 
posProp.dimensionsSeparated = false;
}
posProp.setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Scale").setValue(originalScale);
} catch (e) {
}
try {
tf.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
order.push(toA[i].id);}
var newTot = order.length;
var currentReg = _getRegistry(c);
currentReg.layers = order;
_setRegistry(c, currentReg);
try {
if (c.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var oldTot = currentTot;
if (cm === 4) { 
try {
var rProp = c.effect("Grid Builder Radial Morph").property("Spread");
if (Math.round(rProp.value) === oldTot) { 
rProp.setValue(newTot);
}
} catch (e) {
}
}
else {
if (cm === 1) { 
try {
var rProp = c.effect("Grid Builder Radial").property("Spread");
if (Math.round(rProp.value) === oldTot) { 
rProp.setValue(newTot);
}
} catch (e) {
}
}
}
var ch = _kids(comp, c);
for (var i = 0; i < newTot; i += 1) { 
_expr(ch[i], i, cn, cm, newTot);}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
c.selected = true;
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridRemove(gridName) {
var comp = _comp();
if (!comp) { 
alert("Please open a composition first.");
return;
}
var c = (gridName) && (gridName !== "undefined") ? comp.layer(gridName) : _ctrl(comp);
if (!c) { 
alert("No target grid found. Please select a grid in the panel dropdown.");
return;
}
app.beginUndoGroup("Grid Builder - Remove");
try {
var ctrlName = c.name;
var ch = _kids(comp, c);
var _scrubCustomExpressions = function (propGrp, targetName) {
for (var p = 1; p <= propGrp.numProperties; p += 1) { 
var prop = propGrp.property(p);
if (((prop.propertyType === PropertyType.PROPERTY) && (prop.canSetExpression)) && (prop.expressionEnabled)) { 
var exprStr = prop.expression;
if ((exprStr.indexOf("layer(\'" + targetName + "\')") !== -1) || (exprStr.indexOf("layer(\"" + targetName + "\")") !== -1)) { 
prop.expression = "";
}
}
else {
if ((prop.propertyType === PropertyType.NAMED_GROUP) || (prop.propertyType === PropertyType.INDEXED_GROUP)) { 
_scrubCustomExpressions(prop, targetName);
}
}}
};
for (var i = 0; i < ch.length; i += 1) { 
var L = ch[i];
var tf = L.property("ADBE Transform Group");
L.parent = null;
try {
tf.property("ADBE Position").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Scale").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Orientation").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Opacity").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
try {
if (L.property("ADBE Effect Parade")) { 
_scrubCustomExpressions(L.property("ADBE Effect Parade"), ctrlName);
}
if (L.property("ADBE Root Vectors Group")) { 
_scrubCustomExpressions(L.property("ADBE Root Vectors Group"), ctrlName);
}
if (L.property("ADBE Extrsn Options Group")) { 
_scrubCustomExpressions(L.property("ADBE Extrsn Options Group"), ctrlName);
}
if (L.property("ADBE Material Options Group")) { 
_scrubCustomExpressions(L.property("ADBE Material Options Group"), ctrlName);
}
} catch (e) {
}
L.enabled = true;}
var reg = _getRegistry(c);
if (((reg) && (reg.effectors)) && (reg.effectors.length > 0)) { 
for (var j = 0; j < reg.effectors.length; j += 1) { 
var effLayer = _getLayerById(comp, reg.effectors[j]);
if (effLayer) { 
effLayer.remove();
}}
}
c.remove();
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridRemoveLayers(gridName, idsStr) {
var comp = _comp();
if (!comp) { 
return;
}
var c = comp.layer(gridName);
if (!c) { 
return;
}
var idsToRemove = eval(idsStr);
var proceed = confirm("Remove " + idsToRemove.length + " layers?", true, "Grid Builder");
if (!proceed) { 
return;
}
app.beginUndoGroup("Grid Builder - Remove Layers");
try {
var order = _getOrder(c);
var newOrder = [];
var validChildren = [];
for (var i = 0; i < idsToRemove.length; i += 1) { 
var l = _getLayerById(comp, idsToRemove[i]);
if (l) { 
l.parent = null;
var tf = l.property("ADBE Transform Group");
try {
tf.property("ADBE Position").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Scale").expression = "";
} catch (e) {
}
try {
tf.property("ADBE Orientation").expression = "";
tf.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tf.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
try {
tf.property("ADBE Opacity").expression = "";
} catch (e) {
}
}}
for (var i = 0; i < order.length; i += 1) { 
if (_indexOf(idsToRemove, order[i]) === -1) { 
var survivingLayer = _getLayerById(comp, order[i]);
if (survivingLayer) { 
newOrder.push(order[i]);
validChildren.push(survivingLayer);
}
}}
var newTot = newOrder.length;
var currentReg = _getRegistry(c);
currentReg.layers = newOrder;
_setRegistry(c, currentReg);
var cn = c.name;
var cm = _mode(c);
try {
if (c.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var oldTot = order.length;
if (cm === 4) { 
try {
var rProp = c.effect("Grid Builder Radial Morph").property("Spread");
if (Math.round(rProp.value) === oldTot) { 
rProp.setValue(newTot);
}
} catch (e) {
}
}
else {
if (cm === 1) { 
try {
var rProp = c.effect("Grid Builder Radial").property("Spread");
if (Math.round(rProp.value) === oldTot) { 
rProp.setValue(newTot);
}
} catch (e) {
}
}
}
for (var i = 0; i < newTot; i += 1) { 
_expr(validChildren[i], i, cn, cm, newTot);}
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridDuplicate(gridName) {
var comp = _comp();
if (!comp) { 
return;
}
var c = comp.layer(gridName);
if (!c) { 
alert("Grid not found.");
return;
}
app.beginUndoGroup("Grid Builder - Duplicate");
try {
var oldCn = c.name;
var newCn = _uname(comp, CTRL);
var newCtrl = c.duplicate();
newCtrl.name = newCn;
var oldReg = _getRegistry(c);
var topmostLayer = c;
if (((oldReg) && (oldReg.effectors)) && (oldReg.effectors.length > 0)) { 
for (var eIdx = 0; eIdx < oldReg.effectors.length; eIdx += 1) { 
var oldEff = _getLayerById(comp, oldReg.effectors[eIdx]);
if ((oldEff) && (oldEff.index < topmostLayer.index)) { 
topmostLayer = oldEff;
}}
}
newCtrl.moveBefore(topmostLayer);
var insertRef = newCtrl;
var ch = _kids(comp, c);
var newOrder = [];
var newChildren = [];
for (var i = 0; i < ch.length; i += 1) { 
var nChild = ch[i].duplicate();
nChild.parent = newCtrl;
nChild.moveAfter(insertRef);
insertRef = nChild;
newOrder.push(nChild.id);
newChildren.push(nChild);}
var cm = _mode(newCtrl);
var currentReg = _getRegistry(newCtrl);
currentReg.layers = newOrder;
var newEffectors = [];
var effInsertRef = newCtrl;
var _updateEffectorExpressions = function (propGroup, oldName, newName) {
for (var p = 1; p <= propGroup.numProperties; p += 1) { 
var prop = propGroup.property(p);
if (((prop.propertyType === PropertyType.PROPERTY) && (prop.canSetExpression)) && (prop.expressionEnabled)) { 
var exprStr = prop.expression;
if (exprStr.indexOf(oldName) !== -1) { 
var updatedExpr = exprStr.split("\'" + oldName + "\'").join("\'" + newName + "\'");
updatedExpr = updatedExpr.split("\"" + oldName + "\"").join("\"" + newName + "\"");
prop.expression = updatedExpr;
}
}
else {
if ((prop.propertyType === PropertyType.INDEXED_GROUP) || (prop.propertyType === PropertyType.NAMED_GROUP)) { 
_updateEffectorExpressions(prop, oldName, newName);
}
}}
};
if (((oldReg) && (oldReg.effectors)) && (oldReg.effectors.length > 0)) { 
for (var eIdx = 0; eIdx < oldReg.effectors.length; eIdx += 1) { 
var oldEff = _getLayerById(comp, oldReg.effectors[eIdx]);
if (oldEff) { 
var newEff = oldEff.duplicate();
var newEffName = oldEff.name.split(oldCn).join(newCn);
newEff.name = newEffName;
newEff.moveBefore(effInsertRef);
effInsertRef = newEff;
_updateEffectorExpressions(newEff, oldCn, newCn);
newEffectors.push(newEff.id);
}}
}
currentReg.effectors = newEffectors;
_setRegistry(newCtrl, currentReg);
for (var i = 0; i < newChildren.length; i += 1) { 
_expr(newChildren[i], i, newCn, cm, newChildren.length);}
for (var i = 1; i <= comp.numLayers; i += 1) { 
comp.layer(i).selected = false;}
newCtrl.selected = true;
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function gridReorder(gridName, newOrderStr) {
var comp = _comp();
if (!comp) { 
return;
}
var c = comp.layer(gridName);
if (!c) { 
return;
}
app.beginUndoGroup("Grid Builder - Reorder");
try {
var cn = c.name;
var cm = _mode(c);
var tot = _kids(comp, c).length;
var currentReg = _getRegistry(c);
currentReg.layers = eval(newOrderStr);
_setRegistry(c, currentReg);
var ch_new = _kids(comp, c);
for (var i = 0; i < tot; i += 1) { 
_expr(ch_new[i], i, cn, cm, tot);}
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function getGridsData() {
var comp = _comp();
if (!comp) { 
return "[]";
}
var grids = [];
for (var i = 1; i <= comp.numLayers; i += 1) { 
var l = comp.layer(i);
if (_isGrid(l)) { 
var cm = _mode(l);
var gridObj = {layers: [], mode: cm, name: l.name};
var ch = _kids(comp, l);
for (var j = 0; j < ch.length; j += 1) { 
gridObj.layers.push({id: ch[j].id, label: ch[j].label, name: ch[j].name});}
grids.push(gridObj);
}}
var str = "[";
for (var i = 0; i < grids.length; i += 1) { 
str += "{\"gridName\":\"" + grids[i].name + "\",\"mode\":" + grids[i].mode + ",\"layers\":[";
for (var j = 0; j < grids[i].layers.length; j += 1) { 
var safeName = grids[i].layers[j].name.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
str += "{\"id\":" + grids[i].layers[j].id + ",\"name\":\"" + safeName + "\",\"label\":" + grids[i].layers[j].label + "}";
if (j < (grids[i].layers.length - 1)) { 
str += ",";
}}
str += "]}";
if (i < (grids.length - 1)) { 
str += ",";
}}
str += "]";
return str;
}
function _getLayerById(comp, id) {
for (var i = 1; i <= comp.numLayers; i += 1) { 
if (comp.layer(i).id == id) { 
return comp.layer(i);
}}
return null;
}
function gridReplaceLayers(gridName, oldIdsStr) {
var comp = _comp();
if (!comp) { 
return;
}
var c = comp.layer(gridName);
if (!c) { 
return;
}
app.beginUndoGroup("Grid Builder - Replace Layers");
try {
var oldIds = eval(oldIdsStr);
var sel = comp.selectedLayers;
var validNewLayers = [];
var skipped = 0;
for (var i = 0; i < sel.length; i += 1) { 
var l = sel[i];
if ((_isGrid(l)) || ((l.parent) && (_isGrid(l.parent)))) { 
alert(l.name + "\': It is already a Grid Controller or belongs to a grid.");
skipped++;
continue ;
}
validNewLayers.push(l);}
if (validNewLayers.length === 0) { 
if (skipped === 0) { 
alert("Please select layers in the composition to swap in.");
}
app.endUndoGroup();
return;
}
if (oldIds.length !== validNewLayers.length) { 
alert("Selection mismatch: You selected " + oldIds.length + " layer(s) in the panel, but " + validNewLayers.length + " valid layer(s) in the composition. Please select an equal number to swap.");
app.endUndoGroup();
return;
}
var order = _getOrder(c);
var cn = c.name;
var cm = _mode(c);
var swappedCount = 0;
for (var i = 0; i < oldIds.length; i += 1) { 
var oldId = oldIds[i];
var newL = validNewLayers[i];
var newId = newL.id;
var oldL = _getLayerById(comp, oldId);
var memoryIndex = _indexOf(order, oldId);
if (memoryIndex !== -1) { 
if (oldL) { 
var tfOld = oldL.property("ADBE Transform Group");
var oldOriginalScale = [100, 100, 100];
try {
oldOriginalScale = tfOld.property("ADBE Scale").value;
} catch (e) {
}
oldL.parent = null;
try {
tfOld.property("ADBE Position").expression = "";
} catch (e) {
}
try {
tfOld.property("ADBE Scale").expression = "";
tfOld.property("ADBE Scale").setValue(oldOriginalScale);
} catch (e) {
}
try {
tfOld.property("ADBE Orientation").expression = "";
tfOld.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tfOld.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tfOld.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tfOld.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
try {
tfOld.property("ADBE Opacity").expression = "";
} catch (e) {
}
}
_centerAP(newL, comp.time);
var tfNew = newL.property("ADBE Transform Group");
var posPropNew = tfNew.property("ADBE Position");
var newOriginalScale = [100, 100, 100];
try {
newOriginalScale = tfNew.property("ADBE Scale").value;
} catch (e) {
}
newL.parent = c;
try {
if (posPropNew.dimensionsSeparated) { 
posPropNew.dimensionsSeparated = false;
}
posPropNew.setValue([0, 0, 0]);
} catch (e) {
}
try {
tfNew.property("ADBE Scale").setValue(newOriginalScale);
} catch (e) {
}
try {
tfNew.property("ADBE Orientation").setValue([0, 0, 0]);
} catch (e) {
}
try {
tfNew.property("ADBE Rotate X").setValue(0);
} catch (e) {
}
try {
tfNew.property("ADBE Rotate Y").setValue(0);
} catch (e) {
}
try {
tfNew.property("ADBE Rotate Z").setValue(0);
} catch (e) {
}
order[memoryIndex] = newId;
swappedCount++;
}}
if (swappedCount > 0) { 
var newTot = order.length;
var currentReg = _getRegistry(c);
currentReg.layers = order;
_setRegistry(c, currentReg);
for (var i = 0; i < newTot; i += 1) { 
var currL = _getLayerById(comp, order[i]);
if (currL) { 
_expr(currL, i, cn, cm, newTot);
}}
}
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function upgradeToMorph(gridName, extPath) {
var comp = _comp();
if (!comp) { 
return;
}
var c = (gridName) && (gridName !== "undefined") ? comp.layer(gridName) : _ctrl(comp);
if (!c) { 
return;
}
app.beginUndoGroup("Grid Builder - Upgrade to Morph");
try {
var cm = _mode(c);
if (cm === 4) { 
alert("This grid is already using the Morph Engine!");
app.endUndoGroup();
return;
}
var _findProp = function (parentGroup, propName) {
try {
for (var i = 1; i <= parentGroup.numProperties; i += 1) { 
var p = parentGroup.property(i);
if (((p.name === propName) && (p.propertyType === PropertyType.PROPERTY)) && (p.propertyValueType !== PropertyValueType.NO_VALUE)) { 
return p;
}
if (((p.propertyType === PropertyType.NAMED_GROUP) || (p.propertyType === PropertyType.INDEXED_GROUP)) || (p.propertyValueType === PropertyValueType.NO_VALUE)) { 
var inner = _findProp(p, propName);
if (inner) { 
return inner;
}
}}
} catch (e) {
}
return null;
};
var _val = function (fxObj, pName, def) {
try {
if (!fxObj) { 
return def;
}
var p = _findProp(fxObj, pName);
if (p) { 
return p.value;
}
} catch (e) {
}
return def;
};
var ch = _kids(comp, c);
var tot = ch.length;
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
c.selected = true;
var tempCtrl = c.duplicate();
tempCtrl.name = "TEMP_CTRL";
tempCtrl.enabled = false;
var oldMainFx = _getPE(tempCtrl);
var rVal = _val(oldMainFx, "Radius", null);
var sxVal = _val(oldMainFx, "Spacing X", null);
var syVal = _val(oldMainFx, "Spacing Y", null);
if (rVal === null) { 
rVal = sxVal !== null ? sxVal : 300;
}
if (sxVal === null) { 
sxVal = rVal !== null ? rVal : 300;
}
if (syVal === null) { 
syVal = rVal !== null ? rVal : 300;
}
var oldSbp = _val(oldMainFx, "Scale by Position", null);
var targetSbpDropdown = 1;
var targetSbpCheckbox = 0;
var currentIsCheckbox = (cm === 1) || (cm === 2);
if (oldSbp !== null) { 
if (currentIsCheckbox) { 
targetSbpDropdown = oldSbp >= 1 ? 2 : 1;
targetSbpCheckbox = oldSbp;
}
else {
targetSbpCheckbox = oldSbp > 1 ? 1 : 0;
targetSbpDropdown = oldSbp;
}
}
var linDirVal = _val(oldMainFx, "Linear Direction", null);
if (linDirVal === null) { 
linDirVal = _val(oldMainFx, "Scale Direction", null);
}
if (linDirVal === null) { 
linDirVal = _val(oldMainFx, "Yaw", 0);
}
var sdzVal = _val(oldMainFx, "Scale Direction Z", null);
if (sdzVal === null) { 
sdzVal = _val(oldMainFx, "Pitch", 0);
}
var ripFocVal = _val(oldMainFx, "Ripple Focus", null);
if (ripFocVal === null) { 
ripFocVal = _val(oldMainFx, "Focus Target", null);
}
if (ripFocVal === null) { 
ripFocVal = _val(oldMainFx, "Focus Index", 1);
}
var oriVal = _val(oldMainFx, "Orientation", null);
if (oriVal === null) { 
var oldFD = _val(oldMainFx, "Face Direction", null);
if (oldFD !== null) { 
oriVal = oldFD;
}
else {
if (_val(oldMainFx, "Face Screen", 0) === 1) { 
oriVal = 2;
}
else if (_val(oldMainFx, "Orient to Center", 0) === 1) {
oriVal = 3;
}
else {
oriVal = 1;
}
}
}
if (oriVal === null) { 
oriVal = 1;
}
var sv = {co: cm === 0 ? _val(oldMainFx, "Columns", 3) : _val(oldMainFx, "Spread", 3), fall: _val(oldMainFx, "Scale Falloff", 50), go: _val(oldMainFx, "Global Opacity", 100), gr: _val(oldMainFx, "Grid Rotation", 0), ld: linDirVal, ori: oriVal, p_pts: _val(oldMainFx, "Polygon Points", 3), p_shp: _val(oldMainFx, "Shape", 1), p_sx: _val(oldMainFx, "Scale X", 300), p_sy: _val(oldMainFx, "Scale Y", 300), p_te: _val(oldMainFx, "Trim End", 100), p_ts: _val(oldMainFx, "Trim Start", 0), pp: _val(oldMainFx, "Path Progress", 0), ps: _val(oldMainFx, "Path Spread", 100), rad: rVal, rf: ripFocVal, rn: _val(oldMainFx, "Random Offset", 0), rs: _val(oldMainFx, "Random Seed", 0), rt: _val(oldMainFx, "Reverse Time", 0), sb: _val(oldMainFx, "Scale Back", 0), sbp_cb: targetSbpCheckbox, sbp_dd: targetSbpDropdown, sdz: sdzVal, sf: _val(oldMainFx, "Scale Front", 0), sh: _val(oldMainFx, "Shuffle", 0), stg: _val(oldMainFx, "Stagger", 0), stgAx: _val(oldMainFx, "Stagger Axis", 1), sx: sxVal, sy: syVal, to: _val(oldMainFx, "Time Offset", 0), tx: _val(oldMainFx, "Twist X", _val(oldMainFx, "Twixt X", 0)), ty: _val(oldMainFx, "Twist Y", 0), tz: _val(oldMainFx, "Twist Z", 0), za: Math.round(_val(oldMainFx, "Z Anchor", 1)), zd: _val(oldMainFx, "Z Depth", 0)};
_clr(c);
var presetName = "GridMorph_V107.ffx";
var ffxFile = new File(extPath + "/src/" + presetName);
if (!ffxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
if (userFile.exists) { 
ffxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxFile = sysFile;
}
}
}
if (ffxFile.exists) { 
var safeFile = new File(ffxFile.fsName);
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
c.selected = true;
c.applyPreset(safeFile);
}
else {
alert("Morph Master Preset missing: " + presetName);
tempCtrl.remove();
app.endUndoGroup();
return;
}
var _smartSet = function (destFxName, destName, srcNames, fallbackValue, remapFn) {
try {
var destFx = c.effect(destFxName);
if (!destFx) { 
return;
}
var dProp = _findProp(destFx, destName);
if (!dProp) { 
return;
}
var sProp = null;
if (oldMainFx) { 
for (var j = 0; j < srcNames.length; j += 1) { 
sProp = _findProp(oldMainFx, srcNames[j]);
if (sProp !== null) { 
break ;
}}
}
if ((sProp) && (sProp.numKeys > 0)) { 
var times = [];
var vals = [];
for (var k = 1; k <= sProp.numKeys; k += 1) { 
times.push(sProp.keyTime(k));
var v = sProp.keyValue(k);
if (remapFn) { 
v = remapFn(v);
}
vals.push(v);}
dProp.setValuesAtTimes(times, vals);
for (var k = 1; k <= sProp.numKeys; k += 1) { 
try {
var inInterp = sProp.keyInInterpolationType(k);
var outInterp = sProp.keyOutInterpolationType(k);
dProp.setInterpolationTypeAtKey(k, inInterp, outInterp);
if ((inInterp === KeyframeInterpolationType.BEZIER) || (outInterp === KeyframeInterpolationType.BEZIER)) { 
dProp.setTemporalEaseAtKey(k, sProp.keyInTemporalEase(k), sProp.keyOutTemporalEase(k));
}
} catch (err) {
}}
if (sProp.expressionEnabled) { 
try {
dProp.expression = sProp.expression;
dProp.expressionEnabled = true;
} catch (e) {
}
}
}
else if (sProp) {
var staticVal = fallbackValue;
try {
staticVal = sProp.value;
} catch (e) {
}
if (remapFn) { 
staticVal = remapFn(staticVal);
}
try {
dProp.setValue(staticVal);
} catch (e) {
}
}
else {
try {
dProp.setValue(fallbackValue);
} catch (e) {
}
}
} catch (e) {
}
};
var oriRemap = function (v, destType) {
var tOri = v;
if (((destType === 2) && (cm !== 2)) && (v === 2)) { 
tOri = 3;
}
if (((destType !== 2) && (cm === 2)) && (v === 3)) { 
tOri = 2;
}
if (((destType === 3) && ((cm === 0) || (cm === 1))) && (v === 3)) { 
tOri = 4;
}
if ((((destType === 0) || (destType === 1)) && (cm === 3)) && (v === 4)) { 
tOri = 3;
}
if ((destType === 2) && ((v === 4) || ((cm !== 3) && (v === 3)))) { 
tOri = 1;
}
return tOri;
};
var sbpRemap = function (v, destIsChk) {
var srcIsChk = (cm === 1) || (cm === 2);
if ((srcIsChk) && (!destIsChk)) { 
return v >= 1 ? 2 : 1;
}
else {
if ((!srcIsChk) && (destIsChk)) { 
return v > 1 ? 1 : 0;
}
}
return v;
};
var f1 = "Grid Builder Morph";
var modeMap = [1, 2, 4, 3];
try {
c.effect(f1).property("Transition").setValue(modeMap[cm]);
} catch (e) {
}
_smartSet(f1, "Grid Rotation", ["Grid Rotation"], sv.gr);
_smartSet(f1, "Z Depth", ["Z Depth"], sv.zd);
_smartSet(f1, "Z Anchor", ["Z Anchor"], sv.za);
_smartSet(f1, "Scale Front", ["Scale Front", "Scale Forward"], sv.sf);
_smartSet(f1, "Scale Back", ["Scale Back", "Scale Backwards"], sv.sb);
_smartSet(f1, "Scale Falloff", ["Scale Falloff"], sv.fall);
_smartSet(f1, "Random Offset", ["Random Offset"], sv.rn);
_smartSet(f1, "Random Seed", ["Random Seed"], sv.rs);
_smartSet(f1, "Shuffle", ["Shuffle"], sv.sh);
_smartSet(f1, "Global Opacity", ["Global Opacity"], sv.go);
_smartSet(f1, "Time Offset", ["Time Offset"], sv.to);
_smartSet(f1, "Reverse Time", ["Reverse Time"], sv.rt);
_smartSet(f1, "Twist X", ["Twist X", "Twixt X"], sv.tx);
_smartSet(f1, "Twist Y", ["Twist Y"], sv.ty);
_smartSet(f1, "Twist Z", ["Twist Z"], sv.tz);
_smartSet(f1, "Stagger", ["Stagger"], sv.stg);
_smartSet(f1, "Stagger Axis", ["Stagger Axis"], sv.stgAx);
var f2 = "Grid Builder Rectangular Morph";
if (cm === 0) { 
_smartSet(f2, "Columns", ["Columns", "Spread"], sv.co);
}
else {
_smartSet(f2, "Columns", [], 3);
}
_smartSet(f2, "Spacing X", ["Spacing X", "Radius"], sv.sx);
_smartSet(f2, "Spacing Y", ["Spacing Y", "Radius"], sv.sy);
_smartSet(f2, "Scale by Position", ["Scale by Position"], sv.sbp_dd, function (v) {
return sbpRemap(v, false);
});
_smartSet(f2, "Linear Direction", ["Linear Direction", "Scale Direction", "Yaw"], sv.ld);
_smartSet(f2, "Ripple Focus", ["Ripple Focus", "Focus Index", "Focus Target"], sv.rf);
_smartSet(f2, "Orientation", ["Orientation"], sv.ori, function (v) {
return oriRemap(v, 0);
});
var f3 = "Grid Builder Radial Morph";
if (cm === 1) { 
_smartSet(f3, "Spread", ["Spread", "Columns"], sv.co);
}
else {
_smartSet(f3, "Spread", [], tot);
}
_smartSet(f3, "Radius", ["Radius", "Spacing X"], sv.rad);
_smartSet(f3, "Scale by Position", ["Scale by Position"], sv.sbp_cb, function (v) {
return sbpRemap(v, true);
});
_smartSet(f3, "Scale Direction", ["Scale Direction", "Linear Direction", "Yaw"], sv.ld);
_smartSet(f3, "Orientation", ["Orientation"], sv.ori, function (v) {
return oriRemap(v, 1);
});
var f4 = "Grid Builder Path Morph";
_smartSet(f4, "Shape", ["Shape"], sv.p_shp);
_smartSet(f4, "Scale X", ["Scale X", "Spacing X", "Radius"], sv.p_sx);
_smartSet(f4, "Scale Y", ["Scale Y", "Spacing Y", "Radius"], sv.p_sy);
_smartSet(f4, "Polygon Points", ["Polygon Points"], sv.p_pts);
_smartSet(f4, "Trim Start", ["Trim Start"], sv.p_ts);
_smartSet(f4, "Trim End", ["Trim End"], sv.p_te);
_smartSet(f4, "Path Progress", ["Path Progress"], sv.pp);
_smartSet(f4, "Path Spread", ["Path Spread"], sv.ps);
_smartSet(f4, "Scale by Position", ["Scale by Position"], sv.sbp_dd, function (v) {
return sbpRemap(v, false);
});
_smartSet(f4, "Linear Direction", ["Linear Direction", "Scale Direction", "Yaw"], sv.ld);
_smartSet(f4, "Ripple Focus", ["Ripple Focus", "Focus Index", "Focus Target"], sv.rf);
_smartSet(f4, "Orientation", ["Orientation"], sv.ori, function (v) {
return oriRemap(v, 3);
});
var f5 = "Grid Builder Spherical Morph";
_smartSet(f5, "Radius", ["Radius", "Spacing X"], sv.rad);
_smartSet(f5, "Focus Target", ["Focus Target", "Ripple Focus", "Focus Index"], sv.rf);
_smartSet(f5, "Scale by Position", ["Scale by Position"], sv.sbp_cb, function (v) {
return sbpRemap(v, true);
});
_smartSet(f5, "Yaw", ["Yaw", "Linear Direction", "Scale Direction"], sv.ld);
_smartSet(f5, "Pitch", ["Pitch", "Scale Direction Z"], sv.sdz);
_smartSet(f5, "Orientation", ["Orientation"], sv.ori, function (v) {
return oriRemap(v, 2);
});
var tempFx = tempCtrl.property("ADBE Effect Parade");
var effectsToRestore = [];
var tempReg = _getRegistry(tempCtrl);
if (tempFx) { 
for (var fIdx = 1; fIdx <= tempFx.numProperties; fIdx += 1) { 
var p = tempFx.property(fIdx);
var mn = p.matchName ? p.matchName.toLowerCase() : "";
var n = p.name ? p.name : "";
var nLow = n.toLowerCase();
var presetToApply = "";
var isCustomMap = false;
if ((((tempReg) && (tempReg.maps)) && (tempReg.maps[n])) || (n.indexOf("Map ") === 0)) { 
isCustomMap = true;
}
if (isCustomMap) { 
if (mn.indexOf("gbproxslider") > -1) { 
presetToApply = "GridProxSlider_V101.ffx";
}
else if ((mn.indexOf("gbproxpos") > -1) || (mn.indexOf("gbproxarray") > -1)) {
presetToApply = "GridProxPos_V101.ffx";
}
else if (mn.indexOf("gbproxcolor") > -1) {
presetToApply = "GridProxColor_V101.ffx";
}
else {
var isColor = false;
var isArray = false;
try {
if ((p.property("Max Color")) || (p.property("Min Color"))) { 
isColor = true;
}
else {
if (p.property("Max Value")) { 
var vt = p.property("Max Value").propertyValueType;
if (vt === PropertyValueType.COLOR) { 
isColor = true;
}
else {
if ((((vt === PropertyValueType.TwoD_SPATIAL) || (vt === PropertyValueType.ThreeD_SPATIAL)) || (vt === PropertyValueType.TwoD)) || (vt === PropertyValueType.ThreeD)) { 
isArray = true;
}
}
}
}
} catch (e) {
}
if (isColor) { 
presetToApply = "GridProxColor_V101.ffx";
}
else if (isArray) {
presetToApply = "GridProxPos_V101.ffx";
}
else {
presetToApply = "GridProxSlider_V101.ffx";
}
}
}
else {
if (((mn.indexOf("gridbuilderprox") > -1) || (mn.indexOf("gridprox") > -1)) || (nLow.indexOf("proximity") > -1)) { 
presetToApply = "GridProxMain_V101.ffx";
}
}
if (presetToApply !== "") { 
effectsToRestore.push({index: fIdx, name: n, preset: presetToApply});
}}
}
if (effectsToRestore.length > 0) { 
for (var pIdx = 0; pIdx < effectsToRestore.length; pIdx += 1) { 
var pData = effectsToRestore[pIdx];
var oldFx = tempFx.property(pData.index);
var ffxProxFile = new File(extPath + "/src/" + pData.preset);
if (!ffxProxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + pData.preset);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + pData.preset);
if (userFile.exists) { 
ffxProxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxProxFile = sysFile;
}
}
}
if (ffxProxFile.exists) { 
var safeProxFile = new File(ffxProxFile.fsName);
for (var L = 1; L <= comp.numLayers; L += 1) { 
comp.layer(L).selected = false;}
c.selected = true;
c.applyPreset(safeProxFile);
var cFx = c.property("ADBE Effect Parade");
var newFx = null;
if ((cFx) && (cFx.numProperties > 0)) { 
newFx = cFx.property(cFx.numProperties);
}
if (newFx) { 
newFx.name = pData.name;
for (var vIdx = 1; vIdx <= oldFx.numProperties; vIdx += 1) { 
var oldProp = oldFx.property(vIdx);
var newProp = newFx.property(vIdx);
if ((((oldProp) && (newProp)) && (oldProp.propertyType === PropertyType.PROPERTY)) && (oldProp.canSetExpression)) { 
try {
if (oldProp.numKeys > 0) { 
var times = [];
var vals = [];
for (var k = 1; k <= oldProp.numKeys; k += 1) { 
times.push(oldProp.keyTime(k));
vals.push(oldProp.keyValue(k));}
newProp.setValuesAtTimes(times, vals);
for (var k = 1; k <= oldProp.numKeys; k += 1) { 
try {
var inInterp = oldProp.keyInInterpolationType(k);
var outInterp = oldProp.keyOutInterpolationType(k);
newProp.setInterpolationTypeAtKey(k, inInterp, outInterp);
if ((inInterp === KeyframeInterpolationType.BEZIER) || (outInterp === KeyframeInterpolationType.BEZIER)) { 
newProp.setTemporalEaseAtKey(k, oldProp.keyInTemporalEase(k), oldProp.keyOutTemporalEase(k));
}
} catch (err) {
}}
}
else {
newProp.setValue(oldProp.value);
}
if (oldProp.expressionEnabled) { 
newProp.expression = oldProp.expression;
newProp.expressionEnabled = true;
}
} catch (e) {
}
}}
}
}}
}
tempCtrl.remove();
var cn = c.name;
for (var i = 0; i < tot; i += 1) { 
_expr(ch[i], i, cn, 4, tot);}
} catch (err) {alert("Error: " + err.toString());
}
app.endUndoGroup();
}
function getGridProxGroups(gridName) {
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return "[]";
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return "[]";
}
var groups = [];
var fx = ctrlNull.property("ADBE Effect Parade");
for (var i = 1; i <= fx.numProperties; i += 1) { 
var prop = fx.property(i);
if ((prop.matchName) && (prop.matchName.indexOf("GridBuilderProx") > -1)) { 
groups.push({index: i, name: prop.name});
}}
return JSON.stringify(groups);
} catch (e) {return "[]";
}
}
function getGroupNodes(gridName, activeProxName) {
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return "[]";
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return "[]";
}
var nodes = [];
var reg = _getRegistry(ctrlNull);
for (var i = 0; i < reg.effectors.length; i += 1) { 
var el = _getLayerById(comp, reg.effectors[i]);
if ((el) && (_getLinkedFxName(el) === activeProxName)) { 
nodes.push({id: el.id, name: el.name});
}}
return JSON.stringify(nodes);
} catch (e) {return "[]";
}
}
function _createProxNode(comp, ctrlNull, proxName, nodeName) {
try {
var shapeLayer = comp.layers.addShape();
shapeLayer.name = nodeName;
shapeLayer.guideLayer = true;
shapeLayer.threeDLayer = true;
shapeLayer.autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST;
var rootGroup = shapeLayer.property("ADBE Root Vectors Group");
var radiusGroup = rootGroup.addProperty("ADBE Vector Group");
radiusGroup.name = "Radius Boundary";
var radVectors = radiusGroup.property("ADBE Vectors Group");
var radEllipse = radVectors.addProperty("ADBE Vector Shape - Ellipse");
radEllipse.property("ADBE Vector Ellipse Size").expression = "var ctrl = thisComp.layer(\'" + ctrlNull.name + "\');\rvar R = 100; try{ R = ctrl.effect(\'" + proxName + "\')(\'Radius\'); }catch(e){}\r[R * 2, R * 2];";
var radStroke = radVectors.addProperty("ADBE Vector Graphic - Stroke");
radStroke.property("ADBE Vector Stroke Width").setValue(1.5);
radStroke.property("ADBE Vector Stroke Color").expression = "try { thisComp.layer(\'" + ctrlNull.name + "\').effect(\'" + proxName + "\')(\'Guide Color\'); } catch(e) { value; }";
var falloffGroup = rootGroup.addProperty("ADBE Vector Group");
falloffGroup.name = "Falloff Boundary";
var fallVectors = falloffGroup.property("ADBE Vectors Group");
var fallEllipse = fallVectors.addProperty("ADBE Vector Shape - Ellipse");
fallEllipse.property("ADBE Vector Ellipse Size").expression = "var ctrl = thisComp.layer(\'" + ctrlNull.name + "\');\rvar R = 100; try{ R = ctrl.effect(\'" + proxName + "\')(\'Radius\'); }catch(e){}\rvar F = 0; try{ F = ctrl.effect(\'" + proxName + "\')(\'Falloff\'); }catch(e){}\rvar tot = R + F;\r[tot * 2, tot * 2];";
var fallStroke = fallVectors.addProperty("ADBE Vector Graphic - Stroke");
fallStroke.property("ADBE Vector Stroke Width").setValue(1);
fallStroke.property("ADBE Vector Stroke Opacity").setValue(40);
fallStroke.property("ADBE Vector Stroke Color").expression = "try { thisComp.layer(\'" + ctrlNull.name + "\').effect(\'" + proxName + "\')(\'Guide Color\'); } catch(e) { value; }";
try {
fallStroke.property("ADBE Vector Stroke Dashes").addProperty("ADBE Vector Stroke Dash 1").setValue(8);
} catch (dashE) {
}
var tf = shapeLayer.property("ADBE Transform Group");
tf.property("ADBE Anchor Point").setValue([0, 0, 0]);
tf.property("ADBE Opacity").expression = "try { thisComp.layer(\'" + ctrlNull.name + "\').effect(\'" + proxName + "\')(\'Show Guide\') == 1 ? 100 : 0; } catch(e) { 100; }";
var collapsedLayer = shapeLayer.duplicate();
collapsedLayer.name = nodeName;
shapeLayer.remove();
var currentReg = _getRegistry(ctrlNull);
if (!currentReg) { 
currentReg = {};
}
if (!currentReg.effectors) { 
currentReg.effectors = [];
}
currentReg.effectors.push(collapsedLayer.id);
_setRegistry(ctrlNull, currentReg);
} catch (e) {alert("Error creating node: " + e.toString());
}
}
function _buildExpressionString(ctrlName, mapName, effLayers, pType, activeProxName) {
var is1D = pType === PropertyValueType.OneD;
var isColor = pType === PropertyValueType.COLOR;
var expr = [];
expr.push("var ctrl = thisComp.layer(\'" + ctrlName + "\');");
expr.push("var mapFx = null;");
expr.push("try { mapFx = ctrl.effect(\'" + mapName + "\'); } catch(e) {}");
expr.push("if (mapFx != null) {");
expr.push("  var isEnabled = true;");
expr.push("  try { isEnabled = mapFx(\'Enable\').value == 1; } catch(e) {}");
expr.push("  var groupEnabled = true;");
expr.push("  try { groupEnabled = ctrl.effect(\'" + activeProxName + "\')(\'Enable Proximity\').value == 1; } catch(e) {}");
expr.push("  if (isEnabled && groupEnabled) {");
expr.push("    var minV = value; var maxV = value;");
if (isColor) { 
expr.push("    try { minV = mapFx(\'Min Color\').value; } catch(e) { try { minV = mapFx(\'Min Value\').value; } catch(e2) {} }");
expr.push("    try { maxV = mapFx(\'Max Color\').value; } catch(e) { try { maxV = mapFx(\'Max Value\').value; } catch(e2) {} }");
}
else {
expr.push("    try { minV = mapFx(\'Min Value\').value; } catch(e) {}");
expr.push("    try { maxV = mapFx(\'Max Value\').value; } catch(e) {}");
}
expr.push("    var maxInf = 0; var L, FX, d, r, f, inf;");
for (var i = 0; i < effLayers.length; i += 1) { 
var el = effLayers[i];
var fxLinkName = _getLinkedFxName(el, ctrlName);
if (fxLinkName !== "") { 
var safeName = el.name.replace(/(['"\\])/g, "\\$1");
expr.push("    try {");
expr.push("      L = thisComp.layer(\'" + safeName + "\');");
expr.push("      FX = ctrl.effect(\'" + fxLinkName + "\');");
expr.push("      d = length(L.toWorld(L.transform.anchorPoint), thisLayer.toWorld(thisLayer.transform.anchorPoint));");
expr.push("      r = FX(\'Radius\').value; f = FX(\'Falloff\').value; inf = 0;");
expr.push("      if (d <= r) inf = 1;");
expr.push("      else if (d < r + f && f > 0) inf = 1 - ((d - r) / f);");
expr.push("      if (inf > maxInf) maxInf = inf;");
expr.push("    } catch(e) {}");
}}
expr.push("    maxInf = maxInf * maxInf * (3 - 2 * maxInf);");
expr.push("    var mapVal = linear(maxInf, 0, 1, minV, maxV);");
expr.push("    mapVal;");
expr.push("  } else { value; }");
expr.push("} else { value; }");
return expr.join("\r");
}
function _buildProxInjection(ctrlName, comp, propType) {
var ext = [];
var isArr = (propType === "Position") || (propType === "Orientation");
if (isArr) { 
ext.push("var proxOffset = [0,0,0];");
ext.push("function addVec(a, b) { return [a[0]+(b[0]||0), a[1]+(b[1]||0), (a[2]||0)+(b[2]||0)]; }");
if (propType === "Position") { 
ext.push("function subVec(a, b) { return [a[0]-(b[0]||0), a[1]-(b[1]||0), (a[2]||0)-(b[2]||0)]; }");
ext.push("function mulVec(a, s) { return [a[0]*s, a[1]*s, (a[2]||0)*s]; }");
ext.push("function lenVec(a) { return Math.sqrt(a[0]*a[0] + a[1]*a[1] + (a[2] ? a[2]*a[2] : 0)); }");
ext.push("function normVec(a) { var l = lenVec(a); return l>0 ? [a[0]/l, a[1]/l, (a[2]||0)/l] : [0,0,0]; }");
}
else {
if (propType === "Orientation") { 
ext.push("var minLookDist = 999999; var lookAtTarget = [0,0,0]; var lookAtBlend = 0;");
ext.push("function lerpAng(a, b, t) { var diff = (b - a) % 360; if (diff > 180) diff -= 360; else if (diff < -180) diff += 360; return a + diff * t; }");
}
}
}
else {
ext.push("var proxOffset = 100;");
}
var enIdx = 0;
var minIdx = 0;
var maxIdx = 0;
if (propType === "Position") { 
enIdx = 9;
minIdx = 10;
maxIdx = 11;
}
else if (propType === "Orientation") {
enIdx = 14;
minIdx = 15;
maxIdx = 16;
}
else if (propType === "Scale") {
enIdx = 19;
minIdx = 20;
maxIdx = 21;
}
else {
if (propType === "Opacity") { 
enIdx = 24;
minIdx = 25;
maxIdx = 26;
}
}
ext.push("var ctrl = thisComp.layer(\'" + ctrlName + "\');");
var ctrlNull = comp.layer(ctrlName);
var groups = [];
var fx = ctrlNull.property("ADBE Effect Parade");
for (var i = 1; i <= fx.numProperties; i += 1) { 
if ((fx.property(i).matchName) && (fx.property(i).matchName.indexOf("GridBuilderProx") > -1)) { 
groups.push(fx.property(i).name);
}}
for (var g = 0; g < groups.length; g += 1) { 
var gName = groups[g];
var nodes = [];
for (var L = 1; L <= comp.numLayers; L += 1) { 
var el = comp.layer(L);
if ((el) && (el !== ctrlNull)) { 
if (_getLinkedFxName(el, ctrlName) === gName) { 
nodes.push(el);
}
}}
if (nodes.length === 0) { 
continue ;
}
ext.push("try {");
ext.push("  var grpFx = ctrl.effect(\'" + gName + "\');");
ext.push("  if (grpFx(1).value == 1) {");
ext.push("    if (grpFx(" + enIdx + ").value == 1) {");
ext.push("      var minV = grpFx(" + minIdx + ").value; var maxV = grpFx(" + maxIdx + ").value;");
ext.push("      var maxInf = 0; var L, d, r, f, inf;");
if (propType === "Position") { 
ext.push("      var myWorldPos = thisLayer.hasParent ? thisLayer.parent.toWorld(baseGridVal) : baseGridVal;");
}
else {
ext.push("      var myWorldPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);");
}
for (var n = 0; n < nodes.length; n += 1) { 
var safeName = nodes[n].name.replace(/(['"\\])/g, "\\$1");
ext.push("      try { L = thisComp.layer(\'" + safeName + "\'); d = length(L.toWorld(L.transform.anchorPoint), myWorldPos); r = grpFx(5).value; f = grpFx(6).value; inf = 0; if (d <= r) inf = 1; else if (d < r + f && f > 0) inf = 1 - ((d - r) / f); if (inf > maxInf) maxInf = inf; } catch(e) {}");}
ext.push("      maxInf = maxInf * maxInf * (3 - 2 * maxInf);");
if (isArr) { 
ext.push("      proxOffset = addVec(proxOffset, linear(maxInf, 0, 1, minV, maxV));");
}
else {
ext.push("      proxOffset = proxOffset * (linear(maxInf, 0, 1, minV, maxV) / 100);");
}
ext.push("    }");
if (propType === "Position") { 
ext.push("    if (grpFx(29).value == 1) {");
ext.push("      var str = grpFx(30).value;");
ext.push("      var myWorldPos = thisLayer.hasParent ? thisLayer.parent.toWorld(baseGridVal) : baseGridVal;");
for (var n = 0; n < nodes.length; n += 1) { 
var safeName = nodes[n].name.replace(/(['"\\])/g, "\\$1");
ext.push("      try { L = thisComp.layer(\'" + safeName + "\'); var ePos = L.toWorld(L.transform.anchorPoint); d = length(ePos, myWorldPos); r = grpFx(5).value; f = grpFx(6).value; inf = 0; if (d <= r) inf = 1; else if (d < r + f && f > 0) inf = 1 - ((d - r) / f); if (inf > 0) { inf = inf * inf * (3 - 2 * inf); var dir = normVec(subVec(ePos, myWorldPos)); proxOffset = addVec(proxOffset, mulVec(dir, inf * str)); } } catch(e) {}");}
ext.push("    }");
}
if (propType === "Orientation") { 
ext.push("    if (grpFx(33).value == 1) {");
ext.push("      var blnd = grpFx(34).value / 100;");
ext.push("      var myWorldPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);");
for (var n = 0; n < nodes.length; n += 1) { 
var safeName = nodes[n].name.replace(/(['"\\])/g, "\\$1");
ext.push("      try { L = thisComp.layer(\'" + safeName + "\'); var ePos = L.toWorld(L.transform.anchorPoint); var currentDist = length(ePos, myWorldPos); if (currentDist < minLookDist) { minLookDist = currentDist; lookAtTarget = ePos; lookAtBlend = blnd; } } catch(e) {}");}
ext.push("    }");
}
ext.push("  }");
ext.push("} catch(e) {}");}
if (propType === "Orientation") { 
ext.push("if (lookAtBlend > 0 && minLookDist < 999999) {");
ext.push("  var myWorldPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);");
ext.push("  var dVec = [lookAtTarget[0] - myWorldPos[0], lookAtTarget[1] - myWorldPos[1], lookAtTarget[2] - myWorldPos[2]];");
ext.push("  var zA = (Math.atan2(dVec[1], dVec[0]) * 180 / Math.PI) + 90;");
ext.push("  var xyLen = Math.sqrt(dVec[0]*dVec[0] + dVec[1]*dVec[1]);");
ext.push("  var yA = Math.atan2(dVec[2], xyLen) * 180 / Math.PI;");
ext.push("  var lookAngles = [0 + baseGridVal[0], yA + baseGridVal[1], zA + baseGridVal[2]];");
ext.push("  baseGridVal = [ lerpAng(baseGridVal[0], lookAngles[0], lookAtBlend), lerpAng(baseGridVal[1], lookAngles[1], lookAtBlend), lerpAng(baseGridVal[2], lookAngles[2], lookAtBlend) ];");
ext.push("}");
}
if (isArr) { 
ext.push("addVec(baseGridVal, proxOffset);");
}
else if (propType === "Scale") {
ext.push("[baseGridVal[0] * (proxOffset / 100), baseGridVal[1] * (proxOffset / 100), (baseGridVal.length > 2 ? baseGridVal[2] : 0) * (proxOffset / 100)];");
}
else {
if (propType === "Opacity") { 
ext.push("Math.max(0, Math.min(100, baseGridVal * (proxOffset / 100)));");
}
}
return ext.join("\r");
}
function _updateGroupExpressions(comp, ctrlNull, activeProxName) {
try {
var reg = _getRegistry(ctrlNull);
var groupMaps = [];
if (reg.maps) { 
for (var mName in reg.maps) { 
if (reg.maps[mName] === activeProxName) { 
groupMaps.push(mName);
}
}
}
if (groupMaps.length === 0) { 
return;
}
var effLayers = [];
if (reg.effectors) { 
for (var i = 0; i < reg.effectors.length; i += 1) { 
var el = _getLayerById(comp, reg.effectors[i]);
if ((el) && (_getLinkedFxName(el) === activeProxName)) { 
effLayers.push(el);
}}
}
var gridLayers = [];
if (reg.layers) { 
for (var i = 0; i < reg.layers.length; i += 1) { 
var gl = _getLayerById(comp, reg.layers[i]);
if (gl) { 
gridLayers.push(gl);
}}
}
for (var m = 0; m < groupMaps.length; m += 1) { 
function updateExpr(propParent) {
for (var pIdx = 1; pIdx <= propParent.numProperties; pIdx += 1) { 
try {
var p = propParent.property(pIdx);
if (p.propertyType === PropertyType.PROPERTY) { 
if (((p.canSetExpression) && (p.expressionEnabled)) && (p.expression.indexOf(searchStr) !== -1)) { 
p.expression = _buildExpressionString(ctrlNull.name, mapName, effLayers, p.propertyValueType, activeProxName);
}
}
else {
if ((p.propertyType === PropertyType.INDEXED_GROUP) || (p.propertyType === PropertyType.NAMED_GROUP)) { 
updateExpr(p);
}
}
} catch (e) {
}}
}
var mapName = groupMaps[m];
var searchStr = "ctrl.effect(\'" + mapName + "\')";
for (var gL = 0; gL < gridLayers.length; gL += 1) { 
try {
var l = gridLayers[gL];
var grps = ["ADBE Transform Group", "ADBE Effect Parade", "ADBE Root Vectors Group", "ADBE Text Properties"];
for (var g = 0; g < grps.length; g += 1) { 
try {
var rootGrp = l.property(grps[g]);
if (rootGrp) { 
updateExpr(rootGrp);
}
} catch (e2) {
}}
} catch (e1) {
}}}
var cm = _mode(ctrlNull);
try {
if (ctrlNull.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var tot = gridLayers.length;
for (var i = 0; i < tot; i += 1) { 
_expr(gridLayers[i], i, ctrlNull.name, cm, tot);}
} catch (e) {
}
}
function addProximityGroup(gridName, extPath) {
app.beginUndoGroup("Add Proximity Group");
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var fx = ctrlNull.property("ADBE Effect Parade");
var proxCount = 1;
for (var i = 1; i <= fx.numProperties; i += 1) { 
if (fx.property(i).matchName === "Pseudo/GridBuilderProx_101") { 
proxCount++;
}}
var proxName = "Proximity " + proxCount;
var nodeName = gridName + " " + proxName + " Effector 1";
var presetName = "GridProxMain_V101.ffx";
var ffxFile = new File(extPath + "/src/" + presetName);
if (!ffxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
if (userFile.exists) { 
ffxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxFile = sysFile;
}
}
}
if (ffxFile.exists) { 
var safeFile = new File(ffxFile.fsName);
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
ctrlNull.selected = true;
ctrlNull.applyPreset(safeFile);
}
else {
alert("Proximity Master Preset missing: " + presetName);
app.endUndoGroup();
return;
}
var proxFx = fx.property(fx.numProperties);
for (var k = fx.numProperties; k >= 1; k--) { 
if ((fx.property(k).matchName === "Pseudo/GridBuilderProx_101") && (fx.property(k).name !== proxName)) { 
proxFx = fx.property(k);
break ;
}}
proxFx.name = proxName;
_createProxNode(comp, ctrlNull, proxName, nodeName);
for (var l = 1; l <= comp.numLayers; l += 1) { 
comp.layer(l).selected = false;}
ctrlNull.selected = true;
var cm = _mode(ctrlNull);
try {
if (ctrlNull.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var regForUpdate = _getRegistry(ctrlNull);
var gridLyrs = [];
if (regForUpdate.layers) { 
for (var i = 0; i < regForUpdate.layers.length; i += 1) { 
var gl = _getLayerById(comp, regForUpdate.layers[i]);
if (gl) { 
gridLyrs.push(gl);
}}
}
for (var i = 0; i < gridLyrs.length; i += 1) { 
_expr(gridLyrs[i], i, ctrlNull.name, cm, gridLyrs.length);}
} catch (e) {alert("Error adding group: " + e.toString());
}
app.endUndoGroup();
}
function _refreshCustomMapExpressions(comp, ctrlNull, activeProxName) {
try {
var reg = _getRegistry(ctrlNull);
if (((!reg) || (!reg.maps)) || (!reg.effectors)) { 
return;
}
var effLayers = [];
for (var i = 0; i < reg.effectors.length; i += 1) { 
var el = _getLayerById(comp, reg.effectors[i]);
if ((el) && (_getLinkedFxName(el, ctrlNull.name) === activeProxName)) { 
effLayers.push(el);
}}
for (var mapName in reg.maps) { 
if (reg.maps[mapName] === activeProxName) { 
var mapFx = ctrlNull.effect(mapName);
if (!mapFx) { 
continue ;
}
var mn = (mapFx.matchName) || ("");
var baseType = PropertyValueType.OneD;
if ((mn.indexOf("GBProxPos") > -1) || (mn.indexOf("Array") > -1)) { 
baseType = PropertyValueType.TwoD_SPATIAL;
}
else {
if (mn.indexOf("GBProxColor") > -1) { 
baseType = PropertyValueType.COLOR;
}
}
var finalExpr = _buildExpressionString(ctrlNull.name, mapName, effLayers, baseType, activeProxName);
var _updateExprRecursive = function (propGrp, searchStr, newExpr) {
for (var p = 1; p <= propGrp.numProperties; p += 1) { 
var prop = propGrp.property(p);
if (((prop.propertyType === PropertyType.PROPERTY) && (prop.canSetExpression)) && (prop.expressionEnabled)) { 
var exprStr = prop.expression;
if (exprStr.indexOf(searchStr) !== -1) { 
prop.expression = newExpr;
}
}
else {
if ((prop.propertyType === PropertyType.NAMED_GROUP) || (prop.propertyType === PropertyType.INDEXED_GROUP)) { 
_updateExprRecursive(prop, searchStr, newExpr);
}
}}
};
var searchStr = "ctrl.effect(\'" + mapName + "\')";
for (var j = 0; j < reg.layers.length; j += 1) { 
var L = _getLayerById(comp, reg.layers[j]);
if (L) { 
try {
if (L.property("ADBE Effect Parade")) { 
_updateExprRecursive(L.property("ADBE Effect Parade"), searchStr, finalExpr);
}
if (L.property("ADBE Root Vectors Group")) { 
_updateExprRecursive(L.property("ADBE Root Vectors Group"), searchStr, finalExpr);
}
if (L.property("ADBE Extrsn Options Group")) { 
_updateExprRecursive(L.property("ADBE Extrsn Options Group"), searchStr, finalExpr);
}
if (L.property("ADBE Material Options Group")) { 
_updateExprRecursive(L.property("ADBE Material Options Group"), searchStr, finalExpr);
}
} catch (e) {
}
}}
}
}
} catch (e) {
}
}
function addProximityNode(gridName, activeProxName) {
app.beginUndoGroup("Add Proximity Node");
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var currentReg = _getRegistry(ctrlNull);
var maxNodeNum = 0;
for (var i = 0; i < currentReg.effectors.length; i += 1) { 
var el = _getLayerById(comp, currentReg.effectors[i]);
if ((el) && (_getLinkedFxName(el, gridName) === activeProxName)) { 
var match = el.name.match(/Effector\s+(\d+)$/);
if (match) { 
var num = parseInt(match[1], 10);
if (num > maxNodeNum) { 
maxNodeNum = num;
}
}
}}
var nextNum = maxNodeNum + 1;
var nodeName = gridName + " " + activeProxName + " Effector " + nextNum;
_createProxNode(comp, ctrlNull, activeProxName, nodeName);
for (var l = 1; l <= comp.numLayers; l += 1) { 
comp.layer(l).selected = false;}
ctrlNull.selected = true;
var cm = _mode(ctrlNull);
try {
if (ctrlNull.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var regForUpdate = _getRegistry(ctrlNull);
var gridLyrs = [];
if ((regForUpdate) && (regForUpdate.layers)) { 
for (var i = 0; i < regForUpdate.layers.length; i += 1) { 
var gl = _getLayerById(comp, regForUpdate.layers[i]);
if (gl) { 
gridLyrs.push(gl);
}}
}
for (var i = 0; i < gridLyrs.length; i += 1) { 
_expr(gridLyrs[i], i, ctrlNull.name, cm, gridLyrs.length);}
_refreshCustomMapExpressions(comp, ctrlNull, activeProxName);
} catch (e) {alert("Error adding node: " + e.toString());
}
app.endUndoGroup();
}
function removeProximityNode(gridName, nodeId, nodeName) {
var proceed = confirm("Remove " + nodeName + " ?", true, "Grid Builder");
if (!proceed) { 
return;
}
app.beginUndoGroup("Remove Proximity Node");
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var el = _getLayerById(comp, nodeId);
var activeProxName = "";
if (el) { 
activeProxName = _getLinkedFxName(el);
el.remove();
}
var currentReg = _getRegistry(ctrlNull);
var newEffectors = [];
if (currentReg.effectors) { 
for (var i = 0; i < currentReg.effectors.length; i += 1) { 
if (currentReg.effectors[i] !== nodeId) { 
newEffectors.push(currentReg.effectors[i]);
}}
}
currentReg.effectors = newEffectors;
_setRegistry(ctrlNull, currentReg);
if (activeProxName !== "") { 
_updateGroupExpressions(comp, ctrlNull, activeProxName);
}
} catch (e) {alert("Error removing node: " + e.toString());
}
app.endUndoGroup();
}
function removeProximityGroup(gridName, activeProxName) {
var proceed = confirm("Remove " + activeProxName + " ?", true, "Grid Builder");
if (!proceed) { 
return;
}
app.beginUndoGroup("Remove Proximity Group");
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var fx = ctrlNull.property("ADBE Effect Parade");
var currentReg = _getRegistry(ctrlNull);
if (!currentReg.effectors) { 
currentReg.effectors = [];
}
if (!currentReg.maps) { 
currentReg.maps = {};
}
var newEffectors = [];
for (var i = 0; i < currentReg.effectors.length; i += 1) { 
var el = _getLayerById(comp, currentReg.effectors[i]);
if (el) { 
if (_getLinkedFxName(el) === activeProxName) { 
el.remove();
}
else {
newEffectors.push(currentReg.effectors[i]);
}
}}
currentReg.effectors = newEffectors;
var mapsToDelete = [];
for (var mName in currentReg.maps) { 
if ((currentReg.maps.hasOwnProperty(mName)) && (currentReg.maps[mName] === activeProxName)) { 
mapsToDelete.push(mName);
}
}
if (mapsToDelete.length > 0) { 
var ch = _kids(comp, ctrlNull);
if ((ch) && (ch.length > 0)) { 
function clearExpr(propParent, searchString) {
for (var pIdx = 1; pIdx <= propParent.numProperties; pIdx += 1) { 
try {
var p = propParent.property(pIdx);
if (p.propertyType === PropertyType.PROPERTY) { 
if ((p.canSetExpression) && (p.expressionEnabled)) { 
if (p.expression.indexOf(searchString) !== -1) { 
p.expression = "";
}
}
}
else {
if ((p.propertyType === PropertyType.INDEXED_GROUP) || (p.propertyType === PropertyType.NAMED_GROUP)) { 
clearExpr(p, searchString);
}
}
} catch (innerE) {
}}
}
for (var m = 0; m < mapsToDelete.length; m += 1) { 
var sStr = "ctrl.effect(\'" + mapsToDelete[m] + "\')";
for (var i = 0; i < ch.length; i += 1) { 
try {
var l = ch[i];
var grps = ["ADBE Transform Group", "ADBE Effect Parade", "ADBE Root Vectors Group", "ADBE Text Properties"];
for (var g = 0; g < grps.length; g += 1) { 
try {
var rootGrp = l.property(grps[g]);
if (rootGrp) { 
clearExpr(rootGrp, sStr);
}
} catch (e2) {
}}
} catch (e1) {
}}}
}
}
for (var m = 0; m < mapsToDelete.length; m += 1) { 
var mapFxName = mapsToDelete[m];
for (var f = fx.numProperties; f >= 1; f--) { 
var tempFx = fx.property(f);
if ((tempFx) && (tempFx.name === mapFxName)) { 
tempFx.remove();
break ;
}}
delete currentReg.maps[mapFxName];}
var finalProxFx = ctrlNull.property("ADBE Effect Parade").property(activeProxName);
if (finalProxFx != null) { 
finalProxFx.remove();
}
var cm = _mode(ctrlNull);
try {
if (ctrlNull.effect("Grid Builder Morph")) { 
cm = 4;
}
} catch (e) {
}
var gridLyrs = [];
if (currentReg.layers) { 
for (var i = 0; i < currentReg.layers.length; i += 1) { 
var gl = _getLayerById(comp, currentReg.layers[i]);
if (gl) { 
gridLyrs.push(gl);
}}
}
for (var i = 0; i < gridLyrs.length; i += 1) { 
_expr(gridLyrs[i], i, ctrlNull.name, cm, gridLyrs.length);}
_setRegistry(ctrlNull, currentReg);
} catch (e) {alert("Error removing group: " + e.toString());
}
app.endUndoGroup();
}
function linkCustomProperties(gridName, extPath, activeProxName) {
app.beginUndoGroup("Link Custom Properties");
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var reg = _getRegistry(ctrlNull);
if (((!reg) || (!reg.layers)) || (reg.layers.length === 0)) { 
alert("No layers found in this grid.");
app.endUndoGroup();
return;
}
var targetLayers = [];
var selLayers = comp.selectedLayers;
var validSelLayers = [];
for (var s = 0; s < selLayers.length; s += 1) { 
if (selLayers[s] !== ctrlNull) { 
validSelLayers.push(selLayers[s]);
}}
if (validSelLayers.length > 0) { 
for (var s = 0; s < validSelLayers.length; s += 1) { 
for (var r = 0; r < reg.layers.length; r += 1) { 
if (validSelLayers[s].id === reg.layers[r]) { 
targetLayers.push(validSelLayers[s]);
break ;
}}}
if (targetLayers.length === 0) { 
alert("None of the selected layers belong to the active grid.");
app.endUndoGroup();
return;
}
}
else {
for (var r = 0; r < reg.layers.length; r += 1) { 
var el = _getLayerById(comp, reg.layers[r]);
if (el) { 
targetLayers.push(el);
}}
}
if (targetLayers.length === 0) { 
return;
}
var _flattenProperties = function (rootGrp) {
var props = [];
var _scan = function (grp, pathNames, matchNames) {
for (var p = 1; p <= grp.numProperties; p += 1) { 
var prop = grp.property(p);
if ((prop.propertyType === PropertyType.PROPERTY) && (prop.canSetExpression)) { 
var vt = prop.propertyValueType;
if ((((((vt === PropertyValueType.OneD) || (vt === PropertyValueType.TwoD_SPATIAL)) || (vt === PropertyValueType.TwoD)) || (vt === PropertyValueType.ThreeD_SPATIAL)) || (vt === PropertyValueType.ThreeD)) || (vt === PropertyValueType.COLOR)) { 
var dName = pathNames.length > 0 ? pathNames.join(" | ") + " | " + prop.name : prop.name;
props.push({displayName: dName, matchNamePath: matchNames.concat(prop.matchName), type: vt});
}
}
else {
if ((prop.propertyType === PropertyType.NAMED_GROUP) || (prop.propertyType === PropertyType.INDEXED_GROUP)) { 
if ((prop.matchName === "ADBE Vector Transform Group") || (prop.matchName === "ADBE Transform Group")) { 
continue ;
}
var newNames = pathNames.slice(0);
if (prop.name !== "Contents") { 
newNames.push(prop.name);
}
var newMatches = matchNames.concat(prop.matchName);
_scan(prop, newNames, newMatches);
}
}}
};
_scan(rootGrp, [], []);
return props;
};
var baseLayer = targetLayers[0];
var masterGroups = [];
if (baseLayer.property("ADBE Material Options Group")) { 
masterGroups.push({props: _flattenProperties(baseLayer.property("ADBE Material Options Group")), rootMatchName: "ADBE Material Options Group", rootName: "Material Options", type: "native"});
}
if (baseLayer.property("ADBE Extrsn Options Group")) { 
masterGroups.push({props: _flattenProperties(baseLayer.property("ADBE Extrsn Options Group")), rootMatchName: "ADBE Extrsn Options Group", rootName: "Geometry Options", type: "native"});
}
var fxGrp = baseLayer.property("ADBE Effect Parade");
if ((fxGrp) && (fxGrp.numProperties > 0)) { 
for (var f = 1; f <= fxGrp.numProperties; f += 1) { 
var fx = fxGrp.property(f);
masterGroups.push({props: _flattenProperties(fx), rootMatchName: fx.matchName, rootName: fx.name, type: "effect"});}
}
var shapeGrp = baseLayer.property("ADBE Root Vectors Group");
if (shapeGrp) { 
masterGroups.push({props: _flattenProperties(shapeGrp), rootMatchName: "ADBE Root Vectors Group", rootName: "Shapes", type: "shape"});
}
for (var g = masterGroups.length - 1; g >= 0; g--) { 
var grp = masterGroups[g];
var rootExistsOnAll = true;
for (var t = 1; t < targetLayers.length; t += 1) { 
var tLyr = targetLayers[t];
var tRoot = null;
if ((grp.type === "native") || (grp.type === "shape")) { 
tRoot = tLyr.property(grp.rootMatchName);
}
else {
if ((grp.type === "effect") && (tLyr.property("ADBE Effect Parade"))) { 
tRoot = tLyr.property("ADBE Effect Parade").property(grp.rootMatchName);
}
}
if (!tRoot) { 
rootExistsOnAll = false;
break ;
}
for (var p = grp.props.length - 1; p >= 0; p--) { 
var propData = grp.props[p];
var currentProp = tRoot;
var propExists = true;
for (var m = 0; m < propData.matchNamePath.length; m += 1) { 
currentProp = currentProp.property(propData.matchNamePath[m]);
if (!currentProp) { 
propExists = false;
break ;
}}
if (!propExists) { 
grp.props.splice(p, 1);
}}}
if ((!rootExistsOnAll) || (grp.props.length === 0)) { 
masterGroups.splice(g, 1);
}}
if (masterGroups.length === 0) { 
alert("No common Effects, Shapes, or 3D Options found across the targeted layers.");
app.endUndoGroup();
return;
}
var win = new Window("dialog", "Custom Proximity Map");
win.orientation = "column";
win.alignChildren = ["fill", "top"];
win.spacing = 15;
win.margins = 20;
var pnlMain = win.add("group");
pnlMain.orientation = "row";
pnlMain.alignChildren = ["left", "fill"];
pnlMain.spacing = 15;
var grpCol1 = pnlMain.add("group");
grpCol1.orientation = "column";
grpCol1.alignChildren = ["left", "top"];
grpCol1.add("statictext", undefined, "Effects & Options:");
var listLeft = grpCol1.add("listbox", [0, 0, 200, 350], []);
var grpCol2 = pnlMain.add("group");
grpCol2.orientation = "column";
grpCol2.alignChildren = ["left", "top"];
grpCol2.add("statictext", undefined, "Animatable Properties:");
var listRight = grpCol2.add("listbox", [0, 0, 350, 350], []);
var grpBtns = win.add("group");
grpBtns.orientation = "row";
grpBtns.alignChildren = ["right", "center"];
var btnCancel = grpBtns.add("button", undefined, "Cancel");
var btnApply = grpBtns.add("button", undefined, "Apply");
btnApply.enabled = false;
for (var i = 0; i < masterGroups.length; i += 1) { 
listLeft.add("item", masterGroups[i].rootName);}
listLeft.onChange = function () {
listRight.removeAll();
btnApply.enabled = false;
if (listLeft.selection === null) { 
return;
}
var selGrp = masterGroups[listLeft.selection.index];
for (var i = 0; i < selGrp.props.length; i += 1) { 
listRight.add("item", selGrp.props[i].displayName);}
};
listRight.onChange = function () {
btnApply.enabled = listRight.selection !== null;
};
btnCancel.onClick = function () {
win.close(0);
};
btnApply.onClick = function () {
win.close(1);
};
if (win.show() !== 1) { 
app.endUndoGroup();
return;
}
var selGrp = masterGroups[listLeft.selection.index];
var selProp = selGrp.props[listRight.selection.index];
var baseType = selProp.type;
var is1D = baseType === PropertyValueType.OneD;
var isArray = (((baseType === PropertyValueType.TwoD_SPATIAL) || (baseType === PropertyValueType.TwoD)) || (baseType === PropertyValueType.ThreeD_SPATIAL)) || (baseType === PropertyValueType.ThreeD);
var isColor = baseType === PropertyValueType.COLOR;
var baseRoot = null;
if ((selGrp.type === "native") || (selGrp.type === "shape")) { 
baseRoot = baseLayer.property(selGrp.rootMatchName);
}
else {
baseRoot = baseLayer.property("ADBE Effect Parade").property(selGrp.rootMatchName);
}
var targetPropForValue = baseRoot;
for (var m = 0; m < selProp.matchNamePath.length; m += 1) { 
targetPropForValue = targetPropForValue.property(selProp.matchNamePath[m]);}
var rawVal = targetPropForValue.value;
var presetName = "";
if (is1D) { 
presetName = "GridProxSlider_V101.ffx";
}
else if (isArray) {
presetName = "GridProxPos_V101.ffx";
}
else {
if (isColor) { 
presetName = "GridProxColor_V101.ffx";
}
}
var ffxFile = new File(extPath + "/src/" + presetName);
if (!ffxFile.exists) { 
var pathParts = extPath.split("/");
var folderName = pathParts[pathParts.length - 1];
if (folderName === "") { 
folderName = pathParts[pathParts.length - 2];
}
var userFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
var sysFile = new File(Folder.commonFiles.fsName + "/Adobe/CEP/extensions/" + folderName + "/src/" + presetName);
if (userFile.exists) { 
ffxFile = userFile;
}
else {
if (sysFile.exists) { 
ffxFile = sysFile;
}
}
}
if (ffxFile.exists) { 
var safeFile = new File(ffxFile.fsName);
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
ctrlNull.selected = true;
ctrlNull.applyPreset(safeFile);
}
else {
alert("Custom Map Preset missing: " + presetName);
app.endUndoGroup();
return;
}
var fx = ctrlNull.property("ADBE Effect Parade");
var mapCount = 1;
for (var i = 1; i <= fx.numProperties; i += 1) { 
var mn = fx.property(i).matchName;
var fn = fx.property(i).name;
if ((((fn.indexOf("Map ") === 0) || (mn === "Pseudo/GBProxSlider_101")) || (mn === "Pseudo/GBProxPos_101")) || (mn === "Pseudo/GBProxColor_101")) { 
mapCount++;
}}
var propNamesArr = selProp.displayName.split(" | ");
var shortProp = propNamesArr[propNamesArr.length - 1];
if (shortProp.length > 15) { 
shortProp = shortProp.substring(0, 15).replace(/\s+$/, "") + "...";
}
var shortGrp = selGrp.rootName;
if (shortGrp.length > 15) { 
shortGrp = shortGrp.substring(0, 15).replace(/\s+$/, "") + "...";
}
var safeMapName = "Map " + mapCount + " (" + shortGrp + " | " + shortProp + ")";
var mapFx = fx.property(fx.numProperties);
mapFx.name = safeMapName;
try {
mapFx.property("Enable").setValue(1);
} catch (e) {
}
try {
if (is1D) { 
if (mapFx.property("Min Value")) { 
mapFx.property("Min Value").setValue(0);
}
if (mapFx.property("Max Value")) { 
mapFx.property("Max Value").setValue(rawVal);
}
}
else if (isArray) {
if (mapFx.property("Max Value")) { 
mapFx.property("Max Value").setValue(rawVal);
}
if (mapFx.property("Min Value")) { 
var zeroArr = [];
for (var z = 0; z < rawVal.length; z += 1) { 
zeroArr.push(0);}
mapFx.property("Min Value").setValue(zeroArr);
}
}
else {
if (isColor) { 
var minProp = (mapFx.property("Min Color")) || (mapFx.property("Min Value"));
var maxProp = (mapFx.property("Max Color")) || (mapFx.property("Max Value"));
if (minProp) { 
minProp.setValue(rawVal);
}
if (maxProp) { 
maxProp.setValue(rawVal);
}
}
}
} catch (e) {
}
reg.maps[mapFx.name] = activeProxName;
_setRegistry(ctrlNull, reg);
var regForNodes = _getRegistry(ctrlNull);
if (!regForNodes.effectors) { 
regForNodes.effectors = [];
}
var effLayers = [];
for (var i = 0; i < regForNodes.effectors.length; i += 1) { 
var el = _getLayerById(comp, regForNodes.effectors[i]);
if ((el) && (_getLinkedFxName(el, gridName) === activeProxName)) { 
effLayers.push(el);
}}
if (effLayers.length === 0) { 
alert("No active nodes found for " + activeProxName + ". Please add a node first.");
mapFx.remove();
app.endUndoGroup();
return;
}
var finalExpr = _buildExpressionString(ctrlNull.name, mapFx.name, effLayers, baseType, activeProxName);
var appliedCount = 0;
for (var t = 0; t < targetLayers.length; t += 1) { 
var tRoot = null;
if ((selGrp.type === "native") || (selGrp.type === "shape")) { 
tRoot = targetLayers[t].property(selGrp.rootMatchName);
}
else {
tRoot = targetLayers[t].property("ADBE Effect Parade").property(selGrp.rootMatchName);
}
var tProp = tRoot;
for (var m = 0; m < selProp.matchNamePath.length; m += 1) { 
tProp = tProp.property(selProp.matchNamePath[m]);}
if ((tProp) && (tProp.canSetExpression)) { 
tProp.expression = finalExpr;
appliedCount++;
}}
for (var j = 1; j <= comp.numLayers; j += 1) { 
comp.layer(j).selected = false;}
ctrlNull.selected = true;
return appliedCount.toString();
} catch (e) {alert("Error linking properties: " + e.toString());
}
app.endUndoGroup();
}
function getGridCustomMaps(gridName, activeProxName) {
try {
var comp = app.project.activeItem;
if ((!comp) || (!(comp instanceof CompItem))) { 
return "[]";
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return "[]";
}
var reg = _getRegistry(ctrlNull);
var maps = [];
var fx = ctrlNull.property("ADBE Effect Parade");
for (var i = 1; i <= fx.numProperties; i += 1) { 
var mn = fx.property(i).matchName;
var fn = fx.property(i).name;
if ((((fn.indexOf("Map ") === 0) || (mn === "Pseudo/GBProxSlider_101")) || (mn === "Pseudo/GBProxPos_101")) || (mn === "Pseudo/GBProxColor_101")) { 
if ((reg.maps) && (reg.maps[fn] === activeProxName)) { 
maps.push(fn);
}
}}
return JSON.stringify(maps);
} catch (e) {return "[]";
}
}
function removeCustomMap(gridName, mapName) {
var proceed = confirm("Remove " + mapName + " ?", true, "Grid Builder");
if (!proceed) { 
return;
}
app.beginUndoGroup("Remove Custom Map");
try {
function clearExpr(propParent) {
for (var i = 1; i <= propParent.numProperties; i += 1) { 
try {
var p = propParent.property(i);
if (p.propertyType === PropertyType.PROPERTY) { 
if ((p.canSetExpression) && (p.expressionEnabled)) { 
if (p.expression.indexOf(searchStr) !== -1) { 
p.expression = "";
}
}
}
else {
if ((p.propertyType === PropertyType.INDEXED_GROUP) || (p.propertyType === PropertyType.NAMED_GROUP)) { 
clearExpr(p);
}
}
} catch (innerE) {
}}
}
var comp = app.project.activeItem;
if (!comp) { 
return;
}
var ctrlNull = comp.layer(gridName);
if (!ctrlNull) { 
return;
}
var ch = _kids(comp, ctrlNull);
var searchStr = "ctrl.effect(\'" + mapName + "\')";
if ((ch) && (ch.length > 0)) { 
for (var i = 0; i < ch.length; i += 1) { 
try {
var l = ch[i];
var grps = ["ADBE Transform Group", "ADBE Effect Parade", "ADBE Root Vectors Group", "ADBE Text Properties"];
for (var g = 0; g < grps.length; g += 1) { 
try {
var rootGrp = l.property(grps[g]);
if (rootGrp) { 
clearExpr(rootGrp);
}
} catch (e2) {
}}
} catch (e1) {
}}
}
var fxParade = ctrlNull.property("ADBE Effect Parade");
var mapFx = null;
for (var f = 1; f <= fxParade.numProperties; f += 1) { 
if (fxParade.property(f).name === mapName) { 
mapFx = fxParade.property(f);
break ;
}}
if (mapFx) { 
mapFx.remove();
}
var reg = _getRegistry(ctrlNull);
if ((reg.maps) && (reg.maps[mapName])) { 
delete reg.maps[mapName];
_setRegistry(ctrlNull, reg);
}
} catch (e) {alert("Error removing Custom Map: " + e.toString());
}
app.endUndoGroup();
}
var CTRL = "GRID.CTRL";
var trialLimit = 5;